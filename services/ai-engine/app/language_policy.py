"""Deterministic language hints for response generation.

The model must not infer the output language from retrieved context, tool names,
or bilingual system text. The latest user message is the source of truth.
"""

from __future__ import annotations

from collections import Counter
import re
import unicodedata


_CODE_OR_URL = re.compile(
    r"```[\s\S]*?```|`[^`\n]*`|(?:https?://|www\.)[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}",
    re.IGNORECASE,
)
_ARABIC_TO_ENGLISH = re.compile(
    r"(?:جاوب(?:ني)?|أجب(?:ني)?|اجب(?:ني)?|رد(?: علي)?|اكتب|ترجم|حوّل|حول)"
    r"[^.!?؟\n]{0,48}?(?:بالإنجليزية|بالانجليزية|بالإنجليزي(?:ة)?|إلى الإنجليزية|الى الانجليزية|للإنجليزية)",
    re.IGNORECASE,
)
_ARABIC_TO_ARABIC = re.compile(
    r"(?:جاوب(?:ني)?|أجب(?:ني)?|اجب(?:ني)?|رد(?: علي)?|اكتب|ترجم|حوّل|حول)"
    r"[^.!?؟\n]{0,48}?(?:بالعربية|بالعربي|باللغة العربية|إلى العربية|الى العربية|للعربية)",
    re.IGNORECASE,
)
_ENGLISH_OUTPUT = re.compile(
    r"\b(?:answer|respond|reply|write|translate)\b[^.!?\n]{0,48}?\b(?:in|into|to)\s+(english|arabic)\b",
    re.IGNORECASE,
)
_ARABIC_QUESTION_PREFIX = re.compile(
    r"^\s*(?:ما|ماذا|من|أين|اين|وين|متى|كيف|لماذا|ليش|ليه|هل|كم|أي|اي|أيهما|ايهما|"
    r"ايش|وش|مين|ممكن|"
    r"أشرح|اشرح|أريد|اريد|أحتاج|احتاج)(?=\s|$|[؟?])",
    re.IGNORECASE,
)
_ENGLISH_QUESTION_PREFIX = re.compile(
    r"^\s*(?:what|who|where|when|why|how|which|whom|whose|"
    r"can|could|would|should|will)\b",
    re.IGNORECASE,
)


def _question_language(text: str) -> str | None:
    """Prefer the language of a user's question over pasted answer text."""
    for paragraph in re.split(r"(?:\r?\n\s*){2,}", text):
        candidate = paragraph.strip().lstrip(">\"'“”‘’ ")
        if _ARABIC_QUESTION_PREFIX.match(candidate):
            return "ar"
        if _ENGLISH_QUESTION_PREFIX.match(candidate):
            return "en"
    return None


def _explicit_output_language(text: str) -> str | None:
    matches: list[tuple[int, str]] = []
    for pattern, language in (
        (_ARABIC_TO_ENGLISH, "en"),
        (_ARABIC_TO_ARABIC, "ar"),
    ):
        matches.extend((match.start(), language) for match in pattern.finditer(text))
    for match in _ENGLISH_OUTPUT.finditer(text):
        matches.append((match.start(), "en" if match.group(1).casefold() == "english" else "ar"))

    for start, language in sorted(matches, reverse=True):
        prefix = text[max(0, start - 16):start]
        if re.search(r"(?:\b(?:do\s+not|don't|never)|\b(?:لا|لن|لم))\s*$", prefix, re.IGNORECASE):
            continue
        return language
    return None


def detect_language(text: str, fallback: str = "ar") -> str:
    cleaned = _CODE_OR_URL.sub(" ", text or "")
    explicit = _explicit_output_language(cleaned)
    if explicit:
        return explicit

    question_language = _question_language(cleaned)
    if question_language:
        return question_language

    counts = Counter()
    for char in cleaned:
        if not char.isalpha():
            continue
        code = ord(char)
        name = unicodedata.name(char, "")
        if (
            0x0600 <= code <= 0x08FF
            or 0xFB50 <= code <= 0xFDFF
            or 0xFE70 <= code <= 0xFEFF
        ):
            counts["ar"] += 1
        elif 0x3400 <= code <= 0x9FFF:
            counts["zh"] += 1
        elif name.startswith("LATIN"):
            counts["en"] += 1
        elif 0x0400 <= code <= 0x052F:
            counts["ru"] += 1
        elif 0x3040 <= code <= 0x30FF:
            counts["ja"] += 1
        elif 0xAC00 <= code <= 0xD7AF:
            counts["ko"] += 1
    if not counts:
        return fallback
    if counts["ar"] and counts["en"]:
        total_arabic_latin = counts["ar"] + counts["en"]
        if counts["ar"] / total_arabic_latin >= 0.30:
            return "ar"
    return counts.most_common(1)[0][0]


def response_language_instruction(text: str, fallback: str = "ar") -> tuple[str, str]:
    language = detect_language(text, fallback=fallback)
    instructions = {
        "ar": (
            "العربية",
            "اكتب جوابًا عربيًا واضحًا وسليمًا، بالفصحى المبسطة أو بلهجة المستخدم إذا كانت واضحة. "
            "أجب عن المطلوب مباشرة، وأبقِ أسماء المنتجات والمصطلحات التقنية والروابط والكود بلغتها الأصلية "
            "عند الحاجة. لا تخلط الإنجليزية بالعربية بلا داعٍ، ولا تقلّد لغة نص مقتبس أو رد سابق. "
            "اكتب الشرح بالعربية، وأبقِ الأسماء والمصطلحات الضرورية فقط بلغتها الأصلية. "
            "إذا لم تتأكد من معلومة، صرّح بذلك ولا تختلق تفاصيل.",
        ),
        "en": (
            "English",
            "Write a clear, correct answer in English and address the request directly. "
            "Keep product names, technical terms, links, and code in their original form when useful. "
            "Do not copy the language of quoted text or previous assistant turns. "
            "If uncertain, say so rather than inventing details.",
        ),
        "zh": (
            "中文",
            "请使用中文完整回答。除非用户明确要求，不要切换到阿拉伯语或英语。",
        ),
        "ru": ("русский", "Отвечай полностью на русском языке, если пользователь не попросил другой язык."),
        "ja": ("日本語", "ユーザーが別の言語を明示的に求めない限り、日本語で回答してください。"),
        "ko": ("한국어", "사용자가 명시적으로 요청하지 않는 한 한국어로만 답변하세요."),
    }
    return instructions.get(language, instructions["ar"])
"""Deterministic language hints for response generation.

The model must not infer the output language from retrieved context, tool names,
or bilingual system text. The latest user message is the source of truth.
"""

from __future__ import annotations

from collections import Counter


def detect_language(text: str, fallback: str = "ar") -> str:
    counts = Counter()
    for char in text or "":
        code = ord(char)
        if 0x0600 <= code <= 0x06FF:
            counts["ar"] += 1
        elif 0x4E00 <= code <= 0x9FFF:
            counts["zh"] += 1
        elif ("A" <= char <= "Z") or ("a" <= char <= "z"):
            counts["en"] += 1
        elif 0x0400 <= code <= 0x04FF:
            counts["ru"] += 1
        elif 0x3040 <= code <= 0x30FF:
            counts["ja"] += 1
        elif 0xAC00 <= code <= 0xD7AF:
            counts["ko"] += 1
    if not counts:
        return fallback
    return counts.most_common(1)[0][0]


def response_language_instruction(text: str) -> tuple[str, str]:
    language = detect_language(text)
    instructions = {
        "ar": (
            "العربية",
            "اكتب الرد كاملًا بالعربية. لا تستخدم الصينية أو الإنجليزية أو أي لغة أخرى "
            "إلا داخل رابط أو اسم تقني أو كود طلبه المستخدم صراحة.",
        ),
        "en": (
            "English",
            "Write the entire answer in English. Do not switch to Arabic, Chinese, or "
            "another language unless the user explicitly asks for it.",
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
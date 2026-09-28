"""Deterministic routing for a narrow set of urgent, first-person DVT requests."""

from __future__ import annotations

import re
import unicodedata

from app.language_policy import detect_language


def _normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", (text or "").casefold())
    normalized = "".join(
        char
        for char in normalized
        if not unicodedata.combining(char) and char != "\u0640"
    )
    return (
        normalized.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ى", "ي")
        .replace("ة", "ه")
    )


_PERSONAL_CONTEXT = (
    "عندي",
    "لدي",
    "اكتشفت",
    "شخصني",
    "تم تشخيصي",
    "قال لي الطبيب",
    "i have",
    "my ",
    "diagnosed with",
    "doctor told me",
)
_DVT_TERMS = (
    "جلطه عميقه",
    "جلطه وريديه",
    "خثار وريدي عميق",
    "deep vein thrombosis",
    "deep venous thrombosis",
    "blood clot",
)
_ACTION_TERMS = (
    "ماذا افعل",
    "وش اسوي",
    "ايش اسوي",
    "ماذا يجب",
    "what should i do",
    "what do i do",
    "what can i do",
)
_URGENT_SYMPTOMS = (
    "تعبان جدا",
    "تعبانه جدا",
    "الم شديد",
    "وجع شديد",
    "ضيق نفس",
    "صعوبه في التنفس",
    "الم صدر",
    "سعال مع دم",
    "اغمي",
    "shortness of breath",
    "difficulty breathing",
    "chest pain",
    "coughing blood",
    "fainting",
    "severe pain",
    "very unwell",
)
_PULMONARY_RED_FLAGS = (
    "ضيق نفس",
    "صعوبه في التنفس",
    "الم صدر",
    "سعال مع دم",
    "اغمي",
    "shortness of breath",
    "difficulty breathing",
    "chest pain",
    "coughing blood",
    "fainting",
)
_BODY_PAIN_TERMS = (
    "بطن",
    "معدت",
    "كلي",
    "خاصر",
    "جانب",
    "abdominal",
    "stomach",
    "kidney",
    "flank",
)


def _has_severe_pain(text: str) -> bool:
    return any(
        term in text
        for term in ("تعبان جدا", "تعبانه جدا", "الم شديد", "وجع شديد", "severe pain", "very unwell")
    ) or bool(re.search(r"\bsevere\b[\w\s-]{0,35}\b(?:pain|ache)\b", text))


def urgent_dvt_response(query: str) -> str | None:
    """Return a localized urgent-care response for a personal DVT action request.

    This intentionally handles only a narrow, high-risk case so general medical
    questions remain with the regular chat pipeline.
    """
    text = _normalize(query)
    mentions_dvt = bool(re.search(r"\bdvt\b", text)) or any(
        term in text for term in _DVT_TERMS
    ) or (
        "جلطه" in text and any(term in text for term in ("ساق", "رجل", "ركبه", "وريد"))
    )
    has_personal_context = any(term in text for term in _PERSONAL_CONTEXT)
    has_action_request = any(term in text for term in _ACTION_TERMS)
    has_severe_pain = _has_severe_pain(text)
    has_urgent_symptoms = any(term in text for term in _URGENT_SYMPTOMS) or has_severe_pain

    if not (
        mentions_dvt
        and has_personal_context
        and (has_action_request or has_urgent_symptoms)
    ):
        return None

    has_pulmonary_red_flag = any(term in text for term in _PULMONARY_RED_FLAGS)
    has_body_pain = any(term in text for term in _BODY_PAIN_TERMS)
    arabic = detect_language(query) == "ar"

    if has_pulmonary_red_flag or (has_severe_pain and has_body_pain):
        if arabic:
            return (
                "وجود جلطة عميقة في الساق مع ألم شديد في البطن أو الخاصرة يحتاج إلى تقييم طبي عاجل الآن؛ "
                "لا تنتظر ردًا عبر الإنترنت. اتصل بالإسعاف أو اذهب إلى أقرب قسم طوارئ فورًا، ولا تقد السيارة "
                "بنفسك. إذا كنت في السعودية فاتصل بـ997. لا تدلّك الساق، ولا تبدأ أو توقف مميع الدم أو تغيّر "
                "جرعته من نفسك. خذ تقرير التشخيص وقائمة أدويتك معك. إذا ظهر ضيق نفس أو ألم صدر أو سعال مع دم "
                "أو إغماء، اتصل بالإسعاف فورًا."
            )
        return (
            "A deep vein clot together with severe abdominal or flank pain needs urgent medical assessment now; "
            "do not wait for an online reply. Call your local emergency number or go to the nearest emergency "
            "department now, and do not drive yourself. If you are in Saudi Arabia, call 997 for an ambulance. "
            "Do not massage the leg or start, stop, or change a blood thinner dose on your own. Bring your "
            "diagnosis and medication list. If you develop shortness of breath, chest pain, coughing blood, or "
            "fainting, call emergency services immediately."
        )

    if arabic:
        return (
            "الجلطة العميقة في الساق تحتاج متابعة وعلاجًا يحددهما طبيب. تواصل الآن مع الطبيب الذي شخصها أو "
            "اذهب إلى رعاية عاجلة اليوم، ولا تغيّر جرعة مميع الدم أو توقفه من نفسك. إذا ظهر ضيق نفس أو ألم صدر "
            "أو سعال مع دم أو إغماء، اتصل بالإسعاف فورًا."
        )
    return (
        "A deep vein clot needs prompt medical follow-up and treatment directed by a clinician. Contact the "
        "clinician who diagnosed it now or seek urgent care today. Do not stop or change a blood thinner dose "
        "on your own. If you develop shortness of breath, chest pain, coughing blood, or fainting, call "
        "emergency services immediately."
    )
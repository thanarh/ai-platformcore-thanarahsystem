from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
import unicodedata
from typing import Any, Literal

from app.config import settings

SearchCategory = Literal["general", "news", "technical", "documentation"]


@dataclass(frozen=True)
class WebDecision:
    use_web: bool
    reason: str
    signals: tuple[str, ...] = ()
    category: SearchCategory = "general"

    def to_dict(self) -> dict[str, Any]:
        return {
            "useWeb": self.use_web,
            "reason": self.reason,
            "signals": list(self.signals),
            "category": self.category,
        }


_EXPLICIT_TERMS = (
    "ابحث",
    "بحث",
    "فتش",
    "مصادر",
    "على الإنترنت",
    "على الانترنت",
    "الويب",
    "قوقل",
    "غوغل",
    "search",
    "research",
    "look up",
    "find online",
    "online sources",
)
_CURRENT_TERMS = (
    "آخر",
    "اخر",
    "حالي",
    "الحالي",
    "أحدث",
    "احدث",
    "أخبار",
    "اخبار",
    "سعر",
    "طقس",
    "حالة الطقس",
    "توقعات الطقس",
    "درجة الحرارة",
    "درجه الحراره",
    "درجة حرارة",
    "درجه حراره",
    "درجات الحرارة",
    "درجات الحراره",
    "latest",
    "current",
    "news",
    "price",
    "weather",
    "temperature",
    "forecast",
)
_EXTERNAL_LOOKUP_TERMS = (
    "أفضل مكتبة",
    "افضل مكتبة",
    "أفضل أداة",
    "افضل اداة",
    "ما هو سعر",
    "how much does",
    "best library",
    "best tool",
)
_COMPARISON_QUERY_TERMS = (
    "الفرق بين",
    "الاختلاف بين",
    "مقارنة بين",
    "قارن بين",
    "ايهما افضل",
    "أيهما أفضل",
    "أيهم أفضل",
    "ايهما احسن",
    "أيهما أحسن",
    "مين الأفضل",
    "من الأفضل",
    "which is better",
    " مقابل ",
    " vs ",
    "versus",
    "difference between",
)
_CAR_BRAND_TERMS = (
    "مرسيدس",
    "مارسيدس",
    "بي ام دبليو",
    "بي إم دبليو",
    "bmw",
    "mercedes",
    "تويوتا",
    "toyota",
    "هوندا",
    "honda",
    "هيونداي",
    "hyundai",
    "نيسان",
    "nissan",
    "تسلا",
    "tesla",
    "اكسنت",
    "أكسنت",
    "accent",
    "كرولا",
    "كورولا",
    "corolla",
)
_GENERIC_VEHICLE_TERMS = (
    "سيارة",
    "سياره",
    "سيارات",
    "مركبة",
    "مركبه",
    "مركبات",
)
_ENGLISH_VEHICLE_QUERY = re.compile(
    r"(?<![a-z0-9])(?:cars?|vehicles?|suvs?|sedans?)(?![a-z0-9])"
)
_UNIVERSITY_ENTITY_TERMS = (
    "جامع",
    "university",
    "universities",
    "college",
    "colleges",
)
_UNIVERSITY_RANKING_INTENT_TERMS = (
    "افضل",
    "أفضل",
    "الافضل",
    "الأفضل",
    "احسن",
    "أحسن",
    "الاحسن",
    "الأحسن",
    "اعلى",
    "أعلى",
    "ترتيب",
    "تصنيف",
    "best",
    "top",
    "ranking",
    "rankings",
    "ranked",
    "highest",
)
_ORGANIZATION_LOOKUP_QUERY = re.compile(
    r"(?:من\s+(?:هي|هيا|هو|هوا)\s+(?:شركة|مؤسسة|استوديو)|"
    r"(?:who|what)\s+(?:is|are)\s+(?:the\s+)?(?:company|studio|organization))",
    re.IGNORECASE,
)
_EVENT_QUERY_TERMS = (
    "ما حصل",
    "ما اللي حصل",
    "ماذا حصل",
    "وش حصل",
    "ايش حصل",
    "ما حدث",
    "ما اللي حدث",
    "ماذا حدث",
    "وش صار",
    "ايش صار",
    "ما الذي حدث",
    "ما الذي حصل",
    "what happened",
    "what is happening",
    "what's happening",
    "events today",
)
_DIRECT_URL_SIGNAL = re.compile(
    r"(?i)(?:https?://|www\.)[^\s<>]+|"
    r"(?<![@\w])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}"
)
_NEWS_TERMS = (
    "أخبار",
    "اخبار",
    "خبر",
    "الأخبار",
    "الاخبار",
    "احبار",
    "news",
    "headline",
    "headlines",
    "مستجدات",
    "breaking news",
    "current events",
)
_NAMED_DAY_REFERENCES = (
    "اليوم الوطني",
    "اليوم العالمي",
    "national day",
    "international day",
)
_DOCUMENTATION_TERMS = (
    "توثيق",
    "وثائق",
    "دليل",
    "documentation",
    "docs",
    "reference",
    "api reference",
    "official guide",
)
_TECHNICAL_TERMS = (
    "api",
    "sdk",
    "python",
    "javascript",
    "typescript",
    "react",
    "next.js",
    "fastapi",
    "http",
    "rest",
    "graphql",
    "caching",
    "cache",
    "code",
    "برمجة",
    "تقنية",
    "تقني",
    "مكتبة",
    "كود",
)


def is_university_ranking_query(query: str) -> bool:
    text = " ".join((query or "").casefold().split())
    has_university = any(term.casefold() in text for term in _UNIVERSITY_ENTITY_TERMS)
    has_ranking_intent = any(
        term.casefold() in text for term in _UNIVERSITY_RANKING_INTENT_TERMS
    )
    return has_university and has_ranking_intent


def is_recent_vehicle_model_query(query: str) -> bool:
    text = (query or "").casefold()
    has_vehicle_term = any(
        term.casefold() in text
        for term in (*_CAR_BRAND_TERMS, *_GENERIC_VEHICLE_TERMS)
    ) or bool(_ENGLISH_VEHICLE_QUERY.search(text))
    if not has_vehicle_term:
        return False
    ascii_digits = "".join(
        str(unicodedata.decimal(char)) if char.isdecimal() else char
        for char in text
    )
    current_year = datetime.now(timezone.utc).year
    return any(
        int(year) >= current_year - 1
        for year in re.findall(r"(?<!\d)20\d{2}(?!\d)", ascii_digits)
    )


def is_car_comparison_query(query: str) -> bool:
    text = " ".join((query or "").casefold().split())
    has_comparison_term = any(term in text for term in _COMPARISON_QUERY_TERMS)
    has_car_brand = any(term.casefold() in text for term in _CAR_BRAND_TERMS)
    return has_comparison_term and has_car_brand


def classify_search_category(query: str) -> SearchCategory:
    """Choose a search category using auditable lexical signals.

    The local model is not asked to make this decision. Ambiguous requests
    intentionally fall back to the broad general category.
    """
    text = " ".join((query or "").casefold().split())
    has_current_signal = requires_same_day_results(query) or any(
        term.casefold() in text for term in _CURRENT_TERMS
    )
    is_current_event = has_current_signal and any(
        term.casefold() in text for term in _EVENT_QUERY_TERMS
    )
    if any(term.casefold() in text for term in _NEWS_TERMS) or is_current_event:
        return "news"
    if any(term.casefold() in text for term in _DOCUMENTATION_TERMS):
        return "documentation"
    if any(term.casefold() in text for term in _TECHNICAL_TERMS):
        return "technical"
    return "general"


def requires_same_day_results(query: str) -> bool:
    """Whether the user explicitly asks for information published today."""
    text = " ".join((query or "").casefold().split())
    if any(term in text for term in _NAMED_DAY_REFERENCES):
        return False
    return "اليوم" in text or bool(re.search(r"\btoday\b", text))


def decide_web(
    query: str,
    tenant_config: dict[str, Any] | None = None,
    *,
    explicit_request: bool = False,
) -> WebDecision:
    """Make a deterministic, auditable web decision from explicit signals.

    This deliberately does not ask the language model whether it is uncertain.
    It also keeps the feature disabled when the environment flag is off.
    """

    config = tenant_config or {}
    text = " ".join((query or "").casefold().split())
    signals: list[str] = []
    category = classify_search_category(query)

    if config.get("webSearchRequired") is True:
        signals.append("configured_web_required")
    if _DIRECT_URL_SIGNAL.search(query or ""):
        signals.append("user_provided_url")
    if explicit_request:
        signals.append("explicit_tool_selection")
    if any(term.casefold() in text for term in _EXPLICIT_TERMS):
        signals.append("explicit_search_request")
    university_ranking_query = is_university_ranking_query(query)
    recent_vehicle_query = is_recent_vehicle_model_query(query)
    if (
        category == "news"
        or any(term.casefold() in text for term in _CURRENT_TERMS)
        or recent_vehicle_query
    ):
        signals.append("time_sensitive_information")
    if university_ranking_query:
        signals.append("university_ranking_request")
    if recent_vehicle_query:
        signals.append("current_vehicle_model_query")
    is_car_comparison = is_car_comparison_query(query)
    if (
        any(term.casefold() in text for term in _EXTERNAL_LOOKUP_TERMS)
        or any(term.casefold() in text for term in _EVENT_QUERY_TERMS)
        or is_car_comparison
        or university_ranking_query
    ):
        signals.append("external_factual_lookup")
    if _ORGANIZATION_LOOKUP_QUERY.search(text):
        signals.append("external_factual_lookup")

    if not signals:
        return WebDecision(False, "no_web_signal", (), category)
    if config.get("webSearchEnabled") is False:
        return WebDecision(False, "disabled_by_tenant_config", tuple(signals), category)
    if not settings.web_search_enabled:
        return WebDecision(False, "disabled_by_environment", tuple(signals), category)
    return WebDecision(True, "web_signal_detected", tuple(signals), category)
from __future__ import annotations

from dataclasses import dataclass
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
    "اليوم",
    "حالي",
    "الحالي",
    "الآن",
    "الان",
    "أحدث",
    "احدث",
    "أخبار",
    "اخبار",
    "سعر",
    "طقس",
    "latest",
    "current",
    "today",
    "now",
    "news",
    "price",
    "weather",
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
_NEWS_TERMS = (
    "أخبار",
    "اخبار",
    "خبر",
    "الأخبار",
    "الاخبار",
    "news",
    "headline",
    "headlines",
    "آخر",
    "اخر",
    "أحدث",
    "احدث",
    "مستجدات",
    "latest",
    "current",
    "today",
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


def classify_search_category(query: str) -> SearchCategory:
    """Choose a search category using auditable lexical signals.

    The local model is not asked to make this decision. Ambiguous requests
    intentionally fall back to the broad general category.
    """
    text = " ".join((query or "").casefold().split())
    if any(term.casefold() in text for term in _NEWS_TERMS):
        return "news"
    if any(term.casefold() in text for term in _DOCUMENTATION_TERMS):
        return "documentation"
    if any(term.casefold() in text for term in _TECHNICAL_TERMS):
        return "technical"
    return "general"


def decide_web(query: str, tenant_config: dict[str, Any] | None = None) -> WebDecision:
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
    if any(term.casefold() in text for term in _EXPLICIT_TERMS):
        signals.append("explicit_search_request")
    if any(term.casefold() in text for term in _CURRENT_TERMS):
        signals.append("time_sensitive_information")
    if any(term.casefold() in text for term in _EXTERNAL_LOOKUP_TERMS):
        signals.append("external_factual_lookup")

    if not signals:
        return WebDecision(False, "no_web_signal", (), category)
    if config.get("webSearchEnabled") is False:
        return WebDecision(False, "disabled_by_tenant_config", tuple(signals), category)
    if not settings.web_search_enabled:
        return WebDecision(False, "disabled_by_environment", tuple(signals), category)
    return WebDecision(True, "web_signal_detected", tuple(signals), category)
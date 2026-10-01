from __future__ import annotations

import asyncio
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from typing import Any, Optional
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import httpx

from app.config import settings
from app.web_intelligence.decision import SearchCategory

logger = logging.getLogger(__name__)
_WIKIPEDIA_MIN_REQUEST_INTERVAL_SECONDS = 1.0

_SEARCH_COMMAND_PREFIX = re.compile(
    r"^\s*(?:(?:و|and)\s*)?(?:(?:ثم|بعدها|كذلك|أيضًا|ايضا|also|then)\s*)?(?:"
    r"(?:ابحث|أبحث|فتش|فتّش)\s+"
    r"(?:(?:أيضًا|ايضا|كذلك|ثم|بعدها)\s+)?"
    r"(?:(?:في|على|عبر)\s+(?:ال)?"
    r"(?:إنترنت|انترنت|ويب|جوجل|غوغل|قوقل|بينغ|google|bing|duckduckgo)\s+عن|عن)"
    r"|(?:search|research)\s+(?:(?:the\s+)?(?:web|internet)|online|"
    r"(?:(?:on|in)\s+(?:google|bing|duckduckgo)))\s+(?:for|about)"
    r"|(?:search|research)\s+(?:for|about)"
    r"|look\s+up"
    r"|find\s+online(?:\s+for)?"
    r")\s*[:：–—-]?\s*",
    re.IGNORECASE,
)
_SEARCH_REQUEST_WITHOUT_TOPIC = re.compile(
    r"^\s*(?:"
    r"(?:ابحث|أبحث|فتش|فتّش)"
    r"(?:\s+(?:(?:في|على|عبر)\s+(?:ال)?"
    r"(?:إنترنت|انترنت|ويب|جوجل|غوغل|قوقل|بينغ|google|bing|duckduckgo)))?"
    r"(?:\s+عن)?"
    r"|(?:search|research)"
    r"(?:\s+(?:(?:the\s+)?web|internet|online|google|bing|duckduckgo|"
    r"(?:on|in)\s+(?:google|bing|duckduckgo)))?"
    r"(?:\s+(?:for|about))?"
    r"|look\s+up|find\s+online"
    r")\s*[.!?؟،]*$",
    re.IGNORECASE,
)
_ARABIC_COMPANY_QUESTION_PREFIX = re.compile(
    r"^\s*(?:من|ما)\s+(?:هي|هيا|هو|هوا)\s+(?=(?:شركة|مؤسسة|استوديو)\b)",
    re.IGNORECASE,
)
_ARABIC_ORGANIZATION_PREFIX = re.compile(
    r"^\s*(?:شركة|مؤسسة|استوديو)\s+",
    re.IGNORECASE,
)
_ARABIC_NEWS_PREFIX = re.compile(
    r"^\s*(?:(?:ما|ماذا)\s+(?:هي\s+)?)?"
    r"(?:(?:آخر|اخر|أحدث|احدث)\s+)?"
    r"(?:الأخبار|الاخبار|أخبار|اخبار|احبار)\s+(?:عن\s+)?",
    re.IGNORECASE,
)
_ARABIC_CURRENT_TIME_SUFFIX = re.compile(
    r"\s+(?:اليوم|الآن|الان|حاليًا|حالياً)\s*[؟?!.،,]*$",
    re.IGNORECASE,
)
_DIRECT_URL = re.compile(
    r"(?i)(?:https?://|www\.)[^\s<>{}\[\]\"'`]+|"
    r"(?<![@\w])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}"
    r"(?::\d{1,5})?(?:/[^\s<>{}\[\]\"'`]*)?"
)
_URL_REFERENCE_LANGUAGE = re.compile(
    r"(?i)(?:\b(?:(?:this\s+is|here\s+is)\s+(?:(?:their|the)\s+)?|"
    r"(?:(?:their|the)\s+)?)(?:website|web\s+site|site|url|link)\b|"
    r"(?:هذا\s+(?:هو\s+)?|هذه\s+(?:هي\s+)?|هو\s+)?"
    r"(?:موقعهم|موقعها|موقعه|الموقع|موقع|رابطهم|الرابط|رابط)"
    r"(?:\s+(?:ال)?(?:إلكتروني|الكتروني|الاكتروني|اكتروني))?)"
)
_URL_TRAILING_PUNCTUATION = ".,;:!?،؛؟)]}»”’"
_SEARCH_ENGINE_HOSTS = {
    "google.com",
    "google.com.nf",
    "search.google",
    "bing.com",
    "yahoo.com",
    "search.yahoo.com",
    "search.brave.com",
    "duckduckgo.com",
    "startpage.com",
}
_SEARCH_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at",
    "for", "by", "with", "from", "about", "what", "which", "who", "is",
    "are", "be", "was", "were", "do", "does", "how", "can", "could",
    "would", "should", "me", "my", "you", "your", "tell", "give", "find",
    "search", "research", "latest", "recent", "new", "today", "now",
    "online", "web", "internet", "official", "please",
    "من", "في", "على", "عن", "إلى", "الى", "ما", "هو", "هي", "هذا",
    "هذه", "ذلك", "مع", "كيف", "ماذا", "هل", "أريد", "اريد", "ابحث",
    "أبحث", "بحث", "الإنترنت", "الانترنت", "الويب", "لي", "أحدث",
    "احدث", "آخر", "اخر", "اليوم", "الآن", "الان",
    "بين", "الفرق", "مقارنة", "مقارنه",
}
_ARABIC_MARKS = re.compile(r"[\u0640\u064b-\u065f\u0670]")
_ARABIC_LETTER_NORMALIZATION = str.maketrans({
    "أ": "ا",
    "إ": "ا",
    "آ": "ا",
    "ٱ": "ا",
    "ى": "ي",
    "ة": "ه",
})


def _normalize_lexical_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "").casefold()
    normalized = _ARABIC_MARKS.sub("", normalized).translate(_ARABIC_LETTER_NORMALIZATION)
    normalized = re.sub(
        r"(?<!\w)(?:ال)?(?:مارسيدس|مرسيدس)(?:[\s-]*بنز)?(?!\w)",
        " mercedes ",
        normalized,
    )
    normalized = re.sub(
        r"(?<!\w)(?:ال)?بي\s+ام\s+دبليو(?!\w)",
        " bmw ",
        normalized,
    )
    return normalized


_NORMALIZED_SEARCH_STOPWORDS = {
    _normalize_lexical_text(term) for term in _SEARCH_STOPWORDS
}

_WIKIPEDIA_QUERY_FRAMING = {
    "ما", "ماذا", "وش", "ايش", "اللي", "الذي", "التي", "حصل", "حدث", "صار", "و",
    "في", "عن", "من", "بين", "الفرق", "الاختلاف", "مقارنة", "قارن",
    "افضل", "الافضل", "احسن", "الاحسن", "اعلى", "ترتيب", "الترتيب", "تصنيف", "التصنيف",
    "what", "happened", "occurred", "is", "are", "the", "in", "during",
    "of", "between", "difference", "compare", "comparison", "best", "top", "ranking", "rankings",
}


def normalize_search_query(query: str) -> str:
    """Clean search instructions and keep direct URLs from polluting query terms."""
    original = (query or "").strip()
    if _SEARCH_REQUEST_WITHOUT_TOPIC.fullmatch(original):
        return ""
    normalized = _SEARCH_COMMAND_PREFIX.sub("", original, count=1).strip(
        " \t:：–—-،,;؛"
    )
    normalized = _ARABIC_COMPANY_QUESTION_PREFIX.sub("", normalized, count=1)
    normalized = _ARABIC_ORGANIZATION_PREFIX.sub("", normalized, count=1)
    normalized = _ARABIC_NEWS_PREFIX.sub("", normalized, count=1)
    normalized = _ARABIC_CURRENT_TIME_SUFFIX.sub("", normalized, count=1).strip()
    if "مصر" in normalized and re.search(r"(?<!\w)احبار(?!\w)", normalized):
        normalized = re.sub(r"(?<!\w)احبار(?!\w)", "أخبار", normalized, count=1)
    direct_urls = extract_direct_urls(normalized)
    if direct_urls:
        normalized = _DIRECT_URL.sub(" ", normalized)
        normalized = _URL_REFERENCE_LANGUAGE.sub(" ", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip(" \t:：,，;؛!?؟.")
        host = (urlparse(direct_urls[0]).hostname or "").casefold()
        if host.startswith("www."):
            host = host[4:]
        labels = [label for label in host.split(".") if label]
        brand_terms = " ".join(labels[:-1]) if len(labels) > 1 else host
        normalized = " ".join(part for part in (normalized, brand_terms) if part)
    return normalized or original


def is_search_request_missing_topic(query: str) -> bool:
    return bool((query or "").strip() and _SEARCH_REQUEST_WITHOUT_TOPIC.fullmatch((query or "").strip()))


def normalize_wikipedia_query(query: str) -> str:
    """Remove question framing from stable-topic searches sent to Wikipedia."""
    normalized = normalize_search_query(query)
    normalized = re.sub(
        r"(?<!\w)(?:ال)?بي\s+ام\s+دبليو(?!\w)",
        "بي إم دبليو",
        normalized,
        flags=re.IGNORECASE,
    )
    words = re.findall(r"[\w\u0600-\u06ff]+", normalized)
    topic_words = [
        word
        for word in words
        if _normalize_lexical_text(word) not in _WIKIPEDIA_QUERY_FRAMING
    ]
    topic = " ".join(topic_words).strip()
    topic = re.sub(
        r"(?<!\w)(?:ال)?(?:مارسيدس|مرسيدس)(?!\w)",
        "مرسيدس",
        topic,
        flags=re.IGNORECASE,
    )
    return topic or normalized


def extract_direct_urls(query: str) -> list[str]:
    """Return public-looking HTTP(S) links explicitly included in user text.

    Network and SSRF validation remains the fetcher's responsibility; this
    helper only normalizes and deduplicates URL-shaped text.
    """
    urls: list[str] = []
    seen: set[str] = set()
    for match in _DIRECT_URL.finditer(query or ""):
        candidate = match.group(0).rstrip(_URL_TRAILING_PUNCTUATION)
        if not candidate:
            continue
        if candidate.casefold().startswith("www."):
            candidate = f"https://{candidate}"
        elif not candidate.casefold().startswith(("http://", "https://")):
            candidate = f"https://{candidate}"
        parsed = urlparse(candidate)
        try:
            parsed.port
        except ValueError:
            continue
        if not parsed.hostname or parsed.username or parsed.password:
            continue
        key = candidate.casefold().rstrip("/")
        if key not in seen:
            urls.append(candidate)
            seen.add(key)
    return urls


def _effective_language(query: str, language: str) -> str:
    compact = "".join((query or "").split())
    arabic = sum("\u0600" <= char <= "\u06ff" for char in compact)
    if language and language != "auto":
        # The original request may be Arabic while normalization leaves only
        # a Latin company or product name for the search engine.
        if (
            language.casefold().startswith("ar")
            and compact
            and arabic / len(compact) <= 0.2
            and re.search(r"[A-Za-z]", compact)
        ):
            return "en"
        return language
    return "ar" if compact and arabic / len(compact) > 0.2 else "en"


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str
    source: str
    rank: int
    published_at: Optional[str] = None
    engines: tuple[str, ...] = ()
    category: SearchCategory = "general"
    search_topics: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "source": self.source,
            "rank": self.rank,
            "publishedAt": self.published_at,
            "engines": list(self.engines),
            "category": self.category,
        }


_UNIVERSITY_RANKING_SOURCE_DOMAINS = {
    "topuniversities.com",
    "timeshighereducation.com",
    "shanghairanking.com",
    "cwur.org",
    "usnews.com",
}
_UNIVERSITY_RANKING_MARKERS = (
    "ranking",
    "rankings",
    "ranked",
    "تصنيف",
    "ترتيب",
)


def is_university_ranking_source_candidate(result: SearchResult) -> bool:
    hostname = (urlparse(result.url).hostname or "").casefold()
    trusted_publisher = any(
        hostname == domain or hostname.endswith(f".{domain}")
        for domain in _UNIVERSITY_RANKING_SOURCE_DOMAINS
    )
    if not trusted_publisher:
        return False
    text = _normalize_lexical_text(f"{result.title} {result.snippet}")
    return any(marker in text for marker in _UNIVERSITY_RANKING_MARKERS)


def is_current_model_year_source_candidate(result: SearchResult, query: str) -> bool:
    query_digits = "".join(
        str(unicodedata.decimal(char)) if char.isdecimal() else char
        for char in query
    )
    requested_years = set(re.findall(r"(?<!\d)20\d{2}(?!\d)", query_digits))
    if not requested_years:
        return False

    hostname = (urlparse(result.url).hostname or "").casefold()
    if hostname == "wikipedia.org" or hostname.endswith(".wikipedia.org"):
        return False

    result_text = f"{result.title} {result.snippet}"
    result_digits = "".join(
        str(unicodedata.decimal(char)) if char.isdecimal() else char
        for char in result_text
    )
    return any(year in result_digits for year in requested_years)


class SearXNGClient:
    def __init__(
        self,
        base_url: str | None = None,
        *,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        self.base_url = (base_url or settings.searxng_url).rstrip("/")
        self._client = client
        self.timeout_seconds = timeout_seconds or settings.searxng_timeout_seconds
        self._capabilities_cache: tuple[float, dict[str, Any]] | None = None
        self._wikipedia_request_lock = asyncio.Lock()
        self._wikipedia_last_request_at = 0.0
        self._wikipedia_min_request_interval_seconds = _WIKIPEDIA_MIN_REQUEST_INTERVAL_SECONDS

    async def _request(self, path: str, params: dict[str, Any]) -> httpx.Response:
        headers = {"User-Agent": settings.web_fetch_user_agent}
        if self._client is not None:
            return await self._client.get(
                f"{self.base_url}{path}",
                params=params,
                timeout=self.timeout_seconds,
                headers=headers,
            )
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout_seconds),
            follow_redirects=False,
        ) as client:
            return await client.get(f"{self.base_url}{path}", params=params, headers=headers)

    async def _request_url(self, url: str, params: dict[str, Any]) -> httpx.Response:
        headers = {"User-Agent": settings.web_fetch_user_agent}
        if self._client is not None:
            return await self._client.get(
                url,
                params=params,
                timeout=self.timeout_seconds,
                headers=headers,
            )
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout_seconds),
            follow_redirects=False,
        ) as client:
            return await client.get(url, params=params, headers=headers)

    async def _json_request(self, path: str, params: dict[str, Any] | None = None) -> tuple[httpx.Response, Any]:
        response = await self._request(path, params or {})
        try:
            return response, response.json()
        except ValueError:
            return response, None

    async def probe(self) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        try:
            response, payload = await self._json_request("/search", {
                "q": "Python",
                "format": "json",
                "language": "en",
                "safesearch": settings.web_safe_search,
                "categories": "general",
            })
            valid = response.is_success and isinstance(payload, dict) and isinstance(payload.get("results"), list)
            return {
                "reachable": True,
                "httpStatus": response.status_code,
                "json": valid,
                "resultCount": len(payload.get("results", [])) if isinstance(payload, dict) else 0,
                "checkedAt": started.isoformat(),
            }
        except Exception as exc:
            return {
                "reachable": False,
                "httpStatus": None,
                "json": False,
                "resultCount": 0,
                "error": str(exc)[:240],
                "checkedAt": started.isoformat(),
            }

    @staticmethod
    def _configured_engine_names(payload: Any) -> list[dict[str, Any]]:
        if not isinstance(payload, dict) or not isinstance(payload.get("engines"), list):
            return []
        engines: list[dict[str, Any]] = []
        for item in payload["engines"]:
            if isinstance(item, str):
                engines.append({"name": item, "categories": []})
            elif (
                isinstance(item, dict)
                and item.get("name")
                and item.get("enabled") is not False
            ):
                engines.append({
                    "name": str(item["name"]),
                    "categories": [str(category) for category in item.get("categories", []) if category],
                })
        return engines

    @staticmethod
    def _configured_fallback() -> list[dict[str, Any]]:
        return [
            {"name": name.strip(), "categories": []}
            for name in settings.web_search_engines.split(",")
            if name.strip()
        ]

    async def discover_engines(self, *, force: bool = False) -> dict[str, Any]:
        now = datetime.now(timezone.utc).timestamp()
        if (
            not force
            and self._capabilities_cache
            and now - self._capabilities_cache[0] <= settings.web_search_capability_cache_seconds
        ):
            return self._capabilities_cache[1]

        started = datetime.now(timezone.utc)
        configured: list[dict[str, Any]] = []
        config_error: str | None = None
        try:
            response, payload = await self._json_request("/config", {"format": "json"})
            if response.is_success:
                configured = self._configured_engine_names(payload)
            if not configured:
                config_error = "SearXNG config did not expose an engine list"
        except Exception as exc:
            config_error = str(exc)[:240]

        configured_by_name = {item["name"]: item for item in configured}
        configured_names = {name.casefold() for name in configured_by_name}
        candidates = list(configured)
        if candidates:
            # Some SearXNG builds omit an explicitly allowlisted general engine
            # from /config even though its per-engine JSON search endpoint works.
            # Re-add only the known Bing general adapter from our local allowlist;
            # it still has to pass the same live probe before becoming active.
            for fallback in self._configured_fallback():
                name = str(fallback.get("name") or "")
                if name.casefold() != "bing" or name.casefold() in configured_names:
                    continue
                candidate = dict(fallback)
                candidate["categories"] = ["general"]
                candidates.append(candidate)
                configured_by_name[name] = candidate
                configured_names.add(name.casefold())
        else:
            candidates = self._configured_fallback()
            configured_by_name = {item["name"]: item for item in candidates}
        checks: list[dict[str, Any]] = []
        for candidate in candidates:
            name = candidate["name"]
            try:
                response, payload = await self._json_request("/search", {
                    "q": "Python",
                    "format": "json",
                    "language": "en",
                    "safesearch": settings.web_safe_search,
                    "categories": "general",
                    "engines": name,
                })
                unresponsive = {
                    str(item[0] if isinstance(item, list) and item else item)
                    for item in (payload.get("unresponsive_engines", []) if isinstance(payload, dict) else [])
                }
                healthy = response.is_success and isinstance(payload, dict) and isinstance(
                    payload.get("results"), list
                ) and name not in unresponsive
                checks.append({
                    "name": name,
                    "healthy": healthy,
                    "httpStatus": response.status_code,
                    "resultCount": len(payload.get("results", [])) if isinstance(payload, dict) else 0,
                    "categories": candidate.get("categories") or configured_by_name.get(name, {}).get("categories", []),
                    "error": None if healthy else ("engine returned an error or was unresponsive"),
                })
            except Exception as exc:
                checks.append({
                    "name": name,
                    "healthy": False,
                    "httpStatus": None,
                    "resultCount": 0,
                    "categories": candidate.get("categories", []),
                    "error": str(exc)[:180],
                })

        healthy_engines = [item for item in checks if item["healthy"]]
        categories = sorted({
            category
            for item in healthy_engines
            for category in self._mapped_categories(item.get("categories", []))
        })
        result = {
            "engines": healthy_engines,
            "configuredEngines": [item["name"] for item in candidates],
            "categories": categories,
            "healthy": bool(healthy_engines),
            "checkedAt": started.isoformat(),
            "configError": config_error,
        }
        self._capabilities_cache = (now, result)
        return result

    @staticmethod
    def _mapped_categories(categories: list[str]) -> set[str]:
        lowered = {category.casefold() for category in categories}
        mapped: set[str] = set()
        if not lowered or "general" in lowered:
            mapped.add("general")
        if "news" in lowered:
            mapped.add("news")
        if lowered.intersection({"it", "science", "technology", "repos", "q&a"}):
            mapped.add("technical")
        if lowered.intersection({"it", "science", "general"}):
            mapped.add("documentation")
        return mapped

    async def active_engines(self, category: SearchCategory) -> list[str]:
        capabilities = await self.discover_engines()
        available: list[str] = []
        for item in capabilities.get("engines", []):
            mapped = self._mapped_categories(item.get("categories", []))
            if not item.get("categories") or category in mapped:
                available.append(str(item["name"]))
        return available

    async def search(
        self,
        query: str,
        *,
        language: str = "auto",
        region: str | None = None,
        max_results: int | None = None,
        safe_search: int | None = None,
        category: SearchCategory = "general",
        time_range: str | None = None,
    ) -> list[SearchResult]:
        search_query = normalize_search_query(query)
        if not search_query:
            return []
        effective_language = _effective_language(search_query, language or "auto")
        category_param = {
            "general": "general",
            "news": "news",
            "technical": "it",
            "documentation": "it",
        }[category]
        engines = await self.active_engines(category)
        params: dict[str, Any] = {
            "q": search_query,
            "format": "json",
            "language": effective_language,
            "safesearch": settings.web_safe_search if safe_search is None else safe_search,
            "categories": category_param,
            **({"region": region} if region else {}),
        }
        if time_range is not None:
            if time_range not in {"day", "week", "month", "year"}:
                raise ValueError("time_range must be one of: day, week, month, year")
            params["time_range"] = time_range
        if engines:
            params["engines"] = ",".join(engines)
        response = await self._request("/search", params)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            raise ValueError("SearXNG returned a malformed JSON response")
        if not payload["results"] and effective_language.casefold().startswith("ar"):
            # Some general engines, including the current Bing adapter, return
            # no results for Arabic when the locale is fixed to "ar". Let the
            # engine choose across languages before treating the search as empty.
            fallback_params = dict(params)
            fallback_params["language"] = "all"
            response = await self._request("/search", fallback_params)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
                raise ValueError("SearXNG returned a malformed JSON response")

        limit = max(1, min(max_results or settings.web_max_results, 20))
        results: list[SearchResult] = []
        for index, item in enumerate(payload["results"][:limit], start=1):
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "").strip()
            title = str(item.get("title") or "").strip()
            if not url or not title:
                continue
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                continue
            engines_value = item.get("engines") or item.get("engine") or item.get("source") or ""
            if isinstance(engines_value, str):
                engines_for_result = (engines_value[:120],) if engines_value else ()
            else:
                engines_for_result = tuple(str(value)[:120] for value in engines_value if value)
            results.append(
                SearchResult(
                    title=title[:500],
                    url=url,
                    snippet=str(item.get("content") or item.get("snippet") or "").strip()[:1200],
                    source=str(engines_for_result[0] if engines_for_result else parsed.hostname or "web")[:120],
                    rank=index,
                    published_at=(
                        str(item.get("publishedDate") or item.get("publishedAt") or "").strip() or None
                    ),
                    engines=engines_for_result,
                    category=category,
                )
            )
        return results

    async def search_wikipedia(
        self,
        query: str,
        *,
        language: str = "auto",
        max_results: int | None = None,
        category: SearchCategory = "general",
    ) -> list[SearchResult]:
        """Use MediaWiki's public search API as a stable-fact fallback."""
        search_query = normalize_wikipedia_query(query)
        if not search_query:
            return []
        wiki_language = (
            "ar"
            if _effective_language(search_query, language or "auto").casefold().startswith("ar")
            else "en"
        )
        async with self._wikipedia_request_lock:
            elapsed = time.monotonic() - self._wikipedia_last_request_at
            wait_seconds = self._wikipedia_min_request_interval_seconds - elapsed
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
            self._wikipedia_last_request_at = time.monotonic()
            response = await self._request_url(
                f"https://{wiki_language}.wikipedia.org/w/api.php",
                {
                    "action": "query",
                    "list": "search",
                    "srsearch": search_query,
                    "srnamespace": 0,
                    "srlimit": max(1, min(max_results or settings.web_max_results, 10)),
                    "srprop": "snippet",
                    "format": "json",
                    "utf8": 1,
                },
            )
        response.raise_for_status()
        payload = response.json()
        hits = payload.get("query", {}).get("search", []) if isinstance(payload, dict) else []
        if not isinstance(hits, list):
            raise ValueError("Wikipedia returned a malformed search response")

        results: list[SearchResult] = []
        for index, item in enumerate(hits, start=1):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            if not title:
                continue
            snippet = unescape(re.sub(r"<[^>]+>", " ", str(item.get("snippet") or "")))
            snippet = re.sub(r"\s+", " ", snippet).strip()
            article_path = quote(title.replace(" ", "_"), safe="()_,")
            results.append(
                SearchResult(
                    title=title[:500],
                    url=f"https://{wiki_language}.wikipedia.org/wiki/{article_path}",
                    snippet=snippet[:1200],
                    source="wikipedia",
                    rank=index,
                    engines=("wikipedia_api",),
                    category=category,
                )
            )
        return results


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    query = urlencode(sorted(parse_qsl(parsed.query, keep_blank_values=True)))
    host = (parsed.hostname or "").casefold()
    try:
        port = parsed.port
    except ValueError:
        return ""
    netloc = host
    if port and not ((parsed.scheme == "http" and port == 80) or (parsed.scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((parsed.scheme.casefold(), netloc, path, "", query, ""))


def blocked_search_domains() -> set[str]:
    return {
        domain.strip().casefold().lstrip(".")
        for domain in settings.web_search_blocked_domains.split(",")
        if domain.strip()
    }


def _relevance_variants(term: str) -> set[str]:
    """Match common Arabic article/plural forms without weakening result filters."""
    variants = {term}
    if not re.search(r"[\u0600-\u06ff]", term):
        return variants

    base = term[2:] if term.startswith("ال") and len(term) > 3 else term
    variants.add(base)
    if len(base) > 4 and base.endswith("ات"):
        variants.add(f"{base[:-2]}ه")
    if base == "احسن":
        variants.add("افضل")
    elif base == "افضل":
        variants.add("احسن")
    elif base in {"مارسيدس", "مرسيدس"}:
        variants.update({"مارسيدس", "مرسيدس"})
    return variants


_COMPARISON_QUERY_MARKERS = (
    "الفرق بين",
    "فرق بين",
    "قارن",
    "مقارنة",
    "ايهما افضل",
    "ايهما احسن",
    "compare",
    "difference between",
    "differences",
    "versus",
    "which is better",
)
_SHARED_TOPIC_PREFIX = re.compile(
    r"^\s*(?P<prefix>أضرار|اضرار|مخاطر|فوائد|أعراض|اعراض|تأثيرات?|"
    r"مميزات|عيوب|أسعار|اسعار|سعر|مواصفات|risks|benefits|side effects|"
    r"prices|features|specifications)\s+(?P<left>.+?)\s+"
    r"(?:و\s*|and\s+)(?P<right>.+?)\s*[.?!؟،،]*\s*$",
    re.IGNORECASE,
)
_REPEATED_SEARCH_DIRECTIVE = re.compile(
    r"(?i)(?:^|[\s،,;؛])(?:(?:و|and)\s*)?(?:ثم|بعدها|كذلك|أيضًا|ايضا|also|then)?\s*"
    r"(?:ابحث|أبحث|فتش|فتّش|search|research|look\s+up)\b"
)


def split_search_queries(
    query: str,
    *,
    max_queries: int = 3,
) -> tuple[list[str], bool]:
    """Split explicit, clearly separate search topics without breaking comparisons."""
    raw = (query or "").strip()
    if not raw:
        return [], False

    normalized = normalize_search_query(raw)
    if not normalized or re.search(r"https?://", raw, re.IGNORECASE):
        return ([normalized] if normalized else []), False

    lexical = _normalize_lexical_text(normalized)
    if any(marker in lexical for marker in _COMPARISON_QUERY_MARKERS):
        return [normalized], False

    parts: list[str] = []
    bullet_lines = [
        re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip()
        for line in raw.splitlines()
        if re.match(r"^\s*(?:[-*•]|\d+[.)])\s*\S", line)
    ]
    if len(bullet_lines) > 1:
        parts = bullet_lines
    else:
        parts = [part.strip() for part in re.split(r"[;؛]+", raw) if part.strip()]

    if len(parts) <= 1:
        directives = list(_REPEATED_SEARCH_DIRECTIVE.finditer(raw))
        if len(directives) > 1:
            starts = [match.start() for match in directives]
            parts = [
                raw[starts[index] : starts[index + 1]].strip()
                for index in range(len(starts) - 1)
            ]
            parts.append(raw[starts[-1] :].strip())

    if len(parts) <= 1:
        shared_topic = _SHARED_TOPIC_PREFIX.match(normalized)
        if shared_topic:
            prefix = shared_topic.group("prefix")
            parts = [
                f"{prefix} {shared_topic.group('left')}",
                f"{prefix} {shared_topic.group('right')}",
            ]

    normalized_parts: list[str] = []
    seen: set[str] = set()
    for part in parts:
        candidate = normalize_search_query(part)
        key = _normalize_lexical_text(candidate)
        if candidate and key not in seen:
            seen.add(key)
            normalized_parts.append(candidate)

    if not normalized_parts:
        return [normalized], False

    limit = max(1, min(max_queries, 5))
    return normalized_parts[:limit], len(normalized_parts) > limit


_ARABIC_SEARCH_TRANSLATIONS = (
    ("أضرار الشيشة الالكترونية", "vaping risks"),
    ("أضرار التدخين الالكتروني", "vaping risks"),
    ("أضرار الفيب", "vaping risks"),
    ("التدخين الالكتروني", "vaping"),
    ("الشيشة الالكترونية", "vaping"),
    ("البي ام دبليو", "BMW"),
    ("بي ام دبليو", "BMW"),
    ("ايهما افضل", "which is better"),
    ("ايهما احسن", "which is better"),
    ("المرسيدس", "Mercedes-Benz"),
    ("الفرق بين", "difference between"),
    ("أضرار", "risks"),
    ("اضرار", "risks"),
    ("مخاطر", "risks"),
    ("فوائد", "benefits"),
    ("تدخين", ""),
    ("ومتور", "and engine"),
    ("والمرسيدس", "and Mercedes-Benz"),
    ("موتور", "engine"),
    ("الموتور", "engine"),
    ("المتور", "engine"),
    ("الموتر", "engine"),
    ("المحركات", "engines"),
    ("المحرك", "engine"),
    ("محركات", "engines"),
    ("محرك", "engine"),
    ("ولا", "or"),
    ("او", "or"),
    ("ام", "or"),
    ("الفيب", "vaping"),
    ("متور", "engine"),
    ("موتر", "engine"),
    ("مرسيدس", "Mercedes-Benz"),
)


def english_search_query(query: str) -> str | None:
    """Translate a small, explicit set of common Arabic search terms locally."""
    normalized = _normalize_lexical_text(normalize_search_query(query))
    normalized = re.sub(r"[^\w]+", " ", normalized, flags=re.UNICODE)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not re.search(r"[\u0600-\u06ff]", normalized):
        return None

    translated = normalized
    for arabic, english in sorted(_ARABIC_SEARCH_TRANSLATIONS, key=lambda pair: len(pair[0]), reverse=True):
        translated = translated.replace(_normalize_lexical_text(arabic), english)
    translated = re.sub(r"\s+و\s+", " and ", translated)
    translated = re.sub(r"\s+", " ", translated).strip()
    if re.search(r"[\u0600-\u06ff]", translated):
        return None
    return translated or None


def filter_and_score_results(query: str, results: list[SearchResult]) -> list[SearchResult]:
    """Deduplicate by canonical URL, remove blocked domains, then score lexically."""
    search_query = normalize_search_query(query)
    terms = {
        term
        for term in re.findall(r"[\w\u0600-\u06ff]{2,}", _normalize_lexical_text(search_query))
        if term not in _NORMALIZED_SEARCH_STOPWORDS
    }
    minimum_overlap = 2 if len(terms) >= 3 else 1
    seen: set[str] = set()
    scored: list[tuple[float, SearchResult]] = []
    blocked = blocked_search_domains()
    for result in results:
        canonical = canonicalize_url(result.url)
        parsed = urlparse(result.url)
        hostname = (parsed.hostname or "").casefold()
        path = parsed.path.rstrip("/") or "/"
        search_homepage = path in {"/", "/webhp", "/search"} and any(
            hostname == domain or hostname.endswith(f".{domain}")
            for domain in _SEARCH_ENGINE_HOSTS
        )
        if not canonical or canonical in seen or any(
            hostname == domain or hostname.endswith(f".{domain}") for domain in blocked
        ) or search_homepage:
            continue
        seen.add(canonical)
        haystack = _normalize_lexical_text(f"{result.title} {result.snippet}")
        overlap = sum(
            1
            for term in terms
            if any(variant in haystack for variant in _relevance_variants(term))
        )
        if terms and overlap < minimum_overlap:
            continue
        score = overlap / max(1, len(terms)) + max(0.0, 1.0 - (result.rank - 1) * 0.03)
        scored.append((score, result))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [result for _, result in scored]


def select_diverse_results(results: list[SearchResult], limit: int) -> list[SearchResult]:
    selected: list[SearchResult] = []
    remaining = list(results)
    domains: set[str] = set()
    max_domains = max(1, settings.web_max_domains)
    while remaining and len(selected) < limit:
        next_index = next(
            (
                index
                for index, item in enumerate(remaining)
                if (urlparse(item.url).hostname or "").casefold() not in domains
            ),
            0,
        )
        item = remaining.pop(next_index)
        domain = (urlparse(item.url).hostname or "").casefold()
        if domain not in domains and len(domains) >= max_domains:
            next_index = 0
            item = remaining.pop(next_index)
            domain = (urlparse(item.url).hostname or "").casefold()
        selected.append(item)
        domains.add(domain)
    return selected
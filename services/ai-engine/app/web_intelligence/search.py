from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx

from app.config import settings
from app.web_intelligence.decision import SearchCategory

logger = logging.getLogger(__name__)


def _effective_language(query: str, language: str) -> str:
    if language and language != "auto":
        return language
    compact = "".join((query or "").split())
    arabic = sum("\u0600" <= char <= "\u06ff" for char in compact)
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
            elif isinstance(item, dict) and item.get("name"):
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
        candidates = configured or self._configured_fallback()
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
    ) -> list[SearchResult]:
        if not query.strip():
            return []
        effective_language = _effective_language(query, language or "auto")
        category_param = {
            "general": "general",
            "news": "news",
            "technical": "it",
            "documentation": "it",
        }[category]
        engines = await self.active_engines(category)
        params: dict[str, Any] = {
            "q": query.strip(),
            "format": "json",
            "language": effective_language,
            "safesearch": settings.web_safe_search if safe_search is None else safe_search,
            "categories": category_param,
            **({"region": region} if region else {}),
        }
        if engines:
            params["engines"] = ",".join(engines)
        response = await self._request("/search", params)
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


def filter_and_score_results(query: str, results: list[SearchResult]) -> list[SearchResult]:
    """Deduplicate by canonical URL, remove blocked domains, then score lexically."""
    terms = set(re.findall(r"[\w\u0600-\u06ff]{2,}", query.casefold()))
    seen: set[str] = set()
    scored: list[tuple[float, SearchResult]] = []
    blocked = blocked_search_domains()
    for result in results:
        canonical = canonicalize_url(result.url)
        hostname = (urlparse(result.url).hostname or "").casefold()
        if not canonical or canonical in seen or any(
            hostname == domain or hostname.endswith(f".{domain}") for domain in blocked
        ):
            continue
        seen.add(canonical)
        haystack = f"{result.title} {result.snippet}".casefold()
        overlap = sum(1 for term in terms if term in haystack)
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
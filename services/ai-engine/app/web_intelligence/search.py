from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

from app.config import settings

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

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "source": self.source,
            "rank": self.rank,
            "publishedAt": self.published_at,
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

    async def _request(self, params: dict[str, Any]) -> httpx.Response:
        if self._client is not None:
            return await self._client.get(
                f"{self.base_url}/search",
                params=params,
                timeout=self.timeout_seconds,
            )
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout_seconds),
            follow_redirects=False,
        ) as client:
            return await client.get(f"{self.base_url}/search", params=params)

    async def probe(self) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        try:
            response = await self._request({
                "q": "Python",
                "format": "json",
                "language": "en",
                "safesearch": settings.web_safe_search,
                "categories": "general",
            })
            payload = response.json()
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

    async def search(
        self,
        query: str,
        *,
        language: str = "auto",
        region: str | None = None,
        max_results: int | None = None,
        safe_search: int | None = None,
    ) -> list[SearchResult]:
        if not query.strip():
            return []
        effective_language = _effective_language(query, language or "auto")
        response = await self._request({
            "q": query.strip(),
            "format": "json",
            "language": effective_language,
            "safesearch": settings.web_safe_search if safe_search is None else safe_search,
            "categories": "general",
            **({"region": region} if region else {}),
        })
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
            results.append(
                SearchResult(
                    title=title[:500],
                    url=url,
                    snippet=str(item.get("content") or item.get("snippet") or "").strip()[:1200],
                    source=str(item.get("engine") or item.get("source") or parsed.hostname or "web")[:120],
                    rank=index,
                    published_at=(
                        str(item.get("publishedDate") or item.get("publishedAt") or "").strip() or None
                    ),
                )
            )
        return results
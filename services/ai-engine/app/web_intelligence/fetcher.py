from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

import httpx

from app.config import settings


class UnsafeURL(ValueError):
    pass


class FetchError(RuntimeError):
    pass


@dataclass(frozen=True)
class FetchedPage:
    url: str
    content_type: str
    content: bytes
    retrieved_at: str


def _is_forbidden_ip(address: str) -> bool:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    return bool(
        parsed.is_private
        or parsed.is_loopback
        or parsed.is_link_local
        or parsed.is_multicast
        or parsed.is_reserved
        or parsed.is_unspecified
    )


def _resolve_host(hostname: str) -> list[str]:
    try:
        return list({item[4][0] for item in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)})
    except socket.gaierror as exc:
        raise UnsafeURL(f"host could not be resolved: {hostname}") from exc


def validate_public_url(url: str, resolver: Callable[[str], list[str]] = _resolve_host) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise UnsafeURL("only http and https URLs are allowed")
    hostname = parsed.hostname.rstrip(".").casefold()
    if hostname in {"localhost", "metadata", "instance-data", "host.docker.internal"}:
        raise UnsafeURL("internal hostname is not allowed")
    if hostname.endswith((".local", ".internal", ".localhost")):
        raise UnsafeURL("internal hostname is not allowed")
    if _is_forbidden_ip(hostname):
        raise UnsafeURL("private or metadata IP is not allowed")
    addresses = resolver(hostname)
    if not addresses:
        raise UnsafeURL("host has no address")
    if any(_is_forbidden_ip(address) for address in addresses):
        raise UnsafeURL("host resolves to a private or metadata IP")


class SafeHTTPFetcher:
    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float | None = None,
        max_bytes: int | None = None,
        max_redirects: int | None = None,
        retries: int | None = None,
        resolver: Callable[[str], list[str]] = _resolve_host,
    ) -> None:
        self._client = client
        self.timeout_seconds = timeout_seconds or settings.web_fetch_timeout_seconds
        self.max_bytes = max_bytes or settings.web_fetch_max_bytes
        self.max_redirects = settings.web_fetch_max_redirects if max_redirects is None else max_redirects
        self.retries = settings.web_fetch_retries if retries is None else retries
        self.resolver = resolver

    async def _read_response(self, response: httpx.Response, url: str) -> FetchedPage:
        if response.status_code < 200 or response.status_code >= 300:
            raise FetchError(f"HTTP status {response.status_code}")
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().casefold()
        if content_type not in {"text/html", "application/xhtml+xml", "text/plain"}:
            raise FetchError(f"unsupported content type: {content_type or 'missing'}")
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > self.max_bytes:
                raise FetchError("response exceeded the configured size limit")
        return FetchedPage(
            url=url,
            content_type=content_type,
            content=bytes(body),
            retrieved_at=datetime.now(timezone.utc).isoformat(),
        )

    async def fetch(self, url: str) -> FetchedPage:
        current = url
        for redirect_index in range(self.max_redirects + 1):
            validate_public_url(current, self.resolver)
            last_error: Exception | None = None
            for attempt in range(self.retries + 1):
                try:
                    if self._client is not None:
                        response = await self._client.get(
                            current,
                            follow_redirects=False,
                            timeout=self.timeout_seconds,
                            headers={"User-Agent": settings.web_fetch_user_agent},
                        )
                    else:
                        async with httpx.AsyncClient(
                            timeout=httpx.Timeout(self.timeout_seconds),
                            follow_redirects=False,
                        ) as client:
                            response = await client.get(
                                current,
                                headers={"User-Agent": settings.web_fetch_user_agent},
                            )
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise FetchError("redirect without location")
                        current = urljoin(current, location)
                        break
                    return await self._read_response(response, current)
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    last_error = exc
                    if attempt < self.retries:
                        await asyncio.sleep(0)
                        continue
                    raise FetchError(f"request failed: {exc}") from exc
            else:
                if last_error:
                    raise FetchError(str(last_error))
            if redirect_index >= self.max_redirects:
                raise FetchError("redirect limit exceeded")
            # A redirect was followed by the inner loop.
        raise FetchError("fetch failed")
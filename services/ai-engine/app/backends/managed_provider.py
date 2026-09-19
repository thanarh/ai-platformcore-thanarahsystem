"""Managed OpenAI-compatible provider for high-quality primary inference.

The adapter is intentionally provider-neutral. Credentials and endpoint/model names
come from server-side environment variables, while request, concurrency, and retry
limits protect the deployment from accidental overload and runaway usage.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque

import httpx

from app.backends.base import AIRequest, AIResponse
from app.backends.openai_compatible import OpenAICompatibleBackend


class ManagedProviderBackend(OpenAICompatibleBackend):
    """OpenAI-compatible backend with bounded concurrency and request quotas."""

    RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        daily_limit: int,
        rpm_limit: int,
        max_concurrency: int,
        max_retries: int,
        timeout_seconds: float,
        max_tokens_field: str,
        daily_budget_usd: float,
        input_price_per_million: float,
        output_price_per_million: float,
    ) -> None:
        super().__init__(
            backend_id="thanarah-advanced",
            name="ذكاء ثنارة المتقدم",
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout=httpx.Timeout(
                connect=10.0,
                read=timeout_seconds,
                write=30.0,
                pool=10.0,
            ),
            max_tokens_field=max_tokens_field,
            max_connections=max(4, max_concurrency * 2),
        )
        self.priority = 100
        self.daily_limit = max(1, daily_limit)
        self.rpm_limit = max(1, rpm_limit)
        self.max_retries = max(0, max_retries)
        self.daily_budget_usd = max(0.0, daily_budget_usd)
        self.input_price_per_million = max(0.0, input_price_per_million)
        self.output_price_per_million = max(0.0, output_price_per_million)
        self._semaphore = asyncio.Semaphore(max(1, max_concurrency))
        self._quota_lock = asyncio.Lock()
        self._day_started = time.strftime("%Y-%m-%d", time.gmtime())
        self._daily_used = 0
        self._daily_reserved_usd = 0.0
        self._recent_requests: deque[float] = deque()

    def _estimated_request_cost(self, request: AIRequest) -> float:
        input_chars = sum(len(str(message.get("content", ""))) for message in request.messages)
        estimated_input_tokens = max(1, input_chars // 4)
        estimated_output_tokens = max(1, request.max_tokens)
        one_attempt = (
            estimated_input_tokens * self.input_price_per_million
            + estimated_output_tokens * self.output_price_per_million
        ) / 1_000_000
        return one_attempt * (self.max_retries + 1)

    async def _reserve_request(self, request: AIRequest) -> None:
        async with self._quota_lock:
            today = time.strftime("%Y-%m-%d", time.gmtime())
            if today != self._day_started:
                self._day_started = today
                self._daily_used = 0
                self._daily_reserved_usd = 0.0
                self._recent_requests.clear()

            now = time.time()
            while self._recent_requests and now - self._recent_requests[0] >= 60:
                self._recent_requests.popleft()

            if self._daily_used >= self.daily_limit:
                raise RuntimeError("Thanarah Advanced daily request limit reached")
            if len(self._recent_requests) >= self.rpm_limit:
                raise RuntimeError("Thanarah Advanced per-minute request limit reached")

            estimated_cost = self._estimated_request_cost(request)
            if (
                self.daily_budget_usd > 0
                and self._daily_reserved_usd + estimated_cost > self.daily_budget_usd
            ):
                raise RuntimeError("Thanarah Advanced daily cost budget reached")

            self._daily_used += 1
            self._daily_reserved_usd += estimated_cost
            self._recent_requests.append(now)

    @classmethod
    def _retryable(cls, error: Exception) -> bool:
        if isinstance(error, (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout)):
            return True
        if isinstance(error, httpx.HTTPStatusError):
            return error.response.status_code in cls.RETRYABLE_STATUS_CODES
        return False

    async def chat(self, request: AIRequest) -> AIResponse:
        await self._reserve_request(request)
        async with self._semaphore:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await super().chat(request)
                    if not response.content.strip():
                        raise RuntimeError("Thanarah Advanced returned an empty response")
                    response.model = "thanarah-advanced"
                    response.backend = self.backend_id
                    return response
                except Exception as error:
                    if attempt >= self.max_retries or not self._retryable(error):
                        raise
                    await asyncio.sleep(0.5 * (2**attempt))
        raise RuntimeError("Thanarah Advanced request failed")

    async def stream_chat(self, request: AIRequest):
        await self._reserve_request(request)
        async with self._semaphore:
            for attempt in range(self.max_retries + 1):
                emitted = False
                try:
                    async for token in super().stream_chat(request):
                        if token:
                            emitted = True
                            yield token
                    if not emitted:
                        raise RuntimeError("Thanarah Advanced returned an empty stream")
                    return
                except Exception as error:
                    if emitted or attempt >= self.max_retries or not self._retryable(error):
                        raise
                    await asyncio.sleep(0.5 * (2**attempt))

    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update(
            {
                "type": "thanarah",
                "quota": {
                    "dailyLimit": self.daily_limit,
                    "dailyUsed": self._daily_used,
                    "rpmLimit": self.rpm_limit,
                    "remainingToday": max(0, self.daily_limit - self._daily_used),
                    "dailyBudgetUsd": self.daily_budget_usd,
                    "dailyReservedUsd": round(self._daily_reserved_usd, 6),
                },
            }
        )
        return data

    async def health_check(self):
        status = await super().health_check()
        if status.model:
            status.model = "thanarah-advanced"
        return status

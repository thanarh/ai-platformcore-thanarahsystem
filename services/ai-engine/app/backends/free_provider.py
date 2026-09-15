"""Quota-protected adapters for optional free inference providers.

The adapter deliberately fails closed when its local quota is exhausted. It never
falls through to a paid provider unless the global paid-provider switch is enabled.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Optional

from app.backends.base import AIRequest, AIResponse
from app.backends.openai_compatible import OpenAICompatibleBackend


class QuotaOpenAIBackend(OpenAICompatibleBackend):
    def __init__(
        self,
        backend_id: str,
        name: str,
        base_url: str,
        api_key: str,
        model: str,
        daily_limit: int,
        rpm_limit: int,
        timeout: int = 60,
    ):
        super().__init__(
            backend_id=backend_id,
            name=name,
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout=timeout,
        )
        self.daily_limit = max(1, daily_limit)
        self.rpm_limit = max(1, rpm_limit)
        self._day_started = time.strftime("%Y-%m-%d")
        self._daily_used = 0
        self._recent_requests: deque[float] = deque()
        self._quota_lock = asyncio.Lock()

    async def _reserve_quota(self) -> None:
        async with self._quota_lock:
            today = time.strftime("%Y-%m-%d")
            if today != self._day_started:
                self._day_started = today
                self._daily_used = 0
                self._recent_requests.clear()
            now = time.time()
            while self._recent_requests and now - self._recent_requests[0] >= 60:
                self._recent_requests.popleft()
            if self._daily_used >= self.daily_limit:
                raise RuntimeError(f"{self.name} daily free quota exhausted")
            if len(self._recent_requests) >= self.rpm_limit:
                raise RuntimeError(f"{self.name} free rate limit reached")
            self._daily_used += 1
            self._recent_requests.append(now)

    async def chat(self, request: AIRequest) -> AIResponse:
        await self._reserve_quota()
        return await super().chat(request)

    async def stream_chat(self, request: AIRequest):
        await self._reserve_quota()
        async for token in super().stream_chat(request):
            yield token

    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({
            "type": "free-external",
            "quota": {
                "dailyLimit": self.daily_limit,
                "dailyUsed": self._daily_used,
                "rpmLimit": self.rpm_limit,
                "remainingToday": max(0, self.daily_limit - self._daily_used),
            },
        })
        return data

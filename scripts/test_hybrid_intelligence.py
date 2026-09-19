#!/usr/bin/env python3
"""Fast regression checks for Thanarah hybrid intelligence features."""
from __future__ import annotations

import asyncio
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_ENGINE = os.path.join(ROOT, "services", "ai-engine")
if AI_ENGINE not in sys.path:
    sys.path.insert(0, AI_ENGINE)

os.environ.setdefault("MONGODB_URI", "")
os.environ.setdefault("RESPONSE_CACHE_ENABLED", "true")
os.environ.setdefault("RESPONSE_CACHE_SEMANTIC_ENABLED", "true")

from app.backends.managed_provider import ManagedProviderBackend
from app.backends.base import AIRequest
from app.backends.ollama import OllamaBackend
from app.memory.daily_learning import daily_learning_service
from app.models.chat import ChatRequest, ChatResponse
from app.response_cache import response_cache_service


def request(*, tenant: str = "tenant-a", user: str = "user-a", medical: bool = False) -> ChatRequest:
    return ChatRequest(
        tenantId=tenant,
        userId=user,
        messages=[{"role": "user", "content": "اشرح سياسة الإجازات الخاصة بنا"}],
        tenantConfig={
            "industry": "healthcare",
            "medicalMode": {
                "enabled": medical,
                "configuredByAdmin": medical,
            },
            "responseProfile": "fast",
            "ragEnabled": True,
            "memoryEnabled": True,
        },
    )


async def check_cache() -> None:
    response_cache_service._memory.clear()
    source = request()
    answer = ChatResponse(content="الإجابة المعتمدة", backend="thanarah-local")
    await response_cache_service.store(source, answer)
    assert (await response_cache_service.get(source)).content == "الإجابة المعتمدة"
    assert await response_cache_service.get(request(user="user-b")) is None
    assert await response_cache_service.get(request(tenant="tenant-b")) is None
    assert await response_cache_service.get(request(medical=True)) is None


def check_dialect() -> None:
    egyptian = daily_learning_service._dialect_scores("هلا ازيك عامل ايه دلوقتي أنا عايز أعرف")
    gulf = daily_learning_service._dialect_scores("هلا شلونك وش أخبارك أبي أعرف")
    assert egyptian["egyptian"] > egyptian["gulf"]
    assert gulf["gulf"] > gulf["egyptian"]
    assert daily_learning_service._language("مرحبا كيف الحال") == "ar"
    assert daily_learning_service._language("Hello, how are you?") == "multilingual"


def check_branding_and_keepalive() -> None:
    local = OllamaBackend()
    local.default_model = "internal-model"
    public = local.to_dict()
    assert public["name"] == "ذكاء ثنارة المحلي"
    assert public["model"] == "thanarah-local"
    assert "engine" not in public and "baseUrl" not in public

    managed = ManagedProviderBackend(
        base_url="https://example.invalid/v1",
        api_key="test-only",
        model="internal-model",
        daily_limit=100,
        rpm_limit=10,
        max_concurrency=2,
        max_retries=1,
        timeout_seconds=5,
        max_tokens_field="max_tokens",
        daily_budget_usd=1,
        input_price_per_million=1,
        output_price_per_million=1,
    )
    details = managed.to_dict()
    assert details["name"] == "ذكاء ثنارة المتقدم"
    assert details["type"] == "thanarah"
    assert "baseUrl" not in details and "model" not in details


async def check_local_concurrency_isolation() -> None:
    backend = OllamaBackend()
    backend.default_model = "internal-model"
    active = 0
    maximum = 0

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"message": {"content": "رد ثنارة"}, "eval_count": 2}

    class FakeClient:
        async def post(self, *_args, **_kwargs):
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            await asyncio.sleep(0.03)
            active -= 1
            return FakeResponse()

    fake = FakeClient()
    backend._get_client = lambda: fake
    request_payload = AIRequest(messages=[{"role": "user", "content": "اختبار"}], max_tokens=32)
    responses = await asyncio.gather(*(backend.chat(request_payload) for _ in range(4)))
    assert maximum == 1
    assert all(response.content == "رد ثنارة" for response in responses)


async def main() -> None:
    check_dialect()
    check_branding_and_keepalive()
    await check_cache()
    await check_local_concurrency_isolation()
    print("HYBRID_INTELLIGENCE_TEST_OK")


if __name__ == "__main__":
    asyncio.run(main())

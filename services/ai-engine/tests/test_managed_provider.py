import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.backends.base import AIRequest
from app.backends.managed_provider import ManagedProviderBackend
from app.backends.registry import BackendRegistry
from app.config import settings
from app.models.chat import ChatRequest, RouteDecision
from app.router.intelligence_router import IntelligenceRouter


class FakeUsageCollection:
    def __init__(self):
        self.documents = {}

    async def update_one(self, query, update, upsert=False):
        usage_id = query["_id"]
        if usage_id not in self.documents and upsert:
            self.documents[usage_id] = {
                "_id": usage_id,
                **update["$setOnInsert"],
            }

    async def find_one_and_update(self, query, update, return_document=None):
        document = self.documents.get(query["_id"])
        if document is None:
            return None

        expressions = query["$expr"]["$and"]
        request_limit = expressions[0]["$lt"][1]
        increments = update["$inc"]
        next_requests = document["requests"] + increments["requests"]
        next_reserved = document["reservedUsd"] + increments["reservedUsd"]
        if next_requests > request_limit:
            return None
        if len(expressions) > 1 and next_reserved > expressions[1]["$lte"][1]:
            return None

        document["requests"] = next_requests
        document["reservedUsd"] = next_reserved
        document.update(update["$set"])
        return dict(document)


def make_provider(*, daily_budget=0.25, daily_limit=10):
    return ManagedProviderBackend(
        base_url="https://api.openai.com/v1",
        api_key="test-key",
        model="gpt-4.1-nano",
        daily_limit=daily_limit,
        rpm_limit=20,
        max_concurrency=2,
        max_retries=0,
        timeout_seconds=3,
        max_tokens_field="max_completion_tokens",
        daily_budget_usd=daily_budget,
        input_price_per_million=1.0,
        output_price_per_million=4.0,
    )


class ManagedProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_general_chat_skips_library_retrieval(self):
        request = ChatRequest(
            messages=[{"role": "user", "content": "اكتب تهنئة قصيرة لصديق بدأ مشروعًا."}],
        )
        self.assertFalse(IntelligenceRouter._should_retrieve_knowledge(request))

    def test_organization_and_document_questions_use_library_retrieval(self):
        organization_request = ChatRequest(
            messages=[{"role": "user", "content": "ما سياسة الاسترجاع في شركتنا؟"}],
        )
        document_request = ChatRequest(
            messages=[{"role": "user", "content": "لخص الملف المرفق."}],
        )
        self.assertTrue(IntelligenceRouter._should_retrieve_knowledge(organization_request))
        self.assertTrue(IntelligenceRouter._should_retrieve_knowledge(document_request))

    def test_unanswered_web_evidence_stays_on_local_backend(self):
        local_backend = SimpleNamespace(
            backend_id="thanarah-local",
            default_model="local-model",
            enabled=True,
        )
        registry = SimpleNamespace(
            get=lambda backend_id: local_backend if backend_id == "thanarah-local" else None
        )
        router = IntelligenceRouter(registry=registry)
        route = RouteDecision(
            backend_id="thanarah-advanced",
            reason="default",
            rag_enabled=True,
            fallback_order=["thanarah-local", "fallback"],
        )

        grounded_route = router._prefer_local_for_web_evidence(
            route,
            SimpleNamespace(sources=[{"id": "public-source"}]),
        )

        self.assertEqual(grounded_route.backend_id, "thanarah-local")
        self.assertEqual(grounded_route.model, "local-model")
        self.assertEqual(grounded_route.fallback_order, ["fallback"])

    def test_gpt5_payload_uses_compatible_fast_settings(self):
        provider = make_provider()
        request = AIRequest(
            messages=[{"role": "user", "content": "hello"}],
            model="gpt-5-nano",
            max_tokens=20,
            temperature=0.4,
        )

        payload = provider._payload(request, stream=True)

        self.assertEqual(payload["max_completion_tokens"], 20)
        self.assertNotIn("temperature", payload)
        self.assertEqual(payload["reasoning_effort"], "minimal")

    def test_router_builds_external_payload_from_only_approved_sources(self):
        router = IntelligenceRouter(registry=SimpleNamespace())
        chat_request = ChatRequest(
            messages=[{"role": "user", "content": "What does our policy say?"}],
            tenantConfig={
                "systemPrompt": "PRIVATE TENANT INSTRUCTIONS",
                "contextProfile": {"userContext": {"preferredResponseStyle": "PRIVATE"}},
            },
            conversationSummary="PRIVATE SUMMARY",
        )
        route = RouteDecision(
            backend_id="thanarah-advanced",
            reason="test",
            rag_enabled=True,
        )

        request = router._build_ai_request(
            chat_request,
            route,
            context="PRIVATE MIXED LOCAL CONTEXT",
            rag_results=[
                {
                    "content": "The return period is 30 days.",
                    "sourceId": "private-document-id",
                }
            ],
        )
        approved = ManagedProviderBackend._approved_request(request)

        self.assertEqual(approved.context, "[مقتطف معرفة]\nThe return period is 30 days.")
        self.assertIn("What does our policy say?", approved.messages[-1]["content"])
        self.assertNotIn("PRIVATE", approved.system_prompt)
        self.assertNotIn("PRIVATE", approved.context)
        self.assertNotIn("private-document-id", approved.context)

    def test_external_request_contains_only_approved_fields(self):
        request = AIRequest(
            messages=[
                {"role": "system", "content": "tenant system prompt"},
                {"role": "user", "content": "old question"},
                {"role": "assistant", "content": "old answer"},
                {"role": "user", "content": "latest question"},
            ],
            system_prompt="private custom prompt",
            context="private memory and profile",
            external_system_prompt="safe public prompt",
            external_context="approved library excerpt",
        )

        approved = ManagedProviderBackend._approved_request(request)

        self.assertEqual(
            approved.messages,
            [
                {"role": "user", "content": "old question"},
                {"role": "assistant", "content": "old answer"},
                {"role": "user", "content": "latest question"},
            ],
        )
        self.assertEqual(approved.system_prompt, "safe public prompt")
        self.assertEqual(approved.context, "approved library excerpt")
        self.assertNotIn("private", approved.system_prompt)
        self.assertNotIn("private", approved.context)

    def test_cost_estimate_counts_system_and_retrieved_context(self):
        provider = make_provider()
        request = AIRequest(
            messages=[{"role": "user", "content": "hi"}],
            system_prompt="safe",
            context="library",
            max_tokens=2,
        )

        # 3 input tokens (13 characters / 4) at $1/M plus 2 output
        # tokens at $4/M.
        self.assertAlmostEqual(
            provider._estimated_request_cost(request),
            0.000011,
        )

    async def test_persistent_daily_budget_is_shared_across_instances(self):
        collection = FakeUsageCollection()
        database = SimpleNamespace(ai_managed_provider_usage=collection)
        request = AIRequest(
            messages=[{"role": "user", "content": "hi"}],
            system_prompt="safe",
            context="library",
            max_tokens=2,
        )
        first = make_provider(daily_budget=0.000015)
        second = make_provider(daily_budget=0.000015)

        with patch("app.backends.managed_provider.get_db", return_value=database):
            await first._reserve_request(request)
            with self.assertRaisesRegex(RuntimeError, "limit reached"):
                await second._reserve_request(request)

        self.assertEqual(len(collection.documents), 1)
        usage = next(iter(collection.documents.values()))
        self.assertEqual(usage["requests"], 1)

    async def test_hosted_provider_fails_closed_without_usage_database(self):
        provider = make_provider()
        with patch("app.backends.managed_provider.get_db", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "ledger is unavailable"):
                await provider._reserve_request(AIRequest(messages=[{"role": "user", "content": "hello"}]))

    async def test_existing_openai_secret_can_enable_managed_backend(self):
        registry = BackendRegistry()
        with (
            patch.object(settings, "external_ai_enabled", True),
            patch.object(settings, "external_ai_api_key", None),
            patch.object(settings, "openai_api_key", "test-key"),
            patch.object(settings, "external_ai_model", "gpt-4.1-nano"),
            patch.object(settings, "local_ai_enabled", False),
        ):
            await registry.initialize()

        backend = registry.get("thanarah-advanced")
        self.assertIsNotNone(backend)
        self.assertEqual(backend.api_key, "test-key")
        self.assertEqual(backend.default_model, "gpt-4.1-nano")


if __name__ == "__main__":
    unittest.main()

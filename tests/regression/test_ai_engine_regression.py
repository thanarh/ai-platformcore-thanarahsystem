"""Focused AI-engine regression tests.

These tests intentionally use only the Python standard library test runner.
MongoDB, Ollama, and external providers are replaced with small fakes.
Run with:

    python -m unittest discover -s tests/regression -p 'test_*.py'
"""

from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.models.chat import ChatMessage, ChatRequest, ChatResponse, RouteDecision
from app.memory.service import MemoryService
from app.response_cache import ResponseCacheService
from app.rag.pipeline import RAGPipeline
from app.router.intelligence_router import IntelligenceRouter
from app.routers.chat import chat_stream


class _Backend:
    backend_id = "fake-local"
    name = "Fake local"
    priority = 10
    enabled = True
    default_model = "fake-model"


class _Registry:
    def get_by_priority(self):
        return [_Backend()]

    def get(self, backend_id):
        return _Backend() if backend_id == "fake-local" else None


class _FakeRouter:
    async def stream_route(self, request):
        async def tokens():
            yield "أول"
            yield " رد"

        telemetry = SimpleNamespace(
            request_id="test-request",
            values={},
            finish=lambda **_kwargs: {},
        )
        return (
            tokens(),
            RouteDecision(
                backend_id="fake-local",
                reason="test",
                fallback_order=[],
            ),
            [],
            telemetry,
        )


class _FakeRequest:
    app = SimpleNamespace(state=SimpleNamespace(intelligence_router=_FakeRouter()))

    async def is_disconnected(self):
        return False


class _FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, length=None):
        return self.documents[:length] if length else self.documents


class _FakeKnowledgeCollection:
    def __init__(self, documents):
        self.documents = documents
        self.last_query = None

    def find(self, query, *_args, **_kwargs):
        self.last_query = query
        return _FakeCursor(
            [document for document in self.documents if document["tenantId"] == query["tenantId"]]
        )


class AIEngineRegressionTests(unittest.IsolatedAsyncioTestCase):
    def test_chat_contract_has_required_multitenant_fields(self):
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="hello")],
            tenantId="tenant-a",
            userId="user-a",
            stream=True,
        )

        self.assertEqual(request.tenantId, "tenant-a")
        self.assertEqual(request.userId, "user-a")
        self.assertTrue(request.stream)
        self.assertEqual(request.messages[0].role, "user")

    def test_history_is_bounded_and_keeps_latest_messages(self):
        router = IntelligenceRouter(_Registry())
        request = ChatRequest(
            messages=[
                ChatMessage(role="user", content=f"old-{i}")
                for i in range(7)
            ],
            tenantConfig={"historyWindow": 4, "maxHistoryChars": 40},
        )

        trimmed = router._trim_messages(request)

        self.assertLessEqual(len(trimmed), 4)
        self.assertEqual(trimmed[-1]["content"], "old-6")
        self.assertLessEqual(sum(len(item["content"]) for item in trimmed), 40)

    async def test_memory_isolated_by_tenant_and_user(self):
        service = MemoryService()
        service._cache.clear()

        with patch("app.memory.service.get_db", return_value=None):
            await service.remember("tenant-a", "user-a", "clinic hours", "9 to 5")
            await service.remember("tenant-b", "user-b", "clinic hours", "10 to 6")

            tenant_a = await service.recall("tenant-a", "clinic hours", user_id="user-a")
            tenant_b = await service.recall("tenant-b", "clinic hours", user_id="user-b")
            cross_tenant = await service.recall("tenant-a", "clinic hours", user_id="user-b")

        self.assertEqual([item["answer"] for item in tenant_a], ["9 to 5"])
        self.assertEqual([item["answer"] for item in tenant_b], ["10 to 6"])
        self.assertEqual(cross_tenant, [])

    async def test_cache_key_and_storage_never_cross_tenants(self):
        cache = ResponseCacheService()
        first = ChatRequest(
            messages=[ChatMessage(role="user", content="What are the hours?")],
            tenantId="tenant-a",
            userId="user-a",
            tenantConfig={"ragEnabled": False, "memoryEnabled": False},
        )
        other_tenant = first.model_copy(update={"tenantId": "tenant-b"})
        response = ChatResponse(content="9 to 5", backend="fake-local")

        self.assertNotEqual(cache.key(first), cache.key(other_tenant))
        with patch("app.response_cache.get_db", return_value=None):
            await cache.store(first, response)
            self.assertIsNotNone(await cache.get(first))
            self.assertIsNone(await cache.get(other_tenant))

    async def test_cache_reuses_exact_requests_only(self):
        cache = ResponseCacheService()
        exact = ChatRequest(
            messages=[ChatMessage(role="user", content="Explain readiness probes")],
            tenantId="tenant-a",
            userId="user-a",
            tenantConfig={"ragEnabled": False, "memoryEnabled": False},
        )
        similar = exact.model_copy(
            update={
                "messages": [
                    ChatMessage(role="user", content="Please explain a readiness probe")
                ]
            }
        )
        response = ChatResponse(content="exact answer", backend="fake-local")

        with patch("app.response_cache.get_db", return_value=None):
            await cache.store(exact, response)
            self.assertIsNotNone(await cache.get(exact))
            self.assertIsNone(await cache.get(similar))

    async def test_cache_is_bypassed_for_mutable_rag_or_memory_context(self):
        cache = ResponseCacheService()
        response = ChatResponse(content="context-dependent answer", backend="fake-local")
        rag_request = ChatRequest(
            messages=[ChatMessage(role="user", content="What changed?")],
            tenantId="tenant-a",
            userId="user-a",
            tenantConfig={"ragEnabled": True, "memoryEnabled": False},
        )
        memory_request = rag_request.model_copy(
            update={"tenantConfig": {"ragEnabled": False, "memoryEnabled": True}}
        )

        with patch("app.response_cache.get_db", return_value=None):
            await cache.store(rag_request, response)
            await cache.store(memory_request, response)
            self.assertIsNone(await cache.get(rag_request))
            self.assertIsNone(await cache.get(memory_request))

    async def test_rag_retrieval_is_tenant_scoped(self):
        collection = _FakeKnowledgeCollection(
            [
                {
                    "tenantId": "tenant-a",
                    "sourceId": "source-a",
                    "content": "clinic hours are nine to five",
                    "embedding": [1.0, 0.0],
                    "chunkIndex": 0,
                },
                {
                    "tenantId": "tenant-b",
                    "sourceId": "source-b",
                    "content": "private tenant b content",
                    "embedding": [1.0, 0.0],
                    "chunkIndex": 0,
                },
            ]
        )
        fake_db = SimpleNamespace(knowledge_chunks=collection)
        pipeline = RAGPipeline.__new__(RAGPipeline)
        pipeline.embedder = SimpleNamespace(encode=lambda _text: [1.0, 0.0])

        with patch("app.rag.pipeline.get_db", return_value=fake_db):
            results = await pipeline.retrieve("tenant-a", "clinic hours", limit=5)

        self.assertEqual(collection.last_query, {"tenantId": "tenant-a"})
        self.assertEqual([result["sourceId"] for result in results], ["source-a"])
        self.assertNotIn("tenant-b", str(results))

    async def test_stream_endpoint_emits_incremental_sse_and_done(self):
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="reply")],
            tenantId="tenant-a",
            userId="user-a",
            stream=True,
        )

        with patch("app.routers.chat.memory_service.remember", return_value=None):
            response = await chat_stream(_FakeRequest(), request)
            chunks = [
                chunk.decode() if isinstance(chunk, bytes) else chunk
                async for chunk in response.body_iterator
            ]

        payload = "".join(chunks)
        self.assertIn(r'data: {"delta": "\u0623\u0648\u0644"}', payload)
        self.assertIn(r'data: {"delta": " \u0631\u062f"}', payload)
        self.assertIn("data: [DONE]", payload)
        self.assertLess(
            payload.index(r'data: {"delta": "\u0623\u0648\u0644"}'),
            payload.index("data: [DONE]"),
        )

import json
import unittest
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, PropertyMock, patch

import httpx

from app.config import settings
from app.web_intelligence.fetcher import FetchedPage
from app.models.chat import ChatMessage, ChatRequest, RouteDecision
from app.router.intelligence_router import IntelligenceRouter
from app.web_intelligence.openai_search import (
    OpenAIWebAnswer,
    OpenAIWebSearchProvider,
    openai_web_search_provider,
)
from app.web_intelligence.pipeline import WebIntelligencePipeline, WebPipelineResult
from app.web_intelligence.decision import WebDecision
from app.web_intelligence.search import SearchResult


def cited_response(*, url="https://example.com/report", status="completed"):
    marker = " citeturn0search0"
    text = "أعلنت الجهة النتيجة اليوم." + marker
    return {
        "status": status,
        "model": "gpt-6-luna",
        "usage": {"input_tokens": 1200, "output_tokens": 50},
        "output": [
            {
                "type": "web_search_call",
                "action": {"type": "search", "query": "النتيجة"},
            },
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": text,
                        "annotations": [
                            {
                                "type": "url_citation",
                                "start_index": len(text) - len(marker),
                                "end_index": len(text),
                                "url": url,
                                "title": "النتيجة الرسمية",
                            }
                        ],
                    }
                ],
            },
        ],
    }


class FakeCollection:
    def __init__(self, *, update_result=None, document=None):
        self.update_result = update_result or SimpleNamespace(modified_count=1, upserted_id=None)
        self.document = document
        self.update_one = AsyncMock(return_value=self.update_result)
        self.find_one = AsyncMock(return_value=document)


class OpenAIWebSearchTests(unittest.IsolatedAsyncioTestCase):
    def test_parses_arabic_answer_and_only_annotated_https_sources(self):
        answer = OpenAIWebSearchProvider._parse_response(
            cited_response(),
            query="النتيجة",
            tenant_id="tenant-a",
            user_id="user-a",
            conversation_id="conversation-a",
        )

        self.assertIsNotNone(answer)
        self.assertIn("[source-1]", answer.answer)
        self.assertEqual(answer.sources[0]["url"], "https://example.com/report")
        self.assertEqual(answer.sources[0]["source"], "openai_web_search")
        self.assertEqual(answer.model, "gpt-6-luna")
        self.assertEqual(answer.input_tokens, 1200)

    def test_rejects_responses_without_search_or_safe_citations(self):
        no_search = cited_response()
        no_search["output"][0]["action"]["type"] = "open_page"
        unsafe = cited_response(url="https://127.0.0.1/private")

        self.assertIsNone(
            OpenAIWebSearchProvider._parse_response(
                no_search, query="x", tenant_id="t", user_id=None, conversation_id=None
            )
        )
        self.assertIsNone(
            OpenAIWebSearchProvider._parse_response(
                unsafe, query="x", tenant_id="t", user_id=None, conversation_id=None
            )
        )
        self.assertIsNone(OpenAIWebSearchProvider._safe_citation_url("https://127.1/private"))

    def test_context_cache_requires_reliable_rag_and_memory_versions(self):
        self.assertFalse(OpenAIWebSearchProvider._cache_allowed({}))
        self.assertFalse(
            OpenAIWebSearchProvider._cache_allowed(
                {"ragEnabled": False, "memoryEnabled": True}
            )
        )
        self.assertTrue(
            OpenAIWebSearchProvider._cache_allowed(
                {"ragEnabled": False, "memoryEnabled": False}
            )
        )
        self.assertTrue(
            OpenAIWebSearchProvider._cache_allowed(
                {
                    "ragEnabled": True,
                    "memoryEnabled": True,
                    "knowledgeVersion": "k3",
                    "memoryVersion": "m8",
                }
            )
        )

    def test_cache_key_is_scoped_by_tenant_user_query_and_settings(self):
        common = {
            "query": "latest report",
            "tenant_id": "tenant-a",
            "user_id": "user-a",
            "language": "en",
            "region": None,
            "as_of_date": "2026-11-15",
            "timezone_name": "UTC",
            "tenant_config": {"ragEnabled": False, "memoryEnabled": False},
        }
        key = OpenAIWebSearchProvider._cache_key(**common)
        self.assertNotEqual(
            key,
            OpenAIWebSearchProvider._cache_key(**{**common, "tenant_id": "tenant-b"}),
        )
        self.assertNotEqual(
            key,
            OpenAIWebSearchProvider._cache_key(**{**common, "user_id": "user-b"}),
        )
        self.assertNotEqual(
            key,
            OpenAIWebSearchProvider._cache_key(**{**common, "as_of_date": "2026-11-16"}),
        )
        self.assertNotEqual(
            key,
            OpenAIWebSearchProvider._cache_key(
                **{
                    **common,
                    "tenant_config": {
                        "ragEnabled": False,
                        "memoryEnabled": False,
                        "knowledgeVersion": "changed",
                    },
                }
            ),
        )
        runtime_context = {
            "ragEnabled": False,
            "memoryEnabled": False,
            "runtimeContext": {
                "timezone": "Asia/Riyadh",
                "currentDate": "2026-11-15",
                "currentTime": "10:00",
            },
        }
        runtime_key = OpenAIWebSearchProvider._cache_key(
            **{**common, "tenant_config": runtime_context}
        )
        self.assertEqual(
            runtime_key,
            OpenAIWebSearchProvider._cache_key(
                **{
                    **common,
                    "tenant_config": {
                        **runtime_context,
                        "runtimeContext": {
                            **runtime_context["runtimeContext"],
                            "currentTime": "10:01",
                        },
                    },
                }
            ),
        )

    async def test_persistent_cache_requires_unexpired_tenant_key_and_rebinds_identity(self):
        document = {
            "answer": "جواب [source-1]",
            "sources": [
                {
                    "id": "source-1",
                    "title": "مصدر",
                    "url": "https://example.com",
                    "tenantId": "tenant-a",
                }
            ],
            "model": "gpt-6-luna",
            "expiresAt": datetime.now(timezone.utc) + timedelta(seconds=60),
        }
        cache = FakeCollection(document=document)
        fake_db = SimpleNamespace(ai_openai_web_search_cache=cache)
        provider = OpenAIWebSearchProvider()
        with patch("app.web_intelligence.openai_search.get_db", return_value=fake_db):
            answer = await provider._cache_get("key-a", "tenant-a", "user-b", "conversation-b")

        self.assertIsNotNone(answer)
        self.assertTrue(answer.cache_hit)
        self.assertEqual(answer.sources[0]["userId"], "user-b")
        self.assertEqual(answer.sources[0]["conversationId"], "conversation-b")
        query = cache.find_one.await_args.args[0]
        self.assertEqual(query["tenantId"], "tenant-a")
        self.assertGreater(query["expiresAt"]["$gt"], datetime.now(timezone.utc) - timedelta(seconds=1))

    async def test_requests_one_short_search_and_returns_cited_answer(self):
        request_json = {}
        request_auth = {}

        async def handler(request):
            request_json.update(json.loads(request.content))
            request_auth["authorization"] = request.headers.get("authorization")
            return httpx.Response(200, json=cited_response())

        fake_db = SimpleNamespace(
            ai_openai_web_search_usage=FakeCollection(),
            ai_openai_web_search_cache=FakeCollection(),
        )
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            provider = OpenAIWebSearchProvider(client=http)
            with (
                patch.object(settings, "web_search_enabled", True),
                patch.object(settings, "openai_web_search_enabled", True),
                patch.object(settings, "openai_api_key", "test-key-not-a-real-secret"),
                patch("app.web_intelligence.openai_search.get_db", return_value=fake_db),
            ):
                answer = await provider.search(
                    "ما آخر نتائج التقرير؟",
                    tenant_id="tenant-a",
                    user_id="user-a",
                    conversation_id="conversation-a",
                    language="ar",
                    region=None,
                    as_of_date="2026-11-15",
                    timezone_name="Asia/Riyadh",
                    tenant_config={"ragEnabled": False, "memoryEnabled": False},
                )

        self.assertIsNotNone(answer)
        self.assertEqual(request_auth["authorization"], "Bearer test-key-not-a-real-secret")
        self.assertEqual(request_json["model"], "gpt-6-luna")
        self.assertEqual(request_json["tools"], [{"type": "web_search", "search_context_size": "low"}])
        self.assertEqual(request_json["max_tool_calls"], 1)
        self.assertEqual(request_json["max_output_tokens"], settings.openai_web_search_max_output_tokens)
        self.assertFalse(request_json["store"])
        self.assertIn("[source-1]", answer.answer)
        self.assertEqual(fake_db.ai_openai_web_search_usage.update_one.await_count, 2)
        self.assertEqual(fake_db.ai_openai_web_search_cache.update_one.await_count, 1)

    async def test_daily_quota_fails_closed_without_calling_openai(self):
        transport_calls = 0

        async def handler(_request):
            nonlocal transport_calls
            transport_calls += 1
            return httpx.Response(200, json=cited_response())

        exhausted = FakeCollection(
            update_result=SimpleNamespace(modified_count=0, upserted_id=None)
        )
        fake_db = SimpleNamespace(
            ai_openai_web_search_usage=exhausted,
            ai_openai_web_search_cache=FakeCollection(),
        )
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            provider = OpenAIWebSearchProvider(client=http)
            with (
                patch.object(settings, "web_search_enabled", True),
                patch.object(settings, "openai_web_search_enabled", True),
                patch.object(settings, "openai_api_key", "test-key"),
                patch("app.web_intelligence.openai_search.get_db", return_value=fake_db),
            ):
                answer = await provider.search(
                    "latest facts",
                    tenant_id="tenant-a",
                    user_id="user-a",
                    conversation_id=None,
                    language="en",
                    region=None,
                    as_of_date=None,
                    timezone_name="UTC",
                    tenant_config={},
                )
        self.assertIsNone(answer)
        self.assertEqual(transport_calls, 0)

    async def test_budget_below_one_reserved_search_is_rejected(self):
        provider = OpenAIWebSearchProvider()
        collection = FakeCollection()
        fake_db = SimpleNamespace(ai_openai_web_search_usage=collection)
        with (
            patch.object(settings, "openai_web_search_daily_budget_usd", 0.01),
            patch.object(settings, "openai_web_search_reservation_usd", 0.03),
            patch("app.web_intelligence.openai_search.get_db", return_value=fake_db),
        ):
            allowed = await provider._reserve_daily_budget("2026-11-15")
        self.assertFalse(allowed)
        collection.update_one.assert_not_awaited()

    async def test_pipeline_uses_openai_first_and_returns_only_its_cited_sources(self):
        answer = OpenAIWebAnswer(
            answer="تحديث حديث [source-1]",
            sources=[
                {
                    "id": "source-1",
                    "title": "مصدر حديث",
                    "url": "https://example.com/news",
                    "domain": "example.com",
                    "source": "openai_web_search",
                }
            ],
            model="gpt-6-luna",
        )
        search_client = SimpleNamespace(search=AsyncMock())
        pipeline = WebIntelligencePipeline(search_client=search_client)
        with (
            patch.object(settings, "web_search_enabled", True),
            patch.object(
                type(openai_web_search_provider),
                "enabled",
                new_callable=PropertyMock,
                return_value=True,
            ),
            patch.object(
                openai_web_search_provider,
                "search",
                new_callable=AsyncMock,
                return_value=answer,
            ) as openai_search,
        ):
            result = await pipeline.run(
                "ابحث في الويب عن تعريف الذكاء الاصطناعي",
                tenant_id="tenant-a",
                user_id="user-a",
                conversation_id="conversation-a",
                tenant_config={"ragEnabled": False, "memoryEnabled": False},
                language="ar",
                explicit_request=True,
            )

        self.assertEqual(result.answer, "تحديث حديث [source-1]")
        self.assertEqual(result.sources[0]["source"], "openai_web_search")
        openai_search.assert_awaited_once()
        search_client.search.assert_not_awaited()

    async def test_pipeline_falls_back_to_searxng_when_openai_has_no_cited_result(self):
        result_from_search = SearchResult(
            title="Python release notes",
            url="https://example.com/python-release-notes",
            snippet="Python release notes and changes",
            source="searxng",
            rank=1,
            search_topics=("Python release notes",),
        )

        class StaticSearch:
            async def search(self, *_args, **_kwargs):
                return [result_from_search]

        class StaticFetcher:
            async def fetch(self, url):
                return FetchedPage(
                    url=url,
                    content_type="text/html",
                    content=b"<html><title>Python release notes</title><body>Release details and changes.</body></html>",
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                )

        pipeline = WebIntelligencePipeline(
            search_client=StaticSearch(),
            fetcher=StaticFetcher(),
        )

        async def keep_candidates(_query, candidates, limit):
            return candidates[:limit]

        with (
            patch.object(settings, "web_search_enabled", True),
            patch.object(
                type(openai_web_search_provider),
                "enabled",
                new_callable=PropertyMock,
                return_value=True,
            ),
            patch.object(
                openai_web_search_provider,
                "search",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.web_intelligence.pipeline.local_reranker.rerank",
                new_callable=AsyncMock,
                side_effect=keep_candidates,
            ),
        ):
            result = await pipeline.run(
                "Search online for Python release notes",
                tenant_id="tenant-a",
                user_id="user-a",
                conversation_id="conversation-a",
                tenant_config={},
                language="en",
                explicit_request=True,
            )

        self.assertIsNone(result.answer)
        self.assertEqual(len(result.sources), 1)
        self.assertEqual(result.sources[0]["source"], "searxng")
        self.assertIn("Python release notes", result.context)

    async def test_api_failure_does_not_log_secret(self):
        async def handler(_request):
            return httpx.Response(503, json={"message": "provider unavailable"})

        fake_db = SimpleNamespace(
            ai_openai_web_search_usage=FakeCollection(),
            ai_openai_web_search_cache=FakeCollection(),
        )
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            provider = OpenAIWebSearchProvider(client=http)
            with (
                patch.object(settings, "web_search_enabled", True),
                patch.object(settings, "openai_web_search_enabled", True),
                patch.object(settings, "openai_api_key", "test-secret-value"),
                patch("app.web_intelligence.openai_search.get_db", return_value=fake_db),
                self.assertLogs("app.web_intelligence.openai_search", level="WARNING") as logs,
            ):
                answer = await provider.search(
                    "latest facts",
                    tenant_id="tenant-a",
                    user_id=None,
                    conversation_id=None,
                    language="en",
                    region=None,
                    as_of_date=None,
                    timezone_name="UTC",
                    tenant_config={},
                )
        self.assertIsNone(answer)
        self.assertNotIn("test-secret-value", "\n".join(logs.output))

    async def test_openai_result_is_used_directly_and_streamed_with_source_links(self):
        sources = [
            {
                "id": "source-1",
                "title": "النتيجة الرسمية",
                "url": "https://example.com/report",
                "domain": "example.com",
            }
        ]
        web_result = WebPipelineResult(
            decision=WebDecision(True, "explicit_search_request", ("explicit_search_request",), "general"),
            answer="النتيجة معلنة [source-1]",
            answer_model="gpt-6-luna",
            answer_input_tokens=30,
            answer_output_tokens=10,
            sources=sources,
        )
        router = IntelligenceRouter(registry=None)
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ابحث في الويب عن آخر تقرير")],
            tenantId="tenant-a",
            userId="user-a",
            conversationId="conversation-a",
            runtimeContext={"language": "ar"},
            stream=False,
        )
        stream_request = request.model_copy(update={"stream": True})
        route = RouteDecision(backend_id="local", reason="test", fallback_order=[])

        def enable_router_mocks(stack):
            stack.enter_context(patch.object(router, "_decide_route", return_value=route))
            stack.enter_context(
                patch.object(
                    router,
                    "_load_context_sources",
                    new_callable=AsyncMock,
                    return_value=([], [], None),
                )
            )
            stack.enter_context(
                patch(
                    "app.router.intelligence_router.web_intelligence_pipeline.run",
                    new_callable=AsyncMock,
                    return_value=web_result,
                )
            )
            stack.enter_context(
                patch(
                    "app.router.intelligence_router.response_cache_service.get",
                    new_callable=AsyncMock,
                    return_value=None,
                )
            )
            stack.enter_context(
                patch(
                    "app.router.intelligence_router.daily_learning_service.profile",
                    new_callable=AsyncMock,
                    return_value=None,
                )
            )

        with ExitStack() as stack:
            enable_router_mocks(stack)
            response = await router.route(request)
            self.assertEqual(response.backend, "openai-web-search")
            self.assertEqual(response.model, "gpt-6-luna")
            self.assertIn("https://example.com/report", response.content)

        with ExitStack() as stack:
            enable_router_mocks(stack)
            stream, stream_route, sources_out, _telemetry, _events = await router.stream_route(
                stream_request
            )
            answer = "".join([token async for token in stream])
        self.assertEqual(stream_route.backend_id, "openai-web-search")
        self.assertEqual(sources_out[0]["url"], "https://example.com/report")
        self.assertIn("المصادر", answer)
        self.assertIn("[source-1]", answer)


if __name__ == "__main__":
    unittest.main()

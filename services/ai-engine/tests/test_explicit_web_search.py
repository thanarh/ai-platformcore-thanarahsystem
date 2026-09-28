import unittest
from unittest.mock import AsyncMock, patch

from app.models.chat import ChatMessage, ChatRequest, RouteDecision
from app.router.intelligence_router import IntelligenceRouter
from app.web_intelligence.decision import WebDecision
from app.web_intelligence.pipeline import WebPipelineResult


class ExplicitWebSearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_selected_chat_skill_reaches_the_search_pipeline_as_explicit(self):
        result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("explicit_tool_selection",), "general"),
            sources=[{"id": "source-1", "title": "Result"}],
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="What is new in Python?")],
            tenantId="tenant-a",
            userId="user-a",
            conversationId="conversation-a",
            runtimeContext={"language": "en"},
            skillId="web_search",
        )

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            loaded = await IntelligenceRouter(registry=None)._load_web_context(request)

        self.assertIs(loaded, result)
        self.assertTrue(run.await_args.kwargs["explicit_request"])
        self.assertEqual(run.await_args.args[0], "What is new in Python?")
        self.assertRegex(run.await_args.kwargs["as_of_date"], r"^\d{4}-\d{2}-\d{2}$")

    async def test_other_selected_skills_do_not_force_web_search(self):
        result = WebPipelineResult(
            decision=WebDecision(False, "no_web_signal", (), "general"),
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="Summarize the last answer")],
            tenantId="tenant-a",
            skillId="summarization",
        )

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            await IntelligenceRouter(registry=None)._load_web_context(request)

        self.assertFalse(run.await_args.kwargs["explicit_request"])

    async def test_arabic_query_sets_arabic_search_language_despite_english_runtime_default(self):
        result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما حصل اليوم في السعوديه")],
            tenantId="tenant-a",
            runtimeContext={"language": "en", "timezone": "Asia/Riyadh"},
            skillId="web_search",
        )

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            await IntelligenceRouter(registry=None)._load_web_context(request)

        self.assertEqual(run.await_args.kwargs["language"], "ar")
        self.assertEqual(run.await_args.kwargs["timezone_name"], "Asia/Riyadh")

    def _direct_link_followup_fixture(self, *, stream=False):
        request = ChatRequest(
            messages=[
                ChatMessage(role="user", content="من هم شركة Qirox Studio؟"),
                ChatMessage(role="assistant", content="لا أعرف هذه الشركة."),
                ChatMessage(role="user", content="هذا هو موقعهم الاكتروني qiroxstudio.online"),
            ],
            tenantId="tenant-a",
            runtimeContext={"language": "en"},
            stream=stream,
        )
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("user_provided_url",), "general"),
            context=(
                "## Web evidence\n[source-1] Qirox Studio\n"
                "URL: https://qiroxstudio.online\n"
                "Retrieved: 2026-09-28T00:00:00+00:00\n"
                "Content: كيروكس استوديو — شركة برمجة سعودية في الرياض. "
                "نبني مواقع إلكترونية وتطبيقات جوال وأنظمة إدارة."
            ),
            sources=[{
                "id": "source-1",
                "title": "Qirox Studio",
                "url": "https://qiroxstudio.online",
                "source": "user_provided_url",
            }],
        )
        return request, web_result

    async def test_direct_link_followup_answers_prior_question_from_page_excerpt(self):
        request, web_result = self._direct_link_followup_fixture()
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            response = await router.route(request)

        self.assertEqual(response.backend, "web-source-summary")
        self.assertIn("شركة برمجة سعودية في الرياض", response.content)
        self.assertIn("نبني مواقع إلكترونية", response.content)
        self.assertIn("[source-1]", response.content)
        self.assertNotIn("لا أعرف", response.content)
        self.assertNotIn("تأسست", response.content)

    async def test_streaming_direct_link_followup_uses_page_excerpt_without_model(self):
        request, web_result = self._direct_link_followup_fixture(stream=True)
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            stream, route, _sources, _telemetry, _events = await router.stream_route(request)
            answer = "".join([part async for part in stream])

        self.assertEqual(route.backend_id, "web-source-summary")
        self.assertIn("شركة برمجة سعودية في الرياض", answer)
        self.assertIn("[source-1]", answer)

    async def test_stream_does_not_generate_claims_when_web_search_has_no_sources(self):
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
            error="No verified web search results",
        )
        router = IntelligenceRouter(registry=None)
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما حصل اليوم في السعوديه")],
            tenantId="tenant-a",
            runtimeContext={"language": "en"},
            stream=True,
        )

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            stream, _route, sources, _telemetry, _events = await router.stream_route(request)
            answer = "".join([part async for part in stream])

        self.assertEqual(sources, [])
        self.assertIn("لم أعثر على تقارير موثوقة منشورة اليوم", answer)
        self.assertNotIn("الكويت", answer)

    async def test_non_stream_does_not_generate_claims_when_web_search_has_no_sources(self):
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
            error="No verified web search results",
        )
        router = IntelligenceRouter(registry=None)
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما حصل اليوم في السعوديه")],
            tenantId="tenant-a",
            runtimeContext={"language": "en"},
        )

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            response = await router.route(request)

        self.assertIn("لم أعثر على تقارير موثوقة منشورة اليوم", response.content)
        self.assertNotIn("الكويت", response.content)
        self.assertEqual(response.backend, "web-search-unavailable")


if __name__ == "__main__":
    unittest.main()
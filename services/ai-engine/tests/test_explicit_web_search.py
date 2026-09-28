import unittest
from unittest.mock import AsyncMock, patch

from app.models.chat import ChatMessage, ChatRequest
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


if __name__ == "__main__":
    unittest.main()
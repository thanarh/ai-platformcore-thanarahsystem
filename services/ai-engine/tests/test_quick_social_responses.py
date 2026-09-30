import unittest
from unittest.mock import AsyncMock, patch

from app.models.chat import ChatMessage, ChatRequest
from app.router.intelligence_router import IntelligenceRouter


class QuickSocialResponseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.router = IntelligenceRouter(registry=None)

    @staticmethod
    def request(text: str, skill_id: str | None = None) -> ChatRequest:
        return ChatRequest(
            messages=[ChatMessage(role="user", content=text)],
            tenantId="tenant-a",
            skillId=skill_id,
        )

    async def test_arabic_greetings_bypass_cache_context_and_model_routing(self):
        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
            ) as cache_get,
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
            ) as profile,
        ):
            response = await self.router.route(self.request("هلا، كيفك؟"))

        self.assertEqual(response.backend, "quick-social")
        self.assertIn("بخير", response.content)
        cache_get.assert_not_awaited()
        profile.assert_not_awaited()

    async def test_english_greeting_streams_without_model_routing(self):
        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
            ) as cache_get,
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
            ) as profile,
        ):
            stream, route, rag_sources, _telemetry, events = await self.router.stream_route(
                self.request("Hi, how are you?")
            )
            response = "".join([part async for part in stream])

        self.assertEqual(route.backend_id, "quick-social")
        self.assertIn("I'm well", response)
        self.assertEqual(rag_sources, [])
        self.assertEqual(events, [])
        cache_get.assert_not_awaited()
        profile.assert_not_awaited()

    def test_does_not_short_circuit_real_questions_or_explicit_skills(self):
        self.assertIsNone(
            self.router._quick_social_response(
                self.request("هلا، اشرح لي كيف أرفع ملفًا.")
            )
        )
        self.assertIsNone(
            self.router._quick_social_response(
                self.request("هلا", skill_id="web_search")
            )
        )


if __name__ == "__main__":
    unittest.main()

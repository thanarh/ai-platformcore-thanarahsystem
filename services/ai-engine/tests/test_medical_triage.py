import unittest
from unittest.mock import AsyncMock, patch

from app.medical_triage import urgent_dvt_response
from app.models.chat import ChatMessage, ChatRequest
from app.router.intelligence_router import IntelligenceRouter


ARABIC_URGENT_MESSAGE = (
    "انا تعبان جدا في معدتي الجانب الايمن عند الكلى واكتشف ان عندي جلطه في رجلي "
    "اليسار تحت الركبه عميقه ماذا افعل الان"
)


class MedicalTriageTests(unittest.IsolatedAsyncioTestCase):
    def test_arabic_dvt_with_severe_flank_pain_gets_direct_emergency_guidance(self):
        response = urgent_dvt_response(ARABIC_URGENT_MESSAGE)

        self.assertIsNotNone(response)
        self.assertIn("تقييم طبي عاجل الآن", response)
        self.assertIn("لا تقد السيارة بنفسك", response)
        self.assertIn("997", response)
        self.assertIn("لا تدلّك الساق", response)

    def test_english_dvt_with_severe_flank_pain_gets_english_guidance(self):
        response = urgent_dvt_response(
            "I have deep vein thrombosis and severe right flank pain. What should I do now?"
        )

        self.assertIsNotNone(response)
        self.assertIn("urgent medical assessment now", response)
        self.assertIn("do not drive yourself", response)

    def test_general_question_about_dvt_is_not_intercepted(self):
        self.assertIsNone(urgent_dvt_response("ما هو الخثار الوريدي العميق؟"))
        self.assertIsNone(urgent_dvt_response("What is deep vein thrombosis?"))

    def test_unexplained_single_letter_gets_clarified_but_listed_choice_does_not(self):
        router = IntelligenceRouter(registry=None)
        unclear = ChatRequest(
            messages=[
                ChatMessage(role="assistant", content="لم أجد مصادر. أعد صياغة السؤال."),
                ChatMessage(role="user", content="د"),
            ]
        )
        listed_choice = ChatRequest(
            messages=[
                ChatMessage(role="assistant", content="اختر إجابة:\nأ) الأول\nد) الرابع"),
                ChatMessage(role="user", content="د"),
            ]
        )

        self.assertIn("لم أفهم رسالتك", router._single_character_clarification(unclear))
        self.assertIsNone(router._single_character_clarification(listed_choice))

    async def test_non_stream_triage_bypasses_cache_search_and_model(self):
        request = ChatRequest(
            messages=[
                ChatMessage(role="user", content="هلا"),
                ChatMessage(role="assistant", content="كيف أساعدك؟"),
                ChatMessage(role="user", content=ARABIC_URGENT_MESSAGE),
            ],
            tenantId="tenant-a",
            skillId="web_search",
        )
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
            ) as cache_get,
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
            ) as profile,
            patch(
                "app.router.intelligence_router.web_intelligence_pipeline.run",
                new_callable=AsyncMock,
            ) as search,
        ):
            response = await router.route(request)

        self.assertEqual(response.backend, "urgent-medical-triage")
        self.assertIn("تقييم طبي عاجل الآن", response.content)
        cache_get.assert_not_awaited()
        profile.assert_not_awaited()
        search.assert_not_awaited()

    async def test_non_stream_single_letter_does_not_get_a_model_refusal(self):
        request = ChatRequest(
            messages=[
                ChatMessage(role="assistant", content="لم أجد مصادر. أعد صياغة السؤال."),
                ChatMessage(role="user", content="د"),
            ],
            tenantId="tenant-a",
        )
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
            ) as cache_get,
            patch(
                "app.router.intelligence_router.web_intelligence_pipeline.run",
                new_callable=AsyncMock,
            ) as search,
        ):
            response = await router.route(request)

        self.assertEqual(response.backend, "clarification")
        self.assertIn("لم أفهم رسالتك", response.content)
        cache_get.assert_not_awaited()
        search.assert_not_awaited()

    async def test_stream_triage_bypasses_cache_search_and_model(self):
        request = ChatRequest(
            messages=[ChatMessage(role="user", content=ARABIC_URGENT_MESSAGE)],
            tenantId="tenant-a",
            stream=True,
            skillId="web_search",
        )
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
            ) as cache_get,
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
            ) as profile,
            patch(
                "app.router.intelligence_router.web_intelligence_pipeline.run",
                new_callable=AsyncMock,
            ) as search,
        ):
            stream, route, sources, _telemetry, events = await router.stream_route(request)
            response = "".join([part async for part in stream])

        self.assertEqual(route.backend_id, "urgent-medical-triage")
        self.assertEqual(sources, [])
        self.assertEqual(events, [])
        self.assertIn("تقييم طبي عاجل الآن", response)
        cache_get.assert_not_awaited()
        profile.assert_not_awaited()
        search.assert_not_awaited()

    async def test_stream_single_letter_gets_a_clarification(self):
        request = ChatRequest(
            messages=[
                ChatMessage(role="assistant", content="لم أجد مصادر. أعد صياغة السؤال."),
                ChatMessage(role="user", content="د"),
            ],
            tenantId="tenant-a",
            stream=True,
        )
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
            ) as cache_get,
            patch(
                "app.router.intelligence_router.web_intelligence_pipeline.run",
                new_callable=AsyncMock,
            ) as search,
        ):
            stream, route, _sources, _telemetry, _events = await router.stream_route(request)
            response = "".join([part async for part in stream])

        self.assertEqual(route.backend_id, "clarification")
        self.assertIn("لم أفهم رسالتك", response)
        cache_get.assert_not_awaited()
        search.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
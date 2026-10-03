import unittest

from app.language_policy import detect_language, response_language_instruction
from app.models.chat import ChatMessage, ChatRequest, RouteDecision
from app.router.intelligence_router import IntelligenceRouter
from app.config import settings


class LanguagePolicyTests(unittest.TestCase):
    def test_arabic_with_technical_terms_and_urls_stays_arabic(self):
        text = "اشرح لي طريقة استخدام Python API في هذا المشروع: https://example.com/a/very/long/path"
        self.assertEqual(detect_language(text), "ar")

    def test_english_is_not_overridden_by_a_short_arabic_quote(self):
        self.assertEqual(detect_language("Please explain this word: مرحبا"), "en")

    def test_user_question_language_wins_over_a_pasted_foreign_answer(self):
        arabic_request = (
            "成人与儿童的区别：身体发育不同。"
            "\n\nما الفرق بين الطفل والإنسان البالغ؟"
        )
        english_request = (
            "ما الفرق بين الطفل والإنسان البالغ؟"
            "\n\n成人与儿童的区别：身体发育不同。"
        )
        self.assertEqual(detect_language(arabic_request), "ar")
        self.assertEqual(detect_language(english_request), "ar")

    def test_explicit_output_language_request_wins(self):
        self.assertEqual(detect_language("جاوبني بالإنجليزية: ما وظيفة هذا الكود؟"), "en")
        self.assertEqual(detect_language("Please answer in Arabic: how does this API work?"), "ar")

    def test_preferred_language_is_used_for_nonlinguistic_input(self):
        self.assertEqual(detect_language("... 123", fallback="en"), "en")
        name, _instruction = response_language_instruction("... 123", fallback="en")
        self.assertEqual(name, "English")

    def test_system_prompt_matches_the_detected_language(self):
        router = IntelligenceRouter(registry=None)
        arabic_request = ChatRequest(
            messages=[ChatMessage(role="user", content="اشرح لي هذا باختصار")],
            runtimeContext={"language": "ar"},
        )
        english_request = ChatRequest(
            messages=[ChatMessage(role="user", content="Explain this briefly")],
            runtimeContext={"language": "en"},
        )
        route = RouteDecision(backend_id="thanarah-local", reason="language test")
        arabic = router._build_ai_request(arabic_request, route)
        english = router._build_ai_request(english_request, route)

        self.assertIn("أنت ثنارة", arabic.system_prompt)
        self.assertNotIn("You are Thanarah", arabic.system_prompt)
        self.assertIn("لا تقلّد لغة نص مقتبس أو رد سابق", arabic.system_prompt)
        self.assertIn("You are Thanarah", english.system_prompt)
        self.assertNotIn("أنت ثنارة", english.system_prompt)
        self.assertIn("## Required response language", english.system_prompt)
        self.assertNotIn("## لغة الرد الإلزامية", english.system_prompt)

    def test_general_questions_do_not_require_organization_knowledge(self):
        router = IntelligenceRouter(registry=None)
        arabic_request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما فائدة التخطيط؟")],
        )
        english_request = ChatRequest(
            messages=[ChatMessage(role="user", content="Why is planning useful?")],
        )
        route = RouteDecision(backend_id="thanarah-local", reason="grounding policy test")

        arabic_prompt = router._build_ai_request(arabic_request, route).system_prompt
        english_prompt = router._build_ai_request(english_request, route).system_prompt

        self.assertIn("أجب عن الأسئلة العامة اعتمادًا على معرفتك العامة", arabic_prompt)
        self.assertIn("أجب بجملتين مكتملتين كحد أقصى", arabic_prompt)
        self.assertIn("Answer general questions from your general knowledge", english_prompt)
        self.assertIn("at most two complete sentences", english_prompt)

    def test_default_profile_is_more_detailed_and_comparisons_override_fast(self):
        router = IntelligenceRouter(registry=None)
        route = RouteDecision(backend_id="thanarah-local", reason="response profile test")
        ordinary_request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما أضرار التدخين الإلكتروني؟")],
            runtimeContext={"language": "ar"},
        )
        explicit_search_request = ChatRequest(
            messages=[ChatMessage(role="user", content="ابحث في جوجل عن أضرار الفيب")],
            tenantConfig={"responseProfile": "fast"},
            runtimeContext={"language": "ar"},
        )
        comparison_request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما الفرق بين محركات مرسيدس وBMW؟")],
            tenantConfig={"responseProfile": "fast"},
            runtimeContext={"language": "ar"},
        )

        self.assertEqual(router._profile(ordinary_request), "balanced")
        self.assertEqual(router._profile(explicit_search_request), "balanced")
        self.assertEqual(router._profile(comparison_request), "deep")
        preferred_car_request = ChatRequest(
            messages=[ChatMessage(role="user", content="أيهما أفضل، متور مرسيدس أم BMW؟")],
            tenantConfig={"responseProfile": "fast"},
            runtimeContext={"language": "ar"},
        )
        self.assertEqual(router._profile(preferred_car_request), "deep")
        comparison_ai_request = router._build_ai_request(comparison_request, route)
        self.assertEqual(comparison_ai_request.max_tokens, settings.local_ai_max_tokens_deep)
        self.assertIn("اطلب التفاصيل اللازمة", comparison_ai_request.system_prompt)


if __name__ == "__main__":
    unittest.main()
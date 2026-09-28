import unittest

from app.language_policy import detect_language, response_language_instruction
from app.models.chat import ChatMessage, ChatRequest, RouteDecision
from app.router.intelligence_router import IntelligenceRouter


class LanguagePolicyTests(unittest.TestCase):
    def test_arabic_with_technical_terms_and_urls_stays_arabic(self):
        text = "اشرح لي طريقة استخدام Python API في هذا المشروع: https://example.com/a/very/long/path"
        self.assertEqual(detect_language(text), "ar")

    def test_english_is_not_overridden_by_a_short_arabic_quote(self):
        self.assertEqual(detect_language("Please explain this word: مرحبا"), "en")

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
        self.assertIn("You are Thanarah", english.system_prompt)
        self.assertNotIn("أنت ثنارة", english.system_prompt)


if __name__ == "__main__":
    unittest.main()
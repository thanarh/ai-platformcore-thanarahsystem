import unittest

from app.backends.base import AIRequest
from app.backends.fallback import FallbackBackend


class FallbackBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.backend = FallbackBackend()

    def test_arabic_general_question_reports_generation_failure_not_missing_knowledge(self):
        request = AIRequest(
            messages=[{"role": "user", "content": "ما فائدة التخطيط قبل بدء مشروع؟"}],
        )

        response = self.backend._respond(request)

        self.assertIn("تعذّر توليد الرد", response)
        self.assertIn("الأسئلة العامة لا تحتاج إضافتها", response)
        self.assertNotIn("لا توجد معلومات كافية", response)

    def test_english_general_question_reports_generation_failure_not_missing_knowledge(self):
        request = AIRequest(
            messages=[{"role": "user", "content": "Why is planning useful?"}],
        )

        response = self.backend._respond(request)

        self.assertIn("answer could not be generated", response)
        self.assertIn("General questions do not need to be added", response)
        self.assertNotIn("not enough information", response)

    def test_retrieved_knowledge_remains_available_to_continuity_response(self):
        request = AIRequest(
            messages=[{"role": "user", "content": "ما ساعات العمل؟"}],
            context="## Relevant Knowledge\n\n1. ساعات العمل: من التاسعة إلى الخامسة",
        )

        response = self.backend._respond(request)

        self.assertIn("من التاسعة إلى الخامسة", response)
        self.assertNotIn("خدمة النموذج", response)


if __name__ == "__main__":
    unittest.main()
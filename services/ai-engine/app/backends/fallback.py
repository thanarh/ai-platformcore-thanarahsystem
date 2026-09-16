"""Thanarah continuity response service.

This service keeps chat useful when advanced generation is not active and turns
retrieved organizational knowledge into grounded responses.
"""
import re
from typing import AsyncGenerator

from app.backends.base import AIBackend, AIRequest, AIResponse, HealthStatus


class FallbackBackend(AIBackend):
    """Always-available branded core response path."""

    def __init__(self):
        super().__init__(backend_id="fallback", name="Thanarah Core")
        self.priority = 1
        self.enabled = True

    @staticmethod
    def _latest_user_message(request: AIRequest) -> str:
        for message in reversed(request.messages):
            if message.get("role") == "user":
                return str(message.get("content") or "").strip()
        return ""

    @staticmethod
    def _is_arabic(text: str) -> bool:
        return any("\u0600" <= char <= "\u06ff" for char in text)

    @staticmethod
    def _normalize(text: str) -> str:
        value = text.lower().strip()
        value = re.sub(r"[ًٌٍَُِّْـ]", "", value)
        value = value.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
        return re.sub(r"[^\w\u0600-\u06ff]+", " ", value).strip()

    @staticmethod
    def _knowledge_context(context: str | None) -> list[str]:
        if not context or "## Relevant Knowledge" not in context:
            return []
        section = context.split("## Relevant Knowledge", 1)[1]
        items: list[str] = []
        for block in section.split("\n\n"):
            cleaned = block.strip()
            if cleaned and cleaned[0].isdigit() and ". " in cleaned:
                items.append(cleaned.split(". ", 1)[1].strip())
        return items[:3]

    @staticmethod
    def _contains_phrase(normalized: str, phrases: tuple[str, ...]) -> bool:
        padded = f" {normalized} "
        return any(f" {phrase} " in padded for phrase in phrases)

    def _respond(self, request: AIRequest) -> str:
        user_text = self._latest_user_message(request)
        normalized = self._normalize(user_text)
        arabic = self._is_arabic(user_text) or not user_text

        if self._contains_phrase(
            normalized,
            ("هلا", "ياهلا", "يا هلا", "مرحبا", "اهلا", "السلام عليكم", "صباح الخير", "مساء الخير", "hello", "hi", "hey"),
        ):
            return "هلا بك، أنا ثنارة. كيف أقدر أساعدك؟" if arabic else "Hello, I'm Thanarah. How can I help?"

        if self._contains_phrase(normalized, ("شكرا", "شكراً", "مشكور", "تسلم", "thanks", "thank you")):
            return "العفو، يسعدني مساعدتك." if arabic else "You're welcome. I'm happy to help."

        if self._contains_phrase(normalized, ("كيف حالك", "اخبارك", "كيفك", "how are you")):
            return "بخير وجاهز لمساعدتك. ما الذي تريد إنجازه؟" if arabic else "I'm ready to help. What would you like to accomplish?"

        if self._contains_phrase(normalized, ("من انت", "ما اسمك", "اسمك", "who are you")):
            return "أنا ثنارة، مساعدك الذكي من منصة ثنارة AI." if arabic else "I'm Thanarah, your AI assistant from Thanarah AI."

        if self._contains_phrase(normalized, ("مساعده", "ساعدني", "ماذا تستطيع", "ما خدماتك", "help", "what can you do")):
            if arabic:
                return "أستطيع مساعدتك في المحادثة، البحث داخل قاعدة المعرفة، تنظيم المعلومات، والإجابة عن بيانات مؤسستك. اكتب طلبك أو أضف تفاصيل أكثر."
            return "I can help with conversation, knowledge search, information organization, and answers based on your organization's data."

        knowledge = self._knowledge_context(request.context)
        if knowledge:
            joined = "\n\n".join(f"• {item}" for item in knowledge)
            if arabic:
                return f"بناءً على المعلومات المتاحة في قاعدة معرفة ثنارة:\n\n{joined}\n\nيمكنك إضافة تفاصيل أكثر للحصول على نتيجة أدق."
            return f"Based on the information available in Thanarah Knowledge:\n\n{joined}\n\nAdd more detail for a more precise result."

        tokens = normalized.split()
        if not normalized or (len(tokens) == 1 and len(normalized) <= 7):
            if arabic:
                shown = f" «{user_text}»" if user_text else ""
                return f"لم أفهم المقصود من{shown}. اكتب سؤالك بجملة أو أضف تفاصيل أكثر وسأساعدك."
            return "I couldn't determine what you mean. Please write a complete question or add more detail."

        if arabic:
            return "لا توجد معلومات كافية للإجابة بدقة على هذا الطلب. أضف تفاصيل أكثر أو أضف المعلومات المرتبطة به إلى قاعدة معرفة ثنارة."
        return "There is not enough information to answer this accurately. Add more detail or add the relevant information to Thanarah Knowledge."

    async def is_available(self) -> bool:
        return True

    async def chat(self, request: AIRequest) -> AIResponse:
        content = self._respond(request)
        self.record_success(0)
        return AIResponse(content=content, model="thanarah-core", backend=self.backend_id)

    async def stream_chat(self, request: AIRequest) -> AsyncGenerator[str, None]:
        yield self._respond(request)

    async def health_check(self) -> HealthStatus:
        return HealthStatus(available=True, latency_ms=0, model="thanarah-core")

    def to_dict(self) -> dict:
        data = super().to_dict()
        data["type"] = "continuity"
        return data

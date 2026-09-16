"""Thanarah continuity backend.

This backend is always available. It keeps chat responsive during provider outages
and turns retrieved organizational knowledge into a useful grounded response.
"""
from typing import AsyncGenerator

from app.backends.base import AIBackend, AIRequest, AIResponse, HealthStatus


class FallbackBackend(AIBackend):
    """Always-available branded continuity response path."""

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

    def _respond(self, request: AIRequest) -> str:
        user_text = self._latest_user_message(request)
        arabic = self._is_arabic(user_text) or not user_text
        knowledge = self._knowledge_context(request.context)

        if knowledge:
            joined = "\n\n".join(f"• {item}" for item in knowledge)
            if arabic:
                return (
                    "بناءً على المعلومات المتاحة في قاعدة معرفة ثنارة:\n\n"
                    f"{joined}\n\n"
                    "إذا أردت، أعد صياغة السؤال بتفصيل أكبر لأحدد الإجابة المطلوبة بدقة."
                )
            return (
                "Based on the information available in the Thanarah knowledge base:\n\n"
                f"{joined}\n\n"
                "You can add more detail to your question for a more precise answer."
            )

        normalized = user_text.lower()
        if any(word in normalized for word in ("مرحبا", "مرحباً", "السلام", "اهلا", "أهلا", "hello", "hi")):
            return "مرحباً، أنا ثنارة. كيف يمكنني مساعدتك اليوم؟" if arabic else "Hello, I'm Thanarah. How can I help you today?"

        if any(word in normalized for word in ("من انت", "من أنت", "اسمك", "who are you")):
            return "أنا ثنارة، مساعدك الذكي من منصة ثنارة AI." if arabic else "I'm Thanarah, your AI assistant from Thanarah AI."

        if arabic:
            return (
                "استلمت طلبك، لكن خدمة الإجابات المتقدمة قيد الاستعادة حالياً. "
                "يمكنك متابعة استخدام المحادثة وقاعدة المعرفة، وسأجيب من المعلومات المضافة إليها فور توفر تطابق مناسب."
            )
        return (
            "I received your request, but advanced responses are currently being restored. "
            "You can continue using chat and the knowledge base, and I will answer from matched organizational information."
        )

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

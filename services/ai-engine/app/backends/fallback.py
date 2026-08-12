"""
Graceful fallback backend — always available, returns a helpful error message.
Used as the last resort when all other backends fail.
"""
from typing import AsyncGenerator
from app.backends.base import AIBackend, AIRequest, AIResponse, HealthStatus


class FallbackBackend(AIBackend):
    """
    Always-available backend that returns a graceful error message.
    Ensures the system never crashes silently.
    """

    def __init__(self):
        super().__init__(backend_id="fallback", name="Graceful Fallback")
        self.priority = 1  # Lowest priority — only used when everything else fails
        self.enabled = True

    async def is_available(self) -> bool:
        return True

    async def chat(self, request: AIRequest) -> AIResponse:
        self.record_success(0)
        return AIResponse(
            content="تعذر إكمال الطلب حاليًا. يرجى المحاولة مرة أخرى لاحقاً.\n\nUnable to complete the request at this time. Please try again later.",
            model="fallback",
            backend=self.backend_id,
        )

    async def stream_chat(self, request: AIRequest) -> AsyncGenerator[str, None]:
        yield "تعذر إكمال الطلب حاليًا. يرجى المحاولة مرة أخرى لاحقاً."

    async def health_check(self) -> HealthStatus:
        return HealthStatus(available=True, latency_ms=0, model="fallback")

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["type"] = "fallback"
        return d

"""
Graceful fallback backend — always available, used as last resort.
When local AI is configured but not reachable, returns a clean status message.
"""
from typing import AsyncGenerator
from app.backends.base import AIBackend, AIRequest, AIResponse, HealthStatus

_MSG_AR = "محرك ثناره AI المحلي غير متصل حالياً.\n\nيرجى التأكد من تشغيل خادم llama.cpp على المنفذ 8080، أو تواصل مع المسؤول لإعادة تشغيل المحرك."
_MSG_EN = "Thanarah Local AI Engine is not currently connected.\n\nPlease ensure the llama.cpp server is running on port 8080, or contact your administrator to restart the engine."
_MSG = f"{_MSG_AR}\n\n{_MSG_EN}"


class FallbackBackend(AIBackend):
    """
    Always-available last-resort backend.
    Returns a clean status message instead of a silent error.
    No external API keys required — works entirely without network access.
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
            content=_MSG,
            model="fallback",
            backend=self.backend_id,
        )

    async def stream_chat(self, request: AIRequest) -> AsyncGenerator[str, None]:
        yield _MSG

    async def health_check(self) -> HealthStatus:
        return HealthStatus(available=True, latency_ms=0, model="fallback")

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["type"] = "fallback"
        return d

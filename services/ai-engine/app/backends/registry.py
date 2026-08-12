"""
Backend Registry — manages all AI backends.
Add or remove backends here without changing any other code.
"""
import logging
from typing import Dict, List, Optional
from app.backends.base import AIBackend
from app.backends.llamacpp import LlamaCppBackend
from app.backends.fallback import FallbackBackend
from app.config import settings

logger = logging.getLogger(__name__)


class BackendRegistry:
    """
    Central registry for all AI backends.
    Provides health monitoring and backend lookup.
    """

    def __init__(self):
        self._backends: Dict[str, AIBackend] = {}

    async def initialize(self):
        """Register all configured backends."""

        # Always register fallback
        self._register(FallbackBackend())

        # Register local llama.cpp if enabled
        if settings.local_ai_enabled:
            llamacpp = LlamaCppBackend()
            self._register(llamacpp)
            logger.info(f"✓ Local llama.cpp backend registered ({settings.local_ai_base_url})")

        # Register OpenAI if key provided
        if settings.openai_api_key:
            from app.backends.openai_compatible import OpenAICompatibleBackend
            openai_backend = OpenAICompatibleBackend(
                backend_id="openai",
                name="OpenAI",
                base_url="https://api.openai.com/v1",
                api_key=settings.openai_api_key,
                model="gpt-4o-mini",
                timeout=60,
            )
            openai_backend.priority = 70
            self._register(openai_backend)
            logger.info("✓ OpenAI backend registered")

        logger.info(f"Backend registry initialized: {list(self._backends.keys())}")

    def _register(self, backend: AIBackend):
        self._backends[backend.backend_id] = backend

    def get(self, backend_id: str) -> Optional[AIBackend]:
        return self._backends.get(backend_id)

    def get_all(self) -> List[AIBackend]:
        return list(self._backends.values())

    def get_enabled(self) -> List[AIBackend]:
        return [b for b in self._backends.values() if b.enabled]

    def get_by_priority(self) -> List[AIBackend]:
        enabled = self.get_enabled()
        return sorted(enabled, key=lambda b: b.priority, reverse=True)

    def count(self) -> int:
        return len(self._backends)

    def update_backend(self, backend_id: str, data: dict) -> bool:
        backend = self._backends.get(backend_id)
        if not backend:
            return False
        if "enabled" in data:
            backend.enabled = data["enabled"]
        if "priority" in data:
            backend.priority = int(data["priority"])
        return True

    async def get_health(self) -> List[dict]:
        results = []
        for backend in self.get_all():
            health = await backend.health_check()
            info = backend.to_dict()
            info.update({
                "healthy": health.available,
                "latencyMs": health.latency_ms,
                "healthError": health.error,
                "activeModel": health.model,
            })
            results.append(info)
        return results

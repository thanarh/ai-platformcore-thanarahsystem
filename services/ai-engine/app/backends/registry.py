"""
Backend Registry — manages all AI backends.

Priority order (higher = preferred):
  90 — Local llama.cpp (PRIMARY — always-first, no external dependency)
  70 — OpenAI (BYOK, optional)
  60 — Anthropic (BYOK, optional)
   1 — Fallback (always-last, returns clean status message)

Add new backends here without changing any other code.
"""
import logging
from typing import Dict, List, Optional
from app.backends.base import AIBackend
from app.backends.fallback import FallbackBackend
from app.config import settings

logger = logging.getLogger(__name__)


class BackendRegistry:
    """
    Central registry for all AI backends.
    Provides health monitoring and backend lookup.

    Design principle: the system must work without ANY external API key.
    External providers are BYOK add-ons, never requirements.
    """

    def __init__(self):
        self._backends: Dict[str, AIBackend] = {}

    async def initialize(self):
        """Register all configured backends."""

        # ── 1. Always register fallback (last resort, no network needed) ──
        self._register(FallbackBackend())

        # ── 2. Local inference — PRIMARY backend ──────────────────────────
        # Registered whenever LOCAL_AI_ENABLED=true (default).
        # If the llama.cpp server is not running, requests fall through to
        # the fallback which returns a clean "not connected" message.
        if settings.local_ai_enabled:
            if settings.local_ai_engine.lower() == "ollama":
                from app.backends.ollama import OllamaBackend

                local_backend = OllamaBackend()
            else:
                from app.backends.llamacpp import LlamaCppBackend

                local_backend = LlamaCppBackend()
            self._register(local_backend)
            logger.info(
                f"✓ Local {settings.local_ai_engine} backend registered "
                f"(url={settings.local_ai_base_url}, "
                f"model={settings.local_ai_model or 'auto-detect'})"
            )
        else:
            logger.warning(
                "⚠ Local AI disabled (LOCAL_AI_ENABLED=false). "
                "Set LOCAL_AI_ENABLED=true to enable the primary backend."
            )

        # ── 3. Optional free providers — explicit opt-in and quota protected ─
        if settings.free_providers_enabled:
            from app.backends.free_provider import QuotaOpenAIBackend
            if settings.groq_api_key:
                groq = QuotaOpenAIBackend(
                    backend_id="groq-free",
                    name="Groq Free",
                    base_url="https://api.groq.com/openai/v1",
                    api_key=settings.groq_api_key,
                    model=settings.groq_model,
                    daily_limit=settings.groq_daily_limit,
                    rpm_limit=settings.groq_rpm_limit,
                )
                groq.priority = 80
                self._register(groq)
                logger.info("✓ Groq free backend registered with local quota guard")
            if settings.openrouter_api_key:
                openrouter = QuotaOpenAIBackend(
                    backend_id="openrouter-free",
                    name="OpenRouter Free",
                    base_url="https://openrouter.ai/api/v1",
                    api_key=settings.openrouter_api_key,
                    model=settings.openrouter_model,
                    daily_limit=settings.openrouter_daily_limit,
                    rpm_limit=settings.openrouter_rpm_limit,
                )
                openrouter.priority = 75
                self._register(openrouter)
                logger.info("✓ OpenRouter free backend registered with local quota guard")

        # ── 4. Paid/BYOK providers — never register in free-only mode ───────
        if settings.allow_external_providers and not settings.free_provider_only and settings.openai_api_key:
            from app.backends.openai_compatible import OpenAICompatibleBackend
            openai_backend = OpenAICompatibleBackend(
                backend_id="openai",
                name="OpenAI (BYOK)",
                base_url="https://api.openai.com/v1",
                api_key=settings.openai_api_key,
                model="gpt-4o-mini",
                timeout=60,
            )
            openai_backend.priority = 70
            self._register(openai_backend)
            logger.info("✓ OpenAI BYOK backend registered (optional)")

        if settings.allow_external_providers and not settings.free_provider_only and settings.anthropic_api_key:
            from app.backends.anthropic import AnthropicBackend
            anthropic_backend = AnthropicBackend(api_key=settings.anthropic_api_key)
            self._register(anthropic_backend)
            logger.info("✓ Anthropic BYOK backend registered (optional)")

        # ── Summary ───────────────────────────────────────────────────────
        active = [b for b in self._backends.values() if b.backend_id != "fallback"]
        logger.info(
            f"Backend registry initialized: {list(self._backends.keys())} "
            f"| Primary: {'local-llamacpp' if 'local-llamacpp' in self._backends else 'fallback'}"
        )

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

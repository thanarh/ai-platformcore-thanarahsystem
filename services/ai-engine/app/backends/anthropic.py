"""
Anthropic Backend Adapter (BYOK — optional, disabled by default)
Supports Claude 3.5 Sonnet and other Claude models via Anthropic's Messages API.

To enable: set ANTHROPIC_API_KEY in environment.
This backend is NEVER required for the system to function.
"""
import time
import json
import logging
from typing import AsyncGenerator, Optional
import httpx

from app.backends.base import AIBackend, AIRequest, AIResponse, HealthStatus

logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicBackend(AIBackend):
    """
    BYOK adapter for Anthropic Claude models.
    Optional — only active when ANTHROPIC_API_KEY is provided.
    """

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        super().__init__(backend_id="anthropic", name="Anthropic Claude")
        self.api_key = api_key
        self.default_model = model
        self.priority = 60  # Lower than local (90), higher than fallback (1)
        self.enabled = True

    def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=ANTHROPIC_API_URL,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            timeout=90,
        )

    def _build_messages(self, request: AIRequest):
        """Convert messages, separating system prompt from conversation."""
        system = request.system_prompt or ""
        if request.context:
            system = f"{system}\n\n{request.context}".strip()

        messages = []
        for m in request.messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                system = f"{system}\n\n{content}".strip() if system else content
            else:
                messages.append({"role": role, "content": content})

        return system, messages

    async def is_available(self) -> bool:
        try:
            health = await self.health_check()
            return health.available
        except Exception:
            return False

    async def chat(self, request: AIRequest) -> AIResponse:
        system, messages = self._build_messages(request)
        model = request.model or self.default_model
        start = time.time()

        try:
            async with self._get_client() as client:
                resp = await client.post(
                    "/v1/messages",
                    json={
                        "model": model,
                        "max_tokens": request.max_tokens or 2048,
                        "system": system or "You are a helpful assistant.",
                        "messages": messages,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                latency = (time.time() - start) * 1000
                content = data["content"][0]["text"]
                usage = data.get("usage", {})
                self.record_success(latency)
                return AIResponse(
                    content=content,
                    model=model,
                    backend=self.backend_id,
                    input_tokens=usage.get("input_tokens", 0),
                    output_tokens=usage.get("output_tokens", 0),
                )
        except Exception as e:
            self.record_failure()
            logger.error(f"[Anthropic] chat failed: {e}")
            raise

    async def stream_chat(self, request: AIRequest) -> AsyncGenerator[str, None]:
        system, messages = self._build_messages(request)
        model = request.model or self.default_model

        try:
            async with self._get_client() as client:
                async with client.stream(
                    "POST",
                    "/v1/messages",
                    json={
                        "model": model,
                        "max_tokens": request.max_tokens or 2048,
                        "system": system or "You are a helpful assistant.",
                        "messages": messages,
                        "stream": True,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if not data_str or data_str == "[DONE]":
                                continue
                            try:
                                data = json.loads(data_str)
                                if data.get("type") == "content_block_delta":
                                    delta = data.get("delta", {}).get("text", "")
                                    if delta:
                                        yield delta
                            except Exception:
                                continue
        except Exception as e:
            self.record_failure()
            logger.error(f"[Anthropic] stream failed: {e}")
            raise

    async def health_check(self) -> HealthStatus:
        start = time.time()
        try:
            async with self._get_client() as client:
                resp = await client.get("/v1/models", timeout=5)
                latency = (time.time() - start) * 1000
                if resp.status_code < 500:
                    return HealthStatus(available=True, latency_ms=latency, model=self.default_model)
                return HealthStatus(available=False, error=f"HTTP {resp.status_code}")
        except Exception as e:
            return HealthStatus(available=False, error=str(e))

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update({
            "type": "byok",
            "provider": "anthropic",
            "model": self.default_model,
        })
        return d

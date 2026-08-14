"""
OpenAI-Compatible Backend Adapter
Supports any API that follows OpenAI's chat completions format.
Works with: OpenAI, local llama.cpp server, vLLM, LM Studio, Ollama, etc.
"""
import time
import logging
import asyncio
from typing import AsyncGenerator, Optional
import httpx

from app.backends.base import AIBackend, AIRequest, AIResponse, HealthStatus

logger = logging.getLogger(__name__)

THANARAH_SYSTEM_PROMPT = """أنت مساعد ذكاء اصطناعي متقدم من ثنارة AI. أنت متخصص في:
- الفهم العميق للغة العربية بجميع لهجاتها (الفصحى، السعودية، الخليجية، المصرية، الشامية)
- الاستجابة بشكل طبيعي ومحادثي
- فهم الأخطاء الإملائية والكتابة غير الرسمية
- دعم اللغتين العربية والإنجليزية

You are an advanced AI assistant by Thanarah AI. Respond naturally and helpfully.
Always match the user's language (Arabic or English).
For Arabic speakers, respond in the same dialect they use when appropriate."""


class OpenAICompatibleBackend(AIBackend):
    """
    Adapter for any OpenAI chat-completions compatible endpoint.
    Use for: local llama.cpp, vLLM, LM Studio, OpenAI, BYOK providers.
    """

    def __init__(
        self,
        backend_id: str,
        name: str,
        base_url: str,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout=90,  # int seconds OR httpx.Timeout object
    ):
        super().__init__(backend_id, name)
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or "not-required"
        self.default_model = model
        self.timeout = timeout  # passed directly to httpx — supports Timeout objects
        self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=self.timeout,
            )
        return self._client

    def _build_messages(self, request: AIRequest) -> list:
        messages = []
        system = request.system_prompt or THANARAH_SYSTEM_PROMPT
        if request.context:
            system += f"\n\n--- Context ---\n{request.context}"
        messages.append({"role": "system", "content": system})
        messages.extend(request.messages)
        return messages

    async def is_available(self) -> bool:
        try:
            client = self._get_client()
            response = await client.get("/models", timeout=5)
            return response.status_code < 500
        except Exception:
            return False

    async def chat(self, request: AIRequest) -> AIResponse:
        start = time.time()
        model = request.model or self.default_model or "default"
        messages = self._build_messages(request)

        try:
            client = self._get_client()
            response = await client.post(
                "/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()

            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            latency = (time.time() - start) * 1000
            self.record_success(latency)

            return AIResponse(
                content=content,
                model=data.get("model", model),
                backend=self.backend_id,
                input_tokens=usage.get("prompt_tokens", 0),
                output_tokens=usage.get("completion_tokens", 0),
                finish_reason=data["choices"][0].get("finish_reason"),
            )
        except Exception as e:
            self.record_failure()
            logger.error(f"[{self.name}] chat failed: {e}")
            raise

    async def stream_chat(self, request: AIRequest) -> AsyncGenerator[str, None]:
        model = request.model or self.default_model or "default"
        messages = self._build_messages(request)

        try:
            client = self._get_client()
            async with client.stream(
                "POST",
                "/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "stream": True,
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            import json
                            data = json.loads(data_str)
                            delta = data["choices"][0].get("delta", {}).get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            continue
        except Exception as e:
            self.record_failure()
            logger.error(f"[{self.name}] stream failed: {e}")
            raise

    async def health_check(self) -> HealthStatus:
        start = time.time()
        try:
            client = self._get_client()
            response = await client.get("/models", timeout=5)
            latency = (time.time() - start) * 1000
            if response.status_code < 500:
                models = response.json().get("data", [])
                model_name = models[0]["id"] if models else self.default_model
                return HealthStatus(available=True, latency_ms=latency, model=model_name)
            return HealthStatus(available=False, error=f"HTTP {response.status_code}")
        except Exception as e:
            return HealthStatus(available=False, error=str(e))

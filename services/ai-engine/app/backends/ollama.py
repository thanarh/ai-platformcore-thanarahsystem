"""Native Ollama backend adapter using the /api/chat protocol."""

import json
import logging
import time
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx

from app.backends.base import AIBackend, AIRequest, AIResponse, HealthStatus
from app.backends.openai_compatible import THANARAH_SYSTEM_PROMPT
from app.config import settings

logger = logging.getLogger(__name__)


class OllamaBackend(AIBackend):
    """Local Ollama inference backend."""

    def __init__(self):
        super().__init__(backend_id="thanarah-local", name="ذكاء ثنارة المحلي")
        self.base_url = settings.local_ai_base_url.rstrip("/")
        self.default_model = settings.local_ai_model
        self.priority = 90
        self.enabled = settings.local_ai_enabled
        self._client = None
        self._slots = asyncio.Semaphore(max(1, settings.local_ai_max_concurrency))
        self._queue_lock = asyncio.Lock()
        self._queued = 0

    @asynccontextmanager
    async def _generation_slot(self):
        async with self._queue_lock:
            if self._queued >= max(1, settings.local_ai_max_queue):
                raise RuntimeError("Thanarah local queue is full")
            self._queued += 1
        acquired = False
        try:
            await asyncio.wait_for(
                self._slots.acquire(),
                timeout=max(1.0, settings.local_ai_queue_timeout_seconds),
            )
            acquired = True
            yield
        finally:
            if acquired:
                self._slots.release()
            async with self._queue_lock:
                self._queued = max(0, self._queued - 1)

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(
                    connect=5.0,
                    read=600.0,
                    write=30.0,
                    pool=10.0,
                ),
            )
        return self._client

    def _build_messages(self, request: AIRequest) -> list:
        system = request.system_prompt or THANARAH_SYSTEM_PROMPT
        system += (
            "\nأجب مباشرةً وبوضوح، ولا تعرض سلسلة التفكير أو التحليل الداخلي. "
            "إذا احتوى السياق على معلومات مؤسسية فاستخدمها بدقة ولا تخترع حقائق غير موجودة."
        )
        if request.context:
            system += f"\n\n--- Thanarah Context ---\n{request.context}"
        return [{"role": "system", "content": system}, *request.messages]

    def _options(self, request: AIRequest) -> dict:
        return {
            "num_predict": max(32, min(request.max_tokens, settings.local_ai_max_tokens_deep)),
            "temperature": request.temperature,
            "num_ctx": settings.local_ai_num_ctx,
            "num_thread": settings.local_ai_num_thread,
            "num_batch": settings.local_ai_num_batch,
            "top_p": 0.9,
            "top_k": 40,
            "repeat_penalty": 1.1,
        }

    def _model(self, request: AIRequest) -> str:
        model = request.model or self.default_model
        if not model:
            raise RuntimeError("LOCAL_AI_MODEL is not configured")
        return model

    def _keep_alive(self) -> str | int:
        """Return duration strings as-is and numeric values as JSON numbers."""
        value = settings.local_ai_keep_alive.strip()
        try:
            return int(value)
        except ValueError:
            return value

    async def is_available(self) -> bool:
        return (await self.health_check()).available

    async def chat(self, request: AIRequest) -> AIResponse:
        start = time.time()
        model = self._model(request)
        try:
            async with self._generation_slot():
                response = await self._get_client().post(
                    "/api/chat",
                    json={
                        "model": model,
                        "messages": self._build_messages(request),
                        "stream": False,
                        "think": False,
                        "keep_alive": self._keep_alive(),
                        "options": self._options(request),
                    },
                )
            response.raise_for_status()
            data = response.json()
            latency = (time.time() - start) * 1000
            self.record_success(latency)
            return AIResponse(
                content=data.get("message", {}).get("content", ""),
                model="thanarah-local",
                backend=self.backend_id,
                input_tokens=data.get("prompt_eval_count", 0),
                output_tokens=data.get("eval_count", 0),
                finish_reason=data.get("done_reason"),
            )
        except Exception as error:
            self.record_failure()
            logger.error("[%s] chat failed: %s", self.name, error)
            raise

    async def stream_chat(self, request: AIRequest) -> AsyncGenerator[str, None]:
        start = time.time()
        model = self._model(request)
        try:
            async with self._generation_slot():
                async with self._get_client().stream(
                    "POST",
                    "/api/chat",
                    json={
                        "model": model,
                        "messages": self._build_messages(request),
                        "stream": True,
                        "think": False,
                        "keep_alive": self._keep_alive(),
                        "options": self._options(request),
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if data.get("done"):
                            break
            self.record_success((time.time() - start) * 1000)
        except Exception as error:
            self.record_failure()
            logger.error("[%s] stream failed: %s", self.name, error)
            raise

    async def health_check(self) -> HealthStatus:
        start = time.time()
        try:
            response = await self._get_client().get("/api/tags", timeout=5)
            response.raise_for_status()
            models = response.json().get("models", [])
            names = {
                model.get("name") or model.get("model")
                for model in models
            }
            latency = (time.time() - start) * 1000
            if self.default_model and self.default_model not in names:
                return HealthStatus(
                    available=False,
                    latency_ms=latency,
                    error=f"Model {self.default_model} is not installed",
                )
            active_model = self.default_model or next(iter(names), None)
            return HealthStatus(
                available=bool(active_model),
                latency_ms=latency,
                model="thanarah-local" if active_model else None,
                error=None if active_model else "No local model is installed",
            )
        except Exception as error:
            return HealthStatus(available=False, error=str(error))

    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({"type": "thanarah", "model": "thanarah-local"})
        return data

"""Native Ollama backend adapter using the /api/chat protocol."""

import json
import logging
import time
import asyncio
from datetime import datetime, timezone
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
        self._warmup_status = {
            "ollamaReachable": False,
            "ollamaAvailable": False,
            "modelAvailable": False,
            "modelLoaded": False,
            "modelWarm": False,
            "generationReady": False,
            "warmupDuration": None,
            "modelLoadMs": None,
            "promptEvalMs": None,
            "evalMs": None,
            "lifecycleEvent": None,
            "lastWarmupAt": None,
        }
        self._last_ollama_reachable: bool | None = None
        self._last_model_loaded: bool | None = None
        self._last_lifecycle_event: str | None = None

    @asynccontextmanager
    async def _generation_slot(self, telemetry=None):
        async with self._queue_lock:
            if self._queued >= max(1, settings.local_ai_max_queue):
                raise RuntimeError("Thanarah local queue is full")
            self._queued += 1
        acquired = False
        queue_started = time.perf_counter()
        try:
            await asyncio.wait_for(
                self._slots.acquire(),
                timeout=max(1.0, settings.local_ai_queue_timeout_seconds),
            )
            acquired = True
            if telemetry is not None:
                telemetry.set_ms(
                    "ollamaQueueMs",
                    (time.perf_counter() - queue_started) * 1000,
                )
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
        value = (
            settings.ollama_keep_alive
            or settings.local_ai_keep_alive
        ).strip()
        try:
            return int(value)
        except ValueError:
            return value

    async def _probe_model_state(self, model: str) -> dict:
        """Observe Ollama/model state without triggering a model load."""
        try:
            response = await self._get_client().get(
                "/api/ps",
                timeout=settings.local_ai_runtime_probe_timeout_seconds,
            )
            response.raise_for_status()
            models = response.json().get("models", [])
            names = {item.get("name") or item.get("model") for item in models}
            loaded = model in names
            restarted = self._last_ollama_reachable is False
            self._last_ollama_reachable = True
            self._last_model_loaded = loaded
            return {
                "ollamaReachable": True,
                "modelLoaded": loaded,
                "ollamaRestarted": restarted,
            }
        except Exception:
            self._last_ollama_reachable = False
            self._last_model_loaded = False
            return {
                "ollamaReachable": False,
                "modelLoaded": False,
                "ollamaRestarted": False,
            }

    def _classify_lifecycle(self, before: dict, load_ms: float) -> str:
        if before.get("ollamaRestarted"):
            event = "OLLAMA_RESTART"
        elif load_ms >= settings.local_ai_cold_load_threshold_ms:
            event = "MODEL_RELOAD" if before.get("modelLoaded") else "COLD_MODEL_LOAD"
        elif before.get("modelLoaded"):
            event = "WARM_MODEL_REQUEST"
        else:
            event = "COLD_MODEL_LOAD"
        self._last_lifecycle_event = event
        return event

    def _record_generation_lifecycle(
        self,
        telemetry,
        before: dict,
        data: dict,
    ) -> str:
        load_ms = float(data.get("load_duration", 0) or 0) / 1_000_000
        event = self._classify_lifecycle(before, load_ms)
        self._last_model_loaded = True
        self._last_ollama_reachable = True
        if telemetry is not None:
            telemetry.set("lifecycleEvent", event)
            telemetry.set("ollamaReachable", bool(before.get("ollamaReachable")))
            telemetry.set("modelAvailable", True)
            telemetry.set("modelLoadedBefore", bool(before.get("modelLoaded")))
            telemetry.set("generationReady", bool(data.get("done")))
            telemetry.set_ms("modelLoadMs", load_ms)
            telemetry.set_ms(
                "ollamaPromptEvalMs",
                float(data.get("prompt_eval_duration", 0) or 0) / 1_000_000,
            )
            telemetry.set_ms(
                "ollamaEvalMs",
                float(data.get("eval_duration", 0) or 0) / 1_000_000,
            )
        return event

    async def is_available(self) -> bool:
        return (await self.health_check()).available

    async def warmup(self) -> dict:
        """Perform a real minimal generation before declaring AI ready."""
        started = time.perf_counter()
        status = {
            "ollamaReachable": False,
            "ollamaAvailable": False,
            "modelAvailable": False,
            "modelLoaded": False,
            "modelWarm": False,
            "generationReady": False,
            "warmupDuration": None,
            "modelLoadMs": None,
            "promptEvalMs": None,
            "evalMs": None,
            "lifecycleEvent": None,
            "lastWarmupAt": None,
        }
        try:
            tags = await self._get_client().get("/api/tags", timeout=5)
            tags.raise_for_status()
            status["ollamaReachable"] = True
            status["ollamaAvailable"] = True
            models = tags.json().get("models", [])
            names = {item.get("name") or item.get("model") for item in models}
            model = self._model(AIRequest(messages=[]))
            status["modelAvailable"] = model in names
            if not status["modelAvailable"]:
                return status
            before = await self._probe_model_state(model)
            response = await self._get_client().post(
                "/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "جاهز"}],
                    "stream": False,
                    "think": False,
                    "keep_alive": self._keep_alive(),
                    "options": {"num_predict": 1, "temperature": 0},
                },
                timeout=httpx.Timeout(connect=5, read=90, write=10, pool=10),
            )
            response.raise_for_status()
            data = response.json()
            load_ms = float(data.get("load_duration", 0) or 0) / 1_000_000
            event = self._classify_lifecycle(before, load_ms)
            after = await self._probe_model_state(model)
            status["modelLoaded"] = bool(after.get("modelLoaded"))
            status["modelWarm"] = bool(data.get("done")) and status["modelLoaded"]
            status["generationReady"] = status["modelWarm"]
            status["modelLoadMs"] = round(load_ms, 2)
            status["promptEvalMs"] = round(
                float(data.get("prompt_eval_duration", 0) or 0) / 1_000_000,
                2,
            )
            status["evalMs"] = round(
                float(data.get("eval_duration", 0) or 0) / 1_000_000,
                2,
            )
            status["lifecycleEvent"] = event
            status["lastWarmupAt"] = datetime.now(timezone.utc).isoformat()
        except Exception as exc:
            logger.warning("Ollama warm-up failed: %s", str(exc)[:180])
            status["error"] = type(exc).__name__
        finally:
            status["warmupDuration"] = round((time.perf_counter() - started) * 1000, 2)
            self._warmup_status = status
        return status

    def warmup_status(self) -> dict:
        return dict(self._warmup_status)

    async def chat(self, request: AIRequest) -> AIResponse:
        start = time.time()
        model = self._model(request)
        try:
            lifecycle_before = await self._probe_model_state(model)
            async with self._generation_slot(request.telemetry):
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
            self._record_generation_lifecycle(request.telemetry, lifecycle_before, data)
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
        lifecycle_before = await self._probe_model_state(model)
        try:
            async with self._generation_slot(request.telemetry):
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
                            self._record_generation_lifecycle(
                                request.telemetry,
                                lifecycle_before,
                                data,
                            )
                            if request.telemetry is not None:
                                request.telemetry.set(
                                    "inputTokens",
                                    int(data.get("prompt_eval_count", 0) or 0),
                                )
                                request.telemetry.set(
                                    "outputTokens",
                                    int(data.get("eval_count", 0) or 0),
                                )
                            break
            self.record_success((time.time() - start) * 1000)
        except Exception as error:
            self.record_failure()
            logger.error("[%s] stream failed: %s", self.name, error)
            raise

    async def health_check(self) -> HealthStatus:
        start = time.time()
        try:
            tags_response = await self._get_client().get("/api/tags", timeout=5)
            tags_response.raise_for_status()
            available_names = {
                item.get("name") or item.get("model")
                for item in tags_response.json().get("models", [])
            }
            model = self.default_model
            model_available = bool(model and model in available_names)
            state = await self._probe_model_state(model) if model else {
                "ollamaReachable": True,
                "modelLoaded": False,
            }
            latency = (time.time() - start) * 1000
            status = dict(self._warmup_status)
            status.update(
                {
                    "ollamaReachable": state.get("ollamaReachable", False),
                    "ollamaAvailable": state.get("ollamaReachable", False),
                    "modelAvailable": model_available,
                    "modelLoaded": state.get("modelLoaded", False),
                    "modelWarm": bool(
                        state.get("modelLoaded", False)
                        and status.get("generationReady", False)
                    ),
                    "generationReady": bool(
                        state.get("modelLoaded", False)
                        and status.get("generationReady", False)
                    ),
                }
            )
            self._warmup_status = status
            if not state.get("ollamaReachable"):
                return HealthStatus(
                    available=False,
                    latency_ms=latency,
                    error="Ollama is not reachable",
                )
            if not model_available:
                return HealthStatus(
                    available=False,
                    latency_ms=latency,
                    error=f"Model {model} is not available",
                )
            if not state.get("modelLoaded"):
                return HealthStatus(
                    available=False,
                    latency_ms=latency,
                    model="thanarah-local",
                    error=f"Model {model} is available but not loaded",
                )
            return HealthStatus(
                available=True,
                latency_ms=latency,
                model="thanarah-local",
                error=None,
            )
        except Exception as error:
            return HealthStatus(available=False, error=str(error))

    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({"type": "thanarah", "model": "thanarah-local"})
        return data

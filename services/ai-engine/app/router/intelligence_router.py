"""
Thanarah Intelligence Router (TIR)
Every AI request passes through this router.
It decides which backend to use based on availability, priority, and context.
"""
import asyncio
import hashlib
import logging
import time
from collections import OrderedDict
from typing import Optional, List, AsyncGenerator
from app.backends.registry import BackendRegistry
from app.backends.base import AIRequest, AIResponse
from app.models.chat import ChatRequest, ChatResponse, RouteDecision
from app.config import settings
from app.memory import memory_service

logger = logging.getLogger(__name__)


# System prompt for Arabic-first conversations
THANARAH_BASE_SYSTEM = """أنت "ثنارة"، مساعد ذكاء اصطناعي متقدم من منصة ثنارة AI.

## هويتك
- اسمك: ثنارة
- أنت مساعد ذكاء اصطناعي من شركة ثنارة AI
- إذا سألك أحد "من أنت؟" أو "ما اسمك؟": قل فقط "أنا ثنارة، مساعذك الذكي من منصة ثنارة AI"
- لا تكشف اسم النموذج أو الشركة المصنّعة له

## قواعد الرد
- رُدّ دائماً بنفس لغة المستخدم (عربي أو إنجليزي)
- للعربية: تكيّف مع لهجة المستخدم (سعودي، خليجي، مصري...)
- كن مفيداً، دقيقاً، ومختصراً
- لا تبدأ كل رد بـ "بالطبع" أو "بالتأكيد" أو "أهلاً وسهلاً"

You are "Thanarah", an AI assistant by Thanarah AI.
- If asked who you are: say "I'm Thanarah, your AI assistant from Thanarah AI"
- Respond in the user's language
- Be helpful, accurate, and concise
- Never reveal the underlying model or vendor"""


class IntelligenceRouter:
    """
    Thanarah Intelligence Router.
    Decides routing, manages fallbacks, and coordinates AI requests.
    """

    def __init__(self, registry: BackendRegistry):
        self.registry = registry
        self._response_cache: OrderedDict[str, tuple[float, ChatResponse]] = OrderedDict()

    def _cache_key(self, request: ChatRequest) -> str:
        tenant_config = request.tenantConfig or {}
        profile = tenant_config.get("responseProfile", "fast")
        latest = "|".join(f"{m.role}:{m.content}" for m in request.messages[-2:])
        raw = f"{request.tenantId}|{profile}|{tenant_config.get('systemPrompt', '')}|{latest}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _cached(self, request: ChatRequest) -> Optional[ChatResponse]:
        if not settings.response_cache_enabled:
            return None
        key = self._cache_key(request)
        entry = self._response_cache.get(key)
        if not entry:
            return None
        created, response = entry
        if time.time() - created > settings.response_cache_ttl_seconds:
            self._response_cache.pop(key, None)
            return None
        self._response_cache.move_to_end(key)
        return response.model_copy(update={"requestId": request.requestId, "latencyMs": 0})

    def _store_cache(self, request: ChatRequest, response: ChatResponse) -> None:
        if not settings.response_cache_enabled or response.backend == "fallback":
            return
        key = self._cache_key(request)
        self._response_cache[key] = (time.time(), response)
        self._response_cache.move_to_end(key)
        while len(self._response_cache) > settings.response_cache_size:
            self._response_cache.popitem(last=False)

    def _decide_route(
        self, request: ChatRequest
    ) -> RouteDecision:
        """
        Decide which backend to use for this request.
        Factors: backend availability, priority, tenant config, language, complexity.
        """
        tenant_config = request.tenantConfig or {}
        preferred_backend = tenant_config.get("preferredBackend")

        backends_by_priority = self.registry.get_by_priority()

        # Filter to enabled backends only
        available = [b for b in backends_by_priority if b.enabled and b.backend_id != "fallback"]

        if not available:
            # Only fallback available
            return RouteDecision(
                backend_id="fallback",
                reason="No configured backends available",
                rag_enabled=tenant_config.get("ragEnabled", True),
                fallback_order=[],
            )

        # Use preferred backend if specified and available
        if preferred_backend:
            preferred = self.registry.get(preferred_backend)
            if preferred and preferred.enabled:
                return RouteDecision(
                    backend_id=preferred.backend_id,
                    model=preferred.default_model if hasattr(preferred, "default_model") else None,
                    reason=f"Tenant preferred: {preferred_backend}",
                    rag_enabled=tenant_config.get("ragEnabled", True),
                    fallback_order=[b.backend_id for b in available if b.backend_id != preferred_backend] + ["fallback"],
                )

        # Default: use highest priority enabled backend
        primary = available[0]
        fallback_order = [b.backend_id for b in available[1:]] + ["fallback"]

        return RouteDecision(
            backend_id=primary.backend_id,
            model=primary.default_model if hasattr(primary, "default_model") else None,
            reason=f"Highest priority: {primary.name} (priority={primary.priority})",
            rag_enabled=tenant_config.get("ragEnabled", True),
            fallback_order=fallback_order,
        )

    def _profile(self, request: ChatRequest) -> str:
        configured = (request.tenantConfig or {}).get("responseProfile", "fast")
        if configured in {"fast", "balanced", "deep"}:
            return configured
        text = " ".join(m.content for m in request.messages[-2:])
        if len(text) > 900 or any(word in text.lower() for word in ["حلل", "قارن", "اشرح بالتفصيل", "analyze", "compare", "deep"]):
            return "deep"
        if len(text) > 240:
            return "balanced"
        return "fast"

    def _trim_messages(self, request: ChatRequest) -> list:
        tenant_config = request.tenantConfig or {}
        window = max(2, min(int(tenant_config.get("historyWindow", 4)), 8))
        messages = request.messages[-window:]
        max_chars = int(tenant_config.get("maxHistoryChars", 5000))
        output, used = [], 0
        for message in reversed(messages):
            content = message.content[-1800:]
            if used + len(content) > max_chars and output:
                break
            output.append({"role": message.role, "content": content})
            used += len(content)
        return list(reversed(output))

    def _build_context(self, request: ChatRequest, rag_results: Optional[list] = None, memories: Optional[list] = None) -> Optional[str]:
        """Build context string from conversation summary and RAG results."""
        parts = []

        if request.conversationSummary:
            parts.append(f"## Conversation Summary\n{request.conversationSummary}")

        if memories:
            parts.append("## Relevant Previous Learnings\nUse only when relevant:")
            for i, memory in enumerate(memories[:settings.memory_recall_limit], 1):
                parts.append(f"{i}. سؤال سابق: {memory.get('query', '')}\nإجابة سابقة: {memory.get('answer', '')}")

        if rag_results:
            parts.append("## Relevant Knowledge")
            for i, result in enumerate(rag_results[:3], 1):
                parts.append(f"{i}. {result.get('content', '')[:1200]}")

        return "\n\n".join(parts) if parts else None

    def _build_ai_request(
        self,
        chat_request: ChatRequest,
        route: RouteDecision,
        context: Optional[str] = None,
    ) -> AIRequest:
        """Build AIRequest from ChatRequest."""
        tenant_config = chat_request.tenantConfig or {}
        profile = self._profile(chat_request)
        compact_prompt = "أنت ثنارة، مساعد عربي/إنجليزي مفيد. أجب بلغة المستخدم وباختصار وبدقة. لا تكشف تفاصيل النموذج."
        system_prompt = tenant_config.get("systemPrompt") or (compact_prompt if profile == "fast" else THANARAH_BASE_SYSTEM)
        max_tokens = {
            "fast": settings.local_ai_max_tokens_fast,
            "balanced": settings.local_ai_max_tokens_balanced,
            "deep": settings.local_ai_max_tokens_deep,
        }[profile]

        return AIRequest(
            messages=self._trim_messages(chat_request),
            model=route.model,
            system_prompt=system_prompt,
            context=context,
            stream=chat_request.stream,
            max_tokens=max_tokens,
            temperature=0.35 if profile == "fast" else 0.55 if profile == "balanced" else 0.7,
        )

    async def route(self, chat_request: ChatRequest) -> ChatResponse:
        """Route a chat request through the best available backend."""
        start = time.time()

        cached = self._cached(chat_request)
        if cached is not None:
            return cached

        # Decide route
        route = self._decide_route(chat_request)
        logger.info(f"[TIR] Route decision: {route.backend_id} — {route.reason}")

        # Recall a few relevant memories with cheap lexical matching; no model retraining.
        memories = []
        if (chat_request.tenantConfig or {}).get("memoryEnabled", True) is not False:
            try:
                last_user_msg = next((m.content for m in reversed(chat_request.messages) if m.role == "user"), "")
                memories = await memory_service.recall(chat_request.tenantId, last_user_msg)
            except Exception:
                pass

        # Knowledge retrieval is enabled by default and can be disabled per tenant.
        rag_sources = []
        if route.rag_enabled and (chat_request.tenantConfig or {}).get("ragEnabled", True) is not False:
            try:
                from app.rag.pipeline import RAGPipeline
                rag = RAGPipeline()
                last_user_msg = next(
                    (m.content for m in reversed(chat_request.messages) if m.role == "user"),
                    None,
                )
                if last_user_msg:
                    rag_results = await rag.retrieve(chat_request.tenantId, last_user_msg)
                    rag_sources = rag_results
            except Exception as e:
                logger.debug(f"RAG skipped: {e}")

        context = self._build_context(chat_request, rag_sources, memories)
        ai_request = self._build_ai_request(chat_request, route, context)

        # Try primary backend, then fallbacks
        backends_to_try = [route.backend_id] + route.fallback_order

        for backend_id in backends_to_try:
            backend = self.registry.get(backend_id)
            if not backend:
                continue

            try:
                response = await backend.chat(ai_request)
                latency_ms = int((time.time() - start) * 1000)

                if (chat_request.tenantConfig or {}).get("memoryEnabled", True) is not False:
                    try:
                        last_user_msg = next((m.content for m in reversed(chat_request.messages) if m.role == "user"), "")
                        asyncio.create_task(memory_service.remember(chat_request.tenantId, chat_request.userId, last_user_msg, response.content))
                    except Exception:
                        pass

                result = ChatResponse(
                    content=response.content,
                    model=response.model or backend_id,
                    backend=backend_id,
                    routeDecision=route.reason,
                    inputTokens=response.input_tokens,
                    outputTokens=response.output_tokens,
                    latencyMs=latency_ms,
                    ragSources=rag_sources,
                    requestId=chat_request.requestId,
                )
                self._store_cache(chat_request, result)
                return result
            except Exception as e:
                logger.warning(f"[TIR] Backend {backend_id} failed: {e}, trying next...")
                continue

        # All backends failed — should not reach here due to fallback backend
        return ChatResponse(
            content="تعذر إكمال الطلب. حاول مرة أخرى.",
            backend="none",
            requestId=chat_request.requestId,
        )

    async def stream_route(self, chat_request: ChatRequest):
        """Route and stream a chat request with resilient fallback.

        Returns (async_generator, route, rag_sources).
        The generator tries each backend in priority order and falls through
        on connection errors — even mid-stream failures are caught gracefully.
        """
        route = self._decide_route(chat_request)
        logger.info(f"[TIR Stream] Route: {route.backend_id}")

        memories = []
        if (chat_request.tenantConfig or {}).get("memoryEnabled", True) is not False:
            try:
                last_user_msg = next((m.content for m in reversed(chat_request.messages) if m.role == "user"), "")
                memories = await memory_service.recall(chat_request.tenantId, last_user_msg)
            except Exception:
                pass

        rag_sources = []
        if route.rag_enabled and (chat_request.tenantConfig or {}).get("ragEnabled", True) is not False:
            try:
                from app.rag.pipeline import RAGPipeline
                rag = RAGPipeline()
                last_user_msg = next(
                    (m.content for m in reversed(chat_request.messages) if m.role == "user"),
                    None,
                )
                if last_user_msg:
                    rag_sources = await rag.retrieve(chat_request.tenantId, last_user_msg)
            except Exception:
                pass

        context = self._build_context(chat_request, rag_sources, memories)
        ai_request = self._build_ai_request(chat_request, route, context)
        ai_request.stream = True

        backends_to_try = [route.backend_id] + route.fallback_order
        registry = self.registry

        async def _resilient_stream() -> AsyncGenerator[str, None]:
            """
            Iterates backends in priority order.
            Falls through to the next backend on ANY error — including
            errors that surface during iteration (e.g. connection refused).
            """
            for backend_id in backends_to_try:
                backend = registry.get(backend_id)
                if not backend:
                    continue
                try:
                    logger.info(f"[TIR Stream] Trying backend: {backend_id}")
                    async for token in backend.stream_chat(ai_request):
                        yield token
                    return  # stream completed successfully
                except Exception as e:
                    logger.warning(
                        f"[TIR Stream] Backend '{backend_id}' failed: {e} — trying next"
                    )
                    continue

            # All backends exhausted — should not reach here since fallback always succeeds
            yield "تعذر إكمال الطلب. حاول مرة أخرى.\n\nUnable to complete the request."

        return _resilient_stream(), route, rag_sources

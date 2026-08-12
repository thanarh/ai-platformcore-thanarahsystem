"""
Thanarah Intelligence Router (TIR)
Every AI request passes through this router.
It decides which backend to use based on availability, priority, and context.
"""
import logging
import time
from typing import Optional, List, AsyncGenerator
from app.backends.registry import BackendRegistry
from app.backends.base import AIRequest, AIResponse
from app.models.chat import ChatRequest, ChatResponse, RouteDecision

logger = logging.getLogger(__name__)


# System prompt for Arabic-first conversations
THANARAH_BASE_SYSTEM = """أنت مساعد ذكاء اصطناعي متقدم من ثنارة AI.

قدراتك اللغوية:
- تفهم العربية الفصحى والمحكية (السعودية، الخليجية، المصرية، الشامية، المغربية)
- تفهم المزج بين العربية والإنجليزية (Arabizi وغيره)
- تتعامل مع الأخطاء الإملائية والكتابة غير الرسمية بذكاء
- تردّ بنفس لهجة المستخدم عند الاقتضاء

You are an advanced AI assistant by Thanarah AI.
- Respond naturally in the user's language (Arabic or English)
- For Arabic, match the dialect and style of the user
- Be helpful, accurate, and professional
- Never expose internal architecture or model names to end users"""


class IntelligenceRouter:
    """
    Thanarah Intelligence Router.
    Decides routing, manages fallbacks, and coordinates AI requests.
    """

    def __init__(self, registry: BackendRegistry):
        self.registry = registry

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
                rag_enabled=False,
                fallback_order=["fallback"],
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

    def _build_context(self, request: ChatRequest, rag_results: Optional[list] = None) -> Optional[str]:
        """Build context string from conversation summary and RAG results."""
        parts = []

        if request.conversationSummary:
            parts.append(f"## Conversation Summary\n{request.conversationSummary}")

        if rag_results:
            parts.append("## Relevant Knowledge")
            for i, result in enumerate(rag_results[:5], 1):
                parts.append(f"{i}. {result.get('content', '')}")

        return "\n\n".join(parts) if parts else None

    def _build_ai_request(
        self,
        chat_request: ChatRequest,
        route: RouteDecision,
        context: Optional[str] = None,
    ) -> AIRequest:
        """Build AIRequest from ChatRequest."""
        tenant_config = chat_request.tenantConfig or {}
        system_prompt = tenant_config.get("systemPrompt", THANARAH_BASE_SYSTEM)

        return AIRequest(
            messages=[{"role": m.role, "content": m.content} for m in chat_request.messages],
            model=route.model,
            system_prompt=system_prompt,
            context=context,
            stream=chat_request.stream,
            max_tokens=2048,
            temperature=0.7,
        )

    async def route(self, chat_request: ChatRequest) -> ChatResponse:
        """Route a chat request through the best available backend."""
        start = time.time()

        # Decide route
        route = self._decide_route(chat_request)
        logger.info(f"[TIR] Route decision: {route.backend_id} — {route.reason}")

        # Try RAG if enabled (non-blocking — graceful if unavailable)
        rag_sources = []
        if route.rag_enabled:
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

        context = self._build_context(chat_request, rag_sources)
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

                return ChatResponse(
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
        """Route and stream a chat request."""
        route = self._decide_route(chat_request)
        logger.info(f"[TIR Stream] Route: {route.backend_id}")

        rag_sources = []
        if route.rag_enabled:
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

        context = self._build_context(chat_request, rag_sources)
        ai_request = self._build_ai_request(chat_request, route, context)
        ai_request.stream = True

        backends_to_try = [route.backend_id] + route.fallback_order

        for backend_id in backends_to_try:
            backend = self.registry.get(backend_id)
            if not backend:
                continue
            try:
                return backend.stream_chat(ai_request), route, rag_sources
            except Exception as e:
                logger.warning(f"[TIR Stream] Backend {backend_id} failed: {e}")
                continue

        async def _fallback_gen():
            yield "تعذر إكمال الطلب. حاول مرة أخرى."

        return _fallback_gen(), route, []

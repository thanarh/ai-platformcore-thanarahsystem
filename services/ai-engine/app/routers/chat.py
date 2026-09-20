import asyncio
import json
import logging
import secrets
from fastapi import APIRouter, Request, HTTPException, Header
from fastapi.responses import StreamingResponse
from app.models.chat import ChatRequest, ChatResponse
from app.memory import memory_service
from app.response_cache import response_cache_service
from app.config import settings
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class LearnCorrectionRequest(BaseModel):
    tenantId: str
    userId: str | None = None
    query: str
    correctedAnswer: str


@router.post("/learn")
async def learn_correction(
    payload: LearnCorrectionRequest,
    x_thanarah_internal: str | None = Header(default=None),
):
    """Store an explicit user correction as retrieval memory, never silent retraining."""
    if not settings.jwt_secret or not x_thanarah_internal or not secrets.compare_digest(
        x_thanarah_internal,
        settings.jwt_secret,
    ):
        raise HTTPException(status_code=403, detail="Internal access required")
    await response_cache_service.invalidate_tenant(payload.tenantId)
    await memory_service.remember(
        payload.tenantId,
        payload.userId,
        payload.query.strip(),
        payload.correctedAnswer.strip(),
    )
    return {"success": True, "learningMode": "feedback-memory"}


@router.post("", response_model=ChatResponse)
async def chat(request: Request, chat_request: ChatRequest):
    """Process a chat request through the Thanarah Intelligence Router."""
    tir = request.app.state.intelligence_router
    try:
        response = await tir.route(chat_request)
        return response
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def chat_stream(request: Request, chat_request: ChatRequest):
    """Stream a chat response via SSE."""
    tir = request.app.state.intelligence_router

    async def event_generator():
        try:
            stream_gen, route, rag_sources, telemetry = await tir.stream_route(chat_request)
            full_content = []
            async for token in stream_gen:
                if await request.is_disconnected():
                    return
                full_content.append(token)
                data = json.dumps({"delta": token})
                yield f"data: {data}\n\n"

            # Learn from the completed exchange after delivery preparation.
            if (chat_request.tenantConfig or {}).get("memoryEnabled", True) is not False:
                try:
                    last_user_msg = next((m.content for m in reversed(chat_request.messages) if m.role == "user"), "")
                    asyncio.create_task(memory_service.remember(chat_request.tenantId, chat_request.userId, last_user_msg, "".join(full_content)))
                except Exception:
                    pass

            # Send metadata at the end
            meta = {
                "meta": {
                    "backend": route.backend_id,
                    "routeDecision": route.reason,
                    "ragSources": rag_sources,
                    "requestId": telemetry.request_id,
                    "telemetry": telemetry.finish(
                        route=route.backend_id,
                        model=telemetry.values.get("model"),
                        cache_hit=route.backend_id == "thanarah-cache",
                    ),
                }
            }
            yield f"data: {json.dumps(meta)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            error_data = json.dumps({"error": True, "content": "تعذر إكمال الطلب حاليًا."})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )

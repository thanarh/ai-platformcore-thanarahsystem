import asyncio
import json
import logging
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.models.chat import ChatRequest, ChatResponse
from app.memory import memory_service

logger = logging.getLogger(__name__)
router = APIRouter()


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
            stream_gen, route, rag_sources = await tir.stream_route(chat_request)
            full_content = []
            async for token in stream_gen:
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
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

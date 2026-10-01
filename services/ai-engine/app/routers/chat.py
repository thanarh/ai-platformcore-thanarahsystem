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
from app.streaming.events import event_frame, legacy_delta_frame, StreamEventType

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
            yield event_frame(StreamEventType.STATUS, {"state": "routing"})
            web_event_queue: asyncio.Queue[dict] = asyncio.Queue()

            async def publish_web_event(event: dict):
                await web_event_queue.put(event)

            route_task = asyncio.create_task(
                tir.stream_route(chat_request, event_callback=publish_web_event)
            )
            live_web_event_count = 0
            try:
                while True:
                    if route_task.done():
                        if web_event_queue.empty():
                            break
                        event = web_event_queue.get_nowait()
                    else:
                        event_task = asyncio.create_task(web_event_queue.get())
                        done, _ = await asyncio.wait(
                            {route_task, event_task},
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                        if event_task in done:
                            event = event_task.result()
                        else:
                            event_task.cancel()
                            await asyncio.gather(event_task, return_exceptions=True)
                            continue
                    event_name = event.get("event", "status")
                    payload = {key: value for key, value in event.items() if key != "event"}
                    yield event_frame(event_name, payload)
                    live_web_event_count += 1
                stream_result = await route_task
            except BaseException:
                route_task.cancel()
                await asyncio.gather(route_task, return_exceptions=True)
                raise

            if len(stream_result) == 4:
                stream_gen, route, rag_sources, telemetry = stream_result
                web_events = []
            else:
                stream_gen, route, rag_sources, telemetry, web_events = stream_result
            if live_web_event_count == 0:
                for event in web_events:
                    event_name = event.get("event", "status")
                    payload = {key: value for key, value in event.items() if key != "event"}
                    yield event_frame(event_name, payload)
            yield event_frame(StreamEventType.STATUS, {"state": "generating"})
            full_content = []
            first_delta = False
            async for token in stream_gen:
                if await request.is_disconnected():
                    return
                full_content.append(token)
                if not first_delta:
                    first_delta = True
                    telemetry.add_ms("sseFirstDeltaMs", telemetry.started_at)
                yield legacy_delta_frame(token)

            # Learn from the completed exchange after delivery preparation.
            if (chat_request.tenantConfig or {}).get("memoryEnabled", True) is not False:
                try:
                    last_user_msg = next((m.content for m in reversed(chat_request.messages) if m.role == "user"), "")
                    asyncio.create_task(memory_service.remember(chat_request.tenantId, chat_request.userId, last_user_msg, "".join(full_content)))
                except Exception:
                    pass

            yield event_frame(StreamEventType.DONE, {"state": "completed"})
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
            yield event_frame(
                StreamEventType.ERROR,
                {"error": True, "content": "تعذر إكمال الطلب حاليًا."},
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )

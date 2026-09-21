from __future__ import annotations

import hmac
import time
from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import settings
from app.voice.contracts import VOICE_CAPABILITIES
from app.voice.runtime import VoiceInputError, VoiceRuntimeError, voice_runtime


router = APIRouter()


@router.get("/capabilities")
async def voice_capabilities(request: Request):
    return {
        **VOICE_CAPABILITIES,
        **voice_runtime.capabilities(),
    }


def _principal(
    tenant_id: str | None,
    user_id: str | None,
    internal: str | None,
) -> dict[str, str]:
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Authenticated tenant and user context required")
    if settings.node_env.lower() == "production":
        if not settings.jwt_secret or not internal or not hmac.compare_digest(internal, settings.jwt_secret):
            raise HTTPException(status_code=403, detail="Internal access required")
    return {"tenantId": tenant_id, "userId": user_id}


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("ar"),
    x_thanarah_tenant_id: str | None = Header(default=None),
    x_thanarah_user_id: str | None = Header(default=None),
    x_thanarah_internal: str | None = Header(default=None),
):
    _principal(x_thanarah_tenant_id, x_thanarah_user_id, x_thanarah_internal)
    content = await audio.read(settings.voice_max_audio_bytes + 1)
    if len(content) > settings.voice_max_audio_bytes:
        raise HTTPException(status_code=413, detail="Audio exceeds the maximum allowed size")
    started = time.perf_counter()
    try:
        result = await voice_runtime.transcribe(content, audio.content_type or "", language)
    except VoiceInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except VoiceRuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "transcript": result.text,
        "language": result.language,
        "languageProbability": result.language_probability,
        "durationMs": result.duration_ms,
        "latencyMs": result.latency_ms,
        "provider": result.provider,
        "audioStored": False,
        "requestLatencyMs": round((time.perf_counter() - started) * 1000),
    }


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    language: str = "ar"


@router.post("/synthesize")
async def synthesize(
    payload: SynthesizeRequest,
    x_thanarah_tenant_id: str | None = Header(default=None),
    x_thanarah_user_id: str | None = Header(default=None),
    x_thanarah_internal: str | None = Header(default=None),
):
    _principal(x_thanarah_tenant_id, x_thanarah_user_id, x_thanarah_internal)
    try:
        result = await voice_runtime.synthesize(payload.text, payload.language)
    except VoiceInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except VoiceRuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=result.content,
        media_type=result.mime_type,
        headers={
            "Cache-Control": "no-store",
            "X-Thanarah-Voice-Language": result.language,
            "X-Thanarah-Voice-Provider": result.provider,
            "X-Thanarah-Voice-Latency-Ms": str(result.latency_ms),
        },
    )
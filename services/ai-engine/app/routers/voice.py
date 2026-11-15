from __future__ import annotations

import hmac
import time
from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import settings
from app.voice.contracts import VOICE_CAPABILITIES
from app.voice.runtime import VoiceBusyError, VoiceInputError, VoiceRuntimeError, voice_runtime


router = APIRouter()

_VOICE_ERROR_MESSAGES = {
    "Unsupported audio MIME type": "صيغة التسجيل غير مدعومة. أعد التسجيل من زر الصوت وحاول مجددًا.",
    "Audio exceeds the maximum allowed size": "حجم التسجيل أكبر من الحد المسموح. أرسل تسجيلًا أقصر.",
    "Audio exceeds the maximum allowed duration": "مدة التسجيل أطول من المسموح. أرسل تسجيلًا أقصر.",
    "Malformed audio": "تعذر قراءة التسجيل. أعد تسجيله بصيغة صوت مدعومة.",
    "Audio contains no duration": "لم يصل صوت واضح من الميكروفون. تحقق من إذن الميكروفون ثم أعد المحاولة.",
    "Audio processing failed": "تعذر معالجة التسجيل. أعد تسجيله وحاول مرة أخرى.",
    "Local STT is unavailable": "خدمة تحويل الصوت غير متاحة حاليًا. أعد المحاولة بعد قليل.",
    "Local STT request timed out": "استغرقت معالجة التسجيل وقتًا طويلًا. جرّب تسجيلًا أقصر.",
    "Local STT worker stopped": "توقفت خدمة تحويل الصوت أثناء المعالجة. أعد المحاولة.",
    "Local STT worker is unavailable": "خدمة تحويل الصوت غير متاحة حاليًا. أعد المحاولة بعد قليل.",
    "Local STT worker returned an invalid response": "تعذر قراءة نتيجة تحويل الصوت. أعد المحاولة.",
    "Local STT failed": "تعذر التعرّف على الكلام في التسجيل. جرّب تسجيلًا أوضح.",
    "Local voice process timed out": "استغرقت معالجة التسجيل وقتًا طويلًا. جرّب تسجيلًا أقصر.",
    "Local voice process is unavailable": "أدوات معالجة الصوت غير متاحة حاليًا. أعد المحاولة بعد قليل.",
    "Voice transcription is busy. Please retry shortly.": "خدمة تحويل الصوت مشغولة الآن. انتظر قليلًا ثم أعد المحاولة.",
}


def _voice_error_detail(error: Exception) -> str:
    return _VOICE_ERROR_MESSAGES.get(
        str(error),
        "تعذر معالجة التسجيل الصوتي الآن. أعد تسجيلًا قصيرًا وواضحًا ثم حاول مجددًا.",
    )


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
        raise HTTPException(status_code=400, detail=_voice_error_detail(exc)) from exc
    except VoiceBusyError as exc:
        raise HTTPException(
            status_code=429,
            detail=_voice_error_detail(exc),
            headers={"Retry-After": "2"},
        ) from exc
    except VoiceRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_voice_error_detail(exc)) from exc
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

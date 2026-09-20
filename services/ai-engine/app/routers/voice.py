from fastapi import APIRouter

from app.voice.contracts import VOICE_CAPABILITIES

router = APIRouter()


@router.get("/capabilities")
async def voice_capabilities():
    return VOICE_CAPABILITIES
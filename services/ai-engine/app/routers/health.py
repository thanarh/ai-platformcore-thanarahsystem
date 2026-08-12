from fastapi import APIRouter, Request
from datetime import datetime

router = APIRouter()


@router.get("/health")
async def health(request: Request):
    registry = getattr(request.app.state, "registry", None)
    backends = []
    if registry:
        backends = await registry.get_health()
    return {
        "status": "ok",
        "service": "Thanarah AI Engine",
        "timestamp": datetime.utcnow().isoformat(),
        "backends": backends,
    }

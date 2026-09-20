import time
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.config import settings
from app.database import get_db
from app.response_cache import response_cache_service
from app.telemetry import recent_records
from app.rag.qdrant_store import qdrant_store

router = APIRouter()
_STARTED_AT = time.monotonic()


@router.get("/health")
async def health(request: Request):
    registry = getattr(request.app.state, "registry", None)
    backends = []
    if registry:
        backends = await registry.get_health()
    db = get_db()
    mongo_connected = False
    if db is not None:
        try:
            await db.command("ping")
            mongo_connected = True
        except Exception:
            mongo_connected = False
    local_backend = next(
        (backend for backend in backends if backend.get("id") == "thanarah-local"),
        None,
    )
    warmup_status = getattr(request.app.state, "warmup_status", {})
    if registry:
        local_runtime = registry.get("thanarah-local")
        if local_runtime and hasattr(local_runtime, "warmup_status"):
            warmup_status = local_runtime.warmup_status()
    qdrant_available = await qdrant_store.is_available() if qdrant_store.enabled else False
    return {
        "status": "ok" if mongo_connected and local_backend and local_backend.get("healthy") else "degraded",
        "service": "Thanarah AI Engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptimeSeconds": round(time.monotonic() - _STARTED_AT, 1),
        "ollama": {
            "status": "ok" if local_backend and local_backend.get("healthy") else "error",
            "model": settings.local_ai_model,
            "available": bool(local_backend and local_backend.get("healthy")),
            **warmup_status,
        },
        "mongodb": {"status": "ok" if mongo_connected else "error", "connected": mongo_connected},
        "qdrant": {
            "enabled": qdrant_store.enabled,
            "available": qdrant_available,
            "backend": settings.rag_backend,
            "collection": settings.qdrant_collection,
        },
        "web": {
            "enabled": settings.web_search_enabled,
            "provider": "SearXNG",
            "endpoint": settings.searxng_url,
            "productionSafe": not settings.web_search_enabled,
        },
        "cache": response_cache_service.stats(),
        "telemetry": {"bufferedRecords": len(recent_records(512))},
        "backends": backends,
    }

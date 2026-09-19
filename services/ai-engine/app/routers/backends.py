from fastapi import APIRouter, Request, HTTPException
from app.backends.registry import BackendRegistry
from app.config import settings
from app.embeddings import embedding_service
from app.memory import memory_service

router = APIRouter()


@router.get("/capabilities")
async def capabilities(request: Request):
    """Return branded service readiness without exposing infrastructure details."""
    embedding_info = embedding_service.info()
    memory_info = memory_service.info()
    registry: BackendRegistry = request.app.state.registry
    backend_health = await registry.get_health()
    advanced_ready = any(
        item.get("id") != "fallback" and item.get("enabled") and item.get("healthy")
        for item in backend_health
    )
    return {
        "generation": {
            "enabled": True,
            "advanced": advanced_ready,
            "status": "advanced" if advanced_ready else "core",
            "service": "Thanarah Intelligence",
        },
        "embeddings": {
            "ready": embedding_info.get("ready", True),
            "status": "ready" if embedding_info.get("ready", True) else "initializing",
            "service": "Thanarah Semantic Search",
        },
        "performance": {
            "profiles": ["fast", "balanced", "deep"],
            "defaultProfile": "fast",
        },
        "memory": {
            "enabled": memory_info.get("enabled", True),
            "status": "ready" if memory_info.get("enabled", True) else "disabled",
            "service": "Thanarah Memory",
        },
        "rag": {
            "enabled": True,
            "status": "ready",
            "service": "Thanarah Knowledge",
            "documentFormats": [
                "text/plain",
                "text/markdown",
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ],
        },
    }


@router.get("")
async def list_backends(request: Request):
    registry: BackendRegistry = request.app.state.registry
    health = await registry.get_health()
    branded = []
    for item in health:
        safe = dict(item)
        safe.pop("engine", None)
        safe.pop("baseUrl", None)
        safe["model"] = "thanarah-intelligence"
        if safe.get("id") == "thanarah-advanced":
            safe["name"] = "ذكاء ثنارة المتقدم"
        elif safe.get("id") == "fallback":
            safe["name"] = "ذكاء ثنارة الأساسي"
        else:
            safe["name"] = "ذكاء ثنارة المحلي"
        branded.append(safe)
    return {"backends": branded}


@router.put("/{backend_id}")
async def update_backend(backend_id: str, request: Request, body: dict):
    registry: BackendRegistry = request.app.state.registry
    success = registry.update_backend(backend_id, body)
    if not success:
        raise HTTPException(status_code=404, detail="Backend not found")
    return {"success": True, "backendId": backend_id}


@router.post("/{backend_id}/test")
async def test_backend(backend_id: str, request: Request):
    registry: BackendRegistry = request.app.state.registry
    backend = registry.get(backend_id)
    if not backend:
        raise HTTPException(status_code=404, detail="Backend not found")
    
    from app.backends.base import AIRequest
    test_request = AIRequest(
        messages=[{"role": "user", "content": "Hello, this is a health check. Reply with 'ok'."}],
        max_tokens=20,
        stream=False,
    )
    
    try:
        response = await backend.chat(test_request)
        return {
            "success": True,
            "backendId": backend_id,
            "response": response.content[:100],
            "model": "thanarah-intelligence",
        }
    except Exception as e:
        return {"success": False, "backendId": backend_id, "error": str(e)}

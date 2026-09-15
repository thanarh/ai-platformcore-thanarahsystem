from fastapi import APIRouter, Request, HTTPException
from app.backends.registry import BackendRegistry
from app.config import settings
from app.embeddings import embedding_service
from app.memory import memory_service

router = APIRouter()


@router.get("/capabilities")
async def capabilities():
    """Return the free/local AI capabilities available in this installation."""
    return {
        "generation": {
            "engine": settings.local_ai_engine,
            "model": settings.local_ai_model,
            "enabled": settings.local_ai_enabled,
            "local": True,
            "cost": "free-local",
        },
        "embeddings": embedding_service.info(),
        "performance": {
            "profiles": ["fast", "balanced", "deep"],
            "defaultProfile": "fast",
            "contextWindow": settings.local_ai_num_ctx,
            "threads": settings.local_ai_num_thread,
            "batchSize": settings.local_ai_num_batch,
            "keepAlive": settings.local_ai_keep_alive,
            "trainingPerRequest": False,
        },
        "memory": memory_service.info(),
        "rag": {
            "enabled": True,
            "documentFormats": [
                "text/plain",
                "text/markdown",
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ],
            "storage": "MongoDB with cosine similarity retrieval",
        },
        "optionalProviders": ["openai-compatible", "anthropic"],
    }


@router.get("")
async def list_backends(request: Request):
    registry: BackendRegistry = request.app.state.registry
    health = await registry.get_health()
    return {"backends": health}


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
            "model": response.model,
        }
    except Exception as e:
        return {"success": False, "backendId": backend_id, "error": str(e)}

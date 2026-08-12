from fastapi import APIRouter, Request, HTTPException
from app.backends.registry import BackendRegistry

router = APIRouter()


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

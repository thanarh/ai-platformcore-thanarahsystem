"""
Thanarah AI Engine — Python FastAPI Service
The Thanarah Intelligence Router (TIR) lives here.
"""
import logging
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import chat, knowledge, backends, health, capabilities, voice, web
from app.router.intelligence_router import IntelligenceRouter
from app.backends.registry import BackendRegistry
from app.database import init_db
from app.memory.daily_learning import daily_learning_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("thanarah-ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("🌿 Thanarah AI Engine starting...")

    # Initialize database
    await init_db()

    # Initialize backend registry
    registry = BackendRegistry()
    await registry.initialize()
    app.state.registry = registry
    local_backend = registry.get("thanarah-local")
    if local_backend and hasattr(local_backend, "warmup"):
        app.state.warmup_status = await local_backend.warmup()
    else:
        app.state.warmup_status = {
            "ollamaReachable": False,
            "ollamaAvailable": False,
            "modelAvailable": False,
            "modelLoaded": False,
            "modelWarm": False,
            "generationReady": False,
            "warmupDuration": None,
            "modelLoadMs": None,
            "promptEvalMs": None,
            "evalMs": None,
            "lifecycleEvent": None,
            "lastWarmupAt": None,
        }

    # Initialize intelligence router
    router = IntelligenceRouter(registry)
    app.state.intelligence_router = router
    learning_task = asyncio.create_task(daily_learning_service.worker())

    logger.info("✅ Thanarah AI Engine ready (modelWarm=%s)", app.state.warmup_status["modelWarm"])
    logger.info(f"   Backends: {registry.count()} configured")

    yield

    logger.info("🛑 Thanarah AI Engine shutting down...")
    learning_task.cancel()
    try:
        await learning_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Thanarah AI Engine",
    description="Thanarah Intelligence Router — AI backend service",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, tags=["health"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
app.include_router(backends.router, prefix="/backends", tags=["backends"])
app.include_router(capabilities.router, prefix="/capabilities", tags=["capabilities"])
app.include_router(voice.router, prefix="/voice", tags=["voice"])
app.include_router(web.router, prefix="/web", tags=["web-intelligence"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("AI_ENGINE_PORT", "8000")),
        reload=True,
    )

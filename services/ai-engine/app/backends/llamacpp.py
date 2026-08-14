"""
llama.cpp Backend Adapter
Connects to a running llama.cpp server (llama-server or llama.cpp http server).
llama.cpp exposes an OpenAI-compatible /v1/chat/completions endpoint.
"""
from app.backends.openai_compatible import OpenAICompatibleBackend
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class LlamaCppBackend(OpenAICompatibleBackend):
    """
    Backend for local llama.cpp inference server.
    Run: ./llama-server -m model.gguf --port 8080
    Supports: Qwen, Llama, Gemma, Mistral, and any GGUF model.
    """

    def __init__(self):
        import httpx
        super().__init__(
            backend_id="local-llamacpp",
            name="Local llama.cpp",
            base_url=f"{settings.local_ai_base_url}/v1",
            api_key="not-required",
            model=settings.local_ai_model or None,
            # Short connect timeout so we fail-fast when server is not running.
            # Long read timeout to allow actual inference to complete.
            timeout=httpx.Timeout(connect=3.0, read=180.0, write=10.0, pool=5.0),
        )
        self.priority = 90  # Prefer local AI when available
        self.enabled = settings.local_ai_enabled

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update({
            "type": "local",
            "engine": "llamacpp",
            "baseUrl": settings.local_ai_base_url,
            "model": settings.local_ai_model or "auto",
        })
        return d

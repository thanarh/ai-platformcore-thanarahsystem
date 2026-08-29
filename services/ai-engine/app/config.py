from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    ai_engine_port: int = 8000
    node_env: str = "development"

    # Local AI
    local_ai_enabled: bool = False
    local_ai_engine: str = "ollama"
    local_ai_base_url: str = "http://localhost:11434"
    local_ai_model: str = "qwen2.5:0.5b"

    # External providers (BYOK)
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

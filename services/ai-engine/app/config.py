from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    jwt_secret: str = ""
    ai_engine_port: int = 8000
    node_env: str = "development"

    # Local AI generation — free and local-first by default.
    local_ai_enabled: bool = True
    local_ai_engine: str = "ollama"
    local_ai_base_url: str = "http://localhost:11434"
    local_ai_model: str = "qwen2.5:0.5b"
    local_ai_keep_alive: str = "10m"
    ollama_keep_alive: Optional[str] = None
    local_ai_cold_load_threshold_ms: float = 1000.0
    local_ai_runtime_probe_timeout_seconds: float = 2.0
    local_ai_num_ctx: int = 2048
    local_ai_num_thread: int = 4
    local_ai_num_batch: int = 64
    local_ai_max_concurrency: int = 1
    local_ai_max_queue: int = 32
    local_ai_queue_timeout_seconds: float = 5.0
    local_ai_max_tokens_fast: int = 96
    local_ai_max_tokens_balanced: int = 256
    local_ai_max_tokens_deep: int = 512

    # Lightweight continual memory: retrieval only, never retrains per request.
    memory_enabled: bool = True
    memory_cache_size: int = 256
    memory_recall_limit: int = 3
    memory_scan_limit: int = 5000
    memory_max_per_tenant: int = 100000
    memory_item_chars: int = 1000
    memory_min_score: float = 0.15

    # Exact-response cache for repeated prompts; bounded to protect RAM.
    response_cache_enabled: bool = True
    response_cache_size: int = 2048
    response_cache_ttl_seconds: int = 21600
    response_cache_prompt_ttl_seconds: int = 604800
    persistent_response_cache_enabled: bool = True
    persistent_response_cache_ttl_seconds: int = 604800
    response_cache_db_timeout_seconds: float = 1.0
    response_cache_semantic_scan_limit: int = 250
    response_cache_semantic_min_score: float = 0.92
    rag_max_scan: int = 2000
    rag_default_limit: int = 5
    rag_query_timeout_seconds: float = 15.0
    context_source_timeout_seconds: float = 1.5
    rag_backend: str = "legacy"
    legacy_rag: bool = True
    qdrant_rag: bool = False
    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_collection: str = "thanarah_knowledge"
    qdrant_api_key: Optional[str] = None
    qdrant_timeout_seconds: float = 3.0
    qdrant_candidate_limit: int = 25
    qdrant_enabled: bool = False
    rag_reranker_enabled: bool = True
    rag_reranker_model: str = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
    rag_context_limit: int = 3
    rag_chunk_size: int = 350
    rag_chunk_overlap: int = 40

    # Local embeddings for semantic RAG. Sentence Transformers is optional;
    # the service falls back to deterministic hashing embeddings automatically.
    embedding_provider: str = "auto"
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_device: str = "cpu"
    embedding_fallback_dimension: int = 384

    # External providers are opt-in; local operation is the default.
    allow_external_providers: bool = False
    free_provider_only: bool = True
    free_providers_enabled: bool = False
    groq_api_key: Optional[str] = None
    groq_model: str = "openai/gpt-oss-20b"
    groq_daily_limit: int = 100
    groq_rpm_limit: int = 10
    openrouter_api_key: Optional[str] = None
    openrouter_model: str = "openrouter/free"
    openrouter_daily_limit: int = 100
    openrouter_rpm_limit: int = 10
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None

    # Provider-neutral, OpenAI-compatible primary backend. This enables a
    # quality-first hosted model while preserving local inference as fallback.
    external_ai_enabled: bool = False
    external_ai_api_key: Optional[str] = None
    external_ai_base_url: str = "https://api.openai.com/v1"
    external_ai_model: str = ""
    external_ai_max_tokens_field: str = "max_tokens"
    external_ai_timeout_seconds: float = 90.0
    external_ai_max_retries: int = 2
    external_ai_max_concurrency: int = 16
    external_ai_daily_limit: int = 50000
    external_ai_rpm_limit: int = 300
    external_ai_daily_budget_usd: float = 10.0
    external_ai_input_price_per_million: float = 0.0
    external_ai_output_price_per_million: float = 0.0
    external_ai_max_tokens_fast: int = 256
    external_ai_max_tokens_balanced: int = 768
    external_ai_max_tokens_deep: int = 1600

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )


settings = Settings()

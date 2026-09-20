"""Pydantic models for the AI-engine chat API."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role, such as system, user, or assistant")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    tenantId: str = "default"
    userId: Optional[str] = None
    requestId: Optional[str] = None
    conversationSummary: Optional[str] = None
    tenantConfig: Dict[str, Any] = Field(default_factory=dict)
    runtimeContext: Dict[str, Any] = Field(default_factory=dict)
    stream: bool = False


class RouteDecision(BaseModel):
    backend_id: str
    model: Optional[str] = None
    reason: str
    rag_enabled: bool = False
    fallback_order: List[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    content: str
    model: Optional[str] = None
    backend: Optional[str] = None
    routeDecision: Optional[str] = None
    inputTokens: int = 0
    outputTokens: int = 0
    latencyMs: int = 0
    ragSources: List[Any] = Field(default_factory=list)
    requestId: Optional[str] = None

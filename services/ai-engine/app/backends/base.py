"""
Thanarah AI Backend Interface
All AI backends must implement this interface.
"""
from abc import ABC, abstractmethod
from typing import Optional, List, AsyncGenerator
from dataclasses import dataclass, field


@dataclass
class HealthStatus:
    available: bool
    latency_ms: Optional[float] = None
    error: Optional[str] = None
    model: Optional[str] = None


@dataclass
class AIRequest:
    messages: List[dict]
    model: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.7
    stream: bool = False
    system_prompt: Optional[str] = None
    context: Optional[str] = None
    telemetry: Optional[object] = None


@dataclass
class AIResponse:
    content: str
    model: Optional[str] = None
    backend: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    finish_reason: Optional[str] = None


class AIBackend(ABC):
    """
    Abstract base class for all Thanarah AI backends.
    Adding a new backend: implement this interface and register in BackendRegistry.
    """

    def __init__(self, backend_id: str, name: str):
        self.backend_id = backend_id
        self.name = name
        self.enabled = True
        self.priority = 50  # 1-100, higher = preferred
        self.request_count = 0
        self.failure_count = 0
        self.total_latency_ms = 0

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if this backend is currently reachable."""
        pass

    @abstractmethod
    async def chat(self, request: AIRequest) -> AIResponse:
        """Process a chat request and return a complete response."""
        pass

    @abstractmethod
    async def stream_chat(self, request: AIRequest) -> AsyncGenerator[str, None]:
        """Stream a chat response token by token."""
        pass

    @abstractmethod
    async def health_check(self) -> HealthStatus:
        """Return health status including latency."""
        pass

    def record_success(self, latency_ms: float):
        self.request_count += 1
        self.total_latency_ms += latency_ms

    def record_failure(self):
        self.failure_count += 1

    def avg_latency_ms(self) -> float:
        if self.request_count == 0:
            return 0.0
        return self.total_latency_ms / self.request_count

    def to_dict(self) -> dict:
        return {
            "id": self.backend_id,
            "name": self.name,
            "enabled": self.enabled,
            "priority": self.priority,
            "requestCount": self.request_count,
            "failureCount": self.failure_count,
            "avgLatencyMs": round(self.avg_latency_ms(), 1),
        }

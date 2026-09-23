"""Bounded, privacy-safe telemetry for AI requests.

Telemetry is intentionally local: a small in-process ring buffer plus one
structured log record per request. No prompt, response, tenant, or user data
is ever stored here.
"""

from __future__ import annotations

import json
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

_MAX_RECORDS = 512
_records: deque[dict[str, Any]] = deque(maxlen=_MAX_RECORDS)
_records_lock = Lock()


@dataclass
class RequestTelemetry:
    request_id: str = field(default_factory=lambda: str(uuid4()))
    started_at: float = field(default_factory=time.perf_counter)
    values: dict[str, Any] = field(default_factory=dict)
    _finished: bool = False
    _payload: Optional[dict[str, Any]] = None

    def add_ms(self, name: str, started_at: float) -> None:
        self.values[name] = round(max(0.0, (time.perf_counter() - started_at) * 1000), 2)

    def set_ms(self, name: str, value: float) -> None:
        self.values[name] = round(max(0.0, value), 2)

    def set(self, name: str, value: Any) -> None:
        self.values[name] = value

    def finish(
        self,
        *,
        route: Optional[str] = None,
        model: Optional[str] = None,
        cache_hit: bool = False,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
    ) -> dict[str, Any]:
        if self._finished:
            return self._payload or self.snapshot()
        self._finished = True
        if route is not None:
            self.set("route", route)
        if model is not None:
            self.set("model", model)
        self.set("cacheHit", bool(cache_hit))
        if input_tokens is not None:
            self.set("inputTokens", int(input_tokens or 0))
        if output_tokens is not None:
            self.set("outputTokens", int(output_tokens or 0))
        self.add_ms("totalMs", self.started_at)
        payload = {
            "event": "ai_request_telemetry",
            "requestId": self.request_id,
            "routerMs": 0.0,
            "cacheLookupMs": 0.0,
            "memoryMs": 0.0,
            "retrievalMs": 0.0,
            "embeddingMs": 0.0,
            "contextMs": 0.0,
            "summaryChars": 0,
            "runtimeContextChars": 0,
            "userProfileChars": 0,
            "contextProfileChars": 0,
            "memoryChars": 0,
            "ragChars": 0,
            "webContextChars": 0,
            "contextChars": 0,
            "promptBuildMs": 0.0,
            "systemPromptChars": 0,
            "promptMessageChars": 0,
            "promptChars": 0,
            "promptMessages": 0,
            "ollamaQueueMs": 0.0,
            "ollamaToFirstTokenMs": 0.0,
            "modelLoadMs": 0.0,
            "ollamaPromptEvalMs": 0.0,
            "ollamaEvalMs": 0.0,
            "lifecycleEvent": None,
            "ollamaReachable": None,
            "modelAvailable": None,
            "modelLoadedBefore": None,
            "generationReady": None,
            "timeToFirstTokenMs": 0.0,
            "sseFirstDeltaMs": 0.0,
            "sseTransmissionMs": 0.0,
            "generationMs": 0.0,
            "totalMs": 0.0,
            "inputTokens": 0,
            "outputTokens": 0,
            "model": None,
            "route": None,
            "cacheHit": False,
            **self.values,
        }
        with _records_lock:
            _records.append(payload)
        self._payload = payload
        # Structured, bounded, privacy-safe: never include request content.
        logger.info(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        return payload

    def snapshot(self) -> dict[str, Any]:
        return {"requestId": self.request_id, **self.values}


def recent_records(limit: int = 50) -> list[dict[str, Any]]:
    """Return a bounded copy for internal diagnostics/tests."""
    with _records_lock:
        return list(_records)[-max(0, min(limit, _MAX_RECORDS)) :]


def clear_records() -> None:
    """Clear the local collector; intended for tests only."""
    with _records_lock:
        _records.clear()
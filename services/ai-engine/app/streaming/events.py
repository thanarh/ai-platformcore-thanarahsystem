from __future__ import annotations

import json
from enum import Enum
from typing import Any, Dict


class StreamEventType(str, Enum):
    STATUS = "status"
    TEXT = "text"
    TASK_CREATED = "task_created"
    TASK_READY = "task_ready"
    TASK_STARTED = "task_started"
    TASK_PROGRESS = "task_progress"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_BLOCKED = "task_blocked"
    ARTIFACT_CREATED = "artifact_created"
    GENERATING = "generating"
    SOURCE_FOUND = "source_found"
    VOICE_STATE = "voice_state"
    TRANSCRIPT = "transcript"
    ERROR = "error"
    DONE = "done"


def event_frame(event_type: StreamEventType | str, payload: Dict[str, Any]) -> str:
    name = event_type.value if isinstance(event_type, StreamEventType) else event_type
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=True)}\n\n"


def legacy_delta_frame(delta: str) -> str:
    """Keep the existing data-only text frame unchanged for old clients."""
    return f"data: {json.dumps({'delta': delta}, ensure_ascii=True)}\n\n"
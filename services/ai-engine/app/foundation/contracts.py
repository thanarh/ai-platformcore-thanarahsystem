from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4


class TaskState(str, Enum):
    PENDING = "PENDING"
    PLANNING = "PLANNING"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TaskType(str, Enum):
    TEXT = "text"
    SKILL = "skill"
    TOOL = "tool"
    ARTIFACT = "artifact"


@dataclass
class Task:
    name: str
    task_type: TaskType = TaskType.TEXT
    task_id: str = field(default_factory=lambda: f"task-{uuid4().hex[:12]}")
    state: TaskState = TaskState.PENDING
    dependencies: List[str] = field(default_factory=list)
    input: Dict[str, Any] = field(default_factory=dict)
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    def transition(self, state: TaskState, error: Optional[str] = None) -> None:
        allowed = {
            TaskState.PENDING: {TaskState.PLANNING, TaskState.CANCELLED},
            TaskState.PLANNING: {TaskState.WAITING, TaskState.RUNNING, TaskState.CANCELLED, TaskState.FAILED},
            TaskState.WAITING: {TaskState.RUNNING, TaskState.CANCELLED, TaskState.FAILED},
            TaskState.RUNNING: {TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED, TaskState.WAITING},
            TaskState.COMPLETED: set(),
            TaskState.FAILED: set(),
            TaskState.CANCELLED: set(),
        }
        if state != self.state and state not in allowed[self.state]:
            raise ValueError(f"Invalid task transition: {self.state.value} -> {state.value}")
        self.state = state
        if error:
            self.error = error

    def to_dict(self) -> Dict[str, Any]:
        value = asdict(self)
        value["task_type"] = self.task_type.value
        value["state"] = self.state.value
        return value


@dataclass
class TaskGroup:
    tenant_id: str
    user_id: str
    conversation_id: Optional[str] = None
    group_id: str = field(default_factory=lambda: f"group-{uuid4().hex[:12]}")
    tasks: List[Task] = field(default_factory=list)
    state: TaskState = TaskState.PENDING

    def to_dict(self) -> Dict[str, Any]:
        return {
            "groupId": self.group_id,
            "tenantId": self.tenant_id,
            "userId": self.user_id,
            "conversationId": self.conversation_id,
            "state": self.state.value,
            "tasks": [task.to_dict() for task in self.tasks],
        }


@dataclass(frozen=True)
class PermissionRequirement:
    permission: str
    description: str = ""


@dataclass(frozen=True)
class ToolContract:
    tool_id: str
    name: str
    description: str
    input_schema: Dict[str, Any] = field(default_factory=dict)
    output_type: str = "json"
    required_permissions: tuple[str, ...] = ()
    enabled: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.tool_id,
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
            "outputType": self.output_type,
            "requiredPermissions": list(self.required_permissions),
            "enabled": self.enabled,
        }


@dataclass(frozen=True)
class ArtifactReference:
    artifact_id: str
    type: str
    name: str
    created_by: str
    tenant_id: str
    user_id: str
    conversation_id: Optional[str] = None
    task_id: Optional[str] = None
    status: str = "CREATED"
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "artifactId": self.artifact_id,
            "type": self.type,
            "name": self.name,
            "createdBy": self.created_by,
            "tenantId": self.tenant_id,
            "userId": self.user_id,
            "conversationId": self.conversation_id,
            "taskId": self.task_id,
            "status": self.status,
            "createdAt": self.created_at,
        }


@dataclass(frozen=True)
class StructuredTable:
    columns: List[Dict[str, Any]]
    rows: List[List[Any]]
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "columns": self.columns,
            "rows": self.rows,
            "metadata": self.metadata,
        }
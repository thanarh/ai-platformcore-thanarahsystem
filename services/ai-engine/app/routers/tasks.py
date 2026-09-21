from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.artifacts.store import ArtifactAccessError, InMemoryArtifactStore
from app.foundation.contracts import Task, TaskGroup, TaskType
from app.orchestration.orchestrator import TaskOrchestrator
from app.skills.execution import SkillExecutionService
from app.skills.registry import skill_registry
from app.streaming.events import event_frame

router = APIRouter()
artifact_store = InMemoryArtifactStore()
orchestrator = TaskOrchestrator()
skill_executor = SkillExecutionService(skill_registry, artifact_store, orchestrator)


class TaskSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    type: str = "skill"
    dependencies: List[str] = Field(default_factory=list)
    input: Dict[str, Any] = Field(default_factory=dict)


class TaskCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = ""
    requestId: Optional[str] = None
    conversationId: Optional[str] = None
    input: Dict[str, Any] = Field(default_factory=dict)
    tasks: List[TaskSpec] = Field(default_factory=list)
    concurrencyLimit: Optional[int] = Field(default=None, ge=1, le=8)
    timeoutSeconds: Optional[float] = Field(default=None, gt=0, le=300)


def _principal(request: Request) -> Dict[str, Any]:
    tenant_id = request.headers.get("x-thanarah-tenant-id")
    user_id = request.headers.get("x-thanarah-user-id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Authenticated tenant and user context required")
    from app.config import settings

    if settings.jwt_secret and settings.node_env.lower() == "production":
        supplied = request.headers.get("x-thanarah-internal")
        if not supplied or supplied != settings.jwt_secret:
            raise HTTPException(status_code=403, detail="Internal access required")
    permissions = [
        item.strip()
        for item in request.headers.get("x-thanarah-permissions", "").split(",")
        if item.strip()
    ]
    return {
        "tenantId": tenant_id,
        "userId": user_id,
        "conversationId": request.headers.get("x-thanarah-conversation-id"),
        "requestId": request.headers.get("x-thanarah-request-id"),
        "permissions": permissions,
    }


def _group(payload: TaskCreateRequest, principal: Dict[str, Any]) -> TaskGroup:
    request_id = payload.requestId or principal.get("requestId") or f"request-{uuid4().hex[:12]}"
    if payload.tasks:
        group = TaskGroup(
            tenant_id=principal["tenantId"],
            user_id=principal["userId"],
            conversation_id=payload.conversationId or principal.get("conversationId"),
            request_id=request_id,
        )
        lookup: Dict[str, Task] = {}
        for spec in payload.tasks:
            try:
                task_type = TaskType(spec.type)
            except ValueError:
                task_type = TaskType.SKILL
            task = Task(
                name=spec.name,
                task_type=task_type,
                request_id=request_id,
                conversation_id=group.conversation_id,
                tenant_id=group.tenant_id,
                user_id=group.user_id,
                dependencies=list(spec.dependencies),
                input=dict(spec.input),
            )
            lookup[spec.name] = task
            group.tasks.append(task)
        # User-provided dependencies may refer to the stable task name.
        for task, spec in zip(group.tasks, payload.tasks):
            task.dependencies = [lookup[item].task_id if item in lookup else item for item in spec.dependencies]
        return group
    return orchestrator.decompose(
        payload.prompt,
        principal["tenantId"],
        principal["userId"],
        payload.conversationId or principal.get("conversationId"),
        request_id,
        payload.input,
    )


def _handlers(principal: Dict[str, Any]):
    context = {
        "tenantId": principal["tenantId"],
        "userId": principal["userId"],
        "conversationId": principal.get("conversationId"),
        "requestId": principal.get("requestId"),
        "permissions": principal.get("permissions") or [],
    }
    return {
        task_type.value: (lambda task, values, ctx=context: skill_executor.execute(task, values, ctx))
        for task_type in TaskType
    }


async def _run(payload: TaskCreateRequest, principal: Dict[str, Any], on_event=None) -> TaskGroup:
    group = _group(payload, principal)
    return await orchestrator.execute(
        group,
        _handlers(principal),
        on_event=on_event,
        concurrency_limit=payload.concurrencyLimit,
        timeout_seconds=payload.timeoutSeconds,
    )


@router.post("")
async def create_tasks(payload: TaskCreateRequest, request: Request):
    principal = _principal(request)
    result = await _run(payload, principal)
    return result.to_dict()


@router.post("/stream")
async def stream_tasks(payload: TaskCreateRequest, request: Request):
    principal = _principal(request)
    group = _group(payload, principal)
    queue: asyncio.Queue = asyncio.Queue()

    def on_event(event: str, data: Dict[str, Any]):
        queue.put_nowait((event, data))

    async def event_generator():
        runner = asyncio.create_task(
            orchestrator.execute(
                group,
                _handlers(principal),
                on_event=on_event,
                concurrency_limit=payload.concurrencyLimit,
                timeout_seconds=payload.timeoutSeconds,
            )
        )
        yield event_frame("task_created", {"groupId": group.group_id, "requestId": group.request_id})
        while not runner.done() or not queue.empty():
            try:
                event, data = await asyncio.wait_for(queue.get(), timeout=0.25)
                yield event_frame(event, data)
            except asyncio.TimeoutError:
                continue
        completed = await runner
        final_result = completed.tasks[-1].result if completed.tasks else {}
        if isinstance(final_result, dict) and final_result.get("content"):
            yield event_frame("text", {"content": final_result["content"]})
        yield event_frame("done", {"group": completed.to_dict()})
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/artifacts")
async def list_artifacts(request: Request):
    principal = _principal(request)
    return {"artifacts": [item.to_dict() for item in artifact_store.list(principal["tenantId"], principal["userId"])]}


@router.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str, request: Request):
    principal = _principal(request)
    try:
        return artifact_store.get(artifact_id, principal["tenantId"], principal["userId"]).to_dict()
    except (KeyError, ArtifactAccessError) as exc:
        raise HTTPException(status_code=404, detail="Artifact not found") from exc


@router.get("/artifacts/{artifact_id}/content")
async def get_artifact_content(artifact_id: str, request: Request):
    principal = _principal(request)
    try:
        artifact = artifact_store.get(artifact_id, principal["tenantId"], principal["userId"])
        content = artifact_store.read_bytes(artifact, principal["tenantId"], principal["userId"])
        return Response(content=content, media_type=artifact.mime_type, headers={"Content-Disposition": f'attachment; filename="{artifact.name}"'})
    except (KeyError, ArtifactAccessError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Artifact not found") from exc


@router.get("/{group_id}")
async def get_tasks(group_id: str, request: Request):
    principal = _principal(request)
    try:
        return orchestrator.get(group_id, principal["tenantId"], principal["userId"]).to_dict()
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc


@router.post("/{group_id}/cancel")
async def cancel_tasks(group_id: str, request: Request):
    principal = _principal(request)
    try:
        group = orchestrator.get(group_id, principal["tenantId"], principal["userId"])
        return orchestrator.cancel(group).to_dict()
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc
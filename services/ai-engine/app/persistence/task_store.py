from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Iterable, List

from app.database import get_db
from app.foundation.contracts import Task, TaskGroup, TaskState, TaskType


class DurablePersistenceUnavailable(RuntimeError):
    """Raised when a durable Phase 5.1 store cannot reach MongoDB."""


def _require_db():
    database = get_db()
    if database is None:
        raise DurablePersistenceUnavailable("MongoDB persistence is unavailable")
    return database


class MongoTaskStore:
    """MongoDB-backed task/group metadata with idempotent upserts."""

    def __init__(self):
        self._write_lock = asyncio.Lock()

    def _group_document(self, group: TaskGroup) -> dict[str, Any]:
        return {
            "_id": group.group_id,
            "groupId": group.group_id,
            "requestId": group.request_id,
            "tenantId": group.tenant_id,
            "userId": group.user_id,
            "conversationId": group.conversation_id,
            "state": group.state.value,
            "artifactIds": list(group.artifact_ids),
            "updatedAt": datetime.now(timezone.utc),
        }

    @staticmethod
    def _task_document(group: TaskGroup, task: Task) -> dict[str, Any]:
        return {
            "_id": task.task_id,
            "taskId": task.task_id,
            "groupId": group.group_id,
            "name": task.name,
            "taskType": task.task_type.value,
            "requestId": task.request_id,
            "conversationId": task.conversation_id,
            "tenantId": task.tenant_id,
            "userId": task.user_id,
            "state": task.state.value,
            "dependencies": list(task.dependencies),
            "input": task.input,
            "result": task.result,
            "artifactIds": list(task.artifact_ids),
            "startedAt": task.started_at,
            "completedAt": task.completed_at,
            "duration": task.duration,
            "error": task.error,
            "updatedAt": datetime.now(timezone.utc),
        }

    async def save_group(self, group: TaskGroup) -> None:
        db = _require_db()
        async with self._write_lock:
            now = datetime.now(timezone.utc)
            await db.ai_task_groups.replace_one(
                {"_id": group.group_id},
                {**self._group_document(group), "updatedAt": now},
                upsert=True,
            )
            task_ids = []
            dependency_documents = []
            for task in group.tasks:
                task_ids.append(task.task_id)
                await db.ai_tasks.replace_one(
                    {"_id": task.task_id},
                    self._task_document(group, task),
                    upsert=True,
                )
                dependency_documents.extend(
                    {
                        "_id": f"{task.task_id}:{dependency}",
                        "taskId": task.task_id,
                        "groupId": group.group_id,
                        "dependsOn": dependency,
                        "tenantId": group.tenant_id,
                        "userId": group.user_id,
                    }
                    for dependency in task.dependencies
                )
            await db.ai_task_dependencies.delete_many({"groupId": group.group_id})
            if dependency_documents:
                await db.ai_task_dependencies.insert_many(dependency_documents, ordered=False)
            await db.ai_tasks.delete_many(
                {"groupId": group.group_id, "taskId": {"$nin": task_ids}}
            )

    async def load_group(self, group_id: str, tenant_id: str, user_id: str) -> TaskGroup | None:
        db = _require_db()
        document = await db.ai_task_groups.find_one(
            {"_id": group_id, "tenantId": tenant_id, "userId": user_id}
        )
        if not document:
            return None
        tasks = [
            self._task_from_document(item)
            async for item in db.ai_tasks.find({"groupId": group_id}).sort("updatedAt", 1)
        ]
        return self._group_from_document(document, tasks)

    async def load_all(self) -> List[TaskGroup]:
        db = _require_db()
        groups: List[TaskGroup] = []
        async for document in db.ai_task_groups.find({}):
            tasks = [
                self._task_from_document(item)
                async for item in db.ai_tasks.find({"groupId": document["groupId"]}).sort("updatedAt", 1)
            ]
            groups.append(self._group_from_document(document, tasks))
        return groups

    @staticmethod
    def _task_from_document(document: dict[str, Any]) -> Task:
        try:
            task_type = TaskType(document.get("taskType", TaskType.TEXT.value))
        except ValueError:
            task_type = TaskType.TEXT
        try:
            state = TaskState(document.get("state", TaskState.PENDING.value))
        except ValueError:
            state = TaskState.PENDING
        return Task(
            name=document.get("name", "Recovered task"),
            task_type=task_type,
            task_id=document["taskId"],
            request_id=document.get("requestId", ""),
            conversation_id=document.get("conversationId"),
            tenant_id=document.get("tenantId", ""),
            user_id=document.get("userId", ""),
            state=state,
            dependencies=list(document.get("dependencies") or []),
            input=dict(document.get("input") or {}),
            result=document.get("result"),
            artifact_ids=list(document.get("artifactIds") or []),
            started_at=document.get("startedAt"),
            completed_at=document.get("completedAt"),
            duration=document.get("duration"),
            error=document.get("error"),
        )

    @staticmethod
    def _group_from_document(document: dict[str, Any], tasks: Iterable[Task]) -> TaskGroup:
        try:
            state = TaskState(document.get("state", TaskState.PENDING.value))
        except ValueError:
            state = TaskState.PENDING
        return TaskGroup(
            tenant_id=document.get("tenantId", ""),
            user_id=document.get("userId", ""),
            conversation_id=document.get("conversationId"),
            request_id=document.get("requestId", ""),
            group_id=document["groupId"],
            tasks=list(tasks),
            state=state,
            artifact_ids=list(document.get("artifactIds") or []),
        )
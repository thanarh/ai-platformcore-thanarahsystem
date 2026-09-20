from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

from app.foundation.contracts import Task, TaskGroup, TaskState, TaskType


class TaskOrchestrator:
    """Plans task groups and validates lifecycle transitions without executing tools."""

    def decompose(
        self,
        prompt: str,
        tenant_id: str,
        user_id: str,
        conversation_id: Optional[str] = None,
    ) -> TaskGroup:
        parts = [
            part.strip(" \t\n،,.;")
            for part in re.split(r"\n+|،|;|\s+(?:ثم|وبعد ذلك|وأيضاً|و|then|and also)\s+", prompt or "", flags=re.IGNORECASE)
            if part.strip(" \t\n،,.;")
        ]
        if not parts:
            parts = ["Process user request"]
        group = TaskGroup(tenant_id=tenant_id, user_id=user_id, conversation_id=conversation_id)
        for index, part in enumerate(parts):
            task_type = TaskType.ARTIFACT if any(word in part.lower() for word in ("pdf", "جدول", "table", "spreadsheet", "مستند")) else TaskType.TEXT
            group.tasks.append(
                Task(
                    name=part[:180],
                    task_type=task_type,
                    dependencies=[group.tasks[-1].task_id] if index and self._is_sequential(prompt) else [],
                    input={"prompt": part},
                )
            )
        return group

    @staticmethod
    def _is_sequential(prompt: str) -> bool:
        return bool(re.search(r"\b(?:ثم|وبعد ذلك|then|after that)\b", prompt or "", flags=re.IGNORECASE))

    def plan(self, group: TaskGroup) -> List[List[Task]]:
        """Return dependency-safe parallel waves and reject cycles/missing dependencies."""
        task_map = {task.task_id: task for task in group.tasks}
        if len(task_map) != len(group.tasks):
            raise ValueError("Duplicate task id")
        for task in group.tasks:
            missing = set(task.dependencies) - set(task_map)
            if missing:
                raise ValueError(f"Missing task dependency: {sorted(missing)[0]}")
        remaining = set(task_map)
        waves: List[List[Task]] = []
        while remaining:
            ready = [
                task_map[task_id]
                for task_id in remaining
                if all(dependency not in remaining for dependency in task_map[task_id].dependencies)
            ]
            if not ready:
                raise ValueError("Task dependency cycle detected")
            for task in ready:
                if task.state == TaskState.PENDING:
                    task.transition(TaskState.PLANNING)
            waves.append(sorted(ready, key=lambda task: task.task_id))
            remaining -= {task.task_id for task in ready}
        group.state = TaskState.PLANNING
        return waves

    def transition(self, group: TaskGroup, task_id: str, state: TaskState, error: Optional[str] = None) -> Task:
        task = self._find(group, task_id)
        task.transition(state, error)
        if state == TaskState.FAILED:
            group.state = TaskState.FAILED
        elif all(item.state == TaskState.COMPLETED for item in group.tasks):
            group.state = TaskState.COMPLETED
        return task

    def cancel(self, group: TaskGroup, task_id: Optional[str] = None) -> TaskGroup:
        if task_id:
            self.transition(group, task_id, TaskState.CANCELLED)
        else:
            for task in group.tasks:
                if task.state not in {TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED}:
                    task.transition(TaskState.CANCELLED)
        group.state = TaskState.CANCELLED
        return group

    @staticmethod
    def _find(group: TaskGroup, task_id: str) -> Task:
        for task in group.tasks:
            if task.task_id == task_id:
                return task
        raise KeyError(f"Task not found: {task_id}")

    @staticmethod
    def authorize(required_permissions: Iterable[str], granted_permissions: Iterable[str]) -> None:
        required = set(required_permissions)
        granted = set(granted_permissions)
        missing = required - granted
        if missing:
            raise PermissionError(f"Missing permissions: {', '.join(sorted(missing))}")
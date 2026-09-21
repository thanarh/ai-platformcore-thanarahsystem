from __future__ import annotations

import asyncio
import inspect
import re
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional

from app.foundation.contracts import Task, TaskGroup, TaskState, TaskType


TaskHandler = Callable[[Task, Dict[str, Any]], Any]
TaskEventListener = Callable[[str, Dict[str, Any]], Any]


class TaskOrchestrator:
    """Finite, dependency-aware task execution with bounded concurrency."""

    def __init__(
        self,
        max_concurrency: int = 2,
        task_timeout_seconds: float = 60.0,
        persistence: Any = None,
    ):
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be positive")
        self.max_concurrency = max_concurrency
        self.task_timeout_seconds = task_timeout_seconds
        self.persistence = persistence
        self._groups: Dict[str, TaskGroup] = {}
        self._cancel_events: Dict[str, asyncio.Event] = {}
        self._running_tasks: Dict[str, set[asyncio.Task]] = {}

    def decompose(
        self,
        prompt: str,
        tenant_id: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        request_id: Optional[str] = None,
        request_input: Optional[Dict[str, Any]] = None,
    ) -> TaskGroup:
        request_id = request_id or f"request-{time.time_ns()}"
        group = TaskGroup(
            tenant_id=tenant_id,
            user_id=user_id,
            conversation_id=conversation_id,
            request_id=request_id,
        )
        prompt_lower = (prompt or "").lower()
        file_workflow = (
            any(token in prompt_lower for token in ("حلل الملف", "analyze the file", "file analysis"))
            and any(token in prompt_lower for token in ("جدول", "table", "excel", "xlsx", "pdf"))
        )
        if file_workflow:
            source = dict(request_input or {})
            task_specs = [
                ("Analyze file", TaskType.FILE_ANALYSIS, [], {"skillId": "file_analysis", **source}),
                ("Extract structured data", TaskType.EXTRACT, [], {"skillId": "file_analysis"}),
                ("Generate table", TaskType.TABLE, [], {"skillId": "table_generation"}),
                ("Generate XLSX", TaskType.SPREADSHEET, [], {"skillId": "spreadsheet_generation"}),
                ("Generate PDF", TaskType.PDF, [], {"skillId": "pdf_generation"}),
            ]
            previous: Optional[str] = None
            for name, task_type, _, task_input in task_specs:
                task = self._new_task(group, name, task_type, task_input)
                if name == "Extract structured data":
                    task.dependencies = [group.tasks[0].task_id]
                elif name == "Generate table":
                    task.dependencies = [group.tasks[1].task_id]
                elif name in {"Generate XLSX", "Generate PDF"}:
                    task.dependencies = [group.tasks[2].task_id]
                group.tasks.append(task)
                previous = task.task_id
            return group

        parts = [
            part.strip(" \t\n،,.;")
            for part in re.split(
                r"\n+|،|;|\s+(?:ثم|وبعد ذلك|وأيضاً|و|then|and also)\s+",
                prompt or "",
                flags=re.IGNORECASE,
            )
            if part.strip(" \t\n،,.;")
        ] or ["Process user request"]
        sequential = self._is_sequential(prompt)
        previous = None
        for part in parts:
            task_type = TaskType.ARTIFACT if any(
                word in part.lower() for word in ("pdf", "جدول", "table", "spreadsheet", "مستند", "xlsx")
            ) else TaskType.SKILL
            task = self._new_task(group, part[:180], task_type, {"prompt": part})
            if sequential and previous:
                task.dependencies = [previous]
            group.tasks.append(task)
            previous = task.task_id
        return group

    def register(self, group: TaskGroup) -> TaskGroup:
        self._groups[group.group_id] = group
        self._cancel_events[group.group_id] = asyncio.Event()
        return group

    def restore(self, groups: Iterable[TaskGroup]) -> None:
        for group in groups:
            self._groups[group.group_id] = group
            self._cancel_events.setdefault(group.group_id, asyncio.Event())

    async def _persist(self, group: TaskGroup) -> None:
        if self.persistence is not None:
            await self.persistence.save_group(group)

    def get(self, group_id: str, tenant_id: str, user_id: str) -> TaskGroup:
        group = self._groups.get(group_id)
        if not group or group.tenant_id != tenant_id or group.user_id != user_id:
            raise PermissionError("Task access denied")
        return group

    def plan(self, group: TaskGroup) -> List[List[Task]]:
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

    async def execute(
        self,
        group: TaskGroup,
        handlers: Dict[str, TaskHandler],
        on_event: Optional[TaskEventListener] = None,
        concurrency_limit: Optional[int] = None,
        timeout_seconds: Optional[float] = None,
    ) -> TaskGroup:
        self.register(group)
        self.plan(group)
        limit = concurrency_limit or self.max_concurrency
        semaphore = asyncio.Semaphore(max(1, limit))
        cancel_event = self._cancel_events[group.group_id]
        timeout = timeout_seconds or self.task_timeout_seconds
        completed: Dict[str, Any] = {}

        async def run_task(task: Task) -> None:
            current_runner = asyncio.current_task()
            if current_runner:
                self._running_tasks.setdefault(group.group_id, set()).add(current_runner)
            if cancel_event.is_set():
                self._safe_transition(task, TaskState.CANCELLED)
                await self._persist(group)
                self._emit(on_event, "task_failed", {"taskId": task.task_id, "reason": "cancelled"})
                return
            if any(
                next(item for item in group.tasks if item.task_id == dependency).state
                in {TaskState.FAILED, TaskState.CANCELLED, TaskState.BLOCKED}
                for dependency in task.dependencies
            ):
                self._safe_transition(task, TaskState.BLOCKED, "Dependency failed")
                await self._persist(group)
                self._emit(on_event, "task_blocked", {"taskId": task.task_id, "reason": task.error})
                return
            self._safe_transition(task, TaskState.READY)
            await self._persist(group)
            self._emit(on_event, "task_ready", {"taskId": task.task_id})
            async with semaphore:
                if cancel_event.is_set():
                    self._safe_transition(task, TaskState.CANCELLED)
                    await self._persist(group)
                    return
                self._safe_transition(task, TaskState.RUNNING)
                task.started_at = datetime.now(timezone.utc).isoformat()
                await self._persist(group)
                started = time.monotonic()
                self._emit(on_event, "task_started", {"taskId": task.task_id, "type": task.task_type.value})
                handler = handlers.get(task.task_type.value) or handlers.get(task.input.get("skillId", ""))
                if not handler:
                    self._safe_transition(task, TaskState.FAILED, "No handler registered for task")
                    await self._persist(group)
                    self._emit(on_event, "task_failed", {"taskId": task.task_id, "reason": task.error})
                    return
                dependency_results = {key: completed.get(key) for key in task.dependencies}
                task_input = {**task.input, "dependencyResults": dependency_results}
                try:
                    result = handler(task, task_input)
                    if inspect.isawaitable(result):
                        result = await asyncio.wait_for(result, timeout=timeout)
                    if cancel_event.is_set():
                        self._safe_transition(task, TaskState.CANCELLED)
                        await self._persist(group)
                        return
                    task.result = result
                    if isinstance(result, dict):
                        task.artifact_ids = list(
                            result.get("artifactIds")
                            or ([result["artifactId"]] if result.get("artifactId") else [])
                        )
                    completed[task.task_id] = result
                    task.duration = round(time.monotonic() - started, 4)
                    task.completed_at = datetime.now(timezone.utc).isoformat()
                    self._safe_transition(task, TaskState.COMPLETED)
                    await self._persist(group)
                    self._emit(
                        on_event,
                        "task_completed",
                        {"taskId": task.task_id, "duration": task.duration, "artifactIds": task.artifact_ids},
                    )
                    if task.artifact_ids:
                        self._emit(
                            on_event,
                            "artifact_created",
                            {"taskId": task.task_id, "artifactIds": task.artifact_ids},
                        )
                except asyncio.TimeoutError:
                    task.duration = round(time.monotonic() - started, 4)
                    self._safe_transition(task, TaskState.FAILED, "Task timeout")
                    await self._persist(group)
                    self._emit(on_event, "task_failed", {"taskId": task.task_id, "reason": task.error})
                except asyncio.CancelledError:
                    self._safe_transition(task, TaskState.CANCELLED)
                    await self._persist(group)
                    return
                except Exception as exc:
                    task.duration = round(time.monotonic() - started, 4)
                    self._safe_transition(task, TaskState.FAILED, str(exc)[:240])
                    await self._persist(group)
                    self._emit(on_event, "task_failed", {"taskId": task.task_id, "reason": task.error})

        waves = self.plan(group)
        await self._persist(group)
        for wave in waves:
            if cancel_event.is_set():
                for task in wave:
                    self._safe_transition(task, TaskState.CANCELLED)
                break
            await asyncio.gather(*(run_task(task) for task in wave))

        if cancel_event.is_set():
            group.state = TaskState.CANCELLED
        elif any(task.state == TaskState.FAILED for task in group.tasks):
            group.state = TaskState.FAILED
            for task in group.tasks:
                if task.state == TaskState.PENDING:
                    self._safe_transition(task, TaskState.BLOCKED, "Blocked by failed task")
        elif any(task.state == TaskState.BLOCKED for task in group.tasks):
            group.state = TaskState.FAILED
        else:
            group.state = TaskState.COMPLETED
        group.artifact_ids = list(
            dict.fromkeys(
                artifact_id
                for task in group.tasks
                for artifact_id in task.artifact_ids
            )
        )
        await self._persist(group)
        self._running_tasks.pop(group.group_id, None)
        return group

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
            self._find(group, task_id)
        self._cancel_events.setdefault(group.group_id, asyncio.Event()).set()
        for runner in self._running_tasks.get(group.group_id, set()):
            if not runner.done():
                runner.cancel()
        targets = [self._find(group, task_id)] if task_id else group.tasks
        for task in targets:
            if task.state not in {TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED, TaskState.BLOCKED}:
                self._safe_transition(task, TaskState.CANCELLED)
        if task_id is None:
            group.state = TaskState.CANCELLED
        return group

    @staticmethod
    def authorize(required_permissions: Iterable[str], granted_permissions: Iterable[str]) -> None:
        missing = set(required_permissions) - set(granted_permissions)
        if missing:
            raise PermissionError(f"Missing permissions: {', '.join(sorted(missing))}")

    @staticmethod
    def _is_sequential(prompt: str) -> bool:
        return bool(re.search(r"\b(?:ثم|وبعد ذلك|then|after that)\b", prompt or "", flags=re.IGNORECASE))

    @staticmethod
    def _new_task(group: TaskGroup, name: str, task_type: TaskType, task_input: Dict[str, Any]) -> Task:
        return Task(
            name=name,
            task_type=task_type,
            request_id=group.request_id,
            conversation_id=group.conversation_id,
            tenant_id=group.tenant_id,
            user_id=group.user_id,
            input=task_input,
        )

    @staticmethod
    def _find(group: TaskGroup, task_id: str) -> Task:
        for task in group.tasks:
            if task.task_id == task_id:
                return task
        raise KeyError(f"Task not found: {task_id}")

    @staticmethod
    def _safe_transition(task: Task, state: TaskState, error: Optional[str] = None) -> None:
        if task.state == state:
            if error:
                task.error = error
            return
        try:
            task.transition(state, error)
        except ValueError:
            task.state = state
            task.error = error

    @staticmethod
    def _emit(listener: Optional[TaskEventListener], event: str, payload: Dict[str, Any]) -> None:
        if listener:
            result = listener(event, payload)
            if inspect.isawaitable(result):
                # Event listeners used by HTTP streaming are async generators
                # managed by the caller; sync execution never awaits callbacks.
                pass
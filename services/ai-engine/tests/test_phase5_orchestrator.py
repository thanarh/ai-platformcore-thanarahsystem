from __future__ import annotations

import asyncio
import io
import tempfile
import unittest
import zipfile

from app.artifacts.generators import PdfArtifactService, SpreadsheetArtifactService
from app.artifacts.store import ArtifactAccessError, InMemoryArtifactStore
from app.foundation.contracts import Task, TaskGroup, TaskState, TaskType
from app.orchestration.orchestrator import TaskOrchestrator
from app.skills.execution import SkillExecutionError, SkillExecutionService
from app.skills.registry import SkillRegistry
from app.routers.tasks import TaskCreateRequest


class Phase5Tests(unittest.IsolatedAsyncioTestCase):
    async def test_branching_graph_runs_parallel_with_limit(self):
        orchestrator = TaskOrchestrator(max_concurrency=2, task_timeout_seconds=1)
        group = TaskGroup("tenant-a", "user-a", "conversation-a", request_id="request-a")
        first = Task("A", TaskType.SKILL, request_id=group.request_id, tenant_id="tenant-a", user_id="user-a")
        second = Task("B", TaskType.SKILL, request_id=group.request_id, tenant_id="tenant-a", user_id="user-a")
        third = Task("C", TaskType.SKILL, request_id=group.request_id, tenant_id="tenant-a", user_id="user-a")
        join = Task("D", TaskType.SKILL, dependencies=[second.task_id, third.task_id], request_id=group.request_id, tenant_id="tenant-a", user_id="user-a")
        group.tasks = [first, second, third, join]
        max_active = 0
        active = 0

        async def handler(task, _values):
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.01)
            active -= 1
            return {"task": task.name}

        result = await orchestrator.execute(group, {"skill": handler, "text": handler, "artifact": handler})
        self.assertEqual(result.state, TaskState.COMPLETED)
        self.assertLessEqual(max_active, 2)
        self.assertEqual(join.result["task"], "D")

    async def test_failure_blocks_dependents_and_timeout_fails_task(self):
        orchestrator = TaskOrchestrator(task_timeout_seconds=0.01)
        group = TaskGroup("tenant-a", "user-a")
        failed = Task("failed", TaskType.SKILL, tenant_id="tenant-a", user_id="user-a")
        blocked = Task("blocked", TaskType.SKILL, dependencies=[failed.task_id], tenant_id="tenant-a", user_id="user-a")
        group.tasks = [failed, blocked]

        async def fail(_task, _values):
            raise RuntimeError("expected failure")

        await orchestrator.execute(group, {"skill": fail})
        self.assertEqual(failed.state, TaskState.FAILED)
        self.assertEqual(blocked.state, TaskState.BLOCKED)

        timeout_group = TaskGroup("tenant-a", "user-a")
        timeout_task = Task("timeout", TaskType.SKILL, tenant_id="tenant-a", user_id="user-a")
        timeout_group.tasks = [timeout_task]

        async def hang(_task, _values):
            await asyncio.sleep(1)

        await orchestrator.execute(timeout_group, {"skill": hang})
        self.assertEqual(timeout_task.state, TaskState.FAILED)
        self.assertEqual(timeout_task.error, "Task timeout")

    async def test_cancellation_stops_running_graph(self):
        orchestrator = TaskOrchestrator(task_timeout_seconds=1)
        group = TaskGroup("tenant-a", "user-a")
        task = Task("slow", TaskType.SKILL, tenant_id="tenant-a", user_id="user-a")
        group.tasks = [task]

        async def slow(_task, _values):
            await asyncio.sleep(1)

        running = asyncio.create_task(orchestrator.execute(group, {"skill": slow}))
        await asyncio.sleep(0.02)
        orchestrator.cancel(group)
        result = await running
        self.assertEqual(result.state, TaskState.CANCELLED)
        self.assertEqual(task.state, TaskState.CANCELLED)

    async def test_skills_files_artifacts_and_access_control(self):
        registry = SkillRegistry()
        self.assertIn("version", registry.get("file_analysis").to_dict())
        self.assertEqual(registry.get("web_search").implementation_status, "contract-only")
        executor = SkillExecutionService(registry, InMemoryArtifactStore(tempfile.mkdtemp()))
        context = {
            "tenantId": "tenant-a",
            "userId": "user-a",
            "conversationId": "conversation-a",
            "permissions": ["file.read", "artifact.write", "data.read"],
        }
        analyzed = await executor.execute(
            Task("file", TaskType.FILE_ANALYSIS),
            {"skillId": "file_analysis", "file": {"name": "data.csv", "content": "name,value\nA,2\nB,4"}},
            context,
        )
        self.assertEqual(analyzed["table"]["rows"], [["A", "2"], ["B", "4"]])
        table = await executor.execute(
            Task("table", TaskType.TABLE),
            {"skillId": "table_generation", "data": analyzed["table"]},
            context,
        )
        pdf = await executor.execute(
            Task("pdf", TaskType.PDF),
            {"skillId": "pdf_generation", "dependencyResults": {"table": table}},
            context,
        )
        sheets = await executor.execute(
            Task("sheet", TaskType.SPREADSHEET),
            {"skillId": "spreadsheet_generation", "dependencyResults": {"table": table}},
            context,
        )
        store = executor.artifact_store
        pdf_ref = store.get(pdf["artifactId"], "tenant-a", "user-a")
        self.assertTrue(store.read_bytes(pdf_ref, "tenant-a", "user-a").startswith(b"%PDF"))
        self.assertIn("artifactIds", sheets)
        xlsx = store.get(sheets["artifactIds"][0], "tenant-a", "user-a")
        with zipfile.ZipFile(io.BytesIO(store.read_bytes(xlsx, "tenant-a", "user-a"))) as archive:
            self.assertIn("xl/worksheets/sheet1.xml", archive.namelist())
        with self.assertRaises(ArtifactAccessError):
            store.get(pdf["artifactId"], "tenant-b", "user-b")

    async def test_web_search_is_structured_unavailable(self):
        executor = SkillExecutionService(SkillRegistry(), InMemoryArtifactStore(tempfile.mkdtemp()))
        with self.assertRaises(SkillExecutionError) as error:
            await executor.execute(
                Task("web", TaskType.SKILL),
                {"skillId": "web_search", "query": "anything"},
                {"tenantId": "tenant-a", "userId": "user-a", "permissions": ["internet_access"]},
            )
        self.assertEqual(error.exception.code, "CAPABILITY_UNAVAILABLE")

    def test_task_payload_cannot_forge_server_identity(self):
        with self.assertRaises(ValueError):
            TaskCreateRequest.model_validate({"prompt": "x", "tenantId": "forged"})


if __name__ == "__main__":
    unittest.main()
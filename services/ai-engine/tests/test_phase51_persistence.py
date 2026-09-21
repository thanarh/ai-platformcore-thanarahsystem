from __future__ import annotations

import asyncio
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from app.artifacts.store import MongoArtifactStore
from app.database import get_db, init_db
from app.foundation.contracts import Task, TaskGroup, TaskState, TaskType
from app.persistence.task_store import MongoTaskStore


class Phase51PersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await init_db()
        self.db = get_db()
        if self.db is None:
            self.skipTest("MongoDB is unavailable")
        suffix = uuid4().hex[:10]
        self.tenant = f"phase51-test-{suffix}"
        self.user = f"user-{suffix}"
        self.temp_dir = tempfile.TemporaryDirectory()

    async def asyncTearDown(self):
        if self.db is not None:
            await self.db.ai_task_groups.delete_many({"tenantId": self.tenant})
            await self.db.ai_tasks.delete_many({"tenantId": self.tenant})
            await self.db.ai_task_dependencies.delete_many({"tenantId": self.tenant})
            await self.db.ai_artifacts.delete_many({"tenantId": self.tenant})
        self.temp_dir.cleanup()

    async def test_task_and_artifact_survive_store_recreation(self):
        artifact_store = MongoArtifactStore(self.temp_dir.name)
        artifact = await artifact_store.create(
            self.tenant,
            self.user,
            "CSV",
            "durable.csv",
            content=b"name,value\nA,2\n",
            mime_type="text/csv",
        )
        group = TaskGroup(
            self.tenant,
            self.user,
            conversation_id="conversation-51",
            request_id="request-51",
        )
        task = Task(
            "Generate CSV",
            TaskType.SPREADSHEET,
            request_id=group.request_id,
            conversation_id=group.conversation_id,
            tenant_id=self.tenant,
            user_id=self.user,
            result={"artifactId": artifact.artifact_id},
            artifact_ids=[artifact.artifact_id],
        )
        task.transition(TaskState.PLANNING)
        task.transition(TaskState.READY)
        task.transition(TaskState.RUNNING)
        task.started_at = datetime.now(timezone.utc).isoformat()
        task.transition(TaskState.COMPLETED)
        task.completed_at = datetime.now(timezone.utc).isoformat()
        group.tasks = [task]
        group.state = TaskState.COMPLETED
        group.artifact_ids = [artifact.artifact_id]

        await MongoTaskStore().save_group(group)

        recovered_group = await MongoTaskStore().load_group(
            group.group_id, self.tenant, self.user
        )
        recovered_store = MongoArtifactStore(self.temp_dir.name)
        recovered_artifact = await recovered_store.get(
            artifact.artifact_id, self.tenant, self.user
        )
        content = await recovered_store.read_bytes(
            recovered_artifact, self.tenant, self.user
        )

        self.assertIsNotNone(recovered_group)
        self.assertEqual(recovered_group.state, TaskState.COMPLETED)
        self.assertEqual(recovered_group.tasks[0].state, TaskState.COMPLETED)
        self.assertEqual(recovered_group.artifact_ids, [artifact.artifact_id])
        self.assertEqual(content, b"name,value\nA,2\n")

    async def test_expired_artifacts_are_removed_safely(self):
        store = MongoArtifactStore(self.temp_dir.name)
        artifact = await store.create(
            self.tenant,
            self.user,
            "CSV",
            "expired.csv",
            content=b"expired\n",
            mime_type="text/csv",
            expires_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
        )
        with self.assertRaises(KeyError):
            await store.get(artifact.artifact_id, self.tenant, self.user)
        self.assertFalse(Path(artifact.storage_path).exists())

    async def test_concurrent_artifacts_keep_unique_owned_files(self):
        store = MongoArtifactStore(self.temp_dir.name)

        async def create(index: int):
            return await store.create(
                self.tenant,
                self.user,
                "CSV",
                f"parallel-{index}.csv",
                content=f"row,{index}\n".encode(),
                mime_type="text/csv",
            )

        artifacts = await asyncio.gather(*(create(index) for index in range(3)))
        self.assertEqual(len({item.artifact_id for item in artifacts}), 3)
        for index, artifact in enumerate(artifacts):
            self.assertEqual(
                await store.read_bytes(artifact, self.tenant, self.user),
                f"row,{index}\n".encode(),
            )


if __name__ == "__main__":
    unittest.main()
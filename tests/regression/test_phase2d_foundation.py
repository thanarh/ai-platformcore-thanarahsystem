import unittest
from datetime import datetime, timezone

from app.artifacts.store import ArtifactAccessError, InMemoryArtifactStore
from app.foundation.contracts import StructuredTable, TaskState
from app.foundation.runtime_context import UserRuntimeContext
from app.orchestration.orchestrator import TaskOrchestrator
from app.skills.registry import SkillRegistry
from app.streaming.events import StreamEventType, event_frame, legacy_delta_frame
from app.voice.contracts import VoiceSession, VoiceState, resolve_voice_language


class Phase2DFoundationTests(unittest.TestCase):
    def test_runtime_context_uses_user_timezone_for_relative_dates(self):
        context = UserRuntimeContext.from_mapping(
            {
                "timezone": "Asia/Riyadh",
                "locale": "ar-SA",
                "language": "ar",
            },
            tenant_id="tenant-a",
            user_id="user-a",
        )
        snapshot = context.snapshot(datetime(2026, 1, 1, 21, 30, tzinfo=timezone.utc))

        self.assertEqual(snapshot["timezone"], "Asia/Riyadh")
        self.assertEqual(snapshot["currentDate"], "2026-01-02")
        self.assertEqual(snapshot["tomorrow"], "2026-01-03")
        self.assertEqual(snapshot["yesterday"], "2026-01-01")
        self.assertEqual(snapshot["language"], "ar")

    def test_invalid_timezone_falls_back_without_location_inference(self):
        context = UserRuntimeContext.from_mapping(
            {"timezone": "not-a-location", "language": "ar"},
            tenant_id="tenant-a",
            user_id="user-a",
        )
        self.assertEqual(context.timezone_name, "UTC")
        self.assertFalse(context.timezone_valid)
        self.assertNotIn("location", context.snapshot())

    def test_orchestrator_supports_parallel_and_sequential_waves(self):
        orchestrator = TaskOrchestrator()
        parallel = orchestrator.decompose(
            "حلل المواعيد، وأنشئ جدولاً بالملاحظات",
            "tenant-a",
            "user-a",
            "conversation-a",
        )
        waves = orchestrator.plan(parallel)
        self.assertEqual(len(waves), 1)
        self.assertEqual(len(waves[0]), 2)

        sequential = orchestrator.decompose(
            "حلل النتائج ثم أنشئ تقرير PDF",
            "tenant-a",
            "user-a",
        )
        waves = orchestrator.plan(sequential)
        self.assertEqual(len(waves), 2)
        self.assertEqual(sequential.state, TaskState.PLANNING)
        orchestrator.transition(sequential, sequential.tasks[0].task_id, TaskState.RUNNING)
        orchestrator.transition(sequential, sequential.tasks[0].task_id, TaskState.COMPLETED)
        orchestrator.transition(sequential, sequential.tasks[1].task_id, TaskState.RUNNING)
        orchestrator.transition(sequential, sequential.tasks[1].task_id, TaskState.FAILED, "test failure")
        self.assertEqual(sequential.state, TaskState.FAILED)

    def test_skill_registry_exposes_contract_and_deterministic_ordering(self):
        skills = SkillRegistry().list_skills({"frequentTasks": ["web_search"]})
        web_search = next(skill for skill in skills if skill["id"] == "web_search")
        self.assertIn("requiredPermissions", web_search)
        self.assertFalse(web_search["enabled"])
        self.assertEqual(web_search["implementationStatus"], "contract-only")
        self.assertEqual(skills[0]["enabled"], True)

    def test_artifact_metadata_is_scoped_and_tables_are_structured(self):
        store = InMemoryArtifactStore()
        artifact = store.create("tenant-a", "user-a", "table", "Appointments", "conversation-a", "task-a")
        self.assertEqual(artifact.to_dict()["conversationId"], "conversation-a")
        self.assertEqual(artifact.to_dict()["taskId"], "task-a")
        self.assertEqual(len(store.list("tenant-a", "user-a")), 1)
        with self.assertRaises(ArtifactAccessError):
            store.get(artifact.artifact_id, "tenant-b", "user-b")
        store.validate_table(StructuredTable(columns=[{"name": "date"}], rows=[["2026-01-02"]]))
        with self.assertRaises(ValueError):
            store.validate_table(StructuredTable(columns=[{"name": "date"}], rows=[["a", "b"]]))

    def test_stream_event_contract_keeps_legacy_text_frame(self):
        self.assertIn("event: status", event_frame(StreamEventType.STATUS, {"state": "planning"}))
        self.assertIn('data: {"delta": "hello"}', legacy_delta_frame("hello"))

    def test_voice_session_lifecycle_supports_abort_without_agent_execution(self):
        session = VoiceSession("tenant-a", "user-a", "conversation-a", language="en")
        session.transition(VoiceState.LISTENING)
        session.transition(VoiceState.TRANSCRIBING)
        session.transcription = "What is today?"
        session.transition(VoiceState.THINKING)
        session.transition(VoiceState.GENERATING)
        session.stop()
        self.assertEqual(session.state, VoiceState.STOPPED)
        self.assertEqual(session.to_dict()["conversationId"], "conversation-a")
        with self.assertRaises(ValueError):
            session.transition(VoiceState.SPEAKING)

    def test_voice_language_precedence_supports_arabic_and_english(self):
        self.assertEqual(resolve_voice_language("en", "ar", "ar"), "en")
        self.assertEqual(resolve_voice_language("fr", "en", "ar"), "en")
        self.assertEqual(resolve_voice_language("fr", "fr", "fr"), "ar")


if __name__ == "__main__":
    unittest.main()
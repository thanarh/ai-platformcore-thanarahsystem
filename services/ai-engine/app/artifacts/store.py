from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List
from uuid import uuid4

from app.foundation.contracts import ArtifactReference, StructuredTable


class ArtifactAccessError(PermissionError):
    pass


class InMemoryArtifactStore:
    """Contract-level store for tests and adapters; it never stores binary content."""

    def __init__(self):
        self._records: Dict[str, ArtifactReference] = {}

    def create(
        self,
        tenant_id: str,
        user_id: str,
        artifact_type: str,
        name: str,
        conversation_id: str | None = None,
        task_id: str | None = None,
    ) -> ArtifactReference:
        reference = ArtifactReference(
            artifact_id=f"artifact-{uuid4().hex[:12]}",
            type=artifact_type,
            name=name[:160],
            created_by=user_id,
            tenant_id=tenant_id,
            user_id=user_id,
            conversation_id=conversation_id,
            task_id=task_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._records[reference.artifact_id] = reference
        return reference

    def get(self, artifact_id: str, tenant_id: str, user_id: str) -> ArtifactReference:
        record = self._records.get(artifact_id)
        if not record:
            raise KeyError("Artifact not found")
        if record.tenant_id != tenant_id or record.user_id != user_id:
            raise ArtifactAccessError("Artifact access denied")
        return record

    def list(self, tenant_id: str, user_id: str) -> List[ArtifactReference]:
        return [
            record
            for record in self._records.values()
            if record.tenant_id == tenant_id and record.user_id == user_id
        ]

    @staticmethod
    def validate_table(table: StructuredTable) -> StructuredTable:
        if not table.columns:
            raise ValueError("Structured table requires columns")
        width = len(table.columns)
        if any(len(row) != width for row in table.rows):
            raise ValueError("Every table row must match the column count")
        return table
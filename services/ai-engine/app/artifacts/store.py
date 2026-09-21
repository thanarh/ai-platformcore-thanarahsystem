from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.config import settings
from app.database import get_db
from app.foundation.contracts import ArtifactReference, StructuredTable


class ArtifactAccessError(PermissionError):
    pass


class InMemoryArtifactStore:
    """Tenant/user-scoped metadata store with optional local artifact bytes."""

    def __init__(self, storage_dir: Optional[str] = None):
        self._records: Dict[str, ArtifactReference] = {}
        self.storage_dir = Path(storage_dir or os.getenv("THANARAH_ARTIFACT_DIR", "/tmp/thanarah-artifacts"))
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def create(
        self,
        tenant_id: str,
        user_id: str,
        artifact_type: str,
        name: str,
        conversation_id: str | None = None,
        task_id: str | None = None,
        content: bytes | None = None,
        mime_type: str = "application/octet-stream",
        expires_at: str | None = None,
    ) -> ArtifactReference:
        artifact_id = f"artifact-{uuid4().hex[:12]}"
        storage_path = None
        size = 0
        if content is not None:
            safe_name = "".join(char if char.isalnum() or char in "._-" else "_" for char in name)[:120]
            path = self.storage_dir / f"{artifact_id}-{safe_name or 'artifact'}"
            path.write_bytes(content)
            storage_path = str(path)
            size = len(content)
        if expires_at is None:
            expires_at = (
                datetime.now(timezone.utc)
                + timedelta(seconds=settings.task_artifact_ttl_seconds)
            ).isoformat()
        reference = ArtifactReference(
            artifact_id=artifact_id,
            type=artifact_type,
            name=name[:160],
            created_by=user_id,
            tenant_id=tenant_id,
            user_id=user_id,
            conversation_id=conversation_id,
            task_id=task_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            mime_type=mime_type,
            size=size,
            storage_path=storage_path,
            expires_at=expires_at,
        )
        self._records[reference.artifact_id] = reference
        return reference

    def get(self, artifact_id: str, tenant_id: str, user_id: str) -> ArtifactReference:
        record = self._records.get(artifact_id)
        if not record:
            raise KeyError("Artifact not found")
        if record.tenant_id != tenant_id or record.user_id != user_id:
            raise ArtifactAccessError("Artifact access denied")
        if self._expired(record.expires_at):
            self._records.pop(record.artifact_id, None)
            if record.storage_path:
                Path(record.storage_path).unlink(missing_ok=True)
            raise KeyError("Artifact expired")
        return record

    def list(self, tenant_id: str, user_id: str) -> List[ArtifactReference]:
        now = datetime.now(timezone.utc).isoformat()
        return [
            record
            for record in self._records.values()
            if record.tenant_id == tenant_id
            and record.user_id == user_id
            and (not record.expires_at or record.expires_at > now)
        ]

    def delete(self, artifact_id: str, tenant_id: str, user_id: str) -> None:
        record = self.get(artifact_id, tenant_id, user_id)
        self._records.pop(record.artifact_id, None)
        if record.storage_path:
            Path(record.storage_path).unlink(missing_ok=True)

    def cleanup_expired(self) -> int:
        expired = [
            record
            for record in self._records.values()
            if self._expired(record.expires_at)
        ]
        for record in expired:
            self._records.pop(record.artifact_id, None)
            if record.storage_path:
                Path(record.storage_path).unlink(missing_ok=True)
        return len(expired)

    @staticmethod
    def _expired(value: str | None) -> bool:
        if not value:
            return False
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed <= datetime.now(timezone.utc)

    @staticmethod
    def validate_table(table: StructuredTable) -> StructuredTable:
        if not table.columns:
            raise ValueError("Structured table requires columns")
        width = len(table.columns)
        if any(len(row) != width for row in table.rows):
            raise ValueError("Every table row must match the column count")
        return table

    @staticmethod
    def read_bytes(reference: ArtifactReference, tenant_id: str, user_id: str) -> bytes:
        if reference.tenant_id != tenant_id or reference.user_id != user_id:
            raise ArtifactAccessError("Artifact access denied")
        if not reference.storage_path:
            raise FileNotFoundError("Artifact has no stored content")
        return Path(reference.storage_path).read_bytes()


class MongoArtifactStore:
    """Durable artifact metadata in MongoDB and bytes in a unique local path."""

    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = Path(
            storage_dir or os.getenv("THANARAH_ARTIFACT_DIR", "/tmp/thanarah-artifacts")
        )
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _safe_name(name: str) -> str:
        return "".join(char if char.isalnum() or char in "._-" else "_" for char in name)[:120]

    @staticmethod
    def _date(value: Any) -> str | None:
        if value is None:
            return None
        if hasattr(value, "isoformat"):
            if getattr(value, "tzinfo", None) is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.isoformat()
        return str(value)

    @staticmethod
    def _expired(value: str | None) -> bool:
        if not value:
            return False
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed <= datetime.now(timezone.utc)

    @classmethod
    def _reference(cls, document: dict[str, Any]) -> ArtifactReference:
        return ArtifactReference(
            artifact_id=document["artifactId"],
            type=document["type"],
            name=document["name"],
            created_by=document["createdBy"],
            tenant_id=document["tenantId"],
            user_id=document["userId"],
            conversation_id=document.get("conversationId"),
            task_id=document.get("taskId"),
            status=document.get("status", "CREATED"),
            created_at=cls._date(document.get("createdAt")) or "",
            mime_type=document.get("mimeType", "application/octet-stream"),
            size=int(document.get("size", 0)),
            storage_path=document.get("storagePath"),
            expires_at=cls._date(document.get("expiresAt")),
        )

    async def create(
        self,
        tenant_id: str,
        user_id: str,
        artifact_type: str,
        name: str,
        conversation_id: str | None = None,
        task_id: str | None = None,
        content: bytes | None = None,
        mime_type: str = "application/octet-stream",
        expires_at: str | None = None,
    ) -> ArtifactReference:
        db = get_db()
        if db is None:
            raise RuntimeError("MongoDB persistence is unavailable")
        artifact_id = f"artifact-{uuid4().hex[:12]}"
        path = None
        if content is not None:
            path = self.storage_dir / f"{artifact_id}-{self._safe_name(name) or 'artifact'}"
            path.write_bytes(content)
        now = datetime.now(timezone.utc)
        expiry = (
            datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires_at
            else now + timedelta(seconds=settings.task_artifact_ttl_seconds)
        )
        document = {
            "_id": artifact_id,
            "artifactId": artifact_id,
            "type": artifact_type,
            "name": name[:160],
            "createdBy": user_id,
            "tenantId": tenant_id,
            "userId": user_id,
            "conversationId": conversation_id,
            "taskId": task_id,
            "status": "CREATED",
            "createdAt": now,
            "mimeType": mime_type,
            "size": len(content or b""),
            "storagePath": str(path) if path else None,
            "expiresAt": expiry,
        }
        try:
            await db.ai_artifacts.insert_one(document)
        except Exception:
            if path:
                path.unlink(missing_ok=True)
            raise
        return self._reference(document)

    async def get(self, artifact_id: str, tenant_id: str, user_id: str) -> ArtifactReference:
        db = get_db()
        if db is None:
            raise RuntimeError("MongoDB persistence is unavailable")
        document = await db.ai_artifacts.find_one(
            {"_id": artifact_id, "tenantId": tenant_id, "userId": user_id}
        )
        if not document:
            raise KeyError("Artifact not found")
        reference = self._reference(document)
        if self._expired(reference.expires_at):
            await self.delete(artifact_id, tenant_id, user_id)
            raise KeyError("Artifact expired")
        return reference

    async def list(self, tenant_id: str, user_id: str) -> List[ArtifactReference]:
        db = get_db()
        if db is None:
            raise RuntimeError("MongoDB persistence is unavailable")
        return [
            self._reference(document)
            async for document in db.ai_artifacts.find(
                {
                    "tenantId": tenant_id,
                    "userId": user_id,
                    "expiresAt": {"$gt": datetime.now(timezone.utc)},
                }
            ).sort("createdAt", -1)
        ]

    async def read_bytes(
        self, reference: ArtifactReference, tenant_id: str, user_id: str
    ) -> bytes:
        if reference.tenant_id != tenant_id or reference.user_id != user_id:
            raise ArtifactAccessError("Artifact access denied")
        if not reference.storage_path:
            raise FileNotFoundError("Artifact has no stored content")
        return Path(reference.storage_path).read_bytes()

    async def delete(self, artifact_id: str, tenant_id: str, user_id: str) -> None:
        db = get_db()
        if db is None:
            raise RuntimeError("MongoDB persistence is unavailable")
        document = await db.ai_artifacts.find_one(
            {"_id": artifact_id, "tenantId": tenant_id, "userId": user_id}
        )
        if not document:
            raise KeyError("Artifact not found")
        if document.get("storagePath"):
            Path(document["storagePath"]).unlink(missing_ok=True)
        await db.ai_artifacts.delete_one({"_id": artifact_id})

    async def cleanup_expired(self) -> int:
        db = get_db()
        if db is None:
            raise RuntimeError("MongoDB persistence is unavailable")
        expired = [
            document
            async for document in db.ai_artifacts.find(
                {"expiresAt": {"$lte": datetime.now(timezone.utc)}}
            )
        ]
        for document in expired:
            if document.get("storagePath"):
                Path(document["storagePath"]).unlink(missing_ok=True)
        if expired:
            await db.ai_artifacts.delete_many(
                {"_id": {"$in": [document["_id"] for document in expired]}}
            )
        return len(expired)
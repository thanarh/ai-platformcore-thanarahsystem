"""
Thanarah Memory Engine
Manages multiple memory scopes: Conversation, User, Clinic, Organization, Project
"""
import logging
from typing import Optional, List
from datetime import datetime
from app.database import get_db

logger = logging.getLogger(__name__)


class MemoryEngine:
    """
    Multi-scope memory for Thanarah AI.
    Scopes: conversation | user | clinic | organization | project
    """

    async def store(
        self,
        scope: str,
        content: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        importance: float = 0.5,
        metadata: Optional[dict] = None,
    ) -> str:
        """Store a memory record."""
        db = get_db()
        if not db:
            return ""

        doc = {
            "scope": scope,
            "tenantId": tenant_id,
            "userId": user_id,
            "conversationId": conversation_id,
            "content": content,
            "importance": importance,
            "metadata": metadata or {},
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }

        result = await db.memories.insert_one(doc)
        return str(result.inserted_id)

    async def retrieve(
        self,
        scope: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        limit: int = 10,
    ) -> List[dict]:
        """Retrieve memories for a given scope."""
        db = get_db()
        if not db:
            return []

        query: dict = {"scope": scope, "tenantId": tenant_id}
        if user_id:
            query["userId"] = user_id
        if conversation_id:
            query["conversationId"] = conversation_id

        cursor = db.memories.find(query).sort("importance", -1).limit(limit)
        memories = await cursor.to_list(length=limit)

        return [
            {
                "id": str(m["_id"]),
                "scope": m["scope"],
                "content": m["content"],
                "importance": m["importance"],
                "createdAt": m["createdAt"].isoformat(),
            }
            for m in memories
        ]

    async def delete(self, memory_id: str, tenant_id: str):
        """Delete a specific memory (GDPR/user control)."""
        from bson import ObjectId
        db = get_db()
        if not db:
            return
        await db.memories.delete_one({
            "_id": ObjectId(memory_id),
            "tenantId": tenant_id,
        })

    async def delete_scope(self, scope: str, tenant_id: str):
        """Delete all memories for a scope."""
        db = get_db()
        if not db:
            return
        await db.memories.delete_many({"scope": scope, "tenantId": tenant_id})

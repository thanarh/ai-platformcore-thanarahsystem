"""Low-cost conversational memory.

This is retrieval-based learning, not per-request fine-tuning: useful user/assistant
pairs are stored and only a few relevant memories are injected into later prompts.
It works with MongoDB when available and keeps a bounded in-process cache otherwise.
"""
from __future__ import annotations

import asyncio
import re
import time
from collections import defaultdict, deque
from typing import Any, Dict, List

from app.config import settings
from app.database import get_db

_TOKEN_RE = re.compile(r"[\w\u0600-\u06ff]{2,}", re.UNICODE)


class MemoryService:
    def __init__(self) -> None:
        self._cache: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=settings.memory_cache_size)
        )

    @staticmethod
    def _tokens(text: str) -> set[str]:
        return set(_TOKEN_RE.findall((text or "").lower()))

    @classmethod
    def _score(cls, query: str, text: str) -> float:
        q = cls._tokens(query)
        t = cls._tokens(text)
        if not q or not t:
            return 0.0
        return len(q & t) / max(1, len(q))

    async def remember(
        self,
        tenant_id: str,
        user_id: str | None,
        user_text: str,
        assistant_text: str,
    ) -> None:
        if not settings.memory_enabled or not user_text or not assistant_text:
            return
        item = {
            "tenantId": tenant_id,
            "userId": user_id,
            "query": user_text[-settings.memory_item_chars :],
            "answer": assistant_text[-settings.memory_item_chars :],
            "createdAt": time.time(),
        }
        self._cache[tenant_id].append(item)
        db = get_db()
        if db is not None:
            try:
                await asyncio.wait_for(db.ai_memories.insert_one(item), timeout=0.25)
                # Cleanup is intentionally deferred to a maintenance job; never scan/count
                # the tenant collection on the critical chat path.
            except Exception:
                # Memory must never slow or break the chat response.
                pass

    async def recall(
        self,
        tenant_id: str,
        query: str,
        limit: int | None = None,
        user_id: str | None = None,
    ) -> List[dict]:
        if not settings.memory_enabled:
            return []
        limit = limit or settings.memory_recall_limit
        candidates: List[dict] = [
            item for item in self._cache.get(tenant_id, [])
            if item.get("userId") in {None, user_id}
        ]
        db = get_db()
        if db is not None:
            try:
                candidates = await asyncio.wait_for(
                    db.ai_memories.find(
                        {
                            "tenantId": tenant_id,
                            "userId": {"$in": [None, user_id]},
                        },
                        {"query": 1, "answer": 1, "createdAt": 1},
                    ).sort("createdAt", -1).limit(settings.memory_scan_limit).to_list(None),
                    timeout=0.25,
                )
            except Exception:
                pass
        ranked = []
        for item in candidates:
            score = self._score(query, f"{item.get('query', '')} {item.get('answer', '')}")
            if score >= settings.memory_min_score:
                ranked.append({**item, "score": score})
        ranked.sort(key=lambda x: (x.get("score", 0), x.get("createdAt", 0)), reverse=True)
        return ranked[:limit]

    def info(self) -> dict[str, Any]:
        return {
            "enabled": settings.memory_enabled,
            "type": "retrieval-based continual memory",
            "cacheSize": settings.memory_cache_size,
            "recallLimit": settings.memory_recall_limit,
            "maxPerTenant": settings.memory_max_per_tenant,
            "trainingPerRequest": False,
        }


memory_service = MemoryService()

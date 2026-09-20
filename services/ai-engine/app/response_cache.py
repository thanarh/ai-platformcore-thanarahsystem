"""Tenant-safe exact response caching backed by memory and MongoDB."""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import settings
from app.database import get_db
from app.models.chat import ChatRequest, ChatResponse

class ResponseCacheService:
    def __init__(self) -> None:
        self._memory: OrderedDict[str, tuple[float, ChatResponse]] = OrderedDict()
        self._hits = 0
        self._misses = 0

    @staticmethod
    def _profile(request: ChatRequest) -> str:
        configured = (request.tenantConfig or {}).get("responseProfile", "fast")
        return configured if configured in {"fast", "balanced", "deep"} else "fast"

    @staticmethod
    def _last_user_text(request: ChatRequest) -> str:
        return next(
            (message.content for message in reversed(request.messages) if message.role == "user"),
            "",
        )

    @staticmethod
    def _normalize(text: str) -> str:
        return " ".join((text or "").lower().split())

    @classmethod
    def context_fingerprint(cls, request: ChatRequest) -> str:
        tenant_config = request.tenantConfig or {}
        policy = {
            "industry": tenant_config.get("industry", "general"),
            "medicalMode": tenant_config.get("medicalMode", {}),
            "systemPrompt": tenant_config.get("systemPrompt", ""),
            "preferredBackend": tenant_config.get("preferredBackend", ""),
            "historyWindow": tenant_config.get("historyWindow", 4),
            "maxHistoryChars": tenant_config.get("maxHistoryChars", 5000),
            "ragEnabled": tenant_config.get("ragEnabled", True),
            "memoryEnabled": tenant_config.get("memoryEnabled", True),
            "knowledgeVersion": tenant_config.get("knowledgeVersion", ""),
            "contextProfile": tenant_config.get("contextProfile", {}),
            "runtimeContext": tenant_config.get("runtimeContext", {}),
            "model": (
                settings.external_ai_model
                if settings.external_ai_enabled
                else settings.local_ai_model
            ),
        }
        raw = json.dumps(policy, ensure_ascii=False, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @classmethod
    def key(cls, request: ChatRequest) -> str:
        messages = "|".join(
            f"{message.role}:{cls._normalize(message.content)}"
            for message in request.messages[-8:]
        )
        raw = "|".join(
            [
                request.tenantId,
                request.userId or "anonymous",
                cls._profile(request),
                cls.context_fingerprint(request),
                request.conversationSummary or "",
                messages,
            ]
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def _enabled(request: ChatRequest) -> bool:
        tenant_config = request.tenantConfig or {}
        # Exact payload equality is not enough when mutable RAG or memory can
        # change the effective prompt. Cache only context-free requests until
        # those sources expose reliable per-tenant versions.
        return (
            settings.response_cache_enabled
            and tenant_config.get("cacheEnabled", True) is not False
            and tenant_config.get("ragEnabled", True) is False
            and tenant_config.get("memoryEnabled", True) is False
        )

    @staticmethod
    def _cache_response(document: dict, request_id: str | None, reason: str) -> ChatResponse:
        return ChatResponse(
            content=document.get("content", ""),
            model="thanarah-memory",
            backend="thanarah-cache",
            routeDecision=reason,
            inputTokens=0,
            outputTokens=0,
            latencyMs=0,
            ragSources=[],
            requestId=request_id,
        )

    def _remember_in_process(self, key: str, response: ChatResponse) -> None:
        self._memory[key] = (time.time(), response)
        self._memory.move_to_end(key)
        while len(self._memory) > settings.response_cache_size:
            self._memory.popitem(last=False)

    @staticmethod
    def _mongo_identity(value: str | None) -> list:
        if not value:
            return [None]
        values: list = [value]
        try:
            from bson import ObjectId
            if ObjectId.is_valid(value):
                values.append(ObjectId(value))
        except Exception:
            pass
        return values

    async def get(self, request: ChatRequest) -> Optional[ChatResponse]:
        if not self._enabled(request):
            return None

        key = self.key(request)
        entry = self._memory.get(key)
        if entry:
            created, response = entry
            if time.time() - created <= settings.response_cache_ttl_seconds:
                self._memory.move_to_end(key)
                self._hits += 1
                return response.model_copy(
                    update={
                        "model": "thanarah-memory",
                        "backend": "thanarah-cache",
                        "routeDecision": "Fast exact response reuse",
                        "requestId": request.requestId,
                        "latencyMs": 0,
                    }
                )
            self._memory.pop(key, None)

        if not settings.persistent_response_cache_enabled:
            self._misses += 1
            return None
        db = get_db()
        if db is None:
            self._misses += 1
            return None

        now = datetime.now(timezone.utc)
        try:
            exact = await asyncio.wait_for(
                db.ai_response_cache.find_one({"key": key, "expiresAt": {"$gt": now}}),
                timeout=settings.response_cache_db_timeout_seconds,
            )
            if exact and exact.get("content"):
                response = self._cache_response(exact, request.requestId, "Persistent exact response reuse")
                self._remember_in_process(key, response)
                self._hits += 1
                return response
        except Exception:
            pass
        self._misses += 1
        return None

    async def store(self, request: ChatRequest, response: ChatResponse) -> None:
        if not self._enabled(request) or response.backend in {"fallback", "none", "thanarah-cache"}:
            return
        if not response.content.strip():
            return

        key = self.key(request)
        self._remember_in_process(key, response)
        if not settings.persistent_response_cache_enabled:
            return
        db = get_db()
        if db is None:
            return

        now = datetime.now(timezone.utc)
        document = {
            "key": key,
            "tenantId": request.tenantId,
            "userId": request.userId or None,
            "profile": self._profile(request),
            "contextFingerprint": self.context_fingerprint(request),
            "standalone": len(request.messages) <= 2 and not request.conversationSummary,
            "normalizedQuery": self._normalize(self._last_user_text(request)),
            "content": response.content,
            "backend": response.backend,
            "createdAt": now,
            "updatedAt": now,
            "expiresAt": now + timedelta(seconds=settings.persistent_response_cache_ttl_seconds),
        }
        try:
            await asyncio.wait_for(
                db.ai_response_cache.update_one(
                    {"key": key},
                    {"$set": document},
                    upsert=True,
                ),
                timeout=settings.response_cache_db_timeout_seconds,
            )
        except Exception:
            return

    async def invalidate_tenant(self, tenant_id: str) -> None:
        self._memory.clear()
        db = get_db()
        if db is None:
            return
        try:
            await asyncio.wait_for(
                db.ai_response_cache.delete_many({"tenantId": tenant_id}),
                timeout=max(1.0, settings.response_cache_db_timeout_seconds * 2),
            )
        except Exception:
            return

    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "enabled": settings.response_cache_enabled,
            "mode": "exact",
            "persistent": settings.persistent_response_cache_enabled,
            "memoryEntries": len(self._memory),
            "capacity": settings.response_cache_size,
            "hits": self._hits,
            "misses": self._misses,
            "hitRate": round(self._hits / total, 4) if total else 0.0,
        }


response_cache_service = ResponseCacheService()

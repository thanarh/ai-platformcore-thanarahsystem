"""Tenant-safe response caching backed by memory and MongoDB.

Exact cache hits eliminate repeated model calls. A conservative lexical similarity
lookup is used only for standalone questions from the same tenant and user so that
near-duplicate wording can reuse a proven answer without crossing privacy boundaries
or ignoring conversation context.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import settings
from app.database import get_db
from app.models.chat import ChatRequest, ChatResponse

_TOKEN_RE = re.compile(r"[\w\u0600-\u06ff]{2,}", re.UNICODE)


class ResponseCacheService:
    def __init__(self) -> None:
        self._memory: OrderedDict[str, tuple[float, ChatResponse]] = OrderedDict()

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
        return " ".join(_TOKEN_RE.findall((text or "").lower()))

    @classmethod
    def _similarity(cls, left: str, right: str) -> float:
        left_tokens = set(_TOKEN_RE.findall((left or "").lower()))
        right_tokens = set(_TOKEN_RE.findall((right or "").lower()))
        if len(left_tokens) < 3 or len(right_tokens) < 3:
            return 0.0
        intersection = len(left_tokens & right_tokens)
        union = len(left_tokens | right_tokens)
        containment = intersection / max(1, min(len(left_tokens), len(right_tokens)))
        jaccard = intersection / max(1, union)
        return (containment * 0.65) + (jaccard * 0.35)

    @classmethod
    def context_fingerprint(cls, request: ChatRequest) -> str:
        tenant_config = request.tenantConfig or {}
        policy = {
            "industry": tenant_config.get("industry", "general"),
            "medicalMode": tenant_config.get("medicalMode", {}),
            "systemPrompt": tenant_config.get("systemPrompt", ""),
            "ragEnabled": tenant_config.get("ragEnabled", True),
            "memoryEnabled": tenant_config.get("memoryEnabled", True),
            "externalModel": settings.external_ai_model if settings.external_ai_enabled else "local",
        }
        raw = json.dumps(policy, ensure_ascii=False, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @classmethod
    def key(cls, request: ChatRequest) -> str:
        tenant_config = request.tenantConfig or {}
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
        return settings.response_cache_enabled and (
            (request.tenantConfig or {}).get("cacheEnabled", True) is not False
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

    async def get(self, request: ChatRequest) -> Optional[ChatResponse]:
        if not self._enabled(request):
            return None

        key = self.key(request)
        entry = self._memory.get(key)
        if entry:
            created, response = entry
            if time.time() - created <= settings.response_cache_ttl_seconds:
                self._memory.move_to_end(key)
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
            return None
        db = get_db()
        if db is None:
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
                return response

            standalone = len(request.messages) <= 2 and not request.conversationSummary
            query = self._last_user_text(request)
            if not standalone or len(self._normalize(query).split()) < 3:
                return None

            candidates = await asyncio.wait_for(
                db.ai_response_cache.find(
                    {
                        "tenantId": request.tenantId,
                        "userId": request.userId or None,
                        "profile": self._profile(request),
                        "contextFingerprint": self.context_fingerprint(request),
                        "standalone": True,
                        "expiresAt": {"$gt": now},
                    },
                    {"normalizedQuery": 1, "content": 1},
                )
                .sort("createdAt", -1)
                .limit(settings.response_cache_semantic_scan_limit)
                .to_list(None),
                timeout=settings.response_cache_db_timeout_seconds,
            )
            best = None
            best_score = 0.0
            for candidate in candidates:
                score = self._similarity(query, candidate.get("normalizedQuery", ""))
                if score > best_score:
                    best = candidate
                    best_score = score
            if best and best_score >= settings.response_cache_semantic_min_score:
                response = self._cache_response(
                    best,
                    request.requestId,
                    f"Persistent similar response reuse ({best_score:.2f})",
                )
                self._remember_in_process(key, response)
                return response
        except Exception:
            return None
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


response_cache_service = ResponseCacheService()

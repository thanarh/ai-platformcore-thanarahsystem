"""Idempotent daily conversational learning.

This job learns communication preferences, not unverified facts. Every completed
exchange is already stored in ai_memories; the daily analyzer summarizes language,
Arabic dialect signals, and recurring short phrases into per-user profile documents.
Explicit corrections remain the only automatic source of answer-level learning.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from app.database import get_db

logger = logging.getLogger(__name__)
_ARABIC_RE = re.compile(r"[\u0600-\u06ff]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_WORD_RE = re.compile(r"[\w\u0600-\u06ff]{2,}", re.UNICODE)

_DIALECT_MARKERS = {
    "gulf": {"هلا", "شلون", "وش", "وشلون", "أبغى", "ابي", "أبي", "شلونك", "يالغالي"},
    "egyptian": {"ازيك", "عامل", "ايه", "عايز", "عاوزه", "ليه", "دلوقتي", "كده"},
    "levantine": {"شو", "كيفك", "هلأ", "بدي", "ليش", "منيح", "هيك"},
    "maghrebi": {"واش", "بزاف", "دابا", "علاش", "لاباس", "برشا"},
    "msa": {"ماذا", "كيف", "لماذا", "أريد", "يمكن", "يرجى"},
}


class DailyLearningService:
    def __init__(self) -> None:
        self._profile_cache: dict[tuple[str, str], tuple[float, dict]] = {}

    @staticmethod
    def _language(text: str) -> str:
        arabic = len(_ARABIC_RE.findall(text))
        latin = len(_LATIN_RE.findall(text))
        if arabic > latin:
            return "ar"
        if latin > 0:
            return "multilingual"
        return "unknown"

    @staticmethod
    def _dialect_scores(text: str) -> Counter:
        tokens = set(_WORD_RE.findall(text.lower()))
        return Counter({name: len(tokens & markers) for name, markers in _DIALECT_MARKERS.items()})

    @staticmethod
    def _normalize_phrase(text: str) -> str:
        return " ".join(_WORD_RE.findall(text.lower()))[:160]

    async def analyze_day(self, day: datetime | None = None) -> int:
        db = get_db()
        if db is None:
            return 0
        current = day or datetime.now(timezone.utc)
        start = datetime(current.year, current.month, current.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        start_epoch, end_epoch = start.timestamp(), end.timestamp()

        try:
            rows = await db.ai_memories.find(
                {"createdAt": {"$gte": start_epoch, "$lt": end_epoch}},
                {"tenantId": 1, "userId": 1, "query": 1, "createdAt": 1},
            ).sort("createdAt", 1).limit(100000).to_list(None)
        except Exception as error:
            logger.warning("Daily learning read failed: %s", str(error)[:160])
            return 0

        grouped: dict[tuple[str, str], list[str]] = defaultdict(list)
        for row in rows:
            tenant_id = str(row.get("tenantId") or "")
            user_id = str(row.get("userId") or "")
            query = str(row.get("query") or "").strip()
            if tenant_id and user_id and query:
                grouped[(tenant_id, user_id)].append(query)

        completed = 0
        for (tenant_id, user_id), messages in grouped.items():
            languages = Counter(self._language(message) for message in messages)
            dialects: Counter = Counter()
            phrases = Counter()
            for message in messages:
                dialects.update(self._dialect_scores(message))
                phrase = self._normalize_phrase(message)
                if phrase and len(phrase.split()) <= 14:
                    phrases[phrase] += 1
            dialect = dialects.most_common(1)[0][0] if dialects and dialects.most_common(1)[0][1] > 0 else "neutral"
            document = {
                "day": start.strftime("%Y-%m-%d"),
                "tenantId": tenant_id,
                "userId": user_id,
                "messageCount": len(messages),
                "preferredLanguage": languages.most_common(1)[0][0] if languages else "unknown",
                "arabicDialect": dialect,
                "commonPhrases": [phrase for phrase, count in phrases.most_common(12) if count >= 2],
                "updatedAt": datetime.now(timezone.utc),
            }
            try:
                await db.ai_daily_learning.update_one(
                    {"day": document["day"], "tenantId": tenant_id, "userId": user_id},
                    {"$set": document},
                    upsert=True,
                )
                completed += 1
            except Exception:
                continue
        if completed:
            self._profile_cache.clear()
        return completed

    async def profile(self, tenant_id: str, user_id: str | None) -> dict:
        db = get_db()
        if db is None or not user_id:
            return {}
        cache_key = (tenant_id, user_id)
        cached = self._profile_cache.get(cache_key)
        if cached and time.time() - cached[0] < 300:
            return cached[1]
        try:
            rows = await asyncio.wait_for(
                db.ai_daily_learning.find(
                    {"tenantId": tenant_id, "userId": user_id},
                    {"preferredLanguage": 1, "arabicDialect": 1, "commonPhrases": 1, "messageCount": 1},
                ).sort("day", -1).limit(7).to_list(None),
                timeout=0.25,
            )
        except Exception:
            return {}
        if not rows:
            return {}
        languages = Counter(row.get("preferredLanguage", "unknown") for row in rows)
        dialects = Counter(row.get("arabicDialect", "neutral") for row in rows)
        phrases = Counter(phrase for row in rows for phrase in row.get("commonPhrases", []))
        profile = {
            "preferredLanguage": languages.most_common(1)[0][0],
            "arabicDialect": dialects.most_common(1)[0][0],
            "commonPhrases": [phrase for phrase, _ in phrases.most_common(6)],
            "analyzedMessages": sum(int(row.get("messageCount", 0)) for row in rows),
        }
        self._profile_cache[cache_key] = (time.time(), profile)
        return profile

    async def worker(self) -> None:
        await asyncio.sleep(15)
        while True:
            try:
                await self.analyze_day()
                await self.analyze_day(datetime.now(timezone.utc) - timedelta(days=1))
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.warning("Daily learning cycle failed: %s", str(error)[:160])
            await asyncio.sleep(3600)


daily_learning_service = DailyLearningService()

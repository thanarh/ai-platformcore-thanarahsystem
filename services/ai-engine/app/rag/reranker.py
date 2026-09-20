"""Local reranking with an optional open-source CrossEncoder.

If the optional sentence-transformers model is unavailable, a deterministic
lexical reranker keeps the Qdrant path functional without an external API.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


class LocalReranker:
    def __init__(self) -> None:
        self._model = None
        self._attempted = False

    def _load(self):
        if self._attempted:
            return self._model
        self._attempted = True
        if not settings.rag_reranker_enabled:
            return None
        try:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(settings.rag_reranker_model, device=settings.embedding_device)
            logger.info("Loaded local RAG reranker %s", settings.rag_reranker_model)
        except Exception as exc:
            logger.warning("Local CrossEncoder unavailable; using lexical reranker: %s", str(exc)[:180])
        return self._model

    @staticmethod
    def _lexical_score(query: str, content: str) -> float:
        query_terms = set(re.findall(r"[\w\u0600-\u06ff]{2,}", query.lower()))
        content_terms = set(re.findall(r"[\w\u0600-\u06ff]{2,}", content.lower()))
        return len(query_terms & content_terms) / max(1, len(query_terms))

    async def rerank(self, query: str, candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
        if not candidates:
            return []
        model = await asyncio.to_thread(self._load)
        if model is not None:
            pairs = [(query, item.get("content", "")) for item in candidates]
            scores = await asyncio.to_thread(model.predict, pairs, show_progress_bar=False)
            ranked = [
                {**item, "rerankScore": float(score)}
                for item, score in zip(candidates, scores)
            ]
            ranked.sort(key=lambda item: item["rerankScore"], reverse=True)
            return ranked[:limit]
        ranked = [
            {
                **item,
                "rerankScore": self._lexical_score(query, item.get("content", "")),
            }
            for item in candidates
        ]
        ranked.sort(key=lambda item: (item["rerankScore"], item.get("score", 0.0)), reverse=True)
        return ranked[:limit]


local_reranker = LocalReranker()
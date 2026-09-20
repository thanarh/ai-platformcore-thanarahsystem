"""Small REST client for the optional Qdrant knowledge store.

MongoDB remains the source of application data and the legacy RAG fallback.
This adapter only handles knowledge vectors and always applies tenant filters
server-side in Qdrant.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
from collections import Counter
from typing import Any, Iterable

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class QdrantUnavailable(RuntimeError):
    """Raised when the optional Qdrant service cannot be used."""


def _point_id(tenant_id: str, source_id: str, version: str, chunk_id: str) -> str:
    value = f"{tenant_id}\x1f{source_id}\x1f{version}\x1f{chunk_id}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def _terms(text: str) -> list[str]:
    return re.findall(r"[\w\u0600-\u06ff]{2,}", text.lower())


class QdrantStore:
    """Qdrant REST operations with deterministic, idempotent point IDs."""

    def __init__(self) -> None:
        self.base_url = settings.qdrant_url.rstrip("/")
        self.collection = settings.qdrant_collection
        self.timeout = settings.qdrant_timeout_seconds
        self._ready = False

    @property
    def enabled(self) -> bool:
        return settings.qdrant_enabled and (
            settings.qdrant_rag or settings.rag_backend.lower() == "qdrant"
        )

    def _headers(self) -> dict[str, str]:
        if settings.qdrant_api_key:
            return {"api-key": settings.qdrant_api_key}
        return {}

    async def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                headers=self._headers(),
                timeout=timeout or self.timeout,
            ) as client:
                response = await client.request(method, path, json=payload)
                response.raise_for_status()
                return response.json() if response.content else {}
        except Exception as exc:
            raise QdrantUnavailable(str(exc)[:240]) from exc

    async def ensure_collection(self, dimension: int) -> bool:
        if not self.enabled:
            return False
        try:
            await self._request("GET", f"/collections/{self.collection}")
        except QdrantUnavailable as exc:
            if "404" not in str(exc):
                logger.warning("Qdrant unavailable: %s", exc)
                return False
            try:
                await self._request(
                    "PUT",
                    f"/collections/{self.collection}",
                    payload={
                        "vectors": {
                            "size": dimension,
                            "distance": "Cosine",
                        }
                    },
                )
            except QdrantUnavailable as create_exc:
                logger.warning("Qdrant collection creation failed: %s", create_exc)
                return False

        # Payload indexes make tenant and document filters explicit and fast.
        for field in (
            "tenantId",
            "clinicId",
            "documentId",
            "documentVersion",
            "language",
            "category",
            "accessLevel",
            "status",
        ):
            try:
                await self._request(
                    "PUT",
                    f"/collections/{self.collection}/index",
                    payload={"field_name": field, "field_schema": "keyword"},
                )
            except QdrantUnavailable:
                # Older/self-hosted Qdrant versions may reject a duplicate
                # index; collection readiness is still valid.
                pass
        self._ready = True
        return True

    async def is_available(self) -> bool:
        if not self.enabled:
            return False
        try:
            await self._request("GET", "/")
            return True
        except QdrantUnavailable:
            return False

    @staticmethod
    def _match(field: str, value: Any) -> dict[str, Any]:
        return {"key": field, "match": {"value": value}}

    def _tenant_filter(self, tenant_id: str, extra: Iterable[dict[str, Any]] = ()) -> dict[str, Any]:
        return {"must": [self._match("tenantId", tenant_id), *extra]}

    async def upsert_chunks(
        self,
        *,
        tenant_id: str,
        source_id: str,
        document_version: str,
        chunks: list[str],
        embeddings: list[list[float]],
        metadata: dict[str, Any],
    ) -> int:
        if not chunks:
            return 0
        if not self._ready and not await self.ensure_collection(len(embeddings[0])):
            raise QdrantUnavailable("collection is not ready")
        points = []
        for index, (chunk, vector) in enumerate(zip(chunks, embeddings)):
            chunk_id = f"{source_id}:{document_version}:{index}"
            payload = {
                "tenantId": tenant_id,
                "clinicId": metadata.get("clinicId"),
                "documentId": metadata.get("documentId") or source_id,
                "documentVersion": document_version,
                "chunkId": chunk_id,
                "language": metadata.get("language", "unknown"),
                "category": metadata.get("category", "general"),
                "accessLevel": metadata.get("accessLevel", "tenant"),
                "status": metadata.get("status", "active"),
                "sourceId": source_id,
                "chunkIndex": index,
                "totalChunks": len(chunks),
                "content": chunk,
                "createdAt": metadata.get("createdAt"),
                "updatedAt": metadata.get("updatedAt"),
            }
            points.append(
                {
                    "id": _point_id(tenant_id, source_id, document_version, chunk_id),
                    "vector": vector,
                    "payload": payload,
                }
            )
        await self._request(
            "PUT",
            f"/collections/{self.collection}/points?wait=true",
            payload={"points": points},
        )
        return len(points)

    async def delete_source(
        self,
        tenant_id: str,
        source_id: str,
        document_version: str | None = None,
    ) -> None:
        if not self.enabled or not self._ready:
            return
        extra = [self._match("sourceId", source_id)]
        if document_version:
            extra.append(self._match("documentVersion", document_version))
        await self._request(
            "POST",
            f"/collections/{self.collection}/points/delete?wait=true",
            payload={"filter": self._tenant_filter(tenant_id, extra)},
        )

    async def _dense_search(
        self,
        tenant_id: str,
        vector: list[float],
        limit: int,
        extra_filter: Iterable[dict[str, Any]] = (),
    ) -> list[dict[str, Any]]:
        response = await self._request(
            "POST",
            f"/collections/{self.collection}/points/search",
            payload={
                "vector": vector,
                "limit": limit,
                "with_payload": True,
                "filter": self._tenant_filter(tenant_id, extra_filter),
            },
        )
        return response.get("result", [])

    async def _scroll_tenant(
        self,
        tenant_id: str,
        limit: int,
        extra_filter: Iterable[dict[str, Any]] = (),
    ) -> list[dict[str, Any]]:
        response = await self._request(
            "POST",
            f"/collections/{self.collection}/points/scroll",
            payload={
                "limit": limit,
                "with_payload": True,
                "with_vector": False,
                "filter": self._tenant_filter(tenant_id, extra_filter),
            },
        )
        return response.get("result", {}).get("points", [])

    @staticmethod
    def _bm25(query: list[str], content: str, document_frequency: Counter, total_docs: int) -> float:
        terms = _terms(content)
        if not terms or not query:
            return 0.0
        counts = Counter(terms)
        score = 0.0
        length_norm = 0.75 + 0.25 * (len(terms) / 350)
        for term in set(query):
            if term not in counts:
                continue
            tf = counts[term] / (counts[term] + 1.2)
            idf = math.log(1 + (total_docs + 1) / (document_frequency[term] + 1))
            score += tf * idf / length_norm
        return score

    async def hybrid_search(
        self,
        tenant_id: str,
        query: str,
        vector: list[float],
        candidate_limit: int,
        extra_filter: Iterable[dict[str, Any]] = (),
    ) -> list[dict[str, Any]]:
        dense = await self._dense_search(tenant_id, vector, candidate_limit, extra_filter)
        lexical = await self._scroll_tenant(
            tenant_id,
            max(candidate_limit * 4, settings.rag_max_scan),
            extra_filter,
        )
        query_terms = _terms(query)
        frequencies = Counter(
            term
            for point in lexical
            for term in set(_terms(point.get("payload", {}).get("content", "")))
        )
        dense_by_id = {str(point.get("id")): (rank, point) for rank, point in enumerate(dense, 1)}
        lexical_scored = []
        for point in lexical:
            payload = point.get("payload", {})
            score = self._bm25(query_terms, payload.get("content", ""), frequencies, len(lexical))
            if score > 0:
                lexical_scored.append((score, point))
        lexical_scored.sort(key=lambda item: item[0], reverse=True)
        lexical_by_id = {str(point.get("id")): (rank, point, score) for rank, (score, point) in enumerate(lexical_scored, 1)}

        fused: dict[str, dict[str, Any]] = {}
        for point_id, (rank, point) in dense_by_id.items():
            fused.setdefault(point_id, {"point": point, "rrf": 0.0})["rrf"] += 1 / (60 + rank)
        for point_id, (rank, point, score) in lexical_by_id.items():
            item = fused.setdefault(point_id, {"point": point, "rrf": 0.0})
            item["point"] = point
            item["rrf"] += 1 / (60 + rank)
            item["lexicalScore"] = score
        ordered = sorted(fused.values(), key=lambda item: item["rrf"], reverse=True)
        results = []
        for item in ordered[:candidate_limit]:
            payload = item["point"].get("payload", {})
            results.append(
                {
                    "content": payload.get("content", ""),
                    "sourceId": payload.get("sourceId"),
                    "documentId": payload.get("documentId"),
                    "documentVersion": payload.get("documentVersion"),
                    "chunkId": payload.get("chunkId"),
                    "language": payload.get("language"),
                    "category": payload.get("category"),
                    "accessLevel": payload.get("accessLevel"),
                    "score": item["rrf"],
                    "denseScore": item["point"].get("score", 0.0),
                    "lexicalScore": item.get("lexicalScore", 0.0),
                }
            )
        return results


qdrant_store = QdrantStore()
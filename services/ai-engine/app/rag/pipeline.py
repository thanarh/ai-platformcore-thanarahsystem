"""
Thanarah RAG Pipeline
Upload → Parse → Clean → Chunk → Embed → Store → Retrieve → Rank → Context → LLM
Vector storage is behind an abstraction — backend can be changed later.
"""
import asyncio
import logging
import io
import re
import time
from datetime import datetime, timezone
from typing import Any, List, Optional
import numpy as np
from app.database import get_db
from app.embeddings import embedding_service
from app.config import settings
from app.rag.qdrant_store import QdrantUnavailable, qdrant_store
from app.rag.reranker import local_reranker

logger = logging.getLogger(__name__)


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a_arr = np.array(a)
    b_arr = np.array(b)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))


class EmbeddingModel:
    """Compatibility wrapper around the local embedding service."""

    def encode(self, text: str) -> List[float]:
        return embedding_service.encode(text)


class DocumentParser:
    """Parse various document formats into text."""

    def parse_pdf(self, content: bytes) -> str:
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            text = []
            for page in reader.pages:
                text.append(page.extract_text() or "")
            return "\n\n".join(text)
        except Exception as e:
            logger.error(f"PDF parse error: {e}")
            return ""

    def parse_docx(self, content: bytes) -> str:
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
            return "\n".join(para.text for para in doc.paragraphs if para.text.strip())
        except Exception as e:
            logger.error(f"DOCX parse error: {e}")
            return ""

    def parse_text(self, content: bytes) -> str:
        try:
            import chardet
            detected = chardet.detect(content)
            encoding = detected.get("encoding", "utf-8") or "utf-8"
            return content.decode(encoding)
        except Exception:
            return content.decode("utf-8", errors="ignore")

    def parse(self, content: bytes, mime_type: str) -> str:
        if "pdf" in mime_type:
            return self.parse_pdf(content)
        elif "docx" in mime_type or "openxmlformats" in mime_type:
            return self.parse_docx(content)
        else:
            return self.parse_text(content)


class TextChunker:
    """Split text into overlapping chunks for retrieval."""

    def __init__(self, chunk_size: int = 350, overlap: int = 40):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, text: str) -> List[str]:
        text = re.sub(r"\s+", " ", text).strip()
        words = text.split()
        chunks = []
        start = 0
        while start < len(words):
            end = min(start + self.chunk_size, len(words))
            chunk = " ".join(words[start:end])
            if chunk.strip():
                chunks.append(chunk.strip())
            if end >= len(words):
                break
            start = end - self.overlap
        return chunks


class RAGPipeline:
    """
    Full RAG pipeline with MongoDB-backed vector storage.
    The embedding and vector backend are abstracted — swap without changing this class.
    """

    def __init__(self):
        self.embedder = EmbeddingModel()
        self.parser = DocumentParser()
        self.chunker = TextChunker(settings.rag_chunk_size, settings.rag_chunk_overlap)

    async def ingest(
        self,
        source_id: str,
        tenant_id: str,
        content: bytes,
        mime_type: str = "text/plain",
        *,
        document_version: str = "v1",
        clinic_id: str | None = None,
        language: str = "unknown",
        category: str = "general",
        access_level: str = "tenant",
    ) -> int:
        """Parse, chunk, embed, and store a document. Returns chunk count."""
        db = get_db()
        if db is None:
            logger.warning("Database not available for RAG ingest")
            return 0

        # Parse
        text = self.parser.parse(content, mime_type)
        if not text.strip():
            return 0

        # Chunk
        chunks = self.chunker.chunk(text)

        now = datetime.now(timezone.utc).isoformat()
        metadata = {
            "documentId": source_id,
            "clinicId": clinic_id,
            "language": language,
            "category": category,
            "accessLevel": access_level,
            "status": "active",
            "createdAt": now,
            "updatedAt": now,
        }

        # Replace previous Mongo chunks for the source so retries remain
        # compatible with the legacy path.
        await db.knowledge_chunks.delete_many({"sourceId": source_id, "tenantId": tenant_id})

        # Embed and store
        stored = 0
        embeddings: list[list[float]] = []
        for i, chunk in enumerate(chunks):
            embedding = self.embedder.encode(chunk)
            embeddings.append(embedding)
            await db.knowledge_chunks.insert_one({
                "sourceId": source_id,
                "tenantId": tenant_id,
                "documentId": source_id,
                "documentVersion": document_version,
                "clinicId": clinic_id,
                "language": language,
                "category": category,
                "accessLevel": access_level,
                "status": "active",
                "content": chunk,
                "embedding": embedding,
                "chunkId": f"{source_id}:{document_version}:{i}",
                "chunkIndex": i,
                "totalChunks": len(chunks),
                "createdAt": now,
                "updatedAt": now,
            })
            stored += 1

        if qdrant_store.enabled:
            try:
                await qdrant_store.ensure_collection(len(embeddings[0]))
                await qdrant_store.delete_source(tenant_id, source_id, document_version)
                await qdrant_store.upsert_chunks(
                    tenant_id=tenant_id,
                    source_id=source_id,
                    document_version=document_version,
                    chunks=chunks,
                    embeddings=embeddings,
                    metadata=metadata,
                )
            except QdrantUnavailable as exc:
                # Mongo remains the safe legacy source while Qdrant is
                # starting, unavailable, or being rolled back.
                logger.warning("Qdrant dual-write skipped; legacy data is intact: %s", exc)

        logger.info(f"Ingested {stored} chunks for source {source_id}")
        from app.response_cache import response_cache_service

        await response_cache_service.invalidate_tenant(tenant_id)
        return stored

    async def retrieve(
        self,
        tenant_id: str,
        query: str,
        limit: int = 5,
        threshold: float = 0.1,
        telemetry=None,
    ) -> List[dict]:
        """Retrieve the most relevant chunks for a query."""
        db = get_db()
        if db is None and not qdrant_store.enabled:
            return []

        embedding_started = time.perf_counter()
        query_embedding = await asyncio.to_thread(self.embedder.encode, query)
        if telemetry is not None:
            telemetry.add_ms("embeddingMs", embedding_started)

        if qdrant_store.enabled:
            try:
                candidates = await qdrant_store.hybrid_search(
                    tenant_id,
                    query,
                    query_embedding,
                    max(settings.qdrant_candidate_limit, limit * 4),
                )
                return await local_reranker.rerank(query, candidates, min(limit, settings.rag_default_limit))
            except QdrantUnavailable as exc:
                logger.warning("Qdrant retrieval unavailable; falling back to legacy RAG: %s", exc)

        # Bounded scan keeps CPU/RAM predictable in the legacy backend.
        if db is None:
            return []
        try:
            chunks = await asyncio.wait_for(
                db.knowledge_chunks.find(
                    {"tenantId": tenant_id},
                    {
                        "content": 1,
                        "embedding": 1,
                        "sourceId": 1,
                        "documentId": 1,
                        "documentVersion": 1,
                        "chunkId": 1,
                        "clinicId": 1,
                        "language": 1,
                        "category": 1,
                        "accessLevel": 1,
                        "chunkIndex": 1,
                    },
                ).sort("chunkIndex", 1).to_list(length=settings.rag_max_scan),
                timeout=settings.rag_query_timeout_seconds,
            )
        except Exception as exc:
            logger.warning("Knowledge retrieval query failed: %s", str(exc)[:200])
            return []

        if not chunks:
            return []

        def rank_chunks() -> list[dict]:
            scored = []
            query_terms = set(re.findall(r"[\w\u0600-\u06ff]{2,}", query.lower()))
            identifier_terms = {
                term for term in query_terms
                if len(term) >= 6 or any(char.isdigit() for char in term)
            }
            for chunk in chunks:
                embedding = chunk.get("embedding", [])
                if not embedding:
                    continue
                vector_score = cosine_similarity(query_embedding, embedding)
                content_terms = set(
                    re.findall(r"[\w\u0600-\u06ff]{2,}", chunk.get("content", "").lower())
                )
                lexical_score = len(query_terms & content_terms) / max(1, len(query_terms))
                identifier_score = len(identifier_terms & content_terms) / max(1, len(identifier_terms))
                score = (vector_score * 0.55) + (lexical_score * 0.30) + (identifier_score * 0.15)
                if score >= threshold:
                    scored.append({
                        "content": chunk["content"],
                        "sourceId": chunk["sourceId"],
                        "documentId": chunk.get("documentId", chunk["sourceId"]),
                        "documentVersion": chunk.get("documentVersion", "v1"),
                        "chunkId": chunk.get("chunkId"),
                        "clinicId": chunk.get("clinicId"),
                        "language": chunk.get("language", "unknown"),
                        "category": chunk.get("category", "general"),
                        "accessLevel": chunk.get("accessLevel", "tenant"),
                        "score": score,
                        "chunkIndex": chunk.get("chunkIndex", 0),
                    })
            scored.sort(key=lambda item: item["score"], reverse=True)
            return scored

        scored = await asyncio.to_thread(rank_chunks)
        return scored[: min(limit, settings.rag_default_limit)]

    async def ingest_text(self, source_id: str, tenant_id: str, text: str) -> int:
        """Ingest plain text directly."""
        return await self.ingest(
            source_id, tenant_id, text.encode("utf-8"), "text/plain"
        )

    async def reindex_tenant(self, tenant_id: str, source_id: str | None = None) -> int:
        """Idempotently project existing Mongo chunks into Qdrant."""
        db = get_db()
        if db is None or not qdrant_store.enabled:
            return 0
        query: dict[str, Any] = {"tenantId": tenant_id}
        if source_id:
            query["sourceId"] = source_id
        documents = await db.knowledge_chunks.find(query).to_list(length=settings.rag_max_scan)
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for item in documents:
            key = (item.get("sourceId", ""), item.get("documentVersion", "v1"))
            grouped.setdefault(key, []).append(item)
        projected = 0
        for (source, version), items in grouped.items():
            items.sort(key=lambda item: item.get("chunkIndex", 0))
            if not items or not items[0].get("embedding"):
                continue
            await qdrant_store.ensure_collection(len(items[0]["embedding"]))
            await qdrant_store.delete_source(tenant_id, source, version)
            await qdrant_store.upsert_chunks(
                tenant_id=tenant_id,
                source_id=source,
                document_version=version,
                chunks=[item.get("content", "") for item in items],
                embeddings=[item.get("embedding", []) for item in items],
                metadata=items[0],
            )
            projected += len(items)
        return projected

    async def delete_source(self, source_id: str, tenant_id: str | None = None):
        """Remove all chunks for a source."""
        db = get_db()
        if db is not None:
            query = {"sourceId": source_id}
            if tenant_id:
                query["tenantId"] = tenant_id
            await db.knowledge_chunks.delete_many(query)
            if tenant_id and qdrant_store.enabled:
                try:
                    await qdrant_store.delete_source(tenant_id, source_id)
                except QdrantUnavailable as exc:
                    logger.warning("Qdrant delete skipped: %s", exc)
            if tenant_id:
                from app.response_cache import response_cache_service

                await response_cache_service.invalidate_tenant(tenant_id)

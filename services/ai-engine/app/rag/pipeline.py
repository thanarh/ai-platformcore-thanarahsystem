"""
Thanarah RAG Pipeline
Upload → Parse → Clean → Chunk → Embed → Store → Retrieve → Rank → Context → LLM
Vector storage is behind an abstraction — backend can be changed later.
"""
import asyncio
import logging
import io
import re
from typing import List, Optional
import numpy as np
from app.database import get_db
from app.embeddings import embedding_service
from app.config import settings

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
        self.chunker = TextChunker()

    async def ingest(
        self,
        source_id: str,
        tenant_id: str,
        content: bytes,
        mime_type: str = "text/plain",
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

        # Replace previous chunks for the source so retries remain idempotent.
        await db.knowledge_chunks.delete_many({"sourceId": source_id, "tenantId": tenant_id})

        # Embed and store
        stored = 0
        for i, chunk in enumerate(chunks):
            embedding = self.embedder.encode(chunk)
            await db.knowledge_chunks.insert_one({
                "sourceId": source_id,
                "tenantId": tenant_id,
                "content": chunk,
                "embedding": embedding,
                "chunkIndex": i,
                "totalChunks": len(chunks),
            })
            stored += 1

        logger.info(f"Ingested {stored} chunks for source {source_id}")
        return stored

    async def retrieve(
        self,
        tenant_id: str,
        query: str,
        limit: int = 5,
        threshold: float = 0.1,
    ) -> List[dict]:
        """Retrieve the most relevant chunks for a query."""
        db = get_db()
        if db is None:
            return []

        query_embedding = self.embedder.encode(query)

        # Bounded scan keeps CPU/RAM predictable until a native vector index is enabled.
        try:
            chunks = await asyncio.wait_for(
                db.knowledge_chunks.find(
                    {"tenantId": tenant_id},
                    {"content": 1, "embedding": 1, "sourceId": 1, "chunkIndex": 1},
                ).sort("chunkIndex", 1).to_list(length=settings.rag_max_scan),
                timeout=settings.rag_query_timeout_seconds,
            )
        except Exception as exc:
            logger.warning("Knowledge retrieval query failed: %s", str(exc)[:200])
            return []

        if not chunks:
            return []

        # Rank by cosine similarity
        scored = []
        for chunk in chunks:
            embedding = chunk.get("embedding", [])
            if embedding:
                vector_score = cosine_similarity(query_embedding, embedding)
                query_terms = set(re.findall(r"[\w\u0600-\u06ff]{2,}", query.lower()))
                content_terms = set(re.findall(r"[\w\u0600-\u06ff]{2,}", chunk.get("content", "").lower()))
                shared_terms = query_terms & content_terms
                lexical_score = len(shared_terms) / max(1, len(query_terms))
                # Long identifiers, ticket numbers, and mixed alpha-numeric codes are
                # highly discriminative and must outrank older, generally similar text.
                identifier_terms = {
                    term for term in query_terms
                    if len(term) >= 6 or any(char.isdigit() for char in term)
                }
                identifier_score = len(identifier_terms & content_terms) / max(1, len(identifier_terms))
                score = (vector_score * 0.55) + (lexical_score * 0.30) + (identifier_score * 0.15)
                if score >= threshold:
                    scored.append({
                        "content": chunk["content"],
                        "sourceId": chunk["sourceId"],
                        "score": score,
                        "chunkIndex": chunk.get("chunkIndex", 0),
                    })

        # Sort by score descending
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[: min(limit, settings.rag_default_limit)]

    async def ingest_text(self, source_id: str, tenant_id: str, text: str) -> int:
        """Ingest plain text directly."""
        return await self.ingest(
            source_id, tenant_id, text.encode("utf-8"), "text/plain"
        )

    async def delete_source(self, source_id: str):
        """Remove all chunks for a source."""
        db = get_db()
        if db is not None:
            await db.knowledge_chunks.delete_many({"sourceId": source_id})

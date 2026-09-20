import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.rag.pipeline import RAGPipeline

logger = logging.getLogger(__name__)
router = APIRouter()
rag = RAGPipeline()


class IngestRequest(BaseModel):
    sourceId: str
    tenantId: str
    fileUrl: Optional[str] = None
    mimeType: Optional[str] = "text/plain"
    text: Optional[str] = None
    documentVersion: Optional[str] = "v1"
    clinicId: Optional[str] = None
    language: Optional[str] = "unknown"
    category: Optional[str] = "general"
    accessLevel: Optional[str] = "tenant"


class SearchRequest(BaseModel):
    tenantId: str
    query: str
    limit: Optional[int] = 5


@router.post("/ingest")
async def ingest_knowledge(req: IngestRequest):
    """Ingest a document into the knowledge base."""
    try:
        if req.text:
            count = await rag.ingest(
                req.sourceId,
                req.tenantId,
                req.text.encode("utf-8"),
                "text/plain",
                document_version=req.documentVersion or "v1",
                clinic_id=req.clinicId,
                language=req.language or "unknown",
                category=req.category or "general",
                access_level=req.accessLevel or "tenant",
            )
        elif req.fileUrl:
            # Download file
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(req.fileUrl)
                response.raise_for_status()
                content = response.content
                mime = req.mimeType or "text/plain"
            count = await rag.ingest(
                req.sourceId,
                req.tenantId,
                content,
                mime,
                document_version=req.documentVersion or "v1",
                clinic_id=req.clinicId,
                language=req.language or "unknown",
                category=req.category or "general",
                access_level=req.accessLevel or "tenant",
            )
        else:
            raise HTTPException(status_code=400, detail="Either text or fileUrl required")

        return {"success": True, "chunkCount": count, "sourceId": req.sourceId}
    except Exception as e:
        logger.error(f"Ingest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_knowledge(req: SearchRequest):
    """Search the knowledge base for relevant chunks."""
    try:
        results = await rag.retrieve(req.tenantId, req.query, req.limit)
        return {"results": results, "count": len(results)}
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{source_id}")
async def delete_knowledge(source_id: str, tenantId: str | None = None):
    """Remove all chunks for a knowledge source."""
    await rag.delete_source(source_id, tenantId)
    return {"success": True, "sourceId": source_id}


class ReindexRequest(BaseModel):
    tenantId: str
    sourceId: Optional[str] = None


@router.post("/reindex")
async def reindex_knowledge(req: ReindexRequest):
    """Idempotently project existing Mongo knowledge chunks into Qdrant."""
    try:
        count = await rag.reindex_tenant(req.tenantId, req.sourceId)
        return {"success": True, "projectedChunkCount": count, "sourceId": req.sourceId}
    except Exception as exc:
        logger.error("Reindex error: %s", exc)
        raise HTTPException(status_code=500, detail="Knowledge reindex failed")

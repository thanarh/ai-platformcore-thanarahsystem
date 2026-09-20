from fastapi import APIRouter

from app.web_intelligence import web_intelligence_pipeline

router = APIRouter()


@router.get("/capabilities")
async def web_capabilities():
    """Expose local web dependency status without claiming search is enabled."""
    return await web_intelligence_pipeline.capabilities()
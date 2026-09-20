from fastapi import APIRouter

from app.skills.registry import skill_registry

router = APIRouter()


@router.get("/skills")
async def list_skills():
    return {
        "skills": skill_registry.list_skills(),
        "executionMode": "registry-only",
        "note": "Skills marked contract-only are not executable in this phase.",
    }
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional


@dataclass(frozen=True)
class SkillDefinition:
    id: str
    name: str
    description: str
    category: str
    input_schema: Dict[str, Any] = field(default_factory=dict)
    output_type: str = "text"
    required_permissions: tuple[str, ...] = ()
    enabled: bool = False
    implementation_status: str = "contract-only"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "inputSchema": self.input_schema,
            "outputType": self.output_type,
            "requiredPermissions": list(self.required_permissions),
            "enabled": self.enabled,
            "implementationStatus": self.implementation_status,
        }


class SkillRegistry:
    def __init__(self, skills: Optional[Iterable[SkillDefinition]] = None):
        self._skills: Dict[str, SkillDefinition] = {}
        for skill in skills or self._defaults():
            self.register(skill)

    @staticmethod
    def _defaults() -> List[SkillDefinition]:
        return [
            SkillDefinition("summarize", "Summarize", "Summarize supplied conversation or text.", "writing", {"text": {"type": "string"}}, "text", enabled=True, implementation_status="text-capability"),
            SkillDefinition("write", "Write", "Draft or rewrite text from supplied context.", "writing", {"instruction": {"type": "string"}}, "text", enabled=True, implementation_status="text-capability"),
            SkillDefinition("data_analysis", "Analyze Data", "Analyze structured data supplied by an authorized source.", "analysis", {"data": {"type": "object"}}, "json", ("data.read",), implementation_status="contract-only"),
            SkillDefinition("research", "Research", "Coordinate a future research workflow with verified sources.", "research", {"question": {"type": "string"}}, "report", ("internet_access",), implementation_status="contract-only"),
            SkillDefinition("web_search", "Web Search", "Search approved web sources and return citations.", "research", {"query": {"type": "string"}}, "sources", ("internet_access",), implementation_status="contract-only"),
            SkillDefinition("create_pdf", "Create PDF", "Render an approved document or report as PDF.", "artifacts", {"content": {"type": "object"}}, "artifact", ("artifact_write",), implementation_status="contract-only"),
            SkillDefinition("create_document", "Create Document", "Create a document artifact from structured content.", "artifacts", {"content": {"type": "object"}}, "artifact", ("artifact_write",), implementation_status="contract-only"),
            SkillDefinition("create_spreadsheet", "Create Spreadsheet", "Create a structured table suitable for spreadsheet export.", "artifacts", {"table": {"type": "object"}}, "table", ("artifact_write",), implementation_status="contract-only"),
        ]

    def register(self, skill: SkillDefinition) -> None:
        self._skills[skill.id] = skill

    def get(self, skill_id: str) -> Optional[SkillDefinition]:
        return self._skills.get(skill_id)

    def list_skills(self, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        context = context or {}
        topics = set(context.get("frequentTopics") or []) | set(context.get("frequentTasks") or [])
        organization = context.get("organizationContext") or {}
        scores: Dict[str, int] = {}
        for skill in self._skills.values():
            score = 100 if skill.enabled else 0
            if skill.category in topics or skill.id in topics:
                score += 20
            if organization.get("industry") and skill.category == organization.get("industry"):
                score += 5
            scores[skill.id] = score
        ordered = sorted(self._skills.values(), key=lambda item: (-scores[item.id], item.id))
        return [skill.to_dict() for skill in ordered]


skill_registry = SkillRegistry()
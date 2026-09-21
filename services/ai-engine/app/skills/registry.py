from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional


@dataclass(frozen=True)
class SkillDefinition:
    id: str
    name: str
    description: str
    version: str = "1.0.0"
    input_schema: Dict[str, Any] = field(default_factory=dict)
    output_schema: Dict[str, Any] = field(default_factory=dict)
    required_tools: tuple[str, ...] = ()
    required_permissions: tuple[str, ...] = ()
    enabled: bool = False
    implementation_status: str = "contract-only"
    category: str = "general"
    output_type: str = "json"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "category": self.category,
            "inputSchema": self.input_schema,
            "outputSchema": self.output_schema,
            "requiredTools": list(self.required_tools),
            "requiredPermissions": list(self.required_permissions),
            "enabled": self.enabled,
            "implementationStatus": self.implementation_status,
            "outputType": self.output_type,
        }


class SkillRegistry:
    def __init__(self, skills: Optional[Iterable[SkillDefinition]] = None):
        self._skills: Dict[str, SkillDefinition] = {}
        for skill in skills or self._defaults():
            self.register(skill)

    @staticmethod
    def _defaults() -> List[SkillDefinition]:
        text_schema = {"type": "object", "properties": {"text": {"type": "string"}}}
        return [
            SkillDefinition(
                "summarization",
                "Summarization",
                "Summarize supplied text or extracted file content.",
                input_schema=text_schema,
                output_schema={"type": "object", "required": ["summary"]},
                enabled=True,
                implementation_status="implemented",
                category="writing",
            ),
            SkillDefinition(
                "writing",
                "Writing",
                "Draft or rewrite text from supplied context.",
                input_schema={"type": "object", "required": ["instruction"]},
                output_schema={"type": "object", "required": ["content"]},
                enabled=True,
                implementation_status="implemented",
                category="writing",
            ),
            SkillDefinition(
                "file_analysis",
                "File Analysis",
                "Validate, parse, extract, normalize, and analyze supported files.",
                input_schema={"type": "object", "required": ["name", "content"]},
                output_schema={"type": "object", "required": ["structuredResult"]},
                required_permissions=("file.read",),
                enabled=True,
                implementation_status="implemented",
                category="analysis",
            ),
            SkillDefinition(
                "data_analysis",
                "Data Analysis",
                "Analyze an authorized structured table.",
                input_schema={"type": "object", "required": ["data"]},
                output_schema={"type": "object", "required": ["rowCount"]},
                required_permissions=("data.read",),
                enabled=True,
                implementation_status="implemented",
                category="analysis",
            ),
            SkillDefinition(
                "task_organization",
                "Task Organization",
                "Decompose a request into a bounded dependency graph.",
                input_schema={"type": "object", "required": ["prompt"]},
                output_schema={"type": "object", "required": ["tasks"]},
                enabled=True,
                implementation_status="implemented",
                category="orchestration",
            ),
            SkillDefinition(
                "table_generation",
                "Table Generation",
                "Normalize structured rows once for multiple artifact formats.",
                input_schema={"type": "object", "required": ["data"]},
                output_schema={"type": "object", "required": ["columns", "rows"]},
                required_permissions=("artifact.write",),
                enabled=True,
                implementation_status="implemented",
                category="artifacts",
            ),
            SkillDefinition(
                "web_search",
                "Web Search",
                "Search approved web sources and return citations.",
                input_schema={"type": "object", "required": ["query"]},
                output_schema={"type": "object", "required": ["sources"]},
                required_tools=("web_search",),
                required_permissions=("internet_access",),
                enabled=False,
                implementation_status="contract-only",
                category="research",
                output_type="sources",
            ),
            SkillDefinition(
                "pdf_generation",
                "PDF Generation",
                "Render approved structured content as a PDF artifact.",
                input_schema={"type": "object", "required": ["content"]},
                output_schema={"type": "object", "required": ["artifactId"]},
                required_permissions=("artifact.write",),
                enabled=True,
                implementation_status="implemented",
                category="artifacts",
                output_type="artifact",
            ),
            SkillDefinition(
                "spreadsheet_generation",
                "Spreadsheet Generation",
                "Render one structured table as XLSX or CSV artifacts.",
                input_schema={"type": "object", "required": ["data"]},
                output_schema={"type": "object", "required": ["artifactId"]},
                required_permissions=("artifact.write",),
                enabled=True,
                implementation_status="implemented",
                category="artifacts",
                output_type="artifact",
            ),
        ]

    def register(self, skill: SkillDefinition) -> None:
        if not skill.id or not skill.version:
            raise ValueError("Skill id and version are required")
        self._skills[skill.id] = skill

    def get(self, skill_id: str) -> Optional[SkillDefinition]:
        return self._skills.get(skill_id)

    def enable(self, skill_id: str) -> None:
        skill = self._skills.get(skill_id)
        if not skill:
            raise KeyError(f"Unknown skill: {skill_id}")
        self._skills[skill_id] = SkillDefinition(**{**skill.__dict__, "enabled": True})

    def disable(self, skill_id: str) -> None:
        skill = self._skills.get(skill_id)
        if not skill:
            raise KeyError(f"Unknown skill: {skill_id}")
        self._skills[skill_id] = SkillDefinition(**{**skill.__dict__, "enabled": False})

    def authorize(self, skill_id: str, granted_permissions: Iterable[str]) -> SkillDefinition:
        skill = self.get(skill_id)
        if not skill:
            raise PermissionError("Unknown skill")
        if not skill.enabled:
            raise PermissionError("Skill disabled")
        missing = set(skill.required_permissions) - set(granted_permissions)
        if missing:
            raise PermissionError(f"Missing permissions: {', '.join(sorted(missing))}")
        return skill

    def list_skills(self, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        context = context or {}
        topics = set(context.get("frequentTopics") or []) | set(context.get("frequentTasks") or [])
        ordered = sorted(
            self._skills.values(),
            key=lambda skill: (not skill.enabled, skill.id not in topics, skill.id),
        )
        return [skill.to_dict() for skill in ordered]


skill_registry = SkillRegistry()
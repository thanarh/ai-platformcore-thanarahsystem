from __future__ import annotations

import csv
import io
import json
import re
import statistics
from html import unescape
from typing import Any, Dict, Iterable, Optional
from xml.etree import ElementTree

from app.artifacts.generators import PdfArtifactService, SpreadsheetArtifactService, table_from_value
from app.artifacts.store import InMemoryArtifactStore
from app.foundation.contracts import StructuredTable, Task
from app.skills.registry import SkillRegistry

try:
    from PyPDF2 import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None


class SkillExecutionError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class SkillExecutionService:
    SUPPORTED_EXTENSIONS = {"pdf", "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "log"}

    def __init__(
        self,
        registry: SkillRegistry,
        artifact_store: Optional[InMemoryArtifactStore] = None,
        orchestrator: Any = None,
    ):
        self.registry = registry
        self.artifact_store = artifact_store or InMemoryArtifactStore()
        self.pdf_service = PdfArtifactService(self.artifact_store)
        self.spreadsheet_service = SpreadsheetArtifactService(self.artifact_store)
        self.orchestrator = orchestrator

    async def execute(self, task: Task, values: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        skill_id = str(values.get("skillId") or self._skill_for_task(task))
        permissions = context.get("permissions") or []
        if skill_id == "web_search":
            raise SkillExecutionError("CAPABILITY_UNAVAILABLE", "Web Search is disabled in this environment")
        try:
            self.registry.authorize(skill_id, permissions)
        except PermissionError as exc:
            raise SkillExecutionError("PERMISSION_DENIED", str(exc)) from exc
        if task.task_type.value == "extract":
            return self._extract_structured(values)
        if skill_id == "file_analysis":
            return self._file_analysis(values)
        if skill_id == "summarization":
            return self._summarize(values)
        if skill_id == "writing":
            return self._write(values)
        if skill_id == "data_analysis":
            return self._data_analysis(values)
        if skill_id == "task_organization":
            return self._organize(values, context)
        if skill_id == "table_generation":
            return self._table(values)
        if skill_id == "pdf_generation":
            source = self._dependency_value(values)
            return await self.pdf_service.create(
                source.get("table") or source.get("structuredResult") or source,
                context["tenantId"],
                context["userId"],
                context.get("conversationId"),
                task.task_id,
                str(values.get("name") or "report.pdf"),
            )
        if skill_id == "spreadsheet_generation":
            source = self._dependency_value(values)
            return await self.spreadsheet_service.create(
                source.get("table") or source.get("structuredResult") or source,
                context["tenantId"],
                context["userId"],
                context.get("conversationId"),
                task.task_id,
                values.get("formats") or ("xlsx", "csv"),
            )
        raise SkillExecutionError("UNKNOWN_SKILL", f"Unknown skill: {skill_id}")

    def _file_analysis(self, values: Dict[str, Any]) -> Dict[str, Any]:
        file_value = values.get("file") if isinstance(values.get("file"), dict) else values
        name = str(file_value.get("name") or "")
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if extension not in self.SUPPORTED_EXTENSIONS:
            raise SkillExecutionError("UNSUPPORTED_FILE", "Supported files are PDF, TXT, MD, CSV, TSV, JSON, XML, HTML, and LOG")
        content = file_value.get("content", "")
        if isinstance(content, bytes):
            raw = content
        else:
            raw = str(content).encode("utf-8")
        text = self._extract_text(raw, extension)
        result: Dict[str, Any] = {
            "name": name,
            "extension": extension,
            "size": len(raw),
            "text": text[:40000],
            "truncated": len(text) > 40000,
        }
        if extension in {"csv", "tsv"}:
            delimiter = "\t" if extension == "tsv" else ","
            rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
            if rows:
                result["table"] = StructuredTable(
                    columns=[{"name": value or f"column_{index + 1}"} for index, value in enumerate(rows[0])],
                    rows=rows[1:],
                ).to_dict()
        elif extension == "json":
            try:
                result["json"] = json.loads(text)
            except json.JSONDecodeError as exc:
                raise SkillExecutionError("MALFORMED_FILE", "Malformed JSON file") from exc
        elif extension == "xml":
            try:
                root = ElementTree.fromstring(text)
                result["xmlRoot"] = root.tag
            except ElementTree.ParseError as exc:
                raise SkillExecutionError("MALFORMED_FILE", "Malformed XML file") from exc
        result["structuredResult"] = result.get("table") or {"text": result["text"], "metadata": {"format": extension}}
        return result

    def _summarize(self, values: Dict[str, Any]) -> Dict[str, Any]:
        text = str(values.get("text") or self._dependency_value(values).get("text") or "").strip()
        sentences = re.split(r"(?<=[.!؟])\s+|\n+", text)
        summary = " ".join(item.strip() for item in sentences[:3] if item.strip())[:1200]
        return {"summary": summary, "sourceCharacters": len(text), "sentenceCount": len([item for item in sentences if item.strip()])}

    def _extract_structured(self, values: Dict[str, Any]) -> Dict[str, Any]:
        source = self._dependency_value(values)
        structured = source.get("structuredResult") or source.get("table") or {"text": source.get("text", "")}
        result = {"structuredResult": structured}
        if isinstance(structured, dict) and "columns" in structured:
            result["table"] = structured
        return result

    def _write(self, values: Dict[str, Any]) -> Dict[str, Any]:
        instruction = str(values.get("instruction") or "").strip()
        source = str(values.get("text") or self._dependency_value(values).get("text") or "").strip()
        return {"content": source if not instruction else f"{instruction}\n\n{source}".strip(), "instruction": instruction}

    def _data_analysis(self, values: Dict[str, Any]) -> Dict[str, Any]:
        table = table_from_value(values.get("data") or self._dependency_value(values).get("table") or {})
        numeric: Dict[str, list[float]] = {}
        for index, column in enumerate(table.columns):
            numbers = []
            for row in table.rows:
                try:
                    numbers.append(float(row[index]))
                except (ValueError, TypeError, IndexError):
                    pass
            if numbers:
                numeric[str(column.get("name", index))] = numbers
        return {
            "rowCount": len(table.rows),
            "columnCount": len(table.columns),
            "columns": [column.get("name") for column in table.columns],
            "numericSummary": {
                name: {"min": min(values), "max": max(values), "mean": statistics.mean(values)}
                for name, values in numeric.items()
            },
        }

    def _organize(self, values: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        if not self.orchestrator:
            raise SkillExecutionError("ORCHESTRATOR_UNAVAILABLE", "Task orchestrator is not configured")
        group = self.orchestrator.decompose(
            str(values.get("prompt") or ""),
            context["tenantId"],
            context["userId"],
            context.get("conversationId"),
            context.get("requestId"),
            values.get("input"),
        )
        return {"tasks": [task.to_dict() for task in group.tasks], "requestId": group.request_id}

    @staticmethod
    def _table(values: Dict[str, Any]) -> Dict[str, Any]:
        table = table_from_value(values.get("data") or SkillExecutionService._dependency_value(values).get("structuredResult") or {})
        return table.to_dict()

    @staticmethod
    def _skill_for_task(task: Task) -> str:
        mapping = {
            "file_analysis": "file_analysis",
            "extract": "file_analysis",
            "table": "table_generation",
            "pdf": "pdf_generation",
            "spreadsheet": "spreadsheet_generation",
            "artifact": "pdf_generation",
        }
        return mapping.get(task.task_type.value, "writing")

    @staticmethod
    def _dependency_value(values: Dict[str, Any]) -> Dict[str, Any]:
        dependencies = values.get("dependencyResults") or {}
        if not dependencies:
            return {}
        last = list(dependencies.values())[-1]
        return last if isinstance(last, dict) else {}

    @staticmethod
    def _extract_text(raw: bytes, extension: str) -> str:
        if extension == "pdf" and PdfReader:
            try:
                return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages).strip()
            except Exception as exc:
                raise SkillExecutionError("MALFORMED_FILE", "Malformed PDF file") from exc
        text = raw.decode("utf-8", errors="replace").replace("\x00", "").strip()
        if extension in {"html", "htm"}:
            text = re.sub(r"<[^>]+>", " ", unescape(text))
            text = re.sub(r"\s+", " ", text).strip()
        return text
from __future__ import annotations

import csv
import io
import inspect
import zipfile
from typing import Any, Dict, Iterable, List

from app.artifacts.store import InMemoryArtifactStore
from app.foundation.contracts import StructuredTable

try:  # Optional production renderer; tests also exercise the safe fallback.
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
except ImportError:  # pragma: no cover - depends on deployment image
    canvas = None
    letter = (612, 792)

try:
    import openpyxl
except ImportError:  # pragma: no cover - depends on deployment image
    openpyxl = None

try:
    import pandas as pd
except ImportError:  # pragma: no cover - depends on deployment image
    pd = None


def table_from_value(value: Any) -> StructuredTable:
    if isinstance(value, StructuredTable):
        return value
    if not isinstance(value, dict):
        raise ValueError("Structured table data is required")
    columns = value.get("columns") or []
    rows = value.get("rows") or []
    if columns and isinstance(columns[0], str):
        columns = [{"name": column} for column in columns]
    if not columns and rows:
        columns = [{"name": f"column_{index + 1}"} for index in range(len(rows[0]))]
    table = StructuredTable(columns=columns, rows=rows, metadata=value.get("metadata") or {})
    return InMemoryArtifactStore.validate_table(table)


class PdfArtifactService:
    def __init__(self, store: InMemoryArtifactStore):
        self.store = store

    async def create(
        self,
        content: Any,
        tenant_id: str,
        user_id: str,
        conversation_id: str | None,
        task_id: str | None,
        name: str = "report.pdf",
    ):
        lines = self._lines(content)
        if canvas:
            output = io.BytesIO()
            document = canvas.Canvas(output, pagesize=letter)
            width, height = letter
            y = height - 48
            for line in lines:
                document.drawString(42, y, line[:110])
                y -= 16
                if y < 48:
                    document.showPage()
                    y = height - 48
            document.save()
            payload = output.getvalue()
        else:
            payload = self._minimal_pdf(lines)
        artifact = self.store.create(
            tenant_id, user_id, "PDF", name, conversation_id, task_id,
            payload, "application/pdf",
        )
        if inspect.isawaitable(artifact):
            artifact = await artifact
        return {"artifactId": artifact.artifact_id, "artifact": artifact.to_dict()}

    @staticmethod
    def _lines(content: Any) -> List[str]:
        if isinstance(content, str):
            return content.splitlines() or [content]
        if isinstance(content, dict) and "columns" in content:
            table = table_from_value(content)
            header = " | ".join(str(column.get("name", "")) for column in table.columns)
            return [header] + [" | ".join(str(cell) for cell in row) for row in table.rows]
        return [str(content)]

    @staticmethod
    def _minimal_pdf(lines: Iterable[str]) -> bytes:
        safe_lines = [str(line).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
        commands = ["BT", "/F1 11 Tf", "42 750 Td"]
        for index, line in enumerate(safe_lines):
            if index:
                commands.append("0 -16 Td")
            commands.append(f"({line[:110]}) Tj")
        commands.append("ET")
        stream = "\n".join(commands).encode("latin-1", "replace")
        objects = [
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        ]
        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for number, obj in enumerate(objects, 1):
            offsets.append(len(output))
            output.extend(f"{number} 0 obj\n".encode())
            output.extend(obj)
            output.extend(b"\nendobj\n")
        xref = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode())
        output.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
        )
        return bytes(output)


class SpreadsheetArtifactService:
    def __init__(self, store: InMemoryArtifactStore):
        self.store = store

    async def create(
        self,
        table_value: Any,
        tenant_id: str,
        user_id: str,
        conversation_id: str | None,
        task_id: str | None,
        formats: Iterable[str] = ("xlsx", "csv"),
    ) -> Dict[str, Any]:
        table = table_from_value(table_value)
        artifacts = []
        for requested in formats:
            fmt = requested.lower()
            if fmt == "xlsx":
                payload = self._xlsx(table)
                artifact = self.store.create(
                    tenant_id, user_id, "XLSX", "table.xlsx", conversation_id, task_id,
                    payload, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                if inspect.isawaitable(artifact):
                    artifact = await artifact
            elif fmt == "csv":
                payload = self._csv(table)
                artifact = self.store.create(
                    tenant_id, user_id, "CSV", "table.csv", conversation_id, task_id,
                    payload, "text/csv",
                )
                if inspect.isawaitable(artifact):
                    artifact = await artifact
            else:
                raise ValueError(f"Unsupported spreadsheet format: {fmt}")
            artifacts.append(artifact.to_dict())
        return {"artifactId": artifacts[0]["artifactId"], "artifactIds": [item["artifactId"] for item in artifacts], "artifacts": artifacts, "table": table.to_dict()}

    @staticmethod
    def _csv(table: StructuredTable) -> bytes:
        rows = [[column.get("name", "") for column in table.columns], *table.rows]
        if pd is not None:
            frame = pd.DataFrame(table.rows, columns=rows[0])
            return frame.to_csv(index=False).encode("utf-8")
        output = io.StringIO()
        csv.writer(output).writerows(rows)
        return output.getvalue().encode("utf-8")

    @staticmethod
    def _xlsx(table: StructuredTable) -> bytes:
        headers = [column.get("name", "") for column in table.columns]
        if openpyxl is not None:
            output = io.BytesIO()
            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.append(headers)
            for row in table.rows:
                sheet.append(row)
            workbook.save(output)
            return output.getvalue()
        return SpreadsheetArtifactService._minimal_xlsx([headers, *table.rows])

    @staticmethod
    def _minimal_xlsx(rows: List[List[Any]]) -> bytes:
        def cell(value: Any, column: int, row: int) -> str:
            ref = ""
            number = column
            while number:
                number, remainder = divmod(number - 1, 26)
                ref = chr(65 + remainder) + ref
            value_text = str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            return f'<c r="{ref}{row}" t="inlineStr"><is><t>{value_text}</t></is></c>'

        xml_rows = []
        for row_index, values in enumerate(rows, 1):
            xml_rows.append(f'<row r="{row_index}">' + "".join(cell(value, column_index, row_index) for column_index, value in enumerate(values, 1)) + "</row>")
        files = {
            "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
            "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
            "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
            "xl/worksheets/sheet1.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(xml_rows) + "</sheetData></worksheet>",
        }
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for filename, content in files.items():
                archive.writestr(filename, content)
        return output.getvalue()
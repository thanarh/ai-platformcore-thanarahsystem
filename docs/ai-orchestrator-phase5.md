# Thanarah AI Orchestrator — Phase 5

**Status:** Implemented foundation with bounded local execution  
**Date:** 2026-09-21  
**Scope:** Task Orchestrator, Skills, File Analysis, Tables, PDF/XLSX/CSV Artifacts

## Production boundaries

Phase 5 does not enable:

- Web Search: `WEB_SEARCH_ENABLED=false`, and `web_search` returns
  `CAPABILITY_UNAVAILABLE` without fake results.
- real Thanarah Core integration;
- autonomous infinite loops, self-modifying behavior, or unbounded parallelism;
- write/destructive/financial/medical tools;
- Phase 6 voice, WhatsApp, or external paid AI.

The orchestrator is finite and request-scoped. Tenant and user identity comes
from authenticated internal headers for the task API; task and artifact
payloads cannot override it.

## Task architecture

```text
POST /tasks
  -> authenticated principal
  -> TaskOrchestrator
  -> SkillRegistry authorization
  -> bounded Task Graph execution
  -> structured result
  -> ArtifactStore
```

`TaskOrchestrator` supports:

- task creation with `requestId`, `conversationId`, `tenantId`, and `userId`;
- `PENDING`, `READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, and
  `BLOCKED` states;
- missing dependency and cycle rejection;
- linear and branching graphs;
- bounded parallel waves with a configurable concurrency limit;
- per-task timeout;
- failure propagation to dependent tasks;
- cancellation through `POST /tasks/{groupId}/cancel`;
- scoped retrieval through `GET /tasks/{groupId}`.

## Skill Registry

The registry now exposes versioned contracts with:

```text
id
name
description
version
inputSchema
outputSchema
requiredTools
requiredPermissions
enabled
```

Implemented skills:

- `file_analysis`
- `summarization`
- `writing`
- `data_analysis`
- `task_organization`
- `table_generation`
- `pdf_generation`
- `spreadsheet_generation`

`web_search` remains discoverable as a disabled contract and fails with the
structured capability-unavailable code.

## File Analysis

Supported formats:

```text
PDF, TXT, MD, CSV, TSV, JSON, XML, HTML, LOG
```

Pipeline:

```text
validate -> parse -> extract -> normalize -> analyze -> structuredResult
```

Files are not persisted by file analysis. Bytes are stored only when an
artifact generator is explicitly requested.

## Structured tables and artifacts

The shared table contract is:

```json
{
  "columns": [{"name": "name"}],
  "rows": [["A"]]
}
```

The same table is reused for:

- CSV;
- XLSX;
- PDF.

`PdfArtifactService` and `SpreadsheetArtifactService` produce actual files.
They use `reportlab`, `openpyxl`, and `pandas` when available and have a safe
local fallback for the current runtime image. Artifact metadata includes
tenant/user ownership, task and conversation links, MIME type, size, storage
path, and optional expiry.

Endpoints:

```text
GET /tasks/artifacts
GET /tasks/artifacts/{artifactId}
GET /tasks/artifacts/{artifactId}/content
```

Cross-tenant and cross-user reads return not found/denied behavior.

## Example Task Graph

The tested request:

```text
حلل الملف الذي أرسلته، استخرج أهم البيانات، اعملها في جدول، ثم أنشئ Excel وPDF
```

becomes:

```text
File Analysis
      |
Extract Structured Data
      |
Generate Table
     / \
  XLSX PDF
```

The XLSX and PDF branches execute in parallel after the table is ready.

## SSE progress

`POST /tasks/stream` emits actual lifecycle events only:

```text
task_created
task_ready
task_started
task_completed
task_failed
task_blocked
artifact_created
text
done
[DONE]
```

No chain-of-thought is emitted. The existing chat stream keeps its legacy
`data: {"delta": ...}` frames and `[DONE]` terminator.

## Security checks

Covered:

- missing authenticated tenant/user context;
- cross-tenant task access;
- cross-user artifact access;
- permission rejection;
- disabled Web Search;
- unknown/unsupported files;
- malformed JSON and XML;
- task failure propagation;
- task timeout;
- cancellation;
- bounded concurrency.

## Verification

- Phase 5 tests: passed
- Python unit tests: passed
- Phase 2D regression: passed
- AI Engine regression: passed
- Python compile check: passed
- API build and Web build: run after the final server batch
- health and runtime endpoint checks: required after workflow restart

# Thanarah AI Orchestrator — Phase 5.1 Durable Persistence

**Status:** Implemented and runtime verified  
**Date:** 2026-09-21  
**Scope:** Durable task and artifact persistence only

## Stop boundary

This phase does not start Voice, realtime voice, WhatsApp, Thanarah Core
integration, write tools, destructive tools, or autonomous agent loops.

The existing Task Orchestrator and Skill architecture remain unchanged. This
phase removes the production process-local persistence boundary.

## Before and after

Before:

```text
Task metadata     -> process memory
Artifact metadata -> process memory
Artifact bytes    -> local file path referenced only by memory
```

After:

```text
TaskGroup / Task / TaskDependency -> existing MongoDB database
Artifact metadata                 -> existing MongoDB database
Artifact bytes                    -> filesystem storage abstraction
```

MongoDB remains the existing project database. No new database or paid service
was introduced.

## Durable collections

The AI Engine creates indexes for:

- `ai_task_groups`
- `ai_tasks`
- `ai_task_dependencies`
- `ai_artifacts`

Every task and artifact record keeps:

```text
tenantId
userId
conversationId
requestId / taskId
```

Task records preserve all Phase 5 states:

```text
PENDING
READY
RUNNING
COMPLETED
FAILED
CANCELLED
BLOCKED
```

Task checkpoints are idempotent upserts. Parallel task checkpoints are
serialized per repository instance so dependency records cannot be mixed or
duplicated.

On startup, persisted task groups and tasks are loaded into the orchestrator.
Completed tasks are restored as completed and are not automatically executed
again.

## Artifact storage

`MongoArtifactStore` provides:

```text
create
get
list
read_bytes
delete
cleanup_expired
```

Metadata is stored durably in MongoDB. Bytes are written to a unique,
filesystem-backed path before metadata is committed. Controllers use the
store abstraction and never access the filesystem directly.

Artifact metadata includes:

```text
id
tenantId
userId
conversationId
taskId
type
name
mimeType
size
storagePath
createdAt
expiresAt
```

Artifacts default to a seven-day expiry. Startup cleanup removes expired
metadata and files; access also checks expiry before returning content.

## Restart proof

Verified runtime flow:

```text
Create Task
  -> Execute file analysis graph
  -> Generate PDF
  -> Generate XLSX
  -> Generate CSV
  -> Persist Mongo metadata
  -> Restart AI Engine
  -> GET Task
  -> GET Artifact
  -> Download Artifact
```

The same task group and all three artifact records were recovered after
restart. Downloads returned the persisted bytes.

## Integrity proof

- PDF starts with a valid `%PDF-` signature.
- XLSX is a valid ZIP package containing `xl/worksheets/sheet1.xml`.
- CSV is UTF-8 with the expected header and rows.
- Returned byte length matches persisted metadata.

The runtime imports and uses:

```text
reportlab 4.4.0
openpyxl 3.1.5
pandas 2.2.3
```

## Security

Artifact reads query MongoDB using both artifact ID and authenticated
tenant/user context. IDs are not treated as secrets.

Verified:

```text
owner -> own artifact                  PASS
different user -> owner artifact       DENIED
different tenant -> owner artifact     DENIED
forged body identity                   REJECTED
forged artifact ID                     NOT FOUND
```

## Configuration boundary

The following values remain unchanged:

```text
WEB_SEARCH_ENABLED=false
THANARAH_CORE_TOOLS_ENABLED=false
TOOL_MOCK_ENABLED=false
```

The local AI model and runtime limits remain unchanged.

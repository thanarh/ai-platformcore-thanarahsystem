# AI Core Foundation — Phase 2D

Date: 2026-09-20

This phase adds stable contracts for future multi-task and multi-capability
workflows without turning Thanarah Intelligence into an autonomous agent.

## Implemented now

### User Runtime Context

Every AI request can carry:

```json
{
  "userId": "...",
  "tenantId": "...",
  "timezone": "Asia/Riyadh",
  "locale": "ar-SA",
  "language": "ar"
}
```

The AI engine resolves the request-scoped date/time snapshot using `zoneinfo`.
It exposes today, tomorrow, yesterday, current date, and current time in the
prompt context. Invalid timezones fall back to UTC and are marked invalid. No
precise location is inferred or stored.

NestJS derives this context from the authenticated user, tenant settings, and
the explicit context profile language. The existing local model and runtime
configuration are unchanged.

### Task Group and Task contracts

The deterministic `TaskOrchestrator` supports:

- decomposition into a `TaskGroup`
- `PENDING`, `PLANNING`, `RUNNING`, `WAITING`, `COMPLETED`, `FAILED`, and
  `CANCELLED`
- explicit dependencies
- parallel execution waves
- sequential dependency waves
- cycle and missing-dependency rejection
- cancellation, failure, and transition validation

This is planning and lifecycle only. It does not execute a tool and does not
implement an Agent loop.

### Skill Registry

The registry describes skills with:

- `id`, `name`, `description`, `category`
- `inputSchema`, `outputType`
- `requiredPermissions`
- `enabled`, `implementationStatus`

The API endpoint `/api/ai/skills` exposes the registry to the authenticated
chat UI. Skills marked `contract-only` are displayed as unavailable contracts;
they cannot execute. Ordering is deterministic and uses explicit focus topics,
frequent tasks, organization context, and enabled state.

### Tool and permission contracts

Existing tools now declare required permissions. Direct registry execution
rejects missing authorization. The orchestration layer provides the boundary
for a future flow:

```text
model proposal
  -> orchestrator
  -> permission check
  -> authorized tool adapter
  -> validated result
```

No model path is allowed to grant itself permission.

### Artifact and structured table contracts

Artifacts are metadata references, not binary content embedded in conversations.
The contract includes tenant/user/conversation/task ownership and status. A
structured table has columns, rows, and metadata, with row-width validation.
The current store is an in-memory contract adapter for tests; persistent binary
storage and export are intentionally not implemented in this phase.

### Backward-compatible streaming events

The current text frame remains unchanged:

```text
data: {"delta":"..."}
```

The stream can additionally carry named events:

```text
event: status
data: {"state":"generating"}
```

The current route emits actual `status` events for `generating` and
`completed`. The NestJS proxy preserves event names, while the web client
renders an execution timeline. Future `task_started`, `task_completed`,
`artifact_created`, `source_found`, `error`, and `done` events have contracts
but are not claimed as implemented workflows.

## Explicitly not implemented

- Web Search, SearXNG, fetching, extraction, reranking, or citations
- Thanarah Core API integration
- real Agent loop or autonomous execution
- external AI or paid APIs
- production Qdrant activation
- PDF/document/spreadsheet binary generation
- persistent artifact binary storage

## Verification

The foundation test suite covers runtime timezone behavior, invalid timezone
handling, task decomposition, dependency waves, lifecycle failure,
skill discovery and disabled contracts, artifact metadata/isolation/table
validation, and both new and legacy stream frames.
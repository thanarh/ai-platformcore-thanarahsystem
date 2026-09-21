# Thanarah AI Gateway — Phase 4

**Status:** Foundation implemented; real Thanarah Core integration disabled  
**Date:** 2026-09-21  
**Scope:** Phase 4 only

## Stop condition

This phase stops at the AI Gateway, Tool Registry, Tool Contract, permission
contract, tenant context, execution contract, routing foundation, audit
events, and a clearly marked mock adapter.

There is no real Thanarah Core API contract available in this environment.
The `ThanarahCoreAdapter` therefore returns `CORE_CONTRACT_UNAVAILABLE` and
does not call MongoDB, PostgreSQL, or any guessed Core endpoint. The mock
adapter is only available when explicitly enabled outside production.

The following were not added:

- agent loop or autonomous planning;
- multi-task execution;
- write, destructive, financial, or medical mutation tools;
- PDF, spreadsheet, or voice execution;
- production Qdrant activation;
- external AI or paid API integration.

## Architecture

```text
Authenticated Thanarah Intelligence request
                |
                v
         AiGatewayService
                |
                v
          Tool Registry
                |
                v
       Schema Validation
                |
                v
         Permission Layer
                |
                v
       Authenticated Tenant Context
                |
                v
          Tool Execution
          /           \
 ThanarahCoreAdapter   MockThanarahCoreAdapter
   (disabled/unavailable)  (local fixture only)
```

The API module lives under `apps/api/src/modules/ai-gateway`. The controller is
transport-only; `AiGatewayService` owns authenticated capability discovery,
routing, context construction, and execution delegation. It is separate from
the Python AI engine and does not give the model direct database access.
The future Core adapter is the only intended integration boundary.

## Tool contracts

Six read-only contracts are registered:

| Tool | Permission |
|---|---|
| `get_appointments` | `appointments.read` |
| `get_doctors` | `doctors.read` |
| `get_services` | `services.read` |
| `get_working_hours` | `working_hours.read` |
| `get_insurance` | `insurance.read` |
| `get_clinic_information` | `clinic.read` |

Every contract contains:

```text
id
name
description
version
inputSchema
outputSchema
requiredPermissions
tenantScoped
userScoped
enabled
readOnly
```

The schemas reject unexpected fields. In particular, a model or caller cannot
pass `tenantId`, `userId`, `permissions`, or other context overrides inside
tool arguments.

The registry supports:

- `register`
- `discover`
- `enable`
- `disable`
- `validate`

Discovery is available through the authenticated endpoint:

```text
GET /api/ai/v1/tools
GET /api/ai/v1/tools/capabilities
```

## Execution contract

The execution path is:

```text
structured tool proposal
  -> schema validation
  -> permission check
  -> authenticated context validation
  -> adapter selection
   -> output schema validation
  -> audit record
```

The model is not allowed to execute a tool or grant itself permissions.
The synchronous endpoint is:

```text
POST /api/ai/v1/tools/execute
```

The request accepts only:

```json
{
  "toolId": "get_appointments",
  "conversationId": "authenticated-conversation",
  "arguments": {
    "date": "2026-09-21"
  }
}
```

The server derives these fields and does not accept them from the body:

```text
tenantId
organizationId
userId
requestId
permissions
```

Successful responses are structured:

```json
{
  "success": true,
  "data": {},
  "metadata": {
    "source": "mock_thanarah_core",
    "adapter": "MockThanarahCoreAdapter",
    "retrievedAt": "...",
    "requestId": "...",
    "testData": true
  }
}
```

Errors expose a stable code and safe message, never a stack trace:

```json
{
  "success": false,
  "error": {
    "code": "TOOL_FORBIDDEN",
    "message": "The authenticated principal lacks the required tool permission"
  },
  "metadata": {
    "source": "thanarah_core",
    "adapter": "ThanarahCoreAdapter",
    "requestId": "..."
  }
}
```

## Permissions and tenant isolation

Privileged authenticated roles (`OWNER`, `ADMIN`, `AI_ADMIN`) can read the
registered read-only tools. API-key principals require the exact permission
scope or `tools:*`. Other authenticated principals require explicit
permissions; permissions are never taken from the request body.

Each execution carries:

```text
tenantId
organizationId
userId
conversationId
requestId
```

The authenticated principal supplies tenant and user identity. Tool arguments
cannot replace that context. The current foundation intentionally does not
claim to verify a real Core conversation because that Core contract is not
available; real Core authorization remains a required boundary for the future
adapter.

## Routing foundation

`CapabilityRoutingService` provides a deterministic starting point:

```text
local knowledge          -> local
current/external query   -> web
Thanarah operational data -> thanarah_tool
```

It does not execute a route or ask Qwen to call a tool. It only returns a
capability decision for the future orchestrator.

Relative dates such as “tomorrow” and “بكرة” are resolved during execution
using the authenticated user's timezone, not the server timezone. The
normalized date is passed to the adapter and recorded as safe execution
metadata.

## Streaming events

The existing SSE approach is extended by a dedicated endpoint:

```text
POST /api/ai/v1/tools/execute/stream
```

Events are execution status only and never chain-of-thought:

```text
tool_proposed
tool_validating
tool_executing
tool_completed
tool_failed
done
error
[DONE]
```

Arguments and private context are not emitted in execution events.

## Audit

`ToolAuditService` records the following safe fields in a bounded in-process
buffer for this foundation:

```text
requestId
tenantId
userId
conversationId
toolId
timestamp
status
durationMs
errorCode
```

Secrets, tokens, raw arguments, and stack traces are not recorded. Durable
storage is intentionally deferred until the Core contract and audit retention
policy are defined.

## Configuration and production status

The configuration boundary is:

```text
AI_GATEWAY_ENABLED=true
THANARAH_CORE_TOOLS_ENABLED=false
TOOL_MOCK_ENABLED=false
```

`TOOL_MOCK_ENABLED=true` is accepted only outside production and is intended
for local fixture tests. With Core integration disabled and mock execution
disabled, execution returns `CORE_CONTRACT_UNAVAILABLE`; it never invents a
real Core response.

Production status:

```text
safeToEnableRealCoreIntegration=false
realCoreContractAvailable=false
mockDataExposedInProduction=false
externalAiAdded=false
```

## Tests and verification

Executed:

- AI Gateway contract tests: passed
- six-tool registry discovery: passed
- schema validation, required fields, date validation, and unknown fields: passed
- output schema validation and malformed-result rejection: passed
- permission allow/deny paths: passed
- API-key privileged-role bypass rejection: passed
- registry enable/disable: passed
- mock structured result and explicit test-data marker: passed
- missing Core contract failure: passed
- routing local/web/Thanarah decisions: passed
- user-timezone relative date resolution: passed
- relative date normalization inside tool execution: passed
- tool execution event sequence: passed
- API unauthenticated Gateway requests return `401`: passed
- API build: passed
- AI Engine health: passed
- `git diff --check`: passed

The complete machine-readable record is in
`docs/ai-gateway-phase4-benchmark.json`.

## Files

Added:

- `apps/api/src/modules/ai-gateway/`
- `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`
- `docs/ai-gateway-phase4.md`
- `docs/ai-gateway-phase4-benchmark.json`

Updated:

- `apps/api/src/app.module.ts`
- `apps/api/src/config/configuration.ts`
- `.env.example`

Phase 4 stops here. Real Thanarah Core integration requires a separate
explicit phase after the Core API contract, authenticated adapter, durable
audit policy, and integration tests exist.
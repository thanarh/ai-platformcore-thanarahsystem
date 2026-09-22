# Thanarah Core ↔ AI Integration Audit

**Audit status:** Complete — read-only audit  
**Date:** 2026-09-22  
**Scope:** The repository and runtime configuration available in this workspace  
**Production integration:** Not enabled  
**Required flag state:** `THANARAH_CORE_TOOLS_ENABLED=false`

## Executive summary

The workspace contains a NestJS API, a Python FastAPI AI Engine, an AI Gateway,
tool registry, permission checks, tenant-aware execution context, task/skill/
artifact infrastructure, and a placeholder `ThanarahCoreAdapter`.

It does **not** contain a separate Thanarah Core application, a verified Core
base URL, Core controllers/routes, Core DTOs, Core database models, or a
service-to-service authentication contract. The Core adapter therefore fails
closed with `CORE_CONTRACT_UNAVAILABLE`. This is the correct behavior for the
current state.

The six requested AI tools have internal AI-side contracts, but none can be
mapped to a real Core endpoint from the available evidence:

| AI tool | Core endpoint | Status |
|---|---|---|
| `get_appointments` | — | `NOT AVAILABLE` |
| `get_doctors` | — | `NOT AVAILABLE` |
| `get_services` | — | `NOT AVAILABLE` |
| `get_working_hours` | — | `NOT AVAILABLE` |
| `get_insurance` | — | `NOT AVAILABLE` |
| `get_clinic_information` | — | `NOT AVAILABLE` |

No Core mutation is implemented or enabled. The mock adapter exists only for
contract tests and is disabled unless `TOOL_MOCK_ENABLED=true` in a
non-production environment.

## 1. Observed architecture

### AI/API layer

- NestJS API exposes the AI Gateway at `/ai/v1/tools`.
- The gateway exposes discovery, capabilities, routing, execute, and streamed
  execute endpoints.
- `JwtAuthGuard` accepts either a Bearer JWT or a tenant-bound `x-api-key`.
- `AiGatewayService` builds a tenant/user/conversation/request execution
  context.
- `ToolExecutionService` validates the tool, normalizes relative dates,
  checks permissions, selects an adapter, validates the result, and records
  an audit event.

Evidence:

- `apps/api/src/modules/ai-gateway/ai-gateway.controller.ts`
- `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/modules/ai-gateway/tool-execution.service.ts`

### AI Engine

The Python AI Engine is a separate local FastAPI service. Its existing
conversation, memory, RAG, task, artifact, web, and voice paths are not a
Thanarah Core API. No Core-to-AI service contract was found in the inspected
configuration or source tree.

### Thanarah Core adapter state

`ThanarahCoreAdapter` is a placeholder. Its `execute` method does not make a
network request or query a database; it raises:

```text
CORE_CONTRACT_UNAVAILABLE
Thanarah Core API contract is not available in this environment
```

Evidence: `apps/api/src/modules/ai-gateway/adapters.ts`.

## 2. Core API discovery

The repository does not contain a separate Core app or module with routes,
controllers, services, DTOs, or database models for appointments, doctors,
services, insurance, working hours, or clinics.

The only related application-side data found is:

- `Tenant` with general tenant metadata, settings, and a free-form
  `clinicBrain` object.
- `clinicBrain.doctors`, `clinicBrain.services`, `clinicBrain.workingHours`,
  policies, FAQs, and contact information.

These fields are application tenant configuration, not evidence of a
Thanarah Core API or a normalized Core domain contract. They must not be used
as a substitute for Core integration without an explicit product decision and
contract.

Evidence:

- `apps/api/src/modules/tenants/schemas/tenant.schema.ts`
- `apps/api/src/modules/tenants/tenants.service.ts`

### Real endpoint inventory

| Resource | Routes/controllers found | DTO/schema found | Result |
|---|---|---|---|
| Appointments | None | None | `NOT AVAILABLE` |
| Doctors | None | None | `NOT AVAILABLE` |
| Services | None | None | `NOT AVAILABLE` |
| Working hours | None | None | `NOT AVAILABLE` |
| Insurance | None | None | `NOT AVAILABLE` |
| Clinic information | No Core route; only tenant `clinicBrain` fields | No Core DTO | `NOT AVAILABLE` |

## 3. Existing AI-side tool contracts

The AI Gateway currently defines six read-only tool contracts in
`apps/api/src/modules/ai-gateway/tool-contracts.ts`.

Important distinction: these are **AI Gateway contracts**, not authenticated
Thanarah Core contracts. Their schemas and permission names must not be
presented to Core as confirmed facts until Core owners approve the mapping.

Current internal requirements:

- Every tool is marked `tenantScoped: true`, `userScoped: true`, and
  `readOnly: true`.
- `get_appointments` requires `date` and optionally accepts `doctorId` and
  `status`.
- `get_doctors` accepts optional `specialty` and `active`.
- `get_services` accepts optional `category` and `active`.
- `get_working_hours` requires `date`.
- `get_insurance` accepts optional `provider` and `planId`.
- `get_clinic_information` accepts an optional section limited to
  `general`, `contact`, `location`, or `policies`.

The output contracts are intentionally open objects today
(`additionalProperties: true`). They are not sufficient to define a stable
Core response schema.

## 4. Tool mapping

| AI tool | Internal AI contract | Core method/path | Request mapping | Response mapping | Status |
|---|---|---|---|---|---|
| `get_appointments` | Exists, read-only, `date` required | — | — | — | `NOT AVAILABLE` |
| `get_doctors` | Exists, read-only | — | — | — | `NOT AVAILABLE` |
| `get_services` | Exists, read-only | — | — | — | `NOT AVAILABLE` |
| `get_working_hours` | Exists, read-only, `date` required | — | — | — | `NOT AVAILABLE` |
| `get_insurance` | Exists, read-only | — | — | — | `NOT AVAILABLE` |
| `get_clinic_information` | Exists, read-only | — | — | — | `NOT AVAILABLE` |

The mock adapter returns fixture objects for all six tools, but those results
are explicitly marked `testData: true` and `source: mock_thanarah_core`.
They are not Core responses and must not be used to infer a production schema.

## 5. Tenant and identity context

### What exists in the AI application

- `User.tenantId` is a MongoDB reference to `Tenant`.
- JWT payloads include `sub`, `email`, `role`, and `tenantId`.
- The validated JWT principal exposes `_id`, `role`, and `tenantId`.
- API keys are stored with `tenantId`, `createdBy`, scopes, active state, and
  expiry. Valid API keys create a tenant-bound principal.
- The AI Gateway requires tenant, organization, user, conversation, and request
  context before execution.

### Source of truth

| Context value | Current application source | Core source of truth |
|---|---|---|
| `tenantId` | Authenticated `User.tenantId` / API key `tenantId` | `NOT ESTABLISHED` |
| `organizationId` | Derived as `user.organizationId || user.tenantId` in gateway context | `NOT ESTABLISHED` |
| `clinicId` | Not present in the inspected user, tenant, JWT, or API-key contracts | `NOT AVAILABLE` |
| `userId` | Authenticated user `_id`, or API key `createdBy` | `NOT ESTABLISHED` in Core |

There is no verified `AI tenant → Core tenant` mapping. Therefore a production
adapter cannot be enabled safely. The adapter must receive an explicit,
validated mapping or a Core contract that defines the source of truth.

The current AI-side validation prevents caller-supplied tenant/user fields
from being accepted as tool arguments, which is useful isolation behavior.
That does not establish Core-side authorization or prevent cross-tenant data
access once a real adapter exists; those controls still need a Core contract.

## 6. Authentication

### Existing application authentication

- User authentication: Bearer JWT validated by Passport JWT.
- Service-facing API authentication currently available in the API: tenant-bound
  `x-api-key`, with hashed keys, scopes, active state, and expiry.
- AI Engine internal calls use the existing configured JWT secret in selected
  AI routes, but this is not a Thanarah Core service-to-service contract.

### AI → Thanarah Core authentication

**Status: `NOT IMPLEMENTED` / `NOT ESTABLISHED`.**

No Core base URL, service token, Core JWT audience, internal API key,
OAuth client, session exchange, mTLS configuration, or equivalent contract was
found. No secret was created or requested.

The next contract must explicitly define:

- authentication mechanism and credential ownership;
- audience/issuer or key scope, if applicable;
- how the authenticated Core principal is bound to the requested tenant;
- rotation, expiry, revocation, and failure behavior;
- whether the end-user identity is propagated separately from the service
  identity.

## 7. Authorization and permissions

The AI-side tool contracts currently require these permission strings:

```text
appointments.read
doctors.read
services.read
working_hours.read
insurance.read
clinic.read
```

These names exist only in the AI Gateway code. No matching Thanarah Core
permission registry, role matrix, or endpoint authorization rules were found.
Therefore the mapping is:

| AI permission | Thanarah Core permission | Status |
|---|---|---|
| `appointments.read` | — | `NOT ESTABLISHED` |
| `doctors.read` | — | `NOT ESTABLISHED` |
| `services.read` | — | `NOT ESTABLISHED` |
| `working_hours.read` | — | `NOT ESTABLISHED` |
| `insurance.read` | — | `NOT ESTABLISHED` |
| `clinic.read` | — | `NOT ESTABLISHED` |

Current AI Gateway behavior:

- JWT principals with `OWNER`, `ADMIN`, or `AI_ADMIN` bypass the AI-side
  required-permission list.
- API-key principals do not receive that bypass; they need an explicit scope
  or `tools:*`.
- This is an AI-side policy and must not be assumed to match Core policy.

## 8. Date, time, and timezone behavior

Observed application behavior:

- Tenant settings may contain a `timezone`.
- The AI chat service uses tenant settings timezone when constructing AI runtime
  context.
- Gateway tool execution reads `user.timezone`, then
  `user.runtimeContext.timezone`, then defaults to `UTC`.
- The gateway resolves only `tomorrow`, `بكرة`, `غداً`, and `غدا`.
- Invalid timezone handling falls back to `UTC`.
- Internal tool date input is a calendar `date` string; no Core appointment
  datetime format has been established.
- Tenant `clinicBrain.workingHours` is a free-form string, not a normalized
  schedule contract.

Core behavior is unknown:

- appointment date/time storage: `NOT ESTABLISHED`;
- working-hours representation: `NOT ESTABLISHED`;
- clinic timezone source: `NOT ESTABLISHED`;
- database timezone convention: `NOT ESTABLISHED`;
- interpretation of relative dates in Core: `NOT ESTABLISHED`.

Before integration, Core must define whether timezone comes from the tenant,
clinic, location, user, or request, and whether the API accepts a local date,
offset datetime, or UTC instant. The AI layer must not silently choose one.

## 9. Error contract

### Observed AI-side errors

The AI Gateway has internal error codes including:

```text
TOOL_NOT_FOUND
TOOL_DISABLED
TOOL_INVALID_ARGUMENTS
TOOL_INVALID_CONTEXT
TOOL_FORBIDDEN
TOOL_GATEWAY_DISABLED
TOOL_INVALID_RESULT
TOOL_EXECUTION_FAILED
CORE_CONTRACT_UNAVAILABLE
```

The placeholder Core adapter currently exposes only
`CORE_CONTRACT_UNAVAILABLE`. No real Core HTTP errors were observed.

### Core HTTP mapping

| Core status | Core response shape | AI tool error | User-safe message | Status |
|---|---|---|---|---|
| 401 | Unknown | — | — | `NOT ESTABLISHED` |
| 403 | Unknown | — | — | `NOT ESTABLISHED` |
| 404 | Unknown | — | — | `NOT ESTABLISHED` |
| 409 | Unknown | — | — | `NOT ESTABLISHED` |
| 422 | Unknown | — | — | `NOT ESTABLISHED` |
| 429 | Unknown | — | — | `NOT ESTABLISHED` |
| 500 | Unknown | — | — | `NOT ESTABLISHED` |

The future adapter must map Core failures to stable internal codes and
user-safe messages without returning stack traces, internal URLs, database
errors, or secrets.

## 10. Security findings and blockers

### Positive controls already present

- Core tools are disabled by default.
- The real adapter fails closed instead of guessing.
- Mock results are explicitly marked as test data.
- Tool contracts are read-only.
- Tool arguments reject unknown tenant/user fields.
- Tenant and user context are required before execution.
- Conversation/request identifiers are included in audit context.
- API keys are hashed at rest and bound to a tenant.

### Blocking gaps

1. No verified Core API endpoint or base URL.
2. No Core request/response schemas.
3. No Core authentication mechanism.
4. No verified tenant/organization/clinic identity mapping.
5. No Core permission or role mapping.
6. No Core timezone/date-time contract.
7. No Core error envelope or retry/rate-limit contract.
8. Current open output schemas cannot validate a production Core response.
9. No integration test target or non-production Core environment is available.

## 11. Read-only boundary

No `create`, `update`, `delete`, `cancel`, financial, or medical mutation tool
was added or enabled. The audit made no changes to Thanarah Core and did not
create secrets or external connections.

## 12. Required next implementation step

The next step is **not** to implement the adapter. First obtain or add, in
Thanarah Core itself, an approved read-only contract containing:

1. endpoint catalog and versioning;
2. request and response schemas for the six read operations;
3. service-to-service authentication and tenant binding;
4. Core permission/role mapping;
5. date/time/timezone semantics;
6. error envelope, pagination, filtering, timeout, and rate-limit behavior;
7. a safe test environment with representative, non-production data.

After that contract is approved, implement one read-only tool at a time behind
the existing feature flag, with contract tests and tenant-isolation tests.

## 13. Required configuration state

Keep these values unchanged:

```text
THANARAH_CORE_TOOLS_ENABLED=false
WEB_SEARCH_ENABLED=false
LOCAL_AI_MODEL=qwen2.5:1.5b
```

The Phase 6 voice configuration is also unchanged.

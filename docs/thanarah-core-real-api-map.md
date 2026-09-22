# Thanarah Core — Real API Map

**Audit type:** Read-only source discovery  
**Audit date:** 2026-09-22  
**Real Thanarah Core found:** No  
**Verified Thanarah Core endpoints:** 0  
**AI tools mapped to real Core endpoints:** 0 of 6  
**Production integration:** Disabled

## Scope and search result

The available workspace was searched for a separate Thanarah Core project,
routes, controllers, services, DTOs, schemas, database models, auth
middleware, permission checks, tenant resolution, API documentation, and Core
environment configuration.

No separate Core project or Core API source was found. The workspace contains
the Thanarah AI application only:

- NestJS API in `apps/api`
- Python FastAPI AI Engine in `services/ai-engine`
- AI Gateway in `apps/api/src/modules/ai-gateway`

The AI Gateway's `ThanarahCoreAdapter` is a fail-closed placeholder. It makes
no HTTP or database call and returns:

```text
CORE_CONTRACT_UNAVAILABLE
Thanarah Core API contract is not available in this environment
```

Source: `apps/api/src/modules/ai-gateway/adapters.ts:14-29`.

## Real Core endpoint inventory

No real Thanarah Core endpoints were verified. Consequently there is no
verified Core method, path, request body, response body, error envelope,
pagination contract, filter contract, or date/time behavior to document.

The following are AI application endpoints, not Thanarah Core endpoints:

| Method | Path | What it is | Source |
|---|---|---|---|
| GET | `/ai/v1/tools` | AI Gateway tool discovery | `apps/api/src/modules/ai-gateway/ai-gateway.controller.ts:16-26` |
| GET | `/ai/v1/tools/capabilities` | AI Gateway capabilities | `apps/api/src/modules/ai-gateway/ai-gateway.controller.ts:28-31` |
| POST | `/ai/v1/tools/route` | AI-side route decision | `apps/api/src/modules/ai-gateway/ai-gateway.controller.ts:33-37` |
| POST | `/ai/v1/tools/execute` | AI-side tool execution | `apps/api/src/modules/ai-gateway/ai-gateway.controller.ts:39-43` |
| POST | `/ai/v1/tools/execute/stream` | AI-side streamed tool execution | `apps/api/src/modules/ai-gateway/ai-gateway.controller.ts:45-66` |

These endpoints do not prove the existence of a Core API and must not be used
as Core endpoints in an integration contract.

## Authentication discovery

### Verified in the AI application

1. User authentication uses a Bearer JWT:
   - Source: `apps/api/src/modules/auth/strategies/jwt.strategy.ts:8-32`
   - JWT is extracted from the Authorization header.
   - User is reloaded from the local `UsersService`.
   - Inactive or missing users are rejected.

2. API-key authentication is supported by the AI API:
   - Source: `apps/api/src/common/guards/jwt-auth.guard.ts:17-46`
   - Header: `x-api-key`
   - Keys are tenant-bound, hashed at rest, active/expiry checked, and carry
     scopes.
   - Sources:
     - `apps/api/src/modules/api-keys/api-keys.service.ts:43-67`
     - `apps/api/src/modules/api-keys/schemas/api-key.schema.ts:7-42`

3. AI Gateway authorization uses local roles and tool permission strings:
   - Sources:
     - `apps/api/src/modules/ai-gateway/permission.service.ts:7-14`
     - `apps/api/src/common/decorators/roles.decorator.ts:3-10`
     - `apps/api/src/common/guards/roles.guard.ts:9-31`

### AI → Core authentication

**NOT_VERIFIED.**

No Core base URL, service token, Core JWT audience, internal Core API key,
OAuth client, session exchange, mTLS configuration, or other service-to-service
mechanism was found. No secret was created or requested.

The existing AI Engine internal header usage is not evidence of a Core
authentication contract and must not be reused as one without Core
documentation and approval.

## Tenant, organization, clinic, and user identity

### Verified in the AI application

- `User.tenantId` references the local `Tenant` MongoDB document.
  - Source: `apps/api/src/modules/users/schemas/user.schema.ts:21-25`
- JWT payloads include `sub`, `email`, `role`, and `tenantId`.
  - Source: `apps/api/src/modules/auth/auth.service.ts:189-205`
- API keys contain `tenantId` and `createdBy`.
  - Source: `apps/api/src/modules/api-keys/schemas/api-key.schema.ts:7-12`
- The AI Gateway builds:
  - `tenantId` from `user.tenantId`
  - `organizationId` from `user.organizationId || user.tenantId`
  - `userId` from `user._id`
  - Source: `apps/api/src/modules/ai-gateway/ai-gateway.service.ts:58-74`
- No `clinicId` field was found in the inspected user, tenant, JWT, or API-key
  contracts.

### Core mapping

| AI identity | Core identity | Status |
|---|---|---|
| `tenantId` | Not known | `NOT_VERIFIED` |
| `organizationId` | Not known | `NOT_VERIFIED` |
| `clinicId` | Not found in available Core source | `NOT_VERIFIED` |
| `userId` | Not known | `NOT_VERIFIED` |
| Source of truth | Not known | `NOT_VERIFIED` |

No verified `AI tenant → Core tenant` mapping exists. A real adapter cannot
derive this mapping from the local AI application's `clinicBrain` data.

## Authorization and permissions

The AI Gateway currently defines these local permission names:

```text
appointments.read
doctors.read
services.read
working_hours.read
insurance.read
clinic.read
```

Source: `apps/api/src/modules/ai-gateway/tool-contracts.ts:18-123`.

No Core permission registry, role matrix, endpoint guard, or Core authorization
source was found. Therefore every AI-to-Core permission mapping is:

| AI permission | Core permission | Status |
|---|---|---|
| `appointments.read` | Not known | `NOT_VERIFIED` |
| `doctors.read` | Not known | `NOT_VERIFIED` |
| `services.read` | Not known | `NOT_VERIFIED` |
| `working_hours.read` | Not known | `NOT_VERIFIED` |
| `insurance.read` | Not known | `NOT_VERIFIED` |
| `clinic.read` | Not known | `NOT_VERIFIED` |

The local AI behavior is not a Core policy:

- JWT users with `OWNER`, `ADMIN`, or `AI_ADMIN` can bypass local tool
  permission checks.
- API-key users require an explicit scope or `tools:*`.

## Domain discovery

No Core source was found for any of these domains:

| Domain | Status | Evidence |
|---|---|---|
| Appointments | `NOT_VERIFIED` | No Core controller, route, service, DTO, schema, or model found |
| Doctors | `NOT_VERIFIED` | No Core controller, route, service, DTO, schema, or model found |
| Services | `NOT_VERIFIED` | No Core controller, route, service, DTO, schema, or model found |
| Working hours | `NOT_VERIFIED` | No Core controller, route, service, DTO, schema, or model found |
| Insurance | `NOT_VERIFIED` | No Core controller, route, service, DTO, schema, or model found |
| Clinic information | `NOT_VERIFIED` | No Core API; only local tenant `clinicBrain` configuration exists |

The local `Tenant.clinicBrain` object contains free-form fields for doctors,
services, working hours, policies, FAQs, and contact information:

- Source: `apps/api/src/modules/tenants/schemas/tenant.schema.ts:89-99`
- Update path: `apps/api/src/modules/tenants/tenants.service.ts:41-43`

This is local AI application configuration, not a verified Thanarah Core
domain implementation or API contract.

## Date, time, and timezone discovery

### Verified in the AI application

- Tenant settings may contain a timezone:
  `apps/api/src/modules/tenants/schemas/tenant.schema.ts:42-49`.
- AI runtime context uses tenant settings timezone and defaults to `UTC`:
  `apps/api/src/modules/ai/ai.service.ts:482-493`.
- Gateway date resolution reads a user/runtime timezone and otherwise uses
  `UTC`: `apps/api/src/modules/ai-gateway/ai-gateway.service.ts:58-74`.
- Relative date support currently covers `tomorrow`, `بكرة`, `غداً`, and `غدا`:
  `apps/api/src/modules/ai-gateway/routing.service.ts:27-60`.

### Core behavior

The following are `NOT_VERIFIED` because no Core source exists:

- appointment date/time storage;
- working-hours representation;
- clinic timezone source;
- database timezone convention;
- relative-date interpretation;
- UTC versus local-date request semantics.

## Six-tool mapping

| AI tool | Status | Reason |
|---|---|---|
| `get_appointments` | `NOT_AVAILABLE` | No real Core endpoint or schema was found |
| `get_doctors` | `NOT_AVAILABLE` | No real Core endpoint or schema was found |
| `get_services` | `NOT_AVAILABLE` | No real Core endpoint or schema was found |
| `get_working_hours` | `NOT_AVAILABLE` | No real Core endpoint or schema was found |
| `get_insurance` | `NOT_AVAILABLE` | No real Core endpoint or schema was found |
| `get_clinic_information` | `NOT_AVAILABLE` | No real Core endpoint or schema was found |

The six internal AI-side contracts remain read-only, but their open output
schemas are not Core response schemas:

- Source: `apps/api/src/modules/ai-gateway/tool-contracts.ts`
- The mock implementation is test-only:
  `apps/api/src/modules/ai-gateway/adapters.ts:31-103`

## Major blockers

1. The real Thanarah Core source/API is not present in this workspace.
2. No Core endpoint catalog or API documentation is available.
3. No AI-to-Core authentication mechanism is verifiable.
4. No tenant, organization, clinic, or user mapping is verifiable.
5. No Core permission/role mapping is verifiable.
6. No Core date/time/timezone contract is verifiable.
7. No Core request, response, error, pagination, or rate-limit contracts are
   verifiable.
8. No non-production Core environment is available for read-only integration
   tests.

## Exact next implementation step

Obtain the actual Thanarah Core repository or an approved Core API package and
test environment. Then repeat this audit against that source and produce a
verified read-only contract before implementing `ThanarahCoreAdapter`.

Until then, keep:

```text
THANARAH_CORE_TOOLS_ENABLED=false
WEB_SEARCH_ENABLED=false
```

No Phase 8 implementation should start from this audit.

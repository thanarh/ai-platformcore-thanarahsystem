---
name: Phase 2D foundation boundary
description: Durable boundary for the AI Core foundation before real tools and agent execution are enabled.
---

The AI Core foundation must keep planning, authorization, and user-visible
execution events separate from actual tool execution. Contract-only skills may
be discoverable in the UI, but they must be visibly unavailable and cannot be
represented as completed work.

**Why:** The product needs a clean path from model proposal to orchestrator,
permission check, tool adapter, and validated result without allowing a model
to grant itself permissions or exposing chain-of-thought.

**How to apply:** Preserve legacy `data: {"delta": ...}` and `[DONE]` SSE
frames when adding named events. Keep runtime date/time scoped to the supplied
user timezone and tenant/user context. Do not enable Web Search, Thanarah Core
integration, binary artifact generation, autonomous loops, or production
vector-store activation as part of this foundation.
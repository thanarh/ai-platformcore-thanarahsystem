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

Voice Mode follows the same boundary: voice input is a contract around the
existing text pipeline, not a second AI. Until a local STT/TTS engine is
benchmarked and enabled, the UI must expose Voice as foundation-only and must
not pretend to capture or synthesize audio.

**Why:** Audio providers and large speech dependencies can change latency,
privacy, and runtime behavior; the requested phase explicitly defers them.

**How to apply:** Persist transcription and safe audio metadata with the
tenant/user-scoped message, never binary audio in conversation context. Keep
Arabic and English language resolution explicit and make stop/interrupt
idempotent for future STT/TTS execution.
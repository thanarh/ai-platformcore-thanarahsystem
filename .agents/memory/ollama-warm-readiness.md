---
name: Ollama warm readiness
description: Why Ollama process/model presence is insufficient for first-request readiness.
---

Treat Ollama as warm only after a real generation request completes and a
follow-up request confirms low `load_duration`. Do not use `/api/ps` model
presence alone as proof that the first user request will be warm.

**Why:** A controlled benchmark waited until `/api/ps` reported the model
loaded, yet the first generation still reported multi-second model load time
and exceeded the TTFT target.

**How to apply:** When changing startup or readiness behavior, gate readiness on
completed generation and verify the next request's load telemetry. Keep this
separate from liveness.
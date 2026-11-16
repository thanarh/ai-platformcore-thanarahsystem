---
name: Ollama warm readiness
description: Why Ollama process/model presence is insufficient for first-request readiness.
---

Treat the AI engine as ready only after its endpoint is reachable; workflow
restart can return while subservices are still starting. Treat Ollama as warm
only after a real generation completes and a follow-up confirms low
`load_duration`. Do not rely on `/api/ps` model presence alone.

**Why:** A controlled benchmark waited until `/api/ps` reported the model
loaded, yet the first generation still reported multi-second model load time
and exceeded the TTFT target. On 2026-10-01, an AI request immediately after a
workflow restart was refused while the AI engine and local model were still
starting; it succeeded once startup completed. On 2026-11-16, the application
startup warm-up completed, but the first full synthetic request still reported
a 21–28 second model reload; the next two requests reached first content in
about 1.1–1.2 seconds.

**How to apply:** After a workflow restart, wait for the AI endpoint before
testing it. Measure the first real request separately from at least two
follow-ups, and compare `modelLoadMs` and first-content timing. Do not promise a
three-second cold start based on a brief startup warm-up. Keep this separate
from liveness.
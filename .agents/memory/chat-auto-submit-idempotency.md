---
name: Chat prompt auto-submit idempotency
description: Avoid duplicate model calls when chat prompts are auto-sent on route entry.
---

Any effect that auto-submits a prompt from a route or query parameter must wait until authentication and conversation history are ready, and must be idempotent across React Strict Mode effect replays.

**Why:** Duplicate parallel inference during a cold model start can make one request fall through to the generic fallback while another request is still loading and later succeeds.

**How to apply:** For route-triggered sends, guard by conversation and prompt before dispatching. When fallback occurs, inspect request telemetry for the selected backend and `ragChars` before attributing the failure to retrieval.
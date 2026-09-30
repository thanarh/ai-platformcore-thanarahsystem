---
name: Chat prompt auto-submit idempotency
description: Avoid duplicate model calls when chat prompts are auto-sent on route entry.
---

Fresh-chat prompt auto-send may skip message-history loading only when the client created that conversation in the same session and has a one-shot, in-memory marker keyed by its conversation ID. Never use a replayable URL flag as proof that a conversation is fresh.

Consume the marker only after authentication is ready. Keep route-triggered sends idempotent across React Strict Mode replays by guarding on conversation ID and prompt. Legacy/manual prompt URLs must wait for history and send only into an empty conversation. If history returns after optimistic messages have been added, merge the results without replacing those messages.

**Why:** Skipping a redundant history request reduces first-message UI latency, but trusting a URL could suppress history for an existing conversation. Duplicate parallel inference during a cold model start can also make one request fall through to the generic fallback while another request is still loading and later succeeds.

**How to apply:** Preserve the in-memory freshness authority, auth guard, empty-history check for legacy URLs, and conversation-plus-prompt idempotency together. When fallback occurs, inspect request telemetry for the selected backend and `ragChars` before attributing the failure to retrieval.
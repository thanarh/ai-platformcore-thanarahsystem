---
name: OpenAI small-model compatibility
description: Model availability and chat-completions request format verified with this workspace's OpenAI key.
---

The workspace key did not have `gpt-4.1-nano` available, which caused a 404 and a slow local fallback. `gpt-5-nano` was available and streamed successfully through Chat Completions when the request used `max_completion_tokens`, `reasoning_effort="minimal"`, and omitted temperature.

**Why:** An unsupported model can silently turn the nominal fast path into a much slower local fallback.

**How to apply:** Verify the configured model against the account's available model list without displaying credentials, then test a synthetic streamed response before enabling it as primary. Measure first-token latency separately from full completion time.

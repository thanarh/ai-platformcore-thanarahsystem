---
name: AI response cache safety
description: Why exact response reuse is restricted when mutable context sources are active.
---

Cache only requests with both RAG and memory disabled until every mutable context
source exposes a reliable per-tenant version included in the cache fingerprint.

**Why:** Identical user messages can produce different effective prompts after
knowledge or memory changes. Payload equality alone can return a stale answer,
even when tenant and user isolation are otherwise correct.

**How to apply:** When versioned knowledge and memory are added, include those
versions plus every response-affecting configuration field in the key. Keep the
context-free bypass tests when changing cache behavior.
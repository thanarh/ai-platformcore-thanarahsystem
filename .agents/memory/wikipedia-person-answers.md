---
name: Wikipedia person answers
description: Reliable source handling for short direct questions about a named person.
---

For short direct “who is X?” questions, search Wikipedia for the exact person and use MediaWiki’s plain-text introduction extract as both the answer evidence and its citation. Do not fetch the full article HTML or broaden the lookup to general web search when an exact person lookup is available.

**Why:** General search can return relatives who share a surname, and large Wikipedia HTML pages can exceed the safe-fetch limit. When that happens, a model may answer without evidence and introduce factual errors.

**How to apply:** Restrict this shortcut to direct named-person questions and exact-title matches. Keep composite, current-events, and other factual questions on their normal verified-source paths.

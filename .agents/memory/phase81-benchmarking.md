---
name: Phase 8.1 benchmark validity
description: Durable rules for interpreting Thanarah AI Core latency measurements
---

Treat local AI latency and web-pipeline latency as separate distributions. A
SearXNG restart makes a web run invalid for web-latency comparison even when
the AI endpoint returns a fail-closed response. A model reload or startup race
must likewise be reported separately from warm TTFT.

**Why:** In development, SearXNG can restart while the AI workflow remains
healthy, and Ollama can report a model as loaded while the next request still
incurs a reload. Combining those outliers with warm requests produces a
misleading optimization claim.

**How to apply:** Verify SearXNG with a live endpoint request, classify
`lifecycleEvent`, and report the causal application improvement separately
from the observed TTFT/total-latency distribution.
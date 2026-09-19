---
name: Current AI-only scope
description: Project direction after completing AI Performance Phase 0 and Phase 1.
---

Work only on the AI engine unless the user explicitly changes scope. Do not add or modify users, organizations, subscriptions, plans, customer profiles, admin UI, or user-management UI unless a change is strictly necessary for the AI pipeline; explain that necessity before editing.

Do not start Phase 2. In particular, do not add Qdrant, SearXNG, web search, rerankers, agents, tool calling, new models, external paid providers, or paid APIs.

**Why:** The user explicitly separated prior customer-management work from the current task and requested that work stop after AI Performance Phase 0 and Phase 1.

**How to apply:** Treat the completed performance reports and benchmark as the current endpoint. Future work should remain within the existing local Qwen/Ollama AI pipeline unless the user explicitly authorizes a different scope.
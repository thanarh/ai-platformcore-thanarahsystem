---
name: Current AI-only scope
description: Project direction after completing AI Performance Phase 0 and Phase 1.
---

Work only on the AI engine unless the user explicitly changes scope. Do not add or modify users, organizations, subscriptions, plans, customer profiles, admin UI, or user-management UI unless a change is strictly necessary for the AI pipeline; explain that necessity before editing.

Do not start broader Phase 2 work. Do not add Qdrant, rerankers, agent frameworks, new models, external paid providers, or paid APIs unless the user explicitly requests them. The existing local SearXNG search can be repaired or tuned when explicitly requested; keep environment and tenant opt-outs enforced.

**Why:** The user originally set a boundary against Phase 2 scope creep, then explicitly asked to make the existing web-search feature work and improve Arabic chat quality.

**How to apply:** Keep work within the existing local Qwen/Ollama AI pipeline. Repair existing search only on explicit request, and do not infer authorization to add models, paid providers, or unrelated customer/admin features.
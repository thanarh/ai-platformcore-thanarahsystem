---
name: Current AI-only scope
description: Project direction after completing AI Performance Phase 0 and Phase 1.
---

Work only on the AI engine unless the user explicitly changes scope. Do not add or modify users, organizations, subscriptions, plans, customer profiles, admin UI, or user-management UI unless a change is strictly necessary for the AI pipeline; explain that necessity before editing.

Do not start broader Phase 2 work. Do not add Qdrant, rerankers, agent frameworks, new models, external paid providers, or paid APIs unless the user explicitly requests them. The user explicitly approved a small OpenAI answer model alongside local retrieval, sending the current question, the last three chat messages when needed, and relevant library excerpts. Keep the user's profile, stored memories, and custom organization instructions local. The total OpenAI spend target is capped at $0.25/day, and the 3-second goal applies to first visible content rather than a guaranteed completion time. The existing local SearXNG search can be repaired or tuned when explicitly requested; keep environment and tenant opt-outs enforced.

**Why:** The user originally set a boundary against Phase 2 scope creep, then explicitly asked to make the existing web-search feature work, improve Arabic chat quality, and approved a narrowly scoped paid answer path to reduce response delay.

**How to apply:** Keep local retrieval and Qwen/Ollama fallback available. For the approved OpenAI answer path, send only approved chat turns and relevant excerpts, enforce the daily budget, and measure first-content latency; do not infer authorization to send profiles, memories, or custom organization instructions.
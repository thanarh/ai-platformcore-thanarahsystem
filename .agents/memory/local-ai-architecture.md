---
name: Local-first AI architecture
description: Ollama setup, model paths, env vars, and backend registry behavior for Thanarah AI Engine
---

# Local-first AI Architecture

## Runtime Stack
- **Ollama** binary: `/home/runner/.local/bin/ollama` (v0.32.9)
- **Ollama libs** (llama-server + CPU SOs): `/home/runner/.local/lib/ollama/`
- **Models storage**: `/home/runner/workspace/.ollama/models` (256GB workspace, persists)
- **Ollama port**: `11434` (not 8080 — that was the original llama.cpp assumption)

## Env Vars
- `LOCAL_AI_ENABLED=true` — enables local backend in registry
- `LOCAL_AI_BASE_URL=http://localhost:11434` — points FastAPI engine to Ollama
- `LOCAL_AI_MODEL=qwen2.5:1.5b` — active model (upgraded from 0.5b; 0.5b was too small for Arabic)

## Workflow Command
Ollama runs as the 4th service in concurrently:
```
OLLAMA_HOME=/home/runner/workspace/.ollama OLLAMA_MODELS=/home/runner/workspace/.ollama/models /home/runner/.local/bin/ollama serve
```

## Priority Order (registry.py)
- `fallback` — always registered (priority 0)
- `local-llamacpp` — registered when `LOCAL_AI_ENABLED=true` (priority 90)
- `openai` / `anthropic` — registered only when API key secret present (BYOK)

## System Prompt Identity
`intelligence_router.py` → `THANARAH_BASE_SYSTEM` — identifies the AI as "ثنارة" from "ثنارة AI".
Tenant can override with `tenantConfig.systemPrompt` (saved to `tenant.aiConfig.systemPrompt` via `PUT /tenants/:id/ai-config`).

## AI Settings UI
`/settings/ai` page in Next.js allows:
- Communication style selection
- Custom system prompt (or use default)
- Pre-built templates (clinic, customer service, personal)
Connected to `tenantsApi.updateAiConfig()` → `PUT /tenants/:id/ai-config`.

**Why:**
- 0.5b model could not follow system prompts at all (gave gibberish Arabic)
- 1.5b model follows identity instructions correctly
- External providers (OpenAI/Anthropic) must NEVER be required to boot

**How to apply:**
- If adding a new model: `ollama pull <model>` then update `LOCAL_AI_MODEL` env var and restart
- Models stored in workspace → survive Replit restarts
- Ollama binary/libs are in home dir → may need re-extraction if home resets (re-run the tar extraction from `/tmp/ollama.tar.zst` if it still exists, otherwise re-download)

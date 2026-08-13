---
name: Local-first AI architecture
description: Thanarah AI uses local llama.cpp as the PRIMARY backend; external providers are BYOK-only and disabled by default.
---

# Local-First AI Architecture

## The rule
Local llama.cpp (port 8080) is ALWAYS the primary backend (priority 90). External providers (OpenAI, Anthropic, Gemini) are DISABLED by default — only activated when their API key secret is present.

**Why:** Thanarah must own its AI infrastructure and not depend on external providers for core functionality.

## How to apply
- Never set an external provider as the default or required backend
- The system must boot and work without any external API key
- When local AI is not running, FallbackBackend returns a clean bilingual status message
- Adding a new provider = add a backend class + register in registry.py when key is present

## Backend priority order
| Priority | Backend | Condition |
|----------|---------|-----------|
| 90 | local-llamacpp | LOCAL_AI_ENABLED=true (default) |
| 70 | openai | OPENAI_API_KEY secret present |
| 60 | anthropic | ANTHROPIC_API_KEY secret present |
| 1 | fallback | always — returns "Local AI Engine not connected" |

## Key files
- services/ai-engine/app/backends/registry.py — registration logic
- services/ai-engine/app/backends/llamacpp.py — local backend (OpenAI-compatible)
- services/ai-engine/app/backends/anthropic.py — Anthropic BYOK stub (ready)
- services/ai-engine/app/config.py — LOCAL_AI_ENABLED, LOCAL_AI_BASE_URL env vars
- services/ai-engine/app/backends/fallback.py — clean bilingual status message

# AI RAG Phase 2A — Qdrant, Retrieval, Warming, and Context

**Date:** 2026-09-20  
**Scope:** Phase 2A only. Phase 3, Web Search, Agent, Tool Calling, and
Thanarah Core integration were not started.

## Result status

The code-side Phase 2A work is implemented behind safe defaults:

- MongoDB remains the application database and legacy RAG source.
- Qdrant is an optional knowledge/retrieval vector store.
- `RAG_BACKEND=legacy`, `LEGACY_RAG=true`, and `QDRANT_RAG=false` remain the
  defaults.
- Qdrant dual-write and retrieval activate only when Qdrant is explicitly
  enabled and reachable.
- Legacy retrieval remains the automatic fallback when Qdrant is unavailable.
- No user, tenant, chat, subscription, or admin data was moved to Qdrant.

The local environment does **not** have a Qdrant service at
`127.0.0.1:6333`. Therefore Qdrant latency and retrieval-quality numbers are
not claimed below.

## Implemented components

### Qdrant integration

Added a REST adapter in `services/ai-engine/app/rag/qdrant_store.py`.

The collection uses dense cosine vectors and payload indexes for:

- `tenantId`
- `clinicId`
- `documentId`
- `documentVersion`
- `language`
- `category`
- `accessLevel`
- `status`

Each point also stores `chunkId`, `sourceId`, `chunkIndex`, `totalChunks`,
content, and timestamps.

Point IDs are deterministic hashes of tenant, source, document version, and
chunk ID. Re-running indexing therefore upserts the same points instead of
creating duplicates.

### Tenant-safe hybrid retrieval

Qdrant retrieval always adds `tenantId` as a server-side filter. It combines:

1. dense cosine search;
2. BM25-style lexical scoring over the tenant-filtered candidate set;
3. reciprocal-rank fusion;
4. local reranking;
5. context compression to the configured top 3 results.

The optional local reranker uses the open-source Sentence Transformers
CrossEncoder when installed. If that optional model is unavailable, a
deterministic lexical reranker keeps the local pipeline functional without an
external API.

### Legacy safety and indexing

- Existing MongoDB chunks remain intact.
- Ingest writes the legacy Mongo document and, when enabled, the corresponding
  Qdrant points.
- Qdrant write failures do not delete or corrupt MongoDB data.
- `POST /knowledge/reindex` projects existing Mongo chunks into Qdrant
  idempotently for a tenant and optional source.
- `documentVersion` prevents mixing versions in Qdrant points.
- `DELETE /knowledge/{source_id}` deletes Qdrant data only when a tenant ID is
  supplied, preventing an unscoped cross-tenant deletion.

Knowledge ingest now accepts:

- `documentVersion`
- `clinicId`
- `language`
- `category`
- `accessLevel`

### Context compression

The context builder now:

- removes duplicate chunks;
- includes source, document, and version references;
- limits retrieved knowledge to the configured top 3;
- preserves the existing total context budget;
- avoids sending repeated copies of the same information to Qwen.

### Ollama warm-up and diagnostics

The AI service now executes a real minimal generation during application
startup, after checking `/api/tags`. Readiness diagnostics expose:

- `ollamaAvailable`
- `modelAvailable`
- `modelWarm`
- `warmupDuration`
- `lastWarmupAt`

The current health response reports:

```json
{
  "modelWarm": true,
  "ollamaAvailable": true,
  "modelAvailable": true
}
```

The final observed application warm-up duration was approximately **349ms**.
The benchmark still observed an occasional cold load after startup, so
`modelWarm=true` is now observable but must be monitored against the first real
user request before being treated as a hard SLA guarantee.

### Parallel independent lookups

On uncached requests, exact-cache lookup and user-profile lookup now start in
parallel. On a cache hit, the profile task is cancelled before context
construction. This preserves permissions and response-cache behavior while
removing the serial wait from the normal miss path.

## Benchmark method

Both runs used the existing dependency-free 22-case suite:

- all cases used streaming;
- synthetic tenant and user IDs were used;
- no prompts or generated responses were saved;
- actual Ollama token counts were used when available;
- CPU and RSS were sampled from local AI processes;
- percentiles use the nearest observed rank;
- both runs used the local `qwen2.5:1.5b` model on 4 logical CPUs and the
  available development memory, not the target 12 CPU / 24 GB host.

Raw files:

- Before: `docs/ai-performance-phase-1.5-benchmark.json`
- After: `docs/ai-performance-phase-2a-legacy-after.json`

## Legacy RAG before/after

The “before” values are the final Phase 1.5 baseline. The “after” values are
the Phase 2A code running with `RAG_BACKEND=legacy`; Qdrant was not available.

| Metric | Legacy before P50 | Legacy after P50 | Legacy before P95 | Legacy after P95 |
|---|---:|---:|---:|---:|
| Retrieval | 215.32 ms | 218.02 ms | 1,352.20 ms | 232.46 ms |
| Context critical path | 228.18 ms | 219.02 ms | 1,352.55 ms | 233.42 ms |
| TTFT | 708.51 ms | 578.13 ms | 3,919.67 ms | 5,547.56 ms |
| Total latency | 4,052.04 ms | 4,724.90 ms | 9,845.75 ms | 10,928.73 ms |
| Prompt evaluation | 187.59 ms | 188.94 ms | 2,213.06 ms | 1,431.00 ms |
| Actual tokens/sec | 14.19 | 15.56 | 17.67 | 17.22 |
| Aggregate CPU P50 | 273.50% | 243.10% | 294.20% | 283.40% |
| Aggregate RSS max | 1,334.24 MB | 1,334.72 MB | — | — |

### Interpretation

- The measured context tail improved substantially: **1,352.55ms → 233.42ms
  P95**.
- Prompt evaluation P95 improved: **2,213.06ms → 1,431.00ms**.
- Median TTFT improved by about **130ms**.
- The after run had a slower cold outlier and higher generation variance, so
  total P95 did not improve. This is a real measurement, not hidden or
  smoothed out.
- The two runs are not a controlled fixed-output experiment; generation length
  and Ollama scheduling vary. The results support the context/parallelization
  direction but do not prove an end-to-end SLA improvement.

## Parallelization evidence

The exact-cache prime case is a direct signal:

| Stage | Before | After |
|---|---:|---:|
| Cache lookup | 227.35 ms | 218.56 ms |
| Context path | 227.30 ms | 0.09 ms |
| Client TTFT | 789.64 ms | 545.27 ms |
| Client total | 4,136.34 ms | 4,269.54 ms |

The cache lookup and profile lookup now overlap. The context path is almost
complete when the cache miss is known. Total latency was still dominated by
model generation and varied between runs.

## Prompt/context optimization evidence

| Metric | Before | After |
|---|---:|---:|
| Input tokens P50 | 125 | 125 |
| Input tokens P95 | 415 | 283 |
| Input tokens max | 552 | 344 |
| Prompt evaluation P95 | 2,213.06 ms | 1,431.00 ms |

The compressed context path reduced the long input tail in this suite. The
implementation keeps source references and a total character budget instead of
blindly dropping all retrieval context.

## Cold and warm model observations

### Startup warm-up

The service now performs a real one-token generation before logging ready:

- `ollamaAvailable`: true
- `modelAvailable`: true
- `modelWarm`: true
- warm-up duration: **348.98ms** in the final health check

### First benchmark request after the change

The final after benchmark still recorded a cold outlier:

- client TTFT: **19,470.44ms**
- client total: **19,574.22ms**
- model load: **17,773.43ms**

This means the startup check is useful diagnostics but is not sufficient proof
that every subsequent process/reload path will retain the model. The report
does not claim cold-load elimination.

### Warm exact-cache prime

- client TTFT: **545.27ms**
- client total: **4,269.54ms**
- model load: **156.30ms**
- prompt evaluation: **160.93ms**
- Ollama evaluation: **3,722.45ms**

### Exact-cache hit

- client TTFT: **3.45ms**
- client total: **3.54ms**
- Ollama work: **0ms**

## Qdrant benchmark status

Qdrant was not benchmarked because no local Qdrant service was available:

```text
GET http://127.0.0.1:6333/ -> unavailable
health.qdrant.enabled = false
health.qdrant.available = false
```

Therefore the following Qdrant values are intentionally **not reported**:

- retrieval P50/P95;
- TTFT P50/P95;
- total latency P50/P95;
- context size;
- retrieval relevance/accuracy comparison.

The adapter and tests are present, but a valid Qdrant comparison requires a
running Qdrant service and a fixed knowledge corpus. Enabling Qdrant without
that corpus would not produce a meaningful quality comparison.

## CPU experiment status

The target Render/12-CPU environment was not available. No 6/8/10/12-thread
production result is claimed. The existing 4-CPU experiment remains a local
development result only and was not used to change production configuration.

## Verification

- Phase 2A Python tests: **6 passed**
- Regression test script: **passed**
- Python compile checks: **passed**
- Legacy benchmark after changes: **22/22 successful**
- Malformed SSE frames after changes: **0**
- MongoDB health: **connected**
- Ollama health: **available**
- Real warm-up: **modelWarm=true**
- Qdrant tenant/idempotency adapter tests: **passed**
- No paid provider, external AI provider, or secret was added.

## Explicitly not started

- Web Search / SearXNG / Playwright
- Agent
- Tool Calling
- Thanarah Core integration
- OpenAI, Anthropic, Gemini, Groq, OpenRouter, or any paid AI provider
- Users/Admin/Subscriptions changes
- MongoDB replacement or migration
- Phase 3

Phase 2A stops here. A future Qdrant comparison should begin only after a
Qdrant service and fixed tenant-scoped knowledge evaluation set are available.
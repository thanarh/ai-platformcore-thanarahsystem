# Thanarah AI Performance — Phase 1

## Scope

This phase improves and measures the existing local-first architecture without
replacing Next.js, NestJS, FastAPI, MongoDB, Ollama, authentication, multi-tenancy,
RAG, memory, or the existing APIs. No paid or external AI provider was added.

Phase 2 items such as Qdrant, SearXNG, rerankers, and web intelligence were not
started.

## Environment used for the measurements

The benchmark in this report ran in the Replit development environment:

- Model: `qwen2.5:1.5b`
- Runtime: Ollama, CPU only
- AI engine: one FastAPI process
- Local generation concurrency: one
- Database: the configured MongoDB Atlas database
- Benchmark transport: direct FastAPI SSE on `127.0.0.1:8000`

The Render configuration is different:

- Model: `qwen2.5:7b`
- Target server: approximately 12 CPU and 24 GB RAM

Therefore, the Replit numbers are a verified development baseline, not a claim
about the 7B model on Render. The included benchmark must be run on Render before
production capacity or latency is approved.

## Changes made

### Request-level telemetry

Added a privacy-safe telemetry record for each AI request. The schema includes:

- `requestId`
- `routerMs`
- `memoryMs`
- `retrievalMs`
- `embeddingMs`
- `promptBuildMs`
- `ollamaQueueMs`
- `modelLoadMs`
- `timeToFirstTokenMs`
- `generationMs`
- `totalMs`
- `inputTokens`
- `outputTokens`
- `model`
- `route`
- `cacheHit`

Telemetry is written as structured JSON and kept in a bounded in-process buffer
of 512 records. It never stores prompts, responses, tenant IDs, user IDs, patient
data, credentials, or tokens.

### True streaming

The existing streaming path was retained and hardened:

1. Ollama streams incremental chunks from `/api/chat`.
2. FastAPI forwards each chunk immediately through SSE.
3. NestJS forwards each SSE event without collecting the complete answer.
4. Next.js proxies the response body as a stream.
5. The browser appends each delta as it arrives.

The frontend now shows only a spinner before the first token. It no longer emits
synthetic “thinking” text. UTF-8 decoding is flushed correctly and invalid control
characters are removed before rendering.

### Warm model

The startup script now:

- verifies that the configured model exists;
- pulls it only when missing;
- executes a one-token warm-up request;
- uses `keep_alive=-1` for the local development workflow;
- reuses a single `httpx.AsyncClient` connection pool.

Manual cold-start measurement before warm-up was approximately 19.3 seconds to
the first SSE data frame. After the model was loaded, a direct warm request was
measured at approximately 2.04 seconds in the same development environment.

### Prompt and context management

The current router keeps:

- a bounded recent-message window;
- a bounded character budget;
- conversation summary;
- relevant memory;
- relevant tenant-scoped knowledge;
- communication profile.

It does not send the full conversation history. Memory, RAG, and profile loading
run concurrently, each under a 1.5-second deadline. Prompt building is measured
separately.

### Exact response cache

Phase 1 now uses exact-request caching only. Semantic and similar-question reuse
are not part of the active lookup path.

The exact cache key includes:

- tenant ID;
- user ID;
- bounded normalized conversation messages;
- response profile;
- relevant tenant configuration;
- configured model;
- knowledge version when provided;
- conversation summary.

The cache has an in-memory bounded layer and an optional MongoDB persistence
layer. It is intentionally bypassed whenever RAG or memory is enabled, because
those mutable sources do not yet expose reliable per-tenant versions. Health
diagnostics report hits, misses, hit rate, capacity, and mode. Regression tests
verify tenant isolation, verify that a merely similar prompt does not hit the
cache, and verify that mutable RAG/memory requests are never cached.

### Diagnostics

`GET /health` in the AI engine now safely reports:

- overall AI service state;
- uptime;
- Ollama state;
- configured local model;
- model availability;
- MongoDB connectivity;
- exact-cache state and counters;
- buffered telemetry record count;
- backend health.

It does not expose secrets, connection strings, prompts, responses, or credentials.
NestJS continues to expose the public AI health route through the existing API.

## Files added

- `docs/ai-performance-baseline.md`
- `docs/ai-performance-phase-1.md`
- `docs/ai-performance-benchmark.json`
- `docs/ai-performance-benchmark-run2.json`
- `docs/ai-performance-benchmark-final.json`
- `services/ai-engine/app/telemetry.py`
- `services/ai-engine/tests/test_telemetry.py`
- `tests/ai/performance/benchmark.py`
- `tests/ai/performance/README.md`
- `tests/regression/test_ai_engine_regression.py`
- `tests/regression/api_contracts.test.mjs`

## Main files modified

- `services/ai-engine/app/router/intelligence_router.py`
- `services/ai-engine/app/backends/base.py`
- `services/ai-engine/app/backends/ollama.py`
- `services/ai-engine/app/rag/pipeline.py`
- `services/ai-engine/app/response_cache.py`
- `services/ai-engine/app/routers/health.py`
- `services/ai-engine/app/routers/chat.py`
- `services/ai-engine/app/config.py`
- `apps/api/src/modules/ai/ai.service.ts`
- `apps/web/src/lib/utils.ts`
- `apps/web/src/app/(dashboard)/chat/[id]/page.tsx`
- `start-ollama.sh`
- `render.yaml`

## Benchmark suite

The dependency-free suite contains 22 cases covering:

- simple chat;
- Arabic questions;
- English questions;
- long prompts;
- RAG;
- memory;
- no-context prompts;
- multi-turn conversation;
- exact cache prime/hit;
- streaming.

Both recorded runs used streaming for all 22 cases so TTFT is measured from the
first non-empty SSE delta rather than from completion of a non-streaming response.
Prompts and generated content are not written to the report.

### Run 1

- Successful: 22/22 (100%)
- Malformed SSE frames: 0
- TTFT p50: 831.05 ms
- TTFT p95: 3,855.83 ms
- TTFT max: 7,939.49 ms
- Total p50: 6,441.47 ms
- Total p95: 8,902.44 ms
- Exact-cache hits: 1

### Run 2

The second run used a new synthetic tenant and user so persisted results from the
first run could not become cross-run cache hits.

- Successful: 22/22 (100%)
- Malformed SSE frames: 0
- TTFT p50: 788.12 ms
- TTFT p95: 2,614.51 ms
- TTFT max: 3,273.10 ms
- Total p50: 4,474.55 ms
- Total p95: 8,953.08 ms
- Exact-cache hits: 1 (the intended `cached-hit` case)
- Exact-cache TTFT: 3.38 ms
- Exact-cache total: 3.49 ms
- Local-model throughput average: 16.47 approximate tokens/sec
- Local-model throughput p50: 18.36 approximate tokens/sec
- Local-model throughput p95: 26.73 approximate tokens/sec

Token counts in the benchmark are approximated from response character counts.
The internal telemetry uses Ollama's actual `prompt_eval_count` and `eval_count`
when Ollama includes them in the final stream frame.

### Resource sampling during Run 2

One-second samples included Ollama, `llama-server`, Python, and Uvicorn processes:

- Samples: 96
- Average aggregate CPU: 277.18%
- Peak aggregate CPU: 288.30%
- Peak resident memory: 1,389.64 MB

On Linux, 100% CPU represents one fully used logical core. The measured average
therefore corresponds to roughly 2.77 logical cores in this development run.
These figures must not be projected directly to Qwen 2.5 7B.

### Final validation run

After the independent code review, the final code was benchmarked again with a
third synthetic tenant. This run includes the stricter context-free cache policy,
bounded total context, background-thread embedding/ranking, loaded-model health
probe, and startup warm-up gate.

- Successful: 22/22 (100%)
- Malformed SSE frames: 0
- TTFT p50: 655.13 ms
- TTFT p95: 3,925.96 ms
- TTFT max: 4,304.20 ms
- Total p50: 4,636.74 ms
- Total p95: 7,863.64 ms
- Exact-cache hits: 1 (the intended `cached-hit` case)
- Exact-cache TTFT: 2.06 ms
- Exact-cache total: 2.12 ms
- Local-model throughput average: 18.22 approximate tokens/sec
- Local-model throughput p50: 18.84 approximate tokens/sec
- Local-model throughput p95: 27.83 approximate tokens/sec

Final resource sample:

- Samples: 95
- Average aggregate CPU: 287.87%
- Peak aggregate CPU: 321.10%
- Peak resident memory: 1,336.72 MB

## Before and after

| Metric | Before | After |
|---|---:|---:|
| Cold first SSE data frame | ~19,300 ms | model warm-up moved to startup |
| Warm TTFT p50 | not measured consistently | 655.13 ms |
| Warm TTFT p95 | reported user experience around 8,000 ms | 3,925.96 ms |
| Exact-cache TTFT | not isolated | 2.06 ms |
| Request timing breakdown | unavailable | structured per-request telemetry |
| Malformed SSE frames | unknown | 0 across 44 benchmark cases |
| Benchmark success | no fixed suite | 66/66 across three runs |

The “before” user-observed value and the “after” controlled suite are not a strict
same-hardware A/B experiment. The reproducible benchmark files are now the source
of truth for future comparisons.

## Verification

Completed checks:

- Python telemetry tests: 3 passed
- Python regression tests: 8 passed
- Node API contract tests: 4 passed
- Frontend production build: passed
- NestJS production build: passed
- Python compile check: passed
- AI health: healthy
- Ollama model availability: healthy
- MongoDB ping: healthy
- Benchmark: 66/66 successful across three runs

## Remaining issues and limits

1. The Render 7B deployment still needs the same two benchmark runs. A 1.5B model
   result cannot validate a 7B CPU deployment.
2. Local generation concurrency remains one. This protects RAM and avoids CPU
   contention, but concurrent chat requests can queue.
3. A five-second p95 TTFT was achieved in the sequential benchmark, not under a
   1,000-user load test.
4. Telemetry is local to each process and resets on restart. This matches the
   no-paid-service requirement but is not a cross-replica metrics store.
5. The benchmark estimates tokens/sec for privacy. Internal request telemetry
   records actual Ollama token counts when available.
6. MongoDB and RAG scans remain bounded application-level operations. A native
   vector store is intentionally deferred to a later phase.

## Recommended next step

Deploy this Phase 1 code to the existing Render server, keep Qwen 2.5 7B and the
current architecture, run both benchmark rounds there, and compare:

- TTFT p50/p95/max;
- total p50/p95;
- actual Ollama tokens/sec;
- peak RAM;
- aggregate CPU;
- queue wait under 2, 4, and 8 concurrent requests.

Only after those numbers are available should `num_thread`, `num_ctx`,
`num_batch`, or parallel generation be changed. Change one parameter at a time
and keep the best result only when stability and tenant isolation tests still pass.
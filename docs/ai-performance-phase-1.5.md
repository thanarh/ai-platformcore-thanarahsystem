# AI Performance Phase 1.5 — Bottleneck Profiling

**Date:** 2026-09-19  
**Scope:** Phase 1.5 only. No Phase 2 features or architecture changes were made.

## Executive summary

The final end-to-end benchmark completed **22/22 requests successfully**, with
zero malformed SSE frames. Every request carried privacy-safe server telemetry
correlated by `requestId`; no prompt, response, tenant ID, or user ID was written
to the benchmark files.

The main findings are:

1. **Cold model loading is the largest TTFT risk.** The first request after the
   final restart had 10,586.62 ms client TTFT. Ollama spent 8,100.11 ms loading
   the model and 958.25 ms evaluating the prompt.
2. **Warm generation is the largest steady-state total-latency cost.**
   `generationMs` was 3,679.31 ms p50 and 9,191.45 ms p95. Ollama token
   evaluation alone was 2,664.64 ms p50 and 5,717.04 ms p95.
3. **Long prompt evaluation is a material TTFT bottleneck.**
   `ollamaPromptEvalMs` was 187.59 ms p50, 2,213.06 ms p95, and 3,482.38 ms max.
4. **Context retrieval has a cold tail.** `retrievalMs` was 215.32 ms p50 but
   1,352.20 ms p95. The complete parallel context critical path was 228.18 ms
   p50 and 1,352.55 ms p95.
5. **Cache and profile access each add about 227 ms on some uncached requests.**
   The exact-cache lookup and context/profile path are separate serial stages.
6. **The local generation queue was not a bottleneck in this sequential run.**
   Queue wait stayed at or below 0.04 ms. This does not measure concurrent load.
7. **Exact cache is effective:** 2.10 ms client TTFT and 2.17 ms total.

The current Replit environment has **4 logical CPUs and 7.8 GiB RAM** and runs
`qwen2.5:1.5b`. It is not the target 12 CPU / 24 GB server and not a 7B model.
These results must not be presented as measurements for that target.

## Environment and method

### End-to-end suite

- 22 deterministic cases: simple, Arabic, English, long, RAG, memory,
  no-context, multi-turn, exact-cache prime/hit, and explicit streaming.
- All 22 cases used `/chat/stream` so client TTFT is the first non-empty SSE
  delta and final server telemetry arrives in the closing metadata frame.
- Requests ran sequentially with a new synthetic tenant and user.
- Actual Ollama `prompt_eval_count`, `eval_count`, and duration fields were used.
- CPU and resident memory were sampled from local Ollama, llama-server, Python,
  and Uvicorn processes every 500 ms.
- Percentiles use the nearest observed rank. With small experiment groups,
  p95 can equal max.

### Request-scoped Ollama experiments

- `num_thread`: 1, 2, 3, and 4, appropriate to the available 4 CPUs.
- Context groups: 30, 138, and 537 actual input tokens.
- Two measured requests per context size for each thread value, after one
  warm-up request per thread value.
- `num_ctx=4096`, maximum output 96 tokens, same local model.
- Options were sent per request directly to Ollama.
- **No production setting was changed.**

Raw metric artifacts:

- `docs/ai-performance-phase-1.5-benchmark.json`
- `docs/ai-performance-phase-1.5-experiments.json`

## Final end-to-end results

### Client results

| Metric | P50 | P95 | Max |
|---|---:|---:|---:|
| Client TTFT | 708.51 ms | 3,919.67 ms | 10,586.62 ms |
| Client total | 4,052.04 ms | 9,845.75 ms | 10,710.84 ms |
| Actual tokens/sec, non-cache | 14.19 | 17.67 | 18.23 |

- Success: **22/22 (100%)**
- Malformed SSE frames: **0**
- Telemetry records: **22/22**

### Server telemetry

| Metric | P50 | P95 | Max |
|---|---:|---:|---:|
| `routerMs` | 0.03 | 0.09 | 0.10 |
| `cacheLookupMs` | 0.01 | 228.63 | 228.69 |
| `memoryMs` | 227.19 | 229.00 | 240.04 |
| `retrievalMs` | 215.32 | 1,352.20 | 1,494.96 |
| `embeddingMs` | 0.91 | 1.92 | 84.57 |
| `contextMs` | 228.18 | 1,352.55 | 1,495.37 |
| `promptBuildMs` | 0.03 | 0.05 | 0.06 |
| `ollamaQueueMs` | 0.02 | 0.03 | 0.04 |
| `ollamaToFirstTokenMs` | 343.78 | 3,689.83 | 9,067.52 |
| `modelLoadMs` | 154.52 | 220.24 | 8,100.11 |
| `ollamaPromptEvalMs` | 187.59 | 2,213.06 | 3,482.38 |
| `ollamaEvalMs` | 2,664.64 | 5,717.04 | 5,929.10 |
| Server TTFT | 706.29 | 3,918.15 | 10,563.08 |
| `generationMs` | 3,679.31 | 9,191.45 | 9,615.51 |
| `totalMs` | 4,049.84 | 9,843.85 | 10,687.03 |
| Input tokens | 125 | 415 | 552 |
| Output tokens | 45 | 96 | 96 |

`memoryMs` and `retrievalMs` are parallel source timings. They must not be
added together. `contextMs` is the measured critical path around all context
sources and is the correct contribution to TTFT.

`generationMs` starts before the backend stream and ends after the final Ollama
frame, so it includes Ollama-to-first-token time plus streamed generation.
`ollamaEvalMs` is Ollama's narrower token-evaluation duration.

### CPU and RAM

| Resource | P50 | P95 | Max |
|---|---:|---:|---:|
| Aggregate CPU | 273.50% | 294.20% | 295.70% |
| Aggregate RSS | 1,302.91 MB | 1,334.18 MB | 1,334.24 MB |

On Linux, 100% CPU is one fully used logical core. The benchmark therefore used
about 2.74 cores at the median and 2.96 cores at peak sample. This resource
result includes the AI engine processes listed above, not the full monorepo.

## TTFT decomposition

### Distribution for non-cache requests

| Stage | P50 | P95 | Max |
|---|---:|---:|---:|
| Client/server transport overhead | 1.90 ms | 5.74 ms | 23.54 ms |
| Exact-cache lookup | 0.01 ms | 228.63 ms | 228.69 ms |
| Router decision | 0.03 ms | 0.08 ms | 0.10 ms |
| Context critical path | 228.24 ms | 1,352.55 ms | 1,495.37 ms |
| Prompt construction | 0.03 ms | 0.05 ms | 0.06 ms |
| Ollama call to first token | 357.65 ms | 3,689.83 ms | 9,067.52 ms |
| Unattributed server residual | 0.09 ms | 0.19 ms | 0.20 ms |
| Server TTFT | 772.97 ms | 3,918.15 ms | 10,563.08 ms |

Percentiles of separate stages are not additive because each percentile can
come from a different request. The residual confirms the instrumented stages
explain the server path to within 0.20 ms at max.

### Cold first request after restart

The first measured request was the slowest request:

| Stage | Time |
|---|---:|
| Cache lookup | 0.01 ms |
| Router | 0.04 ms |
| Context | 1,495.37 ms |
| Prompt construction | 0.05 ms |
| Ollama to first token | 9,067.52 ms |
| Client/server overhead | 23.54 ms |
| **Client TTFT** | **10,586.62 ms** |

Within the Ollama stage:

- Model load: **8,100.11 ms**
- Prompt evaluation: **958.25 ms**
- Remaining first-token/stream setup: approximately **9.16 ms**

The model health probe reported the model as loaded before the run, but the
first generation still reported an 8.1-second `load_duration`. The current
warm-up/readiness behavior therefore does not guarantee a warm first user
request.

### Warm request

The exact-cache prime request was a normal uncached warm-model request:

- Client TTFT: **789.64 ms**
- Client total: **4,136.34 ms**
- Cache lookup: **227.35 ms**
- Context/profile path: **227.30 ms**
- Ollama to first token: **332.83 ms**
- Model load: **136.22 ms**
- Prompt evaluation: **187.59 ms**
- Ollama token evaluation: **3,346.56 ms**

Even with RAG and memory disabled for this case, the context path spent about
227 ms, consistent with user-profile retrieval. Cache lookup and profile
retrieval are serial, so together they account for about 455 ms before Ollama.

### Exact-cache hit

- Client TTFT: **2.10 ms**
- Client total: **2.17 ms**
- Server TTFT: **0.10 ms**
- Server total: **0.10 ms**
- Ollama work: **0 ms**

## Thread comparison

These results apply only to the available 4-CPU host and 1.5B model.

| `num_thread` | TTFT P50 | TTFT P95 | Total P50 | Total P95 | Tokens/s P50 | CPU P50 | RSS Max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 290.90 ms | 12,891.60 ms | 12,264.89 ms | 25,717.87 ms | 7.91 | 100.70% | 1,203.04 MB |
| 2 | 258.34 ms | 7,245.73 ms | 6,657.00 ms | 14,131.71 ms | 14.19 | 187.10% | 1,201.38 MB |
| 3 | **198.61 ms** | 5,057.63 ms | **4,266.08 ms** | 10,188.67 ms | **19.06** | 263.30% | 1,202.83 MB |
| 4 | 225.87 ms | **4,261.29 ms** | 5,496.38 ms | **9,907.07 ms** | 17.71 | 336.50% | 1,201.81 MB |

Interpretation:

- One thread is clearly insufficient.
- Two threads approximately doubled median throughput over one.
- Three threads produced the best median TTFT, total time, and throughput.
- Four threads improved the observed p95 slightly but used about 73 percentage
  points more CPU at p50 and had worse median total time.
- The groups contain six requests each. They identify a useful local candidate,
  not a production-safe configuration decision.

**Recommendation for this 4-CPU development environment:** keep the production
configuration unchanged, but use 3 threads as the leading candidate in a larger
repeat run if local tuning is later approved.

**12-CPU target:** no valid 12-CPU result was produced because that hardware was
not available. Test request-scoped values **6, 8, and 10** on the actual
12-CPU/24GB host with its real model before changing configuration. Do not
extrapolate the 3-thread local result.

## Context-length comparison

Measured at 4 threads:

| Context | Actual input tokens | TTFT P50 | TTFT P95/Max | Prompt eval P50 | Prompt eval P95/Max | Total P50 | Total P95/Max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Short | 30 | 212.44 ms | 225.87 ms | 47.09 ms | 50.42 ms | 1,793.33 ms | 2,184.80 ms |
| Medium | 138 | 206.88 ms | 1,181.22 ms | 47.27 ms | 1,033.48 ms | 5,496.38 ms | 6,182.80 ms |
| Long | 537 | 266.63 ms | 4,261.29 ms | 89.59 ms | 4,066.74 ms | 7,401.94 ms | 9,907.07 ms |

Each context group has only two measured requests, so p95 equals max. The warm
median prompt evaluation stayed low, but the cold/uncached prompt-evaluation
tail grew sharply with context length. Long context is therefore a TTFT tail
risk even when median TTFT looks acceptable.

No context limit or cache architecture was changed from this experiment.

## Ranked bottlenecks

1. **Cold Ollama model load**
   - Evidence: 8,100.11 ms load and 10,586.62 ms client TTFT on the first request.
   - Impact: violates the five-second first-response goal when cold.
2. **Ollama generation and token evaluation**
   - Evidence: `generationMs` 3,679.31 ms p50 / 9,191.45 ms p95;
     `ollamaEvalMs` 2,664.64 ms p50 / 5,717.04 ms p95.
   - Impact: dominant steady-state total response time.
3. **Long prompt evaluation**
   - Evidence: 2,213.06 ms p95 in the suite; 4,066.74 ms observed for long
     context in the focused experiment.
   - Impact: raises TTFT before any output token is visible.
4. **Cold RAG/context retrieval**
   - Evidence: context 228.18 ms p50 but 1,352.55 ms p95 and 1,495.37 ms max.
   - Impact: adds over a second to cold or long-context requests.
5. **Serial cache lookup plus user-profile retrieval**
   - Evidence: about 227 ms each in the warm prime case.
   - Impact: roughly 455 ms before Ollama even when RAG and memory are disabled.
6. **Queue wait**
   - Evidence: 0.04 ms max.
   - Impact: none in this sequential benchmark; concurrent behavior is unknown.

## Recommendations

No recommendation below was applied in Phase 1.5.

### Priority 1 — make warm-up truthful

Treat readiness as complete only after a real generation request finishes and
verify immediately that a second request has low `load_duration`. Investigate
why `/api/ps` reported the model loaded while the first user request still paid
8.1 seconds of model loading. Preserve the existing model and local-first
architecture.

### Priority 2 — reduce serial pre-model database work

Profile the exact-cache lookup and user-profile retrieval separately against
MongoDB. For context-free requests, evaluate whether profile retrieval is
required. If both values are required, consider parallel execution only after
confirming cache semantics and tenant isolation. Do not weaken cache safety.

### Priority 3 — cap unnecessary prompt growth

Keep the current bounded context policy. Before changing `num_ctx`, inspect
which context sections caused 415–552 input tokens and whether they contributed
to the answer. Long prompts increased prompt-evaluation tail latency by seconds.

### Priority 4 — validate threads on the target server

On the actual 12 CPU / 24 GB server, run 6, 8, and 10 threads request-scoped,
with the real production model, at least 20 repetitions per context length.
Choose a value only after comparing TTFT, total time, tokens/sec, CPU, RAM, and
concurrent queue behavior. This local 4-CPU run does not justify changing the
target setting.

### Priority 5 — separate sequential latency from load capacity

This run proves the sequential path and its bottlenecks. It does not prove
latency under concurrent users or 50,000 messages/day. Keep those as separate
load-testing work; do not infer them from the near-zero queue wait here.

## Verification

- Final end-to-end benchmark: **22/22 successful**
- Final telemetry correlation: **22/22 records**
- Malformed SSE frames: **0**
- Python telemetry tests: **3 passed**
- Python compile checks: **passed**
- Request-scoped Ollama experiment: **24 measured requests completed**
- Production AI configuration changed by experiments: **no**

## Phase boundary

Phase 1.5 stops here. No admin/customer features, Qdrant, SearXNG, web search,
reranker, agent, tool calling, new model, paid provider, cache redesign, or
production context change was added.
# Phase 8.1 — AI Core Performance Optimization

Date: 2026-09-24  
Scope: performance measurement and safe optimization only

## 1. Scope and invariants

The benchmark kept the existing local model and web pipeline:

- Model: `qwen2.5:1.5b`
- Web search: local SearXNG with the existing validation, SSRF protection,
  citations, and fail-closed behavior
- Streaming: the existing SSE delta stream
- Thanarah Core tools: disabled
- Tenant and user identifiers: isolated benchmark tenant/user
- Cache, memory, and RAG: disabled in the isolated latency cases unless the
  case explicitly exercised the relevant path

No model, provider, citation format, security rule, or product feature was
changed.

## 2. Baseline

The initial benchmark ran six request classes, two runs per class, after a
real Ollama generation warm-up. The earlier cold-path observation was kept
separate because it was not representative of a warm request:

- Cold model load: `modelLoadMs=21,961ms`
- Cold TTFT: `24,676ms`
- Warm model loads: approximately `137–201ms`

Baseline observed telemetry, milliseconds:

| Case | TTFT p50 | Total p50 | Input tokens | Prompt eval p50 | Web total |
|---|---:|---:|---:|---:|---:|
| Simple local | 1,155 | 2,696 | 240 | 669 | 0 |
| Long local | 1,989 | 10,288 | 289 | 1,523 | 0 |
| RAG question | 1,046 | 6,966 | 250 | 617 | 0 |
| Web English | 1,935 | 4,067 | 319 | 1,402 | 4–240 |
| Web multi-source | 1,199 | 6,044 | 325 | 802 | 7–14 |
| Arabic web | 1,395 | 4,133 | 330 | 991 | 6–9 |

Across the 12 baseline telemetry records:

| Metric | Min | P50 | P95* | Max | Average |
|---|---:|---:|---:|---:|---:|
| TTFT | 953ms | 1,269ms | 2,706ms | 2,706ms | 1,453ms |
| Total latency | 1,688ms | 5,290ms | 10,611ms | 10,611ms | 5,699ms |

`*` The sample has only two observations per class, so p95 is an observed
sample percentile, not a production capacity estimate.

The baseline first-byte measurement was approximately `1–22ms`. The client
was correctly reading the socket incrementally; `firstMessageMs` was not used
because legacy delta frames do not carry `event: message`.

## 3. Bottleneck analysis

The measurements identify different bottlenecks on different paths:

1. **Cold readiness/model reload** is the largest single outlier. The old
   cold observation spent about 22 seconds loading the model before generation.
2. **Prompt evaluation** dominates warm TTFT once the web/context path is
   complete. A web prompt with 628 input tokens measured roughly
   `3.0–4.5s` of prompt evaluation.
3. **Generation length** dominates total latency for long answers. The local
   model produced 96 tokens in the long/deep cases, with several seconds of
   `ollamaEvalMs`.
4. **Web retrieval** is usually smaller than model evaluation, but live fetches
   can add `0.3–3.6s`. Cached web results reduce this to approximately
   `0.1–2ms`.
5. **Profile lookup** added a repeatable approximately `226–232ms` on users
   without a daily-learning profile. This was the safe application-level
   optimization selected for Phase 8.1.

The local runtime is CPU-bound during generation: the container has 4 vCPUs,
and `llama-server` was observed near 98% CPU with approximately 1.15GB RSS
during generation. Available memory was approximately 1.8GB in that snapshot,
with no swap. Increasing `num_batch` from 64 to 128 did not improve warm
prompt evaluation in a controlled direct Ollama comparison, so it was not
changed.

## 4. Changes made

### 4.1 Cache empty daily-learning profiles

When a user has no daily-learning profile, the service now caches the empty
result for the same bounded profile-cache lifetime used for populated
profiles. Profile writes already clear the cache after daily analysis.

This avoids repeating a database query that is known to have no rows. It does
not alter the profile contents, tenant key, user key, memory behavior, or
answer context.

### 4.2 Improve privacy-safe performance telemetry

Telemetry now records only non-content measurements:

- context component character counts
- prompt character/message counts
- first SSE delta timing
- server-side SSE transmission span

The telemetry still does not store prompts, answers, tenant data, or user
data. SSE timing is recorded before the request telemetry is finalized, so it
is not lost to the idempotent `finish()` call.

## 5. Before/after measurements

The optimization target was context retrieval, not model quality or context
truncation.

| Path | Before | After | Result |
|---|---:|---:|---|
| Simple request, profile lookup | 226–232ms context | 0.1–2.2ms steady state | approximately 225ms removed |
| Cached web request, context stage | approximately 228–235ms | approximately 0.2–2ms | profile round-trip removed |
| Simple prompt tokens | 240 | 240 | unchanged |
| Long prompt tokens | 289 | 289 | unchanged |
| Web prompt tokens | 319–330 | 319–330 | unchanged |
| Web context/citations | unchanged | unchanged | preserved |

The final sample included startup/model variability and live web variability:

| Metric | Baseline sample | Final observed sample |
|---|---:|---:|
| TTFT p50 | 1,269ms | 993ms |
| TTFT p95 | 2,706ms | 5,369ms |
| Total latency p50 | 5,290ms | 6,276ms |
| Total latency p95 | 10,611ms | 10,815ms |

The lower final TTFT p50 is an observed result, not attributed entirely to
the profile-cache change. The higher final p95 includes model reload and live
web outliers. The defensible, causal improvement is the approximately 225ms
context-stage reduction; no claim is made that the model-generation
distribution improved.

## 6. Model readiness

Readiness was checked using real generation, not `/api/ps` alone:

- `generationReady=true` and `modelWarm=true` were returned by health after
  startup.
- Warm `modelLoadMs` remained approximately `142–172ms` in the final valid
  web sample.
- Immediate/warm requests used the loaded model.
- A 30-second readiness check was attempted separately after health reported
  readiness; the benchmark shell session ended before the request could be
  collected, so no unsupported 30-second number is reported.
- The existing cold observation remains the correct evidence that a cold
  load can dominate TTFT.

## 7. Context and token analysis

Instrumented valid web prompts showed:

- Simple local: approximately 290 context characters and 589 prompt
  characters before the user message was tokenized.
- Web with two fetched sources: approximately 1,160 context characters,
  868 web-evidence characters, and 1,718 prompt characters.
- Arabic web valid runs: 628 input tokens, with prompt evaluation around
  `3.0–3.3s` on cached web context.

No blind context truncation, source removal, citation removal, or history
policy change was made.

## 8. Web pipeline analysis

The first web benchmark was partly invalid because SearXNG restarted while
requests were running; those failed requests were excluded from web latency
claims. After SearXNG became reachable, valid results preserved two verified
sources and citations.

Valid final web telemetry:

| Case | Live web total | Cached web total | Web context |
|---|---:|---:|---:|
| English | 3,573ms | 0.1ms | 165 chars in the unavailable/fail-closed sample; valid live paths retained source context |
| Multi-source | 317ms | 0.1ms | source metadata and citations preserved |
| Arabic | 1,850ms | 1.7ms | 868 chars |

The SearXNG container showed intermittent restarts in the development
environment. The AI engine failed closed when it was unavailable; it did not
silently treat an unavailable result as current web evidence.

## 9. Streaming analysis

The first byte arrived in approximately `1–22ms`, while telemetry measured
the actual first generated delta separately. The backend yields model deltas
incrementally, and the response keeps:

- `Cache-Control: no-cache, no-transform`
- `X-Accel-Buffering: no`
- `text/event-stream`

No fabricated token or progress event was added.

## 10. Regression results

Focused regression suites passed:

- telemetry schema/privacy and bounded collector
- web search result validation and capability behavior
- citations and source scope
- SSRF rejection
- fail-closed empty-search and fetch-failure behavior

The full targeted test command was run after the code changes:

```text
python -m unittest tests.test_telemetry tests.test_web_intelligence_phase3 -v
17 tests passed
```

Python compilation also passed for the modified router, Ollama backend,
telemetry, chat stream, and daily-learning modules.

Existing functionality was not removed. Skills, task/artifact routes, voice,
authentication boundaries, tenant isolation, permissions, RAG foundations,
and local web security paths were not changed by this phase.

## 11. Remaining bottlenecks

1. CPU-bound Qwen prompt evaluation and token generation.
2. Cold/reload model startup behavior, including the first request around
   application startup.
3. SearXNG availability/restart stability in the development environment.
4. Small-sample variance from one local model slot and short benchmark runs.
5. No load/concurrency benchmark was performed in this phase; the existing
   queue and concurrency limits remain unchanged.

## 12. Recommended next step

Stop after Phase 8.1. The next useful work is **production load testing** that
measures concurrency, queue depth, cold-start frequency, and sustained
CPU/RAM behavior. Do not begin Phase 9 or change the model before that
measurement.
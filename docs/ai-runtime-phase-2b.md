# AI Runtime Phase 2B — Ollama/Qwen Lifecycle and Streaming

**Date:** 2026-09-20  
**Model:** `qwen2.5:1.5b`  
**Ollama:** `0.32.9`  
**Scope:** Local Ollama/Qwen runtime only. No external service, paid provider,
Qdrant activation, Web Search, Agent, Tool Calling, Thanarah Core, or UI
feature was added.

## Executive result

The observed cold-load mechanism was reproduced:

1. Ollama stayed reachable.
2. The model remained available in `/api/tags`.
3. After the configured keep-alive elapsed, `/api/ps` showed no loaded model.
4. The next generation loaded Qwen again and incurred a large `load_duration`.
5. The following request was warm and fast.

The Ollama process itself was not observed restarting during the experiment.
The exact variance of the earlier **17.77s** cold-load sample is not
deterministically explained by one timing value:

> Root cause not conclusively identified

However, the model-unloaded-after-keep-alive mechanism is confirmed and is the
primary explanation for that cold request. Reload duration varied between
approximately **7.54s**, **21.33s**, and **23.69s** across direct local
experiments.

## 1. Model lifecycle diagnosis

### Before the change

The previous readiness path had two problems:

- startup warm-up stored `modelWarm=true` but the later health response could
  continue exposing that stale startup value;
- `/api/ps` was used for backend availability, but health did not expose the
  full distinction between reachable, available, loaded, warm, and generation
  ready.

During diagnosis:

- `/api/version` responded successfully;
- `/api/tags` contained `qwen2.5:1.5b`;
- `/api/ps` returned an empty model list;
- a direct generation then produced a cold load of **21,331.21ms**;
- after generation, `/api/ps` showed the model loaded again.

The Ollama process had been running continuously in the observed process list.
No process restart was observed in the relevant workflow logs.

### After the change

The runtime now exposes and refreshes:

- `ollamaReachable`
- `ollamaAvailable`
- `modelAvailable`
- `modelLoaded`
- `modelWarm`
- `generationReady`
- `modelLoadMs`
- `promptEvalMs`
- `evalMs`
- `lifecycleEvent`
- `lastWarmupAt`

`/health` now reports `status=degraded` when Ollama is reachable and the model
exists but is no longer loaded. It reports `generationReady=true` only after a
real generation has completed and the model is still loaded.

The final observed health state was:

```json
{
  "status": "ok",
  "ollamaReachable": true,
  "modelAvailable": true,
  "modelLoaded": true,
  "modelWarm": true,
  "generationReady": true,
  "lifecycleEvent": "WARM_MODEL_REQUEST"
}
```

### Lifecycle telemetry

Each actual generation now records one of:

- `COLD_MODEL_LOAD` — model was not loaded before the generation and a
  significant model load occurred;
- `WARM_MODEL_REQUEST` — model was loaded before the request and no significant
  reload occurred;
- `MODEL_RELOAD` — model was observed loaded before the request but a
  significant load occurred;
- `OLLAMA_RESTART` — the runtime observed a reachable transition after an
  Ollama-unreachable state.

The telemetry remains privacy-safe and does not store prompts or generated
content.

## 2. Warm-up verification

The startup warm-up now performs:

1. `/api/tags` model availability check;
2. `/api/ps` pre-observation;
3. a real one-token generation;
4. `/api/ps` post-observation;
5. readiness state update.

Final observed startup values:

| Measurement | Value |
|---|---:|
| Ollama reachable | true |
| Model available | true |
| Model loaded | true |
| Generation ready | true |
| Warm-up duration | 407.19ms |
| Warm-up model load | 191.78ms |
| Warm-up prompt evaluation | 177.70ms |

This verifies readiness more accurately than checking `/api/ps` alone. It does
not guarantee the model will remain loaded after the keep-alive expires.

## 3. Keep-alive

### Configuration

Keep-alive is now configurable through environment variables:

- `OLLAMA_KEEP_ALIVE`
- `LOCAL_AI_KEEP_ALIVE`

The explicit `OLLAMA_KEEP_ALIVE` value takes precedence in the Python backend.
The Ollama start script now uses the configured value instead of forcing
`-1`. The current default remains:

```text
OLLAMA_KEEP_ALIVE=10m
LOCAL_AI_KEEP_ALIVE=10m
```

The API request also sends the same configured keep-alive value, so the client
request and Ollama process configuration no longer silently disagree.

### Measured idle/unload experiment

This was a controlled diagnostic using `keep_alive=30s`; it did not change
production configuration.

| Step | Model loaded | Wall time | Model load |
|---|---:|---:|---:|
| Before first request | yes | — | — |
| First request | yes | 24,144.86ms | 23,685.13ms |
| Immediate state check | yes | — | — |
| After 35s idle | **no** | — | — |
| Request after idle | yes | 7,882.19ms | 7,536.84ms |
| Warm request after reload | yes | 255.30ms | 204.37ms |

The experiment directly confirms that Ollama unloads the model after the
keep-alive window and reloads it on the next request. A separate direct
experiment with `keep_alive=10m` showed the `/api/ps.expires_at` timestamp
approximately ten minutes after the request.

### Recommendation

Keep **10 minutes** as the default for normal usage. It avoids an indefinite
GPU/CPU memory reservation while covering ordinary conversational idle gaps.
Do not change the default to `-1` without an actual traffic idle profile and
memory measurement. If the product SLA requires fast responses after more
than ten minutes of inactivity, raise the value deliberately and measure the
memory tradeoff.

## 4. Thread experiment

The current environment did not support a statistically strong multi-sample
benchmark. A five-iteration run with larger output was stopped because the
runtime produced requests lasting 27–167 seconds; those incomplete results
were discarded.

The following completed diagnostic used one short streaming generation per
setting with `num_predict=1`. It is directional, not a production P50/P95
benchmark. The reported P50/P95 therefore equal the one observed sample.

| Threads | TTFT | Total | Prompt eval | Input tokens |
|---:|---:|---:|---:|---:|
| 4 | 285.16ms | 285.30ms | 95.74ms | 53 |
| 6 | 3,594.23ms | 3,594.64ms | 3,408.66ms | 53 |
| 8 | 4,224.51ms | 4,226.02ms | 4,041.49ms | 53 |
| 10 | 7,484.39ms | 7,484.63ms | 7,249.65ms | 53 |

Aggregate process resources during this diagnostic:

- CPU P50: **302.80%**
- CPU P95: **350.30%**
- CPU max: **388.30%**
- RSS P50: **1,329.01MB**
- RSS P95: **1,337.09MB**
- RSS max: **1,337.62MB**

The one-sample direction is strongly against increasing threads on this
environment. The `tokens/sec` value is intentionally not used for the
recommendation because one output token produces `evalMs=0` and is not a valid
throughput sample.

No 12-CPU or 24GB production claim is made.

## 5. Context experiment

This completed direct Ollama streaming diagnostic used two samples per context
size and one output token. It measures prompt behavior, not answer quality.

| Context | Input tokens | Prompt eval P50 | Prompt eval P95 | TTFT P50 | Total P50 |
|---|---:|---:|---:|---:|---:|
| Short | 57 | 41.69ms | 48.01ms | 206.39ms | 206.77ms |
| Medium | 318 | 65.11ms | 92.00ms | 278.07ms | 278.16ms |
| Long | 1,082 | 82.33ms | 91.42ms | 262.92ms | 262.98ms |

The input-token count increased as expected. Prompt evaluation also increased,
but the two-sample TTFT values were dominated by model-load variance and are
not sufficient to make a quality-versus-latency context policy by themselves.
The existing context compression should remain in place; no arbitrary
production context reduction was made.

## 6. Streaming verification

The streaming probe traversed the running AI Engine endpoint and parsed the
SSE stream until the final token and done frame:

| Measurement | Result |
|---|---:|
| First byte | 6,785.11ms |
| First token | 6,786.55ms |
| Last token | 11,525.52ms |
| Total | 11,624.31ms |
| First-byte → first-token gap | 1.44ms |
| Malformed frames | 0 |
| Done frame | observed |

The **1.44ms** gap shows no meaningful buffering between the first byte and
first token in the tested NestJS/Python/proxy path. The high absolute first
token time came from local generation/runtime behavior, not an SSE buffering
delay.

## 7. Final production recommendation

Use the following baseline until a larger controlled benchmark is available:

```text
LOCAL_AI_NUM_THREAD=4
LOCAL_AI_KEEP_ALIVE=10m
OLLAMA_KEEP_ALIVE=10m
LOCAL_AI_MAX_CONCURRENCY=1
```

Also keep:

- real startup generation warm-up;
- readiness based on `generationReady`, not HTTP reachability alone;
- `/api/ps` model-loaded observation in health checks;
- lifecycle telemetry on every actual generation;
- context compression and the current configured context budget.

Do not use 6/8/10 threads on this environment based on the completed
diagnostic. Do not use `keep_alive=-1` by default because the controlled
experiment proved that keep-alive directly controls unload behavior and
indefinite retention has a resource cost.

## 8. Verification and limitations

- Python tests after Phase 2B changes: **7 passed**
- Regression script: **passed**
- Python compile checks: **passed**
- Final health: **ok**
- Final `generationReady`: **true**
- SSE streaming probe: **successful**
- Malformed SSE frames: **0**
- Production configuration changed: **false**
- Qdrant/Web Search/Agent/Tool Calling/paid providers: **not activated**

The full multi-iteration threads benchmark was not completed because this
environment produced abnormally long local generation times. Its partial
results were not used. The thread table is explicitly a minimal diagnostic,
not a statistically reliable capacity benchmark.

Raw measurements:

- `docs/ai-runtime-phase-2b-benchmark.json`
- `docs/ai-runtime-phase-2b-lifecycle.json`
- `docs/ai-runtime-phase-2b-threads-minimal.json`
- `docs/ai-runtime-phase-2b-context.json`
- `docs/ai-runtime-phase-2b-streaming.json`

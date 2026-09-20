# AI Model & Inference Benchmark — Phase 2C

**Date:** 2026-09-20  
**Scope:** Local Ollama inference only.  
**Production model:** `qwen2.5:1.5b`  
**Production configuration changed:** No.

## Executive conclusion

`qwen2.5:0.5b` was faster on this 4-CPU development environment:

- TTFT P50: **275.56ms** vs **357.38ms** for `qwen2.5:1.5b`;
- total latency P50: **946.75ms** vs **1,185.97ms**;
- generation throughput P50: **25.95 tok/s** vs **18.79 tok/s**.

The speed advantage is real in this controlled run. It is not enough to replace
the production model automatically because the quality set is small, capped at
16 output tokens, and has no ground-truth evaluator. Both models produced
non-empty Arabic, English, technical, and conversational answers, but the
benchmark does not prove semantic quality or refusal behavior.

**Recommendation:** keep `qwen2.5:1.5b` as production. Keep `qwen2.5:0.5b`
as a benchmark-only candidate until a human-reviewed quality set confirms that
its Arabic and technical quality is acceptable for the product.

## 1. Exact model inventory

Only two local models were used:

| Model | Exact tag | Ollama size | Parameters | Quantization | Context in model metadata |
|---|---|---:|---:|---|---:|
| Qwen | `qwen2.5:1.5b` | 986,061,892 bytes | 1.5B | `Q4_K_M` | 32,768 |
| Qwen | `qwen2.5:0.5b` | 397,821,319 bytes | 494.03M | `Q4_K_M` | 32,768 |

Both models are GGUF Q4_K_M variants from the Qwen2 family. No alternate
quantization variant was already installed, and no large set of models was
downloaded. The 0.5B model was downloaded only as the single small
benchmark-only comparison candidate.

## 2. Runtime configuration

Both models used identical direct Ollama options:

```text
num_ctx=2048
num_thread=4
num_batch=64
keep_alive=10m
temperature=0
num_predict=16
stream=true
```

The host had **4 logical CPUs** and approximately **7.8 GiB** system memory.
The benchmark bypassed the AI Engine router, RAG, memory, response cache,
Web Search, and all external providers. It measured the Ollama inference path
directly.

The production model and production thread settings were not changed.

## 3. Dataset and method

The same 20 synthetic prompts were sent to both models:

- 5 Arabic;
- 5 English;
- 5 technical;
- 5 conversational.

Each model received the same system instruction and the same prompt text. Each
prompt used a fresh streaming request. The benchmark recorded:

- model load duration from Ollama metadata;
- TTFT from the first streamed content delta;
- total streamed request time;
- prompt evaluation time;
- output evaluation time;
- input and output token counts;
- tokens/sec from Ollama's evaluation duration;
- process CPU and RSS samples.

The overall model comparison has 20 samples per model. Context testing used one
sample for each of short, medium, and long context, so those context P50/P95
values are descriptive single observations rather than stable percentiles.

## 4. Model comparison

| Model | Quantization | TTFT P50 | TTFT P95 | Tokens/sec P50 | Tokens/sec avg | Total P50 | Total P95 | RSS P95* | CPU P95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `qwen2.5:1.5b` | Q4_K_M | 357.38ms | 461.25ms | 18.79 | 18.89 | 1,185.97ms | 1,353.76ms | 1,304.04MB | 188.30% |
| `qwen2.5:0.5b` | Q4_K_M | 275.56ms | 422.72ms | 25.95 | 26.82 | 946.75ms | 1,183.61ms | 1,794.75MB | 329.10% |

\* RSS and CPU are observed process aggregates, not isolated model footprints.
The benchmark used `keep_alive=10m`; after switching models, Ollama temporarily
reported both model runners in `/api/ps`. Therefore these resource values must
not be interpreted as proof that the smaller model requires more memory. A
clean memory comparison requires an explicit unload between model runs.

### Relative speed result

Compared with `qwen2.5:1.5b`, the 0.5B model measured:

- **22.9% lower TTFT P50**;
- **20.2% lower total latency P50**;
- **38.1% higher tokens/sec P50**;
- **42.0% higher average tokens/sec**.

Model load P50 was effectively similar:

- 1.5B: **157.09ms**;
- 0.5B: **154.19ms**.

The main difference is inference compute, not the initial model load.

## 5. Context test

The same context shapes were tested on both models. Each result below is one
direct streaming sample, so the P50 and P95 values are the observed value.

| Model | Context | Input tokens | Prompt eval | TTFT | Total | Tokens/sec |
|---|---|---:|---:|---:|---:|---:|
| 1.5B | Short | 55 | 273.21ms | 439.72ms | 1,277.57ms | 19.10 |
| 1.5B | Medium | 316 | 2,136.62ms | 2,295.64ms | 3,040.89ms | 21.47 |
| 1.5B | Long | 1,220 | 9,953.78ms | 10,128.80ms | 10,963.09ms | 19.18 |
| 0.5B | Short | 55 | 159.53ms | 313.52ms | 841.05ms | 30.36 |
| 0.5B | Medium | 316 | 1,363.42ms | 1,539.74ms | 2,116.28ms | 27.58 |
| 0.5B | Long | 1,220 | 4,949.52ms | 5,122.13ms | 5,657.93ms | 29.90 |

Long context is a significant inference bottleneck on both models. The 0.5B
model is approximately twice as fast on prompt evaluation for the long sample,
but this does not by itself establish that its answer quality is sufficient.
No production context limit was changed.

## 6. Quality checklist

The benchmark intentionally does not assign arbitrary semantic scores.
Automated evidence recorded:

- 5/5 Arabic prompts produced non-empty responses for each model;
- 5/5 English prompts produced non-empty responses for each model;
- 5/5 technical prompts produced non-empty responses for each model;
- 5/5 conversational prompts produced non-empty responses for each model;
- all Arabic prompt responses contained Arabic characters for both models.

Qualitative observations from the captured samples:

- Both models followed simple list and rewrite instructions.
- Both models produced usable English technical explanations within the token
  cap.
- The 0.5B model was faster and sometimes more concise.
- The 1.5B model has more capacity headroom, but this dataset did not establish
  a statistically defensible quality advantage.
- Several outputs ended at the 16-token cap, so completeness cannot be judged
  from this run.

Not measured by this dataset:

- factual accuracy against a ground-truth answer set;
- robust Arabic coherence review;
- refusal behavior, because no unsafe/refusal prompts were included;
- long-form formatting quality;
- production conversation quality.

The raw output previews and automated evidence are in the JSON artifact.
Human review is required before selecting the 0.5B model for production.

## 7. Production recommendation

Keep:

```text
LOCAL_AI_MODEL=qwen2.5:1.5b
LOCAL_AI_NUM_THREAD=4
LOCAL_AI_NUM_CTX=2048
LOCAL_AI_NUM_BATCH=64
LOCAL_AI_KEEP_ALIVE=10m
OLLAMA_KEEP_ALIVE=10m
```

Do not switch production to 0.5B automatically. It is a promising
latency-first candidate, but its quality tradeoff was not proven by this
small, output-capped test. If a later human-reviewed Arabic/technical set
confirms acceptable quality, 0.5B can be evaluated as a separate production
experiment.

No external AI API, paid provider, Web Search, SearXNG, Agent, Tool Calling,
Qdrant activation, or Thanarah Core integration was used.

## 8. Verification

- Model inventory completed through Ollama API and local manifests.
- 20 prompts executed for each model.
- Direct streaming completed for both models.
- Production model restored and warmed after benchmark.
- Production configuration changed: **false**.

Raw measurements:

- `docs/ai-model-benchmark-phase-2c.json`
- `tests/ai/performance/model_benchmark_phase2c.py`

# Local AI performance benchmark

This directory contains a dependency-free benchmark for the local FastAPI AI
Engine. It uses only Python's standard library and does not require API keys,
MongoDB credentials, or any paid provider.

## Run

Start the local AI Engine first (normally on port `8000`), then run:

```bash
python tests/ai/performance/benchmark.py \
  --base-url http://127.0.0.1:8000 \
  --output /tmp/thanarah-ai-benchmark.json
```

Use `--all-stream` to send every case through `/chat/stream`:

```bash
python tests/ai/performance/benchmark.py --all-stream
```

Options:

- `--base-url`: FastAPI base URL; defaults to `http://127.0.0.1:8000`.
- `--timeout`: timeout per case in seconds; defaults to `45`.
- `--tenant-id` / `--user-id`: synthetic identities used by the benchmark.
- `--output`: optional path for the complete JSON report.

The command prints a short summary and writes JSON when `--output` is
provided. Exit code is `0` only when every case returns a non-empty response.

## Coverage

The suite contains 22 deterministic cases covering:

- simple chat
- Arabic and English questions
- long prompts
- RAG-enabled requests
- memory-enabled requests
- requests with both context sources disabled
- multi-turn messages
- an exact cache prime/hit pair
- streaming responses

RAG and memory cases exercise those router paths without seeding knowledge or
memory data. Their result measures path latency; a retrieval hit requires
application data to already exist in the local environment.

## Metrics and privacy

Each result includes:

- `ttft_ms`: time from request start to the first generated chunk
- `total_ms`: request duration
- `telemetry`: privacy-safe server timing and actual Ollama token counts
- `output_tokens`: actual Ollama count when available, otherwise an approximation
- `tokens_per_second`: actual output tokens divided by measured generation time
- `success`, HTTP status, backend, and malformed SSE frame count

The report never stores prompts, generated text, server error bodies, secrets,
or database content. It stores only identifiers for the synthetic test cases
and timing/status metrics. `cached-prime` and `cached-hit` intentionally share
the same synthetic tenant/user and exact payload so the second case can
measure an exact cache hit.

## Phase 1.5 focused experiments

Run request-scoped Ollama thread and context experiments without changing the
application configuration:

```bash
python tests/ai/performance/phase15_experiments.py \
  --threads 1,2,3,4 \
  --repeats 2 \
  --output /tmp/thanarah-ai-phase15-experiments.json
```

The experiment report stores metrics only. It does not store prompts or model
responses.
# Phase 2D — AI streaming display verification

Date: 2026-09-20

## Scope

Phase 2D verifies the existing SSE path from the AI Engine to the browser:

1. The chat UI creates an assistant placeholder immediately.
2. The placeholder shows the operational state `Analyzing...`.
3. The first received `delta` changes the state to `Generating response...`.
4. Each `delta` is appended and rendered immediately; the backend does not
   collect the full response before forwarding it.
5. Metadata is processed before `[DONE]`.
6. The assistant message is persisted once, after normal generation completes.
7. Abort stops the upstream generation and leaves the partial response as a
   local stopped message only; a cancelled partial assistant response is not
   persisted.
8. Stream errors are surfaced as an assistant error message and do not expose
   malformed transport bytes to the user.

The status labels are operational UI only. They do not claim to expose hidden
model reasoning or chain-of-thought.

## Measured SSE results

The reproducible probe is:

```bash
PYTHONPATH=services/ai-engine \
  python tests/ai/performance/stream_phase2d.py \
  --output docs/ai-streaming-phase-2d.json
```

The probe reads with `read1()` so the client does not wait for a full 4 KB
buffer before reporting a received byte. It counts JSON `delta` frames and
verifies the final `[DONE]` frame.

| Case | First byte | First token | Byte → token | Token → last token | Total | Delta chunks | Malformed | DONE |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `ما هي عاصمة السعودية؟` | 1,259.75 ms | 1,259.83 ms | 0.08 ms | 577.35 ms | 1,898.39 ms | 9 | 0 | yes |
| Longer API/Token explanation | 785.83 ms | 785.89 ms | 0.06 ms | 5,982.71 ms | 6,769.59 ms | 96 | 0 | yes |

Abort probe result:

- First byte observed: yes
- Abort requested immediately after first byte: yes
- Abort request timing: 481.68 ms
- `[DONE]` expected after abort: no
- Ollama log confirmation: the active task was cancelled and released after
  the client connection closed

These numbers are direct AI Engine SSE measurements. The authenticated browser
path uses the same SSE framing through the Next proxy and Nest stream
orchestration; the web and API TypeScript builds also passed in this run.

## Persistence and lifecycle invariants

- Normal completion has one assistant persistence call in the Nest `end`
  handler, followed by server-owned metadata and `[DONE]`.
- Client close destroys the upstream stream and records cancellation telemetry,
  but does not persist the partial assistant text.
- The browser handles `[DONE]` once, cancels the reader, and finalizes the
  current assistant placeholder exactly once.
- UTF-8 decoding remains incremental, and incomplete SSE frames remain in the
  client buffer until the blank-line event boundary arrives.

## Verification

Passed:

- NestJS build
- Web TypeScript check
- Python AI-engine unit/regression tests
- Python syntax check for the SSE router and Phase 2D probe
- `git diff --check`
- AI Engine health: `status=ok`, MongoDB connected, `qwen2.5:1.5b` available and
  warm

Production model settings were not changed:

- Model: `qwen2.5:1.5b`
- Threads: `4`
- Context: `2048`
- Batch: `64`

No Web Search, Agent, Tool Calling, external provider, Qdrant production
activation, or Phase 3 work was added.
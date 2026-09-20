# Thanarah AI Core — Phase 3 Web Intelligence

**Status:** Implemented behind a disabled production flag  
**Date:** 2026-09-21  
**Scope:** Phase 3 only

## Executive summary

Phase 3 adds a local web-intelligence pipeline without adding a paid search
provider or an external AI provider:

```text
User question
  -> deterministic web decision
  -> SearXNG JSON search
  -> SSRF-safe HTTP fetch
  -> HTML/text extraction
  -> local reranking
  -> bounded evidence context
  -> local Qwen
  -> real source citations
```

The feature is implemented but **not enabled** because SearXNG is not present
in the current Replit environment. The default remains:

```text
WEB_SEARCH_ENABLED=false
SEARXNG_URL=http://127.0.0.1:8080
```

No production model or local runtime setting was changed. The live model
reported by the running service is `qwen2.5:1.5b`.

## What was implemented

### Decision layer

The decision is deterministic and telemetry-visible. It does not ask the model
to estimate its own confidence. Signals include:

- explicit search/research requests;
- current or time-sensitive wording;
- external lookup wording;
- tenant-configured `webSearchRequired`.

Questions without a web signal remain on the local/RAG path. If the environment
flag or tenant policy is disabled, the decision records the signal and the
disabled reason but does not make a network request.

### SearXNG

`SearXNGClient` uses the JSON `/search` endpoint and normalizes:

```text
title, url, snippet, source, rank, publishedAt
```

The endpoint is exposed for diagnostics at `GET /web/capabilities`. This
endpoint performs a small live probe and reports whether SearXNG is reachable
and returning JSON.

### Safe fetcher

`SafeHTTPFetcher` enforces:

- HTTP/HTTPS only;
- public DNS resolution;
- localhost, private, loopback, link-local, reserved, multicast,
  unspecified, metadata, and internal hostname blocking;
- redirect re-validation;
- redirect count limit;
- timeout and bounded retry;
- response size limit;
- HTML/XHTML/plain-text content-type validation.

Retrieved HTML is treated as untrusted data. It is never treated as a system
instruction.

### Extraction and local reranking

The extractor removes scripts, styles, navigation, forms, headers, footers,
SVG, and templates, then preserves title, headings, paragraphs, domain,
retrieval time, and published time.

Reranking reuses the existing local reranker. When the optional local
CrossEncoder is unavailable, the deterministic lexical reranker is used. No
paid or external reranker was added.

### Context, citations, and streaming

Only bounded passages are sent to Qwen. The system prompt explicitly marks web
content as untrusted and instructs the model to cite `[source-N]` identifiers.
The server then appends a citation block using only URLs returned by the
retrieval pipeline, so the model cannot invent source URLs.

The stream supports:

```text
status
search_started
source_found
fetch_started
fetch_completed
generating
text (legacy data: delta frames are preserved)
done
error
```

NestJS preserves source metadata while proxying the SSE stream, and the web
client renders the sources below the assistant response.

### Caching and isolation

Search results, fetched pages, and extracted pages have bounded in-process TTL
caches. Their keys contain only public retrieval inputs or content hashes; no
tenant, user, conversation, memory, or RAG context is cached with public web
results.

Returned source records retain:

```text
tenantId
userId
conversationId
```

Response caching is bypassed when web signals are active while web search is
enabled, so mutable web evidence cannot be reused as a context-free response.

## Dependency status

### SearXNG

The live probe on the running AI Engine returned:

```json
{
  "enabled": false,
  "provider": "SearXNG",
  "endpoint": "http://127.0.0.1:8080",
  "probe": {
    "reachable": false,
    "httpStatus": null,
    "json": false,
    "resultCount": 0,
    "error": "All connection attempts failed"
  },
  "productionSafe": true
}
```

Ports `8080` and `8888` were also checked before implementation. No SearXNG
service was available. The implementation therefore does not claim that live
Web Search is working.

## Benchmark

The complete raw benchmark record is in
`docs/ai-web-intelligence-phase3-benchmark.json`.

### Live dependency measurements

| Measurement | Result |
|---|---:|
| SearXNG reachable | `false` |
| SearXNG HTTP status | `not available` |
| SearXNG JSON response | `false` |
| Live search latency | `not measured` |
| Live fetch latency | `not measured` |
| Live extraction latency | `not measured` |
| Live reranking latency | `not measured` |
| Live total web latency | `not measured` |

### Deterministic fixture measurement

This is a local fixture measurement only, not a production or internet claim:

| Component | Observed |
|---|---:|
| Search fixture | 0.036 ms |
| Fetch/extraction fixture | 0.182 ms |
| Lexical reranking fixture | 2.183 ms |
| Total fixture pipeline | 2.665 ms |
| Sources | 1 |
| Citation URL integrity | passed |

## Tests and verification

Executed:

- Python compile: passed
- Python regression/unit suite: **16/16 passed**
- SSRF tests: localhost, loopback, private/metadata IP, internal hostname,
  malicious redirect: passed
- Fetch tests: timeout/error path, invalid content type, oversized response:
  passed
- Search tests: valid response and malformed response: passed
- Extraction tests: noisy and malformed-safe HTML path: passed
- Citation and scope preservation: passed
- API TypeScript check: passed
- Web TypeScript check: passed
- `git diff --check`: passed
- AI Engine health: HTTP 200, MongoDB connected, local model available
- Web capabilities endpoint: HTTP 200, SearXNG unavailable and correctly
  reported

## Production configuration

No production web-search activation was performed. To enable this phase later,
the environment must provide a verified SearXNG instance and then pass the
live search/fetch/latency/security benchmark. Until then:

```text
WEB_SEARCH_ENABLED=false
```

The following remain unchanged:

```text
LOCAL_AI_MODEL=qwen2.5:1.5b
LOCAL_AI_NUM_THREAD=4
LOCAL_AI_NUM_CTX=2048
LOCAL_AI_NUM_BATCH=64
LOCAL_AI_KEEP_ALIVE=10m
OLLAMA_KEEP_ALIVE=10m
```

## Files added or updated

### Added

- `services/ai-engine/app/web_intelligence/decision.py`
- `services/ai-engine/app/web_intelligence/search.py`
- `services/ai-engine/app/web_intelligence/fetcher.py`
- `services/ai-engine/app/web_intelligence/extractor.py`
- `services/ai-engine/app/web_intelligence/pipeline.py`
- `services/ai-engine/app/routers/web.py`
- `services/ai-engine/tests/test_web_intelligence_phase3.py`
- `docs/ai-web-intelligence-phase3.md`
- `docs/ai-web-intelligence-phase3-benchmark.json`

### Updated

- AI Engine settings, chat request model, response cache, intelligence router,
  chat SSE router, health response, and application router registration
- NestJS SSE metadata preservation
- Web SSE event parsing and citation rendering

## Stop condition

Phase 3 is complete as an integration foundation and remains safely disabled
until SearXNG is supplied and the live benchmark is run. No Thanarah Core
integration, tool calling, agent loop, autonomous execution, PDF/spreadsheet
generation, voice engine, paid API, or production Qdrant activation was added.
# Thanarah AI — Phase 0: Architecture and Performance Baseline

> Baseline date: 2026-09-19  
> Scope: documentation only. This document describes the current implementation; it does not introduce a Phase 1 change.

## 1. Executive summary

Thanarah is a multi-service application with this request path:

```text
Next.js browser
  → Next.js /api proxy
  → NestJS API (JWT, tenant, usage, persistence)
  → Python FastAPI AI Engine
  → response cache lookup
  → route decision
  → memory + RAG + daily profile retrieval (concurrent)
  → prompt/context construction
  → Ollama /api/chat
  → Qwen local model
  → FastAPI SSE
  → NestJS SSE relay and persistence
  → browser SSE parser and incremental message rendering
```

The implementation is already a true streaming design: the local Ollama adapter consumes
newline-delimited streaming JSON, FastAPI yields SSE `data:` frames as tokens arrive,
NestJS relays those frames as they arrive, and the browser applies each `delta` to the
assistant placeholder. The non-streaming endpoint exists separately.

The largest latency and capacity constraint is local inference: `OllamaBackend` uses a
single semaphore slot by default (`LOCAL_AI_MAX_CONCURRENCY=1`). Requests beyond that
slot wait in an in-process queue. The deployed Render configuration also sets one
Ollama parallel request. This is appropriate for bounded CPU/RAM protection, but it
cannot provide a five-second p95 guarantee under concurrent load.

The code contains optional external-provider adapters, but the current deployment is
configured local-only: `EXTERNAL_AI_ENABLED=false`, `FREE_PROVIDERS_ENABLED=false`,
`ALLOW_EXTERNAL_PROVIDERS=false`, and `FREE_PROVIDER_ONLY=true`.

## 2. Current architecture

### 2.1 Services and responsibilities

| Layer | Current component | Responsibility | Evidence |
|---|---|---|---|
| Frontend | Next.js 15.x (`apps/web`) | Authentication UI, conversations, message rendering, SSE consumption, API proxy | `apps/web/package.json`; `apps/web/src/app/(dashboard)/chat/[id]/page.tsx`; `apps/web/src/lib/utils.ts` |
| API | NestJS 10.x (`apps/api`) | JWT-protected API, tenant/usage checks, conversation ownership, MongoDB persistence, AI-engine relay | `apps/api/src/app.module.ts`; `apps/api/src/modules/ai/ai.controller.ts`; `apps/api/src/modules/ai/ai.service.ts` |
| AI engine | FastAPI/Uvicorn (`services/ai-engine`) | Routing, fallback, prompt construction, RAG/memory coordination, cache, provider adapters | `services/ai-engine/main.py`; `services/ai-engine/app/router/intelligence_router.py` |
| Database | MongoDB/MongoDB Atlas through Motor/Mongoose | Users, tenants, conversations, messages, knowledge, memory, cache, daily learning | `apps/api/src/app.module.ts`; `services/ai-engine/app/database.py`; `services/ai-engine/requirements.txt` |
| Local inference | Ollama HTTP server | Model serving and token streaming | `start-ollama.sh`; `services/ai-engine/app/backends/ollama.py` |
| Model | Qwen family through Ollama | Local generation; model name is environment-dependent | `services/ai-engine/app/config.py`; `.replit`; `render.yaml` |

The root package only orchestrates the services with `concurrently`; the application
dependencies are owned by `apps/web/package.json` and `apps/api/package.json`.
`start-dev.sh` installs the two Node lockfiles and Python requirements, then starts
Next.js, NestJS, FastAPI, and Ollama in parallel.

### 2.2 Runtime and deployment topology

Development/repl startup is defined by `start-dev.sh`:

1. `scripts/prepare-secrets.sh` derives/loads runtime secrets.
2. `npm ci` at the root, then `npm ci --prefix apps/web` and `npm ci --prefix apps/api`.
3. Python packages are installed into `.pythonlibs/lib/python3.12/site-packages`.
4. Next.js listens on port 5000.
5. NestJS listens on port 3001.
6. FastAPI listens on port 8000.
7. Ollama listens on `127.0.0.1:11434`.

Render is configured as one Node web service (`render.yaml:1-7`) with plan
`12c-24g` (`render.yaml:5`), `WEB_CONCURRENCY=1` (`render.yaml:21-22`), and
the Node/Python/AI processes started together by `render-start.sh`. A persistent
model disk is commented out (`render.yaml:10-15`), so model persistence across
redeploys is not enabled by this configuration.

## 3. End-to-end request flow

### 3.1 Frontend to Next.js proxy

The chat page creates a user message and an empty assistant placeholder, then calls
`streamChat` (`apps/web/src/app/(dashboard)/chat/[id]/page.tsx:61-100`).

`streamChat`:

- POSTs to `/api/ai/chat/stream` with `{ conversationId, content }`.
- Sends the JWT as a Bearer header.
- Reads `ReadableStream.getReader()`.
- Decodes UTF-8 incrementally with `TextDecoder`.
- Splits SSE events on blank lines.
- Parses `data:` JSON frames.
- Applies each `parsed.delta` immediately.
- Handles `meta`, `[DONE]`, aborts, and error frames.
- Removes replacement/control characters from displayed stream text.

The assistant placeholder now displays only a CSS spinner while it has no content
(`page.tsx:257-264`). Once the first delta arrives, the markdown content appears and
continues updating (`page.tsx:265-274`).

The Next.js fallback proxy (`apps/web/src/app/api/[...path]/route.ts:10-43`) forwards
the request body and headers to `NEXT_API_URL` and returns `response.body` directly.
It does not buffer or convert the stream to JSON. `next.config.js` also provides the
primary rewrite path; the route handler is the fallback.

### 3.2 NestJS authentication, tenancy, quota, and persistence

`AiController` is protected by `JwtAuthGuard` (`apps/api/src/modules/ai/ai.controller.ts:20-22`).
For streaming:

1. The current user supplies `tenantId` and `userId`.
2. Non-platform-admin requests consume chat usage before generation
   (`ai.controller.ts:62-65`).
3. `AiService.streamChat` creates a request UUID and records `startTime`
   (`apps/api/src/modules/ai/ai.service.ts:201-202`).
4. Conversation ownership and tenant configuration are loaded concurrently
   (`ai.service.ts:204-213`).
5. The user message is saved while recent history is loaded concurrently
   (`ai.service.ts:215-225`).
6. The first-message title operation is deliberately fire-and-forget
   (`ai.service.ts:227-230`).
7. The request includes up to eight recent messages plus the current user message
   (`ai.service.ts:232-251`).
8. NestJS sets SSE/no-buffering headers and flushes headers immediately
   (`ai.service.ts:254-261`).
9. NestJS POSTs to FastAPI `/chat/stream` with `responseType: 'stream'`
   (`ai.service.ts:302-310`).
10. Upstream `data:` frames are parsed and relayed as public SSE frames
    (`ai.service.ts:331-357`).
11. At stream end, the complete assistant response is persisted, message count and
    usage are updated, metadata is sent, and `[DONE]` closes the response
    (`ai.service.ts:360-390`).
12. If the browser closes the connection, the upstream stream is destroyed and
    partial content is persisted as cancelled (`ai.service.ts:312-329`).

The non-streaming path is separate (`ai.controller.ts:28-54`; `ai.service.ts:26-191`).
It saves the assistant result only after the full FastAPI response is available.

MongoDB is configured through Mongoose with `dbName: thanarah_ai`, TLS, lazy
connection, buffered commands, `serverSelectionTimeoutMS=5000`, and
`connectTimeoutMS=10000` (`apps/api/src/app.module.ts:32-46`). The same
`MONGODB_URI` is used by the Python engine.

### 3.3 FastAPI AI Engine

FastAPI creates the database connection, initializes the backend registry, creates
the `IntelligenceRouter`, and starts the daily-learning worker in its lifespan
(`services/ai-engine/main.py:27-56`).

Routes:

- `/health` — backend health (`app/routers/health.py:7-18`)
- `/chat` — complete response (`app/routers/chat.py:45-54`)
- `/chat/stream` — SSE response (`app/routers/chat.py:57-102`)
- `/knowledge` — knowledge operations
- `/backends` — backend management
- `/chat/learn` — authenticated internal correction memory

The FastAPI CORS policy currently allows all origins, credentials, methods, and
headers (`services/ai-engine/main.py:65-72`). The health response reports service
and backend state, but does not currently include MongoDB state, cache state, uptime,
queue depth, or request timing breakdown (`app/routers/health.py`).

### 3.4 Intelligence Router

`IntelligenceRouter._decide_route` (`app/router/intelligence_router.py:63-109`):

- Filters enabled non-fallback backends.
- Honors `tenantConfig.preferredBackend` if available.
- Otherwise selects the highest priority backend.
- Appends remaining enabled backends and `fallback` as fallback order.
- Uses the tenant's `ragEnabled` flag in the route decision.

The current registry priorities are local 90, optional managed external 100, optional
free Groq 80, optional OpenRouter 75, optional OpenAI 70, optional Anthropic 60,
and fallback 1 (`app/backends/registry.py:36-145`).

Response profiles are `fast`, `balanced`, and `deep`. If not explicitly supplied,
the router chooses based on recent text length and complexity markers
(`intelligence_router.py:111-120`). History is bounded to a maximum window of eight
messages and 5,000 characters by default; each message is capped at 1,800 characters
(`intelligence_router.py:122-134`).

The router checks the response cache before route/context work
(`intelligence_router.py:275-281` for complete responses and `:334-353` for streams).
For uncached requests it loads memory, RAG, and the daily communication profile using
`asyncio.gather` (`:169-220`). Each source has a shared configurable deadline of
`CONTEXT_SOURCE_TIMEOUT_SECONDS`, default 1.5 seconds (`app/config.py:46-49`).

The context builder combines:

- Conversation summary.
- Preferred language and Arabic dialect profile.
- Up to `memory_recall_limit` relevant memories.
- Up to three RAG results, each truncated to 1,200 characters.

This context is added to the system prompt (`intelligence_router.py:136-167`).
The AI request then goes to the primary backend and falls through only if no token
has been emitted; a mid-stream failure after partial output does not mix a second
model into the already displayed answer (`intelligence_router.py:366-413`).

## 4. Model and Ollama baseline

### 4.1 Model selection

There are three current sources of model configuration:

| Environment/configuration | Model | Engine |
|---|---|---|
| Python defaults | `qwen2.5:0.5b` (`app/config.py:15`) | `ollama` (`app/config.py:13`) |
| Replit shared environment | `qwen2.5:1.5b` (`.replit:25`) | `llamacpp` in `LOCAL_AI_ENGINE` (`.replit:20`) |
| Render environment | `qwen2.5:7b` (`render.yaml:37-38`) | Defaults to Ollama because `LOCAL_AI_ENGINE` is not set there |

The active backend implementation therefore depends on the environment. When
`LOCAL_AI_ENGINE=ollama`, `BackendRegistry` creates `OllamaBackend`; otherwise it
creates the OpenAI-compatible `LlamaCppBackend` (`app/backends/registry.py:43-56`).
The project must treat these settings as a configuration matrix, not as one
universal model baseline.

### 4.2 Ollama adapter and process configuration

`OllamaBackend` uses a reusable `httpx.AsyncClient` with:

- connect timeout 5 seconds;
- read timeout 600 seconds;
- write timeout 30 seconds;
- pool timeout 10 seconds;
- one local generation semaphore slot by default;
- bounded queue controlled by `LOCAL_AI_MAX_QUEUE`;
- queue wait controlled by `LOCAL_AI_QUEUE_TIMEOUT_SECONDS`.

The adapter calls Ollama `/api/chat` with `stream=true`, `think=false`, `keep_alive`,
and configured model options (`services/ai-engine/app/backends/ollama.py:138-164`).
Generation options include `num_predict`, temperature, `num_ctx`, `num_thread`,
`num_batch`, `top_p`, `top_k`, and `repeat_penalty` (`ollama.py:76-86`).

Render currently sets:

- `LOCAL_AI_MODEL=qwen2.5:7b`
- `LOCAL_AI_KEEP_ALIVE=-1`
- `LOCAL_AI_NUM_CTX=4096`
- `LOCAL_AI_NUM_THREAD=6`
- `LOCAL_AI_NUM_BATCH=128`
- `LOCAL_AI_MAX_CONCURRENCY=1`
- `LOCAL_AI_MAX_QUEUE=8`
- `LOCAL_AI_QUEUE_TIMEOUT_SECONDS=5`
- `OLLAMA_NUM_PARALLEL=1`
- `OLLAMA_MAX_QUEUE=128`
- fast/balanced/deep output caps of 128/384/768 tokens

(`render.yaml:37-63`).

`start-ollama.sh` starts Ollama, pulls the configured model if absent, sends a
one-token warm-up request with `keep_alive=-1`, and then keeps the process alive
(`start-ollama.sh:18-44`). This reduces repeat cold starts but the first startup
still pays model loading time.

### 4.3 Fallback and local alternatives

`FallbackBackend` is deterministic, always available, and not a generative model.
It recognizes common greetings/help/identity phrases and can format retrieved
knowledge context; otherwise it returns a concise insufficiency message
(`app/backends/fallback.py:55-115`).

`LlamaCppBackend` is an alternative local adapter for an OpenAI-compatible
`/v1/chat/completions` endpoint (`app/backends/llamacpp.py:13-43`). It is not the
same protocol as the native Ollama adapter and is selected by `LOCAL_AI_ENGINE`.

## 5. RAG / Knowledge baseline

The RAG pipeline is MongoDB-backed and currently uses an abstraction around local
embeddings (`services/ai-engine/app/rag/pipeline.py:102-111`):

1. Parse PDF, DOCX, or text (`pipeline.py:37-76`).
2. Normalize and split text into 350-word chunks with 40-word overlap
   (`pipeline.py:79-99`).
3. Embed each chunk.
4. Store chunks with tenant ID, source ID, chunk index, content, and embedding.
5. Invalidate the tenant's response cache after ingestion (`pipeline.py:113-155`).

Embedding behavior is configurable:

- `embedding_provider=auto`;
- Sentence Transformers model `paraphrase-multilingual-MiniLM-L12-v2`;
- CPU device;
- deterministic hashing embedding fallback with dimension 384 if optional
  Sentence Transformers/FAISS packages are unavailable
  (`app/config.py:50-56`; `app/embeddings/service.py`; `requirements-optional.txt`).

Retrieval:

- Creates a query embedding.
- Scans at most `rag_max_scan=2000` tenant chunks.
- Uses a MongoDB query with tenant filter and a 15-second internal timeout.
- Scores vector similarity (55%), lexical overlap (30%), and identifier overlap (15%).
- Returns at most `rag_default_limit=5` results, while the prompt builder injects
  at most three.

Evidence: `services/ai-engine/app/rag/pipeline.py:157-215` and
`app/config.py:46-48`.

The current design is not a native MongoDB vector index or a dedicated vector
database. It is a bounded application-side scan and cosine ranking. This keeps the
architecture simple and local-first, but CPU cost and scan time grow with each
tenant's knowledge volume.

## 6. Memory and daily learning baseline

### 6.1 Conversational memory

`MemoryService` is retrieval-based memory, not per-request fine-tuning
(`app/memory/service.py:1-5`):

- Keeps a bounded per-process tenant cache (`memory_cache_size=256`).
- Stores user/assistant pairs in `ai_memories`.
- Truncates each query and answer to 1,000 characters.
- Recalls only the same tenant and either the same user or shared (`userId=null`)
  memories.
- Scores lexical token overlap.
- Returns three memories by default.
- Writes are capped at a 250 ms wait and are intentionally non-blocking to the
  response path (`service.py:39-64`).

The MongoDB recall query is capped by `memory_scan_limit=5000` and also uses a
250 ms operation timeout (`service.py:66-101`; `config.py:27-34`).

### 6.2 Daily communication profile

`DailyLearningService` analyzes message queries once per hour after a 15-second
startup delay. It derives preferred language, Arabic dialect markers, and common
phrases, then stores daily profiles in `ai_daily_learning`
(`app/memory/daily_learning.py:56-159`).

Profile reads are cached for five minutes and limited to seven daily documents
(`daily_learning.py:116-146`). This profile affects communication style only; it
is not treated as factual knowledge by the prompt builder.

## 7. Response cache baseline

`ResponseCacheService` has:

- bounded in-process LRU memory cache (`response_cache_size=2048`);
- persistent MongoDB cache;
- exact request keys;
- repeated standalone prompt keys;
- historical accepted-answer reuse;
- conservative lexical similarity lookup for standalone prompts.

The key includes tenant ID, user ID, response profile, configuration fingerprint,
conversation summary, and the last eight messages
(`app/response_cache.py:64-113`). The configuration fingerprint includes industry,
medical mode, system prompt, RAG/memory switches, and the external model identifier.
Tenant and user identifiers are included in persistent lookup filters, preventing
cross-tenant reuse in the cache paths.

Defaults:

- in-process cache enabled;
- memory TTL 6 hours;
- repeated-prompt TTL 7 days;
- persistent cache TTL 7 days;
- Mongo cache operation timeout 1 second;
- semantic candidate scan limit 250;
- similarity threshold 0.92.

(`app/config.py:36-48`).

Although the intended Phase 0 direction says “exact cache first,” the current
implementation already includes repeated-prompt, historical-answer, and lexical
similarity reuse (`response_cache.py:154-347`). These paths should be measured
separately before changing their behavior.

## 8. Streaming baseline

The current stream is incremental across every layer:

1. Ollama sends newline-delimited JSON chunks with
   `message.content` (`app/backends/ollama.py:143-164`).
2. `IntelligenceRouter._resilient_stream` yields each token immediately
   (`app/router/intelligence_router.py:366-383`).
3. FastAPI wraps every token as `data: {"delta": ...}\n\n`
   (`app/routers/chat.py:62-70`).
4. NestJS consumes the upstream stream using a buffer split on blank lines and
   writes each public frame (`apps/api/src/modules/ai/ai.service.ts:331-357`).
5. The Next proxy returns the body without buffering (`apps/web/src/app/api/[...path]/route.ts:23-37`).
6. The browser decodes, parses, sanitizes, and applies each delta
   (`apps/web/src/lib/utils.ts:73-122`).

SSE headers currently include `Cache-Control: no-cache, no-transform`,
`Connection: keep-alive`, and `X-Accel-Buffering: no` at the Nest/FastAPI layers.
NestJS also sends a `: connected` comment after flushing headers, so the connection
can be established before the first model token.

The stream does not emit a real token until context preparation and backend
connection have completed. Therefore the visible spinner covers:

- NestJS authorization/usage and database work;
- FastAPI cache lookup;
- memory/RAG/profile retrieval deadline;
- prompt construction;
- Ollama queue acquisition and model scheduling.

## 9. Current resources and configuration

### 9.1 Target production resources

Render declares approximately 12 CPU cores and 24 GB RAM through plan `12c-24g`
(`render.yaml:3-6`). The application currently runs `WEB_CONCURRENCY=1`
(`render.yaml:21-22`) and one local model generation at a time
(`render.yaml:47-63`).

No GPU is configured. The Ollama model is kept in RAM with `keep_alive=-1` in
Render and by `OLLAMA_KEEP_ALIVE=-1` in `start-ollama.sh`.

### 9.2 Runtime limits

| Concern | Current value | Source |
|---|---:|---|
| Local generation concurrency | 1 | `app/config.py:20`; `render.yaml:47-48` |
| Local queue | 32 default / 8 Render | `app/config.py:21`; `render.yaml:49-50` |
| Local queue wait | 5 seconds default and Render | `app/config.py:22`; `render.yaml:51-52` |
| Context-source deadline | 1.5 seconds | `app/config.py:49`; `render.yaml:53-54` |
| RAG scan limit | 2,000 chunks | `app/config.py:46` |
| RAG internal query timeout | 15 seconds, additionally bounded by context deadline | `app/config.py:48`; `intelligence_router.py:203-219` |
| History window | 4 default, max 8 | `intelligence_router.py:122-134` |
| History character cap | 5,000 default | `intelligence_router.py:126-134` |
| Fast local output | 96 default / 128 Render tokens | `app/config.py:23`; `render.yaml:55-56` |
| Balanced local output | 256 default / 384 Render tokens | `app/config.py:24`; `render.yaml:57-58` |
| Deep local output | 512 default / 768 Render tokens | `app/config.py:25`; `render.yaml:59-60` |
| Nest complete AI timeout | 120 seconds | `apps/api/src/modules/ai/ai.service.ts:94-101` |
| Nest stream upstream timeout | 300 seconds | `apps/api/src/modules/ai/ai.service.ts:303-309` |
| Ollama read timeout | 600 seconds | `app/backends/ollama.py:55-62` |
| Global Nest throttle | 100 requests per 60 seconds | `apps/api/src/app.module.ts:48-54` |

## 10. Dependencies

### 10.1 Frontend

`apps/web/package.json` contains Next.js 15.5.25, React 19, React DOM, Axios,
Zustand, React Markdown, remark-gfm, Lucide, clsx, tailwind-merge, date-fns,
js-cookie, Radix UI dialog/dropdown/tooltip/scroll-area, TypeScript, Tailwind,
PostCSS, and React/Node type packages.

### 10.2 NestJS API

`apps/api/package.json` contains NestJS core/platform/config/axios/JWT/passport/
mongoose/schedule/swagger/throttler packages, Axios, bcryptjs, class-validator/
transformer, compression, express-rate-limit, helmet, Mongoose, Multer,
Nodemailer, Passport, RxJS, UUID, and the Nest build/test toolchain.

### 10.3 Python AI engine

`services/ai-engine/requirements.txt` contains FastAPI 0.109, Uvicorn 0.27,
Pydantic 2.5/Pydantic Settings, HTTPX 0.26, Motor 3.3, PyMongo 4.6,
multipart/aiofiles/passlib, tiktoken, NumPy 1.26, scikit-learn 1.4, PyPDF2,
python-docx, chardet, and sseclient-py.

`requirements-optional.txt` adds Sentence Transformers and FAISS for a stronger
local embedding/retrieval path; the code has a deterministic hashing fallback.

## 11. External providers: present but disabled

The code has provider-neutral and provider-specific adapters, but they are
configuration-gated:

| Provider/path | Adapter | Current state |
|---|---|---|
| Generic OpenAI-compatible endpoint | `app/backends/managed_provider.py`; `app/backends/openai_compatible.py` | Disabled by `EXTERNAL_AI_ENABLED=false` and empty model/key |
| OpenAI | `app/backends/registry.py:119-132` | Requires `ALLOW_EXTERNAL_PROVIDERS=true`, `FREE_PROVIDER_ONLY=false`, and `OPENAI_API_KEY`; disabled |
| Anthropic | `app/backends/anthropic.py`; registry `:134-138` | Requires the same paid/BYOK switches and `ANTHROPIC_API_KEY`; disabled |
| Groq free quota adapter | `app/backends/free_provider.py`; registry `:89-104` | Requires `FREE_PROVIDERS_ENABLED=true` and `GROQ_API_KEY`; disabled |
| OpenRouter free adapter | `app/backends/free_provider.py`; registry `:105-117` | Requires `FREE_PROVIDERS_ENABLED=true` and `OPENROUTER_API_KEY`; disabled |

Render explicitly sets `EXTERNAL_AI_ENABLED=false`,
`FREE_PROVIDERS_ENABLED=false`, `ALLOW_EXTERNAL_PROVIDERS=false`, and
`FREE_PROVIDER_ONLY=true` (`render.yaml:77-112`). Therefore the expected active
production path is local Ollama plus the deterministic fallback, not any paid or
hosted AI API.

## 12. Current latency bottlenecks

### Confirmed by code

1. **Single local generation slot.** `OllamaBackend` serializes generation at
   `app/backends/ollama.py:29-51`; Render also sets Ollama parallelism to one.
2. **Model cold start.** `start-ollama.sh` must pull/load the model and warm it.
   A redeploy without the optional persistent model disk can repeat model setup.
3. **Pre-first-token work.** Cache lookup, usage/conversation/message database
   work, context retrieval, and prompt construction all happen before the first
   model delta.
4. **RAG application-side scan.** Retrieval reads up to 2,000 tenant chunks and
   computes cosine plus lexical scores in Python (`rag/pipeline.py:171-215`).
5. **End-of-stream persistence.** NestJS waits for assistant persistence,
   conversation count update, and usage recording before ending the stream
   (`ai.service.ts:368-390`).
6. **Long safety timeouts.** Complete requests allow 120 seconds, streamed
   upstream requests 300 seconds, and Ollama reads 600 seconds; these protect
   completion but do not enforce a user-visible five-second SLO.
7. **Per-process state.** Memory/cache, semaphore, quotas, and backend counters are
   in process. They are not shared if the service is horizontally replicated.

### Configuration risks and discrepancies

1. Python defaults, Replit environment, and Render environment select different
   engines/models and context/thread/batch values.
2. `apps/api/src/config/configuration.ts` defaults local AI to `llamacpp` and
   `http://localhost:8080`, while Python defaults to Ollama at `11434`; the
   Nest local-AI config is not the actual stream target when it calls
   `AI_ENGINE_URL`.
3. Health reports backend availability and latency but not MongoDB, cache, model
   loaded state, queue depth, or TTFT.
4. Structured request-level timing is not currently persisted/logged for router,
   memory, retrieval, prompt build, queue wait, first token, generation, and total
   phases.
5. FastAPI CORS is wildcard with credentials (`main.py:65-72`), which is broader
   than a production browser policy.
6. `daily_learning_service.worker()` runs inside the AI process and can compete for
   MongoDB/CPU resources during analysis (`main.py:43`; `daily_learning.py:148-159`).
7. Background `asyncio.create_task` calls for memory and cache writes do not have a
   central supervisor or durable queue (`chat.py:71-77`; `intelligence_router.py:303-321`,
   `:385-398`).

## 13. Current baseline gaps

The repository currently does not contain a completed Phase 0/Phase 1 benchmark
suite under `tests/ai/performance/`, nor a request-level telemetry schema that
records TTFT and each pipeline phase. The available health endpoint is operational
but not a full diagnostics report. Consequently, exact p50/p95/p99 latency,
tokens/second, CPU, RAM, cache-hit rate, and concurrent capacity cannot be claimed
from source inspection alone.

The next phase should measure, without changing behavior first:

- cache hit and miss latency;
- time spent before `stream_route` returns its generator;
- queue wait and model-load time;
- time from Ollama request to first content delta;
- tokens/second and total generation time;
- MongoDB/RAG scan latency;
- memory write and end-of-stream persistence latency;
- CPU/RAM and queue depth under representative concurrency.

This document intentionally stops at Phase 0. It does not propose or implement the
benchmark suite, telemetry changes, provider changes, model replacement, vector
database, or Phase 2 features.
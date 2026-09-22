# Phase 8 — Real Web Search Enablement

**Date:** 2026-09-22
**Status:** Enabled after live verification

This phase activates the existing SearXNG/Web Intelligence path. It does not
add a paid provider, API key, new search architecture, Thanarah Core
integration, write tools, WhatsApp, or a model change.

## Final configuration

The application workflow now runs with:

```text
WEB_SEARCH_ENABLED=true
SEARXNG_URL=http://127.0.0.1:8080
LOCAL_AI_MODEL=qwen2.5:1.5b
THANARAH_CORE_TOOLS_ENABLED=false
```

SearXNG keeps the existing safe-search and JSON settings and uses this
allowlist:

```text
arxiv
wikipedia
bing
bing news
duckduckgo news
github
stackoverflow
```

The Docker bridge could not resolve public DNS in this Replit workspace.
`docker-compose.searxng.yml` therefore uses host networking so the existing
SearXNG container can use the same working network path as the application.
SearXNG still binds to port 8080 and is accessed locally by the AI Engine.

## Engine verification

The live `/config` discovery plus per-engine JSON probe returned **7/7 healthy
engines**:

| Engine | Probe result | Probe result count |
|---|---:|---:|
| arxiv | healthy | 11 |
| wikipedia | healthy | 1 |
| bing | healthy | 11 |
| bing news | healthy | 7 |
| duckduckgo news | healthy | 23 |
| github | healthy | 31 |
| stackoverflow | healthy | 11 |

Removed or not enabled:

- `wikidata` — upstream timeout.
- `duckduckgo` — CAPTCHA responses and timeout/suspension behavior.
- `brave` — `too many requests`; it was removed rather than treated as
  available.

No search provider is called directly by Thanarah. Only SearXNG is used.

## Required real-search checks

These measurements were taken against the running SearXNG instance after
engine filtering. Each URL below came from the live response; no fixture
results were inserted.

| Query | Language/category | Raw results | Relevant results after local filter | Search latency |
|---|---|---:|---:|---:|
| `OpenAI latest news` | en/news | 10 | 10 | 398.6 ms |
| `Saudi Arabia technology news` | en/news | 10 | 10 | 1850.4 ms |
| `ما هو آخر أخبار الذكاء الاصطناعي` | ar/news | 10 | 10 | 382.3 ms |
| `أفضل الجامعات في السعودية` | ar/general | 10 | 0 | 268.9 ms |
| `Python latest release` | en/news | 10 | 10 | 398.9 ms |

Examples of live results:

- `OpenAI latest news` → MSN, Gizmodo, and Miami Herald URLs.
- `Saudi Arabia technology news` → MSN and Zawya URLs.
- `ما هو آخر أخبار الذكاء الاصطناعي` → Alaraby, Emarat Al Youm, and Alwafd
  URLs.
- `Python latest release` → `docs.python.org`, ReleaseBytes, and VersionLog
  URLs.

The university query did return upstream items, but the results did not share
any query terms and were not relevant. The local relevance filter removed
them. An explicit pipeline request for that query returned:

```text
error = "No verified web search results"
sourceCount = 0
events = status, search_started, error
```

This is intentional fail-closed behavior. The system does not cite or send
those unrelated results to Qwen.

## End-to-end verification

The complete live path was exercised:

```text
user question
  -> deterministic web decision
  -> SearXNG search
  -> local relevance filtering
  -> SSRF-safe URL fetch
  -> HTML extraction
  -> local reranking
  -> bounded context
  -> Qwen qwen2.5:1.5b
  -> answer and source block
  -> SSE web events and deltas
```

Observed pipeline examples:

| Query | Web result | Sources after fetch/extraction | Total web/pipeline observation |
|---|---|---:|---:|
| `OpenAI latest news` | successful | 1 | 17,979.5 ms |
| `ما هو آخر أخبار الذكاء الاصطناعي` | successful | 1 | 1,207.7 ms |
| `ابحث عن أفضل الجامعات في السعودية` | fail-closed | 0 | 236.8 ms |

The live SSE check returned HTTP 200 with
`text/event-stream; charset=utf-8` and included:

- `search_started`: 1
- `source_found`: 5
- `fetch_completed`: 2
- `error`: 1 for an individual page that was not fetchable
- `message` delta frames: 62
- delta characters: 454
- `done`: 1
- final `ragSources`: 2 real URLs
- first byte: 9.6 ms
- web search: 2057.0 ms
- web fetch: 1245.0 ms
- web extraction: 33.6 ms
- web reranking: 0.8 ms
- total web work: 3354.1 ms
- first model token: 24,243.0 ms
- total request: 27,739.4 ms

An individual page fetch failure does not become a citation. Other verified
pages continue through the pipeline; if no page can be fetched, the pipeline
returns the fail-closed status instead.

## Citation verification

Citation-bearing non-stream and SSE requests were verified against the live
source records:

- Source IDs are generated only for fetched and extracted pages.
- Source titles and domains are preserved.
- The final source block uses URLs from `result.sources` only.
- URLs in the returned source block match the URLs in `ragSources`.
- No URL was fabricated by the model or added after retrieval.
- The model receives bounded web context marked as untrusted data and is
  instructed to cite `[source-N]`.

Example verified SSE URLs included:

```text
https://www.argaam.com/ar/article/articledetail/id/1843688
https://www.bbc.com/arabic/articles/c89jv5944j9o
```

## Security and isolation

Existing protections were preserved and re-tested:

- HTTP/HTTPS-only URL validation.
- Localhost, loopback, private, link-local, reserved, multicast,
  unspecified, metadata, and internal hostname blocking.
- DNS resolution and private-IP re-check.
- Redirect validation at every hop.
- Redirect count limit.
- Request timeout and bounded retry.
- Response size limit.
- HTML/XHTML/plain-text content-type restriction.
- Tenant, user, and conversation identifiers remain on source metadata and
  are not used to share public search caches.

The focused security and web-intelligence suite passes **14/14** tests,
including SSRF, malicious redirect, malformed search JSON, fetch limits,
source scope, empty-result fail-closed behavior, and all-pages-fetch-failure
behavior.

## Known limitations

1. The Replit Docker bridge currently cannot resolve public DNS for SearXNG;
   host networking is required in this workspace.
2. Some public upstream pages reject automated fetches with HTTP 403 or
   otherwise time out. Those pages are excluded from citations.
3. Bing can return low-relevance results for some Arabic general queries.
   Local term filtering now drops those results and fails closed rather than
   passing them to Qwen.
4. The optional local CrossEncoder is not installed in this runtime, so the
   existing deterministic lexical reranker is used.
5. Search and model latency varies with upstream pages and local CPU load.
   The measured first-token latency is not a throughput guarantee.

## Acceptance result

| Criterion | Result |
|---|---|
| SearXNG returns real internet results | passed |
| At least one free general-purpose engine works | passed — Bing |
| Arabic search works | passed — Arabic news results |
| English search works | passed |
| Real URLs returned | passed |
| Returned pages can be fetched | passed for multiple pages |
| AI cites retrieved sources | passed |
| No fabricated results/citations | passed |
| SSRF protections remain enabled | passed |
| Failure is fail-closed | passed |
| End-to-end AI web search works | passed |
| `WEB_SEARCH_ENABLED=true` only after checks | passed |

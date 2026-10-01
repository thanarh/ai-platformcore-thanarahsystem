---
name: Local SearXNG limits
description: Environment-specific constraints for reliable local web-search verification
---

The local SearXNG setup must bind to IPv4 (`0.0.0.0`) because this environment
does not support the container's default IPv6 bind. The Replit Docker bridge
also fails public DNS resolution for the SearXNG container, so the compose
service must use host networking here. Candidate engines may be listed in
local settings, but they must not be treated as available until `/config`
discovery and a live per-engine JSON probe succeed. The verified allowlist is
Wikipedia, arXiv, Bing, Bing News, DuckDuckGo News, GitHub, and Stack Overflow.
The fetcher must send an explicit descriptive User-Agent because Wikipedia can
return 403 to the HTTP client's default identity.

**Why:** Initial probes failed on IPv6 and Docker-bridge DNS, while direct
Wikipedia retrieval failed with 403 until the request identified the local
retrieval client. DuckDuckGo general, Wikidata, and Brave were not reliable in
live probes. Claiming multi-engine availability from configuration alone would
make the benchmark misleading.

**How to apply:** Keep the local SearXNG engine allowlist intentionally small
and verified before benchmarking. Treat a live JSON probe as dependency
reachability only; verify search, fetch, extraction, citations, and SSE
end-to-end before changing any production flag. Keep production disabled when
the healthy-engine list is empty, and fail closed when relevance filtering or
page fetching leaves no verified evidence.

Strip leading Arabic or English search commands before sending the query or
scoring results. Bing treated literal phrases such as "Search online for..."
as queries and sometimes returned search-provider homepages instead of evidence.
Do not cite search-provider landing pages; require overlap with meaningful
topic terms after removing common stopwords.

**Why:** End-to-end English probes produced Google/Bing/Yahoo homepages and
unrelated events pages even though each engine's health probe succeeded.

**How to apply:** Exercise the exact UI-generated prompt in both Arabic and
English, and inspect fetched source URLs and titles rather than counting raw
SearXNG results.

When a user supplies a direct website URL, fetch that page independently of
search-engine results and include useful page metadata in the extracted
evidence. If the page cannot be fetched, say so explicitly instead of implying
the user did not provide a source.

**Why:** Smaller companies may have no indexed search results, and JavaScript-
rendered landing pages can have little visible HTML text while still exposing a
useful title and description in metadata.

**How to apply:** Route user-provided URLs through the SSRF-safe fetcher, retain
its redirect and public-address checks, and extract title/description metadata
before concluding that no evidence is available.

Workflow environment flags require a full workflow restart to reach the AI
Engine process; hot reload can keep the prior inherited value.

**Why:** After changing the workflow from enabled to disabled, the running
process continued reporting the old flag until the workflow was explicitly
restarted.

**How to apply:** Verify the runtime capabilities endpoint after every
workflow environment change instead of relying on the configured command text.

For Arabic lexical relevance, normalize common spelling variants such as
hamza forms, alef maqsura, and taa marbuta before comparing query terms with
result text. Keep original titles and passages for display and citation.

**Why:** A live Saudi-news query returned Arabic results, but literal comparison
of `السعوديه` with `السعودية` discarded every result.

**How to apply:** Normalize both sides only for relevance scoring; do not alter
the source text shown to users.

For queries explicitly asking what happened “today,” pass SearXNG's `day`
time-range and independently require a parseable publication date matching the
request's local current date. Missing dates are not proof that an article is
current; if no dated same-day source survives, return a localized no-source
response rather than presenting older reports as today's events.

**Why:** Search engines ignored or lacked same-day coverage and returned
articles from March, August, and earlier in September for a September 28 query.

**How to apply:** Derive the comparison date from the request runtime context,
include it in the search cache key, and retain the post-search freshness check
even when a provider supports a time-range parameter. Search engines frequently
omit publication dates from result metadata, so retain undated same-day
candidates for safe page fetching and verify the extracted article date before
using them; compare timestamps in the request's IANA timezone and reject future
publication times. Never treat an undated page as current.

For Arabic headline searches, remove framing words such as “أخبار” and “اليوم”
from the provider query while preserving the news category and explicit date
range.

**Why:** A literal “ما أخبار مصر اليوم” query returned one weakly related item;
searching the topic “مصر” with the same news category and day range surfaced
multiple dated Egyptian reports.

**How to apply:** Keep intent, category, and freshness controls from the original
request, but use a concise topic-only query for provider retrieval and lexical
relevance.

For same-day news, prefer a verified article headline and its source link over a
generated roundup when the extracted page may contain related or sidebar stories.
Article extraction should prefer structured `NewsArticle.articleBody` and ignore
sidebars before any model summarizes the page.

**Why:** A news page's extracted text included trending headlines unrelated to
the article. The local model turned those sidebar items into unsupported claims
while attaching citations to unrelated pages.

**How to apply:** Use the structured article body when available, keep a
same-day-news response limited to source-verified headlines when necessary, and
do not present related-story rails as the article's evidence.

Arabic questions about Latin-script companies can also misroute otherwise
healthy search: the Arabic question words distort the engine language and
lexical scoring even when the actual entity is English.

**Why:** Live probes of company lookups produced unrelated results when the full
Arabic question was sent to Bing, while the cleaned Latin entity query selected
English results. Arabic news typos can similarly select general engines instead
of the news engines.

**How to apply:** Strip recognized lookup wording before search, language
selection, and relevance scoring; normalize only narrow, context-supported
Arabic typos rather than broadly rewriting user text.

For Arabic general searches, a healthy engine probe does not guarantee that the
engine returns results under SearXNG's fixed `ar` locale. If that locale returns
no results, retry with `language=all` before concluding that the search is empty;
retain the normal relevance filter and verified-page requirements.

**Why:** Live Bing searches for common Arabic questions returned zero results
under `ar`, while the same queries returned relevant Arabic pages with
`language=all`.

**How to apply:** Exercise the exact Arabic query through the full pipeline,
including locale retry, lexical relevance, page fetching, extraction, and
citations. Do not count raw results as success or weaken the relevance filter.

When SearXNG has no relevant evidence for a stable general question, the direct
MediaWiki search API can be used as a secondary source. Send a concise topic
query, include a descriptive User-Agent, and serialize requests with at least a
one-second interval per client. Skip this fallback for current/time-sensitive
questions and queries containing direct URLs. A university list page is not
evidence of a ranking.

**Why:** Live Arabic queries found useful history, university, and vehicle pages
through MediaWiki's API when SearXNG returned nothing, but rapid API requests
were rate-limited. Current weather still had no evidence, and a list of Egyptian
universities did not establish a ranking.

**How to apply:** Preserve relevance scoring, SSRF-safe page fetching, and
source verification after fallback results. Keep current weather, news, and
prices evidence-gated; do not infer rankings from page order or model knowledge.
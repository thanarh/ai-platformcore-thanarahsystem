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
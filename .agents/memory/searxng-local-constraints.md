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

Workflow environment flags require a full workflow restart to reach the AI
Engine process; hot reload can keep the prior inherited value.

**Why:** After changing the workflow from enabled to disabled, the running
process continued reporting the old flag until the workflow was explicitly
restarted.

**How to apply:** Verify the runtime capabilities endpoint after every
workflow environment change instead of relying on the configured command text.
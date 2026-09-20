---
name: Local SearXNG limits
description: Environment-specific constraints for reliable local web-search verification
---

The local SearXNG setup must bind to IPv4 (`0.0.0.0`) because this environment
does not support the container's default IPv6 bind. Wikipedia is the only
verified engine for the Phase 3 scope; other public engines can be
rate-limited, CAPTCHA-protected, or outside the approved provider boundary.
The fetcher must send an explicit descriptive User-Agent because Wikipedia can
return 403 to the HTTP client's default identity.

**Why:** Initial probes failed on IPv6, and direct Wikipedia retrieval failed
with 403 until the request identified the local retrieval client. Public
engine experiments also made the benchmark reflect upstream rate limits rather
than the local SearXNG pipeline.

**How to apply:** Keep the local SearXNG engine allowlist intentionally small
and verified before benchmarking. Treat a live JSON probe as dependency
reachability only; verify search, fetch, extraction, citations, and SSE
end-to-end before changing any production flag.
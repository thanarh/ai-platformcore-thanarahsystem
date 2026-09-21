---
name: Local SearXNG limits
description: Environment-specific constraints for reliable local web-search verification
---

The local SearXNG setup must bind to IPv4 (`0.0.0.0`) because this environment
does not support the container's default IPv6 bind. Candidate engines may be
listed in local settings, but they must not be treated as available until
`/config` discovery and a live per-engine JSON probe succeed. On 2026-09-21,
all seven configured candidates timed out upstream in this environment.
The fetcher must send an explicit descriptive User-Agent because Wikipedia can
return 403 to the HTTP client's default identity.

**Why:** Initial probes failed on IPv6, direct Wikipedia retrieval failed with
403 until the request identified the local retrieval client, and the current
container cannot reach the configured public upstream hosts. Claiming
multi-engine availability from configuration alone would make the benchmark
misleading.

**How to apply:** Keep the local SearXNG engine allowlist intentionally small
and verified before benchmarking. Treat a live JSON probe as dependency
reachability only; verify search, fetch, extraction, citations, and SSE
end-to-end before changing any production flag. Keep production disabled when
the healthy-engine list is empty.
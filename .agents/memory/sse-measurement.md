---
name: SSE measurement
description: Reliable measurement of incremental server-sent event delivery in local probes
---

When measuring token streaming, the probe client must report bytes as soon as
they are available. A buffered `read(4096)` can wait until a short response
finishes and falsely make all deltas appear to arrive together; use a
non-buffering read such as `HTTPResponse.read1()` instead.

**Why:** A Phase 2D probe initially reported nearly zero generation span for a
long response because the client waited for its 4 KB buffer, not because the
server collapsed the stream.

**How to apply:** Use `read1()` or an equivalent low-level streaming read for
first-byte, first-token, inter-token, and last-token measurements. Keep the
probe's frame count and `[DONE]` validation separate from transport-read size.

For application telemetry, defer `RequestTelemetry.finish()` until the outer
HTTP stream has forwarded its first content delta and completed iteration.
Inner route generators should set route/model/token values but must not finalize
the request record.

**Why:** `finish()` caches the telemetry payload. If an inner generator
finalizes before a cited answer or fallback reaches the client, the later
`sseFirstDeltaMs` update is omitted from the recorded metrics.

**How to apply:** Record the first content delta at the HTTP streaming boundary,
then finalize once the stream ends; do not treat status or source-found events
as answer content.
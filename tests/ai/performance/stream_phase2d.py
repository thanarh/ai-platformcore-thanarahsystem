#!/usr/bin/env python3
"""Phase 2D direct SSE probe.

This measures the AI Engine SSE boundary without storing prompt or response
content. It is intentionally independent of the authenticated web UI.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any


def parse_frame(frame: str) -> tuple[str | None, bool, int]:
    raw = "\n".join(
        line[5:].lstrip()
        for line in frame.splitlines()
        if line.startswith("data:")
    ).strip()
    if not raw:
        return None, False, 0
    if raw == "[DONE]":
        return None, True, 0
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None, False, -1
    delta = data.get("delta")
    return delta if isinstance(delta, str) and delta else None, False, 0


def read_available(response: Any) -> bytes:
    """Read currently available bytes without waiting for a full 4KB buffer."""
    read1 = getattr(response, "read1", None)
    return read1(4096) if callable(read1) else response.read(1)


def stream_prompt(ai_url: str, prompt: str, timeout: float = 180) -> dict[str, Any]:
    body = {
        "messages": [{"role": "user", "content": prompt}],
        "tenantId": f"phase2d-{uuid.uuid4().hex[:8]}",
        "userId": "streaming-probe",
        "requestId": f"phase2d-{uuid.uuid4().hex[:8]}",
        "tenantConfig": {"memoryEnabled": False, "ragEnabled": False, "cacheEnabled": False},
        "stream": True,
    }
    request = urllib.request.Request(
        f"{ai_url.rstrip('/')}/chat/stream",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    started = time.perf_counter()
    first_byte_at: float | None = None
    first_token_at: float | None = None
    last_token_at: float | None = None
    frame_count = 0
    delta_count = 0
    malformed = 0
    done = False
    buffer = ""

    with urllib.request.urlopen(request, timeout=timeout) as response:
        while True:
            chunk = read_available(response)
            if not chunk:
                break
            first_byte_at = first_byte_at or time.perf_counter()
            buffer += chunk.decode("utf-8", errors="replace")
            events = buffer.split("\n\n")
            buffer = events.pop() or ""
            for event in events:
                frame_count += 1
                delta, is_done, parse_status = parse_frame(event)
                malformed += int(parse_status < 0)
                if delta:
                    now = time.perf_counter()
                    first_token_at = first_token_at or now
                    last_token_at = now
                    delta_count += 1
                if is_done:
                    done = True

        if buffer.strip():
            frame_count += 1
            delta, is_done, parse_status = parse_frame(buffer)
            malformed += int(parse_status < 0)
            if delta:
                now = time.perf_counter()
                first_token_at = first_token_at or now
                last_token_at = now
                delta_count += 1
            done = done or is_done

    ended = time.perf_counter()
    first_byte_at = first_byte_at or ended
    first_token_at = first_token_at or ended
    last_token_at = last_token_at or first_token_at
    return {
        "success": bool(first_token_at and done and malformed == 0),
        "firstByteMs": round((first_byte_at - started) * 1000, 2),
        "firstTokenMs": round((first_token_at - started) * 1000, 2),
        "firstTokenToLastTokenMs": round((last_token_at - first_token_at) * 1000, 2),
        "totalMs": round((ended - started) * 1000, 2),
        "chunkCount": delta_count,
        "sseFrameCount": frame_count,
        "malformedFrames": malformed,
        "doneFrameSeen": done,
        "bufferingGapMs": round((first_token_at - first_byte_at) * 1000, 2),
    }


def abort_after_first_byte(ai_url: str, timeout: float = 180) -> dict[str, Any]:
    body = {
        "messages": [{"role": "user", "content": "اكتب شرحًا طويلًا عن مراقبة الخدمات."}],
        "tenantId": f"phase2d-abort-{uuid.uuid4().hex[:8]}",
        "userId": "streaming-abort-probe",
        "requestId": f"phase2d-abort-{uuid.uuid4().hex[:8]}",
        "tenantConfig": {"memoryEnabled": False, "ragEnabled": False, "cacheEnabled": False},
        "stream": True,
    }
    request = urllib.request.Request(
        f"{ai_url.rstrip('/')}/chat/stream",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    started = time.perf_counter()
    response = urllib.request.urlopen(request, timeout=timeout)
    try:
        first_chunk = read_available(response)
        first_byte_ms = round((time.perf_counter() - started) * 1000, 2)
        response.close()
        return {
            "abortRequested": True,
            "firstByteObserved": bool(first_chunk),
            "abortAfterFirstByteMs": first_byte_ms,
            "connectionClosedByProbe": True,
            "doneExpected": False,
        }
    finally:
        response.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ai-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", default="docs/ai-streaming-phase-2d.json")
    args = parser.parse_args()

    report = {
        "measuredAt": datetime.now(timezone.utc).isoformat(),
        "aiEngineUrl": args.ai_url,
        "productionConfigChanged": False,
        "shortPrompt": stream_prompt(args.ai_url, "ما هي عاصمة السعودية؟"),
        "longPrompt": stream_prompt(
            args.ai_url,
            "اشرح لي الفرق بين API و Token بشكل مبسط، مع مثال قصير يوضح "
            "كيف يستخدم العميل API ويرسل Token، ثم لخّص الفكرة في نقاط.",
        ),
        "abort": abort_after_first_byte(args.ai_url),
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
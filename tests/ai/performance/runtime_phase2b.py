#!/usr/bin/env python3
"""Dependency-free Phase 2B runtime benchmark.

This benchmark records timings and runtime counters only. It never stores
prompts, generated text, tenant IDs, or response bodies.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any


OLLAMA_URL = os.getenv("LOCAL_AI_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
AI_URL = os.getenv("AI_ENGINE_URL", "http://127.0.0.1:8000").rstrip("/")
MODEL = os.getenv("LOCAL_AI_MODEL", "qwen2.5:1.5b")


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))], 2)


def summarize(values: list[float]) -> dict[str, float | None]:
    return {
        "p50": percentile(values, 0.5),
        "p95": percentile(values, 0.95),
        "max": round(max(values), 2) if values else None,
    }


class ResourceSampler:
    def __init__(self, interval: float = 0.5):
        self.interval = interval
        self.samples: list[dict[str, float]] = []
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None

    def _sample(self) -> None:
        try:
            output = subprocess.check_output(
                ["ps", "-eo", "comm=,%cpu=,rss="],
                text=True,
                stderr=subprocess.DEVNULL,
            )
            cpu = 0.0
            rss_kb = 0
            for line in output.splitlines():
                parts = line.split()
                if len(parts) < 3:
                    continue
                command = parts[0].lower()
                if not any(name in command for name in ("ollama", "llama-server", "python", "uvicorn")):
                    continue
                cpu += float(parts[-2])
                rss_kb += int(parts[-1])
            self.samples.append({"cpuPercent": round(cpu, 2), "rssMb": round(rss_kb / 1024, 2)})
        except Exception:
            return

    def _run(self) -> None:
        while not self.stop_event.wait(self.interval):
            self._sample()

    def start(self) -> None:
        self._sample()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self) -> dict[str, Any]:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=self.interval * 2)
        self._sample()
        return {
            "sampleCount": len(self.samples),
            "cpuPercent": summarize([item["cpuPercent"] for item in self.samples]),
            "rssMb": summarize([item["rssMb"] for item in self.samples]),
        }


def ollama_ps() -> dict[str, Any]:
    with urllib.request.urlopen(f"{OLLAMA_URL}/api/ps", timeout=5) as response:
        return json.load(response)


def ollama_chat(
    messages: list[dict[str, str]],
    *,
    threads: int,
    keep_alive: str = "10m",
    max_tokens: int = 32,
) -> dict[str, Any]:
    payload = json.dumps(
        {
            "model": MODEL,
            "messages": messages,
            "stream": False,
            "think": False,
            "keep_alive": keep_alive,
            "options": {
                "num_predict": max_tokens,
                "num_thread": threads,
                "temperature": 0,
            },
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=180) as response:
        data = json.load(response)
    wall_ms = (time.perf_counter() - started) * 1000
    return {
        "wallMs": round(wall_ms, 2),
        "modelLoadMs": round(float(data.get("load_duration", 0) or 0) / 1e6, 2),
        "promptEvalMs": round(float(data.get("prompt_eval_duration", 0) or 0) / 1e6, 2),
        "evalMs": round(float(data.get("eval_duration", 0) or 0) / 1e6, 2),
        "inputTokens": int(data.get("prompt_eval_count", 0) or 0),
        "outputTokens": int(data.get("eval_count", 0) or 0),
        "done": bool(data.get("done")),
    }


def ollama_stream_chat(
    messages: list[dict[str, str]],
    *,
    threads: int,
    keep_alive: str = "10m",
    max_tokens: int = 32,
) -> dict[str, Any]:
    payload = json.dumps(
        {
            "model": MODEL,
            "messages": messages,
            "stream": True,
            "think": False,
            "keep_alive": keep_alive,
            "options": {
                "num_predict": max_tokens,
                "num_thread": threads,
                "temperature": 0,
            },
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    first_token_at: float | None = None
    final: dict[str, Any] = {}
    with urllib.request.urlopen(request, timeout=180) as response:
        for line in response:
            if not line.strip():
                continue
            data = json.loads(line)
            if data.get("message", {}).get("content"):
                first_token_at = first_token_at or time.perf_counter()
            if data.get("done"):
                final = data
                break
    ended = time.perf_counter()
    return {
        "ttftMs": round(((first_token_at or ended) - started) * 1000, 2),
        "wallMs": round((ended - started) * 1000, 2),
        "modelLoadMs": round(float(final.get("load_duration", 0) or 0) / 1e6, 2),
        "promptEvalMs": round(float(final.get("prompt_eval_duration", 0) or 0) / 1e6, 2),
        "evalMs": round(float(final.get("eval_duration", 0) or 0) / 1e6, 2),
        "inputTokens": int(final.get("prompt_eval_count", 0) or 0),
        "outputTokens": int(final.get("eval_count", 0) or 0),
        "done": bool(final.get("done")),
    }


def run_lifecycle(idle_seconds: int) -> dict[str, Any]:
    """Use a short keep-alive only for a controlled unload/reload experiment."""
    messages = [{"role": "user", "content": "أجب بكلمة واحدة: جاهز"}]
    rows: list[dict[str, Any]] = []
    rows.append({"step": "before", "loaded": bool(ollama_ps().get("models"))})
    first = ollama_chat(messages, threads=4, keep_alive="30s", max_tokens=1)
    rows.append({"step": "first_30s", **first, "loadedAfter": bool(ollama_ps().get("models"))})
    rows.append({"step": "immediate", "loaded": bool(ollama_ps().get("models"))})
    time.sleep(idle_seconds)
    rows.append({"step": f"after_{idle_seconds}s_idle", "loaded": bool(ollama_ps().get("models"))})
    reload_result = ollama_chat(messages, threads=4, keep_alive="30s", max_tokens=1)
    rows.append(
        {
            "step": "after_idle_reload",
            **reload_result,
            "loadedAfter": bool(ollama_ps().get("models")),
        }
    )
    warm_result = ollama_chat(messages, threads=4, keep_alive="30s", max_tokens=1)
    rows.append({"step": "after_reload_warm", **warm_result})
    return {"keepAlive": "30s", "idleSeconds": idle_seconds, "rows": rows}


def run_threads(iterations: int, max_tokens: int) -> dict[str, Any]:
    messages = [
        {
            "role": "user",
            "content": (
                "Explain a safe software release checklist in concise ordered steps. "
                "Include tests, rollback, observability, and incident communication."
            ),
        }
    ]
    result: dict[str, Any] = {}
    sampler = ResourceSampler()
    sampler.start()
    try:
        for threads in (4, 6, 8, 10):
            ollama_chat(messages, threads=threads, keep_alive="10m", max_tokens=1)
            samples = [
                ollama_stream_chat(
                    messages,
                    threads=threads,
                    keep_alive="10m",
                    max_tokens=max_tokens,
                )
                for _ in range(iterations)
            ]
            result[str(threads)] = {
                "iterations": len(samples),
                "ttftMs": summarize([item["ttftMs"] for item in samples]),
                "totalMs": summarize([item["wallMs"] for item in samples]),
                "promptEvalMs": summarize([item["promptEvalMs"] for item in samples]),
                "tokensPerSecond": summarize(
                    [
                        item["outputTokens"] / max(item["evalMs"] / 1000, 0.001)
                        for item in samples
                    ]
                ),
                "inputTokens": summarize([float(item["inputTokens"]) for item in samples]),
                "rawRuntime": samples,
            }
    finally:
        resources = sampler.stop()
    return {"settings": "direct Ollama options; production config unchanged", "results": result, "resources": resources}


def context_messages(size: str) -> list[dict[str, str]]:
    base = "Use the context to answer briefly. Context: "
    if size == "short":
        context = "Release checklist: test, observe, and keep rollback ready."
    elif size == "medium":
        context = (
            "Release checklist: test the application, verify database migration safety, "
            "observe error rate and latency, deploy gradually, keep rollback ready, "
            "communicate incidents, and record the final decision. "
        ) * 8
    else:
        context = (
            "Release checklist: test the application, verify database migration safety, "
            "observe error rate and latency, deploy gradually, keep rollback ready, "
            "communicate incidents, record the final decision, and validate recovery. "
        ) * 28
    return [{"role": "user", "content": base + context + " What are the first three actions?"}]


def run_context(iterations: int, max_tokens: int) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for size in ("short", "medium", "long"):
        messages = context_messages(size)
        ollama_chat(messages, threads=4, keep_alive="10m", max_tokens=1)
        samples = [
            ollama_stream_chat(
                messages,
                threads=4,
                keep_alive="10m",
                max_tokens=max_tokens,
            )
            for _ in range(iterations)
        ]
        result[size] = {
            "iterations": len(samples),
            "promptEvalMs": summarize([item["promptEvalMs"] for item in samples]),
            "ttftMs": summarize([item["ttftMs"] for item in samples]),
            "totalMs": summarize([item["wallMs"] for item in samples]),
            "inputTokens": summarize([float(item["inputTokens"]) for item in samples]),
            "rawRuntime": samples,
        }
    return result


def stream_probe() -> dict[str, Any]:
    body = {
        "messages": [{"role": "user", "content": "Stream a concise explanation of readiness."}],
        "tenantId": f"phase2b-{uuid.uuid4().hex[:8]}",
        "userId": "runtime-benchmark",
        "requestId": f"phase2b-{uuid.uuid4().hex[:8]}",
        "tenantConfig": {"memoryEnabled": False, "ragEnabled": False, "cacheEnabled": False},
        "stream": True,
    }
    request = urllib.request.Request(
        f"{AI_URL}/chat/stream",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    started = time.perf_counter()
    first_byte = None
    first_token = None
    last_token = None
    done = False
    malformed = 0
    buffer = b""
    with urllib.request.urlopen(request, timeout=180) as response:
        first = response.read(1)
        if first:
            first_byte = time.perf_counter()
            buffer += first
        while True:
            chunk = response.read(1)
            if not chunk:
                break
            buffer += chunk
            if not buffer.endswith(b"\n"):
                continue
            line, _, buffer = buffer.partition(b"\n")
            text = line.decode("utf-8", errors="replace").strip()
            if not text.startswith("data:"):
                continue
            raw = text[5:].strip()
            if raw == "[DONE]":
                done = True
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                malformed += 1
                continue
            delta = data.get("delta")
            if isinstance(delta, str) and delta:
                now = time.perf_counter()
                first_token = first_token or now
                last_token = now
    ended = time.perf_counter()
    return {
        "success": bool(first_token and done),
        "firstByteMs": round(((first_byte or ended) - started) * 1000, 2),
        "firstTokenMs": round(((first_token or ended) - started) * 1000, 2),
        "lastTokenMs": round(((last_token or ended) - started) * 1000, 2),
        "totalMs": round((ended - started) * 1000, 2),
        "bufferingGapMs": round(
            max(0.0, ((first_token or ended) - (first_byte or started)) * 1000),
            2,
        ),
        "malformedFrames": malformed,
        "doneFrameSeen": done,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=5)
    parser.add_argument("--idle-seconds", type=int, default=35)
    parser.add_argument("--max-tokens", type=int, default=8)
    parser.add_argument("--skip-lifecycle", action="store_true")
    parser.add_argument("--skip-threads", action="store_true")
    parser.add_argument("--skip-context", action="store_true")
    parser.add_argument("--skip-streaming", action="store_true")
    parser.add_argument("--output", default="docs/ai-runtime-phase-2b-benchmark.json")
    args = parser.parse_args()

    report: dict[str, Any] = {
        "measuredAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL,
        "ollamaUrl": OLLAMA_URL,
        "aiEngineUrl": AI_URL,
        "productionConfigChanged": False,
        "maxTokens": args.max_tokens,
    }
    if not args.skip_lifecycle:
        report["lifecycle"] = run_lifecycle(args.idle_seconds)
    if not args.skip_threads:
        report["threads"] = run_threads(args.iterations, args.max_tokens)
    if not args.skip_context:
        report["context"] = run_context(args.iterations, args.max_tokens)
    if not args.skip_streaming:
        report["streaming"] = stream_probe()
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
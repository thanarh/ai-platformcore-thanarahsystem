#!/usr/bin/env python3
"""Dependency-free latency benchmark for the local Thanarah AI Engine.

The runner intentionally records timings and counts only. It never prints or
stores prompts, generated text, response bodies, or server error bodies.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_TIMEOUT = 45.0
APPROX_CHARS_PER_TOKEN = 4.0
TELEMETRY_METRICS = (
    "routerMs",
    "cacheLookupMs",
    "memoryMs",
    "retrievalMs",
    "embeddingMs",
    "contextMs",
    "promptBuildMs",
    "ollamaQueueMs",
    "ollamaToFirstTokenMs",
    "modelLoadMs",
    "ollamaPromptEvalMs",
    "ollamaEvalMs",
    "timeToFirstTokenMs",
    "generationMs",
    "totalMs",
    "inputTokens",
    "outputTokens",
)


class ResourceSampler:
    """Sample aggregate CPU/RSS for the local Ollama and AI-engine processes."""

    def __init__(self, interval: float = 0.5):
        self.interval = interval
        self.samples: list[dict[str, float]] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

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
            pass

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self._sample()

    def start(self) -> None:
        self._sample()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> dict[str, Any]:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=self.interval * 2)
        self._sample()
        cpus = [sample["cpuPercent"] for sample in self.samples]
        rss = [sample["rssMb"] for sample in self.samples]
        return {
            "sampleCount": len(self.samples),
            "cpuPercent": summarize_values(cpus),
            "rssMb": summarize_values(rss),
            "scope": "aggregate local Ollama, llama-server, Python, and Uvicorn processes",
        }


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    category: str
    messages: tuple[dict[str, str], ...]
    tenant_config: dict[str, Any]
    stream: bool = False


def _user(content: str) -> dict[str, str]:
    return {"role": "user", "content": content}


def _assistant(content: str) -> dict[str, str]:
    return {"role": "assistant", "content": content}


def build_cases() -> list[BenchmarkCase]:
    """Return a deterministic, non-sensitive suite with more than 20 cases."""
    long_prompt = (
        "Explain a software release checklist in ordered steps. "
        "Include testing, rollback, observability, database migration safety, "
        "and incident communication. Keep each step concise and practical. "
    ) * 3
    arabic_long = (
        "اكتب خطة مختصرة ومنظمة لتحسين سرعة تطبيق ويب، تشمل التخزين المؤقت، "
        "قواعد البيانات، البث التدريجي، مراقبة الأخطاء، واختبار الضغط. "
    ) * 3

    cases = [
        BenchmarkCase("simple-01", "simple_chat", (_user("Say hello briefly."),), {}, True),
        BenchmarkCase("simple-02", "simple_chat", (_user("Give three short tips for focus."),), {}),
        BenchmarkCase("simple-03", "simple_chat", (_user("What is a health check endpoint?"),), {}),
        BenchmarkCase("arabic-01", "arabic_question", (_user("ما معنى التخزين المؤقت؟"),), {}, True),
        BenchmarkCase("arabic-02", "arabic_question", (_user("اذكر ثلاث نصائح لتنظيم الوقت."),), {}),
        BenchmarkCase("arabic-03", "arabic_question", (_user("اشرح الفرق بين النسخ الاحتياطي والمزامنة."),), {}),
        BenchmarkCase("english-01", "english_question", (_user("Define an API in one paragraph."),), {}, True),
        BenchmarkCase("english-02", "english_question", (_user("List three benefits of automated tests."),), {}),
        BenchmarkCase("english-03", "english_question", (_user("Explain a database index simply."),), {}),
        BenchmarkCase("long-01", "long_question", (_user(long_prompt),), {}),
        BenchmarkCase("long-02", "long_question", (_user(arabic_long),), {}, True),
        BenchmarkCase(
            "rag-01",
            "rag_question",
            (_user("What relevant information is available in the knowledge base?"),),
            {"ragEnabled": True, "memoryEnabled": False},
        ),
        BenchmarkCase(
            "rag-02",
            "rag_question",
            (_user("Summarize the most relevant stored knowledge for this request."),),
            {"ragEnabled": True, "memoryEnabled": False},
            True,
        ),
        BenchmarkCase(
            "memory-01",
            "memory_question",
            (_user("Use relevant previous learnings if they exist; otherwise say none."),),
            {"memoryEnabled": True, "ragEnabled": False},
        ),
        BenchmarkCase(
            "memory-02",
            "memory_question",
            (_user("هل توجد ملاحظات سابقة مرتبطة بهذا السؤال؟"),),
            {"memoryEnabled": True, "ragEnabled": False},
            True,
        ),
        BenchmarkCase(
            "no-context-01",
            "no_context",
            (_user("Answer only from the current message: 2 + 2."),),
            {"memoryEnabled": False, "ragEnabled": False},
        ),
        BenchmarkCase(
            "no-context-02",
            "no_context",
            (_user("Answer only from the current message: name one color."),),
            {"memoryEnabled": False, "ragEnabled": False},
            True,
        ),
        BenchmarkCase(
            "multi-turn-01",
            "multi_turn",
            (
                _user("I am planning a small website."),
                _assistant("A clear plan can reduce implementation risk."),
                _user("Give me the first three implementation steps."),
            ),
            {"memoryEnabled": False, "ragEnabled": False},
        ),
        BenchmarkCase(
            "multi-turn-02",
            "multi_turn",
            (
                _user("أريد تحسين صفحة تسجيل الدخول."),
                _assistant("ابدأ بقياس الأداء وتجربة المستخدم."),
                _user("ما الخطوة التالية؟"),
            ),
            {"memoryEnabled": False, "ragEnabled": False},
            True,
        ),
        # These two cases intentionally use the exact same request identity and
        # payload. The second measures an exact in-process cache hit.
        BenchmarkCase(
            "cached-prime",
            "cached_question",
            (_user("What is the purpose of a readiness probe?"),),
            {"memoryEnabled": False, "ragEnabled": False, "cacheEnabled": True},
        ),
        BenchmarkCase(
            "cached-hit",
            "cached_question",
            (_user("What is the purpose of a readiness probe?"),),
            {"memoryEnabled": False, "ragEnabled": False, "cacheEnabled": True},
        ),
        BenchmarkCase(
            "streaming-01",
            "streaming_response",
            (_user("Stream a concise explanation of graceful shutdown."),),
            {"memoryEnabled": False, "ragEnabled": False},
            True,
        ),
    ]
    return cases


def _approx_tokens(text: str) -> int:
    return max(0, round(len(text) / APPROX_CHARS_PER_TOKEN))


def _safe_error(exc: BaseException) -> str:
    """Return a non-sensitive, stable error label."""
    if isinstance(exc, urllib.error.HTTPError):
        return f"http_{exc.code}"
    if isinstance(exc, TimeoutError):
        return "timeout"
    if isinstance(exc, urllib.error.URLError):
        return "connection_error"
    return type(exc).__name__


def _request_payload(case: BenchmarkCase, tenant_id: str, user_id: str) -> bytes:
    body = {
        "messages": list(case.messages),
        "tenantId": tenant_id,
        "userId": user_id,
        "requestId": f"benchmark-{case.case_id}-{uuid.uuid4().hex[:8]}",
        "tenantConfig": case.tenant_config,
        "stream": case.stream,
    }
    return json.dumps(body, ensure_ascii=False).encode("utf-8")


def _parse_sse_line(line: bytes) -> tuple[str, Any] | None:
    text = line.decode("utf-8", errors="replace").strip()
    if not text.startswith("data:"):
        return None
    raw = text[5:].strip()
    if not raw:
        return None
    if raw == "[DONE]":
        return "done", None
    try:
        return "event", json.loads(raw)
    except json.JSONDecodeError:
        return "malformed", None


def run_case(
    case: BenchmarkCase,
    base_url: str,
    timeout: float,
    tenant_id: str,
    user_id: str,
) -> dict[str, Any]:
    endpoint = "/chat/stream" if case.stream else "/chat"
    payload = _request_payload(case, tenant_id, user_id)
    input_tokens = _approx_tokens(" ".join(message["content"] for message in case.messages))
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{endpoint}",
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream" if case.stream else "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    first_token_at: float | None = None
    output_text = ""
    malformed_frames = 0
    status_code: int | None = None
    backend: str | None = None
    telemetry: dict[str, Any] | None = None

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status_code = response.status
            if case.stream:
                while True:
                    line = response.readline()
                    if not line:
                        break
                    parsed = _parse_sse_line(line)
                    if parsed is None:
                        continue
                    kind, value = parsed
                    if kind == "malformed":
                        malformed_frames += 1
                        continue
                    if kind == "done":
                        break
                    if not isinstance(value, dict):
                        continue
                    delta = value.get("delta")
                    if isinstance(delta, str) and delta:
                        if first_token_at is None:
                            first_token_at = time.perf_counter()
                        output_text += delta
                    meta = value.get("meta")
                    if isinstance(meta, dict) and isinstance(meta.get("backend"), str):
                        backend = meta["backend"]
                        if isinstance(meta.get("telemetry"), dict):
                            telemetry = meta["telemetry"]
            else:
                data = json.load(response)
                if isinstance(data, dict):
                    content = data.get("content")
                    if isinstance(content, str):
                        output_text = content
                        first_token_at = time.perf_counter() if content else None
                    if isinstance(data.get("backend"), str):
                        backend = data["backend"]
    except Exception as exc:
        total_ms = (time.perf_counter() - started) * 1000
        return {
            "case_id": case.case_id,
            "category": case.category,
            "stream": case.stream,
            "success": False,
            "status_code": status_code,
            "ttft_ms": None,
            "total_ms": round(total_ms, 2),
            "input_tokens": input_tokens,
            "output_tokens": 0,
            "tokens_per_second": 0.0,
            "malformed_frames": malformed_frames,
            "backend": backend,
            "cache_hit": backend == "thanarah-cache",
            "telemetry": telemetry,
            "error": _safe_error(exc),
        }

    finished = time.perf_counter()
    total_ms = (finished - started) * 1000
    ttft_ms = (first_token_at - started) * 1000 if first_token_at else None
    output_tokens = _approx_tokens(output_text)
    generation_seconds = max((finished - (first_token_at or started)), 0.001)
    if telemetry:
        actual_output_tokens = int(telemetry.get("outputTokens") or 0)
        generation_ms = float(telemetry.get("generationMs") or 0)
        if actual_output_tokens > 0:
            output_tokens = actual_output_tokens
        tokens_per_second = (
            output_tokens / (generation_ms / 1000)
            if output_tokens > 0 and generation_ms > 0
            else 0.0
        )
    else:
        tokens_per_second = output_tokens / generation_seconds
    return {
        "case_id": case.case_id,
        "category": case.category,
        "stream": case.stream,
        "success": status_code == 200 and bool(output_text),
        "status_code": status_code,
        "ttft_ms": round(ttft_ms, 2) if ttft_ms is not None else None,
        "total_ms": round(total_ms, 2),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "tokens_per_second": round(tokens_per_second, 2),
        "malformed_frames": malformed_frames,
        "backend": backend,
        "cache_hit": backend == "thanarah-cache",
        "telemetry": telemetry,
        "error": None if status_code == 200 and output_text else "empty_response",
    }


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * fraction))
    return round(ordered[index], 2)


def summarize_values(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"p50": None, "p95": None, "max": None}
    return {
        "p50": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "max": round(max(values), 2),
    }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    successful = [result for result in results if result["success"]]
    ttfts = sorted(result["ttft_ms"] for result in successful if result["ttft_ms"] is not None)
    totals = sorted(result["total_ms"] for result in successful)

    telemetry_summary = {}
    for metric in TELEMETRY_METRICS:
        values = [
            float(result["telemetry"][metric])
            for result in successful
            if isinstance(result.get("telemetry"), dict)
            and isinstance(result["telemetry"].get(metric), (int, float))
        ]
        telemetry_summary[metric] = summarize_values(values)
    throughput = [
        float(result["tokens_per_second"])
        for result in successful
        if result.get("tokens_per_second", 0) > 0
        and not result.get("cache_hit")
    ]
    return {
        "cases": len(results),
        "successful": len(successful),
        "failed": len(results) - len(successful),
        "success_rate": round(len(successful) / len(results), 4) if results else 0.0,
        "ttft_ms": {
            "p50": percentile(ttfts, 0.50),
            "p95": percentile(ttfts, 0.95),
            "min": round(min(ttfts), 2) if ttfts else None,
            "max": round(max(ttfts), 2) if ttfts else None,
        },
        "total_ms": {
            "p50": percentile(totals, 0.50),
            "p95": percentile(totals, 0.95),
            "min": round(min(totals), 2) if totals else None,
            "max": round(max(totals), 2) if totals else None,
        },
        "malformed_frames": sum(result["malformed_frames"] for result in results),
        "tokens_per_second": summarize_values(throughput),
        "telemetry": telemetry_summary,
        "telemetry_records": sum(isinstance(result.get("telemetry"), dict) for result in successful),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark the local Thanarah FastAPI AI Engine.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"AI Engine URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT, help="Per-case timeout in seconds.")
    parser.add_argument("--tenant-id", default="benchmark-tenant", help="Synthetic tenant identifier.")
    parser.add_argument("--user-id", default="benchmark-user", help="Synthetic user identifier.")
    parser.add_argument("--output", type=Path, help="Write the complete JSON report to this path.")
    parser.add_argument("--all-stream", action="store_true", help="Use /chat/stream for every case.")
    args = parser.parse_args()

    cases = build_cases()
    if len(cases) < 20:
        raise RuntimeError("Benchmark suite must contain at least 20 cases.")
    if args.all_stream:
        cases = [
            BenchmarkCase(case.case_id, case.category, case.messages, case.tenant_config, True)
            for case in cases
        ]

    started = datetime.now(timezone.utc)
    sampler = ResourceSampler()
    sampler.start()
    try:
        results = [
            run_case(case, args.base_url, args.timeout, args.tenant_id, args.user_id)
            for case in cases
        ]
    finally:
        resources = sampler.stop()
    report = {
        "benchmark": "thanarah-local-ai",
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "base_url": args.base_url,
        "case_count": len(cases),
        "privacy": {
            "prompts_recorded": False,
            "responses_recorded": False,
            "server_error_bodies_recorded": False,
        },
        "summary": summarize(results),
        "resources": resources,
        "results": results,
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")

    summary = report["summary"]
    print(
        f"cases={summary['cases']} successful={summary['successful']} "
        f"failed={summary['failed']} success_rate={summary['success_rate']:.1%}"
    )
    print(f"TTFT p50={summary['ttft_ms']['p50']}ms p95={summary['ttft_ms']['p95']}ms")
    print(f"Total p50={summary['total_ms']['p50']}ms p95={summary['total_ms']['p95']}ms")
    if args.output:
        print(f"json_report={args.output}")
    else:
        print(encoded)
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
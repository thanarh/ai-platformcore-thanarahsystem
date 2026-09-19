#!/usr/bin/env python3
"""Phase 1.5 request-scoped Ollama thread and context experiments.

The report stores timing/count metrics only. Prompts and generated text are
never written to disk or printed.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import threading
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * fraction))
    return round(ordered[index], 2)


def summary(values: list[float]) -> dict[str, float | None]:
    return {
        "p50": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "max": round(max(values), 2) if values else None,
    }


class ResourceSampler:
    def __init__(self, interval: float = 0.25):
        self.interval = interval
        self.samples: list[dict[str, float]] = []
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None

    def sample(self) -> None:
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
                if not any(name in command for name in ("ollama", "llama-server")):
                    continue
                cpu += float(parts[-2])
                rss_kb += int(parts[-1])
            self.samples.append({"cpu": cpu, "rssMb": rss_kb / 1024})
        except Exception:
            pass

    def run(self) -> None:
        while not self.stop_event.wait(self.interval):
            self.sample()

    def start(self) -> None:
        self.sample()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def stop(self) -> dict[str, Any]:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=1)
        self.sample()
        return {
            "samples": len(self.samples),
            "cpuPercent": summary([sample["cpu"] for sample in self.samples]),
            "rssMb": summary([sample["rssMb"] for sample in self.samples]),
        }


def stream_request(
    base_url: str,
    model: str,
    prompt: str,
    threads: int,
    num_ctx: int,
    timeout: float,
) -> dict[str, Any]:
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": "Answer directly and concisely."},
                {"role": "user", "content": prompt},
            ],
            "stream": True,
            "think": False,
            "keep_alive": -1,
            "options": {
                "num_predict": 96,
                "temperature": 0.2,
                "num_ctx": num_ctx,
                "num_thread": threads,
                "num_batch": 64,
            },
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    first_token_at = None
    final: dict[str, Any] = {}
    with urllib.request.urlopen(request, timeout=timeout) as response:
        for raw in response:
            data = json.loads(raw)
            content = data.get("message", {}).get("content", "")
            if content and first_token_at is None:
                first_token_at = time.perf_counter()
            if data.get("done"):
                final = data
    finished = time.perf_counter()
    ttft_ms = ((first_token_at or finished) - started) * 1000
    total_ms = (finished - started) * 1000
    eval_count = int(final.get("eval_count", 0) or 0)
    eval_seconds = float(final.get("eval_duration", 0) or 0) / 1_000_000_000
    return {
        "ttftMs": round(ttft_ms, 2),
        "totalMs": round(total_ms, 2),
        "inputTokens": int(final.get("prompt_eval_count", 0) or 0),
        "outputTokens": eval_count,
        "tokensPerSecond": round(eval_count / eval_seconds, 2) if eval_seconds > 0 else 0.0,
        "loadMs": round(float(final.get("load_duration", 0) or 0) / 1_000_000, 2),
        "promptEvalMs": round(float(final.get("prompt_eval_duration", 0) or 0) / 1_000_000, 2),
        "evalMs": round(float(final.get("eval_duration", 0) or 0) / 1_000_000, 2),
    }


def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "requests": len(rows),
        "ttftMs": summary([row["ttftMs"] for row in rows]),
        "totalMs": summary([row["totalMs"] for row in rows]),
        "tokensPerSecond": summary([row["tokensPerSecond"] for row in rows]),
        "inputTokens": summary([row["inputTokens"] for row in rows]),
        "outputTokens": summary([row["outputTokens"] for row in rows]),
        "loadMs": summary([row["loadMs"] for row in rows]),
        "promptEvalMs": summary([row["promptEvalMs"] for row in rows]),
        "evalMs": summary([row["evalMs"] for row in rows]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    parser.add_argument("--model", default="qwen2.5:1.5b")
    parser.add_argument("--threads", default="1,2,3,4")
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--num-ctx", type=int, default=4096)
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    threads = [int(value) for value in args.threads.split(",") if value.strip()]
    prompts = {
        "short": "Give three concise steps for a safe software deployment.",
        "medium": (
            "Explain a practical release process covering automated tests, database migration safety, "
            "rollback, health checks, metrics, and incident communication. Keep the answer concise. "
        ) * 4,
        "long": (
            "Create a detailed but concise software operations checklist covering planning, testing, "
            "security, database backups, reversible migrations, staged rollout, observability, alerts, "
            "rollback, customer communication, post-incident review, and capacity monitoring. "
        ) * 12,
    }

    rows: list[dict[str, Any]] = []
    thread_summaries: dict[str, Any] = {}
    for thread_count in threads:
        stream_request(
            args.base_url,
            args.model,
            prompts["short"],
            thread_count,
            args.num_ctx,
            args.timeout,
        )
        sampler = ResourceSampler()
        sampler.start()
        config_rows = []
        try:
            for repeat in range(args.repeats):
                for context_size, prompt in prompts.items():
                    result = stream_request(
                        args.base_url,
                        args.model,
                        prompt,
                        thread_count,
                        args.num_ctx,
                        args.timeout,
                    )
                    result.update(
                        {
                            "threads": thread_count,
                            "contextSize": context_size,
                            "repeat": repeat + 1,
                        }
                    )
                    rows.append(result)
                    config_rows.append(result)
        finally:
            resources = sampler.stop()
        thread_summaries[str(thread_count)] = {
            **aggregate(config_rows),
            "resources": resources,
        }

    context_summaries = {
        context_size: aggregate(
            [
                row
                for row in rows
                if row["threads"] == max(threads) and row["contextSize"] == context_size
            ]
        )
        for context_size in prompts
    }
    report = {
        "experiment": "phase-1.5-ollama-request-scoped",
        "finishedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "logicalCpu": subprocess.check_output(["nproc"], text=True).strip(),
            "model": args.model,
            "numCtx": args.num_ctx,
            "repeatsPerContext": args.repeats,
            "productionSettingsChanged": False,
        },
        "threadComparison": thread_summaries,
        "contextComparisonAtMaxTestedThreads": context_summaries,
        "results": rows,
        "privacy": {"promptsStored": False, "responsesStored": False},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"threadComparison": thread_summaries, "contextComparison": context_summaries}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
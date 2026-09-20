#!/usr/bin/env python3
"""Local-model Phase 2C benchmark.

The benchmark talks directly to Ollama. It does not use the AI Engine router,
RAG, memory, cache, web search, or any external provider. Prompts are fixed
synthetic evaluation inputs and contain no tenant or user data.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import threading
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any


OLLAMA_URL = os.getenv("LOCAL_AI_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
PRODUCTION_MODEL = os.getenv("LOCAL_AI_MODEL", "qwen2.5:1.5b")
KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE") or os.getenv("LOCAL_AI_KEEP_ALIVE") or "10m"
THREADS = int(os.getenv("LOCAL_AI_NUM_THREAD", "4"))
NUM_CTX = int(os.getenv("LOCAL_AI_NUM_CTX", "2048"))
NUM_BATCH = int(os.getenv("LOCAL_AI_NUM_BATCH", "64"))

DATASET: list[dict[str, str]] = [
    {"id": "ar-01", "category": "arabic", "prompt": "اكتب ثلاث خطوات مختصرة للتحقق من جاهزية خدمة قبل النشر."},
    {"id": "ar-02", "category": "arabic", "prompt": "اشرح الفرق بين latency وthroughput في جملتين."},
    {"id": "ar-03", "category": "arabic", "prompt": "لخص سياسة احتفاظ بالبيانات في نقاط واضحة، ولا تخترع تفاصيل غير مذكورة."},
    {"id": "ar-04", "category": "arabic", "prompt": "أجب بالعربية: ما فائدة تسجيل الأخطاء مع request ID؟"},
    {"id": "ar-05", "category": "arabic", "prompt": "حوّل العبارة إلى قائمة تحقق من 4 عناصر: راجع الاختبارات، المراقبة، النسخ الاحتياطي، وخطة التراجع."},
    {"id": "en-01", "category": "english", "prompt": "Write three concise steps for checking service readiness before deployment."},
    {"id": "en-02", "category": "english", "prompt": "Explain the difference between latency and throughput in two sentences."},
    {"id": "en-03", "category": "english", "prompt": "Summarize a data-retention policy without inventing details that were not provided."},
    {"id": "en-04", "category": "english", "prompt": "What is the benefit of recording errors with a request ID? Answer briefly."},
    {"id": "en-05", "category": "english", "prompt": "Turn this into a four-item checklist: test, observe, back up, and keep rollback ready."},
    {"id": "tech-01", "category": "technical", "prompt": "Give a safe migration checklist for adding a nullable database column."},
    {"id": "tech-02", "category": "technical", "prompt": "Compare a bounded queue with an unbounded queue for an API service."},
    {"id": "tech-03", "category": "technical", "prompt": "Describe how to detect a cache stampede and name two mitigations."},
    {"id": "tech-04", "category": "technical", "prompt": "Explain why a health endpoint should distinguish liveness from readiness."},
    {"id": "tech-05", "category": "technical", "prompt": "Give a concise incident rollback plan for a failed deployment."},
    {"id": "conv-01", "category": "conversational", "prompt": "I have a busy day. Suggest a simple way to prioritize three tasks."},
    {"id": "conv-02", "category": "conversational", "prompt": "Help me phrase a polite message asking for a project status update."},
    {"id": "conv-03", "category": "conversational", "prompt": "Suggest a short evening routine that includes planning tomorrow."},
    {"id": "conv-04", "category": "conversational", "prompt": "Give a concise answer to someone asking why monitoring matters."},
    {"id": "conv-05", "category": "conversational", "prompt": "Rewrite this politely: 'You did not send the information on time.'"},
]


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * fraction))
    return round(ordered[index], 2)


def summarize(values: list[float]) -> dict[str, float | None]:
    return {
        "p50": percentile(values, 0.5),
        "p95": percentile(values, 0.95),
        "average": round(sum(values) / len(values), 2) if values else None,
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
            self.samples.append(
                {"cpuPercent": round(cpu, 2), "rssMb": round(rss_kb / 1024, 2)}
            )
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


def api_json(path: str, payload: dict[str, Any] | None = None, timeout: float = 30) -> dict[str, Any]:
    data = None
    headers = {}
    method = "GET"
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    request = urllib.request.Request(
        f"{OLLAMA_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def model_inventory() -> list[dict[str, Any]]:
    return api_json("/api/tags").get("models", [])


def model_details(model: str) -> dict[str, Any]:
    response = api_json("/api/show", {"name": model})
    return response.get("details", {})


def stream_chat(
    model: str,
    prompt: str,
    *,
    max_tokens: int,
    keep_alive: str,
) -> dict[str, Any]:
    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "Answer directly and concisely. Do not reveal chain of thought.",
                },
                {"role": "user", "content": prompt},
            ],
            "stream": True,
            "think": False,
            "keep_alive": keep_alive,
            "options": {
                "num_predict": max_tokens,
                "temperature": 0,
                "num_ctx": NUM_CTX,
                "num_thread": THREADS,
                "num_batch": NUM_BATCH,
                "top_p": 0.9,
                "top_k": 40,
                "repeat_penalty": 1.1,
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
    chunks = 0
    text_parts: list[str] = []
    final: dict[str, Any] = {}
    with urllib.request.urlopen(request, timeout=240) as response:
        for line in response:
            if not line.strip():
                continue
            data = json.loads(line)
            content = data.get("message", {}).get("content", "")
            if content:
                chunks += 1
                text_parts.append(content)
                first_token_at = first_token_at or time.perf_counter()
            if data.get("done"):
                final = data
                break
    ended = time.perf_counter()
    eval_ms = float(final.get("eval_duration", 0) or 0) / 1e6
    output_tokens = int(final.get("eval_count", 0) or 0)
    return {
        "ttftMs": round(((first_token_at or ended) - started) * 1000, 2),
        "totalMs": round((ended - started) * 1000, 2),
        "modelLoadMs": round(float(final.get("load_duration", 0) or 0) / 1e6, 2),
        "promptEvalMs": round(float(final.get("prompt_eval_duration", 0) or 0) / 1e6, 2),
        "evalMs": round(eval_ms, 2),
        "tokensPerSecond": round(output_tokens / max(eval_ms / 1000, 0.001), 2),
        "inputTokens": int(final.get("prompt_eval_count", 0) or 0),
        "outputTokens": output_tokens,
        "streamChunks": chunks,
        "done": bool(final.get("done")),
        "output": "".join(text_parts),
    }


def quality_evidence(samples: list[dict[str, Any]]) -> dict[str, Any]:
    by_category: dict[str, list[dict[str, Any]]] = {}
    for sample in samples:
        by_category.setdefault(sample["category"], []).append(sample)
    evidence: dict[str, Any] = {}
    for category, items in by_category.items():
        arabic_responses = sum(
            1 for item in items if any("\u0600" <= char <= "\u06ff" for char in item["output"])
        )
        evidence[category] = {
            "responsesObserved": len(items),
            "nonEmptyResponses": sum(1 for item in items if item["output"].strip()),
            "arabicCharacterResponses": arabic_responses,
            "humanReviewRequired": True,
        }
    return {
        "automatedEvidenceOnly": True,
        "dimensions": [
            "Arabic coherence",
            "instruction following",
            "factual consistency",
            "refusal behavior",
            "formatting",
            "technical answer quality",
        ],
        "evidenceByCategory": evidence,
        "limitation": "These counters do not score semantic quality; human review is required.",
    }


def run_model(model: str, max_tokens: int) -> dict[str, Any]:
    sampler = ResourceSampler()
    sampler.start()
    warmup = stream_chat(
        model,
        "Reply with one word: ready",
        max_tokens=1,
        keep_alive=KEEP_ALIVE,
    )
    samples: list[dict[str, Any]] = []
    try:
        for item in DATASET:
            measurement = stream_chat(
                model,
                item["prompt"],
                max_tokens=max_tokens,
                keep_alive=KEEP_ALIVE,
            )
            samples.append(
                {
                    "id": item["id"],
                    "category": item["category"],
                    **{key: value for key, value in measurement.items() if key != "output"},
                    "output": measurement["output"][:800],
                }
            )
    finally:
        resources = sampler.stop()

    return {
        "model": model,
        "details": model_details(model),
        "warmup": {key: value for key, value in warmup.items() if key != "output"},
        "iterations": len(samples),
        "ttftMs": summarize([item["ttftMs"] for item in samples]),
        "totalMs": summarize([item["totalMs"] for item in samples]),
        "modelLoadMs": summarize([item["modelLoadMs"] for item in samples]),
        "promptEvalMs": summarize([item["promptEvalMs"] for item in samples]),
        "tokensPerSecond": summarize([item["tokensPerSecond"] for item in samples]),
        "inputTokens": summarize([float(item["inputTokens"]) for item in samples]),
        "outputTokens": summarize([float(item["outputTokens"]) for item in samples]),
        "resources": resources,
        "qualityEvidence": quality_evidence(samples),
        "rawMeasurements": samples,
    }


def context_prompt(size: str) -> str:
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
            "communicate incidents, record the final decision, validate recovery, and "
            "confirm the alert path. "
        ) * 28
    return f"Use the context to answer briefly. Context: {context} What are the first three actions?"


def run_context(model: str, max_tokens: int, iterations: int) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for size in ("short", "medium", "long"):
        samples = [
            stream_chat(
                model,
                context_prompt(size),
                max_tokens=max_tokens,
                keep_alive=KEEP_ALIVE,
            )
            for _ in range(iterations)
        ]
        result[size] = {
            "iterations": len(samples),
            "inputTokens": summarize([float(item["inputTokens"]) for item in samples]),
            "promptEvalMs": summarize([item["promptEvalMs"] for item in samples]),
            "ttftMs": summarize([item["ttftMs"] for item in samples]),
            "totalMs": summarize([item["totalMs"] for item in samples]),
            "tokensPerSecond": summarize([item["tokensPerSecond"] for item in samples]),
            "rawMeasurements": [
                {key: value for key, value in item.items() if key != "output"}
                for item in samples
            ],
        }
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--models",
        default=f"{PRODUCTION_MODEL},qwen2.5:0.5b",
        help="Comma-separated local Ollama model names",
    )
    parser.add_argument("--max-tokens", type=int, default=16)
    parser.add_argument("--context-iterations", type=int, default=2)
    parser.add_argument("--skip-context", action="store_true")
    parser.add_argument("--output", default="docs/ai-model-benchmark-phase-2c.json")
    args = parser.parse_args()

    available = {item.get("name") or item.get("model") for item in model_inventory()}
    models = [model.strip() for model in args.models.split(",") if model.strip()]
    missing = [model for model in models if model not in available]
    if missing:
        raise SystemExit(f"Models are not installed: {', '.join(missing)}")

    report: dict[str, Any] = {
        "measuredAt": datetime.now(timezone.utc).isoformat(),
        "ollamaUrl": OLLAMA_URL,
        "productionModel": PRODUCTION_MODEL,
        "productionConfigChanged": False,
        "benchmarkOnlyModels": [model for model in models if model != PRODUCTION_MODEL],
        "host": {
            "platform": platform.platform(),
            "logicalCpu": os.cpu_count(),
            "runtimeConfig": {
                "numCtx": NUM_CTX,
                "numThread": THREADS,
                "numBatch": NUM_BATCH,
                "keepAlive": KEEP_ALIVE,
                "maxTokens": args.max_tokens,
            },
        },
        "dataset": DATASET,
        "modelInventory": [
            {
                "name": item.get("name") or item.get("model"),
                "size": item.get("size"),
                "digest": item.get("digest"),
                "details": item.get("details", {}),
            }
            for item in model_inventory()
        ],
        "quantizationScope": {
            "installedVariants": "Both installed Qwen variants are Q4_K_M.",
            "alternateQuantizationBenchmarked": False,
            "reason": "No alternate quantized variant was installed; the benchmark stays small and local.",
        },
        "models": {},
    }

    for model in models:
        result = run_model(model, args.max_tokens)
        if not args.skip_context:
            result["context"] = run_context(model, args.max_tokens, args.context_iterations)
        report["models"][model] = result

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
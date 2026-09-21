"""Run the Phase 3.1 live SearXNG benchmark.

This script records live measurements only. If SearXNG or its upstream
engines are unavailable, the output keeps the failed searches and does not
substitute fixture values.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "ai-engine"))

from app.config import settings  # noqa: E402
from app.web_intelligence.pipeline import WebIntelligencePipeline  # noqa: E402


QUERIES = [
    ("general", "ابحث عن أفضل متاحف الرياض"),
    ("general", "ما سعر النفط الحالي؟"),
    ("general", "ابحث عن معلومات عن الطاقة الشمسية"),
    ("general", "ابحث عن أفضل طرق تعلم اللغة العربية"),
    ("general", "ما هي عاصمة المملكة العربية السعودية؟ ابحث عن مصدر"),
    ("technical", "ابحث عن توثيق FastAPI الرسمي"),
    ("technical", "كيف أستخدم React Server Actions؟ ابحث عن مصادر رسمية"),
    ("technical", "ابحث عن مقارنة بين REST و GraphQL"),
    ("technical", "research HTTP caching best practices"),
    ("technical", "ابحث عن Python asyncio documentation"),
    ("news/current", "آخر أخبار الذكاء الاصطناعي اليوم"),
    ("news/current", "ما أحدث أخبار التقنية هذا الأسبوع؟"),
    ("news/current", "latest news about renewable energy"),
    ("news/current", "ما آخر مستجدات الأمن السيبراني؟"),
    ("news/current", "current technology headlines"),
    ("explicit", "ابحث في الإنترنت عن مصادر موثوقة حول التعليم عن بعد"),
    ("explicit", "search the web for official OAuth documentation"),
    ("explicit", "ابحث لي عن مصادر مستقلة حول إدارة المشاريع"),
    ("explicit", "research online sources for local-first software"),
    ("explicit", "فتش في الإنترنت عن أفضل ممارسات حماية SSRF"),
]


class BenchmarkTelemetry:
    def __init__(self) -> None:
        self.values: dict[str, object] = {}

    def set(self, key: str, value: object) -> None:
        self.values[key] = value

    def add_ms(self, key: str, started: float) -> None:
        self.values[key] = round((time.perf_counter() - started) * 1000, 2)


async def main() -> None:
    settings.web_search_enabled = True
    pipeline = WebIntelligencePipeline()
    capabilities = await pipeline.capabilities()
    measurements = []

    for index, (query_class, query) in enumerate(QUERIES, start=1):
        telemetry = BenchmarkTelemetry()
        decision_started = time.perf_counter()
        result = await pipeline.run(
            query,
            tenant_id="benchmark-tenant",
            user_id="benchmark-user",
            conversation_id=f"benchmark-{index}",
            telemetry=telemetry,
        )
        decision_latency = round((time.perf_counter() - decision_started) * 1000, 2)
        source_ids = {source.get("id") for source in result.sources}
        citation_ids = {
            token.strip("[]")
            for token in result.context.split()
            if token.startswith("[source-") and token.endswith("]")
        }
        events = [event.get("event") for event in result.events]
        source_domains = sorted({
            str(source.get("domain", ""))
            for source in result.sources
            if source.get("domain")
        })
        measurements.append({
            "id": index,
            "class": query_class,
            "query": query,
            "category": result.decision.category,
            "observedUseWeb": result.decision.use_web,
            "decisionLatencyMs": decision_latency,
            "searchLatencyMs": telemetry.values.get("webSearchMs"),
            "lexicalRelevanceLatencyMs": telemetry.values.get("webLexicalRelevanceMs"),
            "rerankingLatencyMs": telemetry.values.get("webRerankingMs"),
            "fetchLatencyMs": telemetry.values.get("webFetchMs"),
            "extractionLatencyMs": telemetry.values.get("webExtractionMs"),
            "totalWebLatencyMs": telemetry.values.get("webTotalMs"),
            "searchResultCount": telemetry.values.get("webSearchResultCount", 0),
            "fetchedCount": telemetry.values.get("webFetchedCount", 0),
            "successfulFetch": bool(telemetry.values.get("webFetchedCount", 0)),
            "sourceCount": len(result.sources),
            "sourceDomains": source_domains,
            "sourceDiversity": len(source_domains),
            "citationIntegrity": bool(source_ids) and citation_ids.issubset(source_ids),
            "events": events,
            "error": result.error,
        })

    active = [item for item in measurements if item["observedUseWeb"]]
    fetched = [item for item in active if item["successfulFetch"]]
    citations_checked = [item for item in active if item["sourceCount"]]
    citation_passed = [item for item in citations_checked if item["citationIntegrity"]]
    numbers = [
        float(item["searchLatencyMs"])
        for item in active
        if isinstance(item["searchLatencyMs"], (int, float))
    ]
    output = {
        "phase": "3.1",
        "name": "web-source-expansion",
        "measuredAt": time.strftime("%Y-%m-%d"),
        "productionConfigChanged": False,
        "webSearchEnabledForBenchmark": True,
        "searxng": capabilities,
        "queries": measurements,
        "summary": {
            "queryCount": len(measurements),
            "webActivations": len(active),
            "successfulFetchRate": len(fetched) / len(active) if active else None,
            "sourceCount": sum(int(item["sourceCount"]) for item in measurements),
            "citationIntegrity": {
                "passed": len(citation_passed),
                "checked": len(citations_checked),
            },
            "searchLatencyMs": {
                "min": min(numbers) if numbers else None,
                "mean": sum(numbers) / len(numbers) if numbers else None,
                "max": max(numbers) if numbers else None,
            },
            "sourceDiversity": {
                "maxDomainsInQuery": max(
                    (int(item["sourceDiversity"]) for item in measurements),
                    default=0,
                ),
            },
        },
        "productionStatus": {
            "webSearchEnabled": False,
            "safeToEnable": False,
            "reason": "Phase 3.1 live benchmark is diagnostic only; production remains disabled.",
        },
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
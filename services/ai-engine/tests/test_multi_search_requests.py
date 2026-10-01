import unittest
from unittest.mock import patch

import httpx

from app.config import settings
from app.web_intelligence.fetcher import FetchedPage
from app.web_intelligence.pipeline import WebIntelligencePipeline
from app.web_intelligence.decision import decide_web
from app.web_intelligence.search import (
    SearXNGClient,
    SearchResult,
    english_search_query,
    split_search_queries,
)
from app.web_intelligence import pipeline as pipeline_module


class MultiSearchRequestTests(unittest.IsolatedAsyncioTestCase):
    def test_splits_separate_topics_but_keeps_comparisons_together(self):
        queries, truncated = split_search_queries(
            "ابحث عن أضرار الفيب؛ ابحث عن أضرار الشيشة الإلكترونية"
        )
        comparison, comparison_truncated = split_search_queries(
            "ما الفرق بين محركات مرسيدس وBMW؟"
        )

        self.assertEqual(queries, ["أضرار الفيب", "أضرار الشيشة الإلكترونية"])
        self.assertFalse(truncated)
        self.assertEqual(comparison, ["ما الفرق بين محركات مرسيدس وBMW؟"])
        self.assertFalse(comparison_truncated)

    def test_splits_repeated_arabic_search_with_conjunction_and_also(self):
        queries, truncated = split_search_queries(
            "ابحث عن أضرار الفيب، وابحث أيضًا عن أضرار الشيشة الإلكترونية"
        )

        self.assertEqual(queries, ["أضرار الفيب", "أضرار الشيشة الإلكترونية"])
        self.assertFalse(truncated)

    def test_translates_supported_arabic_search_terms_without_external_services(self):
        self.assertEqual(
            english_search_query("أضرار التدخين الإلكتروني"),
            "vaping risks",
        )
        self.assertIsNone(english_search_query("ابحث عن معلومة عامة غير مدعومة بالقاموس"))
        car_query = "أيهما أفضل، متور مرسيدس أم BMW؟"
        translated_car_query = (english_search_query(car_query) or "").casefold()
        self.assertIn("engine", translated_car_query)
        self.assertIn("mercedes", translated_car_query)
        with patch.object(settings, "web_search_enabled", True):
            decision = decide_web(car_query, tenant_config={}, explicit_request=False)
        self.assertTrue(decision.use_web)

    async def test_discovery_live_probes_allowlisted_bing_when_config_omits_it(self):
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/config":
                return httpx.Response(
                    200,
                    json={
                        "engines": [
                            {
                                "name": "wikipedia",
                                "enabled": True,
                                "categories": ["general"],
                            }
                        ]
                    },
                )
            engine = request.url.params.get("engines", "")
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "title": "Verified live engine",
                            "url": "https://public.example/result",
                            "content": "A live result from the engine.",
                            "engines": [engine],
                        }
                    ],
                    "unresponsive_engines": [],
                },
            )

        with patch.object(settings, "web_search_engines", "wikipedia,bing"):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                search_client = SearXNGClient("http://searxng.test", client=client)
                capabilities = await search_client.discover_engines(force=True)
                general_engines = await search_client.active_engines("general")

        self.assertIn("bing", capabilities["configuredEngines"])
        self.assertIn("bing", [item["name"] for item in capabilities["engines"]])
        self.assertIn("bing", general_engines)

    async def test_pipeline_searches_multiple_arabic_topics_and_english_variants(self):
        calls: list[tuple[str, str, str]] = []

        class FakeSearch:
            base_url = "http://searxng.test"

            async def search(self, query, **kwargs):
                calls.append(
                    (
                        query,
                        kwargs["language"],
                        kwargs["category"],
                        kwargs["max_results"],
                    )
                )
                index = len(calls)
                return [
                    SearchResult(
                        title=query,
                        url=f"https://source{index}.example/article",
                        snippet=query,
                        source="fixture",
                        rank=1,
                        category=kwargs["category"],
                    )
                ]

        class FakeFetcher:
            async def fetch(self, url):
                source_name = url.split("/")[2].split(".")[0]
                return FetchedPage(
                    url=url,
                    content_type="text/html",
                    content=(
                        f"<html><title>Verified source</title><main>"
                        f"<p>BODY_MARKER_{source_name}</p>"
                        f"<p>{'Evidence retrieved for the requested topic. ' * 100}</p>"
                        f"</main></html>"
                    ).encode("utf-8"),
                    retrieved_at="2026-10-02T00:00:00+00:00",
                )

        async def rerank_passthrough(_query, candidates, limit):
            return candidates[:limit]

        with (
            patch.object(settings, "web_search_enabled", True),
            patch.object(pipeline_module.local_reranker, "rerank", new=rerank_passthrough),
        ):
            result = await WebIntelligencePipeline(
                search_client=FakeSearch(),
                fetcher=FakeFetcher(),
            ).run(
                "ابحث عن أضرار الفيب؛ ابحث عن أضرار الشيشة الإلكترونية",
                tenant_id="tenant-test",
                language="ar",
            )

        self.assertTrue(result.decision.use_web)
        self.assertIn(("أضرار الفيب", "ar", "general", 5), calls)
        self.assertEqual(calls.count(("vaping risks", "en", "general", 5)), 2)
        self.assertIn(("أضرار الشيشة الإلكترونية", "ar", "general", 5), calls)
        self.assertTrue(
            any(
                language == "en" and query == "vaping risks"
                for query, language, _, _ in calls
            )
        )
        self.assertGreaterEqual(len(result.sources), 2)
        self.assertEqual(len({source["id"] for source in result.sources}), len(result.sources))
        for source in result.sources:
            source_name = source["domain"].split(".")[0]
            self.assertIn(f"BODY_MARKER_{source_name}", result.context)
        self.assertEqual(
            {
                topic
                for source in result.sources
                for topic in source["searchTopics"]
            },
            {"أضرار الفيب", "أضرار الشيشة الإلكترونية"},
        )
        self.assertIn("Search topics:", result.context)


if __name__ == "__main__":
    unittest.main()
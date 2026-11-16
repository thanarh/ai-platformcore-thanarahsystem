import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app.routers.chat as chat_module
from app.models.chat import ChatMessage, ChatRequest, RouteDecision
from app.telemetry import RequestTelemetry


class ChatStreamLatencyCancellationTests(unittest.IsolatedAsyncioTestCase):
    def request_body(self):
        return ChatRequest(
            messages=[ChatMessage(role="user", content="اكتب جملة قصيرة عن الهدوء")],
            tenantId="latency-test-tenant",
            userId="latency-test-user",
            tenantConfig={"memoryEnabled": False},
            stream=True,
        )

    async def test_first_content_is_measured_and_complete_answer_keeps_streaming(self):
        telemetry = RequestTelemetry(request_id="first-content-test")

        class Router:
            async def stream_route(self, _request, event_callback=None):
                async def tokens():
                    await asyncio.sleep(0.01)
                    yield "أول جزء"
                    await asyncio.sleep(0.01)
                    yield " ثم الجزء الأخير"

                return (
                    tokens(),
                    RouteDecision(backend_id="fixture", reason="test"),
                    [],
                    telemetry,
                    [],
                )

        class Request:
            app = SimpleNamespace(state=SimpleNamespace(intelligence_router=Router()))

            async def is_disconnected(self):
                return False

        with patch.object(chat_module.memory_service, "remember", return_value=None):
            response = await chat_module.chat_stream(Request(), self.request_body())
            chunks = [
                chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
                async for chunk in response.body_iterator
            ]

        payload = "".join(chunks)
        frames = [frame for frame in payload.split("\n\n") if frame.strip()]
        metadata = next(
            json.loads(frame.split("data:", 1)[1].strip())
            for frame in frames
            if frame.startswith("data: {") and '"meta"' in frame
        )
        metrics = metadata["meta"]["telemetry"]
        deltas = [
            event["delta"]
            for frame in frames
            for line in frame.splitlines()
            if line.startswith("data: {")
            for event in [json.loads(line.split("data:", 1)[1].strip())]
            if "delta" in event
        ]
        self.assertEqual(deltas, ["أول جزء", " ثم الجزء الأخير"])
        self.assertIn("data: [DONE]", payload)
        self.assertGreater(metrics["sseFirstDeltaMs"], 0)
        self.assertLess(metrics["sseFirstDeltaMs"], 3000)
        self.assertGreaterEqual(metrics["totalMs"], metrics["sseFirstDeltaMs"])

    async def test_disconnect_cancels_a_waiting_model_stream_quickly(self):
        cancelled = asyncio.Event()

        class Router:
            async def stream_route(self, _request, event_callback=None):
                async def blocked_tokens():
                    try:
                        await asyncio.Event().wait()
                        yield "unreachable"
                    finally:
                        cancelled.set()

                return (
                    blocked_tokens(),
                    RouteDecision(backend_id="fixture", reason="test"),
                    [],
                    RequestTelemetry(request_id="cancel-test"),
                    [],
                )

        class Request:
            app = SimpleNamespace(state=SimpleNamespace(intelligence_router=Router()))

            async def is_disconnected(self):
                return True

        with (
            patch.object(chat_module, "STREAM_DISCONNECT_POLL_SECONDS", 0.001),
            patch.object(chat_module.memory_service, "remember", return_value=None),
        ):
            response = await chat_module.chat_stream(Request(), self.request_body())
            iterator = response.body_iterator.__aiter__()
            first = await iterator.__anext__()
            self.assertIn("routing", str(first))
            second = await iterator.__anext__()
            self.assertIn("generating", str(second))
            remaining = [
                chunk async for chunk in iterator
            ]

        self.assertEqual(remaining, [])
        self.assertTrue(cancelled.is_set())

    async def test_disconnect_cancels_slow_search_before_model_generation(self):
        cancelled = asyncio.Event()
        release_search = asyncio.Event()

        class Router:
            async def stream_route(self, _request, event_callback=None):
                await event_callback({"event": "search_started", "query": "fixture"})
                try:
                    await release_search.wait()
                finally:
                    cancelled.set()

                async def tokens():
                    yield "should not be generated"

                return (
                    tokens(),
                    RouteDecision(backend_id="fixture", reason="test"),
                    [],
                    RequestTelemetry(request_id="cancel-search-test"),
                    [],
                )

        class Request:
            app = SimpleNamespace(state=SimpleNamespace(intelligence_router=Router()))

            async def is_disconnected(self):
                return True

        with (
            patch.object(chat_module, "STREAM_DISCONNECT_POLL_SECONDS", 0.001),
            patch.object(chat_module.memory_service, "remember", return_value=None),
        ):
            response = await chat_module.chat_stream(Request(), self.request_body())
            iterator = response.body_iterator.__aiter__()
            self.assertIn("routing", str(await iterator.__anext__()))
            self.assertIn("search_started", str(await iterator.__anext__()))
            remaining = [chunk async for chunk in iterator]

        self.assertEqual(remaining, [])
        self.assertTrue(cancelled.is_set())


if __name__ == "__main__":
    unittest.main()

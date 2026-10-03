import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app.routers.chat as chat_module
from app.models.chat import ChatMessage, ChatRequest, RouteDecision
from app.telemetry import RequestTelemetry


class ChatStreamHeartbeatTests(unittest.IsolatedAsyncioTestCase):
    async def test_generating_stream_emits_keepalive_before_a_slow_first_token(self):
        class FakeIntelligenceRouter:
            async def stream_route(self, _request, event_callback=None):
                async def slow_stream():
                    await asyncio.sleep(0.04)
                    yield "first token"

                return (
                    slow_stream(),
                    RouteDecision(backend_id="fixture", reason="test"),
                    [],
                    RequestTelemetry(),
                    [],
                )

        class FakeRequest:
            app = SimpleNamespace(
                state=SimpleNamespace(intelligence_router=FakeIntelligenceRouter())
            )

            async def is_disconnected(self):
                return False

        chat_request = ChatRequest(
            messages=[ChatMessage(role="user", content="test")],
            tenantId="heartbeat-test",
            tenantConfig={"memoryEnabled": False},
            stream=True,
        )
        response = await chat_module.chat_stream(FakeRequest(), chat_request)

        with patch.object(chat_module, "STREAM_HEARTBEAT_SECONDS", 0.005):
            frames = [
                frame.decode("utf-8") if isinstance(frame, bytes) else frame
                async for frame in response.body_iterator
            ]

        heartbeat_index = next(
            (index for index, frame in enumerate(frames) if '"keepalive": true' in frame),
            None,
        )
        token_index = next(
            (
                index
                for index, frame in enumerate(frames)
                if '"delta"' in frame and "first token" in frame
            ),
            None,
        )
        self.assertIsNotNone(heartbeat_index)
        self.assertIsNotNone(token_index)
        self.assertLess(heartbeat_index, token_index)


if __name__ == "__main__":
    unittest.main()
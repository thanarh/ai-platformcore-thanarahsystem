import json
import logging
import unittest

from app.telemetry import RequestTelemetry, clear_records, recent_records


class _CaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


class TelemetryTests(unittest.TestCase):
    def setUp(self):
        clear_records()

    def test_fixed_schema_and_privacy_safe_json_log(self):
        telemetry = RequestTelemetry(request_id="test-request")
        telemetry.set("route", "thanarah-local")
        telemetry.set("model", "qwen2.5:1.5b")
        handler = _CaptureHandler()
        telemetry_logger = logging.getLogger("app.telemetry")
        previous_level = telemetry_logger.level
        telemetry_logger.setLevel(logging.INFO)
        telemetry_logger.addHandler(handler)
        try:
            record = telemetry.finish(input_tokens=4, output_tokens=7)
        finally:
            telemetry_logger.removeHandler(handler)
            telemetry_logger.setLevel(previous_level)

        self.assertEqual(record["requestId"], "test-request")
        self.assertEqual(record["inputTokens"], 4)
        self.assertEqual(record["outputTokens"], 7)
        self.assertFalse(record["cacheHit"])
        for field in (
            "routerMs", "cacheLookupMs", "memoryMs", "retrievalMs", "embeddingMs",
            "contextMs", "promptBuildMs", "ollamaQueueMs",
            "ollamaToFirstTokenMs", "modelLoadMs", "ollamaPromptEvalMs", "ollamaEvalMs",
            "timeToFirstTokenMs", "generationMs", "totalMs",
            "model", "route", "cacheHit",
        ):
            self.assertIn(field, record)
        self.assertEqual(len(handler.messages), 1)
        self.assertEqual(json.loads(handler.messages[0])["requestId"], "test-request")
        self.assertNotIn("content", handler.messages[0].lower())

    def test_collector_is_bounded(self):
        for index in range(600):
            RequestTelemetry(request_id=str(index)).finish()

        records = recent_records(1000)
        self.assertEqual(len(records), 512)
        self.assertEqual(records[0]["requestId"], "88")
        self.assertEqual(records[-1]["requestId"], "599")

    def test_finish_is_idempotent(self):
        telemetry = RequestTelemetry(request_id="idempotent")
        first = telemetry.finish(route="fallback")
        second = telemetry.finish(route="different")

        self.assertEqual(first, second)
        self.assertEqual(second["route"], "fallback")


if __name__ == "__main__":
    unittest.main()
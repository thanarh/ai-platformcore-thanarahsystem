import asyncio
import subprocess
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.config import settings
from app.routers.voice import _voice_error_detail, transcribe
from app.voice.runtime import (
    FasterWhisperWorker,
    LocalVoiceRuntime,
    VoiceBusyError,
    VoiceInputError,
    voice_runtime,
)


class VoiceReliabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_runtime_returns_busy_instead_of_raising_raw_queue_timeout(self):
        runtime = LocalVoiceRuntime()
        runtime._stt = SimpleNamespace()
        runtime._started = True
        runtime._semaphore = asyncio.Semaphore(1)
        await runtime._semaphore.acquire()
        try:
            with (
                patch.object(settings, "voice_queue_timeout_seconds", 0.01),
                self.assertRaises(VoiceBusyError),
            ):
                await runtime.transcribe(b"audio", "audio/wav", "ar")
        finally:
            runtime._semaphore.release()

    async def test_worker_lock_wait_is_bounded(self):
        worker = FasterWhisperWorker(Path("/unused/model"))
        worker.process = SimpleNamespace(returncode=None)
        await worker.lock.acquire()
        try:
            with (
                patch.object(settings, "voice_queue_timeout_seconds", 0.01),
                self.assertRaises(VoiceBusyError),
            ):
                await worker.transcribe(Path("/unused/audio.wav"), "ar")
        finally:
            worker.lock.release()

    async def test_mime_parameters_are_accepted_and_transcript_is_returned(self):
        runtime = LocalVoiceRuntime()
        runtime._started = True
        runtime._stt = SimpleNamespace(
            transcribe=AsyncMock(
                return_value={
                    "text": "مرحبا بكم",
                    "language": "ar",
                    "languageProbability": 0.97,
                }
            )
        )
        runtime._duration_ms = AsyncMock(return_value=1200)

        async def normalize(_source, target):
            target.write_bytes(b"normalized audio")

        runtime._normalize = AsyncMock(side_effect=normalize)
        result = await runtime.transcribe(
            b"browser audio",
            "audio/webm;codecs=opus",
            "auto",
        )

        self.assertEqual(result.text, "مرحبا بكم")
        self.assertEqual(result.language, "ar")
        self.assertEqual(result.duration_ms, 1200)
        runtime._stt.transcribe.assert_awaited_once()
        runtime._normalize.assert_awaited_once()

    async def test_browser_webm_container_is_normalized_before_stt(self):
        runtime = LocalVoiceRuntime()
        runtime._started = True

        async def inspect_normalized_file(path, language):
            self.assertEqual(language, "ar")
            self.assertTrue(path.read_bytes().startswith(b"RIFF"))
            return {
                "text": "",
                "language": "ar",
                "languageProbability": 0.99,
            }

        runtime._stt = SimpleNamespace(transcribe=AsyncMock(side_effect=inspect_normalized_file))
        with tempfile.TemporaryDirectory(prefix="voice-format-test-") as directory:
            source = Path(directory) / "browser-recording.webm"
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=48000:cl=mono",
                    "-t",
                    "0.5",
                    "-c:a",
                    "libopus",
                    "-f",
                    "webm",
                    str(source),
                ],
                check=True,
                capture_output=True,
            )
            result = await runtime.transcribe(
                source.read_bytes(),
                "audio/webm;codecs=opus",
                "ar",
            )

        self.assertEqual(result.text, "")
        self.assertGreaterEqual(result.duration_ms, 450)
        self.assertLessEqual(result.duration_ms, 650)
        runtime._stt.transcribe.assert_awaited_once()

    async def test_busy_error_is_a_localized_retryable_http_response(self):
        audio = UploadFile(
            filename="voice-input.webm",
            file=BytesIO(b"audio"),
            headers=Headers({"content-type": "audio/webm"}),
        )
        with (
            patch("app.routers.voice._principal", return_value={"tenantId": "t", "userId": "u"}),
            patch.object(
                voice_runtime,
                "transcribe",
                new_callable=AsyncMock,
                side_effect=VoiceBusyError("Voice transcription is busy. Please retry shortly."),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await transcribe(
                    audio=audio,
                    language="ar",
                    x_thanarah_tenant_id="tenant",
                    x_thanarah_user_id="user",
                    x_thanarah_internal=None,
                )

        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.headers["Retry-After"], "2")
        self.assertIn("مشغولة", raised.exception.detail)

    def test_input_error_details_are_safe_and_arabic(self):
        self.assertIn("صيغة التسجيل", _voice_error_detail(VoiceInputError("Unsupported audio MIME type")))
        self.assertIn("قصير", _voice_error_detail(RuntimeError("unrecognized internal exception")))


if __name__ == "__main__":
    unittest.main()

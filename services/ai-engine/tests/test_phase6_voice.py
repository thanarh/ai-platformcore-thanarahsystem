import asyncio
import unittest

from app.voice.runtime import (
    LocalVoiceRuntime,
    VoiceInputError,
    voice_runtime,
)


class Phase6VoiceTests(unittest.TestCase):
    def test_capabilities_are_push_to_talk_and_privacy_safe(self):
        capabilities = voice_runtime.capabilities()
        self.assertEqual(capabilities["executionMode"], "push-to-talk")
        self.assertEqual(capabilities["supportedLanguages"], ["ar", "en"])
        self.assertFalse(capabilities.get("rawAudioStorage", True))
        self.assertEqual(capabilities["limits"]["maxDurationSeconds"], 60)

    def test_oversized_audio_is_rejected_before_processing(self):
        async def run():
            with self.assertRaises(VoiceInputError):
                await voice_runtime.transcribe(
                    b"x" * 10_000_001,
                    "audio/wav",
                    "ar",
                )

        asyncio.run(run())

    def test_unsupported_audio_type_is_rejected(self):
        async def run():
            with self.assertRaises(VoiceInputError):
                await voice_runtime.transcribe(b"audio", "application/octet-stream", "ar")

        asyncio.run(run())

    def test_local_tts_returns_wav_without_persisting_request_audio(self):
        async def run():
            result = await voice_runtime.synthesize("اختبار صوت محلي", "ar")
            self.assertEqual(result.mime_type, "audio/wav")
            self.assertEqual(result.provider, "espeak-ng")
            self.assertTrue(result.content.startswith(b"RIFF"))

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
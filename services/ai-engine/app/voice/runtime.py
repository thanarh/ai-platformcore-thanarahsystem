from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import settings


SUPPORTED_AUDIO_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
}


class VoiceRuntimeError(RuntimeError):
    pass


class VoiceInputError(ValueError):
    pass


class VoiceBusyError(VoiceRuntimeError):
    pass


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: str
    language_probability: float
    latency_ms: int
    duration_ms: int
    provider: str


@dataclass(frozen=True)
class SynthesizedAudio:
    content: bytes
    mime_type: str
    language: str
    provider: str
    latency_ms: int


class FasterWhisperWorker:
    def __init__(self, model_path: Path):
        self.model_path = model_path
        self.process: asyncio.subprocess.Process | None = None
        self.lock = asyncio.Lock()

    async def start(self) -> None:
        if self.process and self.process.returncode is None:
            return
        env = os.environ.copy()
        env["PYTHONPATH"] = self._python_path()
        self.process = await asyncio.create_subprocess_exec(
            settings.voice_stt_python,
            "-u",
            str(Path(__file__).with_name("stt_worker.py")),
            str(self.model_path),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=env,
        )
        try:
            line = await asyncio.wait_for(
                self.process.stdout.readline(), timeout=settings.voice_timeout_seconds
            )
        except asyncio.TimeoutError as exc:
            await self.stop()
            raise VoiceRuntimeError("Local STT worker startup timed out") from exc
        if not line or json.loads(line).get("ready") is not True:
            await self.stop()
            raise VoiceRuntimeError("Local STT worker failed to start")

    async def transcribe(self, audio_path: Path, language: str) -> dict[str, Any]:
        await self.start()
        async with self.lock:
            if not self.process or not self.process.stdin or not self.process.stdout:
                raise VoiceRuntimeError("Local STT worker is unavailable")
            self.process.stdin.write(
                (json.dumps({"audioPath": str(audio_path), "language": language}) + "\n").encode()
            )
            await self.process.stdin.drain()
            try:
                line = await asyncio.wait_for(
                    self.process.stdout.readline(), timeout=settings.voice_timeout_seconds
                )
            except asyncio.TimeoutError as exc:
                await self.stop()
                raise VoiceRuntimeError("Local STT request timed out") from exc
            if not line:
                await self.stop()
                raise VoiceRuntimeError("Local STT worker stopped")
            result = json.loads(line)
            if not result.get("ok"):
                raise VoiceRuntimeError(result.get("error", "Local STT failed"))
            return result

    async def stop(self) -> None:
        if not self.process:
            return
        if self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=2)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
        self.process = None

    @staticmethod
    def _python_path() -> str:
        if settings.voice_stt_pythonpath:
            return settings.voice_stt_pythonpath
        # /nix/store is very large in Replit. start-dev.sh resolves the Nix
        # closure once and passes this value explicitly; never scan it here.
        return ""


class LocalVoiceRuntime:
    def __init__(self):
        self._stt: FasterWhisperWorker | None = None
        self._semaphore = asyncio.Semaphore(max(1, settings.voice_max_concurrency))
        self._started = False
        self._stt_model_path = self._resolve_path(
            settings.voice_stt_model_path, "faster-whisper-tiny"
        )
        self._tts_ar_model_path = self._resolve_path(
            settings.voice_tts_ar_model_path, "ar_JO-kareem-low.onnx"
        )
        self._tts_en_model_path = self._resolve_path(
            settings.voice_tts_en_model_path, "en_US-lessac-low.onnx"
        )

    async def startup(self) -> None:
        if not settings.voice_enabled:
            return
        if self._stt_model_path.is_dir() and self._python_runtime_available():
            self._stt = FasterWhisperWorker(self._stt_model_path)
            try:
                await self._stt.start()
                self._started = True
            except Exception:
                self._stt = None
        else:
            self._started = False

    async def shutdown(self) -> None:
        if self._stt:
            await self._stt.stop()
        self._stt = None
        self._started = False

    def capabilities(self) -> dict[str, Any]:
        stt_available = self._stt is not None and self._started
        return {
            "voiceEnabled": stt_available,
            "executionMode": "push-to-talk",
            "rawAudioStorage": False,
            "supportedLanguages": ["ar", "en"],
            "states": [
                "IDLE", "LISTENING", "TRANSCRIBING", "THINKING",
                "GENERATING", "SPEAKING", "STOPPED", "ERROR",
            ],
            "limits": {
                "maxAudioBytes": settings.voice_max_audio_bytes,
                "maxDurationSeconds": settings.voice_max_duration_seconds,
                "maxConcurrentRequests": settings.voice_max_concurrency,
            },
            "speechToText": {
                "available": stt_available,
                "provider": "faster-whisper",
                "model": settings.voice_stt_model_name,
                "runtime": "python3.13/cpu/int8",
                "reason": None if stt_available else "Local STT model is not provisioned.",
            },
            "textToSpeech": {
                "available": self._tts_available(),
                "provider": {
                    "ar": "espeak-ng",
                    "en": "piper",
                },
                "models": {
                    "ar": "espeak-ng ar",
                    "en": "en_US-lessac-low",
                },
                "reason": None if self._tts_available() else "Local TTS runtime is unavailable.",
            },
        }

    async def transcribe(
        self, audio: bytes, mime_type: str, language: str = "ar"
    ) -> TranscriptionResult:
        if len(audio) > settings.voice_max_audio_bytes:
            raise VoiceInputError("Audio exceeds the maximum allowed size")
        if mime_type.split(";", 1)[0].lower() not in SUPPORTED_AUDIO_MIME_TYPES:
            raise VoiceInputError("Unsupported audio MIME type")
        if language not in {"ar", "en", "auto"}:
            raise VoiceInputError("Unsupported voice language")
        if not self._stt or not self._started:
            raise VoiceRuntimeError("Local STT is unavailable")
        acquired = False
        started = time.perf_counter()
        try:
            await asyncio.wait_for(
                self._semaphore.acquire(), timeout=settings.voice_timeout_seconds
            )
            acquired = True
            with tempfile.TemporaryDirectory(prefix="thanarah-voice-") as directory:
                source = Path(directory) / "source.audio"
                normalized = Path(directory) / "normalized.wav"
                source.write_bytes(audio)
                duration_ms = await self._duration_ms(source)
                if duration_ms > settings.voice_max_duration_seconds * 1000:
                    raise VoiceInputError("Audio exceeds the maximum allowed duration")
                await self._normalize(source, normalized)
                result = await self._stt.transcribe(normalized, language)
            return TranscriptionResult(
                text=str(result.get("text", "")).strip(),
                language=str(result.get("language") or (language if language != "auto" else "ar")),
                language_probability=float(result.get("languageProbability") or 0),
                latency_ms=round((time.perf_counter() - started) * 1000),
                duration_ms=duration_ms,
                provider="faster-whisper",
            )
        finally:
            if acquired:
                self._semaphore.release()

    async def synthesize(self, text: str, language: str = "ar") -> SynthesizedAudio:
        text = " ".join(text.split()).strip()
        if not text:
            raise VoiceInputError("Text is required")
        if len(text) > settings.voice_tts_max_chars:
            raise VoiceInputError("Text exceeds the maximum allowed length")
        if language not in {"ar", "en"}:
            raise VoiceInputError("Unsupported voice language")
        if not self._tts_available():
            raise VoiceRuntimeError("Local TTS is unavailable")
        started = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="thanarah-tts-") as directory:
            output = Path(directory) / "response.wav"
            if language == "ar":
                command = ["espeak-ng", "-v", "ar", "-s", "145", "-w", str(output)]
                provider = "espeak-ng"
            else:
                command = ["piper", "-m", str(self._tts_en_model_path), "-f", str(output)]
                provider = "piper"
            await self._run(command, text.encode("utf-8"), settings.voice_timeout_seconds)
            content = output.read_bytes()
        return SynthesizedAudio(
            content=content,
            mime_type="audio/wav",
            language=language,
            provider=provider,
            latency_ms=round((time.perf_counter() - started) * 1000),
        )

    async def _duration_ms(self, path: Path) -> int:
        result = await self._run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path),
            ],
            None,
            10,
        )
        try:
            duration = float(result.decode().strip())
        except (TypeError, ValueError) as exc:
            raise VoiceInputError("Malformed audio") from exc
        if duration <= 0:
            raise VoiceInputError("Audio contains no duration")
        return round(duration * 1000)

    async def _normalize(self, source: Path, target: Path) -> None:
        await self._run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(source), "-ar", "16000", "-ac", "1",
                "-c:a", "pcm_s16le", str(target),
            ],
            None,
            20,
        )
        if not target.exists() or target.stat().st_size < 44:
            raise VoiceInputError("Malformed audio")

    async def _run(
        self, command: list[str], input_bytes: bytes | None, timeout: float
    ) -> bytes:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE if input_bytes is not None else asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(input=input_bytes), timeout=timeout
            )
        except asyncio.TimeoutError as exc:
            process.kill()
            await process.wait()
            raise VoiceRuntimeError("Local voice process timed out") from exc
        if process.returncode != 0:
            raise VoiceInputError("Audio processing failed" if "ff" in command[0] else "Local TTS failed")
        return stdout

    def _tts_available(self) -> bool:
        return (
            self._command_available("espeak-ng")
            and self._command_available("piper")
            and self._tts_en_model_path.exists()
        )

    @staticmethod
    def _command_available(command: str) -> bool:
        return shutil.which(command) is not None

    @staticmethod
    def _python_runtime_available() -> bool:
        return bool(
            os.system(f"command -v {settings.voice_stt_python} >/dev/null 2>&1") == 0
        )

    @staticmethod
    def _resolve_path(configured: str, filename: str) -> Path:
        if configured:
            return Path(configured)
        engine_root = Path(__file__).resolve().parents[2]
        return engine_root / "models" / filename


voice_runtime = LocalVoiceRuntime()
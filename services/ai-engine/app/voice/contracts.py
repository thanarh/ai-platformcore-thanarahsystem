from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, Optional
from uuid import uuid4


SUPPORTED_VOICE_LANGUAGES = ("ar", "en")


class VoiceState(str, Enum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    TRANSCRIBING = "TRANSCRIBING"
    THINKING = "THINKING"
    GENERATING = "GENERATING"
    SPEAKING = "SPEAKING"
    STOPPED = "STOPPED"
    ERROR = "ERROR"


@dataclass
class VoiceSession:
    tenant_id: str
    user_id: str
    conversation_id: str
    language: str = "ar"
    session_id: str = field(default_factory=lambda: f"voice-{uuid4().hex[:12]}")
    state: VoiceState = VoiceState.IDLE
    transcription: str = ""
    error: Optional[str] = None

    def __post_init__(self) -> None:
        if self.language not in SUPPORTED_VOICE_LANGUAGES:
            self.language = "ar"

    def transition(self, state: VoiceState, error: Optional[str] = None) -> None:
        allowed = {
            VoiceState.IDLE: {VoiceState.LISTENING, VoiceState.STOPPED, VoiceState.ERROR},
            VoiceState.LISTENING: {VoiceState.TRANSCRIBING, VoiceState.STOPPED, VoiceState.ERROR},
            VoiceState.TRANSCRIBING: {VoiceState.THINKING, VoiceState.STOPPED, VoiceState.ERROR},
            VoiceState.THINKING: {VoiceState.GENERATING, VoiceState.STOPPED, VoiceState.ERROR},
            VoiceState.GENERATING: {VoiceState.SPEAKING, VoiceState.STOPPED, VoiceState.ERROR},
            VoiceState.SPEAKING: {VoiceState.IDLE, VoiceState.STOPPED, VoiceState.ERROR},
            VoiceState.STOPPED: {VoiceState.IDLE, VoiceState.LISTENING},
            VoiceState.ERROR: {VoiceState.IDLE, VoiceState.LISTENING, VoiceState.STOPPED},
        }
        if state != self.state and state not in allowed[self.state]:
            raise ValueError(f"Invalid voice transition: {self.state.value} -> {state.value}")
        self.state = state
        if error:
            self.error = error

    def stop(self) -> None:
        self.transition(VoiceState.STOPPED)

    def fail(self, message: str) -> None:
        self.transition(VoiceState.ERROR, message)

    def to_dict(self) -> Dict[str, Any]:
        value = asdict(self)
        value["state"] = self.state.value
        return {
            "sessionId": value["session_id"],
            "tenantId": value["tenant_id"],
            "userId": value["user_id"],
            "conversationId": value["conversation_id"],
            "language": value["language"],
            "state": value["state"],
            "transcription": value["transcription"],
            "error": value["error"],
        }


def resolve_voice_language(
    preferred_language: Optional[str],
    conversation_language: Optional[str],
    detected_language: Optional[str],
) -> str:
    """Apply explicit preference, then conversation, then detection."""
    for language in (preferred_language, conversation_language, detected_language):
        if language in SUPPORTED_VOICE_LANGUAGES:
            return language
    return "ar"


@dataclass(frozen=True)
class VoiceMessageMetadata:
    session_id: str
    language: str
    transcription_status: str = "completed"
    audio_mime_type: Optional[str] = None
    duration_ms: Optional[int] = None
    captured_at: Optional[str] = None
    audio_storage_ref: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "language": self.language,
            "transcriptionStatus": self.transcription_status,
            "audioMimeType": self.audio_mime_type,
            "durationMs": self.duration_ms,
            "capturedAt": self.captured_at,
            "audioStorageRef": self.audio_storage_ref,
        }


VOICE_CAPABILITIES = {
    "voiceEnabled": False,
    "executionMode": "contract-only",
    "supportedLanguages": list(SUPPORTED_VOICE_LANGUAGES),
    "states": [state.value for state in VoiceState],
    "speechToText": {
        "available": False,
        "provider": None,
        "reason": "No local STT engine is installed in this phase.",
    },
    "textToSpeech": {
        "available": False,
        "provider": None,
        "reason": "No local TTS engine is installed in this phase.",
    },
}
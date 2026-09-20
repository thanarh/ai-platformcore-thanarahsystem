# Voice Mode Foundation

Date: 2026-09-20

Voice Mode is an input/output contract around the existing Thanarah
Intelligence pipeline. It is not a separate AI or model:

```text
voice input -> transcription -> existing text AI pipeline
existing text response -> future TTS -> voice output
```

## Implemented now

- `VoiceSession` lifecycle contract with:
  `IDLE`, `LISTENING`, `TRANSCRIBING`, `THINKING`, `GENERATING`,
  `SPEAKING`, `STOPPED`, and `ERROR`.
- Explicit language resolution for `ar` and `en`:
  user preference, then conversation language, then detected language.
- Stop/interrupt transition that can terminate an active session without
  mixing it with a new request.
- Voice message metadata fields on the existing Message document:
  transcription status, language, session ID, duration, MIME type, and an
  optional future audio storage reference.
- Transcription remains the message content used by Conversation and AI
  Context. Audio binary is not stored in the conversation document.
- Authenticated `/api/ai/voice/capabilities` endpoint.
- Chat UI Text/Voice selector and explicit voice state display.

The UI intentionally reports that Voice is foundation-only while no local
STT/TTS engine is installed. The microphone control is visible but disabled
instead of pretending that speech was captured.

## Not implemented in this phase

- Local STT engine
- Local TTS engine
- Browser/cloud speech provider
- Audio upload or binary storage
- Full-duplex real-time voice
- Voice-specific AI model

No paid provider, external AI provider, new speech dependency, or production
model/runtime configuration was added. The existing text stream, model, abort
behavior, and tenant/user authorization remain the source of truth.
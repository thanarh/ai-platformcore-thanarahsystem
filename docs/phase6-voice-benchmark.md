# Phase 6 local voice benchmark

Run date: 2026-09-21  
Environment: Replit Linux container, CPU-only speech runtime  
Speech-to-text: `faster-whisper` tiny, CTranslate2 `int8`, Python 3.13, 4 CPU
threads  
Text-to-speech: Piper `en_US-lessac-low` for English; `espeak-ng ar` for Arabic
because the tested Piper `ar_JO-kareem-low` model exits with
`Invalid fd was supplied: -1`.

## Measurements

Measurements include local subprocess work and model inference. Raw audio is
created in a temporary directory and deleted after each request.

| Scenario | Input | Result | Latency |
| --- | --- | --- | ---: |
| English STT | “Summarize this document for me.” | “Surmerize this document for me.” | 698 ms |
| Arabic STT | “هذا اختبار للصوت المحلي.” | “حابتما تصورتها محالي” | 6,144 ms |
| English TTS | Piper low voice | 70,444 byte WAV | 2,200 ms |
| Arabic TTS | espeak-ng Arabic voice | 146,246 byte WAV | 3,315 ms |
| Mixed STT | Arabic greeting followed by “summarize this document” | “Summarize this document.”; detected English | 1,304 ms |
| Local STT worker startup | warm model process | ready | 1,280 ms |

The English timings are suitable for push-to-talk. Arabic quality and latency
are not yet production-grade: the tiny model and espeak fallback are kept as
the safe local baseline, not presented as neural Arabic quality.

## Acceptance notes

- All STT and TTS providers are local processes; no external speech API is
  called.
- Voice is push-to-talk only. There is no full-duplex or autonomous loop.
- The transcript is passed to the existing conversation send path as a normal
  user message.
- TTS failure is best-effort: the text response remains visible.
- The service enforces 10 MB input, 60 seconds duration, two concurrent voice
  requests, and a 60 second subprocess timeout.
- Raw audio is not written to MongoDB, application logs, telemetry, or the
  repository. Temporary files are deleted when each operation ends.
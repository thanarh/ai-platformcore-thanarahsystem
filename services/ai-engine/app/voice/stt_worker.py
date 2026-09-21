"""Long-lived faster-whisper worker used by the Python 3.12 AI service.

The worker runs under Python 3.13 because the Nix faster-whisper package is
provisioned for that runtime. It communicates only through JSON lines and
never logs audio or transcripts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("model path is required")
    model_path = sys.argv[1]
    model = WhisperModel(
        model_path,
        device="cpu",
        compute_type="int8",
        cpu_threads=4,
        num_workers=1,
    )
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        try:
            request = json.loads(line)
            audio_path = Path(str(request["audioPath"]))
            language = request.get("language")
            segments, info = model.transcribe(
                str(audio_path),
                language=language if language in {"ar", "en"} else None,
                beam_size=1,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            transcript = " ".join(
                segment.text.strip() for segment in segments if segment.text.strip()
            ).strip()
            response = {
                "ok": True,
                "text": transcript,
                "language": info.language if info.language in {"ar", "en"} else language or "ar",
                "languageProbability": round(float(info.language_probability), 4),
            }
        except Exception as exc:
            response = {"ok": False, "error": str(exc)[:240]}
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
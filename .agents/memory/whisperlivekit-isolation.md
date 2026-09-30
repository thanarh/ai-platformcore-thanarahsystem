---
name: WhisperLiveKit experiment isolation
description: Runtime separation and evaluation constraints for isolated WhisperLiveKit comparisons.
---

# Rule

Keep WhisperLiveKit an opt-in experiment. Its dependency resolver can replace packages in the shared Python environment, so the AI service must load its pinned dependencies from a separate import path. Do not route normal transcription through WhisperLiveKit unless explicitly approved.

For WhisperLiveKit 0.2.26 using the existing CTranslate2 faster-whisper weights, choose the LocalAgreement policy with the faster-whisper backend and provide the local model directory. The default SimulStreaming policy expects a different checkpoint format; the offline `wlk transcribe` command does not expose the policy switch.

Treat English clips and synthetic Arabic speech as pipeline smoke tests only. Arabic quality claims require representative human speech and a reference transcript.

**Why:** Installing the experiment into the shared site-packages upgraded dependencies used by Thanarah’s AI service. Separating the service import path kept its pinned FastAPI, Pydantic, NumPy, and scikit-learn versions intact. The first WLK run also showed that the default streaming policy could not load the app’s CTranslate2 model files.

**How to apply:** Keep the regular AI worker and authenticated transcription behavior unchanged. Run WLK separately with the LocalAgreement/faster-whisper configuration; compare both systems on the same model and audio, and use consented reference audio before reporting Arabic accuracy.
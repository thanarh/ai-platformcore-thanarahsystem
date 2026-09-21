---
name: Python 3.13 speech runtime
description: Runtime constraint for the local faster-whisper worker in the Replit Nix environment
---

The local faster-whisper worker runs under Python 3.13 while the AI service remains on Python 3.12. Its Nix dependency closure must be resolved once by the shell startup script and passed as `VOICE_STT_PYTHONPATH`.

**Why:** Recursive globbing of `/nix/store` from Python or repeated command discovery can block service startup in this environment.

**How to apply:** Keep the worker isolated and use `nix-store -qR` during startup provisioning; do not reintroduce runtime scans of `/nix/store`.
---
name: Python native test libraries
description: Shell test runs may not inherit native libraries needed by compiled Python packages.
---

When full AI-engine test discovery fails while importing NumPy with `libstdc++.so.6` missing, treat it as a native-library environment issue rather than a failed application assertion. The affected test module may fail to import while unrelated tests pass.

**Why:** The Python package can be present while its compiled extension cannot load because the shell runtime does not expose the matching shared library.

**How to apply:** Before diagnosing a code regression, check the shell's Nix library environment and rerun focused tests that do not import the affected extension. Report the full-suite limitation clearly if the runtime cannot be corrected safely.

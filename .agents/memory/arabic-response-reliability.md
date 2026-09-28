---
name: Arabic response reliability
description: Guidance for improving Arabic quality in the local multilingual chat pipeline.
---

Keep system and tool instructions in the chosen response language for multilingual local models. Detect language from the user's actual wording rather than URLs, code, or tool names, and honor explicit output-language requests.

**Why:** Mixed-language instructions and scripts can bias the generated response, but language routing alone does not establish factual accuracy.

**How to apply:** For Arabic model changes, keep prompts localized, test mixed-script and URL/code cases, and evaluate factual quality with privacy-safe representative prompts. Use verified web evidence for current facts when search is explicitly enabled.
---
name: General answers without RAG
description: Distinguish general questions from private organization-specific facts when retrieval has no matches.
---

Answer general questions from the model's general knowledge even when tenant RAG returns no results. Require reliable tenant context only for organization-specific facts; when it is missing, say so plainly and still offer useful general guidance where possible.

**Why:** Empty retrieval should not erase the model's baseline knowledge, while private business facts still need grounding to avoid fabrication.

**How to apply:** Keep this distinction explicit in every supported language and test both no-RAG general questions and source-grounded organization questions.
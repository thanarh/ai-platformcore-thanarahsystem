---
name: Arabic response reliability
description: Guidance for improving Arabic quality in the local multilingual chat pipeline.
---

Keep system and tool instructions in the chosen response language for multilingual local models. Detect language from the user's actual wording rather than URLs, code, or tool names, and honor explicit output-language requests.

**Why:** Mixed-language instructions and scripts can bias the generated response, but language routing alone does not establish factual accuracy.

**How to apply:** For Arabic model changes, keep prompts localized, test mixed-script and URL/code cases, and evaluate factual quality with privacy-safe representative prompts. Use verified web evidence for current facts when search is explicitly enabled.

When a user asks in Arabic and includes pasted text in another language, choose Arabic from the user's own question rather than copying the language of that pasted answer or an earlier assistant turn.

**Why:** A copied Chinese answer inside an Arabic request can otherwise bias the model into repeating the wrong response language.

**How to apply:** Prefer the language of the user's question block, explicitly tell the model not to imitate quoted or prior assistant text, and test both Arabic-first and quote-first mixed-script messages.

For web-grounded answers, validate inline citation IDs against fetched sources and do not emit factual lines without citations. A source appendix alone does not support claims. If no cited lines survive, explain the evidence gap and provide the available source links rather than filling it from model knowledge.

**Why:** Live Arabic searches showed that the local model can produce uncited claims and that a generic result page may not substantiate a specific claim.

**How to apply:** Keep the same safeguards for normal and streaming responses. Citation-ID validation is structural only; it does not prove that a source entails a claim.

For brand-level vehicle-engine comparisons, ask for at least two identifiable models and their model years before generating a comparison. Preserve direct user-provided URLs and sufficiently specified model comparisons for source lookup.

**Why:** A brand covers many engine generations and regional variants; generic pages are not enough evidence for specific engine claims.

**How to apply:** Ask for both models, model years, and market (plus engine variants if known) instead of falling back to general model knowledge.
---
name: Automatic factual-question search
description: User-requested policy for automatically searching factual questions and comparisons.
---

Route natural-language questions and comparisons through the existing web-search path when environment and tenant settings allow. Keep greetings and creative writing out of search. Do not imply that SearXNG is Google or claim a search succeeded without relevant fetched sources. Urgent personal-safety handling remains ahead of web search.

**Why:** The user asked that questions likely to take longer be searched automatically and wants fewer unsupported answers.

**How to apply:** Use deterministic question/comparison signals, preserve tenant and environment opt-outs, inspect each result for relevance and source coverage, and keep the user informed when no reliable provider or evidence is available.
---
name: Urgent chat triage
description: Safety routing for urgent first-person medical messages in chat
---

Handle a narrowly recognized, high-risk first-person medical emergency before
cache lookup, web search, or model generation. Respond in the user's language
with immediate safe next steps; do not make the user wait for web evidence or
let a generic refusal replace emergency guidance. Keep the classifier narrow
and test colloquial Arabic and English, along with educational false positives.

Generic time words such as “now” or “الآن” are not sufficient web-search intent.
Search should be selected by current factual intent (news, weather, prices,
latest information) or an explicit request, not by a deictic adverb in a request
for personal help.

**Why:** A first-person report of a deep leg clot with severe abdominal/flank
pain was routed to search solely because it ended with “what should I do now.”
When local search had no results, the user received a generic no-sources answer
instead of urgent guidance.

**How to apply:** Keep emergency triage ahead of cache and tool routing in both
streaming and non-streaming flows. Verify the actual streamed response as well
as unit tests, including that an explicitly selected search tool cannot delay
an urgent response.

An unexplained one-character reply should get a short clarification instead of
being sent to the model, unless the preceding assistant message offered explicit
lettered choices.

**Why:** An isolated Arabic letter after a failed search produced an unrelated
medical refusal instead of asking what the user meant.

**How to apply:** Check the latest user message before cache/model routing in
both chat modes, and preserve intentional letter selections when choices were
shown.
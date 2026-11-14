---
name: Next.js browser assertions
description: Distinguish application errors from Next.js accessibility announcements in browser checks.
---

Do not treat every `role="alert"` element as an application error. Scope browser
assertions to the relevant message or form region.

**Why:** Next.js injects its own accessibility route announcer with that role.
A valid form error can coexist with the announcer, causing strict locator
failures even when the application behaves correctly.

**How to apply:** Assert the expected error text within an alert, rather than
assuming there is exactly one alert in the document. Keep the route announcer
intact; it is not an application bug.

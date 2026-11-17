---
name: GitHub push isolation
description: Keep pushes focused and handle Replit's GitHub URL rewrite safely.
---

- Build the requested push on a fresh `origin/main` and include only the commits needed for that change.
- Replit may rewrite `https://github.com/` to its secure proxy through system Git config. If that proxy cannot push, a direct authenticated push can bypass the rewrite with `GIT_CONFIG_NOSYSTEM=1`.
- **Why:** The proxy can be read-only when no GitHub connection is available, while a local branch may contain unrelated work. Tokens must never appear in a remote URL, command argument, or logs.
- **How to apply:** After the user explicitly requests a push, inspect the commit range, use an existing `GITHUB_PERSONAL_ACCESS_TOKEN` only through a temporary askpass helper, push the minimal commit set, then verify the remote branch hash.

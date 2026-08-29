#!/bin/bash
# Validate required secrets and derive safe defaults for local signing/encryption.

if [ -z "${SESSION_SECRET:-}" ]; then
  echo "SESSION_SECRET is required. Add it to Replit Secrets before starting."
  return 1 2>/dev/null || exit 1
fi

if [ -z "${MONGODB_URI:-}" ]; then
  echo "MONGODB_URI is required. Add it to Replit Secrets before starting."
  return 1 2>/dev/null || exit 1
fi

derive_secret() {
  printf '%s' "${SESSION_SECRET}:$1" | sha256sum | cut -d' ' -f1
}

export JWT_SECRET="${JWT_SECRET:-$(derive_secret jwt)}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(derive_secret refresh)}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(derive_secret encryption)}"
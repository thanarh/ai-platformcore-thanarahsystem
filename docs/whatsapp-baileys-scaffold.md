# WhatsApp Baileys Integration

This app uses a separate Baileys session for each tenant. A platform-owned
session is reserved for phone verification codes because new users do not yet
belong to a tenant. There is no Meta Cloud API fallback.

## Link accounts

An `OWNER` or `ADMIN` can link the platform OTP number from
`/settings/whatsapp`. Tenant managers can link their institution's own number
from the same page. Scan the short-lived QR from WhatsApp's **Linked devices**
screen. QR values are held in memory only and are available only to authorized
managers. Baileys credentials and Signal keys are encrypted with AES-256-GCM
before storage in MongoDB. Keep `SESSION_SECRET` stable and at least 32
characters; rotating it makes existing sessions unreadable.

## Send API

Create a live API key with `whatsapp:send`. A second optional `whatsapp:consent`
scope lets an integration register and revoke recipient consent. API keys are
shown once and stored as hashes.

Before sending, create a tenant-scoped consent record:

```http
POST /api/whatsapp/consents
x-api-key: <live key with whatsapp:consent>
Content-Type: application/json

{
  "phone": "+966501234567",
  "source": "booking-form",
  "reference": "consent-2026-000184"
}
```

Then submit a message with a fresh `Idempotency-Key`:

```http
POST /api/whatsapp/messages
x-api-key: <live key with whatsapp:send>
Idempotency-Key: booking-2026-000184
Content-Type: application/json

{
  "to": "+966501234567",
  "type": "text",
  "text": "تم تأكيد موعدك يوم الأحد الساعة 10 صباحًا.",
  "consentReference": "consent-2026-000184"
}
```

The API returns `202` with a delivery ID. Poll
`GET /api/whatsapp/messages/<delivery-id>` for `pending`, `sent`, `delivered`,
`read`, or `failed`. A consent record must be active and its reference must
match. A recipient can revoke consent through the integration API or by
replying `STOP` / `إلغاء` to the institution's WhatsApp number.
Responses wrap the delivery in `{ "ok": true, "delivery": { ... } }`.
Tenant-wide limits are 30 messages per minute and 1000 per day, in addition
to each API key's hourly limit. Consent and key validity are checked again
before dispatch. Delivery payloads expire after 30 days.

For media, use `type: "image" | "video" | "audio" | "document"` and provide
`media: { "mimeType": "...", "fileName": "...", "base64": "..." }`. Uploads
are limited to 10 MB and accepted MIME types are checked against file
signatures. Text is limited to 4096 characters. Do not send sensitive
information in messages or logs.

## Phone sign-in

`POST /api/auth/phone/request-code` accepts `{ "phone": "+966...", "purpose":
"login" | "register" }`. `POST /api/auth/phone/verify-code` verifies the
six-digit code; for registration it also accepts first/last name, industry,
and optional email/password. Codes expire in five minutes, are stored only as
HMACs, allow at most five attempts, and are sent through the platform-owned
Baileys session. Email/password sign-in remains available.

The platform session must be connected before WhatsApp OTP can be sent.
Requests are rate-limited per phone number, and unknown or already-used phone
numbers receive a generic code-request response.

## Operational boundaries

- Do not copy QR codes, auth keys, or Baileys session data into logs or tickets.
- Keep each tenant's session isolated; platform OTP credentials are separate.
- Revoke the consent record when the recipient opts out.
- The sender uses WhatsApp Web through Baileys, not the official WhatsApp
  Business Platform. It may disconnect or change behavior; no Cloud API
  fallback is configured.
- Run this session manager in one API process. Multiple replicas require
  distributed session ownership before they may share this database.
- The queue retries transient failures a bounded number of times. If a process
  stops after WhatsApp accepted a message but before its status was saved, a
  retry can still produce a duplicate; idempotency prevents duplicate queue
  records, not every possible provider-side duplicate.

## Verification

```bash
npm run build --prefix apps/api
node --test tests/regression/whatsapp_baileys_scaffold.test.cjs
cd apps/web && npx tsc --noEmit --incremental false
```

# WhatsApp Baileys scaffold

The project's package security policy currently blocks Baileys. The application therefore
does **not** install or use Baileys, create WhatsApp Web sessions, display QR codes, send or
receive messages, or deliver login verification codes over WhatsApp. This implementation
does not use Meta Cloud as a fallback.

## Available API

`GET /api/whatsapp/readiness` is tenant-authenticated and restricted to
`OWNER`, `ADMIN`, or `TENANT_OWNER`. It returns the real capability state:

```json
{
  "available": false,
  "integration": "baileys",
  "state": "blocked",
  "reason": "package_security_policy",
  "configured": false,
  "capabilities": {
    "linkSession": false,
    "receiveMessages": false,
    "sendMessages": false,
    "sendMedia": false,
    "deliverVerificationCodes": false
  }
}
```

`POST /api/whatsapp/messages` is reserved as the future API contract. It requires either
a tenant manager JWT or an unexpired live API key with `whatsapp:send`, plus an
`Idempotency-Key` with 8–128 safe characters. It **always returns HTTP 503**
(`WHATSAPP_TRANSPORT_BLOCKED`) while the transport is blocked. It does not enqueue data,
write a pretend delivery record, contact WhatsApp, or fall back to another provider.

```http
POST /api/whatsapp/messages
x-api-key: <live tenant key with whatsapp:send>
Idempotency-Key: order-reminder-1042
Content-Type: application/json

{"to":"+966500000000","type":"text","text":"Your appointment is tomorrow"}
```

Image and document request shapes, consent, templates, API limits, and media limits are
**not yet implemented**. Never interpret a 503 response as queued or sent. Login through
a phone number/WhatsApp code is also unavailable; do not enable phone-only registration
until a permitted, verified delivery provider exists.

Do not bypass package-security blocks or install Baileys from another registry or source.
If the security policy changes, review the dependency and account/platform rules first,
then implement session isolation, QR lifecycle, reconnect handling, data encryption,
opt-in/opt-out, bounded rate limits, media validation, and production end-to-end testing.
There are no active WhatsApp sessions or delivery records to clean up.

## Checks

```bash
npm run build --prefix apps/api
node --test tests/regression/whatsapp_baileys_scaffold.test.cjs
cd apps/web && npx tsc --noEmit --incremental false
```

---
name: WhatsApp number ownership
description: User-approved Baileys channel choice and division between tenant messages and platform verification codes.
---

Use Baileys through QR for this integration, not Meta Cloud API as a fallback.
The user chose “رقم مستقل لكل مؤسسة” for organization messages and
“برقم منصة إضافي” for verification before account creation.

**Why:** Organization API messages must use that organization's own linked
number, while a new registrant has no organization session yet. The user
explicitly selected an additional platform number for that case.

**How to apply:** Keep tenant send permissions and session ownership separate
from the administrator-managed platform OTP sender. Do not silently use the
platform number for tenant business messages or change the provider.

For automatic WhatsApp replies, accept only supported direct text messages and
require an active, tenant-scoped recipient consent. Honor opt-out before any AI
call or reply. Keep each external contact's conversation isolated by both
tenant and phone, without creating an authenticated account for that contact.

**Why:** An incoming message is not blanket permission for future messages, and
shared or login-capable contact identities could expose another conversation.

**How to apply:** Preserve these boundaries when adding WhatsApp media, voice,
inbox, or follow-up messaging features.

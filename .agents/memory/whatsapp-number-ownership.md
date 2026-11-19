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

For WhatsApp automation, reply only to a direct inbound chat when that number's
auto-reply setting is enabled. Forward inbound messages only to the configured
administrator numbers; never initiate follow-up messages. Persist STOP/إلغاء
opt-outs and honor them before forwarding or calling AI. Keep each external
contact isolated by tenant and phone, without creating an authenticated account.

**Why:** The user asked each connected number to answer incoming chats and relay
their messages to configured administrators, while avoiding unsolicited follow-ups.

**How to apply:** Treat each inbound message as permission to answer that turn
only. Do not send later messages without a new inbound message or separate
recorded consent; keep opt-outs and tenant boundaries authoritative.

Each Baileys session must be owned by only one application runtime at a time.
Treat `connectionReplaced` as a competing-runtime signal, not a user logout:
preserve encrypted credentials and Signal keys unless WhatsApp reports a real
logout or an administrator explicitly disconnects.

**Why:** Development and production runtimes may share the same database, and
Baileys will replace one socket when the same account connects elsewhere.

**How to apply:** Use a database-backed expiring lease per session scope; only
the lease owner may restore credentials, persist session changes, or disconnect.

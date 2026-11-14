---
name: Phone enrollment and embedded product scope
description: User requirements for phone-first onboarding and embedding the complete tenant product in partner systems.
---

Phone numbers remain the primary identity and sign-in method. New-account
onboarding must show country/phone selection first, then WhatsApp verification,
then the remaining account fields only after verification succeeds. Lack of a
Thanarah account must not itself suppress sending a code.

**Why:** The user explicitly requested permanent reliance on mobile identity
and verification before completing account details.

**How to apply:** Keep email/password optional or an alternative, preserve
abuse limits and verified-phone ownership, and do not expose enrollment fields
as prerequisites to requesting or verifying a code.

The requested integration type is “ربط نظام ثناره ai”. The user selected
“ثنارة كاملة داخل نظامهم”, not a headless API or separately installed copy,
and requested a distinct organization for each person, particularly for
WhatsApp linking and institutional integrations.

**Why:** The intended partner experience includes the complete existing tenant
product inside the partner system, with independent institutional data and
WhatsApp identity.

**How to apply:** Reuse tenant pages and preserve authorization and isolation.
Do not interpret complete embedding as permission to expose global platform
administration or other tenants' data. Preserve the separately approved
platform OTP sender and tenant-specific WhatsApp senders.

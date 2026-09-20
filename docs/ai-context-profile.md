# Conversation UX and AI Context Profile Foundation

Date: 2026-09-20

## Scope

This phase adds a foundation for personalized conversation without replacing
Thanarah Core as the source of truth. It does not add web search, agents, tool
calling, external providers, Qdrant production activation, or Phase 3 work.

## Data flow

```text
Conversation
    ├── deterministic short title
    └── pinned state
          ↓
Conversation history
          ↓
Evidence-only topic signals
          ↓
AI Context Profile
          ↓
Personalized suggestions + optional AI prompt context
```

## Conversation boundaries

- Conversations are queried by both `tenantId` and `userId`.
- `GET`, title update, pin/unpin, delete, and message reads verify the same
  tenant/user ownership.
- Pinned conversations sort before recent conversations and are shown in a
  separate `Pinned` section.
- Titles are generated locally from the first useful user message. The
  operation is asynchronous relative to the first streamed response.
- Title generation removes common question prefixes and redacts email addresses
  and phone-like values. If no safe title remains, it uses `محادثة جديدة`.
- No external model is called to create titles.

## AI Context Profile boundaries

Profiles are stored in a dedicated `context_profiles` collection with a unique
`tenantId + userId` identity. `organizationId` is set to the tenant identity so
the data boundary is explicit:

```text
tenantId / organizationId
└── userId
    └── AI Context Profile
```

The profile stores only bounded, useful context:

- organization industry and specialization
- explicit response language and style
- explicit focus areas
- recent and frequent topic labels derived from keyword evidence
- recent activity labels, not raw conversation transcripts
- optional additional customer instructions

No raw user message is stored in the profile. Topic labels become frequent only
after repeated evidence. Unknown or insufficient context returns `mode=welcome`
with no personalized suggestions.

Profile operations are authenticated and use the current user's tenant and user
identity from the JWT. The API never accepts a tenant or user identifier from
the browser for these routes.

## Suggestions

Suggestions are deterministic and generated from:

1. repeated topic evidence,
2. recent topic labels,
3. explicitly selected focus areas.

If all three are empty, the chat home shows a welcome state and neutral tips.
The onboarding banner is dismissible, does not block chat, and can be reopened
through `/settings/intelligence`.

Suggestions are UI prompts, not factual claims. The assistant must not say that
it knows a user or organization unless the corresponding context is explicitly
stored.

## AI prompt integration

NestJS loads the scoped profile in parallel with conversation and tenant data,
then sends a bounded `contextProfile` object to the local AI engine. The Python
router labels this as configured context and instructs the model not to infer
facts outside it.

The exact response cache fingerprint includes `contextProfile`. Cache reuse
remains disabled whenever mutable memory or RAG is enabled.

## API surface

Authenticated routes:

- `GET /api/context-profile/me`
- `PUT /api/context-profile/me`
- `DELETE /api/context-profile/me`
- `GET /api/context-profile/suggestions`
- `POST /api/conversations/:id/pin`

## Verification targets

The regression suite covers:

- title/pin routes and tenant/user scoping
- profile unique identity and CRUD boundaries
- welcome versus personalized suggestion modes
- context profile propagation into AI prompt context
- context-aware cache fingerprinting
- existing streaming first-token, incremental chunk, done, and abort behavior
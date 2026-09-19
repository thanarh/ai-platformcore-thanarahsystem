# Thanarah AI

**An independent AI infrastructure and intelligence layer for the Thanarah ecosystem.**

## Architecture

```
apps/
  web/          — Next.js 15.5.25 frontend (port 5000)
  api/          — NestJS backend API (port 3001)
services/
  ai-engine/    — Python FastAPI AI engine (port 8000)
```

## How to Run

The **Start application** workflow runs:

```bash
bash start-dev.sh
```

This starts the web app, API, AI engine, and local Ollama service. It derives the
API's development JWT and encryption values from the `SESSION_SECRET` stored in
Replit Secrets, without printing or copying the secret. On each start it also
restores the root, web, API, and Python dependencies from the repository's
lockfiles and requirements file, so the workflow works from a fresh import.

To run the application services individually after providing their required
environment variables:
```bash
npm run dev:web     # Next.js on port 5000
npm run dev:api     # NestJS on port 3001
npm run dev:ai      # FastAPI AI engine on port 8000
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Next.js Web | 5000 | Frontend + API proxy |
| NestJS API | 3001 | Business logic, auth, data |
| Python AI Engine | 8000 | AI routing, RAG, memory |

## Environment Variables

All credentials are stored as Replit Secrets / environment variables. See `.env.example` for the full list. Never hardcode credentials.

Key variables:
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — JWT signing secret
- `JWT_REFRESH_SECRET` — JWT refresh token secret
- `ENCRYPTION_KEY` — AES-256 encryption key for provider credentials
- `AI_ENGINE_URL` — URL of the Python AI engine

## Build Notes

- **Production build**: always run with `NODE_ENV=production`. Replit sets `NODE_ENV=development` by default, which causes Next.js to use its dev RSC runtime during `npm run build`, producing false `undefined.env` prerender errors.
- **Next.js version**: pinned to the latest safe 15.x release. Next.js 16.3.0 previously caused `/_global-error` prerendering failures in this app, so major upgrades require a clean production build check before adoption.
- **MongoDB**: not yet connected; Atlas IP whitelist must include the Replit container IP. NestJS starts fine without it via `lazyConnection: true`.

## User Preferences

- Arabic-first design with excellent RTL support
- Premium enterprise SaaS visual style
- Thanarah green (#1a5f3f / #2d8a5e) color palette
- Never expose internal AI model/provider architecture to end users
- Multi-tenant: every record scoped to tenantId

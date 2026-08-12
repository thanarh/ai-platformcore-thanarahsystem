---
name: Thanarah AI project overview
description: Key architecture decisions and file layout for the Thanarah AI monorepo
---

## Structure
- `apps/web/` — Next.js 15.2.9 (port 5000), Arabic RTL, Thanarah green palette (#2d8a5e)
- `apps/api/` — NestJS (port 3001), global prefix `/api`, JWT auth, Mongoose
- `services/ai-engine/` — FastAPI (port 8000), Intelligence Router, RAG pipeline, Motor

## Key decisions
- Next.js proxies `/api/*` → NestJS via `next.config.js` rewrites
- NestJS uses `MongooseModule.forRoot` with `lazyConnection: true` (non-blocking startup)
- All env vars stored via Replit secrets; SESSION_SECRET set
- AI engine degrades gracefully when MongoDB unavailable (fallback backend always registered)
- Python AI engine: TF-IDF hash vectors for dev embeddings (swap out for real embeddings in prod)

## Build quirks
- **NODE_ENV=production required for build**: Replit sets NODE_ENV=development; Next.js then uses its dev RSC runtime during `npm run build` which has a different (buggy) `_fromJSON` behavior causing `undefined.env` prerender errors on all dashboard pages. Fix is baked into `apps/web/package.json` build script: `NODE_ENV=production next build`.
- **Next.js 16 build bug**: Next.js 16.3.0 has a confirmed bug where `/_global-error` prerendering fails with `Cannot read properties of null (reading 'useContext')` for ALL apps (even minimal ones). Downgraded to 15.2.9. Do NOT upgrade to 16.x until this is fixed upstream.
- **`force-dynamic` in client components**: `export const dynamic = 'force-dynamic'` added to dashboard pages is currently inert (client components in Next.js 15 still get prerendered as static). Pages work correctly regardless because auth is enforced client-side.

**Why lazyConnection:** NestJS Mongoose's `forRootAsync` blocks startup until MongoDB connects; `lazyConnection: true` on `forRoot` skips `asPromise()` so the API starts immediately and buffers operations.

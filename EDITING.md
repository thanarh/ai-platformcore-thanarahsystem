# Thanarah AI — Editing Guide

The repository is prepared at `/home/ubuntu/ai-platformcore-thanarahsystem`.

## Project structure

| Area | Location | Development port |
| --- | --- | --- |
| Next.js web application | `apps/web` | `5000` |
| NestJS API | `apps/api` | `3001` |
| Thanarah Intelligence service | `services/ai-engine` | `8000` |

The root `start-dev.sh` script starts the complete development environment. Production deployments use `render-build.sh` and `render-start.sh`, which verify the internal intelligence and API services before exposing the web application.

## Start editing

Open a terminal in the repository:

```bash
cd /home/ubuntu/ai-platformcore-thanarahsystem
```

Copy `.env.example` to `.env` and configure the database and authentication secrets. Never commit `.env` or paste production secrets into source files.

Start the complete development environment:

```bash
./start-dev.sh
```

To work on one service at a time:

```bash
cd apps/web && npm run dev
cd apps/api && npm run start:dev
cd services/ai-engine && PYTHONPATH=../../.pythonlibs/lib/python3.12/site-packages:. python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The web application is available at `http://localhost:5000`, the API at `http://localhost:3001`, and Thanarah Intelligence at `http://localhost:8000`.

## Verification commands

```bash
npm ci --prefix apps/web --include=dev --no-audit --no-fund
npm ci --prefix apps/api --include=dev --no-audit --no-fund
npm run build --prefix apps/web
npm run build --prefix apps/api
PYTHONPATH="$PWD/.pythonlibs/lib/python3.12/site-packages:$PWD/services/ai-engine" python3 -m compileall -q services/ai-engine
```

The authenticated regression script `scripts/e2e_ai_knowledge_test.py` validates OWNER login, intelligence readiness, knowledge ingestion, search, and streamed chat. It requires test credentials through protected environment or temporary files and must never contain production secrets.

## Main editing locations

Frontend pages and components are under `apps/web/src`. Backend modules, controllers, and services are under `apps/api/src`. Intelligence routes, retrieval, memory, and response services are under `services/ai-engine/app`.

Do not commit `.env`, generated build directories, runtime logs, credentials, or local dependency folders. Review `git status` and run the production builds before every deployment.

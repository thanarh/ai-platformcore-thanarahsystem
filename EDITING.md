# Thanarah AI — Editing Guide

The repository is prepared at `/home/ubuntu/ai-platformcore-thanarahsystem`.

## Project structure

| Area | Location | Development port |
| --- | --- | --- |
| Next.js web application | `apps/web` | `5000` |
| NestJS API | `apps/api` | `3001` |
| Python AI engine | `services/ai-engine` | `8000` |

The root `start-dev.sh` script is intended to start all development services together. The project includes a portable Ollama launcher and a bundled Ollama executable, so the default generation path can run locally without paid API calls. The default model is `qwen2.5:0.5b`; it is downloaded once into `.ollama/models` when Ollama starts.

The AI engine now uses a local-first stack:

| Capability | Free implementation | Fallback |
| --- | --- | --- |
| Text generation | Ollama with an open model | Graceful Arabic/English fallback |
| Semantic embeddings | Sentence Transformers with a multilingual model | Deterministic hashing embeddings |
| Document knowledge | PDF, DOCX, Markdown, and text parsing with chunked RAG | Empty knowledge results when the database is unavailable |
| Vector retrieval | Cosine similarity over stored embeddings | Same retrieval contract; FAISS is available as an optional future accelerator |

Paid or external providers are now explicitly opt-in through `ALLOW_EXTERNAL_PROVIDERS=true`; the default is free-local operation.

## Start editing

Open a terminal in the repository:

```bash
cd /home/ubuntu/ai-platformcore-thanarahsystem
```

The environment template has been copied to `.env`. Fill in any values needed for the feature being edited. In particular, database and authentication variables are blank placeholders in the template, so login and persistence features may require a MongoDB connection and generated secrets.

To start the full development environment:

```bash
./start-dev.sh
```

To install the optional stronger local embedding stack:

```bash
python3 -m pip install --target .pythonlibs/lib/python3.12/site-packages -r services/ai-engine/requirements-optional.txt
```

To work on one service at a time:

```bash
cd apps/web && npm run dev
cd apps/api && npm run start:dev
cd services/ai-engine && PYTHONPATH=../../.pythonlibs/lib/python3.12/site-packages:. python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The web application is available at `http://localhost:5000`, the API at `http://localhost:3001`, and the AI engine at `http://localhost:8000` when the services are running.

## Verification commands

The dependency installation and production builds were verified successfully:

```bash
npm ci --no-audit --no-fund
npm ci --prefix apps/web --no-audit --no-fund
npm ci --prefix apps/api --no-audit --no-fund
npm run build --prefix apps/web
npm run build --prefix apps/api
PYTHONPATH="$PWD/.pythonlibs/lib/python3.12/site-packages:$PWD/services/ai-engine" python3 -m compileall -q services/ai-engine
```

The three lockfiles contained Replit-only package tarball URLs, so those URLs were normalized to the public npm registry to make installation work outside Replit. Package versions were not changed.

## Main editing locations

Frontend pages and UI components are under `apps/web/app` and `apps/web/components`. Backend modules, controllers, and services are under `apps/api/src`. AI-engine routes and providers are under `services/ai-engine`.

Do not commit `.env`, generated build directories, model files, or local dependency folders. Review `git status` before committing changes.

## Repository reference

The source repository is [thanarh/ai-platformcore-thanarahsystem](https://github.com/thanarh/ai-platformcore-thanarahsystem).

## References

[1]: https://github.com/thanarh/ai-platformcore-thanarahsystem "Thanarah AI source repository"

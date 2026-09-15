# Free AI Stack Research Notes

## Verified components

| Component | Role | Key finding | Source |
|---|---|---|---|
| Ollama | Local LLM serving | Provides a local API at `http://localhost:11434/api` and official Python/JavaScript libraries. Local models can run without per-request API fees. | [1] |
| Sentence Transformers | Text/image/audio/video embeddings and reranking | Supports embeddings, rerankers, sparse encoders, and multi-vector encoders; the documentation recommends Python 3.10+ and includes local model examples. | [2] |
| FAISS | Local vector similarity search | Provides efficient dense-vector similarity search, multiple index types, persistence, and Python bindings. | [3] |
| pgvector | Database-backed vector search | Adds exact and approximate vector search to PostgreSQL, including cosine distance, HNSW, and IVFFlat. It is a future option if the project moves from MongoDB to PostgreSQL. | [4] |

## Proposed zero-cost architecture

The first implementation should keep the current provider registry and add a local-first path: Ollama for generation, Sentence Transformers for embeddings, and a FAISS-backed local index for development and small deployments. The system should keep the existing fallback backend and optional BYOK providers, but never require them for the basic chat experience.

The application should expose provider health and model selection in the existing AI settings screen, add document ingestion and retrieval status to the knowledge area, and return source citations from RAG responses. For production scale, the local FAISS index can later be replaced by a database vector index without changing the public chat contract.

## References

[1]: https://docs.ollama.com/api/introduction "Ollama API Introduction"
[2]: https://sbert.net/ "Sentence Transformers Documentation"
[3]: https://faiss.ai/index.html "Faiss Documentation"
[4]: https://github.com/pgvector/pgvector "pgvector Repository"

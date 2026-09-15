"""Local, cost-free embedding service with graceful fallback.

The service prefers Sentence Transformers when installed and falls back to a
stable hashing embedding so development does not fail when the model package or
model files are not available yet.
"""
from __future__ import annotations

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self) -> None:
        self.provider = settings.embedding_provider.lower()
        self.model_name = settings.embedding_model
        self._model: Any = None
        self._model_error: Optional[str] = None
        self._dimension = settings.embedding_fallback_dimension

    def _load_model(self) -> Any:
        if self._model is not None or self._model_error is not None:
            return self._model
        if self.provider not in {"sentence-transformers", "sentence_transformers", "auto"}:
            self._model_error = f"Unsupported embedding provider: {self.provider}"
            return None
        try:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(
                self.model_name,
                device=settings.embedding_device,
            )
            dimension_getter = getattr(self._model, "get_embedding_dimension", self._model.get_sentence_embedding_dimension)
            self._dimension = int(dimension_getter())
            logger.info("Loaded local embedding model %s (%s dimensions)", self.model_name, self._dimension)
        except Exception as exc:  # optional dependency/model download should never break the API
            self._model_error = str(exc)
            logger.warning("Sentence Transformers unavailable; using hashing embeddings: %s", exc)
        return self._model

    @staticmethod
    def _hash_embedding(text: str, dimension: int) -> List[float]:
        tokens = re.findall(r"[\w\u0600-\u06ff]+", text.lower())
        vector = np.zeros(dimension, dtype=np.float32)
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % dimension
            vector[index] += 1.0
        norm = float(np.linalg.norm(vector))
        if norm:
            vector /= norm
        return vector.tolist()

    def encode(self, texts: str | List[str]) -> List[float] | List[List[float]]:
        values = [texts] if isinstance(texts, str) else texts
        model = self._load_model()
        if model is not None:
            embeddings = model.encode(
                values,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            output = np.asarray(embeddings, dtype=np.float32).tolist()
        else:
            output = [self._hash_embedding(value, self._dimension) for value in values]
        return output[0] if isinstance(texts, str) else output

    def info(self) -> Dict[str, Any]:
        loaded = self._model is not None
        package_available = False
        if not loaded and self.provider in {"sentence-transformers", "sentence_transformers", "auto"}:
            try:
                import importlib.util
                package_available = importlib.util.find_spec("sentence_transformers") is not None
            except Exception:
                package_available = False
        return {
            "provider": "sentence-transformers" if loaded else ("sentence-transformers-available" if package_available else "hashing-fallback"),
            "configuredProvider": self.provider,
            "model": self.model_name if (loaded or package_available) else None,
            "dimension": self._dimension,
            "device": settings.embedding_device,
            "ready": True,
            "modelLoaded": loaded,
            "fallbackReason": self._model_error,
        }


embedding_service = EmbeddingService()

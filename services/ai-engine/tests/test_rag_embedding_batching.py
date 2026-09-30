import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, call, patch

from app.config import settings
from app.rag.pipeline import EmbeddingModel, RAGPipeline


class RAGEmbeddingBatchingTests(unittest.IsolatedAsyncioTestCase):
    async def test_ingest_embeds_chunks_in_bounded_batches(self):
        chunks = ["first", "second", "third", "fourth", "fifth"]
        collection = SimpleNamespace(
            delete_many=AsyncMock(),
            insert_one=AsyncMock(),
        )
        database = SimpleNamespace(knowledge_chunks=collection)
        pipeline = RAGPipeline()
        pipeline.parser = SimpleNamespace(parse=Mock(return_value="document text"))
        pipeline.chunker = SimpleNamespace(chunk=Mock(return_value=chunks))
        encode = Mock(side_effect=lambda texts: [[float(len(text))] for text in texts])
        pipeline.embedder = SimpleNamespace(encode=encode)

        with (
            patch("app.rag.pipeline.get_db", return_value=database),
            patch("app.rag.pipeline.qdrant_store", SimpleNamespace(enabled=False)),
            patch(
                "app.response_cache.response_cache_service.invalidate_tenant",
                new_callable=AsyncMock,
            ) as invalidate_tenant,
            patch.object(settings, "rag_embedding_batch_size", 2),
        ):
            stored = await pipeline.ingest(
                source_id="document-1",
                tenant_id="tenant-1",
                content=b"document text",
            )

        self.assertEqual(stored, len(chunks))
        self.assertEqual(
            encode.call_args_list,
            [
                call(chunks[0:2]),
                call(chunks[2:4]),
                call(chunks[4:5]),
            ],
        )
        documents = [entry.args[0] for entry in collection.insert_one.call_args_list]
        self.assertEqual([document["content"] for document in documents], chunks)
        self.assertEqual(
            [document["embedding"] for document in documents],
            [[float(len(chunk))] for chunk in chunks],
        )
        self.assertEqual(
            [document["chunkIndex"] for document in documents],
            list(range(len(chunks))),
        )
        invalidate_tenant.assert_awaited_once_with("tenant-1")

    def test_embedding_model_forwards_batches_to_local_service(self):
        texts = ["first", "second"]
        vectors = [[1.0, 0.0], [0.0, 1.0]]

        with patch("app.rag.pipeline.embedding_service.encode", return_value=vectors) as encode:
            self.assertEqual(EmbeddingModel().encode(texts), vectors)

        encode.assert_called_once_with(texts)


if __name__ == "__main__":
    unittest.main()
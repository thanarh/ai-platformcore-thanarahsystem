import unittest

from app.rag.qdrant_store import QdrantStore, _point_id
from app.rag.reranker import LocalReranker


class RAGPhase2ATests(unittest.TestCase):
    def test_point_ids_are_idempotent_and_tenant_scoped(self):
        first = _point_id("tenant-a", "doc-1", "v1", "chunk-0")
        same = _point_id("tenant-a", "doc-1", "v1", "chunk-0")
        other_tenant = _point_id("tenant-b", "doc-1", "v1", "chunk-0")
        other_version = _point_id("tenant-a", "doc-1", "v2", "chunk-0")
        self.assertEqual(first, same)
        self.assertNotEqual(first, other_tenant)
        self.assertNotEqual(first, other_version)

    def test_qdrant_filter_always_contains_tenant(self):
        store = QdrantStore()
        query = store._tenant_filter("tenant-a", [store._match("status", "active")])
        self.assertEqual(query["must"][0], {"key": "tenantId", "match": {"value": "tenant-a"}})
        self.assertIn({"key": "status", "match": {"value": "active"}}, query["must"])

    def test_lexical_reranker_prefers_matching_content(self):
        reranker = LocalReranker()
        self.assertGreater(
            reranker._lexical_score("معلومات الحجز", "معلومات الحجز والسياسات"),
            reranker._lexical_score("معلومات الحجز", "مقالة عامة عن الطقس"),
        )


if __name__ == "__main__":
    unittest.main()
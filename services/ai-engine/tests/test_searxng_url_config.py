import unittest

from app.config import Settings


class SearXNGURLConfigTests(unittest.TestCase):
    def test_render_private_hostport_gets_http_scheme(self):
        configured = Settings(searxng_url="searxng-internal:8080")

        self.assertEqual(configured.searxng_url, "http://searxng-internal:8080")

    def test_explicit_scheme_is_preserved_and_trailing_slash_removed(self):
        configured = Settings(searxng_url="https://search.example.test/")

        self.assertEqual(configured.searxng_url, "https://search.example.test")

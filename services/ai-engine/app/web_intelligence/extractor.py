from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Optional


@dataclass(frozen=True)
class ExtractedPage:
    url: str
    title: str
    headings: tuple[str, ...]
    paragraphs: tuple[str, ...]
    content: str
    domain: str
    published_at: Optional[str] = None


class _ReadableHTMLParser(HTMLParser):
    _IGNORED = {
        "script",
        "style",
        "noscript",
        "nav",
        "footer",
        "header",
        "aside",
        "form",
        "svg",
        "template",
    }
    _TEXT_TAGS = {"title", "h1", "h2", "h3", "p", "li", "article", "main", "blockquote"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.meta_titles: list[str] = []
        self.meta_descriptions: list[str] = []
        self.headings: list[str] = []
        self.paragraphs: list[str] = []
        self._buffer: list[str] = []
        self._tag_stack: list[str] = []
        self._ignored_depth = 0
        self.published_at: Optional[str] = None
        self.structured_headline: Optional[str] = None
        self.structured_published_at: Optional[str] = None
        self.structured_article_body: Optional[str] = None
        self._jsonld_buffer: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag = tag.casefold()
        self._tag_stack.append(tag)
        attrs_dict = {
            str(key).casefold(): str(value or "")
            for key, value in attrs
            if key is not None
        }
        if tag in self._IGNORED:
            self._ignored_depth += 1
        if tag == "script" and attrs_dict.get("type", "").casefold().split(";", 1)[0].strip() == "application/ld+json":
            self._jsonld_buffer = []
        if tag == "meta":
            key = attrs_dict.get("property") or attrs_dict.get("name") or attrs_dict.get("itemprop")
            content = _clean_text(attrs_dict.get("content", ""))
            if content and key:
                key = key.casefold()
                if key in {"description", "og:description", "twitter:description"}:
                    self.meta_descriptions.append(content[:2000])
                elif key in {"og:title", "twitter:title"}:
                    self.meta_titles.append(content[:300])
            if key and key.casefold() in {
                "article:published_time",
                "date",
                "pubdate",
                "publishdate",
                "datepublished",
            }:
                self.published_at = attrs_dict.get("content") or None
        if tag in self._TEXT_TAGS and self._ignored_depth == 0:
            self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag == "script" and self._jsonld_buffer is not None:
            try:
                structured_data = json.loads("".join(self._jsonld_buffer))
                self._read_structured_data(structured_data)
            except (json.JSONDecodeError, TypeError):
                pass
            self._jsonld_buffer = None
        if tag in self._TEXT_TAGS and self._ignored_depth == 0:
            text = _clean_text(" ".join(self._buffer))
            if text:
                if tag == "title":
                    self.title_parts.append(text)
                elif tag in {"h1", "h2", "h3"}:
                    self.headings.append(text)
                else:
                    self.paragraphs.append(text)
            self._buffer = []
        if tag in self._IGNORED and self._ignored_depth:
            self._ignored_depth -= 1
        if self._tag_stack:
            self._tag_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._jsonld_buffer is not None:
            self._jsonld_buffer.append(data)
            return
        if self._ignored_depth == 0 and any(tag in self._TEXT_TAGS for tag in self._tag_stack):
            self._buffer.append(data)

    def _read_structured_data(self, value: object) -> None:
        if isinstance(value, list):
            for item in value:
                self._read_structured_data(item)
            return
        if not isinstance(value, dict):
            return

        raw_type = value.get("@type", [])
        types = [raw_type] if isinstance(raw_type, str) else raw_type
        is_article = isinstance(types, list) and any(
            str(item).casefold().endswith(("article", "blogposting", "report"))
            for item in types
        )
        body = value.get("articleBody")
        if is_article and isinstance(body, str) and body.strip():
            cleaned_body = _clean_structured_body(body)
            if cleaned_body and not self.structured_article_body:
                self.structured_article_body = cleaned_body
                headline = value.get("headline") or value.get("name")
                if isinstance(headline, str) and headline.strip():
                    self.structured_headline = _clean_text(headline)[:300]
                published = value.get("datePublished")
                if isinstance(published, str) and published.strip():
                    self.structured_published_at = published.strip()

        for nested in value.values():
            if isinstance(nested, (dict, list)):
                self._read_structured_data(nested)


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _clean_structured_body(value: str) -> str:
    without_markup = re.sub(r"<[^>]*>", " ", value)
    decoded = html.unescape(without_markup)
    paragraphs = [_clean_text(part) for part in re.split(r"\n+", decoded)]
    return "\n\n".join(part for part in paragraphs if part)


def extract_html(content: bytes, url: str, *, content_type: str = "text/html") -> ExtractedPage:
    parser = _ReadableHTMLParser()
    if content_type == "text/plain":
        text = content.decode("utf-8", errors="replace")
        paragraphs = tuple(item for item in (_clean_text(line) for line in text.splitlines()) if item)
        title = paragraphs[0][:300] if paragraphs else ""
        body = "\n\n".join(paragraphs)
        return ExtractedPage(url, title, (), paragraphs, body, url.split("/")[2], None)
    parser.feed(content.decode("utf-8", errors="replace"))
    parser.close()
    paragraphs = tuple(dict.fromkeys(parser.paragraphs))
    headings = tuple(dict.fromkeys(parser.headings))
    title = (
        parser.structured_headline
        if parser.structured_headline
        else parser.title_parts[0][:300]
        if parser.title_parts
        else parser.meta_titles[0]
        if parser.meta_titles
        else headings[0][:300]
        if headings
        else ""
    )
    if parser.structured_article_body:
        paragraphs = tuple(
            part
            for part in (_clean_text(item) for item in parser.structured_article_body.split("\n\n"))
            if part
        )
        evidence = tuple(
            dict.fromkeys((*parser.meta_descriptions[:1], *paragraphs))
        )
    else:
        evidence = tuple(dict.fromkeys((*parser.meta_descriptions, *headings, *paragraphs)))
    if not evidence and title:
        evidence = (title,)
    body = "\n\n".join(evidence)
    return ExtractedPage(
        url=url,
        title=title,
        headings=headings,
        paragraphs=paragraphs,
        content=body[:12000],
        domain=url.split("/")[2].split("@")[-1].split(":")[0],
        published_at=parser.published_at or parser.structured_published_at,
    )
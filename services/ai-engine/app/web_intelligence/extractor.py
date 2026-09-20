from __future__ import annotations

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
    _IGNORED = {"script", "style", "noscript", "nav", "footer", "header", "form", "svg", "template"}
    _TEXT_TAGS = {"title", "h1", "h2", "h3", "p", "li", "article", "main", "blockquote"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.headings: list[str] = []
        self.paragraphs: list[str] = []
        self._buffer: list[str] = []
        self._tag_stack: list[str] = []
        self._ignored_depth = 0
        self.published_at: Optional[str] = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag = tag.casefold()
        self._tag_stack.append(tag)
        if tag in self._IGNORED:
            self._ignored_depth += 1
        if tag == "meta":
            attrs_dict = {
                str(key).casefold(): str(value or "")
                for key, value in attrs
                if key is not None
            }
            key = attrs_dict.get("property") or attrs_dict.get("name")
            if key and key.casefold() in {"article:published_time", "date", "pubdate", "publishdate"}:
                self.published_at = attrs_dict.get("content") or None
        if tag in self._TEXT_TAGS and self._ignored_depth == 0:
            self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
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
        if self._ignored_depth == 0 and self._tag_stack and self._tag_stack[-1] in self._TEXT_TAGS:
            self._buffer.append(data)


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


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
    body = "\n\n".join((*headings, *paragraphs))
    return ExtractedPage(
        url=url,
        title=parser.title_parts[0][:300] if parser.title_parts else (headings[0][:300] if headings else ""),
        headings=headings,
        paragraphs=paragraphs,
        content=body[:12000],
        domain=url.split("/")[2].split("@")[-1].split(":")[0],
        published_at=parser.published_at,
    )
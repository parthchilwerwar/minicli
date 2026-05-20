"""
Direct web search tool — DuckDuckGo instant answer + HTML scrape fallback.
"""
from __future__ import annotations

import re

import httpx
from langchain_core.tools import tool


@tool
async def web_search(query: str) -> str:
    """Search the web using DuckDuckGo. Returns relevant results for any topic."""
    # Try instant answer API first
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            )
            data = resp.json()
            parts: list[str] = []

            if data.get("AbstractText"):
                parts.append(f"**{data.get('Heading', 'Result')}**: {data['AbstractText']}")
            if data.get("Answer"):
                parts.append(f"Answer: {data['Answer']}")

            for topic in (data.get("RelatedTopics") or [])[:5]:
                if isinstance(topic, dict) and topic.get("Text"):
                    url = topic.get("FirstURL", "")
                    parts.append(f"• {topic['Text']}" + (f" ({url})" if url else ""))

            if parts:
                return "\n\n".join(parts)
    except Exception:
        pass

    # Fallback: scrape DuckDuckGo HTML lite
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(
                "https://lite.duckduckgo.com/lite/",
                params={"q": query},
                headers={"User-Agent": "Mozilla/5.0 (compatible; minicli/1.0)"},
            )
            html = resp.text
            # Extract result snippets from HTML
            snippets = re.findall(r'<td[^>]*class="result-snippet"[^>]*>(.*?)</td>', html, re.DOTALL)
            links = re.findall(r'<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html)

            results: list[str] = []
            for i, snippet in enumerate(snippets[:5]):
                clean = re.sub(r"<[^>]+>", "", snippet).strip()
                url = links[i][0] if i < len(links) else ""
                title = re.sub(r"<[^>]+>", "", links[i][1]).strip() if i < len(links) else ""
                if clean:
                    entry = f"**{title}**\n{clean}" if title else clean
                    if url:
                        entry += f"\n🔗 {url}"
                    results.append(entry)

            if results:
                return "\n\n---\n\n".join(results)
    except Exception:
        pass

    return f"No results found for '{query}'."


def get_search_tools() -> list:
    """Return web search tools."""
    return [web_search]

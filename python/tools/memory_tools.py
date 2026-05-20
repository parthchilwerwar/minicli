"""
Direct memory tools — operate on ChromaDB without going through the bridge.
"""
from __future__ import annotations

from datetime import datetime, timezone

from langchain_core.tools import tool

from memory.vector_store import get_store


@tool
async def search_memory(query: str, k: int = 5) -> str:
    """Search across all memories, documents, and tasks for relevant information. Use this to recall past conversations, facts, and stored knowledge."""
    store = get_store()
    results = store.search_all(query, k=k)
    if not results:
        return "No relevant memories found."

    parts: list[str] = []
    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        source = meta.get("type", "unknown")
        score = r.get("score", 0)
        content = r["content"][:300]
        parts.append(f"{i}. [{source}] (score: {score}) {content}")
    return "\n\n".join(parts)


@tool
async def save_memory_tool(content: str, memory_type: str = "fact", tags: str = "") -> str:
    """Save a new memory, fact, or note to persistent storage for future retrieval."""
    store = get_store()
    meta = {
        "type": memory_type,
        "source": "agent",
        "tags": tags,
    }
    doc_id = store.add_memory(content, meta)
    return f"Memory saved (id: {doc_id}, type: {memory_type})"


@tool
async def ingest_pdf_tool(file_path: str) -> str:
    """Ingest a PDF file into the knowledge base. The content will be chunked and stored for future retrieval via search_memory."""
    from rag.pdf_ingest import ingest_pdf

    try:
        result = await ingest_pdf(file_path)
        chunks = result.get("chunks_stored", 0)
        name = result.get("file", "unknown")
        pages = result.get("pages", 0)
        if chunks == 0:
            return f"No extractable text found in {name}"
        return f"Ingested {name}: {chunks} chunks from {pages} pages stored in knowledge base"
    except FileNotFoundError as e:
        return str(e)
    except ValueError as e:
        return str(e)


@tool
async def get_tasks(date: str = "") -> str:
    """Get tasks from memory. Optionally filter by date (YYYY-MM-DD)."""
    store = get_store()
    query = f"task due {date}" if date else "current tasks todo"
    results = store.search(query, k=10, collection="tasks")
    if not results:
        return "No tasks found."

    parts: list[str] = []
    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        due = meta.get("due_date", "no date")
        content = r["content"][:200]
        parts.append(f"{i}. [due: {due}] {content}")
    return "\n".join(parts)


@tool
async def memory_stats() -> str:
    """Get statistics about stored memories, documents, and tasks."""
    store = get_store()
    stats = store.get_stats()
    lines = [f"📊 Vector Store Stats:"]
    for name, count in stats.items():
        lines.append(f"  • {name}: {count} entries")
    return "\n".join(lines)


def get_memory_tools() -> list:
    """Return all memory tool functions."""
    return [search_memory, save_memory_tool, ingest_pdf_tool, get_tasks, memory_stats]

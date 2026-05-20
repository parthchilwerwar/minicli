"""
One-time migration from JSON files (graph.json + memories/) to ChromaDB.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from config import MINICLI_DIR, GRAPH_FILE, MEMORIES_DIR
from memory.vector_store import get_store

logger = logging.getLogger("minicli.migration")

MIGRATED_MARKER = MINICLI_DIR / ".migrated"


def _load_graph_nodes() -> list[dict]:
    """Load nodes from the old graph.json file."""
    if not GRAPH_FILE.exists():
        return []
    try:
        data = json.loads(GRAPH_FILE.read_text(encoding="utf-8"))
        return data.get("nodes", [])
    except (json.JSONDecodeError, KeyError):
        logger.warning("Could not parse graph.json — skipping graph migration")
        return []


def _load_memory_entries() -> list[dict]:
    """Walk ~/.minicli/memories/**/*.json and load each entry."""
    if not MEMORIES_DIR.exists():
        return []
    entries: list[dict] = []
    # Also check for index.json first
    index_file = MEMORIES_DIR / "index.json"
    if index_file.exists():
        try:
            idx = json.loads(index_file.read_text(encoding="utf-8"))
            if isinstance(idx, list):
                entries.extend(e for e in idx if isinstance(e, dict) and "title" in e)
                return entries
        except (json.JSONDecodeError, KeyError):
            pass

    # Fallback: walk all JSON files
    for json_file in MEMORIES_DIR.rglob("*.json"):
        if json_file.name == "index.json":
            continue
        try:
            entry = json.loads(json_file.read_text(encoding="utf-8"))
            if isinstance(entry, dict) and "title" in entry:
                entries.append(entry)
        except (json.JSONDecodeError, KeyError):
            continue
    return entries


def run_migration() -> str:
    """Migrate old JSON data into ChromaDB. Idempotent via marker file."""
    if MIGRATED_MARKER.exists():
        return "Already migrated."

    store = get_store()
    graph_count = 0
    memory_count = 0
    task_count = 0

    # ── Migrate graph nodes ──────────────────────────────────────────────
    nodes = _load_graph_nodes()
    for node in nodes:
        label = node.get("label", "")
        content = node.get("content", "")
        text = f"{label}: {content}" if content else label
        if not text.strip():
            continue
        meta = {
            "type": node.get("type", "fact"),
            "source": "graph_migration",
            "tags": ",".join(node.get("tags", [])),
            "original_id": node.get("id", ""),
        }
        store.add_memory(text, meta)
        graph_count += 1

    # ── Migrate memory entries ───────────────────────────────────────────
    entries = _load_memory_entries()
    for entry in entries:
        title = entry.get("title", "")
        summary = entry.get("summary", "")
        text = f"{title}\n{summary}" if summary else title
        if not text.strip():
            continue

        entry_type = entry.get("type", "conversation")
        meta = {
            "type": entry_type,
            "source": entry.get("source", "migration"),
            "tags": ",".join(entry.get("tags", [])),
            "original_id": entry.get("id", ""),
        }
        if entry.get("dueDate"):
            meta["due_date"] = entry["dueDate"]

        store.add_memory(text, meta)
        memory_count += 1

        # Tasks also go into the tasks collection
        if entry_type in ("task", "reminder"):
            store.add_task(text, meta)
            task_count += 1

    # ── Write marker ─────────────────────────────────────────────────────
    MIGRATED_MARKER.write_text(
        f"Migrated at {__import__('datetime').datetime.now().isoformat()}\n"
        f"graph_nodes={graph_count} memories={memory_count} tasks={task_count}\n",
        encoding="utf-8",
    )

    summary = (
        f"Migration complete: {graph_count} graph nodes, "
        f"{memory_count} memories, {task_count} tasks → ChromaDB"
    )
    logger.info(summary)
    return summary

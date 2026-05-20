"""
ChromaDB-backed vector store for minicli memories, documents, and tasks.
Uses sentence-transformers/all-MiniLM-L6-v2 for local, free embeddings.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

# Force HuggingFace stack to use local cache — never phone home.
# The model is already cached at ~/.cache/huggingface/hub/
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("HF_DATASETS_OFFLINE", "1")

import chromadb
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document

from config import CHROMADB_DIR

# ── Embedding model (downloaded once, ~35 MB, runs on CPU) ──────────────────
_EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

COLLECTIONS = ("memories", "documents", "tasks")


class VectorStoreManager:
    """Manages three ChromaDB collections: memories, documents, tasks."""

    def __init__(self) -> None:
        self._client: chromadb.ClientAPI | None = None
        self._embeddings: HuggingFaceEmbeddings | None = None
        self._stores: dict[str, Chroma] = {}

    # ── lifecycle ────────────────────────────────────────────────────────────

    def init(self) -> None:
        """Initialise persistent client and collections."""
        CHROMADB_DIR.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(CHROMADB_DIR))
        self._embeddings = HuggingFaceEmbeddings(
            model_name=_EMBEDDING_MODEL_NAME,
            model_kwargs={"device": "cpu", "local_files_only": True},
            encode_kwargs={"normalize_embeddings": True},
        )
        for name in COLLECTIONS:
            self._stores[name] = Chroma(
                client=self._client,
                collection_name=name,
                embedding_function=self._embeddings,
            )

    def _store(self, collection: str) -> Chroma:
        if collection not in self._stores:
            raise ValueError(f"Unknown collection: {collection}")
        return self._stores[collection]

    # ── writes ───────────────────────────────────────────────────────────────

    def _add(self, text: str, metadata: dict[str, Any], collection: str) -> str:
        doc_id = uuid.uuid4().hex[:12]
        meta = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            **{k: str(v) for k, v in metadata.items()},
        }
        doc = Document(page_content=text, metadata=meta)
        self._store(collection).add_documents([doc], ids=[doc_id])
        return doc_id

    def add_memory(self, text: str, metadata: dict[str, Any] | None = None) -> str:
        return self._add(text, metadata or {}, "memories")

    def add_document(self, text: str, metadata: dict[str, Any] | None = None) -> str:
        return self._add(text, metadata or {}, "documents")

    def add_task(self, text: str, metadata: dict[str, Any] | None = None) -> str:
        return self._add(text, metadata or {}, "tasks")

    # ── reads ────────────────────────────────────────────────────────────────

    def search(
        self, query: str, k: int = 5, collection: str = "memories"
    ) -> list[dict[str, Any]]:
        """Semantic similarity search in a single collection."""
        store = self._store(collection)
        try:
            docs_and_scores = store.similarity_search_with_relevance_scores(query, k=k)
        except Exception:
            return []
        results: list[dict[str, Any]] = []
        for doc, score in docs_and_scores:
            results.append(
                {"content": doc.page_content, "metadata": doc.metadata, "score": round(score, 4)}
            )
        return results

    def search_all(self, query: str, k: int = 5) -> list[dict[str, Any]]:
        """Search across all three collections and merge by score."""
        combined: list[dict[str, Any]] = []
        for coll in COLLECTIONS:
            combined.extend(self.search(query, k=k, collection=coll))
        combined.sort(key=lambda r: r["score"], reverse=True)
        return combined[:k]

    # ── maintenance ──────────────────────────────────────────────────────────

    def delete_old(self, days: int, collection: str = "memories") -> int:
        """Delete entries older than *days*. Returns count deleted."""
        store = self._store(collection)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        try:
            coll = store._collection  # noqa: SLF001  — direct Chroma collection access
            result = coll.get(where={"created_at": {"$lt": cutoff}})
            ids = result.get("ids", [])
            if ids:
                coll.delete(ids=ids)
            return len(ids)
        except Exception:
            return 0

    def get_stats(self) -> dict[str, int]:
        """Return document counts per collection."""
        stats: dict[str, int] = {}
        for name in COLLECTIONS:
            try:
                coll = self._store(name)._collection  # noqa: SLF001
                stats[name] = coll.count()
            except Exception:
                stats[name] = 0
        return stats


# ── Singleton ────────────────────────────────────────────────────────────────

_store: VectorStoreManager | None = None


def init_store() -> VectorStoreManager:
    global _store
    if _store is None:
        _store = VectorStoreManager()
        _store.init()
    return _store


def get_store() -> VectorStoreManager:
    if _store is None:
        return init_store()
    return _store

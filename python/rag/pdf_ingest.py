"""
PDF ingestion — load, chunk, embed, store in ChromaDB 'documents' collection.
Triggered only on explicit user command.

The path is sandboxed to the configured user-facing roots (VAULT_PATH,
DESKTOP_PATH, DOWNLOADS_PATH, NOTES_FOLDER_PATH). This prevents an LLM
prompt-injection from pointing /ingest at e.g. /etc/shadow and dumping its
contents into the searchable vector store.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from config import DESKTOP_PATH, DOWNLOADS_PATH, NOTES_PATH, VAULT_PATH
from memory.vector_store import get_store

logger = logging.getLogger("minicli.pdf_ingest")

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def _allowed_roots() -> list[Path]:
    roots: list[Path] = []
    for raw in (VAULT_PATH, DESKTOP_PATH, DOWNLOADS_PATH, NOTES_PATH):
        if raw:
            try:
                roots.append(Path(raw).expanduser().resolve())
            except Exception:
                continue
    return roots


def _assert_within_allowed(path: Path) -> None:
    roots = _allowed_roots()
    if not roots:
        raise PermissionError(
            "No allowed directories configured. Set VAULT_PATH / DESKTOP_PATH / "
            "DOWNLOADS_PATH / NOTES_FOLDER_PATH in .env to enable PDF ingestion."
        )
    for root in roots:
        try:
            # is_relative_to is 3.9+, manual check for portability
            if path == root or root in path.parents:
                return
        except Exception:
            continue
    raise PermissionError(f"PDF path is outside allowed roots: {path}")


async def ingest_pdf(file_path: str) -> dict:
    """
    Read a PDF, split into chunks, embed each chunk, store in 'documents' collection.
    Returns stats dict.
    """
    path = Path(file_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Not a PDF file: {path.name}")
    _assert_within_allowed(path)

    # Refuse symlinks pointing outside the allowed roots even if the link
    # target resolves there indirectly.
    if path.is_symlink():
        target = Path(os.path.realpath(path))
        _assert_within_allowed(target)

    # Extract text from all pages
    try:
        reader = PdfReader(str(path))
    except Exception as exc:
        logger.error("Failed to parse PDF %s: %s", path, exc)
        return {"chunks_stored": 0, "file": path.name, "error": f"Failed to parse PDF: {exc}"}

    pages_text: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception as exc:
            logger.warning("Failed to extract text from page %d of %s: %s", i + 1, path.name, exc)
            continue
        if text.strip():
            pages_text.append((i + 1, text))

    if not pages_text:
        return {"chunks_stored": 0, "file": path.name, "error": "No extractable text in PDF"}

    # Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    store = get_store()
    total_chunks = 0

    for page_num, page_text in pages_text:
        chunks = splitter.split_text(page_text)
        for chunk_idx, chunk in enumerate(chunks):
            if not chunk.strip():
                continue
            store.add_document(
                chunk,
                {
                    "type": "document",
                    "source": "pdf",
                    "file_path": str(path),
                    "file_name": path.name,
                    "page_number": str(page_num),
                    "chunk_index": str(chunk_idx),
                },
            )
            total_chunks += 1

    logger.info("Ingested %s: %d chunks from %d pages", path.name, total_chunks, len(pages_text))
    return {
        "chunks_stored": total_chunks,
        "file": path.name,
        "pages": len(pages_text),
        "total_pages": len(reader.pages),
    }

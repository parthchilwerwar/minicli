"""
PDF ingestion — load, chunk, embed, store in ChromaDB 'documents' collection.
Triggered only on explicit user command.
"""
from __future__ import annotations

import logging
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from memory.vector_store import get_store

logger = logging.getLogger("minicli.pdf_ingest")

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


async def ingest_pdf(file_path: str) -> dict:
    """
    Read a PDF, split into chunks, embed each chunk, store in 'documents' collection.
    Returns stats dict.
    """
    path = Path(file_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Not a PDF file: {path.name}")

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

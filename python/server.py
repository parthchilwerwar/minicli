"""
minicli Agent Server — FastAPI entry point.
The intelligence layer for the minicli daemon.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("minicli.server")


# ── Request/Response models ──────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    chat_id: str = "default"
    history: list[dict] | None = None


class ChatResponse(BaseModel):
    result: str


class IngestRequest(BaseModel):
    file_path: str


class IngestResponse(BaseModel):
    chunks_stored: int
    file: str
    pages: int = 0


class HealthResponse(BaseModel):
    status: str
    agents: list[str]
    vector_stats: dict


class StatsResponse(BaseModel):
    stats: dict


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Starting minicli agent server...")

    # 1. Init vector store
    from memory.vector_store import init_store
    store = init_store()
    stats = store.get_stats()
    logger.info("Vector store ready: %s", stats)

    # 2. Run migration if needed
    from memory.migration import run_migration
    migration_result = run_migration()
    if "complete" in migration_result.lower():
        logger.info(migration_result)

    # 3. Start scheduler
    from scheduler.cron import start_scheduler
    start_scheduler()
    logger.info("Scheduler started")

    logger.info("Agent server ready on :6280")
    yield

    # Shutdown
    from scheduler.cron import stop_scheduler
    stop_scheduler()
    logger.info("Agent server stopped")


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="minicli Agent Server",
    version="2.0.0",
    lifespan=lifespan,
)


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Process a user message through the supervisor agent."""
    from agents.supervisor import process_message

    try:
        result = await process_message(
            message=req.message,
            chat_id=req.chat_id,
            history=req.history,
        )
        return ChatResponse(result=result)
    except Exception as exc:
        logger.error("Chat error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    """Ingest a PDF file into the knowledge base."""
    from rag.pdf_ingest import ingest_pdf

    try:
        result = await ingest_pdf(req.file_path)
        return IngestResponse(
            chunks_stored=result.get("chunks_stored", 0),
            file=result.get("file", "unknown"),
            pages=result.get("pages", 0),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Ingest error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    from memory.vector_store import get_store

    store = get_store()
    return HealthResponse(
        status="ok",
        agents=["supervisor", "life_os", "dev_builder", "research", "content", "proactive"],
        vector_stats=store.get_stats(),
    )


@app.get("/stats", response_model=StatsResponse)
async def stats():
    """Get vector store statistics."""
    from memory.vector_store import get_store

    store = get_store()
    return StatsResponse(stats=store.get_stats())


@app.post("/proactive")
async def trigger_proactive():
    """Manually trigger a proactive check."""
    from agents.proactive import run_proactive_check, send_proactive_to_telegram

    message = await run_proactive_check()
    if message:
        await send_proactive_to_telegram(message)
        return {"sent": True, "message": message}
    return {"sent": False, "message": "Nothing to report."}

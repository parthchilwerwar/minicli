"""
Corrective RAG pipeline — LangGraph StateGraph.

Flow:
  START → retrieve → grade_docs → (relevant) → generate → hallucination_check → END
                                → (irrelevant) → rewrite → web_search → generate → END
"""
from __future__ import annotations

import logging
from typing import TypedDict

import httpx
from langgraph.graph import StateGraph, END

from llm import get_llm
from memory.vector_store import get_store
from rag.grader import grade_document_relevance, grade_hallucination

logger = logging.getLogger("minicli.rag")


# ── State ────────────────────────────────────────────────────────────────────

class RAGState(TypedDict):
    question: str
    documents: list[str]
    generation: str
    web_results: str
    is_relevant: bool


# ── Nodes ────────────────────────────────────────────────────────────────────

async def retrieve_node(state: RAGState) -> dict:
    """Search vector store for relevant documents."""
    store = get_store()
    results = store.search_all(state["question"], k=6)
    docs = [r["content"] for r in results if r["content"].strip()]
    logger.info("Retrieved %d documents for query: %s", len(docs), state["question"][:80])
    return {"documents": docs}


async def grade_documents_node(state: RAGState) -> dict:
    """Grade each document for relevance, filter out irrelevant ones."""
    question = state["question"]
    docs = state.get("documents", [])
    if not docs:
        return {"documents": [], "is_relevant": False}

    relevant: list[str] = []
    for doc in docs:
        is_rel = await grade_document_relevance(question, doc[:500])
        if is_rel:
            relevant.append(doc)

    has_relevant = len(relevant) > 0
    logger.info("Graded %d docs → %d relevant", len(docs), len(relevant))
    return {"documents": relevant, "is_relevant": has_relevant}


async def rewrite_query_node(state: RAGState) -> dict:
    """Rewrite the question for better web search results."""
    llm = get_llm(temperature=0)
    resp = await llm.ainvoke(
        f"Rewrite this question to be a better web search query. "
        f"Return ONLY the rewritten query, nothing else.\n\n"
        f"Original question: {state['question']}"
    )
    rewritten = resp.content if hasattr(resp, "content") else str(resp)
    logger.info("Rewrote query: %s → %s", state["question"][:60], rewritten[:60])
    return {"question": rewritten.strip()}


async def web_search_node(state: RAGState) -> dict:
    """Fallback web search via DuckDuckGo."""
    query = state["question"]
    results_text = ""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            )
            resp.raise_for_status()
            data = resp.json()
            parts: list[str] = []
            if data.get("AbstractText"):
                parts.append(data["AbstractText"])
            for topic in (data.get("RelatedTopics") or [])[:5]:
                if isinstance(topic, dict) and topic.get("Text"):
                    parts.append(topic["Text"])
            results_text = "\n".join(parts)
    except Exception as exc:
        logger.warning("Web search failed: %s", exc)
        results_text = "Web search returned no results."

    if not results_text.strip():
        results_text = "No web results found."

    logger.info("Web search returned %d chars", len(results_text))
    return {"web_results": results_text}


async def generate_node(state: RAGState) -> dict:
    """Generate answer using retrieved context."""
    llm = get_llm()
    docs = state.get("documents", [])
    web = state.get("web_results", "")

    context_parts: list[str] = []
    if docs:
        context_parts.append("Retrieved context:\n" + "\n---\n".join(docs[:5]))
    if web:
        context_parts.append("Web search results:\n" + web)

    context = "\n\n".join(context_parts) if context_parts else "No context available."

    prompt = (
        f"Answer the following question using the provided context. "
        f"If the context doesn't contain enough information, say so honestly.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {state['question']}"
    )
    resp = await llm.ainvoke(prompt)
    answer = resp.content if hasattr(resp, "content") else str(resp)
    return {"generation": answer}


async def hallucination_check_node(state: RAGState) -> dict:
    """Validate the answer is grounded in documents."""
    docs_text = "\n---\n".join(state.get("documents", [])[:5])
    generation = state.get("generation", "")

    if not docs_text or not generation:
        return {}

    is_grounded = await grade_hallucination(docs_text, generation)
    if not is_grounded:
        logger.warning("Hallucination detected — answer may not be grounded")
        return {
            "generation": generation + "\n\n_(note: this answer may not be fully grounded in retrieved documents)_"
        }
    return {}


# ── Routing ──────────────────────────────────────────────────────────────────

def route_after_grading(state: RAGState) -> str:
    """Route to generate if relevant docs exist, otherwise rewrite + web search."""
    if state.get("is_relevant", False):
        return "generate"
    return "rewrite_query"


# ── Build Graph ──────────────────────────────────────────────────────────────

def _build_rag_graph() -> StateGraph:
    workflow = StateGraph(RAGState)

    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("grade_documents", grade_documents_node)
    workflow.add_node("rewrite_query", rewrite_query_node)
    workflow.add_node("web_search", web_search_node)
    workflow.add_node("generate", generate_node)
    workflow.add_node("hallucination_check", hallucination_check_node)

    workflow.set_entry_point("retrieve")
    workflow.add_edge("retrieve", "grade_documents")
    workflow.add_conditional_edges(
        "grade_documents",
        route_after_grading,
        {"generate": "generate", "rewrite_query": "rewrite_query"},
    )
    workflow.add_edge("rewrite_query", "web_search")
    workflow.add_edge("web_search", "generate")
    workflow.add_edge("generate", "hallucination_check")
    workflow.add_edge("hallucination_check", END)

    return workflow


_compiled_rag = None


def _get_rag_app():
    global _compiled_rag
    if _compiled_rag is None:
        _compiled_rag = _build_rag_graph().compile()
    return _compiled_rag


async def run_rag_pipeline(question: str) -> str:
    """Run the full corrective RAG pipeline and return the answer."""
    app = _get_rag_app()
    initial_state: RAGState = {
        "question": question,
        "documents": [],
        "generation": "",
        "web_results": "",
        "is_relevant": False,
    }
    result = await app.ainvoke(initial_state)
    return result.get("generation", "I couldn't find an answer to that.")

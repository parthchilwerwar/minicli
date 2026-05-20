"""
LLM-based document relevance grading and hallucination checking.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from llm import get_structured_llm


# ── Schemas ──────────────────────────────────────────────────────────────────

class GradeDocuments(BaseModel):
    """Binary relevance score for a retrieved document."""
    binary_score: Literal["yes", "no"] = Field(
        description="Whether the document is relevant to the question: 'yes' or 'no'"
    )


class GradeHallucination(BaseModel):
    """Binary score checking if the generation is grounded in documents."""
    binary_score: Literal["yes", "no"] = Field(
        description="Whether the answer is grounded in the provided documents: 'yes' or 'no'"
    )


# ── Grading functions ────────────────────────────────────────────────────────

_RELEVANCE_PROMPT = (
    "You are a grader assessing relevance of a retrieved document to a user question.\n"
    "If the document contains keyword(s) or semantic meaning related to the question, "
    "grade it as relevant.\n"
    "Give a binary score 'yes' or 'no' to indicate whether the document is relevant."
)

_HALLUCINATION_PROMPT = (
    "You are a grader assessing whether an LLM generation is grounded in / supported by "
    "a set of retrieved documents.\n"
    "Give a binary score 'yes' or 'no'. 'yes' means the answer is grounded in the documents."
)


async def grade_document_relevance(question: str, document: str) -> bool:
    """Returns True if the document is relevant to the question."""
    grader = get_structured_llm(GradeDocuments)
    prompt = (
        f"{_RELEVANCE_PROMPT}\n\n"
        f"Retrieved document:\n{document}\n\n"
        f"User question: {question}"
    )
    try:
        result: GradeDocuments = await grader.ainvoke(prompt)
        return result.binary_score == "yes"
    except Exception:
        # If grading fails, assume relevant (don't lose documents)
        return True


async def grade_hallucination(documents: str, generation: str) -> bool:
    """Returns True if the generation is grounded in the documents."""
    grader = get_structured_llm(GradeHallucination)
    prompt = (
        f"{_HALLUCINATION_PROMPT}\n\n"
        f"Documents:\n{documents}\n\n"
        f"LLM generation: {generation}"
    )
    try:
        result: GradeHallucination = await grader.ainvoke(prompt)
        return result.binary_score == "yes"
    except Exception:
        # If check fails, allow the answer through
        return True

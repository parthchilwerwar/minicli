"""
LLM adapter — wraps OpenRouter as LangChain ChatOpenAI.
"""
from __future__ import annotations

from typing import Any

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from config import OPENROUTER_API_KEY, PRIMARY_MODEL, FALLBACK_MODEL


def get_llm(model_override: str | None = None, temperature: float = 0.7) -> ChatOpenAI:
    """Return a ChatOpenAI instance pointing at OpenRouter."""
    return ChatOpenAI(
        model=model_override or PRIMARY_MODEL,
        temperature=temperature,
        api_key=OPENROUTER_API_KEY,  # type: ignore[arg-type]
        base_url="https://openrouter.ai/api/v1",
        max_retries=2,
        request_timeout=60,
    )


def get_fast_llm() -> ChatOpenAI:
    """Cheap, deterministic model for classification / grading tasks."""
    return get_llm(model_override=PRIMARY_MODEL, temperature=0)


def get_fallback_llm() -> ChatOpenAI:
    """Secondary model when primary hits rate limits."""
    return get_llm(model_override=FALLBACK_MODEL, temperature=0.7)


def get_structured_llm(schema: type[BaseModel], **kwargs: Any) -> Any:
    """Return an LLM that outputs structured Pydantic models."""
    llm = get_fast_llm()
    return llm.with_structured_output(schema, **kwargs)

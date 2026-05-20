"""
Conversation thread management with auto-summarization.
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, BaseMessage

logger = logging.getLogger("minicli.conversation")

MAX_HISTORY = 20
SUMMARIZE_THRESHOLD = 15
KEEP_RECENT = 5


class ConversationManager:
    """Per-thread message history with auto-summarize + archive."""

    def __init__(self) -> None:
        self._threads: dict[str, list[dict[str, str]]] = {}

    def get_history(self, thread_id: str) -> list[dict[str, str]]:
        """Return raw message dicts for a thread."""
        return self._threads.get(thread_id, [])

    def get_langchain_messages(self, thread_id: str) -> list[BaseMessage]:
        """Convert stored history to LangChain message objects."""
        messages: list[BaseMessage] = []
        for msg in self.get_history(thread_id):
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
            elif role == "system":
                messages.append(SystemMessage(content=content))
        return messages

    def add_message(self, thread_id: str, role: str, content: str) -> None:
        if thread_id not in self._threads:
            self._threads[thread_id] = []
        self._threads[thread_id].append({"role": role, "content": content})

        # Auto-trim if too long
        if len(self._threads[thread_id]) > MAX_HISTORY:
            self._threads[thread_id] = self._threads[thread_id][-MAX_HISTORY:]

    def clear(self, thread_id: str) -> None:
        self._threads.pop(thread_id, None)

    async def summarize_and_archive(self, thread_id: str) -> str | None:
        """If thread is long, summarize oldest messages, archive to vector store, keep recent."""
        history = self._threads.get(thread_id)
        if not history or len(history) < SUMMARIZE_THRESHOLD:
            return None

        from llm import get_fast_llm
        from memory.vector_store import get_store

        old_messages = history[: len(history) - KEEP_RECENT]
        recent = history[len(history) - KEEP_RECENT :]

        # Build a condensed version for LLM
        convo_text = "\n".join(
            f"{m['role']}: {m['content']}" for m in old_messages
        )
        llm = get_fast_llm()
        summary_resp = await llm.ainvoke(
            f"Summarize this conversation in 2-3 sentences, capturing key facts and decisions:\n\n{convo_text}"
        )
        summary = summary_resp.content if hasattr(summary_resp, "content") else str(summary_resp)

        # Archive summary to vector store
        store = get_store()
        store.add_memory(
            summary,
            {
                "type": "conversation",
                "source": "auto_summary",
                "thread_id": thread_id,
                "message_count": str(len(old_messages)),
            },
        )

        # Keep only recent messages
        self._threads[thread_id] = recent
        logger.info(
            "Summarized %d messages for thread %s, kept %d recent",
            len(old_messages), thread_id, len(recent),
        )
        return summary

    def list_threads(self) -> dict[str, int]:
        """Return thread IDs and their message counts."""
        return {tid: len(msgs) for tid, msgs in self._threads.items()}


# ── Singleton ────────────────────────────────────────────────────────────────

_manager: ConversationManager | None = None


def get_conversation_manager() -> ConversationManager:
    global _manager
    if _manager is None:
        _manager = ConversationManager()
    return _manager

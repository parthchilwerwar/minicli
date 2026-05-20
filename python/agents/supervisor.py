"""
Supervisor agent — the brain of minicli.
Routes user messages to specialized worker agents.
Uses create_react_agent with workers wrapped as tools.
"""
from __future__ import annotations

import logging
from pathlib import Path

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

from config import PERSONA_DIR, LIFE_OS_NAME
from llm import get_llm
from tools.memory_tools import search_memory, save_memory_tool, ingest_pdf_tool, get_tasks, memory_stats
from tools.web_search import web_search

logger = logging.getLogger("minicli.supervisor")


# ── Persona loader ──────────────────────────────────────────────────────────

def _load_persona() -> str:
    """Read SOUL.md, IDENTITY.md, USER.md and concatenate."""
    parts: list[str] = []
    for name in ("SOUL.md", "IDENTITY.md", "USER.md"):
        path = PERSONA_DIR / name
        if path.exists():
            parts.append(path.read_text(encoding="utf-8"))
    return "\n\n".join(parts) if parts else ""


def _build_system_prompt() -> str:
    """Build the full system prompt for the supervisor."""
    persona = _load_persona()
    persona_block = f"\n\n[PERSONA]\n{persona}\n[/PERSONA]" if persona else ""

    return f"""\
You are minicli — a personal AI agent living inside {LIFE_OS_NAME}'s terminal and Telegram.

## Who you are
You are not a generic assistant. You are {LIFE_OS_NAME}'s personal agent.
You know their projects, goals, and daily grind.
You are sharp, chill, and occasionally roast them when they're being unproductive.

## Your personality
- Casual and direct — no corporate speak, no filler phrases
- You roast lightly when they procrastinate
- You hype them up when they ship
- Short sentences. no essays unless asked.
- Never say "certainly", "absolutely", "great question", "I'd be happy to"

## How you work — AGENT ROUTING
You have specialized worker agents. Delegate to the right one:

- **life_os_worker**: tasks, habits, reminders, daily planning, calendar, productivity
- **dev_worker**: GitHub, code, git, shell commands, file operations, development tasks
- **research_worker**: web research, news, market analysis, URL analysis, PDF ingestion
- **content_worker**: tweets, LinkedIn posts, READMEs, announcements, content creation

For simple questions or chat, respond directly without delegating.
For memory/context questions, use search_memory first.

## Rules
- Never make up information — if you don't know, search memory or web
- Always confirm before sending emails, making commits, or deleting files
- Keep responses SHORT in Telegram — max 3-4 lines unless detail is requested
- Search memory for context before answering knowledge questions
- Save important facts and decisions to memory
{persona_block}"""


# ── Worker wrappers ──────────────────────────────────────────────────────────

@tool
async def life_os_worker(query: str) -> str:
    """Delegate to Life OS agent for tasks, habits, reminders, daily planning, and calendar management. Use when the user asks about their schedule, tasks, todos, or productivity."""
    from agents.life_os import get_life_os_agent
    agent = get_life_os_agent()
    result = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
    final = result["messages"][-1]
    return final.content if hasattr(final, "content") else str(final)


@tool
async def dev_worker(query: str) -> str:
    """Delegate to Dev agent for GitHub, code, git, shell commands, and development tasks. Use when the user asks about PRs, issues, code review, builds, or repos."""
    from agents.dev_builder import get_dev_agent
    agent = get_dev_agent()
    result = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
    final = result["messages"][-1]
    return final.content if hasattr(final, "content") else str(final)


@tool
async def research_worker(query: str) -> str:
    """Delegate to Research agent for web research, news, market analysis, and PDF ingestion. Use for any question requiring information lookup or deep research."""
    from agents.research import get_research_agent
    agent = get_research_agent()
    result = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
    final = result["messages"][-1]
    return final.content if hasattr(final, "content") else str(final)


@tool
async def content_worker(query: str) -> str:
    """Delegate to Content agent for generating tweets, LinkedIn posts, READMEs, and announcements. Use when the user asks to write or draft content."""
    from agents.content import get_content_agent
    agent = get_content_agent()
    result = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
    final = result["messages"][-1]
    return final.content if hasattr(final, "content") else str(final)


# ── Build supervisor ─────────────────────────────────────────────────────────

_supervisor = None
_checkpointer = None


def _build_supervisor():
    global _supervisor, _checkpointer

    llm = get_llm()
    system_prompt = _build_system_prompt()

    all_tools = [
        # Worker agents
        life_os_worker, dev_worker, research_worker, content_worker,
        # Direct memory tools
        search_memory, save_memory_tool, ingest_pdf_tool, get_tasks, memory_stats,
        # Direct search
        web_search,
    ]

    _checkpointer = MemorySaver()

    _supervisor = create_react_agent(
        llm,
        tools=all_tools,
        prompt=system_prompt,
        checkpointer=_checkpointer,
    )
    return _supervisor


def _get_supervisor():
    global _supervisor
    if _supervisor is None:
        _build_supervisor()
    return _supervisor


# ── Public API ───────────────────────────────────────────────────────────────

async def process_message(
    message: str,
    chat_id: str,
    history: list[dict] | None = None,
) -> str:
    """
    Process a user message through the supervisor agent.
    Returns the final response text.
    """
    supervisor = _get_supervisor()

    # Build message list
    messages: list[BaseMessage] = []
    if history:
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if not content:
                continue
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=message))

    config = {"configurable": {"thread_id": chat_id}}

    try:
        result = await supervisor.ainvoke({"messages": messages}, config=config)
        final_message = result["messages"][-1]
        answer = final_message.content if hasattr(final_message, "content") else str(final_message)

        # Save the interaction to memory (fire-and-forget style)
        try:
            store = __import__("memory.vector_store", fromlist=["get_store"]).get_store()
            store.add_memory(
                f"User: {message}\nAssistant: {answer[:500]}",
                {"type": "conversation", "source": "telegram", "thread_id": chat_id},
            )
        except Exception:
            pass  # best-effort memory save

        return answer
    except Exception as exc:
        logger.error("Supervisor error: %s", exc, exc_info=True)
        return f"something broke: {exc}"

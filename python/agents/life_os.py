"""
Life OS worker agent — tasks, habits, reminders, daily planning.
Real LangGraph agent with tool calling.
"""
from __future__ import annotations

from langgraph.prebuilt import create_react_agent

from llm import get_llm
from tools.bridge import (
    ticktick_get_today, ticktick_create_task, ticktick_complete_task,
    calendar_get_today, calendar_get_week, calendar_create_event,
)
from tools.memory_tools import search_memory, save_memory_tool, get_tasks

LIFE_OS_PROMPT = """\
You are the Life OS specialist agent inside minicli.

Your job:
- Manage tasks, habits, and reminders
- Check and create calendar events
- Help with daily/weekly planning
- Track productivity and suggest prioritization

Rules:
- Be direct and actionable — no fluff
- When creating tasks, always confirm the details first
- Search memories for context about the user's goals and patterns
- If you see overdue tasks, call them out
- Keep responses concise for Telegram

You have access to TickTick (task manager) and Google Calendar.
"""

_agent = None


def get_life_os_agent():
    global _agent
    if _agent is None:
        llm = get_llm()
        tools = [
            ticktick_get_today, ticktick_create_task, ticktick_complete_task,
            calendar_get_today, calendar_get_week, calendar_create_event,
            search_memory, save_memory_tool, get_tasks,
        ]
        _agent = create_react_agent(llm, tools, prompt=LIFE_OS_PROMPT)
    return _agent


life_os_agent = None  # Lazy init on first use


def init_life_os():
    global life_os_agent
    life_os_agent = get_life_os_agent()
    return life_os_agent

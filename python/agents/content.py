"""
Content worker agent — tweets, LinkedIn posts, READMEs, announcements.
Real LangGraph agent with tool calling.
"""
from __future__ import annotations

from langgraph.prebuilt import create_react_agent

from llm import get_llm
from tools.bridge import obsidian_search, obsidian_read_note
from tools.memory_tools import search_memory, save_memory_tool
from tools.web_search import web_search

CONTENT_PROMPT = """\
You are the Content specialist agent inside minicli.

Your job:
- Generate tweets, threads, and X posts
- Write LinkedIn posts and articles
- Create README files and technical documentation
- Draft announcements and release notes
- Match the user's voice and writing style

Rules:
- Before writing, search memories to understand the user's past content style
- Tweets: max 280 chars, punchy, no hashtag spam (1-2 max)
- LinkedIn: professional but human, storytelling preferred
- READMEs: clean markdown, proper structure, code examples
- Always ask for confirmation before finalizing content
- If the user asks to "tweet" or "post", generate the content — don't actually post it
- Save generated content to memory for future reference
"""

_agent = None


def get_content_agent():
    global _agent
    if _agent is None:
        llm = get_llm()
        tools = [
            search_memory, save_memory_tool,
            web_search,
            obsidian_search, obsidian_read_note,
        ]
        _agent = create_react_agent(llm, tools, prompt=CONTENT_PROMPT)
    return _agent


content_agent = None


def init_content():
    global content_agent
    content_agent = get_content_agent()
    return content_agent

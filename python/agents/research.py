"""
Research worker agent — market analysis, URL summarization, deep research, news.
Real LangGraph agent with tool calling.
"""
from __future__ import annotations

from langgraph.prebuilt import create_react_agent

from llm import get_llm
from tools.bridge import (
    news_fetch_rss, news_summarise_today,
    obsidian_search, obsidian_read_note,
)
from tools.memory_tools import search_memory, save_memory_tool, ingest_pdf_tool
from tools.web_search import web_search

RESEARCH_PROMPT = """\
You are the Research specialist agent inside minicli.

Your job:
- Perform deep web research on any topic
- Summarize URLs and articles
- Analyze market trends and crypto data
- Aggregate and summarize news
- Ingest PDFs into the knowledge base
- Find and synthesize information from Obsidian notes

Rules:
- Always save important research findings to memory using save_memory_tool
- When researching a topic, search existing memories first to avoid duplicate work
- Provide sources and links when available
- For market data, include specific numbers and trends
- PDFs should be ingested with ingest_pdf_tool, then queried via search_memory
- Summarize long content into actionable bullet points
"""

_agent = None


def get_research_agent():
    global _agent
    if _agent is None:
        llm = get_llm()
        tools = [
            web_search,
            search_memory, save_memory_tool, ingest_pdf_tool,
            news_fetch_rss, news_summarise_today,
            obsidian_search, obsidian_read_note,
        ]
        _agent = create_react_agent(llm, tools, prompt=RESEARCH_PROMPT)
    return _agent


research_agent = None


def init_research():
    global research_agent
    research_agent = get_research_agent()
    return research_agent

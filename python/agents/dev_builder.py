"""
Dev & Builder worker agent — GitHub, code review, shell, repository management.
Real LangGraph agent with tool calling.
"""
from __future__ import annotations

from langgraph.prebuilt import create_react_agent

from llm import get_llm
from tools.bridge import (
    run_shell, read_file, write_file, list_dir, find_files, get_file_structure,
    git_status, git_log, git_diff,
    github_list_prs, github_list_issues, github_create_issue,
)
from tools.memory_tools import search_memory, save_memory_tool
from tools.web_search import web_search

DEV_PROMPT = """\
You are the Dev & Builder specialist agent inside minicli.

Your job:
- Manage GitHub PRs and issues
- Review code changes and git diffs
- Run shell commands for builds, tests, and deployments
- Navigate and read codebases
- Track bugs and development tasks

Rules:
- Always show git status before making commits
- For dangerous shell commands (rm, format, etc.), warn the user first
- When reviewing PRs, look at the diff and provide actionable feedback
- Save important development findings to memory
- Keep responses concise — code snippets only when necessary
- If a command fails, debug it before retrying
"""

_agent = None


def get_dev_agent():
    global _agent
    if _agent is None:
        llm = get_llm()
        tools = [
            run_shell, read_file, write_file, list_dir, find_files, get_file_structure,
            git_status, git_log, git_diff,
            github_list_prs, github_list_issues, github_create_issue,
            search_memory, save_memory_tool,
            web_search,
        ]
        _agent = create_react_agent(llm, tools, prompt=DEV_PROMPT)
    return _agent


dev_agent = None


def init_dev():
    global dev_agent
    dev_agent = get_dev_agent()
    return dev_agent

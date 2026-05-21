"""
Bridge tools — call existing Node.js tools via HTTP.
Each @tool wraps a POST to the Node.js bridge server.
"""
from __future__ import annotations

import httpx
from langchain_core.tools import tool

from config import BRIDGE_PORT, BRIDGE_SECRET

BRIDGE_URL = f"http://127.0.0.1:{BRIDGE_PORT}"


async def call_bridge_tool(tool_name: str, args: dict) -> str:
    """Call a Node.js tool via the bridge HTTP endpoint."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if BRIDGE_SECRET:
        headers["X-Bridge-Secret"] = BRIDGE_SECRET
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{BRIDGE_URL}/tool/{tool_name}",
                json={"args": args},
                headers=headers,
            )
            if resp.status_code >= 400:
                raise Exception(f"HTTP {resp.status_code}: {resp.text}")
            data = resp.json()
            return data.get("result", str(data))
    except httpx.TimeoutException:
        return f"Tool '{tool_name}' timed out after 30s"
    except Exception as exc:
        return f"Bridge call failed for '{tool_name}': {exc}"


# ── Shell & filesystem ──────────────────────────────────────────────────────

@tool
async def run_shell(command: str) -> str:
    """Execute a shell command on the system. Use with caution — dangerous commands require confirmation."""
    return await call_bridge_tool("run_shell", {"command": command})


@tool
async def read_file(path: str) -> str:
    """Read a text file from the filesystem (max 50KB)."""
    return await call_bridge_tool("fs_read_file", {"path": path})


@tool
async def write_file(path: str, content: str) -> str:
    """Write content to a file."""
    return await call_bridge_tool("write_file", {"path": path, "content": content})


@tool
async def list_dir(path: str) -> str:
    """List contents of a directory."""
    return await call_bridge_tool("fs_list_dir", {"path": path})


@tool
async def find_files(query: str, search_in: str = "all") -> str:
    """Find files matching a name pattern across allowed paths (vault, desktop, downloads)."""
    return await call_bridge_tool("fs_find", {"query": query, "searchIn": search_in})


@tool
async def get_file_structure(path: str, depth: int = 3) -> str:
    """Get folder tree of a directory."""
    return await call_bridge_tool("fs_get_structure", {"path": path, "depth": depth})


# ── Git ──────────────────────────────────────────────────────────────────────

@tool
async def git_status() -> str:
    """Get the current git status of the repository."""
    return await call_bridge_tool("git_status", {})


@tool
async def git_log(count: int = 10) -> str:
    """Get recent git commits."""
    # Node-side schema expects `n`, not `count`.
    return await call_bridge_tool("git_log", {"n": count})


@tool
async def git_diff() -> str:
    """Get the current git diff (unstaged changes)."""
    return await call_bridge_tool("git_diff", {})


# ── GitHub ───────────────────────────────────────────────────────────────────

@tool
async def github_list_prs(repo: str) -> str:
    """List open pull requests for a GitHub repo."""
    return await call_bridge_tool("github_list_prs", {"repo": repo})


@tool
async def github_list_issues(repo: str) -> str:
    """List open issues for a GitHub repo."""
    return await call_bridge_tool("github_list_issues", {"repo": repo})


@tool
async def github_create_issue(repo: str, title: str, body: str) -> str:
    """Create a new GitHub issue."""
    return await call_bridge_tool("github_create_issue", {"repo": repo, "title": title, "body": body})


# ── TickTick ─────────────────────────────────────────────────────────────────

@tool
async def ticktick_get_today() -> str:
    """Get today's tasks from TickTick."""
    return await call_bridge_tool("ticktick_get_today", {})


@tool
async def ticktick_create_task(title: str, description: str = "") -> str:
    """Create a new task in TickTick."""
    return await call_bridge_tool("ticktick_create_task", {"title": title, "description": description})


@tool
async def ticktick_complete_task(task_id: str, project_id: str) -> str:
    """Mark a TickTick task as complete. Both task_id and project_id are required by the TickTick API."""
    return await call_bridge_tool(
        "ticktick_complete_task",
        {"taskId": task_id, "projectId": project_id},
    )


# ── Calendar ─────────────────────────────────────────────────────────────────

@tool
async def calendar_get_today() -> str:
    """Get today's calendar events."""
    return await call_bridge_tool("calendar_get_today", {})


@tool
async def calendar_get_week() -> str:
    """Get this week's calendar events."""
    return await call_bridge_tool("calendar_get_week", {})


@tool
async def calendar_create_event(title: str, start: str, end: str) -> str:
    """Create a new calendar event. Dates in ISO format."""
    return await call_bridge_tool("calendar_create_event", {"title": title, "start": start, "end": end})


# ── Obsidian ─────────────────────────────────────────────────────────────────

@tool
async def obsidian_search(query: str) -> str:
    """Full-text search across Obsidian vault notes."""
    return await call_bridge_tool("obsidian_search", {"query": query})


@tool
async def obsidian_read_note(filename: str) -> str:
    """Read a specific note from the Obsidian vault."""
    return await call_bridge_tool("obsidian_read_note", {"filename": filename})


# ── News ─────────────────────────────────────────────────────────────────────

@tool
async def news_fetch_rss(url: str) -> str:
    """Fetch and parse an RSS feed."""
    return await call_bridge_tool("news_fetch_rss", {"url": url})


@tool
async def news_summarise_today() -> str:
    """Get today's news summary from configured RSS feeds."""
    return await call_bridge_tool("news_summarise_today", {})


from .web_search import web_search

# ── Gmail ────────────────────────────────────────────────────────────────────

@tool
async def gmail_list() -> str:
    """List recent emails from Gmail."""
    return await call_bridge_tool("gmail_list", {})


@tool
async def gmail_send(to: str, subject: str, body: str) -> str:
    """Send an email via Gmail. Always confirm with the user before sending."""
    return await call_bridge_tool("gmail_send", {"to": to, "subject": subject, "body": body})


# ── Notes ────────────────────────────────────────────────────────────────────

@tool
async def save_note(text: str, tags: str = "") -> str:
    """Save a quick note. Tags are comma-separated."""
    return await call_bridge_tool("save_note", {"text": text, "tags": tags})


# NOTE: Agents should prefer importing the native `web_search` tool from `python/tools/web_search.py`
# directly, rather than using `web_search_bridge`. This bridge version is kept for backwards
# compatibility.
@tool
async def web_search_bridge(query: str) -> str:
    """Search the web using DuckDuckGo. Delegates to the native Python implementation."""
    return await web_search.invoke({"query": query})


# ── Export ───────────────────────────────────────────────────────────────────

def get_bridge_tools() -> list:
    """Return all bridge tool functions."""
    return [
        run_shell, read_file, write_file, list_dir, find_files, get_file_structure,
        git_status, git_log, git_diff,
        github_list_prs, github_list_issues, github_create_issue,
        ticktick_get_today, ticktick_create_task, ticktick_complete_task,
        calendar_get_today, calendar_get_week, calendar_create_event,
        obsidian_search, obsidian_read_note,
        news_fetch_rss, news_summarise_today,
        gmail_list, gmail_send,
        save_note, web_search_bridge,
    ]

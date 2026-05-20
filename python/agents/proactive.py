"""
Proactive agent — autonomous scheduled checks + memory cleanup.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config import BRIDGE_PORT, BRIDGE_SECRET, PERSONA_DIR, TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID
from llm import get_llm
from memory.vector_store import get_store

logger = logging.getLogger("minicli.proactive")

# Rate limiting: track last proactive message time
_last_proactive: datetime | None = None
_MIN_INTERVAL_HOURS = 4


def _read_user_md() -> str:
    """Read the USER.md persona file if it exists."""
    user_md = PERSONA_DIR / "USER.md"
    if user_md.exists():
        return user_md.read_text(encoding="utf-8")[:2000]
    return ""


async def run_proactive_check() -> str | None:
    """
    Check recent context and decide if a proactive message should be sent.
    Returns the message text, or None if nothing to send.
    """
    global _last_proactive

    # Rate limit
    now = datetime.now(timezone.utc)
    if _last_proactive:
        hours_since = (now - _last_proactive).total_seconds() / 3600
        if hours_since < _MIN_INTERVAL_HOURS:
            return None

    store = get_store()

    # Gather context: recent memories + tasks
    recent_memories = store.search("recent activity updates", k=15, collection="memories")
    tasks = store.search("upcoming tasks due soon", k=10, collection="tasks")
    user_profile = _read_user_md()

    # Build context for LLM
    memory_text = "\n".join(
        f"- {r['content'][:150]}" for r in recent_memories
    ) or "No recent memories."

    task_text = "\n".join(
        f"- {r['content'][:150]}" for r in tasks
    ) or "No pending tasks."

    prompt = f"""\
You are minicli's proactive agent. Your job is to check if the user needs a heads-up.

User profile:
{user_profile[:1000]}

Recent memories (last 48h):
{memory_text}

Pending tasks:
{task_text}

Current time: {now.strftime('%Y-%m-%d %H:%M UTC')}

Should you send a proactive message? Consider:
- Overdue or forgotten tasks
- Important patterns you've noticed
- Upcoming deadlines
- Things the user might have forgotten

If YES: Write a short, casual, 2-line max message (minicli voice — direct, no fluff).
If NO: Reply with exactly "SKIP"

Your response:"""

    llm = get_llm()
    resp = await llm.ainvoke(prompt)
    answer = resp.content if hasattr(resp, "content") else str(resp)
    answer = answer.strip()

    if answer.upper() == "SKIP" or not answer:
        logger.info("Proactive check: nothing to send")
        return None

    _last_proactive = now

    # Save the proactive message to memory
    store.add_memory(
        f"Proactive message sent: {answer}",
        {"type": "finding", "source": "proactive", "tags": "proactive"},
    )

    logger.info("Proactive message: %s", answer[:100])
    return answer


async def send_proactive_to_telegram(message: str) -> None:
    """Send a proactive message to Telegram via the bot API."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_ALLOWED_USER_ID:
        logger.warning("Telegram not configured — skipping proactive send")
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json={
                "chat_id": TELEGRAM_ALLOWED_USER_ID,
                "text": f"🔔 {message}",
                "parse_mode": "Markdown",
            })
    except Exception as exc:
        logger.error("Failed to send proactive message: %s", exc)


async def run_memory_cleanup() -> str:
    """Prune old conversations and facts from the vector store."""
    store = get_store()
    conv_deleted = store.delete_old(days=30, collection="memories")
    logger.info("Memory cleanup: deleted %d old memories", conv_deleted)
    return f"Memory cleanup: removed {conv_deleted} entries older than 30 days"

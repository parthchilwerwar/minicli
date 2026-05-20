"""
APScheduler-based cron for proactive checks and memory cleanup.
"""
from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("minicli.scheduler")

_scheduler: AsyncIOScheduler | None = None


async def _proactive_job() -> None:
    """Run proactive check and send to Telegram if needed."""
    from agents.proactive import run_proactive_check, send_proactive_to_telegram

    try:
        message = await run_proactive_check()
        if message:
            await send_proactive_to_telegram(message)
            logger.info("Proactive message sent")
        else:
            logger.debug("Proactive check: nothing to send")
    except Exception as exc:
        logger.error("Proactive job failed: %s", exc)


async def _cleanup_job() -> None:
    """Run weekly memory cleanup."""
    from agents.proactive import run_memory_cleanup

    try:
        result = await run_memory_cleanup()
        logger.info("Cleanup result: %s", result)
    except Exception as exc:
        logger.error("Cleanup job failed: %s", exc)


def start_scheduler() -> AsyncIOScheduler:
    """Start the background scheduler with proactive + cleanup jobs."""
    global _scheduler

    if _scheduler is not None:
        return _scheduler

    _scheduler = AsyncIOScheduler()

    # Proactive check every 4 hours
    _scheduler.add_job(
        _proactive_job,
        trigger=IntervalTrigger(hours=4),
        id="proactive_check",
        name="Proactive check (every 4h)",
        replace_existing=True,
    )

    # Memory cleanup every Sunday at midnight
    _scheduler.add_job(
        _cleanup_job,
        trigger=CronTrigger(day_of_week="sun", hour=0, minute=0),
        id="memory_cleanup",
        name="Memory cleanup (weekly)",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("Scheduler started: proactive (4h), cleanup (Sun 00:00)")
    return _scheduler


def stop_scheduler() -> None:
    """Shut down the scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")

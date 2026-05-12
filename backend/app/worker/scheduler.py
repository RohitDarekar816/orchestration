"""Celery worker for evaluating and triggering scheduled agent runs."""

import asyncio
from datetime import datetime, timezone

from celery import Celery
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import async_session
from app.services.scheduler_service import SchedulerService
from app.services.agent_runner import get_runner

settings = get_settings()

celery_app = Celery(
    "oz-scheduler",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "evaluate-schedules-every-minute": {
            "task": "evaluate_schedules",
            "schedule": 60.0,
        },
    },
)


@celery_app.task(name="evaluate_schedules")
def evaluate_schedules():
    """Called by a periodic beat to evaluate and trigger scheduled agents."""
    asyncio.run(_evaluate())


async def _evaluate():
    async with async_session() as db:
        svc = SchedulerService(db)
        triggered = await svc.evaluate_schedules()

        for agent_run in triggered:
            runner = get_runner(agent_run, db)
            await runner.run()


@celery_app.task(name="run_agent")
def run_agent(agent_run_id: int):
    """Run a specific agent by ID."""
    asyncio.run(_run_single(agent_run_id))


async def _run_single(agent_run_id: int):
    from sqlalchemy import select
    from app.models.agent import AgentRun

    async with async_session() as db:
        result = await db.execute(select(AgentRun).where(AgentRun.id == agent_run_id))
        agent = result.scalar_one_or_none()
        if agent:
            runner = get_runner(agent, db)
            await runner.run()

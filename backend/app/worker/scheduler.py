"""Celery worker for evaluating and triggering scheduled agent runs."""

import asyncio

from celery import Celery

from app.core.config import get_settings

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


def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="evaluate_schedules")
def evaluate_schedules():
    _run_async(_evaluate())


async def _evaluate():
    from app.core.database import async_session, engine
    from app.services.agent_runner import get_runner
    from app.services.scheduler_service import SchedulerService

    async with async_session() as db:
        svc = SchedulerService(db)
        triggered = await svc.evaluate_schedules()

        for agent_run in triggered:
            runner = get_runner(agent_run, db)
            await runner.run()

    await engine.dispose()


@celery_app.task(name="run_agent")
def run_agent(agent_run_id: int):
    _run_async(_run_single(agent_run_id))


async def _run_single(agent_run_id: int):
    from sqlalchemy import select

    from app.core.database import async_session
    from app.models.agent import AgentRun
    from app.services.agent_runner import get_runner

    async with async_session() as db:
        result = await db.execute(select(AgentRun).where(AgentRun.id == agent_run_id))
        agent = result.scalar_one_or_none()
        if agent:
            runner = get_runner(agent, db)
            await runner.run()

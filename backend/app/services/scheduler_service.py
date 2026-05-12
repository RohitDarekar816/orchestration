from datetime import datetime, timezone

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schedule import Schedule
from app.models.agent import AgentRun, AgentStatus


class SchedulerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_schedules(self, user_id: int) -> list[Schedule]:
        result = await self.db.execute(
            select(Schedule).where(Schedule.user_id == user_id).order_by(Schedule.name)
        )
        return result.scalars().all()

    async def create_schedule(
        self,
        user_id: int,
        name: str,
        cron_expr: str,
        agent_type: str,
        skill_id: int = None,
        prompt_template: str = None,
        target_repos: str = None,
    ) -> Schedule:
        if not croniter.is_valid(cron_expr):
            raise ValueError(f"Invalid cron expression: {cron_expr}")

        schedule = Schedule(
            user_id=user_id,
            name=name,
            cron_expr=cron_expr,
            agent_type=agent_type,
            skill_id=skill_id,
            prompt_template=prompt_template,
            target_repos=target_repos,
        )
        self.db.add(schedule)
        await self.db.commit()
        await self.db.refresh(schedule)
        return schedule

    async def evaluate_schedules(self):
        result = await self.db.execute(
            select(Schedule).where(Schedule.is_active == True)
        )
        schedules = result.scalars().all()
        now = datetime.now(timezone.utc)
        triggered = []

        for s in schedules:
            if s.last_run_at is None:
                should_run = croniter(s.cron_expr, now).get_next(datetime) <= now
            else:
                should_run = croniter(s.cron_expr, s.last_run_at).get_next(datetime) <= now

            if should_run:
                agent_run = AgentRun(
                    user_id=s.user_id,
                    skill_id=s.skill_id,
                    agent_type=s.agent_type,
                    prompt=s.prompt_template,
                    target_repos=s.target_repos,
                    status=AgentStatus.PENDING,
                )
                self.db.add(agent_run)
                s.last_run_at = now
                triggered.append(agent_run)

        if triggered:
            await self.db.commit()

        return triggered

    async def toggle_schedule(self, schedule_id: int, active: bool) -> bool:
        result = await self.db.execute(select(Schedule).where(Schedule.id == schedule_id))
        schedule = result.scalar_one_or_none()
        if not schedule:
            return False
        schedule.is_active = active
        await self.db.commit()
        return True

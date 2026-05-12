from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.scheduler_service import SchedulerService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


class ScheduleCreate(BaseModel):
    name: str
    cron_expr: str
    agent_type: str
    skill_id: Optional[int] = None
    prompt_template: Optional[str] = None
    target_repos: Optional[list[str]] = None


@router.get("")
async def list_schedules(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SchedulerService(db)
    schedules = await svc.list_schedules(user.id)
    return [
        {
            "id": s.id,
            "name": s.name,
            "cron_expr": s.cron_expr,
            "agent_type": s.agent_type,
            "is_active": s.is_active,
            "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in schedules
    ]


@router.post("")
async def create_schedule(
    data: ScheduleCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SchedulerService(db)
    try:
        schedule = await svc.create_schedule(
            user_id=user.id,
            name=data.name,
            cron_expr=data.cron_expr,
            agent_type=data.agent_type,
            skill_id=data.skill_id,
            prompt_template=data.prompt_template,
            target_repos=",".join(data.target_repos) if data.target_repos else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="schedule.create",
        resource_type="schedule",
        resource_id=str(schedule.id),
    )

    return {
        "id": schedule.id,
        "name": schedule.name,
        "cron_expr": schedule.cron_expr,
    }


@router.post("/{schedule_id}/toggle")
async def toggle_schedule(
    schedule_id: int,
    active: bool = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SchedulerService(db)
    ok = await svc.toggle_schedule(schedule_id, active)
    if not ok:
        raise HTTPException(status_code=404, detail="Schedule not found")

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="schedule.toggle",
        resource_type="schedule",
        resource_id=str(schedule_id),
        details=f"active={active}",
    )

    return {"message": "Schedule updated", "active": active}

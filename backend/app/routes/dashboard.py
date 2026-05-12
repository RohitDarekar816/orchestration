from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.agent import AgentRun, AgentStatus

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = await db.scalar(
        select(func.count(AgentRun.id)).where(AgentRun.user_id == user.id)
    )
    running = await db.scalar(
        select(func.count(AgentRun.id)).where(
            AgentRun.user_id == user.id,
            AgentRun.status == AgentStatus.RUNNING,
        )
    )
    completed = await db.scalar(
        select(func.count(AgentRun.id)).where(
            AgentRun.user_id == user.id,
            AgentRun.status == AgentStatus.COMPLETED,
        )
    )
    failed = await db.scalar(
        select(func.count(AgentRun.id)).where(
            AgentRun.user_id == user.id,
            AgentRun.status == AgentStatus.FAILED,
        )
    )

    return {
        "total": total or 0,
        "running": running or 0,
        "completed": completed or 0,
        "failed": failed or 0,
    }

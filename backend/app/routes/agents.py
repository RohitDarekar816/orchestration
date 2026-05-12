import asyncio
import datetime
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.agent import AgentRun, AgentStatus
from app.models.log import AgentLog
from app.services.agent_runner import get_runner
from app.services.audit_service import AuditService
from app.services.skill_service import SkillService
from app.core.ws_manager import active_sessions

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentLaunchRequest(BaseModel):
    agent_type: str
    prompt: Optional[str] = None
    skill_id: Optional[int] = None
    target_repos: Optional[list[str]] = None
    env_vars: Optional[dict] = None
    max_runtime: Optional[int] = None


class AgentResponse(BaseModel):
    id: int
    agent_type: str
    status: str
    prompt: Optional[str]
    container_id: Optional[str]
    exit_code: Optional[int]
    error: Optional[str]
    started_at: Optional[str]
    finished_at: Optional[str]
    created_at: str


@router.post("/launch")
async def launch_agent(
    req: AgentLaunchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.agent_type not in ("claude-code", "codex", "gemini-cli", "opencode", "custom"):
        raise HTTPException(status_code=400, detail=f"Unsupported agent: {req.agent_type}")

    prompt = req.prompt
    env_vars = req.env_vars or {}

    if req.skill_id:
        svc = SkillService(db)
        skill = await svc.get_skill(req.skill_id)
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        prompt = await svc.render_prompt(skill, prompt or "")
        if skill.env_template:
            skill_env = json.loads(skill.env_template) if isinstance(skill.env_template, str) else (skill.env_template or {})
            env_vars = {**skill_env, **env_vars}

    agent_run = AgentRun(
        user_id=user.id,
        agent_type=req.agent_type or (skill.agent_type if req.skill_id else req.agent_type),
        prompt=prompt,
        skill_id=req.skill_id,
        target_repos=json.dumps(req.target_repos or []),
        env_vars=json.dumps(env_vars),
        max_runtime=req.max_runtime or 3600,
        status=AgentStatus.PENDING,
    )
    db.add(agent_run)
    await db.commit()
    await db.refresh(agent_run)

    asyncio.create_task(_run_agent_in_background(agent_run.id, db))

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="agent.launch",
        resource_type="agent_run",
        resource_id=str(agent_run.id),
        details=f"Launched {req.agent_type} agent",
    )

    return {
        "id": agent_run.id,
        "agent_type": agent_run.agent_type,
        "status": agent_run.status.value,
        "message": "Agent launched",
    }


@router.get("")
async def list_agents(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(AgentRun).where(AgentRun.user_id == user.id).order_by(AgentRun.created_at.desc()).limit(limit)
    if status:
        query = query.where(AgentRun.status == status)

    result = await db.execute(query)
    agents = result.scalars().all()

    return [
        {
            "id": a.id,
            "agent_type": a.agent_type,
            "status": a.status.value,
            "started_at": _dt(a.started_at),
            "finished_at": _dt(a.finished_at),
            "created_at": _dt(a.created_at),
            "exit_code": a.exit_code,
        }
        for a in agents
    ]


@router.get("/{agent_id}")
async def get_agent(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent run not found")

    return {
        "id": agent.id,
        "agent_type": agent.agent_type,
        "status": agent.status.value,
        "prompt": agent.prompt,
        "container_id": agent.container_id,
        "exit_code": agent.exit_code,
        "error": agent.error,
        "started_at": _dt(agent.started_at),
        "finished_at": _dt(agent.finished_at),
        "created_at": _dt(agent.created_at),
    }


@router.post("/{agent_id}/run")
async def run_agent(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent run not found")

    runner = get_runner(agent, db)
    await runner.run()
    return {"id": agent.id, "status": agent.status.value}


@router.post("/{agent_id}/cancel")
async def cancel_agent(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent run not found")

    runner = get_runner(agent, db)
    await runner.cancel()
    return {"id": agent.id, "status": agent.status.value}


@router.get("/{agent_id}/logs")
async def get_logs(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent run not found")

    logs_result = await db.execute(
        select(AgentLog)
        .where(AgentLog.agent_run_id == agent_id)
        .order_by(AgentLog.timestamp)
    )
    logs = logs_result.scalars().all()

    return [
        {"stream": l.stream, "content": l.content, "timestamp": _dt(l.timestamp)}
        for l in logs
    ]


@router.websocket("/ws/{agent_id}")
async def agent_ws(websocket: WebSocket, agent_id: int):
    await websocket.accept()
    active_sessions[agent_id] = websocket

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                continue
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        active_sessions.pop(agent_id, None)
    except Exception:
        active_sessions.pop(agent_id, None)


async def _run_agent_in_background(agent_id: int, _db: AsyncSession):
    from app.core.database import async_session as new_session
    import traceback
    try:
        async with new_session() as session:
            result = await session.execute(
                select(AgentRun).where(AgentRun.id == agent_id)
            )
            agent = result.scalar_one_or_none()
            if agent:
                runner = get_runner(agent, session)
                await runner.run()
    except Exception as e:
        async with new_session() as session:
            result = await session.execute(
                select(AgentRun).where(AgentRun.id == agent_id)
            )
            agent = result.scalar_one_or_none()
            if agent:
                agent.status = AgentStatus.FAILED
                agent.error = f"{type(e).__name__}: {e}"
                agent.finished_at = datetime.datetime.now(datetime.timezone.utc)
                await session.commit()
                log = AgentLog(agent_run_id=agent_id, stream="error", content=f"{type(e).__name__}: {e}\n{traceback.format_exc()}")
                session.add(log)
                await session.commit()


def _dt(val) -> Optional[str]:
    return val.isoformat() if val else None

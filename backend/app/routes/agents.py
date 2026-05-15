import asyncio
import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.ws_manager import active_sessions
from app.models.agent import AgentRun, AgentStatus
from app.models.agent_file import AgentFile
from app.models.log import AgentLog
from app.models.user import User
from app.services.agent_runner import get_runner
from app.services.audit_service import AuditService
from app.services.server_service import ServerService
from app.services.skill_service import SkillService

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentLaunchRequest(BaseModel):
    agent_type: str
    prompt: str | None = None
    skill_id: int | None = None
    server_id: int | None = None
    target_repos: list[str] | None = None
    env_vars: dict | None = None
    max_runtime: int | None = None


class AgentResponse(BaseModel):
    id: int
    agent_type: str
    status: str
    prompt: str | None
    container_id: str | None
    exit_code: int | None
    error: str | None
    started_at: str | None
    finished_at: str | None
    created_at: str


@router.post("/launch")
async def launch_agent(
    req: AgentLaunchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.agent_type not in ("claude-code", "codex", "gemini-cli", "opencode", "oz-local", "custom", "github"):
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
            raw = skill.env_template
            skill_env = json.loads(raw) if isinstance(raw, str) else (raw or {})
            env_vars = {**skill_env, **env_vars}

    if req.server_id:
        server_svc = ServerService(db)
        server = await server_svc.get_server(req.server_id, user.id)
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        server_env = await server_svc.get_server_env(server)
        env_vars = {**server_env, **env_vars}
        server_context = ServerService.build_server_prompt_context(server)
        prompt = f"{server_context}\n\n## Task\n{prompt or ''}"

    # Reject if the user already has too many agents running concurrently.
    running_count = await db.scalar(
        select(func.count(AgentRun.id)).where(
            AgentRun.user_id == user.id,
            AgentRun.status == AgentStatus.RUNNING,
        )
    )
    if (running_count or 0) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent agent runs (limit: 5). Wait for one to finish or cancel it.",
        )

    agent_run = AgentRun(
        user_id=user.id,
        agent_type=req.agent_type,
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
    status: str | None = Query(None),
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
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
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
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
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
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent run not found")

    runner = get_runner(agent, db)
    await runner.cancel()
    return {"id": agent.id, "status": agent.status.value}


@router.post("/{agent_id}/retry")
async def retry_agent(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent run not found")
    if agent.status not in (AgentStatus.FAILED, AgentStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Only failed or cancelled agents can be retried")

    agent.status = AgentStatus.PENDING
    agent.started_at = None
    agent.finished_at = None
    agent.exit_code = None
    agent.error = None
    agent.container_id = None
    await db.commit()

    asyncio.create_task(_run_agent_in_background(agent.id, db))

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="agent.retry",
        resource_type="agent_run",
        resource_id=str(agent_id),
    )

    return {"id": agent.id, "status": agent.status.value, "message": "Agent retry queued"}


@router.get("/{agent_id}/logs")
async def get_logs(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent run not found")

    logs_result = await db.execute(
        select(AgentLog).where(AgentLog.agent_run_id == agent_id).order_by(AgentLog.timestamp)
    )
    logs = logs_result.scalars().all()

    return [
        {"stream": log_entry.stream, "content": log_entry.content, "timestamp": _dt(log_entry.timestamp)}
        for log_entry in logs
    ]


@router.websocket("/ws/{agent_id}")
async def agent_ws(websocket: WebSocket, agent_id: int):
    await websocket.accept()
    active_sessions[agent_id] = websocket

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except TimeoutError:
                continue
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        active_sessions.pop(agent_id, None)
    except Exception:
        active_sessions.pop(agent_id, None)


@router.post("/{agent_id}/files")
async def upload_agent_files(
    agent_id: int,
    files: list[dict],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent run not found")

    saved = []
    for f in files:
        af = AgentFile(
            agent_run_id=agent_id,
            filename=f.get("filename", "unnamed"),
            content=f.get("content", ""),
            size=len(f.get("content", "")),
            mime_type=f.get("mime_type", "text/plain"),
        )
        db.add(af)
        saved.append(af)
    await db.commit()

    return {
        "uploaded": len(saved),
        "files": [
            {"id": af.id, "filename": af.filename, "size": af.size, "mime_type": af.mime_type}
            for af in saved
        ],
    }


@router.get("/{agent_id}/files")
async def list_agent_files(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent run not found")

    files_result = await db.execute(
        select(AgentFile).where(AgentFile.agent_run_id == agent_id).order_by(AgentFile.created_at)
    )
    files = files_result.scalars().all()

    return [
        {
            "id": f.id,
            "filename": f.filename,
            "size": f.size,
            "mime_type": f.mime_type,
            "created_at": _dt(f.created_at),
        }
        for f in files
    ]


@router.get("/{agent_id}/files/{file_id}")
async def download_agent_file(
    agent_id: int,
    file_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AgentRun).where(AgentRun.id == agent_id, AgentRun.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent run not found")

    file_result = await db.execute(
        select(AgentFile).where(AgentFile.id == file_id, AgentFile.agent_run_id == agent_id)
    )
    af = file_result.scalar_one_or_none()
    if not af:
        raise HTTPException(status_code=404, detail="File not found")

    from fastapi.responses import PlainTextResponse

    return PlainTextResponse(
        content=af.content or "",
        media_type=af.mime_type or "text/plain",
        headers={"Content-Disposition": f'attachment; filename="{af.filename}"'},
    )


async def _run_agent_in_background(agent_id: int, _db: AsyncSession, _max_auto_retries: int = 2):
    import traceback

    from app.core.database import async_session as new_session

    for attempt in range(1, _max_auto_retries + 2):
        run_started = datetime.datetime.now(datetime.UTC)
        try:
            async with new_session() as session:
                result = await session.execute(select(AgentRun).where(AgentRun.id == agent_id))
                agent = result.scalar_one_or_none()
                if not agent:
                    return
                runner = get_runner(agent, session)
                await runner.run()
                await session.refresh(agent)

                if agent.status == AgentStatus.COMPLETED:
                    return

                # Only auto-retry if the agent crashed within 30 s (startup/tool failure).
                # If it ran longer the task itself failed — no point retrying.
                run_seconds = (datetime.datetime.now(datetime.UTC) - run_started).total_seconds()
                if run_seconds > 30 or attempt > _max_auto_retries:
                    return

                backoff = 5 * attempt
                async with new_session() as s2:
                    r2 = await s2.execute(select(AgentRun).where(AgentRun.id == agent_id))
                    a2 = r2.scalar_one_or_none()
                    if a2:
                        log = AgentLog(
                            agent_run_id=agent_id,
                            stream="info",
                            content=f"[Oz] Crash detected after {run_seconds:.0f}s — retrying in {backoff}s (attempt {attempt + 1}/{_max_auto_retries + 1})",
                        )
                        s2.add(log)
                        a2.status = AgentStatus.PENDING
                        a2.exit_code = None
                        a2.finished_at = None
                        a2.container_id = None
                        await s2.commit()

                await asyncio.sleep(backoff)

        except Exception as e:
            async with new_session() as session:
                result = await session.execute(select(AgentRun).where(AgentRun.id == agent_id))
                agent = result.scalar_one_or_none()
                if agent:
                    agent.status = AgentStatus.FAILED
                    agent.error = f"{type(e).__name__}: {e}"
                    agent.finished_at = datetime.datetime.now(datetime.UTC)
                    await session.commit()
                    err_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
                    log = AgentLog(agent_run_id=agent_id, stream="error", content=err_msg)
                    session.add(log)
                    await session.commit()
            return


def _dt(val) -> str | None:
    return val.isoformat() if val else None

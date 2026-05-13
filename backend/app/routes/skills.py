import asyncio
import json
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.agent import AgentRun, AgentStatus
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.skill_service import SkillService

router = APIRouter(prefix="/api/skills", tags=["skills"])


class SkillCreate(BaseModel):
    name: str
    description: str | None = None
    agent_type: str
    system_prompt: str | None = None
    tools: list[str] | None = None
    env_template: dict | None = None
    image: str | None = None
    max_runtime: int | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    tools: list[str] | None = None
    env_template: dict | None = None
    image: str | None = None
    max_runtime: int | None = None


@router.get("")
async def list_skills(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SkillService(db)
    skills = await svc.list_skills(user.id)
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "agent_type": s.agent_type,
            "version": s.version,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in skills
    ]


@router.post("")
async def create_skill(
    data: SkillCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SkillService(db)
    skill = await svc.create_skill(
        user_id=user.id,
        name=data.name,
        description=data.description or "",
        agent_type=data.agent_type,
        system_prompt=data.system_prompt,
        tools=data.tools,
        env_template=data.env_template,
        image=data.image,
        max_runtime=data.max_runtime or 3600,
    )

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="skill.create",
        resource_type="skill",
        resource_id=str(skill.id),
        details=f"Created skill: {skill.name}",
    )

    return {
        "id": skill.id,
        "name": skill.name,
        "agent_type": skill.agent_type,
        "version": skill.version,
    }


@router.get("/{skill_id}")
async def get_skill(
    skill_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return {
        "id": skill.id,
        "name": skill.name,
        "description": skill.description,
        "agent_type": skill.agent_type,
        "system_prompt": skill.system_prompt,
        "tools": skill.tools,
        "env_template": skill.env_template,
        "image": skill.image,
        "max_runtime": skill.max_runtime,
        "version": skill.version,
        "created_at": _dt(skill.created_at),
        "updated_at": _dt(skill.updated_at),
    }


@router.put("/{skill_id}")
async def update_skill(
    skill_id: int,
    data: SkillUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SkillService(db)
    skill = await svc.update_skill(
        skill_id,
        name=data.name,
        description=data.description,
        system_prompt=data.system_prompt,
        tools=json.dumps(data.tools) if data.tools else None,
        env_template=json.dumps(data.env_template) if data.env_template else None,
        image=data.image,
        max_runtime=data.max_runtime,
    )
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="skill.update",
        resource_type="skill",
        resource_id=str(skill.id),
    )

    return {"id": skill.id, "name": skill.name, "version": skill.version}


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SkillService(db)
    deleted = await svc.delete_skill(skill_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Skill not found")

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="skill.delete",
        resource_type="skill",
        resource_id=str(skill_id),
    )

    return {"message": "Skill deleted"}


class SkillExecuteRequest(BaseModel):
    prompt: str | None = None
    target_repos: list[str] | None = None
    env_vars: dict | None = None


@router.post("/{skill_id}/execute")
async def execute_skill(
    skill_id: int,
    data: SkillExecuteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    prompt = await svc.render_prompt(skill, data.prompt or "")
    env_vars = data.env_vars or {}
    if skill.env_template:
        raw = skill.env_template
        skill_env = json.loads(raw) if isinstance(raw, str) else (raw or {})
        env_vars = {**skill_env, **env_vars}

    agent_run = AgentRun(
        user_id=user.id,
        skill_id=skill_id,
        agent_type=skill.agent_type,
        prompt=prompt,
        target_repos=json.dumps(data.target_repos or []),
        env_vars=json.dumps(env_vars),
        image=skill.image,
        max_runtime=skill.max_runtime or 3600,
        status=AgentStatus.PENDING,
    )
    db.add(agent_run)
    await db.commit()
    await db.refresh(agent_run)

    asyncio.create_task(_run_skill_background(agent_run.id))

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="skill.execute",
        resource_type="agent_run",
        resource_id=str(agent_run.id),
        details=f"Executed skill: {skill.name}",
    )

    return {
        "id": agent_run.id,
        "agent_type": agent_run.agent_type,
        "status": agent_run.status.value,
        "message": f"Skill '{skill.name}' launched",
    }


async def _run_skill_background(agent_id: int):

    from sqlalchemy import select

    from app.core.database import async_session as new_session
    from app.services.agent_runner import get_runner

    try:
        async with new_session() as session:
            result = await session.execute(select(AgentRun).where(AgentRun.id == agent_id))
            agent = result.scalar_one_or_none()
            if agent:
                runner = get_runner(agent, session)
                await runner.run()
    except Exception as e:
        async with new_session() as session:
            result = await session.execute(select(AgentRun).where(AgentRun.id == agent_id))
            agent = result.scalar_one_or_none()
            if agent:
                agent.status = AgentStatus.FAILED
                agent.error = f"{type(e).__name__}: {e}"
                from datetime import datetime

                agent.finished_at = datetime.now(timezone.utc)
                await session.commit()


def _dt(val) -> str | None:
    return val.isoformat() if val else None

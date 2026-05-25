from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.n8n_service import N8nService

router = APIRouter(prefix="/api/n8n-agents", tags=["n8n"])


class N8nAgentCreate(BaseModel):
    name: str
    description: str
    webhook_url: str
    keywords: str | None = None


class N8nAgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    webhook_url: str | None = None
    keywords: str | None = None


def _serialize(agent):
    return {
        "id": agent.id,
        "name": agent.name,
        "description": agent.description,
        "webhook_url": agent.webhook_url,
        "keywords": agent.keywords or "",
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
    }


@router.get("")
async def list_n8n_agents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = N8nService(db)
    agents = await svc.list_agents(user.id)
    return [_serialize(a) for a in agents]


@router.post("")
async def create_n8n_agent(
    data: N8nAgentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = N8nService(db)
    agent = await svc.create_agent(
        user_id=user.id,
        name=data.name,
        description=data.description,
        webhook_url=data.webhook_url,
        keywords=data.keywords,
    )
    return _serialize(agent)


@router.put("/{agent_id}")
async def update_n8n_agent(
    agent_id: int,
    data: N8nAgentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = N8nService(db)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    agent = await svc.update_agent(agent_id, user.id, **updates)
    if not agent:
        raise HTTPException(status_code=404, detail="n8n agent not found")
    return _serialize(agent)


@router.delete("/{agent_id}")
async def delete_n8n_agent(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = N8nService(db)
    deleted = await svc.delete_agent(agent_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="n8n agent not found")
    return {"message": "n8n agent deleted"}


class WebhookCallRequest(BaseModel):
    agent_id: int
    session_id: str = ""
    user_question: str = ""
    payload: dict = {}


@router.post("/call")
async def call_n8n_webhook(
    data: WebhookCallRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = N8nService(db)
    agent = await svc.get_agent(data.agent_id, user.id)
    if not agent:
        raise HTTPException(status_code=404, detail="n8n agent not found")
    webhook_payload = {
        "session_id": data.session_id,
        "user_question": data.user_question,
        **data.payload,
    }
    return await svc.call_webhook(agent.webhook_url, webhook_payload)

import httpx

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.n8n_agent import N8nAgent


class N8nService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_agents(self, user_id: int) -> list[N8nAgent]:
        result = await self.db.execute(
            select(N8nAgent).where(N8nAgent.user_id == user_id).order_by(N8nAgent.name)
        )
        return result.scalars().all()

    async def get_agent(self, agent_id: int, user_id: int) -> N8nAgent | None:
        result = await self.db.execute(
            select(N8nAgent).where(N8nAgent.id == agent_id, N8nAgent.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_agent(
        self,
        user_id: int,
        name: str,
        description: str,
        webhook_url: str,
        keywords: str | None = None,
    ) -> N8nAgent:
        agent = N8nAgent(
            user_id=user_id,
            name=name,
            description=description,
            webhook_url=webhook_url,
            keywords=keywords,
        )
        self.db.add(agent)
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def update_agent(
        self, agent_id: int, user_id: int, **kwargs
    ) -> N8nAgent | None:
        agent = await self.get_agent(agent_id, user_id)
        if not agent:
            return None
        for key, value in kwargs.items():
            if hasattr(agent, key) and value is not None:
                setattr(agent, key, value)
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def delete_agent(self, agent_id: int, user_id: int) -> bool:
        result = await self.db.execute(
            delete(N8nAgent).where(N8nAgent.id == agent_id, N8nAgent.user_id == user_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def call_webhook(self, webhook_url: str, payload: dict, timeout: int = 60) -> dict:
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                resp = await client.post(webhook_url, json=payload)
                return {
                    "status": resp.status_code,
                    "body": resp.text,
                }
            except Exception as e:
                return {
                    "status": 0,
                    "body": f"n8n webhook call failed: {type(e).__name__}: {e}",
                }

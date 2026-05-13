import json

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.skill import Skill


class SkillService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_skills(self, user_id: int) -> list[Skill]:
        result = await self.db.execute(select(Skill).where(Skill.user_id == user_id).order_by(Skill.name))
        return result.scalars().all()

    async def get_skill(self, skill_id: int) -> Skill | None:
        result = await self.db.execute(select(Skill).where(Skill.id == skill_id))
        return result.scalar_one_or_none()

    async def create_skill(
        self,
        user_id: int,
        name: str,
        description: str,
        agent_type: str,
        system_prompt: str | None = None,
        tools: list[str] | None = None,
        env_template: dict | None = None,
        image: str | None = None,
        max_runtime: int = 3600,
    ) -> Skill:
        skill = Skill(
            user_id=user_id,
            name=name,
            description=description,
            agent_type=agent_type,
            system_prompt=system_prompt,
            tools=json.dumps(tools or []),
            env_template=json.dumps(env_template or {}),
            image=image,
            max_runtime=max_runtime,
        )
        self.db.add(skill)
        await self.db.commit()
        await self.db.refresh(skill)
        return skill

    async def update_skill(self, skill_id: int, **kwargs) -> Skill | None:
        skill = await self.get_skill(skill_id)
        if not skill:
            return None
        for key, value in kwargs.items():
            if hasattr(skill, key) and value is not None:
                setattr(skill, key, value)
        skill.version += 1
        await self.db.commit()
        await self.db.refresh(skill)
        return skill

    async def delete_skill(self, skill_id: int) -> bool:
        result = await self.db.execute(delete(Skill).where(Skill.id == skill_id))
        await self.db.commit()
        return result.rowcount > 0

    async def render_prompt(self, skill: Skill, user_input: str) -> str:
        prompt = user_input
        if skill.system_prompt:
            prompt = f"{skill.system_prompt}\n\n{user_input}"
        return prompt

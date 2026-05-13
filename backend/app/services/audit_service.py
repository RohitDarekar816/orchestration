from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        user_id: int = None,
        action: str = None,
        resource_type: str = None,
        resource_id: str = None,
        details: str = None,
        ip_address: str = None,
    ):
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )
        self.db.add(entry)
        await self.db.commit()

    async def list_logs(self, limit: int = 100) -> list[AuditLog]:
        result = await self.db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
        return result.scalars().all()

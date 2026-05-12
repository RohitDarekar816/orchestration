from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.secret_service import SecretService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/secrets", tags=["secrets"])


class SecretCreate(BaseModel):
    name: str
    value: str
    scope: str = "user"


@router.get("")
async def list_secrets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SecretService(db)
    secrets = await svc.list_secrets(user.id)
    return [
        {"id": s.id, "name": s.name, "scope": s.scope, "created_at": s.created_at.isoformat() if s.created_at else None}
        for s in secrets
    ]


@router.post("")
async def create_secret(
    data: SecretCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SecretService(db)
    secret = await svc.create_secret(
        user_id=user.id,
        name=data.name,
        value=data.value,
        scope=data.scope,
    )

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="secret.create",
        resource_type="secret",
        resource_id=str(secret.id),
    )

    return {"id": secret.id, "name": secret.name, "scope": secret.scope}


@router.delete("/{secret_id}")
async def delete_secret(
    secret_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SecretService(db)
    deleted = await svc.delete_secret(secret_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Secret not found")

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="secret.delete",
        resource_type="secret",
        resource_id=str(secret_id),
    )

    return {"message": "Secret deleted"}

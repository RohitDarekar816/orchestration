import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.server_service import ServerService

router = APIRouter(prefix="/api/servers", tags=["servers"])


class ServerCreate(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str
    auth_type: str  # "key" or "password"
    ssh_key_secret_id: int | None = None
    ssh_password_secret_id: int | None = None
    tags: list[str] | None = None
    description: str | None = None


class ServerUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    username: str | None = None
    auth_type: str | None = None
    ssh_key_secret_id: int | None = None
    ssh_password_secret_id: int | None = None
    tags: list[str] | None = None
    description: str | None = None


def _serialize(server):
    return {
        "id": server.id,
        "name": server.name,
        "host": server.host,
        "port": server.port,
        "username": server.username,
        "auth_type": server.auth_type,
        "ssh_key_secret_id": server.ssh_key_secret_id,
        "ssh_password_secret_id": server.ssh_password_secret_id,
        "tags": json.loads(server.tags) if server.tags else [],
        "description": server.description,
        "created_at": server.created_at.isoformat() if server.created_at else None,
        "updated_at": server.updated_at.isoformat() if server.updated_at else None,
    }


@router.get("")
async def list_servers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ServerService(db)
    servers = await svc.list_servers(user.id)
    return [_serialize(s) for s in servers]


@router.post("")
async def create_server(
    data: ServerCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.auth_type not in ("key", "password"):
        raise HTTPException(status_code=400, detail="auth_type must be 'key' or 'password'")
    if data.auth_type == "key" and not data.ssh_key_secret_id:
        raise HTTPException(status_code=400, detail="ssh_key_secret_id required for key auth")
    if data.auth_type == "password" and not data.ssh_password_secret_id:
        raise HTTPException(status_code=400, detail="ssh_password_secret_id required for password auth")

    svc = ServerService(db)
    server = await svc.create_server(
        user_id=user.id,
        name=data.name,
        host=data.host,
        port=data.port,
        username=data.username,
        auth_type=data.auth_type,
        ssh_key_secret_id=data.ssh_key_secret_id,
        ssh_password_secret_id=data.ssh_password_secret_id,
        tags=data.tags,
        description=data.description,
    )

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="server.create",
        resource_type="server",
        resource_id=str(server.id),
        details=f"Registered server '{data.name}' ({data.host})",
    )

    return _serialize(server)


@router.get("/{server_id}")
async def get_server(
    server_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ServerService(db)
    server = await svc.get_server(server_id, user.id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return _serialize(server)


@router.put("/{server_id}")
async def update_server(
    server_id: int,
    data: ServerUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ServerService(db)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "tags" in updates:
        updates["tags"] = json.dumps(updates["tags"])
    server = await svc.update_server(server_id, user.id, **updates)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="server.update",
        resource_type="server",
        resource_id=str(server_id),
    )

    return _serialize(server)


@router.delete("/{server_id}")
async def delete_server(
    server_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ServerService(db)
    deleted = await svc.delete_server(server_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Server not found")

    audit = AuditService(db)
    await audit.log(
        user_id=user.id,
        action="server.delete",
        resource_type="server",
        resource_id=str(server_id),
    )

    return {"message": "Server deleted"}

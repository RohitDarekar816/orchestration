import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.proxmox_endpoint import ProxmoxEndpoint
from app.models.secret import Secret
from app.models.user import User
from app.services.secret_service import SecretService

router = APIRouter(prefix="/api/proxmox-endpoints", tags=["proxmox-endpoints"])


class ProxmoxEndpointCreate(BaseModel):
    name: str
    api_url: str
    default_node: str = "pve"
    api_token: str  # plaintext at creation time — stored encrypted in secrets vault
    description: str | None = None


class ProxmoxEndpointUpdate(BaseModel):
    name: str | None = None
    api_url: str | None = None
    default_node: str | None = None
    api_token: str | None = None
    description: str | None = None


def _serialize(ep: ProxmoxEndpoint) -> dict:
    return {
        "id": ep.id,
        "name": ep.name,
        "api_url": ep.api_url,
        "default_node": ep.default_node,
        "token_secret_id": ep.token_secret_id,
        "description": ep.description,
        "created_at": ep.created_at.isoformat() if ep.created_at else None,
        "updated_at": ep.updated_at.isoformat() if ep.updated_at else None,
    }


@router.get("")
async def list_endpoints(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProxmoxEndpoint)
        .where(ProxmoxEndpoint.user_id == user.id)
        .order_by(ProxmoxEndpoint.created_at.desc())
    )
    return [_serialize(ep) for ep in result.scalars().all()]


@router.post("", status_code=201)
async def create_endpoint(
    req: ProxmoxEndpointCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SecretService(db)
    secret = await svc.create_secret(
        user_id=user.id,
        name=f"proxmox-token-{req.name}",
        value=req.api_token,
        scope="proxmox",
    )

    ep = ProxmoxEndpoint(
        user_id=user.id,
        name=req.name,
        api_url=req.api_url.rstrip("/"),
        default_node=req.default_node,
        token_secret_id=secret.id,
        description=req.description,
    )
    db.add(ep)
    await db.commit()
    await db.refresh(ep)
    return _serialize(ep)


@router.get("/{endpoint_id}")
async def get_endpoint(
    endpoint_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProxmoxEndpoint).where(
            ProxmoxEndpoint.id == endpoint_id,
            ProxmoxEndpoint.user_id == user.id,
        )
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Proxmox endpoint not found")
    return _serialize(ep)


@router.patch("/{endpoint_id}")
async def update_endpoint(
    endpoint_id: int,
    req: ProxmoxEndpointUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProxmoxEndpoint).where(
            ProxmoxEndpoint.id == endpoint_id,
            ProxmoxEndpoint.user_id == user.id,
        )
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Proxmox endpoint not found")

    if req.name is not None:
        ep.name = req.name
    if req.api_url is not None:
        ep.api_url = req.api_url.rstrip("/")
    if req.default_node is not None:
        ep.default_node = req.default_node
    if req.description is not None:
        ep.description = req.description

    if req.api_token is not None:
        svc = SecretService(db)
        if ep.token_secret_id:
            # Update the existing secret value
            secret_result = await db.execute(select(Secret).where(Secret.id == ep.token_secret_id))
            secret = secret_result.scalar_one_or_none()
            if secret:
                secret.value_encrypted = svc.cipher.encrypt(req.api_token.encode()).decode()
        else:
            new_secret = await svc.create_secret(
                user_id=user.id,
                name=f"proxmox-token-{ep.name}",
                value=req.api_token,
                scope="proxmox",
            )
            ep.token_secret_id = new_secret.id

    await db.commit()
    await db.refresh(ep)
    return _serialize(ep)


class ProxmoxTestRequest(BaseModel):
    api_url: str
    api_token: str


@router.post("/test")
async def test_endpoint(
    req: ProxmoxTestRequest,
    user: User = Depends(get_current_user),
):
    """Test connectivity to a Proxmox API endpoint."""
    url = req.api_url.rstrip("/") + "/version"
    try:
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            r = await client.get(url, headers={"Authorization": f"PVEAPIToken={req.api_token}"})
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Proxmox API returned HTTP {r.status_code}")
        data = r.json().get("data", {})
        return {
            "ok": True,
            "version": data.get("version"),
            "release": data.get("release"),
            "repoid": data.get("repoid"),
        }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Connection timed out after 8 seconds")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Connection failed: {e}")


@router.delete("/{endpoint_id}", status_code=204)
async def delete_endpoint(
    endpoint_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProxmoxEndpoint).where(
            ProxmoxEndpoint.id == endpoint_id,
            ProxmoxEndpoint.user_id == user.id,
        )
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Proxmox endpoint not found")
    await db.delete(ep)
    await db.commit()

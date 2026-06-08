from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.docker_endpoint import DockerEndpoint
from app.models.user import User

router = APIRouter(prefix="/api/docker-endpoints", tags=["docker-endpoints"])


class DockerEndpointCreate(BaseModel):
    name: str
    api_url: str
    description: str | None = None


class DockerEndpointUpdate(BaseModel):
    name: str | None = None
    api_url: str | None = None
    description: str | None = None


def _serialize(ep: DockerEndpoint) -> dict:
    return {
        "id": ep.id,
        "name": ep.name,
        "api_url": ep.api_url,
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
        select(DockerEndpoint)
        .where(DockerEndpoint.user_id == user.id)
        .order_by(DockerEndpoint.created_at.desc())
    )
    return [_serialize(ep) for ep in result.scalars().all()]


@router.post("", status_code=201)
async def create_endpoint(
    req: DockerEndpointCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ep = DockerEndpoint(
        user_id=user.id,
        name=req.name,
        api_url=req.api_url,
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
        select(DockerEndpoint).where(
            DockerEndpoint.id == endpoint_id,
            DockerEndpoint.user_id == user.id,
        )
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Docker endpoint not found")
    return _serialize(ep)


@router.patch("/{endpoint_id}")
async def update_endpoint(
    endpoint_id: int,
    req: DockerEndpointUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DockerEndpoint).where(
            DockerEndpoint.id == endpoint_id,
            DockerEndpoint.user_id == user.id,
        )
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Docker endpoint not found")
    if req.name is not None:
        ep.name = req.name
    if req.api_url is not None:
        ep.api_url = req.api_url
    if req.description is not None:
        ep.description = req.description
    await db.commit()
    await db.refresh(ep)
    return _serialize(ep)


@router.delete("/{endpoint_id}", status_code=204)
async def delete_endpoint(
    endpoint_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DockerEndpoint).where(
            DockerEndpoint.id == endpoint_id,
            DockerEndpoint.user_id == user.id,
        )
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Docker endpoint not found")
    await db.delete(ep)
    await db.commit()

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.models.user import User

router = APIRouter(prefix="/api/leon", tags=["leon"])

settings = get_settings()


def _leon_headers() -> dict:
    return {
        "x-api-key": settings.leon_http_api_key,
        "Content-Type": "application/json",
    }


class LeonModelUpdate(BaseModel):
    target: str  # e.g. "groq/llama-3.1-8b-instant"


@router.get("/config")
async def get_leon_config(_: User = Depends(get_current_user)):
    """Return the current Leon LLM provider and model from Leon's /info endpoint."""
    url = f"{settings.leon_http_url.rstrip('/')}/api/v1/info"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=_leon_headers())
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Leon returned {resp.status_code}")
        data = resp.json()
        llm = data.get("llm", {})
        return {
            "provider": llm.get("provider", ""),
            "model": llm.get("model", ""),
            "target_value": llm.get("targetValue", ""),
            "workflow_provider": llm.get("workflowProvider", ""),
            "workflow_model": llm.get("workflowModel", ""),
            "enabled": llm.get("enabled", False),
        }
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach Leon: {e}")


@router.put("/config")
async def update_leon_config(
    body: LeonModelUpdate,
    _: User = Depends(get_current_user),
):
    """Switch Leon's active LLM at runtime via /llm/switch. No restart required."""
    url = f"{settings.leon_http_url.rstrip('/')}/api/v1/llm/switch"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json={"target": body.target}, headers=_leon_headers())
        if resp.status_code != 200:
            raise HTTPException(
                status_code=resp.status_code,
                detail=resp.json().get("message", f"Leon returned {resp.status_code}"),
            )
        return resp.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach Leon: {e}")

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import init_db
from app.models import server as _server_model  # noqa: F401 — ensures table is created
from app.models import agent_command_audit as _agent_command_audit  # noqa: F401
from app.models import docker_endpoint as _docker_endpoint_model  # noqa: F401 — ensures table is created
from app.models import proxmox_endpoint as _proxmox_endpoint_model  # noqa: F401 — ensures table is created
from app.routes import agents, auth, chat, dashboard, docker_endpoints, leon_config, n8n_agents, proxmox_endpoints, schedules, secrets, servers, skills

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(skills.router)
app.include_router(schedules.router)
app.include_router(secrets.router)
app.include_router(servers.router)
app.include_router(chat.router)
app.include_router(dashboard.router)
app.include_router(n8n_agents.router)
app.include_router(docker_endpoints.router)
app.include_router(proxmox_endpoints.router)
app.include_router(leon_config.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}

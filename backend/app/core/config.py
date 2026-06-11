from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Oz"
    debug: bool = False
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    database_url: str = "sqlite+aiosqlite:///./oz.db"
    redis_url: str = "redis://localhost:6379/0"

    docker_host: str = "unix:///var/run/docker.sock"
    agent_work_dir: str = "/tmp/oz/agents"
    max_agent_runtime_seconds: int = 3600
    max_agent_cost_usd: float = 50.0
    oz_runner: str = "local"
    # "host" shares the host network stack so VPN routes are reachable from the
    # container. Use "bridge" if you prefer network isolation and don't need VPN.
    oz_agent_network: str = "host"

    oz_opencode_model: str = "openai/gpt-4o-mini"
    oz_nvidia_api_key: str = ""
    oz_github_token: str = ""

    allowed_agents: list[str] = [
        "claude-code", "codex", "gemini-cli", "opencode", "custom", "github",
        "commandcode", "oz-local",
        # Specialized opencode-based agents (system prompt injected per type)
        "docker_agent", "k8s_agent", "linux_agent", "code_review", "git_agent",
        # Cloudflare edge agents
        "cloudflare_docker_agent",
        "cloudflare_server_health_agent",
        "cloudflare_proxmox_agent",
    ]
    oz_commandcode_api_key: str = ""
    # URL of a persistent `opencode serve` instance to attach to instead of cold-starting.
    # Eliminates per-run startup overhead. Leave empty to use cold-start (default).
    oz_opencode_server_url: str = ""

    # Cloudflare Docker Agent — deployed Worker URL.
    # Set to the wrangler-deployed URL, e.g. https://cf-docker-agent.<account>.workers.dev
    cf_docker_agent_url: str = ""

    # Cloudflare Server Health Agent — deployed Worker URL.
    cf_server_health_agent_url: str = ""

    # Cloudflare Proxmox Agent — deployed Worker URL.
    cf_proxmox_agent_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

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

    # Local llama-cpp server for opencode agents (OpenAI-compatible API).
    # Set to empty string to disable local LLM injection (agents must supply their own keys).
    oz_llamacpp_url: str = ""
    oz_opencode_model: str = "openai/gpt-4o-mini"
    oz_nvidia_api_key: str = ""

    allowed_agents: list[str] = ["claude-code", "codex", "gemini-cli", "opencode", "custom"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

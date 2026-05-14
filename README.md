# Oz — In-House Agent Orchestration Platform

Launch, schedule, and observe AI coding agents (Claude Code, Codex, Gemini CLI, OpenCode, custom) from a unified control plane. Oz pairs with [Leon](https://getleon.ai), an open-source personal assistant, to provide a natural-language interface for infrastructure management and agent orchestration.

## Quick Start (Docker)

```bash
cd docker
# Build the oz-agent image first (one-time)
docker compose --profile build build oz-agent
# Start the full stack
docker compose up -d
```

| Service | URL | Purpose |
|---------|-----|---------|
| **Web UI** | http://localhost:8090 | Agent dashboard & server management |
| **API** | http://localhost:8000/docs | FastAPI backend with Swagger docs |
| **Leon Chat** | Requires WebSocket client | AI assistant for natural-language queries |

Default admin credentials (auto-seeded): `admin@oz.local` / `admin123`

### Services

| Container | Role |
|-----------|------|
| `api` | FastAPI control plane — agents, servers, secrets, scheduling |
| `web` | nginx proxy serving static UI + proxying API requests |
| `worker` | Celery worker for async tasks |
| `beat` | Celery beat for cron-based scheduling |
| `db` | PostgreSQL 16 |
| `redis` | Redis 7 (broker/cache) |
| `leon` | Leon AI assistant — NLU, routing, skill execution |
| `llama-cpp` | Local LLM inference (optional fallback) |
| `oz-agent` | Agent runtime sandbox (spawned on demand) |

## Architecture

```
┌────────────────────────────────────────────────┐
│  User Interfaces                               │
│  Web Dashboard   CLI (oz)   Chat (Leon)   API  │
└────────────────────┬───────────────────────────┘
                     │
┌────────────────────▼───────────────────────────┐
│  Leon AI Assistant                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │   NLU    │  │  Skill   │  │ Action LLM   │ │
│  │ Pipeline │──▶│ Router   │──▶│ (OpenRouter) │ │
│  └──────────┘  └────┬─────┘  └──────┬───────┘ │
│                     │               │          │
│              ┌──────▼───────┐  ┌────▼───────┐  │
│              │ oz_skill     │  │ NotFound   │  │
│              │ actions:     │  │ Auto-route │  │
│              │ • launch_    │  │ to oz_skill│  │
│              │   agent      │  │ launch_    │  │
│              │ • server_    │  │ agent      │  │
│              │   health     │  └────────────┘  │
│              │ • docker_    │                   │
│              │   logs       │                   │
│              │ • run_bash   │                   │
│              └──────┬───────┘                   │
└─────────────────────┼───────────────────────────┘
                      │ POST /api/agents/launch
                      │ (server_id, prompt, agent_type)
┌─────────────────────▼───────────────────────────┐
│  Oz Control Plane (FastAPI / PostgreSQL)        │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ Agent    │ │ Server   │ │ Secrets Manager │  │
│  │ Launcher │ │ Registry │ │ (HashiCorp Vault │  │
│  │ + Poll   │ │ + SSH    │ │  encrypted)     │  │
│  │          │ │ Creds    │ │                 │  │
│  └────┬─────┘ └──────────┘ └─────────────────┘  │
│       │                                          │
│  ┌────▼─────┐                                    │
│  │ Audit    │                                    │
│  │ Trail    │                                    │
│  └──────────┘                                    │
└─────────────────────┼───────────────────────────┘
                      │ docker run
┌─────────────────────▼───────────────────────────┐
│  Agent Runtime (Docker sandbox per launch)      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │OpenCode  │ │Claude    │ │ Gemini CLI /     │ │
│  │(default) │ │Code      │ │ Codex / custom   │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Key Features

- **Multi-agent support**: OpenCode (default), Claude Code, Codex, Gemini CLI, or custom agents
- **Natural-language infrastructure queries**: Ask Leon "how many containers on server X?" — routes through NLU → triggers agent with SSH credentials injected securely
- **NLU routing pipeline**: Leon's controlled-mode NLU parses utterances, an action-calling LLM extracts entities, then executes the matched Oz skill action
- **Automatic server context**: Mention a server name in your query → Oz resolves it, injects SSH credentials as env vars, and prepends connection instructions to the agent's prompt
- **Server management UI**: Register servers with password or SSH key auth, credentials stored as encrypted secrets
- **Skills**: Reusable, versioned agent configurations
- **Scheduling**: Cron-based agent automation via Celery beat
- **Secrets management**: Encrypted credential storage (HashiCorp Vault)
- **Observability**: Full session logging and audit trail
- **Security**: Agent preamble forbids credential leakage; SSH passwords/keys never appear in agent output

## How It Works

### Natural Language → Agent Launch

```
You: "how many docker containers are running on AIT5252?"

Leon NLU → Action LLM → NotFound auto-route
  → launch_agent action
  → findServerInUtterance("AIT5252") → server_id=1
  → POST /api/agents/launch { server_id: 1, agent_type: "opencode" }
  → Oz injects OZ_SSH_HOST, OZ_SSH_USER, OZ_SSH_PASSWORD as env vars
  → Prepends server context to prompt:
      ## Target Server
      - Name: AIT5252  - Host: 20.2.251.79  - Port: 22  - User: rohit
  → OpenCode agent connects via SSH and runs commands
  → Returns: "10 containers are running on AIT5252."
```

### Agent Launch API

```bash
curl -X POST http://localhost:8000/api/agents/launch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "opencode",
    "prompt": "Check disk usage on the server",
    "server_id": 1,
    "max_runtime": 300
  }'
```

### Server Registration

Servers can be registered via the Web UI (http://localhost:8090) or the API:

```bash
curl -X POST http://localhost:8000/api/servers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production-web",
    "host": "10.0.1.50",
    "port": 22,
    "username": "deploy",
    "auth_type": "password",
    "ssh_password": "your-password-here"
  }'
```

## Project Layout

```
oz/
├── backend/        # FastAPI control plane
│   └── app/
│       ├── routes/         # API endpoints
│       ├── services/       # Business logic, agent runner, server service
│       ├── models/         # SQLAlchemy models
│       └── worker/         # Celery tasks
├── leon/                   # Leon AI assistant (submodule)
│   └── skills/native/
│       └── oz_skill/       # Oz skill — NLU actions for agent orchestration
│           ├── skill.json  # Action definitions, parameters, utterance samples
│           ├── src/actions/ # Action implementations (TypeScript)
│           └── src/lib/    # Shared utilities (Oz client, server resolution)
├── docker/                 # Docker Compose stack
│   ├── docker-compose.yml
│   ├── .env               # API keys (OpenRouter, etc.)
│   ├── agent/             # oz-agent Docker image
│   └── leon/              # Leon Dockerfile
├── web/                    # Static web dashboard
│   └── index.html         # Single-page app (servers, agents, settings)
├── cli/                   # Python CLI (pip-installable)
└── scripts/               # Utility scripts
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | OpenRouter API key for Leon's action-calling LLM |
| `LEON_ROUTING_MODE` | `controlled` | NLU routing mode: `controlled` (deterministic) or `smart` (LLM) |
| `LEON_LLM` | `openrouter/meta-llama/llama-3.1-8b-instruct` | LLM provider for Leon |
| `OZ_DEFAULT_AGENT_TYPE` | `opencode` | Default agent when none specified |
| `OZ_DEFAULT_MAX_RUNTIME` | `300` | Default agent max runtime in seconds |
| `OZ_RUNNER` | `docker` | Agent runner: `docker` (sandboxed) or `local` |
| `DATABASE_URL` | `postgresql+asyncpg://oz:oz@db:5432/oz` | PostgreSQL connection string |
| `SECRET_KEY` | `change-me-in-production` | JWT signing key |

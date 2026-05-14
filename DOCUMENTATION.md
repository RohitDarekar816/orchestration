# Oz — AI Agent Orchestration Platform

> An intelligent infrastructure management platform that lets you control servers, run deployments, inspect logs, and manage Docker containers through natural language conversation.

---

## Table of Contents

1. [What is Oz?](#1-what-is-oz)
2. [Key Features](#2-key-features)
3. [Architecture Overview](#3-architecture-overview)
4. [How It Works — End-to-End Flow](#4-how-it-works--end-to-end-flow)
5. [Services & Components](#5-services--components)
6. [Agent Types](#6-agent-types)
7. [Leon Skill — Natural Language Actions](#7-leon-skill--natural-language-actions)
8. [API Reference](#8-api-reference)
9. [Data Models](#9-data-models)
10. [Security & Access Control](#10-security--access-control)
11. [Configuration & Environment Variables](#11-configuration--environment-variables)
12. [Deployment Guide](#12-deployment-guide)
13. [Project Structure](#13-project-structure)
14. [Tech Stack](#14-tech-stack)

---

## 1. What is Oz?

**Oz** is an open-source AI agent orchestration platform built for DevOps and infrastructure teams. It bridges the gap between natural language and real infrastructure actions — letting engineers manage servers, deploy applications, check logs, and monitor Docker containers through a conversational interface.

Instead of memorising SSH commands or CLI flags, you simply talk to **Leon** (your AI assistant) in plain English:

> *"How many Docker containers are running on the production server?"*
> *"Deploy the project at /var/www/api on prod-web and restart the service."*
> *"Show me the last 50 nginx error logs filtered by 502."*

Leon understands your intent, extracts the relevant parameters, launches the appropriate AI agent in an isolated Docker container, and reports back with a clean, human-readable answer.

---

## 2. Key Features

| Feature | Description |
|---------|-------------|
| **Natural Language Interface** | Talk to Leon in plain English — no commands to memorise |
| **Multi-Agent Support** | Pluggable AI agents: OpenCode, Claude Code, Codex, Gemini CLI, or custom |
| **Server Management** | Register SSH servers; agents automatically receive credentials |
| **Secrets Vault** | Encrypted storage for SSH keys, passwords, and API keys |
| **Skill Library** | Save reusable agent configurations with custom prompts and tools |
| **Cron Scheduling** | Schedule recurring agent runs (e.g., nightly health checks) |
| **Real-time Streaming** | WebSocket log streaming as agents run |
| **Audit Trail** | Full log of every action, who triggered it, and when |
| **Role-Based Access** | Admin and member roles with per-user resource isolation |
| **Free LLM Models** | Uses OpenCode's free models by default — no paid API keys required |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER                                        │
│                    (Browser or Chat)                                 │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────┐          ┌───────────────────────┐
│     Oz Web UI        │          │    Leon AI Assistant  │
│   (Nginx :8090)      │          │    (Node.js :5366)    │
│                      │          │                       │
│  • Agent dashboard   │          │  • NLU skill routing  │
│  • Server registry   │          │  • oz_skill actions   │
│  • Secrets vault     │          │  • Groq LLM backend   │
│  • Schedule manager  │          │  • HTTP API support   │
└──────────┬───────────┘          └──────────┬────────────┘
           │                                  │
           └──────────────┬───────────────────┘
                          │ REST API
                          ▼
          ┌───────────────────────────────┐
          │       Oz FastAPI Backend      │
          │         (Python :8000)        │
          │                               │
          │  • Authentication (JWT)       │
          │  • Agent lifecycle mgmt       │
          │  • Server & secret services   │
          │  • WebSocket log streaming    │
          │  • Audit logging              │
          └──────────────┬────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
  ┌────────────┐  ┌────────────┐  ┌────────────────────┐
  │ PostgreSQL │  │   Redis    │  │  Docker Engine     │
  │   (DB)    │  │  (Queue)   │  │                    │
  └────────────┘  └────────────┘  │  ┌──────────────┐ │
                        │         │  │  oz-agent    │ │
                        ▼         │  │  container   │ │
                 ┌────────────┐   │  │              │ │
                 │  Celery    │   │  │  OpenCode /  │ │
                 │  Worker    │───┼─▶│  Claude Code │ │
                 │  + Beat    │   │  │  / SSH / Git │ │
                 └────────────┘   │  └──────────────┘ │
                                  │         │          │
                                  └─────────┼──────────┘
                                            │ SSH
                                            ▼
                                  ┌──────────────────┐
                                  │  Remote Servers  │
                                  │ (prod, staging,  │
                                  │   dev, etc.)     │
                                  └──────────────────┘
```

---

## 4. How It Works — End-to-End Flow

Here is a complete walkthrough of what happens when a user asks:

> *"How many Docker containers are running on the production server?"*

### Step 1 — User Sends Message to Leon

The user types their question in the Leon chat interface (web UI or HTTP API). Leon receives the utterance and begins processing it.

### Step 2 — Leon Routes to the Correct Action

Leon's NLU pipeline (powered by Groq's `llama-3.1-8b-instant` at ~2 seconds) identifies the intent and maps it to the `docker_logs` action in the `oz_skill`. It extracts parameters:
- **action**: `docker_logs`
- **server**: `production`

### Step 3 — Leon Calls the Oz API

The `docker_logs` action:
1. Authenticates with the Oz API (email/password → JWT token)
2. Looks up the server named "production" via `GET /api/servers`
3. Builds a structured prompt including SSH connection instructions
4. Calls `POST /api/agents/launch` with the prompt and server ID

### Step 4 — Oz API Launches an Agent

The FastAPI backend:
1. Fetches the server's credentials from the encrypted secrets vault
2. Injects them as environment variables (`OZ_SSH_HOST`, `OZ_SSH_USER`, `OZ_SSH_PASSWORD`)
3. Creates an `AgentRun` database record
4. Spawns an `oz-agent` Docker container with the prompt and credentials

### Step 5 — Agent Executes the Task

Inside the isolated Docker container, OpenCode (using `opencode/deepseek-v4-flash-free`, a free model):
1. Receives the SSH credentials via environment variables
2. SSHes into the production server using `sshpass`
3. Runs `docker ps -a` to list containers
4. Generates a clean, human-readable summary

### Step 6 — Result Returns to the User

The container exits, Oz collects stdout, stores it in the database, and Leon polls for completion. Leon then presents the answer:

> *"There are 13 Docker containers running on the production server."*

**Total time: ~35-45 seconds** (2s routing + ~35s agent execution)

---

## 5. Services & Components

| Service | Port | Technology | Purpose |
|---------|------|-----------|---------|
| **api** | 8000 | FastAPI + Uvicorn | REST API and WebSocket backend |
| **web** | 8090 | Nginx | Serves the static web UI |
| **worker** | — | Celery | Executes async background agent tasks |
| **beat** | — | Celery Beat | Triggers scheduled cron-based agent runs |
| **db** | 5432 | PostgreSQL 16 | Primary relational data store |
| **redis** | 6379 | Redis 7 | Task broker and cache |
| **leon** | 5366 | Node.js | AI assistant — NLU, skill routing, response |
| **llama-cpp** | 11435 | llama.cpp | Optional local LLM inference (offline fallback) |
| **oz-agent** | — | Debian 12 | On-demand sandbox container for agent execution |

### oz-agent Container

The `oz-agent` container is not a long-running service — it is spawned on demand by the API for each agent run. It includes:

- **AI Agent CLIs**: OpenCode, Claude Code, Codex, Gemini CLI
- **System Tools**: SSH client, sshpass, Docker CLI, Git, curl, jq, htop, net-tools
- **Runtimes**: Python 3, Node.js 20, npm
- **Security**: Ephemeral tmpfs workspace (`/workspace`), isolated from host filesystem
- **Networking**: Host network mode (VPN routes on host are accessible)
- **Resource Limits**: 4GB RAM, 4 CPU cores

---

## 6. Agent Types

Oz supports multiple AI agent backends. The agent type is configurable per run, per skill, or globally via `OZ_DEFAULT_AGENT_TYPE`.

| Agent Type | CLI Tool | Model / Provider | API Key Required |
|------------|----------|-----------------|-----------------|
| **opencode** | `opencode` | Any (default: `opencode/deepseek-v4-flash-free`) | No (free models) |
| **claude-code** | `claude` | Anthropic Claude | `ANTHROPIC_API_KEY` |
| **codex** | `codex` | OpenAI GPT-4o | `OPENAI_API_KEY` |
| **gemini-cli** | `gemini` | Google Gemini | `GEMINI_API_KEY` |
| **oz-local** | Python script | Local llama.cpp | None (local model) |
| **custom** | Custom | User-defined | Depends |

### OpenCode Free Models

OpenCode provides free models that require zero API credentials:

| Model | Speed | Best For |
|-------|-------|---------|
| `opencode/deepseek-v4-flash-free` | Fast | SSH tasks, bash commands, deployments |
| `opencode/big-pickle` | Medium | Complex reasoning |
| `opencode/minimax-m2.5-free` | Medium | General tasks |
| `opencode/nemotron-3-super-free` | Fast | Quick queries |

---

## 7. Leon Skill — Natural Language Actions

The `oz_skill` is a custom Leon skill that provides 11 built-in actions for infrastructure management. Leon routes user utterances to the appropriate action using its NLU pipeline.

### Action Reference

#### `greet`
Handles casual conversation and social interaction.

**Example utterances:**
- "Hello Leon"
- "Thank you"
- "Goodbye"

---

#### `run_bash`
Executes shell commands on a local or remote server.

**Parameters:** `server` (optional), `command`

**Example utterances:**
- "Run docker ps on the production server"
- "Check memory usage with free -m"
- "Execute ls -la /var/www on staging"

---

#### `server_health`
Checks server health: CPU, RAM, disk, load average, failed services, Docker status.

**Parameters:** `server` (optional, defaults to local)

**Example utterances:**
- "Check server health on prod-web"
- "What's the disk usage on the database server?"
- "Is the staging server healthy?"

---

#### `app_logs`
Retrieves and filters application or system logs.

**Parameters:** `server`, `path` (log file or service name), `lines`, `grep` (filter keyword)

**Example utterances:**
- "Show me the last 100 nginx error logs"
- "Fetch api service logs filtered by 500 on prod-web"
- "Get /var/log/syslog lines mentioning 'out of memory'"

---

#### `docker_logs`
Gets Docker container logs and lists running containers.

**Parameters:** `server`, `container`, `lines`, `grep`

**Example utterances:**
- "How many Docker containers are running on AIT5252?"
- "Show logs for the nginx container on production"
- "List all containers on the staging server"

---

#### `deploy`
Performs a full deployment: git pull, install dependencies, build, restart service.

**Parameters:** `server`, `path` (project directory), `branch`, `service` (systemd service name)

**Example utterances:**
- "Deploy the project at /var/www/api on prod-web"
- "Pull the main branch and restart the backend service on staging"
- "Update and rebuild the frontend at /var/www/html"

---

#### `launch_agent`
**Fallback action** — handles any infrastructure or DevOps task not covered by specific actions above.

**Parameters:** `prompt` (free-form task description)

**Example utterances:**
- "Investigate why the API is returning 500 errors"
- "Set up a cron job for daily database backups on prod"
- "Find which process is consuming the most CPU on the database server"
- "Login to server 57.131.46.106 with username ubuntu and password X and count containers"

---

#### `list_agents`
Shows recent agent runs and their status.

**Example utterances:**
- "List my recent agent runs"
- "Show agent history"
- "What agents are currently running?"

---

#### `get_agent`
Retrieves full details and logs of a specific agent run.

**Parameters:** `agent_id`

**Example utterances:**
- "Get status of agent 42"
- "Show me the output for agent run 7"

---

#### `cancel_agent`
Stops a running agent container.

**Parameters:** `agent_id`

**Example utterances:**
- "Cancel agent 5"
- "Stop agent run 12"

---

#### `list_servers`
Lists all registered servers.

**Example utterances:**
- "List my servers"
- "Show all registered servers"
- "What servers do I have?"

---

### How Server Resolution Works

When you mention a server name in any action:

1. Leon extracts the server name from your utterance
2. Oz looks it up by name in the server registry (`GET /api/servers`)
3. If found — SSH credentials are fetched from the encrypted secrets vault and injected into the agent's environment
4. If not found — Leon tells you to register the server first via the Oz UI

This means you never need to type IP addresses or passwords in the chat — just refer to servers by name.

---

## 8. API Reference

All endpoints are prefixed with `/api`. Authentication uses JWT Bearer tokens obtained from `POST /api/auth/token`.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create a new user account |
| `POST` | `/auth/token` | Login and receive a JWT token |
| `GET` | `/auth/me` | Get current user profile |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/agents/launch` | Launch a new agent run |
| `GET` | `/agents` | List agent runs (filter by status) |
| `GET` | `/agents/{id}` | Get agent run details |
| `POST` | `/agents/{id}/cancel` | Cancel a running agent |
| `GET` | `/agents/{id}/logs` | Get all logs for an agent run |
| `WS` | `/agents/ws/{id}` | Real-time log streaming via WebSocket |

**Launch agent request body:**
```json
{
  "agent_type": "opencode",
  "prompt": "Check how many docker containers are running",
  "server_id": 1,
  "skill_id": null,
  "max_runtime": 300,
  "env_vars": {}
}
```

### Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/servers` | List all registered servers |
| `POST` | `/servers` | Register a new server |
| `GET` | `/servers/{id}` | Get server details |
| `PUT` | `/servers/{id}` | Update server |
| `DELETE` | `/servers/{id}` | Remove server |

**Create server request body:**
```json
{
  "name": "prod-web",
  "host": "192.168.1.100",
  "port": 22,
  "username": "ubuntu",
  "auth_type": "password",
  "ssh_password_secret_id": 1,
  "tags": ["production", "web"],
  "description": "Production web server"
}
```

### Secrets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/secrets` | List secret names (values never returned) |
| `POST` | `/secrets` | Store an encrypted secret |
| `DELETE` | `/secrets/{id}` | Delete a secret |

### Skills

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/skills` | List all skills |
| `POST` | `/skills` | Create a new skill |
| `GET` | `/skills/{id}` | Get skill details |
| `PUT` | `/skills/{id}` | Update a skill |
| `DELETE` | `/skills/{id}` | Delete a skill |

### Schedules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/schedules` | List cron schedules |
| `POST` | `/schedules` | Create a cron schedule |
| `POST` | `/schedules/{id}/toggle` | Enable or disable a schedule |
| `DELETE` | `/schedules/{id}` | Delete a schedule |

### Dashboard & Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dashboard/stats` | Agent run statistics (total, running, completed, failed) |
| `GET` | `/health` | Service health check |

---

## 9. Data Models

### User
| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `email` | String | Unique email address |
| `hashed_password` | String | bcrypt hashed password |
| `full_name` | String | Display name |
| `is_active` | Boolean | Account active flag |
| `role` | String | `admin` or `member` |
| `created_at` | Timestamp | Account creation time |

### AgentRun
| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `user_id` | Integer | Owner user |
| `agent_type` | String | `opencode`, `claude-code`, `codex`, `gemini-cli`, `oz-local`, `custom` |
| `status` | Enum | `pending` → `running` → `completed` / `failed` / `cancelled` |
| `prompt` | Text | Full prompt sent to the agent |
| `env_vars` | JSON | Environment variables (credentials, etc.) |
| `max_runtime` | Integer | Timeout in seconds (default: 3600) |
| `container_id` | String | Docker container ID while running |
| `exit_code` | Integer | Container exit code (0 = success) |
| `started_at` | Timestamp | When agent started |
| `finished_at` | Timestamp | When agent completed |

### Server
| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `name` | String | Human-readable name (used in Leon utterances) |
| `host` | String | IP address or hostname |
| `port` | Integer | SSH port (default: 22) |
| `username` | String | SSH username |
| `auth_type` | String | `password` or `key` |
| `ssh_password_secret_id` | Integer | FK to Secret |
| `ssh_key_secret_id` | Integer | FK to Secret |
| `tags` | JSON | Labels e.g. `["production", "web"]` |

### Secret
| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `name` | String | Human-readable name |
| `value_encrypted` | Text | Fernet-encrypted value |
| `scope` | String | `user` or `global` |

### Skill
| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `name` | String | Unique skill name |
| `description` | Text | What this skill does |
| `agent_type` | String | Which agent type to use |
| `system_prompt` | Text | Prepended to every run of this skill |
| `tools` | JSON | List of enabled tools |
| `max_runtime` | Integer | Timeout in seconds |
| `version` | Integer | Auto-incremented on updates |

### Schedule
| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `name` | String | Schedule name |
| `cron_expr` | String | Standard cron expression (e.g., `0 2 * * *`) |
| `agent_type` | String | Which agent type to run |
| `prompt_template` | Text | Prompt with optional template variables |
| `is_active` | Boolean | Whether schedule is enabled |
| `last_run_at` | Timestamp | Last execution time |

### AgentLog
| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `agent_run_id` | Integer | FK to AgentRun |
| `stream` | String | `stdout` or `stderr` |
| `content` | Text | Log line content |
| `timestamp` | Timestamp | When the log was written |

---

## 10. Security & Access Control

### Authentication
- All API endpoints require a JWT Bearer token (except `/auth/register` and `/auth/token`)
- Tokens signed with HS256 using a secret key
- Passwords hashed with bcrypt

### Resource Isolation
- Every resource (servers, secrets, agents, skills, schedules) is scoped to the creating user
- Users can only read and modify their own resources
- Admin role can view all resources

### Secrets Encryption
- All sensitive values (SSH passwords, SSH keys, API keys) are stored encrypted using **Fernet symmetric encryption**
- Values are decrypted only when injected into an agent's environment
- Secret values are never returned via the API — only names are exposed

### Agent Sandboxing
- Each agent runs in an isolated Docker container
- Workspace is a tmpfs mount (in-memory, wiped on exit)
- No access to host filesystem beyond the Docker socket
- Resource limits: 4GB RAM, 4 CPU cores (400% of one core time)
- Container auto-removed after completion

### Concurrency Limits
- Maximum 5 agents running simultaneously per user
- Configurable per-run timeout (default: 3600 seconds)
- Graceful timeout handling — container is killed and cleaned up

### Audit Logging
Every significant action is recorded:
- Who performed the action (user ID)
- What action was taken (`agent.launch`, `skill.create`, `secret.delete`, etc.)
- Which resource was affected (type + ID)
- When it happened (timestamp)
- Source IP address

---

## 11. Configuration & Environment Variables

### Backend (`docker/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://oz:oz@db:5432/oz` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection string |
| `SECRET_KEY` | `change-me-in-production` | JWT signing key — **change in production** |
| `OZ_RUNNER` | `docker` | Agent runner: `docker` or `local` |
| `OZ_AGENT_NETWORK` | `host` | Docker network mode for agent containers |
| `OZ_LLAMACPP_URL` | `http://llama-cpp:8080/v1` | Local LLM endpoint |
| `OZ_OPENCODE_MODEL` | `opencode/deepseek-v4-flash-free` | OpenCode model to use |
| `OZ_NVIDIA_API_KEY` | — | NVIDIA API key (optional, for paid models) |

### Leon (in `docker-compose.yml`)

| Variable | Value | Description |
|----------|-------|-------------|
| `LEON_LLM` | `groq/llama-3.1-8b-instant` | LLM for NLU routing (Groq is fast and free-tier) |
| `LEON_GROQ_API_KEY` | `${GROQ_API_KEY}` | Groq API key from `.env` |
| `LEON_ROUTING_MODE` | `smart` | NLU routing strategy |
| `LEON_HTTP_API_KEY` | `dev-key-123` | API key for HTTP requests to Leon |
| `OZ_API_URL` | `http://api:8000/api` | Internal URL of the Oz API |
| `OZ_EMAIL` | `admin@oz.local` | Oz account for Leon to authenticate with |
| `OZ_PASSWORD` | `admin123` | Oz account password |
| `OZ_DEFAULT_AGENT_TYPE` | `opencode` | Default AI agent to use |
| `OZ_DEFAULT_MAX_RUNTIME` | `300` | Default agent timeout (seconds) |

### API Keys (in `docker/.env`)

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key — free tier available at console.groq.com |
| `NVIDIA_API_KEY` | NVIDIA API key — optional, for NVIDIA-hosted models |

---

## 12. Deployment Guide

### Prerequisites

- Ubuntu 20.04+ or Debian 11+ server
- 4GB+ RAM (8GB+ recommended)
- Docker not required — the deploy script installs it

### One-Command Deployment

```bash
# 1. Clone the repository
git clone https://github.com/your-org/orchestration.git
cd orchestration

# 2. Copy your .env file (contains API keys)
cp /path/to/your/.env docker/.env

# 3. Run the deploy script
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. Install Docker if not present
2. Verify the `.env` file exists
3. Build all Docker images
4. Build the `oz-agent` image
5. Start all services
6. Wait for the API to be healthy
7. Create the admin user
8. Print the access URLs

### Access Points After Deployment

| Service | URL |
|---------|-----|
| **Oz Web UI** | `http://YOUR_IP:8090` |
| **API Docs** (Swagger) | `http://YOUR_IP:8000/docs` |
| **Leon Chat** | `http://YOUR_IP:5366` |

### Default Login

- **Email:** `admin@oz.local`
- **Password:** `admin123`

> ⚠️ Change the default password and `SECRET_KEY` before production use.

### Registering Your First Server

1. Log in to the Oz UI
2. Go to **Secrets** → create a secret with your SSH password or private key
3. Go to **Servers** → register your server with its IP, username, and the secret you just created
4. Now you can tell Leon: *"Check health on [your-server-name]"*

---

## 13. Project Structure

```
orchestration/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py       # Settings (env var loading)
│   │   │   ├── auth.py         # JWT & bcrypt password hashing
│   │   │   ├── database.py     # SQLAlchemy engine & init_db()
│   │   │   └── ws_manager.py   # WebSocket session manager
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── agent.py
│   │   │   ├── server.py
│   │   │   ├── secret.py
│   │   │   ├── skill.py
│   │   │   ├── schedule.py
│   │   │   ├── audit.py
│   │   │   ├── log.py
│   │   │   └── conversation.py
│   │   ├── routes/             # FastAPI route handlers
│   │   │   ├── auth.py
│   │   │   ├── agents.py
│   │   │   ├── servers.py
│   │   │   ├── secrets.py
│   │   │   ├── skills.py
│   │   │   ├── schedules.py
│   │   │   ├── chat.py
│   │   │   └── dashboard.py
│   │   ├── services/           # Business logic
│   │   │   ├── agent_runner.py     # LocalAgentRunner, DockerAgentRunner
│   │   │   ├── server_service.py   # Server resolution, SSH env injection
│   │   │   ├── secret_service.py   # Fernet encryption/decryption
│   │   │   ├── skill_service.py    # Skill management
│   │   │   ├── scheduler_service.py
│   │   │   └── audit_service.py
│   │   ├── worker/
│   │   │   └── scheduler.py    # Celery tasks & beat schedule
│   │   └── main.py             # FastAPI app entry point
│   └── Dockerfile
│
├── leon/                       # Leon AI assistant customisation
│   └── skills/native/oz_skill/
│       ├── skill.json          # Skill manifest (actions, utterances, NLU)
│       ├── locales/en.json     # Response templates
│       └── src/
│           ├── actions/        # TypeScript action handlers (11 actions)
│           └── lib/
│               └── oz_client.ts # Oz API client & server resolution
│
├── web/
│   └── index.html              # Single-page web application
│
├── docker/
│   ├── docker-compose.yml      # Full stack definition
│   ├── docker-compose.override.yml  # Local overrides (ports, dev settings)
│   ├── nginx.conf              # Nginx reverse proxy config
│   ├── agent/
│   │   ├── Dockerfile          # oz-agent image definition
│   │   ├── entrypoint.sh       # SSH key setup, agent launch
│   │   ├── opencode-config.json # OpenCode provider configuration
│   │   └── oz_local_agent.py   # Lightweight local Python agent
│   └── leon/
│       └── Dockerfile          # Leon Docker image
│
├── cli/                        # Command-line interface (ozcli)
│   └── ozcli/
│       └── main.py
│
├── deploy.sh                   # One-command deployment script
└── DOCUMENTATION.md            # This file
```

---

## 14. Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **API Framework** | FastAPI | Latest | Async REST API & WebSockets |
| **ASGI Server** | Uvicorn | Latest | HTTP server |
| **ORM** | SQLAlchemy | 2.x | Async database access |
| **Database** | PostgreSQL | 16 | Primary data store |
| **Cache / Queue** | Redis | 7 | Celery broker |
| **Task Queue** | Celery + Beat | Latest | Background tasks & cron |
| **Auth** | PyJWT + bcrypt | Latest | Token auth & password hashing |
| **Encryption** | Cryptography (Fernet) | Latest | Secrets at rest |
| **Container SDK** | Docker SDK for Python | Latest | Spawning agent containers |
| **Frontend** | HTML + Vanilla JS | — | Single-page application |
| **CSS** | Tailwind CSS | 3 | Styling |
| **Web Server** | Nginx | Alpine | Static file serving & proxy |
| **AI Assistant** | Leon | 1.0.0-beta | NLU + skill routing |
| **LLM (Routing)** | Groq `llama-3.1-8b-instant` | — | ~2s utterance routing |
| **LLM (Local)** | llama.cpp (Qwen 2.5 1.5B) | — | Offline LLM fallback |
| **Agent (default)** | OpenCode | Latest | Free AI coding agent |
| **Agent model** | DeepSeek V4 Flash (free) | — | No API key required |
| **Containerisation** | Docker + Compose | 26+ | Full stack orchestration |
| **Language (backend)** | Python | 3.12 | Backend language |
| **Language (Leon skill)** | TypeScript | 5 | Skill action handlers |

---

*Built with ❤️ for the Shark Tank event. All components are open source or free-tier.*

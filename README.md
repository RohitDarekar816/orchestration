# Oz — In-House Agent Orchestration Platform

Launch, schedule, and observe AI coding agents (Claude Code, Codex, Gemini CLI, OpenCode, custom) from a unified control plane.

## Quick Start (Local Dev)

```bash
# Backend
cd backend
pip install -r requirements.txt
pip install aiosqlite  # for local dev
uvicorn app.main:app --reload --port 8000

# Web (open in browser)
open web/index.html  # or serve via any HTTP server

# CLI
pip install -e ../cli
oz login you@example.com password
oz launch --agent opencode --prompt "Refactor the auth module"
```

## Docker (Full Stack)

```bash
cd docker
docker compose up -d
# Web: http://localhost:3000
# API: http://localhost:8000
```

## Architecture

```
┌─────────────────────────────────────┐
│  Web Dashboard    CLI     API/SDK   │
├─────────────────────────────────────┤
│  Control Plane                      │
│  ┌──────────┐ ┌────────┐ ┌───────┐  │
│  │Orchestrat│ │Secrets │ │Audit  │  │
│  │+Schedule │ │Manager │ │Trail  │  │
│  └──────────┘ └────────┘ └───────┘  │
├─────────────────────────────────────┤
│  Agent Runtime                      │
│  ┌─────────┐  ┌──────────────────┐  │
│  │Local    │  │Docker Sandbox    │  │
│  │(dev)    │  │(prod/self-hosted)│  │
│  └─────────┘  └──────────────────┘  │
└─────────────────────────────────────┘
```

## Key Features

- **Multi-agent support**: Claude Code, Codex, Gemini CLI, OpenCode, custom
- **Skills**: Reusable, versioned agent configurations
- **Scheduling**: Cron-based agent automation
- **Secrets management**: Encrypted credential storage
- **Multi-repo**: Cross-repository agent operations
- **Observability**: Full session logging and audit trail
- **Flexible hosting**: Local dev or Docker/sandboxed execution

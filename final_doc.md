# Oz — AI Agent Orchestration Platform
### Product & Technical Documentation

**Version:** 1.2  
**Date:** June 2026  
**Company:** AIT GLOBAL INC / Afintrix  
**Contact:** info@afintrix.com

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem](#2-the-problem)
3. [Our Solution](#3-our-solution)
4. [Market Opportunity](#4-market-opportunity)
5. [Product Overview](#5-product-overview)
6. [Architecture & Technology](#6-architecture--technology)
7. [Key Features](#7-key-features)
8. [Cloudflare Edge AI Agents](#8-cloudflare-edge-ai-agents)
9. [Security & Compliance](#9-security--compliance)
10. [Agent Roadmap — 101 Agents](#10-agent-roadmap--101-agents)
11. [Tech Stack](#11-tech-stack)
12. [Deployment](#12-deployment)
13. [API Reference](#13-api-reference)
14. [Business Model](#14-business-model)
15. [Competitive Landscape](#15-competitive-landscape)
16. [Why Oz Wins](#16-why-oz-wins)
17. [Team](#17-team)
18. [Ask](#18-ask)

---

## 1. Executive Summary

**Oz** is an AI-powered infrastructure management platform that lets any engineer manage servers, containers, deployments, and cloud resources using plain English — no memorising commands, no switching between tools, no SSH fatigue.

You simply ask:

> *"How many Docker containers are running on production?"*
> *"Deploy the latest build on the web server."*
> *"Show me the last 50 error logs from the API container."*
> *"Check the health of AITLP-371."*

Oz understands your intent, launches the right AI agent, executes the task securely, and delivers a clean, structured response — all in seconds.

**What makes Oz different:** It combines a natural-language chat interface (powered by Leon AI), a backend orchestration engine, Cloudflare Edge AI agents (zero cold-start, globally distributed), and a full secrets vault into a single deployable platform that any DevOps team can self-host or consume as a SaaS.

---

## 2. The Problem

Modern engineering teams manage increasingly complex infrastructure — dozens of servers, hundreds of containers, multiple cloud accounts, CI/CD pipelines, databases, and DNS records. This creates three compounding problems:

### 2.1 The Knowledge Gap
Every infrastructure operation requires specialised command-line knowledge. New engineers spend weeks learning SSH flags, Docker commands, and system administration — time that could be spent building product. Senior engineers waste hours on repetitive, low-value tasks.

### 2.2 The Context-Switching Tax
A typical DevOps workflow requires switching between: terminal (SSH), Docker CLI, monitoring dashboards (Grafana, Prometheus), log aggregators, CI/CD dashboards, DNS management panels, and ticketing systems. Studies show each context switch costs 20–25 minutes of productive focus.

### 2.3 The Automation Ceiling
Existing automation tools (Ansible, Terraform, Bash scripts) are powerful but brittle — they require upfront authoring, break when infrastructure changes, and can't handle free-form operational queries. AI coding assistants (GitHub Copilot, Cursor) help with code but can't execute live infrastructure operations.

**The result:** Engineering teams spend 30–40% of their time on operational toil that should be automated.

---

## 3. Our Solution

Oz solves all three problems with a single, cohesive platform:

| Problem | Oz Solution |
|---|---|
| Knowledge gap | Natural-language interface — ask in plain English, Oz handles the syntax |
| Context switching | One chat interface for all infrastructure — containers, servers, databases, DNS, CI/CD |
| Automation ceiling | AI agents that can reason, adapt, and execute multi-step tasks live against real infrastructure |

### The Core Insight

Instead of building yet another fixed automation script or yet another AI chatbot that can only answer questions, Oz connects a **natural-language understanding layer** (Leon AI) to a **fleet of specialised AI agents** that have direct, authenticated access to your infrastructure.

The agents aren't just generating text — they are calling real APIs, running real commands, reading real logs, and taking real actions.

---

## 4. Market Opportunity

### Total Addressable Market

| Segment | Market Size | Source |
|---|---|---|
| DevOps & Platform Engineering Tools | $8.7B (2025) | MarketsandMarkets |
| AIOps & IT Operations AI | $11.9B (2025) | IDC |
| Cloud Infrastructure Management | $29.4B (2025) | Gartner |
| **Combined TAM** | **~$50B** | |

### Who Buys Oz

- **Primary:** DevOps engineers, SREs, and Platform Engineering teams at companies with 50–5,000 employees
- **Secondary:** CTOs and Engineering Managers wanting to reduce operational overhead
- **Tertiary:** Freelancers and agencies managing multiple client servers

### Tailwinds

- AI adoption in enterprise IT is accelerating at 40%+ CAGR
- Infrastructure complexity is growing faster than team sizes — every company is hiring fewer DevOps engineers relative to the infrastructure they manage
- The "ChatGPT for DevOps" moment is happening now — teams already expect AI to help with infrastructure; Oz gives them a production-ready platform

---

## 5. Product Overview

### 5.1 The User Experience

Oz has three interfaces that all feed the same orchestration engine:

**Leon Chat** — The primary interface. A real-time AI chat window where engineers describe what they need in plain English. Leon understands intent, extracts parameters (server names, container names, log counts), and dispatches the right agent.

**Web Dashboard** — A clean management UI for registering servers, viewing agent run history, managing secrets, setting up cron schedules, and monitoring active agents.

**REST API + CLI** — Full programmatic access for integration with CI/CD pipelines, Slack bots, scripts, or any third-party system.

### 5.2 How a Request Flows End-to-End

```
User says: "Check the last 10 error logs for docker-api-1 on AITLP-371"
    │
    ▼
Leon NLU Pipeline
  → Identifies intent: docker_logs action
  → Extracts entities: container=docker-api-1, server=AITLP-371, lines=10
    │
    ▼
resolveDockerTarget()
  → Queries Oz API for registered servers and endpoints
  → Matches "AITLP-371" to a registered Docker API endpoint
  → Routes to: cloudflare_docker_agent
    │
    ▼
Cloudflare Edge Worker (Workers AI + Docker Engine API)
  → Receives task + docker_url
  → Llama 4 Scout (17B) reasons about the task
  → Calls tool: get_container_logs(id="docker-api-1", tail=10)
  → Fetches real logs from Docker Engine API
  → Returns all 10 log lines verbatim
    │
    ▼
Leon formats response as structured HTML card
  → Renders in chat with dark pre block, timestamps, syntax highlighting
  → User sees a clean, readable response in < 5 seconds
```

### 5.3 Supported Operations Today

| Category | Example Queries |
|---|---|
| Docker | "How many containers are running on prod?" / "Show logs for nginx" / "What are the stats for the API container?" |
| Server Health | "Check the health of AITLP-371" / "Is the production server healthy?" |
| Proxmox VE | "List all VMs on the cluster" / "Create a new Ubuntu VM named web-01" / "Delete the VM rohit-test-vm" / "Show storage usage" |
| Deployments | "Deploy /var/www/api on prod-web" / "Restart the web service" |
| App Logs | "Show me the last 100 nginx errors" / "Find 502 errors from today" |
| Bash | "Run df -h on staging" / "What processes are using the most CPU?" |
| Website | "Check if familyestate.in is up" / "What's the response time for the API?" |
| n8n Workflows | "Trigger the order-processing workflow" / "Check recent workflow executions" |
| Agent Management | "List my running agents" / "Cancel agent 42" / "Launch a code review agent" |

---

## 6. Architecture & Technology

### 6.1 System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                              │
│   Leon Chat (WebSocket)    Web Dashboard    REST API    CLI (oz)     │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │
         ┌────────────────────────▼──────────────────────────┐
         │              LEON AI ASSISTANT                     │
         │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  │
         │  │ NLU Pipeline│  │ Skill Router │  │  LLM     │  │
         │  │ (Utterance  │─▶│ (oz_skill)   │─▶│ (Llama   │  │
         │  │  parsing)   │  │              │  │  8B CF)  │  │
         │  └─────────────┘  └──────┬───────┘  └──────────┘  │
         │                          │ 14 skill actions         │
         └──────────────────────────┼──────────────────────────┘
                                    │ POST /api/agents/launch
         ┌──────────────────────────▼──────────────────────────┐
         │              OZ CONTROL PLANE (FastAPI)             │
         │  ┌───────────┐ ┌──────────┐ ┌────────────────────┐  │
         │  │  Agent    │ │  Server  │ │   Secrets Vault    │  │
         │  │ Launcher  │ │ Registry │ │  (Encrypted AES)   │  │
         │  └─────┬─────┘ └──────────┘ └────────────────────┘  │
         │        │       ┌──────────┐ ┌────────────────────┐  │
         │        │       │  Cron    │ │   Audit Trail      │  │
         │        │       │ Scheduler│ │   (Full log of     │  │
         │        │       │ (Celery) │ │    every action)   │  │
         │        │       └──────────┘ └────────────────────┘  │
         └────────┼────────────────────────────────────────────┘
                  │
       ┌──────────┴──────────────────────────────────────────┐
       │              AGENT EXECUTION LAYER                   │
       │                                                       │
       │  ┌─────────────────────┐  ┌────────────────────────┐ │
       │  │  CLOUDFLARE EDGE    │  │   OZ-LOCAL AGENTS      │ │
       │  │  AI AGENTS          │  │   (Docker Sandboxes)   │ │
       │  │                     │  │                        │ │
       │  │  cf-docker-agent    │  │  opencode (default)    │ │
       │  │  cf-server-health   │  │  claude-code           │ │
       │  │  cf-proxmox-agent   │  │  codex / gemini-cli    │ │
       │  │  + 97 planned       │  │  oz-local (SSH)        │ │
       │  │                     │  │  oz-local (SSH)        │ │
       │  │  Workers AI         │  │  commandcode           │ │
       │  │  (Llama 4 Scout)    │  │  custom agents         │ │
       │  │  Global edge CDN    │  │                        │ │
       │  └──────────┬──────────┘  └──────────┬─────────────┘ │
       └─────────────┼────────────────────────┼───────────────┘
                     │                        │
                     ▼                        ▼
         Docker Engine API (HTTP)       SSH → Target Server
         familyestate.in:80             OZ_SSH_* env vars
```

### 6.2 The Two Agent Execution Paths

Oz has two distinct ways to execute agent tasks, chosen automatically based on the registered infrastructure:

**Path A — Cloudflare Edge AI Agents**
For servers with an HTTP API exposed (Docker endpoints), Oz routes to a Cloudflare Worker. The Worker uses Cloudflare Workers AI (Llama 4 Scout 17B) with tool-calling to interact with the Docker Engine API directly. There is no cold start, no Docker container to spin up, and the edge worker runs in < 100ms from anywhere in the world.

**Path B — oz-local Docker Sandbox Agents**
For SSH-connected servers or tasks requiring a full shell environment, Oz spins up an isolated Docker container on the host, injects SSH credentials as environment variables, and runs the chosen AI agent (OpenCode, Claude Code, Codex, etc.) inside the sandbox. The agent can SSH into target servers, run commands, write files, and return structured output.

### 6.3 NLU Routing — How Leon Understands Your Intent

Leon's NLU pipeline is a multi-stage system:

1. **Utterance classification** — Leon's built-in NLU classifies the utterance into a skill/action bucket using a trained intent model
2. **Entity extraction** — An action-calling LLM (Llama 3.1 8B via Cloudflare Workers AI) extracts structured parameters: server name, container name, log count, command, URL, etc.
3. **`resolveDockerTarget()`** — A 6-step decision tree that resolves the target server from the extracted entities:
   - Exact name match against registered endpoints
   - Name match against SSH servers
   - Fuzzy keyword match
   - Tag-based match
   - Single-endpoint fallback (if only one server is registered)
   - Local machine fallback
4. **Agent dispatch** — Based on the resolved target type, the appropriate agent runner is chosen (Cloudflare Worker vs Docker sandbox)

---

## 7. Key Features

### 7.1 Natural Language Interface
No commands to memorise. Ask Leon anything about your infrastructure in plain English. Leon understands intent, extracts parameters, and handles the technical execution.

### 7.2 Multi-Agent Support
Oz is agent-agnostic. It supports:
- **OpenCode** — Default. Uses free models via OpenRouter (no paid API key required)
- **Claude Code** — Anthropic's flagship coding agent
- **Codex** — OpenAI's code-execution agent
- **Gemini CLI** — Google's Gemini-powered agent
- **CommandCode** — Specialised for system administration
- **oz-local** — Oz's own lightweight SSH + Docker agent
- **Cloudflare Edge Agents** — Purpose-built, zero-cold-start AI workers
- **Custom** — Bring your own Docker image

### 7.3 Server & Endpoint Registry
Register any server with SSH (password or key authentication) or Docker API endpoint. Oz stores credentials in its encrypted secrets vault and automatically injects them into agent runs — the AI agent gets the credentials it needs without ever exposing them in prompts or logs.

### 7.4 Encrypted Secrets Vault
All sensitive credentials (SSH keys, passwords, API tokens) are stored AES-encrypted in the database. Secrets are decrypted only at agent launch time, injected as environment variables, and never appear in logs or responses.

### 7.5 Cron Scheduling
Schedule any agent run on a cron schedule. Examples:
- Run a server health check every morning at 6am
- Check SSL certificate expiry every week
- Run a database backup nightly
- Monitor Docker container health every 15 minutes

### 7.6 Real-time Log Streaming
Every agent run streams logs in real time via WebSocket. Watch your deployment unfold, see container logs appear line by line, or monitor a health check in progress — all from the Leon chat or Web UI.

### 7.7 Full Audit Trail
Every action is logged: who triggered it, what agent ran, what prompt was used, when it started and finished, and the full output. Complete accountability for every infrastructure change.

### 7.8 Skills Library
Save reusable agent configurations as Skills. A Skill is a named, versioned combination of agent type, system prompt, and environment variables. Share skills across your team so everyone benefits from the best-practice configurations you've built.

### 7.9 Role-Based Access Control
Admin and member roles. Each user's resources (servers, secrets, agents) are isolated by user ID. Admins can view all activity across the team.

### 7.10 Structured HTML Responses
Oz doesn't just dump raw text. Agent output is automatically formatted into clean, readable HTML cards in the Leon chat UI via a unified `formatDockerOutput()` renderer:
- Agent-type header icons: 🐳 Docker, ❤️ Server Health, 🖥️ Proxmox
- HEALTHY / WARNING / CRITICAL status badges (colour-coded)
- Markdown headings (`#`, `##`, `###`) rendered as styled section headers
- Inline markdown: `**bold**`, `*italic*`, `` `code` `` all rendered correctly
- Code fence blocks (` ``` `) rendered as scrollable `<pre>` blocks
- Pipe tables rendered as styled HTML tables
- Container lists with green/red status dots
- Log lines rendered in dark `<pre>` blocks with timestamps
- Stats formatted as two-column key-value tables
- Error messages in styled alert boxes

### 7.11 Autonomous Pulse Manager Guardrails
Leon includes an autonomous background agent (Pulse Manager) that proactively plans and executes tasks. Oz adds guardrails to prevent it from interfering with skill-dispatched infrastructure work:
- Infrastructure operations (VM/LXC/Docker/Proxmox/server health) are explicitly blocked from the Pulse Manager's task queue — they are handled by dedicated edge agents
- Tasks the owner just dispatched via a skill are not re-queued autonomously
- If a matter slips through with no available tools, the model responds with a single-line `BLOCKED:` instead of hallucinating verbose explanations

---

## 8. Cloudflare Edge AI Agents

This is Oz's most distinctive technical innovation. Instead of spinning up a Docker container for every query, Oz has a fleet of purpose-built Cloudflare Workers that run AI models at the edge — globally distributed, zero cold start, and billing per request with no idle cost.

### 8.1 How Edge Agents Work

```
Leon → Oz API → Cloudflare Worker (edge, <100ms)
                      │
               Workers AI (Llama 4 Scout 17B)
                      │
               Tool calling loop:
               ┌─────────────────────┐
               │ AI decides which    │
               │ tool to call next   │
               │                     │
               │ → call tool         │
               │ → get result        │
               │ → reason about it   │
               │ → call next tool    │
               │ → ... (up to 12x)  │
               │ → produce answer    │
               └─────────────────────┘
                      │
               Returns structured JSON
               { output, success, tool_calls }
```

### 8.2 Built Edge Agents

#### `cloudflare_docker_agent`
**Deployed:** `https://cf-docker-agent.rohit-darekar.workers.dev`

Full Docker container management via Docker Engine API. 11 tools:

| Tool | What it does |
|---|---|
| `list_containers` | List all containers with state, status, ports |
| `inspect_container` | Full config and state for a specific container |
| `get_container_logs` | Fetch stdout/stderr with exact tail count |
| `container_stats` | CPU%, memory used/limit/%, network I/O, block I/O, PIDs |
| `run_container` | Create and start a new container |
| `start_container` | Start an existing stopped container |
| `stop_container` | Gracefully stop a running container |
| `remove_container` | Remove a container (force option) |
| `list_images` | List Docker images on the host |
| `exec_in_container` | Run shell commands inside a container |
| `docker_system_info` | Docker version, OS, total containers/images |

#### `cloudflare_server_health_agent`
**Deployed:** `https://cf-server-health-agent.rohit-darekar.workers.dev`

Comprehensive server health monitoring via Docker Engine API + container exec. 5 tools:

| Tool | What it does |
|---|---|
| `system_info` | OS, kernel, CPU count, total RAM, Docker version, container counts |
| `disk_usage` | Docker images/containers/volumes disk footprint |
| `list_containers` | Full container inventory — running vs stopped |
| `get_resource_usage` | Per-container CPU% and memory (all running containers, in parallel) |
| `exec_in_container` | `df -h` for disk, `free -h` for RAM, `uptime` for load average |

**Health report includes:** Overall status (HEALTHY/WARNING/CRITICAL), host info, container summary, per-container resource usage, disk, load average, and flagged warnings. Max runtime: 180s with 240s poll window.

#### `cloudflare_proxmox_agent`
**Deployed:** `https://cf-proxmox-agent.rohit-darekar.workers.dev`

Full Proxmox VE hypervisor management via Proxmox REST API. **35 tools across 8 categories:**

| Category | Tools |
|---|---|
| Cluster (2) | `get_cluster_status`, `get_cluster_resources` |
| Nodes (4) | `list_nodes`, `get_node_status`, `list_node_network`, `get_node_tasks` |
| VMs (6) | `list_vms`, `get_vm_status`, `get_vm_config`, `vm_action`, `delete_vm`, `update_vm_config` |
| VM Snapshots (4) | `list_vm_snapshots`, `create_vm_snapshot`, `rollback_vm_snapshot`, `delete_vm_snapshot` |
| LXC Containers (7) | `list_containers`, `get_container_status`, `get_container_config`, `container_action`, `delete_container`, `update_container_config`, `list_container_snapshots` |
| LXC Snapshots (3) | `create_container_snapshot`, `rollback_container_snapshot`, `delete_container_snapshot` |
| Storage (2) | `list_storage`, `list_storage_content` |
| Provisioning (7) | `get_next_vmid`, `clone_vm`, `wait_for_task`, `set_vm_cloudinit`, `resize_vm_disk`, `get_vm_ip`, `create_container` |

**Full CRUD** for both QEMU VMs and LXC containers: Create, Read, Update (CPU/RAM/name/tags), Delete.

**VM Provisioning flow:** `list_vms` (find template) → `get_next_vmid` → `clone_vm` → `wait_for_task` → `set_vm_cloudinit` → `resize_vm_disk` → `vm_action(start)` → `get_vm_ip` (up to 90s DHCP wait).

**LXC Provisioning flow:** `list_storage_content` (find OS template) → `get_next_vmid` → `create_container` → `wait_for_task` → `container_action(start)`.

**Dynamic tool selection:** 9 intent groups (`provision`, `lxc_provision`, `power`, `snapshot`, `lxc`, `storage`, `network`, `tasks`, `overview`) — only the relevant subset of tools is sent per request, cutting input tokens by 75–80%.

**Security:** Cryptographically random 16-char passwords generated per-provision; QEMU guest agent always enabled; `purge=1&destroy-unreferenced-disks=1` on delete. Max runtime: 360s with 420s poll window.

### 8.3 Edge Agent Advantages

| Metric | oz-local (Docker sandbox) | Cloudflare Edge Agent |
|---|---|---|
| Cold start | 8–15 seconds | < 100ms |
| Global latency | Single-region host | Edge PoPs in 300+ cities |
| Idle cost | Docker image pulled per run | Zero — billing per request |
| Infrastructure required | Docker socket on Oz host | Just an HTTP endpoint on target |
| Scalability | Limited by host Docker | Cloudflare global scale |
| Token efficiency | Full prompt every step | Dynamic tool selection (75–80% fewer input tokens) |
| LLM cache | None | `x-session-affinity` header pins all steps to same Workers AI instance for prompt cache hits |

---

## 9. Security & Compliance

Security is a first-class concern in Oz. Infrastructure management tooling has access to the most sensitive parts of a company's stack — Oz is built with that responsibility in mind.

### 9.1 Credential Security
- **At-rest encryption:** SSH keys and passwords stored AES-encrypted in the database
- **No prompt leakage:** Credentials injected as environment variables, never concatenated into prompts
- **No log leakage:** Agent preamble explicitly forbids outputting SSH credentials; audit-mode scanning strips sensitive patterns
- **Scope isolation:** Each user can only access their own registered servers and secrets

### 9.2 Agent Sandboxing
oz-local agents run in isolated Docker containers with:
- No access to the Oz host filesystem (unless explicitly mounted)
- Network access limited to what's needed for SSH/API calls
- Automatic termination at `max_runtime` (default: 5 minutes)
- Exit codes tracked; failed agents do not retry (retry count = 0)

### 9.3 Concurrency Limits
A hard limit of 5 concurrent running agents per user prevents runaway agent abuse and protects the host from resource exhaustion.

### 9.4 Cloudflare Workers Security
Edge agents receive only what they need:
- The task (natural language prompt)
- The Docker endpoint URL
- The endpoint name
No SSH credentials, no database access, no user identity — edge agents operate on the minimum viable information.

### 9.5 API Security
- JWT authentication on all API endpoints
- Token expiry: 24 hours (configurable)
- Passwords hashed with bcrypt
- All API routes behind `get_current_user` dependency injection

---

## 10. Agent Roadmap — 101 Agents

Oz has a planned roadmap of 101 purpose-built Cloudflare edge agents across 10 categories. **4 are already live.**

| Category | Agents | Built | Examples |
|---|---|---|---|
| Infrastructure & Ops | 15 | ✅ ✅ | Server health ✅, disk usage, process management, cron, systemd, log search |
| Docker & Containers | 10 | ✅ | Docker ✅ (11 tools), Compose, images, volumes, networks, registry, swarm |
| Proxmox VE | 1 | ✅ | VM & LXC full CRUD ✅ (35 tools: create/read/update/delete VMs and containers, snapshots, provisioning) |
| Application & Deployment | 12 | 📋 | Deploy, rollback, nginx, PM2, feature flags, smoke tests |
| Database & Storage | 10 | 📋 | Postgres, MySQL, Redis, MongoDB, S3, migrations |
| Security & Compliance | 10 | 📋 | SSL audit, firewall, CVE scan, SSH hardening, fail2ban |
| Networking & DNS | 8 | 📋 | DNS lookup, ping, port scan, traceroute, VPN status |
| Monitoring & Alerting | 10 | 📋 | Grafana, Prometheus, Sentry, anomaly detection, incident management |
| AI & Productivity | 10 | 📋 | RAG over docs, code review, summarisation, changelog generation |
| Web & APIs | 8 | 📋 | Website check, API testing, screenshots, PageSpeed |
| CI/CD & Git | 7 | 📋 | GitHub/GitLab, PR review, dependency audit, release tagging |
| **Total** | **101** | **4 built** | **97 planned** |

Each new agent takes 2–4 hours to build and deploy — the architecture is fully templated. The Cloudflare Worker pattern, backend runner, Leon action, and locale entries are all standardised.

---

## 11. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend API** | FastAPI (Python 3.12) | Async, fast, automatic OpenAPI docs |
| **Database** | PostgreSQL 16 | Reliable relational store for users, agents, servers, secrets |
| **Cache / Queue** | Redis 7 | Celery broker, real-time pub/sub for log streaming |
| **Task Queue** | Celery + Celery Beat | Async agent execution, cron scheduling |
| **AI Assistant** | Leon (open-source) | Production NLU pipeline, WebSocket chat, skill system |
| **NLU / LLM** | Cloudflare Workers AI — Llama 3.1 8B (fp8-fast) | Zero-cost inference for Leon NLU and entity extraction; same CF account as edge agents |
| **Edge AI** | Cloudflare Workers AI (Llama 4 Scout 17B) | Sub-100ms AI inference at global edge |
| **Edge Runtime** | Cloudflare Workers (TypeScript) | Serverless, globally distributed, zero idle cost |
| **Leon Skill** | TypeScript (Vite + TSX) | Type-safe, compiled skill with full SDK support |
| **Web UI** | Vanilla JS + HTML | Lightweight, no framework dependency |
| **Container Runtime** | Docker + Docker Compose | Reproducible deployment, agent sandboxing |
| **Reverse Proxy** | nginx | TLS termination, Docker API proxying, static file serving |
| **Authentication** | JWT + bcrypt | Stateless auth, industry-standard password hashing |
| **Infrastructure Proxy** | nginx (port 80 → Docker socket) | Bypasses Cloudflare port restrictions, persistent via systemd |

---

## 12. Deployment

### 12.1 One-Command Deploy

```bash
git clone https://github.com/your-org/oz
cd oz/docker
docker compose up -d
```

That's it. The full stack — API, database, worker, scheduler, Leon AI, and web UI — is up in under 60 seconds on any server with Docker installed.

### 12.2 Service Map

| Container | Role | Default Port |
|---|---|---|
| `api` | FastAPI control plane | 8000 |
| `web` | nginx reverse proxy + static UI | 8090 |
| `worker` | Celery worker (async agent execution) | — |
| `beat` | Celery Beat (cron scheduler) | — |
| `db` | PostgreSQL 16 | 5432 |
| `redis` | Redis 7 (broker + cache) | 6379 |
| `leon` | Leon AI assistant | 1337 |
| `oz-opencode-server` | Persistent OpenCode server (no cold start) | 3000 |

### 12.3 Environment Configuration

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | LLM provider for Leon's NLU and entity extraction |
| `CF_DOCKER_AGENT_URL` | Deployed URL of the Cloudflare Docker Agent worker |
| `CF_SERVER_HEALTH_AGENT_URL` | Deployed URL of the Cloudflare Server Health Agent worker |
| `CF_PROXMOX_AGENT_URL` | Deployed URL of the Cloudflare Proxmox Agent worker |
| `CLOUDFLARE_API_TOKEN` | Token for deploying new Cloudflare Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `SECRET_KEY` | JWT signing secret (change in production) |
| `DATABASE_URL` | PostgreSQL connection string |

### 12.4 Cloudflare Agent Deployment

Each edge agent is deployed independently with a single command:

```bash
cd cloudflare-agents/docker-agent
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler deploy
# Deployed to: https://cf-docker-agent.<account>.workers.dev
```

---

## 13. API Reference

The Oz API is a fully documented REST API (OpenAPI/Swagger at `/docs`). Key endpoints:

### Authentication
```
POST /api/auth/login          → { access_token, token_type }
POST /api/auth/register       → { id, email, role }
```

### Agents
```
POST /api/agents/launch       → { id, agent_type, status }
GET  /api/agents              → [ { id, status, created_at, ... } ]
GET  /api/agents/{id}         → { id, status, output, logs, ... }
DELETE /api/agents/{id}       → { cancelled: true }
WS   /api/agents/{id}/ws      → real-time log stream
```

### Servers
```
POST /api/servers             → { id, name, host }
GET  /api/servers             → [ { id, name, host, tags } ]
GET  /api/servers/{id}        → { id, name, host, ... }
DELETE /api/servers/{id}      → 204
```

### Docker Endpoints
```
POST /api/docker-endpoints    → { id, name, api_url }
GET  /api/docker-endpoints    → [ { id, name, api_url } ]
PATCH /api/docker-endpoints/{id} → { id, name, api_url }
DELETE /api/docker-endpoints/{id} → 204
```

### Skills
```
POST /api/skills              → { id, name, agent_type }
GET  /api/skills              → [ ... ]
PATCH /api/skills/{id}        → { id, ... }
DELETE /api/skills/{id}       → 204
```

### Schedules
```
POST /api/schedules           → { id, cron_expression, next_run }
GET  /api/schedules           → [ ... ]
DELETE /api/schedules/{id}    → 204
```

### Secrets
```
POST /api/secrets             → { id, name }
GET  /api/secrets             → [ { id, name, created_at } ]
DELETE /api/secrets/{id}      → 204
```

---

## 14. Business Model

### 14.1 SaaS Tiers

| Tier | Price | Target | Limits |
|---|---|---|---|
| **Starter** | Free | Indie devs, students | 3 servers, 50 agent runs/month, community support |
| **Pro** | $49/month | Small teams (1–10 engineers) | 20 servers, 500 agent runs/month, all edge agents |
| **Team** | $199/month | Growing teams (10–50 engineers) | Unlimited servers, 5,000 agent runs/month, SSO, audit log |
| **Enterprise** | Custom | Large orgs, regulated industries | Self-hosted option, SLA, custom agents, dedicated support |

### 14.2 Revenue Levers

- **Agent runs** — Each run consumes compute (Docker sandbox or Cloudflare Workers AI)
- **Edge agent calls** — Cloudflare Workers AI charges per inference; we mark up with a generous margin
- **Custom agent development** — Enterprise clients pay for bespoke agents (SSL auditor for their specific stack, custom deployment pipeline, etc.)
- **Managed hosting** — We run and maintain the Oz stack for teams that don't want to self-host
- **Marketplace** — Community-built agents sold as premium add-ons

### 14.3 Unit Economics

| Metric | Estimate |
|---|---|
| Cloudflare Workers AI cost per edge agent run | ~$0.001–0.003 |
| oz-local Docker run (compute + storage) | ~$0.01–0.05 |
| Gross margin at Pro tier | ~75–80% |
| Estimated CAC (inbound/PLG) | $200–400 |
| Estimated LTV (Pro, 18-month avg) | $882 |
| LTV:CAC ratio | ~3:1 |

---

## 15. Competitive Landscape

| Competitor | What they do | Oz Advantage |
|---|---|---|
| **Ansible / Terraform** | Infrastructure-as-code automation | Oz doesn't require upfront authoring — natural language, works on existing infrastructure |
| **GitHub Copilot** | AI code assistant in the IDE | Copilot suggests code; Oz executes live infrastructure operations |
| **Datadog / New Relic** | Observability and monitoring | Oz is action-oriented, not just dashboards — ask a question, Oz acts on it |
| **PagerDuty** | Incident management | Oz reduces incidents by making routine ops faster; can integrate with PagerDuty |
| **RunBook.io / Airplane** | Internal tooling platforms | Oz is AI-first, no workflow authoring needed, self-hostable |
| **AWS Systems Manager** | Cloud-native server management | Oz is cloud-agnostic, works on any server anywhere, open-source |
| **Pulumi / Crossplane** | Cloud infrastructure management | Oz operates on live infrastructure, not just provisioning |

**The Oz moat:**
1. **Natural language + live execution** — No competitor combines NLU, multi-agent orchestration, and edge AI in a self-hostable package
2. **100-agent roadmap on Cloudflare edge** — Building a defensible agent library at the edge is a 12–18 month head start
3. **Open source core** — Community-driven adoption, enterprise upsell
4. **Agent-agnostic** — Not locked to one AI provider; works with OpenCode, Claude, Codex, Gemini

---

## 16. Why Oz Wins

### The Right Timing
The convergence of three trends makes this the perfect moment:
1. AI agents are now good enough to reliably execute multi-step technical tasks
2. Cloudflare's edge AI (Workers AI) makes globally distributed, zero-cold-start AI inference affordable
3. Engineering teams are actively looking for AI tooling to reduce operational toil — the "AI for DevOps" category is forming now

### The Right Architecture
Most AI DevOps tools are wrappers around a single LLM with a chat interface. Oz is built differently:
- **Multi-agent orchestration** — Different agents for different tasks
- **Edge-first** — Cloudflare Workers mean instant responses from anywhere
- **Tool-use AI** — Agents call real APIs and make real decisions, not just generating text
- **Self-hostable** — Enterprises that can't send data to external APIs can run everything on-prem

### The Right Team
Built by engineers who have lived the problem — managing multi-server infrastructure, dealing with the operational toil, and building AI systems from the ground up.

---

## 17. Team

**Rohit Darekar** — Founder & CEO  
Full-stack engineer with deep expertise in AI systems, infrastructure automation, and product development. Built Oz from scratch — architecture, backend, frontend, AI integration, and Cloudflare edge agents.

**Company:** Afintrix  
**Email:** info@afintrix.com

---

## 18. Ask

We are raising a **seed round** to:

| Use of Funds | Allocation |
|---|---|
| Engineering (2 senior engineers) | 45% |
| Complete 100-agent roadmap | 20% |
| Go-to-market & sales | 25% |
| Infrastructure & ops | 10% |

### 12-Month Milestones with Funding

| Month | Milestone |
|---|---|
| M1–M3 | Complete 25 more Cloudflare edge agents, launch public beta |
| M3–M6 | First 100 paying customers, Pro tier, Stripe integration |
| M6–M9 | Team tier, SSO, agent marketplace beta, 500 customers |
| M9–M12 | Enterprise pilot customers, custom agent service, $1M ARR target |

### Why Now

The DevOps AI tooling market is being claimed right now. The first platform to build a comprehensive, production-ready, self-hostable AI infrastructure agent fleet will own the category. Oz has the architecture, the working product, and the roadmap to be that platform.

**We are looking for investors who believe that:**
- Every engineering team will have an AI infrastructure assistant within 3 years
- The best products in this space will combine natural language, live execution, and edge-distributed AI
- Open-source + SaaS is the winning go-to-market for developer tools

---

## Appendix A — Project File Structure

```
oz/
├── backend/                    # FastAPI control plane
│   └── app/
│       ├── core/               # Config, auth, database, WebSocket manager
│       ├── models/             # SQLAlchemy: User, AgentRun, Server, Secret,
│       │                       #   Skill, Schedule, DockerEndpoint, AuditLog
│       ├── routes/             # REST API: agents, auth, servers, secrets,
│       │                       #   skills, schedules, docker_endpoints,
│       │                       #   dashboard, chat, n8n_agents
│       └── services/           # agent_runner, server_service, skill_service,
│                               #   audit_service, secret_service
├── cloudflare-agents/          # Edge AI workers
│   ├── docker-agent/           # ✅ Docker container management (11 tools)
│   ├── server-health-agent/    # ✅ Server health monitoring (5 tools)
│   └── proxmox-agent/          # ✅ Proxmox VE management (35 tools, full CRUD)
├── leon/                       # Leon AI assistant
│   └── skills/native/oz_skill/
│       ├── skill.json          # 14 action definitions
│       ├── src/actions/        # 14 TypeScript action implementations
│       │   ├── docker_logs.ts  # Docker queries → CF docker agent
│       │   ├── server_health.ts# Health checks → CF health agent
│       │   ├── proxmox.ts      # Proxmox management → CF proxmox agent
│       │   ├── deploy.ts       # Deployments
│       │   ├── run_bash.ts     # Arbitrary bash
│       │   ├── app_logs.ts     # Application logs
│       │   ├── check_website.ts# Website availability
│       │   ├── n8n_agent.ts    # n8n workflow management
│       │   └── ...             # agent management actions
│       ├── src/lib/oz_client.ts# Routing, auth, launchAndWait, resolveTarget
│       └── locales/en.json     # Structured HTML response templates
├── docker/                     # Docker Compose stack
│   ├── docker-compose.yml      # 8-service stack definition
│   ├── .env                    # API keys and config
│   └── agent/                  # oz-agent Docker image
├── web/                        # Single-page web dashboard
├── cli/                        # Python CLI (pip install oz-cli)
├── planned-agents.md           # 100-agent roadmap tracker
└── deploy.sh                   # One-command production deploy
```

---

## Appendix B — Glossary

| Term | Definition |
|---|---|
| **Agent Run** | A single execution of an AI agent for a specific task. Has a lifecycle: PENDING → RUNNING → COMPLETED/FAILED |
| **Dynamic Tool Selection** | Per-request routing that sends only the relevant tool subset to the LLM, reducing input tokens by 75–80% |
| **Edge Agent** | A Cloudflare Worker that runs AI inference at the network edge, with no cold start and global distribution |
| **formatDockerOutput()** | The unified HTML renderer in Leon's oz_skill that formats all CF agent responses into styled dark-theme cards |
| **Leon** | The open-source AI assistant that provides the natural language interface. Handles NLU, routing, and response formatting |
| **oz-local** | The built-in Oz agent that can SSH into servers and execute commands. The fallback for all SSH-based operations |
| **oz_skill** | The Leon skill plugin that connects Leon's NLU to the Oz API. Contains 14 action implementations in TypeScript |
| **Proxmox VE** | An open-source hypervisor platform (Type 1) for running QEMU/KVM VMs and LXC containers. Oz's Proxmox agent provides full CRUD management via its REST API |
| **Pulse Manager** | Leon's autonomous background agent that proactively plans and executes tasks. Oz adds guardrails to block infrastructure operations from its queue — those are handled by dedicated edge agents |
| **QEMU Guest Agent** | A daemon running inside a Proxmox VM that allows the host to query the VM's network interfaces. Oz always enables it (`agent=1`) during cloud-init provisioning so IP retrieval works reliably |
| **resolveDockerTarget()** | The routing function that maps a natural language server reference (e.g., "AITLP-371") to a registered infrastructure target |
| **Skill** | A saved, named agent configuration. Reusable prompt templates + agent type + env vars |
| **wait_for_task** | A Proxmox agent tool that polls a Proxmox UPID (task ID) until the async operation completes. Required after clone_vm/create_container before any subsequent config steps |
| **Workers AI** | Cloudflare's serverless AI inference service. Oz uses Llama 4 Scout 17B for all edge agent reasoning and Llama 3.1 8B (fp8-fast) for Leon NLU |

---

*Built with care by AIT GLOBAL INC / Afintrix. For demos, partnerships, or investment inquiries: info@afintrix.com*

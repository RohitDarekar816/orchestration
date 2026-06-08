# Cloudflare Docker Agent

A Cloudflare Worker that executes Docker operations using Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8-fast`) and the Docker Engine REST API.

## How it works

1. Leon detects a Docker task → routes to `cloudflare_docker_agent`
2. Oz backend resolves the user's registered Docker endpoint URL from the database
3. Oz backend calls this Worker: `POST / {task, docker_url, endpoint_name}`
4. Worker uses `generateText` + Docker tools to complete the task
5. Worker returns `{output, success, tool_calls}` to Oz backend
6. Oz backend stores the output and Leon displays it to the user

## Prerequisites

- Cloudflare account with Workers AI enabled (10,000 Neurons/day free)
- Docker Engine REST API exposed at a publicly reachable URL
  - Example: `http://your-server.example.com:2375` (unauthenticated, bind to specific interface)
  - Or secured: `https://docker.your-server.com` via reverse proxy
- Docker endpoint registered in Oz UI: Settings → Docker Endpoints

## Deploy

```bash
cd cloudflare-agents/docker-agent
npm install
npx wrangler deploy
```

After deploy, copy the Worker URL (e.g. `https://cf-docker-agent.<account>.workers.dev`) and:

1. Add to `docker/.env`:
   ```
   CF_DOCKER_AGENT_URL=https://cf-docker-agent.<account>.workers.dev
   ```
2. Restart the Oz API container: `docker compose restart api`

## Register a Docker endpoint

In the Oz UI (or via API):

```bash
curl -X POST http://localhost:8000/api/docker-endpoints \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "prod-docker", "api_url": "http://your-server.example.com:2375"}'
```

## Local development

```bash
npx wrangler dev --remote
```

`--remote` is required because the Workers AI binding (`env.AI`) only works on Cloudflare's edge.

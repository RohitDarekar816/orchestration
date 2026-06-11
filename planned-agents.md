# Oz — Planned Cloudflare AI Agents

Track record of all agents planned, in-progress, and built for the Oz platform.

**Legend:** ✅ Built · 🔨 In Progress · 📋 Planned

---

## Build Status Summary

| Category | Total | Built | In Progress | Planned |
|---|---|---|---|---|
| Infrastructure & Ops | 15 | 2 | 0 | 12 |
| Virtualization (Proxmox) | 1 | 1 | 0 | 0 |
| Docker & Containers | 10 | 1 | 0 | 9 |
| Application & Deployment | 12 | 0 | 0 | 12 |
| Database & Storage | 10 | 0 | 0 | 10 |
| Security & Compliance | 10 | 0 | 0 | 10 |
| Networking & DNS | 8 | 0 | 0 | 8 |
| Monitoring & Alerting | 10 | 0 | 0 | 10 |
| AI & Productivity | 10 | 0 | 0 | 10 |
| Web & APIs | 8 | 0 | 0 | 8 |
| CI/CD & Git | 7 | 0 | 0 | 7 |
| Proxmox VE | 1 | 1 | 0 | 0 |
| **Total** | **101** | **4** | **0** | **97** |

---

## Proxmox VE (1)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 0 | `cloudflare_proxmox_agent` | ✅ Built | Full Proxmox VE management — VMs, LXC containers, nodes, storage, cluster health, power actions | `proxmox.ts` |

**13 tools:** `get_cluster_status`, `list_nodes`, `get_node_status`, `list_vms`, `get_vm_status`, `vm_action` (start/stop/shutdown/reboot/reset), `list_containers`, `get_container_status`, `container_action`, `list_storage`, `get_node_tasks`, `list_vm_snapshots`, `get_vm_config`

**Setup:** Proxmox runs on port 8006 (blocked by Cloudflare Workers). Set up an nginx proxy:
```nginx
server {
    listen 443 ssl;
    server_name proxmox.yourdomain.com;
    location / {
        proxy_pass https://127.0.0.1:8006;
        proxy_ssl_verify off;
    }
}
```
Then register the endpoint with `api_url: https://proxmox.yourdomain.com/api2/json` and an API token from Proxmox UI → Datacenter → Permissions → API Tokens.

---

## Infrastructure & Ops (15)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 1 | `cloudflare_docker_agent` | ✅ Built | Manage Docker containers — list, start, stop, logs, stats, exec | `docker_logs.ts` |
| 2 | `cloudflare_server_health_agent` | ✅ Built | Full system health check — CPU, RAM, disk, load average, container stats | `server_health.ts` (extended) |
| 3 | `cloudflare_process_agent` | 📋 Planned | List/kill processes, find memory hogs, check CPU-heavy processes via `ps`/`top` | new `process.ts` |
| 4 | `cloudflare_disk_agent` | 📋 Planned | Disk usage, largest directories, inode exhaustion, `df`/`du` analysis | new `disk.ts` |
| 5 | `cloudflare_memory_agent` | 📋 Planned | Memory pressure, swap usage, OOM kill history from kernel logs | new `memory.ts` |
| 6 | `cloudflare_cron_agent` | 📋 Planned | Read, write, and audit crontabs on remote servers | new `cron.ts` |
| 7 | `cloudflare_service_agent` | 📋 Planned | Manage systemd services — start, stop, restart, status, enable/disable | new `service.ts` |
| 8 | `cloudflare_log_search_agent` | 📋 Planned | Grep/search logs across files and containers with filters, patterns, time ranges | new `log_search.ts` |
| 9 | `cloudflare_env_agent` | 📋 Planned | Read and compare environment variables across servers or containers | new `env_check.ts` |
| 10 | `cloudflare_file_agent` | 📋 Planned | Read, write, copy, move files on remote servers via SSH | new `file_ops.ts` |
| 11 | `cloudflare_backup_agent` | 📋 Planned | Trigger and verify backups — tar/rsync/pg_dump to S3 or local path | new `backup.ts` |
| 12 | `cloudflare_uptime_agent` | 📋 Planned | Historical uptime tracking, reboot detection, last boot time across servers | new `uptime.ts` |
| 13 | `cloudflare_kernel_agent` | 📋 Planned | Kernel version, dmesg errors, hardware faults, OOM events | new `kernel.ts` |
| 14 | `cloudflare_user_agent` | 📋 Planned | List SSH users, last logins, active sessions, sudo history | new `server_users.ts` |
| 15 | `cloudflare_package_agent` | 📋 Planned | Check installed packages, available updates, security patches (apt/yum) | new `packages.ts` |

---

## Docker & Containers (10)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 16 | `cloudflare_docker_agent` | ✅ Built | List, inspect, start, stop, exec, logs, stats for containers | `docker_logs.ts` |
| 17 | `cloudflare_docker_compose_agent` | 📋 Planned | Run `docker compose up/down/pull/restart` on a remote server | new `docker_compose.ts` |
| 18 | `cloudflare_docker_image_agent` | 📋 Planned | List, pull, remove Docker images; check for outdated tags | new `docker_images.ts` |
| 19 | `cloudflare_docker_network_agent` | 📋 Planned | Inspect Docker networks, connected containers, bridge/overlay setup | new `docker_network.ts` |
| 20 | `cloudflare_docker_volume_agent` | 📋 Planned | List, inspect, and clean unused Docker volumes | new `docker_volumes.ts` |
| 21 | `cloudflare_docker_prune_agent` | 📋 Planned | Safe cleanup of stopped containers, dangling images, unused networks | new `docker_prune.ts` |
| 22 | `cloudflare_docker_registry_agent` | 📋 Planned | Push/pull images to/from a private Docker registry | new `docker_registry.ts` |
| 23 | `cloudflare_docker_build_agent` | 📋 Planned | Build Docker images from a Dockerfile on a remote server | new `docker_build.ts` |
| 24 | `cloudflare_docker_secret_agent` | 📋 Planned | Audit containers for exposed env vars, open ports, privileged flags | new `docker_audit.ts` |
| 25 | `cloudflare_docker_swarm_agent` | 📋 Planned | Manage Docker Swarm services, nodes, and stack deployments | new `docker_swarm.ts` |

---

## Application & Deployment (12)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 26 | `cloudflare_deploy_agent` | 📋 Planned | Full deploy pipeline — git pull, build, restart containers | `deploy.ts` (extend) |
| 27 | `cloudflare_rollback_agent` | 📋 Planned | Roll back a deployment to a previous git tag or Docker image | new `rollback.ts` |
| 28 | `cloudflare_n8n_agent` | 📋 Planned | Trigger n8n workflows, check execution history, list active workflows | `n8n_agent.ts` (extend) |
| 29 | `cloudflare_app_logs_agent` | 📋 Planned | Fetch and parse application-specific logs (nginx, gunicorn, pm2, etc.) | `app_logs.ts` (extend) |
| 30 | `cloudflare_nginx_agent` | 📋 Planned | Reload nginx config, check syntax, list vhosts, parse access/error logs | new `nginx.ts` |
| 31 | `cloudflare_pm2_agent` | 📋 Planned | Manage PM2 processes — list, restart, stop, logs, monit | new `pm2.ts` |
| 32 | `cloudflare_config_agent` | 📋 Planned | Read and diff config files across servers (nginx, app .env, etc.) | new `config.ts` |
| 33 | `cloudflare_seed_agent` | 📋 Planned | Run database seed or migration scripts on a server | new `db_seed.ts` |
| 34 | `cloudflare_build_agent` | 📋 Planned | Trigger builds (npm/pip/cargo/maven) on a remote server | new `build.ts` |
| 35 | `cloudflare_smoke_test_agent` | 📋 Planned | Run post-deploy smoke tests — hit key endpoints, check response codes | new `smoke_test.ts` |
| 36 | `cloudflare_feature_flag_agent` | 📋 Planned | Toggle feature flags in a config file or database table | new `feature_flag.ts` |
| 37 | `cloudflare_restart_agent` | 📋 Planned | Gracefully restart one or all services on a server | new `restart.ts` |

---

## Database & Storage (10)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 38 | `cloudflare_postgres_agent` | 📋 Planned | Run read-only SQL queries, check table sizes, slow queries, connections | new `postgres.ts` |
| 39 | `cloudflare_mysql_agent` | 📋 Planned | Query MySQL/MariaDB, show processlist, check locks, table status | new `mysql.ts` |
| 40 | `cloudflare_redis_agent` | 📋 Planned | Check Redis memory, keyspace, slow log, eviction policy, connected clients | new `redis.ts` |
| 41 | `cloudflare_mongo_agent` | 📋 Planned | Check MongoDB collections, index stats, replica set status, oplog | new `mongo.ts` |
| 42 | `cloudflare_db_backup_agent` | 📋 Planned | Run `pg_dump` / `mysqldump` and upload to S3 or local storage | new `db_backup.ts` |
| 43 | `cloudflare_db_restore_agent` | 📋 Planned | Restore a database backup from file or S3 with safety confirmation | new `db_restore.ts` |
| 44 | `cloudflare_db_migrate_agent` | 📋 Planned | Run Alembic/Django/Prisma migrations on a remote server | new `db_migrate.ts` |
| 45 | `cloudflare_s3_agent` | 📋 Planned | List, upload, download, delete objects in an S3-compatible bucket | new `s3.ts` |
| 46 | `cloudflare_elasticsearch_agent` | 📋 Planned | Check ES cluster health, index sizes, shard allocation, slow queries | new `elasticsearch.ts` |
| 47 | `cloudflare_sqlite_agent` | 📋 Planned | Query SQLite databases on remote servers — useful for edge/IoT setups | new `sqlite.ts` |

---

## Security & Compliance (10)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 48 | `cloudflare_ssl_agent` | 📋 Planned | Check SSL cert validity, expiry, chain, and cipher strength for domains | new `ssl_check.ts` |
| 49 | `cloudflare_firewall_agent` | 📋 Planned | Audit iptables/ufw rules, open ports, and unexpected inbound connections | new `firewall.ts` |
| 50 | `cloudflare_secret_audit_agent` | 📋 Planned | Scan containers and .env files for leaked secrets and weak credentials | new `secret_audit.ts` |
| 51 | `cloudflare_ssh_audit_agent` | 📋 Planned | Check SSH config hardening — PermitRoot, PasswordAuth, AllowUsers | new `ssh_audit.ts` |
| 52 | `cloudflare_fail2ban_agent` | 📋 Planned | Check fail2ban status, banned IPs, and jail activity | new `fail2ban.ts` |
| 53 | `cloudflare_cve_scan_agent` | 📋 Planned | Scan installed packages against known CVEs using `trivy` or `grype` | new `cve_scan.ts` |
| 54 | `cloudflare_login_audit_agent` | 📋 Planned | Parse auth logs for failed logins, brute force attempts, new users | new `login_audit.ts` |
| 55 | `cloudflare_permissions_agent` | 📋 Planned | Check file/directory permissions for security misconfigurations | new `permissions.ts` |
| 56 | `cloudflare_2fa_audit_agent` | 📋 Planned | Verify 2FA is enabled for all admin users across registered services | new `2fa_audit.ts` |
| 57 | `cloudflare_password_policy_agent` | 📋 Planned | Check password expiry, complexity rules on Linux and services | new `password_policy.ts` |

---

## Networking & DNS (8)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 58 | `cloudflare_dns_agent` | 📋 Planned | Lookup DNS records, check propagation, verify A/CNAME/MX/TXT records | new `dns.ts` |
| 59 | `cloudflare_ping_agent` | 📋 Planned | Ping servers, measure latency, detect packet loss across regions | `check_website.ts` (extend) |
| 60 | `cloudflare_traceroute_agent` | 📋 Planned | Run traceroute between servers to diagnose routing issues | new `traceroute.ts` |
| 61 | `cloudflare_port_scan_agent` | 📋 Planned | Check which ports are open on a host using `nmap` or `/dev/tcp` | new `port_scan.ts` |
| 62 | `cloudflare_bandwidth_agent` | 📋 Planned | Measure network throughput using `iperf` or `speedtest-cli` | new `bandwidth.ts` |
| 63 | `cloudflare_loadbalancer_agent` | 📋 Planned | Check nginx/HAProxy load balancer health, backend weights, active connections | new `loadbalancer.ts` |
| 64 | `cloudflare_vpn_agent` | 📋 Planned | Check WireGuard/OpenVPN status, peer connections, tunnel health | new `vpn.ts` |
| 65 | `cloudflare_whois_agent` | 📋 Planned | WHOIS lookup, domain expiry check, registrar info | new `whois.ts` |

---

## Monitoring & Alerting (10)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 66 | `cloudflare_alert_agent` | 📋 Planned | Send alerts to Slack/email/webhook when a threshold is breached | new `alert.ts` |
| 67 | `cloudflare_grafana_agent` | 📋 Planned | Query Grafana dashboards, fetch panel data, check alert states | new `grafana.ts` |
| 68 | `cloudflare_prometheus_agent` | 📋 Planned | Run PromQL queries, check metric values, list firing alerts | new `prometheus.ts` |
| 69 | `cloudflare_uptime_monitor_agent` | 📋 Planned | Scheduled uptime checks — HTTP/TCP/ping — with status history | new `uptime_monitor.ts` |
| 70 | `cloudflare_error_rate_agent` | 📋 Planned | Parse nginx/app logs and compute error rates over a time window | new `error_rate.ts` |
| 71 | `cloudflare_anomaly_agent` | 📋 Planned | Detect anomalies in CPU/memory/request rate using AI trend analysis | new `anomaly.ts` |
| 72 | `cloudflare_cost_agent` | 📋 Planned | Estimate server/cloud costs from resource usage data | new `cost.ts` |
| 73 | `cloudflare_sentry_agent` | 📋 Planned | Fetch recent Sentry errors, stack traces, and event counts | new `sentry.ts` |
| 74 | `cloudflare_health_report_agent` | 📋 Planned | Generate a full HTML health report across all registered servers | new `health_report.ts` |
| 75 | `cloudflare_incident_agent` | 📋 Planned | Create, update, and resolve incidents — integrates with PagerDuty or a local log | new `incident.ts` |

---

## AI & Productivity (10)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 76 | `cloudflare_summarize_agent` | 📋 Planned | Summarize long text, URLs, logs, or docs using Workers AI (no external key) | new `summarize.ts` |
| 77 | `cloudflare_rag_agent` | 📋 Planned | RAG over internal docs using CF Vectorize + Workers AI embeddings | new `ask_docs.ts` |
| 78 | `cloudflare_translate_agent` | 📋 Planned | Translate text between languages using Workers AI | new `translate.ts` |
| 79 | `cloudflare_classify_agent` | 📋 Planned | Classify support tickets, logs, or issues into categories | new `classify.ts` |
| 80 | `cloudflare_sentiment_agent` | 📋 Planned | Analyze sentiment of user feedback, reviews, or support messages | new `sentiment.ts` |
| 81 | `cloudflare_code_review_agent` | 📋 Planned | Review a code diff or file for bugs, security issues, and style | new `code_review.ts` |
| 82 | `cloudflare_generate_code_agent` | 📋 Planned | Generate boilerplate code from a spec (API endpoint, model, migration) | new `generate_code.ts` |
| 83 | `cloudflare_explain_agent` | 📋 Planned | Explain a log file, error trace, or config file in plain English | new `explain.ts` |
| 84 | `cloudflare_changelog_agent` | 📋 Planned | Auto-generate a changelog from git commits between two tags | new `changelog.ts` |
| 85 | `cloudflare_readme_agent` | 📋 Planned | Generate or update README.md based on the project structure | new `readme_gen.ts` |

---

## Web & APIs (8)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 86 | `cloudflare_website_check_agent` | 📋 Planned | Deep check — HTTP status, response time, content validation, redirects, headers | `check_website.ts` (extend) |
| 87 | `cloudflare_api_test_agent` | 📋 Planned | Test REST/GraphQL API endpoints — request/response validation, latency | new `api_test.ts` |
| 88 | `cloudflare_scrape_agent` | 📋 Planned | Scrape a webpage for specific data using CF Browser Rendering | new `scrape.ts` |
| 89 | `cloudflare_screenshot_agent` | 📋 Planned | Take screenshots of websites using CF Browser Rendering | new `screenshot.ts` |
| 90 | `cloudflare_webhook_agent` | 📋 Planned | Send and verify webhooks — test integrations, check delivery status | new `webhook.ts` |
| 91 | `cloudflare_pagespeed_agent` | 📋 Planned | Run Google PageSpeed / Lighthouse checks and return performance score | new `pagespeed.ts` |
| 92 | `cloudflare_broken_links_agent` | 📋 Planned | Crawl a website and report all broken links (404s, timeouts) | new `broken_links.ts` |
| 93 | `cloudflare_http_header_agent` | 📋 Planned | Inspect HTTP response headers — security headers, caching, CORS | new `http_headers.ts` |

---

## CI/CD & Git (7)

| # | Agent ID | Status | Description | Leon Action |
|---|---|---|---|---|
| 94 | `cloudflare_git_agent` | 📋 Planned | Run git operations on a remote server — pull, status, branch, diff, log | new `git.ts` |
| 95 | `cloudflare_github_agent` | 📋 Planned | Fetch GitHub PR status, check CI runs, list open issues via GitHub API | new `github.ts` |
| 96 | `cloudflare_gitlab_agent` | 📋 Planned | Fetch GitLab pipeline status, merge requests, and repo info | new `gitlab.ts` |
| 97 | `cloudflare_ci_status_agent` | 📋 Planned | Check the latest CI/CD pipeline status for a project | new `ci_status.ts` |
| 98 | `cloudflare_tag_release_agent` | 📋 Planned | Create a git tag and GitHub/GitLab release with auto-generated notes | new `tag_release.ts` |
| 99 | `cloudflare_pr_review_agent` | 📋 Planned | Summarize and review a pull request diff using Workers AI | new `pr_review.ts` |
| 100 | `cloudflare_dependency_agent` | 📋 Planned | Check for outdated npm/pip/cargo dependencies and security advisories | new `dependency.ts` |

---

## How to Add a New Agent

Each Cloudflare agent follows the same pattern:

### 1. CF Worker (`cloudflare-agents/<name>/src/index.ts`)
- `env.AI.run()` with Llama 4 Scout
- Tool definitions in `<name>-tools.ts`
- `executeTool()` dispatcher
- Deploy with `wrangler deploy`

### 2. Backend Agent Type
- Register the new `agent_type` string in `backend/app/models/agent.py`
- Add the CF Worker URL to the agent launcher in `backend/app/routes/agents.py`

### 3. Leon Action (`leon/skills/native/oz_skill/src/actions/<name>.ts`)
- NLU param extraction
- Call `resolveDockerTarget()` or `resolveServerByName()` for routing
- `launchAndWait({ agentType: 'cloudflare_<name>_agent', ... })`
- Format output with `formatDockerOutput()` or a custom formatter

### 4. Leon Locale (`leon/skills/native/oz_skill/locales/en.json`)
- Add answer keys for the new action

### 5. NLU Training (`leon/skills/native/oz_skill/config/nlu/<name>.json`)
- Add utterance examples so Leon can route to the skill

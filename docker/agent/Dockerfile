# oz-agent: sandboxed execution environment for AI coding agents.
# Supports opencode, claude-code, codex, and gemini-cli.
# Built to handle server ops: SSH, Docker management, deployments, log inspection.

FROM debian:12-slim

# ── System packages ───────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core
    bash curl wget ca-certificates gnupg \
    # SSH / remote access
    openssh-client sshpass \
    # Git and deployment
    git rsync zip unzip \
    # System inspection
    procps lsof htop \
    # Network tools
    iputils-ping dnsutils netcat-openbsd iproute2 \
    # Text processing
    jq less \
    # Python (for ad-hoc scripts)
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# ── Docker CLI ────────────────────────────────────────────────────────────────
# Gives agents the ability to inspect and manage Docker containers on the host
# (requires /var/run/docker.sock to be mounted at runtime).
RUN curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz | \
    tar -xz docker/docker && mv docker/docker /usr/local/bin/docker && rm -rf docker

# ── Node.js 20 ────────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── AI agent CLIs ─────────────────────────────────────────────────────────────
ENV NPM_CONFIG_PREFIX=/usr/local
ENV PATH=/usr/local/bin:$PATH

RUN npm install -g \
    opencode-ai \
    @anthropic-ai/claude-code \
    @openai/codex \
    @google/gemini-cli \
    && rm -rf /root/.npm /tmp/npm-*

# ── oz-local agent (lightweight LLM→bash loop for small local models) ─────────
COPY oz_local_agent.py /usr/local/bin/oz-local
RUN chmod +x /usr/local/bin/oz-local

# ── opencode config (NVIDIA provider; API key supplied at runtime via env var) ─
COPY opencode-config.json /root/.config/opencode/config.json

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]

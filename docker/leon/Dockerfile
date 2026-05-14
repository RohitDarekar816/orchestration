FROM node:24-slim

RUN npm install -g pnpm@latest && rm -rf /tmp/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    procps \
    python3 \
    python3-pip \
    python3-venv \
    git \
    ca-certificates \
    docker.io \
    openssh-client \
    sshpass \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install uv --break-system-packages && rm -rf /root/.cache/pip

WORKDIR /app/leon

COPY . .

ENV GITHUB_ACTIONS=true
ENV LEON_NODE_ENV=production
ENV LEON_PYTHON_PATH=/usr/bin/python3
ENV LEON_UV_PATH=/usr/local/bin/uv
RUN pnpm install --frozen-lockfile && rm -rf /root/.local/share/pnpm/store /root/.cache /tmp/*

COPY docker-entrypoint.sh /usr/local/bin/leon-entrypoint.sh
RUN chmod +x /usr/local/bin/leon-entrypoint.sh

EXPOSE 5366

ENTRYPOINT ["/usr/local/bin/leon-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]

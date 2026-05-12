FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_PREFIX=/usr/local
ENV PATH=$PATH:/usr/local/bin

RUN npm install -g \
    opencode-ai \
    @anthropic-ai/claude-code \
    @openai/codex \
    @google/gemini-cli

RUN opencode --version && claude --version && codex --version && gemini --version

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

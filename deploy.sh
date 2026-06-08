#!/bin/bash
set -e

DOCKER_DIR="$(cd "$(dirname "$0")/docker" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Docker ────────────────────────────────────────────────────────────────────
install_docker() {
    if command -v docker &>/dev/null; then
        info "Docker already installed: $(docker --version)"
        return
    fi
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    if ! groups "$USER" | grep -q docker; then
        usermod -aG docker "$USER"
        warn "Added $USER to docker group. You may need to log out and back in."
    fi
    info "Docker installed."
}

# ── .env ─────────────────────────────────────────────────────────────────────
check_env() {
    if [ ! -f "$DOCKER_DIR/.env" ]; then
        error ".env file not found at $DOCKER_DIR/.env\nCopy your .env file there and re-run."
    fi
    info ".env found."
}

# ── Command Code API Key ──────────────────────────────────────────────────────
setup_commandcode_key() {
    info "Checking Command Code API key..."
    
    # Check if key already exists in .env
    if grep -q "^COMMANDCODE_API_KEY=" "$DOCKER_DIR/.env" 2>/dev/null || \
       grep -q "^LEON_COMMANDCODE_API_KEY=" "$DOCKER_DIR/.env" 2>/dev/null; then
        info "Command Code API key already configured in .env"
        return
    fi
    
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${YELLOW}Command Code API Key Setup${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Command Code is used for AI agent execution and Leon LLM processing."
    echo "Get your API key from: https://commandcode.ai/settings/api-keys"
    echo ""
    
    read -rp "Enter your Command Code API key (or press Enter to skip): " api_key
    
    if [ -n "$api_key" ]; then
        # Add keys to .env file
        echo "" >> "$DOCKER_DIR/.env"
        echo "# Command Code API Keys" >> "$DOCKER_DIR/.env"
        echo "COMMANDCODE_API_KEY=$api_key" >> "$DOCKER_DIR/.env"
        echo "LEON_COMMANDCODE_API_KEY=$api_key" >> "$DOCKER_DIR/.env"
        info "Command Code API key saved to .env"
    else
        warn "No API key provided. You can add it later to $DOCKER_DIR/.env"
    fi
    echo ""
}

# ── Build ─────────────────────────────────────────────────────────────────────
build_images() {
    info "Building images (this may take a few minutes)..."
    docker compose -f "$DOCKER_DIR/docker-compose.yml" build api web worker beat db redis leon
    info "Building oz-agent image..."
    docker compose -f "$DOCKER_DIR/docker-compose.yml" --profile build build oz-agent
    info "Build complete."
}

# ── Start ─────────────────────────────────────────────────────────────────────
start_services() {
    info "Starting services..."
    docker compose -f "$DOCKER_DIR/docker-compose.yml" up -d api web worker beat db redis leon oz-opencode-server
    info "Waiting for API to be healthy..."
    for i in $(seq 1 30); do
        if docker compose -f "$DOCKER_DIR/docker-compose.yml" exec -T api \
            python3 -c "import app.main" &>/dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    # Give the API a moment to finish init_db
    sleep 5

    # Wait for the opencode warm server to accept connections (up to 60s).
    info "Waiting for oz-opencode-server to be ready..."
    for i in $(seq 1 30); do
        if curl -sf --max-time 2 http://localhost:4096 &>/dev/null 2>&1 || \
           curl -sf --max-time 2 http://localhost:4096/health &>/dev/null 2>&1; then
            info "oz-opencode-server is ready."
            break
        fi
        # Also accept TCP-open as "ready" (opencode serve may not return HTTP 200 on /).
        if nc -z localhost 4096 &>/dev/null 2>&1; then
            info "oz-opencode-server is ready (port open)."
            break
        fi
        sleep 2
    done

    info "Services started."
}

# ── Admin user ────────────────────────────────────────────────────────────────
create_admin() {
    info "Creating admin user..."
    docker compose -f "$DOCKER_DIR/docker-compose.yml" exec -T api python3 << 'PYEOF'
import asyncio
from app.core.database import async_session, init_db
from app.models.user import User
from app.core.auth import hash_password
from sqlalchemy import select

async def main():
    await init_db()
    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == 'admin@oz.local'))
        if not result.scalar_one_or_none():
            user = User(
                email='admin@oz.local',
                hashed_password=hash_password('admin123'),
                full_name='Admin',
                role='admin'
            )
            db.add(user)
            await db.commit()
            print('Admin user created (admin@oz.local / admin123)')
        else:
            print('Admin user already exists')

asyncio.run(main())
PYEOF
}

# ── Status ────────────────────────────────────────────────────────────────────
show_status() {
    echo ""
    info "Deployment complete. Running containers:"
    docker compose -f "$DOCKER_DIR/docker-compose.yml" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "<server-ip>")
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  Oz UI   → http://${PUBLIC_IP}:8090"
    echo -e "  API     → http://${PUBLIC_IP}:8100/docs"
    echo -e "  Leon    → http://${PUBLIC_IP}:5366"
    echo -e "  Login   → admin@oz.local / admin123"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Oz Platform Deployer         ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
    echo ""

    install_docker
    check_env
    setup_commandcode_key
    build_images
    start_services
    create_admin
    show_status
}

main "$@"

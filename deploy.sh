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

# ── Build ─────────────────────────────────────────────────────────────────────
build_images() {
    info "Building images (this may take a few minutes)..."
    docker compose -f "$DOCKER_DIR/docker-compose.yml" build
    info "Building oz-agent image..."
    docker compose -f "$DOCKER_DIR/docker-compose.yml" --profile build build oz-agent
    info "Build complete."
}

# ── Start ─────────────────────────────────────────────────────────────────────
start_services() {
    info "Starting services..."
    docker compose -f "$DOCKER_DIR/docker-compose.yml" up -d
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
                is_admin=True
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
    build_images
    start_services
    create_admin
    show_status
}

main "$@"

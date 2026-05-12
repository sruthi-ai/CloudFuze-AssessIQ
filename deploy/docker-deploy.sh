#!/usr/bin/env bash
# docker-deploy.sh — build and run AssessIQ via Docker on the server
#
# Usage (first time):
#   bash deploy/docker-deploy.sh
#
# Usage (re-deploy after git pull):
#   git pull && bash deploy/docker-deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/opt/neutaraassessment"
NGINX_CONF="/etc/nginx/sites-available/neutaraassessment"
NGINX_LINK="/etc/nginx/sites-enabled/neutaraassessment"
ENV_FILE="$APP_DIR/.env.docker"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section() { echo -e "\n${GREEN}══ $* ══${NC}"; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
section "Pre-flight checks"

command -v docker   &>/dev/null || die "Docker not installed. Run: curl -fsSL https://get.docker.com | sh"
command -v nginx    &>/dev/null || die "nginx not installed. Run: sudo apt-get install -y nginx"

[[ -f "$ENV_FILE" ]] || die ".env.docker not found at $ENV_FILE\n\nCreate it:\n  cp $APP_DIR/.env.docker.example $ENV_FILE\n  nano $ENV_FILE\n\nRequired: DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET"

# Check required vars
for VAR in DB_PASSWORD JWT_SECRET JWT_REFRESH_SECRET; do
    VALUE=$(grep "^${VAR}=" "$ENV_FILE" | cut -d= -f2-)
    if [[ -z "$VALUE" ]] || echo "$VALUE" | grep -qi "change_me"; then
        die "$VAR in $ENV_FILE is still a placeholder. Set a real value."
    fi
done

info "Pre-flight passed."

# ── Build and start containers ────────────────────────────────────────────────
section "Docker build & up"
cd "$APP_DIR"

# Pull latest base images
docker compose -f docker-compose.prod.yml --env-file .env.docker pull db 2>/dev/null || true

# Build app images (--no-cache on first run, cached on re-deploys)
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" build

# Start / recreate containers
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d --remove-orphans

info "Containers started."

# ── Wait for frontend container to be healthy ─────────────────────────────────
section "Health check"
for i in $(seq 1 30); do
    if curl -sf http://localhost:8080 &>/dev/null; then
        info "App is up at http://localhost:8080"
        break
    fi
    [[ $i -eq 30 ]] && die "App did not respond after 30s. Check logs: docker compose -f docker-compose.prod.yml logs"
    sleep 1
done

# ── nginx: install site config ────────────────────────────────────────────────
section "nginx"

if [[ ! -f "$NGINX_CONF" ]] || ! diff -q "$APP_DIR/deploy/nginx-site.conf" "$NGINX_CONF" &>/dev/null; then
    cp "$APP_DIR/deploy/nginx-site.conf" "$NGINX_CONF"
    info "nginx config updated."
fi

if [[ ! -L "$NGINX_LINK" ]]; then
    ln -s "$NGINX_CONF" "$NGINX_LINK"
    info "nginx site enabled."
fi

nginx -t && systemctl reload nginx
info "nginx reloaded."

# ── Summary ───────────────────────────────────────────────────────────────────
section "Deploy complete"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ASSESSIQ IS LIVE                               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  URL:  http://neutaraassessment.cftools.live"
echo "  API:  http://neutaraassessment.cftools.live/api/health"
echo ""
docker compose -f docker-compose.prod.yml ps
echo ""
echo -e "${YELLOW}Set up HTTPS:${NC}"
echo "  sudo certbot --nginx -d neutaraassessment.cftools.live"
echo ""
echo -e "${YELLOW}View logs:${NC}"
echo "  docker compose -f $APP_DIR/docker-compose.prod.yml logs -f"
echo ""
echo -e "${YELLOW}Re-deploy after git pull:${NC}"
echo "  cd $APP_DIR && git pull && bash deploy/docker-deploy.sh"

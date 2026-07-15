#!/usr/bin/env bash
# docker-deploy.sh — build and run AssessIQ via Docker on the server
#
# Usage (first time):
#   bash deploy/docker-deploy.sh
#
# Usage (re-deploy after git pull):
#   git pull && bash deploy/docker-deploy.sh
#
# Safety: builds the new backend/frontend images and swaps ONLY those two
# containers in (db/redis are left untouched if unchanged — no reason to ever
# restart them on a code deploy). If the new backend fails its healthcheck,
# this automatically rolls back to the previous working image and exits
# non-zero, instead of leaving a broken deploy live with no working container.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/opt/neutaraassessment"
NGINX_CONF="/etc/nginx/sites-available/neutaraassessment"
NGINX_LINK="/etc/nginx/sites-enabled/neutaraassessment"
ENV_FILE="$APP_DIR/.env.docker"
BACKEND_IMAGE="neutaraassessment-backend"
BACKEND_CONTAINER="neutaraassessment-backend-1"

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

cd "$APP_DIR"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")

# ── DB password pre-check (fail SAFE before touching the live site) ────────────
# The Postgres volume's password is fixed at first init and never changes when
# DB_PASSWORD in .env.docker is edited. If they drift, the new backend can't
# authenticate (P1000) and a normal deploy would tear down the running site
# before discovering that. Verify the .env.docker password actually works against
# the ALREADY-RUNNING database first; if not, abort and leave the live site
# completely untouched. (Skipped on a first-ever deploy when db isn't up yet.)
if docker ps --format '{{.Names}}' | grep -q '^neutaraassessment-db-1$'; then
    DB_PW=$(grep -E '^[[:space:]]*DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
    if docker exec -e PGPASSWORD="$DB_PW" neutaraassessment-db-1 psql -h 127.0.0.1 -U assessiq -d assessiq -c 'SELECT 1' >/dev/null 2>&1; then
        info "DB password matches the running database."
    else
        die "DB_PASSWORD in .env.docker does NOT match the running database — ABORTING before touching the live site (it stays up).\n\nTo make the database accept the .env.docker password, run:\n  docker exec neutaraassessment-db-1 psql -U assessiq -d assessiq -c \"ALTER USER assessiq WITH PASSWORD '<value-of-DB_PASSWORD-in-.env.docker>';\"\nthen redeploy."
    fi
else
    warn "db container not running yet (first deploy?) — skipping DB password pre-check."
fi

# ── Build new images (does not touch running containers) ──────────────────────
section "Build"

"${COMPOSE[@]}" pull db 2>/dev/null || true

# Snapshot the current backend image so we can roll back to it if the new one
# fails its healthcheck. Best-effort — fails harmlessly on a first-ever deploy.
docker tag "${BACKEND_IMAGE}:latest" "${BACKEND_IMAGE}:rollback" 2>/dev/null || true

"${COMPOSE[@]}" build --no-cache
info "Images built."

# ── Bring up db/redis if not already running (first deploy, or they were down) ─
"${COMPOSE[@]}" up -d --no-recreate db redis

# ── Swap backend + frontend only — db/redis are never touched by a code deploy ─
section "Deploy"
"${COMPOSE[@]}" up -d --no-deps --remove-orphans backend frontend || true

# ── Health check the NEW backend, with automatic rollback on failure ─────────
section "Health check"

# Covers the container's own start_period (60s) + retries*interval (5*15s=75s)
# plus buffer, so we don't roll back a backend that's still legitimately booting.
HEALTHY=false
for i in $(seq 1 60); do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$BACKEND_CONTAINER" 2>/dev/null || echo "missing")
    if [[ "$STATUS" == "healthy" ]]; then
        HEALTHY=true
        break
    fi
    if [[ "$STATUS" == "missing" ]]; then
        warn "Backend container not found (crashed on start?) — checking logs early."
        break
    fi
    sleep 3
done

if [[ "$HEALTHY" != "true" ]]; then
    warn "New backend failed to become healthy. Recent logs:"
    docker logs --tail 60 "$BACKEND_CONTAINER" 2>&1 || true

    if docker image inspect "${BACKEND_IMAGE}:rollback" &>/dev/null; then
        warn "Rolling back to the previous working backend image..."
        docker tag "${BACKEND_IMAGE}:rollback" "${BACKEND_IMAGE}:latest"
        "${COMPOSE[@]}" up -d --no-deps --force-recreate backend frontend || true

        ROLLED_BACK_HEALTHY=false
        for i in $(seq 1 60); do
            STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$BACKEND_CONTAINER" 2>/dev/null || echo "missing")
            [[ "$STATUS" == "healthy" ]] && { ROLLED_BACK_HEALTHY=true; break; }
            sleep 3
        done

        if [[ "$ROLLED_BACK_HEALTHY" == "true" ]]; then
            die "Deploy ABORTED and ROLLED BACK — site is back on the previous working version. Fix the new code and redeploy."
        else
            die "Deploy ABORTED. Rollback ALSO failed to become healthy — manual intervention required NOW. Check: docker logs $BACKEND_CONTAINER"
        fi
    else
        die "Deploy FAILED and no previous image was available to roll back to (first deploy?). Site may be down — manual intervention required. Check: docker logs $BACKEND_CONTAINER"
    fi
fi

info "New backend is healthy."

# ── Wait for the app to respond end-to-end through nginx (in the frontend container) ─
for i in $(seq 1 30); do
    if curl -sf http://localhost:8088 &>/dev/null; then
        info "App is up at http://localhost:8088"
        break
    fi
    [[ $i -eq 30 ]] && die "Backend is healthy but the app did not respond via nginx after 30s. Check: docker compose -f docker-compose.prod.yml logs frontend"
    sleep 1
done

# ── nginx: install site config ────────────────────────────────────────────────
section "nginx"

# Only install the template if the config doesn't exist yet.
# Once certbot has run it adds ssl_certificate lines to the live file — don't
# overwrite those with the uncommitted template on re-deploys.
if [[ ! -f "$NGINX_CONF" ]]; then
    cp "$APP_DIR/deploy/nginx-site.conf" "$NGINX_CONF"
    info "nginx config installed."
else
    info "nginx config already exists — skipping copy (preserves certbot SSL lines)."
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
echo ""

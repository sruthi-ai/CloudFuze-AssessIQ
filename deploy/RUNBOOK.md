# AssessIQ — Production Deployment Runbook (Docker, self-hosted server)

This is the exact sequence to deploy AssessIQ on a Linux server you control that has
Docker. The repo already contains everything needed: `docker-compose.prod.yml`,
`backend/Dockerfile`, `frontend/Dockerfile`, `backend/entrypoint.sh`, and
`deploy/docker-deploy.sh`.

> The `entrypoint.sh` runs `prisma migrate deploy` on every start, so all database
> migrations (including audio assets, transcripts, and rubric fields) apply
> automatically — you never run migrations by hand.

---

## 0. Prerequisites on the server

```bash
# Docker (if not already installed)
curl -fsSL https://get.docker.com | sh

# nginx (the deploy script uses it as the public reverse proxy + TLS terminator)
sudo apt-get update && sudo apt-get install -y nginx

# certbot (for HTTPS)
sudo apt-get install -y certbot python3-certbot-nginx
```

You also need: a **domain name** pointed (A record) at the server's public IP.

---

## 1. Get the code onto the server

```bash
sudo mkdir -p /opt/neutaraassessment
sudo chown "$USER" /opt/neutaraassessment
git clone <your-repo-url> /opt/neutaraassessment
cd /opt/neutaraassessment
```

(The deploy script expects the app at `/opt/neutaraassessment`. If you use a
different path, edit `APP_DIR` at the top of `deploy/docker-deploy.sh`.)

---

## 2. Create the production secrets file

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

Fill in **real** values:

| Var | How to set it |
|---|---|
| `DB_PASSWORD` | `openssl rand -hex 24` |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 64` (different from JWT_SECRET) |
| `FRONTEND_URL` | `https://your-domain.com` (must match your real domain) |
| `OPENAI_API_KEY` | **A freshly-issued production key.** Required for all AI features (Writing/Speaking grading, Listening TTS, transcription). Do NOT reuse the dev key that was pasted in chat — rotate it. |
| `RESEND_API_KEY` / `FROM_EMAIL` | Optional — only if you want platform-level invite emails (tenants can also set SMTP in the Settings UI). |

`REDIS_URL` is wired automatically in `docker-compose.prod.yml` (`redis://redis:6379`) —
you do not set it in `.env.docker`.

> `.env.docker` is gitignored — it must never be committed.

---

## 3. Point the nginx config at your domain

`deploy/nginx-site.conf` and the summary banner in `deploy/docker-deploy.sh` reference
the placeholder domain `neutaraassessment.cftools.live`. Replace it with your domain:

```bash
sed -i 's/neutaraassessment.cftools.live/your-domain.com/g' deploy/nginx-site.conf
```

The frontend container serves on host port **8088**; the server nginx proxies
`your-domain.com` → `localhost:8088`.

---

## 4. Deploy

```bash
bash deploy/docker-deploy.sh
```

This will: pre-flight-check your secrets (fails if any are still `change_me`),
`docker compose build --no-cache`, start db + redis + backend + frontend, wait for the
app to answer on `:8088`, install/enable the nginx site, and reload nginx.

---

## 5. Enable HTTPS

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot edits the live nginx config in place; re-runs of the deploy script preserve
those SSL lines (the script only installs the template if the config doesn't exist yet).

---

## 6. First login

The seed step creates a demo tenant on first boot:
`demo-company` / `admin@demo.com` / `Password123!`

**Change that password immediately** (or create your own tenant via `/register` and
delete the demo one) before real use.

---

## Operations

```bash
# Logs
docker compose -f /opt/neutaraassessment/docker-compose.prod.yml logs -f

# Status
docker compose -f /opt/neutaraassessment/docker-compose.prod.yml ps

# Re-deploy after code changes
cd /opt/neutaraassessment && git pull && bash deploy/docker-deploy.sh
```

Uploaded media (candidate audio/file answers, TTS Listening clips, proctoring
snapshots/recordings) lives in the `uploads_data` Docker volume and persists across
redeploys. It is **local to this host** — see the scaling note below.

---

## ⚠ Before you consider this production-grade

These are documented tradeoffs, not blockers, but decide on them consciously:

1. **`fast-jwt` CVE** — see `backend/FASTIFY_5_MIGRATION.md`. The exploitable path
   does not apply to this app's static-secret JWT config, but the fix (Fastify 5
   upgrade) is deferred. Accept or schedule it before high-stakes use.
2. **Single-instance only** — background jobs, uploaded files, and (without the Redis
   store, which is now wired) rate limiting assume one backend instance. Redis-backed
   rate limiting is in place; job-locking and shared object storage (S3) would be
   needed before running 2+ backend replicas. Fine as a single container today.
3. **Local-disk uploads** — durable across redeploys (named volume) but tied to this
   host. Back up the `uploads_data` volume, or move to object storage, before treating
   candidate recordings as long-term records of record.
4. **Rotate any secret that has ever been shared** — especially the OpenAI key.

---

## 7. Backups (do this before any real hiring round)

Candidate responses (answers + audio recordings) are written to Postgres and the
`uploads_data` volume as candidates go — durable across restarts, but on **one host**.
`deploy/backup.sh` snapshots both, with retention, so a host/disk failure can't lose data.

**Run a backup manually:**
```bash
cd /opt/neutaraassessment && bash deploy/backup.sh
```
Writes `backups/db/assessiq-<ts>.sql.gz` and `backups/uploads/uploads-<ts>.tar.gz`.

**Schedule it daily (host crontab)** — 2 AM every day, keep 14 days:
```bash
crontab -e
# add:
0 2 * * * cd /opt/neutaraassessment && RETENTION_DAYS=14 bash deploy/backup.sh >> /var/log/assessiq-backup.log 2>&1
```
Run it **more often on assessment days** (e.g. hourly) — add a second cron line with
`0 * * * *`, or just run `bash deploy/backup.sh` before/after each batch.

**Copy backups off-host (recommended)** — set an rclone remote once, then backups sync
automatically:
```bash
# after `rclone config` (S3/R2/Google Drive/etc.):
0 2 * * * cd /opt/neutaraassessment && BACKUP_RCLONE_REMOTE=myremote:assessiq-backups bash deploy/backup.sh >> /var/log/assessiq-backup.log 2>&1
```

**Restore the database** (destructive — overwrites current data):
```bash
bash deploy/restore-db.sh backups/db/assessiq-<ts>.sql.gz
```
Restore uploaded media from a matching `uploads-<ts>.tar.gz` (command noted at the
bottom of `restore-db.sh`).

> This closes gap #3 above (local-disk uploads). Verify a restore on a throwaway
> environment once, so you trust the backups before you depend on them.

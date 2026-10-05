# Docker Deployment

This page explains how to self-host the dependfix management platform (Nuxt control plane + in-container execution toolchain) with Docker / Docker Compose, covering first startup, database initialization, permissions, upgrades, backup/restore, and troubleshooting.

> Just want it running? Jump to [Quick start](#quick-start). For CLI / GitHub Action usage, see [Quick Start](./quick-start.md).

## Prerequisites

- Docker 20.10+ and Docker Compose v2 (the `docker compose` subcommand)
- At least 1 CPU / 1GB RAM (2GB+ recommended; the container runs dependency installs and verification)
- Host port `3000` (override with `PORT`)
- A non-root container identity is recommended (see [Volumes and permissions](#volumes-and-permissions))

## Quick start

```bash
cd apps/platform

# 1. (Recommended) create .env and set a strong random AUTH_SECRET
cp .env.example .env
# Edit .env: use strong random values for AUTH_SECRET / NUXT_ENCRYPTION_KEY
#   openssl rand -base64 32

# 2. Pull the image and start
docker compose pull
docker compose up -d

# 3. Watch the logs to confirm database initialization
docker compose logs -f platform
```

Open `http://<host>:3000`; the first user can register as admin (`REGISTRATION_DISABLED` defaults to `false`; set it to `true` after registering).

**Tables are created automatically on first startup**: the image has `DATABASE_MIGRATIONS_RUN=true` baked in (independent of whether compose injects it), so the application runs pending migrations at startup (on a fresh database the baseline migration creates all business tables). No manual initialization is required. The log should contain `[database] 启动期初始化完成`.

> ⚠️ **Use the `apps/platform/docker-compose.yml` that matches this version.** Even with an older compose file (which does not inject `DATABASE_MIGRATIONS_RUN`) or a plain `docker run`, the image initializes the database automatically; but an old compose file may lack other variables such as `PUID`/`PGID` and `NUXT_REDIS_URL`. If you previously started an empty database with an old compose file and saw `no such table`, upgrade the image and recreate the container to let it create the tables.

## Image and version

| Item | Default | Notes |
|:---|:---|:---|
| Image | `caomeiyouren/dependfix:latest` | Override with `DEPENDFIX_IMAGE` (e.g. `ghcr.io/dependfix/dependfix:latest` or a pinned version tag) |
| Local build | `caomeiyouren/dependfix:local` | Use the `docker-compose.build.yml` override file |
| Volumes | `dependfix-data` / `dependfix-redis` (logical names) | Named volumes; **the actual name is `<compose project>_<logical name>`** (project = `platform` when running compose under `apps/platform`, i.e. `platform_dependfix-data`; confirm with `docker volume ls`). Deleting them clears data |

```bash
# Pin an image / version
DEPENDFIX_IMAGE=caomeiyouren/dependfix:v0.3.0 docker compose up -d

# Build locally from source
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

> You can smoke-test any image for first-startup usability (auto table creation + HTTP 200 + 13 business tables) with the in-repo script:
>
> ```bash
> SMOKE_IMAGE=caomeiyouren/dependfix:latest sh apps/platform/docker/smoke-test.sh
> ```

## Environment variables

Compose reads `apps/platform/.env` and injects variables into the container. Core settings:

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `AUTH_SECRET` | ✅ | `change-me-to-a-random-secret` | better-auth session signing secret; must be strong random in production |
| `NUXT_ENCRYPTION_KEY` | ✅ (when using credentials) | empty | Credential AES-256-GCM key (32 random bytes); empty disables credential features |
| `NUXT_PUBLIC_BETTER_AUTH_URL` | Recommended | `http://localhost:3000` | Public base URL; required behind a reverse proxy / HTTPS |
| `REGISTRATION_DISABLED` | Recommended | `false` | Set to `true` after the first admin registers |
| `PORT` | No | `3000` | Host port mapping |
| `PUID` / `PGID` | No | `100` / `101` | Container run identity (see below) |
| `DATABASE_MIGRATIONS_RUN` | No | `true` (baked into the image) | Run migrations at startup; set `false` for manual initialization (then use `docker/init-db.sh`) |
| `DATABASE_PATH` | No | `/app/data/dependfix.sqlite` | SQLite file path (inside the data volume) |
| `QUEUE_ENABLED` | No | `auto` | Scan queue mode: `auto` / `true` (force async) / `false` (force sync) |
| `IN_PROCESS_WORKER` | No | `true` (in compose) | Consume the scan queue in-process (the only consumer for a single container at this stage); see the note below |

> ⚠️ **Scan queue consumer**: in `auto` (default) mode the queue runs asynchronously (enqueue returns immediately + frontend polling) only when Redis is reachable **and a consumer is present**, and it only executes with a consumer present. At this stage the only consumer is the **in-process worker** (compose `IN_PROCESS_WORKER` → container `NUXT_IN_PROCESS_WORKER`, default `true`); a standalone worker process (multi-container) is not implemented yet. `QUEUE_ENABLED=auto` (default) **automatically falls back to synchronous when no in-process worker is enabled** (log line `自动模式降级同步`), preventing jobs from hanging with no consumer. If you orchestrate the container yourself, make sure to inject `NUXT_IN_PROCESS_WORKER=true` (or `NUXT_QUEUE_ENABLED=false` for synchronous).

> ⚠️ **Compose variable names differ from container variable names**: `AUTH_SECRET` is mapped by compose to `NUXT_AUTH_SECRET`; `REGISTRATION_DISABLED` → `NUXT_REGISTRATION_DISABLED`; `QUEUE_ENABLED` → `NUXT_QUEUE_ENABLED`. Nuxt `runtimeConfig` runtime overrides only honor the `NUXT_` prefix.
>
> Full variables (SMTP, OAuth, OIDC, Redis queue, ...) are in `apps/platform/.env.example` and [Configuration](./configuration.md).

## Volumes and permissions

- `dependfix-data:/app/data`: SQLite database + startup backups (`/app/data/backups`)
- `dependfix-redis:/data`: BullMQ queue storage (Redis is internal to the platform; no host port)

The container runs as the image's `dependfix` user (uid 100 / gid 101) **non-root** by default. The entrypoint starts as root, fixes ownership of the data volume and `$HOME`, then drops privileges. For NAS / multi-user setups, align with the host user via `PUID` / `PGID`:

```bash
# .env
PUID=1000
PGID=1000
```

- `PUID=0` / `PGID=0` (or non-numeric / out-of-range values) make the entrypoint **fail closed** to preserve the non-root baseline.
- If you use the compose `user:` field to start non-root, the entrypoint cannot `chown`; the host must pre-authorize the data volume and `$HOME` write access.

## Database initialization

### Automatic (default, recommended)

With `DATABASE_MIGRATIONS_RUN=true`, the application runs pending migrations at startup:

- **Fresh empty database**: the baseline migration creates all business tables / indexes / foreign keys from entity metadata (prefix-aware, dialect-agnostic).
- **Existing database**: only pending migrations run; recorded migrations are never re-run, and the baseline skips tables that already exist.

### Manual one-click initialization

To keep full manual control (e.g. initialize in a separate step):

```bash
# Option A: disable auto-migration, then run the one-shot init container
#   set DATABASE_MIGRATIONS_RUN=false in .env
cd apps/platform
./docker/init-db.sh
# For a locally built image, add DEPENDFIX_USE_LOCAL_BUILD=1

# Option B: from source (requires pnpm + Node)
pnpm --filter @dependfix/platform db:init
```

`db:init` is idempotent: on a fresh database it creates all tables and prints the business table count; on an existing database it only applies pending migrations (prints "schema is up to date" when there are none).

### Inspect / revert / self-check (from source)

```bash
cd apps/platform
pnpm db:migrate:show            # read-only executed / pending view (no writes)
pnpm db:migrate                 # apply all pending
pnpm db:migrate:revert -- --yes # revert the last one (double-gated)
pnpm db:doctor                  # database self-check (file / PRAGMA / row counts / verdict)
```

> The runtime image (`.output`-only) does not include `tsx` or the ops scripts, so these commands cannot run inside the container. In containers use `./docker/init-db.sh`; for `db:doctor` use a source checkout. See [`server/database/scripts/README.md`](../../../../apps/platform/server/database/scripts/README.md) for details.

## Reverse proxy and HTTPS

Behind a reverse proxy, forward the `Host` header and tell better-auth the public URL:

```bash
# .env
NUXT_PUBLIC_BETTER_AUTH_URL=https://dependfix.example.com
```

OAuth callback URLs are built by better-auth from the request `Host` (e.g. `${NUXT_PUBLIC_BETTER_AUTH_URL}/api/auth/callback/github`); the proxy must keep the callback URL consistent.

## Upgrade

```bash
cd apps/platform
docker compose pull
docker compose up -d
```

- Pending migrations are applied at startup; before migrating, the app snapshots the current SQLite database to `/app/data/backups`.
- Back up the data volume beforehand (see below).
- Pin a version to roll back the image tag; to roll back a migration use `pnpm db:migrate:revert -- --yes` (source environment).

## Backup and restore

- **Automatic backup**: before each startup, SQLite is snapshotted into `/app/data/backups/` (last 5 retained by default; override with `BACKUP_RETENTION_COUNT`).
- **Volume-level backup** (recommended for cross-machine migration / disaster recovery):

```bash
# Confirm the actual volume name (default <compose project>_dependfix-data; platform_dependfix-data when run under apps/platform)
docker volume ls --format '{{.Name}}' | grep '_dependfix-data$'
VOLUME=platform_dependfix-data

# Back up the named volume to a tar
docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/dependfix-data-$(date +%Y%m%d).tgz -C /data .

# Restore: stop platform → clear volume → unpack → start
docker compose stop platform
docker run --rm -v "$VOLUME":/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/dependfix-data-YYYYMMDD.tgz -C /data'
docker compose start platform
```

> After a restore, remove stale `-wal` / `-shm` sidecar files in the same directory before starting (so stale WAL is not replayed as crash-recovery data). For accidental-change recovery, prefer replacing the database with a snapshot under `/app/data/backups/`.

## Troubleshooting

| Symptom | Cause / fix |
|:---|:---|
| Startup log `no such table: dependfix_*` | Migrations were not applied. New images migrate automatically; if it still appears, make sure it is not overridden by `DATABASE_MIGRATIONS_RUN=false`, run `./docker/init-db.sh`, and upgrade to the latest image |
| Startup log `数据库为空且未开启迁移` | Empty database with migrations explicitly disabled. Set `DATABASE_MIGRATIONS_RUN=true`, or run `./docker/init-db.sh` (from source: `pnpm db:init`) |
| Container restarts / permission errors | `PUID` / `PGID` mismatch with volume ownership; set them to the host user uid:gid, or let the entrypoint chown (default root start path) |
| Cannot register the first user | `REGISTRATION_DISABLED=true` and the database has no user; register the first admin while registration is open |
| Credential save fails with a key error | `NUXT_ENCRYPTION_KEY` is not set (32 random bytes) |
| Login callback 404 / redirect issues | `NUXT_PUBLIC_BETTER_AUTH_URL` differs from the public proxy URL, or the proxy does not forward `Host` |
| Queue inactive | Redis unreachable / version < 5.0 → automatically falls back to synchronous; look for `version_too_old` in logs |
| Scan stays `pending` / batch fails with `orphan_run` after ~30 min and logs show no execution | The async queue has no consumer: ensure the container has `NUXT_IN_PROCESS_WORKER=true` (compose `IN_PROCESS_WORKER` defaults to true); logs should show `IN_PROCESS_WORKER=true，当前进程消费扫描队列`. In `auto` mode without an in-process worker it degrades to synchronous (log `自动模式降级同步`); if you hand-roll the container and omit this variable, async jobs will never be consumed. If `QUEUE_ENABLED=true` is set explicitly it will not degrade — configure a consumer or switch back to `auto` |

Database self-check (source environment): `pnpm --filter @dependfix/platform db:doctor` prints file metadata, PRAGMAs, per-table row counts and a "data normal / cleared / schema never created" verdict.

## Security notes

- **Never mount the host `/var/run/docker.sock`** and do not grant the container privileges; the process executing untrusted code is non-root by default.
- Use strong random values for `AUTH_SECRET` / `NUXT_ENCRYPTION_KEY`; never commit them.
- For public deployments, put the service behind an HTTPS reverse proxy and disable registration after setup.
- For multi-tenant / owner-mode scanning, enable the rootless sandbox executor; see [Quick Start](./quick-start.md).

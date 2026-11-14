# Docker Deployment

This page explains how to self-host the dependfix management platform (Nuxt control plane + in-container execution toolchain) with Docker / Docker Compose, covering first startup, database initialization, permissions, upgrades, backup/restore, and troubleshooting.

> Just want it running? Jump to [Quick start](#quick-start). For CLI / GitHub Action usage, see [Quick Start](./quick-start.md).

## Prerequisites

- Docker 20.10+ and Docker Compose v2 (the `docker compose` subcommand)
- **Control plane minimum**: 1 CPU / 1 GB (UI / API only; no installs)
- **Execution plane recommended**: ≥ 2 CPU / **8 GB** (the default single container runs clone / dependency installs / verification; 4 GB has been verified to OOM)
- Host port `3000` (override with `PORT`)
- A non-root container identity is recommended (see [Volumes and permissions](#volumes-and-permissions))

## Resource sizing

By default dependfix runs the control plane (Nuxt / queue producer) and the execution plane (engine clone / install / verification) in the same container. Their memory requirements differ:

| Role | Minimum | Recommended | Notes |
|:---|:---|:---|:---|
| Control plane (UI / API only) | 1 CPU / 1 GB | 2 CPU / 2 GB | No installs; use when the worker runs on a separate host |
| Execution plane (default single container) | 2 CPU / **8 GB** | 4 CPU / 16 GB (large repos) | A single install can use ~1 GB; 4 GB has been verified to OOM |

Startup logs print the detected memory limit and queue concurrency (one line per process: HTTP and worker):

```text
[resource] role=worker plane=execution memoryLimit=4.0 GiB source=cgroup-v2 hostTotal=16.0 GiB concurrency=1 recommended=8.0 GiB status=low
```

`status=low` only warns; startup is not blocked. **Exception**: when Redis is unavailable / enqueue fails, the HTTP process degrades to synchronous execution and runs installs / verification too, so it must be sized as an execution plane (8 GB); the startup probe cannot predict this runtime degradation. For isolation, use the commented `worker` service in compose to move the worker to a separate container / host (requires PostgreSQL or another multi-writer database; SQLite across hosts is not recommended). Use container `mem_limit` / orchestrator resource limits for a hard cap; do not inject a Node heap limit into commands.

Run details expose `memory_max_bytes` / `peak_rss_bytes` / `oom_killed`; when unavailable they are `NULL` and the reason is stored in `resource_json.degradedReason`. Host-level OOM (without a container memory limit) is not guaranteed to be captured by cgroup `oom_kill`; correlate with `journalctl -k`.

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

> A local source build pulls the base image from Docker Hub (`docker.io/library/node:24.22.1-alpine`, digest-pinned); on restricted networks configure a registry mirror or proxy first, otherwise it fails with `failed to resolve source metadata`.

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
| `QUEUE_WORKER` | No | `1` (in compose) | Queue execution process isolation: `1` starts a standalone worker process that consumes the queue while the HTTP process does not (the HTTP event loop is no longer blocked by scan execution); `0` falls back to the single-process form |
| `QUEUE_ENABLED` | No | `true` (in compose) | Scan queue mode: `auto` / `true` (force async) / `false` (force sync) |
| `IN_PROCESS_WORKER` | No | `true` (in compose) | Consume the scan queue in-process under the single-process form (`QUEUE_WORKER=0`); see the note below |

> ⚠️ **Scan queue consumer**: the async queue (enqueue returns immediately + frontend polling) **requires a consumer** to actually execute. By default the container entrypoint starts a **standalone worker process** (`QUEUE_WORKER=1` in compose → `DEPENDFIX_QUEUE_WORKER=1` in the container) — scan execution (including synchronous engine subprocess calls) happens in the worker process, so the **HTTP process event loop is not blocked**, eliminating BullMQ lock-renewal failures (`could not renew lock` → stalled re-queue). Set `QUEUE_WORKER=0` to fall back to the **single-process form**, where the in-process worker consumes the queue (compose `IN_PROCESS_WORKER` → container `NUXT_IN_PROCESS_WORKER`, default `true`). If you orchestrate the container yourself (bypassing the entrypoint script), make sure to inject `NUXT_IN_PROCESS_WORKER=true` (or `NUXT_QUEUE_ENABLED=false` for synchronous), otherwise async jobs will hang with no consumer; in `auto` mode without an in-process worker it degrades to synchronous (log `自动模式降级同步`). The entrypoint also injects the process role per process `DEPENDFIX_ROLE` (worker child `worker` / HTTP main `server`; normalized to `server` in the single-process form); the worker uses it to skip HTTP-only plugins (periodic cleanup / build stamp) — look for `跳过 HTTP-only 插件` in the logs. **Worker crash self-healing**: after five consecutive fast failures the entrypoint switches to slow retry (`DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS`, default 300s) instead of permanently giving up — `stale-cleanup` can only update the DB, not consume the queue. `pending` / `running` runs left behind by a host reboot or container stop are reconciled: `running` after "execution timeout + 5 min grace", `pending` after "creation + 5 min grace" (the no-consumer branch additionally requires a job age ≥ 10 min). The BullMQ dedupe key is released so new triggers are not merged forever with `SCAN_PENDING_MERGED`. Full contract: [design §9](../../../design/governance/executor-process-isolation.md#_9-队列执行进程隔离-运行时形态) and the [queue zombie recovery design](../../../design/governance/queue-stale-recovery.md).

> ⚠️ **Compose variable names differ from container variable names**: `AUTH_SECRET` is mapped by compose to `NUXT_AUTH_SECRET`; `REGISTRATION_DISABLED` → `NUXT_REGISTRATION_DISABLED`; `QUEUE_ENABLED` → `NUXT_QUEUE_ENABLED`. Nuxt `runtimeConfig` runtime overrides only honor the `NUXT_` prefix.
>
> Full variables (SMTP, OAuth, OIDC, Redis queue, ...) are in `apps/platform/.env.full.example` (full, sectioned) and [Configuration → Platform configuration](./configuration.md#platform-configuration-apps-platform).

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

## pnpm store and dependency cache

Installs for target repositories run with pnpm inside the container. Its store (content-addressable cache) defaults to `$HOME/.local/share/pnpm/store`, which is lost whenever the container is recreated — every run would start cold. The entrypoint pins the store into the data volume:

| Item | Default | Notes |
|:---|:---|:---|
| Store directory | `/app/data/pnpm-store` | Injected by the entrypoint as `PNPM_CONFIG_STORE_DIR`; startup logs `[entrypoint] pnpm store: …` |
| Reuse scope | Across runs / container recreations | Lives on the `dependfix-data` volume; deleting the volume clears it |
| Hard links | Same filesystem only | `RUN_WORK_ROOT` defaults to `/app/data/runs`, on the same volume → installs hard-link from the store (no duplicate disk usage); a custom path on another filesystem falls back to copying |

Inspect and clean up:

```bash
# Confirm the store lives in the persistent directory (prints e.g. /app/data/pnpm-store/v11)
docker compose exec -u 100:101 platform pnpm store path
# Drop unreferenced entries only (keep packages still in use)
docker compose exec -u 100:101 platform pnpm store prune
# Clear everything (next run installs cold)
docker compose exec -u 100:101 platform rm -rf /app/data/pnpm-store
```

> `100:101` is the image default `dependfix` identity; substitute your `PUID`/`PGID` when customized (otherwise store entries are written as root).

- **Unusable falls back**: when the store directory cannot be created, is not an absolute path, or fails a write probe as the run identity (read-only mount / insufficient permissions), the entrypoint prints `warn: pnpm store 目录 … 回退 pnpm 默认位置` and keeps starting (cold install every run; never blocks). The probe is a real write rather than `test -w`, so an existing store directory on a read-only volume is detected too.
- **Custom path**: the parent directory must be traversable by the run identity (pre-`chown` the mount point to `PUID:PGID`); the entrypoint creates the store directory **as the run identity** and never `chown`s a user-supplied path (a root path is rejected with a fallback), so an unauthorized parent simply fails to create and falls back.
- **Precedence**: pnpm 11+ reads `storeDir` only from the command line / environment variables / `pnpm-workspace.yaml` / global config (a project `.npmrc` only carries auth and registry settings), and environment variables win — the platform therefore pins the cache location, so a `storeDir` declared in a target repository's `pnpm-workspace.yaml` no longer applies (the cache location belongs to the execution environment). `pnpm store path` returns the version-suffixed path (e.g. `/app/data/pnpm-store/v11`).
- **Capacity (empirical)**: the store grows with the number of dependencies; a medium-sized repository typically needs about 0.5-1.5 GB. It shares the `dependfix-data` volume with the database and backups — start with 10 GB, watch `docker system df -v`, then size by repository count. Run `pnpm store prune` periodically to drop unreferenced entries.
- **Backups**: a volume-level backup (the tar example under "Backup and restore") packages the store too; add `--exclude=./pnpm-store` when you only need the database.
- **Commit hygiene**: install artifacts never reach delivery commits — at the start of a `fix` / `fix-and-pr` run (not dry-run) the engine writes `.pnpm-store/` and `node_modules/` into the target repository's `.git/info/exclude` (idempotent, never touching the repository's `.gitignore`), delivery commits themselves only collect the whitelist plus fixer-declared paths (install artifacts are never in that set — see [pr-delivery-closure §7](../../../design/governance/pr-delivery-closure.md#_7-m48-4-提交面白名单与-yaml-定点编辑)), and the exclude entries additionally keep them from disturbing the "no changes" check; a failed write logs a warning and the run continues.

## Log files

Platform **process-level logs** (startup line, queue mode, executor clone / failures, notification delivery) are written into the data volume and remain searchable by date across container rebuilds; per-run engine logs stay in `ScanRun.logsJson` (downloadable from run details) and are **not duplicated** into the files.

| Item | Default | Description |
|:---|:---|:---|
| Directory | `/app/data/logs` | Entrypoint defaults `LOG_DIR=$DATA_DIR/logs` and exports it; follows a custom `DATA_DIR` |
| Main log | `YYYY-MM-DD.log` | Level controlled by `LOG_LEVEL` (default `info`), rotated daily, 20 MB per file |
| Error log | `YYYY-MM-DD.errors.log` | `error` level only (including fatal errors), kept separately for alerting |
| Retention | 31 days | Production builds also compress archived files (`*.gz`) |
| Console | Always on | `docker logs` behavior is unchanged (same `LOG_LEVEL` filter; `error` goes to stderr); files are an additional surface |

Troubleshooting:

```bash
# Today's main / error log
docker compose exec -u 100:101 platform sh -c 'tail -n 200 /app/data/logs/$(date +%F).log'
docker compose exec -u 100:101 platform sh -c 'tail -n 100 /app/data/logs/$(date +%F).errors.log'
# Search by keyword (today / uncompressed; production keeps 31 days of history as .gz)
docker compose exec -u 100:101 platform sh -c 'grep -h "stale-cleanup" /app/data/logs/*.log | tail -n 50'
docker compose exec -u 100:101 platform sh -c 'zcat /app/data/logs/*.log.gz 2>/dev/null | grep "stale-cleanup" | tail -n 50'
# Inspect from the host (named volume = <compose project>_dependfix-data, default project is platform)
docker run --rm -v platform_dependfix-data:/data alpine ls -la /data/logs
```

- **Process roles**: the container runs HTTP + queue worker by default and both share the log directory; startup lines carry `role=server|worker` (`[logger] files=/app/data/logs level=info role=worker`). Rotation bookkeeping files are per role (`.server-*.json` / `.worker-*.json`) so two processes never share one audit JSON.
- **Custom directory**: `LOG_DIR=/srv/logs` (absolute path recommended; relative paths resolve against the platform process cwd `/app`). The entrypoint creates the directory as the run identity and does not `chown` custom paths — pre-authorize the mount for `PUID:PGID`.
- **Unwritable falls back**: if directory creation or the write probe fails (read-only mount / insufficient permissions), the logger warns and keeps **console output only**; startup is not blocked. Do not point `LOG_DIR` at `/proc` / `/sys` (recursive mkdir blocks on pseudo filesystems; the logger disables file logging with a warning instead).
- **Fatal errors**: uncaught exceptions / unhandled rejections are written synchronously to `YYYY-MM-DD.errors.log` (a `[fatal] …` line) before the process exits and the container restarts per policy; both HTTP and worker install the hook.
- **Disable file logging**: `LOGFILES=false` (console only). The entrypoint still pre-creates an empty log directory (nothing is written). When volume is a concern, prefer `LOG_LEVEL=warn` over disabling the file channel — note the startup line is `info`, so `warn` hides it from both console and files.

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

## Schema drift recovery checklist (`no such column`)

Applies when a page / API returns `Server Error`, the server log shows `SQLITE_ERROR: no such column: <table>.<column>` (or the equivalent missing-column error on PostgreSQL / MySQL), and the column belongs to a recently added release.

Cause: the running code's entity declares the column, but the database is still on the old schema — **pending migrations were not applied** (`DATABASE_MIGRATIONS_RUN` disabled / overridden by the deployment config / database restored from an old backup). This drift is silent: a fresh database, CI and unit tests (`synchronize=true`) are all green; only an existing database fails, and only when a query first touches the table that is missing the column.

Observable signals: startup log `[database] schema 漂移：缺 N 张表 / M 列（列：…）`; the `schema` field of `GET /api/health` is `drift` (`unknown` = check not finished / skipped).

> **Gather evidence before acting**: migrations write to the database. Do not keep restarting blindly, and do not hand-run `ALTER TABLE` for just the failing column — the migration chain usually has several pending entries, so one column only moves the error to the next one.

- [ ] **1. Confirm the artifact and switches**

    ```bash
    curl -sS https://<host>/api/health           # commit should match this release; schema=ok|drift|unknown
    docker compose logs platform | grep -E '\[build\]|\[database\]'
    docker compose exec platform env | grep -E 'DATABASE_(MIGRATIONS_RUN|SYNCHRONIZE|PATH|ENTITY_PREFIX)'
    ```

    Reading: `migrationsRun=false` + missing column → this checklist applies; `migrationsRun=true` with a missing column → first look for `[database] initialization failed` (migration execution failed) and follow that error; do not edit the database directly.

- [ ] **2. Read-only check of pending migrations and columns** (the runtime image has no `sqlite3` CLI; use its bundled better-sqlite3)

    ```bash
    docker compose exec -T platform node -e '
    const Database = require("/app/.output/server/node_modules/better-sqlite3");
    const db = new Database(process.env.DATABASE_PATH || "/app/data/dependfix.sqlite", { readonly: true });
    console.log("migrations:", db.prepare("select name from migrations order by id desc limit 8").all());
    console.log("scan_run:", db.prepare("pragma table_info(dependfix_scan_run)").all().map(c => c.name).join(","));
    console.log("repository:", db.prepare("pragma table_info(dependfix_repository)").all().map(c => c.name).join(","));
    '
    ```

    Expect the latest entries to be **absent** from `migrations` (pending) and the missing columns to match the log. If the migration row **exists** but the column is still missing, note the migration name and use the exception branch in step 4.

    > Opening a WAL database read-only while the container runs can return `SQLITE_BUSY` in some environments: run `docker compose stop platform` first, then replace `docker compose exec -T platform` in the query above with `docker compose run --rm -T --no-deps -e DEPENDFIX_QUEUE_WORKER=0 platform` (keep the other arguments; the entrypoint drops to `PUID` / `PGID`, so no root-owned files are created, and the worker is disabled so the one-shot container does not run the command twice).

- [ ] **3. Stop writes → apply pending migrations once → start**

    ```bash
    docker compose stop platform
    cd apps/platform && ./docker/init-db.sh      # one-shot container: DATABASE_MIGRATIONS_RUN=true + DEPENDFIX_MIGRATIONS_ONLY=true
    docker compose up -d platform
    ```

- [ ] **4. Verify**

    ```bash
    curl -sS https://<host>/api/health           # schema should be ok
    docker compose logs platform | grep -E 'schema 漂移|启动期初始化完成'
    ```

    Check the pages too: run list / scan history summary / repository detail / PR checks recover, and `[stale-cleanup] 孤儿清理失败` stops appearing. `schema` may briefly read `unknown` right after startup (the check completes asynchronously); retry a few seconds later, or just look for `[database] schema 漂移` in the startup log.

    Orphan convergence timing: `stale-cleanup` runs its first round 30 seconds after startup and then every 5 minutes; `pending` becomes an orphan after 5 minutes, while `running` only fails after the execution limit + grace (default 30m + 5m) — `running` rows stuck during the incident converge in the next cycle that meets the threshold, not immediately on restart.

    **Exception branch (rare)**: the migration row exists but the column is missing (database restored from an old backup / `db:migrate:revert` was executed). **With writes stopped**, delete that `migrations` row and re-run step 3 so the migration replays; do not hand-add a single column.

    ```bash
    # replace <migration name> with the name found in step 2 (e.g. AddRepositoryExecutionLimits3000000000000)
    # the service is stopped, so use a one-shot container (docker compose exec needs a running one)
    docker compose run --rm -T --no-deps -e DEPENDFIX_QUEUE_WORKER=0 platform node -e '
    const Database = require("/app/.output/server/node_modules/better-sqlite3");
    const db = new Database(process.env.DATABASE_PATH || "/app/data/dependfix.sqlite");
    db.prepare("delete from migrations where name = ?").run("<migration name>");
    '
    ```

    Rollback basis: the startup backup under `data/backups/` or your own copy of the data volume.

- [ ] **5. Close out**: make sure `DATABASE_MIGRATIONS_RUN=true` is persisted in the deployment config (the image already defaults to true; focus on `.env` / orchestration / PaaS environment variables overriding it to `false`), otherwise the next new column will drift again.

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
- **Sandbox image upgrade (2026-11-14+)**: the sandbox now defaults to the separately published `dependfix-sandbox:<platform version>` (slim, ~320MB) and no longer falls back to `DEPENDFIX_IMAGE`. By default it follows the platform image registry and then falls back across Docker Hub / ghcr / ACR (ACR last; inspect + bounded pull per source); all sources failing yields `sandbox_image_unavailable`. Pin one source with `SANDBOX_IMAGE_REPO`. Repositories that need native source builds should use `dependfix-sandbox-full`.

## Backup and restore

- **Automatic backup**: before each startup, SQLite is snapshotted into `/app/data/backups/` (last 5 retained by default; override with `BACKUP_RETENTION_COUNT`). The snapshot uses the **SQLite online backup API** (`db.backup`), so it includes committed data still sitting in `-wal` — **never** replace it with "copy the main database file" (under `journal_mode=wal` the main file can be a 4 KB header page; copying it yields an empty database — see drills R3 / R7 below). In the two-process container form the backup runs only in the HTTP process (the worker skips it).
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
>
> `pnpm db:restore` takes a consistent snapshot before overwriting (`VACUUM INTO`, including un-checkpointed WAL data). If the **target database is corrupt and cannot be opened**, the restore aborts: move the corrupt main file plus `-wal` / `-shm` aside and retry with `--skip-auto-backup` (that round has no auto snapshot to undo).

## Operations drill record (2026-10-31)

> **Purpose**: turn "the docs say it works" into "it was measured" — one recorded drill each for image startup, backup/restore, migration forward/back, and queue restart (1.0 gate G7). The subject is a locally built image (`BUILD_COMMIT` / `BUILD_VERSION` injected); raw logs are not committed (`artifacts/` is gitignored), so this page keeps commands plus key output only. Two blocking defects found during the drills were fixed in the same batch (R7).

### R1 Image startup and health check

```bash
# Build (use a registry mirror when the official npm registry is unreachable; CI uses the official one, artifacts are equivalent)
docker build -f apps/platform/Dockerfile -t dependfix-m532:local \
  --build-arg BUILD_COMMIT=05719601 --build-arg BUILD_VERSION=0.4.0 .
# Start (compose default two-process form: QUEUE_WORKER=1 + QUEUE_ENABLED=true)
docker compose -p m532 --env-file env -f apps/platform/docker-compose.yml \
  -f apps/platform/docker-compose.build.yml up -d
curl -s http://127.0.0.1:3999/api/health
```

- Image: `sha256:1f49080f5cf2…` / 811 MB (includes git + python3/make/g++ toolchain; the earlier `.output`-only variant was ~239 MB without the toolchain)
- **Build provenance**: the tested image was built from the working tree containing this batch's F1 / F2 fixes (`BUILD_COMMIT=05719601` was HEAD at build time; the fixes were committed afterwards as `9b3b946d` / `eb4bb49e`). Rebuilding from a clean checkout of those commits reproduces it. The official npm registry was unreachable from this host, so the build used a registry mirror (builder-layer ENV only, never in the runtime layer); CI uses the official registry
- `/api/health` → `200 {"version":"0.4.0","commit":"05719601","startedAt":"2026-10-31T12:38:45.894Z"}`
- First start migrates automatically; `db:doctor` on a snapshot reports **17 tables** (15 business tables + `migrations` + `sqlite_sequence`)
- Two-process logs: `[entrypoint] queue worker pid=37` + `[queue] consumer ready (IN_PROCESS_WORKER=true, this process consumes the scan queue)`

### R2 report-only scan (default two-process form)

```bash
# Origin header is required (better-auth rejects same-origin requests without it)
curl -X POST .../api/auth/sign-up/email -H 'Origin: http://127.0.0.1:3999' -d '{"email":"…","password":"…","name":"…"}'
curl -X POST .../api/credentials -d '{"name":"ops-drill-pat","type":"classic-pat","token":"<PAT>"}'
curl -X POST .../api/repos -d '{"owner":"dependfix","name":"dependfix","defaultBranch":"master","credentialId":"<id>"}'
curl -X POST .../api/repos/<repoId>/scan -d '{"mode":"report-only","severityThreshold":"high"}'
```

- Run `68647e2b00824e3b` → `pending → running → completed`, `exitCode=0`, ~1.7 s, `summary.alertsFound=1`
- Engine log: `[dependfix] Fetched 1 alerts for dependfix/dependfix` / `Run dependfix-mvwe1b1p-81ll4f completed { exitCode: 0 }`

### R3 Automatic backup → restore → row-count comparison

```bash
docker compose stop platform          # stop before the next startup creates the snapshot
docker compose start platform         # startup log: backup created: /app/data/backups/dependfix.sqlite.<ts>.bak
pnpm --filter @dependfix/platform db:restore --from=<bak> --to=/tmp/restored.sqlite --yes
pnpm --filter @dependfix/platform db:doctor --path=<file> --json
```

- Snapshot: **323,584 bytes / 79 pages** (before the fix the same scenario produced a 4,096-byte empty database — see R7); `integrity_check: ok`
- Restore: `[RESTORE] database restored` + `integrity_check: ok`; 17 tables
- Row counts across live / backup / restored: **identical table by table, 0 differences**; key tables `user=1 credential=2 repository=1 scan_run=1`
- Note: `db:doctor`'s `schema_version` differs between the source (56) and the backup / restored copy (1) — it is SQLite's schema cookie, not a data-plane criterion; `page_count` (79) / `journal_mode` (wal) / per-table rows / `integrity_check` are.

### R4 Migration forward → revert → forward

```bash
export DATABASE_PATH=/tmp/mig.sqlite
pnpm --filter @dependfix/platform db:migrate:show          # file missing → everything pending (no write)
pnpm --filter @dependfix/platform db:migrate               # forward
pnpm --filter @dependfix/platform db:migrate:revert -- --yes
pnpm --filter @dependfix/platform db:migrate               # forward again
```

| Stage | `db:migrate:show` reading |
|:--|:--|
| Empty path (before) | `database file does not exist … treated as all migrations pending` (no file created) |
| After forward | `total 19, pending 0` |
| After revert | `reverted the most recent migration: AddRepositoryPrFeedback2900000000002` → `pending 1` |
| After forward again | `executed 1` → `pending 0` |

### R5 Pending convergence after a queue restart

```bash
# Control: no consumer (QUEUE_WORKER=0 + IN_PROCESS_WORKER=false, QUEUE_ENABLED=true forces async)
# Trigger a scan → the run stays pending and the job sits in bull:scan:prioritized
docker exec <redis> redis-cli zcard bull:scan:prioritized   # 1
# Restart with a consumer (IN_PROCESS_WORKER=true or QUEUE_WORKER=1)
docker compose up -d
```

- Without a consumer: run `68647ea408001f68` stayed `pending` for 30 s (6 polls), `bull:scan:prioritized=1`
- After the restart: the job was picked up within 1 s → `startedAt 12:42:01.074Z` / `finishedAt 12:42:02.817Z` → `completed`, `exitCode=0`
- **Running-state convergence (killed mid-run)**: `fix`-mode run `68648bbb3f828d3f` was `running` when the container was killed with `docker kill`; after the restart `stale-cleanup` marked it `failed` at `startedAt + 64 s` (`EXECUTION_TIMEOUT_MS=60000` + `STALE_CLEANUP_RUNNING_GRACE_MS=2000`, both lowered for the drill), `failureCode=orphan_run` / `failureStage=runtime` / `failureKind=transient`, and released the orphan job in the same pass (log `released orphan queue job: removed=1 skipped=0/1`)
- Semantics match [queue-stale-recovery](../../../design/governance/queue-stale-recovery.md): when no consumer recovers within 2 × `STALE_CLEANUP_PENDING_GRACE_MS`, stale-cleanup marks the pending run `failed` (`orphan_run`) and releases the dedupe key

### R6 Release automation dry run

See the [release guide](../../../guide/release.md) "Auto-release enablement checklist": the actual `pnpm release:plan` + `pnpm release:version --dry-run` output and the "no publish / tag / push" boundary. `schedule` / `push` triggers remain **disabled**.

### R7 Two blocking defects fixed during the drills

| ID | Symptom (measured before the fix) | Root cause | Fix |
|:--|:--|:--|:--|
| F1 | In the default two-process deployment every scan run stayed `pending`; the job sat in `bull:scan:prioritized` and Redis had no `bull:*` worker connection | The queue service is a lazy singleton; its only eager initializer (the `stale-cleanup` plugin) is skipped in the worker by process role → the worker never created a consumer | New `queue-consumer` plugin (initializes the consumer when `inProcessWorker=true`; failure exits so the entrypoint restarts it); design §9 updated |
| F2 | The startup backup was 4,096 bytes and `db:doctor` reported `schema_version=0 / 0 tables` (restoring gave an empty database) | The backup copied the main database file, while the app enforces `journal_mode=wal` — data may live entirely in `-wal` | Backup now uses the SQLite online backup API (includes un-checkpointed WAL data), writes `.tmp` then fsync + rename, and runs only in the HTTP process |

> **Reproduction scope**: F1 requires the two-process form (`QUEUE_WORKER=1`, the compose default); F2 requires "un-checkpointed data in WAL at backup time" — a graceful stop may already have cleared the WAL, so the unit test constructs that state by keeping a write connection open (`backup.test.ts`).

## Troubleshooting

| Symptom | Cause / fix |
|:---|:---|
| Startup log `no such table: dependfix_*` | Migrations were not applied. New images migrate automatically; if it still appears, make sure it is not overridden by `DATABASE_MIGRATIONS_RUN=false`, run `./docker/init-db.sh`, and upgrade to the latest image |
| Startup log `数据库为空且未开启迁移` | Empty database with migrations explicitly disabled. Set `DATABASE_MIGRATIONS_RUN=true`, or run `./docker/init-db.sh` (from source: `pnpm db:init`) |
| Page / API `Server Error`, log `no such column: <table>.<column>`, `/api/health` shows `schema=drift` | Existing database is missing columns (pending migrations not applied). Follow the [schema drift recovery checklist](#schema-drift-recovery-checklist-no-such-column): stop writes → `./docker/init-db.sh` → verify; do not hand-add one column |
| Container restarts / permission errors | `PUID` / `PGID` mismatch with volume ownership; set them to the host user uid:gid, or let the entrypoint chown (default root start path) |
| Cannot register the first user | `REGISTRATION_DISABLED=true` and the database has no user; register the first admin while registration is open |
| Credential save fails with a key error | `NUXT_ENCRYPTION_KEY` is not set (32 random bytes) |
| Login callback 404 / redirect issues | `NUXT_PUBLIC_BETTER_AUTH_URL` differs from the public proxy URL, or the proxy does not forward `Host` |
| Queue inactive | Redis unreachable / version < 5.0 → automatically falls back to synchronous; look for `version_too_old` in logs |
| Scan stays `pending` / batch fails with `orphan_run` after ~30 min and logs show no execution | The async queue has no consumer: with the container entrypoint you should see the entrypoint log `队列 worker 进程 pid=...`, and the worker process log `IN_PROCESS_WORKER=true，当前进程消费扫描队列`; under the single-process form (`QUEUE_WORKER=0`) ensure the container has `NUXT_IN_PROCESS_WORKER=true`. If you hand-roll the container without the consumer switch, async jobs will never be consumed; an explicit `QUEUE_ENABLED=true` will not degrade — configure a consumer or switch back to `auto`. The worker switches to slow retry after repeated failures (log `转为慢重试`); check `stale-cleanup`'s `consumers=yes|no|unknown` to see whether a consumer is alive. Note: when the managed Redis forbids CLIENT LIST, BullMQ may report a pseudo worker, so `consumers=yes` can be a false positive — correlate with the `bull:scan:wait` backlog |
| Re-triggering says "an in-progress scan exists, this trigger was merged" and never runs | A zombie job still holds the dedupe key. The new `stale-cleanup` releases it when there is no consumer / the job belongs to a terminal run; the batch page's "Force Fail" also releases the jobs. If it still does not recover, inspect Redis: `llen bull:scan:wait`, `zcard bull:scan:active`, `client list \| grep -c 'bull:'` (without an explicit Worker name the connection is `bull:<base64(queue)>`, without `:w:`) |

Database self-check (source environment): `pnpm --filter @dependfix/platform db:doctor` prints file metadata, PRAGMAs, per-table row counts and a "data normal / cleared / schema never created" verdict.

## Security notes

- **Never mount the host `/var/run/docker.sock`** and do not grant the container privileges; the process executing untrusted code is non-root by default.
- Use strong random values for `AUTH_SECRET` / `NUXT_ENCRYPTION_KEY`; never commit them.
- For public deployments, put the service behind an HTTPS reverse proxy and disable registration after setup.
- Multi-tenant / owner-mode scanning can use the rootless sandbox executor (only `report-only` runs for real; `fix` / `fix-and-pr` fall back to the platform container until the egress allowlist proxy is wired in). Start the rootless Docker daemon on the host and mount only its unix socket (not the host `/var/run/docker.sock`) into the platform container; see [Quick Start](./quick-start.md).

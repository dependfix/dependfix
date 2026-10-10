# Configuration

## Configuration sources (by priority)

1. CLI flags
2. Environment variables (`DEPENDFIX_*` + `GITHUB_TOKEN`)
3. Config file (`dependfix.config.json` / `dependfix.config.yaml`, planned M4+)
4. Defaults

## All configuration items

> **Scope**: this section covers the **CLI** (`dependfix` command / GitHub Action). The **platform** (`apps/platform`) environment variables (database / auth / queue / executor sandbox / backup / notification, etc.) are listed in the [Platform configuration](#platform-configuration-appsplatform) section at the end.

| Option | Environment variable | Type | Default | Description |
|:-------|:---------------------|:-----|:--------|:------------|
| `mode` | `DEPENDFIX_MODE` | `string` | `report-only` | Run mode: `report-only` / `fix` / `fix-and-pr` |
| `repositories` | `DEPENDFIX_REPOSITORIES` | `string[]` | `[]` | Target repository list (comma-separated) |
| `reposFilePath` | — (CLI `--repos-file` only) | `string` | — | Read repository list from file (one `owner/repo` per line) |
| `owner` | `DEPENDFIX_OWNER` | `string[]` | — | owner / org list (comma-separated or multiple CLI invocations), auto-discover repos by owner (M4 T401); merge with explicit `repositories` and dedupe (explicit wins, discovery only fills gaps). Only `github-dependabot` data source supports this; `cleanup-branches` mode not supported |
| `repoTopics` | `DEPENDFIX_REPO_TOPICS` | `string[]` | — | Discovery-result topic whitelist (comma-separated, **AND semantics**: repo must contain all specified topics). Only affects discovery result, not explicit list |
| `repoInclude` | `DEPENDFIX_REPO_INCLUDE` | `string[]` | — | Repo whitelist glob (comma-separated, e.g. `owner/*`, `owner/pkg-*`). **Only applies to discovery result**; explicit list not affected by include (explicit wins) |
| `repoExclude` | `DEPENDFIX_REPO_EXCLUDE` | `string[]` | — | Repo blacklist glob. **Both explicit list and discovery result are constrained by exclude**; conflicts with include → **exclude wins** |
| `repoTopicsExclude` | `DEPENDFIX_REPO_TOPICS_EXCLUDE` | `string[]` | — | Discovery-result topic blacklist (exclude repos containing any specified topic). Only affects discovery result (explicit list has no topics metadata) |
| `severityThreshold` | `DEPENDFIX_SEVERITY_THRESHOLD` | `string` | `high` | Severity threshold: `critical` / `high` / `medium` / `all` |
| `dryRun` | `DEPENDFIX_DRY_RUN` | `boolean` | `false` | Dry-run mode, do not actually modify files |
| `createPullRequest` | `DEPENDFIX_CREATE_PR` | `boolean` | `false` | Whether to create PR (auto-enabled in `fix-and-pr` mode) |
| `commit` | `DEPENDFIX_COMMIT` | `boolean` | `false` | After fix, commit locally on current branch (`fix` mode only; mutually exclusive with `--dry-run` / `--create-pr`) |
| `cleanupBranches` | `DEPENDFIX_CLEANUP_BRANCHES` | `boolean` | `false` | (fix-and-pr mode) After run, list merged `dependfix/` branches in report cleanup list (no auto delete; deletion requires `cleanup-branches` mode interactive confirmation) |
| `cleanupBranchesAuto` | `DEPENDFIX_CLEANUP_BRANCHES_AUTO` | `boolean` | `false` | (fix-and-pr mode) After run, auto-delete merged/closed `dependfix/` branches (non-interactive; never deletes branches with open PRs) |
| `githubToken` | `DEPENDFIX_GITHUB_TOKEN` / `GITHUB_TOKEN` | `string` | — | GitHub auth token (optional under `pnpm-audit` source) |
| `alertsToken` | `DEPENDFIX_ALERTS_TOKEN` | `string` | — | Dependabot alerts-specific token (optional, minimum-permission fine-grained PAT, only `Dependabot alerts: read`; falls back to `githubToken` if not set. `GITHUB_TOKEN` cannot read Dependabot alerts) |
| `alertSource` | `DEPENDFIX_ALERTS_SOURCE` | `string` | `github-dependabot` | Alert data source: `github-dependabot` (GitHub Dependabot alerts API) / `pnpm-audit` (local no-token fallback, scans current workspace lockfile; repo resolution priority: explicit `--repo` → git remote → `local` fallback). `pnpm-audit` does not require token, does not support `fix-and-pr` mode or multiple `--repo`. See [pnpm audit fallback design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture) |
| `codeScanningEnabled` | `DEPENDFIX_CODE_SCANNING` | `boolean` | `false` | Also fetch Code Scanning alerts (**parallel to** Dependabot, not a fallback; default off, behavior matches M2). When enabled, Dependabot + Code Scanning are fetched in parallel without overwriting; Code Scanning alerts are not auto-fixable by default (A/B/C rule tier per rule). Requires token `security-events: read` (GITHUB_TOKEN default); not available with `pnpm-audit`. See [Code Scanning design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture) |
| `overrideProtect` | `DEPENDFIX_OVERRIDE_PROTECT` | `string` | — | Overrides protection list (**per-repository granularity**): `repo-glob:pkg1,pkg2;repo-glob2:pkg3`. On a hit, dependfix **does not write** the override for that package and records an `OVERRIDE_PROTECTED` audit entry (prevents recurrence of destructive overrides previously removed by hand; evidence: PR #1095). Repository glob semantics match `repo-include/exclude` (a single star does not cross the slash; use a two-segment wildcard for a global fallback). See [override-protect design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/override-protect-policy.md); the list may also be declared by the target repository in `.github/dependfix.yml` (**central config wins**: once set centrally, the repo declaration is ignored entirely to prevent bypass; see [fixer design §12.7](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/dependency-fixer.md)) |
| `allowMajorUpgrade` | **No env channel** (CLI `--allow-major-upgrade` only) | `boolean` | `false` | Explicitly authorize auto-upgrade for cross-line alerts (recommended version crosses major boundary, current line has no fix). Only direct dependencies in root package.json (workspace members keep manual) with single-version lockfile alerts are auto-upgraded across lines; post-upgrade re-verification eliminates brittle instances and forces full verification (install+lint+build+test) with auto-rollback on failure. Indirect / multi-version alerts stay manual. **Deliberately not exposing `DEPENDFIX_ALLOW_MAJOR_UPGRADE` env** (combined with action.yml not exposing input → GitHub Action structural disable, prevents CI auto-cross-line surprise). See [Quick Start cross-major-upgrade section](../guide/quick-start.md) |
| `maxAlertsPerRepository` | `DEPENDFIX_MAX_ALERTS_PER_REPOSITORY` | `number` | `20` | Max alerts processed per repo |
| `maxConcurrency` | `DEPENDFIX_MAX_CONCURRENCY` | `number` | `1` | Multi-repo concurrency window (1-16, default 1 conservative sequential). `>1` emits warning (may hit GitHub rate limit); **only `report-only` mode allows concurrency** — `fix` / `fix-and-pr` share single workDir, concurrent writes cause overwrite / rollback race / install contention, config check fail-fast rejects |
| `maxRetries` | `DEPENDFIX_MAX_RETRIES` | `number` | `3` | GitHub API rate-limit retries (0-10; 0=off). For 429 / primary rate limit (403 + remaining=0) / secondary rate limit (403/429 signatures), exponential backoff (reset header priority, max 30s); permission 403 does not retry |
| `upgradeGroups` | `DEPENDFIX_UPGRADE_GROUPS` | `Record<string, string[]>` | — | User-explicit dependency groups (overrides auto-grouping), format `name1:pkg1,pkg2;name2:pkg3` (semicolon between groups, colon between group name and packages, comma between packages). Default: auto-grouping — `dependabot.yml groups` → `@types` merge → scope/prefix heuristic → single-package. See [dependency grouping design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture) |
| `verbose` | — | `boolean` | `false` | Verbose logging (CLI `--verbose` only) |
| `commands` | — | `string[]` | — | Custom verification commands (CLI `--commands` only) |
| `history` | — (CLI `--history` only) | `string` | — | Query repo history run summary (read `dependfix-reports/index.json`, reverse chronological, repo-level count), **does not run scan**, no token/repo required; with run flags history takes precedence, others ignored |

## GitHub auth token permission mapping

> **Recommended: [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new)** (classic PAT still compatible but lacks fine-grained permission control). This section lists **Fine-grained PAT minimum permissions** per scenario to grant minimum necessary permissions.

### Minimum permission matrix per mode

| Mode | Triggered GitHub API / ops | **Classic PAT scopes** | **Fine-grained PAT permissions** (Repository dimension) | Token scope |
|:-----|:---------------------------|:------------------------|:-------------------------------------------------------|:------------|
| **`report-only`** (Dependabot alerts) | `repos.get` + `dependabot.listAlertsForRepo` | `security_events` (Dependabot alerts under this scope, **not `repo`**) + `repo` (repos.get needs it) | Contents: **Read-only** + Dependabot alerts: **Read-only** | Classic: all yours + collaborator; Fine-grained: target repos |
| **`report-only`** + Code Scanning | + `code-scanning.listAlertsForRepo` | `security_events` (Dependabot + Code Scanning both under this scope) + `repo` | + Code scanning alerts: **Read-only** | Same as above |
| **`fix`** (local commit only, no push) | Same as `report-only` | Same as `report-only` | Same as `report-only` | Same as `report-only` |
| **`fix-and-pr`** (git push + PR create) | + `git push` (HTTPS credential) + `pulls.create` + `pulls.list` + `pulls.update` | `repo` (git push / pulls / deleteRef / branch mgmt) + `security_events` (**required**: Dependabot + Code Scanning alerts read) | Contents: **Read and write** + Pull requests: **Read and write** + Dependabot alerts: **Read-only** + Code scanning alerts: **Read-only** (Code Scanning source only) | Same as above |
| **`cleanup-branches`** | + `git.listMatchingRefs` + `git.deleteRef` + `pulls.update` | `repo` + `security_events` (need to read alert state before cleanup) | Contents: **Read and write** + Pull requests: **Read and write** + Dependabot alerts: **Read-only** | Same as above |

> **Core differences**:
> - **Classic PAT**: `repo` scope covers git push / pulls / branch management / collaborator; **`security_events` scope separately covers Dependabot + Code Scanning alerts**. `fix-and-pr` mode requires **both scopes** (don't think `repo` is "all-powerful" — Dependabot alerts are not inside `repo`).
> - **Fine-grained PAT**: must check **all 4 permissions individually** (Contents:Write + Pull requests:Write + Dependabot alerts:Read + Code scanning alerts:Read when Code Scanning is enabled). All are required.

### Fine-grained PAT creation steps (e.g. `fix-and-pr`)

1. Open `https://github.com/settings/personal-access-tokens/new` (**Personal access tokens → Fine-grained tokens**)
2. **Token name**: e.g. `dependfix-fix-and-pr-<env>` (env distinguishes dev / staging / prod)
3. **Expiration**: 90 days recommended (avoid permanent tokens; rely on GitHub reminder + own secret rotation)
4. **Resource owner**: select target owner / org. **Private org requires org admin to pre-authorize the token in org settings** (SAML SSO orgs need additional SSO authorization)
5. **Repository access**: choose **Only select repositories** → list target repos (Fine-grained PAT can only cover specified repos in one org, cannot cross orgs; multi-org scanning needs multiple tokens or migration to GitHub App)
6. **Repository permissions** check:
   - Contents: **Read and write** (git push create fix branch)
   - Pull requests: **Read and write** (`pulls.create` + `pulls.update`)
   - Dependabot alerts: **Read-only** (`dependabot.listAlertsForRepo`)
   - Code scanning alerts: **Read-only** (if `--code-scanning` source is enabled)
   - Metadata: **Read-only** (auto-enabled, baseline)
7. **Account permissions**: usually no change (default read-only)
8. Generate → copy token (**shown only once**) → set as env var:
   ```bash
   export GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx
   ```

### Classic PAT creation steps (e.g. `fix-and-pr`)

1. Open `https://github.com/settings/tokens/new` (**Personal access tokens → Tokens (classic)**)
2. **Note**: e.g. `dependfix-fix-and-pr-<env>`
3. **Expiration**: 90 days recommended (**can be shorter**, but classic PAT does not force expiry)
4. **Select scopes** (check minimum required):
   - ☑️ `repo` — **required** (git push / pulls / deleteRef / branch mgmt / Contents RW / collaborator; **does not cover Dependabot alerts**)
   - ☑️ `security_events` — **required** (for Dependabot alerts or Code Scanning source; covers both alerts read)
   - ❌ `public_repo` — **do not check** (unless explicitly needed for public repos; `repo` covers it)
   - ❌ `workflow` — **do not check** (dependfix does not manage Actions workflow)
   - ❌ `read:packages` / `write:packages` — **do not check** (dependfix does not download/publish private npm)
   - ❌ `admin:org` — **do not check** (minimum-privilege, never grant org management)
5. **Generate token** → copy token (**shown only once**) → set as env var:
   ```bash
   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```

### Classic PAT vs Fine-grained PAT comparison

| Dimension | Classic PAT | Fine-grained PAT (recommended) |
|:----------|:-----------|:-------------------------------|
| Permission granularity | Coarse-grained scopes (`repo` / `security_events` / etc.) | Per-repository fine-grained permissions (Contents / Pull requests / Dependabot alerts / Code scanning alerts) |
| Multi-org support | One PAT covers all orgs you have access | One PAT per org only; multi-org needs multiple PATs |
| Expiration | Optional (no forced expiry) | Required (max 1 year) |
| SAML SSO | Classic PAT needs per-org **Enable SSO** | Same — but org admin needs to pre-authorize the PAT |
| Audit | Limited | Per-token repository access list visible |
| Suitable scenarios | Personal scripts, simple scenarios | Production deployment, org-grade automation |

## Config file

`dependfix.config.json` support is planned for **M4+** (work item C52). Before that, the recommended way to share configs across environments is:

1. Document env vars in deployment runbook (set per env)
2. Use CI/CD secret management (e.g. GitHub Actions secrets + per-env variables)
3. Use a script wrapper that injects env vars

After M4 lands, you can use a JSON / YAML config file (merging order: defaults → file → env vars → CLI flags, with later sources overriding earlier).
## Platform configuration (apps/platform)

The management platform (`apps/platform`) is configured via env vars injected by compose from `apps/platform/.env`.

- **Quick start (minimal)**: `cp apps/platform/.env.example .env` → set at least `AUTH_SECRET` (+ `NUXT_ENCRYPTION_KEY` when using the credentials feature).
- **Full variables**: `apps/platform/.env.full.example` (all variables + defaults + sections).
- **Full deployment steps**: see [Docker deployment](./deployment.md).

> ⚠️ **Injection model (important)**: the default `docker-compose.yml` has **no `env_file`** — it forwards only a whitelist of variables via `${...}` interpolation into the container (**compose name → container name**):
> `PORT` · `PUID`/`PGID` · `AUTH_SECRET`→`NUXT_AUTH_SECRET` · `DATABASE_PATH` · `DATABASE_MIGRATIONS_RUN` · `NUXT_ENCRYPTION_KEY` · `REGISTRATION_DISABLED`→`NUXT_REGISTRATION_DISABLED` · `NUXT_PUBLIC_BETTER_AUTH_URL` · `NUXT_REDIS_URL` (hard-coded) · `QUEUE_ENABLED`/`QUEUE_JOB_RETRIES`/`QUEUE_BACKOFF_MS`→`NUXT_*` · `QUEUE_WORKER`→`DEPENDFIX_QUEUE_WORKER` · `IN_PROCESS_WORKER`→`NUXT_IN_PROCESS_WORKER` · `DEPENDFIX_IMAGE`/`DEPENDFIX_BUILD_IMAGE`.
> Variables **outside** the whitelist below (email / OAuth / OIDC / `AUTH_MODE` / `DATABASE_TYPE|URL|SSL|SYNCHRONIZE` / `BACKUP_*` / `RUN_WORK_ROOT` / `SANDBOX_*` / `DEPENDFIX_AI_*` / `ACTION_STATUS_MONITOR_ENABLED` / notification, etc.) are **not injected by default** — add them to the compose `environment:` (Nuxt runtimeConfig vars need the `NUXT_` prefix) or via `docker run -e`.
>
> ⚠️ **Nuxt runtime override prefix**: the platform is a Nuxt app; `runtimeConfig` runtime overrides **only honor the `NUXT_` prefix** — compose var `AUTH_SECRET` → container `NUXT_AUTH_SECRET`; `REGISTRATION_DISABLED` → `NUXT_REGISTRATION_DISABLED`. Build-time-baked env (e.g. `AUTH_MODE`) needs the `NUXT_` prefix at runtime, otherwise it silently falls back to the default. Server vars read directly via `process.env` (`DATABASE_*` / `CLONE_*` / `DEPENDFIX_*`, etc.) are injected under their original names.

### Essential

| Variable (compose / container name) | Required | Default | Description |
|:---|:---:|:---|:---|
| `AUTH_SECRET` → `NUXT_AUTH_SECRET` | ✅ prod | `change-me-to-a-random-secret` | better-auth session signing key; set a strong random value in production (`openssl rand -hex 32`) |
| `NUXT_ENCRYPTION_KEY` | ✅ when using credentials | empty | Credentials AES-256-GCM key (32 random bytes); empty disables the credentials feature |
| `PORT` | — | `3000` | Platform listen port |
| `NUXT_PUBLIC_BETTER_AUTH_URL` | recommended (required for reverse proxy / HTTPS) | `http://localhost:3000` | Public URL; OAuth callbacks and better-auth `trustedOrigins` tightening depend on it (falls back to wildcard if unset) |
| `NUXT_PUBLIC_BASE_URL` | — | empty | Legacy alias (read as a `trustedOrigins` fallback); use `NUXT_PUBLIC_BETTER_AUTH_URL` for new deployments |
| `NUXT_PUBLIC_DEFAULT_BRANCH` / `DEFAULT_BRANCH` | — | `main` | Default branch for new repos (build-time injected) |
| `MACHINE_ID` | — | PID % 1024 | Snowflake machine ID (0-1023); set explicitly for multi-instance |

### Database & backup

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `DATABASE_PATH` | — | `data/dependfix.sqlite` | SQLite file path (compose injects `/app/data/dependfix.sqlite`) |
| `DATABASE_TYPE` / `DATABASE_URL` | — | inferred | Non-SQLite backend (PostgreSQL, etc.) |
| `DATABASE_SSL` / `DATABASE_CHARSET` / `DATABASE_TIMEZONE` / `DATABASE_ENTITY_PREFIX` | — | empty | Connection tuning |
| `DATABASE_SYNCHRONIZE` | — | `false` | TypeORM auto-sync; ⚠️ forbidden in production ([development §5.1.19](https://github.com/dependfix/dependfix/blob/master/docs/standards/development.md)) |
| `DATABASE_MIGRATIONS_RUN` | — | `true` in image | Run pending migrations on startup (fresh DB auto-creates tables) |
| `DEPENDFIX_MIGRATIONS_ONLY` | — | `false` | Internal: migration-only mode (used by `docker/init-db.sh`) |
| `BACKUP_SKIP` | — | `false` | Skip startup backup (e2e only) |
| `BACKUP_RETENTION_COUNT` | — | `5` | Startup backup retention count |

### Authentication & social login

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `AUTH_MODE` | — | `public` | Auth mode: `enterprise` (OIDC SSO + email domain allowlist) / `public` (GitHub/Google OAuth + email domain blocklist) |
| `REGISTRATION_DISABLED` | — | `false` | Disable registration (keep login); set `true` after the first admin registers |
| `ALLOWED_EMAIL_DOMAINS` | — | empty | Enterprise allowlist (comma-separated); empty disables auto-provisioning |
| `BLOCKED_EMAIL_DOMAINS` | — | empty | Public blocklist (comma-separated) |
| `NUXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | — | empty | Frontend allowlist hint (blocklist not exposed) |
| `BETTER_AUTH_TRUSTED_ORIGINS` | — | empty | Explicit trustedOrigins list (comma-separated, reverse proxy / multi-domain) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | empty | GitHub OAuth (public mode; enabled only when both are set) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | empty | Google OAuth (public mode; enabled only when both are set) |
| `OIDC_DISCOVERY_URL` / `OIDC_ISSUER` | — | empty | OIDC SSO (enterprise; enabled when discovery/issuer + clientId + clientSecret are set) |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | empty | OIDC client credentials |
| `OIDC_AUTHORIZATION_URL` / `OIDC_TOKEN_URL` / `OIDC_USERINFO_URL` / `OIDC_SCOPES` | — | empty / `openid,profile,email` | Manual endpoint overrides for IdPs without discovery |

### Email (SMTP)

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | empty / `587` | Configuring it enables email verification and password reset; otherwise skipped |

### Scan queue & Redis

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `REDIS_URL` | — | `redis://127.0.0.1:6379` | BullMQ queue; async when Redis reachable + version ≥ 5.0 + a consumer exists, otherwise sync. The default compose hard-codes the container's `NUXT_REDIS_URL` to `redis://redis:6379` (built-in redis); this var applies only to custom orchestration / direct process |
| `QUEUE_ENABLED` | — | `auto` | `auto` / `true` (force async) / `false` (force sync). In the compose whitelist (→ `NUXT_QUEUE_ENABLED`) |
| `QUEUE_JOB_RETRIES` / `QUEUE_BACKOFF_MS` | — | empty | Job retries / backoff (ms); in the compose whitelist (→ `NUXT_*`) |
| `QUEUE_WORKER` → `DEPENDFIX_QUEUE_WORKER` | — | compose `1` / entrypoint `0` | Independent worker process consuming the queue (removes BullMQ lock-renewal failures); `0` reverts to single-process. ⚠️ **compose-side name is `QUEUE_WORKER`** |
| `DEPENDFIX_QUEUE_WORKER_SOCKET` | — | `/tmp/dependfix-queue-worker.sock` | Worker internal socket path (outside the whitelist; container name) |
| `IN_PROCESS_WORKER` → `NUXT_IN_PROCESS_WORKER` | — | `true` (compose) / `false` (direct process) | In-process worker (sole consumer in single-process deployments); the effective default follows compose forwarding |
| `STALE_CLEANUP_INTERVAL_MS` | — | `300000` | Orphan task cleanup cadence (ms) |

### Executor / sandbox / scan

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `RUN_WORK_ROOT` | — | `data/runs` | Run working root (clone / execution artifacts) |
| `CLONE_TIMEOUT_MS` | — | `300000` | git clone timeout (ms) |
| `CLONE_MAX_RETRIES` | — | `3` | Max clone retries |
| `SANDBOX_RUNTIME` | — | `runc` | Sandbox OCI runtime |
| `SANDBOX_IMAGE` | — | `dependfix-platform:latest` | Sandbox image |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | — | empty | Egress proxy (engine verification phase) |
| `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING` | — | `false` | Suppress the "local non-container execution" security warning (local debugging only) |
| `ACTION_STATUS_MONITOR_ENABLED` | — | `false` | Dependabot PR-check status monitor master switch; requires a PAT credential and PR activity |
| `DEPENDFIX_AI_PROVIDER` / `_MODEL` / `_BASE_URL` / `_API_URL` / `_API_KEY` / `_TRIGGER` | — | empty | AI triage config for the engine inside platform scans (injected from org-level AI config) |

### Notification

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `DEPENDFIX_ENV_ALERT_RECIPIENTS` | — | org admin/org_admin emails | Environment alert email recipients (comma-separated, overrides default) |
| `DEPENDFIX_LOCALE` | — | `zh-CN` | Notification email language (`zh-CN` / `en-US`) |

### Docker / deployment

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `PUID` / `PGID` | — | `100` / `101` | Run identity (data volume and `$HOME` ownership); `0` makes the entrypoint fail-closed |
| `RUN_USER` | — | `dependfix` | Run user name |
| `DEPENDFIX_ALLOW_ANY_DIR` | — | `0` | Allow chown scope outside `/app` and `/home` (advanced) |
| `DEPENDFIX_IMAGE` / `DEPENDFIX_BUILD_IMAGE` | — | `caomeiyouren/dependfix:latest` / `:local` | Image selection / local build image name |
| `DEPENDFIX_USE_LOCAL_BUILD` | — | `0` | Deployment script uses the locally built image |

> **Internal / test variables** (do not set in production): `NODE_ENV` / `E2E_TEST` / `NUXT_E2E_FIXTURES_ALLOWED` / `AUTH_TRACE` / `CI` — see `apps/platform/.env.full.example` §10. CLI and MCP variables (`DEPENDFIX_GITHUB_TOKEN` / `DEPENDFIX_MCP_REPORT_DIR` / `PNPM_VERSION`, etc.) are covered earlier in this document and in the respective package READMEs.

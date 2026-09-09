# Configuration

## Configuration sources (by priority)

1. CLI flags
2. Environment variables (`DEPENDFIX_*` + `GITHUB_TOKEN`)
3. Config file (`dependfix.config.json` / `dependfix.config.yaml`, planned M4+)
4. Defaults

## All configuration items

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
| `allowMajorUpgrade` | **No env channel** (CLI `--allow-major-upgrade` only) | `boolean` | `false` | Explicitly authorize auto-upgrade for cross-line alerts (recommended version crosses major boundary, current line has no fix). Only direct dependencies in root package.json (workspace members keep manual) with single-version lockfile alerts are auto-upgraded across lines; post-upgrade re-verification eliminates brittle instances and forces full verification (install+lint+build) with auto-rollback on failure. Indirect / multi-version alerts stay manual. **Deliberately not exposing `DEPENDFIX_ALLOW_MAJOR_UPGRADE` env** (combined with action.yml not exposing input → GitHub Action structural disable, prevents CI auto-cross-line surprise). See [Quick Start cross-major-upgrade section](../guide/quick-start.md) |
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
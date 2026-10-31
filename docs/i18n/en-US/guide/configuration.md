# Configuration

## Configuration sources (by priority)

1. CLI flags
2. Environment variables (`DEPENDFIX_*` + `GITHUB_TOKEN`)
3. Config file (`dependfix.config.json` / `dependfix.config.yaml`, **not available yet**)
4. Defaults

## All configuration items

> **Scope**: this section covers the **CLI** (`dependfix` command / GitHub Action). The **platform** (`apps/platform`) environment variables (database / auth / queue / executor sandbox / backup / notification, etc.) are listed in the [Platform configuration](#platform-configuration-apps-platform) section at the end.

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
| `alertSource` | `DEPENDFIX_ALERTS_SOURCE` | `string` | `github-dependabot` | Alert data source: `github-dependabot` (GitHub Dependabot alerts API) / `pnpm-audit` (local no-token fallback, scans current workspace lockfile; repo resolution priority: explicit `--repo` → git remote → `local` fallback). `pnpm-audit` does not require token, does not support `fix-and-pr` mode or multiple `--repo`. See [pnpm audit fallback design](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/pnpm-audit-fallback.md) |
| `codeScanningEnabled` | `DEPENDFIX_CODE_SCANNING` | `boolean` | `false` | Also fetch Code Scanning alerts (**parallel to** Dependabot, not a fallback; default off, behavior matches M2). When enabled, Dependabot + Code Scanning are fetched in parallel without overwriting; Code Scanning alerts are not auto-fixable by default (A/B/C rule tier per rule). Requires token `security-events: read` (GITHUB_TOKEN default); not available with `pnpm-audit`. See [Code Scanning design](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/data-model.md) |
| `overrideProtect` | `DEPENDFIX_OVERRIDE_PROTECT` | `string` | — | Overrides protection list (**per-repository granularity**): `repo-glob:pkg1,pkg2;repo-glob2:pkg3`. On a hit, dependfix **does not write** the override for that package and records an `OVERRIDE_PROTECTED` audit entry (prevents recurrence of destructive overrides previously removed by hand; evidence: PR #1095). Repository glob semantics match `repo-include/exclude` (a single star does not cross the slash; use a two-segment wildcard for a global fallback). See [override-protect design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/override-protect-policy.md); the list may also be declared by the target repository in `.github/dependfix.yml` (**central config wins**: once set centrally, the repo declaration is ignored entirely to prevent bypass; see [fixer design §12.7](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/dependency-fixer-records.md)) |
| `allowMajorUpgrade` | **No env channel** (CLI `--allow-major-upgrade` only) | `boolean` | `false` | Explicitly authorize auto-upgrade for cross-line alerts (recommended version crosses major boundary, current line has no fix). Only direct dependencies in root package.json (workspace members keep manual) with single-version lockfile alerts are auto-upgraded across lines; post-upgrade re-verification eliminates brittle instances and forces full verification (install+lint+build+typecheck+test) with auto-rollback on failure. Indirect / multi-version alerts stay manual. **Deliberately not exposing `DEPENDFIX_ALLOW_MAJOR_UPGRADE` env** (combined with action.yml not exposing input → GitHub Action structural disable, prevents CI auto-cross-line surprise). See [Quick Start cross-major-upgrade section](../guide/quick-start.md) |
| `maxAlertsPerRepository` | `DEPENDFIX_MAX_ALERTS_PER_REPOSITORY` | `number` | `20` | Max alerts processed per repo |
| `maxConcurrency` | `DEPENDFIX_MAX_CONCURRENCY` | `number` | `1` | Multi-repo concurrency window (1-16, default 1 conservative sequential). `>1` emits warning (may hit GitHub rate limit); **only `report-only` mode allows concurrency** — `fix` / `fix-and-pr` share single workDir, concurrent writes cause overwrite / rollback race / install contention, config check fail-fast rejects |
| `maxRetries` | `DEPENDFIX_MAX_RETRIES` | `number` | `3` | GitHub API rate-limit retries (0-10; 0=off). For 429 / primary rate limit (403 + remaining=0) / secondary rate limit (403/429 signatures), exponential backoff (reset header priority, max 30s); permission 403 does not retry |
| `upgradeGroups` | `DEPENDFIX_UPGRADE_GROUPS` | `Record<string, string[]>` | — | User-explicit dependency groups (overrides auto-grouping), format `name1:pkg1,pkg2;name2:pkg3` (semicolon between groups, colon between group name and packages, comma between packages). Default: auto-grouping — `dependabot.yml groups` → `@types` merge → scope/prefix heuristic → single-package. See [dependency grouping design](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/dependency-grouping.md) |
| `verbose` | — | `boolean` | `false` | Verbose logging (CLI `--verbose` only) |
| `commands` | — | `string[]` | — | Custom verification commands (CLI `--commands` only); **replaces the whole default chain** (no merging) |
| `rollbackGranularity` | `DEPENDFIX_ROLLBACK_GRANULARITY` | `unit` / `repo` | `unit` | Verification failure rollback granularity: `unit` reverts the latest probe-verified change unit and re-verifies once (preserving earlier units); `repo` keeps repository-level `git reset --hard` as the escape hatch. CLI: `--rollback-granularity` |
| `mirrorCiScripts` | `DEPENDFIX_MIRROR_CI_SCRIPTS` | `boolean` | `false` | Append the target repository's CI-only `pnpm` / `npm` / `yarn` scripts to the verification chain (CLI `--mirror-ci-scripts`; Action `mirror-ci-scripts`). When enabled they run **after** the default chain, at most 3 entries, stopping at the first failure; `docker build` / `gh` / arbitrary shell and non-single-form fragments (flags / env assignments / extra arguments; install-class commands count as covered) are recorded as `mirrorSkipped` and not executed; **only the command form and script existence are checked, the script body is not audited** (commands and `pre`/`post` hooks inside the script still run); shares the same timeout (`DEPENDFIX_VERIFY_TIMEOUT_MS`) and run-level cancel surface as the default chain, and is likewise part of the pre-fix baseline sampling (baseline already red → pre-existing failure, no rollback, exit code unchanged). An explicit `commands` replaces the whole chain and **does not stack** with mirror; the platform keeps it off by default. See [PR delivery closure design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/pr-delivery-closure.md) §5 |
| `retryFailed` | `DEPENDFIX_RETRY_FAILED` | `boolean` | `false` | Ignore the per-alert attempt cap and force another try (CLI `--retry-failed`; Action `retry-failed`). `fix-and-pr` only: after the same alert / same target version / same fix strategy has been closed twice, from the 3rd attempt on dependfix **does not upgrade and does not open a PR**, recording `alertsSkippedByReason['repeated-failure']` (report shows `Skipped: Repeated failure`); when enabled it still runs and the report marks it `forced (manual retry)` in the `Repeated Failure Attempts` section. The counter lives in PR body HTML comments (closed, unmerged PRs only, last 50, read failures fail-open); when every alert is skipped the run behaves like a zero-alert repo (no pre-fix baseline sampling). See [PR delivery closure design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/pr-delivery-closure.md) §6 |
| `onBaselineRed` | `DEPENDFIX_ON_BASELINE_RED` | `skip` / `issue` / `draft` | `skip` | Delivery downgrade when post-fix verification still hits pre-existing failures (baseline red). `skip` rolls back and leaves a trace (default, identical to the behavior before this option); `issue` opens an issue keyed by the "repo set + failing command set" fingerprint (one issue per fingerprint, never reopened after close; requires `issues: write`) while changes are still rolled back; `draft` does not roll back, commits as usual and opens a **draft** PR (body carries the pre-existing failure note, `--wait-pr-checks` does not wait). `fix-and-pr` only; the platform execution chain only records `summary.deliverySkipped` and shows "delivery skipped" in the run list / details. None of the three levels changes the exit code (`PRE_EXISTING_FAILURE` stays in the skip whitelist). See [PR delivery closure design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/pr-delivery-closure.md) §16 |
| `waitPrChecks` | `DEPENDFIX_WAIT_PR_CHECKS` | `boolean` | `false` | Wait for the check terminal state after opening a PR (CLI `--wait-pr-checks`; Action `wait-pr-checks`). `fix-and-pr` only: on failure it comments the failing job names + URLs + an attempt marker by default; a PR with no check after the grace period (≥60 s and at least two rounds) becomes `no_ci_detected` and is **never judged green**; polling / commenting / closing failures are only recorded and never change the fix result or the exit code. See [PR delivery closure design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/pr-delivery-closure.md) §8 |
| `closeFailedPr` | `DEPENDFIX_CLOSE_FAILED_PR` | `boolean` | `false` | Close the PR and delete the branch when checks fail and the aggregate attribution is `self_caused` (CLI `--close-failed-pr`; Action `close-failed-pr`). Requires `waitPrChecks` (config validation rejects enabling it alone); `unknown` / `external_noise` / `pre_existing` only comment without closing, mixed attribution is treated as `unknown` |
| `prCheckTimeoutMs` | `DEPENDFIX_PR_CHECK_TIMEOUT_MS` | `number` | `900000` | Per-PR check wait cap (ms; 60000-1800000). Timeouts are recorded as `checksTimedOut` and the PR is left for a later run / the platform |
| `prCheckRunBudgetMs` | `DEPENDFIX_PR_CHECK_RUN_BUDGET_MS` | `number` | `1200000` | Run-level total wait budget (ms; 60000-1800000); the effective wait is further capped by "remaining job budget × 70%" |
| `jobBudgetMs` | `DEPENDFIX_JOB_BUDGET_MS` | `number` | unset | Job budget baseline (ms; 60000-7200000). When unset it only applies as 25 minutes while `GITHUB_ACTIONS=true` (aligned with `security-auto-fix.yml` `timeout-minutes`); local / platform runs never invent a job cap and derive from this value once it is set explicitly. Note `startedAt` counts from engine start and excludes Actions setup steps |
| `history` | — (CLI `--history` only) | `string` | — | Query repo history run summary (read `dependfix-reports/index.json`, reverse chronological, repo-level count), **does not run scan**, no token/repo required; with run flags history takes precedence, others ignored |

> **AI triage config is in place**: the Action side uses the `ai` / `ai-api-key` / `ai-provider` / `ai-model` / `ai-base-url` / `ai-api-url` / `ai-trigger` inputs; the platform injects `DEPENDFIX_AI_*` from the org-level AI config (see [Platform configuration (apps/platform)](#platform-configuration-apps-platform) below).

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

### Special cases

- **Running inside GitHub Actions**: the default `secrets.GITHUB_TOKEN` carries Contents:Write + Pull requests:Write but **no Dependabot alerts:Read** (see [roadmap.md M2](https://github.com/dependfix/dependfix/blob/master/docs/plan/roadmap.md), or the [G2 disposition record](https://github.com/dependfix/dependfix/blob/master/docs/plan/archive/todo-archive-phases-m2-m55.md)). Two options:
  1. Configure an extra `DEPENDFIX_ALERTS_TOKEN` with a Fine-grained PAT (Dependabot alerts:Read only, least privilege)
  2. Switch to the `pnpm-audit` source (`DEPENDFIX_ALERTS_SOURCE=pnpm-audit`, which does not need a token to read alerts)
- **SAML SSO orgs**: a classic PAT needs **Enable SSO** per organization on the GitHub website; a Fine-grained PAT needs an org admin to pre-authorize the repository scope. Private org repos are only returned within what the token can see — `--owner` discovery does not guarantee full private-repo coverage; authorize per repository.
- **Cross-org scanning**: a Fine-grained PAT can only be authorized for repos inside one org. Multi-org options:
  1. Multiple PATs (multiple CLI passes, one per org)
  2. Migrate to a GitHub App (recommended: cross-org + fine-grained permissions + short-lived token rotation)
- **git push auth details**: `git push` goes through an HTTPS credential (username = token owner, password = PAT) and **does not rely** on the Fine-grained PAT's specific scopes (Contents:Read+write is enough to authorize the HTTPS push). SSH keys take a different path (`git remote set-url origin git@github.com:...`).

### Verifying token permissions

Minimal verification scripts (confirm Dependabot alerts are readable):

```bash
# A Fine-grained PAT should be able to list alerts:
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/{owner}/{repo}/dependabot/alerts?state=open"
# Expected: 200 + a JSON array
# Failure: 403 / "Resource not accessible by integration" → missing Dependabot alerts:Read, or the repo is outside the token scope
```

```bash
# Code Scanning source verification (when enabled):
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/{owner}/{repo}/code-scanning/alerts?state=open"
# Expected: 200 + a JSON array
```

```bash
# PR creation permission verification (when fix-and-pr is enabled):
curl -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/{owner}/{repo}/pulls" \
  -d '{"title":"[verify] token scope check","head":"<some-branch>","base":"main","body":"verification only"}'
# Expected: 201 (delete the PR afterwards); 422 / 403 → insufficient permission or repo not authorized
```

### Common issues

| Symptom | Root cause | Fix |
|:---|:---|:---|
| `403 / Resource not accessible by integration` | Token lacks `Dependabot alerts: Read`, or the repo is outside the token scope | Recreate the PAT and confirm Dependabot alerts:Read + repository authorization |
| `401 / Bad credentials` | Token expired / revoked / mistyped | Regenerate and check the `ghp_xxx` / `github_pat_xxx` prefix |
| `git push` hangs at `Username for 'https://github.com':` | No HTTPS credential; dependfix uses `stdio: 'pipe'` (see [engine/src/runners/process-control.ts](../../../../packages/engine/src/runners/process-control.ts)) so stdin is unreachable → hangs forever | Set the `GITHUB_TOKEN` env var or configure a git credential helper (interactive input is not recommended) |
| `pulls.create` returns `422 Validation Failed: head` | Token lacks Contents:Write, or the branch already exists | Upgrade to Contents:Read+write or use a different branch name |
| `secondary rate limit` 403/429 | High-frequency API calls in a short window | Tune `DEPENDFIX_MAX_CONCURRENCY` (default 1, conservative sequential) + `DEPENDFIX_MAX_RETRIES` (default 3 exponential backoff) |

### Related resources

- [GitHub Docs · Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub Docs · Dependabot alerts API](https://docs.github.com/en/rest/dependabot/alerts)
- [GitHub Docs · Code Scanning API](https://docs.github.com/en/rest/code-scanning)
- [quick-start.md](./quick-start.md) — full CLI command list + SAML SSO notes
- [security.md §5.2 supply-chain trust boundary](https://github.com/dependfix/dependfix/blob/master/docs/standards/security.md) — AI-suggested packages / MCP / skill provenance verification + token trust levels

### M4 list-policy precedence semantics (T403)

| Source | include whitelist | exclude blacklist | topicsExclude |
|:-----|:---|:---|:---|
| Explicit `repositories` (`--repo` / `--repos-file`) | **Not affected** (explicit wins) | Constrained (dropped on a hit) | Not applicable (explicit list has no topics metadata) |
| `--owner` discovery result | Constrained (must match one when include is non-empty) | Constrained (dropped on a hit) | Constrained (dropped when it carries any listed topic) |

- Conflict rule: when include and exclude both match, **exclude wins** (the repo is dropped).
- Filter timing: the policy is applied during discovery, **before** `dependabot.yml` probing — excluded repos never reach the contents API (probe request count stays bounded).
- Glob syntax: `*` matches any run of non-`/` characters (does not cross the repo separator), `?` matches a single non-`/` character, everything else is literal; matching is against the full `owner/repo` (case-sensitive).

## Config file

`dependfix.config.json` support is **not available yet** and has no scheduled milestone. Until it lands, the recommended way to share configs across environments is:

1. Document env vars in deployment runbook (set per env)
2. Use CI/CD secret management (e.g. GitHub Actions secrets + per-env variables)
3. Use a script wrapper that injects env vars

When config-file support lands, the merging order will be defaults → file → env vars → CLI flags, with later sources overriding earlier.

## Environment variables

```bash
export GITHUB_TOKEN=ghp_xxx
export DEPENDFIX_MODE=report-only
export DEPENDFIX_SEVERITY_THRESHOLD=high
export DEPENDFIX_REPOSITORIES=owner/repo-a,owner/repo-b
export DEPENDFIX_DRY_RUN=true
export DEPENDFIX_MAX_ALERTS_PER_REPOSITORY=20
export DEPENDFIX_COMMIT=false
export DEPENDFIX_CLEANUP_BRANCHES=false
# M4 multi-repo governance (optional)
# owner-level auto-discovery (merged with DEPENDFIX_REPOSITORIES and deduped, explicit wins)
export DEPENDFIX_OWNER=owner-a,owner-b
# Discovery-result topic whitelist (AND semantics) and blacklist (drop repos carrying any listed topic)
export DEPENDFIX_REPO_TOPICS=node,pnpm
export DEPENDFIX_REPO_TOPICS_EXCLUDE=deprecated,archived
# Repository whitelist / blacklist globs (the whitelist affects discovery only; the blacklist also applies to the explicit list)
export DEPENDFIX_REPO_INCLUDE=owner-a/*,owner-b/pkg-*
export DEPENDFIX_REPO_EXCLUDE=owner-a/legacy-*
# Concurrency and rate limiting (default 1 conservative sequential; >1 allowed in report-only only; backoff retries default 3)
export DEPENDFIX_MAX_CONCURRENCY=4
export DEPENDFIX_MAX_RETRIES=3
# User-explicit dependency groups (optional; auto-grouping is used when unset)
# Format: name1:pkg1,pkg2;name2:pkg3
export DEPENDFIX_UPGRADE_GROUPS="eslint-stack:eslint,eslint-plugin-vue;nuxt-stack:@nuxt/eslint,nuxt"
# Set this only when the GitHub token cannot read Dependabot alerts (e.g. GITHUB_TOKEN inside Actions);
# use a minimum-permission fine-grained PAT (Dependabot alerts: read only)
export DEPENDFIX_ALERTS_TOKEN=github_pat_xxx
# Local no-token fallback: scan the current workspace lockfile with pnpm audit
# (no GITHUB_TOKEN / no git remote required; repository shows the git remote or local)
export DEPENDFIX_ALERTS_SOURCE=pnpm-audit
# Verification chain: append target-repo CI-only package-manager scripts after the default chain (off by default; at most 3)
export DEPENDFIX_MIRROR_CI_SCRIPTS=false
# Same-alert attempt cap: skipped from the 3rd attempt by default; set true to force another try (fix-and-pr only)
export DEPENDFIX_RETRY_FAILED=false
# Delivery downgrade when the baseline is red (install still fails after fixes): skip (default) / issue / draft
# export DEPENDFIX_ON_BASELINE_RED=skip
# Per-verification-command timeout (default 10 minutes; shared by the default chain and mirrored CI scripts, and pnpm install inside the default chain is still timed by this value; the fixer install chain is unaffected)
# export DEPENDFIX_VERIFY_TIMEOUT_MS=600000
```

> The `GITHUB_TOKEN` environment variable is detected automatically and needs no prefix. `DEPENDFIX_GITHUB_TOKEN` takes precedence over `GITHUB_TOKEN`.

## Platform configuration (apps/platform)

The management platform (`apps/platform`) is configured via env vars injected by compose from `apps/platform/.env`.

- **Quick start (minimal)**: `cp apps/platform/.env.example .env` → set at least `AUTH_SECRET` (+ `NUXT_ENCRYPTION_KEY` when using the credentials feature).
- **Full variables**: `apps/platform/.env.full.example` (all variables + defaults + sections).
- **Full deployment steps**: see [Docker deployment](./deployment.md).

> ⚠️ **Injection model (important)**: the default `docker-compose.yml` has **no `env_file`** — it forwards only a whitelist of variables via `${...}` interpolation into the container (**compose name → container name**):
> `PORT` · `PUID`/`PGID` · `AUTH_SECRET`→`NUXT_AUTH_SECRET` · `DATABASE_PATH` · `DATABASE_MIGRATIONS_RUN` · `NUXT_ENCRYPTION_KEY` · `REGISTRATION_DISABLED`→`NUXT_REGISTRATION_DISABLED` · `NUXT_PUBLIC_BETTER_AUTH_URL` · `NUXT_REDIS_URL` (hard-coded) · `QUEUE_ENABLED`/`QUEUE_JOB_RETRIES`/`QUEUE_BACKOFF_MS`→`NUXT_*` · `QUEUE_WORKER`→`DEPENDFIX_QUEUE_WORKER` · `IN_PROCESS_WORKER`→`NUXT_IN_PROCESS_WORKER` · `PNPM_CONFIG_STORE_DIR` · `LOG_DIR`/`LOG_LEVEL`/`LOGFILES` · `DEPENDFIX_IMAGE`/`DEPENDFIX_BUILD_IMAGE`.
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
| `DATABASE_SYNCHRONIZE` | — | `false` | TypeORM auto-sync; ⚠️ forbidden in production ([engineering practice note EP-17](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/engineering-practice-notes.md)) |
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
| `DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS` | — | `300` | Slow-retry interval (seconds, 1-3600; invalid / 0 falls back to 300) after the worker exceeds the consecutive fast-failure limit; restarts are never permanently abandoned. Forwarded by compose |
| `DEPENDFIX_ROLE` | — | injected per process by the entrypoint (`worker` / `server`) | Process role: `worker` skips HTTP-only plugins (periodic cleanup / build stamp), avoiding duplicated DB queries and log noise; the entrypoint normalizes it to `server` in the single-process form (equivalent to unset: nothing is skipped); unset for direct processes. Outside the whitelist (container-internal); contract: [platform.md §10.6](../../../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程) |
| `IN_PROCESS_WORKER` → `NUXT_IN_PROCESS_WORKER` | — | `true` (compose) / `false` (direct process) | In-process worker (sole consumer in single-process deployments); the effective default follows compose forwarding |
| `STALE_CLEANUP_INTERVAL_MS` | — | `300000` | Orphan task cleanup cadence (ms) |
| `STALE_CLEANUP_RUNNING_GRACE_MS` | — | `300000` | Grace period (ms, > 0; invalid / 0 falls back to default) after a running run exceeds the execution timeout before it is marked `orphan_run`. Forwarded by compose |
| `STALE_CLEANUP_PENDING_GRACE_MS` | — | `300000` | Minimum wait (ms, > 0; invalid / 0 falls back to default) before a pending run is considered orphaned when no consumer exists / the job belongs to a terminal run; the no-consumer branch additionally requires a job age ≥ 2× this value. Forwarded by compose |

### Executor / sandbox / scan

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `RUN_WORK_ROOT` | — | `data/runs` | Run working root (clone / execution artifacts) |
| `EXECUTION_TIMEOUT_MS` | — | `1800000` (30 min) | Single-repo execution timeout; the container executor and queue Worker lock duration share one resolver (`resolveExecutionTimeoutMs()`). Out-of-range (< 1 min / > 24 h) or invalid falls back to default |
| `DEPENDFIX_INSTALL_TIMEOUT_MS` | — | `300000` (5 min) | Install-class command timeout (dependency install and lockfile repair chain share one resolver); out-of-range (< 10 s / > 30 min) or invalid falls back to default. On timeout the engine cancels the run and terminates the child process tree |
| `DEPENDFIX_VERIFY_TIMEOUT_MS` | — | `600000` (10 min) | Timeout for a single verification command (ms; strict positive integer, 10 s-30 min, out-of-range / invalid values fall back to the default). Shared by the default chain and mirrored CI scripts; the `pnpm install` inside the default chain is still timed by this value. The fixer's install chain is unaffected |
| `CLONE_TIMEOUT_MS` | — | `300000` | git clone timeout (ms) |
| `CLONE_MAX_RETRIES` | — | `3` | Max clone retries |
| `PNPM_CONFIG_STORE_DIR` | — | `/app/data/pnpm-store` (derived by the entrypoint) | pnpm store shared by target-repository installs: inside the data volume by default, reused across runs / container recreations. The entrypoint probes writability **as the run identity** (covering read-only mounts); when unusable (read-only / insufficient permissions / not absolute) it warns and falls back to pnpm's default location under `$HOME` (cold install every run; never blocks). A custom path's parent must be traversable by `PUID`/`PGID`, and the store must sit on the same filesystem as `RUN_WORK_ROOT` for hard links. Clean up with `pnpm store prune` (see [pnpm store and dependency cache](./deployment.md#pnpm-store-and-dependency-cache)) |
| `SANDBOX_RUNTIME` | — | `runc` | Sandbox OCI runtime |
| `SANDBOX_IMAGE` | — | `dependfix-platform:latest` | Sandbox image |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | — | empty | Egress proxy (engine verification phase) |
| `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING` | — | `false` | Suppress the "local non-container execution" security warning (local debugging only) |
| `ACTION_STATUS_MONITOR_ENABLED` | — | `false` | Dependabot PR-check status monitor master switch; requires a PAT credential and PR activity |
| `DEPENDFIX_AI_PROVIDER` / `_MODEL` / `_BASE_URL` / `_API_URL` / `_API_KEY` / `_TRIGGER` | — | empty | AI triage config for the engine inside platform scans (injected from org-level AI config) |

> **Resource sizing**: the control plane (UI / API only) needs at least 1 CPU / 1 GB; the default single container / worker that runs installs and verification should have ≥ 2 CPU / 8 GB (4 GB has been verified to OOM). The `[resource]` startup log prints the cgroup / host memory limit and concurrency; below the recommendation it only warns and does not block startup. Run records expose `scan_run.memory_max_bytes` / `peak_rss_bytes` / `oom_killed`; when unavailable they are `NULL` with the reason in `resource_json.degradedReason`. When Redis is unavailable / enqueue fails, the HTTP process degrades to synchronous execution and must also be sized as an execution plane (8 GB). See [Docker deployment → Resource sizing](./deployment.md#resource-sizing).

### Notification

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `DEPENDFIX_NOTIFICATION_ENABLED` | — | `true` | Notification master switch; `false` disables all email (including platform incidents) |
| `DEPENDFIX_NOTIFICATION_RECIPIENT_CAP` | — | `50` | Recipient cap per email |
| `DEPENDFIX_ENV_ALERT_RECIPIENTS` | — | org admin/org_admin emails | Environment alert email recipients (comma-separated, overrides default) |
| `DEPENDFIX_WEEKLY_DIGEST_HOUR` | — | `9` | Weekly digest trigger hour (0-23, server timezone; invalid values fall back to 9); requires both organization and personal switches on |
| `DEPENDFIX_LOCALE` | — | `zh-CN` | Notification email language (`zh-CN` / `en-US`) |

### Logging

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `LOG_DIR` | — | `/app/data/logs` (entrypoint derives `$DATA_DIR/logs`) | Process-level log directory (daily rotation, 31-day retention; errors go to `YYYY-MM-DD.errors.log`). Follows the data volume when `DATA_DIR` is customized; use an absolute path for custom values |
| `LOG_LEVEL` | — | `info` | Log level: `error` / `warn` / `info` / `http` / `verbose` / `debug` / `silly`; filters console and files alike; invalid values fall back to `info` with a warning |
| `LOGFILES` | — | `true` | Whether to write files (`true/false` · `1/0` · `yes/no` · `on/off`); `false` keeps stdout / stderr only (`docker logs` still works), invalid values fall back to the default with a warning. An unwritable directory falls back to console with a warning |

> Channel split: process-level logs (startup / queue / executor / notification) go through the unified logger into files; per-run engine output stays in `ScanRun.logsJson` via `MemoryLogger` (visible on the console, never duplicated into the log files). Troubleshooting commands and retention are in [Docker deployment → Log files](./deployment.md#log-files).

### Docker / deployment

| Variable | Required | Default | Description |
|:---|:---:|:---|:---|
| `PUID` / `PGID` | — | `100` / `101` | Run identity (data volume and `$HOME` ownership); `0` makes the entrypoint fail-closed |
| `RUN_USER` | — | `dependfix` | Run user name |
| `DEPENDFIX_ALLOW_ANY_DIR` | — | `0` | Allow chown scope outside `/app` and `/home` (advanced) |
| `DEPENDFIX_IMAGE` / `DEPENDFIX_BUILD_IMAGE` | — | `caomeiyouren/dependfix:latest` / `:local` | Image selection / local build image name |
| `DEPENDFIX_USE_LOCAL_BUILD` | — | `0` | Deployment script uses the locally built image |
| `NUXT_BUILD_VERSION` / `NUXT_BUILD_COMMIT` | — | `unknown` | Deployment artifact version stamp (injected via `--build-arg` at build time, read-only at runtime, verified through `GET /api/health` and the startup log; the same value is recorded as each run's build receipt and shown in run details; usually no need to set on the deploy side) |

> **Internal / test variables** (do not set in production): `NODE_ENV` / `E2E_TEST` / `NUXT_E2E_FIXTURES_ALLOWED` / `AUTH_TRACE` / `CI` — see `apps/platform/.env.full.example` §10. CLI and MCP variables (`DEPENDFIX_GITHUB_TOKEN` / `DEPENDFIX_MCP_REPORT_DIR` / `PNPM_VERSION`, etc.) are covered earlier in this document and in the respective package READMEs.

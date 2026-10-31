# Quick Start

## Prerequisites

- Node.js ^22.23.4 || ^24.22.1 (baseline of the 2026-10-21 Node.js security advisory; older versions carry unfixed High-severity vulnerabilities, and 20.x is EOL)
- pnpm (latest stable recommended)
- GitHub Token (for alert fetching and PR creation; **a local run without a token can fall back to `--alerts-source pnpm-audit`**, see [Local without a token](#local-without-a-token-pnpm-audit-fallback))
  - `report-only` / `fix` modes: require `security-events: read`
  - `fix-and-pr` mode: additionally requires `contents: write` + `pull-requests: write`

## Installation

```bash
# Global install
pnpm add -g dependfix

# Or run directly (no install required)
npx dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

## Basic Usage

### Report-only mode (view alerts)

```bash
# When running inside a git repository, --repo is inferred automatically
cd /path/to/your-repo
dependfix report-only --github-token $GITHUB_TOKEN

# Specify the repository explicitly
dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

Reports are written to `./dependfix-reports/` (Markdown + JSON).

### Fix mode

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --severity-threshold high
```

Runs dependency upgrades and lockfile repairs; changes stay in local files and are not committed by default.

Add `--commit` to commit to the current branch right after the fixes (no push, no PR):

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --commit
```

> Note: `--commit` commits **all** uncommitted changes in the working tree (including your own edits and fixes that failed verification). Run it on a clean working tree.

### Fix and open a PR

```bash
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN
```

After the full fix flow it creates a `dependfix/auto-fix-{content fingerprint}` branch (the fingerprint is the first 8 characters of the fix content sha256), commits the changes, pushes and opens a Pull Request. The PR body contains the fix summary, the change list and the verification results.

**PR deduplication (since v0.2)**: rerunning with the same fix content (same alert set) does not open a duplicate PR; when the content changes, the old PR is closed and a new one is opened (the new body notes `Supersedes`), so only one up-to-date dependfix PR exists at a time.

### Cleaning up merged branches

```bash
dependfix cleanup-branches --repo owner/repo --github-token $GITHUB_TOKEN
```

Lists remote branches with the `dependfix/` prefix and classifies them (merged / closed / open kept); branches are deleted **only after interactive confirmation (y/N)**. Non-interactive environments (CI / pipes) refuse to delete by default.

In `fix-and-pr` mode, `--cleanup-branches` only lists merged branches in the report as a cleanup list (no deletion):

```bash
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN --cleanup-branches
```

### Multiple repositories

```bash
# Comma-separated repositories
dependfix fix --repo owner/repo-a,owner/repo-b --github-token $GITHUB_TOKEN

# Read the repository list from a file
dependfix fix --repos-file ./repos.txt --github-token $GITHUB_TOKEN
```

#### org / user auto-discovery (`--owner`)

`--owner` (or `DEPENDFIX_OWNER`) discovers repositories under an organization / user and merges them with explicit `--repo` entries (deduplicated, explicit wins):

```bash
# Discover every repository in the org and open fix PRs
dependfix fix-and-pr --owner your-org --github-token $GITHUB_TOKEN
```

Discovery mechanism: first `GET /users/{owner}` decides the subject type (Organization / User); organizations go through `GET /orgs/{org}/repos`, users through `GET /users/{user}/repos`. Then filter in order — drop archived / disabled / forks → topic whitelist (AND) → include / exclude / topicsExclude list policy → probe `.github/dependabot.yml` (candidates only, bounded concurrency). Results are sorted lexicographically by `owner/repo`, so repeated runs are identical. Token permission requirements: see [Configuration → list policy](./configuration.md#m4-list-policy-precedence-semantics-t403).

> ⚠️ **SAML SSO note**: in organizations with SAML SSO enabled, a classic PAT needs **Enable SSO** per organization on the GitHub website; a fine-grained PAT needs an org admin to authorize the repository scope. Private org repositories are only returned within what the token can see — `--owner` discovery does not guarantee full private-repo coverage; authorize per repository.
>
> **Limits and boundaries**: the `cleanup-branches` mode (positional) does not support `--owner` (branch cleanup needs an explicit target repository; config validation fails fast); `--cleanup-branches` / `--cleanup-branches-auto` are `fix-and-pr` add-ons and are compatible with `--owner`. Fix branches are pushed straight to the target repository (the PR is created in the same repository, no fork needed), so org repositories need a token with `Contents: write`.

### Local without a token (pnpm-audit fallback)

When no GitHub token is available (or Dependabot alerts permission cannot be obtained), use the local `pnpm audit` as the alert source — zero credentials, and non-GitHub directories work too:

```bash
cd /path/to/your-repo
dependfix report-only --alerts-source pnpm-audit
dependfix fix --alerts-source pnpm-audit --commit
```

- Repository resolution priority: explicit `--repo` → git remote (no token does not mean no remote) → `local` fallback
- The report header states `Alert Source: pnpm-audit`; every alert has `source` = `pnpm-audit`, distinguishable from the GitHub source
- Limits: `report-only` / `fix` modes only (`fix-and-pr` needs a GitHub PR); at most 1 `--repo`
- 403 (token present but insufficient permission) does **not** degrade automatically — it still fails hard and suggests switching to `--alerts-source pnpm-audit`
- Details in [pnpm audit fallback design](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/pnpm-audit-fallback.md)

### Dry run

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --dry-run
```

With `--dry-run` no file is modified; only the planned operations are printed.

## GitHub Action usage

Create `.github/workflows/dependfix.yml` in your repository:

```yaml
name: Daily Security Scan
on:
  schedule:
    - cron: '0 6 * * *'   # every day at 06:00 UTC
  workflow_dispatch:        # manual trigger

permissions:
  contents: write          # required by fix-and-pr mode
  pull-requests: write     # required by fix-and-pr mode
  issues: write            # since M19.3: duplicate PR auto-comment + duplicate label (wider than pull-requests: write)
  security-events: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: dependfix/dependfix@v0.6.0
        with:
          # mode already defaults to fix-and-pr (can be omitted); declared explicitly here
          mode: fix-and-pr
          severity-threshold: high
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # ⚠️ GITHUB_TOKEN cannot read the Dependabot alerts API (GitHub App-only permission, always 403).
          # Configure a minimum-permission fine-grained PAT (Dependabot alerts: read only) as a dedicated token:
          # GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens,
          # Repository permissions → Dependabot alerts → Read-only.
          dependabot-alerts-token: ${{ secrets.GH_PAT }}
          # Optional: also fetch Code Scanning alerts (parallel source next to Dependabot;
          # requires the security-events: read permission, which GITHUB_TOKEN has by default)
          code-scanning: true
```

> **⚠️ Breaking change (since v0.2)**: the Action default `mode` changed from `report-only` to `fix-and-pr` (`dry-run` default changed from `true` to `false`). Existing consumers that pass no explicit input go from "report only" to "automatically create fix branches and PRs" (PRs are not auto-merged, so they can be reviewed safely). For report-only behavior, pass `mode: report-only` or `dry-run: true` explicitly. After migrating, confirm the workflow `permissions` include `contents: write` + `pull-requests: write` (see the example above).
>
> **⚠️ Breaking change (0.2.0, artifact format)**: `dependfix` / `@dependfix/core` became **pure ESM** (the dual CJS artifact was removed). CLI commands and GitHub Action consumption are unaffected; programmatic consumers must use `import`; `require()` needs Node 22.12+ (native `require(ESM)`). CJS programmatic consumers on Node 20.x must switch to dynamic `import()`.
>
> 💡 **Branch cleanup tips**: ① enable **Settings → General → Pull Requests → "Automatically delete head branches"** in the repository settings (head branches are deleted after a PR merges); ② or enable `cleanup-branches-auto: true` in the workflow (after every run it deletes merged / closed `dependfix/` branches, never branches with an open PR).

### Action inputs

| Action input | Required | Default | Description |
|:-----|:----:|:------|:-----|
| `mode` | No | `fix-and-pr` | Run mode: `report-only` / `fix` / `fix-and-pr` |
| `repos` | No | `''` (current repository) | Target repositories (comma-separated); merged and deduplicated with `owner` (explicit wins) |
| `owner` | No | `''` | owner / org auto-discovery (M4, comma-separated). ⚠️ GITHUB_TOKEN can only reach the current repository; discovering other repositories by owner requires a PAT (`github-token`); **configuring one action per repository is recommended** to bound the token scope (see the note below) |
| `repo-topics` | No | `''` | Discovery-result topic whitelist (comma-separated, AND semantics; affects owner discovery only) |
| `repo-include` | No | `''` | Repository whitelist glob (comma-separated, e.g. `owner/*`, `owner/pkg-*`; affects discovery results only) |
| `repo-exclude` | No | `''` | Repository blacklist glob (comma-separated; constrains both the explicit list and discovery results, and wins over include) |
| `repo-topics-exclude` | No | `''` | Discovery-result topic blacklist (drop repositories carrying any listed topic) |
| `max-concurrency` | No | `1` | Multi-repository concurrency window (1-16; `>1` is allowed in `report-only` only — fix/fix-and-pr share one workspace, so config validation rejects concurrency) |
| `max-retries` | No | `3` | GitHub API rate-limit retries (0-10; exponential backoff on 429 / rate limit) |
| `severity-threshold` | No | `high` | Severity threshold |
| `dry-run` | No | `false` | Dry-run mode (the Action fixes and opens PRs by default; the local CLI reports only, i.e. dry-run=true under report-only) |
| `max-alerts-per-repository` | No | `20` | Max alerts per repository |
| `cleanup-branches` | No | `false` | (fix-and-pr mode) after the run, list merged dependfix branches in the report as a cleanup list (no auto delete) |
| `cleanup-branches-auto` | No | `false` | (fix-and-pr mode) after the run, auto-delete merged / closed dependfix branches (non-interactive; never deletes branches with an open PR) |
| `github-token` | Yes | — | GitHub Token (commit / push / PR operations; cannot read Dependabot alerts, see the next row) |
| `dependabot-alerts-token` | No | `''` | Dedicated minimum-permission token for Dependabot alerts (fine-grained PAT, `Dependabot alerts: read` only; falls back to `github-token` when unset. GITHUB_TOKEN is always 403) |
| `code-scanning` | No | `false` | Also fetch Code Scanning alerts (parallel source next to Dependabot, off by default; the token needs `security-events: read`, which GITHUB_TOKEN has by default) |
| `max-repos` | No | `100` | Discovery cap: max repositories kept (0 = unlimited; guards against one-shot full discovery in large orgs) |
| `commands` | No | `''` | Custom verification commands (comma-separated; **replaces the whole default chain**, keep entries you still want) |
| `mirror-ci-scripts` | No | `false` | Append the target repository's CI-only scripts to the verification chain (at most 3, stop at first failure; only the command form and script existence are checked) |
| `retry-failed` | No | `false` | Ignore the per-alert attempt cap and force another try (fix-and-pr only) |
| `wait-pr-checks` | No | `false` | Wait for the PR check terminal state (comments a failure summary; never changes the exit code) |
| `close-failed-pr` | No | `false` | Close the PR and delete the branch when checks fail with `self_caused` attribution (requires `wait-pr-checks`) |
| `on-baseline-red` | No | `skip` | Delivery downgrade when the post-fix run is still baseline red: skip / issue / draft (never changes the exit code) |
| `ai` | No | `false` | Enable AI breaking-change triage (requires `ai-api-key`; dry-run does not trigger it and incurs no cost) |
| `ai-api-key` | No | `''` | AI API Key (reference a GitHub Secret such as `secrets.DEEPSEEK_API_KEY` in the workflow; passed through env vars and masked automatically) |
| `ai-provider` | No | `openai-compatible` | AI provider: `openai-compatible` (default, DeepSeek etc.) / `anthropic` |
| `ai-model` | No | `deepseek-v4-flash` | AI model name |
| `ai-base-url` | No | `https://api.deepseek.com` | OpenAI-compatible endpoint (pairs with the default model) |
| `ai-api-url` | No | `''` | Anthropic-compatible endpoint (falls back to the official endpoint; set it for self-hosted / gateway setups) |
| `ai-trigger` | No | `both` | AI trigger scope: `both` / `failure` / `major` |

> **⚠️ M4 recommendation: configure one action per repository (2026-08-06)**: multi-repository governance inputs are wired into the Action, but per-repository actions are recommended:
> - **Least privilege**: a single-repository action only needs `GITHUB_TOKEN` plus that repository's least-privilege `dependabot-alerts-token`; owner discovery needs a cross-repository PAT, so a leak has a wider blast radius.
> - **Alert source and failure isolation**: Dependabot alerts always need the dedicated PAT; per-repository actions fail independently, while owner mode aggregates multi-repository PRs on the first repository.
> - Owner mode (self-hosted multi-repository patrol / organization-wide governance) fits local CLI or organization-level PAT scenarios better.

### Action outputs

| Output | Description |
|:-----|:-----|
| `report-artifact` | Name of the uploaded report artifact |

After the run, the report content is written to the workflow summary and can be read from `$GITHUB_STEP_SUMMARY`. The report artifact (retained for 30 days) can be downloaded from the Actions run page.

## Security considerations

> dependfix's core action is upgrading third-party dependencies — **executing untrusted code**. Updating dependencies fixes vulnerabilities, but the fix process must not introduce new ones: dependfix must not become a vehicle for spreading malicious dependencies. The points below cover the usage side; the full threat model and governance live in [sandbox and malicious-dependency protection governance](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/sandbox-security-governance.md).

- **Local CLI mode has no isolation**: locally, the dependency `install`/`lint`/`build`/`typecheck`/`test` scripts run directly on **your machine** (`--commands` custom commands too). A malicious script can read every variable in your shell environment (`GITHUB_TOKEN`, `DEPENDFIX_AI_API_KEY`, etc.). Recommendation: run in a dedicated environment (container / VM / CI runner), or make sure the target repository and dependency sources are trusted. The CLI prints a local-execution risk warning when fix / fix-and-pr starts; once the risk is accepted, set `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` to suppress it.
- **Use least-privilege tokens**: do not give dependfix a full-scope PAT. Recommended combination: `dependabot-alerts-token` as a fine-grained PAT with `Dependabot alerts: read` only; `github-token` with only what the target repositories need (`security-events: read` + `contents`/`pull-requests` write). When owner mode scans several repositories, the token's permission surface equals the trust boundary of every scanned repository. **The token's permission surface is checked at startup**: a classic PAT carrying `repo` (all repositories) triggers a warning (it does not block the run) — once such a token is stolen by a malicious script, every visible repository is compromised.
- **In owner mode the scan scope is the trust boundary**: repositories discovered by `--owner` get cloned and their dependency scripts executed — only scan repositories of trusted organizations; review untrusted sources manually before adding them to the list (`--repo-include` / `--repo-exclude` narrow the scope).
- **Review before merging**: cross-line upgrades (PR body carries a ⚠️ Major marker) and newly added / upgraded packages that ship lifecycle scripts and were approved by the repository (see the report warning area once supply-chain signal disclosure lands) should be confirmed by a human before merge.
- **Platform deployment**: pull the published image by default (`docker compose pull && docker compose up -d`; only layer the `docker-compose.build.yml` override for a local build, see the comment at the top of `apps/platform/docker-compose.yml`). The container execution process already **drops privileges from root** (default `dependfix` user, uid 100 / gid 101; align `PUID`/`PGID` with the host user to control data volume / `$HOME` ownership; resolving to 0 makes the entrypoint fail closed, and ownership is repaired automatically). Do not mount `docker.sock` and do not grant privileges when deploying; use strong random values for `AUTH_SECRET` / `NUXT_ENCRYPTION_KEY`. **Tables are created automatically on first start** (compose defaults to `DATABASE_MIGRATIONS_RUN=true`); full steps (environment variables / data volume and permissions / database initialization / upgrade / backup and restore / troubleshooting) are in [Docker deployment](./deployment.md).

#### sandbox execution (experimental, currently unavailable)

> **⛔ The entry point is temporarily disabled (2026-10-27)**: the UI disables the sandbox option and the API rejects new writes; repos with an existing `executorKind=sandbox` degrade to `container` and are marked `degraded` (`sandbox_entry_disabled`). Reason: `buildCmd` is still a minimal placeholder (it does not start the dependfix engine) and real engine execution is not closed-loop yet ([backlog P1](https://github.com/dependfix/dependfix/blob/master/docs/plan/backlog.md)). Use `container` or `github-action` for production fixes.
>
> **Historical state**: the M11 T1005 routing was wired up (2026-08-20); the platform Web UI once exposed the sandbox option (repository management → add/edit → executor dropdown). The scope below describes the design once real execution is closed-loop.
>
> **Scope (once closed-loop)**: owner/org multi-repository scans, `--allow-major-upgrade` cross-line upgrades, and owner-mode fixes on untrusted repositories — in these scenarios the risk of a malicious dependency script running inside the container is markedly higher than with a single trusted repository, so sandbox execution isolates execution in a dedicated rootless container (decoupled from the platform container), see [executor-sandbox.md §7](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/executor-sandbox-implementation.md).
>
> **Not enabled**: for a single trusted repository plus local development, the default `ContainerExecutor` is enough, with no rootless daemon startup cost.

**Prerequisites / operational preconfiguration once restored** (no sandbox scan occurs while the entry point is disabled, so these steps can wait):

- Linux kernel (cgroup v2 recommended ≥ 5.8; older kernels degrade to a Node V8 soft limit)
- Docker installed (≥ 20.10)
- The `uidmap` package installed (provides `newuidmap` / `newgidmap`)
- ≥ 65,536 subordinate UIDs/GIDs for the current user in `/etc/subuid` and `/etc/subgid` (`grep ^$(whoami): /etc/subuid` should return a non-empty line)
- User namespaces enabled on the system (on by default in most distributions; WSL2 / in-container setups need extra configuration)

**Starting the rootless Docker daemon once restored** (see the [official Docker rootless docs](https://docs.docker.com/engine/security/rootless/)):

```bash
# 1. Install the rootless tooling (Ubuntu/Debian need docker-ce-rootless-extras; usually bundled with 20.10+)
sudo apt-get install -y docker-ce-rootless-extras

# 2. Initialize as a non-root user (generates the systemd user service + env vars)
dockerd-rootless-setuptool.sh check     # preflight (user namespaces / port range)
dockerd-rootless-setuptool.sh install   # install the systemd user service

# 3. Start + enable at boot + linger (keeps the systemd user service alive without an active session)
systemctl --user start docker.service
systemctl --user enable docker.service
sudo loginctl enable-linger "$USER"      # key: the user service survives logout / reboot

# 4. Verify the daemon is usable (matches platform DockerAdapter.isAvailable())
docker --context rootless info --format '{{.ServerVersion}}'
# e.g. `24.0.7` means it started successfully

# 5. Confirm you reached the rootless daemon, not the rootful one
docker --context rootless info --format '{{.SecurityOptions}}'
# output containing `rootless` → truly connected to the rootless daemon
```

**Not enableable while the entry point is disabled** (the following applies only once real execution is closed-loop and the entry point is restored; today the UI disables it and an API write with `executorKind=sandbox` returns 400):

```bash
# Once restored: repository-level override (currently returns 400)
# curl -X PUT /api/repos/{id} \
#   -H 'Content-Type: application/json' \
#   -d '{"executorKind": "sandbox"}'

# Once restored: egress allowlist — by default it already contains the official registry + common mirrors
# + GitHub API/asset domains + rolldown.rs
# (the authoritative default list and decision rules are in security standard §5.3.1: docs/standards/security.md);
# effective registry hosts are also discovered from the workDir pnpm config surface
# (pnpm config list --json, local reads only, falls back to the preset list on errors).
# The following is only for cases the preset list does not cover — e.g. an enterprise private registry with its own CDN
# (a tarball 302 to a non-preset domain).
# Effective process: the interception proxy inside the platform Node process
# (packages/engine/src/runners/network-audit.ts);
# sandbox containers egress directly through the Docker bridge (this env is not forwarded into sandbox containers)
# export DEPENDFIX_ALLOWED_DOMAINS="registry.internal.example.com,artifacts.example.com"

# Once restored: custom runtime (default runc; switch to Sysbox if deployed) — read at module level, set before platform start
# export SANDBOX_RUNTIME=sysbox-runc
```

**Current degraded behavior (while the entry point is disabled)**:

- A scan of a repo with an existing `executorKind=sandbox` → forced to `ContainerExecutor` + `degradedReason.code=sandbox_entry_disabled` → the run is marked `degraded` (business results are complete; the UI notes "dedicated sandbox container unavailable, using the platform container automatically").
- If the platform container is also unavailable → the run is marked `failed` (`container_unavailable`).
- The old §7.8 `sandbox_unavailable` A/B scenarios no longer occur while the entry point is disabled; they follow the §7.8 contract again once real execution is closed-loop and the entry point is restored.

A/B scenario differences are described in [executor-sandbox.md §7.8.1](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/executor-sandbox-implementation.md) (applicable once restored); governance registration in [sandbox-security-governance.md §5 G5](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/sandbox-security-governance.md).

**Anti-patterns (strictly forbidden)**:

- **Mounting the host `/var/run/docker.sock`**: equivalent to granting host root (any user can start a privileged container and take over the host) — violates [sandbox-security-governance.md §3 path D](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/sandbox-security-governance.md) and is by-design equivalent privilege escalation (**it does not depend on any specific vulnerability**)
- **Starting the sandbox with DinD `--privileged`**: [CVE-2019-5736](https://unit42.paloaltonetworks.com/cve-2019-5736/) overwrites `/proc/self/exe` in runc to escape + [CVE-2024-21626](https://github.com/advisories/GHSA-xr7r-f8xq-vfvv) leaks a file descriptor through runc `WORKDIR` — both CVEs are tightly coupled to `--privileged`, which rootless mode disables by default
- **Running a rootless daemon inside the platform container as its own sandbox**: defeats the "separate PID/Mount namespace" goal, so a platform vulnerability spreads straight into the sandbox

The full design, the RuntimeAdapter abstraction and the reserved K8s+Helm deployment are in [executor-sandbox.md §7](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/executor-sandbox-implementation.md); the threat model and governance registration are in [sandbox-security-governance.md §5 G5](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/sandbox-security-governance.md).

## CLI flags

| Flag | Alias | Description | Default |
|:-----|:-----|:-----|:-------|
| `mode` | (positional) | `report-only` / `fix` / `fix-and-pr` / `cleanup-branches` | `report-only` |
| `--repo` | `-r`, `--repository`, `--repositories` | Target repository (`owner/repo`). Inferred automatically inside a git repository | — |
| `--repos-file` | — | Read the repository list from a file (one per line) | — |
| `--github-token` | — | GitHub PAT | `GITHUB_TOKEN` env |
| `--alerts-token` | — | Dedicated minimum-permission token for Dependabot alerts (optional, `Dependabot alerts: read` only; falls back to `--github-token` when unset. GITHUB_TOKEN cannot read Dependabot alerts) | `DEPENDFIX_ALERTS_TOKEN` env |
| `--alerts-source` | — | Alert data source: `github-dependabot` (default) / `pnpm-audit` (local no-token fallback, scans the current workspace lockfile; no token / git remote required; repository resolution `--repo` → git remote → `local`) | `DEPENDFIX_ALERTS_SOURCE` env |
| `--severity-threshold` | — | `critical` / `high` / `medium` / `all` | `high` |
| `--dry-run` | — | Dry run, writes no files. Defaults to `true` in report-only | `false` (fix/fix-and-pr) |
| `--create-pr` | — | Create a Pull Request | `false` |
| `--commit` | — | Commit to the current local branch right after the fixes (fix mode only; no push, no PR) | `false` |
| `--cleanup-branches` | — | (fix-and-pr mode) after the run, list merged dependfix branches in the report without deleting them | `false` |
| `--cleanup-branches-auto` | — | (fix-and-pr mode) after the run, auto-delete merged / closed dependfix branches (non-interactive; never deletes branches with an open PR) | `false` |
| `--max-alerts-per-repository` | — | Max alerts processed per repository | `20` |
| `--owner` | — | owner / org auto-discovery (comma-separated or repeated), merged and deduplicated with `--repo` (explicit wins) | `DEPENDFIX_OWNER` |
| `--repo-topics` | — | Discovery-result topic whitelist (comma-separated, AND semantics) | `DEPENDFIX_REPO_TOPICS` |
| `--repo-include` | — | Repository whitelist glob (comma-separated or repeated; affects discovery results only) | `DEPENDFIX_REPO_INCLUDE` |
| `--repo-exclude` | — | Repository blacklist glob (constrains both the explicit list and discovery results, wins over include) | `DEPENDFIX_REPO_EXCLUDE` |
| `--repo-topics-exclude` | — | Discovery-result topic blacklist (drop repositories carrying any listed topic) | `DEPENDFIX_REPO_TOPICS_EXCLUDE` |
| `--max-concurrency` | — | Multi-repository concurrency window (1-16, default 1 conservative sequential; `>1` allowed in report-only only) | `DEPENDFIX_MAX_CONCURRENCY` |
| `--max-retries` | — | GitHub API rate-limit retries (0-10, default 3) | `DEPENDFIX_MAX_RETRIES` |
| `--history` | — | Query a repository's run-history summary (reads `dependfix-reports/index.json`, reverse chronological; no scan) | — |
| `--code-scanning` | — | Also fetch Code Scanning alerts (parallel source next to Dependabot; the token needs `security-events: read`, which GITHUB_TOKEN has by default) | `false` (env `DEPENDFIX_CODE_SCANNING`) |
| `--allow-major-upgrade` | — | Explicitly authorize cross-line alerts (recommended version crosses a major boundary, no fix inside the current line) to auto-upgrade: only root package.json direct dependencies (workspace-member-only declarations stay manual) with a single lockfile version are upgraded across lines, followed by brittle-instance re-verification and forced full verification (install+lint+build+typecheck+test), with auto-rollback on failure; indirect dependencies / multi-version cross-line alerts stay manual. **CLI only, not supported by the Action** (see the "Cross-major upgrades" risk section below) | `false` (**no env channel**) |
| `--commands` | — | Custom verification commands (comma-separated); replaces the whole default chain (no merging), so entries from the default chain must be listed explicitly | — |
| `--rollback-granularity` | — | Verification-failure rollback granularity: `unit` (default, reverts the latest probe-verified change unit and re-verifies once) / `repo` (repository-level `git reset --hard` escape hatch) | `DEPENDFIX_ROLLBACK_GRANULARITY` (`unit`) |
| `--override-protect` | — | overrides protection list (per-repository, format `repo-glob:pkg1,pkg2;...`); on a hit the override for that package is not written and an `OVERRIDE_PROTECTED` audit entry is recorded (prevents recurrence of destructive overrides removed by hand in the past) | — (env `DEPENDFIX_OVERRIDE_PROTECT`) |
| `--max-backoff-ms` | — | Upper bound (ms) for a single rate-limit backoff wait (100-120000; applies to Retry-After / reset / exponential backoff) | `30000` (env `DEPENDFIX_MAX_BACKOFF_MS`) |
| `--max-repos` | — | Discovery cap (`0` = unlimited; negative values are rejected) | `100` (env `DEPENDFIX_MAX_REPOS`) |
| `--upgrade-groups` | — | Explicit dependency groups (overrides auto-grouping), format `name1:pkg1,pkg2;name2:pkg3` | — (env `DEPENDFIX_UPGRADE_GROUPS`) |
| `--toolchain-pnpm-version` | — | pnpm version used for lockfile repair (defaults to the `packageManager` field) | — (env `DEPENDFIX_TOOLCHAIN_PNPM_VERSION`) |
| `--code-quality` | — | Also fetch Code Quality findings (needs `Code quality: read`) | `false` (env `DEPENDFIX_CODE_QUALITY`) |
| `--mirror-ci-scripts` | — | Append the target repository's CI-only scripts to the verification chain (at most 3, stop at first failure) | `false` (env `DEPENDFIX_MIRROR_CI_SCRIPTS`) |
| `--retry-failed` | — | Ignore the per-alert attempt cap and force another try (fix-and-pr only) | `false` (env `DEPENDFIX_RETRY_FAILED`) |
| `--wait-pr-checks` | — | Wait for the PR check terminal state (never changes the exit code) | `false` (env `DEPENDFIX_WAIT_PR_CHECKS`) |
| `--close-failed-pr` | — | Close the PR and delete the branch on `self_caused` failures (requires `--wait-pr-checks`) | `false` (env `DEPENDFIX_CLOSE_FAILED_PR`) |
| `--verbose` | — | Verbose logging | `false` |
| `--ai` | — | Enable AI breaking-change triage (off by default; requires an AI API key. Trigger scope via `--ai-trigger`; dry-run does not trigger it and incurs no cost) | `false` |
| `--ai-provider` | — | AI provider: `openai-compatible` (default; DeepSeek etc. work via `--ai-base-url`) / `anthropic` | `openai-compatible` |
| `--ai-model` | — | AI model name | `deepseek-v4-flash` |
| `--ai-base-url` | — | OpenAI-compatible endpoint base URL (pairs with the default model; for official OpenAI models set `https://api.openai.com/v1` + `--ai-model`) | `https://api.deepseek.com` |
| `--ai-api-url` | — | Anthropic-compatible endpoint (only effective with `--ai-provider anthropic`; set it explicitly for self-hosted / gateway setups) | empty (falls back to `https://api.anthropic.com/v1/messages`) |
| `--ai-api-key` | — | AI API key (the CLI flag takes precedence; `DEPENDFIX_AI_API_KEY` is the fallback — a command-line value shows up in the process list / shell history, so prefer the env var for sensitive setups) | `DEPENDFIX_AI_API_KEY` env |
| `--ai-trigger` | — | AI trigger scope: `failure` (upgrade verification failed) / `major` (major upgrade) / `both` | `both` |

### Cross-major upgrades (experimental, risk notice)

`--allow-major-upgrade` lets dependfix perform cross-major upgrades for alerts that satisfy the conditions below when there is **no fix inside the current major line** (e.g. an alert only affects `<= 6.4.2`, your pinned 5.x line has no fix, and Dependabot recommends 6.4.3):

- ✅ **Root package.json direct dependency** (declared in the root package.json; packages declared only by workspace members stay manual — the fixer only edits root declarations)
- ✅ **Only one version of the package in the lockfile** (single-version case)
- ⏭️ Indirect dependencies / workspace-member-only declarations / multi-version cross-line alerts **stay manual** (cross-line versioned overrides would break dependents' ranges, and a global override would downgrade the root declaration — conservative and correct)

**Flow**: edit the root declaration → `pnpm install` → **post-upgrade instance re-verification** (confirm the brittle instances are really gone; if a workspace member with the same range or a transitive pin still locks the old version, roll back automatically and count it as failed) → **forced full verification** (`pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm build` + `pnpm typecheck` + `pnpm test`) → keep only when everything passes; any failure rolls back and counts as failed.

**Known risks and issues**:

1. **API blast radius**: a cross-major upgrade necessarily brings breaking changes. Full verification catches compile/type/build errors, but **passing install/lint/build/typecheck/test ≠ correct runtime behavior** — review the PR manually before merging (cross-line upgrades carry a ⚠️ Major marker in the PR body).
2. **Verification cost**: each cross-line package runs a full install + lint + build + typecheck + test (serial per package), markedly slower than the usual lint-only group verification.
3. **Rollback boundary**: snapshot rollback covers tracked files such as package.json / pnpm-lock.yaml; `node_modules` is not restored (temporary-directory semantics, acceptable).
4. **Semantic change**: a cross-line upgrade changes the dependency declaration (e.g. `^5.4.0` → `^6.4.3`), and the impact goes beyond the vulnerability itself — other API usages may break.
5. **Not available in the Action**: the GitHub Action deliberately **does not expose** this flag and there is **no `DEPENDFIX_ALLOW_MAJOR_UPGRADE` env channel** (structural disable, preventing CI from crossing lines and causing unexpected breakage).

> Off by default: without `--allow-major-upgrade`, cross-line alerts stay skipped + manual (the PR #28 semantics are unchanged).

## Configuration file

Config-file support (`dependfix.config.json` / `dependfix.config.yaml`) is **not available yet** and has no scheduled milestone; configure runs with CLI flags and environment variables for now — or inject them from your deployment runbook / CI secrets. See [Configuration → Config file](./configuration.md#config-file) for the planned merging order (defaults → file → env vars → CLI flags).

## Reports

Every run produces reports in two formats:

- **Markdown**: `dependfix-report-YYYYMMDD-HHmmss-{runId tail}.md` — summary statistics, per-repository details, per-severity statistics, failure reasons
- **JSON**: `dependfix-report-YYYYMMDD-HHmmss-{runId tail}.json` — structured full data

`HHmmss` in the file name is the run start time (UTC) and `{runId tail}` is the last `-`-separated segment of the runId (at most 8 characters). Date plus time means sorting by file name sorts by run time, which makes the newest report easy to find.

### Archive and trends (M4)

- **Archive layout**: `dependfix-reports/{YYYY-MM}/{runId}/` — `summary.json` (global summary) + one `{owner}-{repo}.md|.json` per repository (report split); the existing flat report output is unchanged (backward compatible).
- **Trend index**: `dependfix-reports/index.json` — per run it records runId, time, repository list, alert / fix / failure counts and duration (idempotent update, same runId overwrites).
- **History query**: `dependfix --history <owner/repo>` lists that repository's run-history summary (reverse chronological, counts at repository level).
- Example:

```bash
# Query trends after a local owner patrol
dependfix --owner your-org --repo-topics node --max-concurrency 4 --max-retries 5
dependfix --history your-org/app
```

Report files live in `./dependfix-reports/`.

## GitHub App configuration (M18.3)

> The self-hosted platform supports GitHub App credentials as an advanced alternative to PATs. PATs remain the default quick-start path (CLI quickstart / Action input / single-repo debugging); GitHub Apps are recommended for self-hosted multi-repository org scenarios (installation-scoped access + 1 h short-lived token rotation + a real `[bot]` identity + per-installation audit logs).

### Creating a GitHub App

1. Open the GitHub user or org settings → **Developer settings** → **GitHub Apps** → **New GitHub App**
2. Fill in the basic information (App name / Homepage URL / Callback URL may be left empty)
3. **Repository permissions** recommended configuration:
   - `Contents: Read & write` (auto-fix commit + push branch)
   - `Pull requests: Read & write` (create PRs)
   - `Metadata: Read-only` (required, repository metadata access)
4. **Where can this GitHub App be installed?**: choose `Only on this account` (recommended for self-hosting) or `Any account` (if you run a SaaS)
5. After creating, download the private key (.pem file) — **shown only once**, store it safely

> Public key fingerprint check: run `openssl rsa -in <your-app.pem> -pubout -outform DER | openssl sha256 -binary | openssl base64` locally; the output should match the fingerprint (SHA256:xxx) in the "Public clients" part of the GitHub App settings page.

### Registering the credential in the dependfix platform

1. Sign in to the platform → **Credentials** → **Add credential**
2. Set **Type** to **GitHub App**
3. Fill in:
   - **App ID** (required, GitHub App settings → General → About → App ID)
   - **Installation ID** (required, repository → Settings → Integrations → GitHub Apps → Configure → Installation ID, the trailing number in the URL)
   - **Private Key (PEM)** (required, paste the .pem file content; the client validates the format)
   - **Bot Login** (optional, e.g. `your-app-name[bot]`; defaults to `dependfix[bot]`, which drives the real bot attribution of the commit author)
4. Save → the private key is encrypted at rest with the platform key (`NUXT_ENCRYPTION_KEY`, AES-256-GCM) and never returned in plaintext

### PAT or GitHub App

| Scenario | Recommendation |
|------|------|
| CLI quickstart (`npx dependfix`) | PAT |
| GitHub Action (`uses: dependfix/dependfix@v0.6.0`) | PAT |
| Single-repository debugging | PAT (lowest friction) |
| Self-hosted platform multi-repository org patrol | GitHub App (installation-scoped) |
| Self-hosted platform needing short-lived token rotation + a real `[bot]` identity | GitHub App |
| Self-hosted platform per-installation audit logs | GitHub App |

> **PATs and Apps coexist**: dependfix supports both credential types today, neither replaces the other; one platform can hold several PAT credentials + several GitHub App credentials (chosen per repository).

### Install flow (Manifest flow not implemented yet)

The current documentation-led path (see above) + `.pem` download + manual registration is the only entry point. The **Manifest flow** (a manifest URL that creates the App in one click + auto callback) is **not implemented** — the M18.3 commit 3 evaluation report is still pending (M19+ feasibility candidate).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (no alert, or all alerts handled normally) |
| `1` | Partial failure (some alerts failed) |
| `2` | Complete failure (e.g., Token invalid, network error) |

## Next steps

- See [Configuration](./configuration.md) for the full configuration options
- See [Tech Stack](./tech-stack.md) to understand the runtime model
- See [PR Auto-merge Configuration](https://github.com/dependfix/dependfix/blob/master/docs/guide/auto-merge.md) to set up automatic PR merging (Chinese only — English version pending)
- See [AI Co-development](https://github.com/dependfix/dependfix/blob/master/docs/guide/ai-development.md) to learn how AI assistants use dependfix (Chinese only — English version pending)

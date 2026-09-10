# Architecture Design

## 1. Project composition

dependfix consists of the following parts:

| Component | Package | Status |
|:----------|:--------|:-------|
| Core library | `packages/core` | ✅ Shipped (v0.2.0+) |
| Engine library | `packages/engine` | ✅ Shipped |
| CLI | `packages/cli` | ✅ Shipped |
| MCP Server | `packages/mcp` | ✅ Shipped (M6) |
| Skill | `packages/skills` | ✅ Shipped (M5.5) |
| GitHub Action | `apps/action` | ✅ Shipped |
| Management Platform | `apps/platform` | ✅ Shipped (M6-M11) |

## 2. Overall plan

dependfix follows a layered architecture:

```
┌─────────────────────────────────────────────────────────┐
│ User entry                                                │
├─────────────────────────────────────────────────────────┤
│ CLI / GitHub Action / MCP Server / Skill                  │
│  (packages/cli / apps/action / packages/mcp / skills)    │
├─────────────────────────────────────────────────────────┤
│ Engine layer (packages/engine)                            │
│  - fetcher: Dependabot / pnpm-audit / Code Scanning       │
│  - fixer: PR content dedup + frozen-lockfile handling     │
│  - runner: mode state machine                             │
│  - AI: breaking-change assessment                         │
├─────────────────────────────────────────────────────────┤
│ Core library (packages/core)                              │
│  - Shared types + Zod config schema                       │
│  - Engine-agnostic normalization                          │
├─────────────────────────────────────────────────────────┤
│ Optional: Management Platform (apps/platform)            │
│  - Nuxt 4 full-stack Web UI                              │
│  - better-auth + TypeORM + SQLite (single-org)           │
│  - Runs engine via worker pool                            │
└─────────────────────────────────────────────────────────┘
```

The dependency direction is top-down (UI / entry → engine → core), and lower layers do not depend on upper layers.

## 3. Functional modules

### Entry layer

- **CLI** (`packages/cli`): commander-based CLI, four modes (`report-only` / `fix` / `fix-and-pr` / `cleanup-branches`), flags via Commander
- **GitHub Action** (`apps/action`): wraps CLI, exposes `uses: dependfix/dependfix@v1` to GitHub Actions
- **MCP Server** (`packages/mcp`): exposes scan / fix tools to AI agents (Claude Code / Copilot / Cursor) via Model Context Protocol
- **Skill** (`packages/skills`): Markdown + YAML frontmatter, lets AI agents converse and drive fixes

### Config layer

- **Core** (`packages/core`): Zod-validated config schema, shared types
- Supports CLI flags / env vars / config file (planned M4+) priority order

### GitHub integration layer

- **`packages/engine/src/github/`**: octokit wrapper, alert fetching, PR creation, branch management
- Supports `github-dependabot` / `pnpm-audit` / `code-scanning` data sources

### Core domain layer

- **`NormalizedSecurityAlert`** (core): unified alert data model
- **`NormalizedReport`** (core): unified report data model
- Engine modules: alert fetcher / fixer / runner / AI assessment

### Execution layer

- **Local execution**: engine runs in CLI / Action / MCP process context
- **Container execution** (apps/platform): Nuxt server spawns child processes
- **Sandbox execution** (apps/platform, planned): enhanced security isolation (design in progress, see [executor-sandbox](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/executor-sandbox.md))

### Report layer

- **Markdown report**: human-readable, with PR body and changelog integration
- **JSON report**: machine-readable, with full alert / fix details

## 4. Run modes

Four execution modes form a progressive chain (each mode is a refinement of the previous, no mode-jump):

- **`report-only`** — view-only, generate reports, no file modification
- **`fix`** — local commit, no push
- **`fix-and-pr`** — push branch + create PR (PR not auto-merged, requires human review)
- **`cleanup-branches`** — clean up historical `dependfix/` branches

## 5. Tech stack

| Layer | Language | Runtime | Build tool |
|:------|:---------|:--------|:-----------|
| `packages/core` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown |
| `packages/engine` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown |
| `packages/cli` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown (ESM only since 0.2.0) |
| `packages/mcp` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown |
| `packages/skills` | Markdown + YAML | N/A | N/A |
| `apps/platform` | Vue 3 + TypeScript | Node.js >= 20 (LTS) | Nuxt 4 + Vite |
| `apps/action` | TypeScript | Node.js 20 (GitHub Actions runner) | tsdown |

## 6. Platform architecture (apps/platform)

### Stack

- **Frontend**: Nuxt 4 + Vue 3 + PrimeVue 4 + Pinia + Vite
- **Backend**: Nuxt server routes (h3) + TypeORM + better-sqlite3
- **Auth**: better-auth (email password + GitHub OAuth + Google OAuth + genericOAuth/OIDC SSO)
- **State management**: Pinia (Nuxt auto-import)
- **UI components**: PrimeVue 4 DataTable / Select / Dialog / ToggleSwitch / Tag / Card / Message

### Module layering

```
┌──────────────────────────────────────────────────────┐
│ Pages (app/pages/)                                   │
│ - repos.vue / scans.vue / alerts.vue / settings.vue   │
│   / batch-runs.vue / pr-checks.vue / env-events.vue   │
│ - repo detail (app/pages/repos/[id]/runs.vue)        │
├──────────────────────────────────────────────────────┤
│ Components (app/components/)                          │
│ - run-detail-dialog / repo-history-dialog            │
│ - import-repos-dialog / scan-config-dialog            │
│ - ai-config-form / repo-ai-toggle                    │
├──────────────────────────────────────────────────────┤
│ Composables (app/composables/)                        │
│ - use-session (better-auth bridge)                    │
├──────────────────────────────────────────────────────┤
│ Server routes (server/api/)                           │
│ - /api/repos / /api/credentials / /api/alerts          │
│ - /api/scan / /api/runs / /api/batch-runs             │
│ - /api/pr-checks / /api/env-events / /api/ai-config   │
├──────────────────────────────────────────────────────┤
│ Server services (server/services/)                      │
│ - scan-orchestrator / queue / executor / credential   │
│ - ai-config-resolver / logger / localization          │
├──────────────────────────────────────────────────────┤
│ Database (TypeORM + better-sqlite3)                  │
│ - organization / repository / scan-run / scan-result │
│ - credential / audit-event / pr-check / schedule      │
│ - user / member                                       │
└──────────────────────────────────────────────────────┘
```

### Storage strategy

- **Single-org model** (current): one Organization, default `dependfix-default`, all repos / credentials / schedules scoped to it
- **Multi-org / multi-tenant** (backlog): registered as future expansion, see [Multi-Org / Multi-Tenant design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-auth-users.md)

## 7. Major risks and mitigations

| Risk | Mitigation |
|:-----|:-----------|
| Auto-fix damages business | Default to branch / PR, never auto-merge; limit major upgrades; enforce minimum verification |
| GitHub API rate limit | Batch pagination; concurrency control; record rate-limited requests in reports |
| Lockfile fix instability | Fix Node + pnpm version; save install logs + lockfile diff |
| Code Scanning scope too large | Phase 1 only whitelist rules; unmatched rules only suggest output |
| AI assessment misjudgment | AI fix code must pass lint/typecheck/build; PR not auto-merged; only output suggestions below confidence threshold; limit patch scope |
| Prompt injection attacks | Restrict trigger permission to admin; inputs only structured data; system instructions hard-coded; external content sanitized |
| Multi-tenant security | Repo-level data isolation; user tokens encrypted; complete operation audit log |
| Monitoring system vs auto-merge decoupling (M24.1 key decision D8) | Monitoring system (PRCheck) does NOT block mergify auto-merge: `mergify responsible for merge on pass` (rebase merge triggered by `check-success=Test` single condition); `PRCheck responsible for fail-to-show` (monitor + alert firing + ack UI) — two chains do not interfere, monitoring alert firing only writes alert_event + UI alert, does NOT modify check status / does NOT modify `check-success=Test` judgment. M24.1 implementation: `.github/mergify.yml` annotations + dependfix README + experience-archive §56 three-way sync |

## 8. apps/platform end-to-end AI assessment integration (M26 phase)

apps/platform as the management platform entry point takes the end-to-end AI breaking-change assessment integration responsibility. Engine layer (`packages/engine/src/ai/`) closed in M5 (commit `3475e6e`); CLI / MCP / GitHub Action all support `--ai` flags; M26 phase completes the integration in apps/platform (click "Scan" to enable AI assessment + observe usage and assessment results).

Full design draft: [platform-ai-integration.md](./platform-ai-integration.md); stage slice: see [todo-archive.md §M26](https://github.com/dependfix/dependfix/blob/master/docs/plan/todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264m264bm264cm265-全部已闭环--2026-09-10-归档) + [archive/todo-archive-phases-m26.md §M26.1](https://github.com/dependfix/dependfix/blob/master/docs/plan/archive/todo-archive-phases-m26.md#m261-p1--能力--ux-m252b-应用层10-commits--1130-行--standard-depth-audit) (M26 phase closed on 2026-09-10).

### Data model extension (M25.2a commit `1c65582`)

- `Organization.aiApiKeyEncrypted` (text, nullable): AES-256-GCM encrypted AI API Key (reuses `ENCRYPTION_KEY` + `Credential.encryptedToken` source encryption)
- `Organization.aiProvider` (varchar(32), default `'openai-compatible'`): aligns with engine layer `AiConfig.provider`
- `Organization.aiModel` (varchar(100), default `'deepseek-v4-flash'`): aligns with engine layer `AiConfig.model`
- `Organization.aiBaseUrl` (varchar(255), nullable): OpenAI-compatible endpoint override
- `Organization.aiApiUrl` (varchar(255), nullable): Anthropic endpoint override
- `Repository.aiEnabled` (boolean, default `false`): per-repo AI assessment switch
- `Repository.aiTrigger` (enum(16), default `'both'`): trigger range `failure` / `major` / `both`
- `ScanRun.aiConfigSnapshot` (JSON): per-scan actually-used AI config snapshot (apiKey masked as `hasApiKey` boolean, for audit traceability)

**Encryption strategy**: `runScanInternal` decrypts `Organization.aiApiKeyEncrypted` in memory, injects into `RuntimeConfig.ai.apiKey`, discards after use; logs / error responses use `maskSecrets` for redaction.

### Merge priority (API override > Repository default > Organization shared)

- `aiEnabled`: API request `aiEnabled` > `Repository.aiEnabled` > `false`
- `aiTrigger`: API request `aiTrigger` > `Repository.aiTrigger` > `'both'`
- `provider` / `model` / `apiKey` / `baseUrl` / `apiUrl`: only from Organization (repo level has no override)

Error rules: `aiEnabled=true` but Organization has no Key → `400 AI_KEY_REQUIRED`; `aiEnabled=true` but `Repository.aiEnabled=false` and API did not pass `aiEnabled` → reject (prevent accidental enable).

### Three-executor consistency (M25.2a commit `7250ec1`)

`container` / `sandbox` / `github-action` three executors sync-transparently pass `RuntimeConfig.ai`:

- **container**: transparently via `...ctx.config` spread
- **sandbox**: injected via `DEPENDFIX_AI_*` env vars (only when `aiEnabled=true` to prevent empty strings overriding defaults)
- **github-action**: transparently via `workflow_dispatch` inputs (aligns with 7 `ai-*` inputs in `action.yml`)

### Governance validation (consistent with engine layer)

- AI output must pass `lint` / `typecheck` / `build` (reusing existing safety-gate from §7 row "AI assessment misjudgment")
- AI-generated PR not auto-merged (consistent with [standards/index.md §AI assessment not auto-merged by default](https://github.com/dependfix/dependfix/blob/master/docs/standards/development.md))
- Below confidence threshold only outputs suggestions (engine layer `safety-gate.ts` already implemented)
- AI API Key logs redacted (reusing `packages/engine/src/ai/secrets.ts:maskSecrets`)
- Per-repo `aiEnabled=false` → API request override also rejected (prevent accidental enable)

### Related docs

- [platform-ai-integration.md](./platform-ai-integration.md) — M26 phase complete design first draft (4 API endpoints + UI + i18n + docs)
- [platform-auth-users.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-auth-users.md) — Organization entity extension baseline
- [platform-scheduled-batch.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-scheduled-batch.md) — Scheduled scan link, unified application of AI assessment
- [sandbox-security-governance.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/sandbox-security-governance.md) — AI assessment role in supply-chain defense
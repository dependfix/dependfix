# Tech Stack

## Runtime model

dependfix is built on the Node.js runtime + TypeScript stack, with the following layering:

```
┌────────────────────────────────────────────────────────┐
│ CLI (packages/cli)                                       │
│ └─ GitHub Action (action.yml + action/entry.ts)         │
│    └─ MCP Server (packages/mcp)                          │
│       └─ Skill (packages/skills)                         │
├────────────────────────────────────────────────────────┤
│ Engine layer (packages/engine)                            │
│ - NormalizedSecurityAlert / NormalizedReport            │
│ - fetcher (Dependabot / pnpm-audit / Code Scanning)     │
│ - fixer (PR content dedup + frozen-lockfile handling)    │
│ - runner (mode state machine)                            │
│ - AI breaking-change assessment (packages/engine/src/ai) │
├────────────────────────────────────────────────────────┤
│ Core (packages/core)                                      │
│ - Shared types + Zod config schema                        │
│ - GitHub Action workflow inputs                           │
├────────────────────────────────────────────────────────┤
│ Platform (apps/platform) [optional / standalone]          │
│ - Nuxt 4 full-stack Web UI                                │
│ - Better-auth + TypeORM + SQLite (single-org)            │
│ - Runs engine via container / sandbox / GitHub Action    │
└────────────────────────────────────────────────────────┘
```

## Language & runtime

| Layer | Language | Runtime | Build tool |
|:------|:---------|:--------|:-----------|
| `packages/core` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown |
| `packages/engine` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown |
| `packages/cli` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown (ESM only since 0.2.0) |
| `packages/mcp` | TypeScript (strict) | Node.js >= 20 (LTS) | tsdown |
| `packages/skills` | Markdown + YAML frontmatter | N/A (Claude / Copilot / Cursor consumption) | N/A |
| `apps/platform` | Vue 3 + TypeScript | Node.js >= 20 (LTS) | Nuxt 4 + Vite |
| `apps/action` | TypeScript | Node.js 20 (GitHub Actions runner) | tsdown |

> **Breaking change (since 0.2.0)**: `dependfix` / `@dependfix/core` are now **pure ESM** (CJS dual-format outputs removed). CLI commands and GitHub Action consumption are unaffected; programmatic consumers should use `import`; `require()` needs Node 22.12+ (native `require(ESM)`). Node 20.x CJS programmatic consumers need dynamic `import()`.

## Build & release

dependfix uses **tsdown** (built on Rolldown) as the build tool:

- **Library packages** (`packages/core` / `packages/engine` / `packages/cli` / `packages/mcp`): tsdown builds dual ESM + CJS output (ESM only since 0.2.0) and `.d.ts` type declarations
- **App packages** (`apps/platform` / `apps/action`): tsdown bundles entry points (single ESM output, no `.d.ts`)
- **Smoke test**: after `tsdown` build completes, run `node dist/index.js --help` to verify runtime entry is callable

Release process: see [Release Guide](https://github.com/dependfix/dependfix/blob/master/docs/guide/release.md).

## Testing

| Layer | Test framework | Coverage target |
|:------|:---------------|:----------------|
| `packages/*` | Vitest | Statements >= 80% / Branches >= 70% / Functions >= 80% / Lines >= 80% |
| `apps/platform` server | Vitest + Better-SQLite in-memory | Same as above |
| `apps/platform` web | Vitest + Vue Test Utils | Same as above |
| `apps/platform` e2e | Playwright | Critical user flows (5 critical baseline) |
| `apps/action` smoke | tsx entry + mock outputs | N/A |

Coverage report command:

```bash
pnpm run test:coverage
```

Coverage reports are output to `coverage/` (lcov + html + json formats), uploaded as CI artifact for review.

## Code quality tooling

- **ESLint**: v9 flat config + `@nuxt/eslint-config` + typescript-eslint strict rules. Run `pnpm lint` to check
- **commitlint**: Conventional Commits enforcement, run by husky `commit-msg` hook. Commit format: `<type>(<scope>): <subject>`
- **lint-staged**: auto-fix staged files (ESLint `--fix` + `lint-md`) before commit
- **markdownlint**: `lint-md` for `.md` files (project consistency)
- **check:docs**: `scripts/check-docs.mjs` validates links + VitePress anchors, runs in CI
- **i18n:audit**: scripts/i18n/audit-locale-keys.mjs validates zh-CN / en-US key set parity, runs in CI
- **distill:wisdom**: scripts/distill-wisdom.mjs validates wisdom active entry count <= threshold, runs before session end

## Dependency management

- **Package manager**: pnpm >= 9 (monorepo workspace)
- **Lockfile**: `pnpm-lock.yaml` committed; CI uses `pnpm install --frozen-lockfile`
- **Dependency updates**: dependabot auto-creates PRs; dependfix itself is used as the fix tool (self-referential loop with careful audit)
- **Frozen lockfile handling**: see [Quick Start cross-major-upgrade](../guide/quick-start.md) and `pnpm i --frozen-lockfile` auto-fix design

## CI / CD

- **GitHub Actions**: `.github/workflows/test.yml` (lint + typecheck + test + coverage + build + e2e + check:docs + i18n:audit), `.github/workflows/release.yml` (auto-version + publish)
- **Docker image**: `Dockerfile` multi-stage build (apps/platform base, includes engine + cli). Push to `docker.io` + `ghcr.io`
- **Self-hosting**: see [Platform Auth Users design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-auth-users)

## Key design decisions

For full architectural rationale, see [Architecture design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture) (English version pending — see [Chinese source](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture)). Key decisions summary:

- **Resource owner abstraction**: align with GitHub official user / org concept, single source of truth (Resource owner), supports multi-org scenarios (C67)
- **Mode state machine**: `report-only` → `fix` → `fix-and-pr` → `cleanup-branches` (progressive execution; each mode is a refinement over the previous, no mode-jump)
- **AI breaking-change assessment**: engine-level AI integration (M5 closed), CLI / MCP / GitHub Action / platform all support via `RuntimeConfig.ai`
- **PR content fingerprint dedup**: close old + open new strategy to avoid branch pile-up (M19.3 closed)
- **No token on disk**: credentials decrypted only in memory during execution; disposed after use
- **Frozen-lockfile 7-category classification**: systematic diagnosis + multi-strategy repair chain (vs blind retry)

## Extension points

If you need to extend dependfix (add a new alert source / a new fixer / a new AI provider):

1. **New alert source**: implement `AlertFetcher` interface in `packages/engine/src/alerts/`, register in `fetcher/index.ts`
2. **New fixer strategy**: add to `packages/engine/src/fixers/` strategy chain, ordered by safety (read-only → write)
3. **New AI provider**: implement `AiProvider` interface in `packages/engine/src/ai/`, register in `provider.ts`
4. **New platform feature**: add API endpoint (Nuxt server route) + DB entity + i18n key + UI component
5. **New skill**: add `packages/skills/<skill-name>/SKILL.md` + register in skill index

All extensions must follow the Development Standard, Testing Standard, and Documentation Standard (English versions pending — see [Chinese source](https://github.com/dependfix/dependfix/blob/master/docs/standards/development.md) for now).
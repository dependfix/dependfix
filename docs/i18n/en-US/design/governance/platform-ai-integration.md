# Platform AI Assessment Integration Design (apps/platform)

> Full design first draft for **apps/platform management platform integration of AI breaking-change assessment capability**. Engine layer (`packages/engine/src/ai/`) closed in M5 (T502); CLI / MCP / GitHub Action three user paths all support `--ai` flags; this design focuses on **apps/platform (Nuxt management platform) as execution entry, end-to-end AI assessment link**.
>
> **Status**: Design first draft, not yet entered stage implementation (mounted to [backlog](https://github.com/dependfix/dependfix/blob/master/docs/plan/backlog.md)). M26 phase entered stage (see [todo.md §M26.1](https://github.com/dependfix/dependfix/blob/master/docs/plan/todo.md)).

## 1. Background & goals

dependfix's core value is **AI breaking-change assessment** — when upgrading across major versions, automatically fetch Changelog, multi-provider assessment, structured patch + safety-gated suggestion. This capability is key differentiator for **dependency upgrade decisions** (vs Renovate / Dependabot which only bump version numbers).

**Current pain points**:

- AI assessment is fully available in CLI (`--ai` family flags) / MCP (`ai_provider` / `ai_model` / `ai_trigger` schema) / GitHub Action (`ai` / `ai-api-key` etc. inputs) three user paths.
- apps/platform (management platform) as execution entry has **zero integration** — `POST /api/repos/[id]/scan` does not accept `ai` field, `ScanRequest` schema has no `ai` field, three executors (container / sandbox / github-action) do not pass through `RuntimeConfig.ai`, UI has no AI config entry, RunDetailDialog / alerts views do not consume `result.aiUsage`.
- Under org / public deployment scenarios cannot centrally manage AI API Key (each CLI user carries their own key, unauditable).

**Goals**:

1. **Centralized API Key management**: Organization-level-level encrypted storage of AI API Key (reusing existing `ENCRYPTION_KEY` + AES-256-GCM tools).
2. **Per-repo controllable switch**: each repo independent `aiEnabled` + `aiTrigger` (`failure` / `major` / `both`), for cost / compliance control.
3. **Platform scan triggers AI assessment**: click "Scan" in management platform to enable AI assessment, no separate CLI / Action path needed.
4. **Observable reports**: RunDetailDialog / alerts views show AI assessment results and usage (`calls` / `inputTokens` / `outputTokens` / `estimatedCostUsd`).
5. **Three-layer config model** (individual / organization / public): this design uses organization-level as baseline, future evaluation of "global platform.config" / "user individual level" extension.

## 2. Current status (after M25.2a closure)

AI breaking-change assessment engine layer `packages/engine/src/ai/` closed in M5 (commit `3475e6e`), CLI / MCP / GitHub Action three user paths all support `--ai` family flags; apps/platform (management platform) as execution entry **end-to-end link split into P0 base layer + P1 application layer two steps**:

**P0 base layer M25.2a closed** (5 commits / ~992 lines, commit `1c65582` data model + `f174cce` Schema+Service + `7250ec1` three-executor pass-through + `49480a6` typecheck fix + `782fa27` close):
- Organization.aiDataId / Repository.aiEnabled / ScanRun.aiConfigSnapshot data model
- scan-orchestrator pass-through
- container / sandbox / github-action three executors sync

**P1 application layer M26.1 next** (5 commits / ~1130 lines): 4 API endpoints (PATCH organization-ai-config / GET repo-ai-config / POST repo-ai-config / extended POST scan) + UI (Organization AI config form + repo AI switch + scan dialog override + RunDetailDialog usage display + alerts assessment column) + i18n (zh-CN + en-US `ai.*` namespace) + docs architecture.md AI assessment section extension.

## 3. Architecture decision

### 3.1 AI API Key mounting layer (Organization + per-repo switch)

**Decision**: **AI API Key mounts at Organization level** (encrypted storage), per-repo level only configures switch + trigger range.

| Dimension | Choice | Rationale |
| |:---|:---|
| API Key storage layer | **Organization-level** (encrypted column) | One Key serves multiple repos, avoiding repeated procurement; Organization entity (M7.1) naturally supports it |
| Per-repo switch | **Repository.aiEnabled** (boolean) | Per-repo can independently close (cost / compliance control) |
| Per-repo trigger | **Repository.aiTrigger** (enum) | Per-repo can independently configure AI trigger range |
| Future extension | Three-layer model (individual / organization / public) | Individual use → global `platform.config.ai`; organization → Organization.aiApiKey; public → not enabled (only CLI / Action path) + UI hides entry |

**Not chosen**:
- **Repository-level Key** — 100 repos 100 configurations, heavy ops; non-compliant (Keys scattered)
- **Global platform.config** — multi-org / multi-tenant scenario cannot isolate (violates M7.1 multi-org governance direction)
- **Credential entity reuse** — Credential type (`classic-pat` / `fine-grained-pat` / `github-app`) differs in semantics from AI API Key, mixing violates single responsibility

### 3.2 AI assessment trigger range (trigger semantics)

Consistent with engine layer semantics:

- `failure` — trigger AI assessment on validation failure (most common, cost-sensitive)
- `major` — trigger on major version upgrade (clear high-risk signal)
- `both` — default, trigger when either `failure` / `major` happens

**No new trigger variants**: avoid introducing values unsupported by engine, maintain single-source semantics.

### 3.3 Call chain pass-through

```
PATCH /api/organizations/[id]/ai-config     → Organization.ai* field update
POST   /api/repos/[id]/ai-config             → Repository.aiEnabled / aiTrigger update
POST   /api/repos/[id]/scan
    { aiEnabled?, aiTrigger? }                → runtime override
    → scan-orchestrator service
        → resolveAiConfig(request, repo, org)
            ├── aiEnabled = request.aiEnabled ?? repo.aiEnabled ?? false
            ├── aiTrigger = request.aiTrigger ?? repo.aiTrigger ?? 'both'
            └── apiKey   = decrypt(org.aiApiKeyEncrypted)
        → ContainerExecutor.execute(ctx)
            ├── ...ctx.config
            └── ai: { provider, model, apiKey, trigger, baseUrl, apiUrl }
                → DependfixApp.run()
                    → async → assessBreakingChange()
                        → RunResult.aiUsage
```

### 3.4 Three-layer config model (future evaluation)

Users mentioned three distinctions: "individual / organization / public". This design uses Organization-level as baseline implementation, **future evaluation**:

| Layer | Scenario | Key storage | Implementation complexity |
|:------|:---------|:-----------|:--------------------------|
| Individual (global) | Single-user CLI / Docker self-deployment | `apps/platform/server/config/platform.config.ts` aiApiKeyEnv | Low |
| Organization (M7.1 already landed) | Team / company internal | Organization.aiApiKeyEncrypted | **This design implementation** |
| Public (public deployment) | Multi-person SaaS mode | Not enabled (only CLI / Action path) + UI hides entry | Medium (involves platform distribution strategy) |

**Trigger condition**: user feedback that individual deployment needs simplified configuration → evaluate "individual layer" extension.

## 4. Scope

### 4.1 P0 core integration (recommended first batch)

**A. Data model** (2 entity extensions)

`apps/platform/server/entities/organization.ts` new:
- `aiApiKeyEncrypted` (text, nullable): AES-256-GCM encrypted AI API Key
- `aiProvider` (varchar 32, default `'openai-compatible'`): aligns with engine layer `AiConfig.provider`
- `aiModel` (varchar 100, default `'deepseek-v4-flash'`): aligns with engine layer `AiConfig.model`
- `aiBaseUrl` (varchar 255, nullable): OpenAI-compatible endpoint override
- `aiApiUrl` (varchar 255, nullable): Anthropic endpoint override

`apps/platform/server/entities/repository.ts` new:
- `aiEnabled` (boolean, default `false`): per-repo AI assessment switch
- `aiTrigger` (varchar 16, default `'both'`): trigger range `failure` / `major` / `both`

Need TypeORM migration (consistent with `synchronize opt-in` strategy); AI Key column uses existing `encryptToken(plaintext, getEncryptionKey())`.

**B. Schema + Service + Executor pass-through**

- `apps/platform/server/schemas/scan.ts`: add `aiEnabled` (optional boolean) + `aiTrigger` (optional enum) — **runtime override repo default**
- `scan-orchestrator.service.ts:runScanForRepository`:
  - Read AI config from Repository + Organization
  - Merge logic: API request field > repo-level field > org-level field
  - Inject `RuntimeConfig.ai`
- `container-executor.ts:254-262`: add `ai: { provider, model, apiKey, trigger, baseUrl, apiUrl }`

**C. API layer (4 endpoints)**

- **Extend** `POST /api/repos/[id]/scan`: accept `aiEnabled` / `aiTrigger` (runtime override)
- **New** `PATCH /api/organizations/[id]/ai-config` (admin): manage Organization.ai*
- **New** `GET /api/repos/[id]/ai-config` (viewable): query repo + org AI config status (**not return Key**)
- **New** `POST /api/repos/[id]/ai-config` (admin): per-repo `aiEnabled` / `aiTrigger`

### 4.2 P1 enhancement (recommended second batch)

**D. UI layer**

- `app/pages/settings.vue` or new `app/pages/admin/ai-config.vue`: Organization AI config form (Provider / Model / API Key / Base URL / Anthropic URL)
- `app/pages/repos/[id]/index.vue` (repo detail): AI assessment switch + trigger select
- `app/pages/repos.vue` scan dialog: AI override (runtime override)
- `app/components/run-detail-dialog.vue`: show `result.aiUsage` (calls / inputTokens / outputTokens / estimatedCostUsd)
- `app/pages/alerts.vue`: AI assessment "AI-evaluated" tag + expand AI assessment summary (confidence / patch suggestion / breaking risks)

**E. i18n**

- `apps/platform/i18n/locales/zh-CN.json` + `en-US.json`: add `ai.*` namespace
- Includes enable/disable/provider/model/trigger labels + error messages + usage display

**F. Security governance (aligned with [architecture.md §AI assessment misjudgment handling](./architecture.md))**

- AI output must pass `lint` / `typecheck` / `build` (reusing existing safety-gate)
- AI-generated PR not auto-merged (consistent with [standards/index.md](https://github.com/dependfix/dependfix/blob/master/docs/standards/development.md))
- Below confidence threshold only output suggestions
- AI API Key logs redacted (reusing `packages/engine/src/ai/secrets.ts:maskSecrets`)
- Per-repo `aiEnabled=false` → API request override also rejected

## 5. Data model details

### 5.1 Organization entity extension

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `aiApiKeyEncrypted` | text, nullable | null | AES-256-GCM encrypted AI API Key |
| `aiProvider` | varchar(32) | `'openai-compatible'` | Aligns with engine `AiConfig.provider` |
| `aiModel` | varchar(100) | `'deepseek-v4-flash'` | Aligns with engine `AiConfig.model` |
| `aiBaseUrl` | varchar(255), nullable | null | OpenAI-compatible endpoint override |
| `aiApiUrl` | varchar(255), nullable | null | Anthropic endpoint override |

**Encryption flow**: reuse `apps/platform/server/credential.service.ts:getEncryptionKey()` + AES-256-GCM.

### 5.2 Repository entity extension

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `aiEnabled` | boolean | `false` | Per-repo AI assessment switch |
| `aiTrigger` | enum(16) | `'both'` | Trigger range: `failure` / `major` / `both` |

### 5.3 Merge priority (runtime override)

```
Runtime AI config =
    API request.aiEnabled?    // highest (this scan overrides repo default)
    : Repository.aiEnabled
Runtime AI trigger =
    API request.aiTrigger?    // highest
    : Repository.aiTrigger
Runtime AI provider / model / apiKey / baseUrl / apiUrl =
    Organization.aiProvider / aiModel / aiApiKeyEncrypted / aiBaseUrl / aiApiUrl
    // repo-level has no override
```

## 6. API contract

### 6.1 Extend `POST /api/repos/[id]/scan`

Request schema (backward-compatible new fields):

```typescript
{
    mode: 'report-only' | 'fix' | 'fix-and-pr'
    severityThreshold: 'critical' | 'high' | 'medium' | 'all'
    executorKind?: 'container' | 'github-action' | 'sandbox'
    reuseScanRunId?: string
    // New (runtime override repo default)
    aiEnabled?: boolean
    aiTrigger?: 'failure' | 'major' | 'both'
}
```

Behavior:
- `aiEnabled=true` but Organization has no Key configured → **400 error**: "Organization has no AI API Key configured"
- `aiEnabled=true` but `Repository.aiEnabled=false` and API didn't pass `aiEnabled` → reject (prevent accidental enable)
- Merged `ai*` fields write to ScanRun entity (new `ScanRun.aiConfigSnapshot` column, JSON, records this scan's actually-used AI config, for audit)

### 6.2 New `PATCH /api/organizations/[id]/ai-config`

Request schema:

```typescript
{
    apiKey?: string  // plaintext, encrypt before storage
    provider?: 'openai-compatible' | 'anthropic'
    model?: string
    baseUrl?: string | null
    apiUrl?: string | null
}
```

Permission: admin / org_admin. Response does not echo apiKey (only returns `hasAiApiKey: boolean`).

### 6.3 New `GET /api/repos/[id]/ai-config`

Response:

```typescript
{
    repository: { aiEnabled: boolean, aiTrigger: string }
    organization: {
        hasAiApiKey: boolean
        aiProvider: 'openai-compatible' | 'anthropic'
        aiModel: string
        aiBaseUrl: string | null
        aiApiUrl: string | null
    }
    effective: {
        aiEnabled: boolean
        aiTrigger: 'failure' | 'major' | 'both'
        aiProvider: 'openai-compatible' | 'anthropic'
        hasApiKey: boolean
    }
}
```

### 6.4 New `POST /api/repos/[id]/ai-config`

Request schema:

```typescript
{
    aiEnabled?: boolean
    aiTrigger?: 'failure' | 'major' | 'both'
}
```

Permission: admin / org_admin. Response: `{ repository: {...} }`.

## 7. UI transformation details

### 7.1 Organization AI config (settings or admin sub-page)

- Form fields: Provider (Select) / Model (InputText) / API Key (Password) / Base URL / Anthropic URL
- API Key input masked (type=password), after submit only display `hasAiApiKey: true` badge
- Test connection button (optional / P1 enhancement): one AI assessment dry-run to verify Key is valid

### 7.2 Repo AI config (repo detail page)

- AI assessment switch (ToggleSwitch)
- Trigger select (Select): failure / major / both
- When Organization has no Key configured show warning: "Organization has no AI Key configured, configure before enabling"

### 7.3 Scan dialog (repos.vue)

- New "AI assessment override" collapsible panel:
  - Switch (default = repo default)
  - Trigger select (default = repo default)
- When Organization has no Key configured this panel disabled + warning

### 7.4 RunDetailDialog

- In run meta area add "AI usage" section:
  - calls / inputTokens / outputTokens / totalTokens / estimatedCostUsd
  - Table display (PrimeVue DataTable)
- When AI not enabled this section hidden

### 7.5 Alerts view

- alerts list add "AI assessment" column (Tag, ai-evaluated / ai-skipped)
- Click row expand AI assessment summary (confidence / patch suggestion / breaking risks)

## 8. Security & governance

### 8.1 AI API Key encryption

- Reuse existing `ENCRYPTION_KEY` (platform-level key, same source as GitHub PAT credentials)
- AES-256-GCM encryption (consistent with `Credential.encryptedToken`)
- Decrypt only in `runScanInternal` in-memory, discard after use; not echoed in API responses

### 8.2 AI output safety gate

Consistent with [architecture.md §AI assessment misjudgment handling](./architecture.md):
- AI output must pass `lint` / `typecheck` / `build` (reusing existing verification phase)
- AI-generated PR not auto-merged (consistent with [standards/index.md](https://github.com/dependfix/dependfix/blob/master/docs/standards/development.md))
- Below confidence threshold only output suggestions (engine `safety-gate.ts` already implemented)
- Limit patch range (prevent large-scale destructive changes)

### 8.3 Audit

- ScanRun entity new `aiConfigSnapshot` column (JSON), records this scan's actually-used AI config (apiKey redacted)
- aiUsage data persisted (kept in `run-result.summary`, for run-history view aggregation)
- Operation log (AuditEvent) records write operations of PATCH / POST ai-config endpoints

### 8.4 Credential minimization

- AI Key only passed to engine layer (not written to front-end response)
- Logs / error responses `maskSecrets`
- API test endpoints (`/api/e2e/fixtures`) not allowed to access ai-config

## 9. Acceptance criteria

### 9.1 P0 landing acceptance

- Organization create + API Key configure + encrypted storage + decryption read link works through
- Per-repo aiEnabled=true triggers AI assessment on scan (actually calls deepseek API)
- Per-repo aiEnabled=false skips AI assessment (even if Organization has Key configured)
- Runtime override (aiEnabled / aiTrigger) takes effect per merge priority
- ScanRun.aiConfigSnapshot field records actually-used config
- Three executors (container / sandbox / github-action) consistently pass `ai` field
- 4 API endpoints pass contract test
- Database migration (sync + incremental) works through

### 9.2 P1 enhancement acceptance

- Organization AI config UI completes (4 form fields + Key input + test connection)
- Per-repo AI config UI completes (switch + trigger)
- Scan dialog AI override panel completes
- RunDetailDialog AI usage display completes
- alerts view AI assessment column completes
- zh-CN + en-US i18n completes (`ai.*` namespace)

### 9.3 Governance acceptance

- AI Key encryption (reference Credential credential governance audit)
- Audit log (AuditEvent) records
- `maskSecrets` validated in logs / error responses
- PR not auto-merged (depends on verification phase guarantee)
- Documentation sync updated (architecture.md / standards/index.md)

## 10. Adopt trigger condition (when to enter [todo.md](https://github.com/dependfix/dependfix/blob/master/docs/plan/todo.md) current stage)

When any of the following is triggered, adopt from backlog to todo.md §current stage:

1. User feedback needs management platform to trigger AI assessment (typical scenario: in-org multi-person collaboration wants unified Key management)
2. Public deployment (docker one-click deployment) user AI assessment config barrier too high (CLI user few, wants panel-based config)
3. M28+ phase (M7.2 platform capability deepening continuation) starts
4. Link with C66 alert view enhancement (M28 phase combined implementation)
5. User explicitly triggers adoption

## 11. Key decision review (to be filled when user adopts stage)

- AI Key mounting layer: Organization + per-repo switch (vs Repository-level vs global platform.config vs Credential reuse)
- Three-executor consistency: container / sandbox / github-action sync completion (vs container-only first)
- API Key encryption strategy: same source AES-256-GCM as Credential.encryptedToken (vs separate encryption layer)
- Merge priority: API override > Repository default > Organization shared (vs Repository complete override)
- ScanRun.aiConfigSnapshot field: record actually-used config for audit (vs not record only write-back to logs)

## 12. Related docs

- [architecture.md](./architecture.md) — Overall architecture
- [sandbox-security-governance.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/sandbox-security-governance.md) — AI assessment role in supply-chain defense
- [platform-auth-users.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-auth-users.md) — Organization entity extension baseline
- [platform-scheduled-batch.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-scheduled-batch.md) — Scheduled scan link
- [standards/index.md](https://github.com/dependfix/dependfix/blob/master/docs/standards/development.md) — "AI assessment not auto-merged by default" governance principle
- [experience-archive.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/experience-archive.md) — Experience accumulation continuous addition

## 13. Document metadata

- **Design first draft created**: 2026-09-08
- **Trigger**: User research "How to supplement AI assessment in apps/platform"
- **Related stage**: Not adopted (only mounted backlog); candidate stage M26+ (link with M25.2a → M26.1 application layer implementation)
- **Audit basis**: This document is the design basis for P0 landing, no A-stage audit taken (consistent with design docs governance convention)
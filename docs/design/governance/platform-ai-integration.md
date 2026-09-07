# 平台 AI 研判集成设计（apps/platform）

> 本文档为 **apps/platform 管理平台集成 AI breaking change 研判能力**的专项设计先行稿。引擎层（`packages/engine/src/ai/`）的 AI 研判能力已在 T502 / M5 闭环（commit 3475e6e），CLI / MCP / GitHub Action 三条用户路径全部支持；本设计聚焦于 **apps/platform（Nuxt 管理平台）作为执行入口时，AI 研判的端到端联通**。
>
> **状态**：设计先行稿，未进入阶段实施面（挂载到 [backlog.md 短期/一次性候选任务](../../plan/backlog.md)）。

## 1. 背景与目标

dependfix 的核心价值之一是 **AI 研判 breaking change** —— 跨大版本升级时自动采集 Changelog + 多 provider 研判 + 结构化 patch + 安全门（详见 [architecture.md §AI 研判误判处理](./architecture.md)）。该能力对 **依赖升级决策** 是关键差异化（vs Renovate / Dependabot 仅 bump 版本号）。

**当前痛点**：

- AI 研判在 CLI（`--ai` 系列参数）/ MCP（`ai_provider` / `ai_model` / `ai_trigger` schema）/ GitHub Action（`ai` / `ai-api-key` 等 input）三条用户路径上**全部可用**。
- apps/platform（管理平台）作为内部运维与公开部署的核心入口，触发扫描的 API 端点（`POST /api/repos/[id]/scan.post.ts`）**不接收任何 ai 字段**，ScanRequest schema 与 ScanExecutorContext 链路全程透传丢失。
- 平台扫描跑出来的报告里**看不到 AI 研判结果与用量**（`result.aiUsage` 字段虽已注入 RunResult 但 UI 未消费）。
- 组织 / 公开部署场景下无法集中管理 AI API Key（每个 CLI 用户各自带 Key、无法审计）。

**目标**：

1. **API Key 集中管理**：Organization 级加密存储 AI API Key（复用现有 `ENCRYPTION_KEY` + AES-256-GCM 工具），避免散落各仓库凭据或 CLI 环境变量。
2. **单仓库可控开关**：每个仓库独立 `aiEnabled` + `aiTrigger`（`failure` / `major` / `both`），便于成本与合规控制。
3. **平台扫描触发 AI 研判**：用户在管理平台点 "扫描" 即可启用 AI 研判，不需要单独 CLI / Action 通道。
4. **报告可观测**：RunDetailDialog / alerts 视图展示 AI 研判结果与用量（`calls` / `inputTokens` / `outputTokens` / `estimatedCostUsd`）。
5. **三层配置模型**（个人 / 组织 / 公开）：本文档以 Organization 级为基线，未来评估"全局 platform.config" / "用户个人级"扩展。

## 2. 现状盘点

### 2.1 ✅ 引擎层（`packages/engine/src/ai/`）

完整实现的 AI 研判能力（M5 已闭环，commit 3475e6e）：

| 模块 | 职责 |
|:---|:---|
| `index.ts:assessBreakingChange()` | 核心入口：build context → provider.chat → parseAssessment（失败重试 1 次）→ 降级建议模式 |
| `provider.ts` | OpenAI 兼容 + Anthropic 双 provider 抽象，默认端点 `https://api.deepseek.com` / 模型 `deepseek-v4-flash` |
| `changelog-fetcher.ts` | Changelog 抓取 + BREAKING 关键字正则提取（`BREAKING_HEADING_RE = /\bbreaking\s*changes?\b\|.../i`）|
| `schema.ts` | Zod schema 校验 AI 输出（失败降级） |
| `prompt.ts` | system prompt 硬编码 + user context 注入（防 prompt injection）|
| `safety-gate.ts` | 安全门（置信度阈值 + 不自动合并） |
| `usage.ts` | 按 model 计价（`deepseek-chat / reasoner / v4-flash / v4-pro` 都有定价） |
| `app-integration.ts` | 与 app 集成入口 |

`config/index.ts:aiConfig` 已定义完整 schema：

```typescript
ai: {
    provider: 'openai-compatible' | 'anthropic'
    model: string                    // 默认 'deepseek-v4-flash'
    apiKey: string                    // env 优先（DEPENDFIX_AI_API_KEY）
    trigger: 'failure' | 'major' | 'both'  // 默认 'both'
    baseUrl?: string                 // OpenAI 兼容端点
    apiUrl?: string                  // Anthropic 端点
}
```

`RunResult.aiUsage` 聚合字段已注入：

```typescript
{ calls: number, inputTokens: number, outputTokens: number, totalTokens: number, estimatedCostUsd: number }
```

### 2.2 ✅ CLI / MCP / GitHub Action 三条用户路径

| 路径 | AI 接入方式 |
|:---|:---|
| CLI（`packages/cli/src/cli/index.ts`）| `--ai` / `--ai-provider` / `--ai-model` / `--ai-api-key` / `--ai-trigger` / `--ai-base-url` / `--ai-api-url` 共 7 个 flag |
| MCP（`packages/mcp/src/tools/run-scan.ts`）| `ai_provider` / `ai_model` / `ai_trigger` schema 入参 |
| GitHub Action（`action.yml`）| `ai` / `ai-api-key` / `ai-provider` / `ai-model` / `ai-base-url` / `ai-api-url` / `ai-trigger` inputs |

### 2.3 ❌ apps/platform 零集成（精确搜索验证）

精确搜索 `apps/platform/` 下 `ai[-_](enabled|provider|model|trigger|api[-_]key|base[-_]url)` / `AI[-_](研判|judg)` / `breaking[-_]change`：

```
（精确匹配为空 = apps/platform 当前零 AI 研判集成）
```

具体缺口：

| 层 | 文件 | 缺口 |
|:---|:---|:---|
| 数据模型 | `apps/platform/server/entities/organization.ts` | 无 `aiApiKeyEncrypted` / `aiProvider` / `aiModel` / `aiBaseUrl` / `aiApiUrl` |
| 数据模型 | `apps/platform/server/entities/repository.ts` | 无 `aiEnabled` / `aiTrigger` |
| API schema | `apps/platform/server/schemas/scan.ts` | ScanRequest 无 `aiEnabled` / `aiTrigger` |
| Service | `apps/platform/server/services/scan-orchestrator.service.ts:101 runScanForRepository` | 透传 request → executor，**未注入 ai 字段** |
| Executor | `apps/platform/server/services/executor/container-executor.ts:254-262` | 构造 `RuntimeConfig` **未注入 `ai`**（漏掉 ai* 参数）|
| Executor | `sandbox-executor.ts` / `action-trigger-executor.ts` | 同款缺口（保持三执行器一致需同步补齐）|
| API endpoint | `apps/platform/server/api/repos/[id]/scan.post.ts` | 不接收 ai 入参 |
| API endpoint | （缺） | 无 AI 配置管理端点（Organization / Repository 级）|
| UI | `app/pages/repos.vue` 扫描对话框 | 无 AI 选项 |
| UI | `app/pages/settings.vue` | 无 AI 配置入口 |
| UI | `app/components/run-detail-dialog.vue` | 未消费 `result.aiUsage` |
| UI | `app/pages/alerts.vue` | 未展示 AI 评估摘要 |
| i18n | `apps/platform/i18n/locales/zh-CN.json` / `en-US.json` | 无 `ai.*` 命名空间 |

**根因**：M5 实施 AI 研判引擎时，apps/platform 还未启动（platform M6 才闭环）。M6 / M7 / M22 阶段均未涉及 AI 集成——属于历史遗漏而非技术阻碍。

## 3. 架构决策

### 3.1 AI API Key 挂载层级（Organization + 单仓库开关）

**决策**：**AI API Key 挂在 Organization 级**（加密存储），单仓库级只配开关与 trigger 范围。

| 维度 | 选型 | 理由 |
|:---|:---|:---|
| API Key 存储层 | **Organization 级**（加密列） | 一个 Key 服务多个仓库，避免重复采购；Organization 实体（M7.1 已闭环）天然支持 |
| 仓库级开关 | **Repository.aiEnabled** (boolean) | 单仓库可独立关闭（成本 / 合规控制）|
| 仓库级 trigger | **Repository.aiTrigger** (enum) | 单仓库可独立配置 AI 触发范围 |
| 未来扩展 | 三层模型（个人 / 组织 / 公开）| 个人使用 → 全局 `platform.config.ai`；组织 → Organization.aiApiKey；公开 → 不启用（仅 CLI / Action 通道）|

**不选的方案**：

- **Repository 级 Key** —— 100 仓库 100 次配置，运维负担重；不合规（Key 散落）
- **全局 platform.config** —— 多组织 / 多租户场景无法隔离（违背 M7.1 多组织治理方向）
- **Credential 实体复用** —— Credential 类型（`classic-pat` / `fine-grained-pat` / `github-app`）与 AI API Key 语义不同（前者是 GitHub 凭据），混在一起违反单一职责

### 3.2 AI 研判触发范围（trigger 语义）

与 engine 层语义一致：

- `failure` —— 验证失败时触发 AI 研判（最常用，成本敏感）
- `major` —— 跨大版本升级时触发（明确的高风险信号）
- `both` —— 默认值，`failure` + `major` 任一触发

**不新增 trigger 变体**：避免引入 engine 端不支持的 trigger 值，保持单源语义。

### 3.3 调用链透传路径

```
POST /api/repos/[id]/scan { aiEnabled?, aiTrigger? }
    → ScanRequest schema 校验
    → runScanForRepository(repositoryId, request, options)
    → runScanInternal
        → resolveExecutorKind (container/ github-action/ sandbox)
        → ContainerExecutor.execute(ctx)
            → RuntimeConfig { ...ctx.config, ai: { provider, model, apiKey, trigger, baseUrl, apiUrl } }
            → DependfixApp.run()  // engine 层
                → assessBreakingChange()  // AI 研判入口
                → runResult.aiUsage  // 回传聚合
```

**关键点**：`Organization.aiApiKey` 必须在 `runScanInternal` 阶段解密后注入 `RuntimeConfig.ai.apiKey`（不在前端 API 请求里传 Key，避免日志泄露）。

### 3.4 三层配置模型（远期评估）

用户在调研中提到"个人 / 组织 / 公开"三种区分。本文档以 Organization 级为基线落地，**未来评估**：

| 层级 | 适用场景 | Key 存储 | 实现复杂度 |
|:---|:---|:---|:---|
| 个人（全局）| 单用户 CLI / Docker 自部署 | `apps/platform/server/config/platform.config.ts` aiApiKeyEnv | 低 |
| 组织（M7.1 已落地）| 团队 / 公司内部 | Organization.aiApiKeyEncrypted | **本文档落地** |
| 公开（公开部署）| 多人 SaaS 模式 | 不启用（仅 CLI / Action 通道）+ UI 隐藏入口 | 中（涉及平台分发策略）|

**触发条件**：用户实测反馈个人部署需要简化配置 → 评估"个人层"扩展。

## 4. 范围

### 4.1 P0 核心集成（建议首批落地）

**A. 数据模型（2 个实体扩展）**

`apps/platform/server/entities/organization.ts` 新增：

```typescript
@Column({ type: 'text', nullable: true })
aiApiKeyEncrypted!: string | null

@Column({ type: 'varchar', length: 32, default: 'openai-compatible' })
aiProvider!: 'openai-compatible' | 'anthropic'

@Column({ type: 'varchar', length: 100, default: 'deepseek-v4-flash' })
aiModel!: string

@Column({ type: 'varchar', length: 255, nullable: true })
aiBaseUrl!: string | null

@Column({ type: 'varchar', length: 255, nullable: true })
aiApiUrl!: string | null  // Anthropic 端点覆盖
```

`apps/platform/server/entities/repository.ts` 新增：

```typescript
@Column({ type: 'boolean', default: false })
aiEnabled!: boolean

@Column({ type: 'varchar', length: 16, default: 'both' })
aiTrigger!: 'failure' | 'major' | 'both'
```

需要 TypeORM migration（与 M22.4 synchronize opt-in 策略一致）；AI Key 列走现有 `ENCRYPTION_KEY` + AES-256-GCM 工具。

**B. Schema + Service + Executor 透传**

- `apps/platform/server/schemas/scan.ts`：加 `aiEnabled` (可选 boolean) + `aiTrigger` (可选 enum) —— **运行时 override 仓库默认**
- `scan-orchestrator.service.ts:runScanForRepository`：
  - 从 Repository + Organization 读取 AI 配置
  - 合并逻辑：API 请求字段 > 仓库级字段 > 组织级字段
  - 注入 `RuntimeConfig.ai`
- `container-executor.ts:254-262`：补 `ai: { provider, model, apiKey, trigger, baseUrl, apiUrl }`
- `sandbox-executor.ts` + `action-trigger-executor.ts`：同款注入（保持三执行器一致）

**C. API 层（4 个端点）**

- **扩展** `POST /api/repos/[id]/scan.post.ts`：接收 `aiEnabled` / `aiTrigger`（运行时 override）
- **新增** `PATCH /api/organizations/[id]/ai-config`（admin）：管理组织 AI 配置（含 API Key 加密写入）
- **新增** `GET /api/repos/[id]/ai-config`（viewable）：查询仓库 + 组织 AI 配置状态（**不返回 Key**）
- **新增** `POST /api/repos/[id]/ai-config`（admin）：单仓库级 `aiEnabled` / `aiTrigger`

### 4.2 P1 增强（建议第二批落地）

**D. UI 层**

- **`app/pages/settings.vue`** 或新建 `app/pages/admin/ai-config.vue`：组织 AI 配置表单（Provider / Model / API Key 输入 + 密文显示）
- **`app/pages/repos/[id]/index.vue`**（仓库详情）：AI 研判开关 + trigger 选择
- **`app/pages/repos.vue` 扫描对话框**：AI 覆盖选项（运行时 override）
- **`app/components/run-detail-dialog.vue`**：展示 `result.aiUsage`（calls / inputTokens / outputTokens / estimatedCostUsd）
- **`app/pages/alerts.vue`**：AI 研判后的告警显示"AI 评估"标签 + 评估摘要

**E. i18n**

- `apps/platform/i18n/locales/zh-CN.json` + `en-US.json`：加 `ai.*` 命名空间
- 包括 enable/disable/provider/model/trigger 标签 + 错误消息 + 用量展示

**F. 安全治理（与 [architecture.md §AI 研判误判处理](./architecture.md) 对齐）**

- AI 输出必须通过 lint/typecheck/build（沿用 engine 层现有 safety-gate）
- AI 生成的 PR 不自动合并（与 `standards/index.md` 一致）
- 置信度低于阈值仅输出建议不写 PR body
- AI API Key 日志脱敏（复用 `packages/engine/src/ai/secrets.ts:maskSecrets`）
- 仓库级 aiEnabled=false 时，API 请求 override 也被拒绝（防止误启用）

### 4.3 不做什么

- 不重写 AI 研判引擎本身（engine 层 M5 已闭环，本设计只做平台集成）
- 不引入新 AI provider（OpenAI 兼容 + Anthropic 双 provider 足够，未来扩展由 engine 层评估）
- 不立即支持"个人层"配置（按 §3.4 触发条件评估）
- 不修改 CLI / MCP / GitHub Action 已有的 AI 参数（避免回归）
- 不破坏现有 ScanRequest schema（仅扩展字段，向后兼容）

## 5. 数据模型详情

### 5.1 Organization 实体扩展

| 字段 | 类型 | 默认 | 说明 |
|:---|:---|:---:|:---|
| `aiApiKeyEncrypted` | text, nullable | null | AES-256-GCM 加密的 AI API Key（与现有 Credential.encryptedToken 同加密策略）|
| `aiProvider` | varchar(32) | `openai-compatible` | 与 engine 层 `AiConfig.provider` 对齐 |
| `aiModel` | varchar(100) | `deepseek-v4-flash` | 与 engine 层 `AiConfig.model` 对齐 |
| `aiBaseUrl` | varchar(255), nullable | null | OpenAI 兼容端点覆盖 |
| `aiApiUrl` | varchar(255), nullable | null | Anthropic 端点覆盖 |

**加密流程**：复用 `apps/platform/server/credential.service.ts:getEncryptionKey()` + AES-256-GCM（与 GitHub PAT 凭据同源）。

### 5.2 Repository 实体扩展

| 字段 | 类型 | 默认 | 说明 |
|:---|:---|:---:|:---|
| `aiEnabled` | boolean | `false` | 单仓库 AI 研判开关 |
| `aiTrigger` | enum(16) | `both` | 触发范围：failure / major / both |

### 5.3 合并优先级（runtime override）

```
运行时 AI 配置 =
    API 请求 aiEnabled?    // 最高（本次扫描覆盖仓库默认）
    : Repository.aiEnabled
运行时 AI trigger =
    API 请求 aiTrigger?    // 最高
    : Repository.aiTrigger
运行时 AI provider / model / apiKey / baseUrl / apiUrl =
    Organization.aiProvider / aiModel / aiApiKeyEncrypted / aiBaseUrl / aiApiUrl
    // 仓库级无 override（Key 管理是组织级）
```

## 6. API 契约

### 6.1 扩展 `POST /api/repos/[id]/scan`

请求 schema（向后兼容新增字段）：

```typescript
{
    mode: 'report-only' | 'fix' | 'fix-and-pr'  // existing
    severityThreshold: 'critical' | 'high' | 'medium' | 'all'  // existing
    executorKind?: 'container' | 'github-action' | 'sandbox'  // existing
    reuseScanRunId?: string  // existing
    // 新增（运行时 override 仓库默认）
    aiEnabled?: boolean
    aiTrigger?: 'failure' | 'major' | 'both'
}
```

行为：

- `aiEnabled=true` 但 Organization 未配置 Key → **400 错误**："Organization 未配置 AI API Key，请先在设置中添加"
- `aiEnabled=true` 但 Repository.aiEnabled=false 且 API 未传 aiEnabled → 拒绝（防误启用）
- 合并后 `ai*` 字段写入 ScanRun 实体（新增 `ScanRun.aiConfigSnapshot` 列，JSON，记录本次扫描实际使用的 AI 配置，便于审计）

### 6.2 新增 `PATCH /api/organizations/[id]/ai-config`

请求 schema：

```typescript
{
    apiKey?: string  // 明文传输，落库前加密
    provider?: 'openai-compatible' | 'anthropic'
    model?: string
    baseUrl?: string | null
    apiUrl?: string | null
}
```

权限：admin / org_admin。响应不回显 apiKey（仅返回 `hasAiApiKey: boolean`）。

### 6.3 新增 `GET /api/repos/[id]/ai-config`

响应：

```typescript
{
    repository: { aiEnabled: boolean, aiTrigger: string }
    organization: { hasAiApiKey: boolean, provider: string, model: string, baseUrl: string | null, apiUrl: string | null }
    effective: { aiEnabled: boolean, aiTrigger: string, provider: string, hasApiKey: boolean }
}
```

### 6.4 新增 `POST /api/repos/[id]/ai-config`

请求 schema：

```typescript
{
    aiEnabled?: boolean
    aiTrigger?: 'failure' | 'major' | 'both'
}
```

权限：admin / org_admin。响应：`{ repository: {...} }`。

## 7. UI 改造详情

### 7.1 Organization AI 配置（settings 或 admin 子页）

- 表单字段：Provider（Select） / Model（InputText） / API Key（Password） / Base URL / Anthropic URL
- API Key 输入框 mask（type=password），提交后只显示 `hasAiApiKey: true` 标识
- 测试连接按钮（可选 / P1 增强）：调一次 AI 研判 dry-run 验证 Key 有效

### 7.2 仓库 AI 配置（仓库详情页）

- AI 研判开关（ToggleSwitch）
- Trigger 选择（Select）：failure / major / both
- 当 Organization 未配 Key 时显示警告："Organization 未配置 AI Key，启用前请先配置"

### 7.3 扫描对话框（repos.vue）

- 新增 "AI 研判 override" 折叠面板：
  - 开关（默认 = 仓库默认）
  - trigger 选择（默认 = 仓库默认）
- 当 Organization 未配 Key 时该面板禁用 + 提示

### 7.4 RunDetailDialog

- 在 run meta 区加 "AI 用量" section：
  - calls / inputTokens / outputTokens / totalTokens / estimatedCostUsd
  - 表格展示（PrimeVue DataTable）
- 当未启用 AI 时该 section 隐藏

### 7.5 alerts 视图

- alerts 列表加 "AI 评估" 列（Tag，ai-evaluated / ai-skipped）
- 点击行展开 AI 评估摘要（confidence / patch suggestion / breaking risks）

## 8. 安全性与治理

### 8.1 AI API Key 加密

- 复用现有 `ENCRYPTION_KEY`（平台级密钥，与 GitHub PAT 凭据同源）
- AES-256-GCM 加密（与 `Credential.encryptedToken` 一致）
- 仅在 `runScanInternal` 内存中解密，用后即弃
- 日志 / 错误信息脱敏（`maskSecrets` 工具）

### 8.2 AI 输出安全门

沿用 [architecture.md §AI 研判误判处理](./architecture.md)：

- AI 输出必须通过 `lint` / `typecheck` / `build`（现有 verification 阶段）
- PR 不自动合并（与 [standards/index.md](../../standards/index.md) 一致）
- 置信度低于阈值仅输出建议（safety-gate.ts 已实施）
- limit patch 范围（防止大范围破坏性改动）

### 8.3 审计

- ScanRun 实体新增 `aiConfigSnapshot` 列（JSON），记录本次扫描实际使用的 AI 配置（脱敏 apiKey）
- aiUsage 数据持久化（保留在 run-result.summary 中，便于 run-history 视图聚合）
- 操作日志（AuditEvent）记录 PATCH / POST ai-config 端点的写操作

### 8.4 凭据最小化

- AI Key 仅传给 engine 层（不写入前端响应）
- 日志 / 错误响应 maskSecrets
- API 测试端点（`/api/e2e/fixtures`）不允许访问 ai-config

## 9. 验收标准

### 9.1 P0 落地验收

- Organization 创建 + API Key 配置 + 加密落库 + 解密读取链路跑通
- 单仓库 aiEnabled=true 时扫描触发 AI 研判（实际调用 deepseek API）
- 单仓库 aiEnabled=false 时扫描不触发 AI 研判（即使 Organization 配置了 Key）
- 运行时 override（aiEnabled / aiTrigger）按合并优先级生效
- ScanRun.aiConfigSnapshot 字段记录实际配置
- 三执行器（container / sandbox / github-action）一致透传 ai 字段
- 4 个 API 端点通过 contract test
- 数据库 migration（同步 + 增量）跑通

### 9.2 P1 增强验收

- Organization AI 配置 UI 完成（4 个表单字段 + Key 输入 + 测试连接）
- 仓库 AI 配置 UI 完成（开关 + trigger）
- 扫描对话框 AI override 面板完成
- RunDetailDialog AI 用量展示完成
- alerts 视图 AI 评估列完成
- zh-CN + en-US i18n 完成（`ai.*` 命名空间）

### 9.3 治理验收

- AI Key 加密（参考 Credential 凭据治理 audit）
- 审计日志（AuditEvent）记录
- maskSecrets 在 logs / error 响应中验证
- PR 不自动合并（依赖 verification 阶段保证）
- 文档同步更新（architecture.md / standards/index.md）

## 10. 上收触发条件（何时纳入 [todo.md](../../plan/todo.md) 当前阶段）

任一条件触发时，从 backlog 上收到 todo.md §当前阶段：

1. 用户实测反馈需要管理平台触发 AI 研判（典型场景：组织内多人协作希望统一管理 Key）
2. 公开部署（docker 一键部署）后用户配置 AI 研判门槛太高（CLI 用户少，希望面板化）
3. M7.2 平台能力深化阶段（M28+ 候选阶段）启动时
4. 与 C66 告警视图增强联动（M28 阶段合并实施）
5. 用户明确触发上收

## 11. 关键决策回顾

（待用户上收阶段时填充）

- AI Key 挂载层级：Organization + 单仓库开关（vs Repository 级 vs 全局 platform.config vs Credential 复用）
- 三执行器一致性：container / sandbox / github-action 同步补齐（vs 仅 container 先落地）
- API Key 加密策略：与 Credential.encryptedToken 同源 AES-256-GCM（vs 单独加密层）
- 合并优先级：API override > Repository 默认 > Organization 共享（vs Repository 完全 override）
- ScanRun.aiConfigSnapshot 字段：记录实际使用配置便于审计（vs 不记录仅回写 logs）

## 12. 关联文档

- [architecture.md](./architecture.md) — §AI 研判误判处理（治理基线）
- [sandbox-security-governance.md](./sandbox-security-governance.md) — §A 合法包被投毒 / §C 修复 PR 合入后投毒（AI 研判在供应链防护链路的角色）
- [platform-auth-users.md](./platform-auth-users.md) — Organization 实体已落地（M7.1），AI 字段扩展直接基于此
- [platform-scheduled-batch.md](./platform-scheduled-batch.md) — 定时扫描链路，AI 研判可在调度时统一应用
- [standards/index.md](../../standards/index.md) —"AI 研判相关功能默认不自动合并，仅创建分支/PR 待人工审核"
- [experience-archive.md](./experience-archive.md) — 经验沉淀（AI 研判相关条目将持续追加）
- [backlog.md](../../plan/backlog.md) — 候选条目登记
- [roadmap.md](../../plan/roadmap.md) — M7.2 平台能力深化阶段的远期候选

## 13. 文档元数据

- **设计先行稿创建时间**：2026-09-08
- **触发**：用户调研"如何在 apps/platform 中补充 AI 研判"
- **关联阶段**：未上收（仅挂 backlog）；候选阶段为 M28+（与 C66 / M7.2 联动）
- **审计依据**：本文档作为 P0 落地的设计依据，未走 A 阶段 audit（与 design docs 治理惯例一致）
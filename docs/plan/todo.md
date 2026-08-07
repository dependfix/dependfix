# 当前阶段任务（M5）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）/ M3（Code Scanning 扩展）/ M4（多仓库治理增强）/ M4.5（跨线升级显式授权）/ M4.6（Monorepo 成员级修复增强）已完成，归档见 [todo-archive.md](todo-archive.md)。
> **M4.6（2026-08-07）**：T406/T407 成员级直接依赖升级交付（`7fb264e3`），Review Gate 三审 PASS，755 tests。
> **M5（AI Breaking Change 研判）为本期任务（2026-08-07 启动规划，4 项决策已确认）**：T501-T505 详见下文。

---

## M5: AI Breaking Change 研判

**目标**: 引入 AI 能力，对依赖升级后的不兼容问题（breaking change）进行自动研判，生成修复方案并通过 PR 提交；AI 输出必须经过安全校验与质量门才能落地。

**范围与依赖**:

- 主链路（串行）：T501（Changelog 采集）→ T502（AI 研判）→ T503（修复生成）→ T504（安全质量门）
- 平台化前置（独立）：T505（CLI 解耦重构，M6 平台复用编排核心）
- 复用基础：T105（upgradeDependency）、T107（verifyProject）、T210（PR 链路/指纹）、verification-runner、`FixAction` 报告模型、C13（app/helpers ↔ cli/helpers 循环依赖，T505 一并处理）
- **安全基线**：AI 输出视为外部输入——prompt 注入防护（system prompt 硬编码，用户可控内容仅作数据注入）、输出 schema 校验、patch 范围限制、质量门（lint/typecheck）通过才可提交

**建议执行顺序**: T501 → T502 → T503 → T504（主链路）；T505 可与主链路并行或收尾（平台化前置，依赖 T109 概念对齐）

### 规划决策（2026-08-07 已确认，用户确认内容）

- [x] **决策 1：AI 提供商**——**OpenAI 兼容端点优先，同时支持 Anthropic**；DeepSeek 等通过指定端点（`--ai-base-url`）走 OpenAI 兼容协议。实现：轻量 fetch 封装（不引入 SDK），`AiProvider` 接口 + `OpenAICompatibleProvider` / `AnthropicProvider` + factory
- [x] **决策 2：触发时机**——**验证失败 + major 升级触发，可手动配置**。`--ai` 总开关（默认 false）开启后，默认在「升级验证失败 或 major 升级」时触发研判；`--ai-trigger` 可配（failure / major / all）
- [x] **决策 3：Token 来源与凭据安全**——CLI：`DEPENDFIX_AI_API_KEY` env（优先）/ `--ai-api-key`（警示：进程列表/shell history 泄露面，文档注明）；action：`ai-api-key` input（`secret: true`）；独立平台：M6 T602 统一凭据管理（AES-256-GCM）。**凭据泄露防护（用户要求考虑）**：① apiKey 不落盘（不进入 RunReportConfig / RunResult 序列化）② 日志与 AI 错误消息脱敏（`maskSecrets` 工具）③ action input 声明 secret ④ 文档警示 CLI 参数泄露面
- [x] **决策 4：成本默认关闭 + token 消耗展示**——AI 默认关闭（`--ai` opt-in，计费多为推算）；**每次 AI 调用记录 usage（input/output tokens）**，聚合展示：日志（每次调用）+ 报告（§AI 研判区块：调用次数 + token 消耗 + 可选成本估算——内置常见模型单价表，标注"估算仅供参考"）

### T501 实现 Changelog / Release Notes 采集

- **优先级**: P1
- **依赖**: 无（AI 链路入口）
- **状态**: 已完成（2026-08-07，Review Gate 复审 PASS，提交后回链）
- **交付物**: `packages/cli/src/ai/changelog-fetcher.ts`（npm registry + GitHub Release 双源）

**方案细化（2026-08-07 落盘）**:

- npm registry 无标准 changelog 端点 → **主路径 = packument 解析 repository 字段 → GitHub Release（octokit `repos.listReleases`）取 release body**；CHANGELOG.md 文件采集登记演进项
- 缓存：run 内 Map（packageName → changelog，避免同包多告警重复拉取）
- 非 npm 源（git/workspace 依赖）→ 无 registry 元数据 → 返回 null + 原因（上层跳过 AI 研判）

**任务内容**:

- [x] npm registry 源：packument 拉取（含 repository 字段解析 owner/repo）
- [x] GitHub Release 源：octokit `repos.listReleases` 拉取 release body（含 breaking changes 段落）
- [x] markdown 解析：提取 breaking changes 条目（`Breaking changes` / `⚠️` / `Migration` / `BREAKING CHANGE` 等段落启发式）
- [x] run 内缓存（同包多告警不重复请求，单测断言请求次数）
- [x] 失败降级：源不可达 / 包不在 registry / 无 repo → null + 原因，上层跳过 AI（不静默）

**完成定义**:

- [x] 给定包名 + 版本范围能获取 changelog 并提取 breaking 条目
- [x] 缓存命中不重复请求（单测断言请求次数）
- [x] 双源失败降级路径可测试

**非目标**: 完整 changelog 语义解析（首版启发式提取）；CHANGELOG.md 文件采集（演进项）；多语言 changelog 模板适配

**测试方案**: mock octokit + registry 响应；markdown 解析矩阵（breaking 段落变体）；缓存幂等；降级路径

### T502 实现 AI 研判引擎

- **优先级**: P1
- **依赖**: T501、T107
- **状态**: 未开始
- **交付物**: `packages/cli/src/ai/`（provider / prompt / schema / usage / secrets）

**方案细化（2026-08-07 落盘）**:

- **`AiProvider` 接口**：`chat({ system, messages, maxTokens, temperature }) → { text, usage }`；`OpenAICompatibleProvider`（baseURL + apiKey + model，`/chat/completions`；DeepSeek 等指定 baseURL 兼容）与 `AnthropicProvider`（`/v1/messages`，x-api-key + anthropic-version header）；工厂按 `--ai-provider` 创建
- **凭据安全**：apiKey 仅运行时持有，不进报告序列化；`maskSecrets` 对日志/错误脱敏（决策 3）
- **输出 schema（Zod）**：结构化修改而非 raw diff——`classification`（code-change / version-lock / wait-upstream / manual）+ `summary` + `changes: [{ filePath, replace: [{ search, replace }] }]` + `confidence` + `rationale`（结构化让 T503 应用可控、T504 可校验）
- **上下文构建**：changelog（超限取首尾截断）+ 失败日志（tail）+ 受影响文件片段；system prompt 硬编码（决策 2 安全基线）
- **校验重试**：schema 校验失败重试 1 次 → 降级建议模式（记录原因，可审计）
- **usage 记录**：provider 返回 token 用量 → 聚合（决策 4）

**任务内容**:

- [ ] `AiProvider` 接口 + OpenAI 兼容实现 + Anthropic 实现 + factory（fetch 封装，无 SDK）
- [ ] system prompt 硬编码（不接受用户输入）；用户可控内容仅作 data 注入——prompt 注入防护
- [ ] 研判上下文构建：changelog + 升级失败日志 + 受影响文件（截断控制）
- [ ] 结构化输出 schema（Zod：classification / summary / changes / confidence / rationale），校验失败重试一次 → 降级建议模式
- [ ] token 用量聚合（input/output/calls）+ 日志输出每次调用消耗 + 可选成本估算（内置单价表，标注推算）
- [ ] `maskSecrets` 脱敏工具（日志/错误消息）

**完成定义**:

- [ ] 给定升级失败上下文，AI 输出符合 schema 的结构化研判
- [ ] 非法输出可检测（schema 校验失败 → 重试 → 降级），不静默
- [ ] 无 AI token 配置时链路清晰失败（提示配置），不产生费用
- [ ] apiKey 不进报告/日志（脱敏单测）

**非目标**: AI 训练/微调；多轮对话交互；供应商 failover 自动切换（首版单提供商失败即降级）

**测试方案**: mock provider 响应（合法/非法 schema）；prompt 注入样本（用户内容含指令不改变输出）；截断/超时路径；脱敏矩阵

### T503 实现修复方案生成器

- **优先级**: P1
- **依赖**: T502、T210
- **状态**: 未开始
- **交付物**: `packages/cli/src/ai/patch-applier.ts`

**方案细化（2026-08-07 落盘）**:

- **结构化 patch 应用**（非 raw diff）：`changes[].replace[]` 的 search 精确匹配（search 唯一性校验，不唯一 → 失败回退），replace 替换；应用前快照（`snapshotTrackedFiles` + 新文件登记），失败回滚
- 按 classification 分流：`code-change` → patch 应用 → T504 质量门；`version-lock` → 复用 override 机制生成锁定；`wait-upstream` → 报告建议区块；`manual` → 建议区块
- PR 复用 T210 链路（指纹含 AI patch diff——`FixAction.diff` 字段）

**任务内容**:

- [ ] 结构化 changes 应用（search 精确匹配 + 唯一性校验；应用失败回退建议模式，不静默）
- [ ] 快照/回滚（复用 snapshotTrackedFiles；AI 修改文件 + 新增文件）
- [ ] 研判"锁定版本" → 版本锁定配置生成（复用 override 机制）
- [ ] 研判"等待上游" → 说明文档生成（报告建议区块）
- [ ] 变更提交为修复 PR（复用 T210 PR 链路与指纹去重，diff 入指纹）

**完成定义**:

- [ ] AI 研判结果稳定转换为可审查 PR（patch 应用成功路径）
- [ ] patch 应用失败可审计回退（计入 failed + 错误详情）
- [ ] 默认不自动合并 PR

**非目标**: 自动合并；多 PR 拆分策略（首版单 PR）；unified diff 解析（结构化修改优先）

**测试方案**: patch 应用成功/失败/冲突（search 不唯一）矩阵；锁定版本生成；等待上游文档输出；PR 链路 mock

### T504 AI 输出安全校验与质量门

- **优先级**: P1
- **依赖**: T503
- **状态**: 未开始
- **交付物**: `packages/cli/src/ai/safety-gate.ts`

**方案细化（2026-08-07 落盘）**:

- **完整验证链**（对齐 T405 跨线语义）：AI 修改面大，验证用 install+lint+build 完整验证而非 lint-only
- patch 范围 ≤5 文件；路径穿越复用 `resolveWithinWorkDir`；命令注入：patch 为结构化数据不执行 shell，但检查 scripts/命令字段危险模式；敏感信息泄露：patch 含 `sk-` / `ghp_` / private key 模式 → warn/拒绝
- 校验失败 → 回滚 + 记录原因回退建议模式（不提交坏 patch，可审计）

**任务内容**:

- [ ] AI 生成代码 lint / typecheck / build 校验（完整验证，复用 verification-runner）
- [ ] 校验失败 → 记录原因回退建议模式（不提交坏 patch）
- [ ] patch 影响范围限制（最多 5 个文件；超限拒绝 + warn，可审计）
- [ ] AI 输出视为外部输入：路径穿越（resolveWithinWorkDir）/ 命令注入 / 敏感信息泄露检查

**完成定义**:

- [ ] AI patch 通过质量门才能提交 PR；不通过可审计回退
- [ ] 恶意/异常 patch 样本被拒绝（安全单测）

**非目标**: LLM 输出语义级安全证明（质量门为实用防线，非形式化验证）

**测试方案**: 恶意 patch 样本（路径穿越/命令注入/敏感信息）拒绝矩阵；范围超限；完整验证失败回退

### T505 CLI 解耦重构（平台化前置）

- **优先级**: P1
- **依赖**: C13 关联
- **状态**: 未开始
- **交付物**: `packages/cli/src/app/pipeline.ts`（`createPipeline(deps)` 抽象）

**任务内容**:

- [ ] `runCli()` 中 `process.env` / `console.log` 紧耦合抽离为可注入依赖（logger / config resolver / io）
- [ ] `createPipeline(deps)` 接口：local 与 platform 模式共用同一编排核心
- [ ] 处理 C13 循环依赖（app/helpers ↔ cli/helpers）

**完成定义**:

- [ ] 本地 CLI 模式行为不变（现状回归）
- [ ] platform 模式可通过注入不同 logger / config resolver 复用同一编排逻辑

**非目标**: M6 平台本体（数据库/认证/Web UI）

**测试方案**: 现有 CLI 全量回归 + pipeline 注入替身（mock logger/config）单测

## M5 完成判定（草案，方案细化后定稿）

- [ ] T501-T505 交付并通过 Review Gate
- [ ] 4 项规划决策已确认落盘
- [ ] `pnpm typecheck` + `pnpm lint` + 全量测试 + `pnpm build` 通过
- [ ] 本地 CLI 模式行为回归无损（T505）

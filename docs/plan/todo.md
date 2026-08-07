# 当前阶段任务（M5）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）/ M3（Code Scanning 扩展）/ M4（多仓库治理增强）/ M4.5（跨线升级显式授权）/ M4.6（Monorepo 成员级修复增强）已完成，归档见 [todo-archive.md](todo-archive.md)。
> **M4.6（2026-08-07）**：T406/T407 成员级直接依赖升级交付（`7fb264e3`），Review Gate 三审 PASS，755 tests。
> **M5（AI Breaking Change 研判）为本期任务（2026-08-07 启动规划）**：T501-T505 详见下文，方案细化前需确认 4 项决策。

---

## M5: AI Breaking Change 研判

**目标**: 引入 AI 能力，对依赖升级后的不兼容问题（breaking change）进行自动研判，生成修复方案并通过 PR 提交；AI 输出必须经过安全校验与质量门才能落地。

**范围与依赖**:

- 主链路（串行）：T501（Changelog 采集）→ T502（AI 研判）→ T503（修复生成）→ T504（安全质量门）
- 平台化前置（独立）：T505（CLI 解耦重构，M6 平台复用编排核心）
- 复用基础：T105（upgradeDependency）、T107（verifyProject）、T210（PR 链路/指纹）、verification-runner、`FixAction` 报告模型、C13（app/helpers ↔ cli/helpers 循环依赖，T505 一并处理）
- **安全基线**：AI 输出视为外部输入——prompt 注入防护（system prompt 硬编码，用户可控内容仅作数据注入）、输出 schema 校验、patch 范围限制、质量门（lint/typecheck）通过才可提交

**建议执行顺序**: T501 → T502 → T503 → T504（主链路）；T505 可与主链路并行或收尾（平台化前置，依赖 T109 概念对齐）

### 规划待确认决策（2026-08-07 启动，方案细化前需用户确认）

- [ ] **决策 1：AI 提供商与默认模型**——OpenAI 兼容端点（DeepSeek / 通义等，国内可达）优先还是 OpenAI/Anthropic 原生？默认提供商与模型？（影响 T502 adapter 设计与成本）
- [ ] **决策 2：AI 研判触发时机**——仅"升级验证失败后"自动触发（省成本）？还是 major 升级都研判？建议：验证失败 + major 升级触发，可配置
- [ ] **决策 3：Token 来源与配置通道**——CLI env / config + action input（用户显式提供）？与 M6 平台凭据管理（AES-256-GCM 加密存储）如何衔接？（对齐 G2 双 token 模式）
- [ ] **决策 4：成本控制默认值**——AI 默认关闭（opt-in，--ai 显式开启）还是默认开启（opt-out）？涉及费用，建议默认关闭 + 文档明示计费风险

### T501 实现 Changelog / Release Notes 采集

- **优先级**: P1
- **依赖**: 无（AI 链路入口）
- **状态**: 未开始
- **交付物**: `packages/cli/src/ai/changelog-fetcher.ts`（npm registry + GitHub Release 双源）

**任务内容**:

- [ ] npm registry 源：packument 拉取（含 repository 指向）；GitHub Release 源：octokit `repos.listReleases`（按包名解析 repo）
- [ ] markdown changelog 解析：提取 breaking changes 条目（`Breaking changes` / `⚠️` / `Migration` 等段落启发式）
- [ ] 缓存：同 run 内内存缓存 + 磁盘缓存（避免重复拉取与 token 面）
- [ ] 失败降级：源不可达 → 跳过 AI 研判，退化为现状人工处理（不静默）

**完成定义**:

- [ ] 给定包名 + 版本范围能获取 changelog 并提取 breaking 条目
- [ ] 缓存命中不重复请求（单测断言请求次数）
- [ ] 双源失败降级路径可测试

**非目标**: 完整 changelog 语义解析（首版启发式提取）；多语言 changelog 模板适配

**测试方案**: mock octokit + registry 响应；markdown 解析矩阵（breaking 段落变体）；缓存幂等；降级路径

### T502 实现 AI 研判引擎

- **优先级**: P1
- **依赖**: T501、T107
- **状态**: 未开始
- **交付物**: `packages/cli/src/ai/`（provider adapter / prompt 模板 / 输出 schema）

**任务内容**:

- [ ] 多 AI 提供商抽象：`AiProvider` 接口（OpenAI 兼容优先 + Anthropic；DeepSeek 等走 OpenAI 兼容）
- [ ] system prompt 硬编码（不接受用户输入）；用户可控内容（changelog / CI 失败日志 / 受影响文件 diff）仅作为 data 注入——prompt 注入防护
- [ ] 研判上下文构建：changelog + 升级失败日志（CI/验证失败 stderr）+ 受影响文件 diff（T503 patch 输入）
- [ ] 结构化输出 schema（Zod：问题分类 / 修复方案 / 代码 patch / 置信度），校验失败重试一次 → 降级建议模式
- [ ] token 成本控制：上下文截断（changelog 超限取首尾）、max_tokens 限制、超时

**完成定义**:

- [ ] 给定升级失败上下文，AI 输出符合 schema 的结构化研判
- [ ] 非法输出可检测（schema 校验失败 → 重试 → 降级），不静默
- [ ] 无 AI token 配置时链路清晰失败（提示配置），不产生费用

**非目标**: AI 训练/微调；多轮对话交互；供应商 failover 自动切换（首版单提供商失败即降级）

**测试方案**: mock provider 响应（合法/非法 schema）；prompt 注入样本（用户内容含指令不改变输出）；截断/超时路径

### T503 实现修复方案生成器

- **优先级**: P1
- **依赖**: T502、T210
- **状态**: 未开始
- **交付物**: `packages/cli/src/ai/patch-applier.ts`

**任务内容**:

- [ ] AI 生成 patch 应用（文件定位 + 上下文匹配；应用失败回退建议模式，不静默）
- [ ] 研判"锁定版本" → 版本锁定配置生成（复用 override 机制）
- [ ] 研判"等待上游" → 说明文档生成（报告建议区块）
- [ ] 变更提交为修复 PR（复用 T210 PR 链路与指纹去重）

**完成定义**:

- [ ] AI 研判结果稳定转换为可审查 PR（patch 应用成功路径）
- [ ] patch 应用失败可审计回退（计入 failed + 错误详情）
- [ ] 默认不自动合并 PR

**非目标**: 自动合并；多 PR 拆分策略（首版单 PR）

**测试方案**: patch 应用成功/失败/冲突矩阵；锁定版本生成；等待上游文档输出；PR 链路 mock

### T504 AI 输出安全校验与质量门

- **优先级**: P1
- **依赖**: T503
- **状态**: 未开始
- **交付物**: `packages/cli/src/ai/safety-gate.ts`

**任务内容**:

- [ ] AI 生成代码 lint / typecheck 校验（复用 verification-runner）
- [ ] 校验失败 → 记录原因回退建议模式（不提交坏 patch）
- [ ] patch 影响范围限制（最多 5 个文件；超限拒绝 + warn，可审计）
- [ ] AI 输出视为外部输入：路径穿越（resolveWithinWorkDir）/ 命令注入 / 敏感信息泄露检查

**完成定义**:

- [ ] AI patch 通过质量门才能提交 PR；不通过可审计回退
- [ ] 恶意/异常 patch 样本被拒绝（安全单测）

**非目标**: LLM 输出语义级安全证明（质量门为实用防线，非形式化验证）

**测试方案**: 恶意 patch 样本（路径穿越/命令注入）拒绝矩阵；范围超限；lint/typecheck 失败回退

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

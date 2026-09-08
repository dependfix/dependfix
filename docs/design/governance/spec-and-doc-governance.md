# 规范与文档治理设计（spec-and-doc-governance）

> **状态**：专项设计先行稿（2026-09-09 落地）
> **范围**：`docs/standards/` / `docs/design/` / `docs/plan/` 三类文档的治理边界、写作规范与维护规则
> **目标**：消除当前规范文件膨胀（ai-collaboration 448 行 / development 447 行 / platform 350 行 / planning 242 行）+ 调研/归档混杂 + modules/governance 边界模糊等问题，建立可审计的文档治理基线

## 1. 背景与问题

### 1.1 背景

依赖项目的快速迭代（M0-M25 共 25 个阶段），三类核心文档持续膨胀且未做治理：

| 维度 | 现状 | 阈值（health/warning/split）|
|---|---|---|
| `docs/standards/ai-collaboration.md` | 448 行 | 200 / 400 / > 400 |
| `docs/standards/development.md` | 447 行 | 200 / 400 / > 400 |
| `docs/standards/platform.md` | 350 行 | 200 / 400 / > 400 |
| `docs/standards/planning.md` | 242 行 | 200 / 400 / > 400 |
| `docs/standards/security.md` | 229 行 | 200 / 400 / > 400 |
| `docs/standards/testing.md` | 176 行 | 200 / 400 / > 400 |
| `docs/plan/roadmap.md` | 347 行 | 800 / 900 / > 900（已超 warning）|
| `docs/plan/todo-archive.md` | 1963 行 | 500 / 700 / > 700（已超 split）|
| `docs/plan/backlog.md` | 372 行 | 500 / 700 / > 700 |
| `docs/design/governance/experience-archive.md` | 1664 行 | 500 / 700 / > 700（已超 split）|

### 1.2 三类主要问题

**问题 A：规范文件混入"为什么/教训/经验"**

- `docs/standards/` 规范本应只写"做什么 / 不做什么"（执行边界），但 development.md §5.1.x 21 个子节、ai-collaboration.md §4.x PDTFC+ 实战教训、planning.md §4.4 实战案例 11 条等都是"为什么 + 教训 + 实证"型内容
- 多个文件同时引用同一个教训（如 e2e + i18n + monorepo rebuild 教训同时出现在 ai-collaboration.md §4.4、development.md §5.1.5、testing.md §6.x、experience-archive.md §三十九），双点维护漂移
- 用户指令："规范不需要写为什么，规范只需要写怎么做；如果确实有需要补充信息的内容，应当以链接形式引用"

**问题 B：plan/ 文档结构与标题层级混乱**

- `roadmap.md` 表格列单元格过长（行 24 M14 描述含 15 项子任务完整列表），单元格成为"微型 todo 列表"
- todo-archive.md 章节交叉引用（`M18` / `M20` / `M21` 等 §锚点）散落仓库各处，未形成统一锚点规范
- 用户指令："不得删除信息"——本治理是结构整理，不是信息删减

**问题 C：设计文档架构边界模糊**

- `docs/design/packages/` 2026-09-08 commit `cb08561` 已重命名为 `docs/design/modules/`，但 7 处仓库内引用（AGENTS.md / governance/index.md / documentation.md / session-wisdom-distillation.md / docs-and-readme-i18n.md / ai-development.md）未同步
- modules/ 与 governance/ 的分流依据不明确：什么文档放 modules/？什么放 governance/？缺少硬阈值（"改动 > 10 文件 / 800 行必须有专项设计文档" 用户已给出但未落地）
- `experience-archive.md` 1664 行 57+ §，单文件持续追加模式已达健康阈值上限

### 1.3 目标

1. 规范文件瘦身：将"为什么/教训/经验"剥离到 governance/experience-archive.md，standards/*.md 仅保留"做什么 / 不做什么"执行边界 + 一行外链引用
2. plan/ 结构治理：roadmap.md 表格化（每 milestone 单字段 ≤ 200 字）+ todo-archive.md 章节锚点体系补强 + 完整信息不丢失
3. 设计文档架构定型：modules/ vs governance/ 分流依据 + 硬阈值规则 + experience-archive.md 分片（按内容逻辑/关联性）
4. 治理定义改动可审计：建立 audit-required 触发判定 + commit 时 audit-gate 检查

### 1.4 不做的事

- 不删减任何已闭环阶段归档信息（"不得删除信息"用户指令）
- 不重写历史归档（todo-archive.md 已闭环阶段正文保持原文）
- 不调整 docs/research 已确认保留的 3 个文档（2026-07-26-competitive-research / 2026-08-02-release-tools-comparison / 2026-08-07-momei-platform-reference）
- 不修改 docs/standards 的事实权威（单点声明原则保留：每条规则只完整声明一次）

## 2. 文档分类与分流规则

### 2.1 三类核心文档分类

| 类别 | 目录 | 职责 | 写作规范 |
|---|---|---|---|
| **规范（standards）** | `docs/standards/*.md` | "做什么 / 不做什么"执行边界 + 一行外链引用 | 仅写规则本身，不写为什么/教训/经验 |
| **设计（design）** | `docs/design/modules/*.md` + `docs/design/governance/*.md` | 模块设计 / 专项设计 / 治理边界 / 重大变更 | 设计意图 + 接口契约 + 决策依据（可写"为什么这样做"，但需与"如何做"分离）|
| **规划（plan）** | `docs/plan/*.md` | 路线图 / 当前待办 / 已闭环归档 / 积压候选 | 状态驱动（待办/已闭环/延期/远期），按事实源 4 类严格分流 |

### 2.2 modules/ vs governance/ 分流依据

| 分流依据 | `modules/` | `governance/` |
|---|---|---|
| **文档对象** | 单个 monorepo workspace 包（`packages/core`、`packages/engine`、`packages/cli`、`packages/mcp`、`packages/skills`、`apps/platform`） | 跨模块 / 跨包 / 平台级 / 治理级 / 重大变更 |
| **文档数量** | 1 包 = 1 个模块文档 | 1 主题 = 1 个治理文档（不按包拆分）|
| **职责** | 当前已实现或正在实现的稳定模块总设计 | 专项设计 / 评估报告 / 治理边界 / 迁移方案 / 经验归档 |
| **状态字段** | `✅ 已落地` + 修订时间戳 | `✅ 已落地` / `🔶 设计中` / `🔶 设计先行稿（backlog 候选）` / `✅ 持续追加` |
| **重命名触发** | 跟随 monorepo 包重命名（如 `packages/` → `modules/`） | 不跟随包重命名，治理文档独立存续 |

**典型示例**：

- `modules/data-model.md`（标准化告警/配置/报告模型）—— modules/ 因为这是单一模块（packages/core）模型
- `modules/github-client.md`（GitHub client 封装）—— modules/ 因为这是单一模块（packages/engine/github）
- `governance/architecture.md`（整体架构）—— governance/ 因为跨包架构
- `governance/security.md`（安全治理）—— governance/ 因为跨模块安全决策
- `governance/experience-archive.md`（经验归档）—— governance/ 因为跨模块跨阶段的经验沉淀

### 2.3 文档健康窗口（统一阈值表）

> 与 `documentation.md §3` 一致，本表作为项目级权威阈值引用源。

| 文档类型 | 健康窗口 | warning 触发 | 强制分片 |
|---|:---:|:---:|:---:|
| `docs/standards/*.md`（规范）| ≤ 200 行 | 201-400 | > 400 行 |
| `docs/design/modules/*.md`（模块设计）| ≤ 300 行 | 301-500 | > 500 行 |
| `docs/design/governance/*.md`（治理）| ≤ 400 行 | 401-700 | > 700 行 |
| `docs/plan/roadmap.md`（路线图）| ≤ 800 行 | 801-900 | > 900 行 |
| `docs/plan/todo.md`（当前阶段）| ≤ 500 行 | 501-600 | > 600 行 |
| `docs/plan/todo-archive.md`（归档主窗口）| ≤ 500 行 | 501-700 | > 700 行 |
| `docs/plan/backlog.md`（积压）| ≤ 500 行 | 501-700 | > 700 行 |
| `docs/research/*.md`（调研）| ≤ 500 行 | 501-800 | > 800 行 |
| `docs/guide/*.md`（使用指南）| ≤ 500 行 | 501-800 | > 800 行 |

**强制分片执行规则**：超阈值文档必须按内容逻辑拆分（如 todo-archive.md 按阶段分片 → `archive/todo-archive-phases-m{xx}.md`；experience-archive.md 按章节分片 → `experience-archive-§{xx}-{slug}.md`），主文档保留近线窗口 + 索引入口。分片方案参见 §4。

### 2.4 设计文档硬阈值（hard requirement）

> **本条是设计文档强制要求的唯一权威声明**。其他文档 / skill / agent 定义仅作一行引用。

**适用范围**（仅以下 4 类改动触发本硬阈值，普通功能改动不触发）：

- **专项设计**：重大功能预研 / 架构调整 / 跨包契约重写
- **专项治理**：治理决策落地 / 经验沉淀 / 文档治理批次
- **重大变更设计**：breaking change / 数据迁移 / 协议变更
- **新增模块**：新 monorepo 包 / 新平台子系统 / 新核心抽象层

**不适用范围**：bug fix / 小优化 / 体验调整 / 文档措辞 / 测试补强 / 配置调整 / 依赖升级 / 现有模块功能扩展。

**硬阈值规则**（仅适用范围内的改动需满足）：

- **改动预计 > 10 文件 / > 800 行** → **必须有**专项设计文档（`docs/design/governance/<slug>.md`）+ A 阶段 `code-auditor deep depth` 审计
- **跨 ≥ 2 个独立模块的代码改动** → **必须有**专项设计文档（不论规模）

**审计 depth 映射**（与 [AI 协作规范 §1.3 分级审计执行协议](../../standards/ai-collaboration.md) 对齐）：

| 适用范围内改动规模 | 审计 depth |
|---|---|
| 1-5 文件 / < 350 行 | quick |
| 6-10 文件 / 351-800 行 | standard |
| > 10 文件 / > 800 行 / 跨 ≥ 2 模块 | deep |

**执行挂接**：A 阶段 code-auditor 主责边界挂载"设计文档硬阈值必查"必查项（`.github/agents/code-auditor.agent.md`）；违规即 Reject 退回。

## 3. 写作规范

### 3.1 规范文档（standards）写作原则

**核心约束**：规范**只写"做什么 / 不做什么"**，**不写**"为什么 / 教训 / 经验"。

| 应当写 | 不应当写 |
|---|---|
| 规则本身（must / should / may）| 教训（"M22.4 因打包 3 类改动被 Reject..."）|
| 简短理由（1-2 句）| 长段实证（"详见 commit `daa255c`..."）|
| 一行外链引用（指向 experience-archive / 治理文档）| 重复抄写完整教训段落 |
| 命令示例（最小可执行）| 命令执行历史（"M13.1 跑了 pnpm dist..."）|
| 表格化约束（结构清晰）| 表格化实证（带 commit hash / 行号）|

**外链引用模式**：

```markdown
## 5.1.15 集成外部库前必须读 README 标准用法（hard requirement）

集成任何外部库（`@octokit/*`、Vue 插件、TypeORM、Playwright、better-auth 等）前**必须**先查 README 官方示例。

**集成层测试不 mock 真实被集成库**。

教训见 [经验归档 §四十三](../design/governance/experience-archive.md#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试)。
```

**禁止写法**：

```markdown
## 5.1.15 集成外部库前必须读 README 标准用法（hard requirement）

...（长段内容）...
M18.4 audit round 1 Reject 实证：M18.1 commit 4 凭直觉写 `auth: createAppAuth(...)`（错误用法）+ ...
教训见 [经验归档 §四十三](../design/governance/experience-archive.md#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试)。
```

### 3.2 设计文档（design）写作原则

**模块设计（modules/）**：

- 描述模块的稳定接口契约、依赖方向、数据模型、关键算法
- 状态字段必填（`✅ 已落地` + 时间戳）
- 实现变更时同步更新模块文档

**专项设计（governance/）**：

- 描述跨模块的专项设计意图、决策依据、风险矩阵
- 状态字段必填（`✅ 已落地` / `🔶 设计中` / `🔶 设计先行稿（backlog 候选）`）
- 已无法对应当前实现的治理文档，应修正为治理 delta 文档或归档 / 删除

### 3.3 调研文档（research）写作原则

按 `documentation.md §5.1` 已落地规范：

- 文件名：`{YYYY-MM-DD}-{topic-slug}.md`（完成日期 + kebab-case 主题）
- 内容结构：摘要 + 关键事实 + 交叉验证 + 结论与建议
- 文档末尾注明去向（落地 / 保留 / 归档 / 删除）
- 同主题多版本追加 `-v{n}` 后缀

**价值评估**（治理决策点）：

- **保留**：决策溯源价值（未来需要回答"为什么当时这么做"）—— 如 `2026-07-26-competitive-research.md`（M5 决策依据）
- **删除**：已被覆盖、价值已尽、用户决策已落 —— 如 `2026-06-01-cost-estimate.md`（已被 2026-07-26 调研覆盖）
- **归档**：暂不删除但不再引用 —— 进入 `docs/archive/`（当前暂无需求）

### 3.4 plan/ 文档写作原则

按 `documentation.md §7` 已落地规范：

- **四文档严格不重叠**：todo.md / todo-archive.md / backlog.md / roadmap.md 任何条目只能出现在唯一一个文档
- **roadmap.md 表格化约束**：每 milestone 单字段 ≤ 200 字，详细描述全部指向 todo-archive 锚点
- **反模式禁令**：todo.md 顶部 banner 不写已闭环摘要 / commit 序列 / ahead 数

## 4. 文档分片规则

### 4.1 触发条件

按 §2.3 健康窗口表，触发"强制分片"行的文档必须分片。

### 4.2 todo-archive.md 分片

按阶段分片（已有规则）：

- 主窗口 `todo-archive.md`：保留最近 3-5 阶段
- 分片 `archive/todo-archive-phases-m{xx}.md`：早期阶段按阶段边界分片
- 跨阶段合并分片：`archive/todo-archive-phases-m{xx}-m{yy}.md`（如 m0-m1、m14-m15、m16-m17）

### 4.3 experience-archive.md 分片（新增）

按内容逻辑/关联性分片（用户指令）：

- 主窗口 `experience-archive.md`：保留**准入标准 + 当前最近 N 章**（如最近 5-10 章）
- 分片 `experience-archive-§{xx}-{slug}.md`：早期章节按主题聚合分片
- 分片命名建议：
  - `experience-archive-§16-§18-spec-compliance.md`（编号标记违规相关 3 章）
  - `experience-archive-§22-§23-§38-ci-environment.md`（CI 环境链式失败相关 3 章）
  - `experience-archive-§24-§25-pnpm-monorepo.md`（monorepo 拆包 / 提交粒度 2 章）
  - `experience-archive-§30-§31-typeorm-bullmq.md`（集成层三坑 2 章）
  - `experience-archive-§45-§48-§49-archive-batch.md`（归档批次教训 3 章）
  - `experience-archive-§50-§52-sqlite-e2e.md`（SQLite 防护 + e2e 失败模式 3 章）
  - 其他未分组章节保留在主窗口

**分片流程**：

1. 提取目标章节 + 维护原 §编号（不重新编号，跨文件唯一）
2. 主窗口更新"目录"段，链向分片
3. 跨分片外链追踪（`rg -n "<删除段标题>"` 全仓库扫描所有外链）
4. commit 前实测 `pnpm run check:docs` exit 0

**硬性规则**：章节编号（§一、§十六 等）全局唯一，不重新编号；分片后章节归属以原标题为准，不变更。

### 4.4 roadmap.md 分片（可选）

如 roadmap.md 超阈值 800 行，按时间窗口分片（如 `roadmap-m0-m10.md` / `roadmap-m11-m25.md`），主窗口保留最近阶段 + 索引。当前 347 行暂未达阈值，本设计文档不强制分片。

## 5. 经验归档（experience-archive）维护规则

### 5.1 准入标准（已落地，见文件头）

教训条目进入 experience-archive.md 必须满足至少一条：

- 教训未落入规范（可执行方法论尚未迁移到 `docs/standards/` 或 skill/agent 定义）
- 决策需要溯源（产品/技术方向的关键决策，未来需回答"为什么当时这么做"）
- 重复违规预警（同一模式已违规 ≥ 2 次）
- 工具/环境陷阱（本地不可测、跨平台差异、工具默认值覆盖等）

### 5.2 章节结构（新增条目模板）

```markdown
## {N}、{一句话标题（不含 §编号，§编号由脚本自动维护）}（{YYYY-MM-DD}，{阶段或场景}）

**教训摘要**：1-2 句话精炼核心教训

**实证**：
- commit `{hash}`（{M阶段} {commit message}）
- 关联规范：[standards/xxx.md §Y](./xxx.md#section-id)

**与既有教训的关联**：{如果有}

**挂接治理检查点**：{审查阶段是否已挂必查项}

**准入标准复核**：满足上述第 N 条准入标准
```

### 5.3 章节编号硬性规则

- 编号（§一、§十六 等）跨整个 experience-archive 全局唯一
- 已删除章节编号不重用（避免外链漂移）
- 新增章节取当前最大编号 + 1

## 6. 审计与合规

### 6.1 A 阶段 audit-required 触发判定（hard requirement）

改动涉及以下任一项 → A 阶段 `code-auditor` 审计**必须触发**：

- 治理定义改动（`docs/standards/*.md` / `docs/design/governance/*.md` / `.github/skills/*.md` / `.github/agents/*.md`）
- 设计文档硬阈值触发（按 §2.4）
- plan/ 文档结构改动（`docs/plan/*.md`）
- 跨 ≥ 2 个独立模块的代码改动

**审计必查项**（code-auditor 主责边界新增）：

- **设计文档硬阈值**：改动规模 > 10 文件 / > 800 行是否有对应 governance 文档？未走 → Reject
- **规范单点声明**：新规则仅在权威文档完整声明一次，其他文档/skill/agent 仅一行链接引用
- **跨文件 cross-reference 完整性**：新增 / 修改 / 迁出章节标题时，`rg -n "<标题>"` 全仓库扫描引用并同步更新
- **锚点格式正确性**：`pnpm run check:docs` 验证 0 error
- **外链实证**：所有 `docs/design/*.md` / `docs/standards/*.md` 中的 markdown 链接真实存在（不是凭印象）

### 6.2 commit 时 audit-gate 检查

按 [AI 协作规范 §2 PDTFC+ 工作流](../../standards/ai-collaboration.md#2-pdtfc-工作流) 已落地 F 阶段验证三件套（typecheck + lint + test）。本规范补强：

- **治理定义改动类 commit**：必须额外运行 `pnpm run check:docs` + `pnpm run lint:md`
- **设计文档硬阈值触发类 commit**：commit message 必须显式声明 governance 文档引用 + audit-depth

### 6.3 与既有规范的关系

- **§3 文档行数阈值**：[documentation.md §3](../../standards/documentation.md#3-文档行数阈值) 表为本规范的统一阈值表（§2.3）权威源
- **§4 事实源层次**：[documentation.md §4](../../standards/documentation.md#4-事实源层次) 单点声明原则
- **§5 设计文档分层**：[documentation.md §5](../../standards/documentation.md#5-设计文档分层) 给出 modules/governance 边界，本规范补强硬阈值
- **§7 plan/ 文档范围**：[documentation.md](../../standards/documentation.md) §7 给出四文档分流规则
- **§1.4 单次提交审计阈值**：[ai-collaboration.md §1.4](../../standards/ai-collaboration.md#14-单次提交审计阈值10-文件--800-行) commit 维度，本规范扩展到**任务/改动**维度
- **§2 PDTFC+ 工作流**：[ai-collaboration.md §2](../../standards/ai-collaboration.md#2-pdtfc-工作流) D 阶段自检 + A 阶段审计触发

## 7. 实施计划（治理批次 G1-G6）

| ID | 类型 | 内容 | 预估规模 | 实施前置 |
|---|---|---|---|---|
| **G1** | 🛡️ 治理前置 | 专项设计文档（本文档）+ documentation.md §5 补强 + 失效链接修正 | 6 文件 / ~400 行 | 本文档先行 |
| **G2** | 🛡️ 治理 | standards 瘦身（剥离 development.md §5.1.x + ai-collaboration.md 教训段 + planning.md §4.4 实战案例 → 外链引用）| 8 文件 / ~1200 行 → 净瘦 ~600 行 | G1 |
| **G3** | 🛡️ 治理 | plan 结构治理（roadmap 表格化 + todo-archive 锚点体系 + backlog 精简验证）| 3 文件 / ~600 行 → 净瘦 ~150 行 | G1 |
| **G4** | 🛡️ 治理 | 审计流程强制化（full-stack-master skill §4 改写 + code-auditor 必查项补强 + commit 时 audit-gate 脚本）| 4 文件 / ~250 行 | G1 |
| **G5** | 🧹 清理 | 无效文档清理（research 4 个 + archive 1 个 + experience-archive 按章节分片）| 9-12 文件 / ~250 行删除 + ~700 行分片 | G1 |
| **G6** | 🛡️ 治理 | AGENTS.md 完善（design 硬阈值 + 审计触发 + modules/governance 分流依据 + M\d+ 命名规范）| 1 文件 / ~80 行 | G1 |

**总规模**：~16 atomic commits / ~2780 行改动 / 净瘦 ~1100 行（standards + plan + research）+ 删除 ~250 行（research/archive）+ experience-archive 分片 ~700 行。

## 8. 修订历史

| 日期 | 修订内容 | 关联 commit |
|---|---|---|
| 2026-09-09 | 首版落地（治理批次 G1 P 阶段产出）| 见 commit history |

## 9. 相关文档

- [文档规范](../../standards/documentation.md)
- [AI 协作规范](../../standards/ai-collaboration.md)
- [规划规范](../../standards/planning.md)
- [经验归档](./experience-archive.md)（治理记录 + 实证教训）
- [AGENTS.md](../../../AGENTS.md)

> 本文档为 dependfix 项目文档治理的专项设计先行稿，落地后作为 G2-G6 批次的事实权威源；变更时必须同步更新 AGENTS.md 与 standards/documentation.md。
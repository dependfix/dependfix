# 规范与经验管理体系重构设计（standards-experience-refactor）

> **状态**：专项设计先行稿（2026-10-10）
> **范围**：`docs/standards/`（规范方法论层）/ 经验体系（experience-archive + wisdom + 评审检查点）/ 文档站导航分层 / 阈值与门禁
> **上游**：承接 [规范与文档治理设计](./spec-and-doc-governance.md) 的未竟部分——其 G1-G6（2026-09-09）落地后再次 drift；本文档为其 **v2 先行稿**，G 批次计划由本文 §4 承接
> **触发**：用户 2026-10-10 指令（规范去实现化 / 经验落点化 / 细节删减 / 遇错查询与复发收敛 / 对外对内文档分层）

## 1. 背景与问题（量化诊断）

### 1.1 实测现状（2026-10-10）

| 维度 | 实测 | 判定 |
|:--|:--|:--|
| 规范混入实现 / 教训 | `docs/standards/` 14 文件 3211 行（`wc -l` 口径）；`check:standards-redundant` 命中 166 处（经验 72 / 实证 59 / 教训 27 / 背景 8，跨 9 文件）；13 行类代码 + 113 处文件路径引用 + 12 处 commit hash | ❌ 违背"只写做什么 / 不做什么" |
| 规范超自身阈值 | 硬分片阈值 > 400 行，实超 3 个：`platform` 544 / `development` 512 / `ai-collaboration` 494 | ❌ 自身规则未执行 |
| 经验体系体量 | 7 文件 2409 行 / 68 节；单分片 `§49-§57` 1540 行 | ❌ 大归档极少被查阅 |
| 经验落点缺失 | `check:standards-redundant` 仅报告（`exit 0`）、CI 未接线；无行数阈值脚本；经验无"转脚本 / 检查点"的强制路径 | ❌ 无可执行落点 |
| 导航未分层 | VitePress 侧栏挂载 `design/governance/**`（6 篇设计稿）；首页卡片引导内部页 | ❌ 设计稿与用户指南同列 |
| 事实源矛盾 | [spec-and-doc-governance §2.3](./spec-and-doc-governance.md) 称"与 [documentation.md §3](../../standards/documentation.md) 一致"，后者阈值表**不含** standards / design | ❌ 双事实源漂移 |

### 1.2 根因（5-Why 收敛）

1. 为什么规范仍混入实现 / 教训？→ G2（standards 瘦身）只产出预扫描脚本、未转阻断。
2. 为什么未转阻断？→ 无"规则 → 门禁"的强制挂接路径，规则与执行分离。
3. 为什么经验越积越大？→ 准入标准"未落规范即保留"，但缺"复发即收敛为脚本 / 检查点"的退出路径。
4. 为什么阈值无人守？→ 阈值声明在两处且互相矛盾，且无脚本计量。
5. 为什么对外对内不分？→ 站点以"全量构建"为默认，导航层未做过受众切分。

**根因**：**有规则无门禁 → 必 drift**。重构的成败判据不是"文档写得多好"，而是"是否留下可自动执行或人工可判定的落点"。

## 2. 目标与非目标

### 2.1 目标

1. **规范方法论层化**：`docs/standards/*.md` 只保留"规则 + 通用方法 + 极少数项目个性化偏好 + 一行外链"，剥离具体代码实现与长段教训。
2. **经验三层收敛**：L1 自动门禁（脚本 + CI 阻断）/ L2 评审检查点（checklist / 必查项）/ L3 精简可搜索索引；删除偶发与一次性经验。
3. **经验应用机制闭环**：遇错先查 → 复发（≥ 2 次）必须收敛为 L1 或 L2。
4. **导航分层**：发布策略不变（文档仍公开），但**顶栏 / 侧栏不挂 `design/governance/**`（除 `architecture` + `governance/index` 目录页）与 `plan/archive/**`**，其余按需保留；首页同步调整。
5. **阈值与事实源唯一化**：`documentation.md §3` 为唯一阈值权威（补齐 standards / design 行）；行数阈值转脚本计量。

### 2.2 非目标 / 不做

- 不删除历史归档信息（`todo-archive.md` 等已闭环正文保持原文）。
- 不改变文档公开性（不做 `srcExclude` 物理隔离、不拆双站点）。
- 不重写已闭环阶段的规划 / 设计记录。
- 不修改 `docs/standards` 的事实权威（单点声明原则保留：每条规则只完整声明一次）。
- 不引入新工具链（复用既有 vitest / Playwright / node 脚本与既有 `scripts/*.mjs` 约定）。

## 3. 目标架构

### 3.1 规范方法论层（内容边界）

| 保留 | 剥离（迁往） |
|:--|:--|
| 规则本身（must / should / may）| 实现细节（类名 / SCSS 片段 / 结构化路径清单 / 行号）→ **代码注释**或**设计文档** |
| 通用方法论（可迁移到其他项目的做法）| 长段教训 / 实证 / 案例（> 2 句）→ **设计文档**或**经验索引 L3** |
| 极少数项目个性化偏好（如主色 teal-700、命名 kebab-case、私有约定）| commit hash / run ID 等溯源数据 → **经验索引 L3** 或**设计文档** |
| 一行外链（指向设计 / 经验 / 检查点）| 从零复述的第三方库用法 → **一行外链官方 README** |

**判定口径**：一段内容若"换一个项目就不成立"，属实现细节 → 迁出；若"换一个项目仍成立"，属方法论 → 保留。

**达标线**：单文件 ≤ 200 行（健康窗口）；201-400 warning；> 400 强制分片（阈值权威见 `documentation.md §3`；E 批补齐后本节收敛为纯指针）。

### 3.2 经验三层体系

| 层 | 形态 | 载体 | 保留判据 | 例 |
|:--|:--|:--|:--|:--|
| **L1 自动门禁** | 脚本 + CI 阻断 | `scripts/*.mjs` + `.github/workflows/*.yml` | 模式可机检 → 必须 L1 | 孤立编号 / 行尾 / 锚点 / 供应链审计 |
| **L2 评审检查点** | checklist / 必查项 | `.github/skills/code-reviewer/**` + `.github/agents/code-auditor.agent.md` | 需人工判定且有明确触发面 | TypeORM 索引 / 提交态自洽 / 规范单点声明 |
| **L3 经验索引** | 精简可搜索索引（按主题） | `docs/design/governance/experience-archive*.md`（收敛后） | 仅"未落规范 + 需溯源 + 重复 ≥ 2 + 环境陷阱"四者之一 | 依赖版本"超出模型记忆"的坑 |

**L3 保留准则修正**（对齐模型能力增强）：
- **留**：新版依赖超出模型记忆、导致旧知偏差的校正（如 pnpm 11 `allowBuilds` / better-auth 1.7 / reka-ui z-index 档位 / TypeORM 1.x 复合索引生成）。
- **删**：流程细枝末节、本项目自身历史失误的过程细节、纯环境噪音（无普适启示）、已完全内化且无溯源价值的一次性偶发。

### 3.3 经验应用机制

```
遇错 → L3 索引查询（避免重复） → 若复发（同一模式 ≥ 2 次） → 强制收敛为 L1（脚本）或 L2（检查点）
```

- 查询入口：L3 索引（关键词 / 主题）+ `check:*` 脚本失败信息（错误格式 `path:line:col: keyword - snippet`）。
- 收敛判据：同一模式第 2 次复现 → 本批必须产出 L1 或 L2 落点，否则该经验条目降级删除。
- 反模式：只追加经验条目而不留落点（正是本次 drift 成因）。

### 3.4 文档站导航分层

**发布策略不变**（`docs/**` 仍全量构建 / 公开可访问）——用户 2026-10-10 裁定：公开访问不是问题，且站点同时面向用户与开发者。**变更点在导航挂载范围**（用户 2026-10-10 二次收敛）：

| 处理 | 范围 | 理由 |
|:--|:--|:--|
| **不挂载**（确无必要） | `design/governance/**`（除 `architecture.md`）+ `plan/archive/**` | 设计稿可读性差 / 易过期 / 数量多；归档为历史记录，非导航对象 |
| **保留必要内容**（逐页判断） | `guide/**`、`standards/**`、`plan/**`（roadmap / todo / backlog）、`design/modules/**`、`research/*` | 不搞"一刀切"卸载；保留对外可读的入口 |

- **设计稿不挂侧栏**：`/design/governance/` 当前挂 6 篇 → 收敛为仅挂 `architecture` 概览 + `governance/index` 目录页。
- **首页（`docs/index.md`）同步调整**：按同一判定移除 / 改写指向非挂载页的卡片（如 `design/governance/security` / `mcp-server` 等），首页只引导对外可读入口；en 镜像 `docs/i18n/en-US/index.md` 同步。
- 保留 `ignoreDeadLinks` 语义：未挂载页面仍可从正文内链访问（开发者路径）。

### 3.5 阈值与事实源统一

- `documentation.md §3` 为**唯一阈值权威**，补齐 `docs/standards/*.md`（≤ 200 / 201-400 / > 400）与 `docs/design/**/*.md`（modules ≤ 300 / governance ≤ 400）行。
- `spec-and-doc-governance.md §2.3` 的重复阈值表**改为一行引用**（消除双事实源）。
- 阈值计量转脚本（见 §3.6）。

### 3.6 门禁落地

| 门禁 | 形态 | 接线 |
|:--|:--|:--|
| 规范冗余关键词 | `check:standards-redundant --strict` | CI Test job（报告 → 阻断） |
| 文档行数阈值 | 新增 `check:doc-size.mjs`（警告 / 超强制分片阈值阻断） | CI Test job |
| 经验落点 | 经验条目模板强制"挂接检查点"字段非空（L2 / L1 二选一） | `check:standards-redundant` 扩展或独立脚本 |

## 4. 分批计划（A-E）

> 编号 A-E 为**设计稿内部批次标识**（非 `M\d+` 阶段编号）；正式上收时由用户按 [规划规范 §3.1](../../standards/planning.md) 决策阶段编号与原子条目。

| ID | 类型 | 目标 | 范围 | 验收 | 依赖 |
|:--|:--|:--|:--|:--|:--|
| **A** | 📚 规范瘦身 | standards 去实现化、剥离教训 / 实证 | `docs/standards/*.md`（重点 platform / development / ai-collaboration，三超阈值文件）| `check:standards-redundant --strict` 归零；全部 ≤ 200 行（或已分片）；无代码片段 / commit hash | — |
| **B** | 🛠️ 经验重构 | 三层收敛 + 大幅精简 + L3 索引化 | `experience-archive*.md` + `session-wisdom-distillation.md` + `.session/wisdom.md` | 单分片 ≤ 400 行；删除偶发 / 一次性条目并留决策记录；L3 索引可搜索 | A（迁移目标就位）|
| **C** | 🛠️ 门禁落地 | 规则转可执行 | `scripts/check-standards-redundant.mjs`（--strict）+ 新增 doc-size 脚本 + `.github/workflows/test.yml` | CI 阻断生效（负例标定）；本地可复现 | A / B |
| **D** | 🎨 导航分层 | 站点导航受众切分 | `docs/.vitepress/config.ts`（nav / sidebar）+ `docs/index.md`（首页卡片）+ `docs/i18n/en-US/index.md` | 侧栏不挂 `design/governance/**`（除 `architecture` + `governance/index`）与 `plan/archive/**`；其余按需保留；首页仅引导对外可读入口；未挂载页仍可直链；docs:build 通过 | — |
| **E** | 🛡️ 治理同步 | 阈值 / 事实源唯一化 | `documentation.md §3` + `spec-and-doc-governance.md §2.3` + `AGENTS.md`（如需，**修改前需用户明确确认**）| 单一阈值权威；无重复阈值表 | A |

**执行顺序**：A → B → C（C 依赖 A/B 达标）并行 D / E；每批独立 commit + A 阶段审计（治理定义改动类）。

### 4.1 批次规模预估

- A：8-14 文件 / 净瘦 ~1200 行（standards 剥离）
- B：3-5 文件 / 净瘦 ~1200 行（经验收敛）
- C：3-4 文件 / ~250 行（脚本 + CI）
- D：2-3 文件 / ~80 行（config + 首页 zh / en）
- E：2-3 文件 / ~80 行（阈值表统一）

## 5. 验收标准（整体）

1. `check:standards-redundant --strict` 在 CI 阻断且本地归零。
2. 全部 `docs/standards/*.md` ≤ 200 行（或已分片至健康窗口）。
3. 经验体系单分片 ≤ 400 行；L3 索引条目均具备"四者之一"准入依据；无"只留条目、不留落点"。
4. 文档站侧栏不挂载 `design/governance/**`（`architecture` + `governance/index` 除外）与 `plan/archive/**`；首页（`docs/index.md` + en 镜像）不引导至非挂载页。
5. `documentation.md §3` 为唯一阈值权威，无第二处完整阈值表。
6. 全链 `lint` / `lint:md` / `check:docs` / `docs:build` / `check:orphan-ids` 通过。

## 6. 风险与反面验证

| 风险 | 反面验证 / 缓解 |
|:--|:--|
| **删过头**（剥离时丢失必要信息）| 逐文件核对"换项目是否成立"判定；被剥离内容迁入设计文档 / 检查点，非直接删除；A 阶段审计按 [规划规范 §4.4 第 9 条](../../standards/planning.md) 双向核验 |
| **信息丢失**（删除经验条目）| 删除前按"四者之一"复核；删除决定登记 `backlog` / 归档决策记录；保留 commit 历史可查 |
| **门禁误伤**（--strict 阻断既有 CI）| 先报告模式跑全量、确认命中均为真业务；负例标定（构造违规样本必须 exit 1） |
| **导航收敛致外链失效** | 未挂载页仍可直链访问；`check:docs` 全过；如需对外隐藏可后续评估 `noindex` |
| **门禁与规范二次漂移** | E 批统一事实源；C 批脚本计量阈值，规则与执行不再分离 |

## 7. 关键决策记录（用户 2026-10-10）

| # | 决策点 | 裁定 |
|:--|:--|:--|
| D1 | 推进形式 | 先出治理设计先行稿（本文档）→ 评审后按 A-E 分批执行 |
| D2 | 导航分层形态 | **仍发布，仅不进顶栏 / 侧栏**；不挂载范围**收敛为** `design/governance/**`（除 `architecture` + `governance/index`）+ `plan/archive/**`，其余按需保留；首页同步调整（2026-10-10 二次收敛）|
| D3 | 经验体系目标 | 三层收敛 + 大幅精简 |

## 8. 相关文档

- [规范与文档治理设计](./spec-and-doc-governance.md)（v1；其 G1-G6 由本文 §4 承接）
- [文档规范 §3 文档行数阈值](../../standards/documentation.md)（唯一阈值权威）
- [AI 协作规范 §1.5 沉淀工作流](../../standards/ai-collaboration.md)
- [Session Wisdom 蒸馏机制](./session-wisdom-distillation.md)
- [经验归档](./experience-archive.md)（L3 载体）
- [文档站 + 包 README 多语言实施设计](./docs-and-readme-i18n.md)（站点结构）

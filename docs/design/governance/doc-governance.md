# 文档治理执行规范（doc-governance）

> **状态**：✅ 已落地（2026-10-26 首版；M49 期间文档治理批次）
> **范围**：`docs/**` 与根 `README.md` 等长期维护文档的体量、结构、时效与归档治理
> **上游**：[文档规范](../../standards/documentation.md)（行数阈值与写作规则）、[规范与文档治理设计](./spec-and-doc-governance.md)（v1/v2 历史）
> **下游**：[documentation-specialist skill](../../../.github/skills/documentation-specialist/SKILL.md)（执行清单）、`scripts/check-doc-governance.mjs`（机检）

## 1. 为什么需要独立流程

文档治理不是「有空时整理一下」，而是一项有固定输入、判定规则、机检与审计落点的周期性工作。缺少流程时会出现三类可观测的退化：

| 退化 | 2026-10-26 实测基线 |
|:--|:--|
| **行数门禁假绿**：只按行数计量，长段落堆叠不被发现 | `development.md` 167 行（< 200 阈值）但 21,853 字符 / §5.1 单节 15,044 字符 / 55 条 |
| **规则不可验证**：规则数量超过审查面 | §5.1 55 条中仅 37 条挂 review 矩阵；18 条无触发面与检查动作 |
| **归档结构漂移**：窗口规则靠人工记忆 | `todo-archive.md` 40 个 H2、M 序号错位、索引与批次流水账双写；`archive/index.md` 161 行 / 117,474 字符 |

**目标**：把「文档该不该留、留在哪、怎么验证、谁来执行」变成可重复的流程，并让强制规则尽可能落到脚本或测试（L1），无法机检的落到带触发面的审查检查点（L2），其余降级为判例参考（Note），不再冒充规则。

## 2. 四条基本原则

1. **单一事实源**：同一条规则只在其职责归属的文档完整声明一次；其他位置只留一行指针（见 [文档规范 §4](../../standards/documentation.md#_4-事实源层次)）。
2. **无执行不立规**：新增严格约束必须同时给出触发面与执行方式（L1 脚本 / 测试 / CI，或 L2 review 检查点）；两者都给不出时，写入判例参考而非规范。
3. **归档只迁不删**：历史阶段正文、批次记录、决策依据一律迁移到 `docs/plan/archive/`，不得以「整理」为由删除；需要压缩时保留原文到归档并在索引中登记。
4. **生成物不进 docs**：CI 产物、回归摘要、审计工件写入 `artifacts/`（gitignored）；`docs/` 只保留需要长期阅读与评审的内容。

## 3. 文档分层与职责

| 层 | 路径 | 回答的问题 | 更新触发 | 权威性 |
|:--|:--|:--|:--|:--|
| L0 | `AGENTS.md` | AI 行为红线、角色矩阵 | 治理决策变更（需用户确认） | 最高 |
| L1 | `docs/standards/*.md` | 做什么 / 不做什么（可执行规则） | 规则新增、失效、机检落地 | 高 |
| L2 | `docs/design/{modules,governance}/*.md` | 为什么这样做 / 接口契约 / 判例 | 设计变更、规则迁移、批次复盘 | 中 |
| L3 | `docs/guide/*.md` | 用户如何使用 | 产品行为、配置、命令变更 | 中（对外） |
| L3 | `docs/plan/*.md` | 当前做什么 / 未做什么 / 已做什么 | 阶段启动、归档、候选变更 | 中（过程） |
| L4 | `docs/plan/archive/*.md` | 历史阶段正文与批次记录 | 只追加 / 迁移 | 低（追溯） |
| — | `docs/reports/**` | **不保留**：生成物迁入 `artifacts/` | — | — |

**边界**：`standards` 不写实现细节与长段教训；`design` 不重复声明规则；`plan` 不复制归档正文；`guide` 不承载内部治理规则。

## 4. 体量与密度预算

### 4.1 行数阈值

以 [文档规范 §3 文档行数阈值](../../standards/documentation.md#_3-文档行数阈值) 为唯一权威；`check-doc-size` 直接解析该表。本节不重复行数取值。

### 4.2 字符与密度预算

行数不足以约束长段落堆叠，因此对高密度文档追加字符与规则条数预算。`check-doc-governance` 解析本节表格，超出「阻断」列即 exit 1。

| 文档 | 健康字符 | 阻断字符 | 说明 |
|:--|:--:|:--:|:--|
| `docs/standards/*.md` | 24,000 | 30,000 | 规范只写规则；超限先压缩、再迁移细节 |
| `docs/plan/roadmap.md` | 25,000 | 35,000 | 里程碑概览；阶段详情一律入 archive |
| `docs/plan/todo-archive.md` | 8,000 | 12,000 | 只保留阶段索引 |
| `docs/plan/backlog.md` | 45,000 | 60,000 | 候选池；历史批次叙事不留在正文 |
| `docs/plan/archive/index.md` | 15,000 | 25,000 | 治理规则与基线；批次流水账入 `archive-log.md` |
| `docs/plan/archive/archive-log.md` | 200,000 | 260,000 | 追加型批次日志；存量历史迁入约 128k 字符（192k 字节），新增记录只允许一行（≤400 字符），超限按年份分片 |
| `docs/guide/*.md` | 45,000 | 60,000 | 使用指南；命令示例可执行 |

**规则条数预算**（仅对声明「规则表」的章节生效）：

| 文件 | 章节 | 健康条数 | 阻断条数 | 单条最大字符 |
|:--|:--|:--:|:--:|:--:|
| `docs/standards/development.md` | 工程实践规则 | 24 | 32 | 260 |

新增规则前先确认该章节还有预算位；超预算时按 §6 处置矩阵迁移旧规则，不得只缩字号。

### 4.3 归档结构不变量

`docs/plan/todo-archive.md` 是**索引**，不是正文：

1. 文件内不得出现 `## M\d+` 阶段正文标题；阶段正文一律位于 `docs/plan/archive/todo-archive-phases-*.md`。
2. 索引表必须覆盖 `archive/` 下全部阶段分片，且每个分片只出现一次。
3. 索引按阶段号**倒序**排列；合并分片按其中最大阶段号排序。
4. 每个被索引的分片至少包含一个 `## M\d+` 标题。
5. 批次操作历史写入 `archive/archive-log.md`，不在索引与 `archive/index.md` 中双写。

以上 5 条由 `check-doc-governance` 机检（第 5 条按 bullet / 表格行 / 日期段落三种常见形态；其余形态由 review 复核）。

### 4.4 时效

`docs/standards/*.md` 与 `docs/guide/*.md` 的最近一次实质修改超过 **180 天**时，`check-doc-governance` 输出 freshness warning（不阻断）。warning 必须在下一个阶段归档前完成一次「事实核对」：命令、版本、路径、外部链接逐项实测，并在批次记录中登记结论（无需改动也算结论）。

## 5. 规则生命周期

新增或修改一条严格约束时，按以下顺序判定去向：

| 去向 | 判据 | 载体 | 审查方式 |
|:--|:--|:--|:--|
| **L1 Gate** | 可机检（结构、字符串、文件存在性、配置取值、可构造反例） | `scripts/*.mjs` / 单测 / CI | 自动阻断 |
| **L2 Checkpoint** | 需人工判断，但有明确触发面与检查动作 | [review 检查点矩阵](../../../.github/skills/code-reviewer/references/code-quality-checklist.md) | A 阶段按触发面抽查 |
| **Note** | 只解释原因、实现要点、历史判例，无法稳定判定 | `docs/design/governance/engineering-practice-notes.md` | 不作为放行依据 |
| **Archive** | 一次性事故、环境噪音、已被新规则覆盖 | `docs/design/governance/experience-archive*.md` | 只追溯 |

**准入规则**：

- 规范文件中的每条严格约束必须能回答「改动满足什么条件时检查」与「检查什么」。回答不了 → Note。
- 同一模式第 2 次复现 → 必须在本批产出 L1 或 L2 落点，否则降级为 Note 并登记缺口。
- 规则退役时保留原编号（不重排），在 Note 的映射表中登记「旧编号 → 新位置」；引用面按 `rg` 全仓重指。

**L1 迁移候选**（已识别、尚未脚本化；按优先级取用，不新增规则）：

| 规则 | 当前执行 | 可机检化方向 | 备注 |
|:--|:--|:--|:--|
| §5.1.32 overrides 冲突 | L2 | 解析 `pnpm-workspace.yaml`，同包同时存在通用钉定与版本化覆盖即失败 | 与 `security:audit-deps` 同批接线 |
| §5.1.44 同步子进程 | L2 | ESLint `no-restricted-imports` 限制 `execSync` / `execFileSync`，交付类文件显式 allowlist | 需先列交付例外面 |
| §5.1.5 脚本入口守卫 | Note（EP-04） | 扫 `scripts/**/*.mjs` 的 `main()` 调用是否被 `isDirectExecution` 包裹 | 71 个脚本，当前 0 违规 |
| §5.1.11 调试残留 | Note（EP-10） | 扫源码 `debugger` / `// DEBUG` / `console.log('[debug]'` | 当前 0 违规，可低成本接入 |
| §5.1.26 tsdown chunk 冲突 | Note（EP-22） | 构建后检查 `dist/` 是否出现 `index2.d.mts` / `index2.mjs` | 挂在 build 后置步骤 |

## 6. 处置矩阵

| 信号 | 判定 | 处置 | 证据 |
|:--|:--|:--|:--|
| 文件超行数/字符健康线 | 体量膨胀 | 压缩长段 → 细节迁 Note → 必要时按主题拆节（不轻易拆文件） | `check-doc-size` + `check-doc-governance` |
| 单节规则条数超预算 | 规则堆积 | 合并同族规则；无触发面的迁 Note；保留的补执行方式 | 条数预算表 |
| 规则连续 2 次未被任何审查命中 | 规则失效或不可判定 | 降级 Note / 删除并留映射 | `rg` 引用面 + 批次记录 |
| 同一条规则出现在 2 个以上文档 | 双事实源 | 保留权威文档一处，其余改一行指针 | `rg` 全文 |
| 文档 180 天未核对 | 时效风险 | 逐项实测命令/版本/链接，记录结论 | freshness warning |
| 归档顺序错乱/索引缺失 | 结构漂移 | 重建索引（脚本生成），正文按阶段迁入分片 | `check-doc-governance` |
| 出现生成物（回归摘要、审计报告） | 层错位 | 移到 `artifacts/`，docs 内只留指针（如必要） | 路径检查 |
| 设计文档已完成且不再变更 | 归档候选 | 状态改「已归档」或迁 `governance/archive/` | 状态核对 |

## 7. 治理执行流程

每个治理批次按以下 9 步执行（Step 0 为前置，Step 1-8 为主流程）；步骤 4-6 可按文档类拆成独立 commit。

### Step 0：冻结与定界

```bash
git status --short            # 必须干净；有未提交改动先处理
git rev-list --count HEAD ^origin/master   # 记录 ahead，后续动态核验
```

写下批次范围（哪些目录/文档类）、非目标（哪些不动）、预估文件数与行数。预计 > 10 文件 / > 800 行时按 [设计文档硬阈值](../../standards/documentation.md#_5-1-设计文档硬阈值-hard-requirement) 保留本设计稿并采用 `deep` 审计。

### Step 1：盘点与计量

```bash
pnpm run check:doc-governance     # 字符/条数/归档结构/时效
pnpm run check:doc-size           # 行数阈值
wc -l docs/standards/*.md docs/plan/*.md docs/plan/archive/index.md
rg -n '^## ' docs/plan/todo-archive.md   # 阶段顺序与重复
```

把实测数字写入批次记录；禁止用估算代替。

### Step 2：分类

逐文件按 §6 处置矩阵标记：保留 / 压缩 / 迁 Note / 迁归档 / 改指针 / 退役。每个判定写明证据（行号、字符数、重复位置）。

### Step 3：排批

一个 commit 只做一个逻辑变更（如「standards 瘦身」「归档索引化」「回归报告退役」）。跨文档重指与本体同批，避免中间态死链。按 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 控制单批规模。

### Step 4：执行

- 迁移正文：优先 `git mv` 保持历史；拆分/合并用脚本按 `^##` 边界切片，禁止按行号硬切。
- 压缩：保留「规则 + 触发 + 执行」，把原因/案例移 Note 或经验归档。
- 删除：只允许删除生成物与已迁空的占位文件；归档正文一律迁移，不删除。
- 写盘后立即回读目标文件，确认无截断、无重复标题、无丢失章节。

### Step 5：引用面重指

```bash
rg -n 'todo-archive\.md#|archive/index\.md#|development\.md#5\.1\.' docs .github
pnpm run check:docs
```

锚点以构建产物 id 为准（数字开头章节带下划线前缀），不要凭直觉拼。跨目录相对路径按文件位置计算。

### Step 6：验证

```bash
pnpm run check:doc-governance
pnpm run check:doc-size
pnpm run check:docs
pnpm run check:orphan-ids
pnpm run check:standards-redundant:strict
pnpm run check:experience-landing
pnpm run lint:md:check
pnpm run docs:build
```

涉及脚本改动时加跑定向 vitest：`pnpm exec vitest run scripts/check-doc-governance.test.mjs`。全部 exit 0 才进入审计。

### Step 7：审计

按 A 阶段协议发起独立审计，prompt 必须包含：`audit-depth`、变更文件清单、实测证据（命令 + 关键行号）、是否为复审。治理定义改动（`docs/standards/*`、`.github/skills/*`）与归档结构改动默认 `standard`；> 10 文件 / > 800 行用 `deep`。

### Step 8：登记与提交

在本文件 §10 追加一行批次记录；需要保留操作细节时追加到 `docs/plan/archive/archive-log.md`。提交前跑 `git diff --stat` 核对范围，按 [conventional-committer skill](../../../.github/skills/conventional-committer/SKILL.md) 生成消息。**不得自动 push**。

## 8. 周期与触发

> 触发口径以 [文档规范 §8](../../standards/documentation.md#_8-文档治理周期) 为权威声明；下表补充责任分工与执行动作，不重复判定条件。

| 时点 | 动作 | 责任 |
|:--|:--|:--|
| 每次阶段归档 | 运行 §7 Step 1/6；处理全部 blocker 与 freshness warning | full-stack-master |
| 每 5 个阶段或连续 2 个阶段出现预算 warning | 执行一次完整治理批次（§7 全流程） | documentation-specialist |
| 任一预算进入「阻断」列 | 立即治理，不得带入下一阶段 | full-stack-master |
| 归档索引出现顺序/缺失/重复 | 立即重建索引 | documentation-specialist |
| 用户报告文档不可用/不可信 | 按事件优先级插队 | full-stack-master |

## 9. 角色与门禁

| 角色 | 职责 | 交接物 |
|:--|:--|:--|
| full-stack-master | 定界、排批、编排、最终收口 | 批次范围、commit 顺序、验证证据 |
| documentation-specialist | 盘点、分类、执行、引用面重指 | 变更清单、批次记录 |
| test-engineer | 新机检脚本的用例与负例标定 | 脚本单测、负例 exit 1 证据 |
| code-auditor | 独立审计、放行/退回 | Pass / Reject + 问题分级 |
| 用户 | 破坏性决策、范围扩张、优先级 | 明确授权 |

**门禁**：§7 Step 6 全绿 + A 阶段 Pass 才可提交；治理定义改动未审计即提交视为不合规。

## 10. 批次记录

> 只登记批次级结论；逐文件明细见 commit 与 `archive/archive-log.md`。

| 日期 | 范围 | 结果 | 证据 |
|:--|:--|:--|:--|
| 2026-10-26 | 文档治理 v1：`development.md §5.1` 55 → 20 条（21,853 → 9,529 字符）+ `todo-archive.md` 索引化（478 → 48 行，37 个分片倒序）+ `roadmap.md` 421 → 108 行（M39-M48 迁出）+ `docs/reports/regression` 退役 + 新增 `check:doc-governance` | A 阶段 deep R1 Reject（3 B：`@v1` 镜像残留 / 合并规则丢条款 / EP-16 错链）→ 修复 → R2 Pass（0 B；4 W 已收口）；本批 4 commits | 10 项文档门禁 exit 0 / scripts 802 tests / `docs:build` 通过 |

## 11. 反模式

- 只压缩措辞、不减少规则条数，然后宣称「已瘦身」。
- 把教训原文从 standards 搬到另一个 design 文档，规则与判例仍混在一起。
- 新增规则不写触发面与检查动作，靠「审计员应该知道」。
- 归档重排时按行号切片，产生重复/空壳标题。
- 用删除代替迁移，导致历史 commit 关联与决策依据丢失。
- 在 `docs/` 保留 CI 生成物，或在 CI 里自动提交文档（本仓禁止自动 push）。
- 以「行数没超」为由跳过字符与条数检查。

## 12. 相关文档

- [文档规范](../../standards/documentation.md)（行数阈值、写作规则、plan 分流）
- [规划规范](../../standards/planning.md)（阶段归档、任务粒度、容量再平衡）
- [工程实践判例](./engineering-practice-notes.md)（规则迁移与实现细节）
- [规范与文档治理设计](./spec-and-doc-governance.md)（v1/v2 历史）
- [Session Wisdom 蒸馏机制](./session-wisdom-distillation.md)（经验收敛）
- [documentation-specialist skill](../../../.github/skills/documentation-specialist/SKILL.md)（执行清单）
- [review 检查点矩阵](../../../.github/skills/code-reviewer/references/code-quality-checklist.md)（L2 落点）

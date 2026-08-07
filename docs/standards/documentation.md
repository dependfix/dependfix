# 文档规范

## 1. 文档结构

```
docs/
├── index.md                 # 文档站首页（VitePress）
├── design/                  # 设计文档
│   ├── packages/            # 模块设计（已实现/正在实现，参照 monorepo packages）
│   │   ├── index.md         # 模块索引
│   │   ├── data-model.md    # 标准化告警/配置/报告模型
│   │   └── ...              # dependabot-fetcher / dependency-fixer / pnpm-lockfile-fixer 等
│   └── governance/          # 专项设计与治理
│       ├── index.md         # 治理索引
│       ├── architecture.md  # 系统架构与模块边界
│       ├── security.md      # 安全设计
│       └── ...              # github-action-workflow / mcp-server(M6) 等
├── guide/                   # 使用指南
│   ├── quick-start.md       # 快速开始
│   ├── configuration.md     # 配置说明
│   ├── tech-stack.md        # 技术栈详解
│   └── ai-development.md    # AI 协同开发指南
├── plan/                    # 规划与任务
│   ├── roadmap.md           # 路线图（阶段概览）
│   ├── todo.md              # 当前阶段任务
│   ├── todo-archive.md      # 已完成阶段归档
│   └── backlog.md           # 待办积压（后续阶段详细任务）
├── research/                # 调研文档（命名规范见 §5.0 / §5.1）
│   ├── README.md            # 目录定位（简要，规范见本文档）
│   ├── 2026-07-26-competitive-research.md
│   ├── 2026-08-04-github-token-dependabot-bug-or-design.md
│   └── ...
├── standards/               # 项目规范（本目录）
└── .vitepress/              # VitePress 站点配置（导航/侧边栏）
```

## 2. Markdown 约定

- **单个 H1 标题**: 每个文件一个 `# 标题`，层级不跳级（`#` → `##` → `###`）
- **中文语境**: 统一使用全角括号 `（）`，禁止半角括号混用
- **代码块**: 标注语言 ` ```typescript `、` ```bash `、` ```yaml `
- **图表**: 优先使用 Mermaid，不嵌入难维护的图片描述
- **VitePress 容器**: 关键信息使用 `::: info` / `::: warning` / `::: danger`
- **链接**: 使用相对路径，确保路径真实可用。本地文件链接默认**不带锚点**（`path.md`）：锚点 slug 规则跨平台不一致（GitHub 移除全角标点 `（）`、`、` 等，VS Code / VitePress 保留），带锚点链接在部分平台会失效；必须带锚点时，目标标题避免全角标点，且锚点需能被 [`check:links` 脚本](../../scripts/check-links.mjs) 验证通过
- **链接检查**: `pnpm run check:links`（`scripts/check-links.mjs`，零依赖）验证全部 md 文件的本地路径存在性与锚点匹配——按宽松规范化（小写 + 移除标点/符号/空白）兼容 GitHub / VS Code / VitePress 三种 slug 规则差异，只抓真实断链与假锚点；**同时拒绝本地绝对路径**（`/xxx`、`C:/xxx`、`\\server`）与**路径穿越**（`../..` 解析超出仓库根）——md 本地链接必须使用项目内相对路径。已接入 CI（test.yml）。**归档/重命名标题时**：内容移入归档文件（标题带"已归档"等后缀）或标题改写后，必须全局检索指向该标题的锚点链接（`rg -n '\[[^]]*\]\([^)]*#.*'` 链接文本），同步改指新位置/新锚点——check:links 是最后防线，会在 CI 滞后暴露（2026-08-07 roadmap → todo-archive 锚点失效案例，见 [经验归档 §二十二](../design/governance/2026-08-06-experience-archive.md)）
- **Markdown 格式检查**: `pnpm run lint:md`（`@lint-md/cli`，`--fix` 自动格式化：中英文/数字间距、标题规范、列表缩进等）与 `pnpm run lint:md:check`（无 `--fix`，CI 门禁用，已接入 test.yml / release.yml）。规则裁剪见根目录 [`.lintmdrc`](../../.lintmdrc)（关闭半角标点等与中文技术文档冲突的规则，参照 momei 项目做法）。提交前运行 `pnpm run lint:md` 保持文档格式化一致；lint-staged 已挂载 `*.md` 自动执行

## 3. 文档行数阈值

| 文档 | 健康窗口 | warning 触发 | 强制分片 |
|------|:-------:|:-----------:|:-------:|
| README | <= 300 行 | 301-400 | > 400 行 |
| `roadmap.md` | <= 800 行 | 801-900 | > 900 行 |
| `todo.md` | <= 500 行 | 501-600 | > 600 行 |
| `backlog.md` | <= 500 行 | 501-700 | > 700 行 |
| `todo-archive.md` | <= 500 行 | 501-700 | > 700 行 |

超阈值时优先拆分到 `archive/` 分片，主文档保留近线窗口与索引入口。

## 4. 事实源层次

| 层级 | 文件 | 职责 |
|:----:|------|------|
| L0 | `AGENTS.md` | 项目级 AI 行为准则、安全红线、角色矩阵 |
| L1 | `docs/standards/*.md` | 专项规范（开发、测试、文档等） |
| L2 | `docs/design/packages/*.md` + `docs/design/governance/*.md` | 模块设计 / 专项设计与治理 |
| L3 | 平台适配文件 | 工具差异、目录发现 |

冲突顺序：L0 > L1 > L2 > L3。

**规范单点声明原则**：每条规则只在其职责归属的权威文档中**完整声明一次**（如任务粒度约束 → [规划规范 §1.1](./planning.md)），其他文档 / skill / agent 定义只做**一行链接引用**（`见 [X 规范 §Y](./xxx.md)`），禁止在多处重复抄写完整条款、阈值或教训。理由：多处重复必然漂移（改一处漏一处），且膨胀各文档阅读负担。执行分工：**宽松指引**（应当、建议）可在执行阶段（skill/agent）声明；**严格约束**（必须、阈值、禁令）优先挂在 **review 阶段检查点**（[code-reviewer 检查项](../../.github/skills/code-reviewer/SKILL.md)、Code Auditor 必查项）——review 阶段上下文干净（只看 diff + 验证证据），比开发阶段更容易强制执行（教训见 [经验归档 §二十四](../design/governance/2026-08-06-experience-archive.md)）。

## 5. 设计文档分层

- **模块设计**: 稳定模块总设计写入 `docs/design/packages/`（当前实现/正在实现的模块，参照 monorepo packages 划分）
- **治理/专题**: 专项治理、迁移方案、评估报告写入 `docs/design/governance/`
- **索引**: `docs/design/packages/index.md` 与 `docs/design/governance/index.md` 分别维护索引；过时且暂不删除的文档归档到 `docs/design/governance/archive/`（按需创建）

### 5.0 通用带日期文件命名规范

**需要带日期的文件**（调研、评估、归档、快照、报告等）统一使用 `{YYYY-MM-DD}-{topic-slug}.md`：

1. 日期为**完成日期**（YYYY-MM-DD），置于文件名最前——按文件名排序即按时间排序
2. topic-slug 为小写 kebab-case 主题词
3. 同一天多次产出追加版本后缀 `-v{n}`（从 2 起）
4. 适用于所有文档目录（`docs/research/`、`docs/design/governance/`、`docs/plan/archive/` 等），不限于调研文档

**示例**：
- `2026-08-04-github-token-dependabot-bug-or-design.md`（调研）
- `2026-08-06-experience-archive.md`（经验归档）
- `2026-08-06-audit-report-v2.md`（同天第二版审计报告）

### 5.1 调研文档规范（docs/research/）

调研 / 研究类文档（竞品分析、技术调研、决策依据等）统一存放 `docs/research/`，
与 `docs/design/`（设计落地）和 `docs/plan/`（规划）分离。

**命名规范**（沿用 [§5.0 通用带日期文件命名规范](#50-通用带日期文件命名规范)）:

1. 文件名必须包含日期，格式 `{YYYY-MM-DD}-{topic-slug}.md`
   - 示例：`2026-08-04-github-token-dependabot-bug-or-design.md`
   - 日期为调研**完成日期**；topic-slug 为小写 kebab-case 主题词
2. 同一天对同一主题多次调研（追加搜索、数据更新、结论修正）时，**追加版本后缀**：
   - `2026-08-04-github-token-audit-v2.md`（保留旧版本作为历史决策依据，新版本 `-v{n}` 从 2 起）
3. 旧版被新版完全覆盖且无决策参考价值时，可删除旧版

**内容结构（建议）**:

```markdown
# {调研主题}

> 调研日期: {YYYY-MM-DD}
> 方法: {来源扫描 / 官方文档 / 交叉验证 / 本地实验}
> 结论: {一句话核心结论}

## 摘要
## 关键事实（含出处/链接）
## 交叉验证
## 结论与建议
```

**内容处置流程**: 调研完成后按优先级处置，并在文档末尾注明去向——

1. **落地**: 结论进入设计文档（`design/packages/` 或 `design/governance/`）与规划（`plan/`）
2. **保留**: 作为未来决策依据（如发布工具对比支撑发布方案）
3. **归档 / 删除**: 被覆盖或价值已尽

**目录治理**: 调研文档与实现脱节时，判断"结论是否仍有效"：有效 → 保留；无效 → 删除或更新日期版本。阶段收尾时清理无引用、无价值的旧调研。

## 6. 文档同步原则

- 代码变更时同步更新相关设计文档
- 路径、链接、命令必须真实可用
- 设计文档先于大规模实现落盘
- README 简洁入口，细节回收到 `docs/` 专题页

## 7. 相关文档

- [开发规范](./development.md)
- [项目规划规范](./planning.md)
- [Git 规范](./git.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。

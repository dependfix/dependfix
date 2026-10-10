# 文档规范

## 1. 文档结构

`docs/` 顶层：`index.md`（站点首页）+ `design/modules/`（模块设计，与 monorepo 包一一对应）+ `design/governance/`（专项设计与治理，不按包拆分）+ `guide/`（使用指南）+ `plan/`（roadmap / todo / todo-archive / backlog）+ `research/`（调研）+ `standards/`（本目录）+ `.vitepress/`（站点配置）。逐目录内容见 [治理索引](../design/governance/index.md) 与 [模块索引](../design/modules/index.md)。

## 2. Markdown 约定

- **单个 H1 标题**：每文件一个 `# 标题`，层级不跳级（`#` → `##` → `###`）。
- **中文语境**：统一使用全角括号 `（）`，禁止半角括号混用。
- **代码块 / 图表 / 容器**：代码块标注语言（`typescript` / `bash` / `yaml`）；图表优先 Mermaid，不嵌入难维护的图片描述；关键信息使用 VitePress 容器（`::: info` / `::: warning` / `::: danger`）。
- **链接**：使用相对路径并确保真实可用；本地文件链接默认**不带锚点**（锚点 slug 规则跨平台不一致——GitHub 移除全角标点 `（）` / `、` 等，VS Code / VitePress 保留）；必须带锚点时目标标题避免全角标点，且需通过 `check:docs` 校验。**归档 / 重命名标题后**必须全局检索指向该标题的锚点链接（`rg -n '\[[^]]*\]\([^)]*#.*'` 链接文本）并同步改指。
- **链接检查**：`pnpm run check:docs`（`scripts/check-docs.mjs`，零依赖）验证全部 md 的本地路径存在性与锚点匹配——按宽松规范化（小写 + 移除标点 / 符号 / 空白）兼容 GitHub / VS Code / VitePress 三种 slug 规则差异，只抓真实断链与假锚点；**同时拒绝本地绝对路径**（POSIX 斜杠开头 / Windows 盘符 / UNC 网络共享前缀）与**路径穿越**（解析超出仓库根）。已接入 CI（test.yml），是最后防线。
- **正文路径禁令**：正文与行内代码禁止出现个人机器绝对路径（Windows 盘符 / UNC 等）；引用项目内位置用相对路径或 `<repo-root>/` 占位符（fenced code block 内示例不受限）；`check:docs` 会拒绝正文中的 Windows 盘符 / UNC。
- **Markdown 格式检查**：`pnpm run lint:md`（`@lint-md/cli`，`--fix` 自动格式化中英文 / 数字间距、标题规范、列表缩进）与 `pnpm run lint:md:check`（无 `--fix`，CI 门禁用，已接入 test.yml / release.yml）；规则裁剪见根目录 [`.lintmdrc`](../../.lintmdrc)；lint-staged 已挂载 `*.md` 自动执行。
- **裸 HTML 标签禁令（必须）**：正文与表格中引用 `<tag>` / `<file>` / `<hash>` 等占位符、命令或路径时**必须用反引号包裹**——裸 `<tag>` 会被 markdown-it 按 raw HTML 原样透传，VitePress 的 vue 模板编译把任何非自闭合标签视为需要闭合 → `docs:build` 报 `Element is missing end tag`（报错行号是**转换产物行号**，不能按源文件行号找）；同理加粗 `**...**` 内的裸 `*`（如 `*.test.ts`）会破坏强调解析，须反引号包裹。lint:md 与 check:docs 均**不检查 HTML 标签配对**，`docs:build`（`pnpm --filter dependfix-docs build`）是唯一防线——**新增 / 修改 docs/ 站点内 md 时必须本地执行**；排查用 `rg '<[a-z][a-z0-9-]*>'` 后人工过滤反引号内命中。

## 3. 文档行数阈值

> **本节是项目文档行数阈值的唯一权威声明**——其他文档 / 脚本 / 检查点仅作一行引用；`scripts/check-doc-size.mjs` 直接解析本表计量（不在脚本内硬编码阈值）。

| 文档类型 | 健康窗口 | warning 触发 | 强制分片 |
|------|:-------:|:-----------:|:-------:|
| `README.md` | <= 300 行 | 301-400 | > 400 行 |
| `docs/standards/*.md`（规范） | <= 200 行 | 201-400 | > 400 行 |
| `docs/design/modules/*.md`（模块设计） | <= 300 行 | 301-500 | > 500 行 |
| `docs/design/governance/*.md`（治理设计） | <= 400 行 | 401-700 | > 700 行 |
| `docs/plan/roadmap.md`（路线图） | <= 800 行 | 801-900 | > 900 行 |
| `docs/plan/todo.md`（当前阶段） | <= 500 行 | 501-600 | > 600 行 |
| `docs/plan/todo-archive.md`（归档主窗口） | <= 500 行 | 501-700 | > 700 行 |
| `docs/plan/backlog.md`（积压） | <= 500 行 | 501-700 | > 700 行 |
| `docs/research/*.md`（调研） | <= 500 行 | 501-800 | > 800 行 |
| `docs/guide/*.md`（使用指南） | <= 500 行 | 501-800 | > 800 行 |

**强制分片执行规则**：超阈值文档必须按内容逻辑拆分（如 `todo-archive.md` 按阶段分片 → `archive/todo-archive-phases-m{xx}.md`；`experience-archive.md` 按章节分片 → `experience-archive-§{xx}-{slug}.md`），主文档保留近线窗口 + 索引入口；拆到 `archive/` 分片时主文档保留索引入口。**存量超标**（既有文件在阈值入表时已超「强制分片」线）由 `scripts/check-doc-size.mjs` 的豁免表逐条显式登记（含理由），不以缩小计量面代替。

## 4. 事实源层次

| 层级 | 文件 | 职责 |
|:----:|------|------|
| L0 | `AGENTS.md` | 项目级 AI 行为准则、安全红线、角色矩阵 |
| L1 | `docs/standards/*.md` | 专项规范（开发、测试、文档等） |
| L2 | `docs/design/modules/*.md` + `docs/design/governance/*.md` | 模块设计 / 专项设计与治理 |
| L3 | 平台适配文件 | 工具差异、目录发现 |

冲突顺序：L0 > L1 > L2 > L3。

**规范单点声明原则**：每条规则只在其职责归属的权威文档中**完整声明一次**（如任务粒度约束 → [规划规范 §1.1](./planning.md#11-硬性约束)），其他文档 / skill / agent 定义只做**一行链接引用**（`见 [X 规范 §Y](./xxx.md)`），禁止在多处重复抄写完整条款、阈值或问题结论。**执行分工**：**宽松指引**（应当 / 建议）可在执行阶段（skill / agent）声明；**严格约束**（必须 / 阈值 / 禁令）优先挂在 **review 阶段检查点**（[code-reviewer 检查项](../../.github/skills/code-reviewer/SKILL.md)、Code Auditor 必查项）——review 阶段上下文干净（只看 diff + 验证证据），比开发阶段更容易强制执行。

## 5. 设计文档分层

- **5.0 modules/ vs governance/ 分流依据**：`modules/` 承载**单个 monorepo workspace 包**的稳定模块总设计（1 包 = 1 文档，跟随包重命名，状态 `✅ 已落地` + 修订时间戳）；`governance/` 承载**跨模块 / 平台级 / 治理级 / 重大变更**的专项设计、评估报告、迁移方案与归档（1 主题 = 1 文档，不跟随包重命名，状态取值 `✅ 已落地` / `🔶 设计中` / `🔶 设计先行稿（backlog 候选）` / `✅ 持续追加`）。索引分别维护在 `design/modules/index.md` 与 `design/governance/index.md`；过时且暂不删除的文档归档到 `docs/design/governance/archive/`（按需创建）。

### 5.1 设计文档硬阈值（hard requirement）

> **本条是设计文档强制要求的唯一权威声明**。其他文档 / skill / agent 定义仅作一行引用。

**适用范围（仅以下 4 类改动触发本硬阈值）**：**专项设计**（重大功能预研 / 架构调整 / 跨包契约重写）；**专项治理**（治理决策落地 / 结论沉淀 / 文档治理批次）；**重大变更设计**（breaking change / 数据迁移 / 协议变更）；**新增模块**（新 monorepo 包 / 新平台子系统 / 新核心抽象层）。

**不适用范围**：bug fix / 小优化 / 体验调整 / 文档措辞 / 测试补强 / 配置调整 / 依赖升级 / 现有模块功能扩展。

**硬阈值规则**（仅适用范围内的改动需满足）：**改动预计 > 10 文件 / > 800 行** → **必须有**专项设计文档（`docs/design/governance/<slug>.md`）+ A 阶段 `code-auditor deep depth` 审计；**跨 ≥ 2 个独立模块的代码改动** → **必须有**专项设计文档（不论规模）。完整规则、触发判定与 A 阶段必查项见 [规范与文档治理设计 §2.4](../design/governance/spec-and-doc-governance.md#24-设计文档硬阈值hard-requirement)。

- **5.2 通用带日期文件命名规范**：需要带日期的文件（调研 / 评估 / 归档 / 快照 / 报告等）统一 `{YYYY-MM-DD}-{topic-slug}.md`——日期为**完成日期**且置于文件名最前（按文件名排序即按时间排序），topic-slug 为小写 kebab-case，同一天多次产出追加 `-v{n}`（从 2 起），适用于所有文档目录。**例外（持续追加型文档不设日期）**：跨阶段持续追加、无「完成日期」的文档使用固定名——如 [归档索引](../design/governance/experience-archive.md)（章节按序追加，见其文件头「准入标准」）、`todo-archive.md`、`backlog.md`。示例：`2026-08-02-release-tools-comparison.md` / `2026-08-06-audit-report-v2.md`。

### 5.3 调研文档规范（docs/research/）

调研 / 研究类文档（竞品分析、技术调研、决策依据）统一存放 `docs/research/`，与 `docs/design/`（设计落地）和 `docs/plan/`（规划）分离。

- **命名规范**（沿用 §5.2 通用带日期文件命名规范）：文件名必须包含日期，格式 `{YYYY-MM-DD}-{topic-slug}.md`（日期为调研**完成日期**，topic-slug 为小写 kebab-case 主题词）；同一天对同一主题多次调研追加版本后缀 `-v{n}`（保留旧版本作为历史决策依据）；旧版被新版完全覆盖且无决策参考价值时可删除。
- **内容结构（建议）**：`# {调研主题}` + 元信息（调研日期 / 方法 / 一句话结论）+ `## 摘要` / `## 关键事实（含出处 / 链接）` / `## 交叉验证` / `## 结论与建议`。
- **内容处置流程**：调研完成后按优先级处置并在文末注明去向——**落地**（结论进入设计文档与规划）；**保留**（作为未来决策依据）；**归档 / 删除**（被覆盖或价值已尽）。**目录治理**：调研文档与实现脱节时判断「结论是否仍有效」，有效则保留、无效则删除或更新日期版本；阶段收尾清理无引用、无价值的旧调研。

## 6. 文档同步原则

- 代码变更时同步更新相关设计文档；路径 / 链接 / 命令必须真实可用；设计文档先于大规模实现落盘；README 保持简洁入口，细节回收到 `docs/` 专题页。
- **状态口径反向改写前必须做三重核对**：「未上收 / 设计先行稿」改写成「已实施」之前，必须同时拿到 ① 实现 commit、② 代码 / 依赖现状（如 `package.json` + lock 已无相关依赖）、③ 现存产物三条证据，否则会把未实现写成已实现。**并且区分「改状态」与「改历史正文」**：设计先行稿类文档只改状态行 + 文档元数据 + 追加实施结果引用块，§ 历史正文与当时的方案分析保持原样——历史记录是证据，不随结论改写。
- **双语镜像「一致」的验证粒度：行数一致 ≠ 链接级一致**：`docs/i18n/<locale>/**` 与 zh-CN 侧同步后用「行数相等」自证一致只是最粗的一层。**做法**：逐行比对**链接与锚点**（提取两侧表格行 / 列表项对照），锚点字符串逐字符一致；`pnpm docs:check:i18n` 只覆盖重复页检测，不校验行级等价。
- **文档状态口径清理必须三向扫描**：① 用 `rg "未上收|设计先行稿|Not yet adopted|design first draft"` 扫**同一文档全部状态字段**（顶部状态横幅 + 文末元数据 + 正文「关联阶段」等）；② zh/en 镜像**成对**核对，任一侧更新必须检查另一侧；③ 同步索引行状态 + 行数 / 链接级 parity。**配套**：绝对 GitHub URL 的 `#锚点` 不受 `check:docs` 校验，锚点拼写须人工核对（本地相对链接锚点由 `check:docs` 校验）。

## 7. `plan/` 文档范围严格区分

`docs/plan/` 下 4 个文档**不重叠**——任何条目只能出现在唯一一个文档，禁止重复登记。

| 文档 | 范围 | 禁止内容 |
|:--|:--|:--|
| `todo.md` | 当前阶段未完成待办 | 已闭环摘要 / commit 序列 / 验证矩阵 / ahead 数 / known-issue / 延期项 / 远期登记 |
| `todo-archive.md` | 已闭环阶段归档（主窗口保留 3-5 段） | 当前阶段待办 / 未排期增强候选 |
| `backlog.md` | 未排期 / 延期 / 远期 + known-issue | 已闭环阶段归档 / 当前阶段待办 |
| `roadmap.md` | 里程碑概览 | 单任务级管理 / commit / 待办 |

**条目分流判定**：当前阶段需要推进 → `todo.md`；已完成但本批归档 → `todo-archive.md`；延期 / 用户指示暂缓 → `backlog.md`（延期暂缓段）；远期登记 / 触发条件未达 → `backlog.md`（远期登记段）；known-issue / 已知边界 → `backlog.md`（已知边界段）或对应阶段归档段。

**反模式（违规）**：`todo.md` 顶部 banner 写已闭环内容；`backlog.md` 重复登记已闭环项（双点维护漂移）；`todo.md` 罗列远期项；known-issue 写在 `todo.md`；把 ahead 数 / commit 序列 / 验证矩阵当「进度信息」塞 `todo.md`（这些是归档元数据，不是待办）。

**执行检查**：每次编辑 `docs/plan/` 任一文档前，用本节表自检条目归属；编辑后用 `rg` 扫描违规关键词（`ahead / commit.*[0-9a-f]{7} / 验证矩阵 / 已闭环 / M\d 闭环 / done / completed / closed`），命中即重新分类。

## 8. 相关文档

- [开发规范](./development.md) / [项目规划规范](./planning.md) / [Git 规范](./git.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。

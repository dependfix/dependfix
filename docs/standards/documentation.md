# 文档规范

## 1. 文档结构

`docs/` 顶层：`index.md`（站点首页）+ `design/modules/`（模块设计，与 monorepo 包一一对应）+ `design/governance/`（专项设计与治理，不按包拆分）+ `guide/`（使用指南）+ `plan/`（roadmap / todo / todo-archive 索引 / backlog）+ `plan/archive/`（阶段正文与批次日志）+ `research/`（调研）+ `standards/`（本目录）+ `.vitepress/`（站点配置）。**不设 `docs/reports/`**：CI 产物与回归摘要写入 `artifacts/`，`docs/` 只保留需要长期阅读与评审的内容（见 [文档治理执行规范 §2](../design/governance/doc-governance.md#_2-四条基本原则)）。逐目录内容见 [治理索引](../design/governance/index.md) 与 [模块索引](../design/modules/index.md)。

## 2. Markdown 约定

- **单个 H1 标题**：每文件一个 `# 标题`，层级不跳级（`#` → `##` → `###`）。
- **中文语境**：统一使用全角括号 `（）`，禁止半角括号混用。
- **代码块 / 图表 / 容器**：代码块标注语言（`typescript` / `bash` / `yaml`）；图表优先 Mermaid，不嵌入难维护的图片描述；关键信息使用 VitePress 容器（`::: info` / `::: warning` / `::: danger`）。
- **链接**：使用相对路径并确保真实可用；**带锚点的站内链接一律以 VitePress 产物 id 为准**（计算口径见下文「VitePress 锚点以产物 id 为准」）——GitHub 口径的 `--` 连字符、数字开头缺 `_` 前缀、全角标点残留都会在站点上成为死锚，且宽松比较（剥离 `-`）查不出来。机械迁移用 `node scripts/docs/migrate-anchors.mjs`（默认 dry-run 打印改写 / 歧义 / 未命中清单，`--write` 落盘），复核用 `pnpm run docs:check:anchors`（比对 `docs:build` 产物 id）。**归档 / 重命名标题后**重跑迁移脚本 + `pnpm run check:docs`。迁移与门禁范围覆盖**全仓库 md**（含 `AGENTS.md`、`.github/**`、根 README）：这些文件不进站点，改写后对站点零收益，GitHub / 编辑器侧跳转按 GitHub slug 渲染**不再保证命中**——该取舍由 2026-10-31 用户授权确认，理由是同一个目标文件只保留一种锚点形态，避免双口径并存。
- **链接检查**：`pnpm run check:docs`（`scripts/check-docs.mjs`，零依赖）按八类规则校验 markdown——`links`（本地路径存在性 / 锚点匹配 / 绝对路径与路径穿越拒绝 / gitignored 路径拒绝 / 正文个人机器路径拒绝）+ `vue-interp`（行内代码含 Vue 插值）+ `link-text`（链接文本 `§N` ↔ 目标锚点编号一致性；文本与锚点编号**互为前缀**即通过，多 `§` 引用与纯文字锚点不参与比对）+ `link-syntax`（畸形链接：残留 `](` 或「`.md` 片段 + `#锚点` + 孤立 `)`」）+ `emphasis`（`**` 未配对，按段落 / 表格行计；水平线与行内代码不计入）+ `site-links`（VitePress nav / sidebar / 首页 frontmatter 的绝对链接指向的源文件与锚点）+ `archive-anchors`（`docs/plan/archive/**` 锚点子集，file-dead 维持豁免）+ `anchor-id`（站内锚点必须**逐字符等于**目标页的 VitePress 产物 id；不合形态即报，并在锚点的宽松形态唯一命中某个产物 id 时给出该 id）。`links` / `archive-anchors` 的锚点比较仍按宽松规范化（兼容历史形态，只判「是否真有该标题」），**形态是否正确由 `anchor-id` 负责**；标题抽取与 VitePress 同源（行内代码 / 内联 HTML 的内容参与 slug）；**同时拒绝本地绝对路径**（POSIX 斜杠开头 / Windows 盘符 / UNC 网络共享前缀）与**路径穿越**（解析超出仓库根）。**覆盖边界**：`links` 与 `link-text` 面排除 `docs/plan/archive/**`（归档动作会让历史相对链接指向预期外位置，file-dead 属独立批次）；`link-syntax` / `emphasis` 按**目录名** `archive` 放回；`archive-anchors` 仅 `docs/plan/archive/**`；`anchor-id` 覆盖全部 md（含归档，file-dead 目标跳过）；运行期生成的站点链接（语言切换器等主题内建行为）不在 `site-links` 的静态面内。已接入 CI（test.yml 静态检查簇，位于 `docs:build` 之前），是最后防线。
- **跨 locale 链接按站点路由解析（不是磁盘路径）**：`docs/i18n/en-US/**` 发布为 `/en-US/**`（`rewrites` 去掉 `i18n/` 前缀），因此从 zh 页用 `../i18n/en-US/x.md` 指向英文页时，磁盘路径存在（`check:docs` 绿）但站点渲染成 `/i18n/en-US/x` → 404，且 `ignoreDeadLinks: true` 会吞掉构建告警。**做法**：跨 locale 链接要么写站点路由可解析的相对层级（并在 `docs:build` 后实测正文 href 目标存在），要么改用 GitHub 外链；新增跨 locale 页对时，两端互链都要在 dist 里验证。
- **正文路径禁令**：正文与行内代码禁止出现个人机器绝对路径（Windows 盘符 / UNC 等）；引用项目内位置用相对路径或 `<repo-root>/` 占位符（fenced code block 内示例不受限）；`check:docs` 会拒绝正文中的 Windows 盘符 / UNC。
- **条款标题内禁止嵌套强调标记**：为条款标题补「与相邻条款的边界说明」时，不得把 `**...**` 嵌进已加粗的标题内；markdown 渲染会破损（外露字面 `**` + 强调范围错乱）；`lint:md` 与 `docs:build` **均不报错**（属「合法 HTML、错误强调」类盲区）；`check:docs` 的 `emphasis` 规则只覆盖**未配对**（块内计数为奇数）形态，成对但语义错位仍属盲区，只有渲染级实测能检出。**做法**：边界说明 / 交叉引用一律放**正文**，标题只保留规则名。
- **Markdown 格式检查**：`pnpm run lint:md`（`@lint-md/cli`，`--fix` 自动格式化中英文 / 数字间距、标题规范、列表缩进）与 `pnpm run lint:md:check`（无 `--fix`，CI 门禁用，已接入 test.yml / release.yml）；规则裁剪见根目录 [`.lintmdrc`](../../.lintmdrc)；lint-staged 已挂载 `*.md` 自动执行。
- **表格单元格含 `||` 必须转义为 `\|\|`**：`check:docs` / `lint-md` / `docs:build` 都不校验表格列数，门禁全绿但渲染会丢列；改完须解析产物 HTML 复核列数。
- **VitePress 锚点以产物 id 为准**：数字开头的标题（`## 2.` / `### 5.6`）产物 id 带下划线前缀（`_2-…` / `_5-6-…`），`D+E` 归一为 `d-e`，全角括号经 NFKD 归一后按分隔符处理为单个连字符（`隔离（独立` → `隔离-独立`），`→` 等未列入标点集合的符号保留（含 `→` 的标题锚点务必逐字复制，不要按语义重写）。口径的单一事实源是 `scripts/docs/vitepress-slug.mjs`（逐条对齐 VitePress 1.6.4）；`check:docs` 的 `anchor-id` 规则按它拦错锚（CI 静态簇），`pnpm run docs:check:anchors` 再以 `docs:build` 产物的真实 `id` 复核两件事：① 全部站内锚点命中产物 id；② 每页**推算的标题 id 序列**与产物逐个比对（slug 口径自校验，结果以 warning 列出、不阻断——模拟面未覆盖的写法不会把合法文档判红；真正阻断的是锚点未命中，slug 规则漂移会让存量锚点大面积不命中）。该步已接入 `gates:docs`，紧跟 `docs:build`；源页缺产物时直接失败（构建过期则复核结论无意义）。**已知模拟边界**（`vitepress-slug.mjs` 按行正则模拟 token 流，下列形态不在模拟面内、由产物复核兜底）：setext 标题（`标题` + `===`）、缩进标题、`> ## 引用内标题`、emoji shortcode（`:smile:`）。首页 `features[].details` 是纯文本（不解析 markdown），写入加粗 / 链接会原样显示，卡片要么用 `link:` 要么纯文本。
- **裸 HTML 标签禁令（必须）**：正文与表格中引用 `<tag>` / `<file>` / `<hash>` 等占位符、命令或路径时**必须用反引号包裹**——裸 `<tag>` 会被 markdown-it 按 raw HTML 原样透传，VitePress 的 vue 模板编译把任何非自闭合标签视为需要闭合 → `docs:build` 报 `Element is missing end tag`（报错行号是**转换产物行号**，不能按源文件行号找）；同理加粗 `**...**` 内的裸 `*`（如 `*.test.ts`）会破坏强调解析，须反引号包裹。lint:md 与 check:docs 均**不检查 HTML 标签配对**，`docs:build`（`pnpm --filter dependfix-docs build`）是唯一防线——**新增 / 修改 docs/ 站点内 md 时必须本地执行**；排查用 `rg '<[a-z][a-z0-9-]*>'` 后人工过滤反引号内命中。

## 3. 文档行数阈值

> **本节是项目文档行数阈值的唯一权威声明**——其他文档 / 脚本 / 检查点仅作一行引用；`scripts/check-doc-size.mjs` 直接解析本表计量（不在脚本内硬编码阈值）。

| 文档类型 | 健康窗口 | warning 触发 | 强制分片 |
|------|:-------:|:-----------:|:-------:|
| `README.md` | <= 300 行 | 301-400 | > 400 行 |
| `docs/standards/*.md`（规范） | <= 200 行 | 201-400 | > 400 行 |
| `docs/design/modules/*.md`（模块设计） | <= 300 行 | 301-500 | > 500 行 |
| `docs/design/governance/*.md`（治理设计） | <= 400 行 | 401-700 | > 700 行 |
| `docs/plan/roadmap.md`（路线图） | <= 300 行 | 301-400 | > 400 行 |
| `docs/plan/todo.md`（当前阶段） | <= 500 行 | 501-600 | > 600 行 |
| `docs/plan/todo-archive.md`（归档索引） | <= 100 行 | 101-150 | > 150 行 |
| `docs/plan/backlog.md`（积压） | <= 500 行 | 501-700 | > 700 行 |
| `docs/plan/archive/index.md`（归档治理） | <= 140 行 | 141-200 | > 200 行 |
| `docs/plan/archive/archive-log.md`（批次日志） | <= 400 行 | 401-600 | > 600 行 |
| `docs/research/*.md`（调研） | <= 500 行 | 501-800 | > 800 行 |
| `docs/guide/*.md`（使用指南） | <= 500 行 | 501-800 | > 800 行 |

> **字符与规则条数预算**：行数不足以约束长段落堆叠，`docs/standards/*.md` 的字符上限、`development.md §5.1` 的规则条数与单条字符上限见 [文档治理执行规范 §4.2](../design/governance/doc-governance.md#_4-2-字符与密度预算)，由 `check-doc-governance` 计量。

**强制分片执行规则**：超阈值文档必须按内容逻辑拆分（如 `todo-archive.md` 按阶段分片 → `archive/todo-archive-phases-m{xx}.md`；`experience-archive.md` 按章节分片 → `experience-archive-§{xx}-{slug}.md`；`design/{modules,governance}/<slug>.md` 按连续尾部章节分片 → 同级 `<slug>-<主题>.md`），主文档保留近线窗口 + 索引入口（`todo-archive.md` 例外：只保留阶段索引，正文全部在分片）；拆到 `archive/` 分片时主文档保留索引入口。**存量超标**（既有文件在阈值入表时已超「强制分片」线）由 `scripts/check-doc-size.mjs` 的豁免表逐条显式登记（含理由），不以缩小计量面代替。

## 4. 事实源层次

| 层级 | 文件 | 职责 |
|:----:|------|------|
| L0 | `AGENTS.md` | 项目级 AI 行为准则、安全红线、角色矩阵 |
| L1 | `docs/standards/*.md` | 专项规范（开发、测试、文档等） |
| L2 | `docs/design/modules/*.md` + `docs/design/governance/*.md` | 模块设计 / 专项设计与治理 |
| L3 | 平台适配文件 | 工具差异、目录发现 |

冲突顺序：L0 > L1 > L2 > L3。

**规范单点声明原则**：每条规则只在其职责归属的权威文档中**完整声明一次**（如任务粒度约束 → [规划规范 §1.1](./planning.md#_1-1-硬性约束)），其他文档 / skill / agent 定义只做**一行链接引用**（`见 [X 规范 §Y](./xxx.md)`），禁止在多处重复抄写完整条款、阈值或问题结论。**执行分工**：**宽松指引**（应当 / 建议）可在执行阶段（skill / agent）声明；**严格约束**（必须 / 阈值 / 禁令）优先挂在 **review 阶段检查点**（[code-reviewer 检查项](../../.github/skills/code-reviewer/SKILL.md)、Code Auditor 必查项）——review 阶段上下文干净（只看 diff + 验证证据），比开发阶段更容易强制执行。

## 5. 设计文档分层

- **5.0 modules/ vs governance/ 分流依据**：`modules/` 承载**单个 monorepo workspace 包**的稳定模块总设计（1 包 = 1 文档，跟随包重命名，状态 `✅ 已落地` + 修订时间戳）；`governance/` 承载**跨模块 / 平台级 / 治理级 / 重大变更**的专项设计、评估报告、迁移方案与归档（1 主题 = 1 文档，不跟随包重命名，状态取值 `✅ 已落地` / `🔶 设计中` / `🔶 设计先行稿（backlog 候选）` / `✅ 持续追加`）。索引分别维护在 `design/modules/index.md` 与 `design/governance/index.md`；过时且暂不删除的文档归档到 `docs/design/governance/archive/`（按需创建）。

### 5.1 设计文档硬阈值（hard requirement）

> **本条是设计文档强制要求的唯一权威声明**。其他文档 / skill / agent 定义仅作一行引用。

**适用范围（仅以下 4 类改动触发本硬阈值）**：**专项设计**（重大功能预研 / 架构调整 / 跨包契约重写）；**专项治理**（治理决策落地 / 结论沉淀 / 文档治理批次）；**重大变更设计**（breaking change / 数据迁移 / 协议变更）；**新增模块**（新 monorepo 包 / 新平台子系统 / 新核心抽象层）。

**不适用范围**：bug fix / 小优化 / 体验调整 / 文档措辞 / 测试补强 / 配置调整 / 依赖升级 / 现有模块功能扩展。

**硬阈值规则**（仅适用范围内的改动需满足）：**改动预计 > 10 文件 / > 800 行** → **必须有**专项设计文档（`docs/design/governance/<slug>.md`）+ A 阶段 `code-auditor deep depth` 审计；**跨 ≥ 2 个独立模块的代码改动** → **必须有**专项设计文档（不论规模）。完整规则、触发判定与 A 阶段必查项见 [规范与文档治理设计 §2.4](../design/governance/spec-and-doc-governance.md#_2-4-设计文档硬阈值-hard-requirement)。

- **5.2 通用带日期文件命名规范**：需要带日期的文件（调研 / 评估 / 归档 / 快照 / 报告等）统一 `{YYYY-MM-DD}-{topic-slug}.md`——日期为**完成日期**且置于文件名最前（按文件名排序即按时间排序），topic-slug 为小写 kebab-case，同一天多次产出追加 `-v{n}`（从 2 起），适用于所有文档目录。**例外（持续追加型文档不设日期）**：跨阶段持续追加、无「完成日期」的文档使用固定名——如 [归档索引](../design/governance/experience-archive.md)（章节按序追加，见其文件头「准入标准」）、`todo-archive.md`、`backlog.md`。示例：`2026-08-02-release-tools-comparison.md` / `2026-08-06-audit-report-v2.md`。

### 5.3 调研文档规范（docs/research/）

调研 / 研究类文档（竞品分析、技术调研、决策依据）统一存放 `docs/research/`，与 `docs/design/`（设计落地）和 `docs/plan/`（规划）分离。

- **命名规范**（沿用 §5.2 通用带日期文件命名规范）：文件名必须包含日期，格式 `{YYYY-MM-DD}-{topic-slug}.md`（日期为调研**完成日期**，topic-slug 为小写 kebab-case 主题词）；同一天对同一主题多次调研追加版本后缀 `-v{n}`（保留旧版本作为历史决策依据）；旧版被新版完全覆盖且无决策参考价值时可删除。
- **内容结构（建议）**：`# {调研主题}` + 元信息（调研日期 / 方法 / 一句话结论）+ `## 摘要` / `## 关键事实（含出处 / 链接）` / `## 交叉验证` / `## 结论与建议`。
- **内容处置流程**：调研完成后按优先级处置并在文末注明去向——**落地**（结论进入设计文档与规划）；**保留**（作为未来决策依据）；**归档 / 删除**（被覆盖或价值已尽）。**目录治理**：调研文档与实现脱节时判断「结论是否仍有效」，有效则保留、无效则删除或更新日期版本；阶段收尾清理无引用、无价值的旧调研。

## 6. 文档同步原则

- 代码变更时同步更新相关设计文档；路径 / 链接 / 命令必须真实可用；设计文档先于大规模实现落盘；README 保持简洁入口，细节回收到 `docs/` 专题页。
- **状态口径反向改写前必须做三重核对**：「未上收 / 设计先行稿」改写成「已实施」之前，必须同时拿到 ① 实现 commit、② 代码 / 依赖现状（如 `package.json` + lock 已无相关依赖）、③ 现存产物三条证据，否则会把未实现写成已实现。**并且区分「改状态」与「改历史正文」**：设计先行稿类文档只改状态行 + 文档元数据 + 追加实施结果引用块，§ 历史正文与当时的方案分析保持原样——历史记录是证据，不随结论改写。
- **设计镜像结构映射（hard requirement）**：`docs/design/**`（zh 事实源，60+ 篇）与 `docs/i18n/en-US/design/**`（仅 4 篇镜像）之间不承诺逐字等价，只承诺**结构可映射 + 无静默缺口**。唯一登记处是 `docs/i18n/en-US/design/mirror-manifest.md`（中文入口页 `docs/design/mirror-manifest.md`，站点要求 en 页有根 locale 对应页）：每个 zh 分片要么出现在「Mirrored」（附 zh H2 → en H2 映射表，未镜像的小节须显式写 `—` 与去向），要么出现在「Not mirrored」（附理由，部分镜像须写明已译章节）；英文页面里 zh 内容在**别的分片**的小节登记在「English-side sections」三列表（`en page | en H2 | zh 对应`，第三列必须是 `docs/design/<分片> §<标题>` 或 `—（原因）`（确属英文独有写 `—（英文版独有）`））。`pnpm run docs:check:mirror`（`scripts/docs/check-design-mirror.mjs`，已接入 `gates:docs`）做三方一致校验：zh 文件集 ↔ 清单 ↔ en 页面集，外加每页 H2 映射与两侧真实标题逐条比对、en 侧独有小节必须登记。**新增 / 删除 zh 设计分片或 en 镜像时必须同批更新清单**，否则门禁失败；全量翻译仍登记为 1.0 后评估项。
- **指南平价机检（hard requirement）**：`docs/i18n/en-US/guide/{configuration,quick-start}.md` 与 zh 事实源之间，除人工翻译之外必须有**键位与骨架**的机检——`pnpm run docs:check:guides`（`scripts/docs/check-guide-parity.mjs`，已接入 `gates:docs`）。比对四类：① env 变量（全量大写 snake，常量名经 `ENV_DENYLIST` 排除——新增常量须先确认它不是环境变量）；② CLI 参数（`--flag`）；③ Action 输入（`## Action 输入参数` / `## Action inputs` 表格首列，取不到即 fail-closed）；④ 结构（H2 按 `HEADING_PAIRS` **逐条标题映射**，zh 侧改名即 fail-closed；H3 按数量 `en ⊇ zh`）。两侧均允许英文追加面向英文读者的 H2/H3 小节（如 Exit codes / Next steps）。方向是 `en ⊇ zh`：zh 侧新增键位后 en 侧不同步即失败；确属 zh 专有的键位须登记到脚本的 `EXEMPTIONS`（值写理由，含「何时移除」），未被命中的豁免会被点名、不得长期沉淀。**不在面内**：译文措辞、配置示例文件形态（`dependfix.config.*` 尚未实现，两侧示例本就不同）。
- **1.0 契约冻结机检（hard requirement）**：对外契约（CLI 参数与运行模式 / GitHub Action inputs / `RuntimeConfig` 与 `DEPENDFIX_*` / 报告 `RunResult`·`RepositoryResult` 字段 / 平台 DB 表列）的清单写在 [guide/contract-freeze.md](../guide/contract-freeze.md)，由 `pnpm run check:contract-freeze`（`scripts/docs/check-contract-freeze.mjs`，已接入 `gates:docs`）从 `argsDef` / `action.yml` / 配置接口 / 报告接口 / 实体元数据**抽取**后比对（集合语义，顺序无关）。约束：① 小节标题改名、代码块为空或事实源抽取为空即 fail-closed；② 键位一律从代码抽取，禁止手抄后人工比对；③ 同批校验 zh / en quick-start 的 CLI 参数表 == `argsDef`；④ 差异**不得**用改清单「修绿」——先判断是代码越界还是契约变更，后者才改清单并按弃用策略留痕（1.x 只增不改不删，移除只在 2.0）。
- **双语镜像「一致」的验证粒度：行数一致 ≠ 链接级一致**：`docs/i18n/<locale>/**` 与 zh-CN 侧同步后用「行数相等」自证一致只是最粗的一层。**做法**：逐行比对**链接与锚点**（提取两侧表格行 / 列表项对照），锚点字符串逐字符一致；`pnpm docs:check:i18n` 只覆盖重复页检测，不校验行级等价。
- **阶段状态口径翻转的同步面含「各文档速查表」**：阶段启动 / 归档时「暂无进行中阶段」与「Mxx 进行中」的双向翻转，必须同步**所有承载该口径的位置**（待办速查表 + 路线图指针 + 各文档内速查表 + 文档首页里程碑）；漏改不仅留下自相矛盾，还会使批次记录中「口径已同步」的声明失实。
- **文档状态口径清理必须三向扫描**：① 用 `rg "未上收|设计先行稿|Not yet adopted|design first draft"` 扫**同一文档全部状态字段**（顶部状态横幅 + 文末元数据 + 正文「关联阶段」等）；② zh/en 镜像**成对**核对，任一侧更新必须检查另一侧；③ 同步索引行状态 + 行数 / 链接级 parity。**配套**：绝对 GitHub URL 的 `#锚点` 不受 `check:docs` 校验，锚点拼写须人工核对（本地相对链接锚点由 `check:docs` 校验）。

- **声明的「覆盖面」必须带作用对象限定**：写「全部 N 处调用点」这类覆盖面声明时须限定**作用对象**（例：「作用对象为被修复仓库的交付链路 push 调用点」）并显式列出**不适用面**（例：工具自身的发布脚本）；否则 repo-wide 阅读会把它读成「零遗漏」，审计会据此反复追问同一问题。配套做法：声明前先 `rg` 穷举并按作用对象分组。
- **文档示例与实现不一致时优先补实现侧容忍**：当文档给出的形态示例（例：裸 `→ <target>` 指针写法）未被实现捕获时，若该形态属**既有文档已声明的约定**，应在实现侧扩展容忍并补测，而不是把文档改窄——把文档改窄会把已存在的既有数据形态判为「不支持」。

- **断言必须复现运行期真实条件，而非「字符串存在」**：只查「标记存在」的构建产物断言会漏判编码 / 路径失配（运行期失效但断言通过）。**做法**：从产物提取被测逻辑并在最小桩（如 `node:vm` + DOM stub）中执行，用真实输入触发判定；负例必须 exit 1。
- **量化断言必须单一口径且与声明命令一致**：同一批次的计数在多文档出现时须用同一口径（链接实例 vs 文件数）并互相核对；「源码 N 文件」类计数须注明口径（`from 'x'` import 计数 / 子串命中），且能按声明命令复现。
- **引用范围措辞必须限定域**：跨包仓库里「全仓零引用 / 全局唯一」在仓库级常不成立（如某依赖仅在某子包声明）→ 写「平台内 / 该包内」；「全仓 / 全局」类措辞落笔前先核全仓。
- **事实类新增内容须按权威源三处核对**：新写「升级史 / 归属 / 批次」类事实前必须查**归档路线图 + 专项核对文档 + `git log`** 三处（为消除漂移而新写的内容本身也会引入 blocker 级事实错误）。
- **归档条目落点校验按编号子条目粒度**：`##` 下存在编号 `###` 子条目时逐条校验；无编号子条目的 `##` 整体校验落点；自指落点判空（实现边界见 `scripts/check-experience-landing.mjs` 头注释）。
- **实现推翻旧形态时必须同步检查点矩阵行**：实现从「先建后 chown」改为「以运行身份创建」这类形态反转后，若矩阵仍写旧形态，后续审计按矩阵「整改」会重新引入缺陷；矩阵行与条款同批更新。
- **非门禁面缺陷静态检查发现不了**：路由表外产物（SPA 点击 404）、hydration 属性移除、归档面 file-dead 等静态不可见缺陷，只能靠**真实浏览器端到端**发现 → 高风险交互改动必须留一次浏览器实测并纳入证据链。

## 7. `plan/` 文档范围严格区分

`docs/plan/` 下 4 个文档**不重叠**——任何条目只能出现在唯一一个文档，禁止重复登记。

| 文档 | 范围 | 禁止内容 |
|:--|:--|:--|
| `todo.md` | 当前阶段未完成待办 | 已闭环摘要 / commit 序列 / 验证矩阵 / ahead 数 / known-issue / 延期项 / 远期登记 |
| `todo-archive.md` | 已闭环阶段**索引**（按阶段倒序；正文在 `archive/todo-archive-phases-*.md`） | 当前阶段待办 / 未排期增强候选 / 阶段正文 |
| `plan/archive/index.md` | 归档治理规则、阈值引用、当前基线、批次日志入口 | 阶段正文 / 批次流水账（入 `archive-log.md`） |
| `plan/archive/archive-log.md` | 追加型批次操作记录（日期 / 范围 / 结论 / commits） | 阶段正文 |
| `backlog.md` | 未排期 / 延期 / 远期 + known-issue | 已闭环阶段归档 / 当前阶段待办 |
| `roadmap.md` | 里程碑概览 + 当前阶段 | 单任务级管理 / commit / 待办 / 已闭环阶段详情（入 `archive/roadmap-phases-*.md`） |

**条目分流判定**：当前阶段需要推进 → `todo.md`；已完成但本批归档 → `archive/todo-archive-phases-<阶段>.md` + `todo-archive.md` 索引；延期 / 用户指示暂缓 → `backlog.md`（延期暂缓段）；远期登记 / 触发条件未达 → `backlog.md`（远期登记段）；known-issue / 已知边界 → `backlog.md`（已知边界段）或对应阶段归档段。

**反模式（违规）**：`todo.md` 顶部 banner 写已闭环内容；`backlog.md` 重复登记已闭环项（双点维护漂移）；`todo.md` 罗列远期项；known-issue 写在 `todo.md`；把 ahead 数 / commit 序列 / 验证矩阵当「进度信息」塞 `todo.md`（这些是归档元数据，不是待办）。

**执行检查**：每次编辑 `docs/plan/` 任一文档前，用本节表自检条目归属；编辑后用 `rg` 扫描违规关键词（`ahead / commit.*[0-9a-f]{7} / 验证矩阵 / 已闭环 / M\d 闭环 / done / completed / closed`），命中即重新分类。

## 8. 文档治理周期

文档治理的执行流程、字符与规则条数预算、归档结构不变量、角色与批次记录见 [文档治理执行规范](../design/governance/doc-governance.md)。本节只声明触发口径：

- **每次阶段归档**：运行 `check:docs` / `check:doc-size` / `check:doc-governance`，处理全部 blocker 与 freshness warning。
- **每 5 个阶段或连续 2 个阶段出现预算 warning**：执行一次完整治理批次（盘点 → 分类 → 排批 → 执行 → 重指 → 验证 → 审计 → 登记）。
- **预算进入阻断列 / 归档索引失序**：立即治理，不得带入下一阶段。

## 9. 相关文档

- [开发规范](./development.md) / [项目规划规范](./planning.md) / [Git 规范](./git.md)
- [文档治理执行规范](../design/governance/doc-governance.md) / [工程实践判例](../design/governance/engineering-practice-notes.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。

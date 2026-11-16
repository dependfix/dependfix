# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M61 文档与 AI 治理**（第四期；2026-11-15 规划，进行中） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M60 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M60 已归档；M61 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M61 文档与 AI 治理（第四期，2026-11-15 规划）

> **目标**：把文档门禁从「已知盲区长期豁免」收敛为「可全量核验」，把 AI 资产从「靠人工记住规则」收敛为「有机检门禁」，并清掉文档体量与口径存量。
>
> **来源**：用户 2026-11-12 四期决策第四期「文档与 AI 治理」；2026-11-15 规划轮用户选**方案 A（一期 6 原子）**并追加「M44 条款挂接」。
> backlog 上收 8 条候选（候选池 39 → 31）；另 1 项（文档体量健康带回归）由 [文档规范 §8](../standards/documentation.md#_8-文档治理周期)「每 5 个阶段或连续 2 个阶段出现预算 warning → 执行完整治理批次」触发、同批经用户授权上收。
>
> **§3.4 三项交叉核验（2026-11-15 实测，执行角色口径）**：
> ① 归档扫描 `rg -l "check-ai-governance|archive.*file-dead|链接前缀|REFERENCES.*过期" docs/plan/archive` → 仅 `todo-archive-phases-m44.md` 命中「文档门禁」上下文，无同题闭环；
> ② `git log --oneline -5 -- scripts/check-doc-size.mjs scripts/check-doc-governance.mjs`（`6ead247c` 主约束与密度告警 / `16d45d19` 治理规范与密度机检 / `f27575bf` 阈值表单一权威）与 `git log -- .github/skills packages/skills` → 均无 AI 机检门禁或拆分批次；
> ③ 代码 anchor：`scripts/check-ai-governance.mjs` 不存在、`DOC_GATES` 20 项无 AI 资产面、archive 65 文件 / 1119 相对链接 / **101 file-dead** / 14 文件（`check:docs` 同源抽取器口径）、`caomei-ui-migration.md` 1073 行（§15 实测 634 行 / §15.1-§15.17）、doc-size warning 3 篇（312 / 444 / 484）+ 豁免 1 篇、`platform.md` 24084 字符、REFERENCES 仍写「当前 MCP Server 未发布」。
>
> **容量基线（逐原子交付物求和，执行角色口径）**：commits 19-27 / files 48-64 / 行 **2270-3280**。口径：**行 = 各原子 diff 改动量（含删除）**；M61.3 交付物写「净删 150-300 行」，其改动量按 300-600 行计入基线。
>
> **类型平衡（按主类型计数，兼标签不重复计入）**：🛠️2（M61.1 / M61.4）+ 📚4（M61.2 / M61.3 / M61.5 / M61.6）；M61.2 兼 🛠️、M61.4 兼 🛡️ 为次标签；🧪 内嵌各原子（门禁类补负例，拆分与体量类跑 docs 门禁全量）。
> **🎨 缺口显式标注**：本方向无 UX 原子（文档 / AI 治理阶段），UX 类由后续体验批次承接；候选池内 UX 类可上收项（批次级「继续执行未完成项」入口）需产品决策，未纳入本期。
>
> **执行顺序**：M61.1 → M61.4 → M61.5 → M61.6 → M61.2 → M61.3（先让门禁可信，再改被门禁约束的文档；体量收口最后，避免拆分与瘦身交叉返工）。
>
> **D 阶段决策点**：D1（M61.1）归档正文是否允许路径重指；D2（M61.2）§15 分片切点；D3（M61.3）压缩策略取「外移 + 指针」而非就地删减；D4（M61.4）门禁强度分级与扫描面；D5（M61.5）REFERENCES 是否登记全部 8 tool；D6（M61.6）经验分片范围口径统一为「实测内容范围」。

### M61.1 归档链接前缀治本（P2 🛠️）

- **目标**：`docs/plan/archive/**` 的相对链接 file-dead 归零，并让 `check:docs` 的 links 面覆盖该目录，使「归档路径漂移」不再依赖人工复扫。
- **优先级**：P2（门禁盲区：links 面对 archive 整体豁免，实测 101 处死链长期不可见）。
- **范围**：
  - 14 个分片共 101 处路径重指（2026-11-15 实测）：`todo-archive-phases-m16-m17.md`(17) / `m6-m7-t711.md`(16) / `m14-m15.md`(14) / `m11.md`(13) / `m24.md`(12) / `m10-c53-c59c61.md`(8) / `m31.md`(5) / `m19-m21.md`(4) / `m13.md`(3) / `m18.md`(3) / `m0-m1.md`(2) / `m25.md`(2) / `m12.md`(1) / `m26.md`(1)；
  - `scripts/shared/md-walk.mjs` 的 `MD_EXCLUDED_DIRS` 含 `archive` 及「维持历史豁免」注释段；**改法限定为在 links 面加 `includeDirs: ['archive']` 定向放回**（`checkVueInterp` / `checkLinkText` 等其余规则的全局排除集与既有豁免注释语义保持不变）；
  - `scripts/check-docs.mjs` 的 links 面排除注释与 archive-anchors 注释（第 14 / 19-20 / 407 / 662 行处）；
  - `docs/standards/documentation.md §2` 覆盖面声明；
  - `.github/skills/code-reviewer/references/code-quality-checklist.md` 的「五类合法文本但语义漂移信号」段第 ⑤ 项（原文「`archive-anchors`——归档文档的自锚点 / 跨文档锚点无对应标题（file-dead 维持豁免）」）；
  - `docs/standards/planning.md §4.4` 第 15 条配套句（同源表述「`docs/plan/archive/**` 的 links 面（file-dead）维持豁免」）。
- **验收标准**：
  - ① 一次性脚本实测 archive 相对链接 file-dead = 0（基线：65 文件 / 1119 条相对链接 / 101 file-dead，`check:docs` 同源抽取器口径；判读脚本与逐文件分布写入执行记录）；
  - ② `node scripts/check-docs.mjs --only=links` 覆盖 `docs/plan/archive/**` 且 exit 0；负例（向任一归档分片注入不存在目标）exit 1 并点名文件行；
  - ③ `pnpm run gates:docs` 20 项通过（M61.4 前基线；该原子执行时 `DOC_GATES` 尚未扩到 21 项）；
  - ④ 归档保真：14 个文件 `git diff --numstat` 非空行数不变，`git diff --word-diff` 抽样 10 处仅链接目标变化（文字 / 锚点不变）；
  - ⑤ 口径同步（**限定扫描面**：`docs/standards/planning.md`、`docs/standards/documentation.md`、`.github/skills/code-reviewer/references/code-quality-checklist.md`、`scripts/check-docs.mjs`、`scripts/shared/md-walk.mjs`）：`rg -n "links 面.*豁免|维持历史豁免|file-dead 维持豁免|file-dead 豁免|file-dead 属独立批次" <上述文件>` 的命中行**逐行判读**并写入执行记录——全部为「已治本 / 现状说明」表述、无「维持豁免 / 属独立批次」的现行断言；`todo.md` 自身的引文与 pattern 文本不计入。
- **不做什么**：不改归档正文文字 / 章节结构 / 锚点集合；不删归档文件；不重写 `archive-anchors` 规则；不动 `todo-archive.md` 索引；不改 `release-1.0-readiness.md` 冻结台账（该表已声明冻结口径，如需补承接指针须单独授权）。
- **依赖**：先例 [规划规范 §4.4](../standards/planning.md#_4-4-大批量归档批次操作规范) 第 3 条（相对路径替换写法）与第 18 条（迁出分片按新目录重算）；backlog 候选「归档目录内 file-dead 相对链接前缀治本」（2026-11-15 上收）。
- **交付物**：3-4 commits / 16-20 files / 120-180 行（14 分片 + 2 脚本注释与规则 + 2 规范/矩阵）。
- **风险与缓解**：批量替换吞 `]` → 按 §4.4 第 3 条从 `../` 字符起写，改后跑畸形链接检测（精确形态 `rg -n "\[[^]\n]*\((\.\.?/|/)"` 0 命中）；归档保真被误改 → 逐文件 `git diff --word-diff` 自查 + 非空行数校验；门禁扩面暴露其它存量死链 → 先跑一次性探针量化分布，超本条目基线的部分登记候选不夹带。
- **执行记录（2026-11-16，3 commits）**：`2bd3d8ab` 十四个分片按新目录重指 101 处相对链接（逐文件分布 17/16/14/13/12/8/5/4/3/3/2/2/1/1），同批把 19 处锚点对齐 VitePress 产物 id（18 处形态归一 + 1 处删除已失效的 `#m72-平台能力深化`，该章节已迁出 backlog）；`1e14965e` 把 links 面定向放回 `archive`，并纠偏 `includeDirs` 契约注释与同族「归档豁免」注释，新增「死链点名」与「合法相对链接按分片目录解析」两组用例；本条提交同步 `documentation.md §2` / `planning.md §4.4` 第 15 条 / checklist 第 ⑤ 项与 backlog 已知边界。AC 证据：一次性探针 65 文件 / 1119 相对链接 / file-dead 101 → 0；`node scripts/check-docs.mjs --only=links` exit 0（234 md）；向分片注入不存在目标 → exit 1 且点名行号；`pnpm run gates:docs` 20 项通过；保真核对为「剥离链接目标后 14 文件逐字节一致、非空行数全等」；AC⑤ 指定 5 文件四类 legacy pattern 0 命中（planning §4.4 第 15 条措辞一并为同源精化）。审计：A `standard` Pass（B 面留痕）；B `standard` **Reject**（`includeDirs` JSDoc 与实现倒置）→ 修复 → `quick` Pass（1 项事实计数修正后 closed）；C `standard` Pass。偏差：改动文件数超预估（16-20），因锚点形态修复与两类盲区登记同批；锚点形态问题属 links 扩面后 `anchor-id` 真实校验暴露的存量，不是新引入。残余：站点侧 `docs/` 外相对链接 404 与归档链接文字层失效指针，已登记 [backlog 已知边界](backlog.md#归档链接的两类盲区-2026-11-16-登记-持续观察)。

### M61.2 大文档保序拆分（P2 📚🛠️）

- **目标**：`caomei-ui-migration.md`（1073 行，超强制分片线 >700）按「连续尾部章节」拆为主文档 + 3 分片，各 ≤400 行，并移除 `check-doc-size` 豁免条目。
- **优先级**：P2（治理阈值硬要求：>700 行必须分片；豁免已挂账两个阶段）。
- **范围**：
  - 主文档保留：标题 + 引语 / 状态块（8 行）+ §1-§11（369 行）+ §16 接线细则（11 行）+ 分片索引（约 6 行）→ **约 394 行**（余量约 6 行）；
  - 分片 A `caomei-ui-migration-mapping.md` = 文档头元数据块（第 3-12 行，10 行）+ §12 上收触发条件 + §13 关联文档 + §14 文档元数据 + §15.1-§15.9（约 165 行，含 §15 伞标题）；
  - 分片 B `caomei-ui-migration-m31-proof.md` = §15.10-§15.13（270 行）；
  - 分片 C `caomei-ui-migration-upgrades.md` = §15.14-§15.17（250 行）；
  - **en-US 镜像登记**：新增 3 个 zh 分片后同批更新 `docs/i18n/en-US/design/mirror-manifest.md`（每 zh 分片须出现且仅出现一次；不新建 en 译文，登记为「未镜像」）；
  - 切点按拆分时点实测重算（§15 共 634 行 / 17 个子节，backlog 原方案的旧数字已作废）。**与「连续尾部章节」措辞的偏离说明**：§16「caomei-ui 接线细则」保留在主文档（属当前有效接线正文），文档头元数据块随 §12-§14 一并外移到分片 A（元信息归口），二者合计使主文档落回 ≤400。
- **验收标准**：
  - ① 四个文件 `wc -l` 均 ≤400（主文档实测目标约 394，须在拆分后写出实测值）；
  - ② 保真：HEAD 原文非空行序列 == 主文档 + 三片逐组比对零丢失（§4.4 第 17 条）；比对时**只剥离各分片新增的 H1 / 前置空行与主文档新增的分片索引**，迁入分片 A 的元数据块属原文内容、必须计入；允许的差异仅限「链接目标按新目录重算」（同 M61.1 AC④ 口径，`git diff --word-diff` 抽样核对）；
  - ③ `SIZE_EXEMPTIONS` 条目移除，`node scripts/check-doc-size.mjs` 超阈值 0 / 未匹配 0；
  - ④ 入链重指：① 跨文档 `rg -n "caomei-ui-migration.md#_15"` 命中全部指向分片 B / C 的正确锚点；② 跨分片重指的族内同页锚点按新落点改写（主文档原 15 / 23 / 362 行；A 原 404 / 422-425 / 441 行；B 原 651 / 697 行）；`check:docs` 0 error；
  - ⑤ `pnpm run docs:check:mirror` 通过（manifest 已登记 3 个新分片，且登记与分片文件**同 commit**——清单引用不存在的分片会直接报错）；
  - ⑥ **每个**拆分步骤与其锚点引用同 commit（§4.4 第 16 条），步骤按行数均衡、单 commit ≤800 行。
- **不做什么**：不改写正文（元数据块仅迁移位置）；不拆 §1-§11；不建第二份迁移索引；不动 §16 内容。
- **依赖**：[文档规范 §3](../standards/documentation.md#_3-文档行数阈值)「连续尾部章节分片 → 同级 `<slug>-<主题>.md`」；backlog 候选（2026-11-12 登记，数字已按 2026-11-15 重算）。
- **交付物**：4-6 commits / 10-14 files / **改动量约 1200-1500 行**（约 680 增 + 680 删 + 索引，按阶段头「行 = diff 改动量含删除」口径计入基线）。
- **风险与缓解**：锚点断裂 → 拆分本体与重指同 commit；主文档余量仅约 6 行 → 拆分后立即实测 `wc -l`，超出则把 §16 并入分片 A（备选切点）；分片 C 250 行接近上限 → 下次追加前先评估再分片。
- **执行记录（2026-11-16，3 commits）**：`a32fb780` 拆出 `caomei-ui-migration-mapping.md`（§12-§15.9 + 文档头元数据块），`d3be2c75` 拆出 `caomei-ui-migration-m31-proof.md`（§15.10-§15.13），本条提交拆出 `caomei-ui-migration-upgrades.md`（§15.14-§15.17）并移除 `SIZE_EXEMPTIONS` 条目。每一步「分片创建 + 主档删段 + 跨分片锚点重指 + 镜像清单登记 + 外部入链改指」同 commit，中间态 `check:docs` / `docs:check:mirror` 均为绿；最终 `wc -l` 主档 394 / A 167 / B 271 / C 251（均 ≤400），主文档新增分片索引 6 行。AC 证据：保真为「剥离链接目标后 797 条非空行多重集相等」（零丢失），仅链接目标按新目录重算；`node scripts/check-doc-size.mjs` 超阈值 0 / 未匹配 0 / 豁免 0（warning 3 为 M61.3 存量目标）；`pnpm run docs:check:mirror` 通过（未镜像登记 73 篇，3 个新分片各登记一次）；`rg "caomei-ui-migration.md#_15"` 0 命中（5 个文件共 10 处外部入链改指到新分片（视觉回归 README 4 / tech-stack 1 / archive-log 2 / M45 归档 2 / backlog 1））；`gates:docs` 21 项、`check:docs` 八类通过。审计：A `standard` **Reject**（RG-B1 四处文件级指针点名已迁出章节未复扫）→ 修复（platform / M31 归档 / roadmap 归档 / backlog 改指，主档补分片索引指针，4 个代码注释同步分片名）→ R2 `quick` 复审；B `standard` Pass（W1 同源入链 / W2 计数 / W3 审计字段 → 全部收口）。残余：链接文字仍含旧文件名（仅 href 改指，符合 AC④「只动路径」）；镜像清单按语义序而非 ASCII 序登记；`admin.e2e.test.ts:163` 注释指针未改（CRLF 文件，改动会触发 lint-staged 全文件换行，留待格式化批次）。

### M61.3 文档体量健康带回归（P3 📚）

- **目标**：4 篇超标文档回到各自健康带（3 篇行数 warning + `platform.md` 字符 warning），零信息丢失。
- **优先级**：P3（不阻断，但已连续两个阶段挂 warning）。
- **范围**：
  - `docs/design/modules/report-generator.md`（312 行，健康 ≤300）；
  - `docs/design/governance/executor-sandbox-implementation.md`（444，≤400）；
  - `docs/design/governance/pr-delivery-closure.md`（484，≤400）；
  - `docs/standards/platform.md`（24084 字符，≤24000）。
- **验收标准**：
  - ① `node scripts/check-doc-size.mjs` → warning 0 / 豁免 0 / 超阈值 0；
  - ② `node scripts/check-doc-governance.mjs` → 阻断 0 / warning 0；
  - ③ 外移内容落同级分片或 design 段并留索引行：被移段标题在新位置 1 处、原位置 1 处指针（`rg` 逐篇核对）；
  - ④ `pnpm run gates:docs` 全绿（**21 项**，M61.4 已接入 `check-ai-governance`），`check:docs` 0 error；
  - ⑤ 被移段无内容丢失（外移前后非空行数守恒，差值仅来自索引行）。
- **不做什么**：不删信息（一律外移 + 指针，不就地删减）；不改契约表与状态口径；不动 `caomei-ui-migration.md`（由 M61.2 承接）。
- **依赖**：M61.2 完成后开始（豁免清零后计数口径稳定）；触发规则见 [文档规范 §8](../standards/documentation.md#_8-文档治理周期)「每 5 个阶段或连续 2 个阶段出现预算 warning」。
- **交付物**：3-5 commits / 6-8 files / 净删 150-300 行（对应 diff 改动量约 300-600 行，按本阶段头「行 = 改动量含删除」口径计入基线）。
- **风险与缓解**：压缩改语义 → 只做外移 + 指针，不改条文判定；`platform.md` 逼近上限无余量 → 移出实现型细节到 design 分片，保留规范条文与阈值表。

### M61.4 AI 资产机检门禁（P2 🛠️🛡️）

- **目标**：新增 `check-ai-governance` 门禁，把 [AI 资产治理规范](../standards/ai-governance.md) 的规则变成机检，并接入 `gates:docs` 单入口（不另开 CI job）。
- **优先级**：P2（能力缺口：10 个 skill / 3 个 agent 目前全靠人工遵守规则）。
- **范围**：新增 `scripts/check-ai-governance.mjs` + 单测。规则面：
  - ① `.github/skills/*/SKILL.md` frontmatter `name` == 目录名、`description` 非空、`metadata.internal: true`；
  - ② `.github/agents/*.agent.md` 文件名 kebab-case、`name` / `description` 非空；
  - ③ `references/` 文件被 SKILL.md 或索引引用（存在引用即通过，不强制索引文件）；
  - ④ skill / agent 文档内相对链接 file-dead = 0；
  - ⑤ 平台副本符号链接 `.claude/.agents/.opencode` → `.github` 存在（缺失给 warning，不阻断——新工作树未跑 `setup-ai` 属常态）；
  - ⑥ 注册进 `DOC_GATES`（20 → 21 项），同步 `test.yml` 与 `scripts/run-doc-gates.test.mjs` 一致性断言。
- **验收标准**：
  - ① 正例 exit 0，输出含「skills 10 / agents 3 / 规则 6」计数；
  - ② 负例三类各 exit 1（删 `metadata.internal` / 注入断链 / `name` 与目录不一致），命令与输出写入执行记录；
  - ③ `DOC_GATES` 21 项，`pnpm run gates:docs` 通过；
  - ④ 单测覆盖 6 类规则 + 边界（空目录 / 无 `references/` / 软链缺失仅 warning）；
  - ⑤ 扫描面只含 `.github/`（不跟随 `.opencode` 软链，与 ai-governance §2.2 一致）。
- **不做什么**：不校验 SKILL.md 正文长度或触发质量；不读取上游 `cmyr-skills-agents` 台账（避免跨仓第二事实源）；不改既有 skill 内容（除本批必要的 `description` 修正）。
- **依赖**：[AI 资产治理规范](../standards/ai-governance.md) §2.1 / §3 / §5；backlog 候选「AI 基建机检补强」（2026-11-08 登记）。
- **交付物**：3-4 commits / 6-8 files / 350-500 行。
- **风险与缓解**：门禁过严误伤 → 软链缺失只 warning、`references` 有引用即通过、规则集与 ai-governance 条文逐条对应；扫描面与 CI 差异 → 只扫 `.github/`，不跟随软链。
- **执行记录（2026-11-16，2 commits）**：`8e472728` 新增 `scripts/check-ai-governance.mjs` 与单测，六类规则（skill frontmatter / skill 命名 / agent / references 引用 / 文档相对链接 / 平台副本符号链接）逐条对应规范 §2.1 / §2.2 / §3 / §5；引用判定按 token 精确匹配（同名不顶替），索引源限定 SKILL.md 一跳可达（互引孤岛不算已引用）；接入 `DOC_GATES` 与 Test / 周回归同一入口，`package.json` 增 `check:ai-governance`。本条提交同步 `ai-governance.md §6` 机检入口与 §3.1 `description` 必填、`scripts/README.md` 注册表、`release-1.0.md` 与周回归注释的计数。AC 证据：正例 `skills 10 / agents 3 / 规则 6`；三类负例（删 `metadata.internal` / 注入死链 / 改 `name`）均 exit 1 并点名，还原后 md5 一致；`gates:docs` 21 项；定向 44 passed；`lint:check` 0 error / 2 存量 warning；`typecheck` 7 项目 Done；接线核对：`DOC_GATES` 与 `test.yml` 双向一致、weekly 步数 27 与 profile 实测一致。审计：A `standard` **Reject**（RG-B1 CI 步骤缺阻断强度 / 负例 / 自指面三件套；5W）→ 修复 → `quick` Pass（残余 W1-W4 同批收口：注释编号、token 边界、索引可达性、规范出处）；B `standard` **Reject**（RG-B1 周回归「共 26 步」未随集合更新；3W/2S）→ 修复 → `quick` Pass。偏差：脚本与单测合计超出交付物预估（规则面实现比预估更细），未触发拆分阈值；CI 环境因平台副本不入库会固定输出 6 条 warning（不阻断，属预期噪音）。

### M61.5 skill 分发面与 MCP 文档准确性（P2 📚）

- **目标**：`dependfix-remediator` 的 REFERENCES 与已发布的 MCP Server 实际能力对齐（发布状态、tool 清单、入参名）。
- **优先级**：P2（用户按 REFERENCES 调 MCP 会命中不存在的入参名）。
- **范围**：
  - `packages/skills/dependfix-remediator/REFERENCES.md`（权威源）+ `skills/dependfix-remediator/REFERENCES.md`（分发镜像，由 `pnpm sync:skills` 生成）+ `packages/cli/sandbox/skills/**`（gitignored 生成物，重建即覆盖，不直接改）；
  - 对齐 8 个已注册 tool（`fetch_alerts` / `get_last_report` / `run_scan` / `fix_dependency` / `discover_repos` / `cleanup_branches` / `history` / `pnpm_audit`）与 `packages/mcp/src/tools/schemas.ts` 的实际入参；
  - 删除「当前 MCP Server 未发布」表述，改为「MCP 1.0.0 已发布，CLI / MCP 双后端」。
- **验收标准**：
  - ① REFERENCES tool 表与实际 `registerTool` 8/8 对齐，逐项入参核对表写入执行记录；
  - ② `rg -n "当前 MCP Server 未发布"` 全仓 0 命中（含 `--no-ignore` 复核生成物重建后的三处）；
  - ③ `pnpm sync:skills` 后两份受控副本 `diff` 为空，`packages/skills/test/sync-consistency.test.mjs` 通过；
  - ④ `node scripts/sync-skills.mjs` 重建后 `rg --no-ignore` 三处口径一致；
  - ⑤ `pnpm run gates:docs` 全绿（**21 项**，M61.4 已接入 `check-ai-governance`）。
- **不做什么**：不改 MCP tool 实现或 schema；不扩 skill 触发描述；不新增 references 文档。
- **依赖**：`@dependfix/mcp` 1.0.0 已发布（M54）；同步链 `scripts/sync-skills.mjs`；backlog 候选（2026-11-12 复核）。
- **交付物**：2-3 commits / 4-6 files / 150-250 行。
- **风险与缓解**：只改一份副本 → 以 `packages/skills` 为源、跑 sync + 一致性测试；生成物被误提交 → `.gitignore` 已覆盖，提交前 `git status` 自查。
- **执行记录（2026-11-16，2 commits）**：`37e284f0` 把 REFERENCES 工具表从 4 项补齐到已注册的 8 项（`fetch_alerts` / `run_scan` / `fix_dependency` / `get_last_report` / `discover_repos` / `cleanup_branches` / `history` / `pnpm_audit`）并逐字对齐 `packages/mcp/src/tools/schemas.ts`（含 `workDir` 等 camelCase 键）；同步 SKILL.md 能力契约表与探测步骤（8 tool、发布状态、降级路径），契约测试的 `MCP_TOOLS` 与断言同步。本条提交登记 backlog 已知边界「`get_last_report` 在归档布局下取到 `index.json`」并按实际行为收敛断言行。范围扩展说明：SKILL.md 与 `skill-mcp-contract.test.mjs` 不在原「范围」列举内，但同属 skill 分发面且旧文案（4 tool / MCP 预留位）与 REFERENCES 直接冲突，未改工具实现。AC 证据：8/8 tool 与入参逐项对照 `registerTool` + `schemas.ts`；`pnpm sync:skills` 与 `build:sandbox` 后权威源 / 分发镜像 / 沙箱生成物三处 `diff -r` 为空；`rg --no-ignore "当前 MCP Server 未发布"` 除 `docs/plan/todo.md` 计划引文外 0 命中；`packages/mcp/src` + `packages/skills/test` 60 passed；`gates:docs` 21 项；`check:docs` 八类规则通过。审计 `standard` Pass（W1 命名口径概括不实 / W2 断言强于实现，均已修；S4 字段名已按 core 契约更正；S1「表内入参名 ↔ schema」机检未纳入，登记为后续增强）。残余：`get_last_report` 实现未改（改为递归取 `summary.json` 属独立候选）。

### M61.6 文档口径一致性收口（P2 📚）

- **目标**：把 review 检查点矩阵缺行、重叠条款、经验分片范围口径、两处设计快照陈旧一次性收口。
- **优先级**：P2（矩阵缺行会让检查点形同虚设；REFERENCES 之外的第二类 skill 文档漂移）。
- **范围**：
  - a) `.github/skills/code-reviewer/references/code-quality-checklist.md` 补挂 [规划规范 §4.4](../standards/planning.md#_4-4-大批量归档批次操作规范) 第 16-20 条 + [测试规范 §6.12](../standards/testing.md) 行 + 2 条未落点 pattern（「门禁规则扩面前先跑一次性探针量化分布」「E2E 取证临时仓库不要软链 node_modules」）；`code-auditor.agent.md` 按规范单点声明原则只留指针、不抄写条款，本项**不改**其必查项正文；
  - b) 3 处与既有条款重叠改为一行交叉引用（`documentation.md §6` 量化断言 ↔ `planning.md §2.5`；`documentation.md §6` 引用范围措辞 ↔ 同节覆盖面声明；`planning.md §4.4` 第 18 条 ↔ 第 3 条）；
  - c) 经验归档分片范围口径统一（分片维护约定写入「实测内容范围」，文件名沿用建立时上界并注明）+ `experience-archive-§29-§35-integration.md` 段序按编号归位（`## 三十二` 当前排在 `## 二十九` 之前）；
  - d) `docs/design/governance/architecture.md` §技术选型表（231-232 行 Sentry / PWA）补「momei 复用参考，未采用项不在此表承诺」口径并标注未采用项；
  - e) `docs/design/governance/platform-scheduled-batch.md` §6.1 定时计划 CRUD 端点表补 `GET /api/schedules/monitor-status`、§3.1 Schedule 实体补 `kind` 字段（`apps/platform/server/entities/schedule.ts:38`）。
- **验收标准**：
  - ① 矩阵新增 6 行可检索（`rg -n "第 16 条|第 20 条|6\.12|一次性探针|软链 node_modules" .github/skills/code-reviewer/references/code-quality-checklist.md` 命中）；
  - ② `pnpm run check:standards-redundant:strict` 通过，重叠条款改为一行交叉引用后 `rg` 复扫无重复表述；
  - ③ 经验分片维护约定含范围口径句，`§29-§35` 段序按编号升序，`check:docs` 0 error；
  - ④ `architecture.md` 表加口径句且未采用项已标注（`rg -n "未采用"` 命中 Sentry / PWA 行）；
  - ⑤ `platform-scheduled-batch.md` 端点与字段与代码一致（`rg` 实证 `monitor-status.get.ts` + `schedule.ts:38`）；
  - ⑥ `pnpm run gates:docs` 全绿（**21 项**，M61.4 已接入 `check-ai-governance`）。
- **不做什么**：不改 `ai-governance.md` 规则条文；不改检查点矩阵其余行；不重命名经验分片文件；不改设计稿状态（仍为时点快照）。
- **依赖**：M61.4 完成后开始（矩阵属 skill references，先有 AI 机检再改引用面，避免改完又被机检判红）。
- **交付物**：4-5 commits / 6-8 files / 150-250 行。
- **风险与缓解**：重叠条款改交叉引用后覆盖变薄 → 逐条核对被删表述存在唯一权威声明处；段序调整触碰锚点 → `rg "三十二"` 找全引用方并同步，跑 `docs:check:anchors`。
- **执行记录（2026-11-16，2 commits）**：`eb785b11` 检查点矩阵补 planning §4.4 第 16 至 20 条与 testing §6.12（第 16 条含「分片行数计入新增行数」），新增「门禁扩面先跑一次性探针」「E2E 临时仓库不要软链 `node_modules`」两条检查点并留来源指针；documentation §6 的量化断言与引用范围改为指向唯一权威条款（保留文档侧增量），planning §4.4 第 18 条补「按第 3 条」。本条提交补设计稿：architecture 的 Sentry / PWA 标注未采用并限定表下口径；platform-scheduled-batch §3.1 补 `kind`（实体 / Zod / 端点表同源）、§6.1 补 `monitor-status`；experience-archive §5 维护约定改为「范围以实测内容范围为准，文件名沿用上界」，并把 §29-§35 的「三十二」块移到「三十一」之后恢复编号升序（纯位置移动：排序后所有行 md5 一致）。AC 证据：矩阵新增行 `rg` 命中；`check:standards-redundant:strict` 0 命中；分片段序二十九至三十五升序；`rg "未采用"` 命中 Sentry / PWA 两行；`monitor-status.get.ts` 权限与 `schedule.ts:38` 字段逐项一致；`check-doc-size` warning 仍为 3 篇存量、无新增；`gates:docs` 21 项；`check:docs` 八类通过。审计：A `standard` Pass（W1「上条」指代、W2 第 16 条缺计数口径 → 已修；S1/S2 采纳）；B `standard` Pass（W1 §6.4 片段缺 `kind` → 已修）→ R2 `quick` Pass（8/8 closed；S1 措辞、S4 量化口径半句同批采纳）。残余：矩阵既有 3 行含未转义 `|`（本条「不改矩阵其余行」，未动）；§5.1 触发流程图未体现 `kind` 分流；`monitor-status` 行序在动态路由之后（纯可读性）。

### 追加临时待办（不占阶段条目编号）

- **Action 引用口径收敛（2026-11-15 用户授权）** —— 目标：把 `@v1` 从「滚动 tag」口径改为「具体版本 + 依赖机器人 bump」，`v1` 冻结在 1.1.0（用户决策：标签漂移影响可复现性，版本更新交给 Dependabot）。范围：用户可见示例（README / 首页 / quick-start 中英）、设计稿示例、发布指南新增 `### Action 引用策略`、发布记录 1.1.0 段、`v1` tag 补移与 force push。验收：`rg -n 'dependfix@v1[^0-9.]' .`（显式路径 `.`，用「非数字/点」排除 `@v1.1.0` 推荐示例）命中项仅为历史记录、说明文本与本文自身引文（逐条判读）；远端 `v1` 解引用 `80883880`；`pnpm run gates:docs` 通过。风险与依赖：`v1` 冻结后旧引用不再自动收补丁（已在发布指南给迁移指引）；`v1` 回退属破坏性操作，仅在确认无消费者时执行；无代码依赖。关联：backlog「发布链自动更新 major tag」候选（默认不实施）。

- **同名 dependfix 分支残留导致 `push_failed` 死循环（2026-11-16 用户授权，P0）** —— 目标：上一轮 PR 被关闭但 `dependfix/auto-fix-<fingerprint>` 分支未删除时，同指纹下一轮仍能交付；不再永久卡在 `push_failed`。范围：`apps/platform/server/services/executor/platform-delivery.ts`（`pushFixBranchWithCredential` 对 `dependfix/auto-fix-` 前缀用 `--force-with-lease`，期望值经带凭据 `ls-remote` 获取；默认分支 / 非自有分支保持非快进语义）；`packages/engine/src/github/pr-creator.ts`（`pushBranch` 同口径，覆盖沙箱自包含交付）；`platform-delivery.test.ts` + 新增 `pr-creator-push-lease.test.ts`；`docs/design/governance/pr-delivery-closure.md` 补同名分支残留与 lease 边界。验收标准：① 平台用例断言远端同名分支存在时 push 参数含 `--force-with-lease=refs/heads/<branch>:<sha>`，非自有分支不查询、不带 force；② 引擎真实 git 用例：depth-1 克隆 + 兄弟 commit 场景裸 push 失败而 `pushBranch` 覆盖成功，默认分支反例仍非快进失败；③ 定向测试通过（engine `src/github` 18 files / 408 passed；platform `server/services/executor` 15 files / 222 passed）；④ 改动文件 `eslint` 0 error、engine / platform `typecheck` 0 error；⑤ 文档同步且 `pnpm run gates:docs` 通过。不做什么：不改默认分支 / 非 dependfix 分支的推送语义；不做 PR 关闭时的远端分支自动清理（入 backlog）；不解析 `push_failed` message 细分（入 backlog）。依赖：2026-11-16 运行日志复盘 A（`rsshub-never-die` run `68784e5c04401b85`；PR #263 关闭后分支 `dependfix/auto-fix-dc580638` 残留）。交付物：2 commits / 4-5 files / 150-250 行。风险与缓解：force 覆盖误伤 → 仅 `dependfix/auto-fix-` 前缀 + lease 锁定实测 tip；深度克隆无 remote-tracking ref → 先 `ls-remote`；新增网络往返 → 仅在 dependfix 分支推送时发生。容量影响：1 批 / 2-4 files / 150-250 行，未触发 [规划规范 §3.1.1](../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) 阈值（当前 M61 原计划 19-27 commits / 2270-3280 行）。**执行记录**：`82d39195`（fix）+ 本条所在提交（plan 登记）；Review Gate R1 `standard` Pass → R2 `quick` Pass；定向 vitest 8 + 17 passed，全量面 engine `src/github` 408 / platform executor 222（审计方实测）；`gates:docs` 20 项；本地提交未推送。

---

## 上一阶段

M60（平台减法与沙箱可用性）已于 2026-11-15 归档：执行记录见 [archive/todo-archive-phases-m60.md](archive/todo-archive-phases-m60.md)，路线图详情见 [archive/roadmap-phases-m60.md](archive/roadmap-phases-m60.md)。M59（沙箱 fix 与执行可靠性）已于 2026-11-14 归档：执行记录见 [archive/todo-archive-phases-m59.md](archive/todo-archive-phases-m59.md)，路线图详情见 [archive/roadmap-phases-m59.md](archive/roadmap-phases-m59.md)。

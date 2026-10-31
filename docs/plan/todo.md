# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M52 文档平价与验证收口（1.0-F2 批次）** — 4 原子 + 4 批追加临时待办（2026-10-30 / 10-31 用户授权） |
| 下一阶段（已授权，待规划） | **G 发布工程（M53）**（契约冻结 / 迁移指南 / 真实环境矩阵 / `@v1`；台账见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M51 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M51 已归档；M52 进行中；G 待规划） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M52: 文档平价与验证收口（1.0-F2 批次，2026-10-30 规划）

> **阶段目标**：把 1.0 的「文档与验证」欠账收口——双语指南与设计镜像可判、站内锚点真能跳转、视觉基线与覆盖率证据可复现。
> **来源**：[release-1.0-readiness.md](../design/governance/release-1.0-readiness.md) §3.1 F2 六项（① en-US 配置指南漂移 ② quick-start en-US 裁剪漂移 ③ 设计镜像结构漂移 ④ 归档双连字符死锚 ⑤ pr-checks 归因标签渲染验证 ⑥ 视觉基线运行间非确定性）+ §3 G5 覆盖率复测；另有 **4 批追加临时待办**（用户授权，不占阶段条目编号，见文末）：2026-10-30 `caomei-ui` 升级到 `1.0.0-rc.1`；2026-10-31 lint 门禁 check 通道与平台存量清理；2026-10-31 任务开局 CI 回执检查与 stylelint 门禁；2026-10-31 依赖 advisory 修复（Test CI 红）。
> **用户决策（2026-10-30）**：① `caomei-ui` 升级按 [规划规范 §3.1](../standards/planning.md)「追加临时待办（不占阶段条目编号）」处理——依赖升级不在插队例外清单内，用户授权只改变「可否进入当前阶段」，不改标记口径；② 设计镜像按「结构映射 + 索引补全」收口，**不重译 60+ 篇 zh 设计文档**（全量镜像已登记 backlog，1.0 后评估）。
> **阶段启动交叉核验（§3.4，2026-10-30 执行角色实测）**：
> - 归档表扫描（`rg` `todo-archive.md` + `archive/*.md`）：F2 六主题 0 命中（仅 `archive-log.md` / M45 分片的候选登记记录，非闭环记录）。
> - `git log --since 2026-10-01`：无对应闭环提交（`7701cc1a` 为 0.6.0→0.7.0 升级，非 1.0.0-rc；`36601ce1` 只钉死告警 fixtures 的 `createdAt`，未解决 dialog-select 基线非确定性）。
> - 文档 / 代码 anchor 逐项确认缺口仍在：两条指南的 en 镜像（`configuration` 缺「环境变量」整节，zh 该节 20 条 `export`，en 0 条；已复核 `retryFailed` / `waitPrChecks` / `closeFailedPr` / `onBaselineRed` 四键 en 侧 0 命中；`quick-start` zh 417 行 / 参数表 26 行 vs en 133 / 11）；en 设计镜像 4 篇 vs zh 67 篇；`--` 形态锚点 **306 处 / 54 文件**（`rg -o '\]\([^)]*#[^)]*--[^)]*\)' docs -g '*.md'` 实测；`check:docs` 的 `normAnchor` 剥离 `-` 故不报）；`pr-checks-light` 基线无归因行；`dialog-select-open-dark` 非确定性候选仍开放。
> **容量评估（§1.1）**：F2 六项 + G5 按「文档平价 / 验证证据」聚类为 **4 原子**（在 5-6 项上限内）；另有 4 批追加临时待办（依赖升级 / lint 门禁 / 任务开局 CI 检查与 stylelint / 依赖 advisory 修复，均不占编号）。原子类型分布 📚 2 + 🧪 2（🛠️ / 🎨 缺口由追加批次承担——其性质为依赖升级 + 视觉基线，按 §3.1 不计入本批类型平衡）。**原子总量预估**：33-49 文件 / 1070-1820 行文本 / 10-12 commits；**追加批次预估**：caomei 批 15-25 文件（含 10-18 张视觉基线）/ 300-500 行文本 / 3-5 commits；2026-10-31 的 lint 门禁批（25 文件）与 CI 规则批（20 文件）按各自条目量级单列，不并入该预估；**阶段总量（含追加）**仅对 caomei 批得出 48-74 文件 / 1370-2320 行 / 13-17 commits，后两批另计。
> **§3.1.1 容量再平衡记录**：插队 **4 批**（2026-10-30 依赖升级 / 2026-10-31 lint 门禁 / 2026-10-31 任务开局 CI 检查与 stylelint / 2026-10-31 依赖 advisory 修复，均为用户直接指示授权；阈值 1「累计插队批次 ≥3」已命中，四批量级见各自条目），**caomei 批**按阶段启动原子基线 **33-49 文件 / 1070-1820 行 / 10-12 commits** 计：占文件 **45.5%-51.0%**（上界触阈值 2）、行 27.5%-28.0%、commits 30.0%-41.7%（区间为同档配对）。**lint 门禁批 25 文件 / 8 commits、CI 规则批 20 文件 / 4 commits、依赖修复批 9 文件 / 4 commits**，按同一基线分别占 51%-76%、41%-61% 与 18%-27%（累计已远超 100%，阈值 1「累计插队批次 ≥3」同时命中）。处置：**四批均为用户明确指示 / 直接授权的插队**，再平衡移出 **0 项**（风险面为依赖、CI 与治理文档，未新增业务模块或数据面）；若后续追加批次超预估（>25 文件 / >500 行 / >5 commits）则重新评估。
> **原子间依赖**：M52.1（锚点门禁先收紧）→ M52.2 / M52.3（新增链接必须用新形态）；M52.4 ← 追加批次（升级会重建 pr-checks 基线）。
> **交付顺序**：追加批次（caomei-ui 升级）→ M52.1 → M52.2 → M52.3 → M52.4。

### M52.1 [P1 🧪] 归档锚点按产物 id 迁移 + 门禁归一化补强（已完成 2026-10-31）

- **目标**：站内锚点真正可跳转——把文档侧 `--` / 数字前缀写法迁移为 VitePress 产物 id，并让门禁能拦住旧形态。
- **已核缺口（2026-10-30 实测）**：`docs/**` 中 `--` 形态锚点 **306 处 / 54 文件**（`rg -o` 实测）；VitePress 产物侧非词字符收敛为单连字符、数字开头章节带 `_` 前缀；`scripts/check-docs.mjs` 的 `normAnchor` 剥离全部标点（含 `-`）→ 门禁不报；本项合并原 backlog 两条候选（`--` 死锚家族 + M0-M48 存量锚点与产物 id 失配）。
- **范围**：`docs/plan/**`（含 `archive/` 分片）与 `docs/design/**` 的跨文档锚点；`scripts/check-docs.mjs`（新增「产物 id 形态」校验或修正归一化）+ 单测负例；`docs/standards/documentation.md` 锚点书写口径（以 `docs:build` 产物 id 为权威的条款补执行方式）。**范围扩围（2026-10-31 用户明确授权）**：站点外 md 一并迁移以消除双口径——`AGENTS.md`（5 行 / 6 处）、`.github/agents/**`（2 文件 / 13 处）、`.github/skills/**`（2 文件 / 12 处，经软链同步到 `.opencode/skills`）、根 `README.md`（1 处）、`scripts/README.md`（4 处）、`apps/platform/tests/visual/README.md`（4 处）；其余 `docs/**`（`standards` 9 / `i18n` 5 / `research` 2 等）因站点构建面本就覆盖而随本批迁移。
- **验收标准**：① 迁移脚本生成改写清单，逐文件 diff 可审计（不手改 300+ 处）；② `docs:build` 后抽样 ≥20 个锚点在 dist HTML 中命中（脚本比对 id）；③ 新增门禁负例（写入旧形态 → exit 1，跑后还原）；④ 全部门禁绿。
- **不做什么**：不改 heading 文本（避免影响其他链接）；不改归档正文语义；不打开 `ignoreDeadLinks`。
- **依赖**：无（应先于 M52.2 / M52.3 完成）。
- **交付物**：预估 3 commits / 15-25 文件 / 120-220 行（含脚本约 80 行）；**拆分依据**：文件数由「54 个文件各改若干链接」的机械迁移决定，单文件改动通常 <10 行，不构成逻辑耦合。**实测规模（2026-10-31）**：脚本 6 个（含 4 个测试）/ 锚点迁移 96 个 md（`+614 −610`，单文件最多 11 行）/ 5 处人工改指；行数低于 800 行硬阈值，拆分结论不变（plan / design / 站点外文档 / 工具与门禁四段提交）。
- **风险与缓解**：产物 id 规则随 VitePress 升级变化 → 门禁以「构建产物实测 id」为权威而非硬编码规则；迁移面广 → 脚本 + 抽样实证 + 逐文件 diff，分 plan / design 两批提交。
- **已核缺口修正（2026-10-31 实测）**：真实缺口远大于预估的 306 处 `--` 形态——按产物 id 全量比对后需改写 **696 处 / 97 个文件**（除 `--` 家族外还有「数字开头缺 `_` 前缀」「行内代码参与 slug」「标题截断的历史锚点」三类）。
- **闭环（2026-10-31）**：口径下沉 `scripts/docs/vitepress-slug.mjs`（对齐 VitePress 1.6.4 slugify：NFKD 全角归一、`--` 收敛、数字开头 `_` 前缀、`{#custom}` 自定义锚点、重复标题 used-id 自增去重，行内 HTML 标签剥离而标签内文本保留），157 个页面的推算 id 与 `docs:build` 产物**逐个一致（0 差异，已由 `docs:check:anchors` 的 slug 口径自校验固化进 CI）**；`scripts/docs/migrate-anchors.mjs` 机械迁移（精确 id → 宽松唯一 → 唯一前缀三级判定，歧义 / 未命中不擅自改，plan 与 apply 共用 `fenceMask` 跳过代码块），`--write` 后重跑为空（幂等）；新增 `check:docs` 第 8 条规则 `anchor-id`（锚点逐字符等于产物 id，报错带目标文件与应改成的 id）、`docs:check:anchors`（`docs/verify-anchor-dist.mjs`，以产物 HTML 的真实 `id` 复核，已接入 `gates:docs` 紧随 `docs:build`）+ 4 份单测（迁移脚本字符级保留 / 代码块不改写 / 幂等回归）；`collectTitles` 与 VitePress 同源（行内代码内容参与 slug，否则新形态锚点会被宽松比较误判）。门禁负例实测：把一处锚点写回 `#2-四条基本原则` → `anchor-id` exit 1 并给出 `#_2-四条基本原则`，同一输入在 `links` 规则下仍为绿（口径差异的直接证据）。5 处无法机械判定的历史锚点（2 处同名标题歧义 + 3 处标题文本已变）人工改指。证据：`gates:docs` 17 项、`scripts` 单测 924 passed、`docs:check:anchors` 783/783（157 页，slug 自校验 157/157）、`migrate-anchors` 幂等 0 处、`lint:check` 0 error（0 error / 11 warning）、`typecheck` 7 包。

### M52.2 [P1 📚] en-US 指南平价（配置指南 + quick-start）+ 平价机检

- **目标**：两篇英文指南与 zh 事实源同源（章节结构 + 配置键 / 参数键位），并加 L1 机检防止再次漂移。
- **已核缺口（2026-10-30 实测）**：`configuration.md` zh 6 节 / en 5 节（en 缺「环境变量」整节；zh 该节 20 条 `export`）；已复核 `retryFailed` / `waitPrChecks` / `closeFailedPr` / `onBaselineRed` 四键 en 侧 0 命中（backlog 2026-10-26 口径记 16 行漂移，实测以脚本首次运行为准）；`quick-start.md` zh 417 行 / 参数表 26 行 vs en 133 行 / 11 行（缺 `--commands` / `--history` / `--verbose` / `--commit` 等）。
- **范围**：`docs/i18n/en-US/guide/{configuration,quick-start}.md`；新增 `scripts/docs/check-guide-parity.mjs` + 自测（负例直接改写临时副本断言 exit 1）；`package.json` 与 `DOC_GATES`（`gates:docs` 集合）接线；`docs/standards/documentation.md` 补「指南平价」机检口径。
- **验收标准**：① 两篇 en 镜像覆盖 zh 的全部 H2 与「配置键 / CLI 参数 / env 变量」键位（脚本 0 差异）；② 脚本负例可复现（删一条键位 → exit 1）；③ `gates:docs` 全绿、`docs:build` 无死链；④ 平价清单的豁免项（如 zh 专有历史叙事）逐条登记理由。
- **不做什么**：不改 zh 事实源内容（除必要锚点）；不翻译与运行无关的历史叙事；不覆盖设计文档镜像（M52.3）。
- **依赖**：M52.1（锚点形态门禁先收紧，新增链接按新形态书写）。
- **交付物**：预估 2-3 commits / 6-8 文件 / 500-800 行（翻译为主）。
- **风险与缓解**：翻译引入语义偏差 → 键位以配置 / CLI 代码为权威，只译说明不改事实；机检首跑存量豁免 → 清单显式登记并注明移除条件。

### M52.3 [P1 📚] 设计镜像与台账平价（结构映射 + 索引补全）

- **目标**：zh 设计文档拆分后，en 镜像不再是「过期全量」——已有 4 篇镜像与 zh 结构可映射，治理索引与 1.0 台账入口在 en 侧可达；未重译部分有显式映射清单。
- **已核缺口（2026-10-30 实测）**：en design 仅 4 篇（`architecture` 212 / `index` 41 / `platform-ai-integration` 386 / `spec-and-doc-governance` 137），zh design 67 篇（含 M44.4 拆分分片；`spec-and-doc-governance` zh 已 332 行并拆出 `doc-governance`）；en 治理索引无 `release-1.0-readiness` 台账行。
- **范围**：`docs/i18n/en-US/design/governance/{index,architecture,spec-and-doc-governance,platform-ai-integration}.md`（4 篇全在面内）；新增 `docs/i18n/en-US/design/mirror-manifest.md`（zh 结构 → en 落点的映射与「未翻译」登记）；`docs/standards/documentation.md` i18n 段补「结构映射」口径；`release-1.0-readiness.md` 的 en 入口行。
- **验收标准**：① 4 篇镜像的 H2 与 zh 事实源可映射（多出的分片以映射表指向 zh，不强行重译）；② en 治理索引新增 readiness 台账行且链接可用；③ 未重译的 zh 分片在 `mirror-manifest.md` 逐条登记（无静默缺口）；④ `check:docs` / `docs:build` / `gates:docs` 全绿。
- **不做什么**：不新译 60+ 篇 zh 设计文档（全量镜像登记 backlog）；不改 zh 拆分结构；不承诺 en 与 zh 逐字等价（只承诺结构与入口）。
- **依赖**：M52.2（平价脚本可扩展为 design 结构检查）；M52.1（锚点形态）。
- **交付物**：预估 2 commits / 6-8 文件 / 250-450 行。
- **风险与缓解**：镜像对齐成本失控 → 交付物是「映射清单 + 入口可达」，逐项判定「对齐 / 登记」；不复制 zh 分片以免双维护。

### M52.4 [P2 🧪] 视觉确定性与归因证据补强 + G5 覆盖率复测

- **目标**：消除 `dialog-select-open-dark` 基线运行间非确定性；pr-checks 归因标签获得像素守卫；复测四维覆盖率与 mutation，回填 1.0 台账 G5。
- **已核缺口（2026-10-30 实测）**：backlog「`dialog-select-open-dark` 视觉基线运行间非确定性」仍开放（2026-10-12~13 三次复现约 28px 差异，集中在弹窗内 Select 面板）；`pr-checks-light.png` 基线存在但无带 `attribution` 的失败信号行（视觉面 `attribution` 0 命中）；G5 最近覆盖率读数为 2026-10-18（88%+），需 1.0 前复测。
- **范围**：`apps/platform/tests/visual/{platform-pages.visual.test.ts,dialog-select-layer.visual.test.ts}`、`tests/visual/helpers/fixtures.ts`（归因失败信号与确定性夹具）、必要时的 `data-visual-mask` / 稳定帧等待；`docs/plan/backlog.md`（视觉非确定性候选闭环）；`release-1.0-readiness.md` G5 读数与证据。
- **验收标准**：① `dialog-select-open-dark` 重建 10 轮 + 不带 update 比对 10 轮，字节稳定（或定位为门户 / 抗锯齿噪声后显式遮罩并写明理由，不整块遮罩目标区域）；② 新增 pr-checks 归因失败信号的视觉 / e2e 覆盖，前置断言锁定标签文案与色调 class；③ `pnpm test:coverage` 四维 ≥80% 实测并回填台账，关键模块 mutation 复测无存活；④ 本轮修复的时间边界 flake 纳入「无 flaky 复发」证据链。
- **不做什么**：不为确定性牺牲覆盖；不改业务渲染；不调整覆盖率阈值。
- **依赖**：追加批次（升级后 pr-checks 基线需先重建）。
- **交付物**：预估 3-4 commits / 6-8 文件（含 1-2 张基线）/ 200-350 行。
- **风险与缓解**：非确定性可能源于门户渲染时序 → 先做 10 轮取证再决定「等待稳定帧 / 遮罩 / 夹具钉死」，不直接放宽容差；覆盖率为历史读数 → 以本次实测为准并注明时点。

### 追加临时待办（2026-10-30 用户授权，不占阶段条目编号，P1 🛠️/🎨）：caomei-ui 1.0.0-rc.1 升级与视觉回归（已完成 2026-10-31）

- **目标**：平台组件库由 `0.7.0` 升到 `1.0.0-rc.1`（`next` 通道），消费其主题 token 拆分与组件行为修复，并在视觉 / 行为门禁上留下可审计证据。
- **已核事实（2026-10-30 实测）**：registry `dist-tags.next = 1.0.0-rc.1`（`next` 于 2026-10-30T07:18:39Z 发布；`latest` 仍 `0.7.0`，2026-10-20 发布；距发布已超 `minimumReleaseAge: 60` 分钟窗口）；`engines >=22`（本仓 `^22.23.4 || ^24.22.1` 满足）；`peerDependencies` / `dependencies` / `exports`（13 键）与 0.7.0 **键值一致**（仅 `peerDependencies` 键序不同）；官方 `check:api-surface` 预演为 **0 删除文件 / 0 删除导出**（additive）。变化集中在：① token——新增 `--caomei-color-{primary,success,warning,danger,neutral}-text` 与 `--caomei-color-control-border`（控件边界加深），`text-muted` 值微调；② 组件——button hover/active 反馈、DataTable 全选作用域 / lazy 页内状态 / 键盘横向滚动、badge / tag / message 样式；③ 新增 `sakura` / `forest` / `ink` 预设。
- **范围**：`apps/platform/package.json` + `pnpm-lock.yaml`；`app/assets/styles/_caomei-tokens.scss`（新 token 的明暗档对齐 / 是否覆盖）；受影响的 e2e class 断言（排序图标 / 底色 / 选择状态）；`apps/platform/tests/visual/**`；`docs/design/governance/caomei-ui-migration.md` §15.16（升级实证 + 逐基线量化）；`docs/guide/tech-stack.md` 与 `docs/i18n/en-US/guide/tech-stack.md`（当前升级史只记到 0.6.0，需补 0.7.0 与 1.0.0-rc.1，zh / en 成对同步）。
- **验收标准**：① `pnpm why caomei-ui` 单版本 `1.0.0-rc.1`，`pnpm i --frozen-lockfile` 通过；② build / typecheck / lint 全绿；③ e2e 全量通过（重点 DataTable 受控选择、lazy 分页、行展开）；④ 视觉：先 `--update-snapshots=all` 重建，再**不带 update 连跑两遍**幂等；每张变更基线给出「变更源 → token / 组件」对照与像素量化（门禁口径 + 严格口径，口径见迁移评估 §15.15）；⑤ 受影响契约断言逐条适配并注明守卫意图（不得直接改期望值凑绿）；⑥ 新文本角色 token 在明暗两档对比度 ≥4.5:1（控件边框仅记录值）；⑦ 未采纳新预设，页面外观变化可逐条归因；⑧ `tech-stack` zh / en 版本行成对一致。
- **不做什么**：不改页面布局 / 交互语义（**例外**：2026-10-31 用户授权追加全选适配，新增选择栏使表格下移 36 px，见 §15.17）；不把 `sakura` / `forest` / `ink` 设为默认预设；不改 caomei-ui 仓库；不升级其余传递依赖的显式钉定。
- **依赖**：无（与 M52.4 有「pr-checks 基线先重建」的顺序关系）。
- **容量评估结论（§3.1.1 记录②）**：本批占原子基线文件 45.5%-51.0%（上界触阈值 2）、commits 30.0%-41.7%、文本行 27.5%-28.0%；用户 2026-10-30 明确放行不移出，保留全部 4 原子。
- **交付物**：预估 3-5 commits / 15-25 文件（含 10-18 张基线）/ 300-500 行文本；基线为生成物，文件数不代表逻辑面。
- **风险与缓解**：rc 为预发布 → 精确钉定 + 回滚路径（`pnpm add caomei-ui@0.7.0`）记入升级实证；视觉「低色差 + 大面积」盲区 → 用严格口径统计并逐张归因，不用 `--update-snapshots` 默认行为当证据；DataTable 行为变化 → 先一次性 smoke 监听 `pageerror` / `console.error`，再跑全量 e2e；`minimumReleaseAge` → rc.1 已过窗口，若仓内出现 rc.2 需等待窗口或按 [security.md §5](../standards/security.md) 与 [development.md §5.1.57](../standards/development.md) 的成熟窗口口径处理。
- **闭环（2026-10-31）**：`fdbb4e57`（升级 + token 适配 + 19 张基线 + 守卫用例）、`858e4683`（[§15.16](../design/governance/caomei-ui-migration.md#_15-16-caomei-ui-1-0-0-rc-1-升级实证-2026-10-31) 实证与版本史）、`08baa444`（首批闭环回填）、`9bc7c677`（全选语义适配 + 暗色边界微调）、`6a17b8d6`（[§15.17](../design/governance/caomei-ui-migration.md#_15-17-caomei-ui-1-0-全选语义适配与暗色控件边界微调-2026-10-31-追加) 实证）、`041f0f3c`（边界消费面断言 / exec）、`d4474d8b`（视觉表基准统一）、`12bb03d6`（刷新后按 id 保住已选）、`1735996a`（刷新守卫补记）、`dd996770`（变量收敛 / 无障碍 / 清理容错）、`45b83995`（空筛选入口）、`600e3429`（暗色口径与审计回填）、`90b1b7a9`（守卫判别力收口）。证据：全量 e2e 211 passed / 0 failed（1-2 flaky 重试通过）、视觉 `=all` 重建 20 passed + 两轮 20 passed、定向 DataTable e2e 28 passed（首批）、选择逻辑单测 8 passed、typecheck 7 包、lint 0 error（3 存量）、`gates:docs` 16 项。审计：首批 R1（A deep **Pass** / B standard **Reject**）→ 全收口 → R2 quick **Pass**；追加批次 R1 standard（A **Reject**：提交态 lint 1 error；B **Reject**：视觉表基准混用）→ 全收口 → R2 quick **Pass** → R3 quick **Pass**（R2 的 S1/S2/S3 与措辞建议已在收口提交内落实）。残余：暗色 `control-border` 若换更亮暗面需重算、选择栏仅覆盖 `repos`（§15.17 第 4 条）。系统性 `lint` 缺口已由 2026-10-31 追加条目处置（见下）。

---

### 追加临时待办（2026-10-31 用户授权，不占阶段条目编号，P1 🧪）：lint 门禁 check 通道与平台存量清理

- **目标**：把 lint 从「带 `--fix` 的命令」升级为**可阻断的门禁**——提交态与 CI 都不允许自动修复掩盖 error；同时清零平台独立配置下的存量 error，并让根 / 平台两套规则集都被覆盖。
- **来源**：caomei-ui 升级批次的审计衍生项——根 `lint` 与平台 `lint` 均只有 `--fix` 通道，自动修复会静默改工作区（曾导致「本地绿 / HEAD 红」），且根配置与平台独立配置规则集不同（平台侧存量 20 error / 15 warning）。用户 2026-10-31 明确指示「清理存量；添加门禁」。
- **范围**：根与平台 `package.json` 脚本；`.github/workflows/{test,release,docker}.yml`；根 `eslint.config.js` 注释；平台 11 个存量违规文件；`docs/standards/{development,platform,git,i18n}.md` 与两个 skill 清单；`docs/plan/todo.md` 登记。
- **验收标准**（可复现口径均标注测量方与命令）：① 新增 `pnpm run lint:check`（无 `--fix`）在根与平台均 0 error，且链式覆盖两套配置（测量：本地 `pnpm run lint:check`）；② 平台存量 20 error 清零（测量：`pnpm --filter @dependfix/platform exec eslint . --format json`）；③ Test / Release / Docker 三工作流改用门禁命令（测量：`rg 'pnpm run lint' .github/workflows`）；④ 负例可复现（临时注入 `Array<T>` → exit 1，跑后还原）；⑤ 门禁不修改工作区（跑前后 `git status --porcelain` 一致）；⑥ 告警预算显式登记（根 3/10、平台 11/11），新增告警致超预算即失败；⑦ 标准口径（提交前检查 / 平台质量门禁 / git 规范 / skill 清单）同步。
- **依赖**：无（与 caomei 批次仅共享 `repos.vue` 等文件的既有工具链）。
- **风险与缓解**：平台告警预算按计数维护，清理后需手工下调 → 已在 `platform.md §9` 写明「只可随清理下调」；两套配置长期漂移 → 门禁同时跑两套，漂移会立刻显形；`security-auto-fix.yml` 的产品链保留 `--fix` 语义 → 已在注释中区分门禁与产品链。
- **容量评估（§3.1.1）**：本批 7 commits / 25 文件 / 约 250 行文本（含收口提交），低于阈值 1（≥3 批）与文件阈值，不计入插队再平衡；与 caomei 批次合计仍为上界命中（用户 2026-10-30 已放行）。
- **不做什么**：不删除 `hasLiveJob` 兼容期 API；不拆分 `alerts.vue` / `scans.vue`（存量 `max-lines` 归后续重构）；不改 AGENTS.md（受保护文件，其「lint 必须通过」口径由 `lint:check` 满足）。
- **交付物**：`5a0da483`（存量清理 10 文件）、`86f704a0`（补齐 resource-usage）、`9cb95c1a`（门禁与 CI 6 文件）、`f12029fa`（标准口径 2 文件）、`505abf34`（规划登记）、`1de5ecc3`（跨规范口径同步 6 文件）、`c09d15f4`（条目要素与批量计数）、收口提交（发行/规划口径与计数）。
- **证据**：`pnpm run lint:check` exit 0（根 3 warning / 平台 11 warning；测量方：本地，同命令）；负例注入后 exit 1；`pnpm typecheck` 7 包；platform 单测 181 文件 2381 passed（`pnpm --filter @dependfix/platform test`）；全量 e2e 210 passed（`pnpm test:e2e`；同日 caomei 批次为 211——差 1 为条件 skip 例，见 `scans.e2e.test.ts` 的 skip 分支）；视觉 20 passed（`pnpm test:visual`）；`gates:docs` 16 项。
- **闭环（2026-10-31）**：审计 R1 两分区 **Reject**（A：`resource-usage.ts` 修复漏提交，HEAD 门禁红；B：条目缺目标/依赖/风险/交付物/容量与批量计数）→ 全收口 → R2 quick **Pass**（两分区；其 W1/W2/S2/S3 建议已在收口提交内落实）。

### 追加临时待办（2026-10-31 用户授权，不占阶段条目编号，P2 🧪）：任务开局 CI 回执检查与 stylelint 门禁

- **目标**：把「新任务开局先看 CI」固化为硬规则，并补上 CI 缺失的 CSS/SCSS 门禁；同时按授权把 AGENTS 的 lint 口径对齐到 `lint:check`。
- **来源**：用户 2026-10-31 三项指示——① 授权改动 AGENTS.md；② CI 增加 stylelint 检查；③ 新增「新任务 + 工作区干净 → 检查最近 Actions，最近推送引入的失败要修；严重时提醒用户裁决；进行中任务不检查」规则。
- **范围**（20 文件）：`AGENTS.md`；`.github/agents/{full-stack-master,code-auditor}.agent.md`；`.github/skills/{code-reviewer,conventional-committer,quality-guardian}/SKILL.md`；根 `package.json`；`.github/workflows/{test,release,docker}.yml`；`scripts/regression/run-periodic-regression.mjs` 与其测试；`docs/standards/{development,platform,git,i18n,index}.md`；`docs/guide/release.md`；`docs/plan/{todo,backlog}.md` 登记。
- **验收标准**：① AGENTS 的代码变更 / 提交前置 / 基线检查三处改用 `lint:check`，并新增「任务开局 CI 回执检查」小节（含 5 条判据）；② `pnpm run lint:css:check` 在根可执行且 exit 0，三个工作流各增一步；③ agent 开局协议把 CI 检查作为第 5 步，明确「进行中任务跳过」；④ 标准文档同步（development §9 / platform §9）；⑤ `gates:docs` 全绿（platform.md 不越 30,000 字符阻断线）。
- **依赖**：lint 门禁批次（`5a0da483` 至 `bf06f45c`）已闭环。
- **风险与缓解**：开局检查依赖 `gh` 网络，失败时只记录不阻断；「最近推送引入」判定需要人读日志 → 规则要求只处理与本仓改动相关的失败，避免把 Dependabot 分支噪音带进任务。
- **容量评估（§3.1.1）**：本批 20 文件 / 约 120 行文本 / 1-2 commits，按阶段基线（33-49 文件）计占 41%-61%；与 caomei、lint 门禁两批合计命中阈值 1（3 批），处置=移出 0 项（用户直接指示，见阶段头）。
- **不做什么**：不在任务中途重复检查；不把 stylelint 并入 `lint:check`（保持 ESLint 与样式检查分步、失败定位清晰）。
- **交付物**：AGENTS / 2 个 agent / 3 个 skill / package.json / 3 工作流 / 回归脚本与测试 / 5 个 standards / release 指南 + 本条与 backlog 登记（共 20 文件）。
- **证据**：`pnpm run lint:css:check` exit 0；`pnpm run lint:check` exit 0；`gates:docs` 16 项。
- **闭环（2026-10-31）**：`5fd8220c`（AGENTS 规则）、`4a0c9fa8`（CI 与周期回归门禁）、`4b8729a9`（标准口径）、本提交（计划与 backlog 登记）；审计 R1（A Pass / B Reject：容量评估与计数缺失）→ 全收口 → R2 quick **Pass**（W1-W5 已收口；S1/S2 已处理，S3 单点声明取舍）。
- **批外发现（不属本批）**：开局 CI 检查命中 run `41160837415`（headSha `bf06f45c`）的 `Test` 在 `pnpm audit (prod, moderate+, blocking)` 步骤失败（新增 advisory：`nuxt` / `@nuxt/vite-builder` / `@nuxt/nitro-server` <4.6.3、`node-forge` <1.4.1、`minimatch` <11.0.1、`glob` <14.0.2）；该失败与本批改动无关，已提请用户裁决是否立即修复。

### 追加临时待办（2026-10-31 用户授权，不占阶段条目编号，P0 🛡️）：依赖 advisory 修复（Test CI 红）

- **目标**：修复 master `Test` 的 prod 审计阻断（新 advisory），并清理已可修复的历史豁免。
- **来源**：任务开局 CI 检查命中 run `41160837415`（headSha `bf06f45c`）的 `pnpm audit (prod, moderate+, blocking)` 失败；属 [规划规范 §3.1](../standards/planning.md) 插队例外第 2 类（漏洞问题），用户 2026-10-31 指示「开始修复 test ci 问题」。
- **范围**（9 文件）：`apps/platform/package.json`（`nuxt ^4.6.3`）；`pnpm-workspace.yaml`（`node-forge ^1.4.2`、`glob ^14.0.3` 两个 override；`audit.ignore` 仅保留 minimatch）；`pnpm-lock.yaml`；`.github/release-security-exemptions.json`；`docs/standards/security.md` §5.6/§5.7；`.github/skills/code-reviewer/references/code-quality-checklist.md`；`docs/plan/backlog.md`；`.github/workflows/test.yml`（审计豁免注释）；本条登记。
- **验收标准**：① `pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org` exit 0；② nuxt 4.6.3 / node-forge 1.4.2 / glob 14.0.3 单版本解析，无重复；③ 构建 / typecheck / lint / 单测 / e2e / 视觉全绿；④ `audit.ignore` 与 §5.7 表、发布豁免台账三者一致（node-forge / glob 移除、minimatch 登记理由与复核条件；moderate 不入 §5.9 台账）；⑤ `gates:docs` 16 项。
- **依赖**：无。
- **风险与缓解**：nuxt patch 带入 rollup 4.66 / nitropack 2.13.5 等传递升级 → 以构建 + 全量 e2e + 视觉复核；glob 只有 14.x 修复线，`overrides.glob` 升至 `^14.0.3`（14 仍导出 `glob` / `globSync` / `hasMagic`，仅 build-time 路径，已由 build / lint-md / e2e / 视觉验证）；minimatch 的消费者仍用 v3/v5/v10 API，保留豁免并写入 §5.7。
- **不做什么**：不关闭或放宽审计门禁；不使用 `--ignore` / `--ignore-unfixable`；不对 minimatch 做跨大版本覆盖（eslint / readdir-glob / typescript-estree 仍依赖旧 API）；glob 的覆盖仅在 build / lint-md / e2e / 视觉验证通过后保留。
- **容量评估（§3.1.1）**：9 文件 / 约 50 行文本 / 4 commits，按阶段基线计 18%-27%；四批累计命中阈值 1，处置=移出 0 项（用户直接指示，见阶段头）。
- **交付物**：依赖与 override、锁文件、安全规范与台账、审查清单、backlog、CI 注释、本条登记（9 文件）。
- **证据**：audit exit 0（`1 low | 1 moderate (1 ignored)`，low 为 deepmerge）；nuxt 4.6.3 / node-forge 1.4.2 / glob 14.0.3；build / typecheck / lint:check / lint:css:check / 单测 2381 / e2e 210（2 flaky 重试）/ 视觉 20 / gates:docs 16。
- **闭环（2026-10-31）**：`e2500acd`（依赖与 override）、`1b36b5fd`（安全口径与台账）、本提交（计划登记与 CI 注释订正）。审计 R1 两分区 Reject（glob 豁免不成立 / §5.7 准入冲突）→ 全收口 → R2 A Pass / B Reject（批次记录与实现相反）→ 订正后 R3 quick Pass。

## 阶段收口要求

- **质量门**：逐原子 `pnpm run lint:check` + `pnpm run lint:css:check` + `pnpm typecheck` + 定向测试；跨包改动先 `pnpm -r build` 再 typecheck；阶段收口跑 platform 全量 + e2e + 视觉套件 + `test:coverage`。
- **Review Gate**：每原子至少一轮 `Code Auditor`（`standard`，依赖升级 / 视觉基线改动升 `deep`），Reject 须闭环后复审。
- **台账回填**：阶段完成后在 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md) §3.1 F2 标注闭环与证据、§3 G5 回填读数、§5 F2 批次表同步。
- **归档**：按 [规划规范 §4](../standards/planning.md) 迁出为 `archive/todo-archive-phases-m52.md` + 索引行 + roadmap 状态同步；追加临时待办随阶段归档并在归档块内单列（沿用 M45 / M49 口径）。
- **G 批次衔接**：本批收口后 F1/F2 全部闭环，G（M53）可启动契约冻结与真实环境矩阵；G8 指标采集脚本候选（backlog）在 G 规划时决定是否并入。

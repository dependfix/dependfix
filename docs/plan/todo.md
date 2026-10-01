# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | [M34 治理与体验收口 + 组件库升级与巡检基建](#m34-治理与体验收口--组件库升级与巡检基建2026-09-30-用户决策)（2026-09-30 用户决策启动，6 原子条目） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M33 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M33 已归档；M34 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段

### M34: 治理与体验收口 + 组件库升级与巡检基建（2026-09-30 用户决策）

> **定位**：承接 M33 完整闭环归档后（[todo-archive.md §M33](todo-archive.md#m33-治理债收口--测试基建扩展m331m3311-全部已闭环--2026-09-30-归档)）的 backlog 候选池。2026-09-30 用户决策：**以 M33 期评估完成的「方案 A」（4 项 backlog 待上收候选 + C83 能力扩展）为主，并作适当能力扩展**——追加「caomei-ui `0.3.0 → 0.5.0` 升级（修复弹窗内 Select 下拉面板被裁剪 / 层级错误的用户可见缺陷）」与「视觉回归灵敏度 + 弹窗组件覆盖 + 上游组件问题归因与 issue 上报流程」。共 **6 原子条目**，覆盖 🛠️ 1 + 📦 1 + 🧪 1 + 🎨 1 + 📚 1 + 🚀 1。
>
> **类型平衡复核**：[规划规范 §1.1 L12](../standards/planning.md#11-硬性约束) 建议 🎨 用户体验 ≥ 2 + 🛡️ 技术债 ≥ 1 + 🚀 能力扩展 ≥ 1 + 🧪 测试覆盖 ≥ 1：本批 🎨 1 项（M34.4）⚠️ **缺口显式标注**（承接 M28–M33 同型缺口；候选池无第二条 UX 类可上收项）+ 🛠️ 1（M34.1）+ 🧪 1（M34.3）+ 🚀 1（M34.6）+ 📦 1（M34.2，依赖升级轴）+ 📚 1（M34.5）。合并说明：候选池原有 4 项待上收 + C83 + 用户新增 2 项 = 7 项，超「5-6 项」上限，按「进一出一」把「视觉回归容差」与「组件巡检 + 上游 issue 流程」合并为 M34.3（同属测试基建域，内部按子批次拆 commit）。
>
> **§3.4 三重交叉核验结论**（M34.1–M34.6 全部实测 **0 项重复评估**）：
> - ① **todo-archive 表格扫描**：`rg -n "已闭环|不计入本批|不计入 M\d+|ahead=0.*已推" docs/plan/todo-archive.md docs/plan/archive/todo-archive-phases-*.md` 命中 103 行（历史阶段正常记录）；按候选过滤 `rg -n "C83|caomei-ui|视觉回归容差|space-1|PrimeUI 设计先行稿"` 无候选被标「已闭环」——C83 仅命中 M29.3 登记（`8340c5e`）与 M33 D4「不纳入本批」，caomei-ui 命中 M31 迁移期记录（`0.3.0` 精确锁定）。
> - ② **git log 核验**：`git log --all --oneline --grep="C83"` 仅命中登记 commit `8340c5e`（无实现 commit）；`git log --oneline -- apps/platform/package.json` 最近相关为 `406fd1f`（M31.5 卸载 PrimeVue 并锁定 `0.3.0`），**无 0.4.0 / 0.5.0 升级 commit**；`git log --oneline -- apps/platform/playwright.visual.config.ts` 仅 `1969ad5`（M32.5 创建），容差口径未被后续修改。
> - ③ **代码侧 anchor 实证**：`vitest.config.ts:26-33` 的 `test.exclude` **无** `apps/platform/data/**`；`apps/platform/playwright.visual.config.ts` 仍 `threshold: 0.2` / `maxDiffPixels: 200`；`rg -n -F 'gap: $space-1'` 在 4 个目标文件命中 5 处（`alerts.vue:744` / `ai-config-form.vue:203` / `env-events.vue:370` / `pr-checks.vue:372,398`）；`docs/design/governance/index.md:25` 与 `docs/i18n/en-US/design/governance/index.md:25` 仍标「🔶 未上收 / not yet adopted」；`packages/engine/src/app/repo-fix.ts:786` 仍 `verifyActions.every((a) => a.success)` + [dependency-fixer.md §460](../design/modules/dependency-fixer.md) 明示「既有失败基线未做区分」；`apps/platform/package.json:45` 仍锁 `caomei-ui: 0.3.0`（npm `latest` 实测 = `0.5.0`）。**注**：候选行号存在微漂移（label 间距原记 `alerts.vue:742` → 实测 `:744`），验收以复现命令为准。
> - ④ **决策描述前提矛盾厘清**：本批无「参考 NNN 实施」型描述；C83 的触发实证（M29.3 test 纳入默认链）与 `verification-gate.ts` 回滚判定均在位，候选范围保留。
>
> **§1.7 五步自检结论**：步骤 1（归档表格扫描）→ 无候选已闭环；步骤 2（git log 核验）→ 无候选实现 commit；步骤 3（代码 anchor）→ 6 项候选状态与描述一致；步骤 4（前提矛盾）→ 无矛盾；步骤 5（backlog 描述同步）→ 本批次已按维护规则 5 清出 4 项上收候选 + C83，并对 caomei-ui 延期项追加恢复条件达成注记（见本批 `backlog.md` 改动）。
>
> **跨文件陈旧指针同步**（本批次 working diff 含）：`docs/standards/testing.md:103`（`data/` 产物污染规避）、`:173`（视觉容差盲区）与 `docs/design/modules/dependency-fixer.md:460`（既有失败基线已知限制）三处「登记 backlog 候选」指针已更新为上收落点（对应 M34.1 / M34.3 / M34.6）；`docs/plan/archive/index.md` §5 的 M33 批次登记行同步追加「4 项衍生候选已于 2026-09-30 上收 M34」注记。**代码侧第 4 处指针留待 M34.6 处理**：`packages/engine/src/runners/verification-runner.ts:93` 注释仍写「该路径已登记 backlog C83」——按 [AI 协作规范 §1.4](../standards/ai-collaboration.md) P 阶段不改运行时代码，故落点登记至 M34.6 交付物（D 阶段随该条目一并修正）。
>
> **ahead commits 实证**：阶段启动前 `git rev-list HEAD ^origin/master --count` 实测 = **2**——M0-M33 全部实现 commits 已推送 `origin/master`；本地 ahead 的 2 个 commit 为 M33 **归档批次**（`15ca500` docs(plan) 归档 + `6035313` docs(standards) 蒸馏），按 [AGENTS.md §5 推送禁令](../../AGENTS.md) 等待用户主动推送。

#### M34.1 [P3 🛠️ 工具链治理] 本地 devEx：运行时 `data/` 产物污染 vitest 与 check-docs

- **目标**：使本地 `pnpm test` / `pnpm run check:docs` 不受平台扫描 run 落在 `apps/platform/data/**`（gitignored）的克隆 / 扫描产物影响，避免本地验证出现大量与环境无关的失败与误报。
- **优先级**：P3（非阻塞；CI 为干净检出，本缺口不影响 CI，仅污染本地 devEx）。
- **范围**：`vitest.config.ts`（`test.exclude` 增补 `apps/platform/data/**`）；`scripts/check-docs.mjs`（遍历时跳过 `data/` 等 gitignored 运行时目录）。
- **验收标准**：
  - [ ] 扫描 run 产物在场时 `pnpm test` 不再收集其测试文件（基线：产物在场 636 文件 / 412 failed；叠加 `--exclude 'apps/platform/data/**'` 后 219 文件 / 0 failed）
  - [ ] 产物在场时 `pnpm run check:docs` 仍 EXIT 0（基线：产物在场 986 处问题且**全部**位于 `apps/platform/data/runs/<runId>/`；排除后 EXIT 0 / links 143 / vue-interp 79）
  - [ ] 干净检出下两项检查结果与改动前一致（CI 为干净检出，本缺口不影响 CI）
  - [ ] `pnpm lint` + `pnpm typecheck` 通过
  - [ ] 复现命令：`pnpm test 2>&1 | tail -3` 与 `pnpm exec vitest run --exclude 'apps/platform/data/**' 2>&1 | tail -3` 对比；`pnpm run check:docs 2>&1 | grep -c "apps/platform/data/runs/"`
- **不做什么**：不改扫描 run 的产物落盘位置与清理策略；不改 CI 工作流；不清理既有产物目录。
- **依赖**：M33.7 验证期实证（测量方 = M33.7 执行角色；产物目录 `apps/platform/data/runs/683ba3fe8af7f536/`，约 1.4G，由在跑的扫描 run 生成）。
- **交付物**：1 atomic commit（`chore(test)`：vitest exclude + check-docs 跳过规则 + 回归验证记录）。
- **风险与缓解**：过宽排除模式（如 `**/data/**`）可能误排除真实测试目录；缓解：优先精确 `apps/platform/data/**` 并加注释说明理由。

#### M34.2 [P2 📦 依赖升级] caomei-ui `0.3.0 → 0.5.0`（弹窗内 Select 面板裁剪 / 层级问题修复 + 全链回归）

- **目标**：升级 `caomei-ui` 到 `0.5.0`，消除**弹窗（Dialog）内 Select 下拉面板被裁剪 / 层级错误**的用户可见缺陷，并完成 `0.4.0` / `0.5.0` 破坏性变更核对与全链回归（含防复发用例）。
- **优先级**：P2（用户可见缺陷 + 依赖治理；非插队例外 3 类，经用户直接决策上收）。
- **范围**：`apps/platform/package.json`（`0.3.0` → `0.5.0`）+ `pnpm-lock.yaml` + 受破坏性变更影响的组件（`scan-config-dialog.vue` / `repo-form-dialog.vue` / `import-repos-dialog.vue` 等弹窗内 `CaomeiSelect`，以变更说明逐条比对后确定）+ 主题 / token 文件（`apps/platform/app/assets/styles/_caomei-tokens.scss`、`nuxt.config.ts` 的 `caomeiUI` 接线，如 `0.5.0` 有 token 命名变更）+ 视觉基线复核 + `docs/design/governance/caomei-ui-migration.md`（§15 追加 0.5.0 升级实证）。
- **验收标准**：
  - [x] **升级前复现取证**：在 `0.3.0` 下实测**面板层 z 序错误**（`layerZ=1000` < `dialogZ=1001`，断言失败）+ 截图与场景说明 —— 复现结论推翻「被裁剪」假设：面板经 `SelectPortal` 挂 body、无真裁剪祖先，缺陷实际轴是 **z 序**（0.3.0 面板 z = `--caomei-z-overlay` 1000，与遮罩同级、低于模态 1001，仅靠 DOM 顺序侥幸可见）。证据：`artifacts/review-gate/m34.2/before-*.png`（gitignored）+ [caomei-ui-migration.md §15.14](../design/governance/caomei-ui-migration.md)
  - [x] **升级后同一场景修复**：面板层 z = `1050`（`--caomei-z-dropdown`）> 弹窗内容 `1001`，层级确定；「若 `0.5.0` 未修复则提上游 issue」分支**未触发**（库侧已修复，见 §15.14 第 3 条）
  - [x] `0.4.0` / `0.5.0` 破坏性变更逐条核对并记录结论（三版 tarball `dist` **语义级**比对：77 个 CSS 规范名中 18 个有真实差异；契约类破坏性项 = 表单修饰类 `caomei-select--*` → `caomei-field--*`，已适配 `admin.e2e.test.ts`；同时记录 soft 底色 12%→8%、主按钮 teal-600→teal-700、AutoComplete/MultiSelect/ColorPicker 面板 z 档同批修复、`reka-ui` 三版同锁 `2.10.4`）→ 结论写入 [caomei-ui-migration.md §15.14](../design/governance/caomei-ui-migration.md)
  - [x] 弹窗内 Select 场景新增防复发用例 `apps/platform/tests/visual/dialog-select-layer.visual.test.ts`（2 例：弹窗内首个 Select / 底部翻转 Select；1 项缺陷检出断言 `layerZ > dialogZ` + 4 项环境不变量守卫）
  - [x] **视觉基线复核（§6.7 内容核验）**：`--update-snapshots=all` 强制重建后与 0.3.0 期基线逐像素比对 → **9 张全部变化（合计 450011 px）**，逐张 bbox 与归因见 §15.14 第 4 条；接受上游变更（soft 底 8% 有对比度依据、按钮 teal-700 即平台 M33.9 既定口径）并**重建 9 张基线入库**
  - [x] `pnpm lint` + `pnpm typecheck`（root：platform `nuxt typecheck` + cli / mcp `tsc` 全 Done，0 error）+ platform 单测（1353 passed / 0 failed）+ `test:e2e`（175 passed / 0 failed）+ `test:visual`（重建基线后连跑两遍 9 passed ×2）全部通过
  - [x] 复现命令（复跑）：`pnpm --filter @dependfix/platform build && TMPDIR=/dev/shm pnpm --filter @dependfix/platform test:visual`（视觉套件跑 `.output` 产物，未 build 则验证的是旧产物）
- **不做什么**：不升级到 `1.0`（未发布）；不做组件库大版本适配重构；不改弹窗交互设计；不引入第二组件库；不在 dependfix 侧为上游缺陷做二次封装兜底。
- **依赖**：`caomei-ui@0.5.0` 已发布（npm `dist-tags.latest` 实测）；M31 迁移期实证索引（[caomei-ui-migration.md §15](../design/governance/caomei-ui-migration.md) 已登记 Select 家族 4 类结构差异）；backlog 延期项「caomei-ui 0.x → 1.0 升级回归」恢复条件①「用户指定目标版本」已达成（用户指定 `0.5.0`）。
- **交付物**：1-2 atomic commits（`chore(platform)` 依赖升级 + 破坏性变更适配；`test(platform)` 防复发用例 + 基线更新）。
- **闭环实证**（2026-10-01）：`chore(platform)` 升级（`package.json` + lock）+ `test(platform)` 回归用例 + 基线重建（9 张）+ `docs` 实证（[caomei-ui-migration.md §15.14](../design/governance/caomei-ui-migration.md)）。破坏性契约项 1 项（修饰类改挂）已适配；**同时实证视觉门禁两条盲区轴**——色阈值（可吞整块实底按钮色值变更）与面积预算 `maxDiffPixels: 200`（可吞「少面积 × 高色差」的 Switch 拇指变更），见 §15.14 第 4 条 → 灵敏度议题由 M34.3 承接。
- **风险与缓解**：`0.x` 无 API 冻结窗口，破坏性变更可能波及多处组件；缓解：先取变更说明逐条比对 §15 已登记的差异表（Select 家族：可见根元素为 `SelectTrigger` / 外层 `inline-flex` 定宽 / 无 `#value` 插槽 / `update:modelValue` 载荷为 `OptionValue | null | undefined`），升级后跑全量 e2e + 视觉回归；网络受限时以 `npm pack caomei-ui@0.5.0` 取 tarball 内文件。

#### M34.3 [P3 🧪 测试基建] 视觉回归灵敏度 + 弹窗组件覆盖扩展 + 上游组件问题归因与 issue 上报流程

- **目标**：三合一能力建设——(a) 让视觉回归能检出「同明度色相 / 灰度替换」类外观回归；(b) 把弹窗内浮层组件（Select / Dialog / AutoComplete / Drawer）纳入稳定可复现的覆盖；(c) 建立「页面 / 组件异常 → 判定是否属上游组件库 → 按模板提 issue」的可执行流程，避免同类问题重复发生。
- **优先级**：P3（非阻塞；属检测能力与治理流程建设）。
- **范围**：`apps/platform/playwright.visual.config.ts`（`threshold` / `maxDiffPixels` 口径，必要时引入第二度量）+ `apps/platform/tests/visual/**`（新增弹窗 / 浮层用例 + 基线快照）+ 既有基线复核 + `docs/standards/testing.md §6.7`（口径同步 + 容差盲区）+ 上游问题归因与上报流程的权威落点（初判 `docs/standards/testing.md` 或 `docs/standards/platform.md`，按 [documentation.md §4 单点声明](../standards/documentation.md) 取一处）+ `.github/ISSUE_TEMPLATE/*`（仅在需新增 / 对齐模板时）。
- **验收标准**：
  - [x] **灵敏度复现**：错误基线（实底 neutral 按钮计算样式实测 `#52525b` → 注入 `#0f766e`）在旧口径（0.2 / 200）下 `test:visual` **通过**（自测 6407–6412 差异像素 / 0 超阈；规划期记的 5678 为 M33.9 在另一采样面所得）→ 口径收紧后同一错误基线用例**失败**（5935 超阈）；第二条盲区轴（开关拇指 164 px × 高色差）同批由「通过」翻为「失败」。**注**：改用「降阈值」而非「第二度量」——Playwright 透传 pixelmatch `includeAA: false`，AA 像素不参与计数，故降阈值不放大抖动（见 §6.7「抗噪 ↔ 灵敏度取舍」）
  - [x] 干净基线在方案落地后仍全绿（既有基线 + 新增用例）且连跑两遍不漂移（11 passed ×2；既有 9 张基线零改写）
  - [x] 弹窗内 Select 展开态 ≥ 1 条视觉用例（与 M34.2 配合锁定层级 / 裁剪防复发）：实交 2 例（light / dark），门户面板不在弹窗子树内故用**视口级**截图同时覆盖弹窗 + 遮罩 + 面板；截图口径（`data-visual-mask` + `dynamicMask` 选择器、本用例遮蔽为空集）已写入用例注释；另加「面板有选项且非弹窗后代」防假绿断言
  - [x] 「上游组件问题归因与 issue 上报流程」写入权威文档：落点 **`docs/standards/platform.md §7.5`**（含 5 步：归因判定清单三条 / 取证 / 上报路径（模板优先、缺模板用通用 bug 结构、不因缺模板放弃）/ 模板要素（环境版本 / 最小复现 / 期望与实际 / 截图）/ 本仓侧处置），`testing.md §6.7` 仅留一行指针（遵守规范单点声明）
  - [x] 口径变更同步 `testing.md §6.7`：`threshold` 0.1 + `maxDiffPixels` 100，两条盲区轴各自的灵敏度边界、「抗噪 ↔ 灵敏度取舍」（AA 排除机制 + 对照组零差异反证 + 需观察真实 CI run）与残留边界（面积 < 100 px）均已写明
  - [x] `pnpm lint` + `lint:css:check` + `pnpm typecheck` + `pnpm --filter @dependfix/platform test:visual`（连跑两遍）通过；另补 `check:docs` / `lint:md:check` / `docs:check:i18n` / 平台非 `--fix` eslint / 视觉基线变异检验
  - [x] 复现命令：`page.addStyleTag` 注入按钮色板改动（`.caomei-button--tone-neutral:not(.caomei-button--ghost)`，必须排除幽灵变体——其底色透明，强制实底会制造高色差假信号）后 `pnpm --filter @dependfix/platform test:visual`：`threshold: 0.2` 通过、0.1 失败；取证脚手架跑完即删（结果见下方闭环实证）
- **不做什么**：不改动态区域策略（`data-visual-mask` 保持现状）；不重做基线体系；不覆盖其它断言语义；不在 dependfix 侧为上游缺陷做兜底封装（本条目只负责检测 + 归因 + 上报）。
- **依赖**：M33.9 验证期实证（测量方 = M33.9 执行角色 + A 阶段审计独立复算；Playwright `maxDelta = 35215 × threshold² = 1409`；pixelmatch colorDelta `#52525b↔#0f766e` ≈ 1083.6、`#0d9488↔#0f766e` ≈ 308.8，均低于阈值）；M33.2（视觉 CI job 已转阻断 → 口径调整须保证稳定性，避免误红阻断无关 PR）；M34.2（上游问题归因流程的首个候选案例）。
- **交付物**：2-3 atomic commits（`test(platform)` 容差 / 度量调整 + 基线复核；`test(platform)` 弹窗组件覆盖 + 新增基线；`docs(standards)` 归因流程 + 口径同步）。**粒度说明**：合并条目预计文件数 > 10（含基线 PNG）、行数可能触 [§1.1](../standards/planning.md#11-硬性约束) 阈值 → 按上列子批次独立提交，每个子批次自带验证点。
- **风险与缓解**：下调阈值会放大渲染抖动导致偶发红，而视觉 CI 已转阻断（会阻断无关 PR）；缓解：以「连跑两遍不漂移」为落地门槛，必要时保留面积门槛并引入主色直方图断言作为第二信号；口径变更后观察 1-2 次真实 CI run。
- **闭环实证**（2026-10-01）：3 子批次 —— `test(platform)` 双轴收紧（`threshold` 0.2 → 0.1 / `maxDiffPixels` 200 → 100）+ `test(platform)` 弹窗 Select 展开态基线（light / dark 2 张）+ `docs(standards)` 上游归因流程（platform.md §7.5）与口径同步（testing.md §6.7 / 视觉 README / caomei-ui-migration 前向指针）。**灵敏度取证**（临时脚手架，跑完即删）：色阈值轴 6407–6412 差异像素在旧档 0 超阈、新档 5935 超阈；面积预算轴 164 px 在 200 档通过、100 档失败；未注入对照组在 `maxDiffPixels: 1` 下零差异；新基线经变异检验（面板底色 13085 px / 面板位移 823 px）确认确覆盖门户面板。**A 阶段审计**：按模块分区并发（平台实现面 `standard` / 文档治理面 `deep`）第 1 轮均 Pass（0 blocker），修复点第 2 轮 `quick` 复审均 Pass——记录 `artifacts/review-gate/2026-10-01-m34.3-visual-gate.md`（gitignored）。**遗留**：口径收紧后须观察 1-2 次真实 CI run（视觉 job 已阻断，异常则回退或引入第二度量）；残留盲区 = 影响面积 < 100 px。

#### M34.4 [P3 🎨 用户体验] 非弹窗表单 label↔控件间距统一（4px → 8px）

- **目标**：把「label↔控件间距」统一为 `$space-2`（8px），覆盖弹窗以外的表单 / 过滤工具栏，与 M33.8 已统一的弹窗口径一致。
- **优先级**：P3（非阻塞；属体验一致性收口）。
- **范围**：`apps/platform/app/components/ai-config-form.vue`（`__field`）+ `apps/platform/app/pages/alerts.vue` / `pr-checks.vue` / `env-events.vue` 的 `__filter-field` + 受影响视觉基线。
- **验收标准**：
  - [x] 上述 4 个文件中的 label↔控件间距统一为 `$space-2`：实改 **4 处**（`ai-config-form.vue:203` / `alerts.vue:744` / `env-events.vue:370` / `pr-checks.vue:398`）。**`pr-checks.vue:372` 归属 `&__summary-byconclusion`**（横向 `flex-wrap` 摘要标签行，度量的是标签间距而非 label↔控件）→ 按「不做什么（不改其它间距刻度）」排除；复扫后该文件仅剩此 1 处符合预期
  - [x] 浏览器实测各页 label↔控件间距 = 8px（计算样式）：四页（`/settings` 的 ai-config-form、`/alerts`、`/pr-checks`、`/env-events`）改前 `gap: 4px` / 控件顶−label 底 = 4 → 改后 `gap: 8px` / delta = 8；且 **label 矩形与控件 left/height 均不变、控件恰下移 4px**（纯垂直偏移）
  - [x] 受影响视觉基线更新（**恰好 3 张**：`alerts-light` / `alerts-dark` / `pr-checks-light`；`alerts-right-*` 元素级补拍、`repos-*`、两张弹窗基线、`login-light` 均未受影响），且逐张核验差异**仅为间距引起的定位偏移**：canvas 逐像素分析三张均为「首个差异行之上逐字节全同 + 最佳垂直位移 = 4 + `new[y] === old[y-4]` 相等比例 1.0」（无其它视觉变更）
  - [x] `pnpm lint` + `lint:css:check`（首轮命中 `comment-empty-line-before` 已修）+ `pnpm typecheck` + `pnpm --filter @dependfix/platform build`（样式类改动必跑，且为视觉套件前置）+ `test:visual`（连跑两遍 11 passed ×2）通过
  - [x] 复现命令：`rg -n -F 'gap: $space-1' <4 文件>`（`-F` 关闭正则，避免 `$` 被当作行尾锚点）——改后仅剩 `pr-checks.vue:372`（已排除项）
- **不做什么**：不改弹窗（M33.8 已统一）；不改控件高度 / 字号 / 其它间距刻度；不改 `repos.vue` 的 `.batch-form*`。
- **依赖**：M33.8（弹窗侧口径统一完成，本条为其非弹窗侧补全）。
- **交付物**：1 atomic commit（`fix(platform)` 间距统一 + 基线更新）。
- **风险与缓解**：列表页过滤工具栏间距变化会带动多张基线；缓解：逐张像素核验差异仅由间距偏移导致，必要时按内容重建单张基线。
- **闭环实证**（2026-10-01）：1 atomic commit（`fix(platform)` 4 处间距值 + 3 张基线重建）。**取证**：计算样式探针（改前 4px / 改后 8px，label 矩形不变、控件仅下移 4px）+ 基线逐像素位移归因（三张 `bestOffset=4` / 相等比例 1.0）——脚手架跑完即删，日志留 `artifacts/m34.4/`（gitignored）。**A 阶段审计**：`standard` 第 1 轮 **Pass**（0 blocker / 0 warning），记录 `artifacts/review-gate/2026-10-01-m34.4-gap-unify.md`。**范围穷举**（同根因 pattern 的其它落点，均在本条目范围外，未扩范围）：`repos.vue` 的 `.batch-form__field`（与本批 4 处同构，但「不做什么」显式排除 `.batch-form*`，**待用户决策是否另立候选**）、`batch-runs.vue` 的 `__stat`（统计卡：值 + 标签堆叠）、`credentials.vue` 的 `__pem-fingerprint`（标题 + 代码堆叠）、`run-detail-dialog.vue` 的 `__meta-item`（弹窗内信息展示项）、`alert-run-sidebar.vue` 的 `.alerts-run-cell` / `.alerts-sidebar-actions`（表格单元 / 按钮间距）。

#### M34.5 [P3 📚 文档治理] PrimeUI 设计先行稿与索引状态同步

- **目标**：消除「未上收设计先行稿」的陈旧状态描述，使其与 M25.1 降级已实施、M31.5 已卸载全部 PrimeUI 依赖的事实一致。
- **优先级**：P3（非阻塞；文档状态准确性）。
- **范围**：`docs/design/governance/primeui-themes-v2-downgrade.md`（降级方案正文与状态口径）+ `docs/design/governance/index.md:25` 与 `docs/i18n/en-US/design/governance/index.md:25`（索引行状态「🔶 设计先行稿（backlog 候选，未上收）」）。
- **验收标准**：
  - [ ] 索引行状态改为与事实一致（已实施 / 已随 M31 收口 / 归档），不再标「未上收」
  - [ ] 设计稿正文标注实施结果与卸载结论（PrimeVue 全链已由 caomei-ui 替代）
  - [ ] `pnpm run check:docs` EXIT 0；`pnpm docs:check:i18n` 通过；zh-CN / en-US 两侧索引一致
  - [ ] 复现命令：`rg -n "未上收|not yet adopted" docs/design/governance/index.md docs/i18n/en-US/design/governance/index.md`（同行 23 / 24 的其它两条设计先行稿状态**不在本条目范围**，仅处理 `:25` PrimeUI 行）
- **不做什么**：不重写设计稿历史正文（保留当时的方案与 License 分析）；不改 `caomei-ui-migration.md`（M33.3 已同步其遗留条目）；不顺带处理同一索引表第 23 / 24 行的其它设计先行稿状态。
- **依赖**：M33.3 A 阶段审计发现；M25.1（降级实施）+ M31.5（PrimeVue 全链卸载）。
- **交付物**：1 atomic commit（`docs(design)` 状态口径同步 + 索引一致性）。
- **风险与缓解**：索引双语文件需同步修改，易漏一侧；缓解：以 `pnpm docs:check:i18n` 与双侧 `rg` 复核。

#### M34.6 [P3 🚀 能力扩展] C83 验证链「既有失败基线」判定

- **目标**：目标仓库在修复前就存在的验证失败（尤其测试套件长期红）不再被计入本次修复，避免合法修复被门禁回滚、使仓库变得「不可用」。
- **优先级**：P3（非阻塞；当前口径与既有 install/lint/build 的「假定 pristine 检出可通过」一致，仅在目标仓库测试长期红时暴露）。
- **范围**：`packages/engine/src/app/helpers.ts`（`verifyProject`）+ `packages/engine/src/app/repo-fix.ts`（修复流程接入点）+ `packages/engine/src/runners/verification-gate.ts`（判定口径）+ 陈旧指针修正 `packages/engine/src/runners/verification-runner.ts:93`（注释「该路径已登记 backlog C83」→ 指向本条目，A 阶段审计 RG-W1 落点登记）。
- **决策点（实施时敲定并记录依据）**：基线时机（修复前 pristine 全链 vs 仅对 test 懒基线 vs 目标仓库配置豁免）；判定粒度（命令级 vs 仓库级）；审计口径（如新增错误码 `PRE_EXISTING_FAILURE` 供报告单列）。
- **验收标准**：
  - [ ] 修复前即为红的命令不再导致本次修复被回滚，且报告显式区分「本次引入的失败」与「基线已存在的失败」
  - [ ] 单测覆盖：基线红 + 修复后仍红（不归因本次）／基线绿 + 修复后红（归因本次并回滚）
  - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
  - [ ] 现状实证保持成立：`packages/engine/src/app/repo-fix.ts:786` 原判定为 `verifyActions.every((a) => a.success)`；`DEFAULT_VERIFY_COMMANDS` 为唯一事实源
- **不做什么**：不改单命令超时；不引入 CI 等价全量（coverage / e2e）；不在本条目内做目标仓库 CI 状态查询。
- **依赖**：M29.3（触发实证：test 纳入默认链后暴露该限制）；`verification-gate.ts`（回滚判定）。
- **交付物**：方案敲定后 1-3 atomic commits（`feat(engine)` 基线判定 + 报告口径 + 单测；含 `verification-runner.ts:93` 陈旧注释指针修正）。
- **风险与缓解**：懒基线需在修复后回跑 pristine 状态，涉及工作区切换（`git stash` / 临时 worktree），实现复杂且易引入新的状态污染；缓解：优先评估「命令级基线 + 修复前一次性采样」的简单形态，避免修复后回跑。

#### 阶段决策记录

- **D1**：组合定型（用户 2026-09-30 决策）——以方案 A（4 项 backlog 待上收候选 + C83 能力扩展）为主并作适当能力扩展，追加 caomei-ui `0.5.0` 升级与组件巡检 / 上游归因流程；共 6 原子条目，类型平衡 🛠️ 1 + 📦 1 + 🧪 1 + 🎨 1 + 📚 1 + 🚀 1（🎨 缺口显式标注）。
- **D2**：M34.2 升级目标版本 = `0.5.0`（用户指定，npm `latest` 实测一致）；触发 backlog 延期项「caomei-ui 0.x → 1.0 升级回归」恢复条件①（用户指定目标版本），该升级观察项保留至 `1.0` 发布后的正式升级回归。
- **D3**：M34.3 = 「视觉回归容差灵敏度」与「弹窗组件覆盖 + 上游组件问题归因 / issue 上报流程」**合并**为一条测试基建条目（受「5-6 项」上限约束，按「进一出一」处理）；内部按子批次拆独立 commit，边界见该条目交付物。
- **D4**：弹窗内 Select 缺陷现象由用户确认为「**面板被裁剪 / 层级错误**」；M34.2 验收以此锚定，且 D 阶段第一步必须在 `0.3.0` 下复现取证。
- **D5**：执行顺序建议 M34.2（组件库升级，渲染面变化最大）→ M34.4（间距统一，动多张基线）→ M34.3（容差 + 新增用例 + 基线复核），避免视觉基线被二次改写；M34.1 / M34.5 / M34.6 与上述无耦合，可并行推进。
- **D6**：阶段启动 commit 仅改**规划与文档指针**（`docs/plan/*` + `docs/standards/testing.md` + `docs/design/modules/dependency-fixer.md` 的陈旧指针），**不含运行时代码**（[AI 协作规范 §1.4 P 阶段规划暂停协议](../standards/ai-collaboration.md)），提交后暂停等待用户指令进入 D 阶段。
- **D7**（A 阶段审计收敛）：第 1 轮 `standard` 审计 **Pass**（0 blocker / 2 warning / 3 suggest）。warning 处置——**RG-W1**（代码侧第 4 处陈旧指针 `packages/engine/src/runners/verification-runner.ts:93`「该路径已登记 backlog C83」）按 P 阶段不改运行时代码原则**落点登记**至 M34.6 交付物，并在上文「跨文件陈旧指针同步」显式说明；**RG-W2**（D6 措辞与 working diff 不一致）本批修正为「规划与文档指针」。suggest 采纳：**RG-S1**（archive/index.md 的 todo.md 行数基线 152 → 154）/ **RG-S2**（M34.1 / M34.3 依赖段补测量方标注）；**RG-S3**（历史归档段补「已上收 M34」注记）**不采纳**——保持历史归档段冻结惯例（M32 段 C93/C94 上收 M33 时亦未回改）。

---

### 阶段约定

- 每个原子条目闭环前必须通过 `pnpm lint` + `pnpm typecheck` + 定向测试；涉及打包 / 入口 / 导出变更时追加 `pnpm build`。
- 涉及视觉基线（M34.2 / M34.3 / M34.4）的改动：视觉 CI job 已转阻断（M33.2）——本地须连跑两遍 `pnpm --filter @dependfix/platform test:visual` 不漂移后再推送，避免误红阻断无关 PR。
- 每条改动进入 A 阶段 `Code Auditor (代码审计员)` Review Gate；放行后方可进入 V / T / F。
- 提交按 [AGENTS.md §提交规范](../../AGENTS.md)（`conventional-committer` skill + 原子粒度）；推送仅限用户明确要求。

# caomei-ui 迁移：版本升级实证（§15.14-§15.17）

### 15.14 caomei-ui 0.5.0 升级实证（M34.2，2026-10-01）

> **升级动机**：用户报告弹窗（`CaomeiDialog`）内 Select 展开时下拉面板「被裁剪 / 层级错误」；同时触发 backlog 延期项「caomei-ui 0.x → 1.0 升级回归」恢复条件①（用户指定目标版本 = `0.5.0`）。本节省略迁移期（§15.1-§15.13）历史正文，只记录 0.3.0 → 0.5.0 的增量差异、复核结论与**视觉门禁两条盲区轴（色阈值 / 面积预算）的实证**。

**1）版本与差异口径**

- `apps/platform/package.json`：`caomei-ui` `0.3.0` → `0.5.0`（精确锁定；`pnpm-lock.yaml` 同步）。
- 上游 `reka-ui` 在 0.3.0 / 0.4.0 / 0.5.0 三版均为 `2.10.4`（三版 tarball `package.json` 实测）→ **浮层引擎（Popper）无版本变化**，差异只能来自 caomei 自身。
- 差异口径：`npm pack caomei-ui@{0.3.0,0.4.0,0.5.0}` 后对 `dist` 做**剥 `[data-v-*]` 与文件名 hash 的语义级比对**（该仓库无 GitHub releases / tags，`CHANGELOG.md` 不在发布文件内）。
  > **方法论教训**：首次比对用 `grep -o "[^}]*}" | tr ';' '\n' | sort -u` 做归一化，**掩盖了同名规则的取值差异**（如 `z-index` 行），一度得出「Select CSS 逐字节相同」的错误结论；A 阶段审计以语义级比对推翻。后续同类核对一律用语义级 strip + 全文本 diff，不得用行集合 sort -u 近似。
- 语义级比对结果：77 个 CSS 文件规范名中 **17 个存在真实语义差异**（另有 1 个 `auto-complete/..._scoped.css` 仅 `@keyframes` 名内嵌 scope hash 变化，不属语义变更；其余为 hash 重命名）。

**2）变更清单（按性质分类 + 对 dependfix 的影响判定）**

| 类别 | 变更 | 平台使用面 | 影响判定 |
| :--- | :--- | :--- | :--- |
| **契约（破坏性）** | 表单外壳修饰类由 `caomei-select--{sm,md,lg,disabled,invalid}` 改挂 `caomei-field--*`；同批涉及 `input` / `textarea` / `input-number`（平台未引用） | `admin.e2e.test.ts` 2 处断言 | **已适配**：断言改 `caomei-field--disabled`（原生 `toBeDisabled()` 保留，语义不变） |
| **契约（破坏性）** | `Select` 触发器根类新增 `.caomei-field` 基类；`.caomei-select__field--{size}` 与 `.caomei-select--clearable` 保留 | 平台样式未引用旧修饰类（`rg` 复扫 0 命中） | 无额外适配 |
| **层级（本批动机）** | `Select` 面板 `z-index` 由 `--caomei-z-overlay`（1000）改为 `var(--caomei-select-z-index, var(--caomei-z-dropdown))`（1050）；**同批修复 `auto-complete` / `multi-select` 面板（1000 → 1050）与 `color-picker` 面板（`--caomei-z-modal` → dropdown 档）** | `CaomeiAutoComplete`（schedules 时区选择器）/ `CaomeiMultiSelect`（schedules 仓库多选）/ `CaomeiSelect`（弹窗内 8 处） | **正向**：模态内浮层不再依赖 DOM 顺序（详见第 3 条） |
| **视觉（色值）** | `tag` / `message` / `badge` 的 `--soft` 底色 `color-mix(... 12%)` → `8%`（库内注释：12% 时 primary 文本仅 4.37:1 < AA，8% ≥ 4.5:1） | `CaomeiTag` 53 处、`CaomeiMessage` 39 处、Badge | **正向（对比度）**：接受上游口径，平台不覆盖 |
| **视觉（色值）** | `switch` 拇指背景 fallback `--caomei-color-bg` → `--caomei-color-primary-foreground`；`toast` 强调色 fallback `--caomei-color-neutral-solid` → `--caomei-color-text-muted`（`color` 同步补 fallback） | Switch 4 处、Toast 全局 | 低风险；由视觉基线复核覆盖（见第 4 条） |
| **视觉（外壳）** | `input` / `textarea` / `input-number` / `select` 的边框 / 圆角 / 高度 / 焦点 / 非法态样式抽为共享 `.caomei-field` 基类 + 新增 `--caomei-field-*` token（**既有 token 值零变更**：145 个共有 token 无删改）；`styles/index.css` 新增 `[data-preset="minimal"]` 挂载选择器（与 `:root` 同批声明，默认预设下取值不变） | 全部表单控件 | 视觉等价性见第 4 条（`dialog-import-repos` 基线有 Δ≤23 的细微差异；受控 A/B 显示字段区确有小幅渲染变化，判定为外壳取值差异，非缺陷） |
| **新能力** | `Select` 新增 `#value` 插槽（自定义触发器展示）；`Button` 新增 `iconOnly` / `iconPosition`；新增 `CaomeiRichTextEditor`；`DataTable` 新增 `--caomei-data-table-pagination-justify` 钩子（默认值不变） | 未使用 / 未启用 | 无影响；`#value` 可恢复 `import-repos-dialog` owner badge，**不在本批范围**（属交互变更） |
| **a11y / 透传** | 新增 `_shared/panel-idref.js`（面板 id 注册进 Reka combobox 上下文，消除 `aria-controls` 空引用 / 时序漂移）；`auto-complete` / `multi-select` / `dropdown-menu-trigger` / `stepper-*` / `select-group` / `calendar-panel` 的 aria 接线；`color-picker` / `date-picker` 的 `disabled` 透传 | 可达 | 正向（可访问性），无行为契约破坏 |
| **供应链** | 新增传递依赖 `@vavt/cm-extension@2.0.0`（RichTextEditor 用，其 optional peer `md-editor-v3 ^7.1.0` 未安装）；`pnpm-lock.yaml` 另含与本次升级无直接关系的传递解析漂移 `source-map-js 1.2.1→1.2.2`、`ohash 2.0.11→2.0.12` | 未使用 RichTextEditor | 来源为 caomei-ui 自有仓库；平台未启用该组件，不引入新运行时路径；lockfile 漂移为同批 `pnpm install` 副产物 |

> **公开组件口径**（回应审计 RG-W1，原「47 → 48」不可复现）：以 `index.d.ts` 的 `as Caomei*` 导出计 **80 → 81**（推荐口径，可直接复现）；以 `dist/components/` 子目录数计 **48 → 49**（该目录下 `*.vue.d.ts` 文件数为 79 → 80）。三者均只 +1（`CaomeiRichTextEditor`），无移除 / 改名。

**3）层级缺陷的根因、修复与升级前取证**

- **机制**：Reka 的 `PopperContent` 会把面板元素的计算 `z-index` 镜像到 popper 定位包裹层（`contentZIndex.value = window.getComputedStyle(contentElement).zIndex`，`node_modules/reka-ui/dist/Popper/PopperContent.js`）→ **面板 CSS 的 z 档位就是实际层叠档位**。
- **0.3.0（缺陷态）**：面板 z = `--caomei-z-overlay` = **1000**，与模态遮罩同级、**低于** `.caomei-dialog__content` 的 `--caomei-z-modal` = **1001**；面板与模态同处根层叠上下文时，谁能压住对方**取决于 DOM 顺序**（门户在遮罩之后插入才侥幸可见）——即「层级错误」。
- **0.5.0（修复态）**：面板 z 提升到 `--caomei-z-dropdown` = **1050** > 1001；库内注释原文：「层级：面板必须高于模态内容（`.caomei-dialog__content` 等，`--caomei-z-modal`），否则在 Dialog / Drawer 内打开的 Select 会被模态卡片盖住（面板为 popper 挂到 body，与模态同处根层叠上下文，只能靠 z-index 分胜负）」。
- **升级前取证**（同一用例临时降回 0.3.0 运行）：`layerZ=1000` / `dialogZ=1001` → 断言「面板层 z 未高于弹窗内容 z」**失败**；升级后 `layerZ=1050` / `dialogZ=1001` → **通过**。截图 `artifacts/review-gate/m34.2/before-*.png` / `after-*.png`（gitignored）。
- **未复现项（结论修正）**：「面板被裁剪」在扫描场景（弹窗内首个 Select、弹窗底部 Select 向上翻转）均不成立——面板经 `SelectPortal` 挂到 body、`position: fixed`，无「真裁剪祖先」（`body` 的 `overflow: hidden` 属外壳常态且其矩形完整容纳面板）。故用户可见缺陷的实际轴是**层级（z 序）**，且该轴已由 0.5.0 修复，**未触发「提上游 issue」分支**。
- 「同一用例在缺陷态下仅 z 序断言失败、其余四项几何断言均成立」已由 0.3.0 降级复跑固化——即四项几何断言是**环境不变量守卫**（防止未来改用非 portal 实现或引入裁剪容器），唯一**缺陷检出断言**是 `layerZ > dialogZ`。

**4）视觉基线复核（testing.md §6.7 内容核验口径）+ 阈值盲区第二次实证**

强制全量重建基线（`--update-snapshots=all`）后与 0.3.0 期基线逐像素比对，**9 张全部变化**：

| 基线 | 差异像素 | 占比 | maxΔ | bbox | 归因 |
| :--- | ---: | ---: | ---: | :--- | :--- |
| alerts-light.png | 91526 | 7.06% | 244 | (278,207)-(1111,789) | 主体为 severity / source Tag 的 `--soft` 底色（12%→8%）；**`maxΔ 244` 来自其中的 `CaomeiSwitch` 拇指**（`--caomei-switch-thumb-bg` fallback 由 `--caomei-color-bg` → `--caomei-color-primary-foreground` = 亮色 `#0b0b0d`，bbox `(844,207)-(859,222)` 约 14px 实心圆） |
| alerts-dark.png | 91508 | 7.06% | 29 | (278,207)-(1111,789) | 同上（暗色档；暗色 `primary-foreground` 与 `bg` 差异小于亮色，故 maxΔ 较小） |
| alerts-right-light.png | 88544 | 14.77% | 11 | (0,72)-(822,506) | 同上（元素级补拍） |
| alerts-right-dark.png | 88529 | 14.77% | 11 | (0,72)-(822,506) | 同上（元素级补拍） |
| pr-checks-light.png | 25916 | 2.00% | 11 | (497,387)-(1034,634) | 状态 / 结论 Tag 的 `--soft` 底色 |
| repos-light.png | 23814 | 1.84% | 10 | (418,212)-(1035,345) | 标签列 Tag 的 `--soft` 底色 |
| repos-dark.png | 23844 | 1.84% | 9 | (418,212)-(1035,345) | 同上（暗色档） |
| login-light.png | 13864 | 1.07% | 236 | (527,561)-(912,596) | **陈旧基线追平（非升级引入）**：旧基线（M32.5 生成）仍是 teal-600，而 0.3.0 下主按钮**已是 teal-700**（`before-dialog-select-open.png` 实测 teal-700 2245 px / teal-600 0 px）→ M33.9 的 `--caomei-button-bg` 覆盖本就生效，只是当次因阈值盲区未被基线捕获；本批 `=all` 重建时追平 |
| dialog-import-repos-light.png | 2466 | 0.75% | 23 | (16,155)-(743,190) | 弹窗内表单字段 / Select 触发器外壳（field-shell 抽取后取值细微变浅） |
| **合计** | **450011** | — | — | — | — |

- **受控 A/B 佐证**（同一用例、同一状态、仅库版本不同）：`artifacts/review-gate/m34.2/before-dialog-select-open.png`（0.3.0）vs `after-dialog-select-open.png`（0.5.0）逐像素比对 **30322 px 差异 / maxΔ 242（单通道；三通道和为 564，与上表口径统一取单通道）/ bbox (418,212)-(1035,612)**（表体标签列 + 弹窗字段区）——与上表归因一致：升级确实带来渲染差异，而其中 tag 色值与字段外壳两类差异均**低于视觉阈值**，只会在强制重建时显形。
- **基线处置**：接受上述变更（soft 底 8% 有对比度依据；字段外壳差异为壳层取值、非缺陷）→ **9 张基线已按 0.5.0 渲染重建入库**；其中 `login-light.png` 属补追 M33.9 的既有色改，其余以 tag 色值变更为主。
- **第二条盲区轴（同批实证，独立于色阈值）**：`alerts-light` 的 Switch 拇指色差远超色阈值（pixelmatch colorDelta ≈ 3×10⁴ ≫ 1408.6），却仍被 **`maxDiffPixels: 200` 面积预算**吞掉（该图非抗锯齿差异像素实测 **164 ≤ 200**）→ 即「少面积 × 高色差」变更同样可逃逸门禁。两条轴（色阈值 / 面积预算）**已由 M34.3 闭环**（`threshold` 0.2 → 0.1、`maxDiffPixels` 200 → 100），口径与取证见 [测试规范 §6.7](../../standards/testing.md#_6-7-视觉回归-截图识别层-apps-platform)。
- **为什么此前 CI / 本地全绿**（`threshold: 0.2` 盲区实证）：pixelmatch 的 `maxDelta = 35215 × 0.2² = 1408.6`，而 `#0d9488 → #0f766e` 的 delta ≈ 308、Tag `12% → 8%` 合成色差约 Δ(9,4,4)（delta 更小）、字段外壳差异更小 → **全部低于阈值被判「同色」**，故失真基线仍持续通过。这是 [测试规范 §6.7](../../standards/testing.md) 登记的容差盲区，本批给出**两次实证**：① M33.9 主按钮 teal-600 → teal-700 **被吞**（铁证：0.3.0 下 `before-*.png` 实测已渲染 teal-700 2245 px / teal-600 0 px，而旧基线仍是 teal-600 且当时 CI 全绿）；② 本批 soft 底色 12% → 8% 同样被吞。**盲区可吞掉整块实底按钮（385×35）的色值变更**，灵敏度议题**已由 M34.3 闭环**（同口径色对 `#52525b → #0f766e` 实测 6407-6412 差异像素：0.2 档 0 超阈被吞，0.1 档 5935 超阈检出），口径见 [测试规范 §6.7](../../standards/testing.md#_6-7-视觉回归-截图识别层-apps-platform)。
- **方法论教训（本批踩坑，已回填上文第 1 条）**：`--update-snapshots` 不带 `=all` 时**只重写判定为「不匹配」的基线**；在盲区内判定为匹配 → 基线不被重写 → 由此对比得到的「零差异」是**假证据**（本次一度据此得出「视觉零漂移」的错误结论，后经 A 阶段审计质疑 + 元素级探针 + `=all` 强制重建推翻）。§6.7 口径必须用 `--update-snapshots=all` 强制重建后再逐像素 diff。
- **基线陈旧性推论**：因盲区长期吞掉色值变更，本仓既有基线可能混入「陈旧未追平」项（login-light.png 即为此类）——重建后的 9 张基线以 0.5.0 渲染为唯一参考，后续色值类改动仍需按 §6.7 主动核验，不能只依赖绿色门禁。

**5）验证矩阵（M34.2 收口）**

| 检查 | 命令 | 结果 |
| :--- | :--- | :--- |
| Lint | `pnpm lint` | 通过（0 error） |
| Typecheck | `pnpm typecheck`（platform `nuxt typecheck` + cli / mcp `tsc --noEmit`） | 全 Done，0 error |
| 单测 | `pnpm --filter @dependfix/platform test` | 1353 passed / 7 skipped / 0 failed |
| e2e | `TMPDIR=/dev/shm pnpm --filter @dependfix/platform test:e2e` | 175 passed / 0 failed（含类名适配后 admin 组 18/18） |
| 视觉回归 | `pnpm --filter @dependfix/platform test:visual`（重建基线后连跑两遍） | 9 passed ×2，二次运行零漂移 |
| 新增防复发用例 | `apps/platform/tests/visual/dialog-select-layer.visual.test.ts` | 2 例：弹窗内首个 Select、弹窗底部翻转 Select；断言 = 门户到 body + 面板在视口内 + 命中自身 + 无真裁剪祖先 + **面板层 z > 弹窗内容 z** |

**6）观察与遗留**

- 全量顺序运行首轮曾出现 2 例 `api-i18n`（POST /api/repos 重复仓库）语言断言失败：该组为**纯 API 用例、不加载客户端组件库**，升级不可能影响其语义；单文件 7/7 与二次全量 175/175 通过 → 判为共享 SQLite 状态导致的**顺序偶发**，已登记 [backlog §已知边界](../../plan/backlog.md)。
- `_caomei-tokens.scss` 暗色档假设「库基础预设 `--caomei-color-primary-foreground` = `#0b0b0d`（实测 13.29:1）」经 0.5.0 复核**未变**，注释已同步为已复核状态。
- **视觉阈值盲区**（可吞色值变更）不在本批范围 → **已由 M34.3 闭环**（`threshold` 0.2 → 0.1 / `maxDiffPixels` 200 → 100）；本批为其提供了第二条实证与量化基线差异。
- `Select` 的 `#value` 槽可恢复 owner badge（M31.4 因 0.3.0 无该槽而放弃）——登记为后续 UX 候选（不在 M34 范围）。

### 15.15 caomei-ui 0.6.0 升级回归实证（插队热修，2026-10-12）

> **背景（反例记录）**：`a86ac42 build(deps): bump caomei-ui from 0.5.0 to 0.6.0`（dependabot，2026-10-11）**只改 `apps/platform/package.json` + `pnpm-lock.yaml`**，未按 §15.14 口径做迁移实证与门禁回归 → master 的 `Test` job 自该批次起持续失败（CI run `38249528660`：`E2E` 与 `Visual Regression` 两个 job 均失败）。本节的结论之一是**流程性**的：0.6.0 并非纯样式增量，含 2 处**断言级契约变化**。

**1）变更清单（平台命中面 + 处置）**

| 类别 | 变更（0.6.0 实测） | 平台命中点 | 处置 |
| :--- | :--- | :--- | :--- |
| **契约（断言级）** | `DataTable` 在 `sort-mode="multiple"` 下**所有可排序列**都渲染 `.caomei-data-table__sort-index`；未参与排序者带 `--reserved` 修饰符且文本为空（源码 `sortIndexLabel(key)`：`sortState(key) ? String(sortIndex(key)) : ""`）。目的：排序时列宽不再跳动 | `platform-pages.visual.test.ts` 的 `alerts 分组与多列排序` 断言 `toHaveCount(2)` 失败（保留占位使计数 > 2） | **已适配**：断言限定 `:not(.caomei-data-table__sort-index--reserved)` |
| **视觉（占位，全表页）** | 同批 `DataTable` 的**排序图标**也改为全列渲染：未排序列表头渲染 `.caomei-data-table__sort-icon--reserved`（库内 `visibility: hidden` 占位），0.5.0 仅在排序列表头渲染图标 | 全部使用 `DataTable` 的页面（含**单列排序**的 `repos`，其不渲染 `sort-index`，故 `repos-*` 两张基线的唯一变更源就是本项） | **已接受**：库侧 UX 改进（表头不再因排序状态改变布局），不覆盖样式 |
| **视觉（token）** | `dialog` 内容容器底色由 `--caomei-color-bg` 改为 `--caomei-color-bg-elevated`（dist CSS 实测 `background: var(--caomei-color-bg-elevated)`） | `dark-mode.e2e.test.ts` 断言 `contentBackground === rgb(15, 23, 42)`（旧 `bg` 暗色档）失败，实测 `rgb(30, 41, 59)` | **已适配**：期望值改 `rgb(30, 41, 59)`（暗色 elevated `#1e293b`），守卫意图（暗色 ≠ light 近白底 `#f8fafc`）不变；注释同步 |
| **视觉（浮层 / 表体）** | 同批 `Drawer` / `Popover` 背景 `bg → bg-elevated`、`Popover` 圆角 `radius-md → radius-lg`、`Tabs` 列表 overflow / 分隔线重写 | 视觉基线 | **已重建**（10 张，见第 2 条） |

**2）视觉门禁回归与基线处置**

- `--update-snapshots=all` 强制重建 → 11 用例全绿；随后**不带 update 复跑 11 passed**（幂等确认）。
- **变更基线 10 张**：`alerts-light` / `alerts-dark` / `alerts-right-light` / `alerts-right-dark`（表头排序图标与序号保留占位）/ `repos-light` / `repos-dark`（仅排序**图标**保留占位，见上表第 2 行）/ `pr-checks-light`（同 alerts）/ `dialog-import-repos-light`（弹窗内容底色 `bg → bg-elevated`）/ `dialog-select-open-light` / `dialog-select-open-dark`（面板底色 `bg-elevated` + 圆角 `radius-lg`）；`login-light` 未变（该页仅用 `Button` / `Card` / `Input` / `Message` / `Password`，0.6.0 对其只有 `.d.ts` 差异）。
- **逐基线量化（内容核验口径，对应 [测试规范 §6.7](../../standards/testing.md#_6-7-视觉回归-截图识别层-apps-platform) 的「重建 + 逐像素 diff」）**：

| 基线 | 差异像素（门禁口径 / 严格口径） | 严格口径占比 | maxΔ | bbox | 归因 |
| :--- | :--- | ---: | ---: | :--- | :--- |
| alerts-light.png | 35713 / 77355 | 5.04% | 255 | (927,294)-(1392,1016) | 表头排序图标 + 序号保留占位 |
| alerts-dark.png | 36144 / 77425 | 5.05% | 240 | (927,294)-(1392,1016) | 同上 |
| alerts-right-light.png | 用例在整页截图断言处即中止 / 127897 | 14.88% | 255 | (0,7)-(1098,729) | 同上（元素级补拍，随 `=all` 一并重建） |
| alerts-right-dark.png | 同上 / 128095 | 14.91% | 240 | (0,7)-(1098,729) | 同上 |
| repos-light.png | 6201 / 16613 | 1.28% | 216 | (265,255)-(1040,419) | 排序**图标**保留占位（单列排序页，无 `sort-index`） |
| repos-dark.png | 6755 / 16729 | 1.29% | 226 | (265,255)-(1040,419) | 同上 |
| pr-checks-light.png | 11767 / 28707 | 2.22% | 224 | (255,357)-(1217,638) | 表头排序图标 + 序号保留占位 |
| dialog-import-repos-light.png | 未超阈（用例判通过）/ 275248 | 84.23% | **7** | (0,0)-(759,429) | 弹窗内容底色 `bg → bg-elevated`（亮色 `#ffffff` → `#f8fafc`：每通道仅差 3-7 → **低色差大面积的典型阈值盲区**） |
| dialog-select-open-light.png | 2752 / 238298 | 18.39% | 122 | (265,107)-(1040,792) | 面板底色 `bg-elevated` + 圆角 `radius-lg`（门户面板 + 遮罩叠色） |
| dialog-select-open-dark.png | 3075 / 239352 | 18.47% | 124 | (265,107)-(1040,792) | 同上 |

  - **口径说明**：**门禁口径** = Playwright 报出的差异像素数（pixelmatch，`threshold` 见 [测试规范 §6.7](../../standards/testing.md#_6-7-视觉回归-截图识别层-apps-platform)）；**严格口径** = 本次一次性脚本按「任一通道绝对差 > 0」统计（含抗锯齿等亚阈值差异，故恒 ≥ 门禁口径），`maxΔ` / `bbox` 同取该口径。两列并列给出，既保留门禁判定值又给出完整差异面。
  - **结论**：10 张基线与 0.6.0 语义变更面**一一对应**，无越界变更；`dialog-import-repos-light` 属「低色差 + 大面积」盲区实证（`maxΔ=7` 而覆盖 84% 面积，门禁仍判通过）——与 §15.14 第 4 条登记的盲区轴同源。
- **门禁判定与处置**：9 张需 `=all` 重建追平（7 张经门禁判失败并取得差异值；`alerts-right-*` 2 张因用例在整页截图断言处即中止而未进入该断言，其严格口径 127,897 / 128,095 px、`maxΔ` 255 / 240 远超预算）；仅 `dialog-import-repos-light` 落在**颜色阈值内**（`maxΔ=7`）故门禁原判通过（但字节已变，`=all` 一并追平）→ **本批一律使用 `=all`**，不依赖「不匹配才重写」的默认行为（该默认行为在盲区内会产出「零差异」假证据，见 §15.14 第 4 条方法论教训）。

**3）回归验证矩阵（本批收口）**

| 检查 | 命令 | 结果 |
| :--- | :--- | :--- |
| 定向 e2e（适配前复现） | `playwright test tests/e2e/dark-mode.e2e.test.ts` | 修复前 1 failed（3 次重试全败）→ 修复后 2 passed |
| 全量 e2e | `playwright test --workers=1` | **189 passed / 0 failed** |
| 视觉回归 | `playwright test --config=playwright.visual.config.ts`（`=all` 重建 + 复跑） | 11 passed ×2，零漂移 |

**4）防复发约束（流程结论）**

- **依赖升级批次的合并门禁**：口径以 [development.md §5.1.34 ③](../../standards/development.md) 为准；本批为其实证反例：`a86ac42` 只改两文件 → CI run `38249528660` 的 `Test` job（`E2E` + `Visual Regression`）持续红，直至下一阶段规划期的环境核对才暴露。
- 排序占位（`--reserved`）与浮层底色（`bg-elevated`）属**库侧契约与设计口径**，平台侧只适配**断言与基线**，不加样式覆盖（沿用 [platform.md §7.4](../../standards/platform.md#_7-4-caomei-ui-接线约定) 接线约定与 §7.5 上游归因流程）。
- **视觉覆盖边界（已知边界，至 0.6.0 批次为止）**：视觉最小集（M32.5 边界）不覆盖 `Drawer` / `Tabs` / `Popover` / `Toast` 的落点页（`schedules` / `scans` / `alert-run-sidebar`），故 0.6.0 对这些组件的浮层类变更**不受像素守卫**（仅由 e2e 行为断言兜底）→ 已登记 [backlog 候选](../../plan/backlog.md)（浮层类组件视觉覆盖扩面）。**本条已被 §15.16 第 5 条更新**：M45.5 / M50.4 之后 Drawer / Toast / schedules / scans / settings / notifications 均有基线，仍未覆盖的只剩 `Tabs` 切换态与 `Popover`。

### 15.16 caomei-ui 1.0.0-rc.1 升级实证（2026-10-31）

> **背景**：M52 阶段的**追加临时待办**（用户 2026-10-30 授权，按 [规划规范 §3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不占阶段条目编号）——平台组件库升到 `next` 通道的 `1.0.0-rc.1`，消费其主题 token 拆分与组件行为修复，并在视觉 / 行为门禁上留下可审计证据。发布时刻 2026-10-30T07:18:39Z（距执行已超 `minimumReleaseAge: 60` 分钟窗口）；`latest` 仍为 0.7.0。**0.7.0（上游 2026-10-20 发布）于 2026-10-25 升级，当时只改依赖与 lockfile、未留实证**，本节一并补齐版本史。

**1）版本与差异口径**

- `apps/platform/package.json`：`caomei-ui` `0.7.0` → `1.0.0-rc.1`（精确锁定）；`pnpm-lock.yaml` 仅版本条目与一处传递依赖去重（`std-env` 4.2.0 → 4.3.0），未改动任何显式钉定。`pnpm i --frozen-lockfile` 通过，`pnpm why caomei-ui` 单版本。
- 包清单：`peerDependencies` / `dependencies` / `exports`（13 键）/ `peerDependenciesMeta` / `sideEffects` 与 0.7.0 **键值一致**（仅 `peerDependencies` 键序不同）；`engines.node` 由 `>=20` 提到 `>=22`（本仓 `^22.23.4 || ^24.22.1` 满足）。
- 公开 API：`index.d.ts` 的 `as Caomei*` 导出 **95 → 95**（集合相同）、`dist/components/` 子目录 **57 → 57**；`index.d.ts` 差异仅新增 `import "./components/*/index.js"` 副作用导入（**additive，无删除**）。
- 语义级比对（沿用 §15.14 口径）：`npm pack` 两版 → 剥 `[data-v-*]`、`_scoped_<hash>` 文件名哈希、`_lang` 后缀、空白与声明分隔后逐文件比较 → **CSS 87 个规范文件 / 35 个语义变化**；**JS 仅 `data-table/data-table.js` 与 10 个 locale 文件**（共 11 个 JS 文件）有语义变化，其余（button / select / switch / dialog / tags-input 等）仅 scope 哈希重命名。
- 行为变化（`data-table` + locale）：① 表头全选改用 `getIsAllPageRowsSelected` / `toggleAllPageRowsSelected`（**作用域从「全部行」收窄到「当前页」**）；② `lazy` 且未传 `rowKey` 时告警，且翻页数据变化会重置非受控选择 / 展开；③ 根容器常驻 `tabindex="0"`，有 `caption` 时补 `role="group"` + `aria-label`（键盘可进入横向滚动区，WCAG 2.1.1）；④ `selectAll` 文案 `全选` → `全选当前页`（zh-CN / en-US 同步）。
- token 变化（基础预设 `:root`）：新增文本角色 `--caomei-color-{primary,success,warning,danger,neutral}-text` 与 `--caomei-color-control-border`；`--caomei-field-border-color` 改用 `control-border`；亮色 `text-muted` `#6b7280` → `#686f78`；新增 `sakura` / `forest` / `ink` 预设（**未采纳**）。组件侧把 Tag / Badge / Message / Tabs / Toast / Select 指示器 / Paginator / 表格 loading 的文本色从 `primary` 迁到 `-text`，Switch / Checkbox / 次级按钮 / 分页控件 / 浮层触发器的边框从 `border` 迁到 `control-border`，并新增按钮 hover / active 反馈（`color-mix` 派生，不新增冻结 token）。

**2）平台命中面与处置**

| 类别 | 变更 | 平台命中点 | 处置 |
| :--- | :--- | :--- | :--- |
| **token（错配）** | 亮色档 `--caomei-color-primary-text` 是预设**静态值** `#1d4ed8`（蓝），不随平台把 `primary` 改为 teal-600 联动 | Tag / Badge / Message / Tabs / Toast 的文本色（全站可见） | **已覆盖**：`_caomei-tokens.scss` 亮色档钉 `teal-700 #0f766e`（8% teal soft 底上 4.97:1，达 AA）；暗色档显式钉 `#5eead4`（与平台暗色主色一致，10.19:1），不依赖预设的 `var()` 间接解析 |
| **token（采纳 + 暗色抬档）** | `control-border` 加深控件边界（亮 `#e2e8f0` → `#8a8b8d`、暗 `#334155` → `#67676a`） | 输入框 / 选择器 / 复选框 / 开关 / 次级按钮 / 分页 / 浮层触发器 | **亮色沿用上游** `#8a8b8d`（3.41:1 / 3.26:1）；**暗色本地抬档** `#7b8494`：上游单值在平台更亮的 elevated（`#1e293b`）只有 2.59:1，抬档后 page 4.74:1 / elevated 3.88:1（详见 §15.17 第 2 条）。均较旧值（1.23 / 1.18 / 1.72 / 1.41）显著改善 |
| **token（排除）** | 亮色 `text-muted` 微调；三个新预设 | 平台 `theme` 已覆盖 `text-muted`；未启用预设 | 无影响；不采纳 `sakura` / `forest` / `ink` |
| **行为（DataTable）** | 全选作用域收窄到当前页；`lazy` 缺 `rowKey` 告警 + 状态重置；根容器 `tabindex` | 全站仅 `repos` 使用 `selection-mode="multiple"`（客户端分页 10/25/50）；`scans` 的 `lazy` 表已传 `row-key="id"`；`repo-history-dialog` 未传，但无选择 / 展开列，不触发告警、无行级状态可重置 | **已适配**（§15.17 第 1 条）：表头保持上游「当前页」语义；「全选全部筛选结果」改由表格上方选择栏 `全选全部（N）` / `清空选择` 承载，e2e 锁定「表头=当页、选择栏=全筛选结果、跨页保持」。两处 `lazy` 表均不触发上游告警 |
| **视觉（按钮状态）** | 新增 hover / active 反馈（实底向 `neutral-solid` 混合、次级 / ghost 向文字色混合） | 全部按钮；**截图会把「鼠标停留」一起拍下** | **接受**：截图前 `page.click()` 的指针位置保留在控件上 → 基线中出现 hover 态（`pr-checks-toast-light` 的 neutral 实底 `#52525b → #50515b` 即此因），属真实交互态，不是噪声 |
| **断言级契约** | 0.6.0 的排序占位（`--reserved`）/ 浮层底色等断言契约 | — | **本轮 0 处需要改期望值**：排序角标断言、暗色弹窗背景断言、`caomei-field--*` 断言均原样通过（不变绿凑数，见第 4 条） |

**3）视觉基线复核（`--update-snapshots=all` 重建 + 逐像素 diff）**

- 重建：`pnpm test:visual:update --update-snapshots=all` → 20 passed；随后**不带 update 连跑两遍** 20 passed ×2（幂等）。
- 逐基线量化（口径同 §15.15：**门禁口径** = Playwright pixelmatch 报数；**严格口径** = 任一通道绝对差 > 0；`maxΔ` / `bbox` 取严格口径）：

| 基线 | 门禁口径 / 严格口径 | 严格占比 | maxΔ | bbox | 归因 |
| :--- | :--- | ---: | ---: | :--- | :--- |
| alerts-light.png | 6131 / 19158 | 1.25% | 99 | (137,14)-(1164,1006) | 控件边框（开关 / 分页）+ Tag 文本角色（success / warning / danger / primary / neutral） |
| alerts-dark.png | 2104 / 2622 | 0.17% | 72 | (137,14)-(1164,236) | 仅控件边框（暗色 `-text` 与旧 `primary` 同值，文本零变化；边框含 §15.17 抬档） |
| alerts-right-light.png | ≈3856 / 12621（估算，见下） | 1.47% | 85 | (0,101)-(798,719) | **元素级补拍只含 Tag / 文本角色**（该图内 `control-border` 颜色对 0 命中）：neutral / success / primary / warning 文本色 + 抗锯齿合成色 |
| alerts-right-dark.png | 0 / 0 | 0.00% | 0 | — | 暗色元素级补拍无变化（`-text` 与旧值同源；无控件边框元素）；严格口径 0 ⇒ 门禁口径必为 0，非估算 |
| repos-light.png | 17527 / 188426 | 14.54% | 245 | (120,14)-(1319,523) | **含 §15.17 选择栏的版面变化**（表格整体下移 36 px）+ 复选框 / 分页边框 + neutral / primary 文本色 |
| repos-dark.png | 29071 / 188453 | 14.54% | 233 | (120,14)-(1319,523) | 同上 + 暗色控件边框抬档 |
| pr-checks-light.png | 1870 / 6392 | 0.49% | 99 | (144,14)-(1295,844) | 控件边框 + 结论 Tag 文本角色 |
| pr-checks-toast-light.png | 1494 / 6580 | 0.51% | 99 | (144,14)-(1295,691) | 同 pr-checks + **按钮 hover 反馈**（neutral 实底混合） |
| dialog-import-repos-light.png | 4320 / 4548 | 1.39% | 99 | (16,79)-(743,268) | 弹窗内表单字段 / 复选框边框（`control-border`） |
| dialog-select-open-light.png | 16242 / 107352 | 8.28% | 134 | (120,14)-(1319,753) | **含选择栏版面变化**（该用例在 `/repos` 打开弹窗，背景页下移）+ 弹窗表单边框 |
| dialog-select-open-dark.png | 16647 / 107350 | 8.28% | 128 | (120,14)-(1319,753) | 同上 + 暗色控件边框抬档 |
| scans-run-detail-light.png | 2086 / 10470 | 0.81% | 85 | (131,14)-(1302,823) | 控件边框 + warning / primary 文本角色 |
| notifications-light.png | 5830 / 8438 | 0.64% | 99 | (137,14)-(1302,565) | 控件边框（开关 / 输入）+ warning 文本角色 |
| notifications-dark.png | 5828 / 6492 | 0.49% | 72 | (655,14)-(1302,565) | 仅控件边框（含抬档） |
| settings-light.png | 10467 / 12003 | 0.57% | 99 | (137,14)-(1302,1327) | 表单字段边框（纵向 1473px 整页基线的中段）+ 文本角色 |
| settings-dark.png | 10330 / 11692 | 0.55% | 72 | (137,14)-(1302,1327) | 仅控件边框（含抬档） |
| schedules-form-layer-light.png | 7210 / 13423 | 1.04% | 99 | (456,14)-(1319,717) | 弹窗内全部表单字段 / 选择器边框 |
| schedules-form-layer-dark.png | 6691 / 13394 | 1.03% | 72 | (456,14)-(1164,717) | 同上（暗色档；抬档后边框色差超过 `threshold`，门禁口径由 348 升至 6691） |
| alerts-run-drawer-light.png | 4559 / 14391 | 1.11% | 55 | (137,170)-(1073,741) | 抽屉内控件边框 + neutral 文本角色（含遮罩合成色） |
| login-light.png | 1576 / 1728 | 0.13% | 99 | (527,431)-(912,544) | 登录表单字段边框 |

  - **口径说明**：**严格口径 / 门禁口径的对比基准统一为 0.7.0 基线**（上一次升级前的 `git` 版本），非 rc.1 首版重建。`alerts-right-*` 因用例在整页截图断言处即中止而未进入元素级断言，门禁口径取本批一次性脚本的 pixelmatch 复刻实现（同 `threshold: 0.1` / `includeAA: false`）；该实现与 Playwright 报数逐一核对 **18 张**（其中 13 张完全一致、5 张偏差 1-4 px），故估算值可信。
  - **结论**：20 张基线中 **19 张变化 / 1 张（`alerts-right-dark`）零变化**；差异来源分三层且均已登记——① `control-border` 与 `-text` 角色迁移（全表）；② 按钮 hover 状态（`pr-checks-toast-light`）；③ **§15.17 新增选择栏的版面变化**（仅 `repos-*` 与 `dialog-select-open-*`，表格整体下移 36 px）。20 张图像尺寸与上一版逐张一致（无因位移导致的尺寸变化）。`schedules-form-layer-dark` 在抬档前（上游 `#67676a`）门禁 348、抬档后 6691——说明边框色差跨越了 `threshold`，颜色轴与面积轴的关系符合 [测试规范 §6.7](../../standards/testing.md#_6-7-视觉回归-截图识别层-apps-platform) 的既有结论。

**4）回归验证矩阵（本批收口）**

| 检查 | 命令 | 结果 |
| :--- | :--- | :--- |
| 锁定 / 解析 | `pnpm i --frozen-lockfile` / `pnpm why caomei-ui -r` | 通过；单版本 `1.0.0-rc.1` |
| 构建 | `pnpm -r build` | 全绿（platform 37.6 MB，41.8s） |
| Typecheck | `pnpm typecheck` | 7 包 Done，0 error |
| Lint | `pnpm lint` | 0 error（3 条存量 warning） |
| 全量 e2e | `TMPDIR=/dev/shm pnpm test:e2e` | **211 passed / 0 failed**（含新增 3 例），1-2 flaky 均重试通过（见第 5 条） |
| 视觉回归 | `pnpm test:visual:update --update-snapshots=all` + 两轮 `pnpm test:visual` | 20 passed → 20 passed ×2（门禁口径无失败、无超预算；`.last-run` 与基线落盘同批自洽） |
| 定向 e2e（DataTable 重点面） | `playwright test repos-crud / table-filters / scans / pr-checks --workers=1` | **28 passed**（受控多选 / 客户端分页 / 两处 `lazy` 翻页 / 行展开 / 运行详情） |
| 新增守卫 | `playwright test tests/e2e/theme-tokens.e2e.test.ts` | 4 passed（文本角色 2 + 控件边界对比度 2）；**mutation 实测**：亮色 `primary-text` 改回 `#1d4ed8` → 失败（暗色边框的 mutation 属后续抬档批次，见 §15.17 第 2 条） |
| 全选适配守卫 | `playwright test tests/e2e/repos-select-all.e2e.test.ts` | 1 passed（含刷新一致性与筛选不变量）；**mutation 实测**：`selectAllFiltered` 改为只取首页 → 失败（Expected 12 / Received 10）；删除刷新后重映射 → 失败（Expected 10 / Received 0） |
| 文档值核验 | 一致性 / 对比度脚本 | 新文本角色：亮 `#0f766e` 在 8% teal soft 底 4.97:1、白底 5.47:1；暗 `#5eead4` 在 8% soft 底 10.19:1 / 深底 12.07:1 |

- **断言未凑绿**：本轮 e2e 无一处需改期望值；新增的 `tests/e2e/theme-tokens.e2e.test.ts` 断言的是「文本角色跟随平台主色」这一**契约**（token 值 + `/scans` 激活 Tab 的实际计算色），而非像素快照。

**5）观察与遗留**

- **e2e flaky 与本升级无关，分属两条存量问题**：① **Select 首次点击族**（M50.4 残留，`tests/visual` 侧已用 `openSelectPanel` 兜底、e2e 侧未覆盖）——本轮出现 `scan-config`（扫描偏好 Select 面板项点击超时）与 `schedules`（计划类型选择器），`--repeat-each=2` 可复现；② **列表刷新时序**（M49.2a 登记的「平台 e2e 偶发等待超时」）——前一轮出现 `repos-crud`「删除后列表行未出现」。全部重试通过（首轮 207 / 收口 211，均 0 failed），不随本批修复，避免混入主题。
- **暗色控件边界已抬档**：见 §15.17 第 2 条（`#7b8494`，elevated 3.88:1）；上游单值按自家暗面标定，属消费方面色差异，不构成上游缺陷。
- **rc 通道风险与回滚**：`1.0.0-rc.1` 为预发布版本，精确钉定 + 单版本解析；回滚路径 `pnpm --filter @dependfix/platform add caomei-ui@0.7.0 --save-exact`（回滚后须按本节口径重建基线）。若仓内出现 rc.2，需重新过 `minimumReleaseAge` 窗口（口径见 [安全规范 §5.2](../../standards/security.md#_5-依赖与供应链安全-dependency-supply-chain-security) 与 [开发规范 §5.1.57](../../standards/development.md)），窗口内的精确豁免边界同源。
- **表头全选语义已适配并加守卫**：表头保持上游「当前页」；跨页全选由选择栏承载，`repos-select-all.e2e.test.ts` 锁定（见 §15.17 第 1 条）。
- **基线跨运行非字节稳定**（**2026-10-31 M52.4 订正**：该结论的取证方法有误——不带值的 `--update-snapshots` 在比较通过时不写盘，故「连续重建字节相同」不成立；M52.4 用 `=all` 重新取证，并修复 update 路径的落帧不稳定。现行口径见 [visual/README.md](../../../apps/platform/tests/visual/README.md)「运行间确定性取证」；下述 ≤26 px 噪声在当前构建下未再复现，`dialog-select-open-dark` 仍有 1/10 概率出现 99 px 边缘窄带差异）：连续 `=all` 重建（同版本、同构建产物）在个别基线间存在 **≤26 px / maxΔ 1** 的亚像素抗锯齿噪声（本轮观察到 `scans-run-detail-light` 26 px、`schedules-form-layer-dark` 1 px；其余基线在相邻两次重建间逐字节相同）；差异远低于门禁（≤100 px 且色差阈值内），故不影响判定，但说明「字节稳定」不成立。该两图与 `dialog-select-open-dark` 一并作为 M52.4「视觉确定性与覆盖率」的取证对象。
- **视觉基线的「hover 态」口径**：新按钮状态反馈使「点击后指针停留」成为基线的一部分。本批按真实交互态接受（不移动鼠标规避），后续新增截图用例需注意同一用例内点击顺序会影响 hover 归属。
- **视觉覆盖边界**：本节表格自身已含 `Drawer`（`alerts-run-drawer-light`）与 `Toast`（`pr-checks-toast-light`），M45.5 / M50.4 之后 `schedules` / `scans` / `settings` / `notifications` 亦有基线；**仍未覆盖**的是 `Tabs` 切换态与 `Popover`（无落点页），由 e2e 行为断言兜底。M52.4 会补 pr-checks 归因标签守卫与 `dialog-select-open-dark` 确定性取证。

### 15.17 caomei-ui 1.0 全选语义适配与暗色控件边界微调（2026-10-31 追加）

> **背景**：§15.16 收口后按用户 2026-10-31 裁定处理两个遗留项——① 检查是否有表格依赖「跨页全选」并做适配；② 暗色 `control-border` 是否微调、是否需向上游反馈。

**1）全选语义适配（`repos` 页）**

- **检查结论**：全站仅 `repos` 使用 `selection-mode="multiple"`（`rg` 实测 1 处，无 `single` 用法）；其余表页均无选择列——`pr-checks` / `batch-runs` 含 `expander` 列，`scans` / `repo-history-dialog` 是 `lazy` 表（后者也无 `expander`），故都不受全选语义影响。另 `import-repos-dialog` 的「全选」是**自建 checkbox + 自建分页列表**（选 `selectableFilteredRepos` 全集合），不经 DataTable 语义，同样不受影响。
- **功能缺口**：`repos` 是客户端分页（10 / 25 / 50），表头全选只覆盖当前页；「批量扫描全部筛选结果」需逐页点击（或先把每页调到 50）。受控 `selectedRows` 按 row id 跨页保持，故逐页勾选可用但成本随页数线性增长。
- **适配（不改上游行为）**：表头保持 1.0 语义（当前页）；卡片内表格上方新增选择栏——`已选 {selected} 条，当前筛选 {total} 条`（`role="status"`，计数变化对读屏可感知）+ `全选全部（N）` / `清空选择`（按钮按状态显隐：已选 > 0 才显示「清空选择」，未全选且总数 > 0 才显示「全选全部」；筛选结果为 0 但仍有已选时只保留清空入口，避免出现误导性的「全选全部（0）」）。`selectAllFiltered` 以整集合替换（与 DataTable「回写当前过滤集合」的既有语义一致）；选中判定按 id 比对（`selectedRows` 可能含被筛选隐藏的行）。
- **落地拆分**：选择栏为独立组件 `app/components/repo-selection-bar.vue`（纯展示 + 两个 emit），状态与动作抽到 `app/composables/use-repo-selection.ts`（`isAllFilteredSelected` 按 id 判定、`remapSelectionById` 刷新重映射、`useRepoSelection` 组合式），既避免 `repos.vue` 越过 `max-lines: 800`，也让判定可单测。
- **刷新一致性（审计衍生）**：库内受控选择按**对象引用**解析，而保存 / 删除后的 `fetchData()` 会换新对象 → 原先会出现「已选 N 条但无行勾选」。现于刷新后按 id 重映射已选集合（已删除行自然移出），选择栏计数与勾选态保持一致。
- **守卫**：`tests/e2e/repos-select-all.e2e.test.ts` 自建 12 条仓库并清理——断言「表头全选 = 10 条」「第 2 页未被波及」「翻页保持已选」「全选全部（12）覆盖两页」「编辑保存触发刷新后计数与勾选态一致」「筛选收窄不清空已选」「筛选为 0 时保留清空入口、不渲染全选全部（0）」「清空后选择栏收起」，并加版面守卫（选择栏底边不高于表格顶边）；单测 `tests/unit/use-repo-selection.test.ts` 8 例（按 id 判定 / 缺行 / 空集合 / 含隐藏行 / 全选替换与清空 / 刷新重映射三种）。**mutation 实测**：`selectAllFiltered` 改为只取首页 → e2e 失败（Expected 12 / Received 10）；删除刷新后重映射 → e2e 失败（Expected 10 / Received 0）。
- **视觉**：`repos-*` 与 `dialog-select-open-*` 基线因选择栏整体下移重建（§15.16 表内已标注）。隔离 token 变化、**只看版面位移**（对比 rc.1 首版基线）：repos-light **14.36%**（纯位移）/ repos-dark 14.54%、dialog-select-open light **7.64%**（纯位移）/ dark 8.28%——**暗色档两项 = 位移 + 第 2 条的边框抬档**（rc.1 首版不含该覆盖），故恒高于同页亮色档；**合计口径（基准 = 0.7.0 基线）见 §15.16 表**。

**2）暗色控件边界微调**

- **上游标定**：`--caomei-color-control-border` 暗色为单值 `#67676a`，在库自身 surface 上达标——bg `#0b0b0d` 3.49:1、elevated `#17171a` 3.17:1。
- **平台缺口**：平台暗色 surface 更亮（page `#0f172a`、elevated `#1e293b`）→ 原值在 elevated 只有 **2.59:1**，低于 WCAG 1.4.11 的 3:1（page 面 3.17:1 达标）。
- **处置**：暗色档抬到 `#7b8494`（page **4.74:1** / elevated **3.88:1**），亮色档保持上游 `#8a8b8d`（3.41 / 3.26）。取值落在平台 slate 明暗档内，不是新品牌色。
- **守卫**：`theme-tokens.e2e.test.ts` 新增两例，判据是「token 与**实际 surface** 的 WCAG 对比度 ≥ 3:1」（不锁色值）；**mutation 实测**：删除暗色覆盖 → 2.5948:1 → 失败。
- **上游反馈结论**：**不是上游缺陷**（库自身两档 surface 均 ≥ 3.17:1），属「单值 token + 消费方自定义更亮暗面」的约束；本批不提交 issue，改为在本文登记该约束（换更亮 / 更深的 dark surface 需重算）。若后续要推动 surface-aware 默认值，可另开 enhancement。

**3）验证（追加批次）**

| 检查 | 命令 / 范围 | 结果 |
| :--- | :--- | :--- |
| 构建 / typecheck / lint | `pnpm -r build` / `pnpm typecheck` / `pnpm lint` | 全绿 / 7 包 0 error / 0 error（3 存量 warning） |
| 全量 e2e | `TMPDIR=/dev/shm pnpm test:e2e` | **211 passed / 0 failed**，1-2 flaky 重试通过（`repos-crud` 创建、`scan-config` Select） |
| 定向 | `repos-select-all` / `theme-tokens` / `use-repo-selection` 单测 / `repos-crud` ×3 | 1 passed / 4 passed / 8 passed（181 文件 2381 passed）/ 30 passed（flaky 未复现） |
| 视觉 | `=all` 重建 + 两轮 `test:visual` | 20 passed ×3；相对 rc.1 首版重建 8 张（repos ×2、dialog-select ×2、4 张暗色边框） |
| mutation | 3 项 | 3/3 击杀（全选作用域、刷新重映射、暗色边框对比度） |
| 文档 | `pnpm gates:docs` | 16 项 OK |

**4）剩余边界**

- 选择栏只服务 `repos`；若后续新增多选表，可把「筛选集合全选」提取为 composable。
- `全选全部` 是整集合替换：被筛选隐藏的已选行会被移出（与 DataTable 回写语义一致，已在页面注释记录）。
- 暗色 elevated 若继续调亮需重算 `control-border`；调深则对比度只升不降。

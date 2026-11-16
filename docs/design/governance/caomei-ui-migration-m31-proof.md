# caomei-ui 迁移：M31 实施实证（§15.10-§15.13）

## 15.10 DataTable 核心页迁移实证（M31.2，2026-09-28）

> alerts / batch-runs 两页迁移（B1a）中与「库差异」相关的实测结论，供 B1b（M31.3）与 B4（M31.5）直接复用。

**1）排序方向：不启用 caomei 的 `sortDescFirst`**（对 §15.1「`sortDescFirst` 已闭环」的机制修正）

| 场景 | PrimeVue（迁移前实测） | caomei `sort-desc-first` 开启 | caomei 不开启（本批采用） |
| :--- | :--- | :--- | :--- |
| 初始未排序列，连点 3 次 | asc → desc → 移除 | desc → asc → 移除 | **asc → desc → 移除** |
| 初值已 desc 的业务列（severity） | 移除 → asc → desc | desc → asc → 移除 | **移除 → asc → desc** |
| 多列追加 | `Ctrl`/`Cmd` + 点击 | `Ctrl` + 点击 | `Ctrl` + 点击 |

- 结论：**不设 `sort-desc-first`**，默认方向由 `multi-sort-meta` 初值承载（severity desc），实测在**上述 3 类点击场景**（普通列首击 / 初值已 desc 列 / `Ctrl` 追加）下的循环与默认顺序均与 PrimeVue 一致（确定性断言见 `apps/platform/tests/e2e/sortable.e2e.test.ts`）。
- 反例记录：曾尝试「全局 `sortDescFirst` + 首次点击按列纠正」以复刻 PrimeVue 的逐列 `:default-sort-order="-1"`，实测非业务列会退化为「asc → 移除 → asc」（`desc` 状态不可达），已回退。PrimeVue 的 `default-sort-order` 实测只影响**初始**排序状态，不影响点击循环。

**2）分组列处理：按视图过滤掉分组字段列**

PrimeVue 在 `rowGroupMode="subheader"` 下**省略** `groupRowsBy` 同名列（表头与单元格都不渲染；实测 14 表头 / 分组行 colspan=14 / 数据行 14 格）；caomei 会保留该列并渲染空白占位。迁移做法：`columns` computed 按当前 `groupRowsBy` 过滤（`viewMode='none'` 时不过滤）。实测列数、表头文本与顺序、分组行 colspan、各组行数与内容**逐项一致**。

**3）受控状态回写**：`multi-sort-meta` / `expanded-row-groups` / `expanded-rows` 三者均需 `@update:*` 回写（不回写则点击列头与内建折叠/展开按钮均无效果）——约定见 [平台规范 §7.4](../../standards/platform.md)。

**4）`expandedRows` 契约差异**

PrimeVue 的 `expandedRows` 是 `Record<rowKey, boolean>`（配合 `data-key`），caomei 是 `string[]`（行 key 数组，配合 `rowKey`）→ 迁移时改 `ref<string[]>([])`；`#expansion` 插槽 scope 均为 `{ data }`（本批统一解构为 `{ data: row }`）。

**5）行展开列与内建按钮**

PrimeVue `<Column expander>` → caomei `columns` 中的 `{ expander: true }`（表头恒留空）；内建按钮 `.caomei-data-table__row-expander` 带 `aria-expanded` / `aria-label`，分组折叠按钮 `.caomei-data-table__row-group-toggle` 同理（比 PrimeVue 的 SVG path 切换更易稳定断言）。

**6）本批实测使用的选择器（其余见 §15.8 映射表）**

| 用途 | caomei 选择器 |
| :--- | :--- |
| 排序按钮 / 排序状态 | `.caomei-data-table__sort` + `th[aria-sort]`（`ascending` / `descending` / `none`） |
| 分组折叠按钮 | `.caomei-data-table__row-group-toggle`（`aria-expanded`） |
| 行展开按钮 / 展开区 | `.caomei-data-table__row-expander` / `.caomei-data-table__row-expansion` |

**7）分组连续性依赖组级排序键（M39.3 修订）**

分组字段列被剔出 `columns` 后，TanStack 只对「列模型中存在的列」排序（`createSortedRowModel` 以 `getColumn(sort.id)` 为门槛），传入分组字段的排序键会被**静默丢弃**；且 caomei 的相邻行分组要求同组行相邻，任何**行级**排序键都会把同包跨 severity 行拆到不同区块 → 同名分组头重复出现（M31.2 迁移期用「服务端 `orderBy(groupBy)` + 行级 severity 稳定排序」兜底，仅在「每个包单一 severity」的数据集下看不出问题）。

M39.3 定稿「一个包一组」后改用**组排序键**：`alerts.vue` 让「严重级别」列在「按包」模式下的排序取值返回**组排序键** `最高级别 rank × 步长 − 包名升序序号`（`accessor` 指向 `summarizePackageGroups` 的 `sortKey`，组间唯一）——同包所有行共享同一排序值且键组间唯一 → 相邻性由排序本身保证（任何次排序键只在组内生效），不依赖服务端顺序；再配合①`alerts` 预排序（包名升序 → 组内 severity 降序）提供无排序键时的稳定基线②`onUpdateMultiSortMeta` 在「按包」模式把严重级别固定为第一排序键（用户移除但保留其它键时补回），等价迁移前组件库「自动保留 `groupRowsBy` 为首键」的行为。展示不受影响（`#cell-_severityRank` 槽仍读行级 `severity`），组头另渲染该组最高级别 Tag。

> 「按仓库」视图沿用既有口径（服务端 `orderBy` + 行级 severity 降序），M39.3 仅修「按包」。**结论**：分组连续性不靠服务端排序，改由组级排序键保证——服务端只需保证数据完整（`take(500)`），其顺序仅作为同排序值内的稳定基线。

**8）单元格密度对齐 PrimeVue `size="small"`**

PrimeVue Aura small 尺寸单元格内边距为 `0.375rem 0.5rem`（6px 8px），caomei 默认为 `var(--caomei-space-2) var(--caomei-space-3)`（8px 12px）；仓库内 DataTable 标签共 20 处（PrimeVue 14 处，其中 13 处显式 `size="small"`；caomei 6 处无 `size` prop），故在 `_caomei-tokens.scss` 统一收敛为 PrimeVue small（实测表头 padding `8px 12px` → `6px 8px`，表头高度 34.5px → 30.5px）。复现计数：`grep -rhE "<DataTable([ >]|$)" apps/platform/app --include="*.vue" | wc -l`（14）与 `grep -rhE "<CaomeiDataTable([ >]|$)" ...`（6）。

> **B1b 已闭环**：`pr-checks.vue` 的 DataTable 未设 `size`（PrimeVue 默认档 `0.75rem 1rem`），迁移后本会被全局覆盖压到 small 档 → M31.3 按用户裁定「取最接近档位」判定 caomei 默认档（8px 12px）更接近并恢复之（见 [§15.11](#_15-11-其余表页迁移实证-m31-3-2026-09-28) 第 8 条）。

**9）验证证据**（可复现口径）

- 迁移前后结构取证（列数 / 表头 / 分组标签 / 各组行内容 / 排序三态循环）→ `artifacts/m31-b2/{before,after}-alerts.json`（gitignored；**after 取证基于最终构建**，⚠️ fixtures 的 `createdAt` 时间戳随重新 seed 变化，行内容比对需忽略日期列）
- 排序三态循环的**确定性断言**在 `apps/platform/tests/e2e/sortable.e2e.test.ts`（asc → desc → 移除）
- e2e：相关子集 26 条 = `pnpm exec playwright test alerts-rowgroup sortable batch alerts-sidebar alerts-fix-now`（其中过滤词 `batch` 亦匹配未受影响的 `batch-import-filters`）；全量 `pnpm exec playwright test` = 172 条用例中 170 passed / 1 failed（env-events 导航菜单用例，单跑 9/9 通过，属用例顺序相关 flaky，该页未迁移）/ 1 flaky（schedules-crud trigger 重试通过，未迁移）
- 单测 1295 条 = `pnpm --filter @dependfix/platform test`；`pnpm run typecheck` / `pnpm run lint` / `pnpm --filter @dependfix/platform lint:css:check` / `pnpm --filter @dependfix/platform build` 全部通过
- **环境前提**：e2e 的 webServer 跑 `.output`，须先 `pnpm --filter @dependfix/platform build`；本机容器需 `ignoreDefaultArgs: ['--disable-dev-shm-usage']` + `--no-sandbox`（容器 `/tmp` 不可写，默认参数会让 chromium `Page crashed`），CI 不受此限。

## 15.11 其余表页迁移实证（M31.3，2026-09-28）

> M31.3（B1b）把**全部剩余 PrimeVue DataTable**（14 处 / 11 文件）+ 独立 `Paginator`（1 处）+ `ScrollPanel`（2 处）迁完，`apps/platform/app` 下已无 PrimeVue 表组件引用。本节记录新遇到的映射与差异（§15.10 的通用规则仍适用）。

**1）覆盖清单**（口径：本批 `git diff --name-only` = 13 vue 文件；含 `CaomeiDataTable` 的仓库文件共 15 个（含 2 个 `__migration-validation/*.vue` 验证页）；与 M31.2 触及文件的并集为 14 vue）

| 组 | 文件 | 关键能力 |
| :--- | :--- | :--- |
| 简单表 | `pages/credentials.vue` / `pages/schedules.vue` / `pages/users.vue` / `pages/repos/[id]/runs.vue`（2 表） | 排序 + 空态 |
| 分页 | `pages/pr-checks.vue`（内建分页 + 多列排序）、`pages/scans.vue`（2 表，含 lazy 分页）、`components/repo-history-dialog.vue`（2 表，含 lazy 分页） | 内建分页 / lazy / 页码受控 |
| 特殊 | `pages/repos.vue`（行选择）、`pages/env-events.vue`（滚动容器）、`components/import-repos-dialog.vue`（独立 Paginator） | 选择 / 滚动 / 分页器 |
| 侧栏/弹窗 | `components/alert-run-sidebar.vue`、`components/run-detail-dialog.vue`（含 ScrollPanel） | 表 + 日志滚动区 |

**2）行选择（`v-model:selection` → 受控 `selection`）**

- `selection-mode="multiple"` + `:selection` + `@update:selection` 回写 + `row-key="id"`（受控回写约定见 [平台规范 §7.4](../../standards/platform.md)）；`update:selection` 载荷为 `T | T[] | null`，需 `Array.isArray` 窄化后回写。
- 选择列由 caomei 内建渲染：`td.caomei-data-table__select-cell` > `div.caomei-data-table__select-cell-inner` > **`button.caomei-checkbox__control`**（Reka `role="checkbox"`，**不是 `input`**）→ e2e 原 `input.p-checkbox-input` 必须改写。

**3）内建分页 / lazy 分页**

- `paginator` / `rows` / `rowsPerPageOptions` / `totalRecords` / `lazy` 同名；**页码基准不同**：PrimeVue `first`（0 基）→ caomei `page`（1 基），换算 `page = floor(first / rows) + 1`，`@page` 载荷含 `{page, rows, first, pageCount}`（可直接取 `first` 回写）。
- `paginator-template` / `current-page-report-template` 删除：caomei DataTable **无 `#paginator` 插槽**，页码报表文案无法保留 → **已接受差异**（e2e 未断言该文案）。

**4）独立 `Paginator`（import-repos-dialog）**

- `:rows` → `:items-per-page`、`:total-records` → `:total`、`:first` → `v-model:page`（1 基）；`@page` → `@update:page` + `@update:items-per-page`（caomei 切每页条数会按首行偏移重推页码）。
- 页码报表文案由页面自渲染（`.import-form__pagination-report`），保留原 i18n key 与语义。

**5）`scrollable` / `ScrollPanel`**

- DataTable `scrollable` + `scrollHeight` → 外层容器 + CSS（`.env-events__table-scroll`：`max-height: 60vh; overflow: auto`）；**已接受差异**：表头不再吸顶（PrimeVue 曾固定表头）。
- `ScrollPanel` → 原生 `<div style="height:200px;overflow:auto">`（保留原内容类名，新增 `.repo-history__logs-scroll` / `.run-detail__logs-scroll` 供定位）。

**6）caomei DataTable 无表级 `#header` 插槽（结构变化，已接受）**

`repo-history-dialog.vue` 原把返回/关闭按钮、错误横幅、PR 链接放在 DataTable 的 `#header` 插槽内；caomei 仅支持 `#cell-*` / `#header-*` / `#empty` / `#groupheader` / `#expansion`，故这些内容上移为表格**之前的兄弟节点**（类名不变）——**已接受差异**，由 `scans.e2e.test.ts` case 3 覆盖通过，B4 视觉收口时复核布局。

**7）验证证据**（可复现口径）

- 残留检查：`grep -rnE "<DataTable([ >]|$)|<Column([ >]|$)|<Paginator([ >]|$)|<ScrollPanel([ >]|$)" apps/platform/app --include="*.vue"` → 仅注释命中（0 个真实标签）。
- 列 key 双向一致性（脚本化，两向都查）：① 槽→列（`#cell-{key}` 必须有对应 `columns.key`）；② 列→字段（无插槽且无 `accessor` 的列，其 `key` 必须在文件内被引用为字段）——**该反向检查在首轮审计后新增，正是它命中并修复了 `repo-history-dialog` 的「阈值」列 key 失配（`threshold` → `severityThreshold`）**；修复后 15 个文件双向均无异常。
- e2e 全量：`pnpm exec playwright test` → 172 条用例全部通过（本批收尾复跑 172 passed / 0 failed / 0 flaky）。首轮执行时曾出现 2 条 flaky：`schedules-crud` trigger 404（该页本批迁移，但失败点是 `/api/schedules/[id]/trigger` 在无 GitHub 凭据环境下返回 404，属既有环境抖动——M31.2 批次已记录同类）与 `api-i18n` cookie 用例（服务端 API i18n，非表路径）；两者重试均通过，收尾复跑未再出现。
- 门禁：`pnpm run typecheck` / `pnpm --filter @dependfix/platform exec eslint . --max-warnings 10`（**非 `--fix`**）/ `lint:css:check` / `build` / 单测 1295 条 全部通过。
- 结构取证：`artifacts/m31-b3/`（repos / env-events / scans / pr-checks 4 页截图 + 表数 / 排序按钮数 / 选择单元格数 / 分页器 / 滚动容器 / 密度 6px 8px / 0 pageError）。

**8）遗留项（2026-09-29 用户裁定后已落地，B4 视觉收口时复核）**

- ✅ **`pr-checks.vue` 密度**（原 DataTable 未设 `size`，PrimeVue 默认档 12px 16px）：按「最接近档位」判定 —— caomei 默认档（`--caomei-space-2` / `--caomei-space-3` = 8px 12px）比 small 档（6px 8px）更接近 → 该页从全局 small 收敛中**排除**，恢复 caomei 默认密度（页面 scoped `:deep()` 覆盖，实测 8px 12px；其余页仍为 6px 8px）。
- ✅ **`repos.vue` 凭据列窄列换行**：给 `credentialName` 列加 `width: '104px'` 约束，实测「未关联」不再折行（元素高 16px < 行高 21px）。
- ✅ **`--caomei-color-primary-foreground` 对比度**：用户裁定改前景 token（影响面小于改主色），已落地并实测亮色 5.25:1 / 暗色 13.29:1，详见 [§15.9 第 6 条](caomei-ui-migration-mapping.md#_15-9-b0-接线暴露的验证覆盖缺口-m31-各批次须补齐)。
- ⏳ `import-repos-dialog` 的 `CaomeiPaginator` 固定渲染页码按钮组（原 PrimeVue template 无该控件）→ 属可见 UI 新增，B4 确认是否接受。
- ⏳ 内建分页器的页码报表文案丢失（第 3 条）→ B4 确认是否需要在表外自渲染补回。

## 15.12 表单 / 浮层 / 导航组件迁移实证（M31.4，2026-09-29）

> M31.4（B2）把 `apps/platform/app` 下**全部剩余 PrimeVue 组件**（非表格类）迁到 caomei-ui 0.3.0，并完成 Toast / Confirm / i18n 内建文案接线。迁移后 `apps/platform/app` 的**生产页面集合**已无 PrimeVue 组件标签与 `pi pi-*` 图标 / `fluid`（M31.5 待删的 `__migration-validation` V1 验证页仍有 5 处 `<Card>`；另有 4 类残留见第 5 条）。

**1）覆盖清单**（口径：M31.4（B2）批次全部改动文件，跨多个 commit；`git diff --name-only` 统计）

| 组 | 文件 | 关键能力 |
| :--- | :--- | :--- |
| 接线地基 | `app/app.vue`、`app/layouts/default.vue`、`app/pages/index.vue`、`package.json`（`@lucide/vue`）、`assets/styles/_caomei-tokens.scss` | providers（Config/Toast/Confirm）+ locale 映射 + 图标依赖 + 选择器全宽 |
| 认证 / 展示 | `pages/login.vue`、`pages/register.vue`、`pages/dashboard.vue`、`pages/settings.vue` | Password / Message / Card / 图标按钮 |
| 表单 A | `pages/credentials.vue`、`pages/repos.vue`、`pages/repos/[id]/runs.vue` | Dialog / Select / Textarea / TagsInput |
| 表单 B | `pages/schedules.vue`、`pages/scans.vue`、`pages/pr-checks.vue`、`pages/users.vue`、`pages/env-events.vue` | AutoComplete / MultiSelect / Switch / Toast / Confirm |
| 告警 / 批任务 | `pages/alerts.vue`、`pages/batch-runs.vue`、`utils/alerts-view.ts(+test)` | Switch / Select / Confirm |
| 子组件 | `components/{ai-config-form,alert-run-sidebar,import-repos-dialog,repo-ai-toggle,repo-history-dialog,run-detail-dialog,scan-config-dialog}.vue` | Drawer / Dialog / Checkbox / SelectButton |
| 共享 util | `utils/pr-check-style.ts(+test)`、`utils/dashboard-charts.ts`、`assets/styles/main.scss` | `TagSeverity` → `ComponentTone`；图表配色/主题注释去 PrimeVue 化 |

e2e 侧共改写 14 个 spec（`.p-dialog*` / `.p-select*` / `.p-drawer` / `.p-card` / `.p-message-*` / `.p-tag-label` / `.p-button-loading-icon` / `input[type=checkbox]`）+ 2 个共享 helper（`auth.helper.ts` 的 `input#password`、`hydration.helper.ts` 增等 `isHydrating === false`）。

**2）Toast / Confirm / i18n 接线**

- `app.vue`：`CaomeiConfigProvider`（`:locale` 由平台 i18n 单点映射 `en` → `en-US`）→ `CaomeiToastProvider` → `CaomeiConfirmDialog`。
- **顺带修复既有缺陷**：`pr-checks.vue` 此前调用 PrimeVue `useToast()` 但全仓无 `<Toast />` 根挂载（提示从未渲染）；本批改 `toast.success/danger({ title, duration })` 并由 `CaomeiToastProvider` 承接，实测 ack 成功后 `.caomei-toast` 可见。
- 3 处原生 `confirm()`（`batch-runs` / `settings` / `users`）改为 `useConfirm().open({ title, tone: 'danger' })`；确认弹窗渲染为 `.caomei-confirm-dialog__content`（`role="alertdialog"`），文案与「取消 / 确定」按钮由 caomei 内建 locale 提供。

**3）组件级差异与处置**（本批新遇到，§15.10 / §15.11 的通用规则仍适用）

| 差异 | 处置 |
| :--- | :--- |
| `Button severity="secondary"`（PrimeVue Aura = 浅灰实底 `surface.100` + `surface.600` 字）在 caomei 无同名档 | 有 `text` 的 8 处 → `variant="ghost"`（与 PrimeVue `.p-button-text` 覆盖 `.p-button-outlined` 的实测结论一致）；无 `text` 的 6 处（`batch-runs`/`credentials`/`pr-checks`/`repos`×2/`scans` 头部动作按钮）→ `tone="neutral"`（默认实底变体）。**视觉差异**：caomei `--caomei-color-neutral-solid` 为深灰（#52525b）+ 白字，比 PrimeVue 的浅灰实底更重 → 见第 6 条遗留项。 |
| `Message` 默认 soft 档只有底色、无可见边框（PrimeVue 为浅底 + 1px 同色边框） | **2026-09-29 用户裁定**采用 soft 默认档并接受该差异；实测 `border: 1px solid transparent`（`borderTopColor: rgba(0,0,0,0)`）。 |
| `Select` 无 `#value` 槽 | `import-repos-dialog` owner 选择器触发器不再显示 Personal/Organization badge（下拉 `#option` 内仍显示）→ 见第 6 条遗留项。 |
| `Select` 无 `loading` prop | 移除 2 处 `:loading`（原为静默透传的无效 DOM 属性），禁用态与加载分支逻辑保留。 |
| `Drawer` 只 emit `update:open`（无 `hide`） | `alert-run-sidebar` 用 `computed` 双向桥接既有 `visible` 契约，关闭时补发 `hide`，父组件 `@hide` 清理语义不变。 |
| `Checkbox` 根是 `role="checkbox"` 的按钮（无原生 input） | ① e2e 由 `input[type=checkbox]` 改 `button.caomei-checkbox__control[data-state="checked"]`；② 全选行原 `<label>` 包裹改为 Checkbox 自带 `text`（嵌套 label 无法点选）。 |
| `Input` 的 `type` 联合不含 `datetime-local` | `env-events` 时间范围筛选保留原生 `datetime-local`（属性透传到内层 input），以带注释的收窄常量 `as unknown as InputType` 表达。 |
| `Select` 家族字段外层 `inline-flex; width: 100%`，且可见根元素是 `SelectTrigger`（非组件根 vnode） | ① 全局覆盖 `--caomei-select-max-width: none` 必须用 `:root:root`（库 `theme.css` 的 `:root` 后加载、同特异性会压过）；② `users.vue` 操作列角色选择器改用外层 `inline-block` 定宽容器（直接挂 class 写宽度无效）；③ 页头语言选择器同理由「选择器上挂 `.platform__lang`」改为「容器 div 定宽 8.5rem」。 |
| `Select` 的 `update:modelValue` 载荷为 `OptionValue \| null \| undefined` | 所有原 `@change` 改 `@update:model-value`；`v-model` + 显式 `@update:model-value` 可共存（编译器合并为数组、按模板顺序调用，实测 v-model 先写回）。 |
| `Password` 的 `feedback` 默认值由 `true` 变 `false` | 仓库内迁移前 6 处 `Password` **全部显式 `:feedback="false"`**（无强度条）→ 迁移后一律不传该 prop（caomei 默认即关闭），**不新增强度条这一可见 UI**。 |
| `CaomeiInput` / `CaomeiTextarea` 透传的 `@input` **先于** v-model 写回触发 | 内层控件的 v-model 由 `vModelDynamic` / `vModelText` 指令在 `created` 阶段 `addEventListener` 注册，晚于 `mergeProps` 里透传的 `onInput`；依赖「新值」的同步 handler 必须改用 `@update:model-value`（`credentials.vue` 的 PEM 指纹计算已改；`users.vue` 的搜索因有 300ms 防抖无影响，一并统一）。 |

**4）图标替换**

49 处字面 `icon="pi pi-*"`（21 个唯一值）连同 `:icon` 三元 / `<i class="pi pi-*">` 等动态用法共 **63 处 `pi pi-` 用法 / 30 个唯一图标**，全部替换为 `#icon` 槽 + `<CaomeiIcon :icon="X" />`（`@lucide/vue` 已升为平台直接依赖 `^1.48.0`）。映射表见 [§15.8](caomei-ui-migration-mapping.md#_15-8-选择器映射表更正-2026-09-28-b0-接线实证) 与 [平台规范 §7.4](../../standards/platform.md)。`CaomeiIcon` 默认 `size="1em"`，与 primeicons 的 1rem 同量级。

**5）验证证据**（可复现口径）

- e2e 全量：`pnpm exec playwright test --workers=1` → **172 passed / 0 failed / 0 flaky**（容器需 `playwright.local.config.ts` 的 `--no-sandbox` + 禁用 `--disable-dev-shm-usage` 覆盖，见 §15.10 第 9 条）。
- 单测：`pnpm --filter @dependfix/platform test` → 1295 passed / 9 skipped（与迁移前基线一致）。
- 门禁：`pnpm --filter @dependfix/platform typecheck` / `exec eslint . --max-warnings 10`（**非 `--fix`**）/ `build` 全部通过。
- 残留检查（**生产页面集合**，排除 M31.5 待删的 V1 验证页）：`grep -rnE "<(Button|Tag|Message|Card|Select|Dropdown|InputText|Dialog|Password|ToggleSwitch|InputSwitch|Textarea|SelectButton|Checkbox|Chips|Sidebar|ProgressSpinner|Avatar|MultiSelect|Paginator|ScrollPanel|Toast|ConfirmDialog)([ >/]|$)|pi pi-|fluid" apps/platform/app --include="*.vue" | grep -v __migration-validation` → **0 命中**（含注释）。
- **M31.5 待清理的 PrimeVue 残留**（5 类）：① `apps/platform/nuxt.config.ts`（`@primevue/nuxt-module` 注册、`DependfixPreset` / `@primeuix/themes` 主题、CSS layer、vite `dedupe` 5 项）；② `app/plugins/primevue-locale.ts`；③ `app/assets/styles/main.scss` 的 `.p-datatable-tbody > tr.p-datatable-empty-message > td` 死规则（+2 行说明注释）；④ `app/app.vue` 的「PrimeVue 仍由 `@primevue/nuxt-module` 注册」说明性注释；⑤ `app/pages/__migration-validation/{alerts-table,batch-runs-table}.vue` 的 5 处 `<Card>`（V1 验证页整体删除）。此外 `apps/platform/app` 下有 **24 个文件**在注释中提及 PrimeVue（均为解释性表述，如 `_caomei-tokens.scss` 的密度对齐依据、`chart-canvas.vue` 的动机说明），M31.5 收尾时按需改写。
- 编号标记扫描（**本批改动文件**）：`rg -n "§(M|C|T|P|G|R|B)\d+" <本批 app + e2e 改动文件>` → **0 命中**。仓库内未触及文件仍有 178 处历史 `§编号` 引用（跨 95 个文件，含 `server/` / `tests/` / `chart-canvas.vue` 等），登记为 M31.5 清理项。
- 浏览器取证：`artifacts/m31-b4/`（27 张截图：11 页 light + login/register + 4 页 dark + 3 页 mobile + Dialog / Select 浮层 / 分组表折叠与展开 / Drawer / Confirm / Toast；`ui-evidence.json` 记录 20 项检查（7 项交互）全部 OK，`findings` 为空 —— 该字段归集 `pageerror` 与 `console` 的 error / warning 两路，故等价于「0 console error / 0 pageerror」；**hydration mismatch 由 console warning 通道覆盖，未单独断言**）。
- 计算样式取证 `artifacts/m31-b4/style-parity.json`（冻结代码实测）：表格单元格密度 6px 8px（`pr-checks` 例外 8px 12px）、Card body padding 16px、确认弹窗 400px（「取消 / 确定」+ `role="alertdialog"`）、登录主按钮 `#0d9488` 底 × `#0b0b0d` 字、`users` 角色选择器容器与触发器均 144px（操作列 300px 无横向溢出）、页头语言选择器容器与触发器均 136px（8.5rem）、schedules 弹窗内 AutoComplete 与 Select 均 528px（= 容器全宽，`max-width: none`）、`repos` 标签录入 488px、`Message` soft 档 `border: 1px solid transparent`（已裁定接受的差异）。

**6）遗留项（B4 视觉收口 / 用户裁定复核）**

> **已收口**：M31.5（B3）逐项落定，结论见 [§15.13 第 6 条](#_15-13-b3-收尾实证-m31-5-2026-09-29)。以下 ⏳ 保留为 M31.4 收口时的原始登记。

- ⏳ **`severity="secondary"` 无 `text` 的 6 处按钮**：当前映射为 `tone="neutral"` 默认实底（深灰 #52525b + 白字），比 PrimeVue 的浅灰实底视觉更重；备选 `variant="secondary" tone="neutral"`（白底 + 浅描边，更接近原浅色观感但引入边框）。待 B4 或用户裁定。
- ⏳ `import-repos-dialog` owner 选择器触发器 badge 丢失（`Select` 无 `#value` 槽）→ B4 确认是否接受或外置渲染。
- ⏳ `Message` soft 档无边框（已裁定接受）→ B4 视觉复核时确认观感。
- ⏳ `index.vue` 加载 spinner 由内联 40px 改为 `size="lg"`（32px，caomei 无 40px 档）→ 差异轻微，如需精确对齐可覆盖 `--caomei-progress-spinner-size`。
- ⏳ `utils/alerts-view.ts` 的 `code-quality` ruleId 由 PrimeVue `contrast`（高对比实底）降为 `neutral`（与 default 同色）→ 视觉区分度下降，B4 复核是否改用 `warning` 或单独 variant。
- ⏳ `components/import-repos-dialog.vue` 的 `selectableRepos` 为**既有死代码**（迁移前即无引用）→ M31.5 清理时一并移除。
- ⏳ §15.11 第 8 条的两项（Paginator 页码按钮组 / 分页报表文案）仍待 B4 复核。

> **验证覆盖缺口（已知，非缺陷）**：`batch-import-filters` / `admin` 的全选 Checkbox 断言在 CI 环境（无真实 GitHub 凭据）走空态分支，`if (有候选)` 分支的「unchecked → click → checked」翻转未被 CI 实际执行（相对迁移前的**空断言**仍为增强，且空态分支有实质断言）；`/repos/[id]/runs` 兼容路径页无 e2e/截图覆盖；`TagsInput`（`repos.vue` 标签录入）与 `AutoComplete` 的 `strict`（自由文本不入模型）无自动化断言，仅人工/单测兜底。

## 15.13 B3 收尾实证（M31.5，2026-09-29）

> M31.5（B3）卸载 5 个 PrimeVue 依赖、清零代码侧引用、产出包体对比并完成文档同步。**迁移主线（M31.1-M31.5）至此闭环**；M31.6（C90 db-restore 补测）当时独立待启动 —— **该条后续已于 2026-09-29 闭环，M31 全部 6 原子条目已归档**（见 [M31](../../plan/archive/todo-archive-phases-m31.md#m31-apps-platform-ui-组件库迁移-primevue-→-caomei-ui-m31-1-m31-6-全部已闭环-2026-09-29-归档)）。

**1）依赖卸载与配置收敛**

- `apps/platform/package.json` 移除 `primevue` / `@primevue/nuxt-module` / `@primeuix/themes` / `primeicons` / `primelocale` 5 项（`pnpm remove`；`pnpm-lock.yaml` 同步收缩，且全仓已无任何包依赖 primevue）。
- `nuxt.config.ts` 收敛：删除 `@primeuix/themes` 的 `Aura` import 与 `definePreset` 生成的 `DependfixPreset`、`@primevue/nuxt-module` 模块注册、`primevue.composables.exclude`、`primevue.options.theme`（preset / darkModeSelector / cssLayer）、`primeicons/primeicons.css` 样式入口、`vite.resolve.dedupe` 5 项（迁移期双库去重）。
- 删除 `app/plugins/primevue-locale.ts`（连空的 `plugins/` 目录）与 `app/pages/__migration-validation/`（2 页 V1 验证页 + 目录）。
- `app/assets/styles/main.scss` 移除 `.p-datatable-tbody > tr.p-datatable-empty-message > td { border-bottom: 0 }` 死规则：caomei 空态单元格渲染为 `<td class="caomei-data-table__empty">`（**不含** `caomei-data-table__td` 类），而库内 `border-bottom` 只挂在 `__td` / `__th` / `__row-group-cell` / `__row-expansion-cell` 上 → caomei 下不存在迁移前的「表头 + 空态单元格双线」问题，规则**无需等价替代**。
- 清理遗留死代码：`components/import-repos-dialog.vue` 的 `selectableRepos`（迁移前即无引用）。
- `pnpm remove` 附带 Nuxt 生态传递依赖的 patch 级重解析：`bundle-name@4.1.0→4.1.1`、`ohash@2.0.11→2.0.12`（依赖链均落在 `nuxt` / `@nuxt/devtools` / `nitropack` 侧，与 PrimeVue 无关，`pnpm why` 已核对）；`@nuxt/kit@3.x` 则随 `@primevue/nuxt-module` 一并移除（预期）。均为重解析副产物，无行为影响。

**2）残留归零（可复现口径）**

| 检查 | 命令 | 结果 |
| :--- | :--- | :--- |
| 代码侧全量 | `rg -ni "primevue\|primeicons\|primelocale\|primeuix" apps/platform/{app,server,tests,nuxt.config.ts}` | **0 命中** |
| 样式选择器 | `rg -n -- "--p-[a-z]\|\.p-[a-z]" apps/platform/app apps/platform/tests apps/platform/nuxt.config.ts` | **0 命中** |
| 运行时 import | `rg -n "from ['\"](primevue\|@primevue\|@primeuix\|primeicons\|primelocale)" apps packages` | **0 命中** |
| 锁文件 | `grep -c primevue pnpm-lock.yaml` | **0** |

注释层中性化：改动前 HEAD 快照运行 `git grep -ni "primevue\|primeicons\|primelocale\|primeuix" HEAD -- apps/platform/{app,server,tests,nuxt.config.ts}` → **93 行 / 32 文件**；扣除随文件删除的 `app/plugins/primevue-locale.ts`（10 行）与 `app/pages/__migration-validation/alerts-table.vue`（2 行）后，实际需中性化 **81 行 / 30 文件**，逐处改写为「迁移前组件库 / 迁移前的 X」（保留原技术结论与数字，未改任何字符串字面量 / 模板 / 类型 / 选择器）。**该批改动全部落在注释行**（审计独立复核：32 个非删除 platform 文件的全部新增行中，除 `index.vue` 的模板 + scoped 样式属 B4 已裁定项外，其余均为注释行）。

**3）门禁与全量回归**

- `pnpm --filter @dependfix/platform typecheck` / `eslint . --max-warnings 10`（**非 `--fix`**）/ `stylelint --check` / `build` 全部通过；root 级 `pnpm run typecheck` 与 `npx eslint . --max-warnings 10`（非 `--fix`）同样通过（0 problem）。
- 文档门禁：`pnpm run check:docs`（links 142 md / vue-interp 79 md）、`pnpm run lint:md:check`、`pnpm --filter dependfix-docs build`（`docs:build`）全部通过。
- 单测：`pnpm --filter @dependfix/platform test` → **1295 passed / 9 skipped**（与迁移前基线一致）。
- e2e：`TMPDIR=/dev/shm pnpm exec playwright test --workers=1` → **173 passed / 0 failed / 0 flaky**。172 → 173 的净增量来自 M31.4 commit `f9f1a05` 新增的「关闭侧栏后抽屉隐藏且可再次打开（hide 清理语义回归）」用例（该 commit 的 `tests/e2e` diff 可见）。

> **容器环境要点（本地复现 e2e 的必需前置）**：容器内 `/tmp` 位于 overlayfs，Chromium 默认 arg `--disable-dev-shm-usage`（把共享内存落到 `/tmp`）会导致 renderer `Page crashed`。解法是重定向 `TMPDIR=/dev/shm`（tmpfs），**无需**临时 playwright 配置文件、也无需 `--no-sandbox` 覆盖即可跑通（M31.4 曾用 `ignoreDefaultArgs` + `--no-sandbox` 的等效方案，两者均验证有效）。

**4）包体对比（迁移前后）**

口径：对 `.output` 递归统计（脚本 `artifacts/m31-b5/measure-bundle.mjs`，gzip 用 zlib 默认档）；「迁移前」取 M31 起点前的 commit `a05ac3b` 构建产物（纯 PrimeVue；caomei-ui 当时已在 dependencies 但未注册模块，故不进产物）。

| 指标 | 迁移前 | 迁移后 | 变化 |
| :--- | ---: | ---: | ---: |
| client raw（`public/` 子集） | 3282.9 KiB | 1219.4 KiB | **−2063.5 KiB（−62.8%）** |
| client gzip（`public/` 子集） | 1044.5 KiB | 419.5 KiB | **−625.0 KiB（−59.8%）** |
| total raw（`.output` 全量） | 42250.3 KiB | 36936.0 KiB | −5314.3 KiB |

`.output` **全量**按扩展名分组（raw，脚本 `byGroupRaw`；与上表 client 口径不同，勿混读）：

| 分组 | 迁移前 | 迁移后 | 变化 |
| :--- | ---: | ---: | ---: |
| font | 283.5 KiB | 0 | −283.5 KiB（primeicons 4 档字体） |
| image | 368.9 KiB | 34.5 KiB | −334.5 KiB（`primeicons.svg` 334.5 KiB 归零） |
| js | 23189.5 KiB | 18773.9 KiB | −4415.6 KiB |
| css | 42.7 KiB | 101.8 KiB | +59.1 KiB（caomei 静态 `theme.css` vs PrimeVue CSS-in-JS 按需注入） |

留痕：`artifacts/m31-b5/bundle-{before,after}.json`（gitignored）。

**5）关键改动的静态与产物证据**

- **`index.vue` spinner 恢复 40px**：产物 `pages.*.css` 实测含 `.auth__spinner[data-v-7b4f7882]{--caomei-progress-spinner-size:40px}`。特异性论证：库的尺寸档规则由 `:where(.caomei-progress-spinner--lg[data-v-…])` 包裹（`:where()` 计 0，实际特异性 0,0,0），页面 scoped 规则为 0,2,0 → 覆盖成立，无需 `!important`。
- **空态无双线**：见第 1 条（caomei `data-table.js` 空态分支为 `<td class="caomei-data-table__empty" colspan=…>`；`dist/components/data-table/*.css` 的 `border-bottom` 不覆盖该类）。
- **6 处次要动作按钮实测**（computed style）：`scans` 刷新 / `repos` 批量导入 / `repos` 批量扫描 / `batch-runs` 刷新均为 `background: rgb(82,82,91)`（`--caomei-color-neutral-solid` #52525b）+ 白字实底；对照组 `layouts/default.vue` 的 ghost 变体为透明底 + `rgb(51,65,85)` 字。

**6）B4 视觉遗留项裁定结论（8 条全部落定）**

| 项 | 结论 | 依据 |
| :--- | :--- | :--- |
| `severity="secondary"` 无 text 的 6 处按钮（深灰实底） | **接受**（保持 `tone="neutral"`） | 与迁移前同为**实底**形态，仅色深更大；6 处均为页头/行内主操作（刷新 / 导入 / 批量扫描 / 上传 PEM / ack），实底醒目合理。如需弱化为描边，改 `variant="secondary"` 即可（`ComponentVariant` 已含该档，一行切换） |
| `code-quality` ruleId tone 降为 `neutral` | **接受** | ruleId 文本本身可辨识；改 `warning` 会与 `pnpm-audit` 撞色，混淆成本大于收益 |
| `import-repos-dialog` owner 触发器 badge 丢失 | **接受** | 信息未丢失（下拉 `#option` 内仍渲染 Personal/Org badge）；外置渲染会新增迁移前不存在的可见 UI |
| `Message` soft 档无边框 | **接受**（沿用 M31.4 用户裁定） | 实测 `border: 1px solid transparent`，亮/暗两态观感有截图留痕 |
| DataTable 内建分页报表文案丢失 | **接受** | caomei DataTable 无 `#paginator` 插槽；e2e 未断言该文案，且独立 Paginator 场景已自渲染报表（`.import-form__pagination-report`）保留等价能力 |
| `import-repos-dialog` 新增 Paginator 页码按钮组 | **接受** | 相对迁移前（PrimeVue template 无该控件）为可用性提升 |
| `index.vue` spinner 40px | **已修复** | 覆盖 `--caomei-progress-spinner-size: 40px` 与迁移前对齐（见第 5 条） |
| `repo-history-dialog` 布局（`#header` 内容上移为兄弟节点） | **接受** | M31.3 已接受差异并由 `scans.e2e.test.ts` case 3 覆盖；本批截图复核布局无错位 |

**7）浏览器取证（`artifacts/m31-b5/`）**

- 17 张截图：11 个业务页 + login / register + 2 页 dark（alerts / repos）+ 1 页 mobile（repos）+ `dialog-import-repos`（浮层）。
- `ui-evidence.json`：20 组检查，**console error / warning 与 pageerror 均为 0**（首轮唯一报错为取证脚本误用 `/index` 路由导致的 404，修正为 `/` 后复跑归零，非产品缺陷）。

**8）文档同步**

- [platform.md](../../standards/platform.md)：§1 技术选型表（UI / 主题 / 图标三行改 caomei-ui）、§7 前言（组件自动导入与暗色模式表述）、**§7.1 重写为「caomei-ui 集成实践」**（删除 9 条 PrimeVue 4 专属实现契约、保留 4 条组件库无关的通用实践并指向本节留痕）、**§7.4 去掉迁移期条款**（移除「双库并存」标题、「自动导入命名冲突」整条与迁移期执行分层说明；验证命令 artifacts 路径改为通用）。指向 §7.1 旧锚点的 4 处外链同步修正（`backlog.md` / 本文件 ×2 / `todo-archive-phases-m24.md`）。
- [tech-stack.md](../../guide/tech-stack.md)：核心框架表 `@primevue/core + primevue` 与 `@primeuix/themes` 两行替换为 `caomei-ui 0.3.0`（精确锁定）+ `@lucide/vue`。
- 计划与归档文档：`docs/plan/backlog.md` 的「PrimeVue 4 DataTable sort-mode / multisortMeta（持续观察）」known-issue 已整段移除 —— 迁移卸载后该观察项已无观察对象，按 [planning §4.4 第 11 条](../../standards/planning.md)「完全闭环 → 整段删除」处置（本批曾触碰该行，不能以超出范围免责）；`docs/plan/todo.md` 中 M31.2「风险与缓解」对已失效章节的引用改为中性表述；`docs/plan/archive/todo-archive-phases-m24.md` **仅**修正锚点 URL 并加一行「该节已随 M31 收口、陷阱正文以本归档页为准」注记，**不重写历史正文**（依 [spec-and-doc-governance §1.4](../../design/governance/spec-and-doc-governance.md) 归档冻结原则；锚点修正为 `check:docs` 强制的必要改动）。其余归档页（`todo-archive-phases-m10-c53-c59c61` / `-m13` / `-m14-m15` / `-m16-m17` 及 `-m24` 的另 1 处）中的**纯文本历史引用**（如「建议沉淀到 §7.1 PrimeVue 4 集成实践」）保持原样 —— 这些是当时的事实陈述，重写会破坏归档冻结原则；收口信息由 §7.1 前言的退役说明与本节承接。

**9）遗留（不在本批范围）**

- 代码注释中仍有**非 `§` 形式的历史编号标记**（如 `M20.3` / `C59` / `RG-B07` / `S-3`，多无文档路径），跨 `app/` / `server/` / `tests/` 多文件。本批按用户裁定只清理 **M31 触及文件中的 `§编号` 引用**（实际违规仅 `platform.md` 1 处孤立 `M17.1`/`C38`，已清；其余 14 处均带文档路径，属合规导航引用）。全量编号治理建议独立批次处理，避免与本批「组件库卸载」主题混杂。
- `.github/dependabot.yml` 的 `@primeuix/*` / `@primevue/*` / `primeicons` ignore 规则随依赖卸载成为**死配置**（不再命中任何包）—— 后续治理批次（M33.3）已移除该批 ignore 条目与配套注释（保留 `conventional-changelog` 条目）。

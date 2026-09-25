# apps/platform UI 组件库迁移评估与方案（PrimeVue → caomei-ui）

- 日期：2026-09-22
- 触发：用户需求——参照 caomei-ui 的源码与文档，制定 `apps/platform` 从 PrimeVue 迁移到 caomei-ui 的迁移方案，规避 PrimeUI 商业许可风险
- 输入（只读取数快照，两仓本地工作区）：
  - `apps/platform` 源码，dependfix `1a73abc`（2026-09-22）；取数时工作区含 2 处与本次无关的未提交改动
  - caomei-ui 仓库 `58f814d`（2026-09-22），`package.json` 版本 `0.1.0`，`main` 分支处于 Phase 12（发布就绪收官）进行中
  - 外部前置调研（非本仓库文档，作者本地工作区）：《PrimeVue 替代方案调研》《自建组件库（基于 Reka UI）最小组件集评估》
- 方法与口径：**只读静态比对**——`apps/platform` 侧按「`.vue` 开标签计数 + quote-aware 属性计数」（排除 `node_modules` / `.nuxt` / `.output` / 覆盖率与报告目录）统计 PrimeVue 用量；caomei-ui 侧逐组件核对组件文档、设计规范与源码 props。**未运行**任一仓库的构建或测试，**未改动任何代码**。
- 定位：迁移**评估与方案**（设计先行稿）。本次仅产出文档，不进入实施；上收与实施主体为 dependfix 仓库（见 §12）。
- 关联文档：[PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md)（License 治理前置）、[平台规范 §7.1](../../standards/platform.md#71-primevue-4-集成实践)、[技术栈](../../guide/tech-stack.md)、[Backlog](../../plan/backlog.md)

> 本文档为 **`apps/platform`（Nuxt 管理平台）PrimeVue → caomei-ui 的迁移评估与方案**，用于规避 PrimeUI 商业许可风险并与下游统一组件库。
>
> **状态**：评估先行稿，未进入阶段实施面（挂载到 [backlog.md §平台 UI 与组件库](../../plan/backlog.md) 候选 C88）；库侧能力补齐（若采纳）属 caomei-ui 仓库自身阶段范围，须另行立项。

---

## 1. 结论摘要

**结论：可行（有条件）**——`apps/platform` 实际用到的 23 个 PrimeVue 组件中 21 个在 caomei-ui 有等价组件，**不存在整体性阻塞**；剩余缺口集中在 `DataTable` 能力面、2 处无对应组件与 2 类零散改写。

三个先决条件：

1. **`DataTable` 行分组 / 行展开 / 多列排序能力先行（关键路径）**——`alerts.vue` 在用 `row-group-mode="subheader"` + `group-rows-by` + `expandable-row-groups` + `#groupheader` 槽 + `v-model:expanded-row-groups`；`batch-runs.vue` 在用**行展开**（`v-model:expanded-rows` + `Column expander` + `#expansion` 槽 + `@row-expand`）。caomei-ui DataTable **既无行分组也无行展开**（源码 0 命中，二者均未登记于 caomei-ui Backlog）；且其为**单列排序**，不支持 `sort-mode="multiple"` + `v-model:multi-sort-meta`（`alerts.vue` / `pr-checks.vue` 在用）。这些能力需**库侧补齐**或 **apps/platform 侧改写**（见 §5.2）。
2. **2 处无对应组件**——`ScrollPanel`（2 处，`repo-history-dialog.vue` / `run-detail-dialog.vue`）改用原生滚动容器 + CSS；`Chips`（1 处，`repos.vue` 标签录入）可用 `CaomeiAutoComplete` + `multiple` 近似，或在页面侧自绘标签输入。二者 caomei-ui 均无对应组件，亦未登记为候选（见 §5.3）。
3. **`Select` 可搜索单选改用 `AutoComplete`**——`schedules.vue` 时区选择器用 `Select` + `filter`；caomei-ui 的 Reka Select 无 filter primitive，官方口径为映射到 `CaomeiAutoComplete`（见 caomei-ui 设计规范 §7 与[从 PrimeVue 迁移](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/guide/primevue-migration.md)）。

工作量画像（可复现的规模口径，非工期）：

| 指标 | 计数 |
| :--- | :--- |
| PrimeVue 组件 | **23 个 / 417 个开标签 / 23 个 `.vue`** |
| `severity` 属性 | **111 处**（字面量 79 + 动态绑定 32；按组件 Tag 51 / Message 39 / Button 21） |
| `fluid` 属性 | **64 处**（Select 26 / InputText 23 / Password 7 / Textarea 3 / Button 3 / Chips 1 / MultiSelect 1） |
| `size="small"` | **52 处**（Button 33 / DataTable 16 / Select 2 / Avatar 1） |
| `icon="pi pi-*"` | **49 处 / 30 个唯一图标 / 19 文件**（全部落在 Button） |
| PrimeVue 主题 token `--p-*` | **10 处 / 7 文件** |
| PrimeVue 组件 class `.p-*`（样式层） | **7 处 / 2 文件**（`:deep(` 3 处；`:global(` 4 处均在注释，非实际声明） |
| e2e 测试 `p-*` / `data-p-*` 断言 | **16 个文件**（PrimeVue class 依赖集中在此，是迁移的主要回归面） |
| 命令式 API | `useToast` 1 文件；`useConfirm` / `useDialog` / `$primevue` **0** |

---

## 2. 背景与 License 风险现状

### 2.1 触发与既有治理

PrimeTek 已公告 PrimeVue 5.x 起转入 PrimeUI 商业许可（Community 免费档有组织规模限制且强制 license key），PrimeVue 4.x / `@primeuix/themes` 2.x / `primeicons` 7.x 保持 MIT。仓库已先行完成两轮 License 治理（主线编号见[路线图](../../plan/roadmap.md)）：

- **主题库与图标降级**：`@primeuix/themes` 3.x → **2.0.3（MIT）**、`primeicons` 8.x → **7.0.0（MIT）**，方案见 [PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md)。
- **实际依赖核对**（2026-09-22 实测 `pnpm-lock.yaml` + 包内 LICENSE）：`primevue@4.5.5`（MIT）、`@primevue/nuxt-module@4.5.5`（MIT）、`@primeuix/themes@2.0.3`（MIT）、`primeicons@7.0.0`（MIT）、`primelocale@2.5.0`。**当前不存在处于 PrimeUI 商业许可的运行时依赖**。

### 2.2 当前剩余风险

1. **升级路径冻结**：PrimeVue 4.x 是 MIT 冻结分支；升到 5.x 即进入商业许可范围，意味着后续安全更新、新组件与新框架兼容（Nuxt 4 后续版本）都只能停在 4.5.5。
2. **Dependabot / 供应链噪声**：`primevue ^4.5.5`、`@primevue/nuxt-module ^4.5.5` 等依赖需长期用 override / 人工判读挡住 5.x 升级（Backlog 已登记「PrimeVue 4 → 5 升级评估」暂缓项）。
3. **多前缀双轨成本**：`p-*` / `--p-*` / `@primevue/*` 与 CSS `@layer primevue` 分散在 `nuxt.config.ts`（模块 + 主题 preset + vite dedupe）、`main.scss`、e2e selector 三处，长期与团队自建组件库并行维护。
4. **统一路线既定**：caomei-ui 的定位即「替代多个下游项目中的 PrimeVue」，其[路线图](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/plan/roadmap.md)「目标下游」明确包含 `dependfix/apps/platform`。

### 2.3 目标与非目标

**目标**：为 `apps/platform` 建立一条可分批、可回退、与 caomei-ui 能力面口径一致的迁移路径，最终卸载 PrimeVue 栈（`primevue` / `@primevue/nuxt-module` / `@primeuix/themes` / `primeicons` / `primelocale`）。

**非目标（本次）**：不实施任何代码改动；不修改 caomei-ui 仓库；不升级 PrimeVue 5.x；不引入 Tailwind / 更换样式体系（caomei-ui 亦不引入 Tailwind，与 `apps/platform` 的 SCSS(BEM) 一致）。

---

## 3. `apps/platform` 现状盘点

### 3.1 集成方式

| 项 | 事实 |
| :--- | :--- |
| 依赖 | `primevue@^4.5.5`、`@primevue/nuxt-module@^4.5.5`、`@primeuix/themes@^2.0.3`、`primeicons@^7.0.0`、`primelocale@^2.5.0`（`apps/platform/package.json`） |
| Nuxt 模块 | `modules: ['@primevue/nuxt-module', '@nuxtjs/i18n']`（`nuxt.config.ts`） |
| 主题 | `definePreset(Aura, …)` + 自定义 teal 主色阶（`primary.500 = #14b8a6` / `600 = #0d9488`）；`darkModeSelector: '.dark'`；CSS layer `name: 'primevue', order: 'theme, base, primevue'` |
| 样式入口 | `css: ['primeicons/primeicons.css', '@/assets/styles/main.scss']` |
| vite dedupe | `primevue` / `@primevue/core` / `@primeuix/styled` / `@primeuix/styles` / `@primeuix/themes` |
| locale 联动 | `app/plugins/primevue-locale.ts` 用 `usePrimeVue()` 同步 `primelocale`（zh_CN / en），跟随 `@nuxtjs/i18n` |
| 显式子路径导入 | `primevue/datatable`（`DataTableSortMeta` 类型，2 文件）、`primevue/usetoast`（1 文件）、`primevue/config`（1 文件）；组件本体走模块自动导入 |

### 3.2 组件用量

23 个组件 / 417 个开标签 / 23 个 `.vue`：

| PrimeVue | 处 | 文件 | PrimeVue | 处 | 文件 |
| :--- | :-: | :-: | :--- | :-: | :-: |
| `Column` | 121 | 13 | `Password` | 7 | 4 |
| `Button` | 65 | 20 | `ToggleSwitch` | 3 | 3 |
| `Tag` | 54 | 17 | `Textarea` | 3 | 2 |
| `Message` | 39 | 20 | `SelectButton` | 2 | 1 |
| `Card` | 32 | 15 | `ScrollPanel` | 2 | 2 |
| `Select` | 28 | 12 | `Dropdown`（`Select` 弃用别名） | 2 | 1 |
| `InputText` | 24 | 10 | `Checkbox` | 2 | 1 |
| `DataTable` | 17 | 13 | `Sidebar` / `ProgressSpinner` / `Paginator` | 各 1 | 各 1 |
| `Dialog` | 9 | 8 | `MultiSelect` / `InputSwitch` / `Avatar` / `Chips` | 各 1 | 各 1 |

> `Chart` 不计入：`apps/platform` 未使用 PrimeVue `<Chart>`，而是自实现 `chart-canvas.vue`（仅注册用到的 chart.js 子集，避免 PrimeVue wrapper 引入的 ~200KB 全量依赖）。迁移**不涉及图表**。
>
> `Dropdown`（2 处，`pr-checks.vue`）是 PrimeVue 4 的 `Select` 弃用别名，映射同 `Select`；`Chips`（1 处，`repos.vue`）在 caomei-ui **无对应组件**（见 §5.3）。

**受影响 `.vue`（23 个）**：`layouts/default.vue`；`components/{ai-config-form, alert-run-sidebar, import-repos-dialog, repo-ai-toggle, repo-history-dialog, run-detail-dialog, scan-config-dialog}.vue`；`pages/{index, dashboard, alerts, batch-runs, credentials, env-events, login, pr-checks, register, repos, scans, schedules, settings, users}.vue` 与 `pages/repos/[id]/runs.vue`。

### 3.3 属性与特性用量

| 特性 | 计数 | 备注 |
| :--- | :-: | :--- |
| `severity` 属性 | 111 | 字面量 79（Message 39 / Tag 20 / Button 20）+ 动态绑定 32（Tag 31 + Button 1，`users.vue` 启停按钮）；即 Tag 合计 51、Message 39、Button 21。另有 `v-model:severity` 1 处属本地 `ScanConfigDialog`，非 PrimeVue |
| `fluid` | 64 | Select 26 / InputText 23 / Password 7 / Textarea 3 / Button 3 / Chips 1 / MultiSelect 1 |
| `size="small"` | 52 | Button 33 / DataTable 16 / Select 2 / Avatar 1 |
| `icon="pi pi-*"` | 49 | 全部落在 Button；30 个唯一图标 |
| `Column` 属性 | — | `header` 119 / `field` 64 / `sortable` 49 / `style` 13 / `default-sort-order` 6 / `:export` 3（PrimeVue 无该 prop，疑静默无效，见 §5.3）/ `expander` 1 / `exportable` 1 / `selection-mode` 1 / `header-style` 1 |
| `DataTable` 属性 | — | `value` 17 / `empty-message` 16 / `striped-rows` 16 / `size` 16 / `removable-sort` 8 / `data-key` 6 / `paginator` 3 / `rows` 3 / `rows-per-page-options` 3 / `paginator-template` 2 / `current-page-report-template` 2 / `lazy` 2 / `total-records` 2 / `first` 2 / `scrollable` 1 / `scroll-height` 1 |
| `Paginator` 属性 | — | `template` 1 / `current-page-report-template` 1 / `rows-per-page-options` 1 / `first` 1 / `total-records` 1（`import-repos-dialog.vue`） |
| 行分组（alerts.vue） | 1 文件 | `row-group-mode` + `group-rows-by` + `expandable-row-groups` + `v-model:expanded-row-groups` + `#groupheader` |
| 行展开（batch-runs.vue） | 1 文件 | `v-model:expanded-rows` + `Column expander` + `#expansion` 槽 + `@row-expand` |
| 多列排序 | 2 文件 | `sort-mode="multiple"` + `v-model:multi-sort-meta`（alerts.vue / pr-checks.vue） |
| `Select` 特性 | — | `option-label` 26 / `option-value` 26 / `fluid` 26 / `filter` 1 / `show-clear` 1 |
| `Dialog` 特性 | — | `header` 9 / `modal` 9 / `:draggable="false"` 9 / `breakpoints` 1 / `v-model:visible`（含 Sidebar）12 |
| `ScrollPanel` | 2 | 日志区固定高度滚动（`repo-history-dialog.vue` / `run-detail-dialog.vue`） |
| `SelectButton` / `MultiSelect` / `Chips` | 2 / 1 / 1 | `import-repos-dialog.vue` / `schedules.vue` / `repos.vue` |

### 3.4 样式耦合

样式耦合显著低于同类下游项目（对比 momei 的 `var(--p-*)` 1312 处 / SCSS 20 文件）：

- **`--p-*` token 引用 10 处 / 7 文件**：`--p-content-border-color` ×4、`--p-surface-50`、`--p-primary-color`、`--p-datatable-body-cell-border-color`、`--p-content-muted-color`、`--p-content-hover-background`、`--p-content-background`。
- **`.p-*` 组件 class（样式层）7 处 / 2 文件**：`.p-tag-label` ×3、`.p-datatable-tbody` ×2、`.p-datatable-thead`、`.p-datatable-empty-message`（`alerts.vue` + `main.scss`）。
- **`:deep(` 3 处**（`alerts.vue` 的 `.p-tag-label`）；`:global(` 4 处**均在注释**（`_mixins.scss` 说明 CSS Modules 语法的注意事项），非实际声明。`main.scss` 内含针对 Aura 的 DataTable 边框覆盖与 `.dark` 覆盖（`_mixins.scss` 以 `.dark &` 适配 `darkModeSelector: '.dark'`）。

### 3.5 测试耦合

- **e2e：16 个文件**依赖 PrimeVue 渲染产物，断言集中且深入（`.p-datatable` 57 / `.p-dialog-header` 17 / `.p-dialog` 12 / `.p-select-overlay` 11 / `data-p-sortable-column` 9 / `.p-message-*` 12 / `.p-drawer` 5 / `.p-datatable-row-toggle-button` 5 / `data-p-sorted` 3 / `.p-select-option` 3 / `.p-checkbox-input` 2 / `.p-button-loading-icon` 2 / `.p-paginator` 1 / `.p-datatable-table-container` 2 等）。
- **单测：0 个 `vi.mock('primevue/*')`**（`apps/platform` 单测未 mock PrimeVue 服务），迁移对单测的影响面小于 momei（后者 18 个 mock 文件）。
- 关键 e2e 用例与本迁移直接相关：`alerts-rowgroup.e2e.test.ts`（行分组 + 折叠 + 多列排序）、`sortable.e2e.test.ts`、`batch.e2e.test.ts`、`i18n.e2e.test.ts`（PrimeVue 内建文案联动）、`dark-mode.e2e.test.ts`、`repos-crud` / `credentials-crud` / `schedules` / `env-events` / `alerts-sidebar`。

### 3.6 i18n 集成

`app/plugins/primevue-locale.ts` 通过 `usePrimeVue()` 把 `primelocale` 的 `zh_CN` / `en` 同步到 PrimeVue `config.locale`，并 `watch(i18n.locale)`。caomei-ui 以 `CaomeiConfigProvider` + `useLocale()` / `provideLocale()` 承载内建文案，内建 zh-CN / en-US（另有 zh-TW / ja-JP / ko-KR），经 `caomei-ui/nuxt` 模块注入。该插件在迁移后可整体移除（见 §5.4）。

### 3.7 依赖与 License 汇总（迁移卸载目标）

| 依赖 | 版本 | License | 迁移后处置 |
| :--- | :--- | :--- | :--- |
| `primevue` | 4.5.5 | MIT | 卸载 |
| `@primevue/nuxt-module` | 4.5.5 | MIT | 卸载（换 `caomei-ui/nuxt`） |
| `@primeuix/themes` | 2.0.3 | MIT | 卸载（换 `caomei-ui/theme.css` + token 覆盖） |
| `primeicons` | 7.0.0 | MIT | 卸载（换 `@lucide/vue`） |
| `primelocale` | 2.5.0 | MIT | 卸载（换 caomei-ui 内建文案） |
| `caomei-ui` | 0.1.0（npm `latest`） | MIT | 新增 |

---

## 4. caomei-ui 能力面现状

### 4.1 版本与包形态

- **npm `latest` = 0.1.0**（2026-09-19 本地手动发布，MIT）；`main` 分支正在准备 **0.2.0**，含**包形态破坏性变更**：全量单体 `styles.css` 不再产出，**基础层入口为 `caomei-ui/theme.css`**，组件样式随构建产物按需自带。迁移应以 0.2.0 形态接入，或按 0.1.0 形态并用（两者子路径导出不同，需在实施时固定版本）。
- 单仓库单包，子路径导出：`caomei-ui`（组件 + composables）/ `caomei-ui/theme.css`（基础 token）/ `caomei-ui/resolver` / `caomei-ui/nuxt`。
- 运行时依赖仅 4 个：`reka-ui`（精确锁 2.10.4）、`@tanstack/vue-table`、`@internationalized/date`、`@lucide/vue`。
- **不引入 Tailwind / UnoCSS**，样式为 CSS variables + 原生 CSS/SCSS —— 与 `apps/platform` 的 SCSS(BEM) 体系一致，**不涉及样式体系切换**。

### 4.2 组件覆盖

组件目录 47 个（另有 `_shared` 内部目录）/ `src/index.ts` 聚合导出 47 个组件族，覆盖 Tier 0~3 + 补全批：Button、Input、Textarea、InputNumber、Tag、Badge、Select、MultiSelect、SelectButton、AutoComplete、DatePicker、Calendar、ColorPicker、ToggleButton、Switch、Checkbox、CheckboxGroup、RadioGroup、Slider、Password、FileUpload、FloatLabel、InputGroup、ButtonGroup、SplitButton、Dialog、Drawer、ConfirmDialog、Message、Popover、DropdownMenu、Toast、Toolbar、Tabs、Accordion、Stepper、DataTable、DataView、Paginator、ProgressBar、ProgressSpinner、Skeleton、Card、Divider、Image、Avatar、ConfigProvider。

### 4.3 迁移支撑能力

| 能力 | 对 `apps/platform` 的意义 |
| :--- | :--- |
| `caomei-ui/nuxt` 模块 | 组件与 composables 自动导入、样式注入、`darkMode` / `theme` 配置，**替位 `@primevue/nuxt-module`** |
| `caomei-ui/theme.css` | 基础 token（颜色 / 尺寸 / 层级 / 阴影），**替位 Aura preset** |
| `.dark` class 暗色机制 | 与 `apps/platform` 现有 `use-color-mode.ts`（`<html>.dark`）**同机制**，`_mixins.scss` 的 `.dark &` 写法可保留 |
| `CaomeiConfigProvider` / `useLocale` | 替位 `primevue-locale.ts` + `primelocale` |
| `useToast` / `useConfirm` | 替位 PrimeVue Toast / ConfirmDialog 服务 |
| `check:nuxt` / Nuxt 消费冒烟 | 库侧已具备下游接入验证手段 |

### 4.4 与 `apps/platform` 相关的设计取向

- **组件与样式解耦**：默认极简样式，可 100% 通过 `--caomei-*` CSS variables 覆盖。
- **命名空间不冲突**：组件前缀 `Caomei`、类名 `caomei-`、token `--caomei-*`，与 `p-*` / `--p-*` 并存无冲突 → 支持**双库并存期按路由 / 页面白名单逐页切换**。
- **有意差异以设计规范 §7 为唯一事实源**：逐组件的映射与「未实现 / 未暴露」清单见 [caomei-ui 设计规范 §7](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/design/design-spec.md)。
- **0.x 阶段 API 与目录结构仍可能调整**，迁移期需 pin 版本（见 §9）。

---

## 5. 逐组件映射（`apps/platform` 实际用量）

### 5.1 覆盖总表

映射口径以 caomei-ui 设计规范 §7 为准（下表为适配 `apps/platform` 的摘录与差异标注）。

| PrimeVue | 处/文件 | caomei-ui 对应 | 迁移性质 |
| :--- | :-: | :--- | :--- |
| `DataTable` / `Column` | 17/13 · 121/13 | `CaomeiDataTable` + `columns` 数组（`#cell-{key}` / `#header-{key}` 插槽） | **结构性改写**（行分组 / 行展开 / 多列排序不支持，见 §5.2） |
| `Button` | 65/20 | `CaomeiButton` | 机械（`severity`→`tone`、`text`→`variant="ghost"`、`outlined`→`variant="secondary"`、`icon="pi pi-*"`→`#icon` + `@lucide/vue`、`size` `small`→`sm`、`fluid`→`block`） |
| `Tag` | 54/17 | `CaomeiTag` | 机械（`severity`→`tone`、`value`→默认插槽、`rounded` 同名；`secondary` / `info` 为有损近似 → `neutral` / `primary`） |
| `Message` | 39/20 | `CaomeiMessage` | 机械（`severity`→`tone`：`error`→`danger`；`closable` 同名；内容走 `title` / `description` / 默认插槽） |
| `Card` | 32/15 | `CaomeiCard` | 机械（`#content`→默认插槽、`#title`→`title` prop 或 `#title` 槽、`#header`→`#header`） |
| `Select` | 28/12 | `CaomeiSelect`（可搜索 → `CaomeiAutoComplete`） | 机械 + 1 处改组件；**`fluid` 删除**，需全宽时覆盖 `--caomei-select-max-width: none` |
| `Dropdown`（`Select` 弃用别名） | 2/1 | `CaomeiSelect` | 同 `Select`；顺手改为 `CaomeiSelect`（`Dropdown` 为 PrimeVue 4 弃用别名） |
| `InputText` | 24/10 | `CaomeiInput` | 机械（`fluid` 删除，默认 `width: 100%`；`invalid` 同名；`type` 同名） |
| `Dialog` | 9/8 | `CaomeiDialog` | 机械（`v-model:visible`→`v-model:open`、`header`→`title`、`close-on-escape`→`closeOnEsc`、`breakpoints` 同名；`:draggable="false"` 可直接删除；`:style="{width}"` 经 `$attrs` 落到面板，等价） |
| `Password` | 7/4 | `CaomeiPassword` | 机械（`fluid` 删除；**`feedback` 默认由 `true` 变 `false`**，凭据 / Token 字段可不开启，用户自设密码若需强度条须显式 `:feedback="true"`） |
| `ToggleSwitch` / `InputSwitch` | 3/3 · 1/1 | `CaomeiSwitch` | 机械（`change` 事件名相同、**载荷由原生事件改为布尔值**；`input-id`→`id`） |
| `Textarea` | 3/2 | `CaomeiTextarea` | 机械（`fluid` 删除；`auto-resize`→`autoResize`） |
| `SelectButton` | 2/1 | `CaomeiSelectButton` | 机械（`option-label` / `option-value` 同义） |
| `Checkbox` | 2/1 | `CaomeiCheckbox` | 机械（`binary` / `input-id`→`id` / `aria-label`→`label`） |
| `ScrollPanel` | 2/2 | **无** | **改写**：原生滚动容器 + CSS（见 §5.3） |
| `Chips` | 1/1 | **无** | **改写**：`CaomeiAutoComplete` + `multiple` 近似（自由文本 + 多值）或页面侧自绘标签输入（见 §5.3） |
| `Sidebar` | 1/1 | `CaomeiDrawer` | 机械（`visible`→`v-model:open`、`#header`→`title` 或 `#header` 槽、`position="right"` 同名；`@hide` 语义等价；`modal` 默认锁滚动更严格） |
| `ProgressSpinner` | 1/1 | `CaomeiProgressSpinner` | 机械（`:style` 任意 px 尺寸 → `size` 档位或 `--caomei-progress-spinner-size`；`strokeWidth` 语义由 SVG 单位改为 CSS 长度） |
| `Paginator` | 1/1 | `CaomeiPaginator` | **改写**：`v-model:first`→`v-model:page`（1 基）、无 `template` / `CurrentPageReport`（见 §5.3） |
| `MultiSelect` | 1/1 | `CaomeiMultiSelect` | 机械（`fluid` 删除 + 宽度上限；**`filter` / `display="chip"` 均删除**——搜索为内建常开、形态固定 chip） |
| `Avatar` | 1/1 | `CaomeiAvatar` | 机械（`image`→`src`、`size` `small`→`sm`、`label`→`fallback`；默认 `shape` 由 `square` 变 `circle`、`size` 档位不同，需视觉复核） |

> `Chart`（0 处）：已由自实现 `chart-canvas.vue` 承接，迁移不涉及；`Chart` 亦不在 caomei-ui 自研范围（外购建议）。

### 5.2 结构性缺口（关键路径）：`DataTable` 行分组与多列排序

`alerts.vue` 与 `batch-runs.vue` 的表格依赖 PrimeVue DataTable 的多项能力，caomei-ui 当前**均不具备**：

| 能力 | `apps/platform` 用法 | caomei-ui 现状 | 影响 |
| :--- | :--- | :--- | :--- |
| **行分组 subheader** | `alerts.vue`：`:row-group-mode="'subheader'"` + `:group-rows-by="'packageName' \| 'repository'"` + `#groupheader` 槽，按视图模式（none / package / repository）动态切换 | 无 `rowGroup` / `groupRowsBy` / `#groupheader`（源码 0 命中，Backlog 未登记） | `alerts.vue` 分组视图无法直接迁移 |
| **可展开 / 折叠分组** | `alerts.vue`：`expandable-row-groups` + `v-model:expanded-row-groups`（`string[]`），点击 subheader 折叠，内建 `rowToggleButton` + chevron | 无 `expandableRowGroups` / `expandedRowGroups`；无内建 toggle 按钮 | 折叠交互与 `alerts-rowgroup.e2e.test.ts` 的断言（`rowToggleButton` / `#groupheader`）全部需要重写 |
| **行展开（expansion）** | `batch-runs.vue`：`v-model:expanded-rows` + `<Column expander>` + `#expansion` 槽 + `@row-expand` | 无 `expandedRows` / `expander` / `#expansion`（源码 0 命中，Backlog 未登记） | `batch-runs.vue` 展开行（内含嵌套表格）需结构性改写 |
| **多列排序** | `sort-mode="multiple"` + `v-model:multi-sort-meta`（`[{_severityRank,-1},{packageName,1}]`），alerts 默认按严重级别优先；pr-checks 亦用多列排序 | DataTable 为**单列**排序（`sortField` + `sortOrder`，受控 / 自持） | 两文件的排序模型需降级或库侧补多列排序 |
| **降序优先** | `:default-sort-order="-1"`（6 处，横跨 5 文件） | 内部固定 `sortDescFirst: false`（首次点击恒升序） | 需改用「取反 ranking」或库侧暴露 `sortDescFirst` |
| `scrollable` + 高度 | `env-events.vue` 用 `scrollable` | 无 `scrollable`（有冻结列 + `min-width`） | 1 处用容器 + CSS 承接 |
| `size="small"` | 16 处 DataTable | 无 `size` prop | 密度经 CSS variables 覆盖 |
| `empty-message` | 16 处 | `emptyText` prop + `#empty` 槽 | 机械 |

**处置选项（待实施阶段敲定）**：

| 选项 | 说明 | 代价 |
| :--- | :--- | :--- |
| **A. 库侧补齐行分组 / 行展开 / 多列排序** | 在 caomei-ui DataTable 上新增 `rowGroupMode` / `groupRowsBy` / `expandableRowGroups` / `#groupheader`、`expandedRows` / `expander` / `#expansion` 与多列排序模型 | 需 caomei-ui 立项（属另一仓库的阶段范围）；收益是 `alerts.vue` / `batch-runs.vue` 低改写 |
| **B. `apps/platform` 侧改写** | 用 `columns` + `#cell-{key}` 自定义渲染分组 / 展开标记；折叠与展开用自绘行（表格外或独立列表区）；多列排序降级为单列（严重级别优先，packageName 次排序改在数据层预排） | 只改 dependfix；`alerts.vue` / `batch-runs.vue` 结构性重写 + e2e 重写；失去「点列头切多键」交互 |
| **C. 混合** | 先按 B 迁移，同时向 caomei-ui Backlog 登记行分组 / 行展开 / 多列排序候选，待库侧补齐后简化 | 两步成本，但避免阻塞 |

> 推荐 **C**（先 unblock 迁移、后回补能力），与 caomei-ui 在 momei 迁移中「先改好再迁移」的既有原则兼容；最终取向待用户裁定。

### 5.3 其余需改写项

| # | 位置 | 现状 | 迁移处置 |
| :-: | :--- | :--- | :--- |
| 1 | `schedules.vue` 时区 `Select` + `filter` | PrimeVue Select 面板内搜索 | 改 `CaomeiAutoComplete`（caomei-ui 官方口径）；注意 AutoComplete **允许自由文本**，需自行校验值必须来自 IANA 列表 |
| 2 | `schedules.vue` 仓库 `MultiSelect` + `filter` + `display="chip"` | PrimeVue 多选，面板内搜索 + chip 形态 | `CaomeiMultiSelect` **无 `filter` / `display` prop**（搜索为内建常开、形态固定 chip，见 caomei-ui 多选组件文档「未实现」）；两个属性**删除**即可，其余机械迁移 |
| 3 | `repos.vue` `Chips`（标签录入，1 处） | `v-model` 为字符串数组 + `fluid` | caomei-ui **无 Chips / TagsInput**；用 `CaomeiAutoComplete` + `multiple` 近似（多值 + 自由文本），或页面侧自绘标签输入；建议向 caomei-ui Backlog 登记 TagsInput 候选 |
| 4 | `repo-history-dialog.vue` / `run-detail-dialog.vue` `ScrollPanel` | PrimeVue 滚动面板，`style="height: 200px"` | 改 `<div class="…" style="height:200px;overflow:auto">`（原生滚动 + CSS） |
| 5 | `import-repos-dialog.vue` `Paginator` | `template="PrevPageLink CurrentPageReport NextPageLink RowsPerPageDropdown"` + `current-page-report-template` + `v-model:first` | `CaomeiPaginator` 无 `template` / `CurrentPageReport`；改用 `v-model:page`（1 基）+ `rowsPerPageOptions`，并用 `page` / `itemsPerPage` / `total` 自渲染「第 x / 共 y 页」 |
| 6 | DataTable `paginator-template` + `current-page-report-template`（2 处：`scans.vue` / `repo-history-dialog.vue`） | `PrevPageLink CurrentPageReport NextPageLink RowsPerPageDropdown` + 页码报表模板 | 同 #5：内建分页器无模板，需自渲染或接受默认形态 |
| 7 | `layouts/default.vue` / `pages/*` 的 `useToast` | `pr-checks.vue` 调 `useToast()`，但**全仓无 `<Toast />` 根挂载**（提示从未渲染） | 迁移时挂载 `CaomeiToastProvider` 一次，**顺带修复该既有缺陷** |
| 8 | 二次确认 | 现用原生 `window.confirm`（`batch-runs.vue` / `settings.vue` / `users.vue`） | 非必需迁移项（**不计入验收**）；如需统一 UI 可改 `useConfirm()`（caomei-ui 返回 `Promise<boolean>`） |
| 9 | `--p-*` / `.p-*` 覆盖（10 + 7 处） | 依赖 PrimeVue 主题变量与组件 class | 逐项改 `--caomei-*` token / 组件 class（见 §6） |
| 10 | `Column expander`（`batch-runs.vue` 1 处） | PrimeVue 行展开列 | 随 §5.2 行展开取向一并处理（caomei-ui 无 `expander`） |
| 11 | `Column :export="false"`（`alerts.vue` 3 处） | PrimeVue Column **无 `export` prop**（其功能 props 为 `exportable`），该写法疑为静默无效 | 迁移时直接删除；caomei-ui DataTable 无导出能力，`exportable` 亦无对应 |

### 5.4 通用属性与事件映射

| 维度 | PrimeVue | caomei-ui |
| :--- | :--- | :--- |
| 语义色 | `severity` | `tone` + `variant`（`secondary` / `contrast` → `neutral`、`info` → `primary`，均有损近似） |
| 尺寸 | `small` / `large` | `sm` / `lg` |
| 图标 | `icon="pi pi-x"` 字符串类名 | `#icon` 插槽 + `@lucide/vue` 组件（49 处需替换 30 个唯一图标） |
| 受控字段 | `v-model:visible` / `v-model:value` / `v-model:first` | `v-model:open` / `v-model` / `v-model:page`（1 基） |
| 浮层标题 | `header` | `title`（可选化，缺省用库内建文案） |
| 校验态 | `class="p-invalid"` | `:invalid` |
| 全宽 | `fluid` | 默认 `width: 100%`（Button 用 `block`）；选择器家族带 `20rem` 上限，需全宽时覆盖对应上限 token 为 `none` |
| 选项字段 | `option-label` / `option-value` | `optionLabel` / `optionValue` |
| 事件载荷 | 如 `Switch` 的 `change` 传原生事件 | 传切换后的布尔值 |
| 列插槽 | 列级 `#body` / `#header` | `#cell-{key}` / `#header-{key}` |
| i18n | `usePrimeVue().config.locale` + `primelocale` | `CaomeiConfigProvider` + `useLocale` / `provideLocale` |

---

## 6. 主题与 token 迁移

`apps/platform` 当前主色为 teal（Aura preset，`primary.600 = #0d9488`），暗色经 `<html>.dark` + `darkModeSelector: '.dark'`。caomei-ui 默认 `.dark` class / `[data-theme="dark"]`，机制一致，`_mixins.scss` 的 `.dark &` 覆盖可沿用。

**token 映射草案**（值需在实施阶段经 `@ui-validator` 真实浏览器复核）：

| PrimeVue / 现用值 | caomei-ui token | 建议值 | 备注 |
| :--- | :--- | :--- | :--- |
| `primary.500 / 600`（#14b8a6 / #0d9488） | `--caomei-color-primary` | `#0d9488`（亮） | soft / 描边 / 文字强调 |
| `primary.contrastColor`（白） | `--caomei-color-primary-foreground`（亮）/ `--caomei-color-on-solid` | `#fff` | 随主题变化，需按明暗分别覆盖 |
| 主色实底（按钮 / 选中态） | `--caomei-color-primary-solid` | **建议 `#0f766e`（teal-700）** | **对比度约束**：`#0d9488` 配白字约 **3.74:1**，低于 caomei-ui 设计规范 §3.2 对 `-solid` × `on-solid` 的 AA（4.5:1）要求；`#0f766e` 配白字约 **5.47:1** 达标 |
| 暗色主色 | `--caomei-color-primary`（暗） | `#5eead4`（teal-300） | 暗底对比度充分 |
| `--p-content-background` / `--p-surface-50` | `--caomei-color-bg` / `--caomei-color-bg-elevated` | 按页面现状对齐 | — |
| `--p-content-border-color` / `--p-datatable-body-cell-border-color` | `--caomei-color-border` / `--caomei-data-table-border` | — | DataTable 分隔线 |
| `--p-content-muted-color` | `--caomei-color-text-muted` | — | — |
| `--p-primary-color` | `--caomei-color-primary` | — | — |
| `--p-content-hover-background` | `--caomei-data-table-row-hover-bg` | — | 行悬浮 |
| 圆角（Aura 默认） | `--caomei-radius-sm/md/lg` | 按视觉基线对齐 | 默认 4 / 8 / 12px |

> 主题迁移与 `nuxt.config.ts` 的 `definePreset` / CSS `@layer` / vite `dedupe` 一并收敛为 `caomei-ui/nuxt` 模块配置（`caomeiUI: { theme: { primary: '#0d9488' }, darkMode: 'class' }`）。对比度结论须以真实浏览器实测为准，不可仅凭本表放行。

---

## 7. 迁移策略与分批计划

**总策略**：**并存接入 + 分批迁移 + 逐批回归**，不做一次性切换。

- **并存可行**：caomei-ui 的 `Caomei` / `caomei-` / `--caomei-*` 命名空间与 PrimeVue 的 `p-*` / `--p-*` 不冲突，双库可同时存在；按**路由 / 页面白名单**逐页切换，避免一次性替换导致回归面失控。
- **回归锚点**：`apps/platform` 现有 e2e（16 文件依赖 PrimeVue class）是迁移的主回归面，逐批改写并保留用例语义。

| 批次 | 内容 | 出口条件 |
| :--- | :--- | :--- |
| **B0 准备** | token 映射表（§6）+ 图标映射表（30 个 `pi pi-*` → `@lucide/vue`）+ 视觉基线（列表 / 表单 / 浮层各 1 页）+ 并存白名单与包体口径 | 映射表评审通过且可复现；基线可复现 |
| **B1 关键路径解阻** | 敲定 `DataTable` 行分组 / 行展开 / 多列排序取向（§5.2 选项 A / B / C）；`ScrollPanel` 改写方案；`Select filter` → `AutoComplete` 方案 | `alerts.vue` / `batch-runs.vue` 迁移路径确定；`alerts-rowgroup.e2e.test.ts` 改写方案确定 |
| **B2 数据类页面迁移** | `DataTable` 密集页：`alerts` / `pr-checks` / `scans` / `repos` / `repos/[id]/runs` / `batch-runs` / `credentials` / `env-events` / `schedules` / `users` / `dashboard` 与 3 个 dialog 组件 | 各页排序 / 分页 / 空态 / 分组功能回归；e2e 对应改写通过；视觉与 B0 基线一致 |
| **B3 表单与浮层迁移** | `Dialog` / `Drawer`（Sidebar）/ `Toast` / `Password` / `InputText` / `Textarea` / `Select` / `MultiSelect` / `SelectButton` / `Checkbox` / `Switch` / `Avatar` / `Card` / `Tag` / `Message` / `Button` 全量切换；`primevue-locale.ts` 替换 | 表单交互 / 校验 / 提示回归；i18n 内建文案联动通过；`useToast` 顺带修复 |
| **B4 收尾与卸载** | 图标全量替换、`nuxt.config.ts`（模块 / 主题 preset / CSS layer / vite dedupe）收敛、`main.scss` 与 `_mixins.scss` 的 `--p-*` / `.p-*` 清除、e2e `p-*` 断言全量改写、卸载 5 个 PrimeVue 相关依赖 | 全量测试 + e2e 通过；`pnpm typecheck` / `lint` / `build` 通过；`rg "primevue\|--p-\|\.p-" apps/platform` 归零；包体对比记录 |

---

## 8. 测试与验证策略

| 层面 | 方法 | 判定口径 |
| :--- | :--- | :--- |
| 类型 | `pnpm --filter @dependfix/platform typecheck` | 0 error（`tone` / `size` / `open` 等改名后类型检查是主要拦截手段） |
| 单测 | 现有单测 + 新增（如 Paginator 页码换算 / AutoComplete 值校验） | 全通过 |
| e2e | 逐批改写 16 个 PrimeVue class 依赖文件；保留用例语义 | 全通过 |
| 视觉 | `@ui-validator` 真实浏览器，主题 / 暗色 / 响应式 / 浮层 | 与 B0 基线一致；对比度实测达标 |
| SSR | 双库并存期关注 portal / teleport 的 hydration（PrimeVue 与 caomei-ui 均用 Portal） | 无 hydration mismatch 与 `pageerror` |
| 包体 | 迁移前后产物体积对比 | 记录项，非硬门禁 |

---

## 9. 风险与反面验证

### 9.1 主要风险（按影响排序）

1. **`DataTable` 是关键路径且存在结构性差距**（§5.2）——`alerts.vue` 的行分组 + 折叠 + 多列排序、`batch-runs.vue` 的行展开均无直接等价；不建议在页面侧把声明式模板改写成命令式渲染，应优先评估库侧补齐（选项 A / C）。
2. **e2e 改写面大**——16 个文件依赖 PrimeVue 渲染产物（`.p-datatable` 57 / `.p-dialog-header` 17 ……），改写需逐条核对选择器语义，是回归风险最集中的部分。
3. **`Select` 可搜索单选改 `AutoComplete` 引入自由文本**——PrimeVue Select `filter` 强制从选项集中选择；AutoComplete 允许任意文本，需在 `schedules.vue` 增加「值必须 ∈ IANA 列表」的校验，否则可能提交非法时区。
4. **caomei-ui 处于 0.x + Phase 12 进行中**——0.2.0 有破坏性包形态变更，API / 目录仍可能调整；迁移期必须 pin 精确版本，并安排升级回归。
5. **对比度约束**——teal-600 作实底 + 白字约 3.74:1，低于 caomei-ui 的 AA 口径；需按 §6 调整 `-solid` 档或记录为显式例外。
6. **npm `latest` 与 `main` 形态分叉**——0.1.0（已发布）与 0.2.0（`main` 准备中）的样式入口不同（`styles.css` vs `theme.css`），选错版本会导致样式不生效。

### 9.2 反面验证（替代方案对照）

| 方案 | 优点 | 代价 / 风险 | 评估 |
| :--- | :--- | :--- | :--- |
| **C1 不迁移**（维持 PrimeVue 4.5.5 + themes 2.x） | 零成本、零风险；License 风险已由 M25.1 / M26.4a 清零 | 升级路径冻结；依赖治理寄生 override；多下游无法统一到自建组件库 | 与既定方向冲突，**不作为终态** |
| **C2 部分迁移**（新页面用 caomei-ui，存量不动） | 增量风险最小、随时可停 | 双库**长期**并存（包体 / 两套 token / 两套心智） | 可作过渡，不宜作终态 |
| **C3 分批全量迁移**（本文方案） | 一次闭环，形成可复制的下游迁移范式 | 需先决条件（§1）与持续投入；迁移期回归风险集中 | **推荐方向** |

### 9.3 版本与依赖风险

- caomei-ui 0.x → 1.0 前 API 可能调整；建议下游以**精确版本**（或本地 link）依赖，待 1.0 冻结后放开。
- 双库并存期两套主题 token 与两套组件样式会同时进入产物；需按白名单隔离并记录包体。

---

## 10. 验收标准

迁移完成（B4 出口）时须同时满足：

- [ ] `apps/platform` 不再直接依赖 `primevue` / `@primevue/nuxt-module` / `@primeuix/themes` / `primeicons` / `primelocale`
- [ ] `rg "primevue|--p-[a-z]|\.p-[a-z]" apps/platform/{app,server,tests,nuxt.config.ts}` 归零（排除文档性注释）
- [ ] `pnpm --filter @dependfix/platform typecheck` / `lint` / `test` / `build` 通过
- [ ] 现有 e2e 全量通过（16 个 PrimeVue class 依赖文件完成改写且语义保留）
- [ ] `alerts.vue`（行分组 / 折叠 / 排序）与 `batch-runs.vue`（行展开）行为与迁移前等价，或按用户裁定的取向显式接受差异
- [ ] i18n 内建文案随语言切换（zh / en）正确
- [ ] 暗色模式（`.dark`）与响应式在关键页无回归
- [ ] 图表（`chart-canvas.vue`，未迁移）无回归
- [ ] `--caomei-*` token 覆盖后主色（teal）在亮 / 暗两态与迁移前视觉一致，实底前景对比度达 AA
- [ ] 迁移前后包体对比记录产出

---

## 11. 不做什么

- 不升级 PrimeVue 5.x；不申请 PrimeUI 商业许可。
- 不在本评估内改动任何代码（含 `apps/platform` 与 caomei-ui 两仓）。
- 不修改 caomei-ui 仓库（库侧能力补齐若采纳，属 caomei-ui 自身阶段范围，须在该仓另行立项）。
- 不引入 Tailwind / UnoCSS；不更换 SCSS(BEM) 样式体系。
- 不迁移图表（`chart-canvas.vue` 已自实现，与 PrimeVue / caomei-ui 均无关）。
- 不删除 `primeicons` 之外的无关依赖；不做与本迁移无关的重构。

---

## 12. 上收触发条件（何时纳入 todo.md 当前阶段）

本评估仅产出文档并登记 [Backlog](../../plan/backlog.md) 候选；任一条件触发时，从 backlog 上收到 `todo.md` 当前阶段（阶段编号由用户分配）：

1. 用户明确授权启动迁移（分批或全量）。
2. `alerts.vue` 行分组 / `batch-runs.vue` 行展开 / 多列排序能力的取向（§5.2 选项 A / B / C）经用户裁定，且（若选 A）caomei-ui 侧有能力面补齐计划。
3. caomei-ui 发布 ≥ 0.2.0 稳定版并明确 0.x API 冻结窗口。
4. 出现「必须升级 PrimeVue 5.x 才能解决的问题」（安全 / 兼容），使冻结路径不可持续。

---

## 13. 关联文档

- [apps/platform PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md) —— License 治理前置（主题库 / 图标已降级 MIT）
- [平台规范 §7.1 PrimeVue 4 集成实践](../../standards/platform.md#71-primevue-4-集成实践) —— 现有 PrimeVue 用法与陷阱（迁移时须逐条重新核验）
- [技术栈](../../guide/tech-stack.md) —— UI 选型登记处（迁移后需同步）
- [Backlog](../../plan/backlog.md) —— 本评估的候选登记处
- [规范与文档治理设计](./spec-and-doc-governance.md) —— 设计文档分流与硬阈值依据
- caomei-ui 侧（外部仓库）：[从 PrimeVue 迁移指南](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/guide/primevue-migration.md)、[设计规范 §7 迁移映射](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/design/design-spec.md)、[主题与样式设计](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/design/theming.md)

---

## 14. 文档元数据

- **创建时间**：2026-09-22
- **文档类型**：迁移评估与方案（设计先行稿）
- **取数快照**：dependfix `1a73abc`（2026-09-22）/ caomei-ui `58f814d`（2026-09-22，版本 0.1.0）
- **关联阶段**：未上收（仅挂 [Backlog](../../plan/backlog.md) 候选）；阶段编号待用户决策时分配
- **审计依据**：本文档为评估先行稿，未触发代码改动；A 阶段审计按 [AI 协作规范](../../standards/ai-collaboration.md) 的文档改动口径执行
- **口径说明**：本文所有计数为 `.vue` 开标签与 quote-aware 属性的静态统计；caomei-ui 能力面以设计规范 §7 与源码 props 为唯一事实源；未运行任一仓库构建 / 测试

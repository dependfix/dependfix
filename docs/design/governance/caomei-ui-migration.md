# apps/platform UI 组件库迁移评估与方案（PrimeVue → caomei-ui）

- 日期：2026-09-22
- 触发：用户需求——参照 caomei-ui 的源码与文档，制定 `apps/platform` 从 PrimeVue 迁移到 caomei-ui 的迁移方案，规避 PrimeUI 商业许可风险
- 输入（只读取数快照，两仓本地工作区）：
  - `apps/platform` 源码，dependfix `1a73abc`（2026-09-22）；取数时工作区含 2 处与本次无关的未提交改动
  - caomei-ui 仓库 `58f814d`（2026-09-22），`package.json` 版本 `0.1.0`，`main` 分支处于 Phase 12（发布就绪收官）进行中
  - 外部前置调研（非本仓库文档，作者本地工作区）：《PrimeVue 替代方案调研》《自建组件库（基于 Reka UI）最小组件集评估》
- 方法与口径：**只读静态比对**——`apps/platform` 侧按「`.vue` 开标签计数 + quote-aware 属性计数」（排除 `node_modules` / `.nuxt` / `.output` / 覆盖率与报告目录）统计 PrimeVue 用量；caomei-ui 侧逐组件核对组件文档、设计规范与源码 props。**未运行**任一仓库的构建或测试，**未改动任何代码**。
- 定位：迁移**评估与方案**（设计先行稿）。本次仅产出文档，不进入实施；上收与实施主体为 dependfix 仓库（见 §12）。
- 关联文档：[PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md)（License 治理前置）、[平台规范 §7.1](../../standards/platform.md#71-caomei-ui-集成实践)、[技术栈](../../guide/tech-stack.md)、[Backlog](../../plan/backlog.md)

> 本文档为 **`apps/platform`（Nuxt 管理平台）PrimeVue → caomei-ui 的迁移评估与方案**，用于规避 PrimeUI 商业许可风险并与下游统一组件库。
>
> **状态**：评估先行稿，**2026-09-28 已上收 M31 正式迁移阶段**（用户决策方案 B；Backlog C88 上收后移除；实施批次映射 M31.1-M31.6 —— 见 [todo-archive.md §M31](../../plan/todo-archive.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)）；**2026-09-29 M31.5（B3）收尾完成，迁移主线（M31.1-M31.5）闭环**：5 个 PrimeVue 依赖已卸载、代码侧引用归零、e2e 全量通过、包体对比与 B4 视觉裁定落定 —— 见 [§15.13](#1513-b3-收尾实证m3152026-09-29)。库侧能力补齐（若采纳）属 caomei-ui 仓库自身阶段范围，须另行立项。**2026-09-28 B0 接线落地后本文进入实施期实证**：选择器映射以 [§15.8](#158-选择器映射表更正2026-09-28b0-接线实证) 为准、能力验证口径以 [§15.9](#159-b0-接线暴露的验证覆盖缺口m31-各批次须补齐) 为准。

---

## 1. 结论摘要

**结论：可行（有条件）**——`apps/platform` 实际用到的 23 个 PrimeVue 组件中 21 个在 caomei-ui 有等价组件，**不存在整体性阻塞**；剩余缺口集中在 `DataTable` 能力面、2 处无对应组件与 2 类零散改写。

> **本节为 2026-09-22 初评快照**：关键路径与三个先决条件已由 [§15 caomei-ui 0.3.0 重新评估](#15-caomei-ui-030-重新评估补记2026-09-27) 更新为「高度可行」，先决条件均已闭环；以下正文保留初评记录供溯源。

三个先决条件（闭环状态见 §15.1 / §15.2 / §15.3）：

1. **`DataTable` 行分组 / 行展开 / 多列排序能力先行（关键路径）**——`alerts.vue` 在用 `row-group-mode="subheader"` + `group-rows-by` + `expandable-row-groups` + `#groupheader` 槽 + `v-model:expanded-row-groups`；`batch-runs.vue` 在用**行展开**（`v-model:expanded-rows` + `Column expander` + `#expansion` 槽 + `@row-expand`）。caomei-ui DataTable **既无行分组也无行展开**（源码 0 命中，二者均未登记于 caomei-ui Backlog）；且其为**单列排序**，不支持 `sort-mode="multiple"` + `v-model:multi-sort-meta`（`alerts.vue` / `pr-checks.vue` 在用）。这些能力需**库侧补齐**或 **apps/platform 侧改写**（见 §5.2）。**（已闭环：0.3.0 已支持行分组 / 行展开 / 多列排序 / 降序优先，见 §15.1）**
2. **2 处无对应组件**——`ScrollPanel`（2 处，`repo-history-dialog.vue` / `run-detail-dialog.vue`）改用原生滚动容器 + CSS；`Chips`（1 处，`repos.vue` 标签录入）可用 `CaomeiAutoComplete` + `multiple` 近似，或在页面侧自绘标签输入。二者 caomei-ui 均无对应组件，亦未登记为候选（见 §5.3）。**（部分更新：`Chips` 已由 0.3.0 `TagsInput` 替代、无需改写；`ScrollPanel` 仍无，改用原生容器 + CSS，见 §15.2 / §15.3）**
3. **`Select` 可搜索单选改用 `AutoComplete`**——`schedules.vue` 时区选择器用 `Select` + `filter`；caomei-ui 的 Reka Select 无 filter primitive，官方口径为映射到 `CaomeiAutoComplete`（见 caomei-ui 设计规范 §7 与[从 PrimeVue 迁移](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/guide/primevue-migration.md)）。**（已闭环：改用 `AutoComplete` + `strict: true`，见 §15.3）**

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
2. **Dependabot / 供应链噪声**：`primevue ^4.5.5`、`@primevue/nuxt-module ^4.5.5` 等依赖需长期用 override / 人工判读挡住 5.x 升级（Backlog 曾登记「PrimeVue 4 → 5 升级评估」暂缓项 —— **该风险已随 M31 卸载 5 个 PrimeVue 依赖而消除，暂缓项同期删除**）。
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
| `primary.contrastColor`（白） | `--caomei-color-primary-foreground`（亮）/ `--caomei-color-on-solid` | **`#0b0b0d`**（以 §15.9 第 6 条裁定为准；本表原草案值 `#fff` 不达标） | 本项目按跨明暗单值覆盖（亮色 5.25:1 / 暗色 13.29:1） |
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
| **B4 收尾与卸载** ✅ 2026-09-29 | 图标全量替换、`nuxt.config.ts`（模块 / 主题 preset / CSS layer / vite dedupe）收敛、`main.scss` 与 `_mixins.scss` 的 `--p-*` / `.p-*` 清除、e2e `p-*` 断言全量改写、卸载 5 个 PrimeVue 相关依赖 | 全量测试 + e2e 通过；`pnpm typecheck` / `lint` / `build` 通过；`rg "primevue\|--p-\|\.p-" apps/platform` 归零；包体对比记录 |

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

迁移完成（B4 出口）时须同时满足 —— **2026-09-29 M31.5 收尾核验：10/10 通过**（逐项证据见 [§15.13](#1513-b3-收尾实证m3152026-09-29)）：

- [x] `apps/platform` 不再直接依赖 `primevue` / `@primevue/nuxt-module` / `@primeuix/themes` / `primeicons` / `primelocale`
- [x] `rg "primevue|--p-[a-z]|\.p-[a-z]" apps/platform/{app,server,tests,nuxt.config.ts}` 归零（排除文档性注释）
- [x] `pnpm --filter @dependfix/platform typecheck` / `lint` / `test` / `build` 通过
- [x] 现有 e2e 全量通过（16 个 PrimeVue class 依赖文件完成改写且语义保留）
- [x] `alerts.vue`（行分组 / 折叠 / 排序）与 `batch-runs.vue`（行展开）行为与迁移前等价，或按用户裁定的取向显式接受差异
- [x] i18n 内建文案随语言切换（zh / en）正确
- [x] 暗色模式（`.dark`）与响应式在关键页无回归
- [x] 图表（`chart-canvas.vue`，未迁移）无回归
- [x] `--caomei-*` token 覆盖后主色（teal）在亮 / 暗两态与迁移前视觉一致，实底前景对比度达 AA
- [x] 迁移前后包体对比记录产出

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

> **2026-09-28 已上收**：用户决策方案 B 启动 **M31 正式迁移阶段**（阶段编号 M31.1-M31.6），本评估的 B0-B3 批次映射为 M31.1-M31.5，C90 测试补强为 M31.6；Backlog C88 上收后已移除。**2026-09-29 M31 全部 6 原子条目闭环归档**，详见 [todo-archive.md §M31](../../plan/todo-archive.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)。

1. 用户明确授权启动迁移（分批或全量）。
2. `alerts.vue` 行分组 / `batch-runs.vue` 行展开 / 多列排序能力的取向（§5.2 选项 A / B / C）经用户裁定，且（若选 A）caomei-ui 侧有能力面补齐计划。
3. caomei-ui 发布 ≥ 0.2.0 稳定版并明确 0.x API 冻结窗口。
4. 出现「必须升级 PrimeVue 5.x 才能解决的问题」（安全 / 兼容），使冻结路径不可持续。

---

## 13. 关联文档

- [apps/platform PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md) —— License 治理前置（主题库 / 图标已降级 MIT）
- [平台规范 §7.1 caomei-ui 集成实践](../../standards/platform.md#71-caomei-ui-集成实践) —— 接线约定与通用实践；迁移期 PrimeVue 4 陷阱已随 M31 收口（多列排序等历史实证见 [§15.10](#1510-datatable-核心页迁移实证m3122026-09-28) 起各节）
- [技术栈](../../guide/tech-stack.md) —— UI 选型登记处（已随 M31 同步为 caomei-ui）
- [Backlog](../../plan/backlog.md) —— 候选已上收 M31 并从 backlog 移除（见 §12 / §14）
- [规范与文档治理设计](./spec-and-doc-governance.md) —— 设计文档分流与硬阈值依据
- caomei-ui 侧（外部仓库）：[从 PrimeVue 迁移指南](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/guide/primevue-migration.md)、[设计规范 §7 迁移映射](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/design/design-spec.md)、[主题与样式设计](https://github.com/CaoMeiYouRen/caomei-ui/blob/master/docs/design/theming.md)

---
 
## 14. 文档元数据
 
- **创建时间**：2026-09-22
- **文档类型**：迁移评估与方案（设计先行稿）
- **取数快照**：dependfix `1a73abc`（2026-09-22）/ caomei-ui `58f814d`（2026-09-22，版本 0.1.0）
- **关联阶段**：**M31（2026-09-28 上收，用户决策方案 B）**——B0-B3 批次映射 M31.1-M31.5 + C90 补强映射 M31.6；Backlog C88 上收后移除
- **审计依据**：本文档为评估先行稿，未触发代码改动；A 阶段审计按 [AI 协作规范](../../standards/ai-collaboration.md) 的文档改动口径执行
- **口径说明**：本文所有计数为 `.vue` 开标签与 quote-aware 属性的静态统计；caomei-ui 能力面以设计规范 §7 与源码 props 为唯一事实源；未运行任一仓库构建 / 测试
- **更新记录**：
  - 2026-09-27：新增 §15（caomei-ui 0.3.0 重新评估补记）
  - 2026-09-28（M31.1 B0 接线）：新增 [§15.8 选择器映射表更正](#158-选择器映射表更正2026-09-28b0-接线实证) + [§15.9 B0 接线暴露的验证覆盖缺口](#159-b0-接线暴露的验证覆盖缺口m31-各批次须补齐)；§15.1「全绿」结论按 §15.9 修订为「能力存在、验证覆盖不足」
  - 2026-09-28（M31.2 DataTable 核心页迁移）：新增 [§15.10 DataTable 核心页迁移实证](#1510-datatable-核心页迁移实证m3122026-09-28)（含排序机制修正 / 分组列过滤 / 服务端排序依赖 / 密度对齐 / 选择器与取证口径）；§15.1「降序优先」行按该节修订机制描述
  - 2026-09-28（M31.3 其余表页迁移）：新增 [§15.11 其余表页迁移实证](#1511-其余表页迁移实证m3132026-09-28)（覆盖清单 / 行选择 / 内建与 lazy 分页 / 独立 Paginator / scrollable 与 ScrollPanel / 无表级 `#header` 槽的结构变化 / 遗留项）
 
---
 
## 15. caomei-ui 0.3.0 重新评估补记（2026-09-27）
 
> 2026-09-27 caomei-ui 发布 **0.3.0**（npm `latest`），本节记录关键路径阻塞点的最新闭环情况，作为上收决策的补充依据；2026-09-28 B0 接线落地后追加 [§15.8 选择器映射更正](#158-选择器映射表更正2026-09-28b0-接线实证) 与 [§15.9 验证覆盖缺口](#159-b0-接线暴露的验证覆盖缺口m31-各批次须补齐)。
 
### 15.1 关键路径阻塞点闭环确认
 
| 原评估 §5.2 缺口 | 0.3.0 现状 | 闭环确认 |
|-----------------|-----------|---------|
| **行分组 subheader** | ✅ `rowGroupMode="subheader"` + `groupRowsBy` + `expandableRowGroups` + `expandedRowGroups` + `#groupheader` + `@update:expandedRowGroups` | **已闭环** |
| **可展开/折叠分组** | ✅ 内建折叠按钮 + 受控 `expandedRowGroups` | **已闭环** |
| **行展开** | ✅ `expander: true` 列 + `expandedRows` + `#expansion` 槽 + `@update:expandedRows` | **已闭环** |
| **多列排序** | ✅ `sortMode="multiple"` + `multiSortMeta` + `sortDescFirst` | **已闭环** |
| **降序优先** | ✅ `sortDescFirst` / 默认排序键均可表达 | **已闭环**（机制修正：实测全局 `sortDescFirst` 会改变点击循环，最终由 `multi-sort-meta` 初值承载默认方向，见 [§15.10](#1510-datatable-核心页迁移实证m3122026-09-28) 第 1 条） |
 
> **结论**：原评估中最大的结构性风险（DataTable 能力面）在 0.3.0 中**全部已由库侧闭环**。选项 A（库侧补齐）已完成，无需 dependfix 侧等待或结构性改写。
>
> **2026-09-28 B0 接线后修订**：能力存在已由真实浏览器验证（行分组 / 折叠 / 行重展开 / 多列排序），但 M30.6 V1 当时的验证覆盖不足——**能力结论成立、验证口径按 [§15.9](#159-b0-接线暴露的验证覆盖缺口m31-各批次须补齐) 校正**。
 
### 15.2 新增组件覆盖
 
| 原缺口项 | 0.3.0 新增 | 迁移处置更新 |
|---------|-----------|-------------|
| `Chips` 标签录入 | ✅ **`TagsInput`**（`v-model: string[]` + `delimiter` + `max` + `allowDuplicate` + `addOnPaste/Blur/Tab`） | 直接用 `CaomeiTagsInput` 替代，**无需改写** |
 
### 15.3 仍需处理的局部缺口（更易处理）
 
| 缺口项 | 原编号 | 0.3.0 现状 | 迁移处置 |
|--------|--------|-----------|----------|
| `Select` 可搜索单选 | §5.3 #1 | 仍无 `filter` prop | 改用 `AutoComplete` + `strict: true`（强制从 IANA 列表选） |
| `MultiSelect` filter + chip | §5.3 #2 | 仍无 `filter` / `display` | 删除两属性，搜索内建常开、形态固定 chip |
| `ScrollPanel` | §5.3 #4 | 仍无 | 原生 `<div style="overflow:auto">` + CSS |
| `Paginator` template | §5.3 #5-6 | 无 `template` / `CurrentPageReport` | 自渲染「第 x / 共 y 页」或接受默认形态 |
| `--p-*` / `.p-*` token | §6 | 命名空间已隔离 | 逐项改 `--caomei-*` / `.caomei-*` |
 
### 15.4 迁移可行性重新定级
 
| 维度 | 原评估 (0.1.0) | 重新评估 (0.3.0) |
|------|----------------|------------------|
| **整体可行性** | 有条件可行 | **高度可行**（阻塞点已清零） |
| **关键路径工作量** | 高（需库侧补齐或结构性改写） | **低**（库侧已就绪，主要是机械映射） |
| **e2e 回归面** | 16 文件深度依赖 PrimeVue class | 仍需改写选择器，但功能语义可 1:1 保留 |
| **建议策略** | 选项 C（混合：先 B 后等 A） | **直接全量分批迁移**（无需等库侧） |
 
### 15.5 更新后的分批计划（简化版）
 
| 批次 | 内容 | 预估工作量 |
|------|------|------------|
| **B0** | Token/图标映射表、视觉基线、并存白名单 | 1-2 天 |
| **B1** | **DataTable 密集页迁移**（alerts / batch-runs / pr-checks / scans / repos 等） | 3-5 天 |
| **B2** | 表单/浮层组件全量切换 + i18n/Toast/Confirm 接线 | 2-3 天 |
| **B3** | 收尾：卸载 5 个 PrimeVue 依赖、清理样式、e2e 全通 | 1-2 天 |
 
**总工期估算**：约 **1-2 周**（含验证），显著低于原评估。
 
### 15.6 需注意的 0.3.0 破坏性变更
 
1. **样式入口**：`caomei-ui/theme.css`（而非 0.1.0 的 `styles.css`）
2. **包形态**：组件样式随构建产物按需自带，基础层仅 `theme.css`
3. **Nuxt 模块配置**：
   ```ts
   // nuxt.config.ts
   modules: ['caomei-ui/nuxt', '@nuxtjs/i18n'],
   caomeiUI: {
     prefix: 'Caomei',
     darkMode: 'class',
     theme: { primary: '#0d9488' }  // token 覆盖
   }
   ```
4. **主色实底对比度**：仍需把 `--caomei-color-primary-solid` 设为 `#0f766e` (teal-700) 达 AA 标准
 
### 15.7 回收触发条件核对
 
> **Backlog C88 触发条件第 3 条**：`caomei-ui 发布 ≥ 0.2.0 稳定版并明确 0.x API 冻结窗口` —— **已满足**（0.3.0 已发布 npm `latest`）
 
> 其他条件：**2026-09-28 已全部满足**（用户明确授权启动方案 B + 关键路径取向裁定「选项 A 已由 0.3.0 库侧闭环」+ 主色实底 teal-700 决策）—— M31 正式迁移阶段已启动。

### 15.8 选择器映射表更正（2026-09-28，B0 接线实证）

> **本章更正 §15.1 配套的 V3 映射表**。原表（M30.6 记录，commit `7be5b93`）的类名系按组件名推测，**与实际产物不符**（如推测 `.caomei-datatable`，实际为 `.caomei-data-table`；推测存在 `.caomei-dialog` / `.caomei-drawer` 根类，实际均无）。下表按 `caomei-ui@0.3.0` 产物逐行核查（`rg` 组件 JS 的类名字符串 + CSS 选择器），**后续批次以本表为准**。

| 原 V3 表（推测） | 实际产物选择器（0.3.0） | 说明 |
| :--- | :--- | :--- |
| `.caomei-datatable` | `.caomei-data-table` | 多词组件逐词 kebab-case |
| `.p-datatable-row-group-header` → `.caomei-datatable-row-group-header` | `.caomei-data-table__row-group`（内容单元格 `__row-group-cell`） | 元素用 BEM `__` |
| `.caomei-datatable-row-toggle-button` | `.caomei-data-table__row-group-toggle` | 内建分组折叠按钮 |
| *（原表未列）* | `.caomei-data-table__row-expander` / `__row-expansion` / `__row-expansion-cell` | `expander` 列与展开区 |
| `.caomei-tag-label` | `.caomei-tag__content` | Tag 无 `-label` 后缀（`.caomei-tag` 根类存在） |
| `.caomei-select-overlay` | `.caomei-select__content` | 浮层内容容器 |
| `.caomei-select-option` | `.caomei-select__item` | 选项 |
| `.caomei-dialog-header` | `.caomei-dialog__header` | 面板标题栏 |
| `.p-dialog` → **`.caomei-dialog`** | **无裸根类**：面板 `.caomei-dialog__content`、遮罩 `.caomei-dialog__overlay` | 面板由 Reka `DialogContent` 渲染（`role="dialog"` + `aria-modal`） |
| `.p-drawer` → **`.caomei-drawer`** | **无裸根类**：`.caomei-drawer__content` / `__overlay` | 同上（侧别经 `__content--right` 等修饰类） |
| `.caomei-message-*` | `.caomei-message__*`（变体 `--danger` 等） | `__` 是元素、`--` 是变体 |
| `.caomei-checkbox-input` | `.caomei-checkbox__control` | — |
| `th[data-caomei-sortable]` / `data-caomei-sorted` | **不存在**：可排列用 `.caomei-data-table__sort`（按钮），排序状态用 `th[aria-sort]`；多列排序优先级显示为 `.caomei-data-table__sort-index` | 排序走 ARIA，无 `data-*` |
| `.caomei-paginator` / `.caomei-toast` / `.caomei-button` / `.caomei-tag` / `.caomei-select` / `.caomei-checkbox` | 裸根类存在，命名与组件名一致（Toast 视口为 `.caomei-toast-viewport`） | 原表正确 |

**命名规律**：多词组件类名 = 逐词 kebab-case（`caomei-data-table` / `caomei-auto-complete` / `caomei-multi-select` / `caomei-progress-spinner` / `caomei-tags-input` / `caomei-select-button` 等）；`.caomei-root` 为共享根类。

**无裸根类的组件（浮层类为主，必须用元素类定位）**：`config-provider` / `dialog` / `drawer` / `confirm-dialog` / `popover` / `dropdown-menu` —— 产物中不存在 `.caomei-dialog` / `.caomei-drawer` 这类根类，一律用 `__content` / `__overlay` 等元素类（或 `role` / `aria-*`）定位。

**未列出组件不回落原表**：本表只覆盖原 V3 表涉及的组件；其余组件写选择器前必须 `rg` 产物核实（先判有无裸根类，再找 `__` 元素类），**不得按组件名推断**。

### 15.9 B0 接线暴露的验证覆盖缺口（M31 各批次须补齐）

`caomei-ui/nuxt` 注册（B0）后首次获得真实运行时验证，同时暴露出 §15.1「已闭环」结论背后的**验证覆盖不足**：

1. **B0 之前 V1 页面并未真正渲染 caomei 组件**：模块未注册时 `CaomeiDataTable` 等属未解析组件（原构建产物为 `resolveComponent("CaomeiDataTable")`，只渲染空自定义元素），当时的 `typecheck` / `lint` / `build` 通过**不构成能力验证**。注册模块后 SSR 产物出现 `.caomei-data-table__row-group` / `__row-group-toggle` / `__sort`，能力首次得到真实确认。
2. **V1 页面存在 API 误用**（已随 B0 修正）：`CaomeiIcon` 传 `name`（实为 `icon: Component`）；`tone="info"` / `tone="warn"`（实为 `primary` / `warning`，`ComponentTone` 无 `info` / `warn`）；`columns` 未声明 `DataTableColumn<T>[]` 导致 `sortFn` 宽化为 `string`。
3. **受控模式未回写**：V1 的 `@update:expandedRowGroups` / `@update:expandedRows` 只打日志不回写 → 内建分组折叠按钮点击无效（V1 实际从未验证过分组展开）。真实页面迁移时 `v-model:*` 必须保真为 `prop + 回写`。
4. **`expander` 列内建按钮路径未被 V1 覆盖**：V1 的 batch-runs 页用自定义按钮切换 `expandedRows`，未走 `expander: true` 列的内建按钮；M31.2 按 `expander` 列实现时须单独回归该路径。
5. **DataTable 无 `size` prop**：V1 页传入的 `size="sm"` 被当作透传属性（无效果），密度须走 CSS 变量覆盖（见 §15.3）。
6. **`--caomei-color-primary-foreground` 未随主色覆盖（已闭环）**：亮色档库默认 `#fff`，而本项目 `--caomei-color-primary` 取 `#0d9488`（teal-600），白字对比度 **3.74:1 < AA 4.5:1**；受影响的是**以自适应主色作底**的控件（Paginator 选中页码、Toggle/SelectButton 激活态、Stepper 指示器、Checkbox/Radio 前景等）。**2026-09-29 用户裁定**：采用「覆盖前景 token」而非「改主色」——理由是主色影响面更大（文字/边框/soft 底等全量自适应位点），改前景只影响「主色作底」这一组控件。落地方式：`nuxt.config.ts` 的 `caomeiUI.theme` 增 `'primary-foreground': '#0b0b0d'`（模块只生成一条跨明暗 `:root`；暗色档库默认前景本就是 `#0b0b0d`，故无暗色回归）。**真实浏览器实测**（`/scans` 分页器选中页码）：亮色 `#0d9488` 底 × `#0b0b0d` 字 = **5.25:1**，暗色 `#5eead4` 底 × `#0b0b0d` 字 = **13.29:1**，均达 AA。B0 验收的 `-solid × on-solid` 仍为 5.47:1。

### 15.10 DataTable 核心页迁移实证（M31.2，2026-09-28）

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

**7）分组连续性依赖服务端排序（不是客户端次排序键）**

分组字段列被剔出 `columns` 后，TanStack 只对「列模型中存在的列」排序（`createSortedRowModel` 以 `getColumn(sort.id)` 为门槛），传入分组字段的排序键会被**静默丢弃**。故本批不设 `packageName` / `repository` 次排序键，改为依赖：

- `/api/alerts?groupBy=` 服务端 `orderBy(groupBy)`（`server/api/alerts/index.get.ts`）
- 客户端仅按严重级别降序，稳定排序在同 severity 内保持服务端的分组字段升序

实测结果与 PrimeVue 双键 `[_severityRank desc, packageName asc]` 完全一致（分组标签序列与各组行内容逐项相同）。**B1b 若沿用「剔除分组字段列」的做法，必须同样确认服务端已按分组字段排序。**

**8）单元格密度对齐 PrimeVue `size="small"`**

PrimeVue Aura small 尺寸单元格内边距为 `0.375rem 0.5rem`（6px 8px），caomei 默认为 `var(--caomei-space-2) var(--caomei-space-3)`（8px 12px）；仓库内 DataTable 标签共 20 处（PrimeVue 14 处，其中 13 处显式 `size="small"`；caomei 6 处无 `size` prop），故在 `_caomei-tokens.scss` 统一收敛为 PrimeVue small（实测表头 padding `8px 12px` → `6px 8px`，表头高度 34.5px → 30.5px）。复现计数：`grep -rhE "<DataTable([ >]|$)" apps/platform/app --include="*.vue" | wc -l`（14）与 `grep -rhE "<CaomeiDataTable([ >]|$)" ...`（6）。

> **B1b 已闭环**：`pr-checks.vue` 的 DataTable 未设 `size`（PrimeVue 默认档 `0.75rem 1rem`），迁移后本会被全局覆盖压到 small 档 → M31.3 按用户裁定「取最接近档位」判定 caomei 默认档（8px 12px）更接近并恢复之（见 [§15.11](#1511-其余表页迁移实证m3132026-09-28) 第 8 条）。

**9）验证证据**（可复现口径）

- 迁移前后结构取证（列数 / 表头 / 分组标签 / 各组行内容 / 排序三态循环）→ `artifacts/m31-b2/{before,after}-alerts.json`（gitignored；**after 取证基于最终构建**，⚠️ fixtures 的 `createdAt` 时间戳随重新 seed 变化，行内容比对需忽略日期列）
- 排序三态循环的**确定性断言**在 `apps/platform/tests/e2e/sortable.e2e.test.ts`（asc → desc → 移除）
- e2e：相关子集 26 条 = `pnpm exec playwright test alerts-rowgroup sortable batch alerts-sidebar alerts-fix-now`（其中过滤词 `batch` 亦匹配未受影响的 `batch-import-filters`）；全量 `pnpm exec playwright test` = 172 条用例中 170 passed / 1 failed（env-events 导航菜单用例，单跑 9/9 通过，属用例顺序相关 flaky，该页未迁移）/ 1 flaky（schedules-crud trigger 重试通过，未迁移）
- 单测 1295 条 = `pnpm --filter @dependfix/platform test`；`pnpm run typecheck` / `pnpm run lint` / `pnpm --filter @dependfix/platform lint:css:check` / `pnpm --filter @dependfix/platform build` 全部通过
- **环境前提**：e2e 的 webServer 跑 `.output`，须先 `pnpm --filter @dependfix/platform build`；本机容器需 `ignoreDefaultArgs: ['--disable-dev-shm-usage']` + `--no-sandbox`（容器 `/tmp` 不可写，默认参数会让 chromium `Page crashed`），CI 不受此限。

### 15.11 其余表页迁移实证（M31.3，2026-09-28）

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
- ✅ **`--caomei-color-primary-foreground` 对比度**：用户裁定改前景 token（影响面小于改主色），已落地并实测亮色 5.25:1 / 暗色 13.29:1，详见 [§15.9 第 6 条](#159-b0-接线暴露的验证覆盖缺口m31-各批次须补齐)。
- ⏳ `import-repos-dialog` 的 `CaomeiPaginator` 固定渲染页码按钮组（原 PrimeVue template 无该控件）→ 属可见 UI 新增，B4 确认是否接受。
- ⏳ 内建分页器的页码报表文案丢失（第 3 条）→ B4 确认是否需要在表外自渲染补回。

### 15.12 表单 / 浮层 / 导航组件迁移实证（M31.4，2026-09-29）

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

49 处字面 `icon="pi pi-*"`（21 个唯一值）连同 `:icon` 三元 / `<i class="pi pi-*">` 等动态用法共 **63 处 `pi pi-` 用法 / 30 个唯一图标**，全部替换为 `#icon` 槽 + `<CaomeiIcon :icon="X" />`（`@lucide/vue` 已升为平台直接依赖 `^1.48.0`）。映射表见 [§15.8](#158-选择器映射表更正2026-09-28b0-接线实证) 与 [平台规范 §7.4](../../standards/platform.md)。`CaomeiIcon` 默认 `size="1em"`，与 primeicons 的 1rem 同量级。

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

> **已收口**：M31.5（B3）逐项落定，结论见 [§15.13 第 6 条](#1513-b3-收尾实证m3152026-09-29)。以下 ⏳ 保留为 M31.4 收口时的原始登记。

- ⏳ **`severity="secondary"` 无 `text` 的 6 处按钮**：当前映射为 `tone="neutral"` 默认实底（深灰 #52525b + 白字），比 PrimeVue 的浅灰实底视觉更重；备选 `variant="secondary" tone="neutral"`（白底 + 浅描边，更接近原浅色观感但引入边框）。待 B4 或用户裁定。
- ⏳ `import-repos-dialog` owner 选择器触发器 badge 丢失（`Select` 无 `#value` 槽）→ B4 确认是否接受或外置渲染。
- ⏳ `Message` soft 档无边框（已裁定接受）→ B4 视觉复核时确认观感。
- ⏳ `index.vue` 加载 spinner 由内联 40px 改为 `size="lg"`（32px，caomei 无 40px 档）→ 差异轻微，如需精确对齐可覆盖 `--caomei-progress-spinner-size`。
- ⏳ `utils/alerts-view.ts` 的 `code-quality` ruleId 由 PrimeVue `contrast`（高对比实底）降为 `neutral`（与 default 同色）→ 视觉区分度下降，B4 复核是否改用 `warning` 或单独 variant。
- ⏳ `components/import-repos-dialog.vue` 的 `selectableRepos` 为**既有死代码**（迁移前即无引用）→ M31.5 清理时一并移除。
- ⏳ §15.11 第 8 条的两项（Paginator 页码按钮组 / 分页报表文案）仍待 B4 复核。

> **验证覆盖缺口（已知，非缺陷）**：`batch-import-filters` / `admin` 的全选 Checkbox 断言在 CI 环境（无真实 GitHub 凭据）走空态分支，`if (有候选)` 分支的「unchecked → click → checked」翻转未被 CI 实际执行（相对迁移前的**空断言**仍为增强，且空态分支有实质断言）；`/repos/[id]/runs` 兼容路径页无 e2e/截图覆盖；`TagsInput`（`repos.vue` 标签录入）与 `AutoComplete` 的 `strict`（自由文本不入模型）无自动化断言，仅人工/单测兜底。

### 15.13 B3 收尾实证（M31.5，2026-09-29）

> M31.5（B3）卸载 5 个 PrimeVue 依赖、清零代码侧引用、产出包体对比并完成文档同步。**迁移主线（M31.1-M31.5）至此闭环**；M31.6（C90 db-restore 补测）当时独立待启动 —— **该条后续已于 2026-09-29 闭环，M31 全部 6 原子条目已归档**（见 [todo-archive.md §M31](../../plan/todo-archive.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)）。

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
- **第二条盲区轴（同批实证，独立于色阈值）**：`alerts-light` 的 Switch 拇指色差远超色阈值（pixelmatch colorDelta ≈ 3×10⁴ ≫ 1408.6），却仍被 **`maxDiffPixels: 200` 面积预算**吞掉（该图非抗锯齿差异像素实测 **164 ≤ 200**）→ 即「少面积 × 高色差」变更同样可逃逸门禁。两条轴（色阈值 / 面积预算）**已由 M34.3 闭环**（`threshold` 0.2 → 0.1、`maxDiffPixels` 200 → 100），口径与取证见 [测试规范 §6.7](../../standards/testing.md#67-视觉回归截图识别层appsplatform)。
- **为什么此前 CI / 本地全绿**（`threshold: 0.2` 盲区实证）：pixelmatch 的 `maxDelta = 35215 × 0.2² = 1408.6`，而 `#0d9488 → #0f766e` 的 delta ≈ 308、Tag `12% → 8%` 合成色差约 Δ(9,4,4)（delta 更小）、字段外壳差异更小 → **全部低于阈值被判「同色」**，故失真基线仍持续通过。这是 [测试规范 §6.7](../../standards/testing.md) 登记的容差盲区，本批给出**两次实证**：① M33.9 主按钮 teal-600 → teal-700 **被吞**（铁证：0.3.0 下 `before-*.png` 实测已渲染 teal-700 2245 px / teal-600 0 px，而旧基线仍是 teal-600 且当时 CI 全绿）；② 本批 soft 底色 12% → 8% 同样被吞。**盲区可吞掉整块实底按钮（385×35）的色值变更**，灵敏度议题**已由 M34.3 闭环**（同口径色对 `#52525b → #0f766e` 实测 6407-6412 差异像素：0.2 档 0 超阈被吞，0.1 档 5935 超阈检出），口径见 [测试规范 §6.7](../../standards/testing.md#67-视觉回归截图识别层appsplatform)。
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

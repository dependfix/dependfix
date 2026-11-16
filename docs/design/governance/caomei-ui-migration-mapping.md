# caomei-ui 迁移：映射与评估补记（§12-§15.9）

- 日期：2026-09-22
- 触发：用户需求——参照 caomei-ui 的源码与文档，制定 `apps/platform` 从 PrimeVue 迁移到 caomei-ui 的迁移方案，规避 PrimeUI 商业许可风险
- 输入（只读取数快照，两仓本地工作区）：
  - `apps/platform` 源码，dependfix `1a73abc`（2026-09-22）；取数时工作区含 2 处与本次无关的未提交改动
  - caomei-ui 仓库 `58f814d`（2026-09-22），`package.json` 版本 `0.1.0`，`main` 分支处于 Phase 12（发布就绪收官）进行中
  - 外部前置调研（非本仓库文档，作者本地工作区）：《PrimeVue 替代方案调研》《自建组件库（基于 Reka UI）最小组件集评估》
- 方法与口径：**只读静态比对**——`apps/platform` 侧按「`.vue` 开标签计数 + quote-aware 属性计数」（排除 `node_modules` / `.nuxt` / `.output` / 覆盖率与报告目录）统计 PrimeVue 用量；caomei-ui 侧逐组件核对组件文档、设计规范与源码 props。**未运行**任一仓库的构建或测试，**未改动任何代码**。
- 定位：迁移**评估与方案**（设计先行稿）。本次仅产出文档，不进入实施；上收与实施主体为 dependfix 仓库（见 §12）。
- 关联文档：[PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md)（License 治理前置）、[平台规范 §7.1](../../standards/platform.md#_7-1-caomei-ui-集成实践)、[技术栈](../../guide/tech-stack.md)、[Backlog](../../plan/backlog.md)

## 12. 上收触发条件（何时纳入 todo.md 当前阶段）

本评估仅产出文档并登记 [Backlog](../../plan/backlog.md) 候选；任一条件触发时，从 backlog 上收到 `todo.md` 当前阶段（阶段编号由用户分配）：

> **2026-09-28 已上收**：用户决策方案 B 启动 **M31 正式迁移阶段**（阶段编号 M31.1-M31.6），本评估的 B0-B3 批次映射为 M31.1-M31.5，C90 测试补强为 M31.6；Backlog C88 上收后已移除。**2026-09-29 M31 全部 6 原子条目闭环归档**，详见 [M31](../../plan/archive/todo-archive-phases-m31.md#m31-apps-platform-ui-组件库迁移-primevue-→-caomei-ui-m31-1-m31-6-全部已闭环-2026-09-29-归档)。

1. 用户明确授权启动迁移（分批或全量）。
2. `alerts.vue` 行分组 / `batch-runs.vue` 行展开 / 多列排序能力的取向（§5.2 选项 A / B / C）经用户裁定，且（若选 A）caomei-ui 侧有能力面补齐计划。
3. caomei-ui 发布 ≥ 0.2.0 稳定版并明确 0.x API 冻结窗口。
4. 出现「必须升级 PrimeVue 5.x 才能解决的问题」（安全 / 兼容），使冻结路径不可持续。

---

## 13. 关联文档

- [apps/platform PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md) —— License 治理前置（主题库 / 图标已降级 MIT）
- [平台规范 §7.1 caomei-ui 集成实践](../../standards/platform.md#_7-1-caomei-ui-集成实践) —— 接线约定与通用实践；迁移期 PrimeVue 4 陷阱已随 M31 收口（多列排序等历史实证见 [§15.10](caomei-ui-migration-m31-proof.md#_15-10-datatable-核心页迁移实证-m31-2-2026-09-28) 起各节）
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
  - 2026-09-28（M31.1 B0 接线）：新增 [§15.8 选择器映射表更正](#_15-8-选择器映射表更正-2026-09-28-b0-接线实证) + [§15.9 B0 接线暴露的验证覆盖缺口](#_15-9-b0-接线暴露的验证覆盖缺口-m31-各批次须补齐)；§15.1「全绿」结论按 §15.9 修订为「能力存在、验证覆盖不足」
  - 2026-09-28（M31.2 DataTable 核心页迁移）：新增 [§15.10 DataTable 核心页迁移实证](caomei-ui-migration-m31-proof.md#_15-10-datatable-核心页迁移实证-m31-2-2026-09-28)（含排序机制修正 / 分组列过滤 / 分组连续性 / 密度对齐 / 选择器与取证口径）；§15.1「降序优先」行按该节修订机制描述
  - 2026-10-09（M39.3 告警「按包」聚合修正）：[§15.10 第 7 条](caomei-ui-migration-m31-proof.md#_15-10-datatable-核心页迁移实证-m31-2-2026-09-28) 由「服务端排序保证分组连续」修订为「组排序键」口径——「按包」下一个包一组，不再依赖服务端 `orderBy`
  - 2026-09-28（M31.3 其余表页迁移）：新增 [§15.11 其余表页迁移实证](caomei-ui-migration-m31-proof.md#_15-11-其余表页迁移实证-m31-3-2026-09-28)（覆盖清单 / 行选择 / 内建与 lazy 分页 / 独立 Paginator / scrollable 与 ScrollPanel / 无表级 `#header` 槽的结构变化 / 遗留项）
 
---
 
## 15. caomei-ui 0.3.0 重新评估补记（2026-09-27）
 
> 2026-09-27 caomei-ui 发布 **0.3.0**（npm `latest`），本节记录关键路径阻塞点的最新闭环情况，作为上收决策的补充依据；2026-09-28 B0 接线落地后追加 [§15.8 选择器映射更正](#_15-8-选择器映射表更正-2026-09-28-b0-接线实证) 与 [§15.9 验证覆盖缺口](#_15-9-b0-接线暴露的验证覆盖缺口-m31-各批次须补齐)。
 
### 15.1 关键路径阻塞点闭环确认
 
| 原评估 §5.2 缺口 | 0.3.0 现状 | 闭环确认 |
|-----------------|-----------|---------|
| **行分组 subheader** | ✅ `rowGroupMode="subheader"` + `groupRowsBy` + `expandableRowGroups` + `expandedRowGroups` + `#groupheader` + `@update:expandedRowGroups` | **已闭环** |
| **可展开/折叠分组** | ✅ 内建折叠按钮 + 受控 `expandedRowGroups` | **已闭环** |
| **行展开** | ✅ `expander: true` 列 + `expandedRows` + `#expansion` 槽 + `@update:expandedRows` | **已闭环** |
| **多列排序** | ✅ `sortMode="multiple"` + `multiSortMeta` + `sortDescFirst` | **已闭环** |
| **降序优先** | ✅ `sortDescFirst` / 默认排序键均可表达 | **已闭环**（机制修正：实测全局 `sortDescFirst` 会改变点击循环，最终由 `multi-sort-meta` 初值承载默认方向，见 [§15.10](caomei-ui-migration-m31-proof.md#_15-10-datatable-核心页迁移实证-m31-2-2026-09-28) 第 1 条） |
 
> **结论**：原评估中最大的结构性风险（DataTable 能力面）在 0.3.0 中**全部已由库侧闭环**。选项 A（库侧补齐）已完成，无需 dependfix 侧等待或结构性改写。
>
> **2026-09-28 B0 接线后修订**：能力存在已由真实浏览器验证（行分组 / 折叠 / 行重展开 / 多列排序），但 M30.6 V1 当时的验证覆盖不足——**能力结论成立、验证口径按 [§15.9](#_15-9-b0-接线暴露的验证覆盖缺口-m31-各批次须补齐) 校正**。
 
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

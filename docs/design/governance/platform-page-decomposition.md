# 平台页面体量治理与组件 / 组合式分层设计（M60）

> 状态：🔶 进行中（2026-11-15，M60.1 落地）
> 关联：[当前阶段待办](../../plan/todo.md)、[平台规范 §7.3 / §9](../../standards/platform.md)、[caomei-ui 迁移评估](./caomei-ui-migration.md)

## 1. 背景与目标

平台三个列表页（`repos.vue` / `alerts.vue` / `scans.vue`）在功能增量中持续膨胀，`repos` 885 行、`alerts` 900 行、`scans` 1115 行，超 ESLint `max-lines`（800，空行不计）告警线。目标是在**行为零变化**的前提下把三页拉回健康区间，并把「展示块 / 交互状态 / 纯派生」的边界固定下来，供后续原子（M60.2 死代码清理、M60.3 筛选单点化）复用。

治理口径：只做搬迁与职责收敛，不改交互、视觉、路由、API 与服务端查询；搬迁后由既有 e2e + 视觉基线证明等价。

## 2. 分层原则

| 层 | 落点 | 判定 |
|:---|:---|:---|
| 页面 | `app/pages/*.vue` | 只做编排：取数、路由、弹窗挂载、跨块状态拼装 |
| 展示块 | `app/components/*.vue` | 纯展示 + `props` / `emit`；样式随组件迁移（`scoped` 不跨组件生效）；DOM id / i18n key 保持不变 |
| 交互状态与派生 | `app/composables/*.ts` | 依赖（`t` / 请求函数 / 时间源 / 列表 ref）由参数注入，可脱离 Nuxt 运行时单测 |
| 纯函数 | `app/utils/*.ts` | 无 Vue 响应式依赖的格式化 / 判定 / 查询构造 |

约束：

- 状态所有权不迁移：筛选态、选择集合、分页仍由页面持有，组件只回写；避免同一状态出现两处事实源。
- 组合式不隐式读页面局部变量：所有外部依赖走 options，便于单测与复用。
- 样式随组件搬迁（含 `$space-*` / `@include field-stack` 等全局 SCSS 变量），页面只保留自身容器样式。

## 3. M60.1 落地清单

| 页面 | 展示块 | 组合式 | 定向用例 |
|:---|:---|:---|:---|
| `repos.vue` | `repo-filter-bar.vue`（搜索 / 三维筛选）、`repo-batch-scan-dialog.vue`（批量扫描） | `use-repo-filters.ts`（搜索 + 筛选派生）、`use-repo-scan-trigger.ts`（触发与轮询状态机） | `use-repo-filters.test.ts`、`use-repo-scan-trigger.test.ts`；`table-filters` / `batch` / `repos-crud` e2e |
| `alerts.vue` | `alert-filter-bar.vue`（视图模式 + 三维筛选 + 应用） | `use-alert-groups.ts`（分组 / 组排序键 / 折叠 / 排序回写） | `use-alert-groups.test.ts`；`alerts-rowgroup` / `alerts-sidebar` e2e |
| `scans.vue` | `scans-summary-cards.vue`（4 块汇总）、`run-filter-bar.vue`（运行筛选 + 阶段计数 + 导出入口） | `use-run-filters.ts`（筛选态 / 选项 / 阶段计数 / 状态文案） | `use-run-filters.test.ts`；`scans` / `sortable` e2e |

搬迁后行数（非空行，`awk 'NF' | wc -l`）：`repos` 509、`alerts` 632、`scans` 792，均 ≤800 且 `lint:check` 不再报 `max-lines`。

共用件（M60.3）：`app/components/filter-bar.vue`（字段行 + 重置）、`app/components/filter-field.vue`（label + 控件堆叠）、`shared/severity-labels.ts`（扫描级别展示标签，App 与 Nitro server 同源）。

### 3.1 与阶段计划的差异

阶段计划（[todo.md](../../plan/todo.md) M60.1a/b/c）按页面列出了抽取对象，D 阶段按「展示块优先、逻辑次之、先达成健康区间」微调，差异如下（验收标准未变）：

- `repos`：计划含「列表行」与「表单入口展示块」；实际抽的是**筛选栏**与**批量扫描弹窗**（表单本身早在 `repo-form-dialog` 内），并把筛选派生与扫描触发/轮询抽为组合式。列表行单元格仍留在页面（与行内操作、选择态强耦合，抽出需传 4 个回调，收益低）；分页派生仍由页面直接消费 `use-table-pagination`（已是组合式，不再二次封装）。
- `alerts`：计划含「运行侧栏」；侧栏已在 M31 抽为 `alert-run-sidebar.vue`，本原子实际抽**筛选栏**与**分组/排序状态机**。
- `scans`：计划含「扫描行 / 详情挂载块」；行单元格槽与 `utils/run-view` 的 10 余个派生函数耦合，搬迁只是移动 import，本次改为抽**汇总卡片**与**运行筛选条**（含阶段计数与导出入口）达成体量目标；详情挂载块保持一行 `<repo-history-dialog query-key="run" />` 未抽。行级抽取登记 backlog 候选，按需评估（M60.3 范围仅筛选 / 标签单点化）。

### 3.2 死代码入口判定（M60.2）

判定链：`rg` 零引用（含动态 `import()` / 自动导入 / 字符串路由名）→ 路由表 → 组件挂载点 → e2e 覆盖，四项缺一不删。

| 对象 | 判定 | 依据 / 处置 |
|:---|:---|:---|
| `alerts.vue` 的 `useFixNow` 解构 | **删除** | 页面内零引用；唯一使用者是 `alert-run-sidebar.vue`，删除不改行为 |
| `repos/[id]/runs.vue` 兼容页 | **保留** | 无应用内入口（仅外部深链），但是 `<repo-ai-toggle>` 的唯一挂载点；删除会丢失仓库级 AI 开关 UI。文件头已补触发路径与保留理由，AI 开关迁移后进入删除 |
| `repo-history-dialog` history 模式 | **暂留**（死代码） | 应用内无挂载点，`/repos?history={id}` 无页面解析；`query-key` 默认值仅为兼容旧签名。删除需先确认无外部依赖，登记 backlog |

### 3.3 列表筛选行为对照清单（M60.3）

共享骨架 `filter-bar`（字段行 + 重置按钮）+ `filter-field`（label + 控件堆叠）；字段语义与取值仍由各页持有。定向断言见对应 e2e 文件。

| 页面 | 字段 | 重置 | URL 同步 | 空态文案 | 定向用例 |
|:---|:---|:---|:---|:---|:---|
| `repos` | 搜索（owner / 仓库名 / 标签 / 凭据名）+ 执行方式 + 包管理器 + 凭据（含「未关联」） | 清空搜索与三维筛选，回到第 1 页 | 不同步（客户端筛选） | `repos.emptyFiltered` / `repos.empty` | `table-filters.e2e.test.ts`（搜索 / 叠加筛选 / 重置） |
| `batch-runs` | 来源 + 状态 | 两维回 `all` | 不同步 | `batchRuns.emptyFiltered` / `batchRuns.empty` | `table-filters.e2e.test.ts`（控件与重置）、`batch.e2e.test.ts`（数据面） |
| `scans`（全部运行） | 状态 + 失败阶段 + 处置建议 + 开始时间区间 | 五维回默认（区间清空） | 不同步；`repository` / `run` 由 query 驱动 | `scans.runList.empty`；非法区间本地提示且不发请求 | `scans.e2e.test.ts` case 4（阶段筛选 / 清除）、`sortable.e2e.test.ts`（排序 / 分页） |
| `scans`（按仓库） | 最近状态 | 下拉回 `all`（无独立重置按钮） | 不同步 | `scans.byRepo.empty` | `scans.e2e.test.ts` case 5（最近状态筛选 + 客户端分页） |

## 4. 行为不变式（验收口径）
1. **DOM 契约稳定**：筛选控件 id（`#repos-filter-search` / `#view-mode` / `#run-status` 等）、表格类名、按钮文案与 `aria-label` 保持原样。已登记的有意偏离：重置按钮统一为共享类 `.filter-bar__reset`（原页面私有类），对应 e2e 选择器同步更新。
2. **视觉等价**：`test:visual` 两主题零像素差异。已登记的有意偏离：严重级别展示统一走共享标签表后，由小写直出改为首字母大写（`Critical` / `High` / `Medium` / `Low` / `Unknown`），影响扫描阈值列与告警 / 结果级别标签；`scans-main-light`、`alerts-light`、`alerts-dark`、`alerts-right-light`、`alerts-right-dark`、`scans-run-detail-light` 基线已同步更新，差异仅为该文本，无布局位移。
3. **交互等价**：筛选 / 重置 / 分页 / 勾选 / 分组折叠 / 排序 / 导出入口的事件与副作用顺序不变；`alerts` 视图切换仍重置排序与折叠态。
4. **可测性**：组合式以参数注入依赖，单测不加载 Nuxt 运行时；组件由既有 e2e 断言覆盖展示与交互。

## 5. 后续原子

- **M60.2 死代码清理**：以本设计的挂载点清单为入口判定依据（`repo-history-dialog` 的 history 模式 / `repos/[id]/runs.vue` 兼容页 / `useFixNow` 闲置解构）。
- **M60.3 筛选与标签单点化**：在 `use-repo-filters` / `use-run-filters` 与 `utils/scan-options` 之上抽共享筛选骨架，覆盖 `repos` / `batch-runs` / `scans` 三页，保留各页字段语义差异。

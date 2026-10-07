# 扫描偏好（设备级）设计（设计先行稿）

> 状态：✅ 已落地（2026-10-07，M37.2；Review Gate Pass）
> 提出：2026-10-05（用户诉求 —— 单仓库 / 批量扫描每次都要重选 `mode` / `severity`，重复操作多）
> 范围：`apps/platform` 前端（composable + 单仓库 / 批量弹窗接线 + 设置页卡片）；**不改**扫描 API 契约与任何服务端实体
> 关联：[todo.md §M37.2](../../plan/todo.md)、[roadmap.md §M37](../../plan/roadmap.md)、[platform.md §7.3](../../standards/platform.md#73-utility-抽取与跨组件共享)、[backlog.md](../../plan/backlog.md)（服务端跨设备偏好延后）

## 1. 背景与问题

单仓库扫描配置弹窗（`repos.vue` + `scan-config-dialog.vue`）与批量扫描弹窗（`use-repo-batch-scan.ts`）在每次打开时把 `mode` / `severity` 重置为硬编码默认（`report-only` / `high`）。日常运维中用户往往固定使用某种组合（例如「修复并建 PR + 全部」），每次都需重选，且切换仓库时无法沿用。

## 2. 目标与非目标

**目标**

- 单仓库 / 批量弹窗的 `mode` / `severity` 在会话间保留（设备级）。
- 支持可配置的**显式默认**，并提供一键重置。
- 解析优先级明确且可单测：**显式默认 > 上次选择 > 硬编码兜底**。

**非目标**

- 不改 `/api/repos/{id}/scan` 与 `/api/repos/batch-scan` 契约。
- 不改仓库级 `aiEnabled` / `aiTrigger` 继承语义。
- **不**将偏好沿用至计划（schedule）默认——计划表单有自己的默认值。
- 不做服务端跨设备偏好 / 组织级统一默认（登记 backlog §候选评估中）。

## 3. 方案（方案 C 混合）

用户 2026-10-06 决策：localStorage 记住上次选择 + 可选配置化默认 + 重置，**无服务端实体**。

### 3.1 数据模型

单一 localStorage 键 `dependfix-scan-preferences`，值为 JSON 对象（字段全部可选）：

| 字段 | 写入方 | 含义 |
|:--|:--|:--|
| `defaultMode` / `defaultSeverity` | 设置页「扫描偏好」卡片 | 显式默认（用户主动配置） |
| `lastMode` / `lastSeverity` | 单仓库 / 批量扫描**提交**时 | 上次实际提交的操作 |

- 读取时逐字段校验（非枚举值丢弃，脏数据不整段失败）；全部字段为空时移除键。
- 「未设置」在设置页下拉中用哨兵值 `__auto__` 表示（caomei `SelectItem` 不接受空串 `value`），选中即清除该维度显式默认。

### 3.2 优先级解析

两维度**独立**解析：`defaultMode ?? lastMode ?? 'report-only'`（severity 同理 → `'high'`）。
`resolveScanDefaults` 同时返回 `modeSource` / `severitySource`（`default` / `last` / `fallback`），供设置页提示「当前生效」口径。

### 3.3 写入时机

- **显式默认**：设置页选择即写（无保存按钮，与语言偏好卡片一致）。
- **上次选择**：扫描**提交**时记录（弹窗打开 / 关闭不写）——「上次选择」= 上次实际执行的操作；提交失败也记录（用户下次重试仍用同组合）。
- **重置**：设置页「重置扫描偏好」清空显式默认与上次选择 → 回退硬编码兜底。

### 3.4 SSR 与可测性

- `preferences` 初始为空对象（构造期**不读**存储），由页面 `onMounted` 或打开弹窗时 `resolveDefaults()` 填充 → SSR 首帧与客户端值一致，无 hydration 错配。
- 存储以可选参数注入（缺省解析 `localStorage`；SSR / 无 `localStorage` 环境为 null → 回退兜底）；**存储解析与读写全路径纳入 try/catch**（安全策略下访问 `localStorage` 本身即抛错，不得冒泡打断「提交前记录偏好」这一调用方主流程）。
- 单测注入内存实现 + 抛错 getter 覆盖读写 / 脏数据 / 抛错分支（vitest node 环境无 `localStorage`）。

### 3.5 UI 落点

- `apps/platform/app/composables/use-scan-preferences.ts` —— 偏好单一事实源（类型 / 常量 / 纯函数解析 / 存储读写 / composable）。
- `apps/platform/app/utils/scan-options.ts` —— 模式 / 严重级别下拉选项（单仓库弹窗、批量弹窗、设置页三处共用；取值与 `SCAN_MODES` / `SCAN_SEVERITIES` 单测断言一致）。
- `repos.vue`（`openScanConfig` 解析默认 + `submitScanConfig` 记录）、`use-repo-batch-scan.ts`（`openBatchScan` / `submitBatchScan` 同上）。
- `settings.vue` 新增「扫描偏好」卡片：默认模式 / 默认严重级别下拉 + 重置 + 生效口径提示。
- `scan-config-dialog.vue` 无需改动（其 `mode` / `severity` 全部来自父级 prop，本就无硬编码默认依赖）。

## 4. 验收（已达成）

- [x] 单仓库 + 批量弹窗 `mode` / `severity` 会话间保留（刷新与同页重开均生效）
- [x] 无偏好时回退硬编码默认（`report-only` / `high`）
- [x] 「显式默认 > 上次选择 > 硬编码兜底」优先级 + 重置能力（含设置页「未设置」清除）
- [x] zh-CN / en-US i18n 双侧同步
- [x] composable 单测覆盖优先级解析 / 回退 / 重置；SSR 首帧不读存储
- [x] e2e 覆盖偏好记忆 / 显式默认优先级 / 重置回退 / 批量弹窗同源解析

## 5. 风险与残余

- **设备级**（换设备 / 换浏览器不继承）→ 服务端跨设备偏好登记 backlog §候选评估中，待用户评估。
- localStorage 被清理 / 隐私策略禁写 → 静默回退硬编码兜底，功能不报错。
- 「上次选择」为设备级且隐式（用户可能感知不到）→ 设置页展示「当前生效」提示缓解。
- 计划（schedule）默认不受影响 → 与用户「不将偏好沿用至 schedule」的边界一致。

## 6. 关联文档

- [platform.md §7.3 Utility 抽取与跨组件共享](../../standards/platform.md#73-utility-抽取与跨组件共享)（有状态 composable 的 SSR 与可测性约定）
- [platform.md §7.4 caomei-ui 接线约定](../../standards/platform.md#74-caomei-ui-接线约定)（`SelectItem` 不接受空串 `value`）
- [backlog.md §候选评估中](../../plan/backlog.md)（服务端跨设备默认延后项）

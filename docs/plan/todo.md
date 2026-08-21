# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M12 平台 UX 一致性 + i18n 治理

> **阶段背景**：M11 已闭环（2026-08-20，22 commits + branches 80.49%）+ 承接 2026-08-21 用户实测反馈 10 项平台 UX / 安全 / i18n 问题。完整规划（阶段目标 / 启动顺序 / 风险登记）见 [backlog.md §M12](backlog.md#m12-平台-ux-一致性--i18n-治理待启动)。
>
> **启动顺序**：C65-A（P1 立即）→ C65-D / C65-C 并行 → C65-B 依赖 C65-A 落地。
>
> **阶段验收**：4 子批次全部独立闭环（每个 ≥ 1 Review Gate Pass）+ `pnpm lint` / `typecheck` / `test` 全绿 + branches ≥ 80% + `pnpm check:docs` 全过 + CI 端到端通过。
>
> **阶段状态**（2026-08-21）：C65-A ✅ + C65-B ✅ + C65-C ✅ + C65-D ✅，M12 阶段完整闭环（8 commits ahead of origin/master：C65-A 4 + C65-B 2 + C65-C 2；本次新增 C65-D 4 commits = 12 commits ahead，C65-D 等待推送）

### C65-A 用户管理安全 + 角色 i18n（**P1，可立即启动**）

- [x] **C65-A1** admin 禁止对自己修改权限（防降级，前端 UI 层）
  - 优先级：**P1（安全）**
  - 依赖：无
  - 交付物：`apps/platform/app/pages/users.vue` —— `setRole()` 函数首行增加 self-check（`user.id === session.user.id` → 拒绝 + toast）+ 当前登录 user 的 role `<Select>` 加 `:disabled="user.id === session?.user?.id"`
  - 验收：当前登录 admin 看自己 row 时 role Select 含 `disabled` 属性；切他人 row 仍可改；devtools 强制触发 `setRole(self)` → 拒绝（不修改服务端状态）+ toast 错误
  - 测试：vitest `setRole` 拦截逻辑 ≥ 2 case；playwright admin e2e 看自己 row role Select 含 disabled
  - 预估 diff：~1 文件 +50 行（含 e2e）
  - **闭环**（commit `1d7c5c8` 2026-08-21）：6 文件 / +81/-1 行；`isSelfTarget` 独立可测函数 + 6 vitest 用例；admin e2e 断言 self row `aria-disabled="true"` / other row `aria-disabled="false"`（PrimeVue 4 disabled 落到内部 `span[role=combobox]` 的 aria-disabled 而非 root class）
  - 关联：`#7 admin 禁止对自己修改权限`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

- [x] **C65-A2** 角色名称国际化
  - 优先级：P2（i18n 一致性）
  - 依赖：无（可与 C65-A1 同批次实施）
  - 交付物：`apps/platform/i18n/locales/zh-CN.json` + `en-US.json` 新增 `common.role.admin/orgAdmin/viewer` 键（中英双语）+ `users.vue:15-19` `ROLES` 数组硬编码英文标签改为 `t('common.role.admin')` 等 + `roleLabel()` 函数同步切换
  - 验收：切换 zh-CN 时 role Select 显示"管理员 / 组织管理员 / 观察者"；en 显示"Admin / Org Admin / Viewer"；`roleLabel()` 与 Select 选项统一数据源
  - 测试：i18n 切换断言（playwright）
  - 预估 diff：~3 文件 +70 行
  - **闭环**（commit `2076fda` 2026-08-21）：4 文件 / +37/-6 行；ROLES computed 化 + roleLabel 同源切换；i18n e2e 断言 zh-CN 含"管理员"/"观察者"、en 含"Admin"/"Viewer" + en 页面无中文残留（"组织管理员"未断言——仅 Select option，未实际分配给 e2e 测试用户，不进入 DataTable）
  - 关联：`#9 角色名称国际化`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

- [x] **C65-A3** 服务端强制拦截 admin 自修改（纵深防御补齐）
  - 优先级：**P1（安全）**
  - 依赖：C65-A1（明确"前端拦截等于没有拦截"后追加）
  - 交付物：`apps/platform/server/middleware/auth-self-guard.ts` —— Nuxt server middleware 拦截 better-auth admin 插件 5 个写端点（set-role / ban-user / remove-user / impersonate-user / **update-user**）+ 双层防护（self-target 拦截 + 最后 admin 兜底）
  - 验收：devtools/直接 fetch 调 admin API 自修改返回 403；其他 admin demote/ban/remove 唯一 active admin 也返回 403；服务端 session 不依赖前端校验
  - 测试：playwright admin e2e 直接调 API 验证 5 端点 × 403 + state 未变断言
  - 预估 diff：~1 新文件 +150 行 + 1 e2e +110 行
  - **闭环**（commit `b10e270` 2026-08-21）：2 文件 / +331 行；拦截 5 端点（初版 4 端点 + audit W-1 修复 update-user）；错误码 SELF_MUTATION_FORBIDDEN / LAST_ADMIN_GUARD / NO_SESSION 提取为常量
  - 关联：`#7 admin 禁止对自己修改权限`（C65-A1 已闭环前端层，本任务补服务端层）

- [x] **C65-A4** update-user 端点覆盖（防 W-1 绕过）
  - 优先级：**P1（安全）**
  - 依赖：C65-A3（audit W-1 检出 update-user 端点绕过 LAST_ADMIN_GUARD）
  - 交付物：auth-self-guard.ts 白名单追加 `/api/auth/admin/update-user`；update-user 字段在 body.data 下而非平铺，data.role 非 admin 或 data.banned === true 触发 demote/ban 检查
  - 验收：devtools 调 update-user 自修改 role/banned 返回 403
  - 测试：playwright admin e2e 直接调 update-user 验证 self-target + role demote / banned=true 双路径 403
  - 预估 diff：~1 文件 +30 行（已合入 C65-A3 commit）
  - **闭环**：合入 commit `b10e270`（同批次提交）
  - 关联：`#7 admin 禁止对自己修改权限`（audit S-1 补强）

### C65-B i18n 单点声明治理（P2，**待 C65-A 落地后启动**）

- [x] **C65-B1** i18n 配置统一来源
  - 优先级：P2（治理）
  - 依赖：**C65-A2**（角色 i18n 键落地后才能展示治理效果）
  - 交付物：`apps/platform/i18n/nuxt-i18n-config.ts`（新增，承载 @nuxtjs/i18n 模块层字段：locales / strategy / langDir / defaultLocale / detectBrowserLanguage / detector 路径）+ `apps/platform/i18n/i18n.config.ts`（仅保留 vue-i18n 运行时配置：datetime/number formats）+ `apps/platform/nuxt.config.ts` i18n 块简化（24 行 → 6 行，仅引用）+ [docs/standards/platform.md §7.2](../standards/platform.md#72-i18n-配置单点声明) 新增"i18n 配置单点声明"条款
  - 验收：`nuxt.config.ts` i18n 块 ≤ 10 行（实际 6 行：spread + vueI18n + experimental）；新增语言演示：仅改 `nuxt-i18n-config.ts` 一处 + `locales/` 文件即可
  - 测试：构建期 `nuxt typecheck` 不破坏；i18n 切换 e2e 不回归
  - 预估 diff：~3 文件 +50/-30 行
  - **闭环**（commit `789ed2f` 2026-08-21）：4 文件 / +86/-27 行；**双文件拆分根因**：`defineI18nConfig` 是 @nuxtjs/i18n 模块加载时通过 addImports 注入的运行时全局，仅 Nuxt transform pipeline 就绪后才可用；nuxt.config.ts 顶层 import 走 jiti（无 transform pipeline），import 调用了 `defineI18nConfig` 的模块会 `ReferenceError`（实测）→ 必须物理拆分 `nuxt-i18n-config.ts`（jiti 安全）与 `i18n.config.ts`（vue-i18n 运行时，Nuxt transform pipeline 加载）；`as const` 锁定字面量类型避免 spread 后被 Nuxt 模块类型推断为宽化（audit S2 已 T 阶段 typecheck 实证通过）；A 阶段 audit quick Pass + S1（i18n.config.ts 末尾 newline）已修 + S2（as const 兼容性）T 阶段实证通过
  - 验证：`pnpm lint` 0 error（1 pre-existing mailer warning）/ `nuxt typecheck` EXIT 0 / `tsc -p tsconfig.i18n.json --noEmit` EXIT 0 / `vitest` 683 passed + 4 skipped / `playwright admin+i18n` 22/22 passed（对照 C65-A 基线无回归）
  - 关联：`#10 i18n 单点声明`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

### C65-C schedules 增强（P2，**与 C65-A / C65-D 并行启动**）

- [x] **C65-C1** cron 表达式预览
  - 优先级：P2
  - 依赖：无
  - 交付物：`apps/platform/app/utils/cron-preview.ts` 新增（previewCron 函数复用 cron-parser 5.x，0 新增依赖）+ `apps/platform/app/pages/schedules.vue` Dialog cron `<InputText>` 下方加实时预览（三状态：合法=next 3 次触发时间 / 非法=错误提示 / 空=无显示）
  - **技术决策**（用户拍板）：方案 B 自实现（0 新增依赖，复用 cron-parser 已装的成熟 next() 实现）；原因：cronstrue 实测 unpackedSize 1.23MB（todo.md 估 ~10KB gzip 严重偏差）+ cronstrue-i18n 不存在于 npm registry（todo.md 误引）
  - 验收：cron 输入实时显示"下次触发：2026-08-25 02:00"（按 cron 时区格式化）；非法 cron 显示错误（cronInvalid.{empty/invalidFieldCount/parseError}）；时区切换正确（cron-parser tz + Intl.DateTimeFormat timeZone 双通道）
  - 测试：vitest cron-preview.test.ts 10 case（校验口径 4 + 合法 cron 4 + 时区切换 2）；playwright schedules.e2e.test.ts cron 预览 + 非法反馈 2 用例
  - 预估 diff：~1-2 文件 +100 行
  - **闭环**（commit `5dff002` 2026-08-21）：3 文件新增（utils + test + e2e）+ 4 文件修改 +377/-3 行；cron-preview.ts 75 行（previewCron + 校验 + 类型）+ cron-preview.test.ts 99 行（10 case 含 vitest firstRun helper + 上海/UTC 时区偏移断言）；schedules.vue 改造 97 行（browserTimezone ref + timezoneOptions 重排简化 + cronPreview computed + formatCronPreviewDate helper + 模板三状态 + ul reset scoped style + section 包裹 aria-label）
  - A 阶段 2 轮 audit：round 1 Reject（W1 text-success/error 工具类未声明 + W2 cron-preview.ts 孤立编号）→ 修复 + S1/S3/S4/S5 suggest 采纳 → round 2 复审只审修复点触发 §3 同模式扫描 → 发现 W3 4 处 C65-C 编号引用（1 style 注释 + 3 test 名）→ 全部清理（保留解释正文）
  - 验证：`pnpm lint` 0 error / `nuxt typecheck` EXIT 0 / `tsc -p tsconfig.i18n.json` EXIT 0 / `vitest` 693 passed + 4 skipped / `playwright admin+i18n+schedules` 25 passed（22 baseline 无回归）
  - 关联：`#2 cron 预览`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

- [x] **C65-C2** 时区选择框
  - 优先级：P2
  - 依赖：无（与 C65-C1 共享时区状态）
  - 交付物：`schedules.vue:410-418` 时区 `<InputText>` 改为 `<Select>` 含 `filter`（数据源 `Intl.supportedValuesOf('timeZone')` ~600 项）+ 默认值 `Intl.DateTimeFormat().resolvedOptions().timeZone`（浏览器时区插首位）+ 旧 Node 不可用时兜底常用 UTC/Asia/Shanghai 等 6 项
  - 验收：时区字段为 Select 含 filter，可搜索/选择；默认时区跟随浏览器；i18n locale 切换不影响时区列表（IANA 是稳定的，与 ECMA-402 规范保证一致）
  - 测试：playwright schedules.e2e.test.ts 时区 Select 用例（含 IANA 列表 + filter 验证 + 默认浏览器时区首位）
  - 预估 diff：~1 文件 +80 行
  - **闭环**（commit `5dff002` 2026-08-21）：合并入 C65-C1 同 commit（共享 timezoneOptions + browserTimezone 等 reactive state 与 cron-preview 共用时区通道）；playwright schedules.e2e.test.ts 第 3 用例覆盖 C65-C2 验收
  - 验证：playwright 时区 Select overlay 包含 ≥10 项 IANA 时区 + filter 输入 Shanghai 后 Tokyo 消失 + 浏览器时区 Asia/Shanghai 首位显示
  - 关联：`#3 时区选择框`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

### C65-D 平台表格 / 视图增强（P2，**与 C65-A / C65-C 并行启动**）

- [x] **C65-D1** env-events 表格 sortable（补全 C60）
  - 优先级：P2（UX 一致性）
  - 依赖：无
  - 交付物：`apps/platform/app/pages/env-events.vue:243-292` —— 6 列（type / severity / repository / message / notified / createdAt）全部加 `sortable`，含 `removable-sort` 三态；`e2e sortable.spec.ts` 加 env-events 用例
  - 验收：6 列均 sortable，含三态（asc / desc / none）；playwright 覆盖
  - 测试：playwright sortable.spec 扩展 env-events 用例
  - 预估 diff：~1 文件 +30 行
  - **闭环**（commit `348502d` 2026-08-21）：5 文件 / +179/-7 行；severity 列用 `_severityRank` 派生（业务语义：critical > error > warn > info，独立 ENV_EVENT_SEVERITY_RANK 常量避免与 alerts SEVERITY_RANK 值集污染 sort 字段，与 RUN_STATUS_RANK 同模式）；message 列 `messageText` 派生（payloadJson.degradedReason.message ?? payloadJson.message）；0 新增依赖，复用 sort-helpers withXxxRank 模式；单测 8 case + e2e 3 case（含 sortable.spec env-events 6 列 + env-events severity 三态 removable-sort）
  - 关联：`#1 env-events sortable`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

- [x] **C65-D2** alerts 双 chevron 修复
  - 优先级：P2（视觉缺陷）
  - 依赖：无
  - 交付物：`apps/platform/app/pages/alerts.vue:323-342` —— 移除 `#groupheader` slot 内冗余 chevron icon（保留 PrimeVue 4 `expandable-row-groups` 默认渲染的 chevron）；整个 `<span>` 仍可点击 + 键盘 enter/space 触发
  - 验收：单箭头（PrimeVue 默认）；groupheader 点击区域保持一致（视觉无变化，仅去除重复图标）
  - 测试：playwright alerts-rowgroup.e2e 加 chevron 数量断言（恰好 1 个）
  - 预估 diff：~1 文件 +5/-3 行
  - **闭环**（commit `132b944` 2026-08-21）：2 文件 / +20/-12 行；删除自定义 chevron + 简化 `<span>` 交互（删除 role/tabindex/@click/@keydown）+ 保留 todo.md 验收的整体可点击 + 键盘 enter/space + :aria-expanded + cursor pointer + focus-visible（audit W2 修复采用方案 A）；test.fixme 块改用 PrimeVue 默认 icon 选择器（audit W1 清理删除类自检遗漏）；e2e 新增 1 用例断言 `i.alerts__group-toggle` count = 0 防回归
  - 关联：`#4 alerts 双箭头`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

- [x] **C65-D3** alerts 视图切换（按包 / 按项目 / 原始列表）
  - 优先级：P2
  - 依赖：无（与 D2 / D4 共享 alerts.vue）
  - 交付物：`apps/platform/server/api/alerts/index.get.ts:42` —— 扩展 `groupBy='package' | 'repository' | none`（不传等价 none）；`apps/platform/app/pages/alerts.vue` —— 顶部新增 SwitchButton / TabView 三选一视图切换，动态切换 `row-group-mode` / `group-rows-by` / `multiSortMeta`
  - 验收：三视图切换正常（按包 / 按项目 / 原始）；切换后 `fetchAlerts` 携带 `groupBy` 参数；按项目时 group header 显示 `repository` 字段 + 该项目告警数
  - 测试：vitest `alerts/index.get.ts` `groupBy` 参数 ≥ 3 case；playwright alerts 三视图切换 e2e
  - 预估 diff：~2 文件 +150 行
  - 风险：C64 PrimeVue hydration known-issue 可能在新视图切换时触发；保持 alerts-rowgroup `.fixme` 状态直到 PrimeVue 修复版本或迁移 `useAsyncData`
  - **闭环**（commit `374a278` 2026-08-21）：6 文件 / +277/-32 行；后端 TypeORM find options → QueryBuilder 重构（1.x find options order 不支持嵌套路径 scanRun.repository.owner，为统一代码路径全部走 QueryBuilder 行为等价）；zod safeParse 兜底 groupBy 非法值；前端 Select 三选一 + 动态 DataTable 属性（rowGroupMode/groupRowsBy/multiSortMeta/expandableRowGroups）+ viewMode='none' 不传 groupBy + viewMode 切换重置 multiSortMeta + expandedPackages 避免 group 状态污染；i18n 5 键双语完整；vitest 4 case（groupBy=repository 跨 repo 排序 + repositoryId 过滤组合 + 非法值兜底 2）；e2e 3 case（Select 三选一 + viewMode=repository 触发 ?groupBy=repository + viewMode=none 不传参）；C64 rowGroup hydration known-issue 保持 fixme 状态
  - 关联：`#5 alerts 视图切换`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

- [x] **C65-D4** alerts 图表与仪表盘去重
  - 优先级：P2
  - 依赖：无（与 D3 共享 alerts.vue）
  - 交付物：`apps/platform/app/pages/alerts.vue:179-247` —— 顶部 3 图差异化或删除（保留按 alerts 当前过滤器的聚合图；去除与 dashboard 完全重复的全量聚合图）；alerts 页面聚焦"更详细的内容"（payload 详情 / 修复历史 / 关联扫描 run 链接等）
  - 验收：alerts 顶部 3 图差异化（按当前过滤器）或删除；不动 `dashboard.vue`；alerts 页面提供更多表格细节（如消息详情展开已存在）
  - 测试：playwright alerts 顶部图表 aria-label 变更或缺失断言
  - 预估 diff：~1 文件 +50/-100 行
  - **闭环**（commit `ad6ce70` 2026-08-21）：2 文件 / +24/-242 行（净 -218）；决策：直接删除顶部 3 图区块（severity 饼图 + fixRate 环形 + Top-10 包柱状图）+ 卸载 useDashboardStats 13 字段引用 + onMounted 简化（删除 fetchStats）+ 删除 charts 相关 SCSS（charts/charts-grid/chart-card/chart-title/chart-canvas/chart-center/chart-overlay-empty/dark-mode 共 -100 行）；e2e 删除 2 个 charts 用例（顶部 3 图渲染 + 768px charts-grid）+ 新增 1 个"alerts 不含 dashboard 图表"断言去重用例 + 清理 MOCK_DASHBOARD_STATS + 3 处 dead route mock + stale doc（audit W1）+ describe 标题更新；user path：alerts 顶部不再渲染 dashboard 同款图表，全量统计去 dashboard，alerts 聚焦表格 + 详情
  - 关联：`#6 alerts 图表去重`（backlog.md §2026-08-21 平台 UX 反馈批次评估）

---

## 待人工验收（真实环境，随可用性推进）

> 以下条目属 M7.1 / M7.2 / 发布管线阶段遗留的真实环境验证任务，**不在 M12 范围内**，保留随真实环境可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

实施记录与背景：[archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

实施记录：[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[backlog.md §M7.2](backlog.md#m72-平台能力深化)

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

实施记录：[backlog.md §M7.2](backlog.md#m72-平台能力深化)

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

实施记录：[backlog.md §M7.2](backlog.md#m72-平台能力深化)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留 4 段） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细） |
| 未排期 / 延期 / 远期 + M12 详细规划 | [backlog.md](backlog.md)（[§M12 阶段规划](backlog.md#m12-平台-ux-一致性--i18n-治理待启动) 完整段） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M12 全部 / M12 规划中） |
| 已知边界 / known-issue | 各阶段归档段（如 [todo-archive.md §2026-08-20 e2e 修复批次 / C64-3](todo-archive.md#2026-08-20-e2e-修复批次c62--c63--c64--chore) PrimeVue hydration）或 backlog 顶部"未完成项目（backlog 仍活跃）" |

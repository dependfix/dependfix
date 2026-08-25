# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M13 治理 + UX 反馈 + 网络治理 + Code Scanning

> **阶段背景（2026-08-25 启动）**：M12 已闭环归档 + 上批次 5 commits（c47b5fb/6ea5b2b/5f69a27/0981096/228f7a7/c811659）已全部推送至 `origin/master`（ahead=0）。本阶段承接：① backlog 治理前置（C1+C2 强制要求）；② 2026-08-21 后用户实测反馈 2 项 UX 问题；③ 网络治理长期主线（network-audit G1）；④ Code Scanning 规则化 + code-quality-findings 接入。
>
> **拆分方案**：按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件需拆分）拆分为 **3 子阶段独立闭环**：
>
> | 子阶段 | 任务 | 预计 commits | 风险梯度 |
> |:---|:---|:---:|:---:|
> | M13.1 治理前置 + 平台 UX 反馈 | T1301 + T1302 + T1303 + T1304 | 4 | 低 |
> | M13.2 网络治理 + 告警去重 | T1305 + T1306 | 2-4 | 中 |
> | M13.3 Code Scanning 规则化 + CQL | T1307 + T1308 | 2-4 | 高 |
>
> **状态约定**：子阶段串行实施，每子阶段独立 PDTFC+ 循环；上一子阶段 F 阶段闭环（commit 推送）后方可启动下一子阶段。

### M13.1 治理前置 + 平台 UX 反馈（next up）

#### T1301 C1 wisdom 蒸馏

- **优先级**：P0 必做（[规划规范 §4.3 强制要求](../../docs/standards/planning.md) — 活跃条目 ≥ 20 必须蒸馏；当前 61 条远超阈值）
- **依赖**：—
- **执行范围**：`.session/wisdom.md`（150 行 / 61 条 → 收敛活跃 + 蒸馏归档）
- **非目标**：不动工程文件 / 不动 standards（蒸馏产物待 T1302 挂接）
- **交付物**：
  - `.session/wisdom.md` 收敛到 ≤ 100 行 / 活跃条目 ≤ 15
  - `docs/design/governance/wisdom-archive.md` 新建（蒸馏归档条目）
  - `pnpm distill:wisdom --check` 通过
- **验收标准**：
  - 活跃条目按 pattern/principle/practice 类型分组，跨日期去重
  - 蒸馏归档保留 type + 摘要 + 来源链接（追溯用）
  - `distill:wisdom --check` 报告活跃条目数 ≤ 15
- **最小验证矩阵**：`pnpm distill:wisdom --check` EXIT 0 + wisdom.md 行数 ≤ 100
- **风险**：低

#### T1302 C2 neat-freak 批次

- **优先级**：P1
- **依赖**：T1301（蒸馏后挂接 standards）
- **执行范围**：`docs/standards/development.md` / `testing.md` / `security.md` / `ai-development.md` / `git.md` / `planning.md` + `README.md` / `docs/guide/*.md` + `.github/agents/full-stack-master.agent.md`
- **非目标**：不动 `.session/wisdom.md`（已在 T1301 收敛）
- **交付物**：
  - 6+ 新 wisdom pattern/principle 挂接到 standards 对应章节
  - 经验归档段（如 `docs/design/governance/experience-archive.md`）更新引用
  - agent 文档同步（M12 归档 / 大批量文档操作规范 / 同模式扫描第 2 轮验证等）
- **验收标准**：
  - standards/*.md 新增章节引用 wisdom 条目（双向链接）
  - agent 文档新增 PDTFC+ 自检条目
  - `pnpm lint:md` + `pnpm check:docs` 全过
- **最小验证矩阵**：`pnpm check:docs` 0 error / `pnpm lint:md` 0 error
- **风险**：低

#### T1303 单仓库扫描互斥修复（实测反馈 5.1）

- **优先级**：P1（实测反馈 UX bug）
- **依赖**：—
- **执行范围**：`apps/platform/app/pages/repos.vue` 第 468-473 行（动作列 scan 按钮）
- **非目标**：不动后端 / 不改 batch-scan 路径 / 不改 polling 逻辑
- **根因分析**：
  - `repos.vue:468-469` 有 `:disabled="scanningId !== null && scanningId !== data.id"`
  - 该条件将"单仓库扫描状态"作为"全局互斥锁"——任一仓库扫描中时，其他所有仓库扫描按钮被禁用
  - 用户期望：多个不同仓库的扫描独立可触发（受后端 BullMQ 队列 + 沙箱隔离支持）
- **修复方案**：删除 `:disabled` 条件，仅保留 `:loading="scanningId === data.id"`
- **交付物**：`apps/platform/app/pages/repos.vue` 单文件改动
- **验收标准**：
  - 删除 `:disabled="scanningId !== null && scanningId !== data.id"` 条件
  - 保留 `:loading="scanningId === data.id"` 单仓库扫描态指示
  - 多个不同仓库的扫描按钮可独立触发（互不影响）
- **最小验证矩阵**：
  - `pnpm lint` 0 error
  - `pnpm typecheck` 0 error
  - playwright e2e 新增 1 case：并发触发 2 个不同仓库扫描，确认两按钮均进入 loading 状态而非互斥禁用
- **风险**：低（前端 UI 改动，后端不变）

#### T1304 历史 Dialog X 按钮修复（实测反馈 5.2）

- **优先级**：P1（实测反馈 UX 缺陷）
- **依赖**：—
- **执行范围**：`apps/platform/app/components/RepoHistoryDialog.vue` + i18n keys（zh-CN + en-US）
- **非目标**：不动详情视图本身逻辑 / 不改 query 状态机
- **根因分析**：
  - 当前架构：单 Dialog 内 list/detail 视图切换（commit `2102894` 已修 unrouting 问题）
  - 用户痛点：详情视图下点 X 按钮直接关闭整个 Dialog（PrimeVue Dialog 默认行为），无法回到列表——与"返回列表"按钮的预期不符
- **修复方案**：
  - 详情视图时 Dialog `:closable="false"`，不渲染 X 按钮
  - 列表视图保持默认 `closable` 行为
  - i18n 新增 `runs.detailBackHint` 等提示文案（双语）
- **交付物**：`RepoHistoryDialog.vue` 单文件改动 + i18n locale 双语 key
- **验收标准**：
  - 详情视图时 Dialog `:closable="false"`，X 按钮不渲染
  - 列表视图保持默认 `closable`
  - i18n 双语新增（zh-CN + en-US 各 1-2 键）
- **最小验证矩阵**：
  - `pnpm lint` 0 error
  - `pnpm typecheck` 0 error
  - `pnpm lint:i18n` 0 error
  - playwright e2e 新增 1 case：打开历史 → 进入详情 → 确认 X 按钮不渲染 + "返回列表"按钮可点击回退
- **风险**：低

### M13.2 网络治理 + 告警去重（待 M13.1 闭环启动）

#### T1305 B2 network-audit G1 治理（长期主线 #2 切片）

- **优先级**：P1（backlog 长期主线 #2 进行中）
- **依赖**：M13.1 F 阶段闭环
- **执行范围**：`packages/engine/src/runtime/network-audit.ts` + `packages/engine/tests/network-audit.test.ts` + `docs/design/governance/network-audit.md` + 相关 docs
- **非目标**：不动 `runtime-adapters/*`（已独立闭环）；不动 verify-runner 主体逻辑
- **根因分析**：
  - 临时修复：`rolldown.rs` 默认白名单（commit `2104b9f`）；症状 = vite 6/7 跨 major 升级 verification 命令输出 URL 被 deny-by-default 拦截为 `network_violation` → run exitCode=1
  - 每次构建工具跨 major 升级都需补白名单（按次新增模式不可持续）
- **修复方案**（三路径可选，详见 backlog §主线 #2）：
  - 路径 1：构建工具生态文档站类目预置白名单（rolldown.rs / swc.rs / rust-lang.org 等）
  - 路径 2：按 SRI 哈希钉资源（推荐域动态发现）
  - 路径 3：命令输出 URL 与真实外联区分（stdout/stderr 字符串不应判 violation）
- **交付物**：
  - `network-audit.ts` 默认白名单从"按 hostname 字符串"演进为"按 hostname + SRI hash + 输出区分"三维匹配
  - 新增 `auditNetworkRequest({ url, contentType?, isStdout? })` 接口
  - stdout/stderr 字符串不判 violation
- **验收标准**：
  - 默认白名单支持上述三维匹配
  - stdout/stderr URL 误判修复（vitest 单测覆盖）
  - 构建工具生态文档站类目预置白名单生效
- **最小验证矩阵**：
  - `pnpm lint` 0 error / `pnpm typecheck` 0 error
  - vitest 单测 +5 case（stdout/stderr 误判修复 + SRI 哈希匹配 + 预置白名单覆盖）
  - e2e：verification job 实测不误判（依赖真实 CI 环境，单元测试为主）
- **风险**：中（跨前后端 + 公共 API 变更需兼容性考虑）

#### T1306 告警跨次扫描去重（实测反馈 6）

- **优先级**：P1（实测反馈）
- **依赖**：M13.1 F 阶段闭环
- **执行范围**：`apps/platform/server/api/alerts/index.get.ts` + `apps/platform/app/pages/alerts.vue` + entities（如新增聚合视图字段）+ i18n + tests
- **非目标**：不动 `ScanResult` 实体表结构（仅读取 + 聚合）；不改底层数据采集逻辑
- **根因分析**：
  - 当前 `/api/alerts` 返回全量 `ScanResult` 记录，多次扫描产生的相同 CVE-alert 重复展示
  - 用户痛点：相同告警在历史多次扫描中出现 N 次，无法聚合查看影响范围
- **修复方案**：
  - 新增 query 参数 `dedupe=true`（默认 `false` 保后向兼容）
  - 去重维度：fingerprint = sha1(`${repositoryId}|${packageName}|${ruleId}`) 或类似组合
  - 聚合字段：`occurrenceCount`（出现次数）/ `firstSeenAt` / `lastSeenAt` / `affectedRunIds`（数组）
  - 前端 DataTable 列扩展：显示次数 + 最后扫描时间
  - 详情侧栏展开：可查看每次扫描的独立记录（Drawer / Sidebar 嵌套）
- **验收标准**：
  - `dedupe=true` 时按 fingerprint 聚合，相同 CVE+pkg+repo 合并为 1 行
  - `dedupe=false` 时行为等价当前实现（向后兼容）
  - 前端 DataTable 列扩展正确展示聚合字段
- **最小验证矩阵**：
  - `pnpm lint` 0 error / `pnpm typecheck` 0 error
  - vitest 单测：去重逻辑覆盖（同一 fingerprint 多次扫描聚合 / 不同 repo 独立 / dedupe=false 行为等价）
  - playwright e2e：alerts 页面切到去重视图，确认数据正确聚合
  - i18n 双语 keys 新增
- **风险**：中（数据模型扩展 + 前端表格列变化）

### M13.3 Code Scanning 规则化 + CQL（待 M13.2 闭环启动）

#### T1307 C16 Code Scanning 规则分类配置化

- **优先级**：P2
- **依赖**：M13.2 F 阶段闭环
- **执行范围**：`packages/engine/src/fixers/code-scanning/rules.ts`（或类似）+ `packages/core` 数据模型 + `packages/engine/tests` + docs
- **非目标**：不动 rules 自身的判定逻辑
- **交付物**：
  - 规则分类（A/B/C 三级）从常量表升级为可配置（YAML/JSON 加载）
  - 默认配置 = 当前常量表（向后兼容）
  - 新增 `CODE_SCANNING_RULES_CONFIG_PATH` env 覆盖
- **验收标准**：
  - 默认配置加载行为等价当前实现
  - 自定义配置加载生效
  - 非法配置降级到默认 + 警告
- **最小验证矩阵**：
  - `pnpm lint` 0 error / `pnpm typecheck` 0 error
  - vitest 单测：默认配置加载 + 自定义配置加载 + 非法配置降级
- **风险**：中（公共 API 行为兼容）

#### T1308 C21 code-quality-findings 接入

- **优先级**：P2
- **依赖**：M13.2 F 阶段闭环
- **执行范围**：`packages/core` 数据模型（新增 `CodeQualityFinding`）+ `packages/engine` 数据采集 + `packages/cli` 报告输出 + `apps/platform` UI 展示
- **非目标**：不实现 CodeQL 完整语义解析（最小报告接入）
- **交付物**：
  - 新增 `GET /repos/{owner}/{repo}/code-quality/findings` 数据源接入
  - 报告输出新增 `codeQualityFindings` 段
  - 平台 UI alerts 视图（或新 dashboard 段）展示
- **验收标准**：
  - 数据源接入层支持 code-quality-findings API（含认证 / 分页 / 错误处理）
  - 报告输出包含 codeQualityFindings 段
  - 平台 UI 正确展示（mock 数据可演示）
- **最小验证矩阵**：
  - `pnpm lint` 0 error / `pnpm typecheck` 0 error
  - vitest 单测：数据源接入层 + 报告输出格式
  - e2e：平台 UI 展示（mock 数据）
- **风险**：高（跨 3 个 packages + apps + 外部 GitHub API）

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

实施记录：[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留 5 段，最近 3-5 阶段近线） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M12 全部 / M12 已闭环 2026-08-21） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（当前为空，M12 已闭环） |
| 已知边界 / known-issue | 各阶段归档段（如 [todo-archive.md §2026-08-20 e2e 修复批次 / C64-3](todo-archive.md#2026-08-20-e2e-修复批次c62--c63--c64--chore) PrimeVue hydration）或 backlog 顶部"未完成项目（backlog 仍活跃）" |

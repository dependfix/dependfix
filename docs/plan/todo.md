# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M63 平台对外只读观测面**（2026-11-20 规划，5 原子） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M62 已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M62 已归档；M63 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M63 平台对外只读观测面（2026-11-20 规划）

> **目标**：把平台日志变成可直接给 AI 消费的聚合视图，并首次提供带 API key 的只读 `/api/v1` 观测面；
> `@dependfix/mcp` 增加 remote 后端，形成「日志 → API → MCP」闭环。
>
> **来源**：用户 2026-11-19 决策首批范围（必须含日志查询 / 只读面 / MCP 复用）；
> 2026-11-20 用户选方案 A（1a + 1b + 期 2 全量首批）。设计见 [platform-public-api.md](../design/governance/platform-public-api.md)；
> backlog「平台对外只读观测 API + 日志查询 + MCP remote」候选已上收。
>
> **§3.4 三项交叉核验（2026-11-20 实测）**：
> ① 归档扫描 `platform-public-api|api/v1|ApiKey|log-digest|logsDropped` → 仅 M25 命中 AI ApiKey 配置，无公网只读 API 同题；
> ② `git log --oneline -8 -- docs/design/governance/platform-public-api.md docs/standards/api.md` → 设计稿仅两提交，其余为 `api.md` 存量提交，无实现；
> ③ 代码 anchor：`apps/platform/server/api/v1` 不存在、`shared/log-digest.ts` 不存在、`server/services/view` 不存在、
> `MemoryLogger` 截断不计数、沙箱 `maxLines=100` 不计数、`ScanRun` 无 `logsDropped`、`@better-auth/api-key` 未安装。
>
> **容量基线（逐原子交付物求和，规划轮估算）**：commits 20-30 / files 48-61 / 行 2,650-3,750
> （行 = diff 改动量含删除；测量方 = 规划角色，依据设计稿 §8 估算与逐原子拆解）。
> 类型（按主类型计数）：🎨1（M63.1 兼 🛠️）+ 🛠️2（M63.2 / M63.4 兼 📚）+ 🛡️1（M63.3）+ 🚀1（M63.5）；
> **缺口显式标注**：本期为平台能力 / 安全面，M63.1 承担唯一 UX 交付；无独立技术债原子，视图层抽取随 M63.2 附带；🧪 无独立原子，测试随各原子 AC 内嵌。
>
> **执行顺序**：M63.1 → M63.2 → M63.3 → M63.4 → M63.5。
>
> **AC 归属**：1a AC1-AC6 → M63.1；1b AC1 / AC5 / AC7 / AC8 / AC12 在 M63.2 与 M63.4 分段闭环，AC2 / AC3 / AC4 / AC9 / AC10 → M63.3，AC6 / AC11 → M63.4；期 2 AC1-AC5 → M63.5。
>
> **D 阶段决策点**：D1（M63.1）聚合默认档与分组规则；D2（M63.2）视图层边界与 v1 无信封形状；
> D3（M63.3）`@better-auth/api-key` vs 自建；D4（M63.4）schema 快照落点与 `api.md §3` 订正口径；
> D5（M63.5）remote 结果形状与 `discover_repos` 降级。
>
> **前置 / 风险**：`@better-auth/api-key` 与 `better-auth 1.7.22` 兼容性未实测（M63.3 首个 D 动作，失败走自建回退）；
> `api.md §3` 信封漂移；期 3 / 4（触发与交付写）明确不在本期。

### M63.1 日志可消费化与丢弃披露（1a）（P1 🎨🛠️）—— ✅ 已闭环

- **目标**：两处运行详情弹窗提供「聚合」复制 / 下载，聚合文本可直接粘贴给 AI；并由 `droppedBefore` 明确披露采集侧已丢弃的早期条目。
- **优先级**：P1（日志 99% 为重复噪音，实测单次最大 178 KB / 1000 条；属首批首要目标）。
- **范围**：
  - `apps/platform/shared/log-digest.ts`：清洗（ANSI / URL 凭据 / 绝对路径 / 敏感键名）+ 归一化分组 + `error` 不折叠；
  - `server/utils/memory-logger.ts` 与 `server/services/executor/sandbox-diagnostics.ts` 记录丢弃数并透传；
  - `ScanRun.logsDropped`（nullable）+ 迁移（登记进 `createDataSourceOptions().migrations`）+ `/api/runs/{id}` 详情视图；
  - `run-detail-dialog.vue` / `repo-history-dialog.vue` 各增「聚合」档（客户端计算 + Blob 下载）+ i18n；
  - `vitest.config.ts` coverage include 增 `apps/platform/shared/**`；
  - 脱敏 fixture（ANSI / 绝对路径 / URL 内嵌凭据各 ≥1）与单测。
- **验收标准（沿用设计稿 §8 期 1a 标签）**：
  - AC1：最大样本 fixture 的 grouped 序列化 < 10 KB，2 条 error 均在输出且正文可读；
  - AC2：同一 fixture `level=warn` 时 `total=991` / `groupCount=3` / 最大组 `count=989`；
  - AC3：`droppedBefore` 三态（历史 `NULL` / 未丢 `0` / 超限 `>0`），UI 在 `>0` 时提示；
  - AC4：聚合文本可直接粘贴给 AI（含分组摘要、计数、截断提示）；
  - AC5：两处弹窗一致，「原始」档零回归；
  - AC6：存量库迁移后新列为 `NULL`（不伪装为 `0`）。
- **不做什么**：不引入 API key / v1 端点；不改采集侧对重复 warn 的抑制语义；不改原始日志存储格式。
- **依赖**：设计稿 §6.4 / §8 期 1a；既有 `sanitizeString`；迁移 helper（`addColumnIfMissing`）。
- **交付物**：6-8 commits / 14-16 files / 700-900 行（行 = diff 改动量含删除；规划轮估算）；按 6-8 commits 拆分，单 commit ≤ 10 文件（AC1 / AC2 / AC4 → 前段，AC3 / AC6 → 中段，AC5 → 后段）。
- **风险与缓解**：分组误折叠 → `error` 不归一化 + `sample` 保留原文；丢弃数语义混淆 → 三态断言 + UI 文案；两处弹窗漂移 → 同源 composable + e2e；迁移 → 前缀感知 helper + 存量库集成用例。

- **执行记录（2026-11-20，6 commits：`d25eaed3` 共享脱敏与聚合 / `9e6a9c44` 丢弃数列与详情 / `6fd25169` 采集侧计数透传 / `321a6baf` 弹窗聚合档 / `1093ba0d` e2e / 本提交 todo 收口）**：
  - **实现**：`shared/log-digest`（清洗 ANSI / URL 凭据 / 绝对路径 / 敏感键赋值 → 模板归一化 → `(level, template)` 分组；`error` 逐条不折叠；单条含 sample/context 2 KB、error 合计 64 KB、error 组 200、总组数 200 上限均有披露）；`shared/sanitize` 下沉并保留 `#server/utils/sanitize` 导入面；`MemoryLogger` 与沙箱 `buildLogsJson` 统计截断条数；`ScanRun.logsDropped` 迁移（前缀感知 + 幂等 + 存量行 NULL）与详情透传；两处运行详情弹窗新增「聚合 / 原始」档（默认聚合，复制 / 下载同源 composable，原始档零回归）与丢弃提示（CaomeiTag warning）。
  - **AC1 / AC2**：脱敏 fixture（1000 条，含 ANSI / 绝对路径 / URL 凭据）grouped JSON 实测 2.6 KB < 10 KB，2 条 error 均在且正文可读；`level=warn` → `total=991` / `groupCount=3` / 最大组 `count=989`（实现复算与单测双证）。
  - **AC3 / AC6**：三态 `null`（历史行 / github-action）/ `0`（container 未丢）/ `>0`（沙箱或超限）在实体、迁移、编排、详情与 UI 全链路断言；存量库迁移后新列为 NULL；UI 仅在 `>0` 时提示。
  - **AC4 / AC5**：聚合文本含分组摘要、计数、截断与丢弃提示；两处弹窗共用 `use-run-log-digest`，e2e 断言默认聚合、聚合/原始下载文件名与 360px 窄视口；原始档沿用 `logsText` 与服务端附件。
  - **审计**：deep（数据库列 + API 契约 + 客户端清洗）R1 **Reject**（B01 contract-freeze 缺列 / B02 提交切分跨组不可编译；W01 键值凭据 / W02 路径边界 / W03 error 折叠 / W04 组数无上限 / W05 装配无测试 / W06 窄视口溢出 / W07 对比度 / W08 context 未实现）→ 全部收口 → R2 Reject（仅 B02 切分 + W09 context 绕过预算 + S08 注释）→ 按「实体组 / 执行器组」重排提交并补 sample 预算 → R3 quick **Pass**。
  - **证据**：`lint:check` 0 error（4 存量 warning）、`lint:css:check` 通过、`typecheck` 7 项目（commit 2 / 3 边界各复跑 EXIT=0）、platform 全量 214 文件 / 2723 passed / 10 skipped、定向 log-digest 22 / sanitize 39 / 迁移与注册 10 / 详情 API 11 / 编排丢弃三态 3、e2e scans + alerts 21 passed、视觉 2 passed、`check:contract-freeze` OK；变异去掉编排两处赋值 → 2 例失败并已还原。
  - **残余**：① 200 组上限下最坏聚合文本约 427 KB / JSON 约 833 KB（10 KB 为非硬目标，v1 由 pageSize 兜底）；② `/root.`、`/app.js` 因右边界取舍不归一（非误伤）；③ 新日志头部无视觉基线（几何由 360px e2e 覆盖，浅色 tag 对比度 6.11:1，暗色未测）；④ `context` 序列化进 sample 属设计稿 §6.4 的实现口径，M63.4 v1 需保持同源。


### M63.2 共享视图层与 v1 契约骨架（1b-1）（P1 🛠️）

- **目标**：抽出 runs / repos / dashboard / alerts / pr-checks 共享视图层，建立 `/api/v1` 薄封装与字段白名单，先交付 health / repos / runs 五个端点且不复制业务逻辑。
- **优先级**：P1（1b 的基础；不抽视图层就只能复制 handler，违反设计 D4 单一事实源）。
- **范围**：
  - `server/services/view/`：runs / repos / dashboard / alerts / pr-checks 视图映射；
  - `server/api/v1/health.get.ts` / `repos/index.get.ts` / `repos/[id].get.ts` / `runs/index.get.ts` / `runs/[id].get.ts`；
  - `server/schemas/api-v1-fields.ts` 字段清单 + 分页对象（`repos` 集合改 `{items,total,page,pageSize}`）；
  - repos 的 `owner` / `name` 精确查询（v1 新增服务端能力）；字段白名单负向断言；
  - 契约形状测试与内部 handler 零回归用例。
- **验收标准（沿用设计稿 §8 期 1b 标签）**：
  - AC1（子集）：`/health` 免认证且无敏感字段；其余已交付端点无 key 且无会话返回 401；
  - AC5：`logs` / `logsText` / `verifyCommands` / `credentialId` / `credentialName` 不出现在已交付 v1 响应；
  - AC7：`repos` 集合有上限分页，超限不返回全量；
  - AC8：v1 响应无 `Access-Control-Allow-Origin`；
  - AC12（子集）：浏览器路径与内部端点零回归；视图层单测覆盖映射差异。
- **不做什么**：不加 key / scope / 限流（M63.3）；不做 alerts / pr-checks / dashboard / logs（M63.4）；不引入统一信封。
- **依赖**：设计稿 §6.1 / §6.2 / §6.3；现有 `runs-query.ts` 与各 handler 的 `toView`。
- **交付物**：3-5 commits / 8-10 files / 450-650 行。
- **风险与缓解**：视图抽取改变内部响应 → 内部端点快照用例；字段白名单漏项 → 每端点负向断言；`owner` / `name` 查询性能 → 索引与上限。

### M63.3 API key 认证与安全面（1b-2）（P1 🛡️）

- **目标**：为 v1 提供独立 API key（Bearer）、scope、限流、访问日志与 key 管理，并完成 `dfk_` 脱敏；不以会话 Cookie 或 `bearer` 插件替代。
- **优先级**：P1（只读面的准入与审计基础；key 泄露 / 情报外泄的主要风险面）。
- **范围**：
  - `@better-auth/api-key` 与 `better-auth 1.7.22` 兼容性实测（首个 D 动作；不兼容走自建实体 + 哈希）；
  - `ApiKey` 实体 / 迁移（前缀、哈希、TTL、吊销、每组织 10 把）+ `ApiRequestLog` 实体 / 迁移；
  - `server/utils/api-key-guard.ts`（`Authorization: Bearer` → 校验 → 注入 `{ user, organizationId, scopes }`）；
  - scope（本期仅 `read`）、限流（常规 600/5min、日志 60/5min）、`Retry-After`；
  - `/api/v1/keys` GET / POST / DELETE（会话 + admin / org_admin）；
  - `sanitizeString` 增 `dfk_` 规则与测试。
- **验收标准（沿用设计稿 §8 期 1b 标签）**：
  - AC1：无 key 且无会话 401；`read` key 可访问；有会话无 key 按会话授权且不注入 scopes；
  - AC2：缺 `read` 的 key 调只读端点 → 403 且写访问日志；
  - AC3：跨组织返回 403 `RESOURCE_NOT_IN_ORG`；
  - AC4：两档限流生效，超限 429 + `Retry-After`；
  - AC9：`dfk_` 进入脱敏规则并有测试；
  - AC10：创建返回一次性明文、列表只出前缀、吊销立即失效、10 把上限、90 天 TTL、创建接口限流。
- **不做什么**：不发放 `trigger` / `delivery` scope；不做全量 CRUD；不对浏览器开放 CORS。
- **依赖**：M63.2 的 v1 骨架；设计稿 §5 / §9；`better-auth` 1.7.22。
- **交付物**：4-6 commits / 10-13 files / 550-750 行。
- **风险与缓解**：插件不兼容 → 自建回退（实体 + SHA-256 + 常量时间比较）；key 泄露 → 高熵 + 哈希 + `dfk_` 脱敏 + TTL；多实例限流 → 进程内 `lru-cache`，多实例切 Redis（边界登记）。

### M63.4 其余 v1 端点与契约守卫（1b-3）（P1 🛠️📚）

- **目标**：补齐 alerts / pr-checks / dashboard / logs 双视图共 4 个端点，并以字段清单 + 发布物快照双层守卫锁定 v1 契约。
- **优先级**：P1（首批 9 端点完整性与「未公告不得删除」的可验证性）。
- **范围**：
  - `server/api/v1/alerts/index.get.ts` / `pr-checks/index.get.ts` / `dashboard/stats.get.ts`；
  - `server/api/v1/runs/[id]/logs.get.ts`（`view=grouped` 默认 / `raw` 分页，复用 `shared/log-digest`）；
  - `docs/guide/api-v1.md`（端点、字段、分页、错误 `data.code`、schema 快照）；
  - `docs/standards/api.md §3` 订正或显式标注为历史声明；
  - 契约快照与上一 tag 比对脚本 / 测试。
- **验收标准（沿用设计稿 §8 期 1b 标签）**：
  - AC1：9 端点全部可用；`/health` 保持免认证；
  - AC5：字段白名单在全部端点生效（逐字段负向断言）；
  - AC6：字段清单不一致即失败；发布物快照与上一 tag 比对失败即阻断；
  - AC7：alerts / repos / pr-checks 均有上限分页；
  - AC8：v1 无 ACAO；AC11：grouped 与 Web UI 聚合同源（同一 `digestLogEntries`）；
  - AC12：浏览器路径零回归 + 安全面深度审计 Pass。
- **不做什么**：不把 `runs/logs-export` 纳入 v1；不做触发 / 批量 / 调度 / 交付写；不镜像全部内部路由。
- **依赖**：M63.1（digest）、M63.2（视图层 / 骨架）、M63.3（key / 限流）；设计稿 §6 / §8 期 1b。
- **交付物**：3-5 commits / 8-10 files / 450-650 行。
- **风险与缓解**：契约快照跨 tag 取不到 → 落 `docs/guide/api-v1.md`；`api.md` 漂移 → 同批订正；日志端点体积 / 性能 → 2 KB 单条上限 + 64 KB error 上限 + 分页。

### M63.5 MCP remote 后端（期 2）（P1 🚀）

- **目标**：`@dependfix/mcp` 支持 `local|remote|auto`，4 个只读工具走平台 v1，新增 `get_run_logs`，`discover_repos` 降级为已纳管仓库列表。
- **优先级**：P1（把日志与平台状态真正送进 AI 助手；设计首批范围）。
- **范围**：
  - `packages/mcp/src` 后端选择（`DEPENDFIX_PLATFORM_URL` / `_API_KEY` / `DEPENDFIX_MCP_BACKEND`）；
  - `fetch_alerts` / `history` / `get_last_report` / `get_run_logs` remote 实现；
  - `discover_repos` 降级并标注 `source: platform`；
  - 401 / 403 / 404 / 429 / 5xx 错误映射；
  - README zh/en 与 skill 描述；`mcp-server.md` 工具清单与 governance index（zh/en）tool 数同步 8 → 9；
  - M63.5 收口时设计稿状态 🔶 → ✅ 只读面已实施（期 3 / 4 后置）；remote mock HTTP 测试与 local 零回归。
- **验收标准（沿用设计稿 §8 期 2 标签）**：
  - AC1：无配置时除新增 `get_run_logs`（local 返回明确提示）外，既有 8 个 tool 行为与当前完全一致；注册总数 8 → 9；
  - AC2：配置齐备时 4 个工具走 remote，结果形状与 local 一致；
  - AC3：401 / 429 / 5xx 文案明确且不静默降级；
  - AC4：两个后端各有单测，remote 用 mock HTTP；
  - AC5：`discover_repos` 降级结果显式标注 `source`。
- **不做什么**：不远程化 `run_scan` / `cleanup_branches` / `fix_dependency` / `pnpm_audit`；不做内嵌 `/mcp`；不做写操作。
- **依赖**：M63.3（key）与 M63.4（9 端点）；设计稿 §7 / §8 期 2。
- **交付物**：4-6 commits / 8-12 files / 500-800 行。
- **风险与缓解**：后端切换口径混淆 → 工具 description 标注 `[remote]` + local 零回归；key 处理 → 只读 env、不落日志；错误映射 → 按 `data.code` 单测；插件工具不兼容 → remote 失败不静默降级。

## 上一阶段

M62（运行日志复盘与执行成本收口）已于 2026-11-19 归档：见[执行记录](archive/todo-archive-phases-m62.md) / [路线图](archive/roadmap-phases-m62.md)。更早阶段（M0-M61）见 [todo-archive.md](todo-archive.md)。

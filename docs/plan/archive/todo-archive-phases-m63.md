# M63 平台对外只读观测面（归档）

> **阶段**：M63（2026-11-20 规划；2026-11-20 归档）。
> **归档**：2026-11-20（阶段归档批次；正文保真迁出自 [todo.md](../todo.md)）。
> **闭环**：M63.1 日志可消费化与丢弃披露 / M63.2 共享视图层与 v1 契约骨架 / M63.3 API key 认证与安全面 / M63.4 其余 v1 端点与契约守卫 / M63.5 MCP remote 后端；5 原子全部闭环。
> **残余**：各原子残余见正文；跨原子残余（真实平台联调 / 跨库验证 / MCP 探测占位等）已登记 [backlog.md](../backlog.md)。

---

## 当前阶段：M63 平台对外只读观测面（2026-11-20 规划）

> **目标**：把平台日志变成可直接给 AI 消费的聚合视图，并首次提供带 API key 的只读 `/api/v1` 观测面；
> `@dependfix/mcp` 增加 remote 后端，形成「日志 → API → MCP」闭环。
>
> **来源**：用户 2026-11-19 决策首批范围（必须含日志查询 / 只读面 / MCP 复用）；
> 2026-11-20 用户选方案 A（1a + 1b + 期 2 全量首批）。设计见 [platform-public-api.md](../../design/governance/platform-public-api.md)；
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


### M63.2 共享视图层与 v1 契约骨架（1b-1）（P1 🛠️）—— ✅ 已闭环

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

- **执行记录（2026-11-20，6 commits：`a274f03f` 路径归一下沉 / `acbeb3c3` 运行与仓库视图层 / `8a51f2f0` 告警仪表板健康视图 / `472eaa0f` v1 五端点 / `9d7d0421` 契约与鉴权测试 / 本提交 todo 收口）**：
  - **实现**：`server/services/view/{runs,repos,alerts,dashboard,health}` 承接内部与 v1 共用映射；内部 runs / repos / alerts / dashboard / health 改为调用视图层（字段集合与重构前逐端点相等，`credentialName` / `logsDropped` 等语义不变）；pr-checks 复用既有 `utils/pr-check-view`（已是列表/详情单一事实源），未重复搬迁。`server/schemas/api-v1-fields.ts` 声明字段白名单、`API_V1_FORBIDDEN_FIELDS`、集合分页（默认 100 / 最大 500）与 `toPage`。v1 交付 health / repos / repos:id / runs / runs:id 五端点：health 免认证；其余会话鉴权 + 组织隔离；repos 新增 owner/name 精确查询（AND，命中 owner+name+platform 唯一索引前缀）；runs 复用 `runs-query` 筛选/排序/分页（上限 200）；runs 详情剔除日志与采集侧计数，自由文本经脱敏 + 绝对路径归一，summary 深度清洗并防原型键。错误码 `API_V1_VALIDATION_FAILED` 双语登记。
  - **AC1（子集）/ AC8**：e2e 验证 health 免认证、repos/runs 及两个详情路径无会话 401 `UNAUTHORIZED`；health / 200 / 401 响应均无 `Access-Control-Allow-Origin`。key / scope / 限流按设计留给 M63.3，未引入半成品。
  - **AC5 / AC7**：契约单测逐端点比对 `API_V1_FIELDS` 并递归扫描 5 个禁用字段（嵌套命中 0）；`pageSize=9999` 钳制为 repos 500 / runs 200，`total` 与 DB 直查一致，page1/page2 主键互斥；owner+name 精确过滤不退化全量。
  - **AC12（子集）**：内部端点字段集合与重构前逐端点相等；runs / repos / alerts / dashboard 定向 191 passed，浏览器路径 e2e（api-v1 + repos-crud + dashboard + scans + alerts-sidebar）42 passed。
  - **审计**：deep R1 **Pass**（0 blocker；W01 详情鉴权/组织守卫无断言 / W02 skip 未锁 / W03 错误码穷举与 union 需同 commit；S01 文本清洗边界 / S02 原型键 / S03 health 重复 / S04 多余 join / S05 组织 backfill）→ 修复 W01-W03 + S02-S04 → R2 quick **Pass**（0 新增问题；剩余 repos 详情组织守卫用例与 `hasCredential=true` fixture 建议由 M63.3 补齐）。
  - **证据**：`lint:check` 0 error（root 6 warning / platform 8 warning 均在预算内）、`lint:css:check` 通过、`typecheck` 7 项目（5 个提交边界复跑 EXIT=0）、platform 全量 215 文件 / 2731 passed / 10 skipped、e2e 42 passed、api-v1 e2e 4 passed（重建产物后复跑）、platform build 通过、`check:contract-freeze` OK。
  - **残余**：① v1 暂只有会话鉴权，API key / scope / 限流 / 访问日志与 `runs/{id}/logs` 在 M63.3 / M63.4；② repos 详情跨组织守卫与 `hasCredential=true` 尚无固化用例（建议随 M63.3 AC3 补）；③ `tags` / `actionWorkflowFile` / `manifestPath` 未统一过自由文本清洗（设计仅点名 error / summary，边界保留）；④ 每次 v1 读请求仍会触发默认组织 backfill 的幂等 UPDATE，读面放大后再评估缓存。


### M63.3 API key 认证与安全面（1b-2）（P1 🛡️）—— ✅ 已闭环

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

- **执行记录（2026-11-20，6 commits：`48cb7ca8` 数据表 / `d0e6b904` v1 鉴权接入 / `4d6337cf` key 管理 / `1194030b` dfk_ 脱敏 / `a8f22d87` e2e / 本提交文档收口）**：
  - **D3 实测结论**：`@better-auth/api-key@1.7.22` 与 `better-auth 1.7.22` 版本对齐，但 organization 归属模式运行时强制 better-auth organization 插件（`ORGANIZATION_PLUGIN_REQUIRED`），与平台自有 `Organization` 实体冲突 → 按设计预置回退改为自建 key 存储，插件依赖已移除；结论写入设计稿 §5.1 / §9。
  - **实现**：`ApiKey`（`apikey` 表，组织归属，`dfk_` + 36 字节 base64url 明文，库内 SHA-256 唯一索引，metadata.scopes，enabled / expiresAt / requestCount / lastRequest）与 `ApiRequestLog`（鉴权结论，按 key / 组织 + 时间索引，30 天保留且每小时最多清理一次）；迁移前缀感知 + 幂等 + down。`api-key-guard`：Bearer → 摘要查库 → 常量时间比较 → 过期 / 禁用 / 吊销 401 → scope 缺失 403 + 日志 → 两档限流（常规 600/5min、日志 60/5min，429 + `Retry-After`）→ 使用计数与访问日志；无 key 回退会话且不注入 scopes。v1 数据端点全部接入，详情跨组织 403 `RESOURCE_NOT_IN_ORG`，集合按组织过滤。/api/v1/keys GET/POST/DELETE：会话 + admin/org_admin、每组织 10 把、90 天 TTL、一次性明文、列表只出前缀、创建限流 + 访问日志、跨组织吊销按 404。`dfk_` 进入 `sanitizeString`（兼容 base64url `-`/`_`）。
  - **AC1-AC4**：无 key 且无会话 401；read key 可访问、无 Cookie Bearer 可读；会话访问按会话授权且不注入 scopes；缺 read 403 + 写日志；跨组织详情 403、集合不泄露；两档限流分别有定向用例，429 + `Retry-After`。
  - **AC9 / AC10**：`dfk_` 脱敏用真实生成 key 断言完整遮蔽；创建返回一次性明文、库内存摘要、90 天 TTL、10 把上限、吊销立即失效、创建接口限流与访问日志均有单测 / e2e。
  - **审计**：deep R1 **Reject**（B01 dfk_ 规则被 `-` 截断 / B02 契约冻结缺两表 / B03 lockfile 夹带无关升级；W01-W10）→ 全部收口（含过期 / 禁用、创建限流、真实跨组织、访问日志、30 天保留、时间列 `getDateType`、使用计数、设计稿回填）→ R2 quick **Pass**（新增 3 条非阻断 suggest 已修 / 登记）。
  - **证据**：platform 全量 218 文件 / 2751 passed / 10 skipped；定向 key 守卫 + 管理 + 迁移 + 脱敏 41 passed；e2e api-keys + api-v1 7 passed（重建产物后）；`typecheck` 7 项目、`lint:check` 0 error（root 6 / platform 6 warning）、`lint:css:check`、`check:contract-freeze`、`pnpm install --frozen-lockfile` 全通过。
  - **残余**：① 限流为进程内 LRU，多实例部署需切 Redis；② 过期 / 禁用 / 无效 key 的 401 不写访问日志（无组织可归属）；③ 跨组织 403 未单独入审计（拒绝结果仍由端点返回）；④ 吊销为硬删除（访问日志保留，设计稿已写明）；⑤ MySQL / PostgreSQL 未起真库，时间列与唯一索引为静态核对；⑥ 过期 key 行不做后台清理（列表仍可见，可手工吊销）。


### M63.4 其余 v1 端点与契约守卫（1b-3）（P1 🛠️📚）—— ✅ 已闭环

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

- **执行记录（2026-11-20，6 commits：`b00bd3f0` 日志查询/原始视图 / `6071f13f` 告警与 PR Check 共享筛选 + 仪表板组织隔离 / `a109e779` 四个 v1 端点 / `be161cd3` 契约与 e2e / `c1dcd2e6` 文档与快照门禁 / 本提交 todo 收口）**：
  - **实现**：alerts / pr-checks 筛选与排序抽到视图层（内部与 v1 共用），dashboard 统计四个子查询全部按组织隔离。新增 `/api/v1/alerts`、`/api/v1/pr-checks`、`/api/v1/dashboard/stats`、`/api/v1/runs/{id}/logs`：集合均上限分页（默认 100 / 最大 500），日志 `view=grouped`（默认）/ `raw`、`level` 多选、`q` 子串、`pageSize` 默认 50 / 最大 200，`level` 非法 400；`pages` 可翻到全部组（`groupCount` 全量、单页上限 200）。日志与 Web UI 共用 `shared/log-digest`，`droppedBefore` / `errorTruncated` 同源，响应 `no-store`。自由文本（summary / errorMessage / signals / failureSources / detailsUrl / note / logs）统一脱敏 + 绝对路径归一。字段白名单补齐 6 组。
  - **AC1 / AC5 / AC7 / AC8 / AC11 / AC12**：10 个数据端点全部可用且无 ACAO；health 免认证、其余 key / 会话、跨组织 403；白名单递归断言（含 groups / entries / results）且 5 个禁用字段 0 命中；alerts / repos / pr-checks 500、runs 200、logs 50/200 上限与 total 正确；logs grouped 与 Web UI 同源；内部 alerts / pr-checks 改共享筛选后字段与 take(500) 等价（定向 92 passed）。
  - **AC6**：`docs/guide/api-v1.md` 快照与 `API_V1_FIELDS` 由单测强制一致；`check:api-v1-contract` 与上一 tag 比对字段 / 字段组删除与分页下调（Test job 检出改完整历史；无 tag 显式 skipped）；`api.md §3` 标注历史声明。
  - **审计**：deep R1 **Reject**（B01 dashboard 未做组织隔离，跨组织仓库 / 告警 / latestRun 外泄；W01 level 非法静默放行 / W02 组分页不可达 / W03 signals 未清洗 / W04 分页键删除漏检 / W05 CI 门禁恒 skip）→ 全部收口 → R2 quick **Pass**（新增 W06 detailsUrl 未清洗与 S09-S13，已修 / 收敛）。
  - **证据**：platform 全量 219 文件 / 2758 passed / 10 skipped；定向 92 passed；脚本用例 25 passed；e2e api-v1 + api-keys 8 passed（重建产物）；`gates:docs` 22 项（含 check:api-v1-contract）；`lint:check` 0 error、`typecheck` 7 项目、platform build 通过。
  - **残余**：① 契约 tag 比对在无历史 tag 时显式 skipped（发布前应保证完整 tag）；② 快照只比对字段集合与分页上限，类型由 TS / 契约测试约束；③ dashboard 每次全量聚合（读面放大后评估缓存）；④ MySQL / PostgreSQL 未起真库验证新 join；⑤ `acknowledgedByUserId` / `upstreamId` 是否收敛到 v1 字段清单留待后续评估。


### M63.5 MCP remote 后端（期 2）（P1 🚀）—— ✅ 已闭环

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

- **执行记录（2026-11-20，6 commits：`1d74847b` remote 后端骨架 / `541d4acd` 四工具接入 / `0be9c9fd` MCP 文档 / `df3aeaa3` 治理与环境契约 / `8d56b119` 仪表板导入清理 / 本提交 todo 收口）**：
  - **实现**：`platform.ts` 提供 local / remote / auto 选择（显式 local 优先；auto 需平台 URL + key）、Bearer 请求、10s 超时、结构化错误与“不静默降级”映射。`fetch_alerts` / `history` / `get_last_report` / `discover_repos` 增加 remote 分支（local 零改动），新增 `get_run_logs`（仅 remote，local 明确提示），注册 8 → 9 且 remote 工具 description 标 `[remote]`。remote 告警按 owner/name 精确解析仓库、分页拉取、source 与严重级别阈值过滤（静态分析 `unknown` 恒透传，与 core `filterAlerts` 同源）；history 映射平台 runs；get_last_report 标 `source: platform`；discover_repos 降级为已纳管仓库（`degraded: true` / `probed: false`，应用 max_repos）。
  - **AC1 / AC2**：无配置 / 显式 local 时既有 8 工具走原路径（测试环境钉 local，宿主平台 env 不再污染）；配置齐备时 4 个工具走 remote，集合形状与 local 对齐（`fetch_alerts.id` 放宽为 `number | string`）；写工具与 `pnpm_audit` 仍 local。
  - **AC3 / AC4**：401 / 403 / 404 / 429（含 Retry-After）/ 5xx / 超时 / 网络 / 非 JSON 均有明确文案且不降级；remote mock HTTP 覆盖分页、过滤、错误、超时、显式 local。
  - **AC5**：`discover_repos` 结果标 `source: platform` / `degraded: true` / `probed: false`，描述在 remote 下说明忽略 topics / include / exclude / probe。
  - **审计**：deep R1 **Reject**（B01 remote 告警过滤丢弃 code-scanning unknown；W01 宿主 env 污染 local 测试 / W02 无超时 / W03 文案边界 / W04 分页静默截断 / W05 discover 伪探测 / W06 文档工具数不一致 / W07 测试缺口 / W08 跨批 platform 改动）→ 全部收口（dashboard 清理独立提交）→ R2 quick **Pass**。
  - **证据**：mcp 10 文件 / 64 passed（含 W01 泄漏复测 63→64）；`typecheck` 7 项目；`lint:check` 0 error（root / platform 各 5 warning）；`gates:docs` 22 项；`check:contract-freeze` OK（4 个 remote env）；mcp build 通过。
  - **残余**：① remote 与平台真实联调（key scope / 组织隔离 / 真实 429）未在 CI 执行；② `discover_repos` 仍返回占位 `topics: []` / `hasDependabotConfig: false`（已用 `probed: false` 标注，未做完整探测）；③ remote 过滤谓词与 core 为判据复制而非共享导出；④ 超时 env 直接读 process.env，单测未注入。

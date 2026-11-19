# 平台对外 API 与远程 MCP 设计（apps/platform）

> **状态**：🔶 设计先行稿（backlog 候选，2026-11-19 立项；首批范围已决策，等待排期上收）
> **范围**：`apps/platform` 只读观测接口 + `@dependfix/mcp` remote 后端
> **关联**：[API 规范](../../standards/api.md)、[安全规范](../../standards/security.md)、[MCP Server 设计](./mcp-server.md)、[平台架构](./architecture-platform.md)、[平台认证与用户体系](./platform-auth-users.md)

## 1. 背景与结论

平台功能已显著多于 CLI 与本地 MCP：托管凭据、容器 / 沙箱执行、BullMQ 队列、批量批、定时调度、PR 生命周期跟踪、通知与审计，全部只在 Web UI 后可用。因此提出「平台是否应对外提供 API 或 MCP」。

分析结论分两层，**不能合并回答**：

| 问题 | 性质 | 结论 |
|:--|:--|:--|
| 是否对外提供 API | **能力边界**：暴露什么、谁能用、契约稳不稳 | 提供，但首批**只开只读观测面** |
| 是否对外提供 MCP | **接入形态**：AI 助手怎么用上这些能力 | 提供，但**复用 `@dependfix/mcp`**，不新建包 |

核心依据：平台的增量能力几乎全部落在「写」侧（触发、调度、批量、交付、通知），而写侧同时是**风险最高**（凭据托管 + 可推送代码）、**契约最不稳定**（内部路由随 UX 演进）与**语义最容易漂移**（与 CLI 执行链双实现）的部分。只读面不触碰这三类风险，却能覆盖外部看板、CI 巡检与 AI 只读问答三类真实需求。

**追加动机（2026-11-19 用户决策）**：首批必须包含「查询日志」能力。当前把日志交给 AI 的链路是「Web UI 复制 / 下载 → 手动粘贴」，而复制出来的 `logsText` 是 1000 条原始条目（实测最大一次 178 KB / 1000 条，其中 991 条 warn 里有 989 条是同一条重复消息），噪音淹没信号。因此日志不是 9 个端点里的顺带一项，而是**期 1 的首要目标**，并把「不依赖 API key 的聚合视图」拆出来先行交付。

## 2. 现状盘点（2026-11-19 实测）

| 维度 | 现状 | 证据 |
|:--|:--|:--|
| 路由规模 | 46 个路由文件：GET 24 / POST 10 / PATCH 4 / DELETE 1 / 方法无关 7 | `apps/platform/server/api` 实测计数 |
| 认证 | 仅 better-auth 会话 Cookie；无 Bearer / API key / 签名 | `server/utils/guard.ts` 只有 `requireAuth` / `requireRole` / `requireAdmin` / `requireOrgResource`，均走 `auth.api.getSession`；`docs/standards/api.md §5` |
| 响应形状 | **无统一信封**：handler 直接返回资源对象、数组或分页对象 | `runs/index.get.ts` 返回 `{ items, total, page, pageSize }`；`repos/index.ts` 的 GET 返回**裸数组**（无分页）；`dashboard/stats.get.ts` / `health.get.ts` 返回裸对象 |
| 规范漂移 | `api.md §3` 声明的 `ApiResponse<T>`（`code` / `message` / `data`）与实现不一致 | 同上；处置见 §9 |
| 错误形状 | 线上由 Nitro 默认错误处理器序列化：`{ error, url, statusCode, statusMessage, message, data }`（dev 追加 `stack`；`unhandled` / `fatal` 时 `message` 降级为 `Server Error`）。`code` 的稳定位置是 `data.code`，`message` 是本地化文案 | `.output/server/chunks/nitro/nitro.mjs` 的 error default handler；`tests/e2e/api-i18n.e2e.test.ts` 已断言 `body.message` + `body.data.code` |
| 服务层可复用性 | 筛选 / 排序 / 分页已抽为共享片段；**视图映射仍内联在 handler** | `server/utils/runs-query.ts`（`applyRunsWhere` / `applyRunsOrder` / `runsPaginationShape`，`RUNS_PAGE_SIZE_MAX = 200`）；`runs/index.get.ts` / `runs/[id].get.ts` / `dashboard/stats.get.ts` 各自内联 `toView` |
| 日志端点 | `runs/[id]/logs.get.ts` 是 **`text/plain` 附件流**（`Content-Disposition: attachment`），非 JSON | 同文件 `setHeader` 两处 |
| 日志采集上限 | `MemoryLogger` 上限 1000 条，超出**丢弃最旧**且**不记录丢弃数**；沙箱执行器另有一条独立上限（每流 100 行，同样不计数） | `server/utils/memory-logger.ts` 的 `splice`；`container-executor.ts` 硬编码 `maxEntries: 1000`；`services/executor/sandbox-diagnostics.ts` 的 `maxLines = 100` |
| 日志体量（实测） | 最大 `logs_json` 177,650 字符（UTF-8 177,670 字节）/ 1000 条：`warn` 991（其中 **989 条同一句** `[baseline] outbound blocked by allowlist`，另 2 条不同）、`info` 7、`error` 2 | `apps/platform/data/dependfix.sqlite` 只读统计（136 run：均值 9,007 字符，47 个无日志） |
| 日志消费面 | Web UI 已有「复制」与「下载」，但**均为原始全文**；本地 MCP 的 `RunResult` **不含日志**，离线取不到 | `run-detail-dialog.vue` 的 `copyLogs` / `downloadLogs`；`packages/core/src/report/types.ts` 的 `RunResult` |
| 执行链 | 平台 `fix-and-pr` 与引擎 `executeFixAndPrMode` 是**两份实现**（注释自述「逻辑等价」） | `server/services/executor/platform-delivery.ts` 文件头 |
| 队列 | BullMQ + Redis，缺失时同步降级 | `server/services/queue/*`、`bullmq ^6.7.5` |
| 本地 MCP | 8 个 tool，stdio；直调 `@dependfix/core` + `@dependfix/engine`（**不经 CLI**）；`fetch_alerts` / `run_scan` / `cleanup_branches` 会经 GitHub API 或 `git clone` 出网 | `packages/mcp/package.json` 依赖 + `src/index.ts` 注册 |
| 认证插件可用性 | `better-auth/plugins` **不含** `apiKey`；只有 `bearer`（把 token 转成 session Cookie） | `node_modules/better-auth/dist/plugins/` 实测 |

## 3. 关键决策

| 编号 | 决策 | 理由 |
|:--|:--|:--|
| D1 | 首批只开**只读观测**端点 | 绕过写侧三类风险；大部分查询逻辑已在服务层，边际成本最低 |
| D2 | MCP **不新建包**，`@dependfix/mcp` 增加 remote 后端 | 8 个 tool 中多个平台已有对应数据源；新包会让分发、文档、skill 三处翻倍 |
| D3 | 独立 API key，不复用会话 Cookie / `bearer` | key 需要命名、scope、独立吊销与审计；`bearer` 的 token 语义是会话，有效期随会话且不可分级 |
| D4 | 公开契约走 `/api/v1` **子集**，不镜像内部路由 | 内部路由是 UI 实现细节，随 UX 改动（`GET /api/runs` 已加过 `sortBy` / `from` / `to`） |
| D5 | 写能力（触发 → 交付）分两期后置 | 前置条件是执行链语义收口，见 §8 |
| D6 | 日志先做**聚合视图**，且聚合视图**不依赖 API key**（沿用会话 Cookie） | 约 99% 是重复噪音，可消费性才是主因；1a 让「手动取出的日志可用」，1b + 期 2 才消除「手动」这一步——两者分工写进 §8 |

## 4. 范围

**本期范围内**：

- **日志可消费化（首要目标）**：共享聚合函数 `digestLogEntries`（噪音折叠 + `error` 条目保留）+ Web UI「复制聚合日志」+ 截断丢弃数披露（期 1a，不依赖 API key）
- 9 个只读端点（§6，含 `runs/{id}/logs` 的 grouped / raw 双视图）+ key 管理接口 `/api/v1/keys`（会话 + admin / org_admin，见 §5.7）
- `@dependfix/mcp` remote 后端（4 个工具走 remote + 1 个降级），新增 `get_run_logs`
- key 的 scope 模型、限流、访问日志、吊销

**明确不做**：

- 全量 CRUD 镜像（不导出 46 个路由）
- 触发 / 重试 / 批量 / 调度触发（期 3）
- 交付写操作：创建 PR、关闭 PR、推送分支（期 4）
- 平台内嵌 MCP server endpoint（`/mcp`）；本期只做客户端侧 remote 后端
- `fix_dependency` / `pnpm_audit` 的远端形态（依赖本地 `workDir`，平台无对应语义）
- 修改 `api.md §3` 信封口径（见 §9，二期候选）

## 5. 认证与权限模型

### 5.1 Key 方案

优先使用官方插件 `@better-auth/api-key`（独立包，`apiKey()` + `auth.api.createApiKey` / `verifyApiKey`，支持 `permissions` 与 `rateLimit`）。**该包当前未安装**；npm 侧最新为 1.7.26，项目 `better-auth` 为 1.7.22——D 阶段首个动作是**小版本对齐验证**（同 major.minor 预期兼容，但必须实测），不兼容时回退自建：

- 实体 `ApiKey`：`id` / `name` / `prefix` / `hashedKey` / `userId` / `organizationId` / `scopes` / `expiresAt` / `lastUsedAt` / `revokedAt`
- 生成：高熵随机（≥32 字节），明文仅创建时返回一次；库中存 **SHA-256 哈希** + 可检索前缀（如 `dfk_` + 8 字符）
- 比较：常量时间比较，不做前缀匹配查询 + 全量比对
- **脱敏联动**：`apps/platform/server/utils/sanitize.ts` 已覆盖 URL 内嵌凭据、`Authorization` 各 scheme（basic / token / bearer）、`gh[pousr]_` / `github_pat_`、PEM 私钥与敏感键名；**`dfk_` 明文前缀不在现有规则内**，必须同批加入 `sanitizeString` 与日志过滤测试，否则运行日志会漏 key
官方插件默认读取 `x-api-key` 头；本期对外统一用 `Authorization: Bearer`，需在守卫内自写一层桥接（取 Bearer 后转交插件校验）。桥接后插件内置限流与 `lastUsedAt` 是否仍生效，与兼容性验证同批实测。
- 守卫顺序：`Authorization: Bearer <key>` → 校验 → 注入 `{ user, organizationId, scopes }`；无 key 时降级到现有会话（浏览器路径不受影响）

### 5.2 Scope

| scope | 本期 | 覆盖端点 |
|:--|:--:|:--|
| `read` | ✅ 发放 | §6 全部只读端点 |
| `trigger` | ❌ 期 3 | 扫描 / 批量 / 调度触发 |
| `delivery` | ❌ 期 4 | PR 创建与关闭 |

一个 key 可持多个 scope，本期只发放 `read`；scope 未命中返回 403 并记访问日志。

### 5.3 组织隔离

key 绑定 `organizationId`，所有查询强制注入（复用 `resolveOrganizationId` / `requireOrgResource` 口径）。**不接受** key 通过 query 参数指定组织。跨组织资源按现有守卫返回 **403 `RESOURCE_NOT_IN_ORG`**（`guard.ts` 现状）；本期**不承诺** 404 不泄露存在性——如需该语义要先改守卫，属独立决策。

### 5.4 限流与访问日志

- 限流：按 key 计数。主档位走插件 `rateLimit`（配置项，非默认值）——**600 次 / 5 分钟**；插件无 per-path 能力，**日志端点 60 次 / 5 分钟的单独档位由 v1 薄封装层的独立计数器实现**（进程内 `lru-cache`，多实例部署时换 Redis）。超限 429 + `Retry-After`
- 访问日志：**新建独立表 `ApiRequestLog`**（`apiKeyId` / `endpoint` / `statusCode` / `durationMs` / `createdAt`，保留 30 天）。**不复用 `audit-events`**——该表的 `AuditEventType` 是固定业务事件枚举，语义明确排除「单次请求」，按 600 次/5 分钟写入会污染环境健康信号
- 日志内容：**不记录** key 明文、请求体、响应正文
- fail-closed：key 校验异常、数据库不可用一律 401 / 503，不降级为「无认证放行」

### 5.5 残余风险

只读不等于零风险：`read` 能读到全部仓库的告警清单与扫描结论，属**供应链情报**。缓解：字段白名单（§6.2）、体积上限（§6.2）、短 TTL（默认 90 天）、key 数量上限（默认每组织 10 个）、可随时吊销、访问日志留痕。

### 5.6 CORS

对外 API 全篇**默认不对浏览器 origin 开放**：v1 响应不设 `Access-Control-Allow-Origin`，推荐服务端到服务端调用；**key 禁止下发到前端**。若后续确需浏览器直连，必须走显式 origin 白名单（安全规范禁止 `ACAO: *`），且不得与 Cookie 会话共用同一路径的 CORS 策略。

### 5.7 Key 管理接口

`/api/v1/keys` 提供 `GET`（列表，仅前缀与元数据）/ `POST`（创建，明文 key 只返回一次）/ `DELETE /api/v1/keys/{id}`（吊销）。认证走**会话 + admin / org_admin**，**不受 `read` scope 约束**——否则第一把 key 无法创建。创建接口需限流（防批量刷 key）并写访问日志。

## 6. v1 只读契约

### 6.1 端点清单

| v1 端点 | 现有实现（复用程度） | 说明 |
|:--|:--|:--|
| `GET /api/v1/health` | `health.get.ts`（直接复用） | 版本 / commit / `schema` 状态；**保持免认证**（不含敏感字段） |
| `GET /api/v1/repos` | `repos/index.ts` GET（需抽视图层） | v1 返回 `{ items, total, page, pageSize }`（内部端点仍是裸数组，视觉门禁依赖全量，二者互不影响）；`owner` / `name` 精确过滤为 **v1 新增服务端查询能力**（内部端点无过滤参数） |
| `GET /api/v1/repos/{id}` | `repos/[id].ts`（需抽视图层） | 单仓库详情，字段裁剪 |
| `GET /api/v1/runs` | `runs/index.get.ts`（需抽视图层） | 复用 `runsFilterShape` / `runsPaginationShape` / `runsSortShape`（`from` / `to` 属 filter shape；`ids` 是 handler 内联字段，单独保留） |
| `GET /api/v1/runs/{id}` | `runs/[id].get.ts`（需抽视图层） | 运行详情；**剔除 `logs` / `logsText`** |
| `GET /api/v1/runs/{id}/logs` | `runs/[id]/logs.get.ts` 的 `parseLogEntries` | 契约见 §6.4（`view=grouped` 默认 / `raw` 分页）；`runs/logs-export` 仍不进 v1（跨 run 全量导出语义不同） |
| `GET /api/v1/alerts` | `alerts/index.get.ts`（需抽视图层） | 告警列表；`repositoryId`（`fetch_alerts` 的 repo 过滤依赖它）/ `groupBy` / 严重级别 / 来源筛选 |
| `GET /api/v1/pr-checks` | `pr-checks/index.get.ts`（需抽视图层） | PR 检查列表；`conclusion` / 状态筛选 |
| `GET /api/v1/dashboard/stats` | `dashboard/stats.get.ts`（需抽视图层） | 汇总指标 |

> 「需抽视图层」是期 1 的真实工作量：现有 `toView` 内联在各 handler 内，没有共享 view service。不抽就只能在 v1 复制逻辑（违反 D4 的单一事实源），因此这项重构列入交付物（§8）。

### 6.2 响应、字段裁剪与错误

**成功形状**：v1 **不引入统一信封**；单资源返回裸对象，集合统一返回 `{ items, total, page, pageSize }`（`repos` / `alerts` / `pr-checks` 向 `runs` 对齐，不沿用内部的裸数组）。

**字段白名单（硬要求）**——以下字段在 v1 **必须剔除或替换**，因为它们要么是内部实现细节，要么本身构成攻击面：

| 来源 | 字段 | 处置 |
|:--|:--|:--|
| `runs/[id].get.ts` | `logs` / `logsText` | 剔除；改由 `/runs/{id}/logs` 的 digest 契约提供（§6.4） |
| `repos/index.ts` 与 `repos/[id].ts` 的视图映射 | `verifyCommands` | 剔除（项目自身注释认定「该字段等价于远程命令执行面」）；如需表达，改返回 `hasCustomVerifyCommands: boolean` |
| `repos/index.ts` 与 `repos/[id].ts` 的视图映射 | `credentialId` / `credentialName` | 改返回 `hasCredential: boolean`，不暴露凭据标识 |
| 全部端点 | 工作目录、内部绝对路径、`.git` 相关路径 | 剔除 |
| 全部端点 | 日志中的环境变量值 | 剔除（仅保留 `KEY=***` 形式的键名） |

**分页与体积**：`runs` 的 `pageSize` 上限沿用 `RUNS_PAGE_SIZE_MAX = 200`；`alerts` / `repos` / `pr-checks` 现有实现是**无上限数组**，v1 统一改为 `{ items, total, page, pageSize }`（默认 100 / 最大 500），否则一把 `read` key 可整库拉取。

**自由文本**：`errorMessage` / `error.message` / `summary` 等自由文本统一过 `sanitizeString` 再输出，避免命令输出或内部路径经错误信息泄露。

**错误形状**：沿用 Nitro 默认错误序列化，线上响应体为 `{ error, url, statusCode, statusMessage, message, data }`（dev 额外带 `stack`；当错误被标记为 `unhandled` / `fatal` 时 `message` 降级为 `Server Error`，业务 4xx 不受影响）。**`code` 位于 `data.code`**，其余业务细节（如 `issues`）与 `code` 平级放在 `data` 内。`message` 是**按 `Accept-Language` 本地化的文案**；v1 只承诺**业务错误（4xx）**的 `data.code` 稳定，`message` 文案可变（客户端不应以文案做分支判断）；5xx 时 Nitro 丢弃整个 `data`，故不对 5xx 承诺 `data.code`。

**时间**：一律 ISO 8601 字符串（与现有 `toView` 一致）。**分页**：`page` 从 1 起且无上限；`pageSize` 超上限静默钳制（与现有行为一致）。

### 6.3 稳定性承诺与契约守卫

- v1 **字段只增不删、不改类型**；删除或改名走 v2，并需通告期
- 实现方式：`apps/platform/server/api/v1/**` 薄封装（鉴权 + 参数校验 + 调用共享视图层），不复制业务逻辑
- **双层守卫**（如实表述各自能力边界）：
  1. `server/schemas/api-v1-fields.ts` 字段清单常量 + 单测比对每个端点响应形状 —— **只拦无意的响应漂移**；同仓同提交可以同时删字段与清单，它不构成 v2 承诺的强制力
  2. 每个版本发布时把 v1 的 JSON schema 快照提交到 `docs/guide/api-v1.md`（`artifacts/` 是 gitignored，跨 tag 比对取不到，故不作落点），CI 与上一 tag 比对 —— 这一层才承担「未公告不得删除」的可验证性
- 内部路由改动**不构成** v1 破坏；但 v1 依赖的视图层 / 服务层签名变化由 typecheck 兜底

### 6.4 日志查询（digest 契约）

**动因**：见 §1 追加动机与 §2 实测——单次 run 最大 178 KB / 1000 条，其中 989 条是同一条重复 warn；原始全文直接给 AI 既超上下文又无信息量。

**两种视图**：

| view | 返回 | 分页单位 | 用途 |
|:--|:--|:--|:--|
| `grouped`（默认） | 归一化后按组聚合 | 组 | 给 AI / 人快速定位 |
| `raw` | 原始条目（message 经同一清洗） | 条目 | 精确定位单条 |

**清洗通道（两种视图都生效）**——`normalizeMessage` 依次执行：

1. 去除 ANSI 控制序列（`\x1B\[...` 类）
2. URL 内嵌凭据 → `***`（复用 `sanitizeString` 既有规则）
3. 绝对路径（`/root` / `/home` / `/app` / `/tmp` / `/var` / `/usr` 前缀）→ `<path>`
4. 敏感键名与 token 前缀 → 沿用 `sanitizeString`

> **与 §6.2 的关系**：「`error` 全文保留」指**条目不被折叠、正文字数不按行截断**，并不豁免上述清洗——否则 error 里的绝对路径会经 v1 外泄，与 §6.2 自相矛盾。

**分组规则（`grouped`）**：

- 归一化模板：在清洗后的正文上，把 ISO 时间戳 → `<ts>`、数字（单位保留，`200ms` → `<n>ms`）、≥8 位 hex / UUID → `<id>`、URL 的 path 与 query → `<path>`（**保留 scheme / 域名 / 端口**，便于识别外联对象）；多行正文按行独立归一后**保留换行结构**（堆栈形态不压平）
- 分组键 `(level, template)`；**`error` 不归一化**，作为 `count=1` 的组逐条输出，`template` = 清洗后的原文
- 每组字段 `{ level, template, count, firstAt, lastAt, sample }`；`sample` 为首次出现（清洗后）的原文，与 `firstAt` 在**同一次遍历**中赋值，避免过滤后口径分歧
- 排序：`level` 降序（error → warn → info → debug），组内 `count` 降序；`error` 组内按时间升序
- `context` 不参与模板与分组（仅原样附在 `sample` 上）

**响应字段语义**：

| 字段 | 含义 |
|:--|:--|
| `total` | 过滤（`level` / `q`）后的**原始条目数** |
| `returned` | 本次返回的组数（grouped）/ 条目数（raw） |
| `groupCount` | 过滤后的组数（仅 grouped） |
| `truncated` | 分页导致未返回全部组 / 条目 |
| `errorTruncated` | `error` 条目 > 200、或 `error` 正文字节合计 > 64 KB、或任一条清洗后 > 2 KB 时为 true（两种视图同口径） |
| `droppedBefore` | 采集侧已丢弃的早期条目数（见下） |

**查询参数**：`view` / `level`（可多选）/ `q`（子串）/ `page` / `pageSize`（默认 50 / 最大 200，作用于所选视图的分页单位）。

**截断披露**：`droppedBefore` 来自 `ScanRun.logsDropped`，三态语义——`NULL` = 未采集或不可知（历史行、`github-action` 执行器）、`0` = 确认未丢弃、`>0` = 丢弃 N 条。**没有这个数，AI 会把「日志尾部」误当成完整执行过程。** 沙箱日志的时间戳由同一 `now` 生成，`firstAt` / `lastAt` 会退化为同值，响应不据此推断持续时间。

**体积**：

- 目标（非硬保证）：实测最大样本 grouped < 10 KB
- 单条清洗后 message 上限 2 KB；`error` 正文合计上限 64 KB。任一上限触发按条截断，并由 `errorTruncated` 在两种视图一致披露
- 验收用**脱敏 fixture**（`apps/platform/tests/fixtures/log-digest/`）断言 `Buffer.byteLength(JSON.stringify(result)) < 10240`；`apps/platform/data/` 被 gitignore，不得直接引用实库

**实现与复用**：

- 纯函数落在 `apps/platform/shared/log-digest.ts`（Nuxt 4.6 `shared/` 目录，先例 `shared/severity-labels.ts`），**不放 `server/`**——否则 Vue 组件无法以值导入
- 服务端实现点：`/api/v1/runs/{id}/logs`（1b）。**1a 是客户端消费方**——详情响应已带 `logs` 数组；1a 另需 `/api/runs/{id}` 视图补 `logsDropped`（见 §8）
- MCP remote **不是**实现点：它是 HTTP 消费方，只透传 v1 响应
- **禁止任何一方自写归一化规则**

**Web UI 路径（期 1a）**：`run-detail-dialog` 与 `repo-history-dialog` 的复制 / 下载各增「聚合」档（默认），由 `shared/log-digest` 在客户端计算（详情响应已带 `logs` 数组），下载用本地 `Blob`；「原始」档保留现状。这一档**不需要 API key**（仍走会话 Cookie）。

## 7. MCP remote 后端

### 7.1 后端选择

| 配置 | 行为 |
|:--|:--|
| `DEPENDFIX_PLATFORM_URL` + `DEPENDFIX_PLATFORM_API_KEY` 齐备 | `remote` |
| 两者缺任一 | `local`（现有行为，零回归） |
| `DEPENDFIX_MCP_BACKEND=local` / `remote` / `auto` | 显式覆盖；`auto` 为默认 |

工具名、入参 schema、返回类型**保持不变**，避免 AI 助手与既有 skill 需要两套认知。工具 `description` 追加后端标识（如 `[remote]`）。

### 7.2 工具映射

| tool | remote 支持 | 映射 |
|:--|:--:|:--|
| `fetch_alerts` | ✅ | `GET /api/v1/alerts`；`repo`（`owner/name`）经 `GET /api/v1/repos?owner=…&name=…` 精确解析为 `repositoryId`（不全量拉取） |
| `history` | ✅ | 同样按 `owner` / `name` 解析 `repositoryId`，再 `GET /api/v1/runs?repositoryId=…&pageSize=…` |
| `get_last_report` | ✅ | `GET /api/v1/runs?pageSize=1` + `GET /api/v1/runs/{id}`。**语义差异**：local 读本地最近报告文件，remote 取平台侧最近一次 run；结果形状对齐，但需带 `source: platform` 标注 |
| `get_run_logs` | ✅ 仅 remote | 透传 `GET /api/v1/runs/{id}/logs?view=grouped`（默认）/ `view=raw`，支持 `level` / `q` / 分页；**MCP 侧不做归一化**（实现点在 `shared/log-digest`）。local 无平台日志数据源（`RunResult` 不含日志），返回明确提示而非空结果 |
| `discover_repos` | ⚠️ 降级 | 平台已有同源能力 `GET /api/repos/importable`（文件头注释即写明与 MCP `discover_repos` 的 `owner: string[]` 同源），但它要求 `admin` / `org_admin` 角色 + 显式 `credentialId`，与只读 key 的权限语义不匹配。期 2 默认降级为 `list_repos`（返回已纳管仓库，标注 `source: platform`）；如需完整能力，作为独立评估项（涉及 key 提权，不在只读范围） |
| `run_scan` | ❌ 期 3 | 需触发面 + 异步任务模型 |
| `cleanup_branches` | ❌ 期 4 | 写操作 |
| `fix_dependency` | ❌ 永不 | 依赖本地 `workDir` |
| `pnpm_audit` | ❌ 永不 | 依赖本地文件与 `GITHUB_TOKEN` |

### 7.3 错误映射

| 条件 | MCP 行为 |
|:--|:--|
| 401 / 403 | 读取 `data.code`（`UNAUTHORIZED` / `FORBIDDEN`）给明确文案「平台 key 无效或无 `read` scope」，不重试 |
| 404 | 返回空结果或明确未找到，不抛底层错误 |
| 429 | 透出 `Retry-After`，不自动重试（避免放大） |
| 5xx / 网络错误 | 抛出可读错误，**不静默降级到 local**（数据源切换会造成口径混淆） |

## 8. 分期与验收

### 期 1a：日志可消费化（不依赖 API key）

**目标边界**：1a 交付「取出的日志可直接粘贴给 AI」，**不交付「免手动」**——后者需要 1b（v1 + key）与期 2（MCP `get_run_logs`）。这条边界写进验收，避免上收后按「已闭环」判断。

**交付物**：

- `apps/platform/shared/log-digest.ts`（清洗 + 归一化 + 分组，含 `error` 不折叠）
- `MemoryLogger` 丢弃计数 + 沙箱执行器（`sandbox-diagnostics.ts` 的 `maxLines = 100`）同步计数
- `ScanRun.logsDropped`（nullable）+ 迁移（登记进 `createDataSourceOptions().migrations`、走 `addColumnIfMissing` 前缀感知 helper、含存量库集成测试）
- `/api/runs/{id}` 详情视图补 `logsDropped`（nullable），供客户端展示截断提示
- `run-detail-dialog` 与 `repo-history-dialog` 的复制 / 下载各加「聚合」档（客户端计算 + 本地 `Blob` 下载）+ i18n 双语
- `vitest.config.ts` coverage include 增 `apps/platform/shared/**`
- 脱敏 fixture（`tests/fixtures/log-digest/`，须保留 ANSI / 绝对路径 / URL 内嵌凭据样本各 ≥1 条，避免清洗断言空转）+ 单测（清洗 / 归一化 / 分组 / `error` 保留 / `droppedBefore` 三态）

**验收标准**：

1. 脱敏 fixture（取自实测最大样本）的 grouped 序列化 < 10 KB，`error` 2 条均在输出中且正文可读（已去 ANSI、路径归一）
2. 同一 fixture、`level=warn` 时：`total=991`、`groupCount=3`、最大组 `count=989`
3. `droppedBefore` 三态：历史行 `NULL`、`container` 未丢为 `0`、构造超 1000 条后 `>0`；UI 在 `>0` 时显示提示
4. 复制 / 下载的聚合文本可直接粘贴给 AI（含分组摘要、计数与截断提示）
5. 两处弹窗行为一致；「原始」档零回归
6. 存量库迁移后新列为 `NULL`（不被伪装为 `0`）

### 期 1b：只读观测 API

**交付物**：抽 `runs` / `repos` / `dashboard` / `alerts` / `pr-checks` 共享视图层（`server/services/view/`）+ 9 个 `v1` 路由薄封装 + repos 按 `owner` / `name` 的精确查询 + `ApiKey` 实体与守卫 + `ApiRequestLog` 表 + key 管理接口 + scope / 限流 / 吊销 + 日志端点独立计数器 + `dfk_` 脱敏规则 + 字段白名单与形状契约测试 + 非 `runs` 端点的分页对象 + `docs/guide/api-v1.md`（含 schema 快照）+ `api.md §3` 口径订正（改为实际形状，或显式标注为历史声明）+ 本设计文档状态翻转。

**验收标准**：

1. 除 `/api/v1/health`（保持免认证、不含敏感字段）外，**无 key 且无会话**访问 v1 返回 401；持 `read` key 可访问全部 9 端点；**有会话但无 key** 时按会话授权（不注入 scopes），浏览器路径零回归
2. 持有**不含 `read`** 的测试 key 调只读端点 → 403 且写访问日志（期 1b 无写端点，故用 scope 缺失构造该路径）
3. 跨组织资源返回 403 `RESOURCE_NOT_IN_ORG`（与现有守卫一致；不承诺 404）
4. 限流生效：常规端点 600 次 / 5 分钟、日志端点 60 次 / 5 分钟（口径见 §5.4），超限 429 + `Retry-After`
5. 字段白名单生效：`logs` / `logsText` / `verifyCommands` / `credentialId` / `credentialName` 不出现在任何 v1 响应（各字段一条负向断言）
6. 实现与 `api-v1-fields.ts` 不一致即失败（拦无意漂移）；发布物 schema 快照与上一 tag 比对失败即阻断（承担未公告删除）
7. `alerts` / `repos` / `pr-checks` 有上限，超限不返回全量
8. v1 响应无 `Access-Control-Allow-Origin`（或仅为白名单 origin）
9. `dfk_` 前缀进入脱敏规则并有测试
10. key 管理接口：创建响应返回一次性明文、列表只出前缀与元数据、吊销后立即失效、每组织 10 把上限、90 天 TTL、创建接口自身受限流
11. `runs/{id}/logs` 的 `grouped` / `raw` 两视图各有断言；grouped 结果与 Web UI 复制结果由同一 `digestLogEntries` 产出（同源断言）
12. 浏览器路径零回归（全量单测 + e2e）；A 阶段安全面深度审计 Pass

### 期 2：MCP remote 后端

**交付物**：`@dependfix/mcp` 后端选择 + `fetch_alerts` / `history` / `get_last_report` / `get_run_logs` 四个工具 remote 实现 + `discover_repos` 降级 + 错误映射 + README（zh / en）与 skill 说明。

**验收标准**：① 无配置时行为与当前完全一致（9 tool，除 `get_run_logs` 外全 local）；② 配置齐备时 4 个工具走 remote 且结果形状与 local 一致；③ 401 / 429 / 5xx 文案明确且不静默降级；④ 两个后端各有单测，remote 用 mock HTTP；⑤ `discover_repos` 降级结果显式标注 `source`。

### 期 3（后置）：触发面

前置条件（任一未满足不得开工）：

1. 平台与 CLI 执行语义收口结论落盘
2. 幂等键、按 key 配额、同仓库互斥（`withRepoLock` 已有）三件齐备
3. 异步任务模型确定：`202 + run id`，轮询 `GET /api/v1/runs/{id}`

**为什么后置**：平台 `platform-delivery.ts` 与引擎 `executeFixAndPrMode` 是两份实现；backlog 已登记两处语义分叉（平台侧同告警尝试计数、平台侧交付载体）。对外开放「修复」会把分叉固化为对外承诺。

### 期 4（后置）：交付写操作

仅在期 3 稳定运行且「权威执行面」结论明确后再评估。

## 9. 已知边界与待核对项

| 项 | 状态 | 处置 |
|:--|:--|:--|
| `api.md §3` 的 `ApiResponse` 信封与实现不一致 | 待订正 | 本期不修规范；期 1 交付物含「订正或标注为历史声明」，不留无痕承诺 |
| `@better-auth/api-key` 与 `better-auth 1.7.22` 兼容性 | **未实测**（npm latest 1.7.26，同 major.minor） | 期 1 D 阶段首个验证点；不兼容走自建方案 |
| 多组织 / 多租户（backlog D1 / D3） | 未实施 | 当前 key 绑「当前组织」；多租户落地时需同批改 scope 推导 |
| 通知渠道 `slack` / `webhook` | 占位不可用 | 本设计不依赖；对外 webhook 属另一能力面 |
| 内部视图映射内联在 handler | 现状 | 期 1 抽共享视图层，否则 v1 只能复制逻辑 |
| `runs/logs-export` 全量导出 | 不进 v1 | 人工取件场景；若外部需要，另评估流式契约 |
| 日志采集上限 1000 条且丢最旧 | **已知缺陷**（早期 install 错误可能已丢失） | 期 1a 先补 `droppedBefore` 披露；是否改为「头尾保留」或按级别优先保留，作为独立评估项（涉及 `MemoryLogger` 策略与 DB 体积权衡） |
| 日志重复噪音 | 实测单次 99% 为同一条 warn | 由 `digestLogEntries` 折叠解决；采集侧是否对同模板 warn 做计数抑制，属独立优化（会改变原始日志语义，暂不做） |
| 空日志 vs 解析失败 | `parseLogEntries` 对 `null` 与坏 JSON 都返回 `[]` | v1 沿用现有 404 `RUN_LOGS_NOT_FOUND` 语义（不区分二者）；如需区分需先给 `parseLogEntries` 返回结构化失败原因，属独立改动 |
| `github-action` 执行器 | 不写 `logsJson` | `droppedBefore` 恒为 `NULL`（不可知），文档与 UI 均按「无采集」呈现 |

## 10. 上收触发条件

满足任一即建议进入 `todo.md` 当前阶段（不带阶段编号，按规划规范 §3.1 由用户决策）：

1. 出现「不在 CI 里装 CLI + 传 token，却要读平台扫描结果」的实际需求（外部看板 / 状态页 / 巡检脚本）
2. AI 助手需要读取平台侧持久化状态（当前只能读本地报告文件）
3. 需要把平台数据暴露给第三个系统且无法用数据库直连解决

## 11. 关联文档

- [API 规范](../../standards/api.md)（通用规范；§3 信封漂移见 §9）
- [安全规范](../../standards/security.md)（key、脱敏与 CORS 边界）
- [MCP Server 设计](./mcp-server.md)（8 个 tool 的入参与实现要点）
- [平台认证与用户体系设计](./platform-auth-users.md)（三角色与组织隔离）
- [平台架构](./architecture-platform.md)（分层与执行模型）
- [对外 PR 交付闭环设计](./pr-delivery-closure.md)（期 4 的语义来源）

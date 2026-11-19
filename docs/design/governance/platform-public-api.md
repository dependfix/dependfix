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

## 4. 范围

**本期范围内**：

- 9 个只读端点（§6）+ key 管理接口 `/api/v1/keys`（会话 + admin / org_admin，见 §5.7）
- `@dependfix/mcp` remote 后端（3 个工具走 remote + 1 个降级）
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
| `GET /api/v1/runs/{id}/logs` | `runs/[id]/logs.get.ts` 的 `parseLogEntries` | v1 **输出 JSON 条目**（非 `text/plain` 附件），字段裁剪 + 单独限流；`runs/logs-export` 仍不进 v1（沿用其全量导出语义） |
| `GET /api/v1/alerts` | `alerts/index.get.ts`（需抽视图层） | 告警列表；`repositoryId`（`fetch_alerts` 的 repo 过滤依赖它）/ `groupBy` / 严重级别 / 来源筛选 |
| `GET /api/v1/pr-checks` | `pr-checks/index.get.ts`（需抽视图层） | PR 检查列表；`conclusion` / 状态筛选 |
| `GET /api/v1/dashboard/stats` | `dashboard/stats.get.ts`（需抽视图层） | 汇总指标 |

> 「需抽视图层」是期 1 的真实工作量：现有 `toView` 内联在各 handler 内，没有共享 view service。不抽就只能在 v1 复制逻辑（违反 D4 的单一事实源），因此这项重构列入交付物（§8）。

### 6.2 响应、字段裁剪与错误

**成功形状**：v1 **不引入统一信封**；单资源返回裸对象，集合统一返回 `{ items, total, page, pageSize }`（`repos` / `alerts` / `pr-checks` 向 `runs` 对齐，不沿用内部的裸数组）。

**字段白名单（硬要求）**——以下字段在 v1 **必须剔除或替换**，因为它们要么是内部实现细节，要么本身构成攻击面：

| 来源 | 字段 | 处置 |
|:--|:--|:--|
| `runs/[id].get.ts` | `logs` / `logsText` | 剔除；改由 `/runs/{id}/logs` 提供裁剪后的 JSON 条目 |
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

### 期 1：只读观测 API

**交付物**：抽 `runs` / `repos` / `dashboard` / `alerts` / `pr-checks` 共享视图层（`server/services/view/`）+ 9 个 `v1` 路由薄封装 + repos 按 `owner` / `name` 的精确查询 + `ApiKey` 实体与守卫 + `ApiRequestLog` 表 + key 管理接口 + scope / 限流 / 吊销 + 日志端点独立计数器 + `dfk_` 脱敏规则 + 字段白名单与形状契约测试 + 非 `runs` 端点的分页对象 + `docs/guide/api-v1.md`（含 schema 快照）+ `api.md §3` 口径订正（改为实际形状，或显式标注为历史声明）+ 本设计文档状态翻转。

**验收标准**：

1. 除 `/api/v1/health`（保持免认证、不含敏感字段）外，**无 key 且无会话**访问 v1 返回 401；持 `read` key 可访问全部 9 端点；**有会话但无 key** 时按会话授权（不注入 scopes），浏览器路径零回归
2. 持有**不含 `read`** 的测试 key 调只读端点 → 403 且写访问日志（期 1 无写端点，故用 scope 缺失构造该路径）
3. 跨组织资源返回 403 `RESOURCE_NOT_IN_ORG`（与现有守卫一致；不承诺 404）
4. 限流生效：常规端点 600 次 / 5 分钟、日志端点 60 次 / 5 分钟（口径见 §5.4），超限 429 + `Retry-After`
5. 字段白名单生效：`logs` / `logsText` / `verifyCommands` / `credentialId` / `credentialName` 不出现在任何 v1 响应（各字段一条负向断言）
6. 实现与 `api-v1-fields.ts` 不一致即失败（拦无意漂移）；发布物 schema 快照与上一 tag 比对失败即阻断（承担未公告删除）
7. `alerts` / `repos` / `pr-checks` 有上限，超限不返回全量
8. v1 响应无 `Access-Control-Allow-Origin`（或仅为白名单 origin）
9. `dfk_` 前缀进入脱敏规则并有测试
10. key 管理接口：创建响应返回一次性明文、列表只出前缀与元数据、吊销后立即失效、每组织 10 把上限、90 天 TTL、创建接口自身受限流
11. 浏览器路径零回归（全量单测 + e2e）；A 阶段安全面深度审计 Pass

### 期 2：MCP remote 后端

**交付物**：`@dependfix/mcp` 后端选择 + 3 个工具 remote 实现 + `discover_repos` 降级 + 错误映射 + README（zh / en）与 skill 说明。

**验收标准**：① 无配置时行为与当前完全一致（8 tool 全 local）；② 配置齐备时 3 个工具走 remote 且结果形状与 local 一致；③ 401 / 429 / 5xx 文案明确且不静默降级；④ 两个后端各有单测，remote 用 mock HTTP；⑤ `discover_repos` 降级结果显式标注 `source`。

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

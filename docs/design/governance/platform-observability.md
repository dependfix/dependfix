# 平台可观测性设计（Sentry / uptime 探针 / provider 日志）

> **状态**：Sentry 通道已落地（M65.1，2026-11-22）；uptime 探针已落地（M65.2，2026-11-22）；PR Check provider 日志（M65.4）待落地，落地后回填本文对应章节。
> **定位**：把「平台出问题后靠人肉巡检」换成三条可复核的观测通道；本文件是三通道的**字段 / 关闭项 / 边界**权威，进程日志通道本身仍见 [platform-logging.md](./platform-logging.md)，PR 信号三源聚合见 [pr-build-deploy-signals.md](./pr-build-deploy-signals.md)。

## 1. 背景与目标

1.2.0 之前的线上排障路径是「用户反馈 → `docker logs` / 翻 `data/logs/YYYY-MM-DD.log` → 定位进程」，跨实例不可见、事后才可见。本设计补三条通道：

| 通道 | 回答的问题 | 触发面 | 关闭判据 | 状态 |
|:--|:--|:--|:--|:--|
| Sentry | 哪条 API / worker 在报错？错误堆栈与分布？ | 未捕获异常、API 5xx、worker 异常、通知 / 执行失败、周报异常、Web Vitals | `SENTRY_DSN` / `NUXT_PUBLIC_SENTRY_DSN` 为空 | ✅ M65.1 落地 |
| uptime 探针 | 进程 / 容器 / DB 是否还活着？ | 编排器 `HEALTHCHECK` + 外部 HTTP 探针 | 探针未配置 | ✅ M65.2 落地 |
| provider 日志 | 失败的那次 Vercel / Cloudflare 构建为什么失败？ | PR Check 失败信号 + provider 只读 token | 未配置 provider token | ⏳ M65.4 |

**硬约束**：三条通道都必须满足「未配置 = 零出网」与「已配置 = 必脱敏」两向守卫（门禁落点见 §8，M65.5 补矩阵）。

## 2. 通道分工（硬约束）

- **进程日志**（`server/utils/logger.ts`）仍是本地唯一事实源：落文件、按日轮转、31 天保留；Sentry 只转发**有限的进程级生命周期事件**，不复制整套日志，也不把 `MemoryLogger` 的运行级输出整体转发（会放大配额且无聚合价值）。
- **Sentry** 只承担跨实例聚合：同一异常在 Sentry 以 fingerprint 聚合，在本地日志仍逐条可查；两者字段口径不同，不要求一一对应。
- **uptime** 只回答「活 / 不活」：只读端点 + 字段白名单，不暴露 DB 明细（见 §5）。
- **provider 日志** 只在 PR Check 失败详情里补充「尾部日志或不可用原因」，不改变三源聚合与阻断语义（见 §6）。
- 三条通道都**不得**改变运行结果模型、`ScanRun.logsJson`、通知投递语义与扫描执行链路。

## 3. Sentry 通道（M65.1）

### 3.1 环境变量

| 变量 | 端 | 必填 | 默认 | 说明 |
|:--|:--|:--:|:--|:--|
| `SENTRY_DSN` | 服务端 | — | 空 | **唯一启用判据**：为空即不初始化 SDK、不登记采集 sink（零出网） |
| `NUXT_PUBLIC_SENTRY_DSN` | 浏览器 | — | 空 | 浏览器端 DSN（运行时 `NUXT_PUBLIC_` 覆盖；**不回落**服务端 `SENTRY_DSN`）。DSN 是公开的**事件摄取**凭据：可写入事件、不能读取或改配置，泄露风险为事件注入与配额消耗 |
| `SENTRY_ENVIRONMENT` / `NUXT_PUBLIC_SENTRY_ENVIRONMENT` | 双端 | — | `NODE_ENV`（浏览器端取构建期值），再回退 `development` | Sentry environment 维度；空串按未配置回退，服务端对非法采样率输出 warn |
| `SENTRY_ERRORS_SAMPLE_RATE` | 双端 | — | `1` | 错误事件采样率（0-1；非法值回退默认并 warn） |
| `SENTRY_TRACES_SAMPLE_RATE` | 双端 | — | `0.1` | 事务 / Web Vitals 采样率（0-1；同上） |

release / commit 不设独立 env：复用构建期版本戳 `NUXT_BUILD_VERSION` / `NUXT_BUILD_COMMIT`（口径见 [平台规范 §10.6](../../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程) 的 10.7 条），容器入口导出后服务端启动即读到；浏览器端经 `runtimeConfig.public` 烘焙。

### 3.2 初始化形态（D1 决策：模块 + 默认配置路径）

- 采用 `@sentry/nuxt/module`（不手写 plugin init）：浏览器 Web Vitals、Nitro 路由事务与客户端错误边界由模块统一接线，手写 init 需自行复刻三个插件。
- 配置文件走模块默认路径 `<projectRoot>/sentry.server.config.ts` / `sentry.client.config.ts`；服务端在 Nitro 启动时执行，客户端在 app 创建前执行。
- 兼容性 spike（2026-11-22）：`@sentry/nuxt@11.16.0` + Nuxt 4.6.4 + nitropack 2.13.6 → `nuxt prepare` / `nuxt build`（54.7s–1m27s，含本阶段最终态复跑）/ `nuxt typecheck` 全通过；包声明 peer 为 `nuxt >=3.7.0 || 4.x || 5.x` / `nitro 2.x || 3.x || 3.0.*-beta`，当前版本均在范围内。
- 初始化闸门在 `server/utils/observability.ts#initializeServerObservability`：DSN 为空时**不调用 `Sentry.init`**，并清空全局状态；采集入口（`captureLifecycleEvent` / `captureLifecycleError`）在未启用时直接返回 `false`。
- 服务端关闭 SDK 自带 Nitro error handler（`enableNitroErrorHandler: false`）：API 5xx 由 `server/plugins/observability.ts` 统一上报，避免同一异常出现两条事件。
- 脱敏接线两条：`beforeSend`（错误 / 消息事件）+ `beforeSendSpan`（事务 / span；SDK 默认 span streaming 下事务不再经 `beforeSend`）。
- 构建期零出网：`sentry.sourcemaps.disable = true` + `sentry.telemetry = false`（后者默认开启会向 Sentry 发送构建插件自身遥测）。
- 关闭 `buildTimeInstrumentation`：Sentry 的构建期依赖插桩会在服务端启动时 eager import 被插桩的驱动（`pg` → `postgres-interval` 的 `require('xtend/mutable')` 被提升成无扩展名 ESM import，Node 无法解析），2026-11-22 E2E / 视觉回归实测启动失败；关闭后 HTTP / 错误面采集不受影响，DB 自动 span 不在本阶段范围。

### 3.3 采集字段与关闭项

**采集**（上下文在进入 sink 前已脱敏）：

| 字段 | 来源 | 用途 |
|:--|:--|:--|
| `release` + `commit`（tag） | 构建期版本戳 | 按部署产物过滤「修了但线上仍旧」 |
| `environment` | env | 区分生产 / 预览 |
| `route` / `method` / `statusCode` | Nitro error 钩子 | 按路由聚合 5xx |
| `source` | 转发点 | `http` / `queue_worker` / `scan_orchestration` / `scan_run_failed` / `notification` / `weekly_digest` |
| `runId` / `repositoryId` / `executorKind` / `failureCode` / `failureStage` / `failureKind` / `exitCode` | 编排层 | 失败运行与告警关联 |
| `eventId` / `channel` / `code` | 通知层 | 投递故障定位 |

**显式关闭**（两层：SDK 自动采集面 `dataCollection` + 事件级裁剪 `shared/sentry-sanitize.ts`）：

- `dataCollection`（Sentry v11 取代已移除的 `sendDefaultPii`）：`userInfo` / `cookies` / `httpHeaders` / `urlQueryParams` 全关，`httpBodies: []`，`graphQL` / `genAI` / `mcp` 输入输出关闭，`databaseQueryData` / `queues` / `stackFrameVariables` 关闭，`frameContextLines: 0`；
- 事件级：`user` 只保留 `id`（邮箱 / IP / 用户名丢弃）；
- `request.query_string` / `request.data` / `request.cookies` / `request.env` 整体删除；`request.url` 只保留路径；
- 请求头白名单（`accept` / `accept-language` / `content-type` / `referer` / `user-agent`），Cookie / Authorization / `X-*` 凭据头一律丢弃；
- URL / breadcrumb 中的 `code` / `state` / `access_token` / `id_token` / `refresh_token` / `token` / `password` / `api_key` 参数值擦除；
- 不做 Replay、不上传 source map、不开 `consoleLoggingIntegration`、不做 CLI / Action 遥测。

### 3.4 生命周期转发点（≤10）

| 位置 | 事件 | 级别 | 上下文 |
|:--|:--|:--|:--|
| `server/plugins/logger.ts` | `platform_started` | info | role / logDir / fileLogging / level |
| `server/plugins/observability.ts` | （API 5xx 异常） | error | `source=http` + route / method / statusCode |
| `server/services/queue/scan-worker.ts` | （worker 异常） | error | `source=queue_worker` + lockRenewal |
| `server/services/scan-orchestrator.service.ts` | `scan_run_failed` | warning | runId / repositoryId / executorKind / failure 三列（业务预期内失败不按事故级别上报） |
| `server/services/scan-orchestrator.service.ts` | （编排 catch-all 异常） | error | `source=scan_orchestration` + runId |
| `server/services/notification/index.ts` | （投递失败异常） | error | `source=notification` + eventId / channel / code |
| `server/plugins/weekly-digest.ts` | （周报异常） | error | `source=weekly_digest` |

**不转发**：`MemoryLogger` 运行级逐行日志、`console.*` 输出、审计事件正文、HTTP 4xx。

## 4. 脱敏（硬约束）

- 字符串规则复用 [`shared/sanitize.ts`](../../../apps/platform/shared/sanitize.ts)（URL 内嵌凭据 / Authorization / GitHub 与 dependfix token 前缀 / 敏感键名 / PEM），不另立规则副本；`cookie` 键自 M65.1 起纳入敏感字段名（会话凭据）。
- 事件级裁剪由 [`shared/sentry-sanitize.ts`](../../../apps/platform/shared/sentry-sanitize.ts) 统一执行：服务端 sink 前置 + SDK `beforeSend` 兜底；浏览器端同一函数。
- 六类取证样例（token / Cookie / URL query / OAuth `code` / OAuth `state` / 请求体密码）逐类断言，见 `tests/unit/sentry-sanitize.test.ts`。
- **已知边界**：未编码的 `@` / `/` 出现在 URL 凭据内部时只能部分遮蔽（与日志脱敏同一正则限制），不得依赖脱敏兜底不合规的 URL。

## 5. uptime 探针通道（M65.2，已落地 2026-11-22）

**目标**：进程死亡 / 容器未启动 / DB 不可读三类故障由编排器与外部 uptime 自动发现。

### 5.1 端点分工（D2 决策：拆两个端点）

| 端点 | 语义 | 是否访问 DB | 响应 | 使用方 |
|:--|:--|:--|:--|:--|
| `GET /api/health` | liveness（进程 + 产物标识） | 否 | `{version, commit, startedAt, schema}`（字段集合不变） | 容器 `HEALTHCHECK`、外部存活探测 |
| `GET /api/health/ready` | readiness（依赖就绪） | 是（`SELECT 1`，两阶段共享 2s 总超时） | `200 {status:"ready", schema}` / `503 {status:"not_ready", schema}` | 编排器 readinessProbe、依赖告警 |

- 两者都公开只读、无鉴权（探针无法携带 Cookie）；**不**返回数据库类型 / 路径 / 错误正文（探针本身不额外记录日志，数据库层仍会输出连接失败日志，探针间隔过密时需在日志侧降噪）。两者都只支持 `GET`，`HEAD` 返回 404，探针配置须用 GET。
- readiness 的 `schema` 复用启动期漂移检测结果：`drift` 不阻塞 ready（库可读但迁移待执行）；漂移通过启动日志与 `/api/health` 的 `schema` 字段做人工 / 巡检核对（存活探针本身不解析正文）。

### 5.2 容器 HEALTHCHECK

- 只探 liveness：`--interval=30s --timeout=5s --start-period=60s --retries=3`；镜像无 curl，用 `node -e "fetch(...)"`。
- **不探 DB**：DB 慢 / 迁移中不得触发重启循环（restart 只会放大故障）；依赖未就绪由 readiness 让编排器摘流。
- `start-period` 覆盖启动 + 首次迁移窗口；Docker 实际容忍窗口为 `start-period + retries × interval = 150s`，外部监控的首次告警宽限应 ≥150s（只按 60s 会在大库首次迁移时误报）；探针失败只影响 `docker inspect` 的 Health 状态与编排器动作，不改变进程语义。探针必须用 `GET`（`HEAD` 不映射）。

### 5.3 外部 uptime 接入

- 存活监控 `GET /api/health`：期望 200，连续 2 次失败告警；不要解析正文（release / commit 变化会误报）。
- 依赖监控 `GET /api/health/ready`：期望 200，连续 3 次失败告警（依赖故障通常跨多个周期）。
- 探针间隔 ≥ 30s、超时 5s；首次告警宽限 ≥150s（Docker 容忍窗口 = `start-period + retries × interval`）。
- 通用 HTTP 口径，不绑定具体 SaaS；反向代理后同样可探（无 Cookie / 无鉴权）。readiness 会触发一次 DB 查询，反代侧建议仅放行探针来源或加限流（探针间隔 ≥30s 已足以避免压力）。

### 5.4 未证实边界

- `docker inspect` 的 `healthy` 状态未在本机实跑（本地以产物进程 + 相同探针命令验证语义）；首次 CI / 真实容器启动时回填。
- 真实外部 uptime / 编排器 readinessProbe 与反向代理链路未联调；`pg` / `mysql` 后端与「启动后数据库再失效」仅经单测覆盖。

## 6. provider 日志通道（M65.4，已落地 2026-11-23）

- 目标：PR Check 失败详情在配置 provider 只读 token 时可看日志尾部（≤8 KB、脱敏），未配置时行为与现状完全等价。
- 约束：不改变三源归一化与 `overallStatus` / `failureSources`；拉取失败降级为「不可用 + 原因」。
- 落地：Layer 5 契约 / 凭据承载（D4-A）/ 目标字段 / 失败降级与未证实边界见 [pr-build-deploy-signals.md §3.12](./pr-build-deploy-signals.md#_3-12-layer-5-provider-日志富化落地-2026-11-23)。

## 7. 未证实边界

- **真实 Sentry SaaS 联调未做**：未提供 DSN / 项目，事件送达、配额与 source map 关联均按「未证实」登记；验收只覆盖「未配置零出网」「已配置信封字段与脱敏」两向用例。
- **浏览器 Web Vitals 实采未做**：客户端初始化路径经构建与类型检查，但未在真实浏览器会话中核对 Sentry 事务。
- **多实例去重**：Sentry 服务端 fingerprint 聚合未在本项目验证（依赖 DSN）。
- **DSN 泄露风险**：DSN 是公开摄取凭据（浏览器端必然可见），泄露后果是事件注入与配额消耗；部署侧应在 Sentry 项目配置速率限制 / 事件过滤，本仓库不内置这两项。
- **`platform.md` 字符预算**：该文件 24,299 字符已超健康上限 24,000（HEAD 基线 24,022 即超），本次新增约 277 字符；按存量登记，随下一次规范文档压缩批次处理（不在本阶段扩大改动面）。
- 构建期插件行为已收敛为「不出网」，但升级 `@sentry/nuxt` 大版本仍需重跑 spike（配置路径与选项有迁移史）。

## 8. 验收与机检落点

| 验收 | 证据 |
|:--|:--|
| 未配置 DSN：SDK 零初始化、采集零出网 | `server/utils/observability.test.ts`（init stub 0 次 + sink 0 次） |
| 配置 DSN：init 选项含 release / commit / 采样率 / PII 关闭 | 同上（`buildServerSentryOptions` 断言） |
| API 500 与 worker 异常各 1 条事件，含 release / commit（API 含 route） | 同上 + `server/plugins/observability.test.ts` |
| 六类样例不出现在事件 payload | `tests/unit/sentry-sanitize.test.ts` |
| `sourcemaps.disable = true` / `telemetry = false` | `tests/unit/sentry-config-guard.test.ts`（源码文本门禁） |
| 入口初始化闸门 + beforeSend / beforeSendSpan 接线 | `tests/unit/sentry-server-config.test.ts`（stub Sentry，无网络） |
| SDK 自动采集面关闭（dataCollection）| `server/utils/observability.test.ts`（`SENTRY_DATA_COLLECTION` 断言） |
| 采样率由 env 控制（含非法值回退 + warn） | `shared/observability` 用例 + `readObservabilityEnv` 用例 |
| worker 角色不注册 HTTP 错误钩子 | `server/plugins/observability.test.ts` |
| 三通道矩阵：未配置零出网 + 已配置必脱敏（13 例） | `tests/unit/external-channels.test.ts`（Sentry / uptime / provider 日志） |

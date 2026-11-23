# 只读观测 API v1

> 状态：只读面已实施（M63.2-M63.4）。触发面 / 交付写（期 3 / 4）不在本期。
> 设计依据：[platform-public-api.md](../design/governance/platform-public-api.md)。

## 1. 认证

| 方式 | 说明 |
|:--|:--|
| API key | `Authorization: Bearer dfk_...`；key 绑定组织，scope `read`，默认 90 天 TTL |
| 会话 Cookie | 浏览器 / 运维已登录场景；按会话授权，不注入 scopes，也不受 key 级限流 / 访问日志约束 |

**获取 key**：平台「API 密钥」页（`/api-keys`）创建；入口仅对 admin / org_admin 可见，viewer 直访显示 403 提示；明文只显示一次，列表只保留前缀。也可直接调 `POST /api/v1/keys`（同一会话 + 角色要求），但不建议手写 curl 传 Cookie。

`/api/v1/health` 免认证；其余端点无 key 且无会话返回 401 `UNAUTHORIZED`。无效 / 过期 key 的 401 尝试按 IP 限速写入进程日志（每 IP 每分钟最多 5 条；含 `dfk_` 后 4 位提示与路径，不含完整 key），不进入 `api_request_log`（该表要求组织归属）。
key 缺失 `read` scope 返回 403 `FORBIDDEN`；跨组织资源返回 403 `RESOURCE_NOT_IN_ORG`。
响应不设置 `Access-Control-Allow-Origin`，仅服务端到服务端调用。

## 2. 端点

| 端点 | 说明 | 分页 |
|:--|:--|:--|
| `GET /api/v1/health` | 版本 / commit / 启动时间 / schema 状态 | — |
| `GET /api/v1/repos` | 已纳管仓库；`owner` / `name` 精确过滤 | 默认 100 / 最大 500 |
| `GET /api/v1/repos/{id}` | 仓库详情 | — |
| `GET /api/v1/runs` | 扫描运行；复用内部筛选 / 排序参数 | 默认 100 / 最大 200 |
| `GET /api/v1/runs/{id}` | 运行详情（不含 `logs` / `logsText`） | — |
| `GET /api/v1/runs/{id}/logs` | 运行日志：`view=grouped`（默认）/ `raw`；`level` 逗号多选、`q` 子串、`page` / `pageSize` | 默认 50 / 最大 200 |
| `GET /api/v1/alerts` | 告警列表；`repositoryId` / `severity` / `source` / `groupBy` / `includeSuperseded` | 默认 100 / 最大 500 |
| `GET /api/v1/pr-checks` | PR Check 列表；`repositoryId` / `conclusion` / `alertFiring` | 默认 100 / 最大 500 |
| `GET /api/v1/dashboard/stats` | 仪表板汇总 | — |
| `GET /api/v1/keys` | key 列表（会话 + admin / org_admin） | — |
| `POST /api/v1/keys` | 创建 key，明文仅返回一次（90 天 TTL，每组织 10 把） | — |
| `DELETE /api/v1/keys/{id}` | 吊销 key（硬删除，立即失效） | — |

## 3. 响应与错误

- 集合统一 `{ items, total, page, pageSize }`；单资源返回裸对象，**无统一信封**
- 分页 `pageSize` 超上限静默钳制；`page` 从 1 起
- 时间一律 ISO 8601
- 错误沿用 Nitro 序列化，业务 `code` 位于 `data.code`；4xx `code` 稳定，`message` 按语言变化
- v1 字段只增不删、不改类型；删除 / 改名走 v2 并需通告期

### 日志视图

- `grouped`：按 `(level, template)` 聚合；`error` 逐条不折叠；返回 `groups` / `groupCount` / `truncated`
- `raw`：返回 `entries`，message 经同一清洗通道（ANSI / URL 凭据 / 绝对路径 / 敏感键）；`level` 非法值返回 400，`q` 为不区分大小写的子串过滤
- `grouped` 的 `groupCount` 是过滤后的全部组数，`page` / `pageSize` 可翻到后续组（单页上限 200）
- 集合端点 `repositoryId=all` 等价于不过滤（与内部端点一致）
- 两种视图都披露 `droppedBefore`（`null` 不可知 / `0` 未丢 / `>0` 丢弃条数）与 `errorTruncated`
- 与 Web UI 的聚合复制 / 下载共用 `apps/platform/shared/log-digest.ts`

### 字段白名单

`logs` / `logsText` / `verifyCommands` / `credentialId` / `credentialName` 不出现在任何 v1 响应；
仓库以 `hasCredential` / `hasCustomVerifyCommands` 表达对应状态。自由文本经脱敏与绝对路径归一。
PR Check 的 `providerLogs` 只返回 `available` / `provider` / `truncated` / `reason` / `status` / `fetchedAt`
（provider 原生构建日志尾部 `tail` 不进入 v1，见 [PR 构建部署信号设计 §3.12](../design/governance/pr-build-deploy-signals.md)）。

## 4. 契约快照

> 发布时与上一 tag 的同段快照比对；字段 / 字段组删除或分页上限下调即阻断。字段类型由 TypeScript 类型与契约测试约束（快照只比对字段集合与分页上限）。
> 快照由 `apps/platform/server/schemas/api-v1-fields.ts` 生成，单测保证文档与代码一致。

<!-- api-v1-snapshot:start -->
```json
{
  "pagination": {
    "default": 100,
    "max": 500,
    "runsMax": 200,
    "logsDefault": 50,
    "logsMax": 200
  },
  "fields": {
    "health": [
      "version",
      "commit",
      "startedAt",
      "schema"
    ],
    "repo": [
      "id",
      "owner",
      "name",
      "platform",
      "defaultBranch",
      "packageManager",
      "hasCredential",
      "actionWorkflowFile",
      "executorKind",
      "note",
      "tags",
      "sandboxLimits",
      "sandboxImage",
      "hasCustomVerifyCommands",
      "prCheckFocus",
      "executionTimeoutMs",
      "verifyCommandTimeoutMs",
      "installTimeoutMs",
      "cloneTimeoutMs",
      "allowMajorUpgrade",
      "aiEnabled",
      "aiTrigger",
      "lastScanAt",
      "createdAt",
      "updatedAt"
    ],
    "run": [
      "id",
      "repositoryId",
      "owner",
      "name",
      "mode",
      "severityThreshold",
      "executorKind",
      "status",
      "startedAt",
      "finishedAt",
      "runUrl",
      "summary",
      "exitCode",
      "environmentalFailureCount",
      "memoryMaxBytes",
      "peakRssBytes",
      "oomKilled",
      "resource",
      "error",
      "failureCode",
      "failureStage",
      "failureKind"
    ],
    "runDetailExtra": [
      "buildVersion",
      "buildCommit",
      "retriedFromRunId",
      "results"
    ],
    "runResult": [
      "id",
      "source",
      "severity",
      "packageName",
      "manifestPath",
      "ruleId",
      "summary",
      "fixable",
      "fixStrategy",
      "recommendedVersion",
      "htmlUrl",
      "fixStatus",
      "errorMessage"
    ],
    "alert": [
      "id",
      "runId",
      "repository",
      "source",
      "severity",
      "packageName",
      "manifestPath",
      "ruleId",
      "summary",
      "fixable",
      "fixStrategy",
      "recommendedVersion",
      "htmlUrl",
      "fixStatus",
      "errorMessage",
      "upstreamId",
      "occurrenceCount",
      "firstSeenAt",
      "lastSeenAt",
      "supersededAt",
      "ghsaId",
      "cveIds"
    ],
    "prCheck": [
      "id",
      "repositoryId",
      "repository",
      "prNumber",
      "headSha",
      "authorLogin",
      "conclusion",
      "prState",
      "overallStatus",
      "focusConfigured",
      "signals",
      "failureSources",
      "providerLogs",
      "checkRunId",
      "detailsUrl",
      "errorMessage",
      "alertFiring",
      "acknowledgedAt",
      "acknowledgedByUserId",
      "lastPolledAt",
      "createdAt",
      "updatedAt"
    ],
    "dashboard": [
      "repositoryCount",
      "alertsTotal",
      "severityCounts",
      "fixedCount",
      "topPackages",
      "latestRun"
    ],
    "logGrouped": [
      "view",
      "total",
      "returned",
      "groupCount",
      "truncated",
      "errorTruncated",
      "droppedBefore",
      "groups"
    ],
    "logGroup": [
      "level",
      "template",
      "count",
      "firstAt",
      "lastAt",
      "sample"
    ],
    "logRaw": [
      "view",
      "total",
      "returned",
      "truncated",
      "errorTruncated",
      "droppedBefore",
      "entries"
    ],
    "logEntry": [
      "timestamp",
      "level",
      "message"
    ]
  },
  "forbidden": [
    "logs",
    "logsText",
    "verifyCommands",
    "credentialId",
    "credentialName"
  ]
}
```
<!-- api-v1-snapshot:end -->

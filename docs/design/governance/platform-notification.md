# 平台通知与邮件推送设计

> 状态：✅ B1-B5 全部落地（B1-B4 2026-10-21；B5 周汇总随 M47.5，2026-10-24）；**✅ 已落地（M50.1-M50.3，2026-10-30 归档）**：D4 `security_critical` 必选 / D5 术语收敛 / D6 周报重试——阶段正文见 [M50 归档分片](../../plan/archive/todo-archive-phases-m50.md)；来源 [issue #190](https://github.com/dependfix/dependfix/issues/190)）
> 关联：[系统架构](./architecture-platform.md) · [定时扫描与批量处理设计](./platform-scheduled-batch.md) · [运行失败分类与筛选设计](./run-failure-taxonomy.md) · [平台规范](../../standards/platform.md) · [安全规范](../../standards/security.md)

## 1. 背景与现状

平台已具备一条**仅面向环境事件**的通知链路，但没有面向「扫描结果」的通知能力：

| 组件 | 现状 | 位置 |
|:---|:---|:---|
| 渠道抽象 | `NotificationChannel` 接口 + 注册表；当前仅 email 实现，Slack / Webhook 为 stub | `apps/platform/server/services/notification/channel.ts` |
| 环境事件通知 | `notifyEnvEvent()`：策略判定 → 收件人解析 → 渠道投递 → 回写 `audit_event.notified` | `apps/platform/server/services/notification/index.ts` |
| 事件策略 | 白名单仅 `sandbox_unavailable` / `sandbox_degraded` / `container_unavailable` | `apps/platform/server/services/notification/policy.ts` |
| 收件人 | 默认 admin / org_admin 全员；`DEPENDFIX_ENV_ALERT_RECIPIENTS` 可覆盖 | `apps/platform/server/services/notification/recipients.ts` |
| 邮件投递 | nodemailer + 双语模板 + fail-closed；SMTP 未配置时 noop | `apps/platform/server/services/mailer/` |
| 业务结果 | `ScanResult.severity` / `fixStatus` + `BatchRun.summaryJson.severityCounts` 已落库 | `apps/platform/server/entities/`、`services/batch/batch-aggregate.ts` |

**缺口**：① 扫描 / 批次结束不触发任何通知；② 无「高危未修复」通知；③ 无全局与个人配置；④ 无去重、冷却与合并，逐仓库发送会放大打扰；⑤ 收件人固定为管理员，无法区分「平台自身问题」与「仓库告警问题」；⑥ 无投递记录可审计。

[issue #190](https://github.com/dependfix/dependfix/issues/190) 要求「增加邮件通知功能」。本设计将其收敛为**四类事件 + 三层配置 + 分流收件人 + 合并降噪**，并保留多渠道扩展点。

## 2. 目标与非目标

**目标**

- **G1 事件分层**：区分平台自身问题、仓库高危告警、运行失败与完成摘要四类事件，默认策略各异。
- **G2 必选与可选**：平台自身问题为必选（用户与组织均不可关闭，仅部署总开关可熔断）；其余为可选项。
- **G3 双层配置**：组织级默认 + 个人账户覆盖；全局关闭不可被个人越权放宽。
- **G4 分流收件人**：按事件类型推送触发者或管理员；邮件标题与正文显式标注事件类别。
- **G5 降噪**：批次级合并 + 内容指纹去重 + 24 小时窗口 + 每小时上限；内容未变化不重复推送；可选周汇总承担周期提醒。
- **G6 可扩展与可审计**：沿用渠道注册表，后续加 Slack / Webhook 不改调用方；投递结果落库可查。

**非目标**

- 不实现 Slack / Webhook 的真实投递（仅保留渠道注册位与配置占位）。
- 不做逐条告警的实时邮件；不做即时聊天式通知。
- 不做基于仓库的订阅关系（单组织模型下暂无仓库 owner 映射）。
- 不做邮件模板的可视化编辑器；模板随代码发布。
- 不做「一键退订」令牌链接（退订统一跳转登录后的个人设置）。
- 不引入通用的摘要调度器；周汇总仅作为可选的固定周期插件（B5），阶段容量不足时移出 backlog。

## 3. 事件分类与默认策略

| 类别 | 语义 | 默认 | 必选性 | 收件人 | 标题标签 |
|:---|:---|:---:|:---:|:---|:---|
| `platform_incident` | 平台自身问题：执行器不可用 / 沙箱降级 / 容器环境异常 | 开 | **必选** | admin / org_admin（+ env 覆盖） | `[平台]` |
| `security_critical` | 仓库存在**未修复**的 `critical` 告警 | 开 | **必选** | 触发者（viewer 除外）+ 全部管理员 + 额外收件人 | `[告警]` |
| `security_high` | 仓库存在**未修复**的 `high` 告警（`critical` 归必选类别，不重复计入） | 开 | 可选 | 触发者 + 已开启该类别的管理员 | `[告警]` |
| `run_failure` | 运行或批次以 `failed` 终止 | 开 | 可选 | 触发者 + 已开启该类别的管理员 | `[运行]` |
| `run_completed` | 运行或批次正常完成摘要 | **关** | 可选 | 触发者（开启后） | `[摘要]` |
| `weekly_digest` | 每周未修复高危汇总（按仓库分组） | **关** | 可选 | 已开启该类别的管理员 | `[周报]` |

- 「必选」= 不提供关闭开关，个人偏好与组织设置均不能关闭；仅 `DEPENDFIX_NOTIFICATION_ENABLED=false` 可整体熔断。
- `security_critical` 必选语义见 §15 D4：组织 `securityHigh` 与个人 `security_high` 关闭时仍发送；同一 run / 批次内与 `security_high` 各发一封，互不合并。
- 「可选」= 组织级设置默认值，个人可进一步关闭；个人无法在组织关闭后重新开启。
- 完成类默认关闭，符合「用户更关心失败」的预期；失败类默认开启。
- `weekly_digest` 默认关闭，避免与「内容未变化不重复推送」冲突；启用后每周一 09:00（服务器时区）发送当前活跃未修复高危快照，可就近关闭。
- 邮件主题固定以 `[dependfix]` 开头，第二段为类别标签，管理员可一眼区分「平台自身问题」与「仓库告警问题」。

## 4. 配置模型与生效规则

### 4.1 三层结构

| 层 | 载体 | 作用 |
|:---|:---|:---|
| 部署层 | env | 总开关、SMTP、收件人上限、平台事件收件人覆盖 |
| 组织层 | `organization.notification_settings_json` | 类别默认开关、严重级别阈值、冷却窗口、每小时上限、额外管理员收件人 |
| 个人层 | `notification_preference` 表 | 每用户每类别的开关（仅可选类别） |

### 4.2 生效优先级

```text
effective(category, user)
  = DEPENDFIX_NOTIFICATION_ENABLED
  && (category ∈ {platform_incident, security_critical} || org.categories[ORG_KEY[category]])
  && (category ∈ {platform_incident, security_critical} || userPreference(user, category))

deliverable(category, user) = effective(category, user) && channel.isAvailable()

ORG_KEY = {
  security_high: 'securityHigh',
  run_failure: 'runFailure',
  run_completed: 'runCompleted',
  weekly_digest: 'weeklyDigest',
}
```

- 必选类别（`platform_incident` / `security_critical`）忽略组织与个人开关，仅受部署总开关约束；两者都不写入个人偏好表。
- 组织冷却默认值固定为 24（组织可在 0-168 内覆盖）。周报触发小时见 §4.5 的 `DEPENDFIX_WEEKLY_DIGEST_HOUR`（默认 9，进程级）。
- `weekly_digest` 与其余可选类别走同一优先级：组织开启是前提，个人可再关闭。
- **个人偏好缺行 = 取角色默认值**（admin / org_admin：`security_high` / `run_failure` 开，`run_completed` / `weekly_digest` 关；viewer 全关）；组织开关是前提条件，不替代个人默认。不写默认行，避免存量用户迁移。
- 渠道可用性在**投递阶段**判定（`deliverable` 仅用于 UI / 测试展示，投递侧唯一落点是 §6.4 的 ⑤）；SMTP 未配置时记录 `noop` 且不占投递键，便于管理员在投递记录中看到「渠道不可用」。

### 4.3 组织设置形状

```typescript
interface NotificationSettings {
    categories: {
        securityHigh: boolean
        runFailure: boolean
        runCompleted: boolean
        weeklyDigest: boolean      // 默认 false；周汇总开关
    }
    severityThreshold: 'critical' | 'high'
    cooldownHours: number          // 0-168，默认 24
    maxPerHour: number             // 1-60，默认 6
    extraAdminRecipients: string[] // 追加管理员收件人，去重 + 邮箱格式校验 + 上限 20
}
```

- 以 JSON 列承载，解析函数为纯函数 + Zod `.strict()`：未知键拒绝、越界值拒绝、缺省字段补默认值（对接 [开发规范](../../standards/development.md) 配置列写入闸门）。
- **`security_critical` 不新增组织键**：必选类别无开关可配，故 `categories` 形状不变（无迁移）；`securityHigh` 只覆盖 `high`。
- 存储前规范化（trim / 小写邮箱 / 去重）；读取失败按默认值降级并 warn，不阻断扫描。

### 4.4 个人偏好

```typescript
interface NotificationPreference {
    userId: string
    category: 'security_high' | 'run_failure' | 'run_completed' | 'weekly_digest'
    channel: 'email'
    enabled: boolean
}
```

- 唯一索引 `(userId, category, channel)`；`platform_incident` 与 `security_critical` 不落行。
- 默认值按角色：admin / org_admin 对 `security_high`、`run_failure` 默认开，对 `run_completed`、`weekly_digest` 默认关；viewer 不接收业务类通知，UI 中开关置灰并注明「当前角色无接收权限」。
- 角色默认值仅在「无偏好行」时生效；用户显式关闭后不再被角色默认覆盖。
- **个人设置页行集合**（`resolveNotificationPreferenceRows`）在四个业务类别前置一条只读的 `security_critical` 行：管理员展示为启用 + 「必选，不可关闭」，viewer 展示为禁用；PATCH 接口对必选类别返回 400，防止绕过 UI 写入。

### 4.5 部署层变量

| 变量 | 默认 | 说明 |
|:---|:---:|:---|
| `DEPENDFIX_NOTIFICATION_ENABLED` | `true` | 总开关（紧急熔断） |
| `DEPENDFIX_ENV_ALERT_RECIPIENTS` | — | 平台事件收件人覆盖（保持既有语义） |
| `DEPENDFIX_NOTIFICATION_RECIPIENT_CAP` | `50` | 单封邮件收件人上限 |
| `DEPENDFIX_WEEKLY_DIGEST_HOUR` | `9` | 周报触发小时（0-23，服务器时区）；非法值回退 9 并 warn；进程级，变更需重启 |

## 5. 收件人路由

| 类别 | 主收件人 | 管理员（已开启该类别） | 说明 |
|:---|:---|:---|:---|
| `platform_incident` | admin / org_admin | 全部必收 | env 覆盖优先；必选类别不读个人偏好 |
| `security_critical` | 触发者（手动触发时；已降级 viewer 除外） | 全部必收 | 必选类别不读组织 / 个人开关与偏好；仍受每小时上限（独立桶）约束 |
| `security_high` | 触发者（手动触发时） | 默认开（个人可关） | 定时 / 批量无触发者时仅管理员 |
| `run_failure` | 触发者 | 默认开（个人可关） | 同上 |
| `run_completed` | 触发者 | 默认关（个人可开） | 定时 / 批量无触发者时不发送 |
| `weekly_digest` | 已开启该类别的管理员 | 即主收件人 | 每周一次；组织开关 + 个人开关同时生效 |

- 新增 `ScanRun.triggeredByUserId` 与 `BatchRun.triggeredByUserId`（可空）：手动触发端点写入当前会话用户；定时计划与系统触发为 `null`；重试入口写入重试操作者，同时保留既有 `retriedFromRunId` 来源链。
- 收件人集合 = 触发者（若有效且偏好生效）∪ 管理员副本（偏好生效）∪ `extraAdminRecipients`；按邮箱去重，超过 `DEPENDFIX_NOTIFICATION_RECIPIENT_CAP` 时截断并 warn。
- 触发者账号若已删除 / 禁用 / 邮箱为空，回退为管理员副本；管理员副本为空且无触发者时记录 `skipped_no_recipient`，不抛错。
- 单组织模型下业务类邮件只发给可触发扫描的角色（admin / org_admin）与实际触发者；viewer 无触发权限，不接收业务类邮件，个人设置中开关置灰。

## 6. 触发点与幂等

### 6.1 平台自身问题

沿用现有链路：`scan-orchestrator.service.ts` 记录 `AuditEvent` 后调用统一通知入口；`platform_incident` 必选，收件人取管理员集合。`audit_event.notified` 语义保持不变。

### 6.2 单仓运行终态

在 `scan-orchestrator.service.ts` 的终态写库分支（`completed` / `failed` / `degraded`）之后触发：

- `run.batchRunId` 非空 → **不发送单仓邮件**，交由批次终态统一合并。
- `run.batchRunId` 为空且 `status = failed` → `run_failure`。
- `status = completed` → 先评估 `security_critical`（必选，恒查 `critical`）与 `security_high`（仅阈值含 `high` 时查 `high`），再评估 `run_completed`（后者默认关）。
- `status = degraded` → 同上评估安全类别（业务结果完整），但不发 `run_failure`：沙箱降级已由既有 `sandbox_degraded` 平台事件覆盖，避免同一现象双发。
- 两类安全类别各发一封、内容只含自身级别；`security_high` 受组织 / 个人开关约束，`security_critical` 不受。

### 6.3 批次终态

在 `persistBatchAggregation()` 条件写回成功且状态首次进入终态时触发；`persistBatchFailedIfRunning()`（全部入队失败）同样触发一次 `run_failure`。

- 聚合可能由详情查询、周期对账、sync 执行结束三处驱动，故触发必须以「条件写回 `persisted = true` + 状态由非终态转为终态」为门槛，不能只看聚合结果。
- 一个批次只产生一封 `security_critical`、一封 `security_high`（跨仓库合并）与一封 `run_failure` / `run_completed`。

### 6.4 幂等与投递记录

新增 `notification_log` 表：

```typescript
interface NotificationLog {
    id: string
    deliveryKey: string | null // 唯一；仅实际投递尝试写入，见下
    category: string
    scopeType: 'platform' | 'run' | 'batch' | 'digest'
    scopeId: string
    channel: string
    fingerprint: string | null // weekly_digest 为 null；常规类别为内容指纹
    recipientUserId: string | null // 周报按用户逐封投递时写入；其余类别为 null（一封多收件人）
    recipientsJson: string
    status: 'sending' | 'sent' | 'noop' | 'failed'
        | 'skipped_duplicate' | 'skipped_cooldown' | 'skipped_throttled' | 'skipped_no_recipient'
    errorMessage: string | null
    createdAt: Date
    sentAt: Date | null
}
```

- **常规去重键**：`deliveryKey = sha256(scopeType:scopeId:category:fingerprint:attemptWindow)`；`now` 为 epoch 毫秒，`attemptWindow = floor(now / max(cooldownHours * 3_600_000, 60_000))`（`cooldownHours=0` 时回落为 1 分钟窗口，避免除零）。该键**仅用于并发占位**，不承担「内容是否变化」判定。
- **周报专用键**：`deliveryKey = sha256('digest', weekKey, recipientIdentity, channel, 'weekly_digest')`，不含 `attemptWindow` 与内容指纹；同一收件人 + 渠道 + 周唯一。`recipientIdentity` 取用户 id；额外管理员收件人没有 userId，取规范化邮箱（日志 `recipientUserId` 记 `null`），仍满足「每收件人每周一封」。周报按用户逐封投递，不共用多收件人键。
- **投递前判定顺序**：① 查询该 scope + category 最近一次 `sent` 的指纹；相同 → 记录 `skipped_duplicate`（`weekly_digest` 除外，见 §7.3）；② 距最近一次 `sent` 未超过窗口 → 记录 `skipped_cooldown`（`weekly_digest` 除外）；③ 超过每小时上限 → `skipped_throttled`（`weekly_digest` 除外）；④ 收件人为空 → `skipped_no_recipient`；⑤ 渠道不可用 → 记录 `noop`（不写 `deliveryKey`）；⑥ 以上均通过 → 以 `status='sending'` 插入 `deliveryKey` 占位，再发送并回写 `sent` / `failed`。
- **占位回收**：`sending` 超过 10 分钟视为进程崩溃遗留，可被下一次尝试回收（删除后重新占位）；`sent` 保留 `deliveryKey`。
- **失败可重试**：`failed` 在回写时把 `deliveryKey` 置空，允许后续运行重试；`noop` 与 `skipped_*` 不写 `deliveryKey`。
- `deliveryKey` 唯一约束冲突 = 另一进程已占位 → 记录 `skipped_duplicate`，保证并发聚合 / 重复查询只发一次。
- **平台事件例外**：`platform_incident` 不进入 ①②（无内容指纹 / 冷却语义），仅以 `auditId` 幂等（`deliveryKey = platform:<auditId>`）；仍走 ③ 每小时上限、④ 收件人为空与 ⑤ 渠道检查。「必选」指不可配置关闭，不等于无限流。
- 平台事件仍以 `audit_event.notified` 为主状态，`notification_log` 记录渠道与投递结果。

### 6.5 周汇总触发

- 固定周期插件在每周一 09:00（`DEPENDFIX_WEEKLY_DIGEST_HOUR` 可覆盖，默认 9）触发；按进程角色只在一个进程运行（复用 M45.3 的 role 守卫），避免 HTTP / worker 双发。周报插件与 `stale-cleanup` 同列 HTTP-only——容器双进程形态下 HTTP 主进程恒存在，worker 跳过（清单见 [platform.md §10.6](../../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程)）。
- `weekKey` 按 ISO 8601 周（如 `2026-W43`）与服务器时区计算；同一用户同一 `weekKey` 只发一次（键见 §6.4 周报专用键）。
- **触发窗口与补发**：本进程启动 30 秒后每 15 分钟检查一次；窗口为「本周一触发时刻起 24 小时」。窗口内重启会补发（周中晚些时候启动不会在工作日中途补发上周周报），窗口外等待下一周。
- **窗口内自愈（2026-10-29 M50.3）**：本进程的同周状态按结果推进（`weekly-digest-attempt.ts`）——`sent` / 全部收件人本周已发（`skipped_duplicate`）为终态；`partial` / `failed` / `noop` 计次并退避 30 分钟重试，单周最多 6 次发信尝试；`skipped_no_recipient` 只退避不计次（窗口内开启个人开关仍可当周补发，且同周同状态在 `notification_log` 最多 1 行）；`skipped_disabled` / `skipped_org_disabled` 不占用本周，下一次节拍立即重查（**不清零**已发生的发信尝试，避免「关一下再开」绕过单周上界）；退避以上一次发送的完成时刻为基准，发送未结束时跳过节拍（重入守卫）。跨进程 / 重启的「每收件人每周一封」仍由逐用户投递键兜底。
- **快照口径**：当前活跃未修复高危（与 §7.1 同口径，`supersededAt IS NULL` 即活跃，不限定 scanRunId），按仓库分组；截断计数取自快照内各告警所属运行（去重）的 `alertsTruncatedBySeverity`。`converged`（本地已满足）随 M51.1 起由 `ScanResult.fixStatus` 承载、不再出现在未修复明细；周报按快照运行汇总单列披露「引擎汇总另有 N 条本地已满足」（同一批告警，一致性披露而非重复计数），**不改明细计数**。披露的取数是「快照中仍有未修复行时，这些行所属运行的 `alertsConverged` 之和」——若某 run 的告警全部已收敛（或快照无未修复行），该 run 的已满足数不单列（既有实现，不虚构来源）。内容未变化也按周发送，这是显式订阅的周期摘要。
- **空快照也发送**：本周没有未修复告警时仍发送一封「本周无未修复告警」摘要——订阅方据此确认周期任务存活，避免把「零告警」误读为「周报停摆」。
- 周报豁免 §6.4 ① 指纹 / ② 冷却 / ③ 每小时上限（自身已有「每用户每渠道每周一次」上限），但仍走 ④ 收件人检查与 ⑤ 渠道检查。
- 组织开启 `weeklyDigest` 后，管理员仍需个人开启才会收到；任一层关闭即不发送。组织关闭时不查询快照、不写投递记录。

## 7. 高危判定与降噪

### 7.1 高危与未修复口径

对单个 run 或批次内全部子 run 查询 `ScanResult`：

```text
severity IN ('critical', 'high')
AND supersededAt IS NULL
AND fixStatus IN ('not-tried', 'failed', 'skipped')
AND scanRunId IN (<scope run ids>)
```

- 「未修复」包含 `not-tried` / `failed` / `skipped`（覆盖跨 major 跳过与交付跳过）；`converged` 表示「本地已满足、无需升级」，不计入引擎的 `alertsUnfixed` 口径。**明细与汇总同源（M51.1）**：引擎报告的 `alertOutcomes` 会按同一键回写 `ScanResult.fixStatus`，因此按明细聚合的通知（`security_critical` / `security_high` / `weekly_digest`）不再把 converged 告警计入活跃明细；回写规则见 [data-model.md §告警级修复结果回写](../modules/data-model.md#告警级修复结果回写-m51-1)。
  - **触发前提**：`success` / `converged` / `failed` 只在修复链路（`fix` / `fix-and-pr`）产生；`report-only` 运行无修复动作，其告警仍按既有口径计入明细（不可修复的会落 `skipped`，与 `not-tried` 同属未修复集合），故默认 `schedule.mode` 为 `report-only` 的部署不受本口径影响（此前已有 `success` 结论的行保持原值，不被 `report-only` 重置）。
  - **`success` 口径首次真正生效**：此前生产路径恒写 `not-tried`，「已修复不计入」形同虚设；回写落地后 `fix` / `fix-and-pr` 运行一旦产出修复，该告警即退出未修复明细（即使上游尚未关闭），后续运行给出新结论时按最新结论重新判定。这是本契约的**行为变更**，发布说明需披露。
  - 存量 run（回写前落库）行仍为 `not-tried`，不回填。
- 已修复（`success`）与已关闭（`supersededAt` 非空）不计入，避免与 GitHub 的已关闭通知重复。
- **截断告警不在 `ScanResult` 中**：引擎只持久化 `limited` 集合。扫描结果需同时读取 `summary.alertsTruncatedBySeverity`（M46.2 新增）的 critical / high 计数，在邮件正文以「另有 N 条截断未纳入明细」披露；无身份信息，不伪造逐条列表。
- 严重级别阈值由组织设置 `severityThreshold` 控制：`high`（默认，通知覆盖 critical + high）或 `critical`（仅 critical）。**类别拆分后**（§15 D4）：`security_critical` 恒查 `critical` 且不受阈值影响；`security_high` 只在阈值为 `high` 时查 `high`，因此阈值语义保持「是否附加 high」，枚举与存储不变。
- 模板展示按严重级别分组的计数与仓库 Top N，单封最多列 50 条，其余折叠为「另有 N 条」；截断计数单独标注，避免少报。

### 7.2 内容指纹

`fingerprint = sha256(sorted(repositoryId + ':' + upstreamId))` 取前 16 位：

- 同一批次 / run 反复聚合时指纹稳定，与「上次已投递指纹」相同即不再发送。
- 同一范围内新增或移除高危告警会改变指纹 → 视为新内容，具备发送资格。
- 指纹变化是发送的**必要条件**，不是充分条件：仍受 24 小时窗口与每小时上限约束。

### 7.3 24 小时窗口与上限

- **同一 `scopeType + scopeId + category` 每 24 小时最多发送一次**（组织可配 0-168，默认 24）。
- **内容未变化不发送**：指纹与上次已投递指纹相同 → 记录 `skipped_duplicate`，即使窗口已过也不重复发送；周期提醒由可选的 `weekly_digest` 承担。
- 指纹变化但仍在窗口内 → 记录 `skipped_cooldown`，窗口结束后的下一轮运行重新评估（以「上次已投递指纹」为基线）。
- 每小时投递上限默认 6（组织可配 1-60）：超出时记录 `skipped_throttled`，不排队补发；下一轮运行重新评估。
- **独立计数桶**（§15 D4）：`security_critical` 的 `sent` 行只计入自身桶、不计入共享桶；共享桶（其余非周报类别）也不统计 `security_critical` 行。数值上限共用同一 `maxPerHour`——既保证 critical 不被批量运行的常规通知挤掉，又保留防邮件风暴兜底。
- 平台事件不参与 24 小时窗口（每条 `AuditEvent` 唯一），但受每小时上限约束。
- `weekly_digest` 不参与指纹与 24 小时窗口：按 `scopeType='digest'` / `scopeId=weekKey` 与 §6.4 周报专用键去重，同一用户同一渠道同一周最多一封（当前渠道仅 email）；内容未变化也按周发送（这是显式订阅的周期摘要）。
- **共享上限计数排除周报行**：周报逐封投递写入的 `sent` 行不计入共享每小时上限（计数查询须排除 `weekly_digest`），否则一次周报可把平台事件 / 安全告警挤成 `skipped_throttled`；与「周报自身豁免上限」是两件事，须同批修改并补「周报发送后常规类别仍可发送」用例。

## 8. 数据模型与迁移

| 变更 | 载体 | 说明 |
|:---|:---|:---|
| 组织通知设置 | `organization.notification_settings_json`（text，可空） | JSON 形状见 §4.3 |
| 个人通知偏好 | 新表 `notification_preference` | 唯一索引 `(userId, category, channel)` |
| 投递记录 | 新表 `notification_log` | 唯一索引 `deliveryKey`；`createdAt` 索引用于列表 |
| 触发者 | `scan_run.triggered_by_user_id` / `batch_run.triggered_by_user_id` | 可空，无外键级联（用户删除后保留字符串） |

- 单个幂等迁移 `AddPlatformNotification`：建表 / 加列前先检查存在性，可重复执行；登记到 `apps/platform/server/database/index.ts` 与迁移注册表测试。
- 不做数据回填：偏好缺行即继承默认；历史 run 的触发者为 `null`，按管理员集合处理。

## 9. API 与 UI

| 端点 | 权限 | 用途 |
|:---|:---|:---|
| `GET /api/notification-preferences` | 登录 | 返回个人覆盖值 + 角色默认 + 生效值 |
| `PATCH /api/notification-preferences` | 登录 | 更新本人偏好（仅可选类别） |
| `GET /api/organizations/current/notification-settings` | admin / org_admin | 读取组织设置与生效值 |
| `PATCH /api/organizations/current/notification-settings` | admin / org_admin | 更新组织设置（Zod `.strict()`） |
| `POST /api/notifications/test` | admin / org_admin | 发送测试邮件（验证 SMTP 配置） |
| `GET /api/notifications` | admin / org_admin | 投递记录列表（分页 + 类别 / 状态筛选） |

**UI**

- 个人：`/settings` 新增「通知偏好」卡片（邮件渠道的类别列表、必选类别置灰说明、退订入口即本页；B1-B4 不提供单独的渠道总开关，SMTP 不可用时由渠道状态提示）。
- 全局：新增管理员页 `/notifications`（导航项仅 admin / org_admin 可见），包含类别默认、阈值、冷却、每小时上限、额外收件人、测试发送与最近 20 条投递记录。
- 文案双语（zh-CN / en-US），与既有 `i18n/locales` 同源；不新增独立语言文件。

## 10. 模板与文案

| 类别 | 主题示例 | 正文要点 |
|:---|:---|:---|
| `platform_incident` | `[dependfix][平台] 执行器不可用 — owner/repo` | 既有环境事件字段 + 类别标签 + 建议动作 |
| `security_critical` | `[dependfix][告警] 3 个 Critical 告警未修复 — 2 个仓库` | 严重级别计数、仓库分组表、告警链接、跳过原因提示 |
| `security_high` | `[dependfix][告警] 3 个 High 告警未修复 — 2 个仓库` | 严重级别计数、仓库分组表、告警链接、跳过原因提示 |
| `run_failure` | `[dependfix][运行] 批次运行失败 — 2/10 仓库` | 失败码 / 阶段 / 可重试判定、失败仓库清单、详情链接 |
| `run_completed` | `[dependfix][摘要] 批次完成 — 修复 8 / 告警 12` | 仓库数、告警数、修复数、耗时、详情链接 |
| `weekly_digest` | `[dependfix][周报] 5 个仓库存在未修复告警 — Critical 2 / High 3` | 按仓库分组的活跃未修复告警快照、截断 / 豁免计数、详情链接 |

- 复用现有 `escapeHtml` / `escapeAttr`，所有动态字段必须转义；纯文本版本同步生成。
- 链接使用公共基地址解析（`NUXT_PUBLIC_BETTER_AUTH_URL`，回退 `NUXT_PUBLIC_BASE_URL`），不写死域名。
- 正文不包含 token、凭据、完整日志或未脱敏 URL。

## 11. 安全与失败语义

- **fail-closed**：SMTP 未配置 → noop；发送失败 → 记录日志与 `notification_log.status='failed'`，不抛错、不影响扫描与批次终态。
- **权限**：组织设置与投递记录仅 admin / org_admin；个人偏好仅本人；所有写入走 Zod 校验。
- **收件人**：邮箱格式校验 + 去重 + 上限；不接受任意自由文本头部注入（主题与收件人由服务端构造）。
- **脱敏**：复用日志脱敏与邮件转义；错误信息仅记录错误码与摘要。
- **审计**：投递记录保留触发范围、指纹、收件人数与状态，不记录邮件正文。

## 12. 实施拆分

| 批次 | 内容 | 预估文件 / 行数 |
|:---|:---|:---|
| B1 承载层 | 迁移 + 3 处实体字段 + 迁移注册 + 迁移幂等测试 | 6-8 文件 / 200-300 行 |
| B2 策略层 | 事件分类、组织设置解析、个人偏好解析、收件人路由、高危查询、指纹与冷却纯函数 + 单测 | 10-14 文件 / 450-700 行（拆两个 commit） |
| B3 投递层 | 统一通知入口、`notification_log` 写入与幂等、模板、run / batch 触发点、平台事件接续 + 单测 | 10-14 文件 / 450-700 行（拆两个 commit） |
| B4 配置与展示 | 6 个 API + 个人卡片 + 管理员页 + i18n + 测试 | 10-14 文件 / 500-800 行（拆两个 commit） |
| B5 周汇总（可选） | ✅ 已落地（M47.5）：周期性插件（HTTP-only 角色守卫）+ 全局活跃快照查询 + 周报模板 + 逐用户投递 + 测试；默认关闭 | 5-8 文件 / 200-350 行 |

- 每个 commit 独立可验证；B3 的触发点接入与模板分开提交，避免单 commit 超 [规划规范 §1.1](../../standards/planning.md) 任务粒度阈值。
- B5 为可选增量：阶段容量不足时按 [规划规范 §3.1.1](../../standards/planning.md) 移出至 backlog，不影响 B1-B4 的交付完整性。
- 设计文档随 B1 一并提交时状态保持「设计中」；全部批次闭环后改为「已落地」。

## 13. 验收标准

- **AC1** 默认策略：完成类不发；失败类发送；高危仅未修复；平台事件与 `security_critical` 必选。
- **AC2** 配置优先级：组织关闭后个人无法开启；必选类别（`platform_incident` / `security_critical`）无法被个人或组织关闭，PATCH 必选类别返回 400；部署总开关可熔断全部通知。
- **AC3** 收件人：平台事件仅管理员；业务事件定向触发者（`triggeredByUserId`）+ 已开启该类别的管理员；`security_critical` 取触发者 + 全部管理员 + 额外收件人（忽略开关）；标题包含 `[平台]` / `[告警]` / `[运行]` / `[摘要]` / `[周报]` 标签。
- **AC4** 合并与幂等：一个批次只发一封 `security_critical`、一封 `security_high`；重复聚合 / 并发查询不重复发送；相同指纹不再重复发送（即使 24 小时窗口已过）。
- **AC5** 降噪：指纹变化且距上次发送超过 24 小时才再次发送；窗口内记录 `skipped_cooldown`；每小时超过上限记录 `skipped_throttled`。
- **AC6** 失败语义：SMTP 未配置 noop；发送异常不阻断扫描；投递记录可查到对应状态与错误码。
- **AC7** 迁移可重复执行且二次运行不报错；实体索引为类级声明（TypeORM 1.x 复合索引要求）。
- **AC8** 测试覆盖：策略 / 路由 / 指纹 / 窗口 / 模板转义 / API 权限 / 迁移幂等单测通过；批次终态集成测试断言只发一封。
- **AC9** 周汇总（✅ M47.5 落地 / ✅ M50.3 补重试）：默认关闭；组织开启且个人开启时，每周一发送一次活跃未修复告警快照（按 ISO 周去重，内容不变也发送）；任一层关闭后不再产生周报邮件；正文披露截断与豁免计数；**窗口内可自愈**——`partial` / `failed` / `noop` 计次并退避 30 分钟重试（单周 ≤6 次发信尝试），`skipped_no_recipient` 只退避不计次且同周同状态只落一行日志，`sent` / 全量已发为终态，配置关闭不占用本周。
- **AC10** 必选 `critical`（✅ M50.1 已落地）：`securityHigh` 与个人 `security_high` 全关时仍投递 `security_critical`；`security_critical` 与 `security_high` 各发一封且内容只含自身级别；critical 使用独立计数桶、其 `sent` 行不计入共享桶，两者共用同一 `maxPerHour`；部署总开关关闭时 critical 亦落 `noop`；存量组织设置无需迁移。

## 14. 风险与缓解

- **R1 邮件风暴**：多个仓库同时失败 → 批次合并 + `maxPerHour` + 24 小时窗口；超限只记录不补发。
- **R2 漏发关键告警**：24 小时窗口可能延迟新高危 → 组织可将窗口调至 0（即时发送）或启用周汇总兜底；平台事件不受窗口约束。
- **R3 收件人扩散**：单组织下无仓库 ACL → 业务邮件仅发触发者与管理员，viewer 不接收；上限 + 去重。
- **R4 触发点重复**：批次聚合三处驱动 → 以条件写回成功 + 状态首次终态为门槛，`deliveryKey` 唯一约束兜底。
- **R5 迁移失败**：SQLite 单文件风险 → 沿用幂等迁移与启动备份；迁移测试覆盖二次执行。
- **R6 模板注入**：动态字段全部转义；主题不接受用户输入。

## 15. 决策记录

- **D1 收件人定向（2026-10-20 用户决策）**：新增 `ScanRun.triggeredByUserId` / `BatchRun.triggeredByUserId`，手动触发精确投递；定时任务无触发者时回退管理员集合。
- **D2 全局配置落点（2026-10-20 用户决策）**：新增管理员页 `/notifications`，承载组织设置、投递记录与测试发送；个人偏好保留在 `/settings`。
- **D3 降噪策略（2026-10-20 用户决策）**：同一 scope + 类别 24 小时内最多发送一次；指纹变化才具备再次发送资格；内容未变化不重复发送；另提供可选的每周汇总（默认关闭）。
- **D4 `critical` 必选（2026-10-24 用户决策 / 2026-10-29 细化 / M50.1 已实现）**：`critical` 级告警**豁免类别开关**——组织 `securityHigh` 与个人 `security_high` 均关闭时仍发送，仅受部署总开关熔断；**保留每小时上限**。实现口径（2026-10-29 用户决策）：新增必选类别 `security_critical`（与 `platform_incident` 同级，不入个人偏好表），`security_high` 收窄为仅 `high`；`severityThreshold` 枚举与语义不变（仅决定是否附加 `high`）；**独立计数桶**（`security_critical` 的 `sent` 行只计入自身上限，不计入共享桶，反之亦然）。冷却与内容指纹保持现状（不随类别开关豁免放开）。**已由 M50.1 落地并同步正文**（§3 表 / §4.2 / §4.4 / §5 / §6.2 / §6.3 / §7.1 / §7.3 / §13 AC1-AC3 + AC10）。
- **D5 通知侧严重级别术语（2026-10-29 用户决策 / M50.2 已实现）**：通知页 / 邮件 / 投递记录统一保留 `Critical` / `High` 专有名词，与扫描侧 `scanSeverityLabel` 单一事实源一致；类别名改为 `Critical 告警` / `High 告警`，阈值标签改为「严重级别阈值」+ 选项 `Critical + High` / `Critical only`；邮件主题的 `[dependfix][告警]` 前缀保持不变（既有过滤契约）。**已由 M50.2 落地并同步 §10 模板文案与 §6.5 空快照文案；§3 类别表沿用既有字段（无需改动）。阈值选项标签由扫描侧 `scan-options.ts` 的严重级别专有名词拼接（`notification-options.ts`），不再各写一套中文译名。**
- **D6 周报重试与窗口锁（2026-10-29 规划 / M50.3 已实现）**：`partial` / `failed` 结果不再占满整周——进程内同周锁按结果分类（仅 `sent` 为终态），窗口内按退避（≥ 30 分钟）重试，已发收件人由逐用户投递键记 `skipped_duplicate`；`skipped_no_recipient` 不永久占锁，同周同状态在 `notification_log` 最多 1 条以控制噪声；窗口长度与触发小时不变。**已由 M50.3 落地并同步 §6.5 与 §13 AC9。**

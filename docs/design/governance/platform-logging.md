# 平台本地日志通道统一设计

> 状态：✅ 已实施（2026-10-28，M49 追加临时待办）；Review Gate：standard 三分区 R1（A/B Pass、C Reject）→ R2（A Reject 新 blocker、B/C Pass）→ R3 **Pass**。
> 决策来源：[第三方可观测性接入评估](../../research/2026-10-27-third-party-observability-evaluation.md) P1（用户 2026-10-27 裁定「本地日志通道统一优先」，Sentry / Axiom 延后）。
> 规范落点：[platform.md §10.9](../../standards/platform.md)、[deployment.md「日志文件」](../../guide/deployment.md#日志文件)。

## 1. 背景

`apps/platform/server/utils/logger.ts`（Winston + `winston-daily-rotate-file`）在实施前是**未接线代码**：服务端非测试源码零调用点，166 处 `console.*` 分布在 43 个文件；Axiom 传输用 `require('@axiomhq/winston')` 且该依赖未声明（ESM 产物下 `require` 不可用）。结果是容器部署只有 stdout（`docker logs`），容器重建后无法回溯，异常退出也没有落到可检索的地方。

本设计只解决「进程级日志有没有统一通道、能否在数据卷里按日期查到」，不引入远程日志服务。

## 2. 通道分工（硬约束）

| 通道 | 载体 | 内容 | 落文件 |
|:---|:---|:---|:---|
| 进程级日志 | `server/utils/logger.ts`（Winston） | 启动行 / 队列模式 / 执行器 clone 与失败 / 通知投递 / 周期任务结果 | ✅ `LOG_DIR` 文件 |
| 运行级日志 | `server/utils/memory-logger.ts`（`MemoryLogger`） | 单次 run 的引擎输出（安装、验证、PR 交付） | ❌ 仅控制台 + `ScanRun.logsJson` |

`MemoryLogger` **不得**改为写统一日志文件：运行日志本身已有 `logsJson` 持久化与运行详情下载，再落一份文件会造成双写与体积翻倍。

## 3. 文件布局与轮转

> 本节是文件命名 / 轮转 / 保留 / 压缩阈值在**规范层**的唯一权威——[platform.md §10.9](../../standards/platform.md) 只声明硬约束并引用本节，不重复数值；[deployment.md「日志文件」](../../guide/deployment.md#日志文件) 的操作性复述不构成第二事实源，出现差异以本节为准。

- `LOG_DIR/YYYY-MM-DD.log`：按 `LOG_LEVEL` 过滤的全量日志。
- `LOG_DIR/YYYY-MM-DD.errors.log`：仅 `error`（含致命错误），便于告警 / 巡检。
- 轮转：按日 `datePattern=YYYY-MM-DD`，单文件 `maxSize=20m`，`maxFiles=31d`；生产构建 `zippedArchive=true`。
- 隐藏记账文件：`.{role}-combined-audit.json` / `.{role}-errors-audit.json`（`role` = `server` / `worker`），由 `file-stream-rotator` 维护保留列表，**不参与业务检索**。

## 4. 配置面

| 变量 | 默认 | 校验与回退 |
|:---|:---|:---|
| `LOG_DIR` | `data/logs`（入口派生 `$DATA_DIR/logs`） | 绝对路径直接用；相对路径按进程 cwd 解析；空串视为未设置；目录不可创建 / 写探针失败 → warn + 仅控制台；落在 `/proc` / `/sys` 下直接禁用文件通道（伪文件系统上递归 `mkdir` 会长时间阻塞，启动期不能挂住） |
| `LOG_LEVEL` | `info` | 白名单 `error/warn/info/http/verbose/debug/silly`；控制台与文件同级过滤；未知值回退 `info` 并 warn（非法级别交给 winston 等价静默丢日志） |
| `LOGFILES` | `true`；`NODE_ENV=test` 时 `false` | 接受 `true/false` · `1/0` · `yes/no` · `on/off`（大小写 / 空白容忍）；空串视为未设置；**其余取值回退默认并 warn**（静默按「开」会让拼错值的部署以为已关闭）；显式 `true` 在测试环境仍生效 |

**入口派生**：`entrypoint.sh` 在 DATA_DIR 归一化后 `LOG_DIR=${LOG_DIR:-$DATA_DIR_CANON/logs}` 并 `export`；目录以运行身份（root 启动时经 `su-exec`）创建，创建失败不阻断——日志模块自带写探针兜底。相对 `LOG_DIR` 入口不代建（按平台进程 cwd `/app` 解析）。

**单测隔离**：`NODE_ENV=test` 默认关文件通道，避免 import 即创建仓库内 `data/logs`；真实落盘用系统临时目录的集成测试覆盖。

## 5. 多进程共存

容器默认 HTTP + 队列 worker 双进程共享同一日志目录，因此：

1. **audit 记账按角色 + 文件类型隔离**：`file-stream-rotator` 的 audit JSON 是整文件 `writeFileSync`，两进程同 options 会共写同一份（互相覆盖 / 截断风险），主日志与错误日志若共用也会互删对方的文件列表。
2. **写探针唯一名**：探针文件名带 `pid` + 时间戳。固定名会让两进程互删探针（A 写 → B 删 → A `unlink` ENOENT），把可写目录误判为不可写。

**已知边界**：
1. 两进程对同一 `%DATE%.log` 的写入是「追加 + 各自独立轮转记账」——同一毫秒内的跨进程轮转可能把个别行写进前一天的归档文件，但**不丢行**；生产压缩时两进程可能各写一次 `.gz`（默认覆盖写），存在归档件截断窗口。彻底避免需单写者（syslog / 侧车），超出本地通道范围。
2. **同角色多副本不受支持**：audit 隔离键是角色而非进程，同角色第二个进程（多副本 / 手工再起一个）会共用同一份 audit JSON 与轮转记账。部署侧不要以同一角色并行多实例写同一 `LOG_DIR`。

## 6. 致命错误路径

- `uncaughtException` / `unhandledRejection` → `[fatal] <kind>: <name>: <message>` + `stack`，先以 `writeSync(2)` 写 stderr（`docker logs` 可见，同步写不依赖流刷新），再**同步** `appendFileSync` 到**当日** `YYYY-MM-DD.errors.log`，最后 `exit(1)`。`LOGFILES=false` 或目录不可写时只保留 stderr，进程退出语义不变。
- 语义与 Node 默认一致（`unhandledRejection` 默认 `throw` 亦以退出收场），**不吞异常继续运行**；容器按 `restart` 策略自愈，worker 另有入口看护循环。
- **不使用** winston 内置 `exceptionHandlers` / `rejectionHandlers`：其写入走异步流，`exitOnError` 在 `process.exit` 前不保证刷盘，验收「致命错误进入错误文件」无法确定性成立。
- 幂等：安装标记挂 `Symbol.for('dependfix.platform.process-log.installed')`（dev 热重载不重复注册）；nitro `close` 钩子卸载并 `logger.close()` 冲刷缓冲。

## 7. 脱敏

- 消息与 context 都过 `sanitizeDeep`：任意 scheme 的 URL 内嵌凭据 / `Authorization` / GitHub token 前缀（含 `github_pat_`）/ 敏感字段名（`token` / `secret` / `passw*` / `credential` / `api-key` / `private-key` / `connection-string` / `access-key`）/ PEM 私钥块（整体替换为 `[redacted-private-key]`）。
- `Error` 实例展开为 `{ name, message, stack, code?, cause? }`——`message` / `stack` 是非可枚举属性，`Object.entries()` 只能得到 `{}`；`cause` 递归脱敏。
- 循环引用（含 `Error.cause` 自引用 / 互为 cause）替换为 `[Circular]`，脱敏不会爆栈；对象逐 key 取值，抛错 getter 只降级该字段。
- **已知边界**：未编码的 `@` / `/` 出现在 URL 凭据内部时只能部分遮蔽（正则无法可靠切分），不要依赖日志脱敏兜底不合规的 URL。
- 消息内的 CR/LF 归一为字面 `\n`，防止单条消息伪造多行日志（日志注入）。
- **已知边界**：`mailer` 的收件人邮箱（`to=`）按投递审计需要保留原文（不在脱敏规则内，落文件 31 天）；如需进一步收敛，应在邮件域单独评估哈希 / 掩码。
- 致命行复用 `buildFileFormatLine`，与 winston 文件格式同构（`<时间戳> ERROR <消息> {<meta>}`），检索口径一致。

## 8. 接入面

本批接入 5 类边界：

1. 进程级：新增 `server/plugins/logger.ts`（HTTP + worker 都执行，登记为 `NON_HTTP_ONLY_PLUGINS`）。
2. Nitro 启动插件：`build-info` / `resource-probe` / `database-bootstrap` / `queue-consumer` / `stale-cleanup` / `weekly-digest`（`shouldSkipHttpOnlyPlugin` 注入统一 logger，跳过日志也进文件；`queue-consumer` 在 worker / 单进程形态启动消费端，双进程的 HTTP 主进程为 no-op）。
3. 队列 worker：`queue.service` / `scan-worker` / `scan-queue` / `orphan-job-release`。
4. 执行器：`container-executor`（进程级行，与 `MemoryLogger` 的运行级行并存）/ `scan-orchestrator.service`（通知与审计失败）。
5. 通知：`notification/index` / `delivery` / `weekly-digest.service` / `mailer`。

**未迁移**（2026-10-28 实测）：`apps/platform/server` 非测试源码仍有 **112 处 / 28 文件** `console.*`（含 logger 自身降级输出 6 处与 `MemoryLogger` 运行级输出 3 处；业务侧约 103 处），最大面是 `server/database/**`（63 处，含迁移 / 备份 / 回填 / 回滚脚本）、`monitor/*`、`batch/*`、`scan-trigger.service`、`auth.ts` 等；仍走 stdout，按批次迁移，本设计不要求一次性全量替换。

## 9. 不做什么

- 不接入 Axiom / Sentry / 其它远程通道；Axiom 传输层已从 logger 移除（未声明依赖 + ESM `require` 不可用），P2 接入时按动态 `import()` 重写并默认关闭。
- 不改变运行结果模型、`logsJson` 结构与运行详情下载。
- 不引入结构化日志规范（JSON 字段名 / 事件码表），当前沿用消息 + meta 的既有格式。
- 不做按角色拆日志文件名（HTTP / worker 共享 `YYYY-MM-DD.log`），避免与验收的文件命名口径冲突。

## 10. 验收与机检落点

| 验收 | 证据 |
|:---|:---|
| 按日期可查主日志 / 错误日志，错误单独留档 | `server/utils/logger.files.test.ts`（真实临时目录 + 真实 winston） |
| 双进程不共写 audit / 探针不互删 | 同上（角色 audit 断言）+ `logger.test.ts`（探针名唯一） |
| 目录不可写回退控制台且不阻断 | `logger.test.ts` / `logger.files.test.ts` |
| `/proc` / `/sys` 不触碰文件系统直接禁用（防启动阻塞） | `logger.test.ts`（`isUnsupportedLogDir` + createWinstonLogger 分支） |
| 致命错误同步落盘并 fail-fast | `server/utils/process-log.test.ts`（fake 进程 + fs mock；stderr 走 `writeSync`） |
| 凭据不落盘（真实文件，非 mock winston） | `logger.files.test.ts`（消息 / context / `postgres://` URL 写入真实临时文件后断言无明文） |
| worker 角色同样落主日志 / 错误日志 | `logger.files.test.ts`（`DEPENDFIX_ROLE=worker`） |
| `process.exit` 前的同步行（迁移失败路径） | `plugins/database-bootstrap.test.ts` |
| 启动行标明落点 / 级别 / 角色；close 卸载 | `server/plugins/logger.test.ts` |
| 入口派生 `LOG_DIR` / 建目录 / 相对路径不代建 | `docker/entrypoint.test.mjs` |
| 脱敏（消息 / context / Error / 循环） | `server/utils/sanitize.test.ts` + `logger.test.ts` |
| 5 处边界接入 | 上述边界的既有单测（日志断言改为 logger mock） |

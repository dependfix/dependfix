# M65 平台可观测性与健康（2026-11-21 规划 / 2026-11-23 归档）

## 当前阶段

**M65 平台可观测性与健康**（2026-11-21 规划，5 原子）：

- **目标**：把「平台出问题后靠人肉巡检」换成三条可复核的观测通道——Sentry 事件、容器与外部 uptime 探针、PR 构建失败的原生日志；同时把 SMTP 挂起这条周报停摆风险显性化。
- **原子**：M65.1 Sentry 错误 / 性能 / 日志接入（P1 🛠️）/ M65.2 健康检查与外部 uptime 接入（P2 🚀）/ M65.3 邮件传输超时与周报节拍约束（P2 🛠️）/ M65.4 PR Check provider 原生日志富化（P2 🎨）/ M65.5 可观测性门禁与脱敏测试矩阵（P2 🧪）。
- **容量**：17-23 commits / 34-50 files / 1,480-2,340 行（逐原子求和）。
- **顺序**：M65.1 → M65.2 → M65.3 → M65.4 → M65.5。
- **详情**：[todo 归档分片](todo-archive-phases-m65.md)；规划期候选池 [backlog.md](../backlog.md)（28 条候选 + 2 条待上收）。

---

## 归档结论

- 5 原子全部闭环；Review Gate 全部 Pass（M65.1 / M65.2 代码 / 文档分区各自 R2 Pass，M65.3 standard R2 Pass，M65.4 三分区 R2 Pass，M65.5 R3 Pass）。
- 阶段窗口首父链 56 commits（外部 13：依赖升级 11 + 1.2.0 发布 2）、唯一 diff 169 文件 / +7051 −423（`c55c5d1d^..24efc08c`，2026-11-23 实测）。
- M65.2 AC1 于归档前回填容器证据：仓库 Dockerfile + `APK_MIRROR` 构建参数重建，`smoke-test.sh` 通过，`docker inspect` 数秒内 `healthy`（本机复现 5.5–13s）；DB 不可读时 liveness 200 / readiness 503、`RestartCount=0`。
- 正文与逐原子验收证据见 [todo 归档分片](todo-archive-phases-m65.md)。
- 残余：真实 Sentry DSN / Vercel·Cloudflare token 联调、外部 uptime 与反向代理、`pg` / `mysql`、SMTP 黑洞与多收件人累计时长均未实测；worker `exit(1)` 可能丢尾部事件；`platform.md` 字符预算超健康线。已登记 backlog 待人工验收 / 已知边界与设计稿边界。

# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | M65 平台可观测性与健康（2026-11-21 规划，5 原子） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M64 已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M64 已归档，M65 规划中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M65 平台可观测性与健康（2026-11-21 规划）

> **目标**：把「平台出问题后靠人肉巡检」换成三条可复核的观测通道——Sentry 事件（错误 / 性能 / 关键日志）、容器与外部 uptime 探针（进程 / 容器 / DB 三类故障）、PR 构建失败的原生日志（provider 层）；同时把 SMTP 挂起这条已知的周报停摆风险显性化。
>
> **来源**：用户 2026-11-21 选定主题 B（平台可观测性与健康）。上收 4 条候选——Sentry 错误 / 性能 / 日志接入（P1，1.0 后暂缓项，1.1.0 已发布后解禁）、平台健康检查与外部 uptime 接入（P2）、邮件传输超时与周报节拍约束显式化（P2）、PR Check 三源信号的 provider 原生日志富化（P2）；另设 1 条测试门禁原子（🧪，类型平衡）。直接输入：[第三方可观测性评估](../research/2026-10-27-third-party-observability-evaluation.md)、M43.2 D2（日志富化延后）、M50.3 残余（SMTP 超时）。
>
> **§3.4 五步交叉核验（2026-11-21 实测）**：
> ① 归档扫描 `Sentry|uptime|HEALTHCHECK|日志富化|connectionTimeout` → 命中项均为「延后 / 未上收 / 未采用」结论（M49 决策块、M50 残余、M43.2 D2、M44.6 依赖表清理），**无闭环实现**；
> ② `git log --all --grep="Sentry"` → 仅评估与依赖表清理（`ea07afa9` / `0846a184` / `a99ba46a` / `c2347d7f`），无接入提交；`--grep="uptime"` 零命中；
> ③ 代码 anchor：`apps/platform/package.json` 无 `@sentry/*` 依赖；`apps/platform/Dockerfile` 无 `HEALTHCHECK`；`apps/platform/server/api/health.get.ts` 仅返回 `{version, commit, startedAt, schema}`；`mailer/transport.ts` 的 `SMTPTransport.Options` 无三个超时；`pr-check-watch.ts` 只采集 check-runs / statuses / deployments，无 provider 日志；`apps/platform/shared/sanitize.ts` 已存在（候选描述的「抽取」已不成立，随上收删除该子项）；
> ④ 决策前提：用户已选主题 B；Sentry DSN 与 Vercel / Cloudflare token 均未提供，真实联调按未证实登记；provider 凭据承载面未定（D4）；
> ⑤ backlog 同步：4 条候选上收 + M64.5 遗留的「规划模型 v1 首次产出」验证候选闭环移除（33 → 28），待上收 2 条不动，`check-doc-governance` 无新增 warning。
>
> **容量基线（逐原子交付物求和，规划轮估算）**：commits 17-23 / files 34-50 / 行 1,480-2,340（行 = diff 改动量含删除；测量方 = 规划角色）。
> 类型（按主类型计数）：🛠️2（M65.1 / M65.3）+ 🚀1（M65.2）+ 🎨1（M65.4）+ 🧪1（M65.5）；🛡️ 内嵌各原子（零出网 / 脱敏 / 凭据只读）。
> **🎨 缺口显式标注**：独立 UX 原子 1 项（低于建议值 2），理由是本期定位为运维可观测性建设，M65.4 承担唯一用户可感知交付（失败详情可看原生日志）；平台侧交付载体（issue / 草稿 PR）与验证跳过可观测性留在 backlog。
>
> **执行顺序**：M65.1 → M65.2 → M65.3 → M65.4 → M65.5（M65.1 先落 `platform-observability.md` 设计稿与脱敏复用，M65.5 在外部通道接口落地后收口守卫）。
>
> **D 阶段决策点**：D1（M65.1）Sentry 初始化形态（`@sentry/nuxt` 模块 vs 手动 client/server init）、采样率与 PII 关闭项、日志转发范围；D2（M65.2）liveness / readiness 是否拆两个端点、HEALTHCHECK 的 `start-period` / `retries` 取值；D3（M65.3）三个超时的默认值与启动断言落点（plugin vs transport 工厂）；D4（M65.4）provider 凭据承载（复用 credential 类型扩展 vs 仓库级配置）与单信号日志上限；D5（M65.5）外部通道测试注入方式（依赖注入 stub transport vs 全局拦截）。
>
> **前置 / 风险**：`@sentry/nuxt` 与 Nuxt 4.6 的兼容性未验证（M65.1 首个 D 动作做最小 spike，不通过则退到手动 init）；DSN / provider token 缺失时按未证实登记，不得声称真实联调；HEALTHCHECK 参数不当可造成重启循环（只探 liveness + `start-period`）；provider 日志涉及凭据面扩大与配额（仓库级显式启用 + 只读 token + 审计）。

### 进度总览

| 大条目 | 小条目 | 状态 | 提交 | 审计 | 容量 |
|:--|:--|:--|:--|:--|:--|
| M65.1 Sentry 错误 / 性能 / 日志接入 | — | ⏳ 待开始 | — | — | 5-7 commits / 11-16 files / 600-900 行 |
| M65.2 健康检查与外部 uptime 接入 | — | ⏳ 待开始 | — | — | 3-4 commits / 6-9 files / 200-320 行 |
| M65.3 邮件传输超时与周报节拍约束 | — | ⏳ 待开始 | — | — | 2 commits / 3-4 files / 100-160 行 |
| M65.4 PR Check provider 原生日志富化 | M65.4.1 / M65.4.2 / M65.4.3 | ⏳ 待开始 | — | — | 5-7 commits / 9-14 files / 400-700 行 |
| M65.5 可观测性门禁与脱敏测试矩阵 | — | ⏳ 待开始 | — | — | 2-3 commits / 5-7 files / 180-260 行 |

> `提交` 列为首末 commit 区间与**该条目自身** commit 数（交错执行时小于区间内提交总数；归档批次可再精修）；`审计` 列为 Review Gate 轮次结论；小条目列在原子内拆分子任务时填写；小条目交付物区间为原子内重叠估算（文件量与行数均与大条目有交集），不重复计入容量基线。

### M65.1 Sentry 错误 / 性能 / 日志接入（P1 🛠️）

- **目标**：配置 DSN 时，未捕获异常、API 5xx、worker 异常与 Web Vitals 可在 Sentry 按 release + route 检索；未配置 DSN 时 SDK 零初始化、零出网。
- **优先级**：P1（1.0 后首个可观测性通道；当前线上 500 只能翻本地日志文件，跨实例不可见）。
- **范围**：
  - 新建 `docs/design/governance/platform-observability.md`（三通道：Sentry / uptime 探针 / provider 日志；含采集字段、关闭项与未证实边界）；
  - `apps/platform/package.json` + `apps/platform/nuxt.config.ts`：`@sentry/nuxt` 依赖与模块配置、`sourcemaps.disable`、DSN 与采样率 env 名；
  - `apps/platform/sentry.client.config.ts` / `sentry.server.config.ts`（或等价 plugin 落点，D1 定）；
  - `apps/platform/server/utils/logger.ts`：≤10 处生命周期事件转发（启动 / 队列 / 执行失败 / 通知失败），脱敏复用 `apps/platform/shared/sanitize.ts`；
  - 文档同源：`docs/design/governance/platform-logging.md §8 接入面`、`docs/guide/configuration.md`（env 表）、`docs/design/governance/architecture.md` 技术选型表 Sentry 行（「未采用」→「已采用，M65.1」）。
- **验收标准**：
  - AC1：未配置 DSN 时，observability 用例断言 SDK 未初始化且 stub transport 收到 0 次请求；
  - AC2：配置 DSN + stub transport 时，模拟 API 500 与 worker 异常各产生 1 条事件，含 release / commit 与 route（或 transaction 名）；
  - AC3：token / Cookie / URL query / OAuth `code`·`state` 六类样例不出现在事件 payload（逐类断言）；
  - AC4：`sourcemaps.disable` 为 true；错误与 Web Vitals 采样率由 env 控制并有配置表与用例；
  - AC5：`pnpm run lint:check` / `pnpm typecheck` / `pnpm run gates:docs` 通过。
- **不做什么**：Replay、source map 上传、CLI / Action 遥测、Umami / Clarity / GA / 百度统计、`consoleLoggingIntegration`；不把运行级 `MemoryLogger` 内容整体转发。
- **依赖**：[第三方可观测性评估](../research/2026-10-27-third-party-observability-evaluation.md)；`apps/platform/shared/sanitize.ts`；Sentry SaaS 项目与 DSN（真实联调需用户提供，未提供按未证实登记）。
- **交付物**：5-7 commits / 11-16 files（设计稿 + 依赖与配置 + client/server 初始化 + 日志转发 + 用例 + 三处文档）/ 600-900 行；单 commit ≤ 10 files，按 AC 分组提交。
- **风险与缓解**：采集面过宽 → 显式关闭 URL query / GraphQL / request body 采集，并关闭 PII；Nuxt 4.6 兼容性 → D1 先跑最小 spike（仅 server init + 一条错误上报），不通过退到手动 `init()`；DSN 缺失导致 CI 外联 → 默认 disabled 由单测钉死，CI 不注入真实 DSN。

### M65.2 健康检查与外部 uptime 接入（P2 🚀）

- **目标**：进程死亡 / 容器未启动 / DB 不可读三类故障可被编排器与外部 uptime 自动发现，而不是等人打开页面。
- **优先级**：P2（1.0 后部署面缺口；容器当前无健康探针，编排器无法区分「启动中」与「已死」）。
- **范围**：
  - `apps/platform/Dockerfile`：`HEALTHCHECK`（只探 liveness，node 单行 fetch，不依赖 curl）；
  - `apps/platform/server/api/health.get.ts` + `apps/platform/server/services/view/health.ts`：liveness 与 readiness 区分（readiness 检查 DB 可读），详情端点鉴权（D2 定形态）；
  - `docs/guide/deployment.md`：探针命令、外部 uptime 配置示例与误判缓解；
  - `docs/standards/platform.md §3.3 / §10.7`：健康契约与字段口径同源。
- **验收标准**：
  - AC1：本地或 CI 构建镜像后 `docker inspect` 显示 `healthy`（未跑成须登记未证实）；
  - AC2：DB 不可读时 readiness 非 200、liveness 仍 200（用例 + 手工命令）；
  - AC3：公开 `/api/health` 字段集合仍为 `{version, commit, startedAt, schema}`，新增字段不得含凭据 / DB 明细；
  - AC4：部署文档含探针命令、外部 uptime 配置示例与 `start-period` 误判缓解说明。
- **不做什么**：不暴露 DB / Redis 连接细节；不绑定商业 uptime 服务；不改运行模型与进程角色划分。
- **依赖**：M57 schema 漂移检测已提供的 `schema` 字段；`docs/design/governance/platform-observability.md`（M65.1 首提交新建）。
- **交付物**：3-4 commits / 6-9 files（Dockerfile + 端点与视图 + 用例 + 两处文档）/ 200-320 行。
- **风险与缓解**：DB 慢触发重启循环 → HEALTHCHECK 只探 liveness，readiness 单独供编排 / uptime 使用；alpine 镜像无 curl → 用 `node -e "fetch(...)"`；外部服务差异 → 文档给出通用 HTTP 探针口径而非绑定产品。

### M65.3 邮件传输超时与周报节拍约束（P2 🛠️）

- **目标**：SMTP 发送不会无限挂起；「传输超时必须小于周报检查间隔」从隐式默认值关系变成显式断言。
- **优先级**：P2（M50.3 重入守卫已落地，但某次发送永不 settle 时周报会永久停摆，仅靠 nodemailer 默认值兜底）。
- **范围**：
  - `apps/platform/server/services/mailer/transport.ts`：显式 `connectionTimeout` / `socketTimeout` / `greetingTimeout`，注释锁定与周报节拍的关系；
  - `apps/platform/server/plugins/weekly-digest.ts`（或启动断言工具）：断言 `socketTimeout < WEEKLY_DIGEST_CHECK_INTERVAL_MS`，违反时 warn 并带两者数值；
  - `docs/design/governance/platform-notification.md §6.5`：约束成文。
- **验收标准**：
  - AC1：transport options 显式含三个超时且取值有单测断言；
  - AC2：启动期校验函数在超时 ≥ 节拍时返回违规并输出两者数值（用例覆盖正常 / 违规两向）；
  - AC3：既有 mailer 与 weekly digest 用例全绿，投递语义无变化；
  - AC4：注释与设计稿同源。
- **不做什么**：不改周报投递语义与退避策略；不引入重试队列；不升级 nodemailer。
- **依赖**：M50.3 重入守卫；`WEEKLY_DIGEST_CHECK_INTERVAL_MS`（15 分钟）。
- **交付物**：2 commits / 3-4 files（transport + 断言 + 用例 + 设计稿）/ 100-160 行。
- **风险与缓解**：超时过短误杀慢 relay → 默认值取 ≥ 60s 且只 warn 不 fail；断言依赖常量导入 → 校验函数接收节拍参数，便于单测注入。

### M65.4 PR Check provider 原生日志富化（P2 🎨）

- **目标**：失败信号除 provider 名与 GitHub 摘要外，在配置了 provider token 时可看到原生构建日志尾部（限量、脱敏）；未配置时行为与现状完全等价。
- **优先级**：P2（M43.2 D2 明确留作后续增量；当前「信号已失败但无日志可看」只能人工去各 provider 控制台翻）。
- **范围**：
  - `packages/engine/src/github/pr-check-watch.ts`：Layer 5 adapter 契约接入点（不改变三源归一化与聚合判据）；
  - 新增 `packages/engine/src/github/pr-check-logs/`（`index.ts` + `vercel.ts` + `cloudflare.ts`）；
  - 凭据承载：复用 `apps/platform/server/entities/credential.ts` 扩展或仓库级配置（D4 定），只读 token + 写入审计；
  - `apps/platform/server/services/view/pr-checks.ts` + 详情组件：日志尾部或不可用原因展示；
  - `docs/design/governance/pr-build-deploy-signals.md`：D2 翻转 + 新增 §3.12（Layer 5 落地与边界）。
- **验收标准**：
  - AC1：无 provider token 时零额外请求，聚合状态与告警保持不变（用例 + 请求计数断言）；
  - AC2：有 token 时按 provider 拉取日志尾部，单信号日志 ≤ 8 KB 且 token / Cookie / URL 样例已脱敏；
  - AC3：拉取失败（401 / 429 / 超时）降级为「不可用 + 原因」，不改变 `overallStatus` 与 `failureSources`；
  - AC4：UI 失败详情可看到日志尾部或不可用原因（组件用例）；
  - AC5：凭据写入面产生审计事件，且用途为只读。
- **不做什么**：不做逐行全量日志；不做 provider 无关的通用日志 API；不改阻断语义与告警关注集；不解析非自有分支。
- **依赖**：[PR 构建部署信号设计](../design/governance/pr-build-deploy-signals.md) Layer 5；`docs/design/governance/platform-observability.md`（M65.1 首提交新建）；provider token（真实联调未提供则 gated 用例 + 未证实登记）。
- **交付物**：5-7 commits / 9-14 files（契约 + 两个 adapter + 凭据面 + 视图与组件 + 用例 + 设计稿）/ 400-700 行。
- **风险与缓解**：凭据面扩大 → 仓库级显式启用 + 只读 token + 审计事件；配额与限流 → 每轮每仓库上限 + 失败退避；日志泄密 → 复用 sanitize + 硬上限截断 + 真实生成值取样用例。

#### M65.4.1 契约与凭据承载

- **目标**：定 Layer 5 adapter 契约（provider / 信号入参 → 日志尾部或不可用原因）与仓库级凭据承载形态（D4）。
- **验收标准**：契约类型与 Zod 校验落地；凭据读取单一入口；写入面审计事件；契约用例覆盖成功 / 不可用两向。
- **交付物**：2 commits / 3-4 files / 150-250 行。
- **依赖**：D4 决策；`docs/design/governance/platform-observability.md`（M65.1 首提交新建）。

#### M65.4.2 采集适配器与持久化

- **目标**：Vercel / Cloudflare 两个 adapter 按契约拉取日志尾部并持久化，失败降级不改变聚合结论。
- **验收标准**：AC2 / AC3；每 provider 覆盖成功 / 401 / 429 / 超时；日志上限与脱敏断言。
- **交付物**：2-3 commits / 3-5 files / 150-250 行。
- **依赖**：M65.4.1。

#### M65.4.3 展示与降级口径

- **目标**：失败详情展示日志尾部或不可用原因；未配置 token 时与现状一致。
- **验收标准**：AC1 / AC4；组件用例；设计稿 D2 翻转与 §3.12 成文。
- **交付物**：1-2 commits / 3-5 files / 100-200 行。
- **依赖**：M65.4.2。

### M65.5 可观测性门禁与脱敏测试矩阵（P2 🧪）

- **目标**：三条外部通道（Sentry / uptime / provider 日志）具备「未配置零出网」与「已配置必脱敏」的双向守卫，后续改动不能静默外联或静默泄露。
- **优先级**：P2（外部通道一旦接入，缺守卫的回归会直接变成线上数据泄露或隐性计费）。
- **范围**：
  - `apps/platform/tests/` 或就近单测：Sentry 未配置零初始化、DSN 与事件脱敏、uptime 端点字段白名单；
  - `packages/engine/src/github/pr-check-logs/*.test.ts`：日志截断与脱敏；
  - `docs/standards/testing.md` 增一条「外部通道测试口径」（零出网 + 真实生成值取样 + 依赖注入）——该条款与矩阵行由外部通道守卫触发，不构成独立治理需求；
  - `code-quality-checklist` 检查点矩阵增加「外部通道」一行。
- **验收标准**：
  - AC1：未配置 → 零出网、已配置 → 脱敏两向用例覆盖 Sentry 与 provider 日志；
  - AC2：脱敏用真实生成值批量取样（`ghp_` / `dfk_` / URL 内嵌凭据 ≥ 3 类各 ≥ 5 例），不用手写单例；
  - AC3：新增用例 ≥ 12，`pnpm test` 全绿；
  - AC4：检查点矩阵含外部通道行且与 testing.md 条款对应。
- **不做什么**：不引入全局网络拦截 hook；不改既有脱敏规则语义；不为外部 SaaS 起真实网络集成测试。
- **依赖**：M65.1 / M65.4 接口落地（顺序在最后）。
- **交付物**：2-3 commits / 5-7 files（用例 + 规范条款 + 检查点矩阵）/ 180-260 行。
- **风险与缓解**：测试注入过度 → 用依赖注入的 stub transport，不用全局 mock；门禁误伤正常请求 → 断言只在 test env 生效；矩阵与条款双写漂移 → 矩阵行引用条款锚点，不复制正文。

### 追加临时待办（不占阶段条目编号）

- **发布口径修正：engines-only breaking 按 minor（2026-11-21 用户授权）** —— 目标：`release:plan` 不再把「仅抬 `package.json` 的 `engines.node` 补丁 / 支持下限」的 breaking 推导为 major；保留历史，不改写 `b33746f4`。范围：`scripts/create-release-plan.mjs`（engines-only 判定 + 删除大版本线回退 major + 计划正文注明）、`scripts/create-release-plan.test.mjs`、`docs/guide/release.md`、`docs/design/governance/release-pipeline.md`、`docs/design/governance/release-1.0-readiness.md §2.4`、`docs/guide/contract-freeze.md §7`。验收：① 真实历史 `pnpm release:plan` 输出六个包均 minor；② 定向用例覆盖「抬补丁 / 新增版本线 → minor」「删除大版本线 → major」；③ `pnpm run gates:docs` 通过；④ `pnpm run lint:check` 0 error。风险与依赖：判定依赖 diff 形态（仅 `"node":` 行）与文件集合，其它形态保守回退 major；历史提交不改写，`@v1` 引用策略不变。**闭环（2026-11-21，`790557e7`）**：真实历史 `release:plan` 六包 minor、37 定向用例通过、`gates:docs` 22 项、`lint:check` 0 error。

- **破坏性提交人工审查：规范与 skill（2026-11-21 用户授权，issue #270）** —— 目标：破坏性提交（主题 `!` 或 `BREAKING CHANGE:` footer）落库前取得项目所有者 / 授权人确认，并以 `Breaking-Review:` 记录。范围：`docs/standards/git.md §3.9`（判定 / 时机 / 主体 / 记录格式 / 重确认 / 批次 / engines-only / 执行分工 / 机检状态）、`.github/skills/conventional-committer/SKILL.md`（工作流 3.6-3.7 + 破坏性提交段 + 反模式 + 检查清单 + footer 枚举）、`.github/skills/code-reviewer/references/code-quality-checklist.md`（检查点矩阵 1 行）、`scripts/commitlint/no-diff-stats.mjs` + 用例（前置修复：`no-diff-stats` 把 `2026-11-21` 的 `-21` 判为 diff 行数，会拦死合规消息）、`docs/plan/backlog.md`（机检候选 + 待上收计数）、`docs/plan/roadmap.md`、`docs/plan/archive/index.md`（计数同步）。**不做**：本轮不实现机检脚本与 CI 步骤（按用户 2026-11-21 选择进 backlog）；历史 4 笔破坏性提交不回补记录；不改 `conventional-changelog-cmyr-config` / `semantic-release-cmyr-config`。验收：规范条目含时机 / 主体 / 记录格式 / 重确认四项；合规消息通过 commit-msg（commitlint exit 0）；skill 与规范不冲突；issue #270 回写结论。风险与依赖：机检未落地前靠人工核对；标识默认 `owner`，授权人改用 GitHub 用户名。**闭环（2026-11-21）**：`6527b608` 修复 ISO 日期被误判为 diff 行数（9 用例通过、合规消息 commitlint exit 0）；`8478f120` 规范条款 + 项目 skill + 检查点矩阵；`75613cb5` 计划登记；`gates:docs` 22 项通过、`lint:check` 0 error、`typecheck` 全通过。

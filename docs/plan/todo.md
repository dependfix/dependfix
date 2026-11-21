# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | M64 执行面安全与交付闭环（2026-11-21 规划，5 原子） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M63 已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M63 已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M64 执行面安全与交付闭环（2026-11-21 规划）

> **目标**：把执行子进程的环境边界、外联审计覆盖面与超时收口做成可判定事实，并补一个用户可感知的中断恢复入口；治理侧把规划文档模型 v1 落成规范与机检。
>
> **来源**：用户 2026-11-21 选定方案 A（交付闭环）。上收 7 条候选——从 `候选池` 上收 6 条（其中 3 条外联合并为 M64.2）、从 `待上收候选` 上收 1 条（批次级续跑）；`checkpoint unknown` 未上收，留在候选池。直接输入为 M59 归档残余（执行子进程 env 硬化 / undici 直连 / registry 连通性预检 / 预算透传）、2026-11-16 运行日志复盘派生（默认出站白名单缺域）、2026-10-18 用户报告（批次级继续执行）与 issue #269 研判结论（规划文档模型）。
>
> **§3.4 五步交叉核验（2026-11-21 实测）**：
> ① 归档扫描 `环境变量硬化|密钥 denylist|继续执行未完成|NODE_USE_ENV_PROXY` → 仅 M59 归档列为「未证实 / 残余」、M61 规划显式标注「未纳入本期」，均无闭环实现；
> ② `git log --all --grep="继续执行"` / `--grep="denylist"` → 无对应实现提交（命中项为基线采样、队列僵尸任务等无关批次）；
> ③ 代码 anchor：`packages/engine/src/runners/process-control.ts:45` 仍 `base = paramsEnv ?? process.env`（无 denylist）；`network-audit.ts:104` 的 `DEFAULT_ALLOWED_DOMAINS` 缺 `release-assets.githubusercontent.com`；`sandbox-executor.ts:193` 仅注入 registry、无连通性预检；`apps/platform/server/api/batch-runs/` 只有 `force-fail`；`planning.md §2.2 / §2.5` 仍强制每条子任务 8 要素；
> ④ 决策前提：用户已选方案 A；`NODE_USE_ENV_PROXY` 版本行为未实测（M64.2 首动作）、预算透传协议未定（M64.3 的 D3）——两项均写进对应原子的 D 阶段决策点，不预设结论；
> ⑤ backlog 同步：7 条已从 [backlog.md](backlog.md) 移除并落到 M64.1-M64.5（`checkpoint unknown` / 平台侧交付载体 / 验证跳过可观测性等未上收项保留），候选池 37 → 31、待上收 3 → 2。
>
> **容量基线（逐原子交付物求和，规划轮估算）**：commits 22-28 / files 52-70 / 行 1,850-3,150（行 = diff 改动量含删除；测量方 = 规划角色）。
> 类型（按主类型计数）：🛡️2（M64.1 / M64.2）+ 🛠️1（M64.3）+ 🎨1（M64.4）+ 📚1（M64.5）；🧪 内嵌各原子。
> **🎨 缺口显式标注**：独立 UX 原子仅 1 项（低于建议值 2），理由是本期定位为执行面收口，M64.4 承担唯一用户可感知交付；平台侧交付载体（issue / 草稿 PR）与验证跳过可观测性留在 backlog。
>
> **执行顺序**：M64.1 → M64.2 → M64.3 → M64.4 → M64.5（M64.1 先建 env 单一事实源，M64.2 复用；M64.5 在代码收口后落规范，避免记录漂移）。
>
> **D 阶段决策点**：D1（M64.1）denylist 起步 vs 白名单全量派生，以及 container 与 sandbox 是否统一注入模型；D2（M64.2）白名单补单域 vs `*.githubusercontent.com`，`NODE_USE_ENV_PROXY` 是否按版本矩阵启用；D3（M64.3）连通性预检落点（容器内 CLI vs 平台侧）与预算透传协议（env vs flag）；D4（M64.4）承载形态（新建 BatchRun vs 复用原批次）与重启范围；D5（M64.5）进度表列定义、小条目编号形态与机检 no-op 口径。
>
> **前置 / 风险**：`NODE_USE_ENV_PROXY` 在 Node 22 的行为未实测（M64.2 首个 D 动作，不支持则保持仅审计）；预算透传需要 CLI 与平台双侧改动，若协议未定住会在 M64.3 反复；M64.4 触及批次终态语义，必须复用既有去重键。

### 进度总览

| 大条目 | 小条目 | 状态 | 提交 | 审计 | 容量 |
|:--|:--|:--|:--|:--|:--|
| M64.1 执行子进程环境变量硬化 | — | ✅ 已闭环 | — | — | 5-6 commits / 10-14 files / 350-600 行 |
| M64.2 外联审计覆盖面收口 | — | ✅ 已闭环 | — | — | 4-6 commits / 9-13 files / 300-550 行 |
| M64.3 沙箱 install 快速失败与预算透传 | — | ✅ 已闭环 | — | — | 5-6 commits / 12-16 files / 400-650 行 |
| M64.4 批次级「继续执行未完成项」入口 | — | ✅ 已闭环 | — | — | 5-6 commits / 14-18 files / 450-750 行 |
| M64.5 规划文档模型 v1 前向落地 | — | ✅ 已闭环 | — | — | 3-4 commits / 7-9 files / 350-600 行 |

> `提交` / `审计` 两列在归档批次按实际 commit 数与审计轮次回填；小条目列在原子内拆分子任务时填写（当前各原子未再拆分）。

### M64.1 执行子进程环境变量硬化（P1 🛡️）

- **目标**：container 执行器下目标仓库可见的环境变量不再包含平台密钥，且工具链所需变量（PATH / HOME / registry / store / 代理）不丢失。
- **优先级**：P1（与安全规范 §5.3「平台密钥不进执行进程」冲突；属 M59.1 之前的既有暴露面回归）。
- **范围**：
  - `packages/engine/src/runners/process-control.ts`：`resolveTrackedCommandEnv` 增 denylist 过滤（`NUXT_*` / `BETTER_AUTH_*` / `AUTH_*` / `DATABASE_*` / `SMTP_*` / `DEPENDFIX_AI_*`），显式保留 `PATH` / `HOME` / `pnpm_config_*` / `npm_config_*` / `HTTP(S)_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS`；
  - `apps/platform/server/services/executor/container-executor.ts` 与 `sandbox-executor.ts`：统一注入模型（sandbox 已精选 env，container 对齐）；
  - 证据面：运行结果记录「已过滤键数量」而非键名，报告与运行详情可读；
  - 用例：denylist 命中 / 保留键 / 代理与 registry 注入不回归；container 路径补调用点级用例。
- **验收标准**：
  - AC1：注入 `NUXT_ENCRYPTION_KEY` / `AUTH_SECRET` / `DATABASE_URL` / `SMTP_PASS` 后，容器内命令的 `env` 输出均不含这四项；
  - AC2：`PATH` / `HOME` / `pnpm_config_registry` / `HTTP_PROXY` 仍可见，`pnpm install` 与 `git push` 冒烟通过；
  - AC3：过滤命中数量落运行结果（不含键名），报告与运行详情可读；
  - AC4：egress-audit 既有代理注入用例零回归；
  - AC5：沙箱执行器的容器 env 注入模型不变（已是精选 env）；容器内 CLI 的过滤随 bundle 生效，不新增注入项。
- **不做什么**：不改代理注入顺序与网关；不引入白名单全量派生（留 D1 评估）；不改平台进程自身环境。
- **依赖**：M59.1 egress-audit 与 runner 抽象；[安全规范 §5.3](../standards/security.md)。
- **交付物**：5-6 commits / 10-14 files（engine runners + platform executors + 用例 + security.md / executor-process-isolation.md）/ 350-600 行；单 commit ≤ 10 files，按 AC 分组提交。
- **风险与缓解**：过滤过宽导致 git / pnpm 失败 → 保留键清单先用五条真实命令冒烟固定；平台与引擎双份实现漂移 → 单一事实源放 engine，platform 只做注入；denylist 只作用于平台进程继承面（不清洗目标仓库自带同名变量），该边界写入文档避免误读为「仓库变量也被改写」。

### M64.2 外联审计覆盖面收口（P2 🛡️）

- **目标**：收口运行日志暴露的三处外联审计缺口——GitHub Release 资产域被误拦、既有代理环境下「注入失效」不可见、Node 内置 fetch 直连不留拦。
- **优先级**：P2（沙箱 fix 模式会把误拦记为 `network_violation` 直接失败；注入失效使 deny-by-default 实际不生效。合并原 P3「外联审计注入失效可见化」后取高）。
- **范围**：
  - `packages/engine/src/runners/network-audit.ts`：`DEFAULT_ALLOWED_DOMAINS` 补 `release-assets.githubusercontent.com`；
  - 注入失效可见化：结果 / 运行详情标注「代理未注入（环境已有代理）」；`NO_PROXY` 语义在三处调用点统一；
  - `NODE_USE_ENV_PROXY` 对照实验（Node 22 / 24 / 26 最小实验 + 结论矩阵），仅沙箱 fix 路径按结论启用；
  - `docs/standards/security.md §5.3.1` 与 `executor-process-isolation` 同步。
- **验收标准**：
  - AC1：白名单含该域；负例（非白名单域）仍被拦并落 audit；
  - AC2：既有 `HTTP(S)_PROXY` 环境下结果含「审计注入未生效」标记，运行详情可读；
  - AC3：`NO_PROXY` 语义在 `runTrackedCommand` / `verification-runner` / 沙箱路径一致且有用例锁定；
  - AC4：undici 实验结论落文档（支持 / 部分支持 / 不支持 + Node 版本矩阵）；启用时补直连外带负例；
  - AC5：规范与设计稿同源，`gates:docs` 通过。
- **不做什么**：不放开任意 `*.githubusercontent.com`（除非安全评审通过）；不为不支持的 Node 版本改被测仓库代码；不放宽 deny-by-default。
- **依赖**：M59.1；M64.1（env 单一事实源，避免两处各改一份）。
- **交付物**：4-6 commits / 9-13 files / 300-550 行；单 commit ≤ 10 files，按 AC 分组提交。
- **风险与缓解**：`NODE_USE_ENV_PROXY` 在 Node 22 不生效 → 按版本矩阵分级，未支持版本保持「仅审计」并在文档声明。

### M64.3 沙箱 install 快速失败与预算透传（P2 🛠️）

- **目标**：安装源不可达时在预检阶段快速失败并给出可读原因；预算见底时容器内 CLI 主动收口并回传部分结果，避免整仓 `execution_timeout` + 结果缺失。
- **优先级**：P2（2026-11-14 线上复盘：registry 被阻断后每条命令各自耗满超时，最终整仓超时且结果缺失）。
- **范围**：
  - 安装前 5s 连通性预检（容器内探测生效 registry），不可达即报可读错误并落独立失败分类；
  - `deadlineAt` 透传到容器内 CLI（env 或 flag，按 D3 定），CLI 在预算见底时停止后续命令并输出已得部分结果；
  - 外层 `withTimeout`（adapter 卡死）同样回传已捕获输出；
  - 失败分类同步 `run-failure-taxonomy`、运行详情与报告。
- **验收标准**：
  - AC1：registry 不可达时在预检阈值（默认 5s，可配）内快速失败（非整仓超时），错误含目标 registry 与探测耗时；
  - AC2：预算耗尽时 CLI 收口，结果含已完成步骤与跳过原因；
  - AC3：adapter 卡死触发外层超时时仍能拿到 stdout 尾部；
  - AC4：失败分类在 taxonomy / UI / 报告三处一致；
  - AC5：定向用例覆盖「registry 不可达 / 预算耗尽 / 外层超时」三条路径。
- **不做什么**：不改 registry 发现逻辑；不加新的重试层；不改 install 命令形态。
- **依赖**：M59.1 超时输出回传；M62.2 命令级 OOM 分层。
- **交付物**：5-6 commits / 12-16 files / 400-650 行；单 commit ≤ 10 files，按 AC 分组提交。
- **风险与缓解**：预检把「慢但可用」误判为不可达 → 超时可配 + 默认仅提示（沙箱 fix 路径才硬阻断）。

### M64.4 批次级「继续执行未完成项」入口（P2 🎨）

- **目标**：宿主机重启 / 中断后，失败批次提供「继续执行未完成项」入口，且保留可追溯的审计链。
- **优先级**：P2（用户 2026-10-18 明确要求「至少给用户一个选项：直接结束还是继续执行」，形态已裁定为批次级）。
- **范围**：
  - 新端点 `POST /api/batch-runs/{id}/resume`：只接受未完成 / transient 子项；
  - 承载形态按 D4（新建 BatchRun 并关联原批次 vs 复用原批次）；
  - UI：失败批次行内入口 + 二次确认 + 结果回显；i18n 双语；视觉基线；
  - e2e：「中断 → 继续 → 终态」；与既有单条 `POST /api/runs/{id}/retry` 的共享判定抽取。
- **验收标准**：
  - AC1：中断批次可继续，且只执行未完成子项（用例断言执行集合）；
  - AC2：新批次与原批次可追溯（关联字段 + 审计事件）；
  - AC3：无可继续子项时入口禁用并给原因；
  - AC4：e2e（`pnpm --filter @dependfix/platform test:e2e -- batch-runs`）与视觉基线通过；i18n 缺失检查为空；
  - AC5：单条 retry 行为零回归。
- **不做什么**：不做「新状态 + 启动弹窗」形态；不自动继续（必须用户点击）；不改批次终态语义。
- **依赖**：`executeBatchRun`、`POST /api/runs/{id}/retry`、stale-cleanup 的 orphan 判定。
- **交付物**：5-6 commits / 14-18 files / 450-750 行；单 commit ≤ 10 files，按 AC 分组提交。
- **风险与缓解**：并发继续导致重复执行 → 复用既有去重键 + 批次级互斥；继续后原批次状态误读 → 关联字段与 UI 文案显式区分。

### M64.5 规划文档模型 v1 前向落地（P2 📚）

- **目标**：把 issue #269 研判成立的范围落到规范与机检；M64 段首补 6 列进度表作为首个生效样例（条目正文不回改），小条目分层与大条目上限自 M65 规划起使用。
- **优先级**：P2（治理债；同时解决「规划文档无进度汇总」与「归档分片命名漂移」）。
- **范围**：
  - `docs/standards/planning.md`：§2.2 / §2.5 同源改两级粒度（大条目 8 要素、小条目 4 项并继承优先级 / 范围 / 不做什么 / 风险）；§1.1 两处与 §3.1 容量控制行改「默认 4-6、上限 8（第 7-8 项写不拆阶段的可核判据）」；
  - `docs/plan/todo.md`：M64 段首补 6 列进度表（大条目 / 小条目 / 状态 / 提交 / 审计 / 容量，5 行 = M64.1-M64.5），`提交` / `审计` 留待归档批次回填；
  - `docs/plan/archive/index.md`：分片命名式（`*-phases-<起>[-<止>].md`）+ 3 个遗留名白名单（`m2-m55` 名实歧义、`m6-m7-t711` / `m10-c53-c59c61` 不合式）；
  - `scripts/check-doc-governance.mjs`：新增「进度表行数 = 正文 `^### M\d+\.\d+` 数（无活跃阶段 no-op）」与「分片名匹配命名式」两项机检，复用 `PHASE_SORT_OVERRIDES` 白名单；
  - 不变量声明面同步（`doc-governance.md §4.3` + `archive/index.md`）与检查点矩阵挂接。
- **验收标准**：
  - AC1：规范条款落盘且 §2.2 / §2.5 / §3.1 三处同源；
  - AC2：机检两项各有正负例——行数不一致 exit 1（临时夹具）、分片名不合式 exit 1、`todo.md` 无活跃阶段时 exit 0；
  - AC3：3 个遗留名按「2 不合式 + 1 名实歧义」在规范内枚举；
  - AC4：`gates:docs` 22 项不回归；`archive/index.md §4` 基线同步；
  - AC5：M64 条目正文不回改，仅补段首进度表（行数 = 5，与 `^### M64\.\d+` 数一致）；「M65 规划按 v1 产出」登记为遗留验证项。
- **不做什么**：归档块 6 项字段（提案未枚举字段名）；小条目 ID 强制进 commit subject；已归档阶段回改。
- **依赖**：issue #269 研判结论（2026-11-21）；`check-doc-governance` 现有归档索引校验。
- **交付物**：3-4 commits / 7-9 files（`planning.md`、`todo.md`、`archive/index.md`、`doc-governance.md`、`check-doc-governance.mjs` + 测试）/ 350-600 行。
- **风险与缓解**：规范条款与机检不同源 → 同批挂检查点矩阵并补负例；改动放宽上限被误读为可随意扩范围 → 第 7-8 项要求可核判据并由 review 检查。

## 上一阶段

M63（平台对外只读观测面）已于 2026-11-20 归档：见[执行记录](archive/todo-archive-phases-m63.md) / [路线图](archive/roadmap-phases-m63.md)。更早阶段（M0-M62）见 [todo-archive.md](todo-archive.md)。

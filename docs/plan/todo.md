# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M40 进行中**——运行时可靠性与可观测性深化（2026-10-10 用户决策方案 A / 6 原子条目） |
| 下一阶段（未授权） | 无——M40 闭环后再按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 评估 backlog 候选池 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M39 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M39 已归档；M40 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M40: 运行时可靠性与可观测性深化（2026-10-10 用户决策方案 A / M40.1~M40.6）

> **阶段定位**：承接 M39 平台视图体验与可观测补强归档后的运行时可靠性阶段。来源为 2026-10-08 定时扫描批量失败排查中暴露、且经 M38/M39 归档后仍保留在 [backlog.md](backlog.md) 的运行时缺口，以及同批次审计 / 复核衍生的门禁工具缺口。经 2026-10-10 用户决策（方案 A）从 backlog §候选评估中上收 6 项候选；同日追加用户决策（D2）：以「平台环境变量文档完整性治理」（用户直接提出的配置/文档治理需求）**替换**原 M40.6（门禁脚本排除 Playwright 产物 → 回退 [backlog.md](backlog.md)），维持本阶段 6 原子容量。聚焦「让运行时状态可确认、失败可解释、超时可调、进程可自愈、日志可追溯、配置文档可信」。
> **类型平衡**：🚀 能力扩展 1（M40.1）+ 🎨 用户体验 1（M40.2）+ 🛠️ 技术债 1（M40.3）+ 🛡️ 可靠性 1（M40.4）+ 🐛 缺陷修复 1（M40.5）+ 📚 文档治理 1（M40.6）= 6 原子；🎨 用户体验独立条目 1 项低于 [规划规范 §1.1 类型平衡建议](../standards/planning.md#11-硬性约束)（建议 ≥ 2），本阶段以可靠性主线优先，缺口显式标注。
> **§3.4 三重交叉核验**（2026-10-10 启动批次实测，**0 项重复评估**）：① **todo-archive 扫描**——6 项候选在 `todo-archive.md` + `archive/*.md` 无对应已闭环标注（历史命中均为邻近主题或候选登记本身：`todo-archive.md:55` M39 摘要将「部署产物版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化」记为「留 backlog」；`archive/index.md:43-45` 将「sandbox 降级回退路径 / 门禁脚本产物排除」及 worker 崩溃自动重启记为「保留待评估」；`archive/todo-archive-phases-m11.md:376-379` 的 `test-results` / `playwright-report` 命中的是根 `.gitignore` 治理，与本批「门禁脚本扫描面排除」非同一事项）；② **git log**——`git log --all --grep` 对「版本戳 / version-stamp / summary 快照 / EXECUTION_TIMEOUT / worker 崩溃 / playwright-report」无对应修复 commit（`da148f8` 仅为候选登记 docs；`431e8ec` 为 M38.2 锁参数显式化，与「执行超时可配置化」非同一事项；`5382e67` 为 M37.3 写回竞态，仅正文出现 summary 字样；`3290ee5` 仅根 `.gitignore`）；③ **代码 anchor**——`apps/platform/Dockerfile` 无 `ARG`/`HEALTHCHECK` 且无 `/api/health` 路由；`scan-orchestrator.service.ts:387-398` failed 分支不写 `summaryJson`（仅 degraded:405 / completed:418）；`container-executor.ts` `DEFAULT_EXECUTION_TIMEOUT_MS` = 30min 写死无 env；`docker/entrypoint.sh:110-130` worker 以 `&` 启动且仅 `wait MAIN_PID` 无看护；`scan-orchestrator.service.ts:332-348` sandbox 回退分支未取 `logsJson`（container 主路由:364 已取）；`check-orphan-ids.mjs` `EXCLUDED_DIRS` 与 `check-docs.mjs` `RUNTIME_EXCLUDED_PATHS` 均无 `playwright-report`/`test-results`（其中 ⑥ 门禁脚本产物排除已随同日 D2 回退 backlog，上述 check-orphan-ids / check-docs 证据为历史批次实测记录，保留供追溯）。
> **D2 替换项（新 M40.6）三重交叉核验**（2026-10-10）：① todo-archive 无「环境变量文档完整性」对应已闭环；② git log 无对应修复 commit；③ 代码 anchor 实证缺口存在——执行角色以 `rg -o 'process\.env\.[A-Z_]+' apps/platform packages` + `nuxt.config` runtimeConfig + `docker/entrypoint.sh` + `docker-compose.yml` 汇总实际使用变量，减去 `HEAD:.env.example` 声明集，得缺失量级 **20-25 个**（审计方独立复算 = **22**），如 `DATABASE_TYPE`/`SANDBOX_IMAGE`/`BACKUP_RETENTION_COUNT`/`NUXT_PUBLIC_BASE_URL` 等；`configuration.md` 平台段仅指针。**0 项重复评估**；该项属文档 / 配置治理（非新功能），为用户 2026-10-10 直接提出并经明确授权上收当前阶段。
> **用户决策点**（2026-10-10 裁定）：**D1 候选组合 = 方案 A**——从 backlog 上收 6 项（部署产物版本戳陈旧校验 / 失败 run summary 快照 / 执行超时可配置化 / 队列 worker 崩溃自动重启 / sandbox 降级回退日志 / 门禁脚本产物排除）；**D2 = 以「平台环境变量文档完整性治理」替换原 M40.6**（门禁脚本产物排除回退 backlog；`NUXT_PUBLIC_BETTER_AUTH_URL` 不一致按「修代码兼容两者」处置）。
> **不做什么（阶段级）**：不改引擎修复 / 验证业务语义与告警模型；不改 `/api/runs` 既有契约；不引入完整 versioning 框架 / 进程管理器（除非 M40.4 D 阶段裁定）；不实现执行可取消（`withTimeout` 底层 `execFileSync` 不可取消，属既有边界）；不改 CLI（`DEPENDFIX_*`）配置项语义与平台 env 的既有权重默认值。

- **M40.1**（P2，🚀 能力扩展）部署产物版本戳 / 陈旧校验
  - **目标**：让运行时能确认部署产物对应的 commit / 版本，消除「代码已修复但线上仍复现」的陈旧产物误判（2026-10-08 `COMMIT_FAILED` 缺 M37.6 `--no-verify` 即因运行时产物早于该修复，当前无任何手段核实）。
  - **优先级**：P2
  - **范围**：`apps/platform/Dockerfile`（构建期 `ARG` → 运行时 `ENV` 注入 commit / 版本）；`.github/workflows/`（镜像发布 workflow 传入 `--build-arg`）；`apps/platform/server/api/health.get.ts`（新增只读健康端点，返回 `{ version, commit, startedAt }`）；`apps/platform/server/plugins/`（启动日志打印版本戳）；单测；`docs/standards/platform.md`（部署章 / env 总表）。
  - **验收标准**：
    - [ ] 镜像构建期可注入 commit / 版本（Docker `ARG` + `ENV`，发布 workflow 传 `--build-arg`）；未注入时优雅缺省（如 `unknown`，不阻断启动）
    - [ ] 健康端点（`GET /api/health` 或既有等价路径）返回 `{ version, commit, startedAt }`（curl 实证 200 + JSON），鉴权口径与既有只读端点一致
    - [ ] 启动日志打印版本 / commit，便于 `docker logs` 核对运行态产物
    - [ ] 单测覆盖端点形状与「未注入 → 缺省回退」分支
    - [ ] `pnpm lint` 0 error + `pnpm typecheck` 0 error（实测 `2>&1 | grep -E "error TS"` 无命中，不信「Done」宣称）；文档登记（`platform.md`）
  - **D 阶段决策留痕（待裁定）**：① 暴露形态 = 健康端点 / 仅启动日志 / 二者；② 是否作为发布流水线门禁（核对镜像内 engine 产物关键隔离参数）；③ 版本来源 = 构建 arg / OCI label / `package.json` version。
  - **不做什么**：不引入完整 versioning / 更新检查框架；不改镜像发布流程本身；不暴露构建环境细节（仅 commit + 语义版本）。
  - **依赖**：backlog 候选（现状锚点 `apps/platform/Dockerfile` + 无 health 路由）；事件背景 M37.6（`cb5c146`）运行时产物陈旧。
  - **交付物**：预计 2-3 commits（feat(platform) 端点 + 构建注入 + docs）；文件 4-6（Dockerfile / workflow / health 端点 + 单测 / plugin / platform.md）。
  - **风险与缓解措施**：① 构建 arg 未传导致版本缺失 → 缺省回退 + 文档 + 启动告警；② 健康端点暴露信息量 → 仅 commit / 版本 / 启动时间，无凭据 / 环境变量；③ workflow 与 Dockerfile 联动遗漏 → 验收标准显式列出 `--build-arg` 接线。

- **M40.2**（P2，🎨 用户体验）失败 run 落 summary 快照
  - **目标**：failed run 在「全部运行」列表中不再恒显「告警数 0 / 已修复 0」，改为展示失败前引擎已扫到的告警数，消除误导（本次排查中即被该现象干扰）。
  - **优先级**：P2
  - **范围**：`apps/platform/server/services/scan-orchestrator.service.ts`（failed 分支：`result` 存在时落 `summaryJson` 快照）；必要时 `apps/platform/server/services/scan-run-state.ts`（决策载荷）；单测；若前端列表未读 `summaryJson` 则同步前端。
  - **验收标准**：
    - [x] failed 且引擎已产出 `result.summary` 时 `summaryJson` 落库（定向单测：构造 failed + result → 列值等于 summary）
    - [x] 与「失败不写半截结果」原则边界明确：**仅 summary 快照**，不写 alerts 明细 / 不 reconcile（单测断言 `ScanResult` 无写入）
    - [x] 失败 run 列表展示非 0 告警数（前端单测锁定 `alertsFound` 读取契约 + 后端单测证明快照落库；`/api/runs` 返回 `summary` 已由前端消费）
    - [x] `pnpm lint` 0 error + `pnpm typecheck` 0 error（实测 `2>&1 | grep -E "error TS"` 无命中，不信「Done」宣称） + 定向测试全过
  - **D 阶段决策留痕（2026-10-10 用户裁定）**：采纳方案 A——写 `{ ...result.summary, alertsFixed: 0 }`：`alertsFound` 如实展示（含纳入 `/api/scan-history/summary` 的 `totalAlerts`），`alertsFixed` 归零（失败 run 未交付，且状态机契约声明 rollback / verification 失败后 `fixStatus` 不可信，避免「已修复 N」误导）；不加 `partial` 标记（状态列已显示「失败」，且不引入未使用键）。
  - **不做什么**：不改 completed / degraded 分支；不改 `reconcileAlerts`；不引入新列（复用既有 `summaryJson`）。
  - **依赖**：backlog 候选（现状锚点 `scan-orchestrator.service.ts:378-422`）。
  - **交付物**：预计 1-2 commits（feat(platform) failed summary 快照 + 单测）；文件 2-4（orchestrator / 单测 / 必要时前端）。
  - **实际交付（2026-10-10）**：1 commit `c6fe50d`（`fix(platform)`：orchestrator failed 分支落快照 + 2 用例（含 exitCode=2 分支与 `ScanResult` 无写入断言）+ 新增 `app/utils/run-view.test.ts` 读取契约用例）；前端无需改（`scans.vue` 已读 `row.summary.alertsFound/alertsFixed`）。
  - **审计（2026-10-10）**：A 阶段 standard R1 Pass（0 blocker / 0 warning / 3 suggest；S1 拆 exitCode=2 用例 + S2 边界注已应用；S3 端到端强化用例非阻塞）；mutation 2 处全击杀（M1 删写入 / M2 去归零）；全量 platform 单测 1677 passed | 9 skipped（改动后 40 定向 passed）。实测用时约 3 分钟。
  - **风险与缓解措施**：① summary 与失败状态被解读为「扫描完成」 → 状态列显示「失败」区分 + `alertsFixed` 归零（不显示虚构修复数）；② 落库路径与既有失败分类写点顺序 → 复用既有分支结构，单测覆盖；③ `summaryJson` 连带影响 `/api/scan-history/summary` totals → 经 D 决策受控（`totalFixed` 因 `alertsFixed=0` 不被污染；`totalAlerts` 纳入 failed run 的 `alertsFound` 为预期）。

- **M40.3**（P2，🛠️ 技术债）执行超时可配置化
  - **目标**：单仓库执行超时由 env 可调（可选仓库级覆盖），并与队列 worker 锁时长联动；消除 30 分钟写死导致的「重负载仓库必然超时」与锁窗口错配。
  - **优先级**：P2
  - **范围**：`apps/platform/server/services/executor/container-executor.ts`（`DEFAULT_EXECUTION_TIMEOUT_MS` → env `EXECUTION_TIMEOUT_MS` + 解析 / 校验）；`apps/platform/server/services/queue/scan-worker.ts`（`SCAN_WORKER_LOCK_OPTIONS` 与超时联动，去冻结常量引用）；单测；`docs/standards/platform.md`（env 总表 / 队列章）。
  - **验收标准**：
    - [ ] `EXECUTION_TIMEOUT_MS` env 生效（缺省保留 30min；非法值 / 越界 fail-closed 回退缺省）——单测覆盖 env 覆盖 / 缺省 / 非法 / 上界
    - [ ] 队列 worker 锁参数与执行超时联动（不再引用冻结常量或显式说明保持不变的理由）
    - [ ] `pnpm lint` 0 error + `pnpm typecheck` 0 error（实测 `2>&1 | grep -E "error TS"` 无命中，不信「Done」宣称） + 定向测试全过
    - [ ] 文档登记（`platform.md` env 总表 + 队列章 `EXECUTION_TIMEOUT_MS` 口径）
  - **D 阶段决策留痕（待裁定）**：① env-only vs 仓库级覆盖；② 超时后执行 / 清理语义（`withTimeout` 不可取消的僵尸窗口是否缓解）；③ 是否随 M38 独立 worker 进程已消除锁续期根因后再评估联动。
  - **不做什么**：不实现执行可取消（`execFileSync` 不可取消，属既有边界）；不改 `CLONE_TIMEOUT_MS`；不改引擎内部超时语义。
  - **依赖**：M38.2 锁参数显式化（`431e8ec`）；backlog 候选（现状锚点 `container-executor.ts:40` + `scan-worker.ts:59-71`）。
  - **交付物**：预计 2-3 commits（feat(platform) env 接线 + 锁联动 + docs）；文件 4-6。
  - **风险与缓解措施**：① env 过大 → 锁窗口过长 / 资源占用 → 设上界校验 + 文档；② env 过小 → 频繁超时 → 保留下界 + 缺省 30min；③ 超时后资源清理 → 复用既有 `finally` 语义，本批不改。

- **M40.4**（P2，🛡️ 可靠性）队列 worker 进程崩溃自动重启
  - **目标**：独立 worker 进程（entrypoint 双进程 `&` 形态）崩溃后自动拉起，避免队列任务长时间挂起直至 `stale-cleanup` 兜底（窗口约 30 分钟）。
  - **优先级**：P2
  - **范围**：`apps/platform/docker/entrypoint.sh`（worker 看护循环 / 重启 + 日志 + 与 TERM 信号协同）；必要时 `apps/platform/Dockerfile`；脚本级验证；`docs/standards/platform.md`（§10.6 队列进程形态章）。
  - **验收标准**：
    - [ ] worker 进程崩溃后自动重启（看护循环），日志可观测（重启次数 / 时间 / 退出码）
    - [ ] 容器停止（TERM / INT）时 worker **不再重启**、干净退出（既有 trap 语义保持）
    - [ ] 脚本级验证（entrypoint 分支：默认单进程 / 冲突 warn 跳过 / 双进程 / 崩溃重启）或单测
    - [ ] `pnpm lint` 0 error + `pnpm typecheck` 0 error（实测 `2>&1 | grep -E "error TS"` 无命中，不信「Done」宣称）（若涉及 TS）
    - [ ] 文档登记（`platform.md`）
  - **D 阶段决策留痕（待裁定）**：① 看护循环（`while` + `wait`）vs s6-overlay / supervisord vs 拆多容器 + `restart`；② 是否加退避 / 重启上限（防重启风暴）；③ worker 崩溃是否影响主进程退出语义。
  - **不做什么**：不拆多容器（除非 D 阶段裁定）；不改 HTTP 主进程生命周期；不改队列消费语义。
  - **依赖**：M38.1 独立 worker 进程 entrypoint（`e5412cd`）；backlog 候选（现状锚点 `entrypoint.sh:110-130`）。
  - **交付物**：预计 1-2 commits（fix(platform) entrypoint 看护 + docs）；文件 2-4（entrypoint.sh / 必要时 Dockerfile / docs / 验证脚本）。
  - **风险与缓解措施**：① 无限重启风暴 → D 阶段评估退避 / 上限 + 日志限频；② 信号转发回归（`trap` → 双进程） → 保留既有 trap 结构 + 分支验证；③ 看护循环 + `set -e` 交互 → 显式 `||` 捕获退出码（M38.1 同类教训）。

- **M40.5**（P2，🐛 缺陷修复）sandbox 降级回退路径落执行日志
  - **目标**：sandbox 启动时降级到 container 的回退路径同样落 `logsJson`，让 degraded run 在「运行日志」弹窗 / 下载中可查看执行日志（现状回退路径无日志）。
  - **优先级**：P2
  - **范围**：`apps/platform/server/services/scan-orchestrator.service.ts`（sandbox 回退分支 `332-348` 消费 `runContainerExecutor` 返回的 `logsJson`）；单测。
  - **验收标准**：
    - [x] sandbox 降级回退分支赋值 `logsJson = execResult.logsJson`（与 container 主路由 `:364` 同口径）
    - [x] 定向单测覆盖回退路径 `logsJson` 落库（degraded run 有日志）
    - [x] degraded run 在运行日志入口可获取日志（单测断言 `run.logsJson` 含回退日志；消费端 `[id]/logs.get.ts` 等经 `parseLogEntries` 不按 status 门控）
    - [x] `pnpm lint` 0 error + `pnpm typecheck` 0 error（实测 `2>&1 | grep -E "error TS"` 无命中，不信「Done」宣称）
  - **D 阶段决策留痕（2026-10-10）**：采纳方案 ①（回退路径补 `logsJson`，与 container 主路由同口径）；不采用方案 ②（明确 degraded 回退 run 不提供日志）。
  - **不做什么**：不改 sandbox 主路径（启动可用分支）；不改 degraded 状态语义与 `sandbox_degraded` 事件口径；不改日志格式化。
  - **依赖**：M39.6 抽出的 `runContainerExecutor` helper（`runContainerExecutor` 已返回 `logsJson`，回退调用点未消费，`e80b7b0`）。
  - **交付物**：预计 1-2 commits（fix(platform) 回退日志 + 单测）；文件 2-3。
  - **实际交付（2026-10-10）**：1 commit `72013c6`（`fix(platform)` 回退分支补 `logsJson` + 新用例，2 文件同 commit 以保提交态自洽）。
  - **审计（2026-10-10）**：A 阶段 quick R1 Pass（0 blocker / 0 warning / 2 suggest：console.warn spy 未 restore 属既有模式登记测试规范化批次、注释压缩已应用）；mutation M1（删 `logsJson` 赋值 → 新用例失败）kill 成立；全量 platform 单测 1673 passed | 9 skipped。实测用时约 3 分钟。
  - **风险与缓解措施**：低；回退路径日志体量 → 复用既有 `logsJson` 落库口径（与 container 主路由一致）；单测以探针日志验证赋值。

- **M40.6**（P2，📚 文档治理）平台环境变量文档完整性与配置结构治理
  - **目标**：消除 `apps/platform/.env.example` / `docs/guide/configuration.md` 与代码实际读取的环境变量之间的缺口，使部署者据此可完整配置平台；并修正 `NUXT_PUBLIC_BETTER_AUTH_URL` 文档-代码不一致（按用户 2026-10-10 裁定：修代码兼容两者）。
  - **优先级**：P2
  - **范围**：`apps/platform/.env.example`（改为极简 / 快速启动版）；`apps/platform/.env.full.example`（新增，完整分节版）；`docs/guide/configuration.md` + `docs/i18n/en-US/guide/configuration.md`（平台配置段重构 + 变量总表）；`apps/platform/server/utils/auth.ts`（`trustedOrigins` 读取 `NUXT_PUBLIC_BETTER_AUTH_URL`，兼容回退 `NUXT_PUBLIC_BASE_URL`）+ 单测；必要时 `apps/platform/docker-compose.yml` / `docs/guide/deployment.md` 口径同步。
  - **验收标准**：
    - [x] 清点代码实际读取的全部平台 env（`nuxt.config` runtimeConfig + `process.env` 直读 + `docker/entrypoint.sh` + `docker-compose.yml`），形成清单并与示例 / 文档 100% 对齐（内部 / 测试变量显式排除并说明）
    - [x] `.env.example` 仅保留「必填 + 快速启动必需」项，按重要性分区；`.env.full.example` 覆盖清点清单全部变量，按逻辑分节，每项标注 `[必填]` / `[可选]` + 默认值
    - [x] `docs/guide/configuration.md`（zh + en-US）平台段按分节列出变量总表（含必填标记）并指向两个示例文件；CLI 段与平台段明确切分
    - [x] `auth.ts` 的 `trustedOrigins` 读取 `NUXT_PUBLIC_BETTER_AUTH_URL`（`NUXT_PUBLIC_BASE_URL` 兼容回退）；单测覆盖「两变量分别命中 / 均缺省走通配兜底」分支
    - [x] `pnpm lint` 0 error + `pnpm typecheck` 0 error（实测 `2>&1 | grep -E "error TS"` 无命中）+ 定向测试（`auth` 相关 20 passed）全过；`pnpm run check:docs` OK（148/84）；`pnpm run i18n:audit` parity 0
  - **D 阶段决策留痕（2026-10-10 用户裁定）**：① 示例文件形态 = **极简 `.env.example` + 完整 `.env.full.example` 双文件**（参考 momei 约定）；② 不一致修正方向 = **修代码兼容两者**（compose / 文档 / 示例统一以 `NUXT_PUBLIC_BETTER_AUTH_URL` 为准）。
  - **不做什么**：不改平台其他 env 的语义 / 默认值；不引入 dotenv 校验库或运行时 env schema 强校验；不改 CLI（`DEPENDFIX_*`）配置项本身（CLI 段仅复用既有内容）；不新增 `.env` 之外的配置通道。
  - **依赖**：用户 2026-10-10 直接提出（非 backlog 候选）；参考 momei `.env.example`（极简）+ `.env.full.example`（完整分节）约定；现状 anchor `auth.ts:103` 读 `NUXT_PUBLIC_BASE_URL`。
  - **交付物**：预计 3-4 commits（fix(platform) `trustedOrigins` 变量 + 单测 / docs(platform) 示例双文件 / docs(guide) 配置说明 zh+en / docs(plan) 闭环）；文件 5-8。
  - **实际交付（2026-10-10）**：5 commits（`8224291` docs(plan) M40.6 替换 + `d0e4a49` fix(platform) trustedOrigins 兼容 + `f3f31ba` docs(platform) 示例双文件 + `c3a5bbf` docs(guide) 配置说明 + 本条闭环登记）；文件 12（`.env.example` / `.env.full.example`（新增） / `auth.ts` / `auth.test.ts` / `configuration.md` zh+en / `deployment.md` zh+en / `todo.md` / `roadmap.md` / `backlog.md` / `archive/index.md`）——超 §1.1「10 文件」阈值，拆 5 commits 依据：planning / fix / docs(platform) / docs(guide) 四类各自独立可回滚，单 commit ≤ 4 文件。
  - **审计（2026-10-10）**：A 阶段 standard 2 分区并发 R1（P1 实现 2 blocker + 2 warning + 3 suggest / P2 规划 Pass 2 warning + 3 suggest）→ 收口 RG-B1（QUEUE_WORKER compose 命名）/ RG-B2（补 docs build）/ RG-W1（auth 注释同步）/ RG-W2（compose 注入面边界说明）/ S1-S3（§10 内部变量 / REDIS_URL 生效面 / IN_PROCESS_WORKER 默认差异）与 P2 W1/W2 + S1-S3 → R2 quick Pass（13 修复点全关闭）+ 应用 R2 N1/N2（QUEUE_WORKER 默认值 compose 1 / 入口 0、白名单枚举补齐）→ 实测用时 R1 约 8 分钟 / R2 约 3 分钟。mutation 2 处全击杀（M1 去 `|| BASE_URL` 回退 → `回退兼容旧变量` 失败；M2 去通配兜底 → `均未设置 → 通配兜底` 失败）。
  - **风险与缓解措施**：① 变量清单遗漏 → 以代码清点（`rg process.env` + runtimeConfig + entrypoint/compose）为准并交叉核对；② 极简版漏必填导致启动失败 → 必填项显式列出 + 缺省回退说明；③ 改 `auth.ts` 影响登录 `trustedOrigins`（安全敏感） → 单测覆盖 + 保留通配兜底 + 不改其他 auth 逻辑；④ en-US 镜像不同步 → `check:i18n` parity 门禁；⑤ compose 无 `env_file`、仅白名单转发（R1 RG-W2） → 已在示例 / 文档显式标注白名单与自行追加路径。

---

## 阶段收口清单

- [ ] M40.1~M40.6 全部闭环（各条目 8 要素验收标准勾选）
- [ ] 每原子条目独立 commit（`conventional-committer`），A 阶段 Review Gate 放行
- [ ] `pnpm lint` + `pnpm typecheck` + 定向测试全过；涉及产物 / 构建的条目（M40.1 / M40.4）补 `pnpm build` 或容器实测
- [ ] `todo.md` 状态收口 + `todo-archive.md` 归档段 + `roadmap.md` 状态同步 + `backlog.md` 候选清出
- [ ] 阶段归档批次执行 [规划规范 §4.4](../standards/planning.md#44-大批量归档批次操作规范) 12 项必查

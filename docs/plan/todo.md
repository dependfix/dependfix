# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M57**（执行面可信与发布验证收口，2026-11-09 规划） |
| 下一阶段（未规划） | 按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 从候选池评估 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M56 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M56 已归档；M57 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M57：执行面可信与发布验证收口（2026-11-09 规划）

**阶段目标**：把「执行端可信」从平台视图回收到运行时底座——沙箱执行器恢复 report-only 真实执行，队列终态不再被迟到 worker 覆盖，回归与审计门禁不再假绿，平台静态检查与列表顺序可复算，镜像发布有运行时冒烟证据。

**用户决策（2026-11-09）**：方向 A（执行面可信收口）；沙箱执行器「复用」已于 2026-11-09 裁定，本阶段只放行 report-only，fix / fix-and-pr 继续降级到 container。

**容量基线**（测量方：执行角色，P 阶段预估；分母供 [§3.1.1](../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) 再平衡使用）：

- 6 原子 / 17-25 commits / 39-57 文件 / 2000-3300 行（= 各原子「交付物」逐条求和，不设倍数口径）。
- **类型平衡**：🛡️3（M57.1 / M57.2 / M57.3）+ 🛠️2（M57.4 / M57.5）+ 🚀1（M57.6 兼 🧪）；测试覆盖内嵌各原子「范围 / 验收标准」，不单列 🧪 原子。本批按用户 2026-11-09 方向 A 以执行面可信为主，不含 UX 型候选（非遗漏）。
- 执行期插队批次累计 ≥3 或插队工作量 ≥ 本基线 50% 时触发再平衡。

**执行顺序**：M57.4 → M57.5 → M57.2 → M57.3 → M57.6 → M57.1。

- 前 5 项为小步可信度回补，可先恢复静态检查 / 分页稳定 / 队列终态 / 回归门禁 / 发布冒烟；沙箱需独立 rootless daemon 与最长验证窗口，放最后避免阻塞阶段。
- M57.3 合并「周回归 registry 假绿」与「回归窗口插入点」两项（同属回归工具真实性，独立验收点保留）。
- M57.1 的 fix / fix-and-pr 放行依赖出站白名单代理接入沙箱执行路径（T1002 代理候选），不在本阶段。

**上游证据**：

- M51.6 残余：列表查询并列次键（`api/runs/[id].get.ts` 等 5 处仅 `createdAt` / `severity` 排序）。
- M51 残余：平台 typecheck 未覆盖 `.nuxt/tsconfig.node.json`（实测 TS5052 + `nuxt.config.ts` 2 个既有错误）。
- M49.3 边界：周回归 `security:audit-deps` 在 registry 故障时假绿；M44 回归窗口插入点嵌套进上条受管块。
- 2026-11-05 镜像复核：`platform-0.5.0` 在 ACR 解析为单架构；arm64 未做运行时冒烟。
- 2026-11-09 用户裁定：沙箱执行器复用（自包含入口 + report-only 真实执行 + 入口恢复）。

**§3.4 阶段启动交叉核验（2026-11-09 实测）**：① 归档扫描 → 七项候选均只作为 M51 / M55 残余登记，无已闭环同题；② `git log` 相关路径 → 无实现提交（沙箱仍 `echo` 占位、编排层仍整行 `save`、发布安全脚本无采集时点）；③ 代码 anchor → `sandbox-executor.ts:208` 占位 `echo`、`scan-orchestrator.service.ts:509` 整行 `save`、`scripts/shared/regression-window.mjs` 插入点、`.nuxt/tsconfig.node.json` 实测 TS5052、5 处列表仅单键排序；④ 前提与 backlog 一致（沙箱入口三闸仍在：编排降级 / UI 强制迁移 / 文档状态）；⑤ backlog 同步——7 项候选上收（6 项自候选评估中 + 1 项自待上收候选；「周回归假绿」与「回归窗口插入点」合并为 M57.3），候选池 50 → 44。

### M57.1 [P1 🛡️] 沙箱执行器复用：report-only 真实执行

- **目标**：sandbox 在独立 rootless 容器内真跑引擎，结果契约与 `ContainerExecutor` 同构；先只放行 report-only，fix / fix-and-pr 在代理接入前继续降级。
- **优先级**：P1（用户 2026-11-09 裁定复用；当前 `buildCmd` 是 echo 占位 → 假成功）。
- **范围**：
  - 自包含入口：`packages/cli` 增 sandbox 打包目标（`noExternal` 内联 + 复制 skills 静态目录）、`DEPENDFIX_SKILLS_DIR` 覆盖、`apps/platform/Dockerfile` 复制到 `/app/sandbox/`。
  - 真实执行：CLI 增 `--result-json`（显式 `{exitCode, result}`，不复用报告副产物 `summary.json`）→ `buildCmd` 改 clone → 运行 CLI → 读结果；`parseRunResult` 契约不变。
  - 入口恢复：移除编排 / schema / UI 三处入口闸、补 i18n 与 `quick-start.md` / `deployment.md` 入口状态段、提供可选 `sandbox-daemon` compose 片段（示例级，不纳入本原子验收）、gated e2e（`SANDBOX_E2E=true`，与 container 结果对照）。
  - 既有设计稿与镜像同步：`executor-sandbox.md` 状态 / 缺口段、`executor-sandbox-implementation.md` 的「入口关闭 / 恢复后目标形态」四处、`docs/i18n/en-US/guide/quick-start.md` 镜像、两处「缺口见 backlog」指针改指 `todo.md` M57.1（既有 governance 设计稿更新，不新写设计稿）。
  - 降级守卫：`executorKind=sandbox` 且模式非 report-only 时降级 container，并记 `sandbox_fix_requires_egress_policy`。
- **验收标准**：
  1. 无 workspace `node_modules` 时 `node /app/sandbox/bin.mjs --version` 与平台一致、skills doctor 通过。
  2. report-only 返回真实 `RunResult`（fixture 告警数与 container 一致）。
  3. API / UI 可恢复 sandbox 入口且无 `sandbox_entry_disabled`；e2e 覆盖 report-only 真实执行。
  4. 降级矩阵不回归：daemon 不可用 → degraded；运行期 errno → failed；fix 模式 → degraded + `sandbox_fix_requires_egress_policy`。
  5. 安全基线逐项核验（非 root 100:100 / 不挂 docker.sock / 网络 / cgroup / 超时）+ 威胁建模评审。
- **不做什么**：不把 T1002 代理接入 sandbox 执行路径（另条候选）；不做 K8s / Helm；不自动安装 daemon；不改 container / action 路径；不为单可信仓库默认启用。
- **依赖**：外部 rootless daemon（quick-start 已有步骤）；`SANDBOX_RUNTIME` / `SANDBOX_IMAGE` 既有；T1002 代理接入是 fix 模式放行的前置。
- **交付物**：6-9 commits / 17-23 文件 / 900-1400 行。
- **子批次与独立验收点**（§1.1 拆分依据，单原子 >10 文件 / 800 行）：① 自包含入口 + `--result-json` + 真实执行 → AC1 / AC2；② 入口恢复 + 设计稿 / 镜像 / 指针同步 + 降级守卫 + 安全基线 → AC3 / AC4 / AC5。
- **风险与缓解**：bundle 动态 `require` / 可选依赖 / `--version` 读 `package.json` → 冒烟三连（版本 / skills / 一次 report-only）；镜像体积 → 用 bundle 不用 `pnp`；daemon 环境差异 → 降级矩阵用例。

### M57.2 [P2 🛡️] 队列终态不被迟到 worker 覆盖

- **目标**：清理侧（孤儿回收 / 超时）把 run 置 `failed` 后，仍在执行的 worker 不得用整行 `save` 覆盖终态。
- **优先级**：P2（队列可靠性；已有清理后终态被覆盖的实例）。
- **范围**：`apps/platform/server/services/scan-orchestrator.service.ts`（最终写库改条件更新 / 重读短路）、`scan-queue.ts` 相关路径、定向单测与集成用例、`platform.md` / 设计口径同步。
- **验收标准**：
  1. 构造「清理先置 failed + worker 后完成」→ 终态保持 failed / 不被覆盖，且留审计说明。
  2. 正常路径（pending/running）完成写回不回归；`reuse` 与 `force-fail` 路径兼容。
  3. 条件更新用读取时状态（乐观锁）或「仅 pending/running 才写」，有 `affected` 断言。
- **不做什么**：不改队列驱动 / 重试语义；不改 force-fail 入口；不引入分布式锁。
- **依赖**：M38 队列进程隔离；[开发规范 §5.1 规则表 5.1.36](../standards/development.md) 条件 UPDATE 口径。
- **交付物**：2-3 commits / 3-5 文件 / 150-300 行。
- **风险与缓解**：条件写过严会吞正常完成 → 以「重读 + 仅未终态才写」双保险，并用正常路径用例锁定。

### M57.3 [P2 🛡️] 回归与审计真实性

- **目标**：周回归的 `security:audit-deps` 在 registry 故障时不再上报通过；回归窗口新 entry 不再嵌套进上一条受管块。
- **优先级**：P2（门禁假绿；日志结构污染）。
- **范围**：`scripts/regression/run-periodic-regression.mjs`（registry 故障识别 → `unknown / pending` 而非 pass）、`scripts/shared/regression-window.mjs`（插入点改顶层）、单测与夹具、`testing.md` / `planning.md` 口径同步。
- **验收标准**：
  1. 模拟 registry 故障（非 0 + registry 特征）→ 步骤结果不是 pass（unknown / pending + 可见告警）。
  2. 连续写入两个窗口 entry → 后者为顶层 `## YYYY-MM-DD`，不嵌套、既有内容零改动。
  3. 单测覆盖 registry 故障 / 正常通过 / 插入点三种形态；`regression:weekly` 试运行不回归。
- **不做什么**：不改周回归命令集与 profile；不改窗口日志字段（除插入点）。
- **依赖**：M49.3 边界；M44 回归窗口初始化。
- **交付物**：3-4 commits / 4-6 文件 / 250-450 行。
- **风险与缓解**：fail-closed 会阻断周回归 → 用 `unknown / pending` 显式状态，仅在真实失败时阻断。

### M57.4 [P2 🛠️] 平台 typecheck 覆盖 node config

- **目标**：`pnpm --filter @dependfix/platform typecheck` 实际检查 `.nuxt/tsconfig.node.json`，并修掉两个既有错误。
- **优先级**：P2（配置面长期不在门禁内）。
- **范围**：`apps/platform/package.json`（typecheck 脚本，脚本内先 `nuxt prepare` 且 CI 同序，可实证）、`nuxt.config.ts`（icon `rel` 联合、i18n locales readonly）、CI 注释 / 文档。
- **验收标准**：
  1. 在 node project 注入一个类型错误 → typecheck 非 0（当前会静默放过）。
  2. 两个既有错误清零；`emitDecoratorMetadata` / `experimentalDecorators` 组合告警必须通过显式 tsconfig override（或等价配置）消除，不得以文档说明代替修复。
  3. CI 增量耗时可控（记录前后实测）。
- **不做什么**：不关闭 strict / 不扩大 `skipLibCheck`；不改 Nuxt 大版本。
- **依赖**：无（`nuxt prepare` 已在 CI 链内）。
- **交付物**：2-3 commits / 3-5 文件 / 200-350 行。
- **风险与缓解**：`.nuxt` 产物依赖 prepare → 脚本内先 prepare；CI 顺序与本地一致。

### M57.5 [P2 🛠️] 列表查询并列次键

- **目标**：家族共 6 处列表在主排序键并列时顺序稳定（`runs/index` 已由 M56.2 覆盖，本原子补 5 处），分页不重不漏。
- **优先级**：P2（视觉 / 截断集合抖动潜伏；M51.6 同 pattern 残余）。
- **范围**：`api/runs/[id].get.ts`（severity）、`api/audit-events/index.get.ts`、`api/pr-checks/index.get.ts`、`api/notifications/index.get.ts`、`api/batch-runs/index.get.ts`（共 5 处新增；`runs/index` 已在 M56.2 完成）、对应单测；若新增检查点口径则同步 `code-quality-checklist` 矩阵（不新增条目则不登记）。
- **验收标准**：
  1. 并列主键时两次查询顺序一致（`createdAt DESC, id DESC` / `severity ASC, id DESC`）。
  2. 分页翻页不重复 / 不丢失；`take(N)` 截断集合稳定。
  3. 6 处均有并列用例（5 处新增 + 1 处沿用既有 `runs/index` 用例）；既有接口返回结构不变。
- **不做什么**：不改筛选语义 / 返回结构；不统一抽列表 composable；不评估 / 不覆盖 `repos` / `schedules` / `credentials` 等其余列表（另条候选）。
- **依赖**：M51.6 已确立的次键口径。
- **交付物**：2-3 commits / 8-12 文件 / 250-400 行。
- **风险与缓解**：次键为 `id`（主键）无需新索引；`runs/[id]` 有视觉基线 → 详情弹窗复跑视觉。

### M57.6 [P2 🚀🧪] 发布后镜像运行时冒烟

- **目标**：release 后用 `read:packages` 凭证拉取镜像跑 `/api/health`（amd64 + arm64），失败告警不阻断发布；补历史 tag 巡检。
- **优先级**：P2（发布置信；arm64 目前只证 manifest 存在，不证可启动）。
- **范围**：`release.yml` 后置步骤 / `docker.yml`、冒烟脚本、`docs/guide/release.md`、失败告警通道（issue / 日志）。
- **验收标准**：
  1. 发布后自动冒烟 amd64 + arm64（原生 arm runner，不用 QEMU），输出 `/api/health` 版本与 commit。
  2. 冒烟失败不改变发布成功判定，但产生可见告警 / 记录。
  3. 历史 tag 巡检产出报告（缺项写「未证实」）。
- **不做什么**：不改镜像构建架构与发布判定；不引入 QEMU；不对每次 push 运行（仅 release / dispatch）。
- **依赖**：M54.6 发布流水线；`GH_PAT` / packages 读权限。
- **交付物**：2-3 commits / 4-6 文件 / 250-400 行。
- **风险与缓解**：拉取凭证 / 网络失败 → fail-open（告警不阻断）；runner 成本 → 仅 release 触发。

### 追加临时待办（不占阶段条目编号）：线上 schema 漂移恢复清单 + 启动期漂移检测

- **来源 / 授权**：2026-11-09 用户报告 `https://dependfix.dev` 多页面 `Server Error`，服务端日志 `SQLITE_ERROR: no such column: ScanRun.execution_timeout_ms`（生产可用性事故，属插队例外清单第 3 类），用户明确授权「先写恢复清单，再落地启动期漂移检测 + 测试」。
- **评估结论**：根因 = 线上库 pending migration 未执行（`3000000000000` / `3000000000001` / `3100000000000`，库停在 2026-10-30 schema）；部署 commit `38c35ad0` 已含迁移，`/api/health` = `drift` 前无任何启动期信号。范围收敛为「运维恢复清单 + 只读检测 + health 状态枚举」，不改迁移语义、不做启动阻断。
- **目标**：让「存量库缺列」在启动期与部署自检中可见，并给出可复制的恢复步骤。
- **范围**：`docs/guide/deployment.md` + en-US 镜像（恢复清单 / 故障排查行）；`docs/standards/platform.md` §3.3 / §10.7；`server/database/schema-drift.ts`（检测 + 状态）、`server/database/index.ts`（启动接线）、`server/api/health.get.ts`（`schema` 字段）与对应测试。
- **验收标准**：① 缺列 / 缺表 / 多列三种形态的检测用例通过，自定义 `entityPrefix` 生效；② `synchronize=true` 与 worker 进程跳过、检测异常 fail-open；③ `/api/health` 返回 `schema: ok|drift|unknown` 且无表名 / 列名；④ `pnpm run check:docs` 0 error、`lint-md` 0、定向 vitest 全绿。
- **不做什么**：不做启动阻断 / 自动修复；不检测索引 / 类型差异；不新增公开端点；不在 health 暴露 schema 明细。
- **依赖**：2026-11-09 生产事故取证；`server/database/migrations/*` 为 schema 事实源。
- **交付物**：2 commits / 11 文件 / ~554 行（doc 清单 + 代码与测试 + review 修复；行数按 `git diff` + 新增文件行数实测）。
- **风险与缓解**：检测误报（视图 / 特殊表）→ 只比对 `tableType=regular` 与实体声明列；启动成本 → 冷启动一次、跳过 worker 与 synchronize；信息面 → health 仅状态枚举。
- **残余**：`docker/smoke-test.sh` 的 `schema` 字段断言并入 M57.6 发布冒烟（只断言存在，不锁 `ok`）。
- **容量影响（§3.1.1）**：~2 commits / 11 文件 / ~554 行，低于 M57 基线 50%；本阶段第 1 个插队批次，未达再平衡阈值 1/2/3，不做移出。

---

## 阶段收口要求（M57）

- **质量门**：逐原子 `pnpm run lint:check`（涉样式时另跑 `lint:css:check`）+ `pnpm typecheck` + 定向测试。
- 改 `packages/*/src` 后先 `pnpm -r build` 再 typecheck；改平台页面 / 详情时跑受影响 e2e 与视觉回归。
- **Review Gate**：每原子至少一轮 `Code Auditor`（standard；M57.1 因打包 / 容器 / 入口三闸升 deep），Reject 须闭环复审。
- **证据**：M57.1 留 bundle 三连冒烟 + gated e2e；M57.2 留竞态用例；M57.3 留 registry 故障与插入点用例；M57.4 留注入负例；M57.5 留并列排序用例；M57.6 留双架构 health 回读。
- **不做**：不把 T1002 代理接入夹带进 M57.1；不宣称 fix 模式可用于 sandbox；不为通过门禁放宽阈值。
- **归档**：按 [规划规范 §4](../standards/planning.md) 迁出为 `todo-archive-phases-m57.md` + 索引行 + roadmap 状态同步。

---

## 上一阶段

M56（1.0 后平台可信与运行成本收口）已于 2026-11-09 归档：执行记录见 [archive/todo-archive-phases-m56.md](archive/todo-archive-phases-m56.md)，路线图详情见 [archive/roadmap-phases-m56.md](archive/roadmap-phases-m56.md)，本批经验沉淀见 [experience-archive §八十五](../design/governance/experience-archive-§79-§85-ops-release.md#八十五、m56-归档批次经验沉淀-平台生命周期-三态跳过-静默失败探测-querybuilder-排序-e2e-fixtures-幂等-分片追加)。

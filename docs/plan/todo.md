# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M62 运行日志复盘与执行成本收口**（2026-11-16 规划，6 原子） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M61 已归档、M62 进行中） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M61 已归档；M62 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M62 运行日志复盘与执行成本收口（2026-11-16 规划）

> **目标**：把 2026-11-12 / 11-16 运行日志复盘暴露的三类问题收口——付费基线不做功、运行终态与子进程信号混淆、可修告警无结论；并消除验证链对工作区的写副作用。
>
> **来源**：用户 2026-11-16 选方向 A（运行日志复盘收口）；backlog 上收 6 条候选（41 → 35）：红仓库 baseline 短路 / 命令级 OOM 与终态分离 / 跨 major 混合实例判定前移 / 自仓基线红与只读验证 / 安装基线失败结论 / 收尾未 settle 假超时。
>
> **§3.4 三项交叉核验（2026-11-16 实测）**：① 归档扫描 `红仓库|baseline 短路|命令级 OOM|混合实例|自仓基线|settle` → 仅 M59 命中「取消落定」上下文，无同题闭环；② `git log --grep` → 仅有基线预算夹取（`97d92c0b`）与取消未落定诊断（`82a66f8a`），无短路 / OOM 分层 / 谓词前移 / 只读验证 / 逐告警结论；③ 代码 anchor：`sampleVerificationBaseline` 以 `stopOnFailure: false` 跑完整链；`ScanRun.oomKilled` 仅运行级且 `CommandResult` 无 OOM 字段；`crossMajorOnly`（repo-fix.ts:153）已参与 `hasWork`（:172）计算，但 `manualCrossMajorAlerts`（:375）在基线采样之后才判定；默认验证命令含 `pnpm lint`（写模式）；`recordInstallBaselineFailure` 只跳链不落逐告警结论；`settleWithin` 已存在但 momei 11-13 仍有 5m20s 未落定窗口。
>
> **容量基线（逐原子交付物求和）**：commits 17-23 / files 38-52 / 行 2150-3150（行 = diff 改动量含删除）。类型：🛠️6（M62.2 / M62.6 兼 🧪，M62.5 兼 📚）；**🎨 缺口显式标注**：本期为执行可信收口，无独立 UX 原子，平台展示仅随信号分层附带；体验类候选（验证跳过交付可观测性 / 平台侧交付载体 / 批次级续跑入口）留在 backlog 由后续批次承接。
>
> **执行顺序**：M62.1 → M62.2 → M62.3 → M62.4 → M62.5 → M62.6（先砍成本、再分层信号、再修判定与链、最后处理收尾）。
>
> **D 阶段决策点**：D1（M62.1）短路粒度（仅安装失败短路，其余命令保留独立结论）；D2（M62.2）命令级 OOM 字段落点与展示层级；D3（M62.3）manual-cross-major 谓词复用位置；D4（M62.4）默认链只读化范围（有 `lint:check` 时用之，否则回退 `lint`）；D5（M62.5）修复后重试一次的上限与审计；D6（M62.6）落定判据（收尾后 10s 内）。

### M62.1 红仓库 baseline 预失败短路与跳过归因（P1 🛠️）

- **目标**：已确认为红的仓库不再每轮支付完整基线；短路项带明确原因，报告与平台可判读「未跑 ≠ 通过」。
- **优先级**：P1（窗口 48% 机时为 pre-fix baseline，两仓占 63%；测量方 = 执行角色，来源 `runs-logs-20261112-143354.txt` 首末日志求和；11-16 复现：momei 11-13 baseline 24m25s）。
- **范围**：`packages/engine/src/app/verify-project.ts` 的 `sampleVerificationBaseline` 增加短路策略（安装命令失败即跳过后续命令；非安装命令失败仍保留独立结论，避免 install 红遮蔽 test 红的历史问题）；跳过原因进入 `verificationSkippedByReason` 家族（与 `budget` / `no-write` 区分）；报告段与平台运行详情展示。
- **验收标准**：① 红仓库单轮基线耗时较当前下降 ≥ 50%（以 momei / rss-impact-server 实测对比；测量时点为 M62.1 落地时口径，命令集不变）；② 每个短路命令带原因与「未验证」语义，报告 / 详情不显示为通过；③ 非红仓库链条零回归；④ 单测覆盖「安装失败短路」「非安装失败继续」「预算耗尽」三态；⑤ `gates:docs` 通过。
- **不做什么**：不改验证链条数与顺序（除短路）；不为单仓硬编码；不改 30 分钟运行上限。
- **依赖**：`verify-project.ts` 现有预算夹取（`97d92c0b`）；M56.3 三态跳过语义。
- **交付物**：4-5 commits / 8-10 files / 450-650 行。
- **风险与缓解**：短路吞掉独立失败 → 仅安装命令短路 + 三态用例；不引入降频，短路后新增失败由下一轮全链重新判定。

### M62.2 命令级 OOM 与运行终态分离（P1 🛠️🧪）

- **目标**：同一「OOM」信号只落一个字段层级——运行级 cgroup OOM 与命令级堆 OOM 分开，`completed` 运行不再出现「OOM 终止」。
- **优先级**：P1（completed + OOM 并置会误导交付结论；11-16 复现：rss-impact-server 11-13/14/15 连续 3 次「OOM 终止：是」+ completed）。
- **范围**：`packages/engine/src/runners/verification-runner.ts` 的 `CommandResult` 增命令级 OOM 标记（SIGKILL / exit 137 / `heap limit` 特征，含命令名）；`apps/platform/server/entities/scan-run.ts` 的 `ScanRun.oomKilled` 与 `executor/types.ts` 保持运行级语义；报告 `Errors` / 资源段与平台 `api/runs/*`、`run-detail-dialog`、导出按层级展示；命令级 OOM 不计入运行失败率，但仍阻断交付（沿用 pre-existing 判定）。
- **验收标准**：① 构造命令级 OOM 用例后运行终态为 `completed` 时不再输出「OOM 终止」；② 运行级 OOM 仍输出「OOM 终止」；③ 导出与详情可分辨「命令级 OOM / 运行级 OOM / 超时」三类；④ 平台列表失败率口径有单测锁定；⑤ 全量相关测试通过。
- **不做什么**：不采宿主级 OOM / `dmesg`；不改 30 分钟上限；不改 pre-existing 豁免策略。
- **依赖**：`ScanRun.oomKilled` 与资源快照（M59.4 / M60.4）；`run-failure-taxonomy` 现有分类。
- **交付物**：3-4 commits / 8-12 files / 400-600 行。
- **风险与缓解**：特征误判 → 只认 SIGKILL + 137 + 堆错误文本三者组合；展示层遗漏 → 列表 / 详情 / 导出三处同批改并留快照。

### M62.3 跨 major / 混合实例判定前移与 advisory 区间（P1 🛠️）

- **目标**：全部告警都需人工跨 major 或仅传递依赖时，不再先付完整基线；混合实例按 advisory 区间过滤，跳过原因可区分。
- **优先级**：P1（实测零写入基线合计约 86 分钟；测量方 = 执行角色，来源 `runs-logs-20261116-043236.txt`，按各 run 首末日志求和）。
- **范围**：`packages/engine/src/app/repo-fix.ts` 把 `manualCrossMajorAlerts` 判定（纯读）前移到 `hasWork` 之前并复用同一谓词；`allowMajorUpgrade` 按实际 auto-eligible 子集计入；`belowTarget` 按 advisory 受影响区间过滤旧实例；跳过原因拆为 `cross-major` / `mixed-instance` / `transitive-only`。
- **验收标准**：① 三类仓库（全人工跨 major / 混合实例 / 开关开但仅传递依赖）单轮跳过基线且 group 路径仍记 `cross-major`；② 非跨 major 仓库零回归；③ 三类跳过原因在报告可区分；④ 单测覆盖谓词前移与区间过滤；⑤ `gates:docs` 通过。
- **不做什么**：不改验证链条；不把人工跨 major 自动升级；不放宽 `allowMajorUpgrade` 准入。
- **依赖**：`repo-fix.ts` 现有 `crossMajorOnly` / `manualCrossMajorAlerts`；advisory 区间数据（Dependabot alert）。
- **交付物**：2-3 commits / 4-6 files / 300-450 行。
- **风险与缓解**：谓词前移与写盘判定漂移 → 复用同一谓词并加「有写入不得跳过」反例；区间过滤误删可修实例 → 以 alert 的 vulnerable range 与实例版本双向断言。

### M62.4 自仓基线红与验证链只读化（P1 🛠️）

- **目标**：验证链不再以写模式跑 lint（避免基线采样修改工作区），并让自仓基线红有可判读结论而非长期 `pre-existing` 豁免。
- **优先级**：P1（自仓连续 3 轮 lint + test 预失败；写模式 lint 会污染 pristine 前提）。
- **范围**：`packages/engine/src/app/verify-project.ts` 的默认链在目标仓库存在 `lint:check` 时改用只读命令，否则回退 `lint`；自仓 baseline 复现取证（stderr / 内存 / 并发）；自仓交付验证不再依赖 `pre-existing` 豁免；文档记录只读链口径。
- **验收标准**：① 基线采样前后 `git status --porcelain` 为空（写模式不再触发）；② 自仓 baseline 全绿，或给出可复现的环境性证据并登记已知边界；③ 自仓有可修告警时交付验证不落 `pre-existing`；④ 无 `lint:check` 的仓库回退行为有单测；⑤ `gates:docs` 通过。
- **不做什么**：不为自仓硬编码跳过验证；不改 test 链；不改构建命令。
- **依赖**：`resolveVerifyCommands` 默认链；根 `lint:check` 与平台 `lint:check` 脚本。
- **交付物**：2-3 commits / 5-7 files / 250-400 行。
- **风险与缓解**：目标仓库无 `lint:check` → 保留回退并测两态；只读链漏掉自动修复能力 → 仅基线采样用只读，修复后验证仍按原链；开工首步复跑自仓 baseline，若已转绿则本原子收窄为只读链并记录复验证据。

### M62.5 安装基线失败后的告警结论与有界重试（P2 🛠️📚）

- **目标**：坏 lockfile 仓库的每条告警都有明确 skipped 原因；修复成功且安装复检通过后，按预算允许一次升级链重试。
- **优先级**：P2（`no skipped outcome recorded` 会让告警级结论整批丢失）。
- **范围**：`packages/engine/src/app/repo-fix-finalize.ts` 与 `repo-fix.ts`：安装基线失败时逐告警写 `skipped('install-baseline-failed')`；`finalizeRepoFix` 的 lockfile 修复成功后按预算重试一次升级链，记审计条目；报告 / 平台详情展示该原因。
- **验收标准**：① 坏 lockfile 仓库报告无 `no skipped outcome recorded`，每条告警有原因；② 重试有预算上限与审计条目，且只重试一次；③ 非坏 lockfile 仓库零回归；④ 单测覆盖「不重试直接落结论」「修复成功后重试」「预算不足不重试」；⑤ `gates:docs` 通过。
- **不做什么**：不改 lockfile 修复策略（REGENERATE / FIX_ENTRIES / REINSTALL）；不无限重试。
- **依赖**：`recordInstallBaselineFailure` / `findInstallBaselineFailure`；`finalizeRepoFix` 顺序。
- **交付物**：3-4 commits / 6-8 files / 350-500 行。
- **风险与缓解**：重试放大预算 → 单次 + 预算门；告警级原因与汇总不一致 → 以告警级为单一事实源并加汇总断言。

### M62.6 收尾未 settle 导致的假超时与取消诊断（P2 🛠️🧪）

- **目标**：收尾阶段完成后运行在 10s 内落定，不再被游离句柄拖到运行级 `execution_timeout`；诊断能区分在管子进程与未关闭句柄。
- **优先级**：P2（momei 11-13 收尾完成后 5m20s 才 abort；来源 `runs-logs-20261113-045612.txt`）。
- **范围**：`apps/platform/server/services/executor/container-executor.ts` 与 `engine-run.ts`：复现并抓 `ps -ef --forest` 与受管命令输出快照；超时命令的进程组清理与 stdio 关闭断言；`describeUnsettledRun` 增「游离句柄」维度；收尾完成即落定，不等运行级上限。
- **验收标准**：① 复现运行收尾后 10s 内落定，不再记 `execution_timeout`；② 取消诊断可区分「在管子进程 / 未 settle 句柄」；③ 其余超时路径零回归；④ 定向测试覆盖收尾落定与诊断文本；⑤ `gates:docs` 通过。
- **不做什么**：不改 30 分钟上限；不采宿主级 OOM 证据；不改沙箱与容器降级顺序。
- **依赖**：M59.3 取消落定与 `settleWithin` / `describeUnsettledRun`；`container-executor` 收尾路径。
- **交付物**：3-4 commits / 7-9 files / 400-550 行。
- **风险与缓解**：问题不可复现 → 先落取证脚本与诊断增强，复现条件写入 backlog；误杀父进程 → 只清理运行创建的进程组并断言父子关系。

### 追加临时待办（不占阶段条目编号）

> **来源**：用户 2026-11-17 直接授权修复现网事故（`rsshub-never-die#264`：自动修复 PR 只删除 `pnpm-lock.yaml`，-10,249 行）；属「直接影响可用性的生产事故」插队，闭环后随阶段归档。

- **目标**：锁文件修复的成功判据落到**产物**（存在 + 可解析），任何路径都不再产出「删除锁文件」的净变更；交付侧白名单拒绝白名单文件的删除。
- **范围**：`packages/engine/src/fixers/pnpm/index.ts` 与 `lockfile-artifact.ts`（`inspectLockfileArtifact` + 策略 / 验证双重校验）；`packages/engine/src/github/commit-scope.ts`（白名单删除 → `UNEXPECTED_CHANGES`）；设计记录 §3.3。
- **验收标准**：① 模拟「pnpm 全部退出 0 但不写锁文件」时 repair 返回失败且原文件逐字节恢复、无 `.bak` / `.broken` 残留；② 产物为重复 key 的 YAML 时同样失败；③ 白名单文件删除被拒提交；④ 定向用例通过；⑤ `gates:docs` 通过。
- **风险与依赖**：`yaml` 严格解析可能拒绝历史上被 pnpm 容忍的锁文件 → 仅用于「修复成功」判据，不影响「已合规」早退路径；依赖 M62.5 的安装失败结论口径。

## 上一阶段
M61（文档与 AI 治理）已于 2026-11-16 归档：见[执行记录](archive/todo-archive-phases-m61.md) / [路线图](archive/roadmap-phases-m61.md)；更早阶段见 [todo-archive.md](todo-archive.md)。

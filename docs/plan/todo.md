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

### M62.1 红仓库 baseline 预失败短路与跳过归因（P1 🛠️）—— ✅ 已闭环

- **目标**：已确认为红的仓库不再每轮支付完整基线；短路项带明确原因，报告与平台可判读「未跑 ≠ 通过」。
- **优先级**：P1（窗口 48% 机时为 pre-fix baseline，两仓占 63%；测量方 = 执行角色，来源 `runs-logs-20261112-143354.txt` 首末日志求和；11-16 复现：momei 11-13 baseline 24m25s）。
- **范围**：`packages/engine/src/app/verify-project.ts` 的 `sampleVerificationBaseline` 增加短路策略（安装命令失败即跳过后续命令；非安装命令失败仍保留独立结论，避免 install 红遮蔽 test 红的历史问题）；跳过原因进入 `verificationSkippedByReason` 家族（与 `budget` / `no-write` 区分）；报告段与平台运行详情展示。
- **验收标准**：① 红仓库单轮基线耗时较当前下降 ≥ 50%（以 momei / rss-impact-server 实测对比；测量时点为 M62.1 落地时口径，命令集不变）；② 每个短路命令带原因与「未验证」语义，报告 / 详情不显示为通过；③ 非红仓库链条零回归；④ 单测覆盖「安装失败短路」「非安装失败继续」「预算耗尽」三态；⑤ `gates:docs` 通过。
- **不做什么**：不改验证链条数与顺序（除短路）；不为单仓硬编码；不改 30 分钟运行上限。
- **依赖**：`verify-project.ts` 现有预算夹取（`97d92c0b`）；M56.3 三态跳过语义。
- **交付物**：4-5 commits / 8-10 files / 450-650 行。
- **风险与缓解**：短路吞掉独立失败 → 仅安装命令短路 + 三态用例；不引入降频，短路后新增失败由下一轮全链重新判定。
- **执行记录（2026-11-17，4 commits：`52bb7430` core 契约 / `736d01a8` engine 短路 / `7c6f9dae` platform 展示 / `81980774` 文档）**：
  - **实现**：`sampleVerificationBaseline` 传 `stopOnFailureWhen: isInstallCommand`（安装命令失败即不再 spawn 后续命令；非安装失败仍完整采样）；被短路命令经 `SampleBaselineOptions.onSkipped` 回报 → `ensureVerificationBaseline` → `RepoFixProgress` → `RepositoryResult.baselineSkippedCommands` → `summary.baselineSkippedCommands`（按**命令**计）；报告新增 `## Baseline Skipped` 段（逐条：仓库 / 命令 / 原因）；平台 `run-detail-dialog` 与 `repo-history-dialog` 两处详情显示「基线未采样 N 条命令 · 未采样」+ 语义 tooltip；e2e `scans` case 10b 覆盖正负向。
  - **AC①（≥50%）**：本地红仓库夹具（`preinstall` 确定性失败 + 其余 4 条命令各 1.2s）实测完整链 8210ms → 短路 1483ms，**降幅 81.9%**；机制上红仓库必然省掉 install 之后全部命令。**残余**：momei / rss-impact-server 真实仓库对比未取得——本机 `github.com` 出站被阻断（`api.github.com` 可达），补测条件 = 具备 github.com 出站 + 可克隆夹具时按同命令集复跑；测量用例为临时文件（测后删除），复现方式见本条实现说明（夹具脚本同上）。
  - **AC②（原因 + 未验证语义）**：每条短路命令带 `reason: 'install-baseline-failed'`；报告 / 详情文案显式「未采样」，不渲染为通过。**口径偏差（待用户裁决）**：AC② 原文「进入 `verificationSkippedByReason` 家族」改为**独立词汇表** `BASELINE_SKIP_REASONS` + 命令级字段——该家族语义是「终验未执行」（budget / no-write），而基线短路时终验照常执行，混入会让同一字段承载两种互斥事实，且分母从「按仓库」变「按命令」会污染既有指标；审计（分区 A）判定该偏差**优于原文**，仍需用户确认后同步修订 AC② 原文。
  - **AC③（非红零回归）**：`stopOnFailureWhen` 仅在命令失败分支求值，install 绿时永不触发；engine 全量 1955 passed / 1 skipped、platform 2659 passed / 10 skipped、core 289 passed。
  - **AC④（三态）**：安装失败短路 / 非安装失败继续 / 预算耗尽——前两态在 `verify-project-baseline-chain.test.ts`（4 例，含 install 非链首、未采样命令不获既有失败豁免）+ `verification-runner.test.ts`（谓词命中短路 / 未命中继续）；预算耗尽沿用 `verify-project.test.ts` 与 `quick-verify-budget.test.ts` 既有覆盖。回退探针（3 组）：删 `sameRepo` 守卫 / 删 `progress.baselineSkippedCommands` 透传 / 删未执行过滤 → 均变红。
  - **AC⑤**：`gates:docs` 21 项通过；`check:contract-freeze` 11 项 OK（契约清单新增 `baselineSkippedCommands`）；`lint:check` 0 error / 2 存量 warning；`typecheck` 7 项目；`pnpm -r build` 与 platform build 通过；e2e scans + alerts 14 passed。
  - **规模偏差**：实际 20 文件（预估 8-10）——展示面（2 处详情 + i18n 双语 + e2e fixture）与契约面（contract-freeze + 2 份设计文档）同批落地；按 4 个 commit 拆分（core 契约 / engine 短路 / platform 展示 / 文档），单 commit ≤ 10 文件。
  - **审计**：deep（19 文件跨 core / engine / platform 三包）两分区并发 R1 均 **Reject**（A：todo 记录缺失 + 3 处回退后仍绿；B：`report-generator` 「互斥」口径与实现相反 + 平台「逐条披露」过度声称）→ 全部收口（补 3 组回退探针、简化冗余索引守卫、补齐旧口径注释与文档、两处详情 + e2e、i18n 条件句与正文限定语）→ R2 Reject（§12.13 结论句与节次地图编号）→ 收口 → R3 **Pass**（代码与测试面无新增 blocker，文档面两处已修净）。
  - **残余**：① AC② 措辞待用户裁决；② 真实仓库对比待环境（github.com 出站）；③ `quickVerifyProject` 的「基线已红命令不重跑」只认真实失败命令，install 红 + 自动修复型 Code Scanning 告警的仓库会在批级 quick-verify 重跑一次 lint（成本面，方向仍为净收益：基线省 3-4 条命令 vs quick-verify 多 1 条）。

### M62.2 命令级 OOM 与运行终态分离（P1 🛠️🧪）—— ✅ 已闭环

- **目标**：同一「OOM」信号只落一个字段层级——运行级 cgroup OOM 与命令级堆 OOM 分开，`completed` 运行不再出现「OOM 终止」。
- **优先级**：P1（completed + OOM 并置会误导交付结论；11-16 复现：rss-impact-server 11-13/14/15 连续 3 次「OOM 终止：是」+ completed）。
- **范围**：`packages/engine/src/runners/verification-runner.ts` 的 `CommandResult` 增命令级 OOM 标记（SIGKILL / exit 137 / `heap limit` 特征，含命令名）；`apps/platform/server/entities/scan-run.ts` 的 `ScanRun.oomKilled` 与 `executor/types.ts` 保持运行级语义；报告 `Errors` / 资源段与平台 `api/runs/*`、`run-detail-dialog`、导出按层级展示；命令级 OOM 不计入运行失败率，但仍阻断交付（沿用 pre-existing 判定）。
- **验收标准**：① 构造命令级 OOM 用例后运行终态为 `completed` 时不再输出「OOM 终止」；② 运行级 OOM 仍输出「OOM 终止」；③ 导出与详情可分辨「命令级 OOM / 运行级 OOM / 超时」三类；④ 平台列表失败率口径有单测锁定；⑤ 全量相关测试通过。
- **不做什么**：不采宿主级 OOM / `dmesg`；不改 30 分钟上限；不改 pre-existing 豁免策略。
- **依赖**：`ScanRun.oomKilled` 与资源快照（M59.4 / M60.4）；`run-failure-taxonomy` 现有分类。
- **交付物**：3-4 commits / 8-12 files / 400-600 行。
- **风险与缓解**：特征误判 → 只认 SIGKILL + 137 + 堆错误文本三者组合；展示层遗漏 → 列表 / 详情 / 导出三处同批改并留快照。
- **执行记录（2026-11-17，5 commits：`48bd6c13` core 契约 / `4c3ab1d7` engine 判定 / `e46a6c84` platform 详情 / `778e1b23` platform 导出与状态分布 / `33ae9973` 文档）**：
  - **实现**：`CommandResult.oomKilled`（`isCommandOomKilled`：非超时 / 非取消 / 非成功，且 `SIGKILL`、退出码 137、堆错误文本 `JavaScript heap out of memory` / `Reached heap limit` 三选一；文本探针取输出末 4000 字符）→ 验证动作 `FixAction.oomKilled` → `summary.commandOomKills`（按命令实例计）+ `commandOomCommands`（去重 ≤10，样本子集）；报告新增 `## Command OOM` 段；平台导出 `describeRunAttribution` 分层（命令级优先，`completed` 时抑制运行级；`failed` 两类并列；「超时终止」单列且 `failure_code` 未回填时回退 `errorJson.code`）；详情新增命令级行（正文内命令名）+ 运行级行改分层可见性（composable `use-run-oom`）。运行级 `ScanRun.oomKilled` 语义不变。
  - **AC①（completed 不再输出「OOM 终止」）**：导出用例锁定 `completed + oomKilled=true + commandOomKills=1` → 只输出「命令级 OOM」，不含运行级；详情 e2e 同断言。
  - **AC②（运行级仍输出）**：导出用例锁定 `failed + oomKilled=true`（无命令级）→「运行级 OOM：是」；详情 e2e 锁定「运行级 OOM 是」。**口径偏差（待用户裁决）**：标签由「OOM 终止」改为「运行级 OOM」（AC③ 三类可分辨所需），语义不变。
  - **AC③（导出与详情可分辨三类）**：导出三行并列（命令级 / 运行级 / 超时终止）；详情为命令级行 + 运行级行 + 失败横幅错误码（`execution_timeout`）与 `failureCode`——详情侧超时不单列（已在设计记录写明，避免过度声称）。
  - **AC④（平台失败率口径）**：平台**无独立失败率指标**（全仓 `失败率` / `failureRate` 零命中）；实际口径是状态分布与批次计数，只读 `run.status`。已加 `scan-history/summary.get.test.ts` 用例锁定「completed + commandOomKills>0 → `byStatus.completed` 增加、`failed` 不变」，并在 taxonomy §5.10 写明「阻断交付走 `verificationBlocking`」。**口径偏差（待用户裁决）**：AC④ 原文的「失败率」在本仓不存在，按「状态分布」解释。
  - **AC⑤**：`pnpm -r build` / `typecheck` 7 项目 / `lint:check` 0 error（2 存量 warning）/ `gates:docs` 21 项 / e2e `alerts-sidebar` 5 + `scans` 14 通过；回退探针：删 `exitSignal = signal`、删 `aborted: isAbortRequested()`、删未执行过滤式 OOM 守卫均变红（wiring 用例 3 例 + 纯函数 4 例）。
  - **规模偏差**：实际 28 文件（22 改 + 6 新增，预估 8-12）——展示面（导出 + 详情 + i18n + e2e）、契约面（summary / FixAction 字段）与测试面（5 个新测试文件 + 1 个 composable）同批落地；按 4 个 commit 拆分，单 commit ≤10 文件。
  - **审计**：deep 两分区并发 R1 均 **Reject**（A：wiring 零覆盖 + 成功命令可被标 OOM + 堆文本过宽 + types.ts 预算贴顶；B：AC④ 无实现面 / 口径自相矛盾、导出漏存量超时、`v-if` 组合导致两行同消失、计数与名单口径不一致）→ 收口 → R2 **Reject**（文档字段挂错接口、抑制条件与可见性未同源、探针先截头再取尾、i18n 对 failed 过度声称、死导入）→ 收口 → R3 **Reject**（§2.7 类型归属、规模计数、标题状态词）→ 收口 → R4 **Pass**（3 处改净，允许提交）。
  - **残余**：① AC② / AC④ 措辞待用户裁决；② fixer 侧安装命令 OOM 不产生 `FixAction.oomKilled`（仅验证链归因，已在 taxonomy §5.10 写为已知边界）；③ `/scans` 单 run 详情（`repo-history-dialog`）未展示资源 / OOM 项（本批范围外，后续可评估）；④ 报告 `## Command OOM` 段未区分 `preExisting`（红仓库已知 OOM 命令每轮都会列出）。

### M62.3 跨 major / 混合实例判定前移与 advisory 区间（P1 🛠️）—— ✅ 已闭环

- **目标**：全部告警都需人工跨 major 或仅传递依赖时，不再先付完整基线；混合实例按 advisory 区间过滤，跳过原因可区分。
- **优先级**：P1（实测零写入基线合计约 86 分钟；测量方 = 执行角色，来源 `runs-logs-20261116-043236.txt`，按各 run 首末日志求和）。
- **范围**：`packages/engine/src/app/repo-fix.ts` 把 `manualCrossMajorAlerts` 判定（纯读）前移到 `hasWork` 之前并复用同一谓词；`allowMajorUpgrade` 按实际 auto-eligible 子集计入；`belowTarget` 按 advisory 受影响区间过滤旧实例；跳过原因拆为 `cross-major` / `mixed-instance` / `transitive-only`。
- **验收标准**：① 三类仓库（全人工跨 major / 混合实例 / 开关开但仅传递依赖）单轮跳过基线且 group 路径仍记 `cross-major`；② 非跨 major 仓库零回归；③ 三类跳过原因在报告可区分；④ 单测覆盖谓词前移与区间过滤；⑤ `gates:docs` 通过。
- **不做什么**：不改验证链条；不把人工跨 major 自动升级；不放宽 `allowMajorUpgrade` 准入。
- **依赖**：`repo-fix.ts` 现有 `crossMajorOnly` / `manualCrossMajorAlerts`；advisory 区间数据（Dependabot alert）。
- **交付物**：2-3 commits / 4-6 files / 300-450 行。
- **风险与缓解**：谓词前移与写盘判定漂移 → 复用同一谓词并加「有写入不得跳过」反例；区间过滤误删可修实例 → 以 alert 的 vulnerable range 与实例版本双向断言。
- **执行记录（2026-11-17，4 commits：`7cfee076` core 契约 / `cac5a86e` 文档 / `69889a0d` engine 判定 / `3d0e9248` platform 展示）**：
  - **实现**：新增 `app/cross-major.ts` 纯读谓词（`isManualCrossMajorAlert` / `isTransitiveOnlyCrossMajor` / `isNonWritableMixedInstance` / `assessLockfileWork` / `classifyBelowTargetInstances`），基线采样前置（`processRepoFix`）与修复链（`applyLockfileFixes` / `applyGroupUpgrades`）**共用同一套谓词**；`allowMajorUpgrade` 准入按「开关 + 根直接依赖 + 单实例」的实际 auto-eligible 子集计入（不放宽）；`NormalizedSecurityAlert.vulnerableRange` 由 dependabot（`vulnerable_version_range`）与 pnpm-audit（`vulnerable_versions`）映射，`buildVersionedOverrides` 只对「低于目标且仍受影响」的实例生成覆盖；`SKIP_REASONS` 新增 `mixed-instance` / `transitive-only`，平台原因表与 i18n 同步。
  - **AC①（三类仓库跳过基线）**：`repo-fix-baseline` 新增 4 例——全人工跨 major / 开关开但仅传递依赖 / 混合实例低版本已不在区间 / group 路径低实例部分受影响，均断言基线采样 0 次或按 `mixed-instance` 归因；`cross-major` 保留给「全部低实例仍受影响」与「非 transitive-only 的人工跨 major」。
  - **AC②（非跨 major 零回归）**：`stopOnFailureWhen` 与跨 major 谓词互不影响；engine 全量 1987 passed / 1 skipped、core 292 passed、platform 2669 passed / 10 skipped。
  - **AC③（三类原因可区分）**：`cross-major` / `mixed-instance` / `transitive-only` 均在 `SKIP_REASONS`、`formatSkipReason` 文案、平台 `SKIP_REASON_ORDER` / `SKIP_REASON_I18N_KEYS`（单点映射 + 枚举漂移断言）/ i18n 双语、taxonomy / platform.md / e2e fixtures 枚举登记。
  - **AC④（谓词前移与区间过滤单测）**：`cross-major.test.ts` 14 例（含真实逗号区间、最高实例未达标不得判无工作、同包覆盖低 major 时不得跳基线、`dependencyType` 优先两例）；`repo-fix-baseline` 4 例覆盖前置跳过与 group 归因；`versioned-overrides` 2 例锁定区间过滤（回退变异变红）；`dependabot-fetcher` 断言 `vulnerableRange` 映射。
  - **AC⑤**：`pnpm -r build` / `typecheck` 7 项目 / `lint:check` 0 error（2 存量 warning）/ `gates:docs` 21 项。
  - **规模**：26 文件（23 改 + 3 新增，含本台账；`git status --porcelain | wc -l`）/ 约 800 行（tracked diff +282 −39 + 新增非测试 227 + 新增测试 244 + 其余测试改动），预估 4-6 文件 / 300-450 行——新增原因族与区间字段跨 core / engine / platform 三包，按 4 个 commit 拆分，单 commit ≤10 文件。
  - **审计**：deep 两分区并发 R1 均 **Reject**（A：GitHub 逗号区间不可解析导致过滤整体空转 + 混合实例缺「最高已达标」前提 + override 过滤零覆盖 + pnpm-audit modern 字段名错；B：文档旧口径与新条冲突 + 5 处枚举未同步 + 平台映射无断言）→ 收口 → R2 **Reject**（规模读数 / 注释口径 / `dependencyType` 分支零覆盖 / 冗余守卫 / 文档谓词名）→ 收口 → R3 **Reject**（AC④ 用例数 12→14）→ 收口 → R4 **Pass**（允许提交）。
  - **残余**：① 区间缺失（数据源未提供）时保守视为受影响，混合实例不会被误判为收敛；② `dependencyPath` 存在时不做「无工作」前置跳过（路径级补丁会独立写盘）；③ `assessLockfileWork` 与链路各自读取 lockfile / manifest（未记忆化），告警多的仓库会放大读盘次数（性能项，非正确性）；④ `repo-fix.ts` 非空行 795/800——再改该文件需先拆分（`applyGroupUpgrades` 的收敛/归因判定可继续下沉 `cross-major.ts`）。

### M62.4 自仓基线红与验证链只读化（P1 🛠️）—— ✅ 已闭环

- **目标**：验证链不再以写模式跑 lint（避免基线采样修改工作区），并让自仓基线红有可判读结论而非长期 `pre-existing` 豁免。
- **优先级**：P1（自仓连续 3 轮 lint + test 预失败；写模式 lint 会污染 pristine 前提）。
- **范围**：`packages/engine/src/app/verify-project.ts` 的默认链在目标仓库存在 `lint:check` 时改用只读命令，否则回退 `lint`；自仓 baseline 复现取证（stderr / 内存 / 并发）；自仓交付验证不再依赖 `pre-existing` 豁免；文档记录只读链口径。
- **验收标准**：① 基线采样前后 `git status --porcelain` 为空（写模式不再触发）；② 自仓 baseline 全绿，或给出可复现的环境性证据并登记已知边界；③ 自仓有可修告警时交付验证不落 `pre-existing`；④ 无 `lint:check` 的仓库回退行为有单测；⑤ `gates:docs` 通过。
- **不做什么**：不为自仓硬编码跳过验证；不改 test 链；不改构建命令。
- **依赖**：`resolveVerifyCommands` 默认链；根 `lint:check` 与平台 `lint:check` 脚本。
- **交付物**：2-3 commits / 5-7 files / 250-400 行。
- **风险与缓解**：目标仓库无 `lint:check` → 保留回退并测两态；只读链漏掉自动修复能力 → 仅基线采样用只读，修复后验证仍按原链；开工首步复跑自仓 baseline，若已转绿则本原子收窄为只读链并记录复验证据。
- **执行记录（2026-11-17，2 commits：`12586099` engine 只读链 / 文档与本台账）**：
  - **实现**：`resolveVerifyCommands` 新增 `readOnlyLint`（仅 `sampleVerificationBaseline` 传 true）：目标仓库存在 `lint:check` 脚本时把默认链的 `pnpm lint` 换成 `pnpm lint:check`；无该脚本回退 `pnpm lint`；自定义链不替换。修复后验证仍走原链（保留自动修复能力）。
  - **AC①（基线采样前后工作区不变）**：夹具级真实执行——`lint` 写文件、`lint:check` 不写，基线采样后断言命令为 `pnpm lint:check` 且文件未生成（默认链口径；`--mirror-ci-scripts` 镜像脚本不受此承诺约束）；回退探针（禁用只读替换）→ 变红。
  - **AC②（自仓 baseline 全绿）**：开工首步复跑自仓 baseline——`pnpm install --frozen-lockfile`（Already up to date）/ `lint:check`（0 error / 2 存量 warning）/ `pnpm -r build` / `typecheck`（7 项目）/ 根 `pnpm test`（425 文件 / 6267 passed / 11 skipped）全绿；本原子按预案收窄为「只读链」部分，不登记新的已知边界。
  - **AC③（自仓交付验证不依赖 pre-existing 豁免）**：自仓链路已全绿（install / lint:check / build / typecheck / test），无需以既有失败豁免解释交付；只读链同时消除「写模式改动工作区 → 归因漂移」的伪既有失败来源。另补**命令名等价**用例：基线 `pnpm lint:check` 红 → 修复后 `pnpm lint` 红按既有失败豁免、quick-verify 不重跑（否则既有失败会被误归因并回滚合法修复）。
  - **AC④（无 lint:check 回退单测）**：mock 用例断言无该脚本时命令为 `pnpm lint`、有脚本时为 `pnpm lint:check`，并覆盖「自定义链不替换」。
  - **AC⑤**：`pnpm run gates:docs` 21 项通过；`typecheck` / `lint:check` / 根 `pnpm test` 均通过。
  - **规模**：5 文件（3 改 + 2 新增含测试）/ 约 200 行，预估 5-7 文件 / 250-400 行（收窄后规模同步下降）。
  - **审计**：standard 单分区 R1 **Reject**（基线只读链命令名与修复后写模式命令失配 → 既有失败豁免与 quick-verify 跳过同时失效；「修复后仍走写模式」无用例）→ 收口（`expandLintCommandAliases` 别名 + 两处消费点 + 3 例用例 + 文档口径）→ R2 **Pass**（允许提交）。
  - **残余**：① 只读链依赖目标仓库声明 `lint:check`（未声明则仍为写模式，保持既有行为）；② 目标仓库的 `lint:check` 若自身写盘（脚本语义不实）无法机检，与既有「脚本语义不实」边界同类。

### M62.5 安装基线失败后的告警结论与有界重试（P2 🛠️📚）—— 🛠️ 实现完成，待审计 / 提交

- **目标**：坏 lockfile 仓库的每条告警都有明确 skipped 原因；修复成功且安装复检通过后，按预算允许一次升级链重试。
- **优先级**：P2（`no skipped outcome recorded` 会让告警级结论整批丢失）。
- **范围**：`packages/engine/src/app/repo-fix-finalize.ts` 与 `repo-fix.ts`：安装基线失败时逐告警写 `skipped('install-baseline-failed')`；`finalizeRepoFix` 的 lockfile 修复成功后按预算重试一次升级链，记审计条目；报告 / 平台详情展示该原因。
- **验收标准**：① 坏 lockfile 仓库报告无 `no skipped outcome recorded`，每条告警有原因；② 重试有预算上限与审计条目，且只重试一次；③ 非坏 lockfile 仓库零回归；④ 单测覆盖「不重试直接落结论」「修复成功后重试」「预算不足不重试」；⑤ `gates:docs` 通过。
- **不做什么**：不改 lockfile 修复策略（REGENERATE / FIX_ENTRIES / REINSTALL）；不无限重试。
- **依赖**：`recordInstallBaselineFailure` / `findInstallBaselineFailure`；`finalizeRepoFix` 顺序。
- **交付物**：3-4 commits / 6-8 files / 350-500 行。
- **风险与缓解**：重试放大预算 → 单次 + 预算门；告警级原因与汇总不一致 → 以告警级为单一事实源并加汇总断言。
- **执行记录（2026-11-17，按 3 个 commit 拆分（待提交）：core 原因 / engine 结论与重试 / platform 与文档台账）**：
  - **实现**：`SKIP_REASONS` 新增 `install-baseline-failed`；安装基线失败时 `processRepoFix` 记录被整链跳过的告警（`progress.installSkippedAlerts`）并把升级链抽为可复用闭包；`finalizeRepoFix` 两条出口——repair 真正改写文件且预算允许 → 重试升级链一次 + `INSTALL_BASELINE_RETRY` 审计条目（跳过类白名单），否则逐告警 `skipped('install-baseline-failed')` + `alertsSkippedByReason` 计数；平台原因表 / i18n 双语同步。
  - **AC①（坏 lockfile 报告无「无跳过结论」）**：repair 未生效用例断言 `alertsSkippedByReason['install-baseline-failed'] = 1` 且告警级 outcome 为 `skipped`；端到端用例（`versioned-overrides-batch`）断言 4 条告警全部落该原因、不落兜底行。**边界**：重试路径不补记该原因（重试链提前中断时可能回落兜底行），AC① 限定为非重试路径。
  - **AC②（重试一次 + 审计 + 预算上限）**：repair 成功用例断言重试闭包调用 1 次、`INSTALL_BASELINE_RETRY` 审计条目存在、不再落整链跳过结论；预算不足 / 安装复检未通过两例断言不重试且仍逐告警落结论（复检用基线失败命令原样再跑一次，repair 成功不等于环境可安装）。
  - **AC③（非坏 lockfile 零回归）**：engine 全量（含既有收尾守卫用例）通过；`retryUpgradeChain` 仅在 `installBaselineFailure` 存在时传入；`INSTALL_BASELINE_RETRY` 进跳过类白名单并有 exit-code 用例锁定。
  - **AC④（单测三态 + 复检）**：`repo-fix-finalize.test.ts` 新增 4 例（不重试直接落结论 / 修复成功后重试 / 预算不足不重试 / 安装复检未通过不重试）。
  - **AC⑤**：`gates:docs` 21 项；`typecheck` / `lint:check` / 定向与全量测试通过。
  - **规模**：18 文件 / +328 −28（合计 356 行；含 3 份设计文档、2 份 i18n、本台账；`git status --porcelain | wc -l` = 18），预估 6-8 文件 / 350-500 行。
  - **审计**：standard 单分区，结论见本批收口提交。
  - **残余**：① 重试闭包会重跑整条升级链（含 lockfile 策略外的成员 / 分组），预算已由 `budgetAllows` 兜住；② `install-baseline-failed` 结论只覆盖依赖链告警，code-scanning / code-quality 走独立链；③ 重试路径不补记原因（链提前中断时回落兜底行）；④ `repo-fix.ts` 非空行 799/800——下一原子改动前必须先拆分（`applyGroupUpgrades` 收敛/归因可继续下沉）。

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
>
> **状态**：✅ 已闭环（2026-11-17，commits `ad3033a7` / `ceb9279b` / `20ef2288`，已推送）。证据：① 全命令退出 0 不写锁文件 → `repairLockfile` 返回失败且原文件逐字节恢复、无 `.bak` 残留（`index-artifact.test.ts` 用例 2 条，含 frozen「通过」但产物不可用）；② 重复 key YAML 判失败（`inspectLockfileArtifact` 单测）；③ 白名单文件删除 → `UNEXPECTED_CHANGES` 且 `stageScopedChanges` 拒绝（`commit-scope.test.ts`）；④ 定向 `pnpm --filter @dependfix/engine exec vitest run src/fixers/pnpm src/github/commit-scope.test.ts` = 6 文件 / 96 passed；⑤ `gates:docs` 21 项通过。残余：无（生产事故链路已在设计记录 §3.3 留档）。

- **目标**：锁文件修复的成功判据落到**产物**（存在 + 可解析），任何路径都不再产出「删除锁文件」的净变更；交付侧白名单拒绝白名单文件的删除。
- **范围**：`packages/engine/src/fixers/pnpm/index.ts` 与 `lockfile-artifact.ts`（`inspectLockfileArtifact` + 策略 / 验证双重校验）；`packages/engine/src/github/commit-scope.ts`（白名单删除 → `UNEXPECTED_CHANGES`）；设计记录 §3.3。
- **验收标准**：① 模拟「pnpm 全部退出 0 但不写锁文件」时 repair 返回失败且原文件逐字节恢复、无 `.bak` / `.broken` 残留；② 产物为重复 key 的 YAML 时同样失败；③ 白名单文件删除被拒提交；④ 定向用例通过；⑤ `gates:docs` 通过。
- **风险与依赖**：`yaml` 严格解析可能拒绝历史上被 pnpm 容忍的锁文件 → 仅用于「修复成功」判据，不影响「已合规」早退路径；依赖 M62.5 的安装失败结论口径。

## 上一阶段
M61（文档与 AI 治理）已于 2026-11-16 归档：见[执行记录](archive/todo-archive-phases-m61.md) / [路线图](archive/roadmap-phases-m61.md)；更早阶段见 [todo-archive.md](todo-archive.md)。

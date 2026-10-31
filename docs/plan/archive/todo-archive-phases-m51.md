# 待办归档分片：M51 语义与数据收口（1.0-F1 批次）

> 本分片由 2026-10-30 M51 阶段归档批次从 [todo.md](../todo.md) 迁出；正文按归档口径压缩（目标 / 落地 / 审计 / 证据 / 边界），相对链接按新位置重指。

---

## M51: 语义与数据收口（1.0-F1 批次，2026-10-30 规划 / 同日归档）

> **归档摘要**：6 原子（P0 2 + P1 2 + P2 2）+ 阶段期间 **1 批插队**（CI E2E 断言同步，属 [规划规范 §3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 例外清单第 3 类「CI 主链路阻塞」，1 commit，未占条目编号）+ 1 次候选登记（用户实测派生 2 项）。阶段窗口首父链 **35 commits**（规划 1 + M51.1 3 + M51.2 2 + M51.3 4 + M51.4 9 + M51.5 11 + M51.6 3 + 候选登记 1 + 插队 1；`git log --first-parent --oneline 47b88fbd^..80ba15ab` 实测），阶段基线 **49-62 文件 / 1800-2600 行 / 14-16 commits**，唯一 diff 实测 **136 文件 / +6598 −503**（`git diff --shortstat 47b88fbd^..80ba15ab`）——按基线上界计 文件 2.2 倍 / 行 2.5 倍 / commits 2.2 倍（按下界 2.8 / 3.7 / 2.5 倍；`136/62`、`6598/2600`、`35/16`），主因是每原子含「实现 + 审计收口 + 边界用例 + 文档」多段提交，且横跨 core / engine / platform 三模块。
>
> **证据来源**：各条目数字取自 `.session/runtime-state.json` §`m51_1`~§`m51_6`；CI 事实以 run `41057170959`（失败）与 `41059563612`（修复后 success）为准。

> **阶段目标**：补齐「扫描结果 → 告警明细 → 通知 / 交付」链路上的语义断点——修复结果按告警回写、PR Check 结论两侧一致且取最新一轮、平台建 PR 后具备失败回环、基线红不再静默、长命令纳入取消面与剩余预算、配置写入与列表排序可判定。来源 = 1.0 台账批次 F1 九项（[release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md) §3.1）。

> **用户决策（2026-10-30）**：① `completed + conclusion=null` 统一方向 = **fail-closed**（与 CLI 一致，见 M51.2）；② 交付降级默认保持 `skip`，issue / draft 需显式开启（见 M51.4）；③ PR 回环范围限「评论 + 按配置关闭 + 有界重试」，**retry 本批延后**（见 M51.3）。

> **容量评估（§1.1）**：台账九项按语义聚类为 **6 原子**（③ | ②+⑨ | ① | ④ | ⑤+⑥ | ⑦+⑧），在 5-6 项上限内；批次语义（交付正确性 + 数据口径）优先于类型补足，与 M50 同口径。M51.3 / M51.5 预估超单提交粒度，按 a / b 子任务拆分独立提交。

> **原子间依赖**：M51.3 ← M51.2（回环建立在统一结论之上）；M51.4 ← M51.1（估算依赖，实际未使用——issue 正文用「仓库集 + 失败命令集」）；M51.5 / M51.6 独立。交付顺序 1 → 2 → 3 → 4 → 5 → 6。

### M51.1 [P0 🛠️] ScanResult 修复结果回写（success / converged / failed / skipped）（**已闭环** `1d5e187c` + `564755a2` + `f930c93c`）

- **目标**：一次运行结束后 `ScanResult.fixStatus` 反映该告警真实结果，通知明细可剔除本地已满足告警。
- **落地**：`packages/core` 新增 `report/alert-outcomes.ts`（`AlertFixOutcome` 契约 + `alertOutcomeKey`（含 `repository` 维度）+ `buildAlertOutcomes` 推导 + 状态白名单），`RunResult.alertOutcomes?` 只列有结论的告警；`packages/engine` 新增 `app/alert-outcomes.ts`（收敛 / 跳过记录）并接入四个判定点；`apps/platform` 的 `reconcileAlerts` 支持 `outcomes` / `dryRun`，活跃行按结论改写（含 `success → failed`，supersede 路径保留修复记录），编排层抽出 `reconcileRunResult`。文档：新增 [alert-outcome-writeback.md](../../design/governance/alert-outcome-writeback.md) + [data-model.md](../../design/modules/data-model.md) 契约段 + 通知口径（[platform-notification.md](../../design/governance/platform-notification.md#_7-1-高危与未修复口径) §7.1 / [§7.3](../../design/governance/platform-notification.md#_7-3-24-小时窗口与上限)）。
- **审计**：R1 deep 两分区均 **Reject**（A 2B：键缺 `repository` 跨仓串号 / 包级 success 覆盖显式跳过；B 1B：`success` 粘性使活跃高危永久静默）→ R2 A **Reject**（`isAlreadyCompliant` 把带 error 的 skip noOp 当已合规）+ B Pass → R3 A quick **Pass**（B 的 2 warning 同批落实）。
- **证据**：根全量 345 文件 / 5361 passed；`alert-outcomes` 16 例、`scan-reconcile` 14 例、`index-isolation` 16 / `major-upgrade` 13 / `repeated-failure` 14；typecheck 7 包；lint 0 error（3 存量 warning）；mutation 12/12 击杀。
- **边界**：`skipped` 明细是告警级、`alertsSkipped` 是 action 级；`success` / `converged` 退出未修复明细属行为变更（发布说明须披露）；`report-only` run 无逐条结论；存量行不回填；`alertsUnfixed` 既有算术未调整（同包多清单可能低估）。

### M51.2 [P1 🛠️] PR Check 结论口径统一 + 同 ref 多轮收敛（台账 ②+⑨）（**已闭环** `2a9a588b` + `2dfdb0e3`）

- **目标**：`completed + conclusion=null` 平台与 CLI 同一结论；同一 ref 同名 check 只取最新一轮，re-run 不再误报。
- **落地**：新增 `packages/core/src/report/check-signals.ts`（`resolveCheckProvider` / `checkRoundKey` / `extractActionsRunId` / `dedupeByLatestRound`）作两侧单一事实源；平台 `completed + null` 由 `skipped` 改 `failure`；`UnifiedBuildSignal.roundAt` + 组键血缘（check 用 workflow run id，status 用 context，deployment 用 environment）；采集显式 `filter: 'all'`，平台在 `capSignals` 前收敛、CLI 在 `evaluateCheckTerminal` 入口收敛；`signalsJson` 存收敛后信号。文档：[pr-build-deploy-signals.md](../../design/governance/pr-build-deploy-signals.md) §3.10。
- **审计**：R1 deep 两分区均 **Reject**（A：CLI 组键仅 name 跨源同名 / signalsJson 承诺与实现相反；B：同名不同 workflow run 被误合并 / 新轮 `roundAt` 为空被当最旧）→ R2 quick 两分区 **Pass**（3W + 4S 一行级收口）。
- **证据**：根全量 346 文件 / 5391 passed；`check-signals` 10 例、`build-signals` 54、`polling-source` 19（nock 锁定 `filter=all`）、`action-status-monitor` 18、`pr-check-watch` 43；mutation 10/10。
- **边界**：被新 workflow run 取代的旧失败不自动消失（同 SHA 双 event 并存 → 恒 failure）；`filter:'all'` 分页成本随 run 数上升；去重 × 截断顺序仅由代码顺序保证（无守卫用例）；非 Actions check 不收敛；生产 PR 样本回放未执行（nock 夹具 + 两侧同口径替代）；归因面仍不统一。

### M51.3 [P0 🛠️] 平台 PR Check 创建后回环（台账 ①，拆 a/b；retry 按用户裁定延后）（**已闭环** `08f0f4fc` + `2d0c9930` + `d10748fe` + `e7821ff5`）

- **目标**：平台创建的修复 PR 在 checks 失败时自动评论说明，并按配置关闭，消除「PR 红了无人收」。
- **落地**：设计稿 [pr-feedback-loop.md](../../design/governance/pr-feedback-loop.md)；观察态唯一事实源 = `ScanRun.prNumber`（新列 + 幂等迁移 `2900000000001`，存量 NULL 不回填）+ `PRCheck`；`services/pr-feedback/`（观察窗口判定 / 幂等评论 marker / 关闭前 `pulls.get` 准入 / `Repository.prFeedback` 配置：评论默认开、关闭与 retry 默认关、窗口 24h）+ 审计事件 `pr_feedback_*`，接在 `scheduler.runPrCheckPoll` 每轮之后（失败只 warn 不改轮询结果）。
- **审计**：R1 standard **Reject**（1B：关闭无 PR 状态准入 + 审计无幂等 → 每节拍重复关闭并重复写审计；7W）→ R2 quick **Pass**（0B；RG-B1 与 7W 全 closed，清理提交收口 4W/4S）。
- **证据**：根全量 346 文件 / 5427 passed；`pr-feedback` 22 例 + 迁移 7 例；typecheck 7 包；lint 0 error；i18n 双 locale JSON 合法。
- **边界**：多副本 TOCTOU（并发评论可能重复一次）；marker 可被评论者伪造以抑制评论（不能触发关闭）；配置仅库内写入（无 API/UI）；人工 reopen 会被再次关闭（有意）；PRCheck 查询每 PR 一次（N+1）；真实 GitHub `pulls.get` / PATCH 权限面未线上实测；**retry 未实施**（设计稿 §8 契约保留为后续候选）。

### M51.4 [P1 🎨] 基线红 / 安装失败的交付降级（台账 ④）（**已闭环** `13137749` + `aa900622` + `2cfa1c11` + `67a75964` + `1a85f418` + `880445a4` + `7407bad0` + `07914359` + `a8905482`）

- **目标**：交付被跳过时给出可跟踪载体（`skip` / `issue` / `draft` 三档），默认行为不变。
- **落地**：`DEPENDFIX_ON_BASELINE_RED=skip|issue|draft`（默认 `skip`）+ Action input `on-baseline-red`；issue 载体按「仓库集 + 失败命令集」sha256 指纹去重（扫 `state:'all'` 最近 100 条，含已关闭，关闭后不重开，落点取 `installBlockedRepos[0]`）；draft 档不回滚、`pulls.create draft:true` + 草稿警告区且不等待 check；summary 三计数由 `ctx.deliverySkips` 幂等派生，平台列表 / 详情展示「交付跳过」（e2e case 9）；三档 exit code 中性。文档：[pr-delivery-closure.md](../../design/governance/pr-delivery-closure.md) §16。
- **审计**：R1 两分区 **Reject**（A：diff 规模无拆分计划 + 7W；B：可见 UI 缺 V3 证据 + 8W）→ R2 quick 两分区 **Pass**（A RG-A1~A13 全 closed；B RG-B1~B12 全 closed）。
- **证据**：根全量 5468 项 / 5458 passed / 10 skipped；`delivery-skip` 4 + `baseline-red-delivery` 6 + `delivery-issue` 8 + `result-assembly` 13；platform `run-view` 27；e2e scans case 9 实跑；typecheck 7 包；lint 0 error。
- **边界**：平台执行链只记录不创建载体（已登记 backlog 候选）；issue 去重仅扫最近 100 条（fail-open，最多多开一条）；marker 可被有 issue 写权限者伪造（不能触发关闭）；失败命令串原样进正文（若含内联凭据会外泄，与 PR 正文既有口径一致）；载体计数无 e2e（同源纯函数单测覆盖）。

### M51.5 [P1 🛠️] 运行级取消面收口 + 单仓剩余预算（台账 ⑤+⑥，拆 a/b）（**已闭环** `860e275c` + `62d232fe` + `4651f227` + `53916762` + `9dff9fc5` + `11c1427a` + `ec1a9d26` + `8defd84f` + `f6d89117` + `2bf1cec6` + `fcdcc686`）

- **目标**：长命令与回滚不再阻塞超时定时器（实测 `6861fa22d4801ddf`：名义截止 14:15:29 → 实际 abort 14:21:01，延迟约 5.5 分钟）；引擎感知剩余预算，预算不足时停止启动新工作并留痕。
- **落地**：新增 `github/git-run.ts`——交付类 git 调用（checkout / commit / push / reset / read-tree / stash）改 `runTrackedCommand` 受管异步（进程登记 + 进程树终止 + abort 前置守卫），**显式 `shell: false`**（Windows 由 libuv 引号化 argv）；回滚与 checkpoint 异步化 + 取消期语义（未启动静默交调用方清理，已启动按真实失败留痕）；`RuntimeConfig.deadlineAt`（平台 `now + timeoutMs` 注入）+ `AppContext` 预算检查点（基线采样 / lockfile repair / 合批 / 逐包逐组 / 终验），剩余 < 1 分钟跳过并写 `BUDGET_EXHAUSTED`（跳过类，不影响 exit code），**终验被跳过 = 未验证**（`verificationPassed` 留 undefined + `verificationSkipped='budget'`，不交付不回滚）；输出捕获改 `StringDecoder` + 截断标记。文档：[executor-process-isolation.md](../../design/governance/executor-process-isolation.md) §8.5 / §8.6 + [run-failure-taxonomy.md](../../design/governance/run-failure-taxonomy.md)。
- **审计**：R1 两分区 **Reject**（A：Windows 交付链被 shell 拼接 + 预算跳过终验记「验证通过」；B：同一验证假绿 + 文档口径）→ R2 quick 两分区 **Pass**（A 0B，A2 功能闭环；B 0B）。
- **证据**：根全量 5495 项 / 5485 passed / 10 skipped；`git-run` 10 例（含 argv 空格/括号往返、执行中取消 10s 内落定 + `trackedChildProcessCount()===0`、已启动后被取消的错误文案）、`budget` 7 例、`verification-gate` 17、`process-control` 18（含 UTF-8 跨 chunk）、`delivery-skip` 5；typecheck 7 包；lint 0 error；build 全绿；`gates:docs` 16 项。
- **边界**：短状态查询（`rev-parse` / `diff --quiet` / `remote get-url`，非穷举）仍同步；单条交付 git 命令上限固定 5 分钟不随预算收缩；预算跳过的报告 / 平台展示未单列（backlog 候选）；混合运行（预算跳过 + 真实失败）按真实失败整仓回滚；Windows 交付链未实机验证；交付链导出函数同步→异步属 0.x 内部 API 破坏性变更（发布说明须标注）。

### M51.6 [P2 🛠️] 配置写入闸门 + alerts 原始列表排序兜底（台账 ⑦+⑧）（**已闭环** `2d702cdd` + `962c610c` + `80ba15ab`）

- **目标**：`sandboxLimits` / `tags` 写入与读取口径单一可判；alerts 原始列表在 `createdAt` 并列时行序确定。
- **落地**：新增 `apps/platform/server/utils/repository-tags.ts`（`MAX_REPOSITORY_TAGS` / `MAX_REPOSITORY_TAG_LENGTH` / `normalizeRepositoryTags`）作单一事实源；`repositoryTagsSchema`（trim → 去重保序 → 去重后 ≤20）由 POST / PUT / e2e fixtures 共用，`parseTags` 复用同一归一（容量只在写入把关，存量超限行仍可读）；`sandboxLimits` 加 `.strict()`（未知键 400）；alerts 三种 `groupBy` 统一追加 `result.id DESC` 次键（主排序字段不变）。规范：[development.md](../../standards/development.md) §5.1.45 措辞对齐。
- **审计**：R1 两分区均 **Pass**（A standard 0B / 2W 已收口：按 2 提交拆分、补 `undefined=不修改` API 用例、注释路径与测试命名订正；B quick 0B，建议项已收口：补 `groupBy=repository` 并列用例、订正旧「同毫秒不稳定」注释、头注释归因收紧、同 pattern 与 typecheck 缺口登记 backlog）。
- **证据**：根全量 5512 项 / 5502 passed / 10 skipped；`repository.test`（含未知键 / 归一 / 容量边界 / parseTags）、`repository-tags` 5 例、`fixtures`（归一落库）、`repos/[id]` 42、`alerts` 27（三模式并列断言）；platform build 后视觉 **20/20** 通过（基线未重标）；`gates:docs` 16 项。
- **残余**：同 pattern 仍有 4 处列表查询缺并列次键（已登记 backlog）；平台 `typecheck` 未覆盖 `.nuxt/tsconfig.json` 的 node 项目（`nuxt.config.ts` 2 个既有类型错误，已登记 backlog）。

### 插队：CI E2E 断言同步（`419bb9a4`，1 commit，不占条目编号）

- **范围预估（归档时补记）**：2 文件 / 约 7 行 / 1 commit（`apps/platform/tests/e2e/env-events.e2e.test.ts` + `app/pages/env-events.vue` 注释）。
- **来源**：CI run `41057170959`（M51.5 收口头 `fcdcc686`）E2E job 单例失败——M51.3 新增 `pr_feedback_commented` / `pr_feedback_closed` 两类审计事件后，`env-events` 类型下拉由 7 项变 9 项，e2e 仍按「全部类型 + 6 类」断言。
- **落地**：断言改 9 项（全部类型 + 8 类）+ 补两类文案断言 + 页面 `typeOptions` 注释补同步检查清单（新增 / 删除审计类型须同改 `AUDIT_EVENT_TYPES` + 该 e2e）。
- **证据**：修复 run `41059563612` 全部 job success；本地全量 e2e 205 passed + 1 已知 flake（`repos-crud` sandbox 迁移）+ 1 本地库状态失败（`scan-config` 扫描偏好；单文件复跑通过，CI 该用例本轮已通过）。

### 阶段收口

- **插队与再平衡**：1 批插队（1 commit，CI 主链路阻塞），未达 §3.1.1 任一阈值（批次 1 < 3；工作量远低于 50%；剩余窗口充足），**未触发移出**。
- **质量门（终态）**：根全量 5512 项 / 5502 passed / 10 skipped；`typecheck` 7 包；`lint` 0 error（3 存量 warning）；`pnpm -r build` 全绿；platform 全量 2373 passed / 9 skipped；视觉 20 例；e2e 由 CI run `41059563612` 验证（本地全量 205 passed + `repos-crud` 已知 flake + `scan-config` 本地库状态失败，后者单文件复跑通过）；`gates:docs` 16 项。
- **Review Gate**：6 原子全部经 Review Gate（M51.1 3 轮、M51.2〜M51.5 各 2 轮、M51.6 1 轮）；首个通过前分区 Reject 共 **10 次**（M51.1 3 / M51.2 2 / M51.3 1 / M51.4 2 / M51.5 2），收口后全部 Pass；M51.6 首轮两分区即 Pass；无跳过审计的原子。
- **残余（已登记 backlog 或设计稿边界）**：① 平台执行链不创建交付载体；② 预算跳过的交付可观测性；③ 列表查询并列次键同 pattern 4 处；④ 平台 typecheck 未覆盖 nuxt node 项目；⑤ M51.2 / M51.3 / M51.4 / M51.5 各条目「边界」段所列运行期观察项（多为设计稿已登记、暂无上收时机）。
- **1.0 台账联动**：F1 九项全部闭环，§3.1 F1 标注闭环、§5 批次表 F1 改为已归档（本批完成）；G1 ④「周回归最近 3 次」仍待累计，G4 窗口需推送后继续观察；下一阶段 F2（M52 文档与验证）待规划。

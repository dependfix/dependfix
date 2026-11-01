# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M54 1.0.0 发布窗口决策与发布执行** — 6 原子，2026-11-01 规划；先 0.6.1 再 1.0.0（目标窗口 2026-11-15），有条件发布 |
| 下一阶段（未规划） | **1.0.x 发布后观察（补丁号待定）**（发布后 issue / 指标观察；台账见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M53 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M53 已归档；M54 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M54: 1.0.0 发布窗口决策与发布执行（2026-11-01 规划）

> **阶段目标**：把 2026-11-01 的发布窗口决策落成可执行批次——先发 `0.6.1` 验证 M53 修复后的发布链，再在 **2026-11-15** 目标窗口发布 `1.0.0`；采用**有条件发布**（G3 实跑 / G4 窗口按已披露豁免降级，G5 关键模块 mutation / G6 发版文档 / G7 回滚演练等可执行项补齐），G8 产品指标用真实读数并在发布说明引用。
> **来源**：[release-1.0-readiness.md](../design/governance/release-1.0-readiness.md) §2 G1-G8 读数（2026-11-01 实测）+ 2026-11-01 用户发布窗口决策。
> **用户决策（2026-11-01）**：① 目标 = **先 0.6.1 再 1.0.0**；② 门禁 = **有条件发布**（G3 实跑 / G4 窗口豁免并披露，其余可执行项补齐）；③ **接受 Google OAuth 未测**并在发布说明「已知限制」披露；④ 1.0.0 目标窗口 **2026-11-15**。
> **发布窗口读数（2026-11-01 实测）**：G1 ◐（prod 审计 1 low + 1 ignored moderate；Dependabot 2 条 medium/low；code scanning 0；周回归 3 次待累计）；G2 ✅；G3 ❌（0/10 实跑，G3.8 `partial`）；G4 ◐（0.6.0 后 15 次 push 中 4 次 Test 红，20 连绿 / 2 周未达成）；G5 ◐（覆盖率四维达标；mutation 11/11，关键模块全覆盖未达成）；G6 ◐（指南平价完成；无 `@v1`，设计文档全量英译不在 1.0）；G7 ◐（运维实测完成；发布级回滚未演练，远端多架构 / health 未复核）；G8 **可回填**（30 天窗口 30 个 PR：CI 绿率 24/30 = 80%、人工介入 0%、误关 0%）。
> **G4 降级判据**：1.0.0 发布前最近 **10 次 master push 的 Test 0 失败**（允许非 Test workflow 因并发取消）；未达成则按豁免记录实际读数，**不得**声称 20 连绿或 2 周无红；`flake 率 < 2%` 与「30 天无 P0」保留为观察项，不作为 1.0 阻断。
> **G3 豁免边界**：G3.0–G3.9 实跑未完成、G3.8 仅 `partial`，1.0.0 **不宣称 G3 通过**；发布说明披露「真实环境矩阵待资源补测」，Google OAuth 未测同列已知限制；获得资源后按 [真实环境矩阵](../guide/real-env-matrix.md) 补测。
> **阶段启动交叉核验（§3.4，2026-11-01 实测）**：① 归档扫描 `发布窗口决策|M54` → 无历史闭环（仅 backlog / todo 指针）；② `git log --all --grep="发布窗口"` → 0 命中；③ 代码 / 文档 anchor：`release.md` 已有 0.6.1 清单但无 1.0.0 清单、无 `@v1` tag、`v0.6.0` 为最新 tag、无发布级回滚演练记录；④ G8 脚本真实读数已可取（30 PR 窗口）；⑤ backlog 中「发布级回滚演练」候选在列，本阶段上收。
> **容量评估（§1.1）**：6 原子，类型分布 📚 1 + 🚀 2 + 🧪 2 + 🛠️ 1；预估 **33-52 文件 / 1900-3400 行 / 15-19 commits**（含 mutation 补测与发布文档；发布动作不计行数）。
> **§3.1.1 插队再平衡**：阶段启动插队 **0 批**，不触发阈值。
> **原子间依赖与交付顺序**：M54.1（决策台账）→ M54.2（0.6.1 发布）→ M54.3 / M54.4 / M54.5 可并行 → M54.6（1.0.0 发布，依赖全部）。

### M54.1 [P0 📚] 发布窗口决策台账与发版文档骨架

- **目标**：把四项用户决策、G3 / G4 豁免边界、G8 引用要求写进 1.0 台账与发布文档，形成 1.0.0 发布说明骨架（含已知限制）。
- **优先级**：P0（后续发布的判定依据）。
- **范围**：本批规划已落 `release-1.0-readiness.md §2.2` 与 G3 / G4 / G8 行、`docs/plan/*` / `docs/index.md` 同步（回填规划 commit）；M54.1 执行只补 `docs/guide/release.md` 的 1.0.0 发布清单（版本 / 门禁 / 回滚 / 校验和）、发布说明骨架与已知限制段，并修正已失效指引（alert 30 已 fixed / code scanning 0 / G8 已产出）。
- **验收标准**：① 四项决策在 §2.2 可检索且含规划 commit 回填；② G3 / G4 标「1.0 发布豁免」而非 `passed`，含 retry_condition；③ G8 真实读数（24/30 · 0% · 0%）已写入并要求发布说明引用；④ `release.md` 1.0.0 清单 + 发布说明骨架含「已知限制」（G3 实跑 / Google / G6 英译），并清除已失效的红 / 待窗口指引；⑤ `gates:docs` 通过。
- **不做什么**：不发布、不改版本号、不创建 tag、不把豁免写成通过。
- **依赖**：无。
- **交付物**：预估 3 commits / 6-9 文件 / 400-700 行。
- **风险与缓解**：豁免被后续读者误读为已验收 → 统一使用「1.0 发布豁免（不构成 G3/G4 通过）」标签并附 retry_condition。

### M54.2 [P0 🚀] 0.6.1 补丁发布与发布后验证

- **目标**：发布 `0.6.1`，验证 M53 修复后的发布链（Docker 四小时预算 / tag 派发判据 / `--version` 元数据），为 1.0.0 排除发布链风险。
- **优先级**：P0（1.0 的前置演练）。
- **范围**：锚版本 0.6.1，逐包按 `release:plan` bump（core / cli / engine / mcp / skills 与 platform 镜像各自版本）、CHANGELOG、tag / GitHub Release、npm 发布、Docker 镜像、发布说明版本引用；`release:preflight` + `check:release-security` 门禁。
- **验收标准**：① 版本号与 CHANGELOG 同步，`verify:changelog` 通过；② `release:preflight` PASS（三路安装 `--version = 0.6.1`）；③ `check:release-security` 通过；④ npm 5 包 + tag + GitHub Release + platform 镜像 tag / health 实测；⑤ 发布后按包 audit / code scanning 无非豁免 critical / high；⑥ `npx dependfix@0.6.1 --version` = 0.6.1（关闭 `--version` 候选）；⑦ 用户可见文档版本引用按 G6 口径统一回填（1.0 前不逐版散改）。
- **不做什么**：不发 1.0.0、不启用 `schedule` / `push` 自动发布、不改 1.0 契约。
- **依赖**：M54.1。
- **交付物**：预估 3-4 commits / 8-12 文件 / 200-400 行（发布动作不计行数）。**拆分依据**：版本号 + CHANGELOG（1 commit）/ 发布执行与证据（1-2）/ 发布后文档复核（1），拆分后单提交 ≤ 10 文件。
- **风险与缓解**：发布链仍失败 → 记录失败点并在 1.0 前修复；镜像预算超时 → 按 backlog 拆 per-arch job，不在 1.0 窗口硬扛。

### M54.3 [P1 🧪] G5 关键模块 mutation 补全

- **目标**：把「关键模块全覆盖」从 1/3 推进到 3/3——在验证结果判定链、升级选择链、基线红 / 退出码链各补 ≥3 个 mutation，全部击杀并留工件。
- **优先级**：P1（有条件发布的补强项）。
- **范围**：`packages/engine/src/app` 的 `verify-project` / `result-assembly` / `upgrade-alert` / `repo-fix-major` / `baseline-red-delivery` / `exit-code` 等判定链；mutation 工件入 `artifacts/review-gate/`（gitignored）；`release-1.0-readiness.md` G5 行回填。
- **验收标准**：① 关键模块清单成文（3 条链，含选择理由）；② 每条链 ≥3 变异、合计 ≥9，全部击杀；③ 工件含文件 / 变异前 md5 / 失败用例 / 复现命令，还原后 md5 一致；④ 全量测试与覆盖率不低于现基线；⑤ G5 行更新且不写成「100% mutation」。
- **不做什么**：不追求全仓 mutation 100%；不做无关重构；不为提升指标改断言。
- **依赖**：无（可与 M54.2 并行）。
- **交付物**：预估 3-4 commits / 6-10 文件 / 600-1000 行（测试为主）。
- **风险与缓解**：mutation 手工成本高 → 限定 3 条关键链、每链 3 个高价值变异；存活变异若属不可达分支 → 登记已知边界，不强行构造。

### M54.4 [P1 🧪] G4 / G8 发布窗口读数与已知 flaky 复测

- **目标**：冻结 1.0 发布前的 G4 证据（按降级判据）与 G8 真实指标，并把 G8 写进发布说明；对已知 flaky（scan-config / repos-crud）做有界复测。
- **优先级**：P1（有条件发布的证据面）。
- **范围**：`gh run list` 最近 master push 统计 + run id 清单；G8 `pr-health` JSON / Markdown 落 `artifacts/metrics/`（gitignored）并引用进发布说明；已知 flaky 单文件 10 次复跑；G4 / G8 台账回填。
- **验收标准**：① G4 按「最近 10 次 push Test 0 失败」给出读数与 run id，未达成则记录豁免；② flaky 两文件各 10 次结果（通过 / 失败分布）留痕；③ G8 读数（24/30 · 0% · 0%）与报告路径可复核；④ 发布说明含指标出处；⑤ 本批不引入新红。
- **不做什么**：不把 flaky 单次通过写成「已修复」；不改 G8 口径；不采信无 token 的 0 值。
- **依赖**：M54.1（豁免模板）；G8 脚本。
- **交付物**：预估 2 commits / 3-5 文件 / 200-400 行。
- **风险与缓解**：flaky 复发 → 记录失败谱与触发条件；窗口仍红 → 按 G4 豁免披露，不伪造 10 连绿。

### M54.5 [P1 🛠️] G7 发布级回滚演练与远端镜像复核

- **目标**：把「发布级回滚」从 backlog 候选变成演练记录（镜像 tag 回退 / npm `deprecate` / GitHub Release 撤回 / `@v1` 回退），并复核远端多架构镜像 / health。
- **优先级**：P1。
- **范围**：用 0.6.0 / 0.6.1 已有产物做 dry-run（不真删生产 Release、不破坏现有 tag）；`release.md` 回滚章节；Docker manifest / health 复核证据；`release-1.0-readiness.md` G7 行回填。
- **验收标准**：① 回滚演练四类动作各有命令、预期与实测结果（dry-run 或测试 tag）；② 远端镜像双架构 manifest 与 `/api/health` 版本戳复核，缺 `read:packages` 时记录 blocked + retry_condition；③ 文档写明「不执行的破坏性步骤」；④ G7 行不再把回滚列为未演练（或明确保留残余）。
- **不做什么**：不撤回 0.6.0 生产 Release；不删除远端 tag；不执行不可逆 `npm unpublish`。
- **依赖**：M54.2（0.6.1 产物）。
- **交付物**：预估 2-3 commits / 4-6 文件 / 300-500 行。
- **风险与缓解**：registry 权限不足 → 用测试 tag / 本地 manifest 模拟并登记重试条件；演练脚本加 dry-run 默认与显式确认。

### M54.6 [P0 🚀] 1.0.0 发布与 `@v1` 滚动标签

- **目标**：在 2026-11-15 目标窗口发布 `1.0.0`（npm 5 包 + platform 镜像 + GitHub Release），发布说明含 G8 指标与已知限制，创建 `@v1` 滚动标签并完成发布后验证与台账回填。
- **优先级**：P0。
- **范围**：版本号 / CHANGELOG / tag、npm 发布、Docker 镜像、GitHub Release、`@v1` tag、三路安装验证、发布后 audit / code scanning、G1-G8 终态回填、用户可见文档版本引用。
- **验收标准**：① `release:preflight` + `check:release-security` 通过；② 5 npm 包 + tag + GitHub Release + platform 镜像发布；③ 发布说明含 G8（24/30 · 0% · 0%）与 G3 / Google 已知限制；④ `@v1` 指向 1.0.0；⑤ tarball / npx / 全局安装 `--version = 1.0.0`；⑥ 发布后 audit / code scanning 无非豁免 critical / high；⑦ 台账 G1 / G2 / G5 / G6 / G7 / G8 终态回填，G3 / G4 保持豁免记录。
- **不做什么**：不启用自动发布（除非用户另行授权）；不宣称 G3 通过；不把 G6 全量英译塞进 1.0。
- **依赖**：M54.1-M54.5 全部闭环。
- **交付物**：预估 2-3 commits / 6-10 文件 / 200-400 行（发布动作不计行数）。
- **风险与缓解**：1.0 发布链失败 → 用 0.6.1 已验证链路回退并记录；窗口超期 → 以门禁完成度为准，不静默改日期；回滚 → 按 M54.5 演练步骤执行。

## 阶段收口要求

- **质量门**：逐原子 `pnpm run lint:check` + 涉样式时 `lint:css:check` + `pnpm typecheck` + 定向测试；代码改动跑 `pnpm -r build`；M54.3 跑全量测试 + 覆盖率；M54.2 / M54.6 跑 `release:preflight` + `check:release-security`。
- **Review Gate**：每原子至少一轮 `Code Auditor`（standard；发布执行 / 回滚演练升 deep），Reject 须闭环复审。
- **发布门禁**：G1 发布物审计与 code scanning 清零、G2 契约不变、G5 三条链 mutation、G6 发布说明 / 版本引用 / `@v1`、G7 回滚演练、G8 指标引用；G3 / G4 按豁免记录，**不得**写成通过。
- **不做**：不启用自动发布、不删除生产 tag / Release、不把 Google 未测写成已验收。
- **归档**：按 [规划规范 §4](../standards/planning.md) 迁出为 `archive/todo-archive-phases-m54.md` + 索引行 + roadmap 状态同步。

# 待办归档分片：M54 1.0.0 发布窗口决策与发布执行

> 本分片由 2026-11-07 M54 阶段归档批次从 [todo.md](../todo.md) 迁出；正文保留规划与收口口径，相对链接按新位置重指。
> 对应路线图详情见 [roadmap-phases-m54.md](roadmap-phases-m54.md)。

---

> **归档摘要**：6 原子全部闭环（M54.1 决策台账 / M54.2 0.7.0 发布 / M54.3 G5 mutation / M54.4 G4+G8 读数 / M54.5 G7 回滚演练 / M54.6 1.0.0 发布与 `@v1`）+ 1 批追加临时待办（preflight 工作区留痕偶发红，用户授权、不占阶段编号）。阶段窗口首父链 **52 commits**、唯一 diff **47 文件 / +2547 −951**（`git rev-list --first-parent --count 3a95f2e5^..HEAD` / `git diff --shortstat 3a95f2e5^..HEAD`，2026-11-07 实测，含依赖 bump）。
> **发布终态（2026-11-07）**：`1.0.0` 五个 npm 包（`dependfix` / `@dependfix/core` / `@dependfix/engine` / `@dependfix/skills` / `@dependfix/mcp`）、六个 `<pkg>@1.0.0` tag + `v1.0.0` + `v1` 滚动标签（annotated `097723a7` → `83c966fd`）、GitHub Release 为 Latest 且非 prerelease（正文含契约与迁移 / G8 当日复算 / 已知限制）；镜像 `platform-1.0.0` 三仓库（Docker Hub / GHCR / ACR）发布，`imagetools inspect --raw` 回读 12/12 tag 含 `linux/amd64 + linux/arm64`（ACR 个人版按 tag 客户端仍单 amd64，见 G7），`/api/health` = `1.0.0` / `5c810587…` / 15 张业务表。
> **证据来源**：发布 run `42351775424`；镜像 run `42381362295`（无版本派发 `42376062304` 验证 9/9）；[release.md §1.0.0 发布记录](../../guide/release.md#_1-0-0-发布记录-m54-6-2026-11-07-已执行)；[就绪度台账 §2](../../design/governance/release-1.0-readiness.md)；health 复核命令与输出见文末「阶段收口」。

## M54: 1.0.0 发布窗口决策与发布执行（2026-11-01 规划 / 2026-11-07 归档）

> **阶段目标**：把 2026-11-01 的发布窗口决策落成可执行批次——先发 `0.7.0`（dependfix 锚版本，按 `release:plan` 推导）验证 M53 修复后的发布链，再在 **2026-11-15** 目标窗口发布 `1.0.0`；采用**有条件发布**（G3 实跑 / G4 窗口按已披露豁免降级，G5 关键模块 mutation / G6 发版文档 / G7 回滚演练等可执行项补齐），G8 产品指标用真实读数并在发布说明引用。
> **来源**：[release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md) §2 G1-G8 读数（2026-11-01 实测）+ 2026-11-01 用户发布窗口决策。
> **用户决策（2026-11-01）**：① 目标 = **先 0.7.0 再 1.0.0**；② 门禁 = **有条件发布**（G3 实跑 / G4 窗口豁免并披露，其余可执行项补齐）；③ **接受 Google OAuth 未测**并在发布说明「已知限制」披露；④ 1.0.0 目标窗口 **2026-11-15**。**⑤（同日执行期裁定）**：中间版本**按 `release:plan` 推导口径发布**（dependfix 0.7.0 / core 0.7.0 / engine 0.6.0 / platform 0.5.0 / mcp 0.3.1 传导；skills 无改动不发布），不人工降级为 0.6.1——避免把 0.x 的 feat 与破坏性变更塞进 patch。
> **发布窗口读数（2026-11-01 规划期快照；最新读数以 [就绪度台账](../../design/governance/release-1.0-readiness.md) §2 为准——2026-11-07 更新：1.0.0 已发布，G1 / G2 / G5 / G6 / G8 转 ✅，G7 维持 ◐（双架构待 GHCR / ACR 企业版），G3 / G4 保持豁免与 retry_condition）**：**以下为 11-01 快照值**——G1 ◐（prod 审计 1 low + 1 ignored moderate；Dependabot 2 条 medium/low；code scanning 0；周回归 3 次待累计）；G2 ✅；G3 ❌（0/10 实跑，G3.8 `partial`）；G4 ◐（0.6.0 后 15 次 push 中 4 次 Test 红，20 连绿 / 2 周未达成）；G5 ◐（覆盖率四维达标；mutation 累计 24，关键模块三条链 13/13 已建守卫；flaky 复核归 M54.4）；G6 ◐（指南平价完成；无 `@v1`，设计文档全量英译不在 1.0）；G7 ◐（运维实测完成；发布级回滚未演练，远端多架构 / health 未复核）；G8 **可回填**（30 天窗口 30 个 PR：CI 绿率 24/30 = 80%、人工介入 0%、误关 0%）。
> **G4 降级判据**：1.0.0 发布前最近 **10 次 master push 的 Test 0 失败**（允许非 Test workflow 因并发取消）；未达成则按豁免记录实际读数，**不得**声称 20 连绿或 2 周无红；`flake 率 < 2%` 与「30 天无 P0」保留为观察项，不作为 1.0 阻断。
> **G3 豁免边界**：G3.0–G3.9 实跑未完成、G3.8 仅 `partial`，1.0.0 **不宣称 G3 通过**；发布说明披露「真实环境矩阵待资源补测」，Google OAuth 未测同列已知限制；获得资源后按 [真实环境矩阵](../../guide/real-env-matrix.md) 补测。
> **阶段启动交叉核验（§3.4，2026-11-01 实测）**：① 归档扫描 `发布窗口决策|M54` → 无历史闭环（仅 backlog / todo 指针）；② `git log --all --grep="发布窗口"` → 0 命中；③ 代码 / 文档 anchor：`release.md` 已有中间版本发布清单（当时为 0.6.1，后按脚本推导改 0.7.0）但无 1.0.0 清单、无 `@v1` tag、`v0.6.0` 为最新 tag、无发布级回滚演练记录；④ G8 脚本真实读数已可取（30 PR 窗口）；⑤ backlog 中「发布级回滚演练」候选在列，本阶段上收。
> **容量评估（§1.1）**：6 原子，类型分布 📚 1 + 🚀 2 + 🧪 2 + 🛠️ 1；预估 **33-52 文件 / 1900-3400 行 / 15-19 commits**（含 mutation 补测与发布文档；发布动作不计行数）。
> **§3.1.1 插队再平衡**：阶段启动插队 **0 批**；执行期追加 1 批（2026-11-05，preflight 工作区留痕 CI 偶发红收口）——7 文件 / +192 −85（192 行）、3 commits，未达再平衡阈值（1 < 3 批、192 行 < 阶段基线 50%），剩余原子 M54.6，不触发容量重排。
> **原子间依赖与交付顺序**：M54.1（决策台账）→ M54.2（0.7.0 发布）→ M54.3 / M54.4 / M54.5 可并行 → M54.6（1.0.0 发布，依赖全部）。

### M54.1 [P0 📚] 发布窗口决策台账与发版文档骨架（**已闭环** `fbcccd42` + `d0c563eb` + `425da284`）

- **目标**：把四项用户决策、G3 / G4 豁免边界、G8 引用要求写进 1.0 台账与发布文档，形成 1.0.0 发布说明骨架（含已知限制）。
- **优先级**：P0（后续发布的判定依据）。
- **范围**：本批规划已落 `release-1.0-readiness.md §2.2` 与 G3 / G4 / G8 行、`docs/plan/*` / `docs/index.md` 同步（回填规划 commit）；M54.1 执行只补 1.0.0 发布清单（版本 / 门禁 / 回滚 / 校验和）、发布说明骨架与已知限制段，并修正已失效指引（alert 30 已 fixed / code scanning 0 / G8 已产出）。
  > **范围变更（执行期，2026-11-01）**：原计划在 `docs/guide/release.md` 内追加 1.0.0 章节；实测该文件 435 行，追加正文与发布说明骨架会进 guide warning 带（501-800），按 M53.1 先例独立成页 [1.0.0 发布清单与发布说明骨架](../../guide/release-1.0.md)，release.md 保留指针与同源口径修正。验收④的「`release.md` 清单」按「release.md 指针 + 新页正文」判读。
- **验收标准**：① 四项决策在 §2.2 可检索且含规划 commit 回填；② G3 / G4 标「1.0 发布豁免」而非 `passed`，含 retry_condition；③ G8 真实读数（24/30 · 0% · 0%）已写入并要求发布说明引用；④ 发布清单 + 发布说明骨架含「已知限制」（G3 实跑 / Google / G6 英译），并清除已失效的红 / 待窗口指引；⑤ `gates:docs` 通过。
- **不做什么**：不发布、不改版本号、不创建 tag、不把豁免写成通过。
- **依赖**：无。
- **交付物**：预估 3 commits / 6-9 文件 / 400-700 行。**实测（2026-11-01）**：3 commits + 本登记 / 7 文件（新增 1）/ +123 −25。新增页覆盖版本锚点、发布前门禁（含非豁免门槛终态核对与本地备用通道口径）、发布步骤、发布后复核、回滚四类、产物校验和、发布说明骨架；台账补 §2.2 回填与 G3 / G4 retry_condition、G8 引用要求、§7 清单勾选与失效指向修正；`release.yml` 三处注释对齐「不启用自动发布」。
- **风险与缓解**：豁免被后续读者误读为已验收 → 统一使用「1.0 发布豁免（不构成 G3/G4 通过）」标签并附 retry_condition（台账、新页、发布说明骨架三处同口径）。
- **执行记录（2026-11-01）**：`fbcccd42` 发布清单页 + release.md / 侧边栏指针与同源口径；`d0c563eb` 台账回填；`425da284` release.yml 注释。审计 R1 quick Pass（4 warning / 6 suggest）→ 全部收口 → R2 quick Pass（9 项 + 附加项 closed，0 blocker / 0 warning）。证据：`gates:docs` 20 项通过；`check:doc-size` 计量 105 文档、无新增 warning；`lint:md:check` 通过；`lint:check` 0 error（11 存量 warning）；未跑 typecheck / test / build（无运行时改动，`docs/.vitepress/config.ts` 不入 tsconfig project，由 `docs:build` 实际执行）。
- **§2.6 五步自检（范围变更触发）**：① 归档扫描「发布清单 / 发布说明骨架」→ 无 1.0.0 历史闭环（M53.4 仅 0.6.1 清单）；② `git log -- docs/guide/release.md` 与 `--grep="发布清单"` 无重复批次；③ 代码侧 anchor 实测：`release:plan` 对 0.x 的 BREAKING 只给 minor、`verify:changelog` 校验七份、`DOC_GATES` 二十项、`metrics:pr-health` 参数名；④ 规划批次已落 §2.2 决策表，执行面只补文档，无前提矛盾；⑤ backlog 无对应候选需同步。

### M54.2 [P0 🚀] 0.7.0 发布与发布后验证（**已闭环** `a049a561` + 用户手动发布 + 镜像补发 `41439905381`；AC④ 仅双架构 / 客户端 manifest 未验证（health 已过））

- **目标**：发布 `dependfix@0.7.0`（锚 `v0.7.0`），验证 M53 修复后的发布链（Docker 四小时预算 / tag 派发判据 / `--version` 元数据），为 1.0.0 排除发布链风险。
- **优先级**：P0（1.0 的前置演练）。
- **范围**：锚版本 `0.7.0`（= `dependfix` 版本，按 `release:plan` 推导），逐包按脚本 bump——`@dependfix/core` 0.7.0 / `@dependfix/engine` 0.6.0 / `@dependfix/mcp` 0.3.1（传导）/ `@dependfix/platform` 0.5.0（镜像 `platform-0.5.0`）；`@dependfix/skills` 无改动不发布。CHANGELOG（七份）、tag / GitHub Release、npm 发布、Docker 镜像、发布说明版本引用；`release:preflight` + `check:release-security` 门禁。
- **验收标准**：① 版本号与 CHANGELOG 同步，`verify:changelog` 通过；② `release:preflight` PASS（临时工程安装 `--version = 0.7.0`；三路安装按真实环境矩阵复核）；③ `check:release-security` 通过；④ 本轮发布包（core / engine / mcp / dependfix）+ tag + GitHub Release + platform 镜像 `platform-0.5.0` tag / health 实测；⑤ 发布后按包 audit / code scanning 无非豁免 critical / high；⑥ `npx dependfix@0.7.0 --version` = 0.7.0（关闭 `--version` 候选）；⑦ 用户可见文档版本引用按 G6 口径统一回填（1.0 前不逐版散改）。
- **不做什么**：不发 1.0.0、不启用 `schedule` / `push` 自动发布、不改 1.0 契约、不为凑 patch 人工压低 bump。
- **依赖**：M54.1。
- **交付物**：预估 4-5 commits / 20-26 文件 / 250-450 行（发布动作不计行数；含口径同步追加批次）。**实测**：5 commits（`ae1a754f` 发布锚版本口径 / `22239be0` 归档索引基线 / `0aad1fec` G3.8 证据提示 / `50f58213` CLI 注释 / `a049a561` `chore(release): 0.7.0`）/ 11 文件 + 本批登记；发布动作（npm / tag / Release）不计行数。
- **风险与缓解**：发布链仍失败 → 记录失败点并在 1.0 前修复；镜像预算超时 → 按 backlog 拆 per-arch job，不在 1.0 窗口硬扛。
- **§2.6 五步自检（口径同步触发）**：① 归档扫描「0.6.1 / 发布清单」→ 仅 M49 / M53 历史正文命中，无待办闭环项；② `git log -- docs/guide/release.md` 与 `--grep="发布清单"` 无重复批次；③ 代码侧 anchor：`release:plan` + `release:version --dry-run` 实测 0.7.0 / 0.7.0 / 0.6.0 / 0.3.1 / 0.5.0，`@dependfix/skills@0.3.0` tag 已存在 → 发布走 tag 跳过；④ 决策前提由用户 2026-11-01 执行期裁定第⑤条厘清（0.6.1 → 0.7.0 属口径修正，非新需求）；⑤ backlog `--version` 条目触发条件与标题已同步改指 0.7.0。
- **执行记录（2026-11-02，发布动作由用户手动执行）**：① 版本与 tag——`dependfix` 0.7.0 / `core` 0.7.0 / `engine` 0.6.0 / `mcp` 0.3.1 / `platform` 0.5.0，六个 tag 均指向 `a049a561`；GitHub Release `v0.7.0` 为 Latest、非 prerelease（`gh release view` `createdAt` = `2026-11-02T10:33:46Z`）。② 发布后复核——`npx --yes dependfix@0.7.0 --version` = `0.7.0`（**AC⑥ 关闭** 0.6.0 的 `--version` 缺陷，对应 backlog 候选已移除，候选池 65 → 64）；`pnpm audit --prod --audit-level=moderate` exit 0（1 low + 1 ignored moderate = minimatch，§5.7）；Dependabot 开放 2 条（#126 minimatch medium / #125 deepmerge low）、Code Scanning **0** 条 → 非豁免 critical / high = 0（**AC⑤ 达成**）；四个发布包的 `dist.integrity` 已记入 [release.md](../../guide/release.md)「0.7.0 发布记录」段（**AC④ 的 npm / tag / Release 部分达成**）。③ **AC④ 的镜像 tag 已达成，当时 health 未复核**：本地发布后另经 `docker.yml` 派发 `41439905381`（`--ref v0.7.0`，`platform_version=0.5.0`，success）产出 `latest` / `2026-11-02` / `platform-0.5.0` / `sha-a049a56` 四标签（Docker Hub + GHCR；ACR 11-05 复核为 amd64-only tag），双架构 manifest `sha256:71f6633…a244f1`，**build job 22m03s**（240 分钟预算余量确认）；`BUILD_VERSION=0.5.0` 已注入。本环境 GHCR 私有（token 缺 `read:packages`，`401 Unauthorized`）且 Docker Hub 不可达（`i/o timeout`）→ 客户端 manifest 校验与 `/api/health` 版本戳 **复核 blocked**，转 M54.5 AC② 统一 retry_condition。④ 门禁：2026-11-01 批次读数（`check:release-security` PASS、`gates:docs` 20 项、`typecheck` 7 项目、`lint:check` 0 error、全量 5713 passed、`verify:changelog` 通过）；**AC② 由 2026-11-02 复跑补证**——`pnpm release:preflight --out-dir=artifacts/m54.2/preflight` PASS（pack 4 包 + skills、inspect、`install: dependfix --version = 0.7.0`、workspace 留痕四项全 PASS，`preflight.json` 的 `version` = `0.7.0`）。**AC⑦**：按 G6 口径「1.0 前不逐版散改」，本轮**不动**用户可见版本引用（README / 首页示例保持既有口径）。⑤ 审计：口径批次 R1 Reject → R2 Reject → 修复；发布提交 deep **Pass**（4 warning 已登记）。

### M54.3 [P1 🧪] G5 关键模块 mutation 补全（**已闭环** `9bfaf3ea` + `39051978`）

- **目标**：把「关键模块全覆盖」从 1/3 推进到 3/3——在验证结果判定链、升级选择链、基线红 / 退出码链各补 ≥3 个 mutation，全部击杀并留工件。
- **优先级**：P1（有条件发布的补强项）。
- **范围**：`packages/engine/src/app` 的 `verify-project` / `result-assembly` / `upgrade-alert` / `repo-fix-major` / `baseline-red-delivery` / `exit-code` 等判定链；mutation 工件入 `artifacts/review-gate/`（gitignored）；`release-1.0-readiness.md` G5 行回填。
- **验收标准**：① 关键模块清单成文（3 条链，含选择理由）；② 每条链 ≥3 变异、合计 ≥9，全部击杀；③ 工件含文件 / 变异前 md5 / 失败用例 / 复现命令，还原后 md5 一致；④ 全量测试与覆盖率不低于现基线；⑤ G5 行更新且不写成「100% mutation」。
- **不做什么**：不追求全仓 mutation 100%；不做无关重构；不为提升指标改断言。
- **依赖**：无（可与 M54.2 并行）。
- **交付物**：预估 3-4 commits / 6-10 文件 / 600-1000 行（测试为主）。**实测（2026-11-02）**：3 commits / 4 文件（测试两例 / 台账 §2.3 与 G5 读数 / todo 与归档索引登记），工件 gitignored。
- **执行记录（2026-11-02）**：① 清单成文——三条链（`verify-project` 验证结果判定 / `repo-fix-major` + `upgrade-alert` 升级选择 / `skipped-delivery` + `result-assembly` 基线红与退出码），选择理由入 [release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md) §2.3；② mutation 13/13 击杀（链① 5 / ② 4 / ③ 4），工件 `artifacts/review-gate/2026-11-02-m54-3-mutation.md`（文件 / 变异前 md5 / 失败用例 / 带 `-t` 的复现命令；驱动脚本与机读 JSON 同目录归档），还原后五个被测文件 md5 与基线一致；③ V4（去重守卫关闭）首轮存活 → 补正向例，V5（谓词放宽到只比类别）标定反向例「其它仓库同命令不被吞掉」，两例均为新增、未改写既有断言；④ 质量门：`pnpm test:coverage` exit 0（372 passed | 2 skipped 文件 / 5715 passed / 10 skipped 用例；四维 89.76 / 84.22 / 90.44 / 89.88，均不低于 2026-10-31 读数）、`lint:check` 0 error（11 存量 warning）、`typecheck`、`gates:docs` 二十项；⑤ 审计 R1 standard **Pass**（3 warning / 5 suggest，W01 / W02 与 S 项已收口）→ R2 quick **Pass** → R3 收口 **Pass**（1 warning：G5 读数单元格竖线未转义致列错位，已修净）；残余 suggest：去重谓词的「同仓异命令」维度未单独标定（现存反向例锁仓库键），留待后续补测，不阻断。
- **风险与缓解**：mutation 手工成本高 → 限定 3 条关键链、每链 3 个高价值变异；存活变异若属不可达分支 → 登记已知边界，不强行构造。

### M54.4 [P1 🧪] G4 / G8 发布窗口读数与已知 flaky 复测（**已闭环**，2026-11-02）

- **目标**：冻结 1.0 发布前的 G4 证据（按降级判据）与 G8 真实指标，并把 G8 写进发布说明；对已知 flaky（scan-config / repos-crud）做有界复测。
- **优先级**：P1（有条件发布的证据面）。
- **范围**：`gh run list` 最近 master push 统计 + run id 清单；G8 `pr-health` JSON / Markdown 落 `artifacts/metrics/`（gitignored）并引用进发布说明；已知 flaky 单文件 10 次复跑；G4 / G8 台账回填。
- **验收标准**：① G4 按「最近 10 次 push Test 0 失败」给出读数与 run id，未达成则记录豁免；② flaky 两文件各 10 次结果（通过 / 失败分布）留痕；③ G8 读数（发布当日复算值，本轮 25/30 · 0% · 0%）与报告路径可复核；④ 发布说明含指标出处；⑤ 本批不引入新红。
- **不做什么**：不把 flaky 单次通过写成「已修复」；不改 G8 口径；不采信无 token 的 0 值。
- **依赖**：M54.1（豁免模板）；G8 脚本。
- **交付物**：预估 2 commits / 3-5 文件 / 200-400 行。**实测（2026-11-02）**：5 文件（台账 G4 / G5 / G8 三行 + 发布页 G8 与豁免读数 + todo / backlog / 归档索引），2 commits（hash 随 F 阶段提交回填），证据面 200 行内。
- **风险与缓解**：flaky 复发 → 记录失败谱与触发条件；窗口仍红 → 按 G4 豁免披露，不伪造 10 连绿。
- **执行记录（2026-11-02）**：① **G4 冻结读数**——最近 10 次 master push 的 Test = **9/10 绿**（唯一红 `41347144192` @ `5bbebc9f`，`2026-11-01T20:29:57Z`），降级判据**未达成**，按豁免披露；归因为测试隔离缺陷（`scripts/release/preflight.test.mjs:347` 工作区留痕断言，diff 仅 `M apps/platform/CHANGELOG.md`；其后下一次 push `41347687263`（`56191e91`）立即回绿，本地全量复跑未复现），非产品回归；0.6.0（`2026-10-28T18:24Z`）以来 **30/38** 绿（不含 0.6.0 发布自身 1 次）。② **flaky 复测**——`scan-config.e2e.test.ts` 10 次（每次 5 例）与 `repos-crud.e2e.test.ts` 10 次（每次 10 例）**20/20 次全绿、150 例 0 失败**（单次 13-20s；日志 `artifacts/m54.4/flaky-retest.log` 与逐次输出）。**不写成「已修复」**：仅证明本环境 20 连跑未复发。③ **G8 复算**——`GITHUB_TOKEN=$(gh auth token) pnpm metrics:pr-health --repo=dependfix/dependfix --days=30 --limit=30 --out-dir=artifacts/metrics` → **25/30 = 83.3% / 人工 0% / 误关 0%**（11-01 为 24/30，窗口滚动已变化）；发布说明改为「发布当日复算值」口径，[release-1.0.md](../../guide/release-1.0.md) §2 / §4 / §7 三处同步。④ AC⑤：本批零运行时代码改动，全量 `pnpm test` 372 passed / 2 skipped 文件、5715 passed / 10 skipped 用例（104s），未引入新红。⑤ 候选池：M54.2 后 64；本批将「master 3 连绿窗口未完成」转台账 G4 豁免追踪（**未达成**，retry_condition 见台账）→ 63，新增「preflight 工作区留痕断言偶发红」1 项 → 64。

### M54.5 [P1 🛠️] G7 发布级回滚演练与远端镜像复核（**已闭环**，2026-11-02；Docker 面 blocked 留 retry_condition）

- **目标**：把「发布级回滚」从 backlog 候选变成演练记录（镜像 tag 回退 / npm `deprecate` / GitHub Release 撤回 / `@v1` 回退），并复核远端多架构镜像 / health。
- **优先级**：P1。
- **范围**：用 0.6.0 / 0.7.0 已有产物做 dry-run（不真删生产 Release、不破坏现有 tag）；`release.md` 回滚章节；Docker manifest / health 复核证据；`release-1.0-readiness.md` G7 行回填。
- **验收标准**：① 回滚演练四类动作各有命令、预期与实测结果（dry-run 或测试 tag）；② 远端镜像双架构 manifest 与 `/api/health` 版本戳复核，缺 `read:packages` 时记录 blocked + retry_condition；③ 文档写明「不执行的破坏性步骤」；④ G7 行不再把回滚列为未演练（或明确保留残余）。
- **不做什么**：不撤回 0.6.0 生产 Release；不删除远端 tag；不执行不可逆 `npm unpublish`。
- **依赖**：M54.2（0.7.0 产物）。
- **交付物**：预估 2-3 commits / 4-6 文件 / 300-500 行。**实测（2026-11-02）**：3 文件（发布页 §5 演练记录 + 台账 G7 行与 §7 清单 + todo 登记），2 commits（hash 随 F 阶段提交回填），日志 3 份 gitignored。
- **风险与缓解**：registry 权限不足 → 用测试 tag / 本地 manifest 模拟并登记重试条件；演练脚本加 dry-run 默认与显式确认。
- **执行记录（2026-11-02）**：① **npm**：`npm deprecate dependfix@0.6.0 "<说明>" --dry-run` 只打印计划，随后 `npm view dependfix@0.6.0 deprecated` 为空 → 无副作用，drill 通过（真实 `deprecate` 未执行，`0.6.0` 是否弃用属用户决策）。② **git tag**：本地一次性 tag `drill-rollback-20261102-1`（`git cat-file -t` = `tag`）创建后删除，`git tag -l 'drill-rollback-*'` 归零，六个 0.7.0 tag 仍指向 `a049a561` → drill 通过；远端删除 `git push origin :refs/tags/<tag>` **未执行**。③ **GitHub Release**：`gh release view v0.7.0` 只读核对（Latest / 非 prerelease / tag 指向发布提交）→ 判据可用；`gh release delete` 与重建**未演练**（破坏性，明确保留残余）。④ **Docker**：`platform-0.5.0` **已发布**（dispatch `41439905381`，四标签 + 双架构 + build 22m03s），但客户端 `docker buildx imagetools inspect` 对 GHCR 报 `failed to fetch anonymous token ... 401`（token 缺 `read:packages`）、对 Docker Hub 报 `dial tcp ...:443: i/o timeout` → manifest 客户端校验与 `/api/health` 版本戳**未复核（blocked）**，**不记为通过**；retry_condition 写入台账 G7 与 §7 清单。⑤ **数据库**：本轮无迁移，引用 M53.2 备份恢复实测（备份 323,584 字节 → `db:restore` → 三方逐表 0 差异、`integrity_check: ok`）。⑥ 文档口径：按固定面清单（npm / git tag / GitHub Release / `@v1` / Docker / 数据库）逐面写命令 / 预期 / 实测 + 「未执行的破坏性步骤」，见 [release-1.0.md §5.1](../../guide/release-1.0.md)；台账 G7 行与 §7 清单同步，**未声称全部面已演练**。

### M54.6 [P0 🚀] 1.0.0 发布与 `@v1` 滚动标签（**已闭环** `86108b60` + `f90c11b7` + `83c966fd` + `c13f1714` + `17fdaba8` + `f7917cab`；发布 run `42351775424`；镜像 run `42381362295`）

- **目标**：在 2026-11-15 目标窗口发布 `1.0.0`（npm 5 包 + platform 镜像 + GitHub Release），发布说明含 G8 指标与已知限制，创建 `@v1` 滚动标签并完成发布后验证与台账回填。
- **优先级**：P0。
- **范围**：版本号 / CHANGELOG / tag、npm 发布、Docker 镜像、GitHub Release、`@v1` tag、三路安装验证、发布后 audit / code scanning、G1-G8 终态回填、用户可见文档版本引用。
- **验收标准**：① `release:preflight` + `check:release-security` 通过；② 5 npm 包 + tag + GitHub Release + platform 镜像发布；③ 发布说明含 G8（**发布当日复算**，2026-11-02 读数为 25/30 · 0% · 0%）与 G3 / Google 已知限制；④ `@v1` 指向 1.0.0；⑤ tarball / npx / 全局安装 `--version = 1.0.0`；⑥ 发布后 audit / code scanning 无非豁免 critical / high；⑦ 台账 G1 / G2 / G5 / G6 / G7 / G8 终态回填，G3 / G4 保持豁免记录。
- **不做什么**：不启用自动发布（除非用户另行授权）；不宣称 G3 通过；不把 G6 全量英译塞进 1.0。
- **依赖**：M54.1-M54.5 全部闭环。
- **交付物**：预估 2-3 commits / 6-10 文件 / 200-400 行（发布动作不计行数）。
- **风险与缓解**：1.0 发布链失败 → 用 0.7.0 已验证链路回退并记录；窗口超期 → 以门禁完成度为准，不静默改日期；回滚 → 按 M54.5 演练步骤执行。
- **G1 ④ 补齐（2026-11-05）**：手动触发的周回归 `42017415845` success——`PASS security:audit-deps`，日志含 `2 vulnerabilities found / 1 low | 1 moderate (1 ignored)` 审计结果行 → 最近 3 次（`40693124400` / `41101319146` / `42017415845`）均通过，**G1 转 ✅**（① 非豁免 critical / high = 0、② code scanning 0、③ 阻断步骤与周回归同命令）。
- **发布前决策（2026-11-05 用户）**：① 六个发布包全部随 `1.0.0`（`dependfix` / `core` / `engine` / `mcp` / `skills` / `platform`，`platform` 走 tag-only + 镜像 `platform-1.0.0`）；② 发布通道 = `release.yml` 的 OIDC dispatch；③ 镜像复核以**阿里云 ACR** 为主通道；④ G1 ④ 第 3 次周回归等 11-06 计划运行或手动触发（当日已手动触发 `42017415845`）。
- **ACR 镜像复核（2026-11-05）**：`platform-0.5.0` 匿名拉取 + `docker run` 冒烟 **PASS**（`/api/health` = `0.5.0` / `a049a561`、15 张业务表、迁移专用模式通过）；但 **ACR 个人版把 tag 解析为单一 amd64 manifest**（index `sha256:71f6633…` 仅按 digest 可取，内含 amd64 + arm64）→ 双架构未通过 ACR 验证，须 GHCR / 企业版 ACR；已登记候选。
- **预发布检查（2026-11-03，`regression:pre-release`）**：**全绿**——`test:coverage`（372 文件 / 5715 passed；89.53 / 84.10 / 90.28 / 89.64）、`security:audit-deps`、二十项文档门禁、`lint:check`（0 error / 11 存量 warning）、`lint:css:check`、`typecheck`、`build`、`verify:changelog` 全 PASS（`Review Gate: Pass`，证据 `artifacts/review-gate/2026-11-03-pre-release-regression.md` + `artifacts/m54-6-precheck/pre-release.log`）；`check:release-security` PASS（2026-11-05 复跑：critical 0 / high 0 / moderate 0 / low 1，输出带采集时点，`artifacts/m54-6-precheck/release-security.txt`）；`release:preflight` PASS（`--version = 0.7.0`）；platform e2e **210 passed / 2 flaky / 0 failed**（4.6 分钟，flaky = scan-config「扫描偏好记住上次选择」+ schedules-crud「trigger → BatchRun + lastTriggeredAt 回填」，均重试通过，CI 侧 retries=2）与视觉 **21 passed**。读数：G8 25/30 · 0% · 0%（`artifacts/m54-6-precheck/pr-health-20261103.md`）、G4 9/10（2026-11-02 冻结读数）、G3 9 pending + G3.8 partial、G1 ④ 2/3（10-28 + 10-30）。**新增障碍**：① `release:plan` 对仅含 docs 的窗口不产计划，1.0.0 的 `release-plan.md` 须手工落盘；② 1.0 各包版本方案待用户确认；③ 镜像 `/api/health` 与客户端 manifest 校验仍 blocked（缺 `read:packages` / Docker Hub 不可达）；④ G1 ④ 已于 2026-11-05 补齐（`42017415845` 手动触发，3/3），该障碍已消除。

- **执行记录（2026-11-07，发布动作经 `release.yml` OIDC dispatch）**：① **发布计划手工落盘**——`release:plan` 对「0.7.0 之后仅 docs / test / scripts 提交」的窗口不产计划（实测 `未发现需要提升版本的变更`），按 §1 手写 `release-plan.md`（六包 `major`）→ `release:version` 六包 0.x → `1.0.0` → `pnpm changelog` 七份日志。② **发布链前两次失败**——`42332948238` 卡在 `GH_PAT` 读 Dependabot alerts 403（secret 权限不足，用户重配后通过）；`42350661632` 卡在版本提升后 `scripts/create-release-plan.test.mjs` 的「仓库当前为 0.x」断言（`f90c11b7` 改为 `isPreMajor(version?)` + 按真实版本推导期望值）。③ **发布成功**（`42351775424`）：5 个 npm 包 `1.0.0`（`dist-tags.latest` = 1.0.0）、6 个 `<pkg>@1.0.0` + `v1.0.0` tag 均指向 `83c966fd`、GitHub Release `v1.0.0` 为 Latest 且非 prerelease（正文含首个稳定版 / 契约与迁移 / G8 / 已知限制）；**AC② 镜像已完成**——原 QEMU 方案两次触 240 分钟上限被取消（`42351771958` / `42352117141`），改为原生 amd64 + arm64 runner + digest 合成（`c13f1714`）后 run `42381362295` 全绿：三 registry × 4 tag（`latest` / `2026-11-07` / `platform-1.0.0` / `sha-5c81058`）回读 **12/12 双架构**，OCI `version=1.0.0`（无版本派发另有 `42376062304` 9/9 验证）。④ **`@v1` 滚动标签**（AC④）：annotated `097723a7` → `83c966fd`，已推送，`uses: dependfix/dependfix@v1` 可用。⑤ **安装验证**（AC⑤）：`npx dependfix@1.0.0 --version` = `1.0.0`、全局安装（隔离 prefix）= `1.0.0`、tarball 由 `release:preflight` 覆盖。⑥ **发布后安全**（AC⑥）：`check:release-security` PASS（critical 0 / high 0 / moderate 1 / low 1）、`pnpm audit --prod` 2 条（1 low + 1 §5.7 豁免 moderate），无非豁免 critical / high。⑦ **台账**（AC⑦）：G1 / G2 / G5 / G6 / G8 回填为 ✅，G7 维持 ◐（双架构须 GHCR / ACR 企业版），G3 / G4 保持豁免与 retry_condition。证据与校验和见 [release.md](../../guide/release.md#_1-0-0-发布记录-m54-6-2026-11-07-已执行)。

### 追加临时待办（不占阶段条目编号）：preflight「工作区不留痕」CI 偶发红收口（2026-11-05；插队例外清单第 3 类「CI 主链路阻塞」）

- **触发与授权（2026-11-05）**：用户在会话中直接给出失败 run 链接 `https://github.com/dependfix/dependfix/actions/runs/41676955410`（`f1b71666`，2026-11-03），要求处置该红。该失败再次命中 `scripts/release/preflight.test.mjs` 的「预演前后工作区状态不一致」，diff 仅 `M apps/platform/CHANGELOG.md`——同一断言第 2 次在 CI 红（首次 `41347144192` / `5bbebc9f`，2026-11-01，当时登记为 backlog 候选，其触发条件即「再次在 CI 命中」）。按插队例外清单第 3 类「直接影响可用性：CI 主链路阻塞」处理；backlog 候选已随本批移除（64 → 63）。
- **根因（两层，均已实证）**：① `scripts/changelog.mjs` 的生成流程写在模块顶层、无 `isDirectExecution` 守卫——`scripts/changelog.test.mjs` 导入模块即对真实仓库跑一遍生成（CI 日志中 `updated apps/platform/CHANGELOG.md（清理残留未发布段）` 由该测试文件在 `16:45:36` 打印，与 preflight 的 `git status` 前后快照窗口重叠）；② 残留段清理把「npm registry 查不到」当作未发布证据，而 `apps/platform` 是 `npmPublishable: false`（从不发 npm）→ 查询恒为 false，叠加 CI `actions/checkout` 默认浅克隆不带 tag，历史段被整段判为残留并删除。
- **处置**：① 生成流程收敛为 `export async function main()` + `isDirectExecution` 守卫（导入零副作用，与 `check-docs` / `check-doc-governance` 等脚本同形）；② 新增 `createPublishedProbe`：`npmPublishable: false` 的包不采信 registry（返回 `null` = 未知 → 保留），只信任本地 tag 证据；③ 回归用例——`vi.resetModules()` 重导入断言无 `console.log` 且 `main` 已导出 + probe 两例 + 「浅克隆 + 非 npm 包保留历史段」组合一例。
- **验收标准**：① 导入 `scripts/changelog.mjs` 无 stdout、不写仓库文件（旧版导入打印 7 行 `unchanged` 已实证）；② `node scripts/changelog.mjs` 行为不变（七份 `unchanged`）；③ 非 npm 发布包在无 tag 环境不再删除历史段；④ 全量 `pnpm test` / `lint:check` / `typecheck` 通过且工作区无留痕。
- **风险与依赖**：`main` 收敛新增两个导出（`main` / `createPublishedProbe`），无外部消费者；浅克隆下其余 npm 包仍以 registry 为证据，查询失败本就保守保留。
- **执行记录（2026-11-05）**：`scripts/changelog.mjs` 入口守卫 + `createPublishedProbe` + 惰性 `headDate` / `repo` 求值 + 非 npm 包跳过 registry 查询、`scripts/changelog.test.mjs` 回归用例四例；证据：导入零输出、`node scripts/changelog.mjs` 七份 `unchanged`、定向 66 passed、全量 372 文件 / 5719 passed · 10 skipped、`lint:check` 0 error（11 存量 warning）、`typecheck` exit 0、`gates:docs` 20 项。
- **§3.4 / §2.6 五步自检（插队登记触发，2026-11-05 实测）**：① 归档扫描 `preflight.*工作区|工作区留痕|模块导入副作用|changelog.*入口守卫` → 命中 [release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md) G4 行（M54.4 冻结读数）、[todo-archive-phases-m53.md](todo-archive-phases-m53.md)（M53.2 的「工作区不变」实测证据）、[archive/index.md](index.md)（候选计数行）与本批新增的经验条目——四者均非同题修复批次，无历史闭环重复；② `git log --all --grep="preflight" --grep="工作区留痕" --grep="changelog.*守卫"` → 仅 `40e82b6a`（新增 preflight 本身）与两条文档提交，无同题修复批次；③ 代码 / 文档 anchor 实证：`scripts/shared/cli.mjs:101` `isDirectExecution`、`scripts/release/preflight.mjs:235/244/299` 工作区快照、`scripts/packages.config.mjs:91` `npmPublishable: false`；④ 决策前提：backlog 候选的触发条件（再次在 CI 命中同一断言）已由 run `41676955410` 满足，处置方向与该候选「定位并发写入方」的待评估点一致；⑤ backlog 同步：候选移除，计数 64 → 63，[archive/index.md](index.md) 摘要行追加本次读数。

---

## 阶段收口要求

- **质量门**：逐原子 `pnpm run lint:check` + 涉样式时 `lint:css:check` + `pnpm typecheck` + 定向测试；代码改动跑 `pnpm -r build`；M54.3 跑全量测试 + 覆盖率；M54.2 / M54.6 跑 `release:preflight` + `check:release-security`。
- **Review Gate**：每原子至少一轮 `Code Auditor`（standard；发布执行 / 回滚演练升 deep），Reject 须闭环复审。
- **发布门禁**：G1 发布物审计与 code scanning 清零、G2 契约不变、G5 三条链 mutation、G6 发布说明 / 版本引用 / `@v1`、G7 回滚演练、G8 指标引用；G3 / G4 按豁免记录，**不得**写成通过。
- **不做**：不启用自动发布、不删除生产 tag / Release、不把 Google 未测写成已验收。
- **归档**：按 [规划规范 §4](../../standards/planning.md) 迁出为 `todo-archive-phases-m54.md` + 索引行 + roadmap 状态同步。

---

## 阶段收口（2026-11-07）

- **质量门终态**：发布 run `42351775424` 全绿（`check:release-security` PASS、`gates:docs` 20 项、`typecheck` 7 项目、全量 5719 passed、`release:preflight` PASS）；镜像 run `42381362295` 全绿（QA / amd64 / arm64 / merge + 双架构回读）。
- **1.0.0 镜像 health 复核（2026-11-07 本地实测）**：
  `SMOKE_IMAGE=registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix:platform-1.0.0 SMOKE_EXPECT_VERSION=1.0.0 SMOKE_EXPECT_COMMIT=5c8105875486f4f3ab5570ae8c61c6fe17d96c07 sh apps/platform/docker/smoke-test.sh`
  → **PASS**：`/api/health` = `{"version":"1.0.0","commit":"5c810587…","startedAt":"…"}`、业务表 **15**、迁移专用模式同样 15 表；关闭 G7 的「1.0.0 health 未复核」项。
- **Review Gate 汇总**：1.0.0 发布提交与文档批次共 4 轮（R1 quick Pass；文档批次 R1 standard Reject → R2 Reject → R3 Pass；镜像流水线批次 R1 standard Reject → R2 Reject（run id / 标签错误）→ 修复后定版）。镜像流水线本身经 7 次真实 run 迭代（QEMU 超时 → 原生多架构 → checkout → annotation 不支持 → 标签修正）。
- **台账联动**：G1 / G2 / G5 / G6 / G8 转 ✅；G7 保持 ◐（发布自动化未启用属用户决策、回滚剩余面未演练）；G3 / G4 保持豁免与 retry_condition，**不写成通过**。
- **残余聚合**（已登记 backlog / 台账）：① 1.0.0 镜像 health 已复核，但**发布后自动复核**（对每次发布自动跑 smoke）未实现；② ACR 个人版按 tag 解析仍为单 amd64（平台限制，双架构证明走 GHCR / `imagetools inspect`）；③ `@v1` 回退命令与 Docker 重指未演练；④ 镜像每架构对三个 registry 各构建一次（digest 相同，可优化为单次多 name 推送）；⑤ arm64 镜像仅 amd64 冒烟；⑥ G3 真实环境矩阵与 Google 登录仍待资源。


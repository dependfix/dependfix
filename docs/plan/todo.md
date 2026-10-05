# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M36 进行中**（治理债清仓 + 可观测性与测试稳定性，2026-10-02 用户决策启动） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M35 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M35 已归档 + M36 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段

### M36: 治理债清仓 + 可观测性与测试稳定性（M36.1~M36.10）

> **阶段摘要**：承接 M35 完整闭环归档后的 backlog 候选池，2026-10-02 用户决策**方案 A（治理债清仓）**——从 backlog 中可立即启动的候选中上收 5 项，一次性清空长期沉积的存量治理债（C81 孤立规划编号清理）并收口两处正确性 / 可观测性缺口与一处 e2e 顺序偶发；同日用户直接指令追加 1 项镜像体积治理（M36.6，属 [规划规范 §3.4](../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估教训--2026-09-10) 承认的「用户直接决策」路径，非 backlog 候选）；另用户报告依赖升级 overrides key 重复写法缺陷并追加修复（M36.7，同属「用户直接决策」路径）。backlog 上收的 5 项候选均经 §3.4 三重交叉核验通过（0 项重复评估）。
>
> **10 原子条目**（类型平衡 🛡️ 7 / 📚 1 / 🚀 1 / 🧪 1；M36.8 含 🎨 用户体验修复）：
>
> - **M36.1** [P3 🛡️ 技术债] C81 源码 / 配置注释孤立规划编号存量清理（分批）
> - **M36.2** [P3 📚 文档治理] 设计与索引文档同类陈旧状态清理（存量）
> - **M36.3** [P2 🛡️ 技术债] BatchRun 写回非原子竞态收敛（三处写回统一条件更新）
> - **M36.4** [P3 🚀 可观测性] 告警源「未启用 + 其余源全失败」判据修正
> - **M36.5** [P3 🧪 测试基建] api-i18n「重复仓库」用例顺序偶发定位与治理
> - **M36.6** [P2 🛡️ 技术债] dependfix-platform 镜像体积治理（去除冗余 node_modules 打包）
> - **M36.7** [P2 🛡️ 技术债] pnpm overrides key 语义归一化（消除 `pkg@^1` / `pkg@1` 重复写法）
> - **M36.8** [P1 🛡️ 缺陷修复 / 🎨 体验] Docker 首次启动数据库初始化 + 一键初始化脚本 + 部署文档
> - **M36.9** [P1 🛡️ 缺陷修复] 扫描队列孤儿 job 释放 + pending 排队误杀修正
> - **M36.10** [P1 🛡️ 缺陷修复] 队列模式决策纳入消费者维度（auto 无进程内 worker 时自动降级同步）
>
> **类型平衡复核**：[规划规范 §1.1](../standards/planning.md#11-硬性约束) 建议 🎨 用户体验 + 🛡️ 技术债 + 🚀 能力扩展 + 🧪 测试覆盖：本批 🛡️ 7 + 📚 1 + 🚀 1 + 🧪 1；**🎨 用户体验由 M36.8 承载**（Docker 首次启动即用体验 + 部署文档缺口）。
>
> **§3.4 三重交叉核验结论**（本批为 backlog 上收：「评估 → 用户决策 → 上收」路径）：
>
> - ① **todo-archive 表格扫描**：`rg -n "C81|孤立规划编号|文档.*陈旧|BatchRun.*竞态|非原子|告警源|审计性|api-i18n|重复仓库" docs/plan/todo-archive.md docs/plan/archive/todo-archive-phases-*.md` 仅命中 M35 遗留观察项（登记，非闭环）/ M34.5 记录 / M29.x 注册，**无候选已闭环**。
> - ② **git log 历史核验**：C81 仅 `d5558d2`（登记）/ `50fdfa3` / `9ba9572` / `9ebb4df`（口径修正），无实现 commit；文档陈旧仅 `64bdb79`（M34.5 仅处理索引 `:25` + `architecture.md`）；BatchRun 写回 `041b4df` / `222ca6d`（M35 已落共享写回，竞态点尚存）；告警源 `00a11ff`（C89 / M32.3 区分「未启用 vs 获取失败」，判据未改；C78 / M29.5 `6fd6aad` 为其前置）；api-i18n `ace07a8`（建用例）后无修复 commit。
> - ③ **代码侧 anchor 实证**：`packages/core/src/alerts/index.ts:48` / `sample-collector.mjs:5` / `stats.get.ts:10`（C81 样例存在）；`docs/design/governance/index.md:23/:24` + `platform-ai-integration.md:366` + `docs-and-readme-i18n.md:542`（陈旧仍存）；`[id].get.ts:47` `batchRepo.save(batchRun)`；`repo-alerts.ts:97` 判据；`api-i18n.e2e.test.ts:61/:88/:116` 三例。
> - ④ **决策前提矛盾核验**（「参考 NNN 实施」等自相矛盾表述）：本批无此类表述，N/A。
> - ⑤ **backlog 描述同步**：已按 backlog 维护规则 5 从 backlog 移除 5 项上收候选（§候选评估中 2 项 + §开发工具链 C81 整段 + §已知边界 2 项）。
>
> 结论：backlog 上收的 **5 项全部有效，0 项重复评估**（M36.6 / M36.7 属 §3.4「用户直接决策」路径，其三重核验结论分别见下文 §M36.6 / §M36.7）。
>
> **关键决策（待用户在执行期细化）**：
>
> - **D1**（2026-10-02 用户决策）：组合定型——方案 A（治理债清仓），5 原子条目；🎨 UX 缺口显式标注。**同日追加 M36.6（用户直接指令）+ M36.7（用户报告缺陷修复）**；后续再追加 **M36.8（用户报告 Docker 首次启动缺陷 + 部署文档 / 初始化脚本需求）**、**M36.9（2026-10-03 用户报告超时后重新触发被 `SCAN_PENDING_MERGED` 永久合并的可用性缺陷）** 与 **M36.10（2026-10-04 用户报告 Docker 单容器 `IN_PROCESS_WORKER=false` + `QUEUE_ENABLED=auto` 时任务入队无人消费的静默挂起缺陷）**，合计 10 原子条目。
> - **D2**：M36.1 判定口径默认取「注释块级 + 真常量白名单（HTTP 错误码等）+ 优先改写为带文档指针的导航指针，无法归指者删编号留正文」；批量替换遵守 [AI 协作规范 §1.2 第 6 条](../standards/ai-collaboration.md) 分批纪律（每子批次 < 10 文件）。
> - **D3**：M36.3 以「条件写回下沉共享层」为主，保持 GET「对非 running 批次仍对齐计数」既有契约；不引入悲观锁。
> - **D4**：M36.4 判据改为「无任何成功源且存在失败源」；明确 `repoResults` / 报告「扫描成功」连锁语义。
> - **D5**（2026-10-02 用户决策）：M36.6 镜像体积治理——对齐 momei / caomei-auth 的 `.output`-only 形态，移除 runtime 冗余 `node_modules` / workspace dist 复制；保持容器内 `DependfixApp` 程序化执行链路可用（引擎已由 Nitro 打包）；sandbox 未来独立入口须自包含，不得依赖 workspace `node_modules`。
> - **D6**（2026-10-02 用户决策）：M36.7 overrides key 归一化——按语义等价类（`1`/`^1`/`1.x`/`^1.0.0`）比对已有 override，命中时沿用其原写法；只收敛可证明等价的等价类，major-0 caret（`^0.0` ≠ `^0`）等保持区分，不引入 `semver` 依赖。
> - **D7**（2026-10-02 用户决策）：M36.8 Docker 首次启动初始化——① 基线迁移采用**实体元数据运行时生成**（`Table.create`，前缀感知 + 跨方言），存量增量迁移改幂等守卫；② compose 部署层默认 `DATABASE_MIGRATIONS_RUN=true`（应用默认仍 false，符合 [development.md §5.1.19](../standards/development.md)）；③ 保留手动 / 一键初始化脚本 + 补齐 Docker 部署文档。
> - **执行顺序建议**：M36.6 / M36.7（已实施 + 实证）→ M36.8 / M36.9（P1，用户报告可用性缺陷，优先）→ M36.3（P2）→ M36.1 分批独立 → M36.2 / M36.4 / M36.5 相互独立可并行。
>
> **范围边界（不做什么）**：不做 UX 强补候选；不启动需外部基建 / token 的候选（C15 / C68）；M36.8 一并处理迁移前缀感知（其 backlog 触发条件 ③「生产库迁移链正式启用排期」已由本次满足），但不做 Postgres 多写者迁移排期与长期观察项。

#### M36.1 [P3 🛡️ 技术债] C81 源码 / 配置注释孤立规划编号存量清理（分批）

- **目标**：清理全仓库非 `docs/` 源码 / 配置 / 脚本注释中「无文档指针的孤立规划编号」，使其符合 [开发规范 §3 注释规范](../standards/development.md)「禁止开发流程编号标记」（例外仅两类：代码内真实常量、带文档路径 / 章节名的导航指针）。
- **优先级**：P3（非阻塞治理债；规则由 D 阶段自检 + A 阶段必查项强制，但仅作用于新增 / 修改文件，故存量长期沉积）。
- **范围**：全仓库非 `docs/` 的源码 / 配置 / 脚本注释（**扫描面量级 600–1000 文件 / 孤立命中量级 300–430 行**，为 M29.9 双源扫描口径——执行角色与 A 阶段审计独立扫描各得一份行口径量级；行级判定 skip `node_modules` / `dist` / `.nuxt` / `pnpm-lock`，扩展名白名单随包浮动；**可复现检测命令随本条目首个子批次固化的脚本产出**）；按包 / 目录切分子批次，**每子批次 < 10 文件**；示例落点 `packages/core/src/alerts/index.ts:48`、`packages/engine/src/code-scanning/scripts/sample-collector.mjs:5`、`apps/platform/server/api/dashboard/stats.get.ts:10`。
- **验收标准**（2026-10-05 全部实证）：
  - [x] 固化检测脚本 `scripts/check-orphan-ids.mjs`（`check:orphan-ids` 命令；注释块级判定 + 文档指针豁免 + 真常量白名单 + 行内尾随注释识别），覆盖 T / P / C / G / R / M / B + UX-R / RG / D / S / W 编号；配套 `scripts/check-orphan-ids.test.mjs`
  - [x] 按子批次清理至孤立命中 0：子批次 0/1 清理 `packages/**` + `scripts/**` 46 行；本批清理 `apps/platform/**` 157 行 + `packages/engine` 2 行（其中旧口径命中 139 行，检测口径扩展后新暴露 20 行，合计 159 行）
  - [x] 批量替换遵守 [AI 协作规范 §1.2 第 6 条](../standards/ai-collaboration.md)（先改代表性文件 → typecheck + diff 审查 → 再铺开）；全批仅注释与测试名文本变更，无运行时逻辑改动
  - [x] 各子批次 `pnpm lint` + `pnpm typecheck` + 定向测试通过，且不丢失编号后的解释正文
  - [x] 复扫证据：`node scripts/check-orphan-ids.mjs` 孤立命中 0（扫描 627 文件）+ 真常量白名单规则保留
- **闭环记录（2026-10-05）**：A 阶段审计发现检测脚本 `PLANNING_ID_RE` 仅匹配 `S-\d`、漏裸 `W\d` / `S\d`，致「0 命中」为假阴性；扩展正则覆盖裸 W / S 编号 + 补回归用例 + 新增「裸 `PR\d+` 不在检测面」边界声明后复扫归零。残余：检测脚本未接入 CI 门禁（当前依赖 D / A 阶段自检），长期防回流另行评估。
- **不做什么**：不清理带文档路径 / 章节名的导航指针（合规例外）；不清理代码内真实常量（HTTP 错误码等）；不改 `docs/` 下的规划与治理文档编号；不在本条目内改动 D / A 阶段自检规则本身。
- **依赖**：关联 M29.9（A 阶段审计触发）+ [开发规范 §3](../standards/development.md) + [经验归档 §十六](../design/governance/experience-archive-§1-§21-spec-compliance.md)（历史违规案例）；关联既有清理先例 commit `1dcfc3c`。
- **交付物**（已闭环）：2 个工具 commit（`43ce253` 检测脚本与用例 / `9bfcf2c` 裸 W / S 覆盖增强）+ 9 个清理 commit（`4dc64a1` packages 与 scripts / `37f3bde` engine / `d1ad890` / `bf332c7` / `63ae9cf` / `d096d5e` / `c2644cc` / `eaed2f9` / `04bcfff` platform）；每 commit ≤ 10 文件。
- **风险与缓解**：批量删除编号丢失可追溯性；缓解：优先「改写为导航指针」而非纯删除，保留编号后的解释正文；另防批量替换误伤（按 §1.2 第 6 条纪律执行）。

#### M36.2 [P3 📚 文档治理] 设计与索引文档同类陈旧状态清理（存量）

- **目标**：消除 `docs/` 中与 M31.5（PrimeVue 全链卸载）及 M25.2a / M26.1 实施结果不一致的同类残留陈述（M34.5 只处理了索引 `:25` + `architecture.md` 现行陈述）。
- **优先级**：P3。
- **范围**（2026-10-02 实测）：
  - `docs/design/governance/index.md:23` + `docs/i18n/en-US/design/governance/index.md:23`（`platform-ai-integration` 仍标「设计先行稿 / 未上收」，而 M25.2a 基础层 + M26.1 应用层已落地）
  - `docs/design/governance/index.md:24` + en 镜像 `:24`（`docs-and-readme-i18n` 仍标「未上收」，而 `docs/i18n/en-US/**` 已存在）
  - `docs/design/governance/platform-ai-integration.md:366`（PrimeVue DataTable）+ en 镜像 `:274`（ToggleSwitch）/ `:281`（Select）/ `:289`（PrimeVue DataTable）
  - `docs/design/governance/docs-and-readme-i18n.md:542`（状态口径「未上收」）
- **验收标准**：
  - [ ] 逐条与「M31.5 卸载 + M25.2a / M26.1 实施结果」对齐，每条先 commit / 代码 / 现存文件三重实证再落笔
  - [ ] `pnpm run check:docs` EXIT 0
  - [ ] `pnpm docs:check:i18n` 通过 + `pnpm lint:md` 通过
  - [ ] zh-CN / en-US 两侧**行数与链接级**一致（M34.5 审计 RG-W1 教训：仅行数相等不足以证明镜像等价）
- **不做什么**：不改写历史归档段与设计稿历史正文；不处理已归档文档（`docs/plan/archive/**` / `experience-archive*`）；不把「未上收」机械改写为「已实施」——每条须先实证实施状态。
- **依赖**：M34.5（已处理索引 `:25` + `architecture.md`）；backlog §候选评估中条目；A 阶段审计 `suggest`（`artifacts/review-gate/2026-10-01-m34.5-primeui-status.md`，gitignored）。
- **交付物**：预计 2–3 commits（索引 + 设计稿 + 文档状态口径）；files 清单见范围。
- **风险与缓解**：批量改写状态描述易误判「未上收 vs 已实施」；缓解：每条先以 commit / 代码 / 现存文件三重实证，再落笔。

#### M36.3 [P2 🛡️ 技术债] BatchRun 写回非原子竞态收敛

- **目标**：把详情 GET 与 sync 批量执行尾部的「读内存态 → 整行 `save()`」改为条件更新（或把条件写回下沉共享层），消除 admin `force-fail` 并发窗口内把库中 `failed` 回写成 `completed` + `finishedAt` 的竞态（对账只扫 `running`，一旦错标永久无法纠正）。
- **优先级**：P2。
- **范围**：`apps/platform/server/api/batch-runs/[id].get.ts`（`:47` 现为 `batchRepo.save(batchRun)`）+ sync 批量执行尾部（`apps/platform/server/services/batch/`）+ 共享写回层 `apps/platform/server/services/batch/batch-writeback.ts`；回归用例 `[id].get.test.ts` + 新增并发交错用例。
- **验收标准**：
  - [ ] 三处写回统一为条件更新（`update({ id, status: ... }, …)`）或把条件写回下沉共享层
  - [ ] 补并发回归用例（`force-fail` 与 GET / sync 交错，断言不覆盖 `failed` 终态）
  - [ ] 保持 GET「对非 running 批次仍对齐计数」既有契约（`[id].get.test.ts` 断言 failed 批次 counts 会被写回）
  - [ ] `pnpm --filter @dependfix/platform run typecheck` exit 0 + 定向 vitest 全过
- **不做什么**：不改变 `force-fail` 语义；不引入悲观锁（SQLite 支持有限）；不改详情接口返回结构。
- **依赖**：M35.1 / M35.2（共享写回 `applyBatchAggregation` 已落地）；M35.1 A 阶段 RG-W01R 登记。
- **交付物**：预计 2–3 commits（写回层 + 接线 + 用例）；files 清单见范围。
- **风险与缓解**：窄竞态、需 admin 同时操作，触发概率低；缓解：条件写回 + 并发用例锁定行为边界。

#### M36.4 [P3 🚀 可观测性] 告警源「未启用 + 其余源全失败」判据修正

- **目标**：把「全部源失败才抛错」的判据从 `failedSources.length === totalSources` 改为「无任何成功源且存在失败源」（或按 attempted 源数判定），消除「1 源未启用 + 其余源全失败」时仓库以 0 告警「成功」写入 `repoResults` 的偏乐观粒度。
- **优先级**：P3。
- **范围**：`packages/engine/src/app/repo-alerts.ts`（`:90-97` 判据）+ 报告生成侧「扫描成功」语义（`packages/engine/src/report*`）+ 现有 `packages/engine/src/app/repo-alerts.test.ts`（含「1 未启用 + 2 真实失败」N=3 组合用例）。
- **验收标准**：
  - [ ] 判据改为「无任何成功源且存在失败源」或按 attempted 源数判定
  - [ ] 明确并落文档：`repoResults` 写入语义与报告「扫描成功」口径的连锁影响
  - [ ] 现有 N=3 组合用例更新为期望新语义（含 1 未启用 + 其余全失败 → 仓库失败）
  - [ ] `pnpm --filter @dependfix/engine test` 全过 + `pnpm lint` / `pnpm typecheck` 0 error
- **不做什么**：不改退出码语义（失败信号已完整暴露在 `RunResult.errors` + exitCode + 报告 errors 段）；不改 A/B/C 分层结构。
- **依赖**：C78（M29.5 `6fd6aad` / `cb241bf` / `b801cef`）+ C89（M32.3 `00a11ff`，Code Scanning / Code Quality 纳入同口径）的历史形态说明；backlog §已知边界条目（M36 启动批次已上收移除）。
- **交付物**：预计 2 commits（判据 + 语义文档 / 测试）；files 清单见范围。
- **风险与缓解**：改动影响仓库级成功率与报告语义；缓解：锁定 N=3 组合用例 + 保留 `RunResult.errors` 完整信号。

#### M36.5 [P3 🧪 测试基建] api-i18n「重复仓库」用例顺序偶发定位与治理

- **目标**：定位 `api-i18n.e2e.test.ts` 的「重复仓库」三例在全量顺序运行下偶发语言断言失败（期望英文返回中文）的前置状态依赖，消除顺序偶发。
- **优先级**：P3。
- **范围**：`apps/platform/tests/e2e/api-i18n.e2e.test.ts`（`:61` zh / `:88` en / `:116` cookie 优先三例）+ 可能的前置 seed / 清理（`apps/platform/tests/e2e/` fixtures）。
- **验收标准**：
  - [ ] 定位前置状态依赖（是否被其它用例先行创建同名仓库从而走到不同错误分支）
  - [ ] 补前置清理或显式 seed，消除顺序偶发
  - [ ] `pnpm --filter @dependfix/platform test:e2e` 全量连跑两遍全绿（`--workers=1`）
  - [ ] 单文件运行 7/7 通过不回归
- **不做什么**：不改 i18n 解析逻辑；不改用例断言语义（除非确认是测试隔离缺陷）。
- **依赖**：M34.2 会话内 2/3 复现记录；backlog §已知边界条目；[AI 协作规范 §4.7 CI 偶发错误三阶段协议](../standards/ai-collaboration.md)。
- **交付物**：预计 1–2 commits（定位证据 + 隔离修复）；files 清单见范围。
- **风险与缓解**：偶发难以复现；缓解：先按 §4.7 三阶段协议取证，必要时加确定性 seed。

#### M36.6 [P2 🛡️ 技术债] dependfix-platform 镜像体积治理（去除冗余 node_modules 打包）

- **目标**：移除 runtime 阶段冗余的根 `node_modules` / workspace `dist` / `packages/skills` 复制，使镜像回归 Nuxt `.output`-only 形态（对齐 momei / caomei-auth），同时保持容器内执行链路（`DependfixApp` 程序化路径）可用；并让 `docker-compose` 默认拉取已发布镜像（本地构建改为可选覆盖文件）、新增 `PUID`/`PGID` 控制数据卷与 `$HOME` 所有权（对 root 身份 fail-closed）。
- **优先级**：P2（1.1GB 镜像显著影响分发 / 拉取 / 冷启动成本；非功能阻塞）。
- **范围**：`apps/platform/Dockerfile`（`docker-minifier` / runtime 阶段）+ `apps/platform/docker-compose.yml` / `apps/platform/docker-compose.build.yml`（默认拉取已发布镜像、本地构建改为可选）+ `apps/platform/docker/entrypoint.sh`（PUID/PGID 权限控制）；关联文档口径 `docs/standards/platform.md` + `docs/design/governance/executor-sandbox.md` + `docs/guide/quick-start.md`。
- **验收标准**（2026-10-02 已全部实证）：
  - [x] runtime 不再复制 `/app/node_modules`、`packages/*/node_modules`、`packages/*/dist`、`packages/skills`
  - [x] 镜像体积显著下降：实测 **1.1GB → 239MB**（`docker images`）
  - [x] 容器内工具链可用：`node v24.18.1` / `git 2.54.0` / `pnpm 11.18.0` / `unzip` / `su-exec` 全部存在
  - [x] 容器启动 HTTP 冒烟 `GET /` → 200 且 PID1 非 root（`dependfi` uid 100）；SQLite `journal_mode=wal` PRAGMA 生效（原生 better-sqlite3 由 `.output` 提供）
  - [x] `.output` 自包含证据：`.output/server/package.json` 声明依赖 166/166 目录命中、0 处外部 `@dependfix` import、`DependfixApp` / `fromPat` 已打包进 `.output/server/chunks`
  - [x] `check:docs` EXIT 0 / `lint-md` 通过 / `docs:build` EXIT 0（审计方补跑）/ Dockerfile orphan-ID 手工正则扫描 0 命中（T801/C38 编号已改写为文档指针；`check-orphan-ids.mjs` 的 `SCAN_EXTENSIONS` 未覆盖无扩展名 `Dockerfile`，见 A 阶段 RG-S1）
  - [x] docker-compose 默认使用已发布镜像（`image:`，不再本地 `build:`）；本地构建经 `docker-compose.build.yml` 覆盖文件显式开启（`docker compose config` 校验通过）
  - [x] entrypoint 支持 PUID/PGID：实测 `PUID=1001/PGID=1001` → PID1 `Uid/Gid=1001`、`/app/data` 与 `/home/dependfix` 归属 1001、HTTP 200；`PUID=100/PGID=101` → Uid 100 / Gid 101；无 env 默认 uid 100/gid 101；`user:` 非 root 分支直接执行并 warn `$HOME` 可写性
  - [x] 非 root 基线 fail-closed：`PUID=0`/`00`/`0x0`/`-1`、`PGID=0`、32 位回绕（`4294967296`/`8589934592`）、`uid_t -1`（`4294967295`）、超范围巨值均拒绝启动（`awk` 范围校验 `1..4294967294`，exit 1 + 明确报错）
  - [x] chown 作用域收敛：`DATA_DIR=//` / `DATA_DIR=/app/data/../..` / `HOME=//` 经 canonicalize 判根拒绝；符号链接指向根（TOCTOU 向量）解链后拒绝；默认仅允许 `/app`、`/home` 下（`DEPENDFIX_ALLOW_ANY_DIR=1` 可放开，但根路径仍硬拒绝）；chown 直接作用于 canonical 路径
- **不做什么**：不改基础镜像 digest（可复现性基线）；不改容器内执行器业务代码；不新增镜像构建阶段；不改变非 root 降权基线本身（仅扩展 PUID/PGID 支持并对其 fail-closed）。
- **§3.4 三重交叉核验**（属「用户直接决策」路径）：
  - ① **todo-archive 表格扫描**：`rg -n "镜像体积|镜像大小|node_modules 打包|Dockerfile" docs/plan/todo-archive.md docs/plan/archive/todo-archive-phases-*.md` 命中 T601 平台骨架 / C38 非 root 降权 / T801（**为补齐 node_modules**，与本次移除目标相反）等，**均非镜像优化方向，无既有优化条目**。
  - ② **git log 历史核验**：`git log --oneline -- apps/platform/Dockerfile` 最近为 `d84ced1`（T801 打包 node_modules）/ `eb8f3c5`（C38 非 root）/ `8a24810`（arm64 SIGILL 复制完整依赖布局），均为「加依赖」方向；`git log --all --grep="镜像体积"` 为空，**无重复优化 commit**。
  - ③ **代码侧 anchor 实证**：`git show HEAD:apps/platform/Dockerfile` 确认变更前确含冗余拷贝（`/app/node_modules` + `packages/*/node_modules` + `packages/*/dist` + `packages/skills`），与候选描述一致。
  - 结论：**0 项重复评估**，可进入 D 阶段。
- **依赖**：2026-10-02 用户直接指令（属 [规划规范 §3.4](../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估教训--2026-09-10)「用户直接决策」路径，非 backlog 候选）；[executor-sandbox.md §7.2](../design/governance/executor-sandbox.md#72-镜像策略)。
- **交付物**：2 commits（① 镜像瘦身 + 文档口径 + 计划登记；② docker-compose 默认拉镜像 + PUID/PGID 权限控制 + entrypoint）。
- **风险与缓解**：`.output` 若缺运行时依赖 → 容器启动 500；缓解：构建后镜像内依赖完整性（166/166）+ HTTP 冒烟 + 原生模块 PRAGMA 实证；sandbox 未来独立执行入口曾依赖 workspace `node_modules` 的假设已移除并在设计文档登记自包含要求。
- **残余风险（A 阶段 RG-W2，2026-10-02）**：容器内执行链路「可用」以**静态 + 启动实证**闭合（引擎打包 / 依赖 166/166 / HTTP 200 / SQLite PRAGMA），未在新镜像内实跑一次 `DependfixApp.run()` 全链路（需真实 GitHub 凭据；T801 旧镜像实证不可复用）；静态证据判定风险低，留待 sandbox / 真实扫描场景补跑。

#### M36.7 [P2 🛡️ 技术债] pnpm overrides key 语义归一化（消除 `pkg@^1` / `pkg@1` 重复写法）

- **目标**：修复依赖升级写 `pnpm-workspace.yaml#overrides`（及 `package.json#pnpm.overrides`）时同一 selector 并存两种写法——已有 `brace-expansion@^1: ^1.1.16` 时又新增 `brace-expansion@1: ^1.1.21`（用户报告 nuxt-latest-template#298）。生成侧与写入侧按**语义归一化 key** 比对，命中已有等价写法时复用，只保留一种。
- **优先级**：P2（不阻断修复链路，但产生冗余 / 可能冲突的 override 配置，影响配置整洁与人工 review）。
- **范围**：新增 `packages/engine/src/fixers/dependency/override-key.ts`（`normalizeOverrideSelector` / `normalizeOverrideKey` / `upsertOverride`）；`fixers/dependency/index.ts`（`applyVersionedOverrides` 改用 upsert + 回滚 `writtenKeys`）；`app/helpers.ts`（`buildVersionedOverrides` 等价 key 检测 + `resolveWriteKey`）；测试 3 文件；`docs/design/modules/dependency-fixer.md §12.3` 口径。
- **验收标准**（2026-10-02 已全部实证）：
  - [x] 复现用例：已有 `{@^1: ^1.1.16, @^5: ^5.0.8}` + 多 major lockfile（1.x/2.x/5.x）+ 推荐 1.1.21/2.1.7/5.0.12 → 输出 `{@^1: ^1.1.21, @2: ^2.1.7, @^5: ^5.0.12}`，**无 `@1` / `@5`**
  - [x] 归一化只收敛可证明等价的等价类（`1`/`^1`/`1.x`/`1.x.x`/`^1.0`/`^1.0.0`）；`~1`、`^1.2`、精确版本、major-0 caret（`^0.0` ≠ `^0`）保持区分
  - [x] 写入侧 `upsertOverride` 复用已有等价写法；install 失败回滚不残留（含同批等价 key 场景）
  - [x] engine 全量 63 files / 1195 passed | 1 skipped；root typecheck exit 0；root lint exit 0
- **不做什么**：不改跨 major 保护语义；不改路径级 key 生成（`parent>child` 无 selector，非本缺陷形态）；不引入 `semver` 依赖（自实现聚焦等价类）。
- **依赖**：用户报告 [nuxt-latest-template#298](https://github.com/CaoMeiYouRen/nuxt-latest-template/pull/298)（属 [规划规范 §3.4](../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估教训--2026-09-10)「用户直接决策」路径）；`docs/design/modules/dependency-fixer.md §12.3`。
- **§3.4 三重交叉核验**（属「用户直接决策」路径）：
  - ① **todo-archive 表格扫描**：`rg -n "overrides 归一|override key 归一|brace-expansion@|pkg@major" docs/plan/todo-archive.md docs/plan/archive/todo-archive-phases-*.md` **无命中**，无既有闭环条目。
  - ② **git log 历史核验**：`git log --oneline -- packages/engine/src/app/helpers.ts` 最近为 `4ed008e`/`9226ddd`/`61acfae`/`e8e5f32`/`4e04090`（路径级 override 等，均非 key 归一化）；无重复修复 commit。
  - ③ **代码侧 anchor 实证**：`git show HEAD:packages/engine/src/app/helpers.ts` 确认变更前为精确字符串 key 比对（`:207` `existingOverrides[<pkg>@<major>]` / `:210` `existingOverrides[<key>]`），`index.ts:446/458` 为精确 key 写入——即 `pkg@^1` 与 `pkg@1` 被判为不同 key。
  - 结论：**0 项重复评估**，可进入 D 阶段。
- **交付物**：1 commit（override-key + 接线 + 测试 + 设计口径）。
- **风险与缓解**：归一化过度合并会误改 selector 作用域；缓解：仅收敛可证明等价的等价类 + major-0 caret 守卫 + A 阶段用 node-semver 交叉核对；保守欠合并（`^0` ↔ `0` 等罕用形态不合并）为安全方向，已登记为已知边界。
- **残余风险**：`^0` ↔ `0` 等罕用等价形态保守欠合并（可能仍存同类重复写法，但不会产生错误 selector 作用域）；历史遗留的重复 key 不会自动清理（仅阻止新增）。

#### M36.8 [P1 🛡️ 缺陷修复 / 🎨 体验] Docker 首次启动数据库初始化 + 一键初始化脚本 + 部署文档

- **目标**：全新部署（空库）首次启动即可自动建表并可用，消除「启动即 `no such table`」；补齐 Docker 部署使用文档；澄清 `db-migrate` 手动初始化口径并新增一键初始化脚本。
- **优先级**：P1（用户报告 Docker 镜像首次启动即报 `no such table: dependfix_scan_run` / `dependfix_organization`，属[规划规范 §3.1 插队例外](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)第 3 类「直接影响可用性的 blocker 级功能缺失」+ §3.4「用户直接决策」路径）。
- **根因（2026-10-02 实测）**：
  - R1 表层：全新库零表，Docker 未开启迁移（`DATABASE_MIGRATIONS_RUN` unset → 默认 false）。
  - R2 深层（关键）：迁移链**无法自举**——无基线迁移创建全部 13 张业务表；空库实测 `pnpm db:migrate` 在首个有效迁移报 `SqliteError: no such table: dependfix_scan_result`。故仅打开 `DATABASE_MIGRATIONS_RUN=true` 仍会失败。
  - R3：`db:migrate` 文档只描述「手动执行 pending migration」，未覆盖全新库初始化；Docker 部署无独立文档。
  - R4：早期迁移表名处理不统一（4 个硬编码前缀 + 3 个硬编码无前缀）→ 非默认前缀下静默 no-op（backlog §已知边界）。
- **范围**：新增 `apps/platform/server/database/migrations/1600000000000-CreateInitialSchema.ts`（实体元数据运行时生成）+ `migration-helpers.ts`（前缀感知表名 / 列守卫）；存量 8 个早期迁移（`1700000000000` / `1750000000000` / `1800000000000` / `1800000000001` / `1800000000002` / `1900000000000` / `2000000000000` / `2100000000000`）统一改幂等 + 前缀感知；`server/database/index.ts` 注册基线迁移；`apps/platform/docker-compose.yml` 默认 `DATABASE_MIGRATIONS_RUN=true`；新增 `db:init` 脚本 + Docker 宿主初始化脚本；新增 `docs/guide/deployment.md`（+ `docs/i18n/en-US/guide/deployment.md`）+ nav/sidebar 接线；`server/database/scripts/README.md` / `.env.example` / `docs/guide/quick-start.md` / `docs/guide/configuration.md` 口径同步。
- **验收标准**（2026-10-02 D 阶段已全部实证）：
  - [x] 全新空库 `pnpm db:migrate` 成功创建 13 张业务表（含索引 / FK），二次执行幂等（0 条待执行）
  - [x] 存量库（默认前缀）跑迁移链 no-op（不报错、不改 schema，数据行数不变）
  - [x] `DATABASE_MIGRATIONS_RUN=true` 空库生产 `.output` 启动后 `GET /` 200 + `GET /api/auth/get-session` 200 且日志无 `no such table`
  - [x] 自定义 `DATABASE_ENTITY_PREFIX=myapp_` 下基线 + 增量迁移均生效（13 张 `myapp_` 表、0 张 `dependfix_` 误建）
  - [x] Docker compose 默认自动迁移（`docker compose config` → `DATABASE_MIGRATIONS_RUN: "true"`）；首次启动无需额外手动步骤
  - [x] 一键初始化脚本可用：源码 `pnpm db:init`（幂等，输出迁移条数 + 业务表数初始化摘要）+ Docker 宿主 `docker/init-db.sh`（一次性容器，`DEPENDFIX_MIGRATIONS_ONLY=true` 迁移后退出）
  - [x] `docs/guide/deployment.md` 覆盖镜像拉取 / 核心 env / 数据卷与权限 / 首次启动 / 手动初始化 / 升级 / 备份恢复 / 故障排查；zh / en-US 链接级一致 + nav/sidebar 接线
  - [x] `pnpm lint` / `pnpm typecheck` / 平台 vitest（107 files / 1392 passed | 7 skipped）/ `pnpm run check:docs`（links 146）/ `pnpm docs:check:i18n` / `pnpm lint:md` 通过
- **不做什么**：不排期非 SQLite 后端（MySQL / PostgreSQL）的生产启用；不做 Postgres 多写者迁移；不改业务表结构；不删除历史迁移文件（保留名称与记录，仅加幂等 + 前缀感知守卫）；不改变 `force-fail` / 事务语义。
- **依赖**：用户报告 Docker 首次启动缺陷（直接指令）；backlog §apps/platform 早期 migration 表名前缀不统一（触发条件 ③ 已满足）；[development.md §5.1.19](../standards/development.md) + [platform.md §3.3](../standards/platform.md)。
- **§3.4 三重交叉核验**（属「用户直接决策 + 插队例外」路径）：
  - ① **todo-archive 表格扫描**：`rg -n "首次启动|基线迁移|CreateInitialSchema|db:init|一键初始化|deployment\.md" docs/plan/todo-archive.md docs/plan/archive/*.md` 仅命中 M22.4 `setupMemoryDatabase` 适配（synchronize opt-in 的测试适配，非基线迁移），**无既有关闭条目**。
  - ② **git log 历史核验**：`git log --oneline -- apps/platform/server/database/migrations/` 全部为增量迁移（audit_event / scan_result / pr_check / ai_config / owner_login / verify_commands），**无基线迁移 commit**；`git log --all --grep="迁移链|基线迁移|一键初始化|首次启动"` 无命中。
  - ③ **代码侧 anchor 实证**：`ls apps/platform/server/database/migrations/` 确认无 16xxxxxxxxx / initial / baseline 文件；`apps/platform/docker-compose.yml` 无 `DATABASE_MIGRATIONS_RUN`；空库实测 `pnpm db:migrate` 复现 `no such table`。
  - 结论：**0 项重复评估**，可进入 D 阶段。
- **交付物**：约 4–6 commits（① 基线迁移 + 增量幂等守卫 + 测试；② Docker 默认自动迁移 + 一键初始化脚本；③ 部署文档 + 口径同步；④ 计划登记）。
- **风险与缓解**：基线由实体元数据生成 → 未来实体变更会改变「全新库基线」形态；缓解：基线幂等 + 全部增量迁移守卫 + 约定新增列必须走新迁移；存量库以 `hasTable` no-op 保证零破坏。Docker 默认自动迁移对存量部署的影响：仅补 pending（存量已记录迁移不重跑），可 `DATABASE_MIGRATIONS_RUN=false` 关闭。
- **残余风险（A 阶段审计登记）**：
  - 元数据基线使「新增实体列忘记写迁移」在全新库/CI 自动带上该列（全绿）而存量生产库永久缺列——本批以「基线幂等 + 增量守卫 + 约定新增列走新迁移」缓解，未加自动守护；已记入 platform.md §3.3 口径。
  - `migration-helpers.createIndexIfMissing` 的去重只看索引名与列集合，未含 `unique` / `where`；当前用法均为普通索引，未来复用于唯一 / 部分索引需扩展。
  - 增量迁移的 raw `CREATE INDEX IF NOT EXISTS` 沿用项目既有 SQLite / PostgreSQL 语法（MySQL 不支持该子句）；本批不排期 MySQL 全新部署，基线本身经 `Table.create` 方言感知。
  - 迁移专用模式 `DEPENDFIX_MIGRATIONS_ONLY=true` 会初始化后退出进程；仅 `docker/init-db.sh` 注入，勿用于常规部署。
- **第二轮（2026-10-03 用户报告：拉取最新镜像后仍 `no such table` / 注册失败 Server Error）**：
  - **根因**：镜像本身不内置迁移默认值，首次启动依赖部署侧 compose 注入 `DATABASE_MIGRATIONS_RUN`。用户使用的 compose 未注入（日志 `migrationsRun=false (DATABASE_MIGRATIONS_RUN=unset)`）→ 0 张业务表 → 首次请求报 `no such table`。同批镜像已含启动引导插件（日志出现 `启动期初始化完成`），但 `migrationsRun=false` 使其只初始化空库。`.output` 实测复现：不注入 env → 0 表 + `GET /api/auth/get-session` 500 + 9 处 `no such table`。
  - **修复**：① `Dockerfile` 运行时 `ENV DATABASE_MIGRATIONS_RUN=true`（镜像级默认：`docker run` / 旧 compose 也自动建表，可用 `-e …=false` 覆盖）；② 新增 `docker/smoke-test.sh` 镜像冒烟（不注入 env 首启 → 日志 `migrationsRun=true` + HTTP 200 + 13 张业务表 + 无 `no such table`；并验证 migrate-only 一次性容器 exit 0）；③ `docker.yml` 推送前以 amd64 本地镜像跑冒烟作为发布门禁；④ 新增 `schema-guard.isEmptySqliteDatabase` + `warnIfSchemaMissing`：空库且未开迁移时启动 `console.error` 明确告警；⑤ 部署文档同步镜像级默认与故障排查。
  - **验收标准（第二轮，2026-10-03 已全部实证）**：
    - [x] 镜像冒烟通过：不注入 `DATABASE_MIGRATIONS_RUN` 首启 `/` 200 + `/api/auth/get-session` 200 + 13 张业务表 + 0 处 `no such table`（`SMOKE_IMAGE=dependfix-smoke:local sh apps/platform/docker/smoke-test.sh` → PASS）
    - [x] 迁移专用模式一次性容器 exit 0 且建 13 张业务表（同一冒烟脚本场景 2）
    - [x] 空库 + 未开迁移启动出现明确告警（`warnIfSchemaMissing` 已接线；`schema-guard.isEmptySqliteDatabase` 判据 5 用例覆盖）
    - [x] `docker.yml` 冒烟步骤先于镜像推送（YAML 解析通过；步骤顺序 build-load → smoke → push）
    - [x] 平台 vitest `server/database` 186 passed；平台 lint / typecheck exit 0；`check:docs`（links 146）/ `lint:md` / `docs:check:i18n` 通过
  - **不做什么**：不改应用源码默认 `migrationsRun=false`（非 Docker 仍 opt-in）；不引入运行期自动 synchronize。

#### M36.9 [P1 🛡️ 缺陷修复] 扫描队列孤儿 job 释放 + pending 排队误杀修正

- **目标**：修复「扫描超时 / 卡死被 stale cleanup 判孤后，重新触发被 `SCAN_PENDING_MERGED` 永久合并」与「串行队列中合法排队的 pending run 被误判孤儿」两处缺陷，使 DB 孤儿收尾与 BullMQ 去重键释放联动。
- **优先级**：P1（用户报告：超时任务失败后重新触发即报「已有进行中的扫描任务」并失败，属[规划规范 §3.1 插队例外](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)第 3 类「直接影响可用性的 blocker 级功能缺失」+ §3.4「用户直接决策」路径）。
- **根因（2026-10-03 排查）**：
  - R1 表层：`stale-cleanup` 只把 DB `ScanRun` 置 `failed (orphan_run)`，从不触碰 `scan-<repositoryId>` 的 BullMQ job；`scan-queue.add` 仅对 `completed/failed` 终态释放去重键，`waiting/active` 一律 `reused=true` → 新建 pending run 被置 `SCAN_PENDING_MERGED`，该仓库被永久占位。
  - R2 触发：worker 崩溃留下 active job（锁过期前无法自愈）；或 `createScanWorker` 默认 `concurrency=1`，批量多仓库时后续 job 长时间 waiting，而 stale cleanup 仅凭 `pending + createdAt>30min` 即判孤 → 误杀合法排队 run（job 仍在 waiting，重试被合并）。
  - R3：`orphan_run` 文案对 running（真超时）与 pending（排队）不区分。
- **范围**：`services/queue/scan-queue.ts` 新增 `remove(repositoryId, expectedRunId?)`（按 run 归属校验）/ `hasLiveJob`；`services/batch/stale-cleanup.ts` 新增 `isPendingOrphan` 回调（查询失败保守跳过）+ 返回 `orphanedRuns`（run 级引用）；`plugins/stale-cleanup.ts` 接线队列感知的 pending 孤儿判定 + 按 run 归属释放孤儿 job；测试同步（`scan-queue` 单测 / `stale-cleanup` 单测 / `stale-cleanup` 插件单测 / `queue-integration` 真实 Redis）。
- **验收标准**：
  - [x] stale cleanup 判孤后按 run 归属释放对应仓库队列去重键，重新触发 `reused=false`（`queue-integration` 真实 Redis：归属匹配释放 / 归属不匹配跳过 / `hasLiveJob` 语义 / active 锁定返回 removed=false）
  - [x] 归属收敛回归：同仓库 run1 孤儿 + 用户重新触发的新 run2 job → 不误删（`scan-queue.test` expectedRunId 不匹配用例）
  - [x] async 模式下 pending 超时但仍有非终态 job → 不误杀（`stale-cleanup.test` `isPendingOrphan=false` 用例）
  - [x] running 超时仍强制 failed，回调不作用于 running（`isPendingOrphan` 仅作用 pending 用例）
  - [x] 队列状态查询失败保守跳过（`isPendingOrphan` 抛错用例）；插件编排 5 用例（async 接线 / sync 降级 / 队列初始化失败 / 清理抛错续跑 / 单 run 释放失败不阻断）
  - [x] 平台 vitest 全量（109 files / 1415 passed | 9 skipped）；`pnpm lint` / `typecheck` exit 0；`nuxt build` 通过；构建产物 runtime smoke（Redis 异步模式下插件首次 run 成功初始化队列，无初始化失败日志）
- **不做什么**：不改 `scan-queue.add` 既有 `waiting/active → reused` 去重语义（合法排队仍合并）；不引入 Worker 回调；不改 pending 与 running 的 `orphan_run` 文案（文案区分登记已知边界）；不改 BatchRun 状态集合。
- **依赖**：用户报告（直接指令）；关联 M35.1（stale-cleanup 补偿机制）/ M7.2（T702 队列基础设施）；`docs/design/governance/platform-scheduled-batch.md`。
- **§3.4 三重交叉核验**（属「用户直接决策 + 插队例外」路径）：
  - ① **todo-archive 表格扫描**：`rg -n "SCAN_PENDING_MERGED|orphan_run|去重键" docs/plan/todo-archive.md docs/plan/archive/*.md` 仅命中 M16.3（code 死代码修复）/ M35.1（BatchRun 对账），无「队列 job 释放」闭环。
  - ② **git log 历史核验**：`git log --oneline -- apps/platform/server/services/queue apps/platform/server/services/batch/stale-cleanup.ts` 无释放 job / pending 误杀修复 commit。
  - ③ **代码侧 anchor 实证**：`scan-queue.ts:79-90` 仅终态释放；`stale-cleanup.ts:53-70` 无队列调用；全仓无 job 释放兜底逻辑。
  - 结论：**0 项重复评估**，可进入 D 阶段。
- **交付物**：1 commit（队列层 + 服务层 + 插件 + 测试 + 计划登记）。
- **风险与缓解**：`remove` 对 active 锁定 job 会抛错并退化为 removed=false（BullMQ `removeJob` 对 locked 返回 0）——仅告警不阻断，锁随 worker 存活续期 / 死亡后过期；实际「活 worker + 超 30min active」在 `withTimeout` 下不可达；缓解：try/catch + 真实 Redis active 锁定用例。释放误删风险由 run 归属校验（`job.data.runId === 孤儿 runId`）收敛，补 `scan-queue` 不匹配用例 + 真实 Redis 不匹配用例。
- **残余风险**：active 锁定 job 本轮释放失败后不再重试（依赖后续触发时 `add` 的终态重建兜底）；`hasLiveJob` 对 `unknown` 状态保守判为 live（宁可漏杀不可误杀）。

#### M36.10 [P1 🛡️ 缺陷修复] 队列模式决策纳入消费者维度（auto 无进程内 worker 时自动降级同步）

- **目标**：让 `QUEUE_ENABLED=auto`（默认）真正「自动降级」——异步队列仅在「Redis 可用且存在消费者」时启用；单容器部署下未启用进程内 worker（`IN_PROCESS_WORKER=false`）时自动降级同步，消除「任务入队后无人消费 → pending 挂起 → 约 30 分钟后 `orphan_run` / 重触发 `SCAN_PENDING_MERGED`」的静默黑洞。
- **优先级**：P1（用户报告 Docker 单容器 `NUXT_IN_PROCESS_WORKER=false` + `NUXT_QUEUE_ENABLED=auto` 时任务永不执行、约 30 分钟后失败，属[规划规范 §3.1 插队例外](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)第 3 类「直接影响可用性的 blocker 级功能缺失」+ §3.4「用户直接决策」路径）。
- **根因（2026-10-04 排查）**：
  - R1 表层：`resolveQueueMode` 只吃 `{ enabled, redisAvailable }`，不含消费者维度；Redis 可用 + auto → async，无论是否有 worker。
  - R2 深层：worker 仅在 `inProcessWorker=true` 时创建，且该判断发生在模式已定 async 之后 → `auto` + Redis 可用 + `IN_PROCESS_WORKER=false` = async 队列零消费者，job 永远 waiting。
  - R3：独立 worker 进程（多容器）当前阶段未实现（SQLite 多写者锁 + 无独立 worker 镜像），故 `IN_PROCESS_WORKER=false` 在单容器下没有任何合法消费者。
  - R4：`queue.service.test` 存在用例 `creates async queue without worker when in-process worker disabled`，把「async 无消费者」固化为已知行为；故障排查文档只覆盖「Redis 不可达」，未覆盖「Redis 可达但无消费者」。
- **范围**：`server/services/queue/queue-mode.ts`（`QueueModeInput` 增 `inProcessWorker` + `resolveQueueMode` 消费者维度降级 + 头注释矩阵）；`server/services/queue/queue.service.ts`（传入 `inProcessWorker` + sync 降级 warn + 强制 async 无 worker warn）；测试 `queue-mode.test.ts` / `queue.service.test.ts`；文档 `.env.example` / `docs/guide/deployment.md`（+ `docs/i18n/en-US/guide/deployment.md`）/ `docs/design/governance/platform-scheduled-batch.md §9`。
- **验收标准**：
  - [ ] `auto` + Redis 可用 + `inProcessWorker=false` → sync（消费者维度自动降级）+ warn
  - [ ] `auto` + Redis 可用 + `inProcessWorker=true` → async（进程内 worker 消费）
  - [ ] `auto` + Redis 不可用 → sync；`QUEUE_ENABLED=false` → sync；`QUEUE_ENABLED=true` + Redis 可用 → async（强制，外部 worker 预留）
  - [ ] 文档同步：`.env.example` / 部署指南（zh + en-US 行级一致）/ 设计文档降级矩阵
  - [ ] `pnpm lint` / `pnpm typecheck` exit 0；平台队列 / 批量 / 调度定向 vitest 全过
- **不做什么**：不实现独立 worker 进程 / 多容器拓扑（PostgreSQL 迁移后排期）；不改 `QUEUE_ENABLED=true` 的强制语义（保留外部 worker 逃生口）；不改 BullMQ 去重与 stale-cleanup 语义（M36.9 已闭环）。
- **依赖**：用户报告（直接指令，2026-10-04）；关联 M36.9（孤儿释放）/ M7.2 T702（队列基础设施）；`docs/design/governance/platform-scheduled-batch.md`。
- **§3.4 三重交叉核验**（属「用户直接决策 + 插队例外」路径）：
  - ① **todo-archive 表格扫描**：`rg -n "inProcessWorker|IN_PROCESS_WORKER|消费者维度|自动降级" docs/plan/todo-archive.md docs/plan/archive/*.md` 仅命中 T702 队列基础设施 / 经验归档 destr 布尔陷阱案例，无「消费者维度降级」闭环。
  - ② **git log 历史核验**：`git log --oneline -- apps/platform/server/services/queue/queue-mode.ts` 无消费者维度决策变更 commit。
  - ③ **代码侧 anchor 实证**：`queue-mode.ts:23-32` `resolveQueueMode` 仅 `{ enabled, redisAvailable }`；`queue.service.ts:75` worker 创建在 async 判定之后；`queue.service.test.ts:86` 固化「async without worker」。
  - 结论：**0 项重复评估**，可进入 D 阶段。
- **交付物**：1 commit（队列模式决策 + 接线 + 测试 + 文档）。
- **风险与缓解**：`auto` 语义变化可能影响依赖「auto 必异步」的自定义部署；缓解：单容器推荐形态本就是 `IN_PROCESS_WORKER=true`（compose 默认），无 worker 的 async 本就是黑洞；多容器外部 worker 拓扑要求显式 `QUEUE_ENABLED=true`（保留逃生口），并在设计文档登记独立 worker 未实现。

---

> **阶段启动批次**（2026-10-02）：本批仅登记规划（`docs/plan/*` + 文档首页口径），按 [AI 协作规范 §1.4 P 阶段规划暂停协议](../standards/ai-collaboration.md#14-p-阶段规划暂停协议user-driven) 提交后暂停，等待用户指令进入 D 阶段。上收候选已按 backlog 维护规则 5 从 [backlog.md](backlog.md) 移除。

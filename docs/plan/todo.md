# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。
>
> **当前阶段：M29 修复交付链路正确性 + 能力扩展（方案 M29-B / 2026-09-21 用户决策）** —— 6 核心候选（C73 / C75 / C77 / C78 / C71 / C72）+ 1 插队 hotfix（docs 依赖链 vite 漏洞，§3.1 例外清单第 2 类）。全部候选已于 P 阶段执行 §3.4 三重交叉核验，**0 项重复评估**。
>
> **P 阶段 §3.4 / §1.7 三重交叉核验实证**（2026-09-21 实测）：
>
> | 候选 | 核验命令 | 结果 |
> |:---|:---|:---|
> | C73 | `rg -n "gpgsign\|GIT_CONFIG_GLOBAL\|GIT_CONFIG_NOSYSTEM" packages/engine/src apps/platform/server --glob '!*.test.ts'` | 0 命中（未落地） |
> | C75 | `sed -n` 读 `helpers.ts:40` + `verification-runner.ts:69` | 两条默认链均为 `install/lint/build`，**无 test**（未落地） |
> | C77 | `rg -n "blacklist\|overrideHistory\|removedOverride" packages/engine/src` | 0 命中（未落地） |
> | C78 | `rg -n "ALERTS_DISABLED\|alerts are disabled\|vulnerability-alerts" packages/engine/src apps/platform/server` | 0 命中（未落地） |
> | C71 | `rg -n "dependencyPath" packages/core/src packages/engine/src apps/platform/server` | 0 命中（未落地） |
> | C72 | `rg -n "archived" importable.get.ts import-repos-dialog.vue` | 字段仅透传展示，**无过滤维度**（未落地） |
> | vite 漏洞 | `pnpm audit --json` | 1 high + 2 moderate 全部落在 `docs>vitepress>vite`（未修复） |
>
> **任务条目计数口径**：§1.1 硬性约束"单个迭代核心任务 5-6 项以内"适用于**核心任务**；M29.1 为 §3.1 例外清单第 2 类插队项（高危漏洞影响 dependfix 自身），非核心任务、不参与核心容量竞争，故 M29 = **6 核心 + 1 插队**。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | 本文件（M29 活跃） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M28 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M28 已归档；M29 规划中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M29 阶段任务清单（方案 M29-B：交付链路正确性 + 能力扩展 + UX）

### M29.1 [P2 🛡️ 插队 hotfix] docs 依赖链 vite 漏洞治理（1 high + 2 moderate）

- **目标**：消除 `pnpm audit` 报出的 1 high + 2 moderate——全部落在 `docs>vitepress>vite` 与 `docs>vitepress>@vitejs/plugin-vue>vite` 路径
- **优先级**：P2（§3.1 插队例外清单第 2 类：GHSA 标识 high 且影响 dependfix 自身；用户 2026-09-21 明确授权并入 M29）
- **范围**：`pnpm-workspace.yaml`（`overrides` 段）+ `pnpm-lock.yaml` +（备选路径）`docs/package.json`
- **验收标准**：
  - [ ] `pnpm audit` 输出 **0 high / 0 moderate**（走方案 A 或 B 时）；若经用户确认走方案 C，则须有决策记录 + [backlog.md §已知边界与 known-issue](backlog.md#已知边界与-known-issue) 登记
  - [ ] `pnpm install --frozen-lockfile` EXIT 0
  - [ ] `pnpm --filter dependfix-docs build` EXIT 0（走方案 A / B 时）
  - [ ] docs 本地 dev 冒烟：首页渲染正常（走方案 A / B 时）
  - [ ] `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不升级 Nuxt / VitePress 之外的无关依赖；不删除既有 overrides 条目；不引入 `pnpm audit` CI 门禁（属 backlog 独立条目）
- **依赖**：无前置；关联 §3.1 插队例外清单第 2 类
- **交付物**：1-2 atomic commits（`fix(deps)` override + lockfile；若走 vitepress 升级路径则为 `chore(docs)`）
- **风险与缓解措施**：
  - **风险 1（核心）**：VitePress 最新稳定版 1.6.4 声明 `vite: ^5.4.14`，而三条 advisory 的 patched 下界分别为 `6.4.2` / `6.4.3` / `6.4.3`（**最严下界 `6.4.3`**）——**vite 5.x 无补丁版本**，修复必然跨越 VitePress 声明的 vite 主版本范围。候选路径：(A) 以路径级 override `vitepress>vite: ^6.4.3` 覆盖（**语义陷阱**：pnpm override 的 `>` 左侧必须是**声明该依赖的包**；`docs/package.json` 未直接声明 `vite`（仅 `vitepress`），故写作 `docs>vite` 不生效——已本地对照实验证伪；如需同时覆盖 `@vitejs/plugin-vue` 边则并列声明 `@vitejs/plugin-vue>vite: ^6.4.3`）；(B) 升级 VitePress 到 `2.0.0-alpha.x`（alpha 稳定性风险）；(C) 风险接受 + 显式登记。**D 阶段首项实测任务**（两项，判据：`pnpm audit` 清零 + `pnpm --filter dependfix-docs build` + docs dev 冒烟）：① 同一 findings 的两条路径（含 `@vitejs/plugin-vue` 边）是否共享同一 vite 实例 / 单条 `vitepress>vite` 是否已覆盖该边；② 路径级 `vitepress>vite` 与既有版本级 override `vite@5: ^5.4.21`（`pnpm-workspace.yaml`）的优先级与实际 lockfile 解析结果。缓解：按 A → B → C 顺序推进，失败即降级下一档，不强行落地
  - **风险 2**：三条 advisory 均属 **dev server 限定**（high 项额外限定 Windows + 显式 `--host` 网络暴露 + 敏感文件位于 `server.fs.allow` 目录）；缓解：在交付说明中如实记录实际暴露面（dependfix docs dev 为本地 / Linux），避免夸大或低估风险
  - **风险 3**：override 可能影响其他消费 vite 的包（`vite@8.3.0` 已装且不受影响；`vite@5.4.21` 受既有版本级 override `vite@5: ^5.4.21` 管辖，与本次路径级 override 存在叠加关系，优先级须实测）；缓解：override 范围限定为 `vitepress>vite`（路径级），不动全局 `vite@5` 条目，冲突时以实测 lockfile 解析结果为准

---

### M29.2 [P2 🛡️ 治本] C73 隔离宿主 git 全局配置对自动 commit 的污染

- **目标**：自动修复链路产生的 commit 不受宿主 git 全局 / 系统配置影响——commit 恒成功，且不会被宿主个人 GPG 签名
- **优先级**：P2（宿主 `commit.gpgsign=true` 且 gpg 不可用（CI / 容器 / 未装 gpg）时直接导致 fix-and-pr 交付失败；同时会把宿主个人 GPG 签名写入被修复的第三方仓库历史）
- **现状实证**（2026-09-21 代码核对 + 最小复现，随 backlog 条目上收内联保留）：non-test 源码 `rg "gpgsign|GIT_CONFIG_GLOBAL|GIT_CONFIG_NOSYSTEM"` **0 命中**（配置隔离仅存在于 `pr-creator.test.ts`）；`stageAndCommit` 仅显式传 `-c user.name` / `-c user.email`（M18.4 W3），未隔离 `commit.gpgsign`。最小复现 ①：宿主 `commit.gpgsign=true` 且 gpg 可用 → commit 成功但带宿主个人签名；最小复现 ②：gpg 程序不可用（模拟 CI / 纯 Linux 容器）→ `gpg failed to sign the data` → `failed to write commit object`，commit 直接失败
- **范围**：`packages/engine/src/github/pr-creator.ts`（`stageAndCommit` / `ensureGitConfig`）+ 共用调用方 `packages/engine/src/app/helpers.ts` + `packages/engine/src/app/index.ts` + 宿主配置泄漏路径 `apps/platform/server/services/executor/container-executor.ts`
- **验收标准**：
  - [ ] 宿主 `commit.gpgsign=true` 且 gpg 可用时，工作区 commit 无签名（`git log --show-signature` 无 Good signature）
  - [ ] 宿主 `gpg.program` 指向不可用程序时，工作区 commit 仍成功
  - [ ] `pr-creator.test.ts` 新增 case 覆盖签名污染场景（沿用既有 `GIT_CONFIG_GLOBAL` 隔离测试范式）
  - [ ] engine + platform 定向测试 + `pnpm lint` + `pnpm typecheck` 通过
- **不做什么**：不改宿主 `~/.gitconfig`；不关闭用户手工 git 操作的签名；不改 push 凭据链路（`http.extraheader` 注入已满足安全要求）；不回溯已产生的 commit
- **依赖**：关联 M18.4 W3（`-c user.name` / `-c user.email` 显式覆盖范式）；关联 C53 状态机 `git commit 失败` 分支；关联 M29.6（同属 overrides / git 配置治理批次）
- **交付物**：1-2 atomic commits（`fix(engine)` 签名污染隔离 + `test(engine)` case）
- **风险与缓解措施**：
  - **风险 1**：方案 B（`GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1`）完全隔离会丢失宿主 `url.*.insteadOf` / 代理 / `core.hooksPath` 等可用配置，导致 clone / push 回归；缓解：默认采用方案 A（`git commit` 显式追加 `-c commit.gpgsign=false`，直击根因且不改变其余宿主配置语义），彻底隔离如需另开评估
  - **风险 2**：宿主 `core.hooksPath` 注入的 hook 仍可能改变 commit 行为；缓解：本次只治理签名污染单一根因，hooks 面留 backlog 观察（避免范围膨胀）

---

### M29.3 [P2 🛡️ 治本] C75 验证命令链纳入 test

- **目标**：交付前验证矩阵能捕获「install / lint / build 通过但测试无法运行或失败」的破坏，避免把坏修复交付成 PR
- **优先级**：P2（已实证会向第三方仓库交付坏 PR；属交付链路正确性缺口）
- **范围**：`packages/engine/src/app/helpers.ts`（主链 `DEFAULT_VERIFY_COMMANDS`）+ `packages/engine/src/runners/verification-runner.ts`（fallback `DEFAULT_COMMANDS`）+ `packages/engine/src/verification/validate-commands.ts`（脚本存在性跳过）+ `docs/design/modules/dependency-fixer.md`（口径同步）
- **验收标准**：
  - [ ] 两条默认链同步纳入 test（顺序与超时策略在文档中明确；或收敛为单一常量以消除副本漂移）
  - [ ] 无 `test` 脚本的仓库优雅跳过（沿用 `validateVerifyCommands` + `SCRIPT_NOT_FOUND` 审计）
  - [ ] 新增 case 复现「ESM-only 依赖破坏 CJS 消费方」场景下验证失败并触发门禁回滚
  - [ ] 报告 / PR body 的 Verification 区展示 test 结果
  - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
- **不做什么**：不改单包级回滚逻辑；不引入 CI 等价全量（coverage / e2e）；不改单命令默认超时
- **依赖**：关联 M29.4（补 test 可减少但不消除 override 复发）；关联 `docs/design/modules/dependency-fixer.md` 已知限制条目；C76（平台侧命令配置暴露，本批不做）
- **交付物**：1-2 atomic commits（`feat(engine)` 命令链 + `test(engine)` case + 文档同步）
- **风险与缓解措施**：
  - **风险 1**：test 链耗时 / 资源放大（单命令超时默认 10 分钟），且目标仓库既有 test 红会把无关失败归因到本次修复；缓解：上收时先在 todo 条目内敲定「顺序（build 前 / 后）」「默认开启 vs opt-in」「既有失败基线」三项决策，必要时先做 opt-in 再转默认
  - **风险 2**：两条链为人工副本，改动易只落一条（漂移）；缓解：优先收敛为单一常量导出，消除双副本

---

### M29.4 [P2 🛡️ 治本] C77 override 曾被人工移除的复发防护

- **目标**：dependfix 不再重复提出「历史上已被人工移除过的 override」，防止同一破坏性覆盖反复交付到被修复仓库
- **优先级**：P2（已实证复发，且破坏会实际交付到第三方仓库）
- **范围**：`packages/engine/src/fixers/dependency/`（override 写入前判定）+ `packages/engine/src/app/repo-fix.ts`（修复流程接入点）+ repo policy 类型与消费侧（方案 B 时）
- **验收标准**：
  - [ ] 复现 #1095 场景：存在该 override 移除历史的仓库，dependfix 不再自动写入同条 override（或产出警示并默认跳过）
  - [ ] 报告 / PR body 记录判定依据（检出移除历史 或 policy 命中）
  - [ ] 对应单测 case（历史检出 / policy 黑名单）覆盖
  - [ ] `pnpm lint` + `pnpm typecheck` + 定向测试通过
- **不做什么**：不自动改写目标仓库历史；不引入新依赖做 lockfile 解析；不做全量 overrides 语义分析
- **依赖**：关联 M29.6（overrides 文件域）；关联 M29.3（补 test 可减少但不消除此类复发）；关联 repo policy 相关规范
- **交付物**：1-3 atomic commits（方案 B 约 policy 类型 + 消费点；方案 A 约 `fixers/dependency/*` + GitHub API 查询层）
- **风险与缓解措施**：
  - **风险 1**：方案 A（GitHub API 查移除历史）启发式判定可能误伤合法升级（曾被移除但本次确实需要）；缓解：默认「警示 + 报告」而非静默跳过，保留人工放行
  - **风险 2**：方案 A 引入 GitHub API 调用成本与限流风险；缓解：优先方案 B（用户显式维护 policy 黑名单，零 API 成本、无误判），方案 A 作为可选增强

---

### M29.5 [P2 🚀 能力扩展] C78 区分 Dependabot alerts「确实未启用」与「获取失败」

- **目标**：alerts 获取失败时能判定根因——仓库**确实未启用** Dependabot alerts（预期状态，单独统计）vs token 权限 / 限流 / 网络**获取失败**（保持错误）；消除当前把「未启用」提示成「token 权限不足」的误导
- **优先级**：P2（影响可用性判定与告警覆盖统计：可用仓库被误报为权限错误并让整轮 run 失败，exitCode 2）
- **范围**：`packages/engine/src/github/errors.ts`（错误分类）+ `dependabot-fetcher.ts`（403 message 判定）+ `packages/engine/src/app/helpers.ts`（三个 alerts hint 函数）+ `packages/engine/src/app/repo-alerts.ts`（`FETCH_FAILED` 记录与 run 失败语义）+ [docs/standards/platform.md](../standards/platform.md)（错误码口径）+ 报告 / 平台展示口径
- **验收标准**：
  - [ ] 未启用仓库（403 + `Dependabot alerts are disabled for this repository.`）与权限失败可区分，报告 / 日志各输出对应准确文案
  - [ ] 单测覆盖三类：未启用（403 + message）/ 权限不足（401 或 403 其他 message）/ 限流（403 + ratelimit 归零）
  - [ ] 未启用仓库的 run 语义按决策点落地，报告单列「未启用」计数
  - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
- **不做什么**：不自动修改目标仓库设置（开启 alerts 需 admin，且属用户决策）；不改 `alertsSource` 默认值；不引入新依赖
- **依赖**：关联 `repo-alerts.ts` 双 token 设计（`alertsToken` 最小权限）；关联 [platform.md](../standards/platform.md)（错误码与提示口径）；关联 [经验归档 §一 外部平台限制先探针验证](../design/governance/experience-archive-§1-§21-spec-compliance.md)（同一 403 通道内不同 message 的细分）
- **交付物**：1-2 atomic commits（`feat(engine)` 错误细分 + `test(engine)` case + 文案 / 报告字段同步）
- **风险与缓解措施**：
  - **风险 1**：`Dependabot alerts are disabled for this repository.` 属**非文档化**行为，未来可能变动；缓解：以 message 匹配为主信号 + 探测端点 `GET /repos/{owner}/{repo}/vulnerability-alerts`（仅 204 可确认「已启用」，404 不得单独作为「未启用」结论）兜底；匹配失败时退回现有 `PERMISSION_DENIED` 语义（不误判为「未启用」）
  - **风险 2**：Code Scanning 存在同类混同（官方文档明确 403 = GitHub Advanced Security 未启用，当前同样落 `PERMISSION_DENIED`）；缓解：上收时直接决定并入 C78 或拆独立候选，避免二次返工

---

### M29.6 [P2 🚀 能力扩展] C71 pnpm overrides 路径级覆盖（`parent>child`）支持

- **目标**：dependfix 引擎识别「通过哪个父包引入」的依赖路径，能写入 pnpm 路径级覆盖 `parent>child`，让修复后 `pnpm audit` 真正清零（而非只写顶层覆盖后告警残留）
- **优先级**：P2（治本有依赖现状实证 —— 当前 `pnpm-workspace.yaml` `overrides` 段**无任何路径级条目**，而 `pnpm audit --json` 报出的缺陷路径形如 `docs>vitepress>@vitejs/plugin-vue>vite`，即「父包链」信息已可得但引擎不消费；且长期影响 dependfix 自身管理 dependfix 仓库的依赖流程。**注**：原 backlog 条目引用的历史实证 commit `f67aea2` 在本仓库不可解析（`git cat-file -t f67aea2` → `Not a valid object name`，2026-09-21 A 阶段审计实证），故改挂当前可复现实证）
- **范围**：`packages/core/src/alerts/index.ts`（`NormalizedSecurityAlert` 新增 `dependencyPath?: string[]`）+ `packages/engine/src/alerts/pnpm-audit-fetcher.ts`（`advisories[].findings[].paths[]` 解析）+ `packages/engine/src/github/dependabot-fetcher.ts` + `packages/engine/src/fixers/dependency/overrides-io.ts`（`writeWorkspaceOverride` 接收路径）+ `packages/engine/src/app/helpers.ts`（`buildVersionedOverrides` 支持 `parent>child`）+ 报告渲染 + `apps/platform/server/entities/scan-result.ts`（schema 影响评估）
- **验收标准**：
  - [ ] **数据格式以实测为准**：`pnpm audit --json`（pnpm 11.17.0 / 11.22.0 实测）顶层键仅 `advisories` + `metadata`——**无 `vulnerabilities`、无 `nodes[].path`**（后者是 `npm audit --json` 形态）；依赖链位于 `advisories[].findings[].paths[]` 且已含完整链（实测样例 `docs>vitepress>@vitejs/plugin-vue>vite`）——fetcher 实现与 fixture 一律按此实测格式编写，不臆造格式
  - [ ] `pnpm audit` 报 transitive 告警且 lockfile 中有 ≥2 个父包传递 → dependfix 推荐 PR 自动包含 ≥1 条路径级覆盖（形如 `parent>child: <version>`）
  - [ ] 修复后 `pnpm audit` 输出 `No known vulnerabilities found`
  - [ ] `pnpm-audit-fetcher.test.ts` + `overrideTransitiveDependency.test.ts` 新增路径级场景 case（实测 `advisories[].findings[].paths[]` 解析 + 路径级 override 写入回滚 + 与既有顶层覆盖协同取 max）
  - [ ] 平台 schema 如需 migration 走 [M22.4 / M22.5](../plan/todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档) 双向 opt-in 流程同步
  - [ ] `pnpm lint` + `pnpm typecheck` + 定向测试通过
- **不做什么**：不引入新依赖（如 `@pnpm/lockfile` 解析器，继续走 `pnpm audit --json` + `pnpm-lock.yaml` 文本解析）；不重写 report schema，只在报告 §4 Repositories / 建议区块展示 `dependencyPath`；不替代或重写 `buildVersionedOverrides` 的 `pkg@major` 语义（路径级与版本级正交，可叠加如 `vite@5>esbuild: ^0.25.0`）
- **依赖**：关联 M29.2（同为 git / 依赖配置治理面）；关联 MCP `pnpm_audit` 工具（M28.4 已落地 RunResult 对齐 5 字段，本任务需决定是否透传 `dependencyPath`）
- **设计文档硬阈值判定**：`dependencyPath` 属**纯可选字段增量**（现有模块功能扩展），按 [spec-and-doc-governance §2.4](../design/governance/spec-and-doc-governance.md) 适用范围仅 4 类（专项设计 / 专项治理 / 重大变更设计 / 新增模块）→ **不触发**硬阈值；若 D 阶段确认需平台 schema migration（实体字段变更 = 数据迁移），则升级为专项设计文档 + `deep` depth 审计
- **交付物**：3-5 atomic commits（按 §1.1 任务粒度约束拆分，每 commit 独立验收点）：
  1. `feat(core)` `NormalizedSecurityAlert.dependencyPath` 可选字段 + 类型单测（验收：既有消费方 typecheck 0 error，字段可选不破坏契约）
  2. `feat(engine)` `pnpm-audit-fetcher` 解析 `advisories[].findings[].paths[]` + fixture case（验收：双格式解析 case 通过）
  3. `feat(engine)` `overrides-io` / `buildVersionedOverrides` 路径级写入 + 与顶层覆盖协同取 max（验收：写入 + 回滚 + 协同 case 通过）
  4. `feat(engine)` 报告 §4 渲染 `dependencyPath` + 断言（验收：报告断言通过）
  5. （如需）`feat(platform)` schema migration 按 M22.4 / M22.5 双 opt-in 流程，独立 commit + 独立 `deep` 审计
- **风险与缓解措施**：
  - **风险 1**：工作量 ~150-200 行跨 core + engine + platform 三层，单 commit 易超硬阈值；缓解：按上述 5 个 commit 拆分，每层独立验收；平台 schema 如需迁移拆独立 commit 并单独走 `deep` 审计（见「设计文档硬阈值判定」）
  - **风险 2**：每条告警都写路径级覆盖会让 PR diff 过大且 pnpm 可能报「过度配置」；缓解：采用「顶层覆盖兜底 + 路径级补丁」策略（与 pnpm 文档「路径级只覆盖特定父包」语义一致），仅当顶层覆盖不生效时才写路径级

---

### M29.7 [P3 🎨 用户体验] C72 批量导入默认过滤 archived 仓库

- **目标**：批量导入对话框默认不展示 archived（已归档）仓库——archived 仓库在 GitHub 上只读，无法接收 push / 无法创建 PR，导入后无法被修复链路处理
- **优先级**：P3（非阻塞；archived 仓库占比通常小；engine 自动发现链路已过滤，仅手动批量导入入口受影响）
- **范围**：`apps/platform/app/components/import-repos-dialog.vue`（第 4 维过滤，方案 A）或 `apps/platform/server/api/repos/importable.get.ts`（后端硬过滤，方案 B）+ i18n `zh-CN.json` / `en-US.json` + `apps/platform/server/api/repos/importable.get.test.ts` + `apps/platform/tests/e2e/batch-import-filters.e2e.test.ts`
- **验收标准**：
  - [ ] 默认视图下 archived 仓库不出现在候选列表（`filteredRepos` 不含 `archived === true`）
  - [ ] 「全选」不勾选 archived 仓库（`selectableFilteredRepos` 已剔除）
  - [ ] 方案 A 切到「含 archived」时 archived 仓库可见；方案 B 明确不提供该视图
  - [ ] `importable.get.test.ts` 新增 case：GitHub 返回含 archived 仓库 → 断言行为符合所选方案
  - [ ] i18n `zh-CN.json` / `en-US.json` 双语键同步（方案 A 新增 filter label）
  - [ ] e2e `batch-import-filters.e2e.test.ts` 同步第 4 维过滤控件断言（方案 A）
  - [ ] `pnpm --filter @dependfix/platform test` + `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不删除后端 `archived` 字段（保留审计 / 展示透明性）；不回溯清理已导入的 archived 仓库；不改动 engine `repository-discovery.ts`（已过滤）；不在本任务内改 MCP `discover_repos`
- **依赖**：无前置；关联 engine `repository-discovery.ts` 已有 archived 剔除口径（口径一致性对齐）；关联 M26.2 C67 importable 单端点重构（`include=owners` / `include=repos` 路由）
- **交付物**：1-2 atomic commits（`feat(platform)` importable archived 默认过滤 + `test(platform)` case + i18n）
- **风险与缓解措施**：
  - **风险 1**：5min TTL `cachedFetch`（key=`repos:${credentialId}:${ownerLogin}`）缓存生效期内可能返回旧口径数据；缓解：缓存为进程内 LRU，重启即失效；如需强一致可评估缓存 key 加过滤版本后缀
  - **风险 2**：`disabled` 仓库与 archived 同类（engine 基础过滤同样剔除、importable 未剔除）却未处理，导致二次返工；缓解：上收时同批评估 `disabled`，一次对齐口径

---

## 类型平衡复核

按 [§1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)：用户体验 ≥ 2 + 技术债 ≥ 1 + 能力扩展 ≥ 1 + 测试覆盖 ≥ 1

- 🛡️ **技术债 / 治本**：3 项（M29.2 C73 + M29.3 C75 + M29.4 C77）+ 插队 1 项（M29.1 vite 漏洞）—— ✅ 满足
- 🚀 **能力扩展**：2 项（M29.5 C78 + M29.6 C71）—— ✅ 满足
- 🎨 **用户体验**：1 项（M29.7 C72）—— ⚠️ 低于建议值 2（候选池中 C76 为 P3 且含远程命令执行面安全决策，C37 前置依赖未闭环，本轮不纳入）
- 🧪 **测试覆盖**：**0 项独立条目** —— ❌ 缺口（M29.2 / M29.3 / M29.5 / M29.6 均在各自交付物内含定向测试补强，但无独立测试治理条目）。**候选池排除理由**：C15（Code Scanning B 类规则真实仓库样本核对第二阶段）虽属验证类，但恢复条件为 CI / staging 具备 `GITHUB_TOKEN` 执行 `sample-collector.mjs`（**环境依赖**，本阶段不可排）；db-restore 审计未采纳 4 项（M22.2 遗留）虽在 backlog 写明恢复条件（脚本被远程 / 容器自动化触发，或补测试成本下降），但当前 `db-restore` 为本地管理员工具、攻击面极低，该恢复触发场景不具现实可达性，故不排入本阶段

---

## 执行顺序建议

1. **M29.1**（插队 hotfix，独立、体积小，先清合规债）
2. **M29.2 C73 → M29.3 C75 → M29.4 C77**（修复交付链路治本三连：commit 身份 → 验证矩阵 → override 复发防护，同属一条交付链路，按上下游顺序）
3. **M29.5 C78**（告警获取错误细分，独立于交付链路）
4. **M29.6 C71**（能力扩展，跨 core + engine + platform，最大条目，放在交付链路治理之后避免与 C77 的 overrides 文件域改动冲突）
5. **M29.7 C72**（UX，平台侧独立，可并行收尾）

> 每条目完成后按 PDTFC+ 独立走 A 阶段审计 + F 阶段提交；跨 ≥ 2 模块（C71）与安全敏感面（C73 / C78）按 [分级审计执行协议](../standards/ai-collaboration.md) 提级审计 depth。

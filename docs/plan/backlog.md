# 待办积压 (Backlog)

> 本文档维护尚未进入正式阶段执行面的统一候选池，按 **长期主线任务** / **周期性回归验证层** / **短期与一次性候选任务** / **已知边界与 known-issue** 四象限区分。当前阶段任务见 [todo.md](todo.md)；已闭环归档见 [todo-archive.md](todo-archive.md)。
>
> **维护规则**：
> 1. 新功能需求、非阻塞优化与长期治理事项优先写入本文件，而不是直接写入 `todo.md`；已闭环条目从 backlog 移除，由 [todo-archive.md](todo-archive.md) 统一维护。
> 2. backlog 必须区分四类：长期主线（可跨阶段保留）/ 周期性回归验证层（健康检查层）/ 短期与一次性候选（评估后上收或关闭）/ 已知边界与 known-issue（CI / 浏览器兼容性等持续观察项）。
> 3. 长期主线被某阶段抽取后不删除主线卡片，只补记当前状态与下一次可切片方向。
> 4. 周期性回归验证层不是"一个任务"，而是所有长期主线的健康检查层；它按固定节奏运行，不参与阶段切片容量竞争。
> 5. 短期候选正式上收阶段后从 backlog 移除；评估为"暂不实现"的候选直接关闭并在归档中保留决策记录。
> 6. 当前仓库的 backlog 以中文为唯一事实源。

## 长期主线任务（可跨阶段保留）

> **状态口径**：进行中 / 观察中 / 暂停 / 已关闭。

### 主线 #1：PrimeVue 4 + Nuxt hydration rowGroup known-issue

- **目标**：闭环 PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧导致的 2 个 alerts-rowgroup.e2e `.fixme` 标记，恢复 rowGroup 真实环境跑通（不依赖 `page.reload()`）。
- **状态**：暂停。
- **当前状态**：2 个 alerts-rowgroup.e2e.test.ts 测试以 `test.fixme()` 标记并加 known-issue 注释（命名空间 `known-issue/primevue-hydration-rowgroup`）。PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧——onMounted 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染；`page.reload()` 后能渲染可佐证非业务逻辑问题。
- **修复路径（候选）**：
  1. 迁移 alerts 加载到 `useAsyncData` 让 SSR 阶段就有数据（最低成本）
  2. 升级 PrimeVue 到修复版本（监控 PrimeVue 4 changelog）
- **下一次可切片方向**（任一触发时重新评估）：同修复路径（候选）；若上游修复版本迟迟未发布且 useAsyncData 迁移遇阻（如 SSR fetch 与 client fetch 数据一致性、CSRF token 刷新等），可考虑降级方案——把 alerts 列表改为非 rowGroup 视图（避免 hydration 状态机分歧）
- **验收**：alerts-rowgroup.e2e rowGroup 2 个测试取消 `.fixme` 恢复真跑；本机实测 + CI run 双绿（具体判定：本机 `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup.spec.ts` 2 个 rowGroup 测试连续 3 次通过 + CI `Test` job alerts-rowgroup.spec.ts 0 failed + 已知 issue `known-issue/primevue-hydration-rowgroup` 命名空间搜索结果为空）

### 主线 #2：network-audit 默认白名单持续扩展问题（G1）

- **目标**：把 network-audit 默认白名单从"按次新增"演进为"按域名 / SRI 哈希 / 输出区分"的可持续治理方案，避免每次构建工具跨 major 升级都需补白名单。
- **状态**：观察中。
- **当前进度**：候选方向 3（命令输出 URL 与真实外联区分）已落地——verification 子进程默认注入 telemetry 禁用变量，verification-runner 命令输出 URL 提取不再 addViolation，仅入 `networkAudit` entries 备查。整体治本阶段未完成。
- **下一次可切片方向**（任一触发时重新评估）：
  1. 构建工具生态文档站类目预置白名单（rolldown.rs / swc.rs / rust-lang.org 等）—— **候选方向 3 落地后优先级降低**：合法外联不会再被误判，新增白名单诉求应转为"真实注册表域"申请而非"构建工具文档站"
  2. 按 SRI 哈希钉资源（推荐域动态发现）
- **验收**：默认白名单不再按次新增；verification 阶段合法外联不被误判（已达成）；主线 1+2 候选方向任一实施或主线整体评估为长期保留后关闭 `docs/plan/backlog.md` G1 条目

## 周期性回归验证层

> **定位**：本层不是"一个任务"，而是所有长期主线的健康检查层。它不产生直接改进，只验证"没有回退"。按固定节奏执行，不参与阶段切片容量竞争。

### 固定执行入口（当前）

| 节奏 | 入口 | 最小固定组合 | 触发条件 |
|:---|:---|:---|:---|
| 阶段收口前 | `pnpm check:docs` + `pnpm run test:coverage` + `pnpm lint` + `pnpm typecheck` + `pnpm --filter @dependfix/platform exec playwright test` | 检查归档批次合入未引入回归 | 每次阶段归档前 |
| CI 端到端 | 上述 5 项 + `pnpm build` | 裁决合并 | PR 合并前 / commit 推送后 |

> **扩面候选**（待评估）：周级 `pnpm regression:weekly` 与发版前 `pnpm regression:pre-release` 入口未建立；当前依赖 CI 端到端裁决。

### 覆盖矩阵（每条长期主线的回归覆盖状态）

| 长期主线 | 阶段收口覆盖 | CI 端到端覆盖 |
|:---|:---|:---|
| #1 PrimeVue hydration | ✅ `playwright` e2e | ✅ `playwright` e2e |
| #2 network-audit 默认白名单 | ✅ `packages/engine/src/runners/verification-runner.test.ts` + `network-audit.test.ts` | ✅ `pnpm run` verification job |

> 标注 `—` 的条目表示当前缺少自动化回归覆盖，是后续回归层扩面的候选方向。

### 漂移路由规则

回归验证发现的问题不自行修复，而是按以下规则路由到对应长期主线或短期候选：

| 回归发现问题 | 路由目标 |
|:---|:---|
| e2e rowGroup `.fixme` 触发 | → 长期主线 #1（PrimeVue hydration） |
| network-audit 真实注册表域新增诉求 / 命令输出 URL 阻断 regression | → 长期主线 #2（network-audit 默认白名单） |
| CI 失败 | → 当前阶段批次（无活跃阶段时登记 backlog 远期） |

## 短期 / 一次性候选任务（上收后去重）

> 共享说明：本区块条目当前均处于"候选评估中"或"延期暂缓"状态；正式上收阶段后从 backlog 移除并归档至 [todo-archive.md](todo-archive.md)。评估为"暂不实现"的候选直接关闭。

### 延期 / 暂缓项

- **T705 生产级部署**（PostgreSQL + Helm + Sentry）—— 2026-08-12 用户指示暂缓排期
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **C30 Publish Docker build job 失败排查** —— 2026-08-18 用户决策暂缓（双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作）；恢复条件：① master 分支 push 频率显著提升；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复
- **§M14.2 PrimeVue 4 → 5 升级评估** —— 2026-08-26 dependabot #49 触发评估，Nuxt build 报 `Rolldown failed to resolve import "primevue/inputcolor"`（v5 改组件导入约定）。`@primevue/nuxt-module` 5.x + `@primeuix/themes` 3.x 需联动升级，影响 `apps/platform/nuxt.config.ts` 及可能的 DataTable 等组件用法。PR 已关闭，恢复条件：① 评估 PrimeVue 5 migration guide 工作量；② 与主线 #1（PrimeVue 4 hydration 已知 bug）联动决策——若主线已迁移到 v5 修复版本，则直接评估；否则需先评估"独立升级 PrimeVue 5 vs 等主线修复"的取舍；③ 用户明确恢复
- **db-restore 审计未采纳项（M22.2 落地遗留）** —— 2026-09-01 M22.2 A 阶段审计 S-1 第 2/3/4 项 + S-2 未采纳：① `inspectSqliteFile` 能打开但 `integrity_check != 'ok'` 分支未覆盖（需用 `PRAGMA writable_schema` 构造损坏 fixture）；② 恢复后 `integrity_check` 失败分支未覆盖（需 mock 注入）；③ sidecar `unlinkSync` 部分失败的 `removedSidecars` 状态一致性未覆盖；④ `--from` / `--to` 未做路径规范化（不校验 `..` / 符号链接）。当前 `db-restore` 是本地管理员工具，攻击面极低；恢复条件：脚本被远程 / 容器自动化触发，或补测试成本下降（对应实现见 `apps/platform/server/database/scripts/db-restore.ts`）

### 远期登记 / 未排期增强候选

按主题分组：

#### MCP 能力

- **C37** 语言偏好多设备同步（当前仅单一设备语言偏好；多设备切换需重新设置；触发：用户实测反馈多设备用户；前置：服务端 API i18n 基础已 M16.3 + M17.x + M24.1 完整闭环）

#### 多组织 / 多租户

- **D1** repo_admin + RepositoryAccess（实现仓库级 admin 角色区别于全局 admin；当前 owner 角色对仓库控制粒度不足；关联：C22 GitHub App 验证身份）
- **D3** 多租户组织体系（支持多个组织/org 共存；当前 single-org 模型限制 org 切换；前置：D1 仓库级权限；触发：org 场景用户痛点）
- **SAML 2.0 SSO**（D2 username 等待 SAML SSO 上后再决定 username 模型；当前 better-auth OIDC 优先）

#### 用户管理

- **D8** remove-user 关联资源检查（无 user→resource 关联时暂不需要；前置：先有 D1 资源关联表）

#### 测试基础设施清理

（无活跃候选 —— cron-preview 时区测试 wall-clock 依赖消除已 M23.4 + M24.3 闭环）

#### PR 管理

- **B2** 固定分支单线设计（独立平台部署后修复频率上升，需要固定修复分支如 `dependfix/auto-fix` 避免频繁向 master 提交 PR；触发：v1.0.0 后 M12 平台 UX 修复链路上线；关联：T210 指纹方案整合复用/重建策略 + force push 语义）

#### 修复交付链路（验证 / commit / push / PR）

- **C73 隔离宿主 git 全局配置对自动 commit 的污染（`commit.gpgsign` 等）** —— 2026-09-21 用户发起「修复并建 PR 模式下工作区 commit 身份」现状分析时实证触发；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **目标**：自动修复链路产生的 commit 不受宿主 git 全局 / 系统配置影响——commit 恒成功，且不会被宿主个人 GPG 签名。
  - **范围**：`packages/engine/src/github/pr-creator.ts`（`stageAndCommit` / `ensureGitConfig`）+ 共用该函数的两个调用方（`packages/engine/src/app/helpers.ts` `/` `packages/engine/src/app/index.ts`）+ 宿主配置泄漏路径 `apps/platform/server/services/executor/container-executor.ts`。
  - **现状实证**（2026-09-21 代码核对 + 最小复现）：
    - [`stageAndCommit`](../../packages/engine/src/github/pr-creator.ts) 仅显式传 `-c user.name` / `-c user.email`（M18.4 W3 修复），**未隔离 `commit.gpgsign`**。
    - 非测试源码**零处** `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_NOSYSTEM` / `commit.gpgsign` 处理（仓库级检索 0 命中）；配置隔离仅存在于 `pr-creator.test.ts`。
    - [`container-executor.ts`](../../apps/platform/server/services/executor/container-executor.ts) 名为 container，实际在**宿主进程内** `new DependfixApp(...)`（无 docker 调用），宿主全局 git 配置完全生效。
    - 最小复现 ①（gpg 可用 **且** `user.signingkey` 已配置 / 默认密钥可自动选中）：按 `stageAndCommit` 命令形式提交 → commit 成功但**带宿主个人 GPG 签名**，签名身份与 commit author 不一致；若宿主无可用签名 key，则落入 ② 的失败分支。
    - 最小复现 ②（gpg 程序不可用，模拟 CI / 纯 Linux 容器）：`gpg failed to sign the data` → `failed to write commit object`，commit 直接失败。
  - **影响面**：[`commitLocalChanges`](../../packages/engine/src/app/helpers.ts)（平台 `mode:'fix' + commit:true` 路径）与 [`executeFixAndPrMode`](../../packages/engine/src/app/index.ts)（引擎自带 fix-and-pr 路径）共用 `stageAndCommit`；签名失败归入 C53 状态机的 `git commit 失败` 分支。
  - **候选修复方向（待上收时敲定）**：
    - **方案 A（推荐，最小改动）**：`git commit` 显式追加 `-c commit.gpgsign=false`，直击签名污染根因，不改变其余宿主配置语义。
    - **方案 B（彻底隔离）**：为 git 子进程注入 `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1`，一次性屏蔽全部宿主配置；代价是同时丢失宿主 `url.*.insteadOf` / 代理 / `core.hooksPath` 等可用配置，可能影响 clone / push。
    - **方案 C**：扩展 `ensureGitConfig`，clone 后向克隆仓库写 local `commit.gpgsign=false`（不改宿主配置）。
  - **验收标准**：
    - [ ] 宿主 `commit.gpgsign=true` 且 gpg 可用时，工作区 commit 无签名（`git log --show-signature` 无 Good signature）
    - [ ] 宿主 `gpg.program` 指向不可用程序时，工作区 commit 仍成功
    - [ ] `pr-creator.test.ts` 新增 case 覆盖签名污染场景（沿用既有 `GIT_CONFIG_GLOBAL` 隔离测试范式）
    - [ ] engine + platform 定向测试 + `pnpm lint` + `pnpm typecheck` 通过
  - **不做什么**：不改宿主 `~/.gitconfig`；不关闭用户手工 git 操作的签名；不改 push 凭据链路（`http.extraheader` 注入已满足安全要求）；不回溯已产生的 commit
  - **依赖**：关联 M18.4 W3（`-c user.name` / `-c user.email` 显式覆盖范式）；关联 C53 状态机 `git commit 失败` 分支；关联 C74（同属 commit 身份 / 配置治理）
  - **交付物**：1-2 atomic commits（`fix(engine)` 签名污染隔离 + `test(engine)` case）
  - **风险与缓解**：方案 B 完全隔离可能丢失宿主必要的代理 / `insteadOf` 配置，导致 clone / push 回归；缓解：默认采用方案 A（仅签名开关），彻底隔离如需另开评估
  - **优先级**：P2（宿主 `commit.gpgsign=true` 且 gpg 不可用（CI / 容器 / 未装 gpg）时，会直接导致 fix-and-pr 交付失败；同时会把宿主个人 GPG 签名写入被修复的第三方仓库历史）
  - **复杂度估算**：代码 ~5-20 行；测试 2-4 case；文档 0（未触发设计文档硬阈值）

- **C74 接线 `getCommitAuthor()`，让 GitHub App 凭据路径使用真实 bot 身份** —— 同 C73 分析衍生；评估完成待上收；**不带 M\d+ 阶段编号**。
  - **目标**：自动修复 commit 的 author 来源于凭据对应的真实 GitHub 身份——GitHub App 路径输出沿用 M18.x 既有 author 约定的 `{app_id}[bot]` / `{app_id}+{bot_login}[bot]@users.noreply.github.com`（email 格式决定 GitHub 账号归属，name 属显示层）。
  - **范围**：`packages/engine/src/auth/{auth-provider,pat-provider,app-provider}.ts`（`getCommitAuthor()` 接线）+ `packages/engine/src/app/{helpers,index}.ts`（author 透传）。
  - **现状实证**（2026-09-21 代码核对）：
    - [`auth-provider.ts`](../../packages/engine/src/auth/auth-provider.ts) 定义 `getCommitAuthor()` 契约，[`pat-provider.ts`](../../packages/engine/src/auth/pat-provider.ts) 与 [`app-provider.ts`](../../packages/engine/src/auth/app-provider.ts) 各自实现——但**非测试源码零调用**。
    - `stageAndCommit` 两个调用点（[`helpers.ts`](../../packages/engine/src/app/helpers.ts) + [`index.ts`](../../packages/engine/src/app/index.ts)）均不传 `author` → 恒落 `PAT_DEFAULT_COMMIT_AUTHOR`。
    - 结果：即使使用 GitHub App 凭据，commit author 仍是硬编码 `dependfix[bot] <dependfix[bot]@users.noreply.github.com>`——该邮箱非真实账号，提交不归属任何 GitHub 账号。
  - **决策点（待上收时敲定）**：
    - **PAT 路径是否同步调整**：M18.0 决策 2「PAT 用户行为零变化」为既有约束，改动会改变既有仓库的 commit 归属，需用户决策。
    - **App 路径 `botLogin` 透传链路**：`app-provider.ts` 在 `params.botLogin` 缺失时 fallback `dependfix[bot]`，调用方需显式提供才能得到真实 bot login。
    - **与 push / PR 身份的一致性**：push 与 PR 均走 token，归属于凭据所有者；commit author 改为 App bot 身份后需评估三者语义是否自洽。
  - **验收标准**：
    - [ ] GitHub App 凭据路径工作区 commit author = `{app_id}[bot] <{app_id}+{bot_login}[bot]@users.noreply.github.com>`
    - [ ] commit 在 GitHub 页面上归属 App bot 账号（由 email 映射生效，人工核验一次）
    - [ ] PAT 路径行为按用户决策保持一致或同步调整
    - [ ] auth-provider / pr-creator 单测覆盖接线路径
    - [ ] `pnpm lint` + `pnpm typecheck` + 定向测试通过
  - **不做什么**：不改 push 凭据链路；不改分支命名 / 内容指纹；不回溯已产生的历史提交
  - **依赖**：AuthProvider 抽象（M18.x）；关联 [c22-pat-backward-compat.md](../design/governance/c22-pat-backward-compat.md)；关联 C73（同一 commit 身份治理批次）
  - **交付物**：1-2 atomic commits（`feat(engine)` getCommitAuthor 接线 + `test(engine)` case）
  - **风险与缓解**：变更 commit author 可能触发目标仓库保护规则（要求签名 commit / 限定作者）导致 PR 被拒；缓解：先在单一测试仓库验证，并与 C73 的签名策略一并评估
  - **优先级**：P3（当前 PAT 路径功能可用；App 路径身份不真实属审计一致性 / 体验问题）
  - **复杂度估算**：代码 ~20-40 行（author 透传 + botLogin 传递）；测试 3-5 case；文档 0（未触发设计文档硬阈值）

- **C75 验证命令链纳入 test（补交付前验证矩阵缺口）** —— 2026-09-21 rss-impact-server PR #1095 实证触发（该 PR 已由用户 close）；评估完成待上收；**不带 M\d+ 阶段编号**。
  - **目标**：交付前验证矩阵能捕获「install / lint / build 通过但测试无法运行或失败」的破坏，避免把坏修复交付成 PR。
  - **范围**：`packages/engine/src/app/helpers.ts`（主链 `DEFAULT_VERIFY_COMMANDS`）+ `packages/engine/src/runners/verification-runner.ts`（fallback `DEFAULT_COMMANDS`）+ `packages/engine/src/verification/validate-commands.ts`（脚本存在性跳过）+ `docs/design/modules/dependency-fixer.md`（口径同步）。
  - **现状实证**（2026-09-21 代码核对 + 远端 CI 日志）：
    - [`verification-runner.ts`](../../packages/engine/src/runners/verification-runner.ts) `DEFAULT_COMMANDS = ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build']`；[`helpers.ts`](../../packages/engine/src/app/helpers.ts) 的 `DEFAULT_VERIFY_COMMANDS` 为同一份链的副本——**两条链均不含 test**。
    - 实证失败类型：PR #1095 把 `decode-uri-component` 覆写到 0.5.0（纯 ESM），CJS 消费方 `query-string@7.1.3` 在 Jest 下无法加载该模块（`SyntaxError: Unexpected token 'export'`），`src/utils/rss-helper.test.ts` suite 直接失败；而 install / lint / build 三条全绿（本例实测 lint / build 未加载该 CJS `require` 路径，故这类破坏在该仓库不可见；其他仓库是否命中取决于其 bundler 配置）。
    - 设计文档已固化该口径并自陈限制：[`dependency-fixer.md`](../design/modules/dependency-fixer.md) 「强制完整验证（install + lint + build）」+「lint/build 通过 ≠ 运行时功能正确」。
    - 现有 [`validate-commands.ts`](../../packages/engine/src/verification/validate-commands.ts) 已支持按 `package.json#scripts` 校验脚本存在性（无脚本 → 跳过并记 `SCRIPT_NOT_FOUND` 审计）——把 test 纳入默认链不会误伤无 test 脚本的仓库。
  - **决策点（待上收时敲定）**：
    - **顺序**：test 置于 build 之前还是之后（test 常依赖 build 产物；build 之后最接近 CI，但耗时最长）。
    - **默认开启 vs opt-in**：默认开启会让所有被修复仓库多跑一条可能很慢的命令（单命令超时默认 10 分钟）。
    - **既有失败基线**：目标仓库本身长期 test 红的场景，会把与本次修复无关的失败算作修复失败——需先决定「基线判定」或「仅 opt-in」。
  - **验收标准**：
    - [ ] 两条默认链同步纳入 test（顺序与超时策略在文档中明确；或收敛为单一常量以消除副本漂移）
    - [ ] 无 `test` 脚本的仓库优雅跳过（沿用 `validateVerifyCommands` + `SCRIPT_NOT_FOUND` 审计）
    - [ ] 新增 case 复现「ESM-only 依赖破坏 CJS 消费方」场景下验证失败并触发门禁回滚
    - [ ] 报告 / PR body 的 Verification 区展示 test 结果
    - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
  - **不做什么**：不改单包级回滚逻辑；不引入 CI 等价全量（coverage / e2e）；不改单命令默认超时
  - **依赖**：关联 C76（平台侧命令配置暴露）；关联 C73 / C74（同属修复交付链路）；关联 [`dependency-fixer.md`](../design/modules/dependency-fixer.md) 已知限制条目
  - **交付物**：1-2 atomic commits（`feat(engine)` 命令链 + `test(engine)` case + 文档同步）
  - **风险与缓解**：test 链耗时 / 资源放大，且仓库既有 test 红会把无关失败归因到本次修复；缓解：先评估「默认开启 vs opt-in」与既有失败基线策略，必要时先做 opt-in 再转默认
  - **优先级**：P2（已实证会向第三方仓库交付坏 PR；属交付链路正确性缺口）
  - **复杂度估算**：代码 ~10-30 行（命令链 + 文档）；测试 3-5 case；文档 1 处（dependency-fixer.md）

- **C76 平台侧暴露验证命令配置（与 CLI `--commands` 对齐）** —— 同 C75 分析衍生；评估完成待上收；**不带 M\d+ 阶段编号**。
  - **目标**：平台发起的修复也能配置验证命令，使平台场景可追加 test 等命令，而不必等默认链变更。
  - **范围**：`apps/platform/server/services/executor/container-executor.ts`（RuntimeConfig 组装）+ `apps/platform/server/schemas/*`（配置 schema，如需 migration 按既有流程）+ `apps/platform/app`（配置 UI，粒度敲定后）。
  - **现状实证**（2026-09-21 代码核对）：
    - CLI 已有 `--commands`（[`cli/index.ts`](../../packages/cli/src/cli/index.ts) 选项定义 + `parseCommandsFlag` → `overrides.commands`），并在 pipeline 透传。
    - `apps/platform` 全仓检索 `commands` 0 命中；[`container-executor.ts`](../../apps/platform/server/services/executor/container-executor.ts) 构造 `RuntimeConfig` 时仅 `...ctx.config`，平台无 commands 来源 → **平台恒用引擎默认链**。
  - **决策点（待上收时敲定）**：
    - **配置粒度**：平台全局 / 每仓库（Repository 实体）/ 每次扫描（ScanRequest）。
    - **安全边界**：`container-executor` 实际在宿主进程内运行引擎，平台自定义命令等价于远程命令执行面，需权限门槛与审计。沙箱路由与容器生命周期已落地（M8 / M11 T1005，daemon 不可用自动降级 container），但容器内真实执行序列尚未实现（`sandbox-executor.ts` 当前为最小占位命令，注释自述「后续集成阶段实现 git clone + pnpm install + dependfix-cli 完整序列」）——上收前不能指望沙箱缓解该风险。
    - **数据落位**：如按仓库配置需评估 TypeORM schema / migration（走 M22.4 / M22.5 双向 opt-in 流程）。
  - **验收标准**：
    - [ ] 平台可配置验证命令并透传至 `RuntimeConfig.commands`（schema 变更如需 migration 按既有流程）
    - [ ] 单测 / e2e 覆盖配置透传链路
    - [ ] 权限门槛（仅 admin / org_admin）+ 审计记录 + 文档说明执行风险
    - [ ] `pnpm lint` + `pnpm typecheck` + 定向测试通过
  - **不做什么**：不在本候选内落地沙箱隔离；不开放任意 shell（仅接受命令数组）；不改变 CLI 侧语义
  - **依赖**：关联 C75（默认链口径）；关联 C73（同属修复交付链路）；关联 [`docs/standards/platform.md`](../standards/platform.md)
  - **交付物**：1-2 atomic commits（`feat(platform)` 配置透传 + `test(platform)` case）
  - **风险与缓解**：自定义命令构成命令执行面；缓解：权限门槛 + 审计留痕 + 文档风险声明，沙箱落地后再评估放宽
  - **优先级**：P3（当前默认链可用；无平台配置不影响基础能力）
  - **复杂度估算**：代码 ~40-80 行；测试 3-5 case；文档 1 处（platform.md）

#### 告警获取（Dependabot / Code Scanning）

- **C78 区分 Dependabot alerts「确实未启用」与「获取失败」** —— 2026-09-21 用户实测反馈触发（`CaoMeiYouRen/better-bytes` run 日志 403）；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **目标**：alerts 获取失败时能判定根因——是仓库**确实未启用** Dependabot alerts（应视为预期状态并单独统计），还是 token 权限 / 限流 / 网络等**获取失败**（应保持错误）；消除当前把「未启用」也提示成「token 权限不足」的误导。
  - **范围**：[`errors.ts`](../../packages/engine/src/github/errors.ts)（错误分类）+ [`dependabot-fetcher.ts`](../../packages/engine/src/github/dependabot-fetcher.ts)（403 message 判定）+ [`helpers.ts`](../../packages/engine/src/app/helpers.ts)（三个 alerts hint 函数）+ [`repo-alerts.ts`](../../packages/engine/src/app/repo-alerts.ts)（`FETCH_FAILED` 记录与 run 失败语义）+ [platform.md](../standards/platform.md)（错误码口径）+ 报告 / 平台展示口径。
  - **现状实证**（2026-09-21 代码核对 + 实测日志 + 官方文档核对）：
    - 实测：`GET /repos/CaoMeiYouRen/better-bytes/dependabot/alerts?state=open&per_page=100` → 403，body message 为 `Dependabot alerts are disabled for this repository.`；dependfix 把该 403 归类为 token 权限问题（提示「请检查 token 是否具备 Dependabot alerts 读取权限……」）并让整轮 run 失败（exitCode 2）。
    - 代码：`errors.ts` 的 `resolveErrorCode` 只看 status（403 → `PERMISSION_DENIED`）与 `x-ratelimit-remaining`，**不判定响应体 message**（Octokit `RequestError.message` 已由响应体 message 透出——用户日志中打印的即该文案，故判定可复用既有 `error.message`，无需新增 `response.data` 读取路径）；`helpers.ts` 的 `dependabotAlertsTokenHint` 对 `PERMISSION_DENIED` 一律返回 token 权限提示；`repo-alerts.ts` 的 `recordAlertSourceError` 统一记 `FETCH_FAILED`。
    - 官方文档：`docs.github.com` 的 `GET /repos/{owner}/{repo}/dependabot/alerts` 响应码仅列 200 / 304 / 400 / 403 / 404 / 422，**没有单列「alerts 未启用」的码或 body**（页面內检索 `Dependabot alerts are disabled` 0 命中）——即没有语义化响应可直接判定；文档对 404 仅写 `Resource not found`，未细分「无访问权」与「仓库不存在」，当前统一映射 `REPO_NOT_FOUND`。
    - **可判定的信号**（文档 + 多源社区实证）：
      1. **403 + message** `Dependabot alerts are disabled for this repository.` ＝ 确实未启用（社区实证原话：该 403「是检查不适用，而非 scope 缺失」）；无效 token 走 401，已可由状态码区分。
      2. **探测端点** `GET /repos/{owner}/{repo}/vulnerability-alerts` → 204 = 已启用 / 404 = 未启用（官方文档原文：Shows whether dependency alerts are enabled or disabled for a repository. **The authenticated user must have admin read access to the repository.**）。
      3. 语义易混的相邻端点：`GET /repos/{owner}/{repo}/automated-security-fixes`（200 `{enabled, paused}` / 404）是 Dependabot **security updates**；`GET /repos/{owner}/{repo}` 的 `security_and_analysis` 字段集中**只有 `dependabot_security_updates`、没有 dependabot alerts**，且需 admin 权限才可见——二者都不能替代 alerts 启用状态判定。
      - 社区实证来源：`michaelpipkin/dependabot-agent` issue #12（403 body 原文 + bad token 走 401）、`thomaschristory/netbox-proxy-plugin` issue #10（同款 403）、`microsoft/ghqr` 规则 `repo-sec-001`「Dependabot alerts not enabled」。
    - 探测端点的局限（**不得作为主判定**）：`vulnerability-alerts` 要求 admin read（fine-grained 对应 `Administration: read-only`，而非 `Dependabot alerts: read`；权限不足时该端点自身返回 403 `Resource not accessible by personal access token`），最小权限 token 探测时可能自身 403/404；且 404 与「未启用」共用同一状态码，无法区分「未启用」与「无 admin 权限」。因此只以 **204 确认「已启用」**，404 不得单独作为「未启用」结论；主判定仍为 403 message。
  - **决策点（待上收时敲定）**：
    - **归类口径**：新增独立状态 / 错误码（如 `ALERTS_DISABLED`）并在报告与平台单列「未启用 N 个仓库」，或仅修正错误文案而不改变失败语义。
    - **run 语义**：仓库未启用 alerts 时是否仍算整轮失败（当前 exitCode 2）——倾向视为「跳过 / 预期」，但需确认不会掩盖真实权限问题。
    - **是否自动回退**：`alertsSource=github-dependabot` 遇「未启用」时是否自动降级 pnpm-audit（当前 403 不自动降级，保持硬失败，仅提示手动切换）。
    - **同类覆盖**：Code Scanning / Code Quality 是否存在同类混同（`code-scanning-fetcher.ts` / `code-quality-fetcher.ts` 同样只经 `mapGitHubError`，未做 message 判定）。**Code Scanning 已有文档级证据**：官方文档 `GET /repos/{owner}/{repo}/code-scanning/alerts` 明确 403 = "Response if GitHub Advanced Security is not enabled for this repository"，而当前同样落 `PERMISSION_DENIED` + 「请检查 token 是否具备 Code Scanning alerts 读取权限」提示——上收时可直接决定并入 C78 或拆分。
  - **验收标准**：
    - [ ] 未启用仓库（403 + 该 message）与权限失败可区分，报告 / 日志各输出对应准确文案
    - [ ] 单测覆盖三类：未启用（403 + message）/ 权限不足（401 或 403 其他 message）/ 限流（403 + ratelimit 归零）
    - [ ] 未启用仓库的 run 语义按决策点落地，报告单列「未启用」计数
    - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
  - **不做什么**：不自动修改目标仓库设置（开启 alerts 需 admin，且属用户决策）；不改 `alertsSource` 默认值；不引入新依赖
  - **依赖**：关联 `repo-alerts.ts` 双 token 设计（`alertsToken` 最小权限）；关联 [platform.md](../standards/platform.md)（错误码与提示口径）；关联 `errors.ts` 既有 `mapGitHubError` 语义；关联 [经验归档 §一 外部平台限制先探针验证（G2 处置）](../design/governance/experience-archive-§1-§21-spec-compliance.md#一外部平台限制先探针验证g2-处置)（同一 403 通道内不同 message 的细分，避免重复评估历史结论）
  - **交付物**：1-2 atomic commits（`feat(engine)` 错误细分 + `test(engine)` case + 文案 / 报告字段同步）
  - **风险与缓解**：该 message 文案属非文档化行为，未来可能变动；缓解：以 message 匹配为主信号 + 探测端点兜底，匹配失败时退回现有 `PERMISSION_DENIED` 语义（不误判为「未启用」）
  - **优先级**：P2（影响可用性判定与告警覆盖统计：可用仓库被误报为权限错误并让整轮 run 失败）
  - **复杂度估算**：代码 ~30-60 行（错误分类 + message 判定 + 文案 + 报告字段）；测试 4-6 case；文档 1 处（platform.md 错误码口径）

#### Code Scanning 规则体系

#### 依赖修复引擎（dependency-fixer）

- **C71 pnpm overrides 路径级覆盖（`parent>child`）支持** —— 2026-09-13 commit f67aea2 实证触发：dependfix 仓库自身 `pnpm audit` 报 21 个告警（11 high / 10 moderate），按 dependfix 默认修复链路只能写**顶层**覆盖 `undici: 7.29.0` / `nodemailer: 9.1.1` 等，**但** `pnpm-workspace.yaml` 必须**手动**补 3 条**路径级**覆盖才能让 `pnpm audit` 输出 `No known vulnerabilities found`：
  - `@semantic-release/github>undici: 7.29.0`
  - `@vercel/node>undici: 7.29.0`
  - `push-all-in-one>nodemailer: 9.1.1`

  根因：dependfix 引擎不感知"通过哪个父包引入"的依赖路径，**3 层全部缺失**：

  1. **数据模型**：[`packages/core/src/alerts/index.ts`](../../packages/core/src/alerts/index.ts) `NormalizedSecurityAlert` 无 `dependencyPath` 字段（仅 `dependencyType: 'direct' | 'transitive'` 二分）
  2. **数据采集**：
     - [`packages/engine/src/alerts/pnpm-audit-fetcher.ts`](../../packages/engine/src/alerts/pnpm-audit-fetcher.ts) 解析 `vulnerabilities.<pkg>.via[]` 只取 `name / severity / url / advisoryId`，**不解析** pnpm v11 `nodes[].path`（含完整依赖链）或 legacy `findings[].paths[]`（pnpm < 8 `paths: ['@semantic-release/github>undici@7.28.0']`）
     - [`packages/engine/src/github/dependabot-fetcher.ts`](../../packages/engine/src/github/dependabot-fetcher.ts) 只取 `dependency.package.name + relationship`（直接/间接），不携带依赖链
  3. **写入层**：
     - [`packages/engine/src/fixers/dependency/overrides-io.ts`](../../packages/engine/src/fixers/dependency/overrides-io.ts) `writeWorkspaceOverride` 只接收 `packageName`，**不接收** `dependencyPath`
     - [`packages/engine/src/app/helpers.ts`](../../packages/engine/src/app/helpers.ts) `buildVersionedOverrides` 支持 `pkg@major` 形式（2026-08-09 复盘），**不支持** `parent>child` 形式
     - `readExistingOverrides` / `overrideTransitiveDependency` 同理只读/写顶层

  **pnpm 官方路径级覆盖语法**（[dependency-resolution#overrides](https://pnpm.io/settings/dependency-resolution#overrides) 已确认支持，2026-09-13 webfetch 实证）：
  ```yaml
  overrides:
    "qar@1>zoo": "2"           # 只覆盖 qar@1 的 zoo 依赖
    "react-dom>react": "18.1.0" # 覆盖 react-dom 的 react peer
    "foo@1.0.0>bar": "-"       # 移除 foo@1.0.0 的 bar 依赖
  ```
  pnpm 文档原话："You may specify the package the overridden dependency belongs to by separating the package selector from the dependency selector with a `>`"——dependfix 引擎**有能力**利用但**当前不利用**。

  **候选实现方向**（待上收时敲定决策点）：

  1. **数据采集策略**：
     - pnpm-audit：解析 `nodes[].path` 优先（pnpm v11 modern 格式含完整依赖链），fallback legacy `findings[].paths[]`（pnpm < 8），双格式兼容（pnpm-audit-fetcher 已有 modern/legacy 双解析基础）
     - dependabot：API 缺依赖链时，从 `package.json` + `pnpm-lock.yaml` 路径反查（如 `node_modules/@semantic-release/github/node_modules/undici` → `['@semantic-release/github', 'undici']`）—— **优先级低于 pnpm-audit 解析**（不引入新依赖如 `@pnpm/lockfile`）
  2. **修复策略决策**：
     - **方案 A（推荐）**：首选**顶层覆盖**（兜底广，pnpm 默认语义）+ 路径级作为**补丁**（处理"顶层覆盖不生效"边界场景，如 monorepo 多 workspace 成员 peer 冲突、版本约束阻断等）
     - **方案 B**：每条告警都写对应路径级（粒度细但 PR diff 大，可能 pnpm 报"过度配置"）
     - 倾向 A：与 pnpm 文档"路径级只覆盖特定父包"语义一致；commit f67aea2 实证"3 条路径级 + 1 条顶层" 即可彻底消除告警
  3. **数据模型扩展**：
     - `NormalizedSecurityAlert` 新增 `dependencyPath?: string[]`（从根到目标包路径，如 `['@semantic-release/github', 'undici']`）
     - 同步评估：平台 `apps/platform/server/entities/scan-result.ts` 是否需要 migration（schema 改动走 M22.4/22.5 双向 opt-in 流程）
  4. **报告展示**：PR body / 报告 §4 增加 `dependencyPath` 列，让用户审计"为什么这条告警需要路径级覆盖"——**与 C66 告警视图增强不同**（C66 关注标识符 + 去重，C71 关注修复链路）

  **验收标准**：
  - `pnpm audit` 报 `undici` 告警且 lockfile 中有 ≥2 个父包传递 → dependfix 推荐 PR 自动包含 ≥1 条路径级覆盖（如 `parent1>undici: 7.29.0`）
  - 修复后 `pnpm audit` 输出 `No known vulnerabilities found`（commit f67aea2 这类场景的依赖 fix 自动化）
  - pnpm-audit-fetcher.test.ts + overrideTransitiveDependency.test.ts 新增路径级场景 case（pnpm v11 `nodes[].path` 解析 + legacy `findings[].paths[]` 解析 + 路径级 override 写入回滚 + 与既有顶层覆盖协同取 max）
  - 平台 schema 如需 migration 走 M22.4/22.5 双向 opt-in 流程同步

  **关联**：
  - 直接关联 commit f67aea2（dependfix 仓库自身的依赖修复实证，ahead=0 未推送仅本地，参考既有 0430f05 前例）
  - 间接关联：M22.4/22.5 synchronize + migrationsRun 双向 opt-in 流程（如 platform schema 需改）
  - 间接关联：C66 告警视图增强（`dependencyPath` 是告警的可视化属性，理论上 C66 UI 也可展示，但不强制 C71 内做）
  - 间接关联：MCP `pnpm_audit` 工具（M28.4 已落地 RunResult 对齐 5 字段，C71 评估时需决定是否扩展 RunResult 透传 `dependencyPath`）

  **不做什么**（先排除歧义）：
  - 不引入新依赖（如 `@pnpm/lockfile` 解析器）—— 继续走 `pnpm audit --json` + `pnpm-lock.yaml` 文本解析
  - 不重写 report schema，只在报告 §4 Repositories / 建议区块展示 `dependencyPath`
  - 不在 C71 评估时直接落平台 schema 改动（如需拆 C71.x 子项）
  - 不替代或重写 `buildVersionedOverrides` 的 `pkg@major` 语义——路径级（`parent>child`）与版本级（`pkg@major`）是正交维度，可叠加（如 `vite@5>esbuild: ^0.25.0`）

  **复杂度估算**：
  - 代码：~150-200 行（fetcher 解析 `nodes[].path`/`findings[].paths[]` + override 写入 + 单测 + 报告渲染）
  - 测试：~50-80 case（双格式解析 + 路径级 override 写入回滚 + 与顶层覆盖协同取 max + e2e 端到端）
  - 文档：1 个 [modules/dependency-fixer.md](../design/modules/dependency-fixer.md) 设计文档更新 + 1 个 usage example
  - 类型平衡：🚀 能力扩展（核心） + 🛡️ 治本（修复完整性，避免 dependfix 推荐 PR 不完整）
  - 优先级：P2（治本有用户实证 commit f67aea2 + 长期影响 dependfix 自身管理 dependfix 仓库的依赖流程）
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 M\d+ 阶段编号**：等待用户明确决策启动

- **C77 override 曾被人工移除的复发防护** —— 2026-09-21 rss-impact-server 实证触发（PR #1095 已由用户 close）；评估完成待上收；**不带 M\d+ 阶段编号**。
  - **目标**：dependfix 不再重复提出「历史上已被人工移除过的 override」，防止同一破坏性覆盖反复交付到被修复仓库。
  - **范围**：`packages/engine/src/fixers/dependency/`（override 写入前判定）+ `packages/engine/src/app/repo-fix.ts`（修复流程接入点）+ repo policy 类型与消费侧（方案 B）。
  - **现状实证**（2026-09-21 远端提交历史 + 代码核对）：
    - 复发链：`3376aca3`（2026-09-04，author `dependfix[bot]`）批量写入 overrides，含 `decode-uri-component: ^0.5.0` → `9fe327af`（同日，人工）`fix(deps): remove decode-uri-component override to fix Jest ESM compatibility`，message 明确「0.5.0 is ESM-only, but query-string@7.1.3 (CJS) depends on it. The original 0.2.2 already patches GHSA-vcc3-ghjq-m6fr (fixed in 0.2.1)」→ 2026-09-21 PR #1095 再次写入同条 override。
    - 引擎侧无记忆：[`overrides-io.ts`](../../packages/engine/src/fixers/dependency/overrides-io.ts) 只有 write / backup / rollback，无 override 变更历史概念；repo policy 仅 include / exclude / topics，无 override 黑名单。
    - 单包级回滚只处理「本次 install 失败 / 升级后实例残留」，不感知「上次为何被移除」。
  - **候选实现方向（待上收时敲定）**：
    - **方案 A**：交付前读取目标仓库 overrides 相关文件的提交历史（GitHub API），检出「该 override 曾被移除」→ 报告警示并跳过该条。
    - **方案 B**：repo policy 增加 overrides 黑名单 / 保护名单（用户显式维护，成本低）。
    - **方案 C**：升级目标改为「最小修复版本」（该 GHSA 自 0.2.1 已修复，0.2.2 即足够），避免无收益的破坏性升级——需先实证现有 recommendedVersion 的来源。
  - **验收标准**：
    - [ ] 复现 #1095 场景：存在该 override 移除历史的仓库，dependfix 不再自动写入同条 override（或产出警示并默认跳过）
    - [ ] 报告 / PR body 记录判定依据（检出移除历史 或 policy 命中）
    - [ ] 对应单测 case（历史检出 / policy 黑名单）覆盖
    - [ ] `pnpm lint` + `pnpm typecheck` + 定向测试通过
  - **不做什么**：不自动改写目标仓库历史；不引入新依赖做 lockfile 解析；不做全量 overrides 语义分析
  - **依赖**：关联 C71（overrides 文件域）；关联 C75（补 test 可减少但不消除此类复发）；关联 repo policy 相关规范
  - **交付物**：待方案敲定后评估（1-3 atomic commits；方案 A 约 `fixers/dependency/*` + GitHub API 查询层，方案 B 约 policy 类型 + 消费点，方案 C 先出调研结论）
  - **风险与缓解**：方案 A 启发式判定可能误伤合法升级（曾被移除但本次确实需要）；缓解：默认「警示 + 报告」而非静默跳过，保留人工放行（方案 B 由用户显式维护可规避误判）
  - **优先级**：P2（已实证复发，且破坏会实际交付到第三方仓库）
  - **复杂度估算**：方案 B ~30-60 行；方案 A ~80-150 行 + GitHub API 成本；方案 C 需先做版本选择来源调研

#### 报告与统计口径

#### 网络优化

- **C68 Git 代理 / 镜像方案** —— 2026-09-04 实测发现：部分仓库（momei 25MB / caomei-auth 9MB）clone 持续超时（120s+），而大仓库（rss-impact-web 215MB）反而 12s 完成。根因：服务器到 GitHub CDN 网络质量差（实测 GitHub 下载速度 14KB/s vs 通用网络 629KB/s）。当前临时方案（超时 300s + 重试 3 次 + partial clone `--filter=blob:none`）可缓解但不治本。**只有代理才能根本解决网络问题**（tarball API 仍走 GitHub 域名，同样受限）。候选方案：
  - **方案 A：HTTP 代理** —— 配置 `http.proxy` / `https.proxy` 指向代理服务器；需运维提供代理基础设施
  - **方案 B：GitHub 镜像** —— 使用 GitHub Enterprise 镜像或自建 Git 镜像（如 Gitea/GitLab mirror）
  - **方案 C：Git 缓存代理** —— 部署 git-proxy 或 gitcache 缓存已 clone 的仓库，后续请求走缓存
  - **触发条件**：① 用户部署环境有可用代理；② clone 超时成为频繁阻塞问题；③ 运维提供镜像基础设施
  - **验收**：momei / caomei-auth clone 耗时 < 30s；无 TLS 错误；超时率 < 5%

#### 工作流

- **T905** git worktree 并行开发预案（触发条件：多 agent 并行开发成为常态；当前单 agent 工作流无需启用）

#### 平台告警视图增强

- **C66 告警视图增强（GHSA/CVE 关联 + 跨次扫描去重 + fix 复用）** —— 2026-08-25 用户实测反馈触发；候选评估完成待上收；用户决策：Q1 去重粒度 = **B1 数据层去重（upsert 唯一索引）** / Q2 GHSA/CVE 展示 = **C3 单列智能**（优先 GHSA，fallback CVE）。5 原子子任务状态（2026-09-10 M27.1 重复评估教训更新）：
  - **C66-A1 ScanResult 数据模型扩展** —— ✅ **已闭环（M23.3 commit `f44a527` feat(platform)）** —— 加 `ghsaId` / `cveIds` 列 + TypeORM migration；保留 `ruleId` 兼容 code-scanning 源（[apps/platform/server/entities/scan-result.ts](../../apps/platform/server/entities/scan-result.ts)）
  - **C66-A2 fetcher 提取 GHSA + CVE** —— ✅ **已闭环（M23.3 commit `b6e7716` feat(core,engine)）** —— Dependabot API `cve_id` + `identifiers[]` 透传 / pnpm-audit `cves[]` 透传（[packages/engine/src/github/dependabot-fetcher.ts](../../packages/engine/src/github/dependabot-fetcher.ts) + [__fixtures__/dependabot-alerts.json](../../packages/engine/src/github/__fixtures__/dependabot-alerts.json) / [packages/engine/src/alerts/pnpm-audit-fetcher.ts](../../packages/engine/src/alerts/pnpm-audit-fetcher.ts)）；`NormalizedSecurityAlert` 接口加字段（[packages/core/src/alerts/index.ts](../../packages/core/src/alerts/index.ts)）
  - **C66-B ScanResult 跨次扫描去重** —— ⏸️ **暂缓（M23.3 决策）** —— upsert 唯一索引 `(repositoryId, source, packageName, advisoryKey)` + 历史 `fixStatus` 保留（fingerprint = `${repositoryId}|${packageName}|${ruleId ?? ''}` + 应用层 Map 聚合 + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds 字段已实施，B1 数据层去重暂缓；如未来需"fix 复用复用同一 scan_run_id 跨次刷新"语义时再考虑迁移到数据层 upsert，关联 C66-D）
  - **C66-C alerts UI 增加 GHSA / CVE 列** —— ✅ **已闭环（M23.3 commit `650a0d2` feat(platform) + 经验归档 §五十五 commit `9c64ee0` + commit hash 回填 commit `6e53616`）** —— 单列智能（`Identifiers` 列） + 多 CVE 显示首个 + 折叠剩余数量（hover title 展示完整列表）—— apps/platform/app/pages/alerts.vue L520-562 完整渲染（GHSA 优先 → fallback CVE[0] → 多 CVE 折叠 +N → code-scanning/code-quality 兜底 —）+ alertGhsaUrl / alertCveUrl helper + SCSS 列宽 180px + i18n colIdentifiers / fixNow 双语（zh-CN + en-US）+ /api/alerts 透传 ghsaId + cveIds（DB JSON 字符串反序列化为数组）；当前 `ruleId` 字段仍轻量覆盖 Dependabot GHSA / pnpm-audit CVE / code-scanning CodeQL rule id 三源；A1+A2 完整 schema 扩展后做的"独立 `Identifiers` 列"已在 M23.3 闭环，不再保留为后续增强候选
  - **C66-D fix 模式复用 scanRunId + 立即修复入口** —— ✅ **已闭环（M16.2 + M23.3 表格 L86 标注 "M16.2 闭环（不计入本批）"）** —— `POST /api/repos/[id]/scan` 接受 `reuseScanRunId` 跳过重拉（[scan.post.ts](../../apps/platform/server/api/repos/[id]/scan.post.ts)）+ scan.post.test.ts L144-208 4 case（sync mode / async queue mode / 404 校验 / 跨仓库 400 校验）+ useFixNow composable（[apps/platform/app/composables/use-fix-now.ts](../../apps/platform/app/composables/use-fix-now.ts) 87 行：fixingRunId / fixError / fixSuccess 三态 + triggerFix 复用 run_id 跳 /scans）+ alert-run-sidebar 立即修复按钮（[apps/platform/app/components/alert-run-sidebar.vue](../../apps/platform/app/components/alert-run-sidebar.vue) L143-153：`pi pi-bolt` 图标 + report-only 模式守卫 + fixingRunId loading 反馈）+ alerts-fix-now.e2e.test.ts 6 case（[apps/platform/tests/e2e/alerts-fix-now.e2e.test.ts](../../apps/platform/tests/e2e/alerts-fix-now.e2e.test.ts)）+ alerts.vue L256 调用 `useFixNow()`
  - 不做什么：不重写 Dependabot 详情页（详情在 dependabot 那边有，UI 只展示关键标识 + 跳链）/ 不立即支持自定义 advisory 来源（GitLab Advisory Database 等）/ 不破坏现有 fixStatus / 修复链路
  - **C66 整体上收触发条件**：C66-B 数据层去重暂缓迁移（C66-C/D 已闭环，无重复工作需求）/ C66-C 按 GHSA 单独搜索/过滤 / C66 多 CVE 展开视图增强
  - 关键决策回顾（2026-08-25 用户确认 + 2026-09-10 M27.1 修正）：
    - **B1 数据层去重** vs B2 UI 层 GROUP BY / B3 每次清空：选 B1 —— 彻底解决重复 + 自然支持 fix 复用 + 不破坏审计（fixStatus + scanRunId 仍可追溯）；B2 实现简单但数据膨胀 + fix 复用难做；B3 最简单但破坏"何时发现"审计信号。**备注：B1 数据层去重暂缓，应用层去重（方案 B2 等价）已实施且满足当前业务需求；如未来需要 fix 复用 / 历史 fixStatus 跨次保留再迁移到 B1**
    - **C3 单列智能** vs C1 两列分开 / C2 单列合并：选 C3 —— 用户原话"GHSA ID ... 这才是能真正跨平台追溯漏洞的关键信息"（GHSA 在 GitHub Advisory Database 统一收录多个 CVE，反向追溯更强）；C1 多列占空间但实际查看价值有限；C2 简单但 GHSA / CVE 视觉权重平等，跨平台追溯信号被稀释
    - **2026-09-10 M27.1 重复评估教训修正**（commit `0ddd4e2` 决策 D2 错误归类）：C66-C + C66-D 已 100% 闭环，不应作为 M27.1 任务条目；详见 [experience-archive §六十四 M27.1 重复评估教训](../design/governance/experience-archive-§49-§57-recent-investigation.md#六十四m271c66告警视图增强重复评估教训阶段启动决策时未对照已闭环清单导致规划无效工作20260910commit决策d2错误)

#### 平台批量导入

- **C72 批量导入默认过滤 archived 仓库（与 engine 发现链路口径对齐）** —— 2026-09-21 用户实测反馈触发；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**，等待用户明确决策启动。
  - **目标**：批量导入对话框默认不展示 archived（已归档）仓库——archived 仓库在 GitHub 上为只读，无法接收 push 提交 / 无法创建 PR，导入后无法被 dependfix 修复链路处理。
  - **现状实证**（2026-09-21 代码核对）：
    - **后端** [`importable.get.ts`](../../apps/platform/server/api/repos/importable.get.ts) 过滤链仅 `!repo.private || repo.permissions?.push` + owner 匹配，**不剔除** archived；`archived` 字段已透传但仅作展示。
    - **前端** [`import-repos-dialog.vue`](../../apps/platform/app/components/import-repos-dialog.vue) 三维过滤 = fork（默认 `source`）/ visibility（默认 `all`）/ keyword（默认空），**无 archived 维度**；仅渲染 `· archived` 标签；全选基于 `selectableFilteredRepos`（当前会把 archived 一并勾选）。
    - **口径不一致**：engine 自动发现链路 [`repository-discovery.ts`](../../packages/engine/src/github/repository-discovery.ts) 基础过滤已剔除 archived / disabled / fork——手动批量导入入口与该口径不一致。
  - **决策点（待上收时敲定）**：
    - **方案 A（UI 第 4 维过滤，默认隐藏）**：新增 `archivedFilter`（默认 `active` / 可选 `all`），与既有三维过滤范式一致；保留透明度（用户可显式查看 archived）+ 后端字段不动。
    - **方案 B（后端硬过滤）**：`importable.get.ts` 过滤链直接剔除 archived；UI 零改动成本，但前端无法查看 archived（透明度损失 + 未来「仅扫描不修复」场景受限）。
    - **倾向 A**：用户原话为「**默认**过滤掉」，语义是可切换的默认值，且与既有 fork / visibility 过滤器一致。
    - **附带决策**：`disabled` 仓库是否同批处理（engine 基础过滤同样剔除、importable 未剔除）——建议同批评估，避免二次返工。
  - **验收标准**：
    - [ ] 默认视图下 archived 仓库不出现在候选列表（`filteredRepos` 不含 `archived === true`）
    - [ ] 「全选」不勾选 archived 仓库（`selectableFilteredRepos` 已剔除）
    - [ ] 方案 A 切到「含 archived」时 archived 仓库可见；方案 B 明确不提供该视图
    - [ ] `importable.get.test.ts` 新增 case：GitHub 返回含 archived 仓库 → 断言行为符合所选方案
    - [ ] i18n `zh-CN.json` / `en-US.json` 双语键同步（方案 A 新增 filter label）
    - [ ] e2e `batch-import-filters.e2e.test.ts` 同步第 4 维过滤控件断言（方案 A；`repos-api.e2e.test.ts` importable 仅覆盖 400/404 负路径，不在本候选范围）
    - [ ] `pnpm --filter @dependfix/platform test` + `pnpm lint` + `pnpm typecheck` 0 error
  - **不做什么**：
    - 不删除后端 `archived` 字段（保留审计 / 展示透明性）
    - 不回溯清理已导入的 archived 仓库（本候选只改导入候选集合）
    - 不改动 engine `repository-discovery.ts`（已过滤）
    - 不在本候选内改 MCP `discover_repos`（如与 engine 同源需另评估）
  - **依赖**：无（当前无活跃阶段）；关联 engine `repository-discovery.ts` 已有 archived 剔除口径；关联 M26.2 C67 importable 单端点重构（`include=owners` / `include=repos` 路由）
  - **交付物**：1-2 atomic commits（`feat(platform)` importable archived 默认过滤 + `test(platform)` case + i18n）
  - **风险与缓解**：
    - 风险：5min TTL `cachedFetch`（key=`repos:${credentialId}:${ownerLogin}`）缓存生效期内可能返回旧口径数据；缓解：缓存为进程内 LRU，重启即失效，或评估缓存 key 加过滤版本后缀
    - 风险：已导入的 archived 仓库不受本候选影响；缓解：明确 out-of-scope + 文档说明
  - **复杂度估算**：代码 ~20-40 行（方案 A 前端过滤 + i18n）或 ~5 行（方案 B 后端硬过滤）；测试 2-4 case；文档 0（未触发设计文档硬阈值）
  - **类型平衡**：UX 体验优化（核心） + 🛡️ 一致性对齐（与 engine 口径）
  - **优先级**：P3（非阻塞；archived 仓库占比通常小；engine 自动链路已过滤，仅手动批量导入入口受影响）

## 待人工验收（真实环境，随可用性推进）

> 以下条目属 M7.1 / M7.2 / 发布管线阶段遗留的真实环境验证任务，保留随真实环境可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

## 已知边界与 known-issue

### PrimeVue 4 + Nuxt hydration（持续观察）

- **PrimeVue 4 DataTable + Nuxt SSR hydration 兼容性 bug**（主线 #1 暂停；本节作为持续观察指针）
  - 内容：见主线 #1（[跳转](#主线-1primevue-4--nuxt-hydration-rowgroup-known-issue)）
  - 已知状态：2 个 alerts-rowgroup.e2e.test.ts 测试 `.fixme` 标记；监控 PrimeVue 4 changelog 与 alerts 是否迁移到 `useAsyncData`

### PrimeVue 4 DataTable sort-mode / multisortMeta（持续观察）

- **PrimeVue 类型 vs 运行时不一致** —— `sortMode='multiple'` + `multiSortMeta` 在 PrimeVue 4 类型声明与实际运行时存在不一致（类型允许多键但运行时单字段响应）；具体影响 + 修复方向待下次 neat-freak 批次统一挂接 [code-reviewer code-quality-checklist.md §规范一致性](../../.github/skills/code-reviewer/references/code-quality-checklist.md)。

### SQLite 单文件脆弱性 + TypeORM synchronize 风险（持续观察）

- **背景**：2026-09-01 `apps/platform/data/dependfix.sqlite` 业务数据被清空事故（详见 [经验归档 §五十](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)）。代码内无清空路径，最可能清空来源在代码外部（shell / CI / 运维）。
- **当前状态**：✅ M22 全部 6 原子条目已闭环 + 2026-09-01 archive batch（M22.1 启动期自动备份 + M22.2 db-restore 命令式恢复 + M22.3 db-doctor 自检工具 + M22.4 synchronize opt-in + M22.5 migrationsRun opt-in + M22.6 e2e/fixtures 双门控；详见 [todo-archive.md §M22](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)）。事故防御加固完成；后续"双门控兜底 / 备份保留 / 自检工具"可独立评估升级。
- **持续观察项**：
  - TypeORM 1.x 升级 / 替换为 0.3.x（1.x 已停止维护）—— 当前无明确上收时机，待后续评估
  - PostgreSQL 多写者迁移 —— 当前 single-org 模型限制（依赖 D3 多租户组织体系上线），D3 未上收
  - better-sqlite3 WAL 模式启用 + auto-checkpoint 调整（减少断电时数据丢失风险）—— M22.1 + M23.1 已落地 journal_mode=WAL，但 better-sqlite3 库升级路径未评估
  - SQLite 文件 inode 监控（`fs.watch` 检测 .sqlite 文件被外部 rm / rename 触发紧急备份）—— 与 M22.1 启动期备份互补，可作后续加固
- **规范挂接**：[development.md §5.1.18](./../standards/development.md) + [§5.1.19](./../standards/development.md) + [platform.md §3.6](./../standards/platform.md) + [§3.7](./../standards/platform.md) + [security.md §2.1](./../standards/security.md)

### E2E global-setup 串行场景 ECONNRESET 根因（M22.7 hotfix 衍生 + M23.1 已闭环）

- **M23.1 已闭环**（2026-09-02 commit `2ffaa45` + `74d3dd8` + `9c56fe6`）：候选 ③ SQLite WAL 模式 + busy_timeout 优化已落地（`journal_mode=WAL` + `busy_timeout=5000ms`），详见 [经验归档 §五十三](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十三sqlitewal模式busytimeout治本m227econnreset根因候选③20260902m231commit) + [todo-archive.md §M23.1](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)。**剩余候选 1 待 CI 复现一次确认是否仍存在**（better-auth transaction 关闭时序）—— M24.2 commit `bbb8f30` 已对候选 ② Nitro h3 判定非根因、候选 ④ fixtures 节流登记经验性 follow-up（`apps/platform/server/utils/fixtures-throttle.ts`）；M27.5 commit `b252f93` 落地 better-auth transaction trace 诊断基础设施（`AUTH_TRACE=1` / `E2E_TEST=true` 双开关）；M22.7 helper 层 maxRetries 兜底保留兜底修复 + 治本修复并存。
- **背景**：2026-09-01 CI run 33525721103 E2E job 失败于 global-setup 末尾 `cleanAlertsRowgroupFixtures` → `DELETE /api/e2e/fixtures` → `ECONNRESET`（TCP RST，100ms 内）。handler 逻辑 / 单元测试 / 本地复现均通过，无法本地稳定复现；最可能根因是 better-auth session 写入后 SQLite 连接释放时序与 fixtures DELETE `ensureDatabaseInitialized()` 走同一 singleton 的异步清理窗口竞争。**M22.7 hotfix 已落地 helper 层兜底**（commit `f617b56`：e2e/fixtures helper 加 `maxRetries: 2`，复用 Playwright 1.62 `_sendRequestWithRetries` 内置 250ms 指数 backoff 重试；详见 [todo-archive.md §M22.7](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档) + [经验归档 §五十一](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十一e2e-global-setup-串行多次-setuppage-后首请求-econnreset2026-09-01ci-run-33525721103)）。
- **候选根因排查（部分已闭环）**：按 ROI 排序：
  1. **better-auth 1.7 transaction 关闭时序** —— 在 `getAuth()` 加 `[auth] transaction close trace` 日志 + `ds.transaction` 包装打印 begin/commit 时间戳，CI 复现一次（M27.5 commit `b252f93` feat(platform) 已落地 better-auth transaction trace 诊断基础设施——`E2E_TEST=true` / `AUTH_TRACE=1` 双开关，待 CI 复现一次确认是否仍存在 ECONNRESET）
  2. ~~**Nitro h3 `defineEventHandler` async generator 行为**~~ —— 2026-09-03 M24.2 commit `bbb8f30` 闭环（源码判定非根因：`apps/platform/server/api/e2e/fixtures.{post,delete}.ts` 均为 `async (event) => {}` 普通 async function，非 `async function*`；h3 `_callHandler` 走 `await handler(event)` 返回 `Promise<value>`；详见 [经验归档 §五十七 M24.2 候选 ②](../design/governance/experience-archive-§49-§57-recent-investigation.md) + [docs/standards/platform.md §6 API 规范](../standards/platform.md)）
  3. ~~**SQLite WAL 模式 + `journalMode=delete`**~~ —— 2026-09-02 M23.1 commit `2ffaa45` 闭环（落地 WAL + busy_timeout 优化）
  4. **fixtures API 请求间节流** —— 经验性方案登记 follow-up（M24.2 commit `bbb8f30` 判定"fixtures handler 无节流靠 global-setup 串行调用避免并发"；调用频次低（global-setup ≤ 2 次）不存在资源竞态；如未来 e2e 复现 fixture 并发问题按经验性模板 `apps/platform/server/utils/fixtures-throttle.ts` 加 100ms 节流；详见 [docs/standards/platform.md §3.7.1 fixtures API 无节流默认 + 经验性节流方案](../standards/platform.md#371-fixtures-api-无节流默认--经验性节流方案)）
- **wisdom 沉淀**：见 .session/wisdom.md 2026-09-01 M22.7 hotfix 段 `pattern-playwright-maxRetries-econnreset`（Playwright 仅对 `e.code === 'ECONNRESET'` 重试的源码实证 + test helper 兜底模式 + 4 项治理检查点登记）

### Playwright 1.62 fixture pool 注入 cookie 根因（M22.8 hotfix 衍生 + M23.2 已闭环）

- **M23.2 已闭环**（2026-09-02 commit `09c3dee` + `e0f9b29` + `68b973d` + `aa76ad4`）：候选 ① Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证已落地（workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯：test.use → suite._use → FixturePool(parent._use, ..., pool) 继承链 + FixturePool constructor 注册继承父池 registrations）+ helper 抽取（apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts 封装 `browser.newContext({ storageState: { cookies: [], origins: [] } })` 标准模式）。详见 [经验归档 §五十四](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十四playwright-1-62-fixture-pool-跨-scope-隐式行为源码实证--m232-helper-抽取20260902m232-commit) + [todo-archive.md §M23.2](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)。**剩余候选 2 待非 sandbox 环境重跑 e2e 时同步排查**（better-auth 中间件 Set-Cookie 路径扫描）；**候选 3 已因 Playwright 1.62 → 1.63 升级场景变更而失效**（持续观察 1.63 fixture pool 行为）。
- **背景**：2026-09-02 CI run 33533376712 E2E job 在 M22.7 修复 global-setup 后跑满 6 分钟，失败 2 个用例（`Expected: 401, Received: 200`）：
  - `tests/e2e/credentials-api.e2e.test.ts:283 › 未认证 GET /api/credentials → 401`
  - `tests/e2e/repos-api.e2e.test.ts:447 › 未认证 GET /api/repos → 401`
  网络追踪实证两个失败用例的 `context-options` 携带完全相同的上游 session cookie（`i18n_locale=zh-CN` + `better-auth.session_token=LhAh2mxu4rTjo27Wc8wLyeDpspBq4MnE...`，expires 1790873050 = 29 天后），但测试代码是 `browser.newContext()` 无参——最可能是 Playwright 1.62 fixture pool 在 describe 块 scope 内将 `test.use({ storageState })` 隐式注入到所有 `browser.newContext()` 调用（含未显式传 storageState 的手动创建）。**M22.8 hotfix 已落地测试层兜底**（commit `bdcd900`：2 个测试在 `browser.newContext()` 调用中显式传 `storageState: { cookies: [], origins: [] }`，Playwright 1.62 文档推荐的"unauthenticated API call"模式；详见 [todo-archive.md §M22.8](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档) + [经验归档 §五十二](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十二playwrighttestuse存储状态传染导致未认证api测试收到20020260902cirun33533376712)）。
- **候选根因排查（部分已闭环）**：按 ROI 排序：
  1. ~~**Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证**~~ —— 2026-09-02 M23.2 commit `09c3dee + e0f9b29` 闭环（fixture pool 源码追溯 + helper 抽取落地）
  2. **better-auth 中间件对非 /api/auth/* 端点返回 Set-Cookie 路径扫描** —— 确认 session refresh 不会污染下游 context（M24.2 commit `bbb8f30` 部分覆盖 better-auth transaction close 时序判定已治本，但 Set-Cookie 路径扫描未单独闭环）；CI 偶发场景下 helper 层兜底（`tests/e2e/helpers/unauthenticated-api.helper.ts` 显式空 storageState）保留
  3. ~~**Playwright 1.62 vs 1.61 / 1.60 fixture pool 行为对比**~~ —— 场景已变更：Playwright 已从 1.62 升级到 `@playwright/test@^1.63.0`（`apps/platform/package.json`），原 1.62 vs 1.61/1.60 三向对比需求不再适用；改为持续观察 1.63 fixture pool 行为是否仍存在跨 scope 隐式传播（待 CI 偶发场景复现时同步验证）
- **wisdom 沉淀**：见 .session/wisdom.md 2026-09-02 M22.8 hotfix 段 `pattern-playwright-browser-newContext-cookie-injection`（Playwright 1.62 fixture pool `test.use` 隐式传播 + "未认证 API 测试"显式空 storageState 标准模式 + 3 项治理检查点登记）——M23.2 阶段增量（fixture pool 跨 scope 源码实证 + helper 抽取模式）追加到现有 pattern，**避免新增 pattern 重复登记**

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | [todo.md](todo.md)（当前无活跃阶段；M26 已 2026-09-10 归档，详见 [todo-archive.md §M26](todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档) + [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 3 个完整段：M26 指针 + M23 + M22 完整段；M19/M20/M21 预防性分片迁出至 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)；早期阶段见 [archive/](archive/)） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M26 段已 2026-09-10 完整闭环 + 归档；M26 ahead=0 / 7 原子条目 × 23 commits + 配套 13 commits = 36 commits 全部已推送 origin/master；详见 [roadmap.md §M26](roadmap.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀2026-09-08-用户决策方案-a--m264-拆分--m264c-e2e-适配--2026-09-10-已闭环--归档)） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构；**M26 归档批次同步清理**：C67（已 M26.2 闭环）/ C68（已 M26.1 闭环）/ C69（已 M26.3 闭环）/ M25 follow-up #3 primeicons 降级（已 M26.4a 闭环）/ M25 follow-up #4 baseline 22 warnings 治理（已 M26.4b 闭环）/ M25 follow-up #5 经验归档沉淀（已 M26.5 闭环）全部已闭环移除） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
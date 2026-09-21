# 待办积压 (Backlog)

> 本文档维护尚未进入正式阶段执行面的统一候选池，按 **长期主线任务** / **周期性回归验证层** / **短期与一次性候选任务** / **已知边界与 known-issue** 四象限区分。当前阶段任务见 [todo.md](todo.md)；已闭环归档见 [todo-archive.md](todo-archive.md)。
>
> **维护规则**：
> 1. 新功能需求、非阻塞优化与长期治理事项优先写入本文件，而不是直接写入 `todo.md`；已闭环条目从 backlog 移除，由 [todo-archive.md](todo-archive.md) 统一维护。
> 2. backlog 必须区分四类：长期主线（可跨阶段保留）/ 周期性回归验证层（健康检查层）/ 短期与一次性候选（评估后上收或关闭）/ 已知边界与 known-issue（CI / 浏览器兼容性等持续观察项）。
> 3. 长期主线被某阶段抽取后不删除主线卡片，只补记当前状态与下一次可切片方向；**若该主线验收条件已达成 / 目标被某阶段闭环，则按 [规划规范 §4.4 第 11 条](../standards/planning.md#44-大批量归档批次操作规范)「长期主线卡闭环同步」整卡删除或改写状态**。
> 4. 周期性回归验证层不是"一个任务"，而是所有长期主线的健康检查层；它按固定节奏运行，不参与阶段切片容量竞争。
> 5. 短期候选正式上收阶段后从 backlog 移除；评估为"暂不实现"的候选直接关闭并在归档中保留决策记录。
> 6. 当前仓库的 backlog 以中文为唯一事实源。

## 长期主线任务（可跨阶段保留）

> **状态口径**：进行中 / 观察中 / 暂停 / 已关闭。

### 主线 #1：network-audit 默认白名单持续扩展问题（G1）

- **目标**：把 network-audit 默认白名单从"按次新增"演进为"按域名 / SRI 哈希 / 输出区分"的可持续治理方案，避免每次构建工具跨 major 升级都需补白名单。
- **状态**：观察中。
- **当前进度**：候选方向 3（命令输出 URL 与真实外联区分）已落地；整体治本方向未完成。
- **下一次可切片方向**（任一触发时重新评估）：
  1. 构建工具生态文档站类目预置白名单（rolldown.rs / swc.rs / rust-lang.org 等）—— **候选方向 3 落地后优先级降低**：合法外联不会再被误判，新增白名单诉求应转为"真实注册表域"申请而非"构建工具文档站"
  2. 按 SRI 哈希钉资源（推荐域动态发现）
- **验收**：默认白名单不再按次新增；verification 阶段合法外联不被误判（已达成）；候选方向任一实施或主线整体评估为长期保留后关闭本主线条目

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
| #1 network-audit 默认白名单 | ✅ `packages/engine/src/runners/verification-runner.test.ts` + `network-audit.test.ts` | ✅ `pnpm run` verification job |

> 标注 `—` 的条目表示当前缺少自动化回归覆盖，是后续回归层扩面的候选方向。

### 漂移路由规则

回归验证发现的问题不自行修复，而是按以下规则路由到对应长期主线或短期候选：

| 回归发现问题 | 路由目标 |
|:---|:---|
| network-audit 真实注册表域新增诉求 / 命令输出 URL 阻断 regression | → 长期主线 #1（network-audit 默认白名单） |
| CI 失败 | → 当前阶段批次（无活跃阶段时登记 backlog 远期） |

## 短期 / 一次性候选任务（上收后去重）

> 共享说明：本区块条目当前均处于"候选评估中"或"延期暂缓"状态；正式上收阶段后从 backlog 移除并归档至 [todo-archive.md](todo-archive.md)。评估为"暂不实现"的候选直接关闭。

### 延期 / 暂缓项

- **T705 生产级部署**（PostgreSQL + Helm + Sentry）—— 2026-08-12 用户指示暂缓排期
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **C30 Publish Docker build job 失败排查** —— 2026-08-18 用户决策暂缓（双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作）；恢复条件：① master 分支 push 频率显著提升；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复
- **§M14.2 PrimeVue 4 → 5 升级评估** —— 2026-08-26 dependabot #49 触发评估，Nuxt build 报 `Rolldown failed to resolve import "primevue/inputcolor"`（v5 改组件导入约定）。`@primevue/nuxt-module` 5.x + `@primeuix/themes` 3.x 需联动升级，影响 `apps/platform/nuxt.config.ts` 及可能的 DataTable 等组件用法。PR 已关闭，恢复条件：① 评估 PrimeVue 5 migration guide 工作量；② 与 PrimeVue 4 + Nuxt hydration 兼容性问题的修复路径联动决策——该问题已由 alerts 迁移 `useAsyncData` 解决，可独立评估升级；③ 用户明确恢复
- **db-restore 审计未采纳项（M22.2 落地遗留）** —— 2026-09-01 M22.2 A 阶段审计 S-1 第 2/3/4 项 + S-2 未采纳：① `inspectSqliteFile` 能打开但 `integrity_check != 'ok'` 分支未覆盖（需用 `PRAGMA writable_schema` 构造损坏 fixture）；② 恢复后 `integrity_check` 失败分支未覆盖（需 mock 注入）；③ sidecar `unlinkSync` 部分失败的 `removedSidecars` 状态一致性未覆盖；④ `--from` / `--to` 未做路径规范化（不校验 `..` / 符号链接）。当前 `db-restore` 是本地管理员工具，攻击面极低；恢复条件：脚本被远程 / 容器自动化触发，或补测试成本下降（对应实现见 `apps/platform/server/database/scripts/db-restore.ts`）
- **ScanResult 数据层去重（upsert 唯一索引）** —— 2026-09-02 M23.3 决策暂缓：应用层去重（fingerprint + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）已实施且满足当前业务需求；恢复条件：出现"fix 复用同一 `scan_run_id` 跨次刷新"或"历史 fixStatus 跨次保留"需求时迁移到数据层 upsert（关联 [todo-archive.md §M23](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)）

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

#### PR 管理

- **B2** 固定分支单线设计（独立平台部署后修复频率上升，需要固定修复分支如 `dependfix/auto-fix` 避免频繁向 master 提交 PR；触发：v1.0.0 后 M12 平台 UX 修复链路上线；关联：T210 指纹方案整合复用/重建策略 + force push 语义）

#### 修复交付链路（验证 / commit / push / PR）

- **C74 接线 `getCommitAuthor()`，让 GitHub App 凭据路径使用真实 bot 身份** —— 同 M29.2（原 C73）分析衍生；评估完成待上收；**不带 M\d+ 阶段编号**。
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
  - **依赖**：AuthProvider 抽象（M18.x）；关联 [c22-pat-backward-compat.md](../design/governance/c22-pat-backward-compat.md)；关联 M29.2（同一 commit 身份治理批次）
  - **交付物**：1-2 atomic commits（`feat(engine)` getCommitAuthor 接线 + `test(engine)` case）
  - **风险与缓解**：变更 commit author 可能触发目标仓库保护规则（要求签名 commit / 限定作者）导致 PR 被拒；缓解：先在单一测试仓库验证，并与 M29.2 的签名策略一并评估
  - **优先级**：P3（当前 PAT 路径功能可用；App 路径身份不真实属审计一致性 / 体验问题）
  - **复杂度估算**：代码 ~20-40 行（author 透传 + botLogin 传递）；测试 3-5 case；文档 0（未触发设计文档硬阈值）

- **C76 平台侧暴露验证命令配置（与 CLI `--commands` 对齐）** —— 同 M29.3（原 C75）分析衍生；评估完成待上收；**不带 M\d+ 阶段编号**。
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
  - **依赖**：关联 M29.3（默认链口径）；关联 M29.2（同属修复交付链路）；关联 [`docs/standards/platform.md`](../standards/platform.md)
  - **交付物**：1-2 atomic commits（`feat(platform)` 配置透传 + `test(platform)` case）
  - **风险与缓解**：自定义命令构成命令执行面；缓解：权限门槛 + 审计留痕 + 文档风险声明，沙箱落地后再评估放宽
  - **优先级**：P3（当前默认链可用；无平台配置不影响基础能力）
  - **复杂度估算**：代码 ~40-80 行；测试 3-5 case；文档 1 处（platform.md）

- **C82 git 签名语义边界（push.gpgSign 隔离 + commit 签名 opt-in）** —— 2026-09-21 M29.2 A 阶段审计 warning / suggest 衍生；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **目标**：把 dependfix 与 git 签名的关系收敛为**显式策略**——① push 链路同样不受宿主 `push.gpgSign` 污染；② 是否产出「签名 commit」由配置决定，而非硬编码关闭。
  - **优先级**：P3（非阻塞；① 需宿主显式开启 `push.gpgSign` 才触发，② 需目标仓库强制签名保护规则才需要）
  - **范围**：push 侧**全部 4 处未隔离调用点**（实测）——`packages/engine/src/github/pr-creator.ts:228`（`pushBranch`）/ `apps/platform/server/services/executor/platform-delivery.ts:126`（平台接管交付路径）/ `apps/platform/server/services/executor/container-executor.ts:109`（`pushFixBranch`）/ `:129`（`cleanupRemoteBranch`，`--delete`）；commit 侧 `stageAndCommit` 已 M29.2 落地；另含配置层（若做 opt-in）
  - **现状实证**（2026-09-21 实测）：
    - **① push 签名未隔离**：本地 bare remote 复现——宿主 `push.gpgSign=true`（**单独设置即触发**，与服务端 `receive-pack` 证书协商能力相关，不经过 `gpg.program`）→ `git push` 报 `fatal: the receiving end does not support --signed push` → `fatal: the remote end hung up unexpectedly`；追加 `-c push.gpgSign=false` 后 push 成功。实测未隔离调用点 4 处（见「范围」）；平台部署场景由 platform 侧接管 push，污染面主要在 platform 路径。
    - **② 签名硬编码关闭**：`stageAndCommit` 已固定传 `-c commit.gpgsign=false`（M29.2 落地），无 opt-in 入口；目标仓库若要求签名 commit，dependfix PR 无法满足。
  - **决策点（待上收时敲定）**：
    - **push 隔离方式**：与 commit 同法（`-c push.gpgSign=false`），或抽为统一的「签名语义」常量避免两处漂移。
    - **是否提供 commit 签名 opt-in**：若提供，需决定密钥来源（用户配置的 signingkey / 目标仓库要求）、失败语义（签名失败是否回滚交付）、暴露层（CLI flag / env / action input / 平台配置——按「交付检查所有暴露层」四层对齐）。
  - **验收标准**：
    - [ ] 宿主 `push.gpgSign=true` 时 push 仍成功（新增 case 覆盖；触发条件不涉及 `gpg.program`）
    - [ ] 签名策略（关闭 / 可开启）在四层暴露面口径一致（CLI / env / action / 文档表），或明确记录「不提供 opt-in」的决策依据
    - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
  - **不做什么**：不改宿主 `~/.gitconfig`；不关闭用户手工 git 操作的签名；不回溯已产生的 commit / push；不在本候选内做目标仓库保护规则的预检
  - **依赖**：关联 M29.2（commit 侧已闭环，本候选为同根因的 push 侧 + 策略侧）；关联 C74（commit author 变更可能触发仓库保护规则，含「要求签名 commit」风险，与本候选互引）
  - **交付物**：1-2 atomic commits（`fix(engine)` push 隔离 + 可选 `feat(engine)` 签名 opt-in）
  - **风险与缓解**：若提供 opt-in，签名失败会成为新的交付失败点；缓解：默认保持关闭（现状），仅在显式开启时对签名失败做硬失败 + 明确错误文案
  - **复杂度估算**：push 隔离 ~2 行；opt-in 需先出方案（配置层 + 四层暴露 + 失败语义）再评估

- **C83 验证链的「既有失败基线」判定（区分修复引入的失败与修复前已存在的失败）** —— 2026-09-21 M29.3 落地 test 纳入默认链时显式登记的已知限制；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **目标**：目标仓库在修复前就存在的验证失败（尤其测试套件长期红）不再被计入本次修复，避免合法修复被门禁回滚、使仓库变得「不可用」。
  - **优先级**：P3（非阻塞；当前口径与既有 install/lint/build 的「假定 pristine 检出可通过」一致，仅在目标仓库测试长期红时暴露）
  - **范围**：`packages/engine/src/app/helpers.ts`（`verifyProject`）+ `packages/engine/src/app/repo-fix.ts`（修复流程接入点）+ `packages/engine/src/runners/verification-gate.ts`（判定口径）
  - **现状实证**（2026-09-21）：
    - M29.3 已把 `test` 纳入默认验证链（`DEFAULT_VERIFY_COMMANDS`，唯一事实源）；`repo-fix.ts` 以 `verifyActions.every((a) => a.success)` 判定 `verificationPassed`，任一命令失败 → `enforceVerificationGate` 回滚。
    - 链中**无基线概念**：修复前即为红的命令，其失败会计入本次修复。既有 install/lint/build 已隐含同样假设（pristine 检出可通过），M29.3 只是把该假设扩展到 test。
    - 已知限制已写入 [docs/design/modules/dependency-fixer.md](../design/modules/dependency-fixer.md)（「既有失败基线未做区分」）。
    - **test 与 install/lint/build 的基线红概率不对称**，且 test 引入三条**此前不存在**的新失败路径（此前任何文档 / backlog 均未登记）：
      1. **占位 test 脚本**：`npm init` 默认生成的 `"test": "echo \"Error: no test specified\" && exit 1"` 极常见——按当前口径会被判失败并回滚；
      2. **测试依赖外部资源**：需网络 / 密钥 / 浏览器（Playwright 等）的套件在 dependfix 的受限环境中必然失败；
      3. **test 超单命令超时（10 分钟）**：大型套件超时被判失败 → 回滚（该路径已在 `verification-runner.ts` 超时常量注释中登记）。
  - **决策点（待上收时敲定）**：
    - **基线时机**：修复前在 pristine 检出上跑一遍链（成本翻倍）／只对 test 做懒基线（仅当 test 失败时才回跑 pristine 基线）／按目标仓库配置豁免。
    - **判定粒度**：命令级（该命令基线失败则从本次判定中移除并记审计）vs 仓库级（基线失败 → 跳过该仓库验证并显式告警）。
    - **审计口径**：新增错误码（如 `PRE_EXISTING_FAILURE`）以便报告单列「基线已红」。
  - **验收标准**：
    - [ ] 修复前即为红的命令不再导致本次修复被回滚，且报告显式区分「本次引入的失败」与「基线已存在的失败」
    - [ ] 单测覆盖：基线红 + 修复后仍红（不归因本次）／基线绿 + 修复后红（归因本次并回滚）
    - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
  - **不做什么**：不改单命令超时；不引入 CI 等价全量（coverage / e2e）；不在本候选内做目标仓库 CI 状态查询
  - **依赖**：关联 M29.3（触发实证：test 纳入默认链后暴露该限制）；关联 `verification-gate.ts`（回滚判定）
  - **交付物**：待方案敲定后评估（1-3 atomic commits）
  - **风险与缓解**：懒基线需在修复后回跑 pristine 状态，涉及工作区切换（`git stash` / 临时 worktree），实现复杂且易引入新的状态污染；缓解：优先评估「命令级基线 + 修复前一次性采样」的简单形态，避免修复后回跑
  - **复杂度估算**：方案未定；命令级一次性采样约 40-80 行 + 修复流程接入

#### Code Scanning 规则体系

- **C15 Code Scanning B 类规则真实仓库样本核对（第二阶段）** —— 2026-09-11 M28.3 第一阶段已闭环（commit `99302b5`：`sample-collector.mjs` 采集脚本 + 32 种子仓库跨 5 语言 fixture 占位 + 报告框架 `docs/research/code-scanning-b-class-samples.md`）；**剩余未闭环**：实际 GitHub API 样本采集 + 按需规则分级修正（`go/*` / `ruby/*` 补 `SUGGESTED_RULES`）。
  - **恢复条件**：CI / staging 环境具备 `GITHUB_TOKEN` 时执行 `node packages/engine/src/code-scanning/scripts/sample-collector.mjs --output=real-samples.json`，再据采集结果修正规则分级。
  - **不做**：不改 A/B/C 分层结构；不在无真实样本时臆测规则 id 变体。
  - **关联**：[todo-archive.md §M28](todo-archive.md#m28-治理债清理--能力扩展m281-m285-全部已闭环--2026-09-11-归档)（M28.3 第一阶段记录）+ [docs/research/code-scanning-b-class-samples.md](../research/code-scanning-b-class-samples.md)（报告框架）
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 M\d+ 阶段编号**：等待用户明确决策启动

#### 网络优化

- **C68 Git 代理 / 镜像方案** —— 2026-09-04 实测发现：部分仓库（momei 25MB / caomei-auth 9MB）clone 持续超时（120s+），而大仓库（rss-impact-web 215MB）反而 12s 完成。根因：服务器到 GitHub CDN 网络质量差（实测 GitHub 下载速度 14KB/s vs 通用网络 629KB/s）。当前临时方案（超时 300s + 重试 3 次 + partial clone `--filter=blob:none`）可缓解但不治本。**只有代理才能根本解决网络问题**（tarball API 仍走 GitHub 域名，同样受限）。候选方案：
  - **方案 A：HTTP 代理** —— 配置 `http.proxy` / `https.proxy` 指向代理服务器；需运维提供代理基础设施
  - **方案 B：GitHub 镜像** —— 使用 GitHub Enterprise 镜像或自建 Git 镜像（如 Gitea/GitLab mirror）
  - **方案 C：Git 缓存代理** —— 部署 git-proxy 或 gitcache 缓存已 clone 的仓库，后续请求走缓存
  - **触发条件**：① 用户部署环境有可用代理；② clone 超时成为频繁阻塞问题；③ 运维提供镜像基础设施
  - **验收**：momei / caomei-auth clone 耗时 < 30s；无 TLS 错误；超时率 < 5%

#### 工作流

- **T905** git worktree 并行开发预案（触发条件：多 agent 并行开发成为常态；当前单 agent 工作流无需启用）

#### 开发工具链

- **C80 devDependencies 链漏洞的 CI 阻断语义（覆盖方式部分已上收 M29.9）** —— 2026-09-21 M29.1 审计剩余风险实证触发；**部分已上收**，剩余决策项待用户明确；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **✅ 已上收部分（M29.9 / 原方案 A，2026-09-21 用户决策）**：覆盖方式已落地（commits `70d31c0` + `c214ace`），详见 [todo.md §M29.9](todo.md)（命令、注释口径与实测证据不在此重复）。
  - **剩余未闭环（本条目当前范围）**：**是否启用阻断语义**——即去掉 `|| true` 让 devDeps 漏洞阻断 Test job，或维持「仅信号」。
  - **目标**：决定 devDeps 链漏洞在 CI 中是「信号」还是「门禁」，并落地对应语义 + 观察期策略。
  - **优先级**：P3（非阻塞；当前为信号级已可观测，阻断语义属策略选择）
  - **范围**：`.github/workflows/test.yml`（audit 步骤的 `|| true` 与 `--audit-level` 取值）
  - **现状实证**（2026-09-21 实测，M29.9 落地后）：
    - `test.yml` audit 步骤现为 `pnpm audit --audit-level=moderate || true`，注释显式标注「阻断语义当前未启用」。
    - **告警通道不缺失**：`vulnerability-alerts` → 204（已启用）；`automated-security-fixes` → `{"enabled":true}`；devDeps 漏洞已由 Dependabot 告警通道覆盖（当时 3 条 open alert 即 M29.1 修复的 vite 三连）。
    - **但告警通道 ≠ 修复通道**：Dependabot 无法在 `vitepress` 声明的 `vite: ^5.4.14` 范围内修复（正是 M29.1 必须手写 override 的原因）——故「阻断」相对「告警」的增量价值 = **同步拦截 + 阻止合并**。
    - 原注释「hard-fail 由 `dependabot.yml` 处理」曾混淆两个特性（`dependabot.yml` 只配 version updates；security alerts / updates 是 repo 级设置），该口径已在 M29.9 修正。
  - **决策点（待用户敲定）**：
    - **方案 B（阻断）**：去掉 `|| true` → devDeps 漏洞红掉 Test job。
    - **方案 C（观察期）**：维持 `|| true` 但显式标注观察期截止条件（如「连续 N 次 CI 无 devDeps 告警后转阻断」）。
    - **阈值**：`--audit-level` 是否由 moderate 收紧到 high / critical。
    - **registry 抖动防护**：`pnpm audit` 的 registry 类错误（网络 / 限流）与「真有漏洞」需区分——转阻断前应评估 `--ignore-registry-errors`（pnpm 官方说明：registry 报错时返回 exit code 0，适用于 CI 场景），避免非漏洞问题红掉 CI。
  - **验收标准**：
    - [ ] 按用户决策落地阻断语义（方案 B 或 C），并在 workflow 注释中写明依据与观察期条件
    - [ ] 若转阻断：CI 主链路不因存量告警失败（存量清零或显式豁免清单）；且 registry 类错误不误伤（`--ignore-registry-errors` 或等价防护）
    - [ ] workflow 变更后跑一次真实 CI（或 `act` 本地模拟）验证步骤生效
    - [ ] 若涉及 `--audit-level` 调整，同步注释口径
  - **不做什么**：不引入 Snyk / 第三方 SCA 服务；不改 `pnpm-workspace.yaml` overrides 策略；不在本候选内清理存量告警（当前全量 audit 实测 0 告警）；不重复处理覆盖方式（已 M29.9 落地）
  - **依赖**：关联 M29.1（触发实证）+ M29.9（覆盖方式已落地，本条目仅剩阻断语义）；关联 `dependabot.yml` 与 repo 级 security alerts 设置（告警通道）
  - **交付物**：1 atomic commit（`ci(test)` 阻断语义调整 + 注释口径）
  - **风险与缓解**：转阻断可能因上游新披露 devDeps 漏洞突然红掉 CI、阻塞无关 PR；缓解：优先方案 C（观察期）而非直接阻断，存量清零后再评估
  - **复杂度估算**：CI 配置 ~2-5 行；文档 0（注释随行）；测试 0（配置类，以 CI 实跑实证）

- **C81 源码 / 配置注释中的孤立规划编号清理（存量）** —— 2026-09-21 M29.9 A 阶段审计 B1 衍生；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **目标**：清理存量源码 / 配置 / 脚本注释中**无文档指针的孤立规划编号**，使其符合 [开发规范 §3 注释规范](../standards/development.md)「禁止开发流程编号标记」（例外仅两类：代码内真实常量、带文档路径或章节名的导航指针）。
  - **优先级**：P3（非阻塞；属治理债——规则本身由 D 阶段自检 + A 阶段必查项强制，但**仅作用于新增 / 修改文件**，故存量长期沉积）
  - **范围**：全仓库非 `docs/` 的源码 / 配置 / 脚本注释（扫描面量级约 600 至 1000 文件，随 skip 集与扩展名白名单浮动：`.github/workflows` / `packages` / `apps` / `scripts` / 根与包级 eslint 配置）
  - **现状实证**（2026-09-21 启发式扫描；**量级估算，不复述单一精确数字**）：
    - **判定口径**：扫描「非 `docs/` 的源码 / 配置 / 脚本」（skip：`node_modules` / `dist` / `.nuxt` / `pnpm-lock`），行级判定「同行是否含 `docs/` / `.md` / `§` / `todo.md` 等文档指针」——带指针者为合规例外，无指针者为孤立疑似违规。
    - **两组独立扫描（行口径，量级一致）**：执行角色扫描得孤立疑似违规 **427** 行；A 阶段审计独立扫描得 **310** 行。两者 skip 集与扩展名白名单不同，文件基数在数百至千余量级浮动。
    - **量级结论**：孤立命中约在 **300 至 430** 区间浮动；**任一量级均远超 [§1.1 任务粒度约束](../standards/planning.md#11-硬性约束) 单批阈值**，故「必须分批」的结论不依赖精确值。上收首步即产出可复现的检测脚本并固化口径（见决策点与验收标准）。
    - **样例**（位置与文本已核对）：`packages/core/src/alerts/index.ts:48`「上游告警唯一 ID（M20 新增）」；`packages/engine/src/code-scanning/scripts/sample-collector.mjs:5`「（M28.3 / C15）」；`apps/platform/server/api/dashboard/stats.get.ts:10`「M20.5 调整（todo.md §M20.5）」——末例首段孤立、后段合规，说明需按**注释块粒度**而非行级判定。
    - **已知误报来源**：真实常量（如 HTTP 错误码 `E401`）、非规划语义的短编号；上收时须先固化白名单与判定粒度。
  - **决策点（待上收时敲定）**：
    - **判定粒度**：行级 vs 注释块级。
    - **真常量白名单**：如何区分规划编号与代码内真实常量（HTTP 错误码 `E401` 等）。
    - **分批策略**：孤立命中（300 至 430 量级）远超 [§1.1 任务粒度约束](../standards/planning.md#11-硬性约束) 单批阈值 → 需按包 / 目录切分子批次（每批 < 10 文件）。
    - **清理方式**：仅删除编号保留解释正文，或改写为带文档路径的导航指针（后者保留可追溯性）。
  - **验收标准**：
    - [ ] 固化检测命令或脚本（含白名单 + 注释块级判定），输出可复现的孤立命中清单
    - [ ] 按子批次清理至孤立命中 0（带文档指针的导航指针保留）
    - [ ] 批量替换遵守 [AI 协作规范 §1.2 第 6 条批量替换纪律](../standards/ai-collaboration.md)（先改 1 个代表性文件 → typecheck + diff 审查 → 再铺开）
    - [ ] 每子批次 `pnpm lint` + `pnpm typecheck` + 定向测试通过，且不丢失编号后的解释正文
  - **不做什么**：不清理带文档路径 / 章节名的导航指针（合规例外）；不清理代码内真实常量；不改 `docs/` 下的规划与治理文档（编号在其语境中合法）；不在本候选内改动 D / A 阶段自检规则本身
  - **依赖**：关联 M29.9（A 阶段审计触发）；关联 [开发规范 §3 注释规范](../standards/development.md) + [经验归档 §十六](../design/governance/experience-archive-§1-§21-spec-compliance.md#十六规范存在--被执行编号标记重复违规3c714cc1--t405-回归)（历史违规案例）；关联既有清理先例 commit `1dcfc3c`（源码注释与脚本登记的失效规划文档指针修复）
  - **交付物**：待分批方案敲定后评估（预计 3-6 子批次，每子批次 1 atomic commit）
  - **风险与缓解**：批量删除编号可能丢失可追溯性；缓解：优先「改写为导航指针」而非纯删除，并保留编号后的解释正文；另需防批量替换误伤（按 §1.2 第 6 条纪律执行）
  - **复杂度估算**：注释 300 至 430 量级（跨多包，必须分批）；测试 0（注释类，以 lint + typecheck + 复扫 0 命中为证据）；文档 0

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

定时任务真实环境验证（**实施部分已由 M21.5 闭环** —— commit `9850e24` schedules CRUD e2e 6 case + `b9e35f7` BullMQ upsertJobScheduler 短间隔集成测试 `describe.skipIf` 门控）：

- 真实 Redis >= 5 环境下 `TEMP_REDIS_INTEGRATION=true` 跑 BullMQ 集成测试
- staging / 后台服务下的调度轮询体验与 stale state 处理验证

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

## 已知边界与 known-issue

### PrimeVue 4 DataTable sort-mode / multisortMeta（持续观察）

- **PrimeVue 类型 vs 运行时不一致** —— `sortMode='multiple'` + `multiSortMeta` 在 PrimeVue 4 类型声明与实际运行时存在不一致（类型允许多键但运行时单字段响应）；正确写法与触发条件见 [platform.md §7.1](../standards/platform.md#71-primevue-4-集成实践)，规范一致性检查点见 [code-reviewer code-quality-checklist.md §规范一致性](../../.github/skills/code-reviewer/references/code-quality-checklist.md)。

### SQLite 单文件脆弱性 + TypeORM synchronize 风险（持续观察）

- **背景**：2026-09-01 `apps/platform/data/dependfix.sqlite` 业务数据被清空事故（详见 [经验归档 §五十](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)）。代码内无清空路径，最可能清空来源在代码外部（shell / CI / 运维）。
- **防御现状**：事故防御加固已完成（M22 全部 6 原子条目闭环，详见 [todo-archive.md §M22](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)；启动期备份 / db-restore / db-doctor / synchronize + migrationsRun 双 opt-in / e2e fixtures 双门控），规范见下方"规范挂接"。
- **持续观察项**：
  - TypeORM 1.x 升级 / 替换为 0.3.x（1.x 已停止维护）—— 当前无明确上收时机，待后续评估
  - PostgreSQL 多写者迁移 —— 当前 single-org 模型限制（依赖 D3 多租户组织体系上线），D3 未上收
  - better-sqlite3 WAL 模式启用 + auto-checkpoint 调整（减少断电时数据丢失风险）—— 已落地 `journal_mode=WAL`，但 better-sqlite3 库升级路径未评估
  - SQLite 文件 inode 监控（`fs.watch` 检测 .sqlite 文件被外部 rm / rename 触发紧急备份）—— 与启动期备份互补，可作后续加固
- **规范挂接**：[development.md §5.1.18](../standards/development.md) + [§5.1.19](../standards/development.md) + [platform.md §3.6](../standards/platform.md) + [§3.7](../standards/platform.md) + [security.md §2.1](../standards/security.md)

### E2E global-setup 串行场景 ECONNRESET 根因（持续观察）

- **已落地（部分闭环）**：~~候选 ②（Nitro h3 async generator）~~ 已 M24.2 commit `bbb8f30` 判定非根因；~~候选 ③（SQLite WAL + `busy_timeout`）~~ 已 M23.1 commit `2ffaa45` 治本落地；候选 ④（fixtures API 节流）为 M24.2 commit `bbb8f30` 登记的经验性 follow-up；helper 层兜底 `maxRetries: 2` 已 M22.7 commit `f617b56` 落地。
- **剩余未闭环**：候选 ① better-auth 1.7 transaction 关闭时序 —— 诊断基础设施已 M27.5 commit `b252f93` 落地（`AUTH_TRACE=1` / `E2E_TEST=true` 双开关），待 CI 复现一次确认是否仍存在 ECONNRESET。
- **触发条件**：CI E2E job 再次出现 global-setup 末尾 `DELETE /api/e2e/fixtures` → `ECONNRESET` 时，开启 `AUTH_TRACE=1` 跑一次定位；如复现 fixture 并发问题按经验性模板 `apps/platform/server/utils/fixtures-throttle.ts` 加 100ms 节流（见 [platform.md §3.7.1](../standards/platform.md#371-fixtures-api-无节流默认--经验性节流方案)）。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | [todo.md](todo.md)（M29 修复交付链路正确性 + 能力扩展规划中，2026-09-21 用户决策方案 M29-B；M28 已 2026-09-11 归档，详见 [todo-archive.md §M28](todo-archive.md#m28-治理债清理--能力扩展m281-m285-全部已闭环--2026-09-11-归档) + [archive/todo-archive-phases-m28.md](archive/todo-archive-phases-m28.md)） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近阶段完整段 + 指针段；早期阶段见 [archive/](archive/)） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M28 全部已完成归档；M29 规划中） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
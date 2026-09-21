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

- **C79 ESLint 未忽略 VitePress 生成物（`docs/.vitepress/cache`）** —— 2026-09-21 M29.1 dev 冒烟实证触发；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **目标**：开发者本地跑过 `pnpm docs:dev`（生成 Vite 依赖预构建缓存）后 `pnpm lint` 仍返回既有 baseline，而非因 ESLint 扫描缓存产物爆出上千条 error。
  - **优先级**：P3（非阻塞——CI 不跑 `vitepress dev`，故 CI 不受影响；仅本地 devEx 缺口）
  - **范围**：`eslint.config.js`（`ignores` 段）
  - **现状实证**（2026-09-21 实测）：
    - `eslint.config.js` `ignores` 已含 `**/dist/**` / `**/.nuxt/**` / `**/.output/**` / `**/.data/**` / `apps/platform/data/**` / Playwright 生成物（`playwright-report` / `test-results` / `blob-report`），**无** `docs/.vitepress/cache/**`。
    - 配置文件内已有同源注释自陈根因：「ESLint 9 flat config 不读 .gitignore 需显式排除」——Playwright 生成物即为同一模式的前例。
    - 复现路径：`pnpm --filter dependfix-docs dev`（生成 `docs/.vitepress/cache/deps/*.js`）→ `pnpm lint` → **1096 errors 全部来自缓存文件**；删除缓存后回到 0 error / 3 warning baseline。
    - `.gitignore` 已覆盖 `docs/.vitepress/dist` / `cache` / `.temp`（生成物不入库，仅 lint 面漏配）。
  - **验收标准**：
    - [ ] `eslint.config.js` `ignores` 补 `docs/.vitepress/cache/**`（`docs/.vitepress/.temp/**` 一并评估）
    - [ ] 复现路径实证：跑 `pnpm docs:dev` 生成缓存后 `pnpm lint` 仍为 0 error / 3 warning baseline
    - [ ] `pnpm lint` + `pnpm typecheck` 通过
  - **不做什么**：不改 `.gitignore`（已覆盖）；不清理既有 3 条 warning baseline（`repos.vue` max-lines / `container-executor.test.ts` import-order / `runner.test.ts` no-empty-function）；不动 lint-staged 与 CI 侧配置
  - **依赖**：无；关联 `eslint.config.js` 既有 Playwright 生成物忽略范式（同一「flat config 不读 .gitignore」根因）
  - **交付物**：1 atomic commit（补 `ignores` 条目）
  - **风险与缓解**：若整体忽略 `docs/.vitepress/**` 会连带忽略真实源码 `docs/.vitepress/config.ts`（当前参与 lint 且通过）；缓解：只忽略 `cache/**` 与 `.temp/**` 生成物子目录，保留 `config.ts` 覆盖
  - **复杂度估算**：代码 ~2 行；测试 0（配置类，以复现路径实证替代）；文档 0

- **C80 devDependencies 链漏洞的 CI 回归拦截（含失效引用修正）** —— 2026-09-21 M29.1 审计剩余风险实证触发；评估完成待上收；按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) **不带 M\d+ 阶段编号**。
  - **目标**：devDependencies 链上的已知漏洞有 CI 回归拦截（当前结构上不可见），使 M29.1 这类修复不因后续依赖变动而静默回退。
  - **优先级**：P3（非阻塞；属「审计门禁缺失」维度，按 [ai-collaboration.md §1.5](../standards/ai-collaboration.md)「依赖审计门禁缺失 ≠ 依赖本身有漏洞」为独立问题，不构成 blocker）
  - **范围**：`.github/workflows/test.yml`（audit 步骤）+ [ai-collaboration.md §1.5](../standards/ai-collaboration.md)（失效引用修正）
  - **现状实证**（2026-09-21 实测）：
    - `test.yml:30` 现为 `pnpm audit --prod --audit-level=moderate || true`，且 `:25-27` 有**显式设计注释**：`--prod` 依据「devDeps 漏洞不影响生产部署」、`|| true` 依据「hard-fail 由 `dependabot.yml` 处理，audit 失败仅作信号」。故这不是遗漏而是**既有决策**。
    - 但 M29.1 修复的三条 advisory **全部位于 devDeps 链**（`docs>vitepress>vite`）——即当前 CI 恰好无法感知该类回归；本候选要评估的是「Dependabot 告警覆盖」是否足以替代「CI 回归拦截」，还是需要独立 devDeps audit 步骤。
    - [ai-collaboration.md §1.5](../standards/ai-collaboration.md) 的「纳入『依赖审计进 CI』backlog 条目（如 C60/C61 RG-B04）」为**失效引用**：`C60`/`C61` 实为平台 UI 增强（见 [archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)），`RG-B04` 全仓库仅该处出现，backlog 中原无「依赖审计进 CI」条目（本候选即为其真实落点）。
  - **决策点（待上收时敲定）**：
    - **覆盖方式**：保留 `--prod` + 新增独立 devDeps audit 步骤 / 改为全量 audit（去掉 `--prod`） / 维持现状仅修正失效引用（若判定 Dependabot 覆盖已足够）。
    - **阻断语义**：是否去掉 `|| true` 转阻断，或先设观察期（非阻断 + 显式告警）。
    - **阈值**：`--audit-level` 取值（moderate / high / critical）与既有注释口径对齐。
  - **验收标准**：
    - [ ] 按决策点落地覆盖方式；若维持现状，须在 workflow 注释与 [ai-collaboration.md §1.5](../standards/ai-collaboration.md) 中显式写明「devDeps 由 Dependabot 覆盖、CI 不重复拦截」的依据
    - [ ] 若新增 / 改为 devDeps audit：CI 主链路不因存量告警失败（存量清零或显式豁免清单）
    - [ ] [ai-collaboration.md §1.5](../standards/ai-collaboration.md) 失效引用修正为本候选编号或删除
    - [ ] workflow 变更后跑一次真实 CI（或 `act` 本地模拟）验证步骤生效
  - **不做什么**：不引入 Snyk / 第三方 SCA 服务；不改 `pnpm-workspace.yaml` overrides 策略；不在本候选内清理存量 devDeps 告警（当前 `pnpm audit` 实测已 0 告警）
  - **依赖**：关联 M29.1（本候选的触发实证）；关联 [ai-collaboration.md §1.5](../standards/ai-collaboration.md)（失效引用修正建议同批，避免二次返工）；关联 `dependabot.yml`（既有 hard-fail 通道，需评估是否真能替代 CI 拦截）
  - **交付物**：1-2 atomic commits（`ci` workflow 调整 + `docs(standards)` 引用修正）
  - **风险与缓解**：全量 audit 转阻断可能因上游新披露 devDeps 漏洞突然红掉 CI、阻塞无关 PR；缓解：先观察期（非阻断 + 告警），存量清零后再评估转阻断
  - **复杂度估算**：CI 配置 ~5-15 行；文档 1 处；测试 0（配置类，以 CI 实跑实证）

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
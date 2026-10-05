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
- **下一次可切片方向**（任一触发时重新评估）：
  1. 构建工具生态文档站类目预置白名单（rolldown.rs / swc.rs / rust-lang.org 等）—— **候选方向 3（命令输出 URL 与真实外联区分）落地后优先级降低**：合法外联不会再被误判，新增白名单诉求应转为"真实注册表域"申请而非"构建工具文档站"
  2. 按 SRI 哈希钉资源（推荐域动态发现）
- **验收**：默认白名单不再按次新增；verification 阶段合法外联不被误判（已达成）；剩余候选方向（SRI 哈希钉定等）任一实施或主线整体评估为长期保留后关闭本主线条目（候选方向 3「命令输出 URL 与真实外联区分」已落地，不单独构成关闭条件）

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

### 候选评估中（待评估，暂未进入用户决策面）

> 存量候选说明：两项候选已于 2026-10-02 经用户决策上收至 M36 阶段（方案 A），按维护规则 5 从本文件移除（登记位置见 [todo.md §M36](todo.md)）：① 设计与索引文档的同类陈旧状态清理（存量）；② BatchRun 写回的非原子竞态（详情 GET / sync 尾部 vs 并发 `force-fail`）。**另**：2026-10-02 用户直接指令追加 dependfix-platform 镜像体积治理（M36.6）、依赖升级 overrides key 重复写法修复（M36.7，用户报告 nuxt-latest-template#298）与 Docker 首次启动数据库初始化 + 部署文档 / 一键初始化脚本（M36.8，用户报告可用性缺陷）——三者均非 backlog 候选，未在本文件评估，登记位置见 [todo.md §M36](todo.md)。

- **运行失败分类与筛选（失败阶段 + 可重试判定 + 重试入口）** —— 运行列表（`/scans` 全部运行）只显示粗粒度「失败」，无法区分失败阶段（告警获取 / clone / install / 修复 / 验证 / 交付 / 运行时 / 清理），也无法区分网络类可重试失败与 `VERIFICATION_FAILED` 等需重点研判失败（2026-10-02 用户报告）。**研判与设计先行稿已产出**：[run-failure-taxonomy.md](../design/governance/run-failure-taxonomy.md)。待评估上收；触发条件：① 用户需要按失败阶段筛选 / 受约束重试；② 失败运行量增长到人工逐条排查成本显著。

- **扫描 / 批量扫描记住上次选择 + 自定义默认操作**（2026-10-05 用户报告，关联 [#136](https://github.com/dependfix/dependfix/issues/136)）—— 单仓库扫描配置弹窗与批量扫描弹窗每次打开都重置为硬编码默认（`mode=report-only` / `severity=high`），用户每次触发都要重复选择，既无法记住上次选择，也没有「自定义默认操作」入口。**需求分析**：
  - **R1 记住上次选择**：单仓库扫描（`scan-config-dialog`）与批量扫描（`use-repo-batch-scan`）的 `mode` / `severity`（是否含 AI override 待定）在会话间保留。
  - **R2 自定义默认操作**：用户可配置「默认扫描操作」，作为尚未产生「上次选择」时的初始值；两者优先级（显式默认 vs 上次实际选择）需定义。
  - **现状锚点**：`apps/platform/app/pages/repos.vue:205-206`（`scanConfigMode` / `scanConfigSeverity` 硬编码 ref + `openScanConfig` 每次重置）、`apps/platform/app/composables/use-repo-batch-scan.ts:30-31,37-39`（`batchMode` / `batchSeverityThreshold` 硬编码 + `openBatchScan` 重置）、`apps/platform/app/components/scan-config-dialog.vue`（AI override 默认继承仓库级 `aiEnabled` / `aiTrigger`）；全站仅 `use-color-mode.ts` 使用 localStorage，扫描选择无任何持久化。
  - **候选方案**：A 纯前端记忆（localStorage，改动小、设备级、不跨端）；B 服务端用户 / 组织级默认偏好（跨设备、可管理，需实体 / API / 设置页；按设计文档硬阈值预计触发 governance 文档）；C 混合（localStorage 记「上次选择」+ 可选的配置化默认）。方案选择、字段范围（是否含 AI override）与单仓库 / 批量是否共用偏好待用户决策。
  - **验收标准（草案）**：① 重开弹窗 / 刷新页面后 mode / severity 保留上次选择；② 无偏好时回退既有硬编码默认（report-only / high）；③ 若采纳方案 B/C，明确「显式默认 > 上次选择 > 硬编码兜底」优先级并提供设置入口与重置能力；④ zh / en-US i18n 同步；⑤ 相关 vitest（composable / 组件）覆盖。
  - **不做什么**：不改扫描执行语义与 `/api/repos/{id}/scan`、`/api/repos/batch-scan` 契约；不改仓库级 `aiEnabled` / `aiTrigger` 继承语义；不将偏好沿用至计划（schedule）默认（其默认值独立维护）。
  - **触发条件**：① 用户确认持久化载体（设备级记忆 vs 跨设备默认）与字段范围；② 单仓库 / 批量弹窗「每次重选」的实际使用痛点被确认。

- **批量写回反向竞态与 stale-cleanup 无条件 save（批量写回竞态审计残余）** —— 批量写回竞态收敛已消除「`failed` 被回写成 `completed`」方向的三处聚合写回；审计穷举平台侧剩余 `BatchRun` 无条件写点后发现反向竞态：`batch-executor.ts` 的「async 全部入队失败」分支用 stale 内存实体 `save`（可能在详情 GET 已把批次收敛为 `completed` 后覆盖回 `failed`，并覆盖并发写入的计数）；`stale-cleanup.ts` 对批次的写回亦为无条件 `save`（先置 `failed`，不产生上述方向覆盖）。均属既有设计、触发概率低。**现状锚点**：`apps/platform/server/services/batch/batch-executor.ts:105-108`（async 全部入队失败 `save`）、`apps/platform/server/services/batch/stale-cleanup.ts:129-135`（批次 `save`）。触发条件：出现实测计数错乱 / 终态反复。

- **详情 GET 计数无变化时并发 force-fail 的响应瞬时不一致（批量写回竞态审计残余）** —— 详情 GET 在聚合与库计数完全一致（无字段变化）时不写库；若此刻 admin `force-fail` 已把库改为 `failed`，本次响应仍按内存状态返回，与库短时不一致（下一次读取即自愈，无数据腐蚀，仅只读瞬时窗口）。**现状锚点**：`apps/platform/server/api/batch-runs/[id].get.ts:46-50`。触发条件：客户端需要对同一次 GET 的强一致保证。

- **部分源失败汇总的仓库级错误重复信号（告警源失败判据审计残余）** —— `fetchRepoAlerts` 抛错路径下 `allErrors` 同时含 per-source `FETCH_FAILED`（带 `source`）与调用方 catch 追加的仓库级 `FETCH_FAILED`（无 `source`）；当另有仓库成功时，`logPartialSourceFailureSummary` 会把后者归入 `unknown` 组，产生重复 / 归组不当的提示信号（`repo-fix.ts` catch 的 token hint 亦未含 `codeQualityAlertsTokenHint`）。该行为在既有「启用源全失败」路径已存在，非告警源失败判据改动引入。**现状锚点**：`packages/engine/src/app/repo-alerts.ts:69-89`（per-source 记录）、`packages/engine/src/app/index.ts:437-444`（catch 追加仓库级错误）+ `:142`（分组 `unknown`）、`packages/engine/src/app/repo-fix.ts:147`（fix 模式 catch hint 缺 codeQuality）。触发条件：出现用户反馈部分失败汇总重复 / `unknown` 归组困惑，或统一错误信号排期。

### 待上收候选（评估完成，等待用户决策）

> 当前无待上收候选——4 项（本地 devEx `data/` 产物污染 / 视觉回归容差对同明度色相与灰度替换不敏感 / 非弹窗表单 label↔控件间距 / PrimeUI 设计先行稿与索引陈旧）已于 2026-09-30 经用户决策上收，按维护规则 5 从本文件移除（登记位置见 [todo-archive.md §M34](todo-archive.md#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)）。

### 延期 / 暂缓项

- **T705 生产级部署**（PostgreSQL + Helm + Sentry）—— 2026-08-12 用户指示暂缓排期
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **C30 Publish Docker build job 失败排查** —— 2026-08-18 用户决策暂缓（双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作）；恢复条件：① master 分支 push 频率显著提升；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复
- **caomei-ui 0.x → 1.0 升级回归** —— 库处于 0.x（原精确锁定 `0.3.0`）。**2026-09-30 用户指定目标版本 `0.5.0` → 恢复条件①达成，`0.5.0` 升级（含弹窗内 Select 面板裁剪 / 层级修复）已上收 M34.2 并随该阶段归档**。**剩余观察**：`1.0.0` 发布后的正式升级回归（恢复条件①的 1.0 分支）与「平台需跟进新组件能力」「用户明确恢复」两条触发条件。届时按 M31 迁移期实证索引（[caomei-ui-migration.md §15](../design/governance/caomei-ui-migration.md)）做回归；**升级回归的像素兜底已就位**（M32.5 落地的视觉回归基线 `apps/platform/tests/visual/`，覆盖 alerts / repos / pr-checks / dialog-import-repos / login，口径见 [测试规范 §6.7](../standards/testing.md)）
- **ScanResult 数据层去重（upsert 唯一索引）** —— 2026-09-02 M23.3 决策暂缓：应用层去重（fingerprint + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）已实施且满足当前业务需求；恢复条件：出现"fix 复用同一 `scan_run_id` 跨次刷新"或"历史 fixStatus 跨次保留"需求时迁移到数据层 upsert（关联 [archive/todo-archive-phases-m23.md §M23](archive/todo-archive-phases-m23.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)）

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

### SQLite 单文件脆弱性 + TypeORM synchronize 风险（持续观察）

- **背景**：2026-09-01 `apps/platform/data/dependfix.sqlite` 业务数据被清空事故（详见 [经验归档 §五十](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)）。代码内无清空路径，最可能清空来源在代码外部（shell / CI / 运维）。
- **防御现状**：事故防御加固已完成（M22 全部 6 原子条目闭环，详见 [archive/todo-archive-phases-m22.md §M22](archive/todo-archive-phases-m22.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)；启动期备份 / db-restore / db-doctor / synchronize + migrationsRun 双 opt-in / e2e fixtures 双门控），规范见下方"规范挂接"。
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

### tsdown hash:false 下 entry 与共享 chunk 文件名冲突（持续观察）

- **背景**：2026-09-28 修复 engine 多 entry（`index` + `auth`）构建产物的 dts 入口错位——`hash: false` 时 entry 与共享 dts chunk 争用 `index.d.mts`，入口声明被挤出 `index2.d.mts`，而 `packages/engine/package.json#types` 指向 `index.d.mts`，导致 `apps/platform` 解析不到 engine 导出（TS2305）。
- **已落地**：engine `tsdown.config.ts` 用 `outputOptions.chunkFileNames` 把 chunk 统一隔离到 `chunks/` 子目录，entry 名保持稳定（chunk 名解析用 `chunk.name.slice(0, -2)` 而非占位符，规避 tsdown 升级回归）。
- **持续观察项**：`packages/core` / `packages/cli` / `packages/mcp` 当前无名为 `index` 的共享 chunk（dist 无 `index2` 冲突），故未做预防性改动；若未来某包出现「多 entry 共享 dts 声明」形成名为 `index` 的共享 chunk，需同样加入 `outputOptions` chunk 隔离。
- **触发条件**：任一 `packages/*` 构建后 `dist/` 出现 `index2.d.mts` / `index2.mjs`，或下游对该包类型解析报 TS2305。

### apps/platform `.output` 不随根构建脚本重建（操作提醒）

- **背景**：根构建脚本 `pnpm -r --filter "./packages/*" build` 不含 `apps/platform`，`.output` 需单独构建。
- **影响**：类型侧由 `nuxt typecheck` 覆盖；但涉及 `packages/*/dist`（如 engine chunk 结构）变更后，容器 / 运行时冒烟前需重建 `apps/platform/.output`，否则可能引用旧产物。
- **触发条件**：① 需要容器 / 运行时冒烟验证依赖 `packages/*/dist` 的变更时；② 跑 `apps/platform` e2e 或**视觉回归**（`pnpm --filter @dependfix/platform test:visual`，M32.5）前——两者都跑 `.output` 产物，源码改动不重建则验证的是旧产物（假绿；M32.1 / M32.5 均实证）。

### apps/platform migration 前缀与自举（M36.8 已闭环，随 M36 归档批次移出）

- **背景（历史）**：`createDataSourceOptions` 默认 `entityPrefix='dependfix_'`（`DATABASE_ENTITY_PREFIX` 可配），但早期迁移表名处理不统一：4 个硬编码 `dependfix_` 前缀（`1700000000000` / `1750000000000` / `1800000000000` / `1800000000001`）、3 个硬编码无前缀（`1800000000002` / `1900000000000` / `2000000000000`）→ 非预期前缀组合下 `queryRunner.getTable()` 返回 `undefined`、迁移静默 no-op。另有更深问题：迁移链无基线迁移，空库执行首个 `ALTER TABLE` 即报 `no such table`（无法自举）。
- **闭环（M36.8）**：
  - 新增基线迁移 `CreateInitialSchema1600000000000`（实体元数据运行时生成，前缀感知 + 跨方言 + 幂等）；
  - 早期迁移统一改前缀感知 + 幂等守卫（新增 `migration-helpers.ts`：`resolveTableName` / `prefixedTableName` / `addColumnIfMissing` / `dropColumnIfExists` / `createIndexIfMissing`）；
  - 实证：空库 `pnpm db:migrate` 建 13 张业务表（含索引 / 外键）、二次执行 0 条；自定义前缀 `myapp_` 下同样生效且 0 张 `dependfix_` 误建表；存量库基线 no-op、数据不变。
- **手动入口**：`pnpm db:migrate` / `db:init`（一键初始化）/ `db:migrate:show` / `db:migrate:revert -- --yes`；Docker 用 `docker/init-db.sh`，见 [server/database/scripts/README.md](../../apps/platform/server/database/scripts/README.md)。
- **规范挂接**：[platform.md §3.3](../standards/platform.md) + [§3.8](../standards/platform.md#38-仓库级自定义验证命令verifycommands-m321-c76) + [development.md §5.1.19](../standards/development.md)。
- **移出**：随 M36 阶段归档批次从 backlog 移出，并同步 [archive/index.md §4](archive/index.md) 基线「保留」清单与前向描述。

### 依赖审计豁免复核（node-forge / braces，持续观察）

- **背景**：2026-10-05 weekly regression 因 `security:audit-deps` 阻断失败——node-forge ≤ 1.4.0（GHSA-86w9-cpqp-85rv）与 braces ≤ 3.0.3（GHSA-vfj7-8cjw-p6xm）为 high，但 advisory 声明的 patched 版本（1.4.1 / 3.0.4）**尚未发布**，overrides / `pnpm update` 无法解析。经用户决策（方案 A，调整为配置文件实现）在 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) `audit.ignore` 显式豁免。
- **机制与复核**：以 `pnpm-workspace.yaml` `audit.ignore` 显式豁免（只过滤列表内编号，未列入的新漏洞仍使 `pnpm audit` exit 1）；机制、禁止项与复核条件以 [security.md §5.7](../standards/security.md#57-无可用修复版本漏洞的审计豁免auditignore2026-10-05) 为唯一权威，本条不重复。
- **复核条件**：node-forge 发布 > 1.4.0 或 braces 发布 > 3.0.3 后，移除 `pnpm-workspace.yaml` 对应条目并复跑 `pnpm audit --prod --audit-level=moderate --registry=https://registry.npmjs.org`。
- **触发条件**：每周回归 / 依赖升级 / 上游发布修复版本时复查。
- **可选增强**：以调度任务自动比对 `npm view node-forge version` / `npm view braces version` 探测上游修复发布，避免豁免长期挂账（暂未实现）。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | **M36 进行中**（治理债清仓 + 可观测性与测试稳定性，2026-10-02 用户决策方案 A 启动） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近阶段完整段 + 指针段；M0-M35 已归档；早期阶段见 [archive/](archive/)） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M35 已归档 + M36 进行中） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

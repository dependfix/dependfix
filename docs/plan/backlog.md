# 待办积压 (Backlog)

> 本文档维护尚未进入正式阶段执行面的统一候选池，按 **长期主线任务** / **周期性回归验证层** / **短期与一次性候选任务** / **已知边界与 known-issue** 四象限区分。当前阶段任务见 [todo.md](todo.md)；已闭环归档见 [todo-archive.md](todo-archive.md)。
>
> **维护规则**：
> 1. 新功能需求、非阻塞优化与长期治理事项优先写入本文件，而不是直接写入 `todo.md`；已闭环条目必须从 backlog 迁出至 [todo-archive.md](todo-archive.md)。
> 2. backlog 必须区分四类：长期主线（可跨阶段保留）/ 周期性回归验证层（健康检查层）/ 短期与一次性候选（评估后上收或关闭）/ 已知边界与 known-issue（CI / 浏览器兼容性等持续观察项）。
> 3. 长期主线被某阶段抽取后，不删除主线卡片，只补记最近一次上收阶段、当前状态与下一次可切片方向。
> 4. 周期性回归验证层不是"一个任务"，而是所有长期主线的健康检查层；它按固定节奏运行，不参与阶段切片容量竞争。
> 5. 短期候选正式上收阶段后从 backlog 移除；评估为"暂不实现"的候选直接关闭并在归档中保留决策记录。
> 6. 当前仓库的 backlog 以中文为唯一事实源。

## 长期主线任务（可跨阶段保留）

> **状态口径**：进行中 / 观察中 / 暂停 / 已关闭。
> 共 2 条（2026-08-25 neat-freak 归档批次整理：原 §M11 子任务闭环清单 / §M4 增强候选中"已闭环"段全部迁出 backlog；§M2 / §M5.5 / §M6 / §MCP / §M7 阶段分段已闭环，已迁出 backlog 仅保留历史归档指针）。
> **2026-08-26 闭环整理**：UX-R1 扫描历史分页 已由 M14.2 闭环，从 §扫描历史与详情 UX 主条目迁出至历史归档指针段 + [todo-archive.md §M14.2](todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)；C66-B 数据层去重 / C66-C alerts UI Identifiers 列已在 M13 阶段由 T1306 / T1402 应用层方案覆盖，不再实施（保留决策记录）。

### 主线 #1：PrimeVue 4 + Nuxt hydration rowGroup known-issue

- **目标**：闭环 PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧导致的 2 个 alerts-rowgroup.e2e `.fixme` 标记，恢复 rowGroup 真实环境跑通（不依赖 `page.reload()`）。
- **状态**：暂停。
- **当前状态**：
  - PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧——onMounted 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染；`page.reload()` 后能渲染可佐证非业务逻辑问题（CI run 32383730911 alerts-rowgroup rowGroup 测试遗留）。
  - 2 个 alerts-rowgroup.e2e.test.ts 测试以 `test.fixme()` 标记并加 known-issue 注释（命名空间 `known-issue/primevue-hydration-rowgroup`）。
  - 来源：[todo-archive.md §2026-08-20 e2e 修复批次 C64-3](todo-archive.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（commit `6f6fe5b`）。
- **最近一次上收**：C64 修复批次（2026-08-20）已修复 rowGroup 数据流必现 TypeError（`expandedPackages` Record → string[]），但 hydration 状态机分歧为 PrimeVue 上游问题，未修复。
- **修复路径（候选）**（历史已评估或低成本方案）：
  1. 迁移 alerts 加载到 `useAsyncData` 让 SSR 阶段就有数据（最低成本）
  2. 升级 PrimeVue 到修复版本（监控 PrimeVue 4 changelog）
- **下一次可切片方向**（任一触发时重新评估）：同修复路径（候选）；若上游修复版本迟迟未发布且 useAsyncData 迁移遇阻（如 SSR fetch 与 client fetch 数据一致性、CSRF token 刷新等），可考虑降级方案——把 alerts 列表改为非 rowGroup 视图（避免 hydration 状态机分歧）
- **验收**：alerts-rowgroup.e2e rowGroup 2 个测试取消 `.fixme` 恢复真跑；本机实测 + CI run 双绿（具体判定：本机 `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup.spec.ts` 2 个 rowGroup 测试连续 3 次通过 + CI `Test` job alerts-rowgroup.spec.ts 0 failed + 已知 issue `known-issue/primevue-hydration-rowgroup` 命名空间搜索结果为空）

### 主线 #2：network-audit 默认白名单持续扩展问题（G1）

- **目标**：把 network-audit 默认白名单从"按次新增"演进为"按域名 / SRI 哈希 / 输出区分"的可持续治理方案，避免每次构建工具跨 major 升级都需补白名单。
- **状态**：观察中（候选方向 3 已落地 2026-08-25，治本阶段）。
- **当前状态**：
  - **候选方向 3 已落地**（2026-08-25 G1-治本批次）：verification 子进程默认注入 `NUXT_TELEMETRY_DISABLED=1` 等 telemetry 禁用变量（Nuxt CLI 默认 telemetry 上报不再真实外联）；verification-runner 命令输出 URL 提取**不再 addViolation**，仅入 `networkAudit` entries 备查——stdout/stderr 字符串是文本而非真实网络连接（实证 run `dependfix-mt8nasq2-0iiiry` 2026-08-25：pnpm 11.x warnings 的 `pnpm.io`、Nuxt CLI 输出中的 `telemetry.nuxt.com` 不再触发 verification fail）。详见 [docs/standards/security.md §5.3.1 网络外联审计](../standards/security.md#531-网络外联审计执行期网络行为可观测)。
  - 临时修复：`rolldown.rs` 默认白名单（commit `2104b9f`）；症状 = vite 6/7 跨 major 升级 verification 命令输出 URL 被 deny-by-default 拦截为 `network_violation` → run exitCode=1。
  - 触发事件：2026-08-25 [Security Auto Fix #41 run 32795032475](https://github.com/dependfix/dependfix/actions/runs/32795032475)。
- **最近一次上收**：2026-08-25 G1-治本批次落地候选方向 3 + telemetry 默认禁用；回归层覆盖矩阵补 2 条 case（`verification-runner.test.ts` 命令输出 URL 不阻断 + `network-audit.test.ts` addEntries pnpm.io/telemetry.nuxt.com）。
- **下一次可切片方向**（任一触发时重新评估）：
  1. 构建工具生态文档站类目预置白名单（rolldown.rs / swc.rs / rust-lang.org 等）—— **候选方向 3 落地后优先级降低**：合法外联不会再被误判，新增白名单诉求应转为"真实注册表域"申请而非"构建工具文档站"
  2. 按 SRI 哈希钉资源（推荐域动态发现）
  3. ~~命令输出 URL 与真实外联区分~~（✅ 2026-08-25 落地）
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
| #2 network-audit 默认白名单 | ✅ `packages/engine/src/runners/verification-runner.test.ts` + `network-audit.test.ts`（2026-08-25 G1-治本：命令输出 URL 不阻断 + addEntries pnpm.io/telemetry.nuxt.com + telemetry 默认禁用） | ✅ `pnpm run` verification job |

> 标注 `—` 的条目表示当前缺少自动化回归覆盖，是后续回归层扩面的候选方向。

### 漂移路由规则

回归验证发现的问题不自行修复，而是按以下规则路由到对应长期主线或短期候选：

| 回归发现问题 | 路由目标 |
|:---|:---|
| e2e rowGroup `.fixme` 触发 | → 长期主线 #1（PrimeVue hydration） |
| network-audit 真实注册表域新增诉求 / 命令输出 URL 阻断 regression | → 长期主线 #2（network-audit 默认白名单；候选方向 3 已落地，2026-08-25 后不应再出） |
| CI 失败 | → 当前阶段批次（无活跃阶段时登记 backlog 远期） |

## 短期 / 一次性候选任务（上收后去重）

> 共享说明：本区块条目当前均处于"候选评估中"或"延期暂缓"状态；正式上收阶段后从 backlog 移除并归档至 [todo-archive.md](todo-archive.md)。评估为"暂不实现"的候选直接关闭。

### 延期 / 暂缓项

- **T705 生产级部署**（PostgreSQL + Helm + Sentry）—— 2026-08-12 用户指示暂缓排期
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **C30 Publish Docker build job 失败排查** —— 2026-08-18 用户决策暂缓（双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作）；恢复条件：① master 分支 push 频率显著提升；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复
- **§M14.2 PrimeVue 4 → 5 升级评估** —— 2026-08-26 dependabot #49 触发评估，Nuxt build 报 `Rolldown failed to resolve import "primevue/inputcolor"`（v5 改组件导入约定）。`@primevue/nuxt-module` 5.x + `@primeuix/themes` 3.x 需联动升级，影响 `apps/platform/nuxt.config.ts` 及可能的 DataTable 等组件用法。PR 已关闭，恢复条件：① 评估 PrimeVue 5 migration guide 工作量；② 与主线 #1（PrimeVue 4 hydration 已知 bug）联动决策——若主线已迁移到 v5 修复版本，则直接评估；否则需先评估"独立升级 PrimeVue 5 vs 等主线修复"的取舍；③ 用户明确恢复

### 远期登记 / 未排期增强候选

按主题分组（不重复 M2/M4/M5.5/M6/M7/MCP 已闭环段的具体细节，详细评估见对应归档段）：

#### MCP 能力

- **C33 MCP P3**：pnpm-audit 本地 tool（需 workDir 语义，等本地场景真实需求）/ 统一错误包装 helper（token 检查 + try/catch → ok:false 模板代码收口）/ 返回结构对齐完整 `RunResult`（当前 run_scan 只映射 8 字段，保持简化 + 文档声明）

#### i18n 治理

- **C36** 服务端 API 错误消息 i18n（当前 API 错误消息硬编码英文如 `error.code.field_required`；用户体验：中文用户看不懂；触发：M8 国际化后未覆盖服务端；验收：所有 `apps/platform/server/api/**` 端点错误响应 `code` 键维持英文 + `message` 键按请求 locale 返回）
- **C37** 语言偏好多设备同步（当前仅单一设备语言偏好；多设备切换需重新设置；触发：用户实测反馈多设备用户；前置：先有 C36 服务端 API i18n 基础）

#### 多组织 / 多租户

- **D1** repo_admin + RepositoryAccess（实现仓库级 admin 角色区别于全局 admin；当前 owner 角色对仓库控制粒度不足；关联：C22 GitHub App 验证身份）
- **D3** 多租户组织体系（支持多个组织/org 共存；当前 single-org 模型限制 org 切换；前置：D1 仓库级权限；触发：org 场景用户痛点）
- **SAML 2.0 SSO**（D2 username 等待 SAML SSO 上后再决定 username 模型；当前 better-auth OIDC 优先）

#### 用户管理

- **D8** remove-user 关联资源检查（无 user→resource 关联时暂不需要；前置：先有 D1 资源关联表）

#### PR 管理

- **B1** PR 关闭评论 + label（需 `issues: write` 权限，比当前 `pull-requests: write` 宽；触发：PR 数量增长影响 `pulls.list` 查重性能或用户需要 PR 列表可过滤时）
- **B2** 固定分支单线设计（独立平台部署后修复频率上升，需要固定修复分支如 `dependfix/auto-fix` 避免频繁向 master 提交 PR；触发：v1.0.0 后 M12 平台 UX 修复链路上线；关联：T210 指纹方案整合复用/重建策略 + force push 语义）

#### Code Scanning 规则体系

- **C15** B 类规则真实仓库样本核对（B 类列表覆盖 js/py/java 精选集，其余语言 go/ruby/csharp/cpp 落 C 兜底；需真实仓库 API 样本核对规则 id 格式与变体分布；来源：T302 Review Gate 2026-08-05）
- ~~**C16** 规则分类配置化（从硬编码常量表升级为配置文件 / env / 平台界面可配置；触发：M3 治理扩展 + 用户实测反馈规则分类需求；来源：T302 设计 2026-08-05）~~ **2026-08-26 状态：已由 M13.3 T1307 闭环落地**（详见 [todo-archive.md §M13](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)），条目从 backlog 主条目迁出；C16 后续增强候选（模块级 active config 单例 → 多 worker pool 场景需 per-worker config 隔离 / JSON 配置格式后续支持 wildcard 如 `js/*-injection`）登记于 todo-archive.md §M13.3 T1307 follow-up

#### Code Quality（Standard findings）

> **2026-08-26 状态更新**：C21（code-quality/findings 数据源接入）已由 M13.3 T1308 闭环落地（详见 [todo-archive.md §M13](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)），条目从 backlog 主条目迁出；C21 后续增强候选（rule.category 注入 NormalizedSecurityAlert / 平台 ScanRequest schema 扩展 codeQualityEnabled / 报告 markdown 展示 category 列）登记于 todo-archive.md §M13.3 T1308 follow-up。

#### org 增强

- **C22** GitHub App / installation token 认证（CLI 侧增强；org 场景 PAT 痛点：classic PAT 需 `repo` 全量 scope 权限过大 / fine-grained PAT 需逐仓库配置 + 逐个 org 启用 SSO / 个人 token 离职轮换管理困难；GitHub App 价值：按仓库授权限 + 短时 token + org 管理员可控可审计；关联：M6 T602 凭据管理已交付 GitHub App 凭据类型 app-id + private-key）
- **C23** 发现规模上限 max-repos（[architecture.md](../design/governance/architecture.md) 规划 `max-repos` 输入参数代码未实现 grep 零命中；大 org 数百仓库一次性全量发现 + 逐仓库探测 `.github/dependabot.yml` N 次 contents API 配额消耗与总耗时不可控；当前防护仅 concurrency 16 + 限流重试 + probe 并发 5 无总量上限；建议：发现层按配置上限截断排序后截断保证确定性或拆为分批处理）
- **C24** org 级 alerts API 批量拉取（GitHub 提供 org 级 `GET /orgs/{org}/dependabot/alerts` 与 `GET /orgs/{org}/code-scanning/alerts`；当前按仓库逐仓拉取 `listAlertsForRepo`；大 org 场景可显著减少 API 调用但需按仓库重组结果 + defaultBranch 注入 org 级响应可能缺省分支上下文复杂度上升；触发：等真实大 org 用户痛点再动）

#### 报告与统计口径

- **C8** per-source 错误隔离（T301 遗留；并行源任一失败目前整体硬失败已拉取的 Dependabot 结果丢失；演进为 warn + 仅弃该源需确认语义；来源：T301 Review Gate 2026-08-05）
- **C9** summary 字段未渲染（T304 遗留；告警 summary 已收集未渲染 JSON 可见；报告/PR body 如需摘要列可加；来源：T304 Review Gate 2026-08-05）

#### 架构与性能

- **C13** app/helpers ↔ cli/helpers 值级循环依赖（M3 收尾引入反向边；`quickVerifyProject` ↔ `validateVerifyCommands` 运行时安全；建议下沉公共层或回调注入；关联：M5 T505 CLI 解耦；来源：M3 收尾审查登记 2026-08-05）
- **C14** 多 cs 告警逐告警全项目 lint 性能（T303 遗留；多 code-scanning 告警时逐个跑全项目 lint 性能瓶颈；可合并验证；来源：T303 Review Gate 2026-08-05）

#### 治理

- **C34** 存量规范严格约束挂接盘点（审查治理候选；审查现有 `docs/standards/*.md` 中"必须级"条款是否已在 code-quality-checklist.md / code-reviewer skill 双层对称挂接；现状：部分已挂接 development/testing/security/git/ai-collaboration，部分仅 standards 有 platform.md §7.1/§7.2；触发：下次 neat-freak 批次统一盘点）
- **G1** network-audit 默认白名单持续扩展问题 —— 详见长期主线 #2

#### 工作流

- **T905** git worktree 并行开发预案（触发条件：多 agent 并行开发成为常态；当前单 agent 工作流无需启用）
- **T701-e2e** 管理端点集成测试补强（用户管理 / 凭据管理 / 仓库管理的 API 端点集成测试覆盖；当前主要靠 vitest 单测，playwright e2e 仅 admin.vue；触发：M7 闭环后定期演练；前置：先评估 T701-e2e 是否纳入 M13 阶段）

#### 平台告警视图增强

- **C66 告警视图增强（GHSA/CVE 关联 + 跨次扫描去重 + fix 复用）** —— 2026-08-25 用户实测反馈触发；候选评估完成待上收；用户决策：Q1 去重粒度 = **B1 数据层去重（upsert 唯一索引）** / Q2 GHSA/CVE 展示 = **C3 单列智能**（优先 GHSA，fallback CVE）。5 原子子任务：
  - **C66-A1 ScanResult 数据模型扩展** —— 加 `ghsaId` / `cveIds` 列 + TypeORM migration；保留 `ruleId` 兼容 code-scanning 源（[apps/platform/server/entities/scan-result.ts](../../apps/platform/server/entities/scan-result.ts)）
  - **C66-A2 fetcher 提取 GHSA + CVE** —— Dependabot API `cve_id` + `identifiers[]` 透传 / pnpm-audit `cves[]` 透传（[packages/engine/src/github/dependabot-fetcher.ts](../../packages/engine/src/github/dependabot-fetcher.ts) + [__fixtures__/dependabot-alerts.json](../../packages/engine/src/github/__fixtures__/dependabot-alerts.json) / [packages/engine/src/alerts/pnpm-audit-fetcher.ts](../../packages/engine/src/alerts/pnpm-audit-fetcher.ts)）；`NormalizedSecurityAlert` 接口加字段（[packages/core/src/alerts/index.ts](../../packages/core/src/alerts/index.ts)）
  - **C66-B ScanResult 跨次扫描去重** —— ~~upsert 唯一索引 `(repositoryId, source, packageName, advisoryKey)` + 历史 `fixStatus` 保留~~ **2026-08-26 状态：已被 [todo.md §T1306](todo.md) 应用层去重覆盖**（fingerprint = `${repositoryId}|${packageName}|${ruleId ?? ''}` + 应用层 Map 聚合 + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds 字段）。C66-B 数据层 upsert 路径因 T1306 已达成相同业务目标（跨次扫描去重），**不再实施**；如未来需"fix 复用复用同一 scan_run_id 跨次刷新"语义时再考虑迁移到数据层 upsert（关联 C66-D）。
  - **C66-C alerts UI 增加 GHSA / CVE 列** —— ~~单列智能（`Identifiers` 列） + 多 CVE 显示首个 + 展开全部~~ **2026-08-26 状态：部分由 [todo.md §M13.4 T1402](todo.md) 轻量方案覆盖**（先复用现有 `ruleId` 字段展示，不改 schema：Dependabot 显示 GHSA 编号 / pnpm-audit 显示 CVE 编号或 advisory URL / code-scanning 显示 CodeQL rule id）。C66-C 完整 schema 扩展（A1+A2 后做"独立 `Identifiers` 列"）保留为后续增强候选，触发条件：用户要求按 GHSA 单独搜索/过滤 / 多 CVE 展开视图。
  - **C66-D fix 模式复用 scanRunId** —— `POST /api/repos/[id]/scan` 接受 `reuseScanRunId` 跳过重拉 + alerts 视图加 "立即修复此仓库" 入口（[scan.post.ts](../../apps/platform/server/api/repos/[id]/scan.post.ts) + alerts.vue）
  - 不做什么：不重写 Dependabot 详情页（详情在 dependabot 那边有，UI 只展示关键标识 + 跳链）/ 不立即支持自定义 advisory 来源（GitLab Advisory Database 等）/ 不破坏现有 fixStatus / 修复链路
  - 上收触发条件（任一）：用户实测反馈升级（重复告警问题再次出现 / 用户明确要求上收）/ fix 复用被 B 模式（GitHub Action）性能瓶颈触发
  - 关键决策回顾（2026-08-25 用户确认）：
    - **B1 数据层去重** vs B2 UI 层 GROUP BY / B3 每次清空：选 B1 —— 彻底解决重复 + 自然支持 fix 复用 + 不破坏审计（fixStatus + scanRunId 仍可追溯）；B2 实现简单但数据膨胀 + fix 复用难做；B3 最简单但破坏"何时发现"审计信号。**2026-08-26 备注：T1306 应用层去重（方案 B2 等价）已实施且满足当前业务需求，B1 数据层去重暂缓；如未来需要 fix 复用 / 历史 fixStatus 跨次保留再迁移到 B1**
    - **C3 单列智能** vs C1 两列分开 / C2 单列合并：选 C3 —— 用户原话"GHSA ID ... 这才是能真正跨平台追溯漏洞的关键信息"（GHSA 在 GitHub Advisory Database 统一收录多个 CVE，反向追溯更强）；C1 多列占空间但实际查看价值有限；C2 简单但 GHSA / CVE 视觉权重平等，跨平台追溯信号被稀释

#### 扫描历史与详情 UX（2026-08-26 实测反馈）

> 本段为 2026-08-26 用户实测截图反馈触发的扫描历史/详情视图 UX 增强候选；与 C66 平级。原 3 项 UX-R1→R2→R3 中 **UX-R1 已由 M14.2 闭环**（2026-08-26，详见 [todo-archive.md §M14.2](todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环) + 历史归档指针段），剩余 2 项按依赖排序（UX-R2 → UX-R3），低风险低优先级，按上收时机依次推进。

- **UX-R2 dedupe 详情侧栏增强** —— [alerts.vue §openRunSidebar](../../apps/platform/app/pages/alerts.vue) 当前侧栏只展示 `status` + `startedAt` + `runUrl` 外链；用户截图痛点：缺 run 短 ID（36 位 UUID 无意义）/ 缺跳转 run 详情按钮 / 缺 executorKind 与告警数（与 batch-runs 展开区区分度不足）/ 缺与"本次扫描告警明细"的关联入口
  - **执行范围**：侧栏 DataTable 新增 run 短 ID（前 8 位）+ mode/severityThreshold/executorKind + summary.alertsFound + 持续时长（finishedAt - startedAt）；新增"详情"按钮复用 `RepoHistoryDialog` 的 detail dialog；runUrl 仅在 `executorKind === 'github-action'` 时显示（container 内部 run URL 暂未实现）
  - **不做什么**：不改后端 API / 不改路由 / 不动 batch-runs 展开区
  - **上收触发条件**：用户实测反馈"侧栏看不出不同 run 的差异"
  - **风险**：低（纯前端扩展）
  - **关联**：与 UX-R3 部分耦合 —— UX-R3 引入独立页面后，侧栏可改为"跳转到该 run 在 /scans 页的 detail dialog"，但两者解耦可独立上收

- **UX-R3 `/scans` 独立页面 + 替代 `RepoHistoryDialog`** —— 当前 `RepoHistoryDialog` 是 modal + 720px 固定宽度弹窗，内部 list/detail view 切换在狭窄空间内拥挤；用户痛点：6 列 DataTable 在 720px 内严重挤压 + 详情切换操作密集。**关键决策（2026-08-26 用户指示）**：用 query 形式而非 path segment，避免 i18n 路由前缀问题。
  - **路由设计**（3 种 query 组合 + 单一页面）：
    - `/scans` — 全局扫描汇总（聚合统计 + 全仓库运行列表 + 按仓库聚合）
    - `/scans?repository={repoId}` — 单仓库扫描历史（替代 `RepoHistoryDialog` 主列表视图）
    - `/scans?run={runId}` — 单 run 详情（替代 `RepoHistoryDialog` 详情 dialog，可与上一条 query 共存 `?repository=&run=`）
  - **页面结构**：
    - 顶部聚合卡片（4 块）：总运行数 / 成功数 / 失败数 / 24h 失败率 + 平均耗时 + 按来源分布（dependabot / code-scanning / code-quality / pnpm-audit）
    - 中部按仓库聚合表格（默认视图）：行 = 仓库（owner/name），列 = 最近一次运行状态 + 24h 失败次数 + 7d 平均告警数 + 累计告警数；点击行 → 跳 `/scans?repository={repoId}`
    - 底部"所有运行"列表（承接 UX-R1 分页）：列 = 仓库 / 状态 / 时间 / 告警数 / 修复数 / executorKind / error；行点击 → 跳 `/scans?run={runId}`
  - **后端新增**：`/api/scan-history/summary.get.ts`（聚合统计 — 纯 SQL 应用层聚合 + N+1 防御）+ 复用 `/api/runs`（带 UX-R1 分页参数）
  - **迁移**：[repos.vue](../../apps/platform/app/pages/repos.vue) 的 pi-history 按钮从打开 dialog 改为 `router.push('/scans?repository=' + id)`；`RepoHistoryDialog` 组件保留为 `/scans?run=` 的内部 detail dialog 复用
  - **导航集成**：[apps/platform/app/layouts/default.vue](../../apps/platform/app/layouts/default.vue) `NuxtLink` 列表（导航项源）增加"扫描"菜单项
  - **不做什么**：不动 batch-runs 页面（BatchRun 维度，跨仓库聚合，与单仓库 ScanRun 维度正交）/ 不改 dashboard 的 latestRun 卡片（汇总页独立提供更详细视图）
  - **上收触发条件**：用户实测反馈弹窗体验差升级 / 单仓库历史数量 > 30 后 dialog 滚动操作痛苦
  - **风险**：高（新增整页 + nav + 后端聚合 API + e2e；跨 5+ 文件）
  - **关联**：依赖 UX-R1（汇总页底部"所有运行"列表使用分页 API）；可与 UX-R1 合并为同一子阶段 M14.x 推进

### 已评估不实现（决策保留于归档段）

下列条目已在历史评估中明确"暂不实现"或"非本阶段范围"，从 backlog 主条目迁出，决策记录保留于对应归档段：

- **C1 / C2 / C6 / C7 / C10 / C11 / C12 / C17 / C18 / C19 / C20** —— 详见 [todo-archive.md §M4 治理记录](archive/todo-archive-phases-m2-m55.md#m4-阶段治理记录2026-08-05--2026-08-06) + [§T405 跨线升级显式授权](archive/todo-archive-phases-m2-m55.md)
- **C22 GitHub App 认证** —— 当前仅 PAT（classic / fine-grained），org 场景痛点由用户触发再评估；详见 [todo-archive.md §M6 / T602 凭据管理](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)
- **C26 / T1005 / C28 / C29 / C53** —— M10 沙箱 / C26 / T1005 / C28 / C29 / C53 已全部闭环；详见 [todo-archive.md §M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) + [§C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)
- **C25 / C27 / C31 / C32** —— M6 B 模式结果回填 + MCP 能力补充 P1/P2 已闭环；详见 [todo-archive.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档) + [§MCP 能力补充](todo-archive.md)
- **C46-C61** —— 2026-08-19~20 平台 UX/可用性闭环批次汇总 10 项 + 3 个 PR + 3 个独立 fix 全部归档；详见 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)

## 已知边界与 known-issue

### PrimeVue 4 + Nuxt hydration（持续观察）

- **PrimeVue 4 DataTable + Nuxt SSR hydration 兼容性 bug**（主线 #1 暂停；本节作为持续观察指针）
  - 内容：见主线 #1（[跳转](#主线-1primevue-4--nuxt-hydration-rowgroup-known-issue)）
  - 已知状态：2 个 alerts-rowgroup.e2e.test.ts 测试 `.fixme` 标记；监控 PrimeVue 4 changelog 与 alerts 是否迁移到 `useAsyncData`

### 已沉淀经验（历史教训，已迁移至 docs/standards）

> 本节历史上登记的 6 条经验教训（CI 失败分析必看 trace page-snapshot / page.route 注册顺序铁律 / PrimeVue 类型 vs 运行时不一致 / 本机 e2e 实际可跑）已通过 2026-08-20 neat-freak 蒸馏批次迁移至 docs/standards/*.md（development.md §CI 失败分析 / testing.md §6.1 E2E 实践经验 / platform.md §7.1 PrimeVue 集成实践 / ai-development.md §4 能力怀疑时优先实测）；backlog 不再保留指针（避免与 standards 重复登记导致漂移）。
>
> 仍持续观察未迁移的 PrimeVue 4 DataTable sort-mode / multisortMeta 教训登记于 session 跨 session 沉淀区，下次 neat-freak 批次统一挂接 code-reviewer code-quality-checklist.md §规范一致性。

---

## 历史归档指针（不在 backlog 重复登记）

> 本节仅作归档指针，所有"已闭环"内容详见 [todo-archive.md](todo-archive.md) 对应区块。已闭环条目不应再出现在 backlog 主条目，避免读者误判为活跃任务。

### 已闭环阶段（M0-M14）

- **M0-M11**：全部归档，详见 [todo-archive.md 主窗口](todo-archive.md) + [archive/todo-archive-phases-*.md 分片](archive/)
- **M14 platform release 通道闭环 + UX 反馈跟进**（2026-08-26 闭环，19 commits 全部落地 / ahead=0）：详见 [todo-archive.md §M14](todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)。包含 4 子阶段：M14.1 T1310 F 阶段闭环（7 commits）/ M14.2 UX-R1 扫描历史分页（5 commits）/ M14.3 M13.4 T1403 follow-up（1 commit）/ M14.x neat-freak 批次（5 commits）+ M14.y 依赖批量治理（4 个 dependabot major PR）
- **M13 治理 + UX 反馈 + 网络治理 + Code Scanning**（2026-08-26 归档，12 子任务 / 26 commits / ahead=3）：详见 [todo-archive.md §M13](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)。包含 4 子阶段：M13.1 治理 + UX（T1301+T1302+T1303+T1304）/ M13.2 网络治理 + 告警去重（T1305+T1306+T1309）/ M13.3 Code Scanning 规则化 + CQL（T1307+T1308）/ M13.4 UX 反馈批次立刻做（T1401+T1402+T1403）
- **M12 平台 UX 一致性 + i18n 治理**（2026-08-25 归档）：详见 [todo-archive.md §M12](todo-archive.md#m12-平台-ux-一致性--i18n-治理已闭环)
- **2026-08-20 e2e 修复批次**（C62 + C63 + C64 + chore）：详见 [todo-archive.md §2026-08-20 e2e 修复批次](todo-archive.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)
- **2026-08-19~20 平台 UX/可用性闭环批次**（C46-C61 + 3 个 PR + 3 个独立 fix）：详见 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)
- **M11 业务可见性 + 沙箱落地 + 安全文档**（2026-08-20，22 commits）：详见 [todo-archive.md §M11 推进批次](todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) + [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)
- **M10 独立沙箱容器**（C26 + T1001-T1004 + T912 + C28）：详见 [todo-archive.md §M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) + [§T912](todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)
- **M9 i18n 基建同步**（2026-08-18）：详见 [archive/todo-archive-phases-m11.md §M9](archive/todo-archive-phases-m11.md#m9-i18n-基建同步已归档)
- **M8 安全加固与容器执行完备**（2026-08-14）：详见 [archive/todo-archive-phases-m6-m7-t711.md §M8](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)
- **M7.1 认证与用户体系**（2026-08-10）：详见 [archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)
- **M7.2 平台能力深化**（2026-08-12）：详见 [archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)
- **M6 最小平台 MVP**（2026-08-08）：详见 [archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)
- **M5.5 Skill 编排（CLI 先行）**（2026-08-07）：详见 [archive/todo-archive-phases-m2-m55.md §M5.5](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)
- **M5 AI Breaking Change 研判**（2026-08-07）：详见 [archive/todo-archive-phases-m2-m55.md §M5](archive/todo-archive-phases-m2-m55.md#m5-ai-breaking-change-研判已归档)
- **M4.6 / M4.5 / M4 多仓库治理增强**（2026-08-06）：详见 [archive/todo-archive-phases-m2-m55.md §M4](archive/todo-archive-phases-m2-m55.md#m4-多仓库治理增强已归档)
- **M3 Code Scanning 扩展**（2026-08-06）：详见 [archive/todo-archive-phases-m2-m55.md §M3](archive/todo-archive-phases-m2-m55.md#m3-code-scanning-扩展已归档)
- **M2 GitHub Action 接入**（2026-08-05）：详见 [archive/todo-archive-phases-m2-m55.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入已归档)
- **M1 MVP 单仓库自动修复** / **M0 基线收敛**：详见 [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)

### 已闭环特定批次

- **C53 平台集成模式 fix 修复结果推送远程**：详见 [todo-archive.md §C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)
- **C16 规则分类配置化**（2026-08-26 闭环于 M13.3 T1307）：详见 [todo-archive.md §M13.3 T1307](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)
- **C21 code-quality-findings 接入**（2026-08-26 闭环于 M13.3 T1308）：详见 [todo-archive.md §M13.3 T1308](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)
- **MCP 能力补充 C31 / C32**：详见 [archive/todo-archive-phases-m2-m55.md §M5.5 / T508](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)
- **M2 增强候选 B1 / B2 / B3**：详见 [archive/todo-archive-phases-m2-m55.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入已归档)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段 |
| 已闭环阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留 3-5 阶段）+ [archive/](archive/)（M0-M11 详细分片） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |
| 长期主线 / 远期 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
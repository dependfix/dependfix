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

- **C33 MCP P3**：pnpm-audit 本地 tool（需 workDir 语义，等本地场景真实需求）/ 统一错误包装 helper（token 检查 + try/catch → ok:false 模板代码收口）/ 返回结构对齐完整 `RunResult`（当前 run_scan 只映射 8 字段，保持简化 + 文档声明）

- **C36** 服务端 API 错误消息 i18n（当前 API 错误消息硬编码英文如 `error.code.field_required`；用户体验：中文用户看不懂；触发：M8 国际化后未覆盖服务端；验收：所有 `apps/platform/server/api/**` 端点错误响应 `code` 键维持英文 + `message` 键按请求 locale 返回）
- **C37** 语言偏好多设备同步（当前仅单一设备语言偏好；多设备切换需重新设置；触发：用户实测反馈多设备用户；前置：先有 C36 服务端 API i18n 基础）

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

#### Code Scanning 规则体系

- **C15** B 类规则真实仓库样本核对（B 类列表覆盖 js/py/java 精选集，其余语言 go/ruby/csharp/cpp 落 C 兜底；需真实仓库 API 样本核对规则 id 格式与变体分布；来源：T302 Review Gate 2026-08-05）

#### 报告与统计口径

- **C9** summary 字段未渲染（T304 遗留；告警 summary 已收集未渲染 JSON 可见；报告/PR body 如需摘要列可加；来源：T304 Review Gate 2026-08-05）

#### 架构与性能

- **C13** app/helpers ↔ cli/helpers 值级循环依赖（M3 收尾引入反向边；`quickVerifyProject` ↔ `validateVerifyCommands` 运行时安全；建议下沉公共层或回调注入；关联：M5 T505 CLI 解耦；来源：M3 收尾审查登记 2026-08-05）
- **C14** 多 cs 告警逐告警全项目 lint 性能（T303 遗留；多 code-scanning 告警时逐个跑全项目 lint 性能瓶颈；可合并验证；来源：T303 Review Gate 2026-08-05）

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

#### devEx / lint 治理

- **W1 apps/platform 增配 stylelint + lint 系列 scripts（参照 momei）** —— 2026-09-09 用户决策入 backlog。**现状**：apps/platform `package.json` scripts 仅 `lint`（eslint . --fix --max-warnings 10），缺 `lint:i18n` / `lint:css` / `lint:md`；整个 dependfix 无 stylelint 依赖与配置；根 `lint:md` 路径未覆盖 `apps/**/*.md`；根 `lint-staged` 缺 `*.{css,scss,vue}` 钩子。**参照**：momei `package.json` `lint` / `lint:i18n` / `lint:css` / `lint:md` + `stylelint-config-cmyr@1.0.0`（cmyr 出品，flat config 形式）+ `stylelint@17.15.0`（本地路径 `/root/projects/momei/package.json` + [momei stylelint.config.js 镜像 7 行 extends cmyr](https://github.com/CaoMeiYouRen/momei/blob/master/stylelint.config.js)）。**范围**（按 [规划规范 §1.1 任务粒度约束](../standards/planning.md#11-硬性约束) 1 atomic commit / < 5 文件 / < 800 行硬阈值）：

  - `apps/platform/package.json` devDeps 加 `stylelint@17.15.0` + `stylelint-config-cmyr@^1.0.0`（与 momei 版本一致）
  - `apps/platform/package.json` scripts 加 `lint:i18n`（`cross-env NODE_ENV=production ESLINT_I18N=true eslint . --quiet`）/`lint:css`（`stylelint "**/*.{html,css,scss,sass,vue}" --fix`）/`lint:md`（`lint-md "**/*.md" --fix`）
  - 新增 `apps/platform/stylelint.config.js`（7 行 extends cmyr，镜像 momei：https://github.com/CaoMeiYouRen/momei/blob/master/stylelint.config.js）
  - 新增 `apps/platform/.stylelintignore`（`.nuxt` / `.output` / `data` / `coverage` / `playwright-report` / `test-results` / `node_modules` / `*.min.css`）
  - 根 `package.json` `lint:md` 路径补 `apps/**/*.md`（让根 lint:md 覆盖 apps 内的 md）
  - 根 `package.json` `lint-staged` 加 `*.{css,scss,vue}` → `pnpm --filter @dependfix/platform lint:css`（apps/platform 是平台）

  **不动**（避免破坏现有行为）：
  - `apps/platform/eslint.config.js`（与根 eslint.config.js 语义一致）
  - 根 `eslint.config.js`
  - 根 `lint` / 根 `lint:i18n` 现有命令
  - 不重命名现有 `lint` 命令

  **验收标准**：
  - `pnpm --filter @dependfix/platform lint` → 0 error（既有 0 warning 状态保持）
  - `pnpm --filter @dependfix/platform lint:i18n` → 0 error
  - `pnpm --filter @dependfix/platform lint:css` → exit 0（baseline warnings 数量记录，参考 M26.4b 治本 vs 临时策略）
  - `pnpm --filter @dependfix/platform lint:md` → 0 error
  - `pnpm run lint:md` → 0 error（根，覆盖 `apps/**/*.md`）
  - `pnpm install` lockfile 同步

  **不做什么**：
  - 不做 `lint:css` baseline 治本（如果跑通时只有少量 warnings 走一遍 --fix 即可；如有大量 warnings 则与 M26.4b 一致**先记录 baseline + 治本留后续评估**，**不引入 `--max-warnings` 临时方案**）
  - 不重写 apps/platform 现有 .vue / .scss 文件以贴合 stylelint-config-cmyr 规则（除 --fix 自动修复部分）
  - 不修改 eslint.config.js（根 + apps/platform）
  - 不引入 stylelint-config-standard / stylelint-config-standard-scss / stylelint-config-html（stylelint-config-cmyr 已间接包含）
  - 不动根 `lint` / 根 `lint:i18n` 现有命令

  **依赖**：无前置（独立 feature；`stylelint-config-cmyr@1.0.0` 已在 npm registry；`stylelint@17.15.0` 与 momei 对齐）

  **交付物**：1 atomic commit（`chore(platform): apps/platform 增配 stylelint + lint:i18n/lint:css/lint:md`）+ quick depth audit（无跨模块改动，无新增设计文档）

  **风险与缓解措施**：
  - **风险 1**：`lint:css` baseline 可能有 5-15 warnings（apps/platform 现有 25 个 .vue + 3 个 .scss 不一定全部符合 cmyr 规则）—— 缓解：`stylelint --fix` 自动修复能消的 warnings + 不可自动修复的视为「已有 baseline」不阻塞（与 M26.4b 治本 vs 临时策略一致）；后续按需治本留 M27+ 评估
  - **风险 2**：stylelint-config-cmyr 规则较严可能与 PrimeVue 4 / UnoCSS 兼容性问题 —— 缓解：先跑 dry-run 评估实际 warnings 数量；如有 PrimeVue 特定 selectors（`:deep` / `::v-deep`）问题按需加 stylelint-disable 注释（与 ESLint disable 模式一致）
  - **风险 3**：CI test job 暂未跑 `lint:css`（W1 仅引入命令，CI 集成留 M27+ 评估）—— 缓解：本次仅本地命令，CI 不强制；上收时同步考虑 CI workflow 更新

  **上收触发条件**（任一）：
  - 用户实测反馈升级（apps/platform 维护期间频繁手动跑 lint:i18n / lint:css）
  - 后续 .vue / .scss baseline 治本需求
  - 用户明确授权上收

  **关联决策回顾**（2026-09-09 用户确认）：
  - **入 backlog 而非直接上收 M27** —— 按 [规划规范 §3.1 新需求默认走"评估 → backlog"原则（hard requirement）](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)：本任务不在 3 类插队例外（安全/漏洞/可用性）中 → 默认走 backlog 评估路径
  - **不动 apps/platform/eslint.config.js 与根 eslint.config.js** —— `ESLINT_I18N=true` 在根已有 `lint:i18n` 限定 apps/platform 范围，apps/platform 子命令 `lint:i18n` 仅为开发者本地便利（cd apps/platform && pnpm lint:i18n）

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

- **M23.1 已闭环**（2026-09-02 commit `2ffaa45` + `74d3dd8` + `9c56fe6`）：候选 ③ SQLite WAL 模式 + busy_timeout 优化已落地（`journal_mode=WAL` + `busy_timeout=5000ms`），详见 [经验归档 §五十三](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十三sqlitewal模式busytimeout治本m227econnreset根因候选③20260902m231commit) + [todo-archive.md §M23.1](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)。**剩余候选 1/2/4 待 CI 复现一次确认是否仍存在**（better-auth transaction 关闭时序 / Nitro h3 `defineEventHandler` async generator / fixtures API 节流）—— 登记 follow-up，CI 偶发 ECONNRESET 仍可能由其他 3 候选触发；M22.7 helper 层 maxRetries 兜底保留兜底修复 + 治本修复并存。
- **背景**：2026-09-01 CI run 33525721103 E2E job 失败于 global-setup 末尾 `cleanAlertsRowgroupFixtures` → `DELETE /api/e2e/fixtures` → `ECONNRESET`（TCP RST，100ms 内）。handler 逻辑 / 单元测试 / 本地复现均通过，无法本地稳定复现；最可能根因是 better-auth session 写入后 SQLite 连接释放时序与 fixtures DELETE `ensureDatabaseInitialized()` 走同一 singleton 的异步清理窗口竞争。**M22.7 hotfix 已落地 helper 层兜底**（commit `f617b56`：e2e/fixtures helper 加 `maxRetries: 2`，复用 Playwright 1.62 `_sendRequestWithRetries` 内置 250ms 指数 backoff 重试；详见 [todo-archive.md §M22.7](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档) + [经验归档 §五十一](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十一e2e-global-setup-串行多次-setuppage-后首请求-econnreset2026-09-01ci-run-33525721103)）。
- **候选根因排查（部分已闭环）**：按 ROI 排序：
  1. **better-auth 1.7 transaction 关闭时序** —— 在 `getAuth()` 加 `[auth] transaction close trace` 日志 + `ds.transaction` 包装打印 begin/commit 时间戳，CI 复现一次
  2. **Nitro h3 `defineEventHandler` async generator 行为** —— 检查 fixtures.delete handler 是否被识别为 generator（`async function*`）导致提前 close socket
  3. ~~**SQLite WAL 模式 + `journalMode=delete`**~~ —— 2026-09-02 M23.1 commit `2ffaa45` 闭环（落地 WAL + busy_timeout 优化）
  4. **fixtures API 请求间节流** —— 经验性方案，避免作为唯一修复
- **wisdom 沉淀**：见 .session/wisdom.md 2026-09-01 M22.7 hotfix 段 `pattern-playwright-maxRetries-econnreset`（Playwright 仅对 `e.code === 'ECONNRESET'` 重试的源码实证 + test helper 兜底模式 + 4 项治理检查点登记）

### Playwright 1.62 fixture pool 注入 cookie 根因（M22.8 hotfix 衍生 + M23.2 已闭环）

- **M23.2 已闭环**（2026-09-02 commit `09c3dee` + `e0f9b29` + `68b973d` + `aa76ad4`）：候选 ① Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证已落地（workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯：test.use → suite._use → FixturePool(parent._use, ..., pool) 继承链 + FixturePool constructor 注册继承父池 registrations）+ helper 抽取（apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts 封装 `browser.newContext({ storageState: { cookies: [], origins: [] } })` 标准模式）。详见 [经验归档 §五十四](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十四playwright-1-62-fixture-pool-跨-scope-隐式行为源码实证--m232-helper-抽取20260902m232-commit) + [todo-archive.md §M23.2](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)。**剩余候选 2/3 待 CI 复现一次确认是否仍存在**（better-auth 中间件 Set-Cookie 路径扫描 / Playwright 1.62 vs 1.61/1.60 fixture pool 行为对比）—— 登记 follow-up，等非 sandbox 环境重跑 e2e 时同步排查。
- **背景**：2026-09-02 CI run 33533376712 E2E job 在 M22.7 修复 global-setup 后跑满 6 分钟，失败 2 个用例（`Expected: 401, Received: 200`）：
  - `tests/e2e/credentials-api.e2e.test.ts:283 › 未认证 GET /api/credentials → 401`
  - `tests/e2e/repos-api.e2e.test.ts:447 › 未认证 GET /api/repos → 401`
  网络追踪实证两个失败用例的 `context-options` 携带完全相同的上游 session cookie（`i18n_locale=zh-CN` + `better-auth.session_token=LhAh2mxu4rTjo27Wc8wLyeDpspBq4MnE...`，expires 1790873050 = 29 天后），但测试代码是 `browser.newContext()` 无参——最可能是 Playwright 1.62 fixture pool 在 describe 块 scope 内将 `test.use({ storageState })` 隐式注入到所有 `browser.newContext()` 调用（含未显式传 storageState 的手动创建）。**M22.8 hotfix 已落地测试层兜底**（commit `bdcd900`：2 个测试在 `browser.newContext()` 调用中显式传 `storageState: { cookies: [], origins: [] }`，Playwright 1.62 文档推荐的"unauthenticated API call"模式；详见 [todo-archive.md §M22.8](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档) + [经验归档 §五十二](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十二playwrighttestuse存储状态传染导致未认证api测试收到20020260902cirun33533376712)）。
- **候选根因排查（部分已闭环）**：按 ROI 排序：
  1. ~~**Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证**~~ —— 2026-09-02 M23.2 commit `09c3dee + e0f9b29` 闭环（fixture pool 源码追溯 + helper 抽取落地）
  2. **better-auth 中间件对非 /api/auth/* 端点返回 Set-Cookie 路径扫描** —— 确认 session refresh 不会污染下游 context
  3. **Playwright 1.62 vs 1.61 / 1.60 fixture pool 行为对比** —— 确认是 regression 还是历史行为
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
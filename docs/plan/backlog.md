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
- **当前进度**：候选方向 3（命令输出 URL 与真实外联区分）已落地（M13.2 T1305，commits `0f08c40` + `5269d0a` + `9c79fc9`）；整体治本方向未完成（候选方向 1/2 优先级降低，按需触发）。
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

### 待上收候选（评估完成，等待用户决策）

- **本地 devEx：运行时 `data/` 产物污染 vitest 与 check-docs**（P3，🛠️ 工具链治理）—— 来源：M33.7 验证期发现（2026-09-30，测量方 = M33.7 执行角色）
  - **目标**：使本地 `pnpm test` / `pnpm run check:docs` 不受平台扫描 run 落在 `apps/platform/data/**`（gitignored）的克隆产物影响
  - **范围**：`vitest.config.ts`（`test.exclude` 增补 `apps/platform/data/**`）；`scripts/check-docs.mjs`（遍历时跳过 `data/` 等 gitignored 运行时目录）
  - **验收标准**：
    - [ ] 扫描 run 产物在场时 `pnpm test` 不再收集其测试文件（基线：产物在场 636 文件 / 412 failed；叠加 `--exclude 'apps/platform/data/**'` 后 219 文件 / 0 failed）
    - [ ] 产物在场时 `pnpm run check:docs` 仍 EXIT 0（基线：产物在场 986 处问题且**全部**位于 `apps/platform/data/runs/<runId>/`；排除后 EXIT 0 / links 143 / vue-interp 79）
    - [ ] 干净检出下两项检查结果与改动前一致（CI 为干净检出，本缺口不影响 CI）
    - [ ] 复现命令：`pnpm test 2>&1 | tail -3` 与 `pnpm exec vitest run --exclude 'apps/platform/data/**' 2>&1 | tail -3` 对比；`pnpm run check:docs 2>&1 | grep -c "apps/platform/data/runs/"`
  - **不做什么**：不改扫描 run 的产物落盘位置与清理策略；不改 CI 工作流；不清理既有产物目录
  - **依赖**：M33.7 验证期实证（产物目录 `apps/platform/data/runs/683ba3fe8af7f536/`，约 1.4G，由在跑的扫描 run 生成）
  - **交付物**：1 atomic commit（`chore(test)` vitest exclude + check-docs 跳过规则 + 回归验证记录）
  - **风险与缓解**：过宽排除模式（如 `**/data/**`）可能误排除真实测试目录；缓解：优先精确 `apps/platform/data/**` 并加注释说明理由

- **视觉回归容差对「同明度色相 / 灰度替换」不敏感**（P3，🧪 测试基建）—— 来源：M33.9 验证期发现（2026-09-30，测量方 = M33.9 执行角色 + A 阶段审计独立复算）
  - **目标**：让视觉回归能检出「同明度色相 / 灰度替换」这类外观回归（当前口径会漏检）
  - **范围**：`apps/platform/playwright.visual.config.ts`（`toHaveScreenshot` 的 `threshold` / `maxDiffPixels` 口径）+ `docs/standards/testing.md §6.7`（口径同步）+ 既有 7 张基线复核
  - **验收标准**：
    - [ ] 复现：错误基线（`tone="neutral"` 按钮由 `#52525b` 变 `#0f766e`）在当前口径下 `test:visual` 仍**通过**（实测 5678 个差异像素 0 个超阈）
    - [ ] 方案落地后同一错误基线用例**失败**（阈值下调或引入第二度量，如主色直方图断言）
    - [ ] 干净基线在方案落地后仍全绿（7 张）且连跑两遍不漂移
    - [ ] 口径变更同步 `testing.md §6.7`，并写明「抗噪 ↔ 灵敏度」取舍
    - [ ] 复现命令：修改任一按钮色板后 `pnpm --filter @dependfix/platform test:visual`，对比 `threshold: 0.2` 下是否变红
  - **不做什么**：不改动态区域策略（`data-visual-mask` 保持现状）；不重做基线体系；不覆盖其它断言语义
  - **依赖**：M33.9 验证期实证（Playwright `maxDelta = 35215 × threshold² = 1409`；pixelmatch colorDelta：`#52525b↔#0f766e` ≈1083.6、`#0d9488↔#0f766e` ≈308.8，均低于阈值）
  - **交付物**：1 atomic commit（`test(platform)` 阈值 / 度量调整 + 基线复核 + 规范同步）
  - **风险与缓解**：下调阈值会放大渲染抖动导致的偶发红；缓解：以「连跑两遍不漂移」为落地门槛，必要时保留面积门槛但引入主色直方图断言作为第二信号

- **非弹窗表单 label↔控件间距口径未统一（仍为 4px）**（P3，🎨 体验一致性）—— 来源：M33.8 A 阶段审计发现（2026-09-30，测量方 = M33.8 审计方）
  - **目标**：把「label↔控件间距」统一为 8px（`$space-2`），覆盖弹窗以外的表单 / 过滤工具栏
  - **范围**：`apps/platform/app/components/ai-config-form.vue`（`__field`）+ `apps/platform/app/pages/alerts.vue` / `pr-checks.vue` / `env-events.vue` 的 `__filter-field` + 受影响视觉基线
  - **验收标准**：
    - [ ] 上述 4 个文件中的 `gap: $space-1`（实测 5 处：`ai-config-form.vue:203` / `alerts.vue:742` / `pr-checks.vue:372,398` / `env-events.vue:370`；`pr-checks.vue:372` 的归属类名需实施时确认）统一为 `$space-2`（与 M33.8 已统一的弹窗口径一致）
    - [ ] 浏览器实测各页 label↔控件间距 = 8px（计算样式）
    - [ ] 受影响视觉基线更新，且差异仅由间距引起的定位偏移（逐张核验）
    - [ ] `pnpm lint` + `lint:css:check` + `typecheck` + `test:visual` 通过
    - [ ] 复现命令：`rg -n -F 'gap: $space-1' apps/platform/app/components/ai-config-form.vue apps/platform/app/pages/alerts.vue apps/platform/app/pages/pr-checks.vue apps/platform/app/pages/env-events.vue`（`-F` 关闭正则，避免 `$` 被当作行尾锚点）
  - **不做什么**：不改弹窗（M33.8 已统一）；不改控件高度 / 字号 / 其它间距刻度；不改 `repos.vue` 的 `.batch-form*`
  - **依赖**：M33.8（弹窗侧口径统一完成，本条为其非弹窗侧补全）
  - **交付物**：1 atomic commit（`fix(platform)` 间距统一 + 基线更新）
  - **风险与缓解**：列表页过滤工具栏间距变化会带动多张基线；缓解：逐张像素核验差异仅由间距偏移导致，必要时按内容重建单张基线

### 延期 / 暂缓项

- **T705 生产级部署**（PostgreSQL + Helm + Sentry）—— 2026-08-12 用户指示暂缓排期
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **C30 Publish Docker build job 失败排查** —— 2026-08-18 用户决策暂缓（双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作）；恢复条件：① master 分支 push 频率显著提升；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复
- **caomei-ui 0.x → 1.0 升级回归** —— 库处于 0.x（当前精确锁定 `0.3.0`），1.0 前 API / 目录仍可能调整。恢复条件：① 库发布 1.0.0 或用户指定目标版本；② 平台需跟进新组件能力；③ 用户明确恢复。届时按 M31 迁移期实证索引（[caomei-ui-migration.md §15](../design/governance/caomei-ui-migration.md)）做回归；**升级回归的像素兜底已就位**（M32.5 落地的视觉回归基线 `apps/platform/tests/visual/`，覆盖 alerts / repos / pr-checks / dialog-import-repos / login，口径见 [测试规范 §6.7](../standards/testing.md)）
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

#### 修复交付链路（验证链）

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

### apps/platform 早期 migration 表名前缀不统一（已知边界，待治理）

- **背景**：`createDataSourceOptions` 默认 `entityPrefix='dependfix_'`（`DATABASE_ENTITY_PREFIX` 可配），但 `apps/platform/server/database/migrations/` 早期迁移的表名处理**分两类**（逐文件实测 `getTable(` / `CREATE TABLE` / `ALTER TABLE` 字面量）：
  - **硬编码 `dependfix_` 前缀（4 个）**：`1700000000000`（`dependfix_audit_event`）/ `1750000000000`（`dependfix_scan_result`）/ `1800000000000`（`dependfix_pr_check`）/ `1800000000001`（`dependfix_schedule`）→ **默认前缀下正常工作**，但自定义 `DATABASE_ENTITY_PREFIX` 时表名失配 → 静默 no-op。
  - **硬编码无前缀表名（3 个）**：`1800000000002`（`scan_run`）/ `1900000000000`（`organization` / `repository` / `scan_run`）/ `2000000000000`（`credential`）→ 默认前缀下 `queryRunner.getTable('<无前缀表名>')` 返回 `undefined` → **静默 no-op**（不报错、无日志信号）；仅当 `DATABASE_ENTITY_PREFIX=''` 时生效。
- **共同失败特征**：两类都在「非预期前缀组合」下静默不生效，且迁移框架不报错——排查成本高。
- **已落地差异**：`2100000000000-AddRepositoryVerifyCommands`（M32.1 C76）改为**前缀感知**（先试 `entityPrefix + 表名`，再回退无前缀），单测覆盖两种前缀形态 + up/down 幂等 + 目标表缺失 no-op。
- **待治理**：早期 7 个迁移是否统一改前缀感知（或改为按实体元数据解析表名），需与「生产库实际如何升级 schema（`DATABASE_SYNCHRONIZE` opt-in vs migration 链）」一并决策。
- **手动入口（M33.7 已补齐）**：`pnpm db:migrate`（`db:migrate:show` 只读预览 / `db:migrate:revert -- --yes` 回退），见 [server/database/scripts/README.md §db-migrate](../../apps/platform/server/database/scripts/README.md)；本条治理范围（前缀一致性 + 幂等性）不受影响，仍待触发条件满足。
- **触发条件**：① 用户报告某字段在 `DATABASE_MIGRATIONS_RUN=true` 后仍未生效；② 出现自定义 `DATABASE_ENTITY_PREFIX` 的部署；③ 生产库迁移链正式启用排期（关联延期项 T705）。
- **规范挂接**：[platform.md §3.8](../standards/platform.md#38-仓库级自定义验证命令verifycommands-m321-c76)（前缀感知实现说明）

### 告警源「未启用 + 其余源全失败」时仓库仍记 0 告警成功（可审计性粒度，持续观察）

- **现象**：`fetchRepoAlerts` 的「全部源失败才抛错」判据为 `failedSources.length === totalSources`；未启用（`ALERTS_DISABLED`）的源计入 `alertsDisabled` 而**不计失败源** → 当「1 源未启用 + 其余源全部真实失败」时判据不成立，函数返回 `[]`，仓库以 **0 告警「成功」** 写入 `repoResults`。
- **影响**：仅**仓库级粒度**偏乐观（该仓库实际无任何有效数据）；失败信号仍完整暴露在 `RunResult.errors`（`allErrors`）+ exitCode 非 0 + 报告 errors 段落，**不影响退出码正确性**。
- **性质**：自 C78（Dependabot alerts 未启用）起即存在的形态；C89 把 Code Scanning / Code Quality 纳入同一口径后触发面扩大。当前口径已在 `packages/engine/src/app/repo-alerts.test.ts` 显式锁定（含「1 未启用 + 2 真实失败」的 N=3 组合用例）。
- **待治理**：把判据改为「无任何成功源且存在失败源」或按 attempted 源数判定；需同时评估对 `repoResults` 与报告「扫描成功」语义的连锁影响。
- **触发条件**：① 用户反馈「报告显示某仓库 0 告警但实际有告警」；② 平台侧按仓库汇总成功率时暴露偏差。

### M31 迁移遗留的配置清理项（已上收 M33.3）

- **`.github/dependabot.yml` 的 PrimeVue 相关 ignore 规则成死配置**：M31.5 已卸载 `primevue` / `@primevue/nuxt-module` / `@primeuix/themes` / `primeicons` / `primelocale` 5 依赖，`@primeuix/*` / `@primevue/*` / `primeicons` 的 ignore 条目不再命中任何包。清理动作：移除该批 ignore 条目与 M25 / M26 时期的配套注释（保留 `conventional-changelog` 条目）。
- **上收状态**：已 2026-09-30 上收 M33.3（[todo.md §M33.3](todo.md#m33-治理债收口--测试基建扩展2026-09-30-用户决策方案-a-启动)）；M33.3 闭环后本条目整段删除（依 [规划规范 §4.4 第 11 条](../standards/planning.md#44-大批量归档批次操作规范)「完全闭环 → 整段删除」）。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | **M33 治理债收口 + 测试基建扩展进行中**（2026-09-30 用户决策方案 A 启动，6 原子条目，见 [todo.md §M33](todo.md#m33-治理债收口--测试基建扩展2026-09-30-用户决策方案-a-启动)） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近阶段完整段 + 指针段；早期阶段见 [archive/](archive/)） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M32 已归档） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
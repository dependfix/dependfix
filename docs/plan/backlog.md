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
> **2026-08-26 闭环整理（M15 归档批次）**：UX-R2 扫描历史详情 Sidebar 增强 已由 M15.1 闭环（4 子任务：A + B + C + D 全部闭环；ahead 3 commits 待用户推送：`5c65177` P 阶段 docs + `1112017` feat 实施 + `0a60e3d` test 覆盖）；从 §扫描历史与详情 UX 主条目段迁出至历史归档指针段 + [todo-archive.md §M15](todo-archive.md#m15-扫描历史详情侧栏增强ux-r2已闭环)。§2026-08-20 e2e 修复批次（C62+C63+C64+chore）同时从 todo-archive.md 主窗口迁出至 [archive/todo-archive-phases-m11.md §2026-08-20 e2e 修复批次](archive/todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)——主窗口 700 行分片阈值前的预防性迁出。
>
> **2026-08-28 闭环整理（M16 归档批次）**：UX-R3 扫描历史独立页面 `/scans` 已由 M16.1 闭环（apps/platform/app/pages/scans.vue + `/api/runs` organizationId 隔离 + `/api/scan-history/summary` + 5 case e2e + 4 块汇总卡片 + viewer 可见）；从 §扫描历史与详情 UX 主条目段 UX-R3 子段迁出至历史归档指针段 + [todo-archive.md §M16](todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档)。**M16 全部 5 项闭环**：M16.1 UX-R3 `/scans` + M16.2 C66-D alerts "立即修复此仓库" + M16.3 C36 服务端 API 错误消息 i18n + M16.4 PrimeVue hydration 主线 #1 缓解 + M16.5 T701-e2e 管理端点集成测试补强；**19 commits 已全部推送至 origin/master，ahead=0**（M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5；含 kebab-case rename refactor `acfdc8d8` 触发的 CI Coverage 修复批次；`git rev-list HEAD ^origin/master --count` 2026-08-28 实测 ahead=0）。**主线 #1 状态更新**：PrimeVue hydration 从"暂停"变"已缓解"——M16.4 useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog + 评估是否升级到修复版本。**M16.5 audit backlog 已登记**：C38 credential.service.ts 改走 `useRuntimeConfig().encryptionKey` + `NUXT_ENCRYPTION_KEY` 标准化（M16.5 W-1）+ S-2 `authedCookieHeader` 抽取到 `tests/e2e/helpers/`（M16.5 audit suggest）+ S-4 better-auth admin 端点 viewer role check 单测补强（M16.5 audit suggest）+ M16.3 audit suggest 范围外扩展（`/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`）——M16.6+ 候选。**注**：C38 / S-2 / S-4 / M16.3 audit suggest 范围外扩展 4 条目已由 M17 全部 6 子阶段闭环落地，已从 backlog 主条目迁出至历史归档指针段（详见下方 §2026-08-28 闭环整理（M17 归档批次）段）。**同期动作**：M10 / T912 / C53 / 2026-08-20 平台 UI 增强 C59-C61 共 4 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)——M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略。
>
> **2026-08-28 闭环整理（M17 归档批次）**：**C38 / S-2 / S-4 / 服务端 API i18n 范围外扩展** 已由 M17 全部 6 子阶段闭环落地（M17.1 T1701 C38 encryptionKey 标准化 / M17.2-4 T1702-T1704 服务端 API i18n 范围外扩展 / M17.5 T1705 S-2 authedCookieHeader 抽取 / M17.6 T1706 S-4 better-auth admin viewer role check 单测补强）——分别上收为 [todo-archive.md §M17.1](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)（P1 安全硬缺口）/ [todo-archive.md §M17.2-4](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)（P2 沿用 M16.3 C36 已沉淀 `createLocalizedError` 模式，10 文件分 3 子阶段 credentials / schedules / batch-runs + repos batch）/ [todo-archive.md §M17.5](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)（P3 测试基建清理）/ [todo-archive.md §M17.6](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)（P3 测试完整性）。**按 backlog 维护规则 5 短期候选正式上收后从 backlog 主条目迁出**：C38 / S-2 / S-4 / 服务端 API i18n 范围外扩展 4 条目从 §服务端凭据加密路径 / §测试基础设施清理 / §测试覆盖补强 三段主条目迁出至历史归档指针段；M17 audit suggest 延后候选 S-5（调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理）/ C39（standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步）/ C34（存量规范严格约束挂接盘点）/ S1（`SCAN_PENDING_MERGED` 死代码）/ S2（`detectServerLocale` 缺 `?locale=` URL query 支持）/ S3（S-4 `update-user` 端点 viewer 403 矩阵延后）/ S4（S-4 admin 200 双向断言延后）维持 backlog 候选状态——未上收 M17 实施（本次 M17 阶段按"安全性优先 + 测试基建顺手做"取舍，audit suggest 延后候选建议下批次 neat-freak 批次合并实施）。主线 #1 PrimeVue hydration 维持"已缓解"状态不变（详见长期主线 #1 段）。**M17 总投入**：9 commits（M17.1 1 + M17.2 1 + M17.3 1 + M17.4 2 + M17.5 2 + M17.6 1 + session 收尾 1）已全部推送至 origin/master（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测——校正 session 文件 stale `ahead=8` 描述）；含 M17.4 commit 2 audit standard depth Reject 1 次后针对性补修闭环（M17 session 关键教训——nuxt typecheck 不实测不能信 Done 输出）。**M17 归档批次同期动作**：M12（19 commits / C65-A/B/C/D 4 子批次 + CI 修复 + network-audit + 收口）从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（M17 段 152 行新增后主窗口 738 行超 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略）。

### 主线 #1：PrimeVue 4 + Nuxt hydration rowGroup known-issue

- **目标**：闭环 PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧导致的 2 个 alerts-rowgroup.e2e `.fixme` 标记，恢复 rowGroup 真实环境跑通（不依赖 `page.reload()`）。
- **状态**：暂停。
- **当前状态**：
  - PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧——onMounted 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染；`page.reload()` 后能渲染可佐证非业务逻辑问题（CI run 32383730911 alerts-rowgroup rowGroup 测试遗留）。
  - 2 个 alerts-rowgroup.e2e.test.ts 测试以 `test.fixme()` 标记并加 known-issue 注释（命名空间 `known-issue/primevue-hydration-rowgroup`）。
  - 来源：[archive/todo-archive-phases-m11.md §2026-08-20 e2e 修复批次 C64-3](archive/todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（commit `6f6fe5b`；2026-08-26 M15 归档批次从 todo-archive.md 主窗口迁出至分片）。
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

#### 测试基础设施清理

- **S-5 调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理**（M17.1 audit warning #2 登记）
  - 当前状态：6 处调用方测试仍写 `process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'`：
    - `apps/platform/server/services/scan-orchestrator.test.ts:115,120,128`
    - `apps/platform/server/api/credentials/index.test.ts:28,33,71,73`
    - `apps/platform/server/api/credentials/[id].test.ts:28,39,92-94`
    - `apps/platform/server/api/repos/importable.get.test.ts:80,91`
    - `apps/platform/server/api/repos/batch.post.test.ts:31,36`
  - 现状：service 不再读 `process.env.ENCRYPTION_KEY`，实际密钥来自 `tests/setup-nuxt-server.ts:26` 全局 stub `useRuntimeConfig = () => ({ encryptionKey: 'test-encryption-key-32-bytes!!' })`；调用方测试之所以还能通过，纯属 **两边恰好都用同一字符串 `'test-encryption-key-32-bytes!!'` 的偶然一致性**（encryptToken 是纯函数，参数由测试显式传入，所以 env 设不设都不影响加解密路径）
  - 风险：若后续修改 setup-nuxt-server.ts 默认 stub 字符串，调用方测试会突然全挂且报错信息晦涩（"密文无法解密"）；或反向若有人误以为"删掉 setup-nuxt-server.ts 默认 stub 应该没事，反正测试设了 process.env.ENCRYPTION_KEY"，会引发 ReferenceError 回归
  - 修复方向：① 短期 — 5 文件删除 `process.env.ENCRYPTION_KEY` 赋值/清理对，改为显式 `vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!' }))` 或统一 helper；② 长期 — 抽 `setTestEncryptionKey(key)` helper（与 `setupMemoryDatabase` 同模式），与 M17.5 S-2 `authedCookieHeader` 抽取同源策略
  - 优先级：P3（不阻塞 M17.1 合并；建议与 M17.5 同批次合并实施）

#### PR 管理

- **B1** PR 关闭评论 + label（需 `issues: write` 权限，比当前 `pull-requests: write` 宽；触发：PR 数量增长影响 `pulls.list` 查重性能或用户需要 PR 列表可过滤时）
- **B2** 固定分支单线设计（独立平台部署后修复频率上升，需要固定修复分支如 `dependfix/auto-fix` 避免频繁向 master 提交 PR；触发：v1.0.0 后 M12 平台 UX 修复链路上线；关联：T210 指纹方案整合复用/重建策略 + force push 语义）

#### Code Scanning 规则体系

- **C15** B 类规则真实仓库样本核对（B 类列表覆盖 js/py/java 精选集，其余语言 go/ruby/csharp/cpp 落 C 兜底；需真实仓库 API 样本核对规则 id 格式与变体分布；来源：T302 Review Gate 2026-08-05）
- ~~**C16** 规则分类配置化（从硬编码常量表升级为配置文件 / env / 平台界面可配置；触发：M3 治理扩展 + 用户实测反馈规则分类需求；来源：T302 设计 2026-08-05）~~ **2026-08-26 状态：已由 M13.3 T1307 闭环落地**（详见 [todo-archive.md §M13](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)），条目从 backlog 主条目迁出；C16 后续增强候选（模块级 active config 单例 → 多 worker pool 场景需 per-worker config 隔离 / JSON 配置格式后续支持 wildcard 如 `js/*-injection`）登记于 todo-archive.md §M13.3 T1307 follow-up

#### Code Quality（Standard findings）

> **2026-08-26 状态更新**：C21（code-quality/findings 数据源接入）已由 M13.3 T1308 闭环落地（详见 [todo-archive.md §M13](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)），条目从 backlog 主条目迁出；C21 后续增强候选（rule.category 注入 NormalizedSecurityAlert / 平台 ScanRequest schema 扩展 codeQualityEnabled / 报告 markdown 展示 category 列）登记于 todo-archive.md §M13.3 T1308 follow-up。

#### org 增强

- **C22 GitHub App / installation token 认证（自部署平台 BYO App 模式 / PAT 默认保留）** —— 2026-08-28 用户实测触达：自部署平台管理员视角 classic PAT `repo` scope 权限过大、可直接推送代码超出"自动修复"预期风险；fine-grained PAT 需逐仓库勾选 + SSO 流程繁琐、离职轮换管理困难。GitHub App 价值：installation 范围限定（按仓库授权限）+ 短时 installation token（1h 自动轮换）+ 真实 `[bot]` 身份 + per-installation 审计日志。
  - **定位决策**：PAT（classic / fine-grained）保留为默认/快速上手路径（CLI quickstart / Action input / 单仓调试场景）；GitHub App 作为自部署平台进阶选项（推荐 org / 多仓场景）；两条路径**并存**而非替代。
  - **改造内容（10 原子子任务）**：
    - **C22-A1** Credential 实体扩展 —— 在现有 `type='github-app'` 基础上新增 `appId` / `encryptedPrivateKey` / `installationId` / `botLogin` 字段；PEM 密文长度上限调高（[apps/platform/server/entities/credential.ts](../../apps/platform/server/entities/credential.ts)）
    - **C22-A2** AuthProvider 抽象层 —— 新增 `AuthProvider` 接口（`getOctokit()` / `getGitCredential()` / `getCommitAuthor()`），PAT 与 App 各实现一份；执行器侧不感知差异（`packages/engine/src/auth/` 新建目录）+ `createGitHubClient` 重构为 AuthProvider 注入
    - **C22-A3** installation token 缓存层 —— worker 内存 1h 滑窗 + 提前 5min 刷新；失败重试 + 报警；扩展 [packages/engine/src/github/token-scope.ts](../../packages/engine/src/github/token-scope.ts) 增加 App installation token 探测
    - **C22-A4** git push 复用 `pushFixBranch` —— token 字段动态切换为 installation token，URL 不变（[apps/platform/server/services/executor/container-executor.ts](../../apps/platform/server/services/executor/container-executor.ts)）
    - **C22-A5** commit author 动态化 —— 现有 [packages/engine/src/github/pr-creator.ts](../../packages/engine/src/github/pr-creator.ts) 硬编码 `BOT_NAME='dependfix[bot]'` + `BOT_EMAIL='dependfix[bot]@users.noreply.github.com'` → 按 credential.botLogin 动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`（GitHub App 协议要求）；PAT 路径保留硬编码以兼容
    - **C22-A6** UI 凭据创建新增 GitHub App tab —— 字段 = App ID + 安装 ID + PEM 私钥（file upload 优先）+ Bot 用户名；PEM 客户端解析 + 公钥指纹校验
- **C22-A7** 安装引导 —— 提供 GitHub App Manifest flow URL（一键创建 + 自动回调）+ setup 文档含权限勾选截图（[docs/guide/quick-start.md](../guide/quick-start.md) `GitHub App 配置`章节 + `docs/guide/self-hosted-deployment.md` 待 C22-A8 创建）；Enterprise Server 不支持 manifest 时降级到手动配置 + 文档兜底
- **C22-A8** 文档同步 —— `quick-start` 加 "GitHub App 配置" 章节；[docs/design/governance/security.md](../design/governance/security.md) §5 凭据模型从"PAT 三件套"扩到"PAT + App"；[docs/design/governance/architecture.md](../design/governance/architecture.md) §认证更新
    - **C22-A9** 审计字段 —— `AuditEvent.payload` 增加 `authProvider: 'pat' | 'github-app'` + `installationId`（事故溯源 + 合规审计）
    - **C22-A10** 测试 —— 单测：`github-app-credential.test.ts` + `auth-provider.test.ts` + `pr-creator.test.ts` 增加 App bot email 路径回归；e2e：mock JWT signing + `getInstallationOctokit` 拦截，跑通"App 创建 → installation token → push → PR 全链路"
  - **不做什么**：
    - **不发布 dependfix 自身为官方 GitHub App** —— 单独战略候选（C22-future，见末段）；当前不具备团队运营能力（marketplace listing / 持续安全响应 / 计费 / 支持 SLA）
    - **不立即做 App 多 installation 编排自动化** —— 每 App 一个 credential，手动管理即可
    - **B 模式（`github-action` executor）App 适配非阻塞** —— 复用同一 AuthProvider 即可，推迟到 C22 主线后单独批次
    - **不破坏现有 PAT 路径** —— 用户无感升级；classic / fine-grained PAT 继续可用且行为不变
  - **现状落地先决条件**（已具备，无需新工作）：
    1. `Credential.type` 已枚举 `'github-app'`（[apps/platform/server/entities/credential.ts:17](../../apps/platform/server/entities/credential.ts)）
    2. `credentialSchema` 已允许 `type='github-app'`（[apps/platform/server/schemas/credential.ts:6](../../apps/platform/server/schemas/credential.ts)）
    3. `pr-creator.ts:60-61` 已硬编码 `BOT_EMAIL='dependfix[bot]@users.noreply.github.com'` —— 格式恰好是 GitHub App bot noreply 标准格式，A5 改造仅需"硬编码 → 动态"，无需改动协议格式
    4. `token-scope.ts` 已有 best-effort scope 警告（A3 实施时扩展 App installation token 探测即可）
    5. `@octokit/rest` 已就位（A2 实施时新增 `@octokit/auth-app`）
  - **关联**：M6 T602 凭据管理已交付 GitHub App 凭据类型 app-id + private-key 字段预留（credential.ts:15 注释行）；本条 C22 是该预留的完整实施。
  - **关键决策回顾（2026-08-28 用户确认）**：
    - **BYO App 模式** vs 官方 dependfix App：选 BYO App —— 自部署场景下用户本就必须自带凭据（PAT 本质就是自带），"自带 App"是同一约束的自然延伸；官方 App 需团队运营能力（marketplace listing / 持续安全响应 / 计费 / 支持 SLA），当前不具备，单独登记 C22-future。**2026-08-28 备注**：用户原话"暂时没有能力像其他机器人那样支撑一个官方的后台"——明确决策依据。
    - **PAT 与 App 并存** vs 完全替换 PAT：选并存 —— PAT 是 CLI quickstart / Action input / 单仓调试的最低摩擦路径，移除会破坏现有体验；BYO App 只对自部署平台多仓 org 场景提供增量价值（更细粒度的 installation 授权 + 短时 token 轮换）。**2026-08-28 备注**：C22 主条目范围限定为"新增 BYO App 路径"，**不触碰**现有 PAT 实现。
    - **commit author 动态化** vs 保留硬编码 `dependfix[bot]`：选动态化 —— 用户自带 App 的 bot login 各异（不一定叫 `dependfix`），硬编码会让 commit 无法被 GitHub 归因为真实 bot；动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com` 是 GitHub App 协议要求。**2026-08-28 备注**：PAT 路径保留硬编码以保持现有 commit 归属格式不变（虽然该格式当前是字符串约定而非真实 bot 身份，已知缺陷不在 C22 范围内修复）。
    - **Manifest flow 一键创建** vs 仅文档引导：选 Manifest flow（先文档引导 + 评估 Manifest flow 可行性，**2026-08-29 决策调整**）—— manifest URL 让用户点一下就能创建 App + 自动回调回 dependfix 设置页，UX 显著优于纯文档引导；GitHub Enterprise Server 不支持 manifest 时降级到手动配置 + 文档兜底。**2026-08-29 用户决策**：M18 阶段暂不实施 Manifest flow 一键创建，先以 A7a 文档引导落地（A7b 单独评估 Manifest flow 可行性，输出评估报告至 `docs/design/governance/c22-manifest-flow-feasibility.md`）；触发再评估条件：评估报告结论 + 用户实测反馈。
  - **C22-future 官方 dependfix GitHub App 发布候选（远期战略，不在本条范围）** —— 与 C22 平行独立的战略线。阻塞项：① 团队运营能力（marketplace listing / 持续安全响应 / 计费 / 支持 SLA）；② 单租户/自部署仍要求用户自带 App，官方 App 主要服务 SaaS 场景，与 open-core 定位有张力；③ 与现有开源许可 + 商业模式联动未决。触发上收条件：用户实测出现 SaaS 化诉求 / 团队到位 / 商业化路径定稿。**不在 C22 主线内实施**。
  - **M18 实施状态（2026-08-29 P 阶段已启动）** —— 详见 [todo.md §M18](todo.md#当前阶段：m18-平台-github-app-byo-app-模式--p-阶段启动-2026-08-29) 完整任务清单与决策固化。摘要：
    - **5 子阶段拆分**：M18.0（P0 docs only，PAT 无感升级评估）+ M18.1（C22.1 基础层，P1）+ M18.2（C22.2 集成层，P1）+ M18.3（C22.3 表现层，P2）+ M18.4（C22.4 测试层，P1）
    - **3 用户决策固化**（2026-08-29）：① M18.0 评估子阶段独立（A 决策）② fixtures 仅 mock 无真实 App（C 决策；用户接受风险）③ M18.x 治理批次合并入 C22 子阶段顺手做（B 决策）
    - **PAT 无感升级方案**：推荐 B（AuthProvider 注入统一入口）；`createGitHubClient` 改为 `{ auth: AuthProvider }`；老 `{ token }` 签名保留为 deprecated 包装；9 个测试 + 2 个 app 调用点改造；PAT 路径 commit author 保留硬编码兼容
    - **关键风险承担**：决策 C fixtures 仅 mock 违反"防升级回归"目的（e2e 不能验证真实 GitHub App 行为如 installation token 失效 / rate limit / JWT 签名边界），用户已接受；缓解措施 = 单测聚焦 `@octokit/auth-app` 库 mock 输出契约
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
- **C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步**（M17.1 audit warning #1 登记）**—— 2026-08-29 已由 M18.3 commit `7ef0d73 docs(guide+design+standards): GitHub App 配置章节 + C39 standards 同步` 顺带闭环**（`platform.md:150` / `platform.md:240` / `security.md:83` / `security.md:123` / `security.md:131` / `security.md:132` / `security.md:138` / `security.md:145` 共 8 处均已 `NUXT_ENCRYPTION_KEY`，与代码层 `useRuntimeConfig().encryptionKey` 单源一致）；条目可从 backlog 主条目迁出至历史归档指针段；唯一未改的 `docs/design/governance/sandbox-security-governance.md:22 + :98` 是 M8 阶段设计意图的历史快照（不应改）
- **C34 存量规范严格约束挂接盘点**（审查治理候选）
  - 2026-08-26 M14.x neat-freak 批次部分完成（roadmap.md L24 描述："⑫ C34 存量规范必级条款挂接盘点 + code-quality-checklist.md 双层对称补挂接 5 个必查项"）：补 5 个必查项到 code-quality-checklist.md（README/release 链路 / workspace 依赖包预构建 / 复合索引必须类级 / 裸 HTML 标签禁令 / 文档归档 anchor）
  - 2026-08-29 M18.x 治理批次批次1 增量：`code-auditor.agent.md` 主责边界新增「集成外部库 README 标准用法 + e2e 真实路径冒烟测试存在」必查项（1 条）；详见 [experience-archive.md §四十三](../../docs/design/governance/experience-archive.md) 与 [development.md §5.1.15](../../docs/standards/development.md) + [testing.md §6.3](../../docs/standards/testing.md) 配套规范
  - 剩余盘点：standards 中其他"必须级"条款（开发规范 §3 注释规范 / §4 依赖约束 / §5.1.x 系列工程经验 / 测试规范 §6 测试原则 / 安全规范 §5 凭据安全 / git 规范 §3 提交消息 / AI 协作规范 §1/§4）双层对称挂接完整盘点属于 neat-freak 批次工作，本次 M18.x 治理批次仅做 experience-archive §四十三 4 条新教训挂接；候选下批次会话处理
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

> 本段为 2026-08-26 用户实测截图反馈触发的扫描历史/详情视图 UX 增强候选；与 C66 平级。原 3 项 UX-R1→R2→R3 中 **UX-R1 已由 M14.2 闭环**（2026-08-26，详见 [todo-archive.md §M14.2](todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环) + 历史归档指针段）+ **UX-R2 已由 M15 闭环**（2026-08-26，ahead 3 commits 待用户推送，详见 [todo-archive.md §M15](todo-archive.md#m15-扫描历史详情侧栏增强ux-r2已闭环) + 历史归档指针段）；剩余 UX-R3 顺延至 M16（待 P 阶段规划：M16.1 summary API + M16.2 页面骨架 + M16.3 RepoHistoryDialog 迁移），按依赖排序推进。**UX-R2 已从本段主条目迁出**，仅保留 UX-R3 当前候选 + 上文 UX-R1/UX-R2 历史归档指针说明。

- **UX-R3 已上收 M16.1（2026-08-28 已闭环）**：候选已由 M16.1 落地（apps/platform/app/pages/scans.vue + `/api/runs` organizationId 隔离 + `/api/scan-history/summary` + 5 case e2e）；详细记录见 [todo-archive.md §M16.1](todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档) + 历史归档指针段；按 backlog 维护规则已闭环条目从本段主条目迁出，仅保留历史指针；下一阶段 M17+ 候选待启动。

### 已评估不实现（决策保留于归档段）

下列条目已在历史评估中明确"暂不实现"或"非本阶段范围"，从 backlog 主条目迁出，决策记录保留于对应归档段：

- **C1 / C2 / C6 / C7 / C10 / C11 / C12 / C17 / C18 / C19 / C20** —— 详见 [todo-archive.md §M4 治理记录](archive/todo-archive-phases-m2-m55.md#m4-阶段治理记录2026-08-05--2026-08-06) + [§T405 跨线升级显式授权](archive/todo-archive-phases-m2-m55.md)
- **C22 GitHub App 认证** —— 2026-08-29 状态：**M18 P 阶段已启动**（承接 2026-08-28 上收主条目 + 2026-08-29 用户 3 决策固化）；M18 范围 = 5 子阶段拆分（M18.0 PAT 无感升级评估 + M18.1 C22.1 基础层 + M18.2 C22.2 集成层 + M18.3 C22.3 表现层 + M18.4 C22.4 测试层）+ M18.x 治理批次合并入 C22 子阶段；详见本文件 §org 增强 §C22 主条目 + [todo.md §M18](todo.md#当前阶段：m18-平台-github-app-byo-app-模式--p-阶段启动-2026-08-29)。原"待用户触发再评估"的本段决策已被新决策覆盖，本行仅作为历史指针保留。
- **C26 / T1005 / C28 / C29 / C53** —— M10 沙箱 / C26 / T1005 / C28 / C29 / C53 已全部闭环；详见 [archive/todo-archive-phases-m10-c53-c59c61.md §M10](archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划已归档) + [§C53](archive/todo-archive-phases-m10-c53-c59c61.md#c53-平台集成模式-fix-修复结果推送远程已归档)
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

### 已闭环阶段

- **M17**（2026-08-28，安全与可用性收口 M17.1+M17.2+M17.3+M17.4+M17.5+M17.6，9 commits 含 session 收尾已全部推送至 origin/master ahead=0）：[todo-archive.md §M17](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)
- **M16**（2026-08-28，平台可用性深化 M16.1+M16.2+M16.3+M16.4+M16.5）：[todo-archive.md §M16](todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档)
- **M15**（2026-08-26，UX-R2）：[todo-archive.md §M15](todo-archive.md#m15-扫描历史详情侧栏增强ux-r2已闭环)
- **M14**（2026-08-26，T1310 + UX-R1 + neat-freak + 依赖批量治理）：[todo-archive.md §M14](todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)
- **M13**（2026-08-26，治理 + UX 反馈 + 网络治理 + Code Scanning）：[todo-archive.md §M13](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)
- **M12**（2026-08-25，平台 UX + i18n）：[archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（2026-08-28 M17 归档批次预防性分片迁出）
- **M0-M11**：详见 [todo-archive.md](todo-archive.md) + [archive/todo-archive-phases-*.md](archive/)

> 已闭环条目不应再在 backlog 主条目重复登记；详见各阶段归档文档。

### 已闭环特定批次

- **C53 平台集成模式 fix 修复结果推送远程**：详见 [archive/todo-archive-phases-m10-c53-c59c61.md §C53](archive/todo-archive-phases-m10-c53-c59c61.md#c53-平台集成模式-fix-修复结果推送远程已归档)
- **C16 规则分类配置化**（2026-08-26 闭环于 M13.3 T1307）：详见 [todo-archive.md §M13.3 T1307](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)
- **C21 code-quality-findings 接入**（2026-08-26 闭环于 M13.3 T1308）：详见 [todo-archive.md §M13.3 T1308](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环)
- **MCP 能力补充 C31 / C32**：详见 [archive/todo-archive-phases-m2-m55.md §M5.5 / T508](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)
- **M2 增强候选 B1 / B2 / B3**：详见 [archive/todo-archive-phases-m2-m55.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入已归档)
- **M17.1 C38 encryptionKey 标准化实施**（2026-08-28 audit standard depth Pass + W-3 修正 + W-1/W-2 登记 backlog；review-gate evidence 在本地 `artifacts/review-gate/2026-08-28-m17-1-t1701-c38-encryptionkey.md`（artifacts/ 在 .gitignore 中不入仓库，仅供本地查阅，CI 中不存在）；实施 7 文件 / +33/-29 行 / 21 个调用方测试从 ReferenceError 修复后 853 passed；M17 全部 6 子阶段 2026-08-28 全部闭环归档至 [todo-archive.md §M17](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)）
- **C38 encryptionKey 标准化**（2026-08-28 已闭环归档至 [todo-archive.md §M17.1](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)；关键 commit `b0d3ac0 fix(platform)`；原 M17.1 实施细节见上方"已闭环阶段 M17"段）
- **S-2 authedCookieHeader 抽取**（2026-08-28 已闭环归档至 [todo-archive.md §M17.5](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)；关键 commit `466b142 refactor(e2e)` + `fc0b175 chore(platform)`；原 M17.5 实施细节见上方"已闭环阶段 M17"段）
- **S-4 better-auth admin viewer role check 单测补强**（2026-08-28 已闭环归档至 [todo-archive.md §M17.6](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)；关键 commit `56df374 test(e2e)`；原 M17.6 实施细节见上方"已闭环阶段 M17"段）
- **服务端 API i18n 范围外扩展**（2026-08-28 已闭环归档至 [todo-archive.md §M17.2-4](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)；10 文件分 3 子阶段 credentials / schedules / batch-runs + repos batch；关键 commit `5f66a08` / `90549a0` / `98fd47d` / `a1c7c4e` 4 commits；原 M17.2-4 实施细节见上方"已闭环阶段 M17"段）

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段 |
| 已闭环阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 阶段：M17 / M16 / M15 / M14 / M13）+ [archive/](archive/)（M0-M12 详细分片，含 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |
| 长期主线 / 远期 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
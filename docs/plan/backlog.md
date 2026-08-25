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

### 主线 #1：PrimeVue 4 + Nuxt hydration rowGroup known-issue

- **目标**：闭环 PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧导致的 2 个 alerts-rowgroup.e2e `.fixme` 标记，恢复 rowGroup 真实环境跑通（不依赖 `page.reload()`）。
- **状态**：暂停。
- **当前状态**：
  - PrimeVue 4 DataTable + Nuxt SSR hydration 状态机分歧——onMounted 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染；`page.reload()` 后能渲染可佐证非业务逻辑问题。
  - 2 个 alerts-rowgroup.e2e.test.ts 测试以 `test.fixme()` 标记并加 known-issue 注释（命名空间 `known-issue/primevue-hydration-rowgroup`）。
  - 来源：[todo-archive.md §2026-08-20 e2e 修复批次 C64-3](todo-archive.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（commit `6f6fe5b`）。
- **最近一次上收**：C64 修复批次（2026-08-20）已修复 rowGroup 数据流必现 TypeError（`expandedPackages` Record → string[]），但 hydration 状态机分歧为 PrimeVue 上游问题，未修复。
- **下一次可切片方向**（任一触发时重新评估）：
  1. 迁移 alerts 加载到 `useAsyncData` 让 SSR 阶段就有数据（最低成本）
  2. 升级 PrimeVue 到修复版本（监控 PrimeVue 4 changelog）

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

### 远期登记 / 未排期增强候选

按主题分组（不重复 M2/M4/M5.5/M6/M7/MCP 已闭环段的具体细节，详细评估见对应归档段）：

#### MCP 能力

- **C33 MCP P3**：pnpm-audit 本地 tool（需 workDir 语义，等本地场景真实需求）/ 统一错误包装 helper（token 检查 + try/catch → ok:false 模板代码收口）/ 返回结构对齐完整 `RunResult`（当前 run_scan 只映射 8 字段，保持简化 + 文档声明）

#### i18n 治理

- **C36** 服务端 API 错误消息 i18n
- **C37** 语言偏好多设备同步

#### 多组织 / 多租户

- **D1** repo_admin + RepositoryAccess
- **D3** 多租户组织体系
- **SAML 2.0 SSO**（D2 username 等待评估后启动）

#### 用户管理

- **D8** remove-user 关联资源检查（无 user→resource 关联时暂不需要）

#### PR 管理

- **B1** PR 关闭评论 + label（需 `issues: write` 权限，比当前 `pull-requests: write` 宽）
- **B2** 固定分支单线设计（独立平台部署后修复频率上升时评估）

#### Code Scanning 规则体系

- **C15** B 类规则真实仓库样本核对（B 类列表覆盖 js/py/java 精选集，其余语言落 C 兜底）
- **C16** 规则分类配置化（从常量表升级为可配置）

#### Code Quality（Standard findings）

- **C21** 接入 `GET /repos/{owner}/{repo}/code-quality/findings` 数据源（确定性 CodeQL 质量规则：maintainability / reliability）；不阻塞 M5/M6；M5 后评估完整支持，最小报告接入可提前

#### org 增强

- **C22** GitHub App / installation token 认证（CLI 侧增强）
- **C23** 发现规模上限 max-repos（架构文档已规划未实现）
- **C24** org 级 alerts API 批量拉取（等真实大 org 用户痛点再动）

#### 报告与统计口径

- **C8** per-source 错误隔离（T301 遗留，并行源任一失败目前整体硬失败，演进为 warn + 仅弃该源）
- **C9** summary 字段未渲染（T304 遗留，告警 summary 已收集未渲染）

#### 架构与性能

- **C13** app/helpers ↔ cli/helpers 值级循环依赖（M3 收尾引入反向边）
- **C14** 多 cs 告警逐告警全项目 lint 性能（T303 遗留）

#### 治理

- **C34** 存量规范严格约束挂接盘点（审查治理候选）
- **G1** network-audit 默认白名单持续扩展问题 —— 详见长期主线 #2

#### 工作流

- **T905** git worktree 并行开发预案（触发条件：多 agent 并行成为常态）
- **T701-e2e** 管理端点集成测试补强

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

### 已闭环阶段（M0-M12）

- **M0-M11**：全部归档，详见 [todo-archive.md 主窗口](todo-archive.md) + [archive/todo-archive-phases-*.md 分片](archive/)
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
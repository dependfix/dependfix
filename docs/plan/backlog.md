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
- ~~**M22 规范单点声明收敛（neat-freak 批次）**~~ —— **已闭环 2026-09-02 M23.0 G1**（commit `f8a8640` docs(standards)，详见 [todo-archive.md §M23.0](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)）：security.md §2.1 为 SQLite 防护规则权威完整声明（§2.1.1-§2.1.5 五子节），development.md §5.1.18 + platform.md §3.7 第 1/2/3 条收敛为引用 + 仅保留差异化信息
- **db-restore 审计未采纳项（M22.2 落地遗留）** —— 2026-09-01 M22.2 A 阶段审计 S-1 第 2/3/4 项 + S-2 未采纳：① `inspectSqliteFile` 能打开但 `integrity_check != 'ok'` 分支未覆盖（需用 `PRAGMA writable_schema` 构造损坏 fixture）；② 恢复后 `integrity_check` 失败分支未覆盖（需 mock 注入）；③ sidecar `unlinkSync` 部分失败的 `removedSidecars` 状态一致性未覆盖；④ `--from` / `--to` 未做路径规范化（不校验 `..` / 符号链接）。当前 `db-restore` 是本地管理员工具，攻击面极低；恢复条件：脚本被远程 / 容器自动化触发，或补测试成本下降（对应实现见 `apps/platform/server/database/scripts/db-restore.ts`）

### 远期登记 / 未排期增强候选

按主题分组：

#### MCP 能力

- **C33 MCP P3**：pnpm-audit 本地 tool（需 workDir 语义，等本地场景真实需求）/ 统一错误包装 helper（token 检查 + try/catch → ok:false 模板代码收口）/ 返回结构对齐完整 `RunResult`（当前 run_scan 只映射 8 字段，保持简化 + 文档声明）

- **C36** 服务端 API 错误消息 i18n（当前 API 错误消息硬编码英文如 `error.code.field_required`；用户体验：中文用户看不懂；触发：M8 国际化后未覆盖服务端；验收：所有 `apps/platform/server/api/**` 端点错误响应 `code` 键维持英文 + `message` 键按请求 locale 返回）
- **C37** 语言偏好多设备同步（当前仅单一设备语言偏好；多设备切换需重新设置；触发：用户实测反馈多设备用户；前置：先有 C36 服务端 API i18n 基础）
- **C69 文档站 + 包 README 多语言实施（en-US）** —— 2026-09-08 用户调研触发。**现状盘点**：[`docs/standards/i18n.md`](../standards/i18n.md) 191 行完整规范已落地；[`apps/platform/i18n/locales/`](../../apps/platform/i18n/locales/) 平台 UI 国际化已落地（zh-CN + en-US）；CI 审计工具链 `pnpm i18n:audit:missing` / `pnpm i18n:audit:unused` / `pnpm i18n:audit:duplicates` / `pnpm docs:check:i18n` / `pnpm lint:i18n` 全部就绪。**缺口**：`docs/.vitepress/config.ts` 无 `locales` 配置（默认仅 root = zh-CN），`docs/i18n/<locale>/` 物理目录不存在；所有 `packages/*/README.md` 单语，未配 `README.en-US.md`。**目标**：参照 [momei `docs/i18n/<locale>/` 镜像结构 + VitePress locales + rewrites 模式](../standards/i18n.md)，补齐文档站 en-US 接入与包 README 双语化；过渡期策略按 [`i18n.md` §2.1 freshness 分层](../standards/i18n.md#21-文档翻译-freshness-分层)（must-sync 高频入口 + summary-sync 治理入口 + source-only 中文事实源）。**完整设计先行稿**：[docs-and-readme-i18n.md](../design/governance/docs-and-readme-i18n.md)。
  - **架构决策**：
    - **目录结构**：`docs/i18n/en-US/` 镜像中文根目录（vs `docs/en-US/` 平行结构 —— 已被 §6.2 第 4 条禁止；vs URL 前缀 `i18n/en-US/` —— 暴露内部组织）；VitePress `rewrites` 去掉 `i18n/<locale>/` 前缀，对外 URL 保持 `/<locale>/...`
    - **包 README 双语**：`README.md`（中文原版）+ `README.en-US.md`（英文翻译版）+ 顶部切换链接 `[简体中文](./README.md) | [English](./README.en-US.md)`（与 momei 完全一致 + 遵循 [`i18n.md` §4 README 多语言规范](../standards/i18n.md#4-readme-多语言规范)）
    - **翻译方式**：手动翻译 + 人工 review（vs AI 自动翻译——momei 实践验证技术术语 + 代码块 + Markdown 表格自动翻译质量不稳定）
    - **首批范围**：仅 en-US（按 [`i18n.md` §2 语言发布分级](../standards/i18n.md#2-语言发布分级) 三阶段准入；不立即多语言并进，先验证 en-US 流程跑通再评估 `zh-TW` / `ja-JP` / `ko-KR`）
    - **freshness 分层映射**：must-sync（首页 / quick-start / configuration / tech-stack / standards/i18n.md）/ summary-sync（governance 入口 / 高频设计文档）/ source-only（plan / research / 低频 guide / 设计文档深层）—— 直接沿用 §2.1 规范
    - **同步门禁**：新增 `pnpm check:readme-i18n` 脚本（双向链接 + 章节结构比对）+ CI test job 步骤，避免回归
    - **本次只文档 + 挂 backlog**：与 C68 决策一致，先文档沉淀 + 评估，避免一次性大改动
  - **范围（建议落地步骤）**：
    - **P0 文档站 en-US 接入**（5 commits）：① 文档站目录脚手架（`docs/i18n/en-US/` + VitePress locales + rewrites + nav/sidebar 双语）；② 首批 en-US 翻译（首页 + 4 个 guide + 1 个 standards + 2 个 governance = 8 个 md 文件）；③ 包 README 双语化（cli / mcp 完整双语 + 其他 3 个包 README 头部 + 切换链接）；④ 新增 `pnpm check:readme-i18n` 同步门禁脚本；⑤ CI workflow 更新（test.yml 添加 `pnpm check:readme-i18n` 步骤）
    - **P1 增强**：语言切换入口增强（顶部 badge / 弹窗）+ SEO 基础（hreflang + sitemap-locale-xml + canonical）+ 翻译自动化脚手架（README 章节结构比对脚本）+ 其他语言接入评估
  - **不做什么**：不引入 AI 自动翻译工具（momei 经验：质量不稳定）/ 不重写 `apps/platform` 现有 i18n 体系（已落地）/ 不修改 `docs/standards/i18n.md` 既有规范（除非落地过程中发现矛盾）/ 不立即支持 `zh-TW` / `ja-JP` / `ko-KR`（先聚焦 zh-CN + en-US 双语）/ 不翻译 `plan/` 与 `research/` 子目录（中文事实源优先）/ 不翻译 CHANGELOG.md（自动生成且高频变更）
  - **首批翻译范围（按 freshness 分层）**：
    - `must-sync`（30 天软上限）：`docs/i18n/en-US/index.md` / `docs/i18n/en-US/guide/{quick-start,configuration,tech-stack}.md` / `docs/i18n/en-US/standards/i18n.md`
    - `summary-sync`（45 天软上限）：`docs/i18n/en-US/design/governance/index.md` / `docs/i18n/en-US/design/governance/platform-ai-integration.md`
    - `source-only`（仅提供中文事实源入口，不承诺持续维护）：其他 design/* / 低频 guide/* / plan/* / research/*
  - **包 README 首批翻译范围**：
    - **完整双语**：`packages/cli/README.md` + `packages/cli/README.en-US.md` / `packages/mcp/README.md` + `packages/mcp/README.en-US.md`（cli / mcp 是用户最常 npm install 的入口）
    - **仅头部双语**：`packages/core` / `packages/engine` / `packages/skills` —— 仅 README 头部含 `[简体中文] | [English]` 切换链接，详细文档由 docs 站承载
  - **预估工作量**：P0 5 commits / 约 0.5-1 阶段切片容量（与 C68 量级相近但侧重 docs 翻译）
  - **A 阶段 audit 阈值**：commit 涉及 VitePress locales + rewrites + 多 md 翻译 + README 双语 + CI 步骤变更，**standard depth**（与 C67 / C68 audit 决策一致）
  - **上收触发条件**（任一）：① 用户实测反馈需要 en-US 文档（典型：海外 GitHub 用户询问 dependfix 但不会中文）；② 用户实测反馈需要英文 npm README（npm 平台 UI 多英文用户）；③ momei 多语言架构验证稳定（参考周期：6 个月观察期）；④ 与 C68 AI 研判平台集成联动（M28 阶段合并实施）；⑤ 用户明确触发上收
  - **关键决策回顾（2026-09-08 用户确认）**：
    - **目录结构 docs/i18n/en-US/** vs 平行 docs/en-US/：选 docs/i18n/en-US/ —— 与 momei 一致 + 已被 §6.2 第 4 条禁止旧目录回流 + rewrites 自动重写 URL
    - **手动翻译 + 人工 review** vs AI 自动翻译：选手动 —— momei 实践验证质量可控 + AI 翻译对技术术语 / 代码块不稳定 + 翻译流程与贡献者门槛平衡
    - **首批仅 en-US** vs 同时多语言：选仅 en-US —— 三阶段准入（draft / ui-ready / seo-ready）+ 先验证 en-US 流程跑通再扩展，避免一次性大改动
    - **freshness 直接沿用 §2.1** vs 自定义分层：选沿用 —— i18n 规范已成熟（与 C68 决策一致"先规范后实施"），避免重复声明
    - **新增 check:readme-i18n 脚本** vs 仅靠人工 review：选新增 —— CI 回归门禁（与 §6.3 提交前校验 + §6.4 Blocker 矩阵一致），防止 README 与 README.en-US.md 章节结构漂移
    - **本次只写文档 + 挂 backlog** vs 直接落地：选前者（用户决策 2026-09-08）—— 与 C68 决策一致，避免与当前 M24+ 阶段排期冲突；触发条件达到后再上收
  - **关联文档**：[`docs/standards/i18n.md`](../standards/i18n.md)（本文档遵循的唯一权威规范，§2 分级 / §2.1 freshness / §4 README / §5 术语 / §6 贡献流程 / §7 回归 / §8 PR 建议全部沿用）/ [`docs/design/governance/platform-ai-integration.md`](../design/governance/platform-ai-integration.md)（平行设计先行稿 C68，本文档即 C69 候选）/ [`docs/standards/git.md` §3 atomic commit 边界](../standards/git.md)（commit 拆分依据）/ [`docs/standards/documentation.md`](../standards/documentation.md)（文档规范）/ [`apps/platform/i18n/locales/`](../../apps/platform/i18n/locales)（平台 UI i18n 现有实现参照）/ <a href="https://github.com/CaoMeiYouRen/momei/blob/master/docs/guide/translation-governance.md">momei translation-governance.md</a>（多语言治理参考）/ <a href="https://github.com/CaoMeiYouRen/momei/blob/master/docs/.vitepress/config.ts">momei docs/.vitepress/config.ts</a>（VitePress locales 配置参考）/ <a href="https://github.com/CaoMeiYouRen/momei/blob/master/packages/cli/README.md">momei packages/cli/README.md</a>（包 README 双语模板参考）

#### 协议与依赖合规

- **C70 apps/platform PrimeUI 主题库降级（@primeuix/themes 3.x → 2.x）** —— 2026-09-08 用户调研触发。**现状**：[`@primeuix/themes@3.0.0`](../standards/index.md) 是 PrimeUI 商业 License（社区免费版有年收入< $1M USD / 开发者< 5 / 员工< 10 / 风投< $3M 限制，**强制 license key**，缺失/无效/过期会显示 license notice）；`apps/platform/nuxt.config.ts` 直接 import `import Aura from '@primeuix/themes/aura'` + `import { definePreset } from '@primeuix/themes'`；`primeicons@8.0.0` + `@primeui/license-manager@1.0.0` 同为 PrimeUI License（5 个 PrimeUI License 包）。**目标**：把 `@primeuix/themes` 从 `^3.0.0` 降到 `^2.0.3`（MIT 协议），消除商业 license 风险与 license key 配置负担。**完整设计先行稿**：[primeui-themes-v2-downgrade.md](../design/governance/primeui-themes-v2-downgrade.md)。
  - **架构决策**：
    - **降级 v2 vs 维持 v3 + 申请 license key**：选降级 v2 —— 改动最小（1 import + 1 版本号）+ 协议 MIT + 不依赖用户/组织规模
    - **仅降级 themes vs PrimeVue 4.x 全栈迁移**：选仅 themes —— PrimeVue 4.x 框架本体仍 MIT，迁移全栈成本远高于 license 风险
    - **v2 兼容性验证**：`definePreset` API 在 v2/v3 一致；自定义 DependfixPreset（仅改 `semantic.primary` 50-950 色阶）大概率无需改；需小范围跑 typecheck + test + build + dev 视觉回归
    - **本次只文档 + 挂 backlog**：与 C68 / C69 一致，先文档沉淀 + 评估，避免一次性大改动
  - **范围（建议落地步骤）**：
    - **P0 降级落地**（2-3 commits）：① `apps/platform/package.json` `@primeuix/themes` 版本约束 `^3.0.0` → `^2.0.3` + `pnpm install`；② `apps/platform/nuxt.config.ts` 检查 import 路径（如 v2 import 路径有变化需调整）；③ `docs/guide/tech-stack.md` 修正版本号标注（已写 `^2.x` 但实际是 `^3.x`，需对齐）
    - **P1 评估（可选）**：`primeicons@8.x` → `7.x`（MIT）降级 —— 项目仅用 2 个图标（pi-check-circle / pi-times-circle），license 风险有限但可一并清理；`THIRD_PARTY_NOTICES.md`（仓库根）补 PrimeUI License 治理记录 + caniuse-lite CC-BY-4.0 等；`pnpm licenses:audit` 加 CI 步骤
  - **不做什么**：不升级 PrimeVue 5.x（避免全栈 PrimeUI License）/ 不迁移其他 UI 库（Element Plus / Naive UI / Vuetify 成本极高）/ 不申请 PrimeUI 商业 license（依赖用户/组织资格，本文档不替用户决策）/ 不重写 DependfixPreset（definePreset API 在 v2 一致，理论上无需改）
  - **预估工作量**：P0 2-3 commits / 约 30 分钟（含 typecheck + test + build + 视觉回归）
  - **A 阶段 audit 阈值**：commit 涉及版本号变更 + import 路径调整 + 主题渲染回归，**standard depth**（与 C68 / C69 audit 决策一致）
  - **落地前 baseline**（用于落地后 diff 对比）：
    - `pnpm list @primeuix/themes --filter @dependfix/platform`：`@primeuix/themes@3.0.0`
    - `pnpm licenses list --prod --json | jq '.["Unknown"] | length'`：7（其中 5 个 PrimeUI 相关）
    - `pnpm view @primeuix/themes@3.0.0 license`：PrimeUI License（社区免费版）
  - **落地后预期**（验证生效）：
    - `pnpm list @primeuix/themes --filter @dependfix/platform`：`@primeuix/themes@2.0.3`
    - `pnpm view @primeuix/themes@2.0.3 license`：**MIT**
    - `pnpm licenses list --prod --json | jq '.["Unknown"] | length'`：2（移除 5 个 PrimeUI 相关）
    - 全 license 分布 MIT 占比：84.1% → 84.7%（+5 个）
  - **回滚预案**：v2 验证失败 → pin `@primeuix/themes@2.0.0`（v2 最早版避免 minor 变更）/ 评估 OpenVue 1.0 迁移 / 申请 PrimeUI 商业 license（用户决策）
  - **上收触发条件**（任一）：① 用户实测反馈 apps/platform 部署出现 PrimeUI license notice（合规紧迫）；② 用户实测反馈需要长期 license 合规（公开部署 / 商业化）；③ 与 C68 / C69 联动（M28 阶段合并 license 治理 + i18n 治理 + AI 研判）；④ 用户明确触发上收
  - **关键决策回顾（2026-09-08 用户确认）**：
    - **降级 v2 vs 维持 v3 + 申请 license key**：选降级 v2 —— 改动最小 + 协议 MIT + 不依赖用户/组织规模
    - **仅降级 themes vs PrimeVue 全栈迁移**：选仅降级 themes —— PrimeVue 4.x 框架本体仍 MIT，迁移全栈成本远高于 license 风险
    - **本次只文档 + 挂 backlog**：与 C68 / C69 决策一致，避免一次性大改动；触发条件达到后再上收
  - **关联文档**：[`docs/standards/index.md`](../standards/index.md)（平台 UI 主题现状）/ [`docs/standards/platform.md`](../standards/platform.md)（`@primeuix/themes` + Aura preset + `darkModeSelector: '.dark'`）/ [`docs/guide/tech-stack.md`](../guide/tech-stack.md)（技术栈文档，需修正版本号）/ [`docs/design/governance/platform-ai-integration.md`](../design/governance/platform-ai-integration.md)（C68 平行设计）/ [`docs/design/governance/docs-and-readme-i18n.md`](../design/governance/docs-and-readme-i18n.md)（C69 平行设计）

#### 多组织 / 多租户

- **D1** repo_admin + RepositoryAccess（实现仓库级 admin 角色区别于全局 admin；当前 owner 角色对仓库控制粒度不足；关联：C22 GitHub App 验证身份）
- **D3** 多租户组织体系（支持多个组织/org 共存；当前 single-org 模型限制 org 切换；前置：D1 仓库级权限；触发：org 场景用户痛点）
- **SAML 2.0 SSO**（D2 username 等待 SAML SSO 上后再决定 username 模型；当前 better-auth OIDC 优先）

#### 用户管理

- **D8** remove-user 关联资源检查（无 user→resource 关联时暂不需要；前置：先有 D1 资源关联表）

#### 测试基础设施清理

- ~~**cron-preview 时区测试 wall-clock 依赖消除**~~ —— **已闭环 2026-09-02 M23.4 + 2026-09-03 M24.3**（M23.4 commit `df4ba9b`：双分支固定-now 用例 + `=== 8 || === 160` 简化断言；M24.3：cron-preview.ts 顶部注释"测试 helper 模式评估"段 + todo.md §M24.3 验收 [x]；详见 [todo-archive.md §M23.4](todo-archive.md#m234-测试补强🧪-测试补强--治理收口2026-09-02-闭环) + [todo-archive.md §M24.3](archive/todo-archive-phases-m24.md#m243-p3-🧪-测试-cron-preview-wall-clock-依赖消除1-commit--25-行)）

#### PR 管理

- **B2** 固定分支单线设计（独立平台部署后修复频率上升，需要固定修复分支如 `dependfix/auto-fix` 避免频繁向 master 提交 PR；触发：v1.0.0 后 M12 平台 UX 修复链路上线；关联：T210 指纹方案整合复用/重建策略 + force push 语义）

- ~~**PR Check 状态监测**~~ —— **已上收 2026-09-03 M24.1**（用户决策方案 B；详见 [roadmap.md §M24](roadmap.md#m24-pr-check-mvp--治理债--测试补强--用户体验) + [todo-archive.md §M24](todo-archive.md#m24-pr-check-mvp--治理债--测试补强--用户体验m241m242m243m244m245-全部已闭环--2026-09-03-归档)）。P 阶段决策纪要 D1-D8 全部 2026-09-02 用户决策落地：PRCheck 实体独立于 ScanResult；Polling 间隔 5min/仓；失败 PR firing alert + ack UI（回归 success 自动 ack）；用户手动创建 schedule 启用；webhook MVP 仅接口预留；仅 per-org scope；env 开关 `ACTION_STATUS_MONITOR_ENABLED` 默认 false；文档明确 mergify 仍是主控（[dependfix README + `.github/mergify.yml` 注释 + PRCheck 设计文档](#)）

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

- **C66 告警视图增强（GHSA/CVE 关联 + 跨次扫描去重 + fix 复用）** —— 2026-08-25 用户实测反馈触发；候选评估完成待上收；用户决策：Q1 去重粒度 = **B1 数据层去重（upsert 唯一索引）** / Q2 GHSA/CVE 展示 = **C3 单列智能**（优先 GHSA，fallback CVE）。5 原子子任务：
  - **C66-A1 ScanResult 数据模型扩展** —— 加 `ghsaId` / `cveIds` 列 + TypeORM migration；保留 `ruleId` 兼容 code-scanning 源（[apps/platform/server/entities/scan-result.ts](../../apps/platform/server/entities/scan-result.ts)）
  - **C66-A2 fetcher 提取 GHSA + CVE** —— Dependabot API `cve_id` + `identifiers[]` 透传 / pnpm-audit `cves[]` 透传（[packages/engine/src/github/dependabot-fetcher.ts](../../packages/engine/src/github/dependabot-fetcher.ts) + [__fixtures__/dependabot-alerts.json](../../packages/engine/src/github/__fixtures__/dependabot-alerts.json) / [packages/engine/src/alerts/pnpm-audit-fetcher.ts](../../packages/engine/src/alerts/pnpm-audit-fetcher.ts)）；`NormalizedSecurityAlert` 接口加字段（[packages/core/src/alerts/index.ts](../../packages/core/src/alerts/index.ts)）
  - **C66-B ScanResult 跨次扫描去重** —— upsert 唯一索引 `(repositoryId, source, packageName, advisoryKey)` + 历史 `fixStatus` 保留（fingerprint = `${repositoryId}|${packageName}|${ruleId ?? ''}` + 应用层 Map 聚合 + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds 字段已实施，B1 数据层去重暂缓；如未来需"fix 复用复用同一 scan_run_id 跨次刷新"语义时再考虑迁移到数据层 upsert，关联 C66-D）
  - **C66-C alerts UI 增加 GHSA / CVE 列** —— 单列智能（`Identifiers` 列） + 多 CVE 显示首个 + 展开全部（当前 `ruleId` 字段已轻量覆盖：Dependabot 显示 GHSA 编号 / pnpm-audit 显示 CVE 编号或 advisory URL / code-scanning 显示 CodeQL rule id；完整 schema 扩展（A1+A2 后做"独立 `Identifiers` 列"）保留为后续增强候选，触发条件：用户要求按 GHSA 单独搜索/过滤 / 多 CVE 展开视图）
  - **C66-D fix 模式复用 scanRunId** —— `POST /api/repos/[id]/scan` 接受 `reuseScanRunId` 跳过重拉 + alerts 视图加 "立即修复此仓库" 入口（[scan.post.ts](../../apps/platform/server/api/repos/[id]/scan.post.ts) + alerts.vue）
  - 不做什么：不重写 Dependabot 详情页（详情在 dependabot 那边有，UI 只展示关键标识 + 跳链）/ 不立即支持自定义 advisory 来源（GitLab Advisory Database 等）/ 不破坏现有 fixStatus / 修复链路
  - 上收触发条件（任一）：用户实测反馈升级（重复告警问题再次出现 / 用户明确要求上收）/ fix 复用被 B 模式（GitHub Action）性能瓶颈触发
  - 关键决策回顾（2026-08-25 用户确认）：
    - **B1 数据层去重** vs B2 UI 层 GROUP BY / B3 每次清空：选 B1 —— 彻底解决重复 + 自然支持 fix 复用 + 不破坏审计（fixStatus + scanRunId 仍可追溯）；B2 实现简单但数据膨胀 + fix 复用难做；B3 最简单但破坏"何时发现"审计信号。**备注：B1 数据层去重暂缓，应用层去重（方案 B2 等价）已实施且满足当前业务需求；如未来需要 fix 复用 / 历史 fixStatus 跨次保留再迁移到 B1**
    - **C3 单列智能** vs C1 两列分开 / C2 单列合并：选 C3 —— 用户原话"GHSA ID ... 这才是能真正跨平台追溯漏洞的关键信息"（GHSA 在 GitHub Advisory Database 统一收录多个 CVE，反向追溯更强）；C1 多列占空间但实际查看价值有限；C2 简单但 GHSA / CVE 视觉权重平等，跨平台追溯信号被稀释

#### 平台治理扩展

- **C68 平台 AI 研判集成（apps/platform 端到端联通）** —— 2026-09-08 用户调研触发。**现状**：AI breaking change 研判引擎层 `packages/engine/src/ai/` M5 已闭环（commit 3475e6e），CLI / MCP / GitHub Action 三条用户路径全部支持 `--ai` 系列参数；apps/platform（管理平台）作为执行入口时**零集成**——`POST /api/repos/[id]/scan` 不接收 ai 字段、`ScanRequest` schema 无 ai 字段、三执行器（container / sandbox / github-action）未透传 `RuntimeConfig.ai`、UI 无 AI 配置入口、RunDetailDialog / alerts 视图不消费 `result.aiUsage`。**目标**：让用户在管理平台点 "扫描" 即可启用 AI 研判，集中管理 AI API Key（避免散落 CLI / Action 用户），并在 UI 上可观测 AI 用量与评估结果。**完整设计先行稿**：[platform-ai-integration.md](../design/governance/platform-ai-integration.md)。
  - **架构决策**：
    - **API Key 挂载层**：Organization 级加密存储 + 单仓库级开关（vs Repository 级 Key / 全局 platform.config / Credential 复用）—— 一个 Key 服务多仓库避免重复采购 + Organization 实体（M7.1 已落地）天然支持；单仓库独立 aiEnabled 控制成本 / 合规
    - **未来三层扩展**：评估个人使用（platform.config）/ 组织（本文档）/ 公开（仅 CLI / Action）三种区分
    - **三执行器一致**：container / sandbox / github-action 同步补齐（vs 仅 container 先落地）
    - **合并优先级**：API override > Repository 默认 > Organization 共享 Key
  - **范围（建议落地步骤）**：
    - **P0 核心集成**（6 步 / 估算 7-9 commits）：① 数据模型（Organization.aiApiKeyEncrypted + aiProvider + aiModel + aiBaseUrl + aiApiUrl + Repository.aiEnabled + aiTrigger + ScanRun.aiConfigSnapshot） + migration；② Schema + Service + Executor 透传；③ 4 个 API 端点（POST scan 扩展 + PATCH organization-ai-config + GET repo-ai-config + POST repo-ai-config）；④ UI（Organization AI 配置表单 + 仓库 AI 开关 + 扫描对话框 override + RunDetailDialog 用量 + alerts 评估列）；⑤ i18n（zh-CN + en-US 加 `ai.*` 命名空间）；⑥ docs/design/governance/architecture.md 同步更新
    - **P1 增强**：AI 输出安全门与审计（[architecture.md §AI 研判误判处理](../design/governance/architecture.md) 对齐：lint/typecheck/build 验证 + PR 不自动合并 + 置信度阈值 + maskSecrets 日志脱敏）
  - **不做什么**：不重写 AI 研判引擎本身（engine 层 M5 已闭环）/ 不引入新 AI provider（OpenAI 兼容 + Anthropic 双 provider 足够）/ 不立即支持"个人层"配置（按触发条件评估）/ 不修改 CLI / MCP / GitHub Action 已有的 AI 参数（避免回归）/ 不破坏现有 ScanRequest schema（仅扩展字段，向后兼容）
  - **预估工作量**：P0 7-9 commits / 约 1.5-2 阶段切片容量（与 C66 量级相近）
  - **A 阶段 audit 阈值**：commit 涉及 schema / migration / 三执行器透传 / 4 个 API 端点 / UI 状态机变更，**standard depth**（与 C67 audit 决策一致）
  - **上收触发条件**（任一）：① 用户实测反馈需要管理平台触发 AI 研判（典型：组织内多人协作希望统一管理 Key）；② 公开部署（docker 一键部署）后用户配置 AI 研判门槛太高；③ M28+ 阶段（含 M7.2 平台能力深化续期）启动时；④ 与 C66 告警视图增强联动（M28 阶段合并实施）；⑤ 用户明确触发上收
  - **关键决策回顾（2026-09-08 用户确认）**：
    - **AI Key 挂 Organization 级** vs Repository 级 / 全局 / Credential 复用：选 Organization 级 —— 一个 Key 服务多仓库 + Organization 实体已支持 + 多组织 / 多租户场景天然隔离；Repository 级 Key 散落不合规；全局 platform.config 违反多租户方向；Credential 复用混职责
    - **三执行器同步补齐** vs 仅 container 先落地：选三执行器同步 —— 不一致会埋"未来 sandbox 启用后才发现 AI Key 透传缺失"的坑（参考 sandbox-executor 设计.md §8 类似教训）；container / sandbox / github-action 链路一致才完整
    - **合并优先级 API override > Repository 默认** vs 完全 override：选前者 —— API override 用于"本次扫描特殊覆盖"（如一次性大版本升级），日常按仓库默认；完全 override 会让 API 调用方每次都要传，运维负担重
    - **本次只写设计文档 + 挂 backlog** vs 直接落地：选前者（用户决策 2026-09-08）—— 先文档沉淀 + 评估，避免一次性大改动与当前 M24 阶段排期冲突；触发条件达到后再上收
  - **关联文档**：[architecture.md §AI 研判误判处理](../design/governance/architecture.md) / [sandbox-security-governance.md §A §C](../design/governance/sandbox-security-governance.md)（AI 研判在供应链防护的角色）/ [platform-auth-users.md](../design/governance/platform-auth-users.md)（Organization 实体扩展基线）/ [platform-scheduled-batch.md](../design/governance/platform-scheduled-batch.md)（定时扫描链路统一应用 AI 研判）/ [standards/index.md](../standards/index.md)（"AI 研判不自动合并"治理原则）/ [experience-archive.md](../design/governance/experience-archive.md)（经验沉淀持续追加）

#### 平台批量导入 / Resource owner 抽象

- **C67 批量导入 Resource owner 化** —— 2026-09-04 用户实测反馈：当前 Platform 批量导入对话框（`apps/platform/app/components/import-repos-dialog.vue`）后端 `importable.get.ts:34` 硬编码默认 `affiliation='owner'`，前端从不传 `affiliation` 查询参数（`import-repos-dialog.vue:147-152`），仅显示用户个人仓库；对组织仓库 + 用户所属多组织场景支持不足。MCP 工具 `packages/mcp/src/tools/discover-repos.ts:24-31` 已在 Resource owner 抽象层级（`owner: string[]` 入参），Platform UI 与 MCP 不一致。**用户决策（2026-09-04）**：① 采用 Resource owner 抽象（沿用 GitHub 官方概念，不区分 user vs org）；② 单端点设计（共用 `GET /api/repos/importable`，通过 `include=owners|repos` 路由）；③ 凭据创建时记录 owner（Fine-grained PAT 必填 + GitHub App 可自动从 installation 解析 + Classic PAT 可选）；④ 不提供"全部 owner 合并视图"（坚持 Resource owner 级别隔离）；⑤ **暂时不纳入当前阶段**（M24+ 远期候选）。

  - **架构对齐**：与 MCP `discover_repos` `owner: string[]` 参数 + engine `fetchOwnerRepositories`（`repository-discovery.ts:179-203`）auto-detect user/org 模式天然一致；本次改造让 Platform UI 收敛到同一抽象
  - **前提改动（schema 扩展）**：
    - `apps/platform/server/entities/credential.ts` 新增 `ownerLogin: string | null` 列（nullable column；与现有 `botLogin` / `installationId` 等 nullable 字段同模式）
    - `apps/platform/server/schemas/credential.ts` Zod discriminated union 同步扩展：
      - `type='fine-grained-pat'` → ownerLogin 必填（Fine-grained PAT 创建时绑定单一 owner，运行时无法动态发现）
      - `type='github-app'` → ownerLogin 可选，可从 `installationId` 经 `GET /app/installations/{id}` 自动解析后填充
      - `type='classic-pat'` → ownerLogin 可选（运行时通过 `GET /user` + `GET /user/orgs` 自动发现为准）
    - 对应 TypeORM migration（data migration 路径同 `synchronize opt-in` 策略，参考 [platform.md §3.6](../../docs/standards/platform.md) + [development.md §5.1.19](../../docs/standards/development.md)）
    - Credential 视图 (`apps/platform/app/types/platform.ts`) 同步扩展 `ownerLogin?: string | null`
  - **单端点契约**（`GET /api/repos/importable`）：
    - `?credentialId=X&include=owners` → 返回 `{ owners: ResourceOwner[] }`，TTL=5min 缓存（key=`owners:${credentialId}`）
    - `?credentialId=X&owner=Y` → 返回 `{ repos, total, cachedAt, fromCache }`，缓存 key=`repos:${credentialId}:${ownerLogin}`
    - **向后兼容**：`affiliation` 参数保留并标记 deprecated（行为不变）；当 `owner` 与 `affiliation` 同时存在时 `owner` 胜出
  - **owner 发现逻辑**：
    - Classic PAT：`GET /user` 拿 personal owner + `GET /user/orgs` 拿所属组织 owner 列表，personal 永远排第一
    - Fine-grained PAT user-bound：`GET /user` 拿 personal owner（单值）；`/user/orgs` 大概率 403/404 忽略
    - Fine-grained PAT org-bound：依赖凭据 `ownerLogin` 字段（运行时无法发现）
    - GitHub App：`installation.account` 字段直接读取（无需运行时发现）
  - **UI 改造**：
    - `import-repos-dialog.vue` 新增 Resource owner 选择器（PrimeVue Select，与现有 credential 选择器风格一致）
    - 当 owner 列表仅 1 项时降级为只读 chip 显示（Fine-grained PAT / GitHub App 场景）
    - 凭据切换时联动：先 load owners → 默认选第一个 → load 该 owner 的 repos
    - i18n 新增 5 个 key：`repos.importOwner` / `importOwnerPlaceholder` / `importOwnerPersonalBadge` / `importOwnerOrgBadge` / `errors.ownersFetchFailed`（zh-CN + en-US 各一份）
  - **不做什么**：
    - 不重写 repos 列表现有 fork / visibility / search 三维过滤（保持不变）
    - 不重写 batch.post 批量导入提交链路（仅修改 importable.get 拉取链路）
    - 不立即支持"全部 owner 合并视图"选项（用户原话：做一层 Resource owner 级别的隔离会更好）
    - 不破坏现有 `affiliation` 参数行为（仅标记 deprecated，保留向后兼容）
  - **预估工作量**：~3.5-4 小时 / 3 commits：
    - `feat(api)` 新增 `ownerLogin` 字段 + TypeORM migration + credential schema 扩展 + 测试（约 1h）
    - `feat(api)` `importable.get.ts` 单端点重构（`include=owners|repos` 路由 + 向后兼容）+ 单测（约 1.5h）
    - `feat(ui)` `import-repos-dialog.vue` Resource owner 选择器 + i18n + 联动逻辑（约 1.5h）
  - **A 阶段 audit 阈值**：commit 2 + commit 3 走 standard depth（涉及 schema / 缓存策略 / UI 状态机变更）
  - **上收触发条件**（任一）：M24 阶段收口后用户实测反馈升级（组织仓库管理需求被升级）/ 多组织场景实测痛点再出现 / Classic PAT 多 org 用户主动要求 / 主线 #1 PrimeVue hydration 闭环后 `useAsyncData` 模式可复用至此 dialog
  - **关键决策回顾（2026-09-04 用户确认）**：
    - **Resource owner 抽象** vs 个人/组织二态/三态：选 Resource owner 抽象 —— 与 GitHub 官方语义对齐 + 与 MCP `discover_repos` owner 数组参数同源 + 跨多 org 场景天然支持（Classic PAT 可同时持有 5+ 组织成员资格，二态切换粒度太粗）
    - **单端点** vs 双端点（owners + repos 分离）：选单端点 —— 用户明确偏好 + 实现更省（仅 1 个 API 端点 + 1 个测试文件）+ 缓存粒度通过 `include` query param 隐式区分；缺点是单端点契约面变宽，未来若 owner 列表需独立扩展（如订阅 webhook）需重新拆分
    - **凭据创建时记录 owner** vs 纯运行时发现：选前者 —— Fine-grained PAT 绑定单一 owner 无法动态发现（`GET /user` 返回 404 必须静态记录）；GitHub App 可自动从 `installationId` 解析（无需用户输入）；Classic PAT 可选（运行时发现为准，但保留字段便于 UI 预选默认）
    - **不提供合并视图** vs 提供"全部"入口：选不提供 —— 用户原话"如果用户/组织下面的项目比较多，混在一起实际上也不太好找（虽然说有搜索功能），做一层 Resource owner 级别的隔离会更好"，明确反对混合视图
    - **暂时不纳入**：当前 M24 阶段排期已满（M24.1 PR Check MVP + M24.2 治理债 + M24.3 测试补强 + M24.4 源码治理 + M24.5 i18n），本特性作为 M25+ 远期候选
  - **关联文档**：架构 [architecture.md](../design/governance/architecture.md) + [c22-pat-backward-compat.md §4.5](../design/governance/c22-pat-backward-compat.md) + [planning.md §3.1 新需求默认走评估→backlog 原则](../standards/planning.md)

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
  - TypeORM 1.x 升级 / 替换为 0.3.x（1.x 已停止维护）—— 见 M23 候选
  - PostgreSQL 多写者迁移 —— 见 M23 候选
  - better-sqlite3 WAL 模式启用 + auto-checkpoint 调整（减少断电时数据丢失风险）
  - SQLite 文件 inode 监控（`fs.watch` 检测 .sqlite 文件被外部 rm / rename 触发紧急备份）
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
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（M25 阶段 2026-09-08 用户决策启动方案 A + 完整闭环归档：PrimeUI License 治理 + 平台 AI 研判集成基础层 + lint baseline 治理 + M24 follow-up 工具化 / M25.1+M25.2a+M25.3+M25.4 共 4 原子条目 17 commits / ahead=17 待用户主动推送；M26 阶段规划候选已就位待用户决策） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 阶段：M25 / M24 / M23 / M22 / M21 / M20；早期阶段见 [archive/](archive/)） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M25 段已 2026-09-08 用户决策启动 + 完整闭环归档；M26 阶段规划候选待用户决策启动） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
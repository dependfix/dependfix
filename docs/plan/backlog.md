# 待办积压 (Backlog)

> 本文档存放后续阶段与未排期增强候选。当前阶段任务见 [todo.md](todo.md)；已归档阶段见 [todo-archive.md](todo-archive.md)。

## 2026-08-19~20 平台 UX/可用性闭环批次汇总

> **背景**：2026-08-19~20 用户实测反馈一批平台 UX / 可用性问题，原登记为 backlog C46-C61。本批次一次性收口三个 PR + 三个独立 fix 任务，全部完成。
>
> **收口清单（10 个 backlog 项 → 已归档至 [todo-archive.md](todo-archive.md)）**：
>
> | 批次 | 关联 backlog | commit 序列 | 归档位置 |
>|:--|:--|:--|:--|
> | **PR1 原子修复** | C47（Dialog draggable）+ C48（默认全勾） | `cb788e7` `9e26b56` | [todo-archive.md §PR1](todo-archive.md#pr1-c47--c48-原子修复-) |
> | **PR2 单仓库扫描** | C52（mode/severity 选择） | `1a663f3` | [todo-archive.md §PR2](todo-archive.md#pr2-c52-单仓库扫描模式补全-) |
> | **PR3 批量导入** | C46（过滤 UI）+ C49（分页）+ C50（默认凭据） | `2a7f99f` | [todo-archive.md §PR3](todo-archive.md#pr3-c46--c49--c50-批量导入能力补全-) |
> | **C51 扫描历史子路由** | C51（unrouting 0.2.x 兼容 bug） | `b067b3a` `2102894` `0b9411b` | [todo-archive.md §C51](todo-archive.md#c51-扫描历史子路由不可达unrouting-02x-兼容-bug--应用层-dialog-改造) |
> | **C54 batch-runs 刷新** | C54（60s 节拍 + 增量 reconcile） | `3a2757b` `edb066c` | [todo-archive.md §C54](todo-archive.md#c54-batch-runs-页面刷新策略) |
> | **C55 batch-runs 孤儿兜底** | C55（stale-cleanup + force-fail） | `ce523d4` `4c813f8` | [todo-archive.md §C55](todo-archive.md#c55-batch-runs-孤儿运行兜底) |
> | **C59 暗色模式 mixin** | C59（global dark mode mixin 失效） | `9949504` `03ba3b2` | [todo-archive.md §C59](todo-archive.md#c59-暗色模式全局样式未生效-) |
> | **C60 表格排序** | C60（7 表 sortable + 业务语义） | `a1d5bd9` `532ea78` `6b994b5` `5bba3f4` `5fbad71` | [todo-archive.md §C60](todo-archive.md#c60-平台表格排序) |
> | **C61 仪表板图表** | C61（severity 饼图 + 修复率 + Top-10） | `ffacfca` `5abd914` `402dc03` `5bba3f4` `5fbad71` | [todo-archive.md §C61](todo-archive.md#c61-仪表板告警图表) |
>
> **仍待评估（保留 backlog）**：C53（平台 fix 推送 PR / 后置 M11 评估）/ C58（alerts.vue 图表 / 同类 C61）
>
> **触发条件未达不实施**：C29（暗色模式）已由 C59 闭环删除；M6 C25/C27（已闭环 2026-08-08）已删除。
>
> **本节清理（2026-08-20）**：原 backlog.md 中各 C 项长段描述（C46 / C47 / C48 / C49 / C50 / C51 / C52 / C54 / C55 / C59 / C60 / C61）已删除，详细实施记录 / 修复方向 / 验收要点 / commit hash 见 [todo-archive.md](todo-archive.md) 对应区块。


## M4 增强候选（未排期）

> 2026-08-06 M3 归档时从阶段遗留 / 观察点整理，非 M4 本期范围（M4 核心为多仓库治理 T401-T404，见 [todo-archive.md](archive/todo-archive-phases-m2-m55.md#m4-多仓库治理增强已归档)）。按主题分组，随运行反馈再评估上收。

### 工具链与锁文件

> 已闭环（2026-08-06/07 清理，记录见 [todo-archive.md §M4](archive/todo-archive-phases-m2-m55.md#m4-阶段治理记录2026-08-05--2026-08-06)）：C1 pnpm 11 overrides 假成功检测（12af197d）、C2 toolchainPnpmVersion 验证链（cf12e381）、C20 lint:md 文档门禁（47050e6e）。

- **C3 漂移检测弱代理**（T305 遗留）
  - 状态：🔶 待评估
  - 内容：lockfileVersion 漂移检测为相对对比（before/after），非严格"声明版本一致性"校验
  - 来源：T305 Review Gate（2026-08-05）
- **C4 pnpm catalog 依赖的 override 行为未实测**（G3 遗留）
  - 状态：🔶 待评估
  - 内容：使用 pnpm catalog 声明的依赖，版本化 overrides 是否生效未实测
  - 来源：G3 处理记录（2026-08-05）
- **C35 pnpm audit 拉取应显式指定官方 registry**（用户反馈登记）
  - 状态：✅ **已修复（2026-08-18）**
  - 内容：`runPnpmAudit`（`packages/engine/src/alerts/pnpm-audit-fetcher.ts`）执行 `pnpm audit --json` 时未指定 `--registry`，会继承用户 `.npmrc` / `npm_config_registry` 环境变量中的镜像站配置；部分镜像站（如 npmmirror）audit 元数据缺失或不同步，导致拉取不到数据或数据不完整
  - 修复：spawn 命令追加 `--registry=https://registry.npmjs.org/`（pnpm 11 CLI 规范 `--registry` 参数优先级 > `npm_config_registry` env > `.npmrc`，固定官方源不受镜像配置污染）；与 `changelog-fetcher.ts:81` `registryBaseUrl` 默认口径对齐。22/22 定向测试 + 831/831 engine 全量回归通过，typecheck/lint 0 error。`fixers/dependency/index.ts` 实际无 registry URL 校验逻辑（C35 描述中的 "fork/私有源改写防护" 语义澄清为版本声明层防护，非 registry URL 层）
  - 来源：2026-08-10 用户反馈

### 报告与统计口径

> 已闭环（2026-08-06 清理，cf12e381）：C6 PR body 64KB 截断、C7 alertsConverged 口径拆分。

- **C8 per-source 错误隔离**（T301 遗留）
  - 状态：🔶 待评估
  - 内容：并行源任一失败目前整体硬失败（已拉取的 Dependabot 结果丢失）；演进为 warn + 仅弃该源（需确认语义）
  - 来源：T301 Review Gate（2026-08-05）
- **C9 summary 字段未渲染**（T304 遗留）
  - 状态：🔶 待评估
  - 内容：告警 summary 已收集未渲染（JSON 可见；报告/PR body 如需摘要列可加）
  - 来源：T304 Review Gate（2026-08-05）

### 覆盖策略

> 已闭环（2026-08-06 清理，10927851）：C10 lockfile 告警版本关系细化、C11 workspace 成员直接依赖识别。
- **C12 major overrides 确认机制**（G3 遗留）
  - 状态：🔶 已评估，暂不实现（2026-08-05）
  - 内容：major overrides 自动拦截不实现（逐包验证 + 回滚已兜底）
  - 来源：G3 处理记录
  - 关联：**T405（2026-08-07）已实现 `--allow-major-upgrade` 跨线显式授权通道**，但语义不同——T405 针对"当前线内无修复版本"的跨线告警（仅直接依赖单版本自动升级，强制完整验证）；C12 指常规链路的 major overrides 自动拦截确认机制，仍不实现

### 架构与性能

- **C13 app/helpers ↔ cli/helpers 值级循环依赖**（M3 收尾引入反向边）
  - 状态：🔶 待评估（与 M5 T505 CLI 解耦关联）
  - 内容：quickVerifyProject ↔ validateVerifyCommands 运行时安全；建议下沉公共层或回调注入
  - 来源：M3 收尾审查登记（2026-08-05）
- **C14 多 cs 告警逐告警全项目 lint 性能**（T303 遗留）
  - 状态：🔶 待评估
  - 内容：多 code-scanning 告警时逐个跑全项目 lint；可合并验证
  - 来源：T303 Review Gate（2026-08-05）

### Code Scanning 规则体系

- **C15 B 类规则真实仓库样本核对**（T302 遗留）
  - 状态：🔶 待评估
  - 内容：B 类列表覆盖 js/py/java 精选集，其余语言（go/ruby/csharp/cpp）落 C 兜底；需真实仓库 API 样本核对规则 id 格式与变体分布
  - 来源：T302 Review Gate（2026-08-05）
- **C16 规则分类配置化**（T302 声明扩展点）
  - 状态：🔶 待评估
  - 内容：规则分类从常量表升级为可配置（文件 / env / 平台界面）
  - 来源：T302 设计（2026-08-05）

### GitHub Code Quality（Standard findings）

- **C21 接入 Code Quality Standard findings 数据源**（2026-08-07 评估登记）
  - 状态：🔶 已评估，登记 backlog（用户决策：不阻塞 M5/M6；M5 后评估完整支持，最小报告接入可提前）
  - 内容：接入 `GET /repos/{owner}/{repo}/code-quality/findings`（确定性 CodeQL 质量规则：maintainability / reliability），新增 `source: 'code-quality'` 复用 `NormalizedSecurityAlert` 模型与 A/B/C 规则分层；首版 report-only（C 类默认），机械性规则白名单自动修复为演进项；规则分类器扩展（质量规则 id 为 `js/useless-assignment-to-local` 斜杠格式，与 CodeQL 安全规则同族，可复用 `classifyRule`）
  - **定价澄清（用户确认 2026-08-07）**：Standard findings（确定性 CodeQL 扫描）**免费跑**，仅消耗 Actions minutes；付费面为 **AI findings / Copilot Autofix**（消耗 AI credits）。公开报道口径（2026-07-20 GA，$10/active committer/月）与实际计费需实测校准
  - 与 Code Scanning 差异：目的（质量债 vs 安全漏洞）；severity（`error/warning/recommendation` + `category` vs `security_severity_level`）；UI（`/security/quality` vs `/security/code-scanning`）；权限（**`Code quality: read`** vs `security-events: read`——GitHub App UAT/IAT 均支持但需显式配置权限，GITHUB_TOKEN 可达性需实测）；分页（cursor `before/after` vs octokit.paginate Link header）
  - 前置（实测项）：IAT / GITHUB_TOKEN 对 `code-quality/findings` 的权限可达性；`state` 枚举值域；cursor 分页语义；action.yml 是否新增 `code-quality: read` 权限键
  - 来源：2026-08-07 评估（用户提问：Standard findings 与 Code Scanning 差异、是否支持）

### M4 非目标演进项

- **C17 内容嗅探判断技术栈**：T401 非目标（首版 topic/dependabot.yml 探测）；内容扫描成本与 token 面需评估
- **C18 名单正则引擎**：T403 非目标（首版 glob 通配）
- **C19 报告保留策略**：T404 非目标（容量治理：归档上限 / 清理策略）

### GitHub Organization 增强候选（2026-08-07 评估登记）

> 评估结论：M4 已交付 org 基础支持（`--owner` 发现走 `GET /orgs/{org}/repos`、过滤链、per-repo 告警拉取、直接推送分支建 PR、测试覆盖），基础可用。以下为评估后登记的增强项，按价值排序；README 已补 org 用法与权限说明。

- **C22 GitHub App / installation token 认证**（CLI 侧增强，org 场景安全性关键项）
  - 状态：🔶 待评估（关联 M6 T602）
  - 内容：当前仅支持 PAT（`GITHUB_TOKEN` / `DEPENDFIX_GITHUB_TOKEN` / `DEPENDFIX_ALERTS_TOKEN`）；架构文档声明输入含 "GitHub App 凭证"（[architecture.md](../design/governance/architecture.md)），但 [github-client.md](../design/packages/github-client.md) 明确"不实现 GitHub App / Installation Token 认证"。org 场景 PAT 痛点：classic PAT 需 `repo` 全量 scope（权限过大）；fine-grained PAT 需逐仓库配置 + 逐个 org 启用 SSO；个人 token 离职/轮换管理困难。GitHub App 价值：按仓库授权限、短时 token、org 管理员可控可审计
  - 实现路径：`createGitHubClient` 增加 app auth（appId + privateKey → JWT → installation token），或支持直接注入 installation token（后者近零成本，当前传任意有效 token 即可用，缺的是文档化 + 生成链路）
  - 关联：M6 T602 凭据管理已交付 GitHub App 凭据类型（app-id + private-key，见 [todo-archive.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)）；CLI 侧认证能力为其前置或并行增强
  - 来源：2026-08-07 GitHub Organization 支持评估
- **C23 发现规模上限 max-repos**（架构文档已规划未实现）
  - 状态：🔶 待评估
  - 内容：[architecture.md](../design/governance/architecture.md) 规划 `max-repos` 输入参数，代码未实现（grep 零命中）。大 org（数百仓库）一次性全量发现 + 逐仓库探测 `.github/dependabot.yml`（N 次 contents API），配额消耗与总耗时不可控；现有防护仅 concurrency（report-only 16）+ 限流重试 + probe 并发 5，无总量上限
  - 建议：发现层按配置上限截断（排序后截断保证确定性），或拆为分批处理
  - 来源：2026-08-07 GitHub Organization 支持评估
- **C24 org 级 alerts API 批量拉取**（优化项）
  - 状态：🔶 待评估（等真实大 org 用户痛点再动）
  - 内容：GitHub 提供 org 级 `GET /orgs/{org}/dependabot/alerts` 与 `GET /orgs/{org}/code-scanning/alerts`，当前按仓库逐仓拉取（listAlertsForRepo）。大 org 场景可显著减少 API 调用，但需按仓库重组结果 + defaultBranch 注入（org 级响应可能缺省分支上下文），复杂度上升
  - 来源：2026-08-07 GitHub Organization 支持评估

### M4 残余风险登记（2026-08-06，T402-T404 Review Gate 移交）

> M4 交付时审计登记的 8 项残余风险。
> **2026-08-07 清理**：R1-R7 已全部闭环（修复批次 3d19d499 / ac8ce5c7 / 965e68f3），记录见 [todo-archive.md §M4 治理记录](archive/todo-archive-phases-m2-m55.md#m4-阶段治理记录2026-08-05--2026-08-06)，本条仅保留 R8。

- **R8 多进程 index 写竞态**（**部分完成**）：原子写已落地（临时文件 + rename，无半截文件）；双进程 read-modify-write 丢失更新在单进程 CLI 语义下不可达，平台化（M6+ 数据库化）消解

### M4 已知限制（P3 观察项，非阻塞）

> **2026-08-07 清理**：7 项已闭环（--history 与运行参数并存、小数截断拒绝、merge 大小写去重、repoSlug 碰撞后缀、cleanup-branches 空归档跳过、cleanup-branches maxConcurrency 拒绝、M4 参数接入 Action），记录见 [todo-archive.md §M4 治理记录](archive/todo-archive-phases-m2-m55.md#m4-阶段治理记录2026-08-05--2026-08-06)，本条仅保留观察项。

- **action artifact 体积**：归档结构（summary.json + 每仓库 md/json）随上传，artifact 略增

## M5.5: Skill 编排（CLI 先行）

> **已归档（2026-08-07）**：T506-T508 全部完成，见 [todo-archive.md §M5.5](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)。

## M6: 最小平台 MVP

> **已归档（2026-08-08）**：T601-T605 + T607 全部完成，见 [todo-archive.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)。以下仅保留本阶段转移出的增强候选与遗留观察项。
> **已闭环清理**：C25（B 模式结果回填，17c5082f + 60d9fd6e）、C27（runUrl 状态语义，随 C25 联动解决）——记录见 [todo-archive.md §M6 治理记录](archive/todo-archive-phases-m6-m7-t711.md#m6-阶段治理记录2026-08-07--2026-08-08)。

- **C26 独立沙箱容器执行实现**（T607 设计文档产出后的实现候选）
  - 状态：✅ **M10 实施规划已闭环（2026-08-19 决策会议 + 2026-08-20 收口归档）**——T1001 B1+B2 Docker rootless + RuntimeAdapter 抽象层 / T1002 出站白名单拦截代理 / T1003 cgroup v2 资源限制 / T1004 文档收口 全部 commit + Review Gate Pass；13 commits 待推送（`b189aaa` `a07f577` `b6083a7` `c68029a` `9da2421` `a85fb03` `32658e7` `5ae5165` `e48b097` `06377b2` `b289668`）。G5 治理项收口，[sandbox-security-governance.md §5 G5 行](../design/governance/sandbox-security-governance.md#5-治理决议与登记) 升级为"实施规划已就绪"。**前置依赖 T702/T802/T805/C38/C45 全部已落地**（BullMQ 并发 / detached 进程组 / 网络审计代理 / 容器降权 / 工具链修复）。**剩余项 T1005**（sandbox 路由接线）见下。
  - 详细归档与实施记录：[todo-archive.md §M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)
  - 设计文档：[executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计)（§7.1 RuntimeAdapter 抽象 / §7.2 镜像策略 / §7.3 部署形态 / §7.4 与 ContainerExecutor 并存 / §7.5 K8s+Helm 部署预留 / §7.6 验收对照 / §7.7 设计反例）
  - 反模式已登记（绝对不可用）：[DinD with `--privileged`](https://blog.nestybox.com/2019/09/14/dind.html) + [挂 `/var/run/docker.sock`（DoD）](https://www.wiz.io/academy/container-escape)—— CVE-2019-5736 runc 逃逸实证，违反 [sandbox-security-governance.md §3 路径 D](../design/governance/sandbox-security-governance.md)
  - 来源：M6 规划（2026-08-07，Q4=A 设计+最小实现，完整沙箱留后续） → 2026-08-14 安全专项评估提级 → 2026-08-19 决策会议 + 调研落地 → 2026-08-20 M10 收口归档
- **T1005 sandbox 路由接线**（2026-08-20 M10 移交 backlog）
  - 状态：✅ **已闭环（2026-08-20）** —— schema 扩展（`schemas/repository.ts` + `schemas/scan.ts` zod enum 含 'sandbox'）+ scan-orchestrator sandbox 分支 + resolveExecutorKind 优先级（request > repository.executorKind > actionWorkflowFile 自动 > container 默认）+ `isAvailable()` 启动期探测 + 不可用立即降级 ContainerExecutor + stderr warn；runtime 偶发故障仍走 sandbox_unavailable → 标记 failed（不静默降级）
  - 实现细节：[scan-orchestrator.service.ts](../../apps/platform/server/services/scan-orchestrator.service.ts) sandbox 分支 + [scan-run-state.ts](../../apps/platform/server/services/scan-run-state.ts) executorKind 类型扩展（含 sandbox）
  - 测试覆盖：5 个新 case（1 resolve + 4 runScanForRepository sandbox 路由：可用时执行 / 不可用降级 ContainerExecutor / runUrl 兜底 / 运行时 sandbox_unavailable 不静默降级）
  - Review Gate：standard 1 轮 Pass with Warning（RG-W02 时间戳 bugfix 合并提交 / RG-W03 backlog 状态同步已修复 / RG-W04 sandboxLimits 字段留 M11 后段）
  - 关联：归档于 todo-archive.md（当前 M10 已知边界已含 T1005 移交记录，T1005 单独归档段待文档批次落地）
  - 来源：M10 收口移交（2026-08-20）；[todo-archive.md §M10 已知边界](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)
- **C28 security.md 补凭据加密存储章节**（M6 终审 W4 登记 + T912-3 联动）
  - 状态：🔶 待评估（不阻塞；T912-3 安全与文档与本项合并处理）
  - 内容：security.md 未登记 T602 凭据加密机制（ENCRYPTION_KEY / AES-256-GCM / 解密仅执行时内存 / 凭据最小化），加密设计散落 executor-sandbox.md §3 与 credential.service.ts 注释；安全设计文档应与实现同步补"凭据加密存储"一节（T602 已交付，文档待补）
  - **T912-3 联动**：邮件发送安全章节（SMTP 凭据仅从 runtimeConfig 读取不进前端 bundle + 速率限制防刷 + 失败 fail-closed）与本项合并为单一文档同步任务——[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t912-3-待排) 已标注 T912-3 移交本项
  - 来源：M6 终审（2026-08-08，deep Review Gate warning 4）+ T912-3 移交（2026-08-20 M10 归档批次）
- **C29 平台 UI 暗色模式不可用**（已闭环于 C59，2026-08-20）
  - 状态：✅ **已修复**（commit `9949504` + `03ba3b2`，C59 应用层方案 A，1 行 mixin 修复 + 永久 e2e 回归）—— 详见 [todo-archive.md §C59](todo-archive.md#c59-暗色模式全局样式未生效-) 与本节顶部"2026-08-19~20 闭环批次汇总"表
  - 治理登记保留：T601 暗色模式 initial 实现 + 2026-08-10 用户实测反馈"依旧不可用"历史追溯；修复路径：`_mixins.scss` `@mixin dark-mode` 把 `:global(.dark) &` 改为 `.dark &`（`:global()` 是 CSS Modules 语法，全局 `main.scss` 无 scope 时无效）
- **C53 平台集成模式 fix 修复结果不推送远程（无 PR）**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：✅ **已闭环（2026-08-20，M11 阶段启动任务）** —— 实施 3 commits（`83ec736` / `46b7c15` / `3ed8303`）+ Review Gate 全部 Pass：
    - C53-1 容器内 push 链路（pushFixBranch + extractBranchName + execute 接入）—— commit `83ec736`
    - C53-2 PR 创建 + 状态机扩展（createPrForFix + pr_creation_failed → dispatched）—— commit `46b7c15`
    - C53-3 清理时序（workDir 保留 24h + 远程分支清理工具）—— commit `3ed8303`
  - 完整 Review Gate 记录（3 round Pass）和 3 commits 引用见 [todo-archive.md §C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)
  - 设计文档：[executor-sandbox.md §8](../design/governance/executor-sandbox.md#8-a-模式-push--pr-推送机制)（§8.1 流程变更 / §8.2 状态机扩展 / §8.4 凭据权限阶）
  - 后续 backlog（P3 阶段）：
    - **[C53-后-A]** stale-cleanup 任务：moveToPending 写入 `_pending/{runId}/` 当前无定时清理机制；按 `.meta.json` 的 `expiresAt` 字段扫描删除（C53-3 RG-W2）
    - **[C53-后-B]** `sanitizeErrorMessage` 补充 `Authorization: token xxx` 模式：C53-2 RG-W2 登记后续 patch
    - **[C53-后-C]** A 模式 dispatched UI 提示：用户看到 dispatched 状态需明确"PR 创建失败，分支已推，可手动开 PR"（当前 UI 通用 dispatched 提示）
  - 决策记录（保留用于审计追溯）：
    - 位置：`apps/platform/server/services/executor/container-executor.ts`（原 M6 阶段第 48-51 行 clone + 第 71 行 `app.run()` + 第 95 行 `rm(workDir)` 清理）
    - 问题：平台集成模式（container executor）下 `fix` / `fix-and-pr` 模式：clone 仓库到工作目录 → 容器内 `DependfixApp.run()` 完成修复 → **第 95 行直接把 workDir 删除**。修复结果（改动的文件 / commit / branch）**只存在于本地临时目录，从未 push 到远程、未创建 PR**。用户反馈："修复结果只在本地，未推送到远程……显然没有修复并 PR 来的直观（也确实没有修复功能）"
    - 修复方向（已采纳 A）：容器内 push + PR，复用 `http.extraheader` 凭据注入模式与 `repository` 实体的 `credentialId` 关联
    - 关联：C50（默认关联凭据）提供推送凭据；与 C52（单仓库模式选择）同属平台执行链路补齐
    - 来源：2026-08-19 用户反馈"平台集成模式下，仅修复有一个直接的问题，那就是修复结果只在本地，未推送到远程……没有修复并 PR 来的直观（也确实没有修复功能）"

## M11: 业务可见性 + 沙箱落地 + 安全文档（2026-08-20 启动）

> **背景**：C53 闭环后，平台 A 模式（container）的 `fix` / `fix-and-pr` 链路具备完整 push + PR 闭环，结束了 M6 阶段"修复结果仅在本地临时目录"问题。M11 阶段由 C53 触发启动，承接三方面 backlog：
>
> 1. **业务可见性**（C53 已闭环作为 flagship）+ C56 / C57 / C58 平台 UX 用户反馈
> 2. **沙箱落地**（T1005 sandbox 路由接线 + 后续 M10 收尾）
> 3. **安全文档**（C28 security.md 凭据加密存储章节 + T912-3 邮件发送安全）
>
> **优先级**：P1（M11 子任务随用随触发）
> **状态**：🔶 启动规划中（2026-08-20 C53 闭环后）

### M11 子任务清单

| 编号 | 任务 | 优先级 | 状态 | 备注 |
|:--|:--|:--:|:--|:--|
| C53-后-A | 工作目录 stale-cleanup 任务（_pending 24h 清理） | P2 | 待评估 | C53-3 RG-W2 登记 |
| C53-后-B | sanitizeErrorMessage 补充 `Authorization: token xxx` 模式 | P3 | 待评估 | C53-2 RG-W2 登记 |
| C53-后-C | A 模式 dispatched UI 提示（手动开 PR） | P3 | 待评估 | 当前 UI 通用 dispatched 提示 |
| T1005 | sandbox 路由接线（schema 扩展 executorKind = 'sandbox' + orchestrator 分支 + 降级契约） | P1 | 待排期 | M10 实施规划遗留 |
| C28 | security.md §凭据加密存储章节补齐（T602 AES-256-GCM 文档化） | P2 | 待评估 | T912-3 合并处理 |
| C56 | 批量扫描 Dialog 关闭时序（乐观关闭） | P3 | ✅ **已闭环（2026-08-20）** —— submitBatchScan 提交前 batchDialogVisible = false；失败时回滚 dialog + 显示错误。commit `cda5b90` |
| C57 | 扫描历史 Dialog 缺面包屑（"返回列表"按钮） | P3 | ✅ **已闭环（2026-08-20）** —— RepoHistoryDialog DataTable header slot 加 icon pi pi-arrow-left + i18n runs.backToList；点击 resetDetail() 回到 list view。commit `cda5b90` |
| C58 | 告警视图按包聚合 + 图表（独立评估） | P3 | 待评估 | C58 backlog |

### M11 验收标准（暂拟）

- [ ] 平台 A 模式 `fix-and-pr` 真实环境跑通（push + PR 闭环 + UI 提示）
- [ ] T1005 路由接线后 sandbox 执行器可真实触发（docker daemon 可用时）
- [ ] security.md §5.4 + §5.5 凭据权限阶 + 加密存储章节落地
- [x] C56 / C57 平台 UX 用户反馈小修闭环（commit `cda5b90`）
- [ ] branches 80% 覆盖率维持
- [ ] `pnpm lint` / `typecheck` / `test` 全绿
- [ ] CI 端到端裁决通过

### M11 关联

- **backlog 来源**：C53（已闭环作为 M11 旗舰任务）+ T1005（M10 遗留）+ C28（T912-3 联动）+ C56/C57/C58（2026-08-20 用户反馈）
- **不影响**：M10 沙箱实施规划已归档（[todo-archive.md §M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)），M11 仅承接其路由接线（T1005）
- **M11 命名逻辑**："业务可见性 + 沙箱落地 + 安全文档" 三维度并列——前一项已闭环作为旗舰，后续按用户反馈优先级随用随触发

- **C56 批量扫描 Dialog 关闭时序（用户感知"点了不关"）**（M6 平台可选项 / 2026-08-20 用户实测反馈）
  - 状态:🔶 待评估
  - 位置:`apps/platform/app/pages/repos.vue` `submitBatchScan`（293-313 行）+ `batchDialogVisible` ref
  - 现象:用户点击"开始扫描"后,Dog 一直 spinning + 弹窗保持可见,直到 200 OK(包含 `/api/repos/batch-scan` 返回) 才关闭并跳转 `/batch-runs`。用户实操感觉"点了不关"(测试时通常 sync 模式几百毫秒,但真实 batch 任务可能 1-5s,期间弹窗看起来"卡住")
  - 现状（代码层 `submitBatchScan` line 293-313）:
    - `await $fetch('/api/repos/batch-scan', ...)` → `batchDialogVisible.value = false` → `await navigateTo('/batch-runs')`
    - dialog 关闭 promise 与 navigateTo 顺序串行:fetch 完成 → dialog 关闭 → 跳转
    - 失败路径(catch)会保留 dialog + 写 `batchError`,用户能看到错误 → 这是正确行为
  - 根因:乐观关闭缺失。当前实现是"等数据回来才关",延迟时长 = 后端 batch 任务分流耗时。同步模式测试快所以不易察觉,异步模式(B 模式 / 队列模式) fetch 本身耗时更长,用户感知更明显
  - 修复方向（候选）:
    - **方案 A(推荐,最小改动)**:乐观关闭 — 提交前 `batchDialogVisible.value = false`,loading 反馈改由 toast/按钮 loading 在 /batch-runs 页面承接。失败时回滚 dialog 并显示错误(`onError` 重新打开 batchDialogVisible)
    - **方案 B**:Dialog 内部加进度展示 — 提交后 dialog 变"已加入队列,正在跳转……"+ 进度条,关闭时机推迟到 navigateTo 完成后
    - **方案 C**:拆解按钮为"提交 + 立即跳转"二态 — 先关 dialog + 跳转,后台执行 fetch(失去立即反馈但无延迟感知)
  - 推荐 A:改动小(2-3 行),保留错误反馈路径;无须后端或 e2e 协议层改动
  - 验收要点:点击"开始扫描"后 dialog 立即关闭(< 100ms 视觉反馈);失败时 dialog 重新打开 + 显示 `batchError`;成功 toast 仍存在 3s;`/batch-runs` 跳转时机同当前
  - 关联:C47(全站 Dialog 规范统一体验)+ e2e `batch.e2e.test.ts:60-65` 需补 dialog 立即关闭的断言(目前只断 URL 跳转,未断 dialog 早于跳转关闭)
  - 复杂度:🟢 小(单文件 2-3 行 + 1 个 e2e 断言)
  - 来源:2026-08-20 用户实测反馈 + 截图

- **C57 扫描历史 Dialog 缺面包屑/返回(单 Dialog 双 view 缺少导航)**（M6 平台可选项 / 2026-08-20 用户实测反馈）
  - 状态:🔶 待评估
  - 位置:`apps/platform/app/components/RepoHistoryDialog.vue`(243 行,全文件)
  - 现象:用户点击行级 `pi-history` → URL 变为 `/repos?history={id}` → Dialog 打开显示 run 列表 → 点击某行 `pi-eye` → Dialog 内部切换为 detail view(同一个 Dialog) → 关闭 Dialog → 用户回到 /repos 页面,无任何提示;再次想看 list 需重新点击 `pi-history`
  - 现状(C51 应用层修复产物):
    - `apps/platform/app/pages/repos/[id]/runs.vue` 子路由已弃用,删除迁移到 Dialog(单组件内 list ↔ detail 内部状态切换)
    - 当前 `detail.value` 状态决定显示 list 还是 detail(无 breadcrumb / 无"返回列表"按钮)
    - 关闭时 `closeDialog` 同时清空 `repoId.value` + `runs.value` + `resetDetail()` + `route.query.history` → 完全态清理
  - 用户体验问题:detail view 是"末端"无回溯;用户想"回到 list 看其他 run" 只能:
    1. 点 X 关闭 → 重新点 pi-history → fetch 重新跑(浪费 HTTP)
    2. 或浏览器后退 → 当前实现 `route.query.history` 监听会触发 fresh fetch
  - 修复方向（候选）:
    - **方案 A(推荐)**:detail view 加"返回列表"按钮 (icon: `pi pi-arrow-left` + i18n `runs.backToList`),置于 Dialog header 旁;点击 `resetDetail()` 即可,无须重 fetch
    - **方案 B**:改为路由化 — `/repos?history={id}&run={rid}` 双 query,支持浏览器后退,与 list/detail 深度链接
    - **方案 C**:detail view 内嵌 inline list(左侧 list 右侧 detail)— 改造面大,576×720 Dialog 容纳难度高
  - 推荐 A:改动小(1 个 button + 1 个 handler),保留当前 C51 的应用层修复成果
  - 验收要点:detail view 左上角"返回列表"按钮可见;点击后回到 list view 不重 fetch(`runs.value` 保留);长路径深度链接 `/repos?history={id}` 仍可独立打开 list
  - 关联:C51(应用层 runs.vue 替代方案,本条目是该方案的 UX 补救)
  - 复杂度:🟢 小(单文件 1 handler + 1 button + i18n 1 键)
  - 来源:2026-08-20 用户实测反馈

- **C58 告警视图按包聚合 + 数据可视化图表**（M6 平台 增强 / 2026-08-20 用户反馈）
  - 状态:🔶 待评估
  - 位置:`apps/platform/app/pages/alerts.vue`(279 行) + `apps/platform/server/api/alerts.get.ts` 数据源
  - 现象:当前 alerts 视图是 alert 维度扁平 DataTable(`<DataTable :value="alerts">` 单行一告警),一行包一行散落;用户要看"这个包都有哪些告警" 需手动按列排序再肉眼分组;无图表,无法直观看出"严重级别分布 / 包告警数排名 / 修复成功率"
  - 现状:
    - 9 列扁平(仓库/严重级别/包名/来源/可修复/推荐版本/状态/链接),适合"看单条告警 + 跳 GitHub"
    - 缺聚合口径:`countByPackage / countBySeverity / countBySource / fixRate` 均未暴露
    - 后端已有 `/api/alerts` 端点聚合查询,加 1 个 `?groupBy=package|severity|source` 参数即可
    - 前端缺图表组件:PrimeVue 4 内置 `<Chart>` 包装 Chart.js,但需引入 `chart.js` 依赖
  - 修复方向（候选）:
    - **方案 A(端到端小改)**:告警表加 group row(`rowGroup` 模式 by `packageName`),同一包多条告警物理聚合;后端查询加 `groupBy` 参数;前端依赖 PrimeVue `<DataTable rowGroupMode="subheader">` 实现
    - **方案 B(可视化补强)**:增加统计卡片区(severity 饼图 + Top-10 alert package 柱状图 + fixRate 环形进度);PrimeVue `<Chart>` + Chart.js 引入(约 +5-10 行 + 1 依赖)
    - **方案 C(A+B 组合,推荐)**:A 解决"按包聚合" + B 解决"图表";工期估算 +160-220 行 + 1 依赖 + 5-7 个新 i18n 键 + 1 个 e2e 聚合筛选
  - 推荐 C:复合需求,拆 2 个子任务 C58-1(rowGroup) + C58-2(Chart 卡片),各自独立评审
  - 验收要点:
    - C58-1:DataTable `rowGroupMode="subheader"` by `packageName` 渲染,包名折叠后显示 N 个告警;group 计数显示在 subheader
    - C58-2:统计卡片 3 块(severity 饼图 / Top-10 包 / fixRate);依赖 i18n 完整;Chart.js tree-shakable 引入(避免 +200KB)
  - 关联:无直接前置;M11 阶段候选(依赖业务认可"告警是核心入口");若有 M11 排期再处理
  - 复杂度:🟡 中(2 sub-task,后端 + 前端 + i18n + e2e)
  - 来源:2026-08-20 用户反馈


- **C30 Publish Docker build job 被取消/失败排查**（M6 归档 CI 端到端裁决登记）
  - 状态：⏸️ **已暂缓（2026-08-18 用户决策）**——原 🔶 待评估
  - 内容：Publish Docker 工作流 build job（run 31260609196，e16aeda4 触发）在 QEMU 双平台（linux/amd64,linux/arm64）构建中运行 1h19m 后被取消（`##[error]The operation was canceled.`）。**根因已定位**：同 workflow 同 ref（master）的新 push（7cb1ad22d，15:13:11）触发 concurrency `cancel-in-progress: true` 取消旧 run；叠加 QEMU arm64 模拟构建过慢（1h+ 未完成）。缓解方向：docker.yml 拆分平台构建或减少平台、优先 amd64、验证 gha cache 命中；若采用频繁 push + 双平台模式，需评估取消旧 run 对镜像发布的影响
  - 补充（2026-08-09，run 31305727667）：同一 build job 出现第二种失败模式——arm64 builder 阶段 `pnpm --filter @dependfix/core build` 前，pnpm 11 默认 `verifyDepsBeforeRun=install` 检测到 workspace 依赖不完整（builder 阶段仅复制根 node_modules，各项目内依赖链接缺失）自动执行 `pnpm install`，该子进程在 QEMU 模拟 arm64 下被 SIGILL 杀死。**已修复**：builder 阶段改为 `COPY --from=deps /app .` 复制完整依赖布局 + `pnpm config set verify-deps-before-run=false` 禁用自动安装（仅 Docker 构建环境生效）
  - 来源：M6 归档 CI 裁决（2026-08-08，run 31260609196 被 run 31263908976 取消）+ 2026-08-09 run 31305727667 SIGILL 失败
  - **暂缓决策（2026-08-18）**：
    - **现状**：run 31862632207（a61becc 触发，2026-08-15）双平台构建实际耗时 **23m 2s**（QA 1m 44s + build **21m 9s**）成功完成，证明在 push 频率不高时 docker.yml 当前配置可稳定工作
    - **评估依据**：① 双平台 QEMU 模拟在 GHA cache 命中后已能在合理时间内完成；② `cancel-in-progress: true` 仅在同 ref 频繁 push 时才构成问题（实测单次 push 间隔足够长时不触发）；③ arm64 SIGILL 失败模式已通过 Dockerfile 改造根治（`COPY --from=deps /app .` + `verifyDepsBefore-run=false`）
    - **结论**：暂不实施 docker.yml 拆分平台 / 移除 arm64 / 调整 concurrency 等改造；保留当前配置观察
    - **恢复条件**（任一触发时重新评估）：① master 分支 push 频率显著提升（如周均 ≥ 5 次）；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复（review C30 时）
    - **追踪**：todo.md §待评估候选 C30 行同步降级（🔴 P1 → ⚪ P3）

### MCP 能力补充（2026-08-09 评估登记）

> 来源：2026-08-09 mcp 复用率与能力差距评估（core/cli/mcp 复用分析 + 与 CLI 能力面对比）。设计详见 [mcp-server.md §8 能力差距与演进路线](../design/governance/mcp-server.md#8-能力差距与演进路线)。
> **约束**：MCP tool schema 变更对客户端是 breaking，P1 项一次性批量升级；AI apiKey 只走 env（`DEPENDFIX_AI_API_KEY`），禁止进 tool 参数；新能力优先复用 cli/core 已导出 API，缺导出先补 1 行导出而非在 mcp 层重写。
> **已闭环清理（2026-08-11）**：C31（P1 能力补充，627f3b0d 后批次交付）、C32（P2 能力补充，62a655e3 后批次交付）均已交付，代码实施在 T706 发布 npm 前完成（前置已满足）；完整能力登记与演进路线见 [mcp-server.md §8 能力差距与演进路线](../design/governance/mcp-server.md#8-能力差距与演进路线)。

- **C33 MCP 能力补充 P3**（远期目标，不实施）
  - 状态：🔶 远期登记
  - 内容：pnpm-audit 本地扫描 tool（需 workDir 语义，等本地场景真实需求）；统一错误包装 helper（token 检查 + try/catch → ok:false 模板代码收口）；返回结构对齐完整 `RunResult`（当前 run_scan 只映射 8 字段，完整契约会扩大 MCP 响应体积，保持简化 + 文档声明）
  - 来源：2026-08-09 评估

---

## M7: 企业级平台增强

目标：补齐多租户、高可用与跨平台能力。

> **M7 规划定稿（2026-08-09）**：按需求澄清（Q1/Q2/Q3 用户确认）拆分两个子阶段：
> - **M7.1 认证与用户体系**：T701（RBAC + 用户管理 + 个人界面）、T707（认证扩展：OIDC SSO / GitHub·Google OAuth / 邮箱域名黑白名单）
> - **M7.2 平台能力深化**：T702 BullMQ、T704 定时批量、T708 i18n、T705 生产部署、T703 跨平台 Git、T706 MCP 发布
>
> 新增需求背景（2026-08-09 用户提出）：平台缺少用户管理、个人界面等基础功能；第三方登录需支持企业 SSO 与公开平台 OAuth 双场景；国际化列入规划。

### 规划决策（2026-08-09 用户确认）

- **D1 部署形态（Q1=A0）**：部署模式**互斥二选一**，两种场景不兼容、不可混合，由部署配置 `AUTH_MODE` 决定：
  - `enterprise`（企业内部使用）：OIDC SSO 登录 + 邮箱域名**白名单**注册准入
  - `public`（公开平台使用）：GitHub / Google OAuth 登录 + 邮箱域名**黑名单**注册准入
- **D2 SSO 协议（Q2=OIDC）**：企业 SSO 采用 **OIDC**（better-auth `genericOAuth` 插件原生支持，覆盖 Azure AD / Okta / Keycloak / Google Workspace 等标准 IdP）；**SAML 2.0 不实现**（better-auth 无原生支持，成本高），登记 backlog
- **D3 执行顺序（Q3=按序）**：M7.1（认证与用户体系）先行 → M7.2（平台能力深化）按 T702 → T704 → T708 → T705 → T703 → T706 顺序执行；T706 代码前置（C31/C32）已完成，仅剩发布与文档收口

### M7.1 认证与用户体系

> **已归档（2026-08-10）**：T701 / T707 完整记录见 [todo-archive.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)；剩余 3 项真实凭据人工验收见 [todo.md 待人工验收](todo.md)。

### M7.2 平台能力深化

> **M7.2 已归档（2026-08-12）**：T702（任务队列）/ T704（定时批量）/ T708（i18n）完整记录见 [todo-archive.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)。
> **T705 / T703 已延期（2026-08-12 用户指示）**、**T706 已完成（2026-08-12，`@dependfix/mcp@0.1.2` 发布）**——见下方各任务条目。

以下为未排期任务（T705 / T703 / T706，按 D3 执行顺序位于 T708 之后）：

#### T705 生产级部署（⏸ 已延期 2026-08-12，用户指示暂缓排期）

- 优先级：`P2`
- 依赖：T702, T703
- 交付物：生产环境部署方案。
- 任务内容：
  - [ ] PostgreSQL 数据库迁移与适配。
  - [ ] Kubernetes + Helm Chart 部署方案。
  - [ ] 监控与告警集成（Sentry）。
- 完成定义：
  - [ ] 可通过 Helm Chart 部署到 Kubernetes 集群。
- **延期登记（2026-08-12 用户指示）**：T711 覆盖率冲刺优先，T705 移至 backlog 待评估；恢复排期时注意 PostgreSQL 迁移对 T702 独立 worker 形态的解锁价值。

#### T703 跨平台 Git 支持（⏸ 已延期 2026-08-12，用户指示暂缓排期）

- 优先级：`P2`
- 依赖：M6
- 交付物：支持 GitLab / Bitbucket 仓库连接。
- 任务内容：
  - [ ] GitLab PAT 认证与 API 集成。
  - [ ] Bitbucket PAT 认证与 API 集成。
  - [ ] 仓库级别配置（包管理器、忽略列表、自定义命令）。
  - [ ] 仓库连接状态监控。
- 完成定义：
  - [ ] 能通过 Web UI 添加 GitLab / Bitbucket 仓库。
- **延期登记（2026-08-12 用户指示）**：同 T705，移至 backlog 待评估。

#### T706 MCP Skill 集成与发布（✅ 已完成 2026-08-12）

- 状态：✅ **已完成（2026-08-12）** — `@dependfix/mcp@0.1.2` 已发布 npm（registry 实证）。详见 [todo-archive.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)
- 收口说明：npm 发布闭环；剩余 skill 双后端验证与 MCP 接入文档为轻量收尾，挂 [T904 文档同步](#t904-文档同步) 跟进（不阻塞）

### M7 已确认 backlog 登记（2026-08-09，设计决策 D1/D2/D3 用户确认）

> M7.1 设计文档（[platform-auth-users.md](../design/governance/platform-auth-users.md) §11）决策点 1/2/3 确认后登记的候选项，均为 M7.1 非目标。

- **D1-repo_admin 角色 + RepositoryAccess**：仓库级管理角色（管理特定仓库修复策略）需 `RepositoryAccess` 关联表；M7.1 单组织下与 org_admin 权限面重复，未实现。触发条件：多租户/多组织需求出现，或单实例出现"仓库级管理员"真实诉求。
- **D2-username 用户名字段**：better-auth `username` 插件（user.username 字段 + 用户名设置 API）；M7.1 用户管理按 email/name 展示足够。触发条件：用户明确需要用户名体系（公开平台展示名等）。
- **D3-多租户组织体系**：better-auth `organization` 插件（Organization/Member/Invitation/Team + 成员角色 API），替代 M7.1 的自建单组织模型。触发条件：多组织/多租户部署成为真实需求（当前 AUTH_MODE 企业/公开均为单实例单组织场景）。
- **D8-remove-user 关联资源检查**（2026-08-09 T701-2 审计登记）：设计决策点 8"用户名下存在仓库/凭据关联时拒绝删除（409）"未实施——当前 Repository/Credential 不直接引用 User（仅 organization_id/credential_id，均 SET NULL），"名下资源"无数据模型载体，删除用户不产生业务数据悬空。触发条件：引入 user→resource 关联（如创建者 created_by 或 D1 的 RepositoryAccess）时随模型落地。
- **T701 管理端点集成测试补强**（2026-08-09 T701-2 审计登记，2026-08-09 实施后修订）：设计 §9 矩阵的"list-users 分页/搜索、set-role 非 admin 403、ban/unban 会话失效、remove-user 级联、个人界面 changePassword/changeEmail 闭环"未落地（当前 guard 层 11 例覆盖函数语义；用户管理/个人界面已改为 better-auth 原生端点链路，authClient 直连 `/api/auth/*`）。触发条件：引入 @nuxt/test-utils 或 e2e 基建时统一落地（T701 验收/浏览器验证阶段评估）。
- **邮件发送器统一实现**（2026-08-09 T701-3 审计登记，2026-08-18 实施完成，2026-08-20 T912 主体归档）：sendVerificationEmail / sendResetPassword / sendChangeEmailConfirmation 三处回调均为空实现（SMTP 未配置降级为 console.warn）；SMTP_HOST 配置后注册验证/密码重置/邮箱变更确认邮件均不实际发送（M6 既有模式）。**主体已闭环**：[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t912-3-待排)（commit `edc9c94` mailer service 模块 + `6f00937` 三回调接线 + `6e28207` coverage 回归修复），用户 2026-08-18 明确指示「引入 nodemailer 实现」。**剩余项 T912-3**：安全与文档（security.md §邮件发送安全 章节）已合并入 **C28 security.md 补凭据加密存储章节**（见上）。
- **SAML 2.0 SSO**：企业 SSO 仅 OIDC（better-auth `genericOAuth` 原生支持，覆盖 Azure AD / Okta / Keycloak / Google Workspace）；SAML 需额外集成层（better-auth 无原生支持，成本高），登记 backlog。触发条件：企业 IdP 仅提供 SAML（如部分传统 IdP）时评估。

### M7.2 i18n 非目标登记（2026-08-11，T708 规划定稿）

> T708 国际化 i18n 已完成并归档（见 [todo-archive.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)）。以下为本期明确不做、随需求登记后续的项。

- **C36 服务端 API 错误消息 i18n**（T708 非目标）
  - 状态：🔶 待评估
  - 内容：服务端 API `createError` / `statusMessage` 共 55 处中文错误消息未纳入 i18n（前端页面文案先行）；接入方式候选：错误码化（客户端按 code 查语言包）或服务端按 Accept-Language 返回本地化消息。触发条件：英文用户实际使用平台并反馈错误提示语言混杂
  - 来源：2026-08-11 T708 规划（apps/platform/server/api 统计 55 处）
- **C37 语言偏好多设备同步**（T708 非目标）
  - 状态：🔶 待评估
  - 内容：T708 D3 决策语言偏好存 Cookie（登录/未登录一致、简单可靠）；登录用户语言偏好持久化到服务端（better-auth user 字段或独立偏好表，多设备同步）未实现。触发条件：多设备使用成为常态或用户反馈语言偏好不同步
  - 来源：2026-08-11 T708 规划（D3 决策登记）

### 沙箱与恶意依赖防护治理登记（2026-08-14 安全专项评估）

> 来源：2026-08-14 安全专项评估（"dependfix 不能成为漏洞扩散工具"评估，结论与威胁链详见 [sandbox-security-governance.md](../design/governance/sandbox-security-governance.md)）。以下为评估登记的治理缺口，按 P0 → P2 排序；修复验收对照治理文档 §7。
>
> **治理完成情况（2026-08-20 盘点）**：本节 8 项治理缺口（C38-C45 + G1-G7）截至 2026-08-14 全部已修复（M8 T801-T806 落地）——详见 [todo-archive.md §M8](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)。下表保留治理登记与精简修复记录，详细实现指向 todo-archive §M8。**G5 治理项已闭环（2026-08-20 M10 收口）**：见 **C26 独立沙箱容器执行实现**（同上，实施规划落地，T1005 路由接线移交 backlog）。

- **C38 平台 Dockerfile 补 `USER` 降权**（P0，设计-实现偏差）
  - 状态：✅ **已修复（2026-08-14）** — entrypoint 降权方案（dependfix 用户 uid 100 + chown 数据卷 + su-exec）实证通过。详见 [todo-archive §M8 / T-C38](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)（原实现细节已迁移）
  - 内容：`executor-sandbox.md §2.2` 明确 M6 必做"非 root 用户运行（镜像 `USER` 降权）"，但 `apps/platform/Dockerfile` 无 `USER` 指令，容器以 root 运行——恶意依赖脚本以 root 执行削弱凭据最小化收敛效果
  - 来源：2026-08-14 安全专项评估（G1）
- **C39 CLI 本地模式安全防线**（P0，威胁模型与产品形态偏差）
  - 状态：✅ **已修复（2026-08-14，T803）** — fix/fix-and-pr 启动输出本地执行风险警告（可 `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制）；`executionEnvironment: 'container'` 区分不误报。详见 [todo-archive §M8 / T-C42](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)（原 C39 + C42 合并修复于 T803）
  - 内容：威胁模型将本地执行定位"仅开发调试"，但 CLI 是产品发布形态之一——本地模式零隔离，恶意依赖脚本直接在用户机器执行、可读用户 shell 全部环境
  - 来源：2026-08-14 安全专项评估（G2）
- **C40 执行期网络外联日志与限制**（P1）
  - 状态：✅ **M10 T1002 已闭环（2026-08-20）**：M8 T805 外联审计 + M10 T1002 出站白名单 deny-by-default 拦截（[todo-archive.md §M10 T1002](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)）
  - 内容：M8 阶段先实现外联审计日志供事故溯源；M10 阶段升级为应用层白名单拦截代理实现网络隔离
  - 来源：2026-08-14 安全专项评估（G3）
- **C41 验证命令单命令超时与资源上限**（P1）
  - 状态：✅ **M10 T1003 已闭环（2026-08-20）**：M8 T802 单命令超时 + M10 T1003 cgroup v2 资源限制（[todo-archive.md §M10 T1003](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)）
  - 内容：M8 阶段先实现单命令超时（默认 10 分钟可配 + 进程树终止）；M10 阶段实现 cgroup v2 写 memory.max + cpu.max 双层
  - 来源：2026-08-14 安全专项评估（G4）
- **C42 Action/CLI 凭据权限面启动检查**（P1）
  - 状态：✅ **已修复（2026-08-14，T803）** — `token-scope.ts` 启动 `GET /user` 探测权限面，classic `repo` scope 超权限警告（不强制阻断，兼容存量用法）
  - 内容：action.yml `github-token`（用户 PAT）与 `ai-api-key` 进环境变量，恶意 install 脚本可直接读取；B 路径的最终防线是凭据权限面
  - 来源：2026-08-14 安全专项评估（G6）
- **C43 升级研判供应链信号披露**（P2）
  - 状态：✅ **已修复（M8 T804，2026-08-14）** — supply-chain 模块 + 报告 ⚠️ Supply Chain Warnings 节 + PR body 警示区（17 单测 + 2 集成测试）
  - 内容：报告/PR 警示区补充"本次新增/升级的包是否带 lifecycle scripts 且已被目标仓库 `allowBuilds`/`onlyBuiltDependencies` 批准"信号
  - 来源：2026-08-14 安全专项评估（G7）
- **C44 安全规范 §5.3 挂接 review 检查点**（2026-08-14 审计登记）
  - 状态：✅ **已修复（M8 T806，2026-08-14）** — `code-quality-checklist.md` §5.3 必须级条款逐项核验动作 + Code Auditor 必查项同步。详见 [todo-archive §M8 / T-C44](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)
  - 内容：`standards/security.md` §5.3 必须级条款挂接 `code-reviewer` 检查点
  - 来源：2026-08-14 沙箱安全治理 Review Gate（RG-W2）
- **C45 平台容器工具链缺失（git/pnpm 未安装）**（2026-08-14 C38 修复实证发现）
  - 状态：✅ **已修复（M8 T801，2026-08-14）** — git + pnpm 11.18.0 + workspace node_modules 补齐 + pnpm-audit legacy range 前缀假跳过 bug 修复。详见 [todo-archive §M8 / T-C45](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)
  - 内容：runtime 阶段镜像（`caomeiyouren/alpine-nodejs-minimize`）从未安装 git/pnpm——已发布镜像实证 `git/pnpm/corepack` 全部 MISSING（仅 node 存在）；executor-sandbox.md 声明与实际不符（M6 遗留）
  - 来源：2026-08-14 C38 修复本地构建实证

---

## M2 增强候选（未排期）

> 2026-08-02 T208-T211 设计评审中确定的"未来评估项"，当前不做。

### B1 PR 关闭评论与 label 标记

- 状态：🔶 待评估
- 内容：关闭旧 PR 时发 comment 说明取代关系；创建 PR 时加 label `dependfix`（两者均需 `issues: write` 权限，比当前 `pull-requests: write` 权限面宽）
- 触发条件：PR 数量增长影响 `pulls.list` 查重性能，或用户需要 PR 列表可过滤/可检索时评估
- 来源：T210 设计评审（2026-08-02），用户确认"未来可以考虑增强，目前不做"

### B2 固定分支单线设计

- 状态：🔶 待评估（M6 平台部署时）
- 内容：独立平台部署后修复频率上升，需要一个固定修复分支（如 `dependfix/auto-fix`）避免频繁向 master 提交 PR；届时需与 T210 指纹方案整合（分支复用/重建策略、force push 语义）
- 来源：T210 设计评审（2026-08-02），用户明确"有这个需求但不是现在"

### B3 Dependabot 式分支命名（包名入分支名）

- 状态：✅ 已评估，暂不采用
- 结论：Dependabot 为单包单 PR（`dependfix/npm_and_yarn/<pkg>-<from>-<to>`），包名可作分支名；dependfix 为聚合 PR（一次修多个依赖），包名列表入分支名会超长（GitHub 分支名限 256 字符）且内容一变名就换，可读性收益有限。包名与版本已在 PR 标题（升级数）与 body（完整表格）中完整呈现，符合用户直觉
- 触发条件：未来出现"单包单 PR"模式需求时重新评估
- 来源：T210 设计评审（2026-08-02）

---

## 横切任务（后续阶段）

### 并行开发工作流：git worktree 预案（2026-08-07 评估落盘）

> **背景**：本轮尝试并行开发，同目录/同分支下多任务改动存在冲突风险；考虑引入 git worktree。momei 项目曾尝试 worktree 但效果一般（多目录互相同步成本、未提交的本地 env 在另一分支缺失导致启动失败）。
>
> **调研结论**（2026-08-07，pnpm 官方 worktree 文档 / trigger.dev 弃用复盘 / termdock 6 种故障模式）：
> - **CLI 阶段 worktree 可行但收益有限**：无端口/数据库/服务冲突，pnpm 全局 store 已启用（store 目录为自定义位置，如 `<drive>:\.pnpm-store\v11`），加 `enableGlobalVirtualStore: true` 后新 worktree 的 `pnpm install` 近瞬时、磁盘近零增量（npm 场景 2 worktree 烧 9.82GB 的反例在 pnpm 模式下不成立）
> - **M6 平台阶段将撞上"基础设施税"**（trigger.dev 弃用根因）：数据库/Redis/端口每 worktree 复制是噩梦；正确做法是单共享 DB + 每 worktree 独立 database + 独立端口（env 模板 `DB_NAME=<branch-slug>`、`PORT=<base+index>`）
> - **worktree 隔离文件系统层而非语义层**：热点文件冲突依然存在，且冲突发生在"没写过的代码"上；T505 解耦（app/pipeline.ts 独立文件）天然降低冲突面
> - **本项目特有坑**：`.agents/skills` / `.claude/skills` / `.claude/agents` / `.opencode/agents` 是绝对路径 symlink（指向 `.github/skills` / `.github/agents`，被 .gitignore 忽略）——worktree 新目录下链接缺失，agent 工具加载不到 skill / agent 定义。解法照搬 pnpm 官方：worktree 创建脚本从 common dir 重建 symlink
> - **故障模式映射**（termdock 6 类 → 本项目）：lockfile 分歧（高风险，约定依赖变更单侧发生）、index.lock（低）、branch 已 checkout（低）、merge 冲突（中，热点文件 `config/index.ts` / `app/index.ts` / `cli/index.ts`）、过期 worktree（低，禁止 rm -rf）、build cache 污染（低，tsdown dist 天然隔离）
>
> **方案矩阵**：
> | 选项 | 适用 | 成本 |
> |:--|:--|:--|
> | A. 维持现状（单目录顺序执行） | 当前单人单 agent 为主 | 零 |
> | B. pnpm 官方 worktree 模式（裸仓库 + enableGlobalVirtualStore + 初始化脚本） | 多 agent 并行成为常态 | 低，纯脚本无新依赖 |
> | C. GitButler 虚拟分支 | 多分支但少同文件冲突 | 中，新工具 + skill 改造，同文件冲突更危险 |
> | D. 每任务克隆 + 容器化 | 最大隔离 | 高 |
>
> **决策**：现阶段不引入（保持 A）；B 预案化——并行需求成为常态时按脚本启用，不临时踩坑。M6 的 env 隔离设计约束（独立 database/端口）在 T601/T602 设计时生效。

### T904 文档同步

- 优先级：`P0`
- 依赖：随功能推进持续进行
- 交付物：README、方案文档、使用说明同步更新。
- 任务内容：
  - [ ] 当 CLI 参数稳定后补使用文档。
  - [ ] 当 GitHub Action 落地后补 workflow 使用说明。
  - [ ] 当平台功能交付后补平台部署与使用文档。
- 完成定义：
  - [ ] 文档与实现保持同步，没有明显失真。

### T905 git worktree 并行开发预案（条件启用）

- 优先级：`P3`（触发条件：多 agent 并行开发成为常态，当前不执行）
- 依赖：T505（解耦降低冲突面）、M6 T601/T602（env 隔离约束）
- 交付物：worktree 初始化脚本 + 使用文档。
- 任务内容：
  - [ ] `pnpm-workspace.yaml` 启用 `enableGlobalVirtualStore: true`，验证新 worktree 安装近瞬时
  - [ ] `worktree:new` 脚本：`git worktree add` + env 模板复制（`.env.example` 提交 git，真实 env 不入库）+ skills/agents symlink 重建（`.agents/skills` / `.claude/skills` / `.claude/agents` / `.opencode/agents` → `.github/` 对应目录）+ `pnpm install`
  - [ ] M6 平台 env 隔离设计约束：单共享 DB 实例 + 每 worktree 独立 database + 端口基址偏移（`PORT=<base+index>`），随 T601/T602 落地；口径映射——T601 当前为 SQLite（单文件库）时即每 worktree 独立 db 文件，独立 database 约束随 T705 PostgreSQL 迁移生效
  - [ ] 冲突预防规范：lockfile 依赖变更单侧发生（merge 后 `pnpm install` 重生成）；热点文件单写者规则；新代码优先走新文件（配合 T505）；一律 `git worktree remove` 清理（禁 `rm -rf`）
- 完成定义：
  - [ ] 一条命令创建可用的 worktree（env + symlink + node_modules 就绪），agent 工具在新目录行为与主目录一致
  - [ ] 多 worktree 并行运行互不干扰（端口/DB/构建产物隔离）

### C34 存量规范严格约束挂接盘点（审查治理候选）

- 状态：🔶 待评估（2026-08-09 用户确认不着急处理存量，排期即可）
- 内容：对 `docs/standards/*.md` 存量规范做"严格约束（必须 / 禁止 / 不得 / 阈值）→ review 检查点"全量映射盘点——grep 提取各规范严格条款，逐一核对是否已实际挂接（code-reviewer SKILL.md / code-quality-checklist.md / Code Auditor 必查项），未挂接的登记补挂或标记为待评估
- 背景：2026-08-09 审查体系补强（bc7eac10）新增"规范执行分层"检查项，仅约束**新增**条款；存量条款挂接状态未盘点，盘点补齐后该机制完全闭环
- 来源：2026-08-09 审查机制评估（宽松指引 / 严格约束区分校验能力评估结论，见 [documentation.md §4 规范单点声明原则](../standards/documentation.md)）

### T906 todo-archive 分片迁移 ✅（已闭环 2026-08-14）

- 状态：✅ **已完成（2026-08-14）** — 任务已闭环，元任务融入相邻 M9 commit（无独立提交）
- 执行记录：新建 `archive/todo-archive-phases-m2-m55.md`（393 行）；主文档 575 → 185 行；archive/index.md 分片记录更新
- 后续归档：M8（本次 2026-08-19 归档）、未来归档批次按 500 行阈值触发分片迁移





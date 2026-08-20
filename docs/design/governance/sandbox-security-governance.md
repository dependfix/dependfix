# 沙箱与恶意依赖防护治理

> 状态：✅ 已落盘（2026-08-14，安全专项评估）
> 触发背景：dependfix 自身是"更新依赖包"的工具——执行不可信代码是其核心动作。安全是本项目的核心目标：更新依赖是为了修复漏洞，但修复过程中**绝不能引入新的漏洞**，dependfix 不能成为恶意依赖扩散的工具。
> 相关文档：[执行器设计与沙箱评估](./executor-sandbox.md)（执行器契约与威胁建模）、[安全设计](./security.md)（总体安全设计）、[安全规范](../../standards/security.md)（权威安全基线，本文档第 4 节为其执行隔离专项解读）。

---

## 1. 定位与范围

- 本文档沉淀 2026-08-14 沙箱与恶意脚本防护专项评估的**结论、威胁链、安全基线与治理决议**，作为后续开发（尤其执行器、验证链路、供应链研判相关改动）的安全指导。
- **与 executor-sandbox.md 的分工**：executor-sandbox.md 定义执行器接口契约与 M6/M7 方案；本文档定义"评估结论 + 治理决议 + 不可简化的安全基线"，并登记缺口处置。
- **与 standards/security.md 的分工**：安全基线条款按"规范单点声明原则"（[文档规范 §4](../../standards/documentation.md)）完整声明于 [安全规范 §5.3](../../standards/security.md)，本文档仅引用并保留工程化增量（治理编号、时间线、验收方式，见第 4 节）。

## 2. 评估结论摘要（2026-08-14）

### 2.1 已落地的防线（保持，不得回退）

| # | 防线 | 实现位置 |
|:--|:--|:--|
| 1 | **pnpm 10+/11 默认忽略依赖 lifecycle scripts**（仅 `allowBuilds`/`onlyBuiltDependencies` 显式批准的包才执行 install 脚本）——最大天然防线，任何执行路径不得关闭该语义 | 全部 `pnpm install` 调用（`execPnpmInstall`、验证 runner），未传 `--ignore-scripts` 之外的破坏性开关 |
| 2 | **凭据最小化**：平台密钥（`ENCRYPTION_KEY`/`AUTH_SECRET`）永不传入执行子进程；凭据解密后仅注入本次执行、用完即弃；clone 凭据走 `http.extraheader` 不进 argv；错误消息与命令输出脱敏 | `ContainerExecutor`、`verification-runner` |
| 3 | **执行边界**：工作目录限定 `runs/{runId}/` 临时目录且执行后清理；总超时 30 分钟；结构化结果白名单回传 | `ContainerExecutor` |
| 4 | **Action 注入防护**：input 先赋变量 + bash 数组展开，token/AI key 经环境变量传递 | `action.yml` |
| 5 | **AI 输入沙箱化**：changelog 结构化校验、输出 schema 约束（防 Prompt 注入） | engine ai 链路 |

### 2.2 缺口分级（治理决议见第 5 节）

| 级别 | 缺口 | 说明 |
|:--|:--|:--|
| **P0** | Dockerfile 无 `USER` 降权 | 设计文档承诺的"非 root 运行"未落地，恶意脚本以 root 在容器内执行（可读 `/proc` 其他进程环境、写容器文件系统） |
| **P0** | CLI 本地模式零防护 | 威胁模型将本地执行定位为"仅开发调试"，但 CLI 是产品发布形态之一；本地模式下恶意脚本直接在用户机器执行，可读用户 shell 全部环境 | **已修复（T803，2026-08-14）**：fix/fix-and-pr 启动输出本地执行风险警告（可 `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制）；容器执行环境不误报 |
| **P1** | 网络出站无限制、无外联日志 | M6 容器默认放行（registry 需要），设计承诺的"执行期外联日志（备查）"未实现；出站白名单是 M7 项 |
| **P1** | 验证命令无单命令超时/资源上限 | `execCommand` 无 timeout（仅外层总超时兜底）、无内存/CPU/磁盘配额 |
| **P1** | M7 队列并发共享同一容器 | BullMQ 并发后，恶意仓库 A 的脚本可读仓库 B 的工作目录与环境（交叉污染） |
| **P1** | Action 模式凭据暴露面 | 用户 PAT（可能跨仓库大权限）与 AI key 进环境变量，恶意 install 脚本可直接读取；仅靠文档建议约束 | **已修复（T803，2026-08-14）**：启动时 `GET /user` 探测 token 权限面（`x-oauth-scopes` / `x-accepted-github-permissions`），classic `repo` scope 超权限启动即警告 |
| **P2** | 升级研判缺供应链信号 | 报告未披露"本次新增/升级的包是否带 lifecycle scripts 且已被批准" |

## 3. 威胁链模型：dependfix 作为扩散放大器的 4 条路径

dependfix 批量处理仓库与依赖，若防护不足会成为恶意依赖的"加速扩散器"。已识别的四条路径：

| 路径 | 扩散链 | 当前防线 | 残余风险 | 处置 |
|:--|:--|:--|:--|:--|
| **A. 合法包被投毒**（event-stream 模式：维护者被钓鱼后发布恶意版本） | dependfix 自动升级到"修复版本" → 目标仓库 `allowBuilds` 已批准该包 → 脚本在容器/runner/本地执行 | pnpm 默认 ignore + 批准列表白名单；升级前 AI 研判；凭据最小化 | **受控**；USER 降权已修复（C38，2026-08-14）后后果进一步收敛 | 保持研判不可省略 |
| **B. 恶意仓库经 owner 模式被扫描** | 受害者用高权限 PAT 扫描不可信仓库 → 恶意仓库的 install/lint 脚本窃取 PAT → 攻击者用 PAT 接管受害者其他仓库 | 仅凭据最小化 + 名单策略（文档建议） | **真实扩散点**，当前靠用户自觉 | Token 最小权限强制提示（C42）；使用指南警示（本文档第 6 节） |
| **C. 修复 PR 合入后投毒依赖流向下游** | PR 合入 → 下游 `pnpm install` 执行脚本 | 升级前 AI 研判（changelog/diff） | 供应链常态，无法完全阻断 | 报告披露供应链信号（C43），保留人工确认 |
| **D. M7 并发共享容器** | 仓库 A 恶意脚本读仓库 B 工作目录/凭据 → 交叉污染 | 无（C26 原为 backlog） | 随 T702 并发落地变为现实 | C26 提级 M7 前置 |

> **核心结论**：dependfix 成为扩散放大器的最短路径是 **B**——低防护姿态（网络放行 + 高权限 PAT + 本地模式）下，恶意脚本窃取凭据后横向扩散。当前架构通过"凭据最小化 + 平台密钥不传执行进程 + USER 降权（C38 已修复）"显著收敛了扩散半径；B 路径的最终防线是**凭据权限面**与**扫描信任边界**，两者缺一不可。

## 4. 安全基线（不可简化，作为后续开发安全指导）

> **权威条款（必须级）完整声明于 [安全规范 §5.3 修复执行安全](../../standards/security.md)，修改基线只改 §5.3**（规范单点声明原则，见 [文档规范 §4](../../standards/documentation.md)）。本节仅为执行隔离专项的评审对照，只保留工程化增量（治理编号、时间线、验收方式），不重复条款文本。

### 4.1 执行环境基线增量

| 条款（§5.3） | 登记 | 时间线 | 验收方式 |
|:--|:--|:--|:--|
| 非 root 执行 | C38 | ✅ 已修复（2026-08-14） | PID1 uid 100 + 新卷/既有 root 卷可写 + 镜像构建/HTTP 冒烟通过（实证见 §7） |
| 超时兜底 | C41 | M7 | 单命令 timeout 生效，恶意死循环脚本超时中止且报告正确归类 |
| 资源与网络 | C40 / C26 | M7 | 出站白名单 + cgroup 限制有集成测试覆盖 |
| 工作目录隔离 | —（已落地） | — | 保持 `runs/{runId}/` + 执行后清理不回退 |

### 4.2 凭据基线增量

| 条款（§5.3） | 登记 | 时间线 | 验收方式 |
|:--|:--|:--|:--|
| 权限面收敛（本地 / Action） | C39 / C42 | ✅ 已修复（2026-08-14，T803） | 超权限 token（classic repo scope）启动即警告；fix/fix-and-pr 本地模式输出风险提示 |
| 平台密钥隔离 / 最小注入 / 防泄露 | —（已落地） | — | 保持 `credential.service.ts` 解密注入语义不回退 |

### 4.3 供应链基线增量

| 条款（§5.3） | 登记 | 时间线 | 验收方式 |
|:--|:--|:--|:--|
| 供应链信号披露 | C43 | P2 | 报告/PR 出现 lifecycle scripts 警示区（C43 落地时同步 quick-start 措辞） |

### 4.4 准入流程

新增执行后端必须过威胁建模评审（条款见 §5.3），评审结论登记本文档第 5 节治理决议表。

## 5. 治理决议与登记

| 编号 | 缺口 | 级别 | 处置 | 登记 |
|:--|:--|:--|:--|:--|
| G1 | Dockerfile 无 `USER` 降权 | P0 | ✅ **已修复（2026-08-14）**：entrypoint 降权方案（dependfix 用户 + chown 数据卷 + su-exec），本地实证见 [backlog C38](../../plan/backlog.md) | [backlog C38](../../plan/backlog.md) |
| G2 | CLI 本地模式零防护 | P0 | ✅ **已修复（2026-08-14，T803）**：fix/fix-and-pr 本地执行风险警告（可 env 抑制）；容器环境（ContainerExecutor）不误报 | [backlog C39](../../plan/backlog.md) |
| G3 | 网络外联无限制/无日志 | P1 | ✅ **已修复（2026-08-14，T805）**：执行期外联审计日志（本地审计代理 + 命令输出 URL 提取，双路径）；出站白名单随 M9 C26 | [backlog C40](../../plan/backlog.md) |
| G4 | 验证命令无单命令超时/资源上限 | P1 | ✅ **已修复（2026-08-14，T802）**：单命令超时（默认 10 分钟可配）+ 进程树终止；cgroup 随 M9 C26 | [backlog C41](../../plan/backlog.md) |
| G5 | M7 并发共享容器交叉污染 | P1 | ✅ **M10 已闭环（2026-08-20 归档）**——基于一手调研决策为 Docker rootless mode（runtime）+ 应用层白名单代理（网络）+ cgroup v2 + Node 20 自动识别（资源）。T1001-T1004 子任务已在 [todo-archive.md §M10](../../plan/todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) 拆解并落地（13 commits 待推送），设计在 [executor-sandbox.md §7](./executor-sandbox.md#7-sandbox-执行器设计) 落盘。`SandboxExecutor` 与 `ContainerExecutor` 并存（默认 `container`），K8s + Helm 仅规划登记；**T1005 路由接线 4 子任务（A 前端 UI 暴露 / B 仓库级 sandboxLimits / C 状态机扩 degraded / D 文档同步）落地中**——见 [executor-sandbox.md §7.8](./executor-sandbox.md) 降级状态机契约 + [backlog T1005](../../plan/backlog.md) |
| G6 | Action 模式凭据暴露面 | P1 | ✅ **已修复（2026-08-14，T803）**：启动时探测 token 权限面，classic repo scope 超权限启动即警告（不强制阻断） | [backlog C42](../../plan/backlog.md) |
| G7 | 升级研判缺供应链信号 | P2 | 报告/PR 增加 lifecycle scripts 信号披露 | [backlog C43](../../plan/backlog.md) |

## 6. 使用侧安全指引（面向用户）

- **本地 CLI 模式执行不可信代码**：本地模式无隔离，恶意依赖脚本（install/lint/build 钩子）直接在用户机器执行。建议：在专用环境（容器/VM/CI runner）运行；使用**专用低权限 token**（`security-events: read` + 目标仓库 `contents/pull-requests` 写权限），不要使用高权限 PAT。
- **owner 模式扫描范围即信任边界**：`--owner` 发现的仓库会被 clone 并执行其依赖脚本——只扫描可信组织的仓库；对不可信来源先人工 review 再纳入。
- **平台部署**：平台容器执行进程已**非 root 降权**（`dependfix` 用户，uid 100；entrypoint 启动时自动 chown 数据卷，兼容存量 root 卷升级，C38 已修复）；部署时勿挂载 `docker.sock`、勿给容器额外特权；`AUTH_SECRET`/`ENCRYPTION_KEY` 保持强随机值。
- **PR 合入前检查**：PR body 中标记 ⚠️ 的跨线升级、以及"新增/升级包带 lifecycle scripts"信号（C43 落地后）应人工确认。

## 7. 验收与持续治理

- **C38 验收（✅ 已达成 2026-08-14）**：容器主进程非 root（`docker exec` 实测 PID1 `Uid: 100`）；数据卷（`/app/data`）新卷与既有 root 卷均可写（entrypoint chown 自动修复）；镜像构建成功；HTTP 冒烟 `GET /` 200；su-exec 0755 非 setuid 无提权漏洞（非 root 提权尝试被拒）。**实证补充发现**：容器内 git/pnpm 缺失（M6 遗留）——**已修复（C45/T801，2026-08-14）**，并连带修复 pnpm-audit legacy range 前缀假跳过 bug。
- **C39/C42 验收（✅ 已达成 2026-08-14，T803）**：本地 fix/fix-and-pr 启动输出本地执行风险警告（实证：`[local-exec]` warn 输出、`DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制生效）；token 权限面探测（实证：`GET /user` 发起、401 静默不阻断运行）；analyzeTokenScope 判定 7 测试（classic repo scope 超权限警告 / fine-grained security-events 校验 / 无头不警告）。
- **C40 验收（✅ 已达成 2026-08-14，T805）**：执行日志含外联记录（实证：curl CONNECT `registry.npmjs.org:443` 经审计代理捕获 + 命令输出 tarball URL 提取双路径真实生效）；仅记录方法+目标无请求体（无敏感信息）；代理转发 10s 超时 + 失败 502 不挂死执行；环境已有代理时不注入覆盖。
- **C26/C40/C41 验收（✅ 已达成 2026-08-20 M10 收口）**：T1001 SandboxExecutor + DockerAdapter / T1002 出站白名单 deny-by-default 拦截代理 / T1003 cgroup v2 资源限制 / T1004 文档收口全部 commit + Review Gate Pass；详见 [todo-archive.md §M10](../../plan/todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)。T1002 与 T1003 单元 + 集成测试覆盖（含 docker rootless daemon 真实起容器实证，本机 WSL2 cgroup v1 环境 `describe.skipIf(!isCgroupV2)` 集成 stub）。C41 单命令超时已随 T802 落地（2026-08-14，进程树终止实证）。**剩余项**：T1005 sandbox 路由接线 4 子任务落地中（2026-08-20 文档批次完成 + 实现批次待跑）——A 前端 UI 暴露 sandbox 选项 / B Repository.sandboxLimits JSON 字段 / C 状态机扩 degraded（[§7.8 契约](./executor-sandbox.md)）/ D 文档同步；详见 [backlog.md T1005](../../plan/backlog.md)。

### 7.1 降级场景验收（T1005-C，2026-08-20 文档落地，实现待跑）

**A 场景（启动时降级）验收**：

- [ ] `executorKind === 'sandbox'` + `sandbox.isAvailable() === false` → 走 ContainerExecutor + 记录 `degradedReason`
- [ ] `resolveScanRunState(executorKind, undefined, result, degradedReason)` 返回 `{ status: 'degraded', errorJson: degradedReason }`
- [ ] `ScanRun.status === 'degraded'` 写入数据库；summaryJson + runUrl 全字段保留（与 completed 等价）
- [ ] `batch-aggregate.ts` 把 `degraded` 计入 `degradedCount`（独立计）+ `finishedCount`；ScanResult 参与 severityCounts
- [ ] UI：扫描历史显示 info severity（蓝色），文案「未启用 rootless，已自动使用平台容器」——而非 danger（红）

**B 场景（运行时降级）验收**：

- [ ] `executorKind === 'sandbox'` + `sandbox.isAvailable() === true` + `execute()` 抛 errno → 不静默降级
- [ ] `resolveScanRunState(executorKind, error, undefined, undefined)` 返回 `{ status: 'failed' }`（error.code = 'sandbox_unavailable'）
- [ ] `ScanRun.status === 'failed'`；summaryJson 为空；errorJson 含 sandbox_unavailable + errno 上下文
- [ ] UI：扫描历史显示 warn severity（黄色）而非 danger（红），文案「沙箱执行器运行时不可用，环境配置可能已变化，请联系管理员」
- [ ] **不静默降级**的强制约束：拒绝任何在运行时失败路径上自动回退 ContainerExecutor 的改动——避免掩盖「环境容器中途变化」的真实异常

**降级信号契约（orchestrator ↔ 状态机）**：

- [ ] `scan-orchestrator.service.ts` 在 sandbox 路由块维护 `degradedReason?: { code, message }` 内部变量
- [ ] 启动时不可用分支：`degradedReason = { code: 'sandbox_unavailable', message: '...' }`
- [ ] 运行时失败分支：`degradedReason = undefined`（不静默降级；错误码由 sandbox-executor.classifyError 返回）
- [ ] `resolveScanRunState(...)` 调用透传 `degradedReason` 作为第 4 参数
- **C26 实施关键决策（2026-08-19）**：
  - **Runtime** = Docker rootless（[Docker 官方文档](https://docs.docker.com/engine/security/rootless/)）；`SandboxRuntimeAdapter` 抽象不与 rootless 强绑定，未来切 Sysbox 仅替换 adapter——见 [executor-sandbox.md §7.1](./executor-sandbox.md#71-抽象边界不强绑定-docker-rootless)
  - **网络白名单** = 应用层 HTTP 代理（升级 T805 现有 `network-audit.ts` 为 deny-by-default 白名单拦截代理）——见 [executor-sandbox.md 决策背景](./executor-sandbox.md#7-sandbox-执行器设计)
  - **资源** = cgroup v2 写 `memory.max` + `cpu.max`（T1003）+ Node.js 20 自动识别 V8 堆自适应（[Kubernetes docs](https://kubernetes.io/docs/concepts/architecture/cgroups/)）
  - **反模式绝对禁止**：[DinD `--privileged`](https://blog.nestybox.com/2019/09/14/dind.html) + 挂 [`/var/run/docker.sock`](https://www.wiz.io/academy/container-escape)（CVE-2019-5736 runc 逃逸实证）——[executor-sandbox.md §7.3 反模式登记](./executor-sandbox.md#73-部署形态)
- **持续治理**：任何执行相关改动（Executor、验证 runner、安装参数、镜像配置）在 Review Gate 时对照本文档第 4 节基线核验；新增执行后端按 §4.4 过威胁建模评审。

## 8. 相关文档

- [执行器设计与沙箱评估](./executor-sandbox.md)：执行器契约与威胁建模（T607）
- [安全设计](./security.md)：总体安全设计（认证、Prompt 注入、部署安全）
- [安全规范 §5.3](../../standards/security.md)：权威安全基线（修复执行安全）
- [快速开始 → 安全注意事项](../../guide/quick-start.md)：使用侧指引
- [backlog.md](../../plan/backlog.md)：C26/C38-C43 登记

# 执行器设计与沙箱评估

> 状态：✅ 设计已落地（T603 `ContainerExecutor` + M10 T1001 沙箱隔离基础设施 + M38 执行进程隔离）。⚠️ 沙箱内真实引擎执行仍为占位（`buildCmd` 回显最小 `RunResult`，见 [implementation §7.2](./executor-sandbox-implementation.md#_7-2-镜像策略)）；**平台入口已临时关闭（2026-10-27）**：UI 禁用、API 拒绝新写入、存量 `executorKind=sandbox` 扫描强制降级到 `container`（degraded `sandbox_entry_disabled`）。真实执行闭环后恢复，缺口见 [backlog](../../plan/backlog.md#候选评估中-待评估-本阶段延后项)。
> 背景决策见 [M6 规划决策](../../plan/archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp-已归档)（Q1 执行深度 A/B 双模式、Q4 沙箱=A、Q5 Action 触发=B）。
> **安全评估（2026-08-14）**：评估结论、治理决议与不可简化的安全基线见 [沙箱与恶意依赖防护治理](./sandbox-security-governance.md)；本文档 §2.2 的 M6 缓解——USER 降权已修复（C38，2026-08-14）、外联日志已实现（C40/T805，2026-08-14），登记 [backlog C38/C40](../../plan/backlog.md)。
> **A 模式 push + PR 闭环（2026-08-20，C53 实施）**：A 模式 fix / fix-and-pr 完成后新增推送修复分支到远程 + 创建 PR 两条链路，结束了 M6 阶段"修复结果仅在本地临时目录"问题；新的状态机 dispatched 语义（PR 失败但分支已推）、runUrl 兜底为 branch URL、workDir 保留 24h 供诊断 由分片 [executor-sandbox-implementation.md §8](./executor-sandbox-implementation.md) 记录。

---

## 1. 定位

平台 = **控制面**（触发器/调度器 + 结果展示）；修复执行 = **数据面**（真实 clone、改文件、跑质量门）。
数据面通过 **Executor 抽象**与平台解耦，执行后端可插拔：

| 执行后端 | 隔离级别 | 工具链来源 | M6 状态 | M7 状态 |
|:--|:--|:--|:--|:--|
| 平台容器内子进程（`ContainerExecutor`） | 进程级（容器即沙箱） | 平台镜像内置 git/node/pnpm | ✅ 实现（T603） | 保留 |
| 独立沙箱容器（`SandboxExecutor`） | 容器级（每任务/每仓库容器） | 同一镜像或精简镜像 | 🔶 设计（本文档） | 实现（M10 T1001；C26 已收口） |
| GitHub Action（`ActionTriggerExecutor`） | GitHub 托管环境 | 目标仓库自带（action.yml 引用） | ✅ 触发实现（T607）+ 结果回填（C25） | 保留 |
| 本地临时目录（`LocalExecutor`） | 无隔离（开发调试用） | 宿主工具链 | —（仅开发） | — |

> 上表 M6 / M7 列为规划期快照；`SandboxExecutor` 的隔离基础设施已于 M10 T1001 落地，但沙箱内真实引擎执行仍为占位（`buildCmd` 回显最小 `RunResult`，见 [implementation §7.2](./executor-sandbox-implementation.md#_7-2-镜像策略)）；平台入口已于 2026-10-27 临时关闭（UI / API / 路由三处），真实执行闭环后恢复。

---

## 2. 威胁建模：恶意依赖升级

### 2.1 风险面

dependfix 的核心动作是**升级第三方依赖**，本质是"拉取并执行不可信代码"：

| 攻击面 | 场景 | 影响 |
|:--|:--|:--|
| **install scripts / postinstall** | 恶意包在 `pnpm install` 时执行 `preinstall/install/postinstall` 脚本（供应链投毒主流路径，如 event-stream、ua-parser-js 案例） | 容器内任意代码执行 |
| **构建链投毒** | 依赖被攻破后，构建脚本（prepare/build 钩子）篡改产物 | 产物不可信，污染后续依赖方 |
| **凭据泄露** | 恶意脚本读取进程环境（`GITHUB_TOKEN`、`ENCRYPTION_KEY`、`AUTH_SECRET` 等）或工作目录中的凭据文件，外传 | 凭据泄露 → 仓库/平台被接管 |
| **网络外联** | 恶意脚本访问外部网络（回传数据、下载第二阶段 payload） | 数据泄露、横向扩散 |
| **文件系统破坏** | 恶意脚本删除/篡改工作目录或平台文件 | 平台数据损坏 |
| **资源耗尽** | 无限循环、磁盘写满（依赖下载/日志膨胀） | DoS，平台不可用 |
| **提权逃逸** | 容器内进程以 root 运行且宿主机无防护时尝试逃逸 | 宿主接管 |

### 2.2 风险定级与缓解

| 风险 | 等级 | M6 缓解（ContainerExecutor 必做） | M7 增强（SandboxExecutor） |
|:--|:--|:--|:--|
| install scripts 代码执行 | **高**（本工具必然触发） | ① 非 root 用户运行（镜像 `USER` 降权）② 独立临时工作目录 ③ 超时/资源上限 ④ 执行结果白名单回传 | 独立容器 + 网络出站限制（默认 deny，白名单 registry 域名） |
| 凭据泄露 | **高**（执行环境持有平台密钥） | ① 凭据仅解密到执行进程内存，绝不落盘 ② 环境变量最小集注入（只传本仓库所需 token）③ 平台密钥（ENCRYPTION_KEY/AUTH_SECRET）不传入执行子进程 | 每任务独立密钥、无宿主 env 继承 |
| 网络外联 | 中 | 记录执行期外联日志（备查）；M6 容器内默认放行（registry 需要） | 出站白名单（deny-by-default）：官方 registry + 常见镜像站（registry 与其 tarball CDN 域成对）+ GitHub API/资产域 + `rolldown.rs`，并**从 `workDir` 配置面动态发现生效 registry host**（`pnpm config list --json`，host 粒度 + fail-open）；未列举域仍拦，企业私服自带独立 CDN 域需显式 `DEPENDFIX_ALLOWED_DOMAINS`（2026-10-10 落地，评审登记见 [sandbox-security-governance.md §5](./sandbox-security-governance.md#_5-治理决议与登记)） |
| 文件系统破坏 | 中 | 工作目录限定在平台数据卷下的 `runs/{runId}/` 临时目录，执行后清理 | 只读根文件系统 + tmpfs 工作目录 |
| 资源耗尽 | 中 | 子进程超时（默认 30 分钟可配）+ 磁盘配额随数据卷 | cgroup 内存/CPU 限制 |
| 提权逃逸 | 低（单租户自托管） | 非 root + 不挂载 docker.sock + 容器只读部分 | 独立容器 + seccomp/apparmor 加固 |

> **M6 结论**：平台容器即沙箱（进程级隔离）可接受——单租户自托管场景下威胁模型以"恶意依赖脚本"为主，通过非 root + 临时目录 + 凭据最小化 + 超时四项缓解即可达安全基线；更高隔离（网络出站限制、每任务容器）登记 backlog C26，M7 随 BullMQ worker 模型实现。
>
> **⚠️ 2026-08-14 评估修正**：M6 四项缓解中的"非 root 运行（镜像 `USER` 降权）"**已修复（C38，2026-08-14）**——entrypoint 降权方案（dependfix 用户 uid 100 + chown 数据卷 + su-exec），本地实证通过；"记录执行期外联日志"未实现——登记 C40。C26 独立沙箱提级为 M7 前置（并发共享容器交叉污染，见 [治理文档 §3 路径 D](./sandbox-security-governance.md)）。**实证补充**：容器内 git/pnpm 工具链从未安装（本文档声称"平台镜像内置 git/node/pnpm"与实际不符，仅 node 存在）——**已修复（C45/T801，2026-08-14）**：git + pnpm 11.18.0 + workspace node_modules 打包，容器内 fix 全链路实证通过。**2026-10-02 更新**：runtime 镜像改为只保留 Nuxt `.output`——Nitro trace 自带 `.output/server/node_modules`（含 better-sqlite3 musl prebuild），`@dependfix/engine` 已打包进 `.output/server/chunks`，故不再复制 workspace `node_modules` / dist；容器内执行（`DependfixApp` 程序化路径）仍完整可用，镜像体积显著下降（对齐 momei / caomei-auth 的 `.output`-only 形态）。

---

## 3. Executor 接口契约

执行后端可插拔的统一接口（T603 `ContainerExecutor` 与 T607 `ActionTriggerExecutor` 均实现此契约）：

```typescript
// apps/platform/server/services/executor/types.ts（T603 落地）

/** 执行器类型标识 */
export type ExecutorKind = 'container' | 'sandbox' | 'github-action' | 'local'

/** 执行上下文：平台侧组装，不携带任何平台密钥（凭据单独解密传递） */
export interface ScanExecutorContext {
    /** 平台侧 runId（对应 ScanRun.id） */
    runId: string
    /** 目标仓库（Repository 实体切片） */
    repository: {
        owner: string
        name: string
        defaultBranch: string
        packageManager?: 'pnpm' | 'npm' | 'yarn'
        /** ActionTriggerExecutor 使用：目标 workflow 文件名（仓库内路径，如 `.github/workflows/security-auto-fix.yml`） */
        actionWorkflowFile?: string
    }
    /** 复用 cli 的 RuntimeConfig（mode/severityThreshold/repositories 等） */
    config: RuntimeConfig
    /** 解密后的凭据（仅本次执行内存中持有，用后即弃） */
    credential?: { token: string }
    /** 工作目录：容器执行 = 数据卷下 runs/{runId}/；action 触发 = 不需要 */
    workDir: string
}

/** 执行结果：结构化回传（T603 落库 ScanRun/ScanResult 的数据源） */
export interface ScanExecutorResult {
    exitCode: number
    /** cli 的 RunResult（repositories/alerts/actions/errors/summary） */
    result?: RunResult
    /** 执行级失败（非业务失败：超时/环境缺失/触发失败等） */
    error?: { code: string; message: string }
    startedAt: string
    finishedAt: string
}

/** 执行后端统一契约：平台 scan-orchestrator 只依赖此接口，不感知具体实现 */
export interface ScanExecutor {
    readonly kind: ExecutorKind
    /** 执行前可用性探测（如容器内工具链存在性 / action 仓库权限校验） */
    isAvailable(): Promise<boolean>
    execute(ctx: ScanExecutorContext): Promise<ScanExecutorResult>
}
```

### 契约要点

1. **凭据最小化**：`credential` 由平台 credential service 在**调用 execute 前**解密，仅注入本次执行；`ScanExecutorContext` 不携带平台级密钥（`ENCRYPTION_KEY`/`AUTH_SECRET` 永不进入执行进程）。**凭据来源单一**：复用 `RuntimeConfig` 时，其 `githubToken`/`alertsToken` 字段必须由 credential service 解密结果填充，禁止从平台存储二次读取。
2. **结果结构对齐 cli**：`result` 直接复用 `RunResult`（`@dependfix/core` 类型），T603 落库无需二次映射。
3. **执行失败与业务失败分离**：`exitCode` + `result` 表示业务结果（扫描/修复产出）；`error` 表示执行基础设施失败（环境缺失、超时、触发被拒），T603 据此置 `ScanRun.status = 'failed'`。
4. **可插拔路由**：平台按 Repository 配置（`executorKind` 字段，M6 默认 `container`；配置了 `actionWorkflowFile` 且显式选择时路由 `github-action`）选择执行器。

---

## 4. ActionTriggerExecutor（T607 实现）

### 4.1 触发流程

```
平台（B 模式）→ POST /api/repos/{id}/scan { executor: 'github-action' }
  → credential 解密（需 actions: write 权限）
  → POST /repos/{owner}/{name}/actions/workflows/{workflowFile}/dispatches
      { ref: defaultBranch, inputs: { mode, severity-threshold, ... } }
  → 返回 { ok: true, dispatchId, runUrl }（GitHub 不返回 run id，需轮询 run 列表定位）
  → ScanRun.status = 'dispatched'（触发成功但结果未就绪；结果回填见 C25：轮询 run 完成 → 下载 artifact 解析落库）
```

### 4.2 权限要求

| 项 | 要求 |
|:--|:--|
| GitHub 凭据 | 需 `actions: write` 权限（classic PAT 勾选 `workflow` scope；fine-grained PAT 配 `Actions: write`） |
| 目标 workflow | 仓库内已存在（`actionWorkflowFile` 声明），且 `on: workflow_dispatch` 已声明 |
| 触发输入 | 与 action.yml inputs 对齐：`mode`（默认 `fix-and-pr`）、`severity-threshold`（默认 `high`）、`repos`、`max-alerts-per-repository` 等，最大 10 个字符串输入（GitHub 限制） |

### 4.3 触发结果判定

GitHub `dispatches` API 成功返回 204 即触发受理，但不返回 run id；实现需在触发后**轮询** `/repos/{owner}/{name}/actions/runs?event=workflow_dispatch`（带短退避，如 5s×3）定位本次 run 并返回 `runUrl`（供 UI 展示跳转）。轮询失败不视为扫描失败（仅 runUrl 缺失），ScanRun 保持 `dispatched` 状态。

### 4.4 错误处理

| 场景 | 行为 |
|:--|:--|
| 凭据无 `actions: write` 权限 | 触发返回 403 → `error.code = 'trigger_forbidden'`，ScanRun → `failed` |
| workflow 文件不存在 | 404 → `error.code = 'workflow_not_found'`，提示在仓库配置中修正 `actionWorkflowFile` |
| 目标仓库未配置该 workflow | 预检（触发前 GET workflow 确认存在），缺失即拒绝，避免无谓 404 |

---

## 5. B 模式（GitHub Action 降级）接入评估

> 决策背景：M6 规划 Q5=B——平台对已配置 action 的仓库触发 `workflow_dispatch`，作为服务器配置较低时的降级路径。

### 5.1 使用方式

1. 目标仓库添加依赖：在其 `.github/workflows/security-auto-fix.yml` 中 `uses: dependfix/dependfix@v0.6.0`（复用根 action.yml，M2 已落地），`on: workflow_dispatch` 声明。
2. 平台仓库配置：`actionWorkflowFile` 填入该文件路径，凭据选择具备 `actions: write` 的 Credential。
3. 用户触发：平台 Web UI 点击扫描（执行后端选择 GitHub Action）→ 平台触发 dispatch → **用户跳转目标仓库 Actions 页面查看执行**。

### 5.2 体验评估

| 维度 | 评估 |
|:--|:--|
| 优点 | 平台零工具链依赖（服务器配置低也无需内置 git/node/pnpm）；执行环境由 GitHub 托管、隔离性好（恶意依赖脚本跑在 GitHub runner 上）；无需维护执行镜像 |
| 缺点 | ~~结果回填缺失~~（已实现：`ActionResultFetcher` 轮询 run 完成 + 下载 `dependfix-report-{runId}` artifact 解析回填）；执行延迟高（runner 排队 + checkout + install，通常分钟级）；依赖目标仓库已配置 workflow（接入前置成本） |
| 触发可靠性 | `workflow_dispatch` 无排队保障，rate limit 5000/h 内足够；对私有仓库需 token 有该仓库访问权 + `actions: write` |

### 5.3 成本评估

| 项 | A 模式（平台容器） | B 模式（GitHub Action） |
|:--|:--|:--|
| 计算成本 | 平台服务器（已部署则边际成本≈0） | 目标仓库 Actions minutes（私有仓库计费；公共仓库免费） |
| 工具链维护 | 平台镜像内置（Dockerfile 已含 git/pnpm） | 无（GitHub runner 自带） |
| 结果获取 | 直接回填（T603） | 自动拉取（C25 已实现：artifact 下载）或人工查看 |

**结论**：B 模式作为**降级路径**保留——适合"平台服务器资源受限 + 目标仓库已配置 action"场景；M6 实现触发（`ActionTriggerExecutor`）与结果回填（`ActionResultFetcher`，C25 已实现）；默认路径仍是 A 模式 `ContainerExecutor`（T603）。

> **同步等待边界**：M6 同步执行模型下，B 模式结果回填的 fetcher 轮询最长 30 分钟（`runTimeoutMs` 可配）——HTTP 请求会同步挂起至该上限。反向代理默认超时（如 Nginx 60s）可能先断开，用户侧表现为"扫描无响应"；此时已有降级路径（`result_fetch_failed` → `dispatched` + runUrl 提示跳转查看，action 实际已在目标仓库运行）。M7 T702 队列化后 B 模式改为异步回填，消除同步阻塞。

---

## 6. 相关文档

- [M6 规划决策](../../plan/archive/todo-archive-phases-m6-m7-t711.md)：Q1/Q4/Q5 决策依据
- [todo-archive-phases-m10-c53-c59c61.md §M10 C26 实施规划](../../plan/archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划-已归档)：T1001-T1004 子任务拆解与验收要点（2026-08-20 收口归档；C25/C26 历史登记已随归档迁出 backlog）
- [sandbox-security-governance.md §5 治理决议 G5](./sandbox-security-governance.md#_5-治理决议与登记)：并发共享容器交叉污染登记
- [架构设计](./architecture.md)：平台分层与 Executor 定位
- [安全设计](./security.md)：凭据加密存储与最小化
- [github-action-workflow.md](./github-action-workflow.md)：Action 入口（M2 落地）

---

## 分片索引（迁出章节）

| 分片 | 章节范围 | 主题 |
|:--|:--|:--|
| [executor-sandbox-implementation.md](./executor-sandbox-implementation.md) | §7 - §8 | Sandbox 执行器设计 / A 模式 push + PR 推送机制 |

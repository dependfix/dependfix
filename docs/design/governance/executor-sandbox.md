# 执行器设计与沙箱评估

> 状态：🔶 设计先行（T607，2026-08-08）——契约与威胁建模落盘，供 T603 实现 `ContainerExecutor`；独立沙箱容器实现留 M7。
> 背景决策见 [todo.md §M6 规划决策](../../plan/todo.md#m6-最小平台-mvp)（Q1 执行深度 A/B 双模式、Q4 沙箱=A、Q5 Action 触发=B）。

---

## 1. 定位

平台 = **控制面**（触发器/调度器 + 结果展示）；修复执行 = **数据面**（真实 clone、改文件、跑质量门）。
数据面通过 **Executor 抽象**与平台解耦，执行后端可插拔：

| 执行后端 | 隔离级别 | 工具链来源 | M6 状态 | M7 状态 |
|:--|:--|:--|:--|:--|
| 平台容器内子进程（`ContainerExecutor`） | 进程级（容器即沙箱） | 平台镜像内置 git/node/pnpm | ✅ 实现（T603） | 保留 |
| 独立沙箱容器（`SandboxExecutor`） | 容器级（每任务/每仓库容器） | 同一镜像或精简镜像 | 🔶 设计（本文档） | 实现（backlog C26） |
| GitHub Action（`ActionTriggerExecutor`） | GitHub 托管环境 | 目标仓库自带（action.yml 引用） | ✅ 触发实现（T607） | 保留 + 结果回填（C25） |
| 本地临时目录（`LocalExecutor`） | 无隔离（开发调试用） | 宿主工具链 | —（仅开发） | — |

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
| 网络外联 | 中 | 记录执行期外联日志（备查）；M6 容器内默认放行（registry 需要） | 出站白名单（npm/pnpm registry + GitHub API） |
| 文件系统破坏 | 中 | 工作目录限定在平台数据卷下的 `runs/{runId}/` 临时目录，执行后清理 | 只读根文件系统 + tmpfs 工作目录 |
| 资源耗尽 | 中 | 子进程超时（默认 30 分钟可配）+ 磁盘配额随数据卷 | cgroup 内存/CPU 限制 |
| 提权逃逸 | 低（单租户自托管） | 非 root + 不挂载 docker.sock + 容器只读部分 | 独立容器 + seccomp/apparmor 加固 |

> **M6 结论**：平台容器即沙箱（进程级隔离）可接受——单租户自托管场景下威胁模型以"恶意依赖脚本"为主，通过非 root + 临时目录 + 凭据最小化 + 超时四项缓解即可达安全基线；更高隔离（网络出站限制、每任务容器）登记 backlog C26，M7 随 BullMQ worker 模型实现。

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
  → ScanRun.status = 'dispatched'（结果回填 = 已知边界 C25）
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

1. 目标仓库添加依赖：在其 `.github/workflows/security-auto-fix.yml` 中 `uses: dependfix/dependfix@v1`（复用根 action.yml，M2 已落地），`on: workflow_dispatch` 声明。
2. 平台仓库配置：`actionWorkflowFile` 填入该文件路径，凭据选择具备 `actions: write` 的 Credential。
3. 用户触发：平台 Web UI 点击扫描（执行后端选择 GitHub Action）→ 平台触发 dispatch → **用户跳转目标仓库 Actions 页面查看执行**。

### 5.2 体验评估

| 维度 | 评估 |
|:--|:--|
| 优点 | 平台零工具链依赖（服务器配置低也无需内置 git/node/pnpm）；执行环境由 GitHub 托管、隔离性好（恶意依赖脚本跑在 GitHub runner 上）；无需维护执行镜像 |
| 缺点 | **结果回填缺失**：平台只知"已触发"，扫描结果/报告需用户到目标仓库 Actions 页查看（回填通道 = backlog C25，独立难题）；执行延迟高（runner 排队 + checkout + install，通常分钟级）；依赖目标仓库已配置 workflow（接入前置成本） |
| 触发可靠性 | `workflow_dispatch` 无排队保障，rate limit 5000/h 内足够；对私有仓库需 token 有该仓库访问权 + `actions: write` |

### 5.3 成本评估

| 项 | A 模式（平台容器） | B 模式（GitHub Action） |
|:--|:--|:--|
| 计算成本 | 平台服务器（已部署则边际成本≈0） | 目标仓库 Actions minutes（私有仓库计费；公共仓库免费） |
| 工具链维护 | 平台镜像内置（Dockerfile 已含 git/pnpm） | 无（GitHub runner 自带） |
| 结果获取 | 直接回填（T603） | 需回填通道（C25）或人工查看 |

**结论**：B 模式作为**降级路径**保留——适合"平台服务器资源受限 + 目标仓库已配置 action"场景；M6 实现触发（`ActionTriggerExecutor`）与结果回填边界登记（C25 已登记 backlog）；默认路径仍是 A 模式 `ContainerExecutor`（T603）。

---

## 6. 相关文档

- [todo.md §M6 规划决策](../../plan/todo.md)：Q1/Q4/Q5 决策依据
- [backlog.md C25 Action 触发结果回填](../../plan/backlog.md)：结果回填边界登记
- [backlog.md C26 独立沙箱容器执行实现](../../plan/backlog.md)：独立沙箱容器 backlog 登记
- [架构设计](./architecture.md)：平台分层与 Executor 定位
- [安全设计](./security.md)：凭据加密存储与最小化
- [github-action-workflow.md](./github-action-workflow.md)：Action 入口（M2 落地）

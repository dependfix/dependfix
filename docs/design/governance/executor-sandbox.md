# 执行器设计与沙箱评估

> 状态：🔶 设计先行（T607，2026-08-08）——契约与威胁建模落盘，供 T603 实现 `ContainerExecutor`；独立沙箱容器实现留 M7。
> 背景决策见 [todo-archive.md §M6 规划决策](../../plan/archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)（Q1 执行深度 A/B 双模式、Q4 沙箱=A、Q5 Action 触发=B）。
> **安全评估（2026-08-14）**：评估结论、治理决议与不可简化的安全基线见 [沙箱与恶意依赖防护治理](./sandbox-security-governance.md)；本文档 §2.2 的 M6 缓解——USER 降权已修复（C38，2026-08-14）、外联日志已实现（C40/T805，2026-08-14），登记 [backlog C38/C40](../../plan/backlog.md)。

---

## 1. 定位

平台 = **控制面**（触发器/调度器 + 结果展示）；修复执行 = **数据面**（真实 clone、改文件、跑质量门）。
数据面通过 **Executor 抽象**与平台解耦，执行后端可插拔：

| 执行后端 | 隔离级别 | 工具链来源 | M6 状态 | M7 状态 |
|:--|:--|:--|:--|:--|
| 平台容器内子进程（`ContainerExecutor`） | 进程级（容器即沙箱） | 平台镜像内置 git/node/pnpm | ✅ 实现（T603） | 保留 |
| 独立沙箱容器（`SandboxExecutor`） | 容器级（每任务/每仓库容器） | 同一镜像或精简镜像 | 🔶 设计（本文档） | 实现（backlog C26） |
| GitHub Action（`ActionTriggerExecutor`） | GitHub 托管环境 | 目标仓库自带（action.yml 引用） | ✅ 触发实现（T607）+ 结果回填（C25） | 保留 |
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
>
> **⚠️ 2026-08-14 评估修正**：M6 四项缓解中的"非 root 运行（镜像 `USER` 降权）"**已修复（C38，2026-08-14）**——entrypoint 降权方案（dependfix 用户 uid 100 + chown 数据卷 + su-exec），本地实证通过；"记录执行期外联日志"未实现——登记 C40。C26 独立沙箱提级为 M7 前置（并发共享容器交叉污染，见 [治理文档 §3 路径 D](./sandbox-security-governance.md)）。**实证补充**：容器内 git/pnpm 工具链从未安装（本文档声称"平台镜像内置 git/node/pnpm"与实际不符，仅 node 存在）——**已修复（C45/T801，2026-08-14）**：git + pnpm 11.18.0 + workspace node_modules 打包，容器内 fix 全链路实证通过。

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

1. 目标仓库添加依赖：在其 `.github/workflows/security-auto-fix.yml` 中 `uses: dependfix/dependfix@v1`（复用根 action.yml，M2 已落地），`on: workflow_dispatch` 声明。
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

- [todo.md §M6 规划决策](../../plan/todo.md)：Q1/Q4/Q5 决策依据
- [backlog.md C25 Action 触发结果回填](../../plan/backlog.md)：结果回填实现记录
- [backlog.md C26 独立沙箱容器执行实现](../../plan/backlog.md)：独立沙箱容器 backlog 登记 + 2026-08-19 决策
- [todo.md §M10 C26 实施规划](../../plan/todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)：T1001-T1004 子任务拆解与验收要点
- [sandbox-security-governance.md §5 治理决议 G5](./sandbox-security-governance.md#5-治理决议与登记)：并发共享容器交叉污染登记
- [架构设计](./architecture.md)：平台分层与 Executor 定位
- [安全设计](./security.md)：凭据加密存储与最小化
- [github-action-workflow.md](./github-action-workflow.md)：Action 入口（M2 落地）

---

## 7. Sandbox 执行器设计

> 状态：🔶 设计落盘（M10，2026-08-19 决策会议）——T1001-T1004 实施规划已在 [todo.md §M10](../../plan/todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动) 登记；本文档定义接口契约与部署形态，详细任务拆解见 todo 实施规划。
> **决策依据**：Docker rootless mode + 应用层白名单代理 + cgroup v2 双层；Executor 抽象不与 rootless 强绑定；自托管 docker-compose 优先；与 `ContainerExecutor` 并存保留单机场景。一手调研依据见 [todo.md §M10 调研依据](../../plan/todo.md#m10-调研依据)。

### 7.1 抽象边界（不强绑定 Docker rootless）

`SandboxExecutor` 通过 §3 接口契约实现，**不与具体 OCI runtime 强绑定**——Runtime 形态作为配置项（`SANDBOX_RUNTIME` / Repository 字段）注入，避免今后切 Sysbox（`--runtime=sysbox-runc`）、Kata（`--runtime=kata-runtime`）等需要重写业务代码：

```text
Repository.executorKind = 'sandbox'              → SandboxExecutor 路由
                  ↓
      scan-orchestrator 解析 → SandboxExecutor.execute(ctx)
                  ↓
      SandboxRuntimeAdapter (interface, DI)
                  ├─ runtime=DockerRootless  → docker run --user=100:100 --memory=... --cpus=... sandbox-image:tag
                  ├─ runtime=Sysbox          → docker run --runtime=sysbox-runc ...
                  └─ runtime=Kata            → docker run --runtime=kata-runtime ...（backlog 登记，非 M10 目标）
```

**接口预览**（T1001 实施时落定）：

```typescript
// apps/platform/server/services/executor/sandbox-runtime-adapter.ts（新建）
export interface SandboxRuntimeAdapter {
    /** 启动 sandbox 容器并返回 wait/stop 接口 */
    spawn(opts: SandboxSpawnOpts): Promise<SandboxHandle>
    /** 探测当前 runtime 可用性（启动期自检用） */
    isAvailable(): Promise<boolean>
}

export interface SandboxSpawnOpts {
    image: string                        // 复用平台镜像 tags（T1001-1）
    user: string                         // '100:100'（T1001）
    cgroupLimits?: { memoryMb: number; cpu: number }   // 透传 Repository.sandboxLimits
    workDirBindMount: string             // /tmp/runs/{runId} → /workspace
    networkEgressPolicy: 'allowlist'     // 白名单拦截代理对接（T1002）
    envSubset: NodeJS.ProcessEnv          // 仅解密后的 exec token（T1002 域名校验前置）
}

export interface SandboxHandle {
    containerId: string
    stop(signal?: NodeJS.Signals): Promise<void>
    waitForExit(): Promise<{ exitCode: number; stdout: string; stderr: string }>
}
```

**RuntimeAdapter 不变量**：业务侧只依赖 `SandboxRuntimeAdapter` 接口，与 `docker run` / `podman run` / `ctr run`（containerd CLI）解耦。当前默认实现为 `DockerRootlessAdapter`，对应 `--user=100:100 --memory=2g --cpus=1.0`。切 Sysbox 路径仅替换 adapter 实现。

### 7.2 镜像策略

复用 `apps/platform/Dockerfile` runtime 阶段（T801 已落地 git + pnpm 11.18.0 工具链；C45 修复），**不维护双镜像**。Sandbox 容器启动命令与平台容器内执行 `DependfixApp.run()` 等价，差异仅在 UID/cgroup/网络隔离边界。镜像 tag 通过 `apps/platform/docker tag` 复用（与 C30 `Publish Docker` CI 链路解耦——CI 发布的镜像不可被 sandbox 直接拉，本场景使用平台内置镜像）。

### 7.3 部署形态

**自托管 docker-compose**（M10 目标，唯一交付形态）：

- `apps/platform/docker-compose.yml` 增加 `sandbox-daemon` 服务（rootless Docker daemon 容器，挂载 `data/runs` 共享卷，映射 unix socket 给 platform 容器）
- `apps/platform/Dockerfile` 不变（T801/C38 已落地，非 root + 工具链）
- platform 容器通过 `DOCKER_HOST=unix:///var/run/docker.sock`（容器内 socket 路径，与 rootless daemon 共享）

**反模式登记**（绝对不可用）：
- 挂宿主 `docker.sock` 直连：违反 [sandbox-security-governance.md §3 路径 D](./sandbox-security-governance.md)
- DinD `--privileged`：恶意脚本等效宿主 root（[CVE-2019-5736 runc 逃逸](https://www.wiz.io/academy/container-escape)）
- 平台容器启动 rootless daemon 自身作为 sandbox（破坏"独立 PID/Mount namespace"目的）

**K8s + Helm Chart**：仅在本节末子目登记为 backlog（不属 M10 范围）——见 §7.5。

### 7.4 与 ContainerExecutor 并存

按 [todo.md §M10 Q6 决策](../../plan/todo.md#m10-决策会议结论2026-08-19)：两 Executor 同时注册，**默认 `container`**（向后兼容单机场景不破坏）：

| 触发条件 | 走向 | 备注 |
|:--|:--|:--|
| `Repository.executorKind` = `undefined`  | `ContainerExecutor` | M6 默认，单机/无 rootless 场景仍可用 |
| `Repository.executorKind` = `'container'` | `ContainerExecutor` | 显式声明，与 M6 一致 |
| `Repository.executorKind` = `'sandbox'` + SandboxRuntimeAdapter 可用 | `SandboxExecutor` | M10 目标 |
| `Repository.executorKind` = `'sandbox'` + adapter 不可用（无 docker rootless） | `ContainerExecutor` + 启动 warn + 报告 `sandbox_unavailable` | 降级而非失败，单机场景可正常运行 |
| `Repository.executorKind` = `'github-action'` | `ActionTriggerExecutor` | M6 已有 |

CLI 启动时（`@dependfix/cli` entrypoint）探测 SandboxRuntimeAdapter 可用性；不可用时输出 `[sandbox]` warn 提示管理员启动 rootless daemon，但**不阻断**运行（旧路径仍可用）。

### 7.5 K8s + Helm 部署预留（非 M10 范围）

> 状态：🔶 backlogging，待真实 K8s 部署需求出现时评估（用户 2026-08-19 决策："仅做规划，等真有需求时再实现"）。
>
> **触发条件**：
> 1. 真实多租户/企业部署需要 K8s 编排
> 2. 至少 1 个外部用户提出 K8s 部署请求
> 3. dependfix 1.0.0 正式发布前后纳入发行矩阵

**预留接口**：`SandboxRuntimeAdapter` 抽象兼容 K8s（通过 Kubernetes RuntimeClass + Pod sandbox securityContext 实现，无需 runc/dockerd 依赖）。`Repository.executorKind='sandbox'` 在 K8s 场景下走 `KubernetesRuntimeAdapter`（未来 TBD），接口签名保持 §7.1 不变。

**Helm Chart** 留 backlog：需 `values.yaml`（sandbox resource limits 默认 / RBAC 不挂 docker.sock / PodSecurityContext 非 root）/ `templates/deployment.yaml`（rootless daemon sidecar）/ `templates/servicemonitor.yaml`（[sandbox-security-governance.md §7 验收持续治理](./sandbox-security-governance.md#7-验收与持续治理)）。

### 7.6 验收对照（链接权威条款）

实施时按 [sandbox-security-governance.md §4 安全基线](./sandbox-security-governance.md#4-安全基线不可简化作为后续开发安全指导) 与 [安全规范 §5.3](../../standards/security.md) 逐项核验：

- **非 root 执行** → SandboxRuntimeAdapter 注入 `--user=100:100`（C38 路径延续）
- **超时兜底** → T802 单命令超时（已落地）+ SandboxHandle.waitForExit 透传外层 30 分钟超时
- **资源与网络** → T1002 白名单拦截代理 + T1003 cgroup v2
- **工作目录隔离** → `runs/{runId}/` 临时目录 + bind-mount + 执行后 cleanup
- **新执行后端威胁建模评审** → [sandbox-security-governance.md §4.4](./sandbox-security-governance.md) 已要求；T1001 提交 Review Gate 时同节点触发 Code Auditor 复核
- **规范单点声明** → 不在本节重复 [security.md §5.3](../../standards/security.md) 条款，仅挂引用

### 7.7 设计反例（绝对不可行）

| 反例 | 风险 | 登记 |
|:--|:--|:--|
| SandboxRuntimeAdapter 内部硬编码 `docker run`（而非参数化 runtime）| 强绑定 docker；切 Sysbox/Kata 需重写 | T1001 Review Gate 必查 |
| SandboxExecutor 工作目录 bind-mount 宿主路径（非 run-scoped tmp） | 跨 run 数据残留 | T1001 Review Gate 必查 |
| Sandbox 镜像走 `caomeiyouren/dependfix:latest`（CI 发布镜像） | sandbox 与平台二进制版本漂移风险 | T1001 镜像策略段禁止 |
| 默认 `executorKind='sandbox'` | 单机场景破坏 | T1001 路由默认 'container' |

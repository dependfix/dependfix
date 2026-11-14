# 执行器设计与沙箱评估 分片：沙箱执行器设计与推送机制（executor-sandbox.md §7-§8）

> 本分片自 [executor-sandbox.md](./executor-sandbox.md) 按连续尾部章节迁出（章节编号全局唯一、跨文件稳定）；文中 `§N` 除显式标注文件路径者外，均指本分片或主文档的同名章节。

## 7. Sandbox 执行器设计

> 状态：🔶 设计落盘（M10，2026-08-19 决策会议 / 2026-08-20 收口归档）——T1001-T1004 实施规划已在 [todo-archive-phases-m10-c53-c59c61.md §M10](../../plan/archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划-已归档) 落地；本文档定义接口契约与部署形态，详细任务拆解见 todo-archive 实施规划。
> **决策依据**：Docker rootless mode + 应用层白名单代理 + cgroup v2 双层；Executor 抽象不与 rootless 强绑定；自托管 docker-compose 优先；与 `ContainerExecutor` 并存保留单机场景。一手调研依据见 [todo-archive-phases-m10-c53-c59c61.md §M10 决策依据](../../plan/archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划-已归档)。

### 7.1 抽象边界（不强绑定 Docker rootless）

> **2026-11-09 入口恢复（M57.1）**：report-only 路由回 `SandboxExecutor`（独立容器内跑自包含 CLI）。
> **2026-11-13（M59.1）**：fix / fix-and-pr 在出站策略就位时同样在沙箱内执行（容器内 clone → CLI，运行级审计代理约束出站）；仅 adapter 启动不可用时降级 `ContainerExecutor`。以下抽象与路由图为当前形态。

`SandboxExecutor` 通过 §3 接口契约实现，**不与具体 OCI runtime 强绑定**——Runtime 形态作为配置项（`SANDBOX_RUNTIME` / Repository 字段）注入，避免今后切 Sysbox（`--runtime=sysbox-runc`）、Kata（`--runtime=kata-runtime`）等需要重写业务代码：

```text
Repository.executorKind = 'sandbox'（report-only）→ SandboxExecutor 路由
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
    /** 预留：宿主目录 → 容器挂载；当前沙箱不挂宿主目录（结果经 stdout 哨兵回传） */
    workDirBindMount?: string
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

**双镜像（2026-11-14 起）**：平台镜像与沙箱镜像由同一 `apps/platform/Dockerfile` 的两个 target 产出，共享 `executor-base`（Node + pnpm 11.18.0 + git + python3/make/g++ 执行工具链）：

| 镜像 | 内容 | 用途 |
|:--|:--|:--|
| 平台镜像（默认 target） | `.output`（Nuxt + 引擎）+ `/app/sandbox` + 控制面 | 平台自身部署；`ContainerExecutor` 在同一进程内执行 |
| 沙箱镜像 `sandbox`（默认，slim） | `executor-base-slim`（Node + pnpm + git）+ `/app/sandbox` | 外置 rootless daemon 内跑 `node /app/sandbox/bin.mjs`；体积最小 |
| 沙箱镜像 `sandbox-full` | `executor-base`（+ python3 / make / g++）+ `/app/sandbox` | 目标仓库原生模块无 prebuild、需 node-gyp 源码编译时使用 |

- **构建**：沙箱 target 只依赖 `cli-builder`（core → engine → cli + `build:sandbox`），不触发 Nuxt 构建；`docker.yml` 按架构分别构建两个 target 并各自合成多架构 manifest。
- **发布名**：slim 为 `…/dependfix-sandbox`、full 为 `…/dependfix-sandbox-full`（docker.io / ghcr.io / ACR 三处同名）；tag 与平台镜像一致（`latest`、`YYYY-MM-DD`、`sha-*`、发布时 `platform-x.y.z`），沙箱镜像**额外发裸版本 tag**（如 `1.0.0`）供默认解析使用。构建期自检 `--version` 非 unknown + skills doctor。
- **体积取舍（2026-11-14 实测）**：平台镜像 815MB；slim 沙箱约 320MB（Node + git + pnpm + bundle），full 约 744MB（多出编译工具链）。默认 slim；需要源码编译回退的仓库改用 full（仓库级 `sandboxImage` 或 `SANDBOX_IMAGE_REPO` 指向 `-full`）。
- **默认解析（三源）**：`Repository.sandboxImage` → `SANDBOX_IMAGE` → `SANDBOX_IMAGE_REPO` + `SANDBOX_IMAGE_TAG`；未显式指定时按「**平台镜像同 registry**（由 `DEPENDFIX_IMAGE` 推导 `dependfix-sandbox`）→ Docker Hub → ghcr → ACR（ACR 置末以减少其负荷）」生成候选，执行前逐个 inspect / pull（`SANDBOX_IMAGE_PULL_TIMEOUT_MS`，默认 300s/个），首个可用即用。平台走 ACR 时沙箱自动走 ACR，避免跨网慢速；全部失败才报 `sandbox_image_unavailable`（消息列出已尝试镜像）。不再把 `DEPENDFIX_IMAGE` 本身当沙箱镜像。
- **约束**：镜像必须包含与平台版本匹配的 `/app/sandbox/bin.mjs` 与 skills；发布 tag 同源，仓库级自定义镜像由配置者承担版本同源责任（建议 digest 或固定发布 tag）。镜像缺失 / 不可拉取以 `sandbox_image_unavailable` 判 `failed`（runtime / deterministic）。

### 7.3 部署形态

**自托管 docker-compose**（M10 目标，唯一交付形态）：

- rootless daemon 由**宿主**启动（不在平台容器内启动 daemon）；平台容器只挂载其 unix socket（**不是**宿主 `/var/run/docker.sock`）
- `apps/platform/Dockerfile` 工具链 / 非 root 链路不变（T801/C38 已落地）；runtime 自 2026-10-02 起仅含 Nuxt `.output`，不再随附 workspace `node_modules`，故 sandbox 独立入口须自包含（见 §7.2）
- platform 镜像默认拉取已发布 tag（`docker compose pull && docker compose up -d`），本地构建经 `docker-compose.build.yml` 覆盖文件显式开启；运行身份默认 `dependfix`（uid 100 / gid 101），`PUID`/`PGID` 可对齐宿主用户以控制数据卷 / `$HOME` 所有权，且对 0 值 fail-closed（保持非 root 基线）
- **不需要**在宿主与平台容器间共享 `runs` 目录：沙箱容器不挂载宿主目录，结果经 stdout 哨兵回传（见 §7.2 / §7.8）；沙箱镜像须在目标 rootless daemon 内可拉取 / 已存在（独立精简镜像，解析顺序见 §7.2）
- socket 属主是宿主启动 daemon 的用户（常见 uid 1000）；平台容器默认 uid 100 / gid 101 需通过 `PUID`/`PGID` 或 `group_add` 对齐，否则 `DockerAdapter` 探测失败 → 启动降级 `container`

**可选 `sandbox-daemon` compose 片段（示例级，不纳入 M57.1 验收）**：

rootless daemon 由宿主启动，平台只挂载其 socket：

```yaml
services:
  platform:
    environment:
      # 宿主 rootless daemon 的 socket（不是 /var/run/docker.sock）
      DOCKER_HOST: unix:///run/user/1000/docker.sock
      # 沙箱镜像与平台容器镜像同源（compose 默认已注入；此处显式说明依赖关系）
      DEPENDFIX_IMAGE: ${DEPENDFIX_IMAGE:-caomeiyouren/dependfix:latest}
    volumes:
      - /run/user/1000/docker.sock:/run/user/1000/docker.sock
      - dependfix-data:/app/data
```

> 不要改为挂载宿主 `/var/run/docker.sock`（等价宿主 root），也不要在平台容器内启动 rootless daemon 自身作为 sandbox。真实生产请按 [Docker rootless 官方文档](https://docs.docker.com/engine/security/rootless/) 在宿主启动 daemon。

**反模式登记**（绝对不可用）：
- 挂宿主 `docker.sock` 直连：违反 [sandbox-security-governance.md §3 路径 D](./sandbox-security-governance.md)
- DinD `--privileged`：恶意脚本等效宿主 root（[CVE-2019-5736 runc 逃逸](https://www.wiz.io/academy/container-escape)）
- 平台容器启动 rootless daemon 自身作为 sandbox（破坏"独立 PID/Mount namespace"目的）

**K8s + Helm Chart**：仅在本节末子目登记为 backlog（不属 M10 范围）——见 §7.5。

### 7.4 与 ContainerExecutor 并存

按 [todo-archive-phases-m10-c53-c59c61.md §M10 D6 决策（Q6 并存）](../../plan/archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划-已归档)：两 Executor 同时注册，**默认 `container`**（向后兼容单机场景不破坏）：

| 触发条件 | 走向 | 备注 |
|:--|:--|:--|
| `Repository.executorKind` = `undefined`  | `ContainerExecutor` | M6 默认，单机/无 rootless 场景仍可用 |
| `Repository.executorKind` = `'container'` | `ContainerExecutor` | 显式声明，与 M6 一致 |
| `Repository.executorKind` = `'sandbox'` + 模式 = `report-only` + SandboxRuntimeAdapter 可用 | `SandboxExecutor` | 已落地：独立容器跑自包含 CLI，结果经容器内 `/tmp/result.json` + stdout 哨兵回传（无宿主挂载） |
| `Repository.executorKind` = `'sandbox'` + 模式 = `fix` / `fix-and-pr` + 出站策略就位 | `SandboxExecutor` | 容器内 clone 到 `/tmp/repo` 后执行 CLI；运行级审计代理按白名单 deny-by-default，非白名单外联使运行 `failed`（`network_violation`） |
| `Repository.executorKind` = `'sandbox'` + 模式 = `fix` / `fix-and-pr` + 审计关闭或白名单被显式清空 | 不降级 → **`failed`** | 执行器第二道闸返回 `sandbox_fix_requires_egress_policy` 且不 clone |
| `Repository.executorKind` = `'sandbox'` + 模式 = `fix` / `fix-and-pr` + clone 基地址非法或未命中白名单 | 不降级 → **`failed`** | 执行器返回 `sandbox_clone_host_not_allowed` 且不执行；`SANDBOX_CLONE_BASE_URL` 的 host 须加入 `DEPENDFIX_ALLOWED_DOMAINS` |
| `Repository.executorKind` = `'sandbox'` + adapter **启动时**不可用（`isAvailable()` 返回 false） | `ContainerExecutor` 降级执行 → **`degraded` 状态** | **A 场景**（配置层降级）：业务结果完整，UI info 提示「未启用 rootless，已自动使用平台容器」 |
| `Repository.executorKind` = `'sandbox'` + adapter **启动可用**但 `execute()` 抛 errno（ENOENT/ENOTCONN/EACCES/ECONNREFUSED） | 不静默降级 → `error.code = 'sandbox_unavailable'` → **`failed` 状态** | **B 场景**（环境中途变化）：业务未完成，UI warn 告警「沙箱运行时不可用，环境配置可能已变化」 |
| `Repository.executorKind` = `'github-action'` | `ActionTriggerExecutor` | M6 已有 |

**镜像来源**：解析顺序与版本同源约束见 §7.2；外置 rootless daemon 通常没有平台本地镜像名，仓库级 `sandboxImage` 避免为单个仓库改全局 env。

CLI 启动时（`@dependfix/cli` entrypoint）探测 SandboxRuntimeAdapter 可用性；不可用时输出 `[sandbox]` warn 提示管理员启动 rootless daemon，但**不阻断**运行（旧路径仍可用）。

> **A/B 场景语义差异详见下文 §7.8 降级状态机契约**——核心是「启动时降级（配置偏离）→ degraded + info」与「运行时降级（环境异常）→ failed + warn」的边界区分。

### 7.5 K8s + Helm 部署预留（非 M10 范围）

> 状态：🔶 backlogging，待真实 K8s 部署需求出现时评估（用户 2026-08-19 决策："仅做规划，等真有需求时再实现"）。
>
> **触发条件**：
> 1. 真实多租户/企业部署需要 K8s 编排
> 2. 至少 1 个外部用户提出 K8s 部署请求
> 3. dependfix 1.0.0 正式发布前后纳入发行矩阵

**预留接口**：`SandboxRuntimeAdapter` 抽象兼容 K8s（通过 Kubernetes RuntimeClass + Pod sandbox securityContext 实现，无需 runc/dockerd 依赖）。`Repository.executorKind='sandbox'` 在 K8s 场景下走 `KubernetesRuntimeAdapter`（未来 TBD），接口签名保持 §7.1 不变。

**Helm Chart** 留 backlog：需 `values.yaml`（sandbox resource limits 默认 / RBAC 不挂 docker.sock / PodSecurityContext 非 root）/ `templates/deployment.yaml`（rootless daemon sidecar）/ `templates/servicemonitor.yaml`（[sandbox-security-governance.md §7 验收持续治理](./sandbox-security-governance.md#_7-验收与持续治理)）。

### 7.6 验收对照（链接权威条款）

实施时按 [sandbox-security-governance.md §4 安全基线](./sandbox-security-governance.md#_4-安全基线-不可简化-作为后续开发安全指导) 与 [安全规范 §5.3](../../standards/security.md) 逐项核验：

- **非 root 执行** → SandboxRuntimeAdapter 注入 `--user=100:100`（C38 路径延续）
- **超时兜底** → T802 单命令超时（已落地）+ SandboxHandle.waitForExit 透传外层 30 分钟超时
- **资源与网络** → T1002 白名单拦截代理 + T1003 cgroup v2
- **工作目录隔离** → 容器私有 `/tmp`（不挂宿主目录）+ `autoRemove` 执行后销毁
- **新执行后端威胁建模评审** → [sandbox-security-governance.md §4.4](./sandbox-security-governance.md) 已要求；T1001 提交 Review Gate 时同节点触发 Code Auditor 复核
- **规范单点声明** → 不在本节重复 [security.md §5.3](../../standards/security.md) 条款，仅挂引用

### 7.7 设计反例（绝对不可行）

| 反例 | 风险 | 登记 |
|:--|:--|:--|
| SandboxRuntimeAdapter 内部硬编码 `docker run`（而非参数化 runtime）| 强绑定 docker；切 Sysbox/Kata 需重写 | T1001 Review Gate 必查 |
| SandboxExecutor 工作目录 bind-mount 宿主路径（非 run-scoped tmp） | 跨 run 数据残留 | T1001 Review Gate 必查 |
| Sandbox 镜像走 `caomeiyouren/dependfix:latest`（CI 发布镜像） | sandbox 与平台二进制版本漂移风险 | T1001 镜像策略段禁止 |
| 默认 `executorKind='sandbox'` | 单机场景破坏 | T1001 路由默认 'container' |

### 7.8 降级状态机契约（degraded vs failed）

> **2026-11-09 入口恢复（M57.1）**：report-only 路由 `SandboxExecutor`；fix / fix-and-pr 策略降级 `ContainerExecutor` + `degradedReason.code=sandbox_fix_requires_egress_policy`。以下 A/B 契约对 report-only 生效。
>
> **2026-11-13 M59.1：fix / fix-and-pr 在沙箱内执行**（审计事件类型：策略缺失与 clone host 未命中白名单都记 `sandbox_egress_blocked`，与「启动降级」的 `sandbox_degraded` 区分；两者都只落库不通知。注意 `notificationSuppressed` 只抑制环境事件，业务失败通知仍按 run 终态发送）（clone 基地址可经 `SANDBOX_CLONE_BASE_URL` 指向企业镜像 / 自建 Git；仅 https + `github.com` 源注入凭据头，其它源匿名 clone；clone host 必须命中出站白名单，否则 `sandbox_clone_host_not_allowed`）：出站策略就位时（`DEPENDFIX_NETWORK_AUDIT` 未关闭且白名单非空）沙箱在容器内完成 clone → 安装 → 修复 → 验证，不再降级 container；仅 daemon 启动不可用仍降级（A 场景，`sandbox_unavailable`）。第二道闸保留拒绝分支：审计关闭或白名单被显式清空时，fix 返回 `sandbox_fix_requires_egress_policy` 且**不 clone**。容器内 clone 源由平台构造（默认 `github.com`，可经 `SANDBOX_CLONE_BASE_URL` 指向镜像 / 自建 Git；其 host 必须命中出站白名单，否则 `sandbox_clone_host_not_allowed`），审计面从 CLI 启动后覆盖安装 / 验证 / 修复命令（运行级审计代理，见 [run-conclusion-semantics.md](./run-conclusion-semantics.md) 与 `runners/egress-audit.ts`）；非白名单外联记为 `networkViolations`，运行出口码不得为 0。
>
> **状态**：🔶 M11 阶段登记（2026-08-20），T1005-C 实施中。**背景**：sandbox 路由在「启动时不可用」与「运行时不可用」两种场景下的语义边界——前者是**配置偏离**（业务完整），后者是**真实异常**（业务未完成）。统一归为 `failed` 会丢失降级路径的成功信息，统一归为 `degraded` 会掩盖运行时异常，故引入独立状态分流。

#### 7.8.1 两种降级场景的语义边界

| 场景 | 触发条件 | 业务结果 | 状态 | UI 严重度 |
|:--|:--|:--|:--|:--|
| **A. 启动时降级**（配置偏离） | `executorKind === 'sandbox'` + `sandbox.isAvailable() === false` | ✅ ContainerExecutor 跑成功，summaryJson / runUrl 完整 | **`degraded`** | **info**（蓝色提示） |
| **B. 运行时降级**（环境异常） | `executorKind === 'sandbox'` + `sandbox.isAvailable() === true` + `sandbox.execute()` 内部抛 errno | ❌ 不降级避免掩盖真实错误，result 为 undefined | **`failed`**（`error.code = 'sandbox_unavailable'`） | **warn**（黄色告警） |

**核心区别**：

- `failed` = 「你让我做的事，没做成」（业务结果为空）
- `degraded` = 「你让我做的事，做成了，但走的路不是你想要的那条」（业务结果完整，仅路径偏离）

**为什么 B 场景不静默降级回 ContainerExecutor？** ——避免掩盖「环境容器中途变化」的真实异常。降级会让管理员错过 docker daemon / cgroup / user namespace 状态变化的告警信号，违背 sandbox 治理的「环境异常必须可观测」原则。

#### 7.8.2 状态机决策函数契约

`scan-run-state.ts` 的 `resolveScanRunState` 在原签名基础上新增 `degradedReason?` 参数：

```typescript
export const resolveScanRunState = (
    executorKind: 'container' | 'github-action' | 'sandbox',
    error: { code: string, message: string } | undefined,
    result: RunResult | undefined,
    /** A 场景降级信号（仅 sandbox 路由启动时不可用触发） */
    degradedReason?: { code: string, message: string },
): ScanRunStateDecision
```

`ScanRunStateDecision.status` union 新增 `'degraded'`：

```typescript
export interface ScanRunStateDecision {
    status: 'completed' | 'failed' | 'dispatched' | 'degraded'
    errorJson?: { code: string, message: string } | null
}
```

A 模式块新增分支（必须在 `pr_creation_failed` 分支之后、其他错误分支之前）：

```typescript
// A 模式块：启动时降级 → degraded（业务完整 + 路径偏离）
if (result && degradedReason) {
    return { status: 'degraded', errorJson: degradedReason }
}
// 其他错误（含 sandbox_unavailable 运行时失败）→ failed
if (error && !result) {
    return { status: 'failed' }
}
```

#### 7.8.3 orchestrator 降级信号传递

> **当前实现（2026-11-13 起）**：report-only 与 fix / fix-and-pr 均走 `SandboxExecutor`（启动可用执行；不可用则降级并记 `sandbox_unavailable`）；出站策略缺失由执行器第二道闸拒绝。以下代码为 sandbox 路由块形态。

`scan-orchestrator.service.ts` 在 sandbox 路由块维护 `degradedReason` 内部变量：

```typescript
if (executorKind === 'sandbox') {
    let degradedReason: { code: string, message: string } | undefined
    const sandbox = new SandboxExecutor({ ... })
    if (await sandbox.isAvailable()) {
        // 启动可用 → 走 sandbox（可能 B 场景：execute 抛 errno → catch → sandbox_unavailable）
        const execResult = await sandbox.execute(ctx)
        result = execResult.result
        error = execResult.error
    } else {
        // A 场景：启动时降级 → 记录降级原因 + 走 ContainerExecutor
        degradedReason = {
            code: 'sandbox_unavailable',
            message: '沙箱执行器启动时不可用（无 rootless daemon / user namespace 受限），已自动降级到平台容器',
        }
        const executor = new ContainerExecutor({ ... })
        const execResult = await executor.execute(ctx)
        result = execResult.result
        error = execResult.error
        runUrl = execResult.runUrl ?? null
    }
    // 状态机决策透传 degradedReason
    const decision = resolveScanRunState(executorKind, error, result, degradedReason)
    // 新增 degraded 分支写 errorJson + summaryJson + runUrl
}
```

#### 7.8.4 ScanRun 状态机扩展

`ScanRunStatus` enum 新增 `'degraded'` 终态（与 `completed` / `failed` / `dispatched` 并列）：

| 状态 | 业务结果 | 落库字段 | UI 严重度 | 聚合计入 |
|:--|:--|:--|:--|:--|
| `completed` | 完整 | summaryJson + runUrl | success | completedCount + alertsTotal + fixedCount |
| `dispatched` | 主要副作用已落库 | runUrl + errorJson | info | finishedCount |
| **`degraded`** | 完整（路径偏离） | summaryJson + runUrl + errorJson（sandbox_unavailable 降级原因） | **info**（蓝色） | **degradedCount**（独立计）+ alertsTotal + fixedCount |
| `failed` | 空 | errorJson | danger（红） | failedCount |

**关键设计决策**：

- `degraded` 的 ScanResult 参与 severityCounts 统计（业务结果完整，与 `completed` 等价口径）
- `batch-aggregate.ts` 新增 `degradedCount` 字段，与 `failedCount` 独立计数
- `TERMINAL_STATUSES` 加入 `'degraded'`（聚合判定「终态」）

#### 7.8.5 已知 backlog

- **环境容器变化告警**（已登记 backlog，未实施）：B 场景（运行时失败）当前仅 UI warn 提示 + 平台日志 stderr；未来若引入 audit log 设计 + 通知渠道（邮件 / Slack / Webhook），可推送「沙箱执行器运行时不可用」告警给管理员。当前阶段仅 stderr + UI 提示，登记 backlog 详见 [backlog.md §C-ENV-CHANGE-ALERT](../../plan/backlog.md)。

---

### 7.9 执行资源采集（M59.4，2026-11-14）

三类执行器的资源口径统一为 `ExecutorResourceUsage`（`null` 一律表示不可采集，不写 0）：

| 执行器 | 采集方式 | 字段口径 |
|:--|:--|:--|
| container | 平台进程内 cgroup 采样（`startResourceMonitor`） | 既有实现不变；未预期抛错也返回执行窗口快照 |
| sandbox | 容器内 `sh` 后台采样自身 cgroup（200ms；v2 `memory.current/max/events`、v1 `memory.usage_in_bytes/limit_in_bytes/oom_control`），窗口覆盖容器内 clone + CLI | `memoryMaxBytes` / `peakRssBytes` 必采；`oomKilled` 用前后计数差；任一项不可读 → null + `degradedReason`（含 `oom_kill counter unavailable`） |
| github-action | 不采集（执行发生在目标仓库 workflow） | 显式 `{ source: 'none', degradedReason }`，UI / 导出不显示为 0 |

实现要点：

- 采样器与 CLI 共用同一 `sh -c`，脚本以换行分隔（后台采样器以 `&` 结尾，`;` 拼接会形成 `& ;` 语法错误）。
- 读数经独立哨兵（`__DEPENDFIX_RESOURCE_JSON_*`）回传，解析后从执行日志中剥离；哨兵缺失 / 非 JSON 按 unavailable 处理，**不影响主结果解析与退出码**。
- 上限为 v1 unlimited 哨兵（≥ 9223372036854771712）或 v2 `max` 时落 `null` + `limitReason=unlimited`；文件缺失 / 空值 → `null` 且不带原因（未知 ≠ 无上限）。
- bootstrap 失败（clone / `cd`）也先停采样并回传读数再以原退出码结束（结果哨兵缺失仍按「未回传显式结果」处理）。
- 超时 / 异常 / 容器整体 OOM 被杀：采样器随容器终止，无法回传 → 平台写 `unavailable` + 原因（sandbox 侧无法像 container 那样保留进程内快照，属设计边界）。
- 采样停止后才回传（`touch` 停止标记 + `wait`），CLI 退出码先于停止标记保存。

## 8. A 模式 push + PR 推送机制

> 状态：✅ 设计落盘（C53，2026-08-20 实施）——A 模式（`ContainerExecutor`）fix / fix-and-pr 完成后新增推送修复分支到远程 + 创建 PR 两条链路，落盘 commit `83ec736` / `46b7c15` / `3ed8303`。
>
> **2026-09-04 修订（M25 事故修复）**：C53 原始设计假定 `app.run()` 内部只做本地修复 + commit，push / PR 由平台承担。但实际上引擎的 `fix-and-pr` 模式自带 `createFixBranch → pushBranch → createPullRequest` 完整链路，且 `pushBranch` 走裸 `git push` 不带凭据——容器内 `git -c http.extraheader=... clone` 也不会把 extraheader 写入 .git/config（实测 `git -c` 是 git 级 flag，非 clone 子命令），导致 push 必然缺凭据失败。
>
> 修复后：引擎降级为 `mode: 'fix' + commit: true`（仅本地修复+commit），push + PR 全部走平台 [platform-delivery] 模块，保留引擎的 dedup / supersede 决策。**该降级仅适用于 fix / fix-and-pr**：report-only 为只读扫描，不 clone、不降级、`commit: false`（`isReportOnly` 同时驱动 clone 判定与引擎 config 覆写，二者必须同源——2026-10-11 生产实证「只跳过 clone 却仍强制 commit」会在空 workDir 上 commit → `fatal: not in a git directory` → `COMMIT_FAILED`）。详细根因与方案见 [archive/todo-archive-phases-m25.md §M25](https://github.com/dependfix/dependfix/blob/master/docs/plan/archive/todo-archive-phases-m25.md)（M25 已 2026-09-08 归档）。

### 8.1 流程变更（C53 → M25 修复后差异）

**C53 阶段（修复前）**：

```
ContainerExecutor.execute()
  ↓
  fix-and-pr 模式 + app.run() 成功（exitCode === 0）
  ↓
  [引擎内部] createFixBranch + pushBranch + createPullRequest  ← 推 push 必然失败（容器无凭据）
  ↓
  平台 fallback: pushFixBranch(branch, workDir, token)  ← exitCode≠0 整段被跳过
  ↓
  status = completed（误报）
```

**M25 阶段（修复后）**：

```
ContainerExecutor.execute()
  ↓
  clone + preRunHead = rev-parse HEAD
  ↓
  app.run() in mode='fix' + commit=true        ← 引擎仅做本地修复+commit
  ↓
  hasNewCommit = (postRunHead !== preRunHead)  ← 严格判定（no-op 扫描不产生空 push）
  ↓
  fix 模式：pushFixBranch(current branch, workDir, token)  → runUrl = branch URL
  ↓
  fix-and-pr 模式：
    ├─ planFixAndPrDelivery(octokit, ...)  ← 复用引擎 computeFixFingerprint + findDependfixOpenPR + computeFixAndPrPlan
    │   ├─ skip: 同指纹 PR 已存在 → runUrl = existing PR URL（幂等交付）
    │   └─ create: 推进 push + create + close supersede
    ↓
    createFixBranch(plan.branchName, workDir)
    ↓
    pushFixBranchWithCredential(plan.branchName, workDir, token)  ← http.extraheader 注入 token
    ↓
    createPullRequest(...) → runUrl = PR.htmlUrl
    ↓
    closeSupersededPRs(...)  ← best-effort；失败仅 warn
    ↓
    失败兜底（结构化 PlatformDeliveryError）：
      ├─ push_failed: failed + workDir 立即清理
      └─ pr_creation_failed: dispatched + workDir 保留 24h 供诊断
```

### 8.2 状态机扩展（与 B 模式 `dispatched` 语义对齐 + M25 引擎交付类识别）

C53 引入 A 模式 `dispatched` 三分支（`scan-run-state.ts`），M25 新增引擎交付类 category 识别：

| 场景 | error.code | result.errors category | status | runUrl | workDir 处理 |
|:--|:--|:--|:--|:--|:--|
| 修复成功 + push 成功 + PR 成功 | — | — | `completed` | PR URL | finally 立即清理 |
| 修复成功 + push 成功 + PR 失败 | `pr_creation_failed` | — | `dispatched` | branch URL（兜底） | moveToPending 保留 24h |
| 修复成功 + push 失败 | `push_failed` | — | `failed` | null | finally 立即清理 |
| 引擎内部交付失败（commit / verify / rollback / FATAL） | `engine_delivery_failed` | `COMMIT_FAILED` / `VERIFICATION_FAILED` / `ROLLBACK_FAILED` / `FATAL` | `failed` | null | finally 立即清理 |
| 引擎进程级 exitCode=2 + result 存在 | `engine_exit_2` | — | `failed` | null | finally 立即清理 |
| 修复成功 + 修复动作执行失败 | `execution_failed` | — | `failed` | null | finally 立即清理 |
| 执行超时 | `execution_timeout` | — | `failed` | null | finally 立即清理 |
| report-only | — | — | `completed` | null | finally 立即清理 |

错误码 `pr_creation_failed` 命名与 B 模式已有的 `result_fetch_failed` / `run_url_not_resolved` 对齐——表达"副作用已落库（分支已推）+ 最终操作未完成"。
错误码 `engine_delivery_failed` 是 M25 新增的进程内识别——引擎在 `fix` / `fix-and-pr` 流程走到交付阶段失败（commit / PR / verify / rollback / FATAL），result 仍可能存在（部分仓库成功 + 部分失败）但**远程未完整落地**。原行为 result 存在即 `completed` 会让"已修复 8 但无 PR"误报（见 2026-09-04 03:28 AM 事故）。

**环境性安装失败不归因（2026-10-13）**：容器内 `pnpm install` 环境性失败（无 stderr 诊断：被信号杀死 / 超时 / 静默非零退出）由引擎标记为 `FixAction.environmentalFailure` + `ENVIRONMENT_ERROR`（不归因本次运行），`computeExitCode` 不计入失败动作——故「零告警 + 环境性安装失败 + 既有基线失败」不再被误判 exit 2 → `engine_exit_2`（"所有仓库失败或全量回滚"）。口径见 [dependency-fixer.md](../modules/dependency-fixer-records.md) 与 [pnpm-lockfile-fixer.md §2.4](../modules/pnpm-lockfile-fixer.md)。

### 8.3 关键代码点

| 函数 / 模块 | 位置 | 职责 |
|:--|:--|:--|
| `extractBranchName(workDir)` | `container-executor.ts` | 读 `git rev-parse --abbrev-ref HEAD`；detached HEAD 抛错（仅 fix 模式推默认分支时使用） |
| `pushFixBranch(branch, workDir, token?)` | `container-executor.ts` | `git push origin <branch>`，token 走 `http.extraheader`（base64 basic auth），避免进 argv/URL（仅 fix 模式使用） |
| `createFixBranch(branchName, workDir)` | `@dependfix/engine` | `git checkout -b` 创建/切换修复分支（fix-and-pr 模式从 HEAD 拉新分支，引擎导出复用） |
| `readHeadSha(workDir)` | `container-executor.ts` | 读 `git rev-parse HEAD`，返回 SHA 或 null（用于 hasNewCommit 判定） |
| `checkHasNewCommit(workDir, preRunHead)` | `container-executor.ts` | 比较修复前后 HEAD SHA，引擎 commit 后才返回 true |
| `isReportOnly` + 引擎 config 覆写 | `container-executor.ts` | 模式 / commit 覆写的**单一事实源**：report-only 只读（不 clone、不降级、`commit: false`）；fix / fix-and-pr 降级为 `mode:'fix' + commit:true`（平台接管 push / PR）。clone 判定与 config 覆写必须同源（错配 → 空 workDir 上 commit → `COMMIT_FAILED`） |
| **platform-delivery 模块** | `executor/platform-delivery.ts` | **M25 新增**：平台侧 fix-and-pr 完整交付单元（plan / push / create / close supersede） |
| `planFixAndPrDelivery(octokit, owner, repo, result)` | `platform-delivery.ts` | 复用引擎 `computeFixFingerprint` + `findDependfixOpenPR` + `computeFixAndPrPlan`，返回 skip / create 决策 |
| `pushFixBranchWithCredential(branch, workDir, token)` | `platform-delivery.ts` | 与 `pushFixBranch` 等价，独立导出便于单测；失败抛 `PlatformDeliveryError(push_failed)` |
| `deliverFixAndPr(ctx)` | `platform-delivery.ts` | 编排 push + create + close supersede；失败抛 `PlatformDeliveryError(pr_creation_failed / supersede_failed)` |
| `PlatformDeliveryError` | `platform-delivery.ts` | 带 `code` + `branchPushed` 状态的结构化错误（区分 push_failed vs pr_creation_failed） |
| `moveToPending(workDir, runId, pendingRoot, retentionMs)` | `container-executor.ts` | 移动 workDir 到 `_pending/{runId}/` + 写 `.meta.json`（含 `expiresAt`） |
| `cleanupRemoteBranch(branch, workDir, token?)` | `container-executor.ts` | best-effort 远程分支清理；当前 **不主动调用**（保留远程分支供用户手动开 PR） |

### 8.4 凭据权限阶（重要安全考量）

C53 引入 A 模式 `fix-and-pr` 链路完成的关键代价是 **凭据权限面扩大**：

| 模式 | 所需 Token 权限 |
|:--|:--|
| A 模式 report-only | `security-events: read`（拉告警） |
| A 模式 fix（仅 commit） | `contents: write`（push 到默认分支 / 修复分支） |
| A 模式 fix-and-pr | `contents: write` + `pull-requests: write`（开 PR） |
| **B 模式**（GitHub Action） | **`actions: read + write`**（仅触发 workflow + 拉结果） |

**A 模式 fix-and-pr 要求 wide-scope PAT**（classic PAT 勾选 `repo` 或 fine-grained PAT 显式授权 `Contents: write` + `Pull requests: write`），与 B 模式的窄权限形成鲜明对比。

**安全优势（M25 修复后）**：
- 修复前：引擎在容器内裸 `git push` 无凭据 → 失败 + workDir 保留 24h（含 .git/config 未持久化 extraheader，但其他 token 落盘风险存在）
- 修复后：平台 `pushFixBranchWithCredential` 走 `git -c http.extraheader=...` 一次性注入，**token 不写 .git/config**；即使 pr_creation_failed workDir 保留 24h，**无 token 落盘**

**安全建议**：
- **默认推荐 B 模式**（目标仓库已配置 action 时，自动降级为 `actions: read + write`，权限面最窄）
- A 模式 fix-and-pr 适用于"自托管平台 + 强可控 PAT"场景（如专用 CI 账户）
- 平台 UI 触发时显式提示当前所选凭据的权限范围（待 C28 设计落地）

完整凭据安全条款见 [security.md §5.3 修复执行安全](../../standards/security.md#_5-依赖与供应链安全-dependency-supply-chain-security)（凭据基线 + 权限阶）。

### 8.5 后续 backlog（依赖追踪）

- **stale-cleanup 任务**：moveToPending 写入的 `_pending/{runId}/` 当前无定时清理机制；登记后续阶段（M11 后段或 M12），按 `.meta.json` 的 `expiresAt` 字段扫描删除
- **`sanitizeErrorMessage` 补充 `Authorization: token xxx` 模式**：当前实现不覆盖 GitHub REST API 实际形态；C53-2 RG-W2 登记后续 patch
- **A 模式 dispatched UI 提示**：用户看到 dispatched 状态需明确"PR 创建失败，分支已推，可手动开 PR"——当前 UI 通用 dispatched 提示，需后续优化
- **录入 M11 阶段**：C53 + T1005 sandbox 路由 + C28 security.md 凭据设计 共同组成 M11（业务可见性 + 沙箱落地 + 安全文档）阶段
### 8.6 沙箱自包含交付（M59.2，2026-11-14）

沙箱没有平台侧 workDir，A 模式的「引擎只 commit、平台 push」不成立。M59.2 起沙箱路径的交付在执行进程内完成：

| 模式 | 容器内动作 | 结果契约（`RunResult.delivery`） |
|:--|:--|:--|
| `fix`（`https://github.com` 源） | `--commit --push`：修复 → 本地提交 → 推送当前分支 | `{ deliveredBy: 'engine', status: 'pushed', branch, commitSha }`（无新提交 → `status: 'none'`） |
| `fix`（其它 clone 源） | 只 `--commit`：无 push 凭据，**不推送** | `{ deliveredBy: 'platform', status: 'none' }` → 沙箱路径无人接管，视为未交付（需改用 `fix-and-pr` 或 GitHub 源） |
| `fix-and-pr` | 引擎自带 `createFixBranch → commit → push → createPullRequest` | 推送后 `pushed`；PR 建成或复用 `status: 'pr-created'` + `prUrl` / `prNumber` |
| container（对照） | 引擎只 commit | `{ deliveredBy: 'platform', status: 'none' }`，平台接管 push / PR |

关键约束：

- **凭据**：容器内 `git config --local credential.helper` 注入只读 env 的 helper（token 不落 `.git/config`），仅 `https://github.com` 源启用；`fix` 与 `fix-and-pr` 共用同一 token。
- **平台映射**：执行器按 `delivery` 映射 `runUrl` / `prNumber`（PR 地址或分支页），平台不再二次 push / 建 PR；`shouldPlatformDeliver()` 守卫容器路径，正向（`deliveredBy=platform` / 无记录）与反向（`pushed` / `pr-created`）都有用例。
- **失败副作用**：分支已推但 PR 失败 / 取消时，平台按结果声明的 `branch` 清理 **仅 `dependfix/` 前缀**分支（默认分支直推不在范围），删除成功 / 失败 / 跳过（无凭据、越界）都落 `delivery_branch_cleanup` 审计事件。push 失败（受保护默认分支 / 凭据失效 / 网络）以 `PUSH_FAILED` 进入状态机交付失败白名单 → 运行判 `failed`（不再静默完成）；失败 run 不落 `runUrl`（避免指向已清理或不存在的分支）。
- **落库与披露**：`summaryJson.delivery` 携带 status / deliveredBy / branch / commitSha（不新增 DB 列），运行详情「交付」项展示 `branch @ shortSha`。


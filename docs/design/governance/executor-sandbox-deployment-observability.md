# Sandbox 执行器：部署预留与运行观测（executor-sandbox-implementation.md §7.5 / §7.9-§7.10）

> 本分片自 [executor-sandbox-implementation.md](./executor-sandbox-implementation.md) 按连续尾部章节迁出（章节编号全局唯一、跨文件稳定）。

### 7.5 K8s + Helm 部署预留（非 M10 范围）

> 状态：🔶 backlogging，待真实 K8s 部署需求出现时评估（用户 2026-08-19 决策："仅做规划，等真有需求时再实现"）。
>
> **触发条件**：
> 1. 真实多租户/企业部署需要 K8s 编排
> 2. 至少 1 个外部用户提出 K8s 部署请求
> 3. dependfix 1.0.0 正式发布前后纳入发行矩阵

**预留接口**：`SandboxRuntimeAdapter` 抽象兼容 K8s（通过 Kubernetes RuntimeClass + Pod sandbox securityContext 实现，无需 runc/dockerd 依赖）。`Repository.executorKind='sandbox'` 在 K8s 场景下走 `KubernetesRuntimeAdapter`（未来 TBD），接口签名保持 §7.1 不变。

**Helm Chart** 留 backlog：需 `values.yaml`（sandbox resource limits 默认 / RBAC 不挂 docker.sock / PodSecurityContext 非 root）/ `templates/deployment.yaml`（rootless daemon sidecar）/ `templates/servicemonitor.yaml`（[sandbox-security-governance.md §7 验收持续治理](./sandbox-security-governance.md#_7-验收与持续治理)）。

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

### 7.10 可用性自检与降级原因（M60.4，2026-11-15）

**端点**：`GET /api/sandbox/self-check`（admin / org_admin，只读）。返回：

- daemon 可用性 + 结构化原因（`docker_cli_missing` / `daemon_unreachable` / `socket_permission_denied` / `daemon_timeout` / `runtime_error`）+ `detail` + `serverVersion`；
- 平台侧镜像候选与该镜像**本地是否存在**（`docker image inspect`，不拉取）；
- 出站白名单主机概览（`enabled` / `allowlist` / `fixRequiresEgress`）与支持的执行模式。

**边界**：不返回 token / 凭据 / 完整 URL；不拉镜像、不起容器。

**降级原因**：编排层在 `isAvailable()` 失败时用同一探测结果生成 `sandbox_unavailable` 的 message
（原因 + detail + 自动降级说明），落 `errorJson`；运行详情对 `degraded + sandbox_unavailable` 展示
原因横幅与排障文档链接（`run-detail-dialog` 与 `repo-history-dialog` 两处入口同口径）。

**部署开关**：平台镜像 `WITH_DOCKER_CLI=false`（默认不安装 docker CLI）；opt-in 构建
`--build-arg WITH_DOCKER_CLI=true`，并叠加 `docker-compose.sandbox.yml`（`--profile sandbox`）
只挂载 rootless socket（`/run/user/<uid>/docker.sock`）。**禁止**宿主 `/var/run/docker.sock`，
安全边界见 [security.md §5.3](../../standards/security.md)。

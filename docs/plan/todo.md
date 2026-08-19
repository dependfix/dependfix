# 当前阶段任务

> **M10 独立沙箱容器 C26 实施规划（P1 进行中，2026-08-19 启动）**：依赖 T702 / T802 / T805 / C38 / C45 全部前置已落地；决策会议结论（Docker rootless runtime + 应用层白名单代理 + cgroup v2 双层；`SandboxRuntimeAdapter` 不强绑定 rootless；`SandboxExecutor` 与 `ContainerExecutor` 并存；自托管 docker-compose 优先 / K8s+Helm 仅规划）已登记。完整拆解见下方 M10 区块
>
> **T912 SMTP 邮件发送器（主体完成 + T912-3 待排，2026-08-18 启动 / 2026-08-19 主体收口）**：[backlog §M7.1 触发条件达成](backlog.md#m71-认证与用户体系)，引入 `nodemailer` 统一实现 better-auth 三处邮件回调（**T912-1 mailer service 模块** commit `edc9c94` + **T912-2 三回调接线** commit `6f00937` + **T912 coverage 回归修复** commit `6e28207` 已收口；**T912-3 安全与文档 + 与 C28 联动待排期**，由下方 §待评估候选 P2 C28 / 「branches 阈值恢复 80% 冲刺」承接）。完整拆解见下方 T912 区块
>
> **C51 扫描历史 Dialog 应用层修复（2026-08-19 完成）**：unrouting 0.2.x 兼容 bug 改用 Dialog + query 承载，提交 `b067b3a`（chore: gitignore .env 忽略）+ `2102894`（fix(platform)...）+ `0b9411b`（docs(plan) backlog C46-C53 登记）；方案对比 e2e 跑通；review gate **Pass**（warning 级 UX 建议留待 backlog 后续）
>
> **PR1-PR3 平台可用性修复批次（2026-08-19 排期启动，2026-08-20 之前 PR1 优先）**：源自 C46-C53 评估（[backlog §M6 平台可选项](backlog.md#m6-平台能力深化)）；PR1 立刻修 `C47`+`C48` 防御性小修；PR2 修 `C52` 单仓库模式；PR3 批量导入集 `C46`+`C49`+`C50` 同 PR 收口。完整拆解见下方 PR1/PR2/PR3 区块。`C53` 平台 fix 推送 PR 后置候选 M11 评估（需方案设计）
>
> **近期归档（M6 / M7 / M8 / M9 / T711 全部完成）**：完整记录见 [todo-archive.md](todo-archive.md)（最近主窗口段：[§M8](todo-archive.md#m8-安全加固与容器执行完备已归档)、[§M9](todo-archive.md#m9-i18n-基建同步已归档)、[§T711](todo-archive.md#t711-覆盖率口径修正--冲刺至-80已归档)）
>
> **T705 / T703 已延期（2026-08-12 用户指示）**：生产级部署（PostgreSQL/Helm/Sentry）与跨平台 Git（GitLab/Bitbucket）暂缓排期，详见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)

---

## M10: 独立沙箱容器 C26 实施规划（2026-08-19 启动）

- 优先级：`P1`（[backlog §沙箱与恶意依赖防护治理登记](backlog.md#沙箱与恶意依赖防护治理登记-2026-08-14-安全专项评估) G5：BullMQ 并发后恶意仓库 A 的脚本可读仓库 B 的工作目录与环境——随 T702 并发落地变为现实）
- 背景：2026-08-14 安全专项评估（[sandbox-security-governance.md](../design/governance/sandbox-security-governance.md)）G5 升级登记，依赖项 T702/T802/T805/C38/C45 全部已落地。2026-08-19 决策会议完成三个外部前置（一手调研数据见 [§M10 调研依据](#m10-调研依据)，所有 GitHub 项目数据由 super-search 抓取的一手页面核实）。

### M10 决策会议结论（2026-08-19）

| 决策项 | 选项 | 结论 | 依据 |
|:--|:--|:--|:--|
| **Q1 Runtime** | A. Docker rootless / B. Sysbox / C. Kata+gVisor | **A，抽象预留**——选 Docker rootless mode 作为当前实现，但 Executor 抽象不与 rootless 强绑定（接口契约按 OCI runtime 兼容设计，未来切 Sysbox 仅切换启动参数 `--runtime=sysbox-runc` 而非改业务代码） | [Docker 官方 rootless 文档](https://docs.docker.com/engine/security/rootless/)（2026-06 更新）；当前需求下 KVM 不可得 + 性能损耗；过度设计预案禁止 |
| **Q2 镜像策略** | A. 复用平台镜像 / B. 极简镜像 | **A**——直接复用 `apps/platform/Dockerfile` runtime 阶段（git/pnpm 已就位，T801 落地），避免维护双镜像 |
| **Q3 部署形态** | A. 自托管 docker-compose / B. K8s+Helm / C. 双形态 | **A + B 规划预留**——仅交付自托管路径（与现有 `apps/platform/docker-compose.yml` 对齐）；K8s+Helm 仅在设计文档与本任务"非目标"登记，后续真有需求时排期 |
| **Q4 白名单范围** | A. 仅 registry + GitHub API / B. 含镜像 / C. 自定义 | **A**——默认 `*.npmjs.org / registry.npmjs.org / api.github.com / github.com / objects.githubusercontent.com / raw.githubusercontent.com`；用户可通过 `ALLOWED_DOMAINS` env 临时扩展（不做用户级 UI 录入，对应规则在 [execution.sandbox 文档](../design/governance/executor-sandbox.md#7-sandbox-执行器设计) §7 列举） |
| **Q5 cgroup 资源默认值** | A. 固定 / B. 仓库级 / C. 自动 | **B**——`Repository.sandboxLimits` JSON 字段（可选），缺省值在平台配置 `SANDBOX_DEFAULT_MEMORY_MB=2048` / `SANDBOX_DEFAULT_CPU=1.0` 提供；用户运行时可逐仓库改 |
| **Q6 旧路径处理** | A. 替换 / B. 保留默认 / C. 并存 | **C 并存**——`SandboxExecutor` 与 `ContainerExecutor` 同时注册；默认仍走 `ContainerExecutor`（向后兼容，无 Docker 守护进程场景），用户/管理员显式配置 `Repository.executorKind='sandbox'` 触发新路径；CLI 启动时探测 Docker daemon 可用性，提示并自动建议切换 |

### M10 调研依据

> 数据来源：super-search skill 调研（2026-08-19），每个 GitHub 项目数据均出自该项目一手 repo 页面（非 web 搜索 snippet），多源交叉验证后采纳结论。

**Runtime 维度**（一手仓库数据：stars / license / 状态）

- Docker rootless mode（官方）：[docs.docker.com/engine/security/rootless](https://docs.docker.com/engine/security/rootless/)（最后更新 2026-06）—— Docker 原生，user-namespace + 无额外依赖
- [nestybox/sysbox](https://github.com/nestybox/sysbox)（3.7k stars / Apache-2.0 / 活跃，Docker 子公司赞助）—— 强化 user-namespace 隔离但需装第三方包
- [google/gvisor](https://github.com/google/gvisor)（18.6k stars / Apache-2.0 / 267 tags / 活跃）—— 无 KVM 依赖但 syscall 模拟对 pnpm 脚本有性能损耗
- [firecracker-microvm/firecracker](https://github.com/firecracker-microvm/firecracker)（35k stars / Apache-2.0 / AWS Lambda 生产验证）—— microVM，需 KVM
- [GoogleContainerTools/kaniko](https://github.com/GoogleContainerTools/kaniko)（15.8k stars / Apache-2.0 / **archived 2025-06-03**）—— 仅 build 不 spawn runtime，已弃用
- Kata Containers（[katacontainers.io](https://katacontainers.io/)，OpenInfra Foundation 托管）—— microVM，需宿主 `/dev/kvm`
- **绝对反模式**：[DinD with `--privileged`](https://blog.nestybox.com/2019/09/14/dind.html) 与 [挂 `/var/run/docker.sock`（DoD）](https://www.wiz.io/academy/container-security/container-escape) 均违反 [sandbox-security-governance.md §3 路径 D](../design/governance/sandbox-security-governance.md)（CVE-2019-5736 runc 逃逸实证）

**网络白名单维度**（一手出处）

- [Ken Muse 2025-10 blog](https://www.kenmuse.com/blog/restricting-ip-access-on-github-hosted-runners/)：iptables 在容器场景需 `NET_ADMIN` cap（破坏 §3 安全基线），且 DoH 可绕过 53 端口限制
- [Wiz Academy container-escape](https://www.wiz.io/academy/container-escape)：eBPF/CNI 类方案需特权容器或 K8s 形态
- T805 现成基础设施（参考 M8 阶段 §T805 实施记录 [todo-archive.md §M8 / T805](todo-archive.md#t805-执行期外联审计日志--c40-p1-) 的 `packages/engine/src/runners/network-audit.ts`）—— 改造为白名单拦截代理（deny-by-default）是改动量最小、与现有审计代理一脉相承的路径

**cgroup 维度**（一手出处）

- [Kubernetes docs cgroup v2](https://kubernetes.io/docs/concepts/architecture/cgroups/) + [Red Hat 2025-10](https://developers.redhat.com/articles/2025/10/10/nodejs-20-memory-management-containers)：Node.js 20+ 通过 libuv 自动读 cgroup v2 memory.max，V8 堆自适应 `--max-old-space-size`
- [nodejs/node #52478](https://github.com/nodejs/node/issues/52478)：libuv 在某些 cgroup v2 拓扑下检测失败，需谨慎验证
- [Anthropic claude-code #4953](https://github.com/anthropics/claude-code/issues/4953)：systemd cgroup MemoryMax 是唯一可靠的硬性 OOM 限——印证写 cgroup 文件的必要性（Node 自身限制不覆盖 native/Buffer/async）

### M10 任务拆解（按依赖与优先级）

| 任务 | 治理项 | 优先级 | 内容 | 验收要点 |
|:--|:--|:--|:--|:--|
| **T1001 Sandbox 执行器与 Docker rootless 适配** | G5 | P1 | `apps/platform/server/services/executor/sandbox-executor.ts` 新建；复用 [executor-sandbox.md §3 Executor 接口契约](../design/governance/executor-sandbox.md#3-executor-接口契约) — `kind: 'sandbox'`；通过 OCI runtime 配置项接 Docker rootless（当前 `--user=100:100 --memory=2g --cpus=1.0`，未来切 Sysbox 仅改 `--runtime=`）；Repository 实体新增 `executorKind` 路由字段（与现有 `container/github-action` 同构，复用 `scan-orchestrator.service.ts` 中的 `resolveExecutorKind` 决策点）；Executor 抽象新增 `RuntimeAdapter` 形态（防强绑定 Docker rootless） | ✅ 单元测试：kind 路由 / workDir bind-mount / 用户态 pid map / cgroup v2 限额透传；docker host 不可用时降级回 `ContainerExecutor` + 启动提示；与现有 `ContainerExecutor` 并存通过 `executorKind` 字段配置（默认 `container`，单实例单仓库场景不破坏）；接口不留 `--runtime=` 字面常量（用 `SANDBOX_RUNTIME` 配置项） |
| **T1002 出站白名单拦截代理** | G3 收口 | P1 | `packages/engine/src/runners/network-audit.ts` 升级 — 现 T805 已实现 CONNECT 隧道审计代理，本任务扩展为白名单 deny-by-default；非白名单域名 502 + stderr 日志 + 归类 `network_violation`；保留 T805 "命令输出 URL 提取" 作为冗余（攻击者绕过 env 也被命中）；引入 `ALLOWED_DOMAINS` env 解析（默认 npm/github 范围）；新错误码 `network_violation` 进报告 error 区 | ✅ 单元测试：白名单命中放行 / 非白名单 502 / 自定义 env 生效；集成测试：恶意脚本 `curl evil.com` 时 stderr 含 violation + 报告 error 字段完整；回归：T805 原审计功能不退化 |
| **T1003 cgroup v2 资源限制** | G4 / G5 收口 | P1 | `packages/engine/src/runners/cgroup.ts` 新建 — Linux cgroup v2 写 memory.max + cpu.max + 进程迁移到子 cgroup（`dependfix/<runId>/`）+ 退出清理；OOM 事件（`memory.events`）监听 + 报告 `oom_killed` 错误码；macOS / Windows 跨平台 fallback（warning + 仅依赖 Node 自身 V8 限制）；与 T1001 配合透传 Repository.sandboxLimits | ✅ 单元测试：mock `/sys/fs/cgroup` 文件操作；集成测试：fork 子进程超 memory.max 触发 OOM + cgroup 清理 + 报告完整；跨平台测试：darwin / win32 no-op 路径；Node 20 自动识别集成实证（沙箱 Node heap 跟踪 cgroup.max） |
| **T1004 文档收口 + 治理决议更新** | G5 收口 | P2 | `executor-sandbox.md` 新增 §7 Sandbox 执行器设计；`sandbox-security-governance.md` §5 治理表 G5 行从 "提级 M7 前置" 升级为 "实施规划已就绪"（链接 todo M10 区块），§7 验收段补 M10 4 子任务验收方式；新部署形态追加 `quick-start.md`（docker rootless daemon 启动指引）+ `executor-sandbox.md §7` 写明 K8s+Helm 留 backlog | ✅ `pnpm run check:links` 零断链 / `pnpm run lint:md` 通过；规范单点声明：sandbox/security 基线只挂引用不抄条款（[documentation.md §4](../standards/documentation.md)）；C30 docker CI 链路不受影响 |

- 完成定义：T1001-T1004 全部交付，每项独立 Review Gate Pass + 分批提交；`pnpm lint` / `typecheck` / 单测（≥80% 覆盖率不破坏，T711 已达成）/ 集成测试（含 docker rootless daemon 真实起容器实证，不限于 mock）通过；旧 `ContainerExecutor` 路径不破坏（向后兼容）。
- 非目标（移交下一阶段 backlog）：
  - K8s + Helm Chart 部署（用户决策：等真实需求时排期）
  - `[Docker rootless → Sysbox]` 实际切换（接口预留，不实际实现）
  - 每仓库镜像变量（registry mirror 列表、用户级白名单 UI 录入）
  - Kata / gVisor / Firecracker 切换（性能过度/宿主 KVM 依赖，本项目威胁模型不需要）
- 关联：
  - **C26 现状登记**：[backlog.md §沙箱与恶意依赖防护治理登记](backlog.md#沙箱与恶意依赖防护治理登记-2026-08-14-安全专项评估) 升级 [backlog.md C26 条目](backlog.md) 已补 2026-08-19 决策
  - **C30 docker.yml 治理**：`Publish Docker` CI 链路不因本任务变更，rootless 模式仅影响执行侧（参见 [backlog.md C30](backlog.md#m6-最小平台-mvp) 现状登记）
  - **C44 review 检查点**：`code-quality-checklist.md` §5.3 已在 T806 挂接（[backlog.md C44](backlog.md) ✅ 已修复 2026-08-14），本任务提交时按 §5.3 必须级条款逐项核验（参见 [code-auditor.agent.md §Review Gate 必查项](../../.github/agents/code-auditor.agent.md)）

---

## T912: SMTP 邮件发送器统一实现（2026-08-18 启动）

- 优先级：`P2`（真实部署必需，不阻塞开发与功能主线；SMTP 未配置时降级 console.warn 不影响现有流程）
- 背景：M7.1 T701/T707 实施后 better-auth 配置了 `sendVerificationEmail` / `sendResetPassword` / `sendChangeEmailConfirmation` 三处回调钩子，**当前均为空实现**（仅 `console.warn` 日志）。`.env.example:15-20` 提供 SMTP_* 配置项，`nuxt.config.ts:81` `smtpEnabled: !!process.env.SMTP_HOST` 已有判定，但 SMTP 配置后邮件仍不实际发送——真实部署邮箱验证 / 密码重置 / 邮箱变更链路断裂。
- 来源：[backlog.md §M7.1 「邮件发送器统一实现」](backlog.md#m71-认证与用户体系)（2026-08-09 T701-3 审计登记），触发条件「引入邮件发送依赖（如 nodemailer）或 SMTP 配置成为真实部署需求时」已达成。
- 决策（2026-08-18 用户指示）：引入 `nodemailer`（Node.js 生态事实标准、零网络依赖、可纯 ESM 接入、better-auth 官方示例推荐）。
- 任务拆解（按依赖与优先级）：

| 任务 | 优先级 | 内容 | 验收要点 |
|:--|:--|:--|:--|
| **T912-1 nodemailer 接入 + mailer service** | P2 | `apps/platform/server/services/mailer/` 新建模块；封装 `nodemailer.createTransport`（基于 `runtimeConfig.smtp*`）+ `sendMail({ to, subject, html, text })` 统一接口；SMTP 未配置时降级 `console.warn` + 返回 `{ delivered: false, mode: 'noop' }`；错误隔离（catch → AppError 上报） | ✅ 单元测试覆盖：未配置 / 配置成功 / 配置失败 / 连接超时 4 路径 |
| **T912-2 三回调接线** | P2 | `server/utils/auth.ts` 三处 `sendVerificationEmail` / `sendResetPassword` / `sendChangeEmailConfirmation` 从空 console.warn 改为 `mailer.sendMail(...)`；模板走 i18n（zh-CN / en-US），支持最小渲染（链接 + 用户邮箱 + 过期提示）；保留 console.warn 降级但增加实测日志区分（`[mailer:noop]` / `[mailer:delivered]`） | ✅ 三回调集成测试覆盖；i18n locale 模板抽取；与现有 SMTP 配置开关兼容 |
| **T912-3 安全与文档** | P3 | 防滥用：SMTP 凭据（`SMTP_USER` / `SMTP_PASS`）仅从 `runtimeConfig` 读取不进前端 bundle；速率限制提示（注册验证邮件防刷，留钩子待 T913）；`docs/standards/security.md` §X.3 补「邮件发送安全」（最小暴露 + 失败 fail-closed）；`docs/standards/security.md` §凭据加密存储 章节合并入 C28 修复 | ✅ security.md 双章节补齐；C28 修复同步 |

- 完成定义：T912-1 ~ T912-3 全部交付，每项独立 Review Gate Pass + 分批提交；`pnpm lint` / `typecheck` / platform 单测（≥ 80% 覆盖率不破坏）/ 集成测试通过；SMTP 配置下可真实发送（开发用 MailHog / Mailtrap 实证）；SMTP 未配置降级路径不破坏既有流程。
- 非目标（移交 backlog）：模板引擎（直接 string template 而非 MJML/Handlebars）；批量发送（newsletter 类场景）；DKIM / SPF 自动配置；队列化邮件发送（M7.2 BullMQ 集成留给真实流量需求触发）。

---

## PR1: 平台可用性原子修复（C47 + C48 同 PR 提交，2026-08-19 启动）

- 优先级：`P0`（C48 手滑风险最高、C47 体验一致；总改动 < 10 行）
- 背景：源自 backlog 评估（[backlog.md §M6 平台可选项](backlog.md#m6-平台能力深化) C47/C48）；两条问题真实但改动极小、风险极低，合并一个原子 PR 以减少提交噪音
- 总改动量预估：前 7 行 + 测试 2 条

### PR1 任务拆解

| 子任务 | 内容 | 验收要点 |
|:---|:---|:---|
| **PR1-1 C48 批量导入默认全勾**（backlog C48） | `apps/platform/app/components/ImportReposDialog.vue:71` 删除 `selectedRepos.value = importableRepos.value.filter((r) => !r.imported)` 自动赋值语句，`selectedRepos` 默认 `[]`；保留 `全选` checkbox（`@click="(v: boolean) => selectedRepos = v ? [...selectableRepos] : []"`），让用户主动勾选 | ✅ 单元验证：打开 Dialog 时 `selectedRepos.length === 0`；全选按钮仍可一键勾选未导入项；e2e 验证默认未勾选场景（新建 e2e 或合并到 batch-import 测试） |
| **PR1-2 C47 Dialog 默认 draggable=false × 6 处**（backlog C47） | 6 处 PrimeVue Dialog 加 `:draggable="false"`：`ImportReposDialog.vue:111` + `repos.vue:467`（编辑）+ `repos.vue:601`（批量扫描）+ `schedules.vue:357` + `credentials.vue:224` + `runs.vue:178`（历史 Dialog 暂不可达但顺手带过） | ✅ 视觉验证：mousedown+drag 标题栏不移动；不引入新 e2e（visual-only） |
| **PR1-3 E2E 覆盖（C48 关键路径）** | `apps/platform/tests/e2e/admin.e2e.test.ts` 或新建 `batch-import-default.e2e.test.ts`：在 repos 页点 "批量导入" 按钮，断言 Dialog 内 checkbox 初始未勾选（除非全选按钮触发） | ✅ e2e 跑通；回归已有 batch-related 测试不退化 |
| **PR1-4 Quality gate + 提交** | `pnpm lint / typecheck / test` 通过；A 阶段 code-reviewer skill 审计（Pass）；按 conventional-committer 提交（`fix(platform): C48 默认不勾选 + chore(platform): C47 Dialog draggable=false` 一条 fix + 一条 style/PR1 整体一条） | ✅ lint 0 error / typecheck 0 error / 单测 416 passed / e2e 全部通过 / Review Gate Pass |

### PR1 完成定义
- C48 真实风险点消除（手滑不会一次导入太多仓库）
- 全站 6 处 Dialog 默认不可拖动（unrouting 子路由 bug 解除后即使 runs.vue 也能用上）
- 一条 PR 内合并落地（commit 拆分：1 条 fix C48 + 1 条 style chore C47，conventional-committer skill 决策）

### PR1 非目标
- 任何后端 / schema 改动
- C47 之外的 Dialog（如扫描历史 Dialog 已在 C51 顺手实现）

### PR1 关联
- 关联 backlog：**C47**、**C48**
- 被依赖：C48 是 PR3 C50 的依赖前提（建议同 PR 收口；但 PR1 单独已可独立价值）

---

## PR2: 单仓库扫描模式补全（C52，2026-08-19 启动，紧跟 PR1）

- 优先级：`P1`（用户原话「不太合理」；fix/fix-and-pr 模式对单仓库入口不可达——必须先有入口，PR3 / M11 候选才有效验证路径）
- 背景：源自 backlog [C52](backlog.md#c52-单仓库扫描缺模式阈值选择不合理m6-平台可选项--2026-08-19-用户反馈登记)；后端 `scanRequestSchema` 已支持 mode/severityThreshold，纯前端改动
- 总改动量预估：+60-80 行 + e2e 1 条

### PR2 任务拆解

| 子任务 | 内容 | 验收要点 |
|:---|:---|:---|
| **PR2-1 单仓库触发配置 Dialog** | `apps/platform/app/pages/repos.vue` 新增 `scanConfigDialogVisible` / `scanConfigRepo` / `scanConfigMode` / `scanConfigSeverity` 等 ref；抽取批量扫描的 `batchModeOptions` / `batchSeverityOptions` 到 `computed` 共享，或单独定义同样 options；repos 行 pi-play 按钮 onClick 改为先设 state → 打开 Dialog；Dialog 内确认按钮调 `triggerScan(repo, mode, severity)` | ✅ Dialog 列出 mode 三选 + severity 四选；Dialog 默认 mode='report-only' / severity='high'（向后兼容）；确认后 `triggerScan` body 携带所选参数 |
| **PR2-2 triggerScan 重构** | `repos.vue` 现 `triggerScan` 第 207-208 行硬编码 → 接受 mode/severity 参数从 state 传入；保留所有现有行为（队列模式轮询、dispatched runUrl、扫到结果 toast、gh-action 状态） | ✅ body.mode/severityThreshold 出现在 POST body；3 种 mode × 4 种 severity 组合测试至少跑 1 条 e2e 路径 |
| **PR2-3 E2E 覆盖** | `tests/e2e/scan-config.e2e.test.ts`（或合并到 history-dialog）：单仓库触发 → Dialog 可见 → 选 fix-and-pr+all → 提交 → 检查 /api/runs 列表的 mode 显示 | ✅ e2e 通过；fix-and-pr 模式可由单仓库入口触发（关键验证点） |
| **PR2-4 Quality gate + 提交** | lint / typecheck / test 全过；code-reviewer 审计（Pass）；conventional-committer 提交（`feat(platform): 单仓库扫描支持 mode/severity 选择`） | ✅ Review Gate Pass |

### PR2 完成定义
- 单仓库触发扫描可选择 report-only / fix / fix-and-pr × critical/high/medium/all 12 种组合
- 与批量扫描行为对齐（共享 options 数据源）
- 为后续 [backlog C53](#) 平台 fix 推送 PR 提供单仓库入口验证路径

### PR2 非目标
- 修改 `scanRequestSchema` 后端
- 修改批量扫描既有 API（保持兼容）

### PR2 关联
- 关联 backlog：**C52**
- 互依：未来 M11 候选（[backlog C53](#)）依赖 PR2 提供 fix 模式单仓库入口

---

## PR3: 批量导入能力补全（C46 + C49 + C50 同 PR 收口，2026-08-19 启动，紧跟 PR2）

- 优先级：`P2`（批量导入场景三条改进一次性补齐；同 PR 收口避免拆批改同一文件冲突）
- 背景：源自 backlog [C46](backlog.md) + [C49](backlog.md) + [C50](backlog.md)；三条都集中在 `apps/platform/app/components/ImportReposDialog.vue`，集中实施避免两次刷新页面体验差
- 总改动量预估：+140-180 行（前 1 文件 1 后端 1 行 + i18n +3 键） + e2e 2-3 条

### PR3 任务拆解

| 子任务 | 内容 | 验收要点 |
|:---|:---|:---|
| **PR3-1 C46 批量导入过滤 UI** | ImportReposDialog 新增 `forkFilter`（默认 `source` 仅非 fork）/ `visibilityFilter`（默认 `all`）/ `searchKeyword`（默认空） ref + computed `filteredRepos`；SelectButton 或 Select 控件；过滤变更后**保留已勾选项**（已有 id 在 `selectedRepos` 仍勾选；filter 不强制 unselect）；全选/计数基于 `selectableRepos` ∩ `filteredRepos` | ✅ 三维 filter 联动生效；全选按钮对 filteredRepos 重新计数 |
| **PR3-2 C49 >100 仓库分页（后端 octokit.paginate + 前端总数）** | `apps/platform/server/api/repos/importable.get.ts` 改为 `octokit.paginate(octokit.repos.listForAuthenticatedUser, { affiliation, per_page: 100 })` 一次拉完；前端 Dialog 标题显示「共 N 个仓库」总数；可选加 `总数 > 100 时显示分页计数提示` | ✅ 仓库数 >100 的真实凭据下能拉到完整列表；API 调用次数有界；不破坏现有归属过滤参数 |
| **PR3-3 C50 批量导入默认关联凭据** | ImportReposDialog 新增「默认关联凭据」`<Select>`（与现有「拉取用凭据」并行）；提交 payload 顶层带 `credentialId`；`apps/platform/server/api/repos/batch.post.ts:41-51` 补 `credentialId: item.credentialId ?? null`；i18n zh-CN + en-US 各 +3 键 | ✅ 默认凭据非空时，导入的所有仓库写库带 `credentialId`；空时不携带（保持兼容）；批量后 repos 表凭据字段正确填充 |
| **PR3-4 E2E 覆盖** | `tests/e2e/batch-import-filters.e2e.test.ts`：覆盖 C46 三维 filter 切换保留勾选 + C50 默认凭据透传；C49 由于需 >100 真实仓库，可在 e2e 中 mock 服务端或单测后端 octokit.paginate 调用 | ✅ e2e 通过；后端单测覆盖 octokit.paginate 调用（mock octokit） |
| **PR3-5 Quality gate + 提交** | lint / typecheck / test 全过；code-reviewer 审计（Pass）；conventional-committer 提交（推荐 1 条 feature：`feat(platform): 批量导入加过滤 + 分页 + 默认凭据`） | ✅ Review Gate Pass |

### PR3 完成定义
- 批量导入场景三维收敛（fork/可见性/关键字）—**收敛噪声** + 全选透明
- 仓库数 >100 时不丢失候选（C49）
- 批量导入后仓库默认带关联凭据（C50），免手工逐个编辑
- 已勾选项在 filter 切换时保留（体验一致，不重新做选择）
- [backlog C48](backlog.md) 已在 PR1 完成

### PR3 非目标
- 修改 `affiliation` 字段维度（已有 owner/collaborator/organization_member）
- 单仓库凭据 override（移至后续 backlog C51 候选——但 C51 已闭环，留 backlog 记录）

### PR3 关联
- 关联 backlog：**C46**、**C49**、**C50**
- 依赖前置：PR1（C48 默认不勾选——批量场景下 filter/分页/凭据加在一起才有完整价值；不做 PR1 单做 PR3 也可但 PR1 的 C48 才是手滑防护的关键）

---

## 待评估候选（2026-08-18 整理，按优先级）

> 上下文：T912 SMTP 邮件发送器为当前活跃任务；以下候选暂不实施，待 SMTP 完成 / 用户明确排期后再启动。所有项已在 [backlog.md](backlog.md) 独立登记，本表为执行排序 + 关联追踪视图。

| 优先级 | backlog 编号 | 任务 / 内容摘要 | 依赖 | 触发条件 |
|:--|:--|:--|:--|:--|
| **⚪ P3** | **C30** | Publish Docker 双平台构建 CI 链路裁决（⏸️ 2026-08-18 用户决策暂缓——见 backlog C30） | 无 | 恢复条件：master push 频率显著提升 / 镜像正式发布需求 / 用户明确恢复 |
| 🔴 已激活 | **C26 → M10** | 独立沙箱容器（已激活为 [todo.md §M10](todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动) 实施规划，2026-08-19 启动；Docker rootless + 应用层白名单 + cgroup v2 双层决策已落地）| 全部前置已就绪 → T1001-T1004 实施 | T912 SMTP 邮件发送器收口后启动 T1001 |
| **🟢 P2** | **C28** | security.md §凭据加密存储 章节补齐（T602 AES-256-GCM 文档化） | T912-3 联动 | T912 邮件发送安全章节同步补齐 |
| **🟢 P2** | **C29** | 平台 UI 暗色模式修复（PrimeVue 组件样式异常） | 无 | 暂缓；需 UI Validator 视觉验证 |
| **🟢 P2** | **M9 后续** | i18n 内容扩展（README.en-US / docs/i18n/en-US / platform 多语言） | M9 基建 | 翻译内容与多语言扩展 |
| **⚪ P3** | **C36** | 服务端 API 错误消息 i18n（55 处 `createError` 中文化解） | 无 | 英文用户实际使用反馈时 |
| **⚪ P3** | **C37** | 语言偏好多设备同步（Cookie → 服务端 user 字段） | 无 | 多设备使用成为常态 |
| **⚪ P3** | **D1-repo_admin** | 仓库级管理角色 + RepositoryAccess 关联表 | 无 | 多租户/多组织需求出现 |
| **⚪ P3** | **D2-username** | better-auth username 插件 | 无 | 用户明确需要用户名体系 |
| **⚪ P3** | **D3-多租户** | better-auth organization 插件（替代单组织模型） | 无 | 多组织/多租户部署成为真实需求 |
| **⚪ P3** | **D8** | remove-user 关联资源检查（引入 user→resource 关联时） | 无 | 引入 created_by / RepositoryAccess 触发 |
| **⚪ P3** | **T701-e2e** | 管理端点集成测试补强（list-users 分页 / set-role 403 / ban/unban 会话失效 / remove-user 级联 / 个人界面 changePassword/changeEmail 闭环） | 无 | 引入 @nuxt/test-utils 或 e2e 基建 |
| **⚪ P3** | **C33** | MCP P3 能力补充（pnpm-audit 本地 tool / 错误包装 helper / 完整 RunResult） | 无 | 远期登记 |
| **⚪ P3** | **SAML 2.0** | 企业 SSO SAML 支持（better-auth 无原生支持） | 无 | 企业 IdP 仅 SAML 时 |
| **⚪ P3** | **B1 / B2** | PR label `dependfix` + 关闭评论 / 固定分支单线 | 无 | PR 数量影响查询性能时 |
| **⚪ P3** | **T905** | git worktree 并行开发预案 | T505（已交付） | 多 agent 并行成为常态 |
| **⚪ P3** | **C21** | GitHub Code Quality Standard findings 接入 | 无 | 最小报告接入评估 |
| **⚪ P3** | **C22** | GitHub App / installation token 认证（CLI 侧） | 无 | org 场景 PAT 痛点 |
| **⚪ P3** | **C23** | 发现规模上限 `max-repos` | 无 | 大 org 全量发现场景 |
| **⚪ P3** | **C24** | org 级 alerts API 批量拉取 | 无 | 大 org 用户痛点 |
| **⚪ P3** | **C34** | 存量规范严格约束挂接盘点（review 检查点补齐） | 无 | 用户排期（不急） |
| **⚪ P3** | **T705 / T703** | 生产级部署 / 跨平台 Git（已延期 2026-08-12） | T702 / M6 | 用户指示恢复 |
| **🟢 P2** | **branches 阈值恢复 80% 冲刺**（2026-08-18 登记 / 2026-08-19 neat-freak 细化启动条件） | `vitest.config.ts` branches 阈值临时下调 80% → 79% 的恢复任务——2026-08-19 mailer/index.ts / app-error.ts / stats.get.ts 已通过 commit `6e28207` 全分支补测（见上方 T912 coverage 回归修复）。**剩余低分支文件清单**（按 2026-08-19 coverage snapshot `coverage/coverage-summary.json` 排序，对整体 80% 阈值贡献从大到小）：**① `packages/engine/src/app/branch-cleanup.ts`**（branches 27.77% / 36 分支 10 覆盖 / 差 26 分支，权重最大）→ **② `apps/platform/server/database/naming-strategy.ts`**（30% / 10 分支 3 覆盖 / 差 7 分支，独立单元测试无 executor 依赖）→ **③ `scripts/distill-wisdom.mjs`**（55.05% / 89 分支 49 覆盖 / 差 7 分支）→ **④ `apps/platform/server/api/repos/batch.post.ts`**（53.33% / 15 分支 8 覆盖 / 差 7 分支，依赖 DB mock）→ **⑤ `apps/platform/server/api/batch-runs/[id].get.ts`**（55.17% / 29 分支 16 覆盖 / 差 13 分支）→ **⑥ `packages/engine/src/runners/network-audit.ts`**（68.75% / 32 分支 22 覆盖 / 差 10 分支，T1002 改造后分支结构变化需重测）。**启动条件**：M10 T1001-T1003 实施完成 + executor 抽象稳定后再启动冲刺——避免 container-executor / batch-runs 等测试随沙箱重构白费。**目标**：四维 ≥ 80% 后恢复 `vitest.config.ts` branches 阈值 79% → 80% | 无 | CI 端到端裁决；目标：四维 ≥ 80% 后恢复阈值 |

- 完成定义：暂不实施——本表为 backlog 排序追踪视图，用户排期任一项时移入正式任务区块（参考 M8/M9 格式）。
- 关联：
  - **branches 阈值恢复 80% 冲刺**：2026-08-18 mailer/ 模块新增导致整体 branches 从 80.6%（T711 冲刺后）降到 79.6%，临时下调到 79%；恢复路径见本表 P2 行；其他 P3 项（network-audit / container-executor / scripts/*）按需补测可纳入此冲刺一并完成
  - **C26 + C28**：用户 2026-08-18 明确指示「考虑解决」（C26 独立沙箱 / C28 security.md 章节补齐），排入 P1 / P2 待评估
  - **C30**：用户 2026-08-18 明确指示「暂缓」——run 31862632207 双平台构建 23m 2s 成功完成证明当前 docker.yml 配置可稳定工作，恢复条件见 backlog C30；
  - **C29 + M9 后续**：平台能力深化，依赖用户产品方向决策；
  - **D1-D8 + T701-e2e**：M7.1 设计决策点候选项，触发条件未达不实施；
  - **P3 项**：远期登记，随真实需求触发。

---

## 待人工验收（真实环境，随可用性推进）

- **T701 真实凭据 3 项**：真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）、真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）、构建期配置凭据后按钮显示路径实测——[todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)
- **T702 HTTP 层状态流转**：pending→running→completed + 前端轮询体验（需后台服务/staging 或 CI redis service）
- **T704 async 定时触发**：BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）；Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）
- **发布管线收尾（P3）**：release:auto-version 完整流程待 schedule 启用后首个 cron 裁决；main 副作用路径测试观察项

## 已知边界

- **npx skills GitHub 源端到端验证**（M5.5 遗留，本机 clone github.com 网络受限）依赖 CI 端到端裁决
- C28 / C29 / C30 等 pending backlog 项详见下方"待评估候选"表 + [backlog.md](backlog.md)，不在此重复列出

# 待办积压 (Backlog)

> 本文档存放后续阶段与未排期增强候选。当前阶段任务见 [todo.md](todo.md)；已归档阶段见 [todo-archive.md](todo-archive.md)。


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
  - 关联：M6 T602 凭据管理已交付 GitHub App 凭据类型（app-id + private-key，见 [todo-archive.md §M6](todo-archive.md#m6-最小平台-mvp已归档)）；CLI 侧认证能力为其前置或并行增强
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

> **已归档（2026-08-08）**：T601-T605 + T607 全部完成，见 [todo-archive.md §M6](todo-archive.md#m6-最小平台-mvp已归档)。以下仅保留本阶段转移出的增强候选与遗留观察项。
> **已闭环清理**：C25（B 模式结果回填，17c5082f + 60d9fd6e）、C27（runUrl 状态语义，随 C25 联动解决）——记录见 [todo-archive.md §M6 治理记录](todo-archive.md#m6-阶段治理记录2026-08-07--2026-08-08)。

- **C26 独立沙箱容器执行实现**（T607 设计文档产出后的实现候选）
  - 状态：🔶 **实施规划已就绪（2026-08-19 用户决策）**——[backlog §沙箱与恶意依赖防护治理登记](backlog.md#沙箱与恶意依赖防护治理登记-2026-08-14-安全专项评估) G5 升级；M10 实施规划已登记于 [todo.md §M10](todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)。**前置依赖 T702/T802/T805/C38/C45 全部已落地**（BullMQ 并发 / detached 进程组 / 网络审计代理 / 容器降权 / 工具链修复），仅 3 个外部前置未决；2026-08-19 决策会议基于 super-search 一手调研结论如下
  - 内容（三选项已决定）：
    - **Runtime** = Docker rootless mode（[Docker 官方文档](https://docs.docker.com/engine/security/rootless/)）。**Executor 抽象不与 rootless 强绑定**——接口按 OCI runtime 兼容设计，未来切 Sysbox 仅改 `--runtime=` 配置（[executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计) 设计预留）。Kata/gVisor/Firecracker 因宿主 KVM 依赖 + 性能损耗被否决
    - **网络白名单** = 应用层 HTTP 代理（升级 T805 现成 `network-audit.ts` 为 deny-by-default 白名单拦截代理，见 [todo.md §M10 T1002](./todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)）。iptables 需 `NET_ADMIN` 破坏安全基线被否决；CNI 需 K8s 形态与自托管不匹配被否决
    - **资源限制** = cgroup v2 写 `memory.max` + `cpu.max`（见 [todo.md §M10 T1003](./todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)）+ 保留 Node.js 20 自动识别（[Kubernetes docs](https://kubernetes.io/docs/concepts/architecture/cgroups/) + [Red Hat 2025-10](https://developers.redhat.com/articles/2025/10/10/nodejs-20-memory-management-containers)）作为 V8 堆自适应层；仓库级 `Repository.sandboxLimits` JSON 字段可配置，缺省值由平台配置提供
    - **镜像策略** = 复用平台镜像 runtime 阶段（T801 已落地的 git/pnpm 工具链）
    - **部署形态** = 自托管 docker-compose（`apps/platform/docker-compose.yml` 加 rootless daemon 容器）优先；K8s+Helm 仅在 [executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计) 登记为 backlog（C26 子条目）
    - **旧路径并存** = `ContainerExecutor`（in-process）与 `SandboxExecutor`（rootless 容器）按 `executorKind` 配置并存，默认 `container`（不破坏单机场景）
  - **反模式已登记**（绝对不可用）：[DinD with `--privileged`](https://blog.nestybox.com/2019/09/14/dind.html) + [挂 `/var/run/docker.sock`（DoD）](https://www.wiz.io/academy/container-security/container-escape)—— CVE-2019-5736 runc 逃逸实证，违反 [sandbox-security-governance.md §3 路径 D](../design/governance/sandbox-security-governance.md)
  - 来源：M6 规划（2026-08-07，Q4=A 设计+最小实现，完整沙箱留后续） → 2026-08-14 安全专项评估提级 → **2026-08-19 决策会议 + 调研落地**
- **C28 security.md 补凭据加密存储章节**（M6 终审 W4 登记）
  - 状态：🔶 待评估（不阻塞）
  - 内容：security.md 未登记 T602 凭据加密机制（ENCRYPTION_KEY / AES-256-GCM / 解密仅执行时内存 / 凭据最小化），加密设计散落 executor-sandbox.md §3 与 credential.service.ts 注释；安全设计文档应与实现同步补"凭据加密存储"一节（T602 已交付，文档待补）
  - 来源：M6 终审（2026-08-08，deep Review Gate warning 4）
- **C29 平台 UI 暗色模式不可用**（用户反馈登记）
  - 状态：🔶 待修复（暂缓，2026-08-10 用户指示"先记下来，暂时不修，后续优化"）
  - 内容：M6 平台 UI 的暗色模式不可用（T601 任务内容含"暗色模式 `.dark` 类切换"，`nuxt.config.ts` 已配 `darkModeSelector: '.dark'` 与 PrimeVue 主题预设，但实际切换后样式异常/不生效）。修复前需先以视觉验证确认现象与范围（用 UI Validator 子 agent，视觉模型 opencode-go/qwen3.7-plus 截图审计），修复方向：`.dark` 类挂载位置与 PrimeVue 主题联动、SCSS/BEM 变量（`_variables.scss`）暗色分支、页面级硬编码颜色清查
  - 来源：2026-08-08 用户反馈（附截图，需视觉能力复核）
  - **状态说明**：2026-08-09 T701 浏览器视觉复测曾判"暗色切换正常"并一度关闭；2026-08-10 用户实测反馈"暗色模式依旧不可用"——以用户实测为准重新登记（视觉模型可能对 PrimeVue 组件内部样式误判）。暂缓修复，后续优化排期
- **C46 批量导入仓库弹窗缺过滤 UI**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：🔶 待评估
  - 位置：`apps/platform/app/components/ImportReposDialog.vue` + `apps/platform/server/api/repos/importable.get.ts`
  - 问题：当前弹窗仅有"全选 / 单项勾选"两个操作，没有按仓库属性过滤的 UI。当凭据下可访问仓库数量较多（如 org 凭据覆盖 100+ 仓库）时，用户无法快速收敛到目标集合（自己的、非 fork、公开/私有 等）
  - 现状：
    - 后端 `importable.get.ts:22-26` 仅透传 `affiliation`（owner / collaborator / organization_member），未实现 `visibility` / `fork` / `archived` / `disabled` 等维度
    - 前端 `ImportReposDialog.vue` 已展示 `repo.private / repo.fullName / repo.defaultBranch / repo.imported`（第 192-194 行），数据可用，只缺过滤器（按属性 chip + 按关键字 search 至少其一）
    - GitHub `listForAuthenticatedUser` 单次返回字段含 `private / fork / archived / disabled / description / full_name`，前端本地 filter 零成本即可实现 capability 完整的过滤
  - 修复方向（候选）：
    - 方案 A：**前端 filter**（推荐）—— 在 `importableRepos` 基础上加若干 `<Checkbox>`（只看非 fork / 只看私有 / 隐藏已 archived / 只看公开 + 关键字 input），全部前端 in-memory 计算。后端 API 保持现状零改动。
    - 方案 B：后端扩展 `?visibility=&fork=&archived=` 参数下推过滤 + 前端调用。最适合 ≥1000 仓库场景（但当前 per_page:100 单次最多 100 个，前端 filter 体感差别不大；如同时上 C49 分页，100+ 场景下服务端侧 filter 才有意义）
    - 折中：A 先落地兜底；C49 落地若实测发现仍卡再补 B
  - 关联：C48（默认全选）/ C49（分页）—— 三者均集中在 ImportReposDialog + importable.get.ts，可同 PR 收口
  - 来源：2026-08-19 用户反馈「批量导入的时候，允许筛选仓库列表，例如只选择自己的项目（非 fork）、公开或私有等等」
- **C47 PrimeVue Dialog 默认可拖拽**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：🔶 待评估
  - 位置：全站 6 处 Dialog 均受影响
    - `apps/platform/app/components/ImportReposDialog.vue:111`
    - `apps/platform/app/pages/repos.vue:468`（添加/编辑仓库弹窗）
    - `apps/platform/app/pages/repos.vue:601`（批量扫描弹窗）
    - `apps/platform/app/pages/schedules.vue:358`
    - `apps/platform/app/pages/credentials.vue:224`
    - `apps/platform/app/pages/repos/[id]/runs.vue:177`
  - 根因（已核实 PrimeVue 4.5.5 源码）：
    - `node_modules/.pnpm/primevue@4.5.5.../primevue/dialog/BaseDialog.vue:77` 明确 `draggable: { type: Boolean, default: true }`
    - 全站 6 处 Dialog 全部未传 `:draggable="false"`，默认拖拽行为直接生效
    - 标题栏 mousedown + mousemove 即可拖动整个弹窗位置——容易误触（尤其是表单输入场景）
  - 修复方向（候选）：
    - 方案 A：每个 Dialog 加 `:draggable="false"` —— 6 处一次性改完，简单直接
    - 方案 B：自封装 `<AppDialog>` 包装组件统一绑死 `draggable=false` —— 6 处迁移但 long-term 防遗漏（每次新增 Dialog 只需用 wrapper）
    - 方案 C：PrimeVue 4 PT 覆盖默认 prop —— 实测 PT 主要覆盖 CSS/classes，全局 prop 默认值无官方标准通道，需要绕路（provide override 等），不推荐
    - **推荐 A**：6 处一字不改成本最低 + 同步登记开发规范「Dialog 必须显式 `draggable`」（挂接 `code-quality-checklist.md` 必查项，类似 §5.3 C44 先例）
  - 关联：开发规范 `docs/standards/development.md` 章节「UI 组件约定」是否已声明 Dialog 行为？需要扫描（建议同时给 §5.3 类检查点补一条「Dialog 必须显式 draggable」）
  - 来源：2026-08-19 用户反馈「目前的弹窗（模态框）默认情况下会被鼠标拖拽，不需要这个功能」
- **C48 批量导入默认全勾（手滑风险）**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：🔶 待评估
  - 位置：`apps/platform/app/components/ImportReposDialog.vue:71`
  - 问题：当前实现
    ```ts
    const loadImportable = async () => {
        ...
        selectedRepos.value = importableRepos.value.filter((r) => !r.imported)
    }
    ```
    — `loadImportable` 完成后**自动勾选所有未导入项**。一个 token 含 50+ 仓库时，点"确定"会一次性批量添加 50 个，"只选其中 3 个"的典型用例必须先**手动取消 47 个**——操作反向、反直觉、手滑风险高（用户点击"导入"按钮瞬间全量提交无法挽回）
  - 用户期望：默认全部不勾选，由用户主动勾选目标项；保留"全选"按钮供需要时一键勾选（`ImportReposDialog.vue:165-169` 已存在 select-all checkbox，无需新增）
  - 修复方向：
    - 单点改动：`ImportReposDialog.vue:71` 删除自动赋值语句，使 `selectedRepos` 默认值始终为 `[]`
    - 增量考虑（如 C46 落地后过滤交互改变）：可考虑"过滤变化时自动取消选中"以保持显式选择语义，或保留已勾选项让用户体验更顺——后者更友好，需论证
    - 与 C46 同 PR 落地，避免分批提交造成两次刷页面体验差
  - 关联：C46（过滤 UI）/ C49（分页）—— 三者均集中在 ImportReposDialog + importable.get.ts，可同 PR 收口
  - 来源：2026-08-19 用户反馈「默认不应该全部选中，让用户自己选择要导入哪些，避免手滑导入太多仓库」
- **C49 批量导入超过 100 个仓库需分页**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：🔶 待评估
  - 位置：`apps/platform/server/api/repos/importable.get.ts:44`（后端 limit 硬编码）+ `apps/platform/app/components/ImportReposDialog.vue`（前端 UI）
  - 问题：后端硬编码 `per_page: 100`（GitHub `listForAuthenticatedUser` 单次上限），不翻页意味着含 org 凭据场景下仓库数 >100 时丢失 100 之后的所有候选。前端列表当前 `max-height: 360px; overflow-y: auto;`（第 257-258 行），列表本身有滚动但底层数据缺，前端无法补救
  - GitHub API 实际容量：`listForAuthenticatedUser` 默认 30 / max 100；paginate 总数理论可达 1000/账号，但实际取决于仓库可见性与权限范围
  - 修复方向（候选）：
    - **方案 A（最小完整）**：后端 `octokit.paginate(..., { per_page: 100 })` 一次拉完（Octokit 原生支持自动翻页；多数账号 < 500 个仓库，内存成本可接受），前端一次性渲染 + 复用现成的 `max-height: 360px; overflow-y: auto;` 滚动；总数展示在表头
    - **方案 B（带 UI 分页）**：A 的基础上前端加 `DataTable` 或自实现 page 切换 + 「加载更多」按钮。前端可做 virtual scroll（如 PrimeVue `DataTable virtualScroller`）保证流畅
    - **方案 C（实时服务端分页）**：后端保留 `?page=&pageSize=` 参数，前端分页拉取。复杂度最高但流量最优；当前场景非必要
    - **推荐 A**：简洁、一次性全量、UI 改动最小。`octokit.paginate` 不引入新依赖（Octokit 内置），后端代码净增 2-4 行；前端总数展示 + 滚动区不动
  - 验收要点：
    - 含 >100 个仓库的凭据实测：导入弹窗显示「N 个仓库（N=全部用户可访问）」与原始 GitHub 列表一致
    - API 调用次数有界（防 pagination loop 失控）：可选 `octokit.paginate(..., { per_page: 100, per_page_limit_reached: true })` 或显式 `while` + max page（如 20 = 2000 仓库兜底）
    - 前端 UI 不卡：>300 仓库实测滚动 / 自动全选体验（如 C48 默认不勾选则全选压力大幅减轻）
  - 关联：C46（过滤）/ C48（默认不勾选）—— 三者同 PR 收口；C46/C48 落地前单独 C49 收益有限（C48 不勾选 + 缺分页 = 大量仓库在列表里，用户无 KPI 感受）
  - 来源：2026-08-19 用户反馈「超过 100 个仓库的时候要考虑分页了」
- **C50 批量导入仓库选择默认关联凭据**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：🔶 待评估
  - 位置：
    - 前端：`apps/platform/app/components/ImportReposDialog.vue`（新增"导入默认凭据"下拉 + 提交 payload 携带 `credentialId`）
    - 后端：`apps/platform/server/api/repos/batch.post.ts`（补写 `repoRepo.create` 的 `credentialId` 字段，可选附 `credentialId` 存在性校验）
    - 数据层：`apps/platform/server/entities/repository.ts` `credentialId` 字段已存在（`@Column({ nullable: true })` + 索引 + `ManyToOne Credential`，第 53-61 行），schema 层 `repositorySchema` 已接受 `credentialId`（`schemas/repository.ts:10`，`nullable().optional()`），**均无需变更**
  - 问题：当前 `ImportReposDialog.vue` 弹窗里有一个"凭据"下拉（第 119-131 行），实际是**调用 `/api/repos/importable?credentialId=...` 拉取候选仓库列表**（即"用哪个 token 看仓库"），与"导入后仓库默认关联的凭据"是两个语义。`ImportReposDialog.vue:88-96` 提交 `POST /api/repos/batch` 时 payload 完全不带 `credentialId`，导致新建仓库 `credentialId=null`；管理员**导入后必须逐个去编辑页选凭据**（repos 列表显示 `notLinked`），批量场景工作量大
  - 现状（后端约束已具备，唯一缺口在 batch.post.ts 未写入）：
    - `repositorySchema.credentialId` schema 层已接受（`schemas/repository.ts:10`）
    - `batchImportSchema` 复用 `repositorySchema`，schema 无需改
    - `Repository.credentialId` 字段已就绪（外键 + ManyToOne + 索引 + nullable），实体层无需改
    - **缺口**：`batch.post.ts:41-51` `repoRepo.create({...})` 未传 `credentialId`，落地时一行（`credentialId: item.credentialId ?? null`）补齐
  - 修复方向（候选）：
    - **方案 A（推荐）**：在 `ImportReposDialog` **新增**一个「默认关联凭据」下拉，与现有「拉取用凭据」下拉并存；读 / 写语义分离（read=拉列表 / write=关联到仓库）；提交 payload 顶层带 `credentialId`，后端写入每条记录。仅顶层默认，单仓库 override 留后续 backlog
    - **方案 B**：A 的基础上，列表内每行右侧加 inline `<Select>`，单仓库可改覆盖默认凭据（适合"大部分 tokenA、少数 tokenB"场景）
    - **方案 C（最小改动）**：复用现有「拉取用」下拉直接作为默认关联凭据（强制同 token），改动最小但语义混用，read/write 分离场景被破坏
    - **推荐 A**：语义清晰、覆盖 95% 用例；B 可作为 C51 后续增强；C 是 A 的退化版（只在单 token 部署场景 OK）
  - 验收要点：
    - 弹窗顶部多一个「默认关联凭据」`<Select>`（必填或可空——见下），placeholder 与 hint 文本 i18n 化
    - 默认关联凭据可空（`null` 即不关联，需要管理员后续手动编辑）
    - 非空时提交：`POST /api/repos/batch` body 顶层带 `credentialId: 'xxx'`，`batch.post.ts` 写入 `repoRepo.create({...item, credentialId: item.credentialId ?? null})`
    - 可选：后端补 `.refine` 校验 credentialId 实际存在（避免 FK 悬空；schema 层可加也可保留 null-on-not-found 语义）
    - i18n 增 `repos.importDefaultCredential` / `repos.importDefaultCredentialPlaceholder` / `repos.importDefaultCredentialHint`（zh-CN + en-US）
    - 单仓库 override 不实现（移至后续 backlog）
    - 已导入（`imported=true`）的项不应用「默认凭据」（它们已经存在，凭据编辑走单独路径）
  - 关联：C46（过滤）/ C48（默认不勾选）/ C49（分页）—— 四个均集中 `ImportReposDialog.vue` + `batch.post.ts`，可在同一 PR 收口
  - 来源：2026-08-19 用户反馈「导入的时候应该可以选择默认的关联凭据」
- **C51 扫描历史子路由不可达（unrouting 0.2.x 兼容 bug + 应用层 Dialog 改造）**（M6 平台 bugfix / 2026-08-19 用户实测反馈 + super-search 调研登记）
  - 状态：✅ **已修复（2026-08-19）** — 提交 `2102894` 应用层方案 A：pi-history 按钮改 `navigateTo({path:'/repos', query:{history:data.id}})`，新增 `RepoHistoryDialog.vue` watch query 自动打开 Dialog（list + detail 内部切换）；e2e `tests/e2e/history-dialog.e2e.test.ts` 完整覆盖；review gate Pass（warning 级 UX 建议留待后续）
  - 现象（用户实测）：仓库列表页 pi-history 按钮（`repos.vue:440` `@click="navigateTo(\`/repos/${data.id}/runs\`)"`）点击后 URL 跳转到`/repos/{id}/runs`，**但页面 DOM 仍显示父路由 /repos 内容**——h2 渲染为「仓库管理」而非「扫描历史」；用户感受"扫描历史按钮没用"
  - 位置：
    - 子页面文件：`apps/platform/app/pages/repos/[id]/runs.vue`（存在但从未被路由正确匹配）
    - 用户入口：`apps/platform/app/pages/repos.vue:438-441` pi-history 按钮 + 各页面 `navigateTo(\`/repos/${data.id}/runs\`)`
    - 失败链条：unrouting 0.2.x → vue-router 4 → SSR 渲染 fallback 到父路由 /repos
  - **根因（已被脚本化诊断证实）**：
    1. `pages/repos/[id]/runs.vue` 的 `[id]` 动态段在 unrouting 0.2.x 输出为 vue-router 字符串 `:id()`（见 `node_modules/.pnpm/unrouting@0.2.2/.../dist/index.mjs:489`  `case "dynamic": out += \`:${token.value}()\``）
    2. vue-router 4 + path-to-regexp 8.x 在 tokenize 时将 `:name()` 解析为 **`param {name}` + `(` + `)` 三个 token**，`(`/`)` 在 SIMPLE_TOKENS 中是 reserved 但 consume() 不处理，被丢在 lexer 流中未被消费（除非源码错 throw），最终 vue-router matcher 将 `(` 与 `)` 当成 CHAR literal
    3. 编译成的正则包含 `([^/]+\()` —— **literal 必须** `id` 紧跟 `(` 字符；URL `/repos/abc/runs` 不匹配，自动 fallback 到最接近的 `path: '/repos'` 父路由
    4. SSR 直接 `curl /repos/{id}/runs` 返回 HTML，h2 是「仓库管理」（验证：诊断脚本 `tests/e2e/history-button-diag-ssr.e2e.test.ts` 已临时创建用于实证）
    5. 客户端 router path 与 SSR 一致：`router.getRoutes()` dump 显示真实 path 为 `:id()/runs`（验证：诊断脚本 `tests/e2e/dump-router.e2e.test.ts` 已临时创建用于实证）
  - **super-search 调研结论（2026-08-19）**：
    - unrouting 仓库 `unjs/unrouting` 当前 **main 分支 / v0.2.3 最新版（2026-08-12 发布）仍输出 `:id()`**——v0.2.3 的 fix #182 仅修 static segments 编码（ufo encodePath 与 vue-router 不一致），未触及 dynamic token 输出
    - 仓库内未检索到针对 `:id()` / vue-router-4 兼容性的同类 issue 报告（GitHub search `repo:unjs/unrouting :id()` 仅返回 reno PR 与无关结果）
    - `path-to-regexp 8.1.0` 源码 lexer 函数（`pillarjs/path-to-regexp/src/index.ts` `lexer()`）确认 `(`,`)` 是 reserved tokens 未消费且 parse() consume 仅识别 `{`/`}`/`PARAM`/`WILDCARD`/`CHAR`/`ESCAPED`/`END`，`(`,`)` 是 literal CHAR
    - **结论**：上游 unrouting / path-to-regexp 升级短期不会修复；下游 monkey-patch 也只能写到 nuxt local module，且与 i18n `pages:extend` hook 顺序敏感（实测 hooks: pages:extend 把我先改的 `:id?` 又被 i18n listener 二次 localizes 覆盖成 `:id()`——见 `apps/platform/modules/fix-routes.ts` 之前的失败尝试）；**应用层绕开**是最稳路径
  - **修复方向（候选）**：
    - **方案 A（推荐 / 用户已选）**：把 `runs.vue` 的「扫描历史」内容**嵌入到 `repos.vue` 的 Dialog**，id 通过 **`route.query.repoId`**（查询字符串）传递，例如 `navigateTo('/repos?history={id}')`，`repos.vue` 顶部监听 `route.query.history` 打开 Dialog 与对应仓库详情
      - 优点：完全绕开 unrouting bug（顶级路由 + query 字符串不涉及 dynamic segment）；Dialog 已经跑通；符合现有 `ImportReposDialog.vue` / `BatchRunDialog` 模式
      - 缺点：URL 不再 deep-link 扫描历史（`/repos` 同 URL 不同 state）——可接受，进入历史即做 modal 入口
      - 实现要点：Dialog 内 `fetchRuns` 使用 `query.repositoryId = repoId` 复用现有 `/api/runs` 接口，详情 Dialog 模板与现 runs.vue 几乎一致；`runs.vue` 删除或留作未来回归
    - **方案 B**：等 unrouting 上游修复 + 后续版本升级
    - **方案 C**：应用层 monkey-patch unrouting（去掉 `()`）；不推荐——依赖副作用且与 i18n hook 顺序敏感，与 nuxt 升级会脱钩
    - **方案 D**：降 nuxt-i18n 到旧版（用过 path-to-regexp 6 的版本）；不推荐——失去 i18n 新特性
  - **验收要点（推荐 A）**：
    - 仓库列表行的 pi-history 按钮点击后，url 变为 `/repos?history={repoId}`，`repos.vue` 自动打开「扫描历史」Dialog
    - Dialog 内标题、状态表格、详情按钮**复用**原 `runs.vue` 逻辑（详情 fetch 仍命中 `/api/runs/{id}` 接口）
    - 关闭 Dialog 后 `?history` query 移除，url 干净
    - 用户直接访问 `/repos?history=<id>` 也能正确打开对应仓库 Dialog（deep-link via query）
    - 撤销/清理：临时诊断脚本 `tests/e2e/{dump-router,history-button-diag*}.e2e.test.ts` 已在 2026-08-19 撤回（保留为未来回归候选）
  - **顺手补项**（可不依赖 C51 主路径）：
    - C-子项 a：`runs.vue` 内 Dialog 加 `:draggable="false"`（C47 当前 viewport 部分修复；其余 5 处 Dialog 与本任务独立，可单独 PR）
    - C-子项 b：`runs.vue` 内 `openDetail` 错误处理加 `detailError` 解耦 + Dialog 内嵌 `<Message>` 错误占位 + 关闭 Dialog 重置 state（现行代码 `error.value` 写到列表顶部 message 被 Dialog 遮罩掩盖——降级路径下用户看不到错误）
    - 因 C51 推荐方案 A 将 runs.vue 内容迁入 Dialog，这两条迁移到 Dialog 内同位置实现即可，不需重复
  - 关联：**C47**（Dialog 默认 draggable，6 处待修）/ **C-子项 b**（详情 Dialog 错误占位）/ **C49**（批量导入分页无）+ **D1-D4 四种上游/应用层方案权衡**
  - **触发重新评估的条件**：① unrouting 上游发布修复 `:id()` 输出的新版本（订阅 `unjs/unrouting` releases）；② 用户重新启用"独立子路由" 形态；③ 真实出现 deep-link 扫描历史需求（share link 等）
  - 来源：2026-08-19 用户实测反馈"这个扫描历史按钮还是没用" + super-search 调研（GitHub API `unjs/unrouting` issues search `vue-router` `:id()` `path-to-regexp`）
- **C52 单仓库扫描缺模式/阈值选择（不合理）**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：🔶 待评估
  - 位置：`apps/platform/app/pages/repos.vue` `triggerScan`（第 193-231 行），`/api/repos/[id]/scan` POST body 第 207-208 行
  - 问题：单仓库「触发扫描」按钮**硬编码** `mode: 'report-only'` / `severityThreshold: 'high'`；而批量扫描（`openBatchScan` / `submitBatchScan`）有完整选择器（`batchModeOptions`：report-only/fix/fix-and-pr；`batchSeverityOptions`：critical/high/medium/all）。导致 **fix / fix-and-pr 模式对单仓库不可达**（只能通过批量扫描触发，或直接调 API）——功能缺口 + 交互不一致
  - 现状：
    - `apps/platform/app/pages/repos.vue:207-208` `mode: 'report-only'`、`severityThreshold: 'high'` 写死
    - 第 250-261 行已有 `batchModeOptions` / `batchSeverityOptions` 可复用
    - 后端 `scan.post.ts` 的 `scanRequestSchema` 已支持 mode/severityThreshold（校验通过即可），无后端改动
  - 修复方向（候选）：
    - **方案 A（推荐）**：复用批量扫描的模式/阈值选择器——单仓库触发前弹一个小配置 Dialog（mode + severity），或在行内按钮旁加 `Select`。由于 `scan.post.ts` 已透传 mode/severityThreshold，纯前端改动即可
    - **方案 B**：合并为统一的"扫描配置"组件，批量/单仓库共用（DRY）
    - **推荐 A**：改动最小、行为对齐；B 作为长期重构
  - 验收要点：单仓库触发可选 report-only/fix/fix-and-pr + critical/high/medium/all；POST body 带所选 mode/threshold；后端无 schema 变更；默认 report-only/high（保持兼容现状）
  - 关联：C53（fix 推送）+ **批量扫描配置组件复用**
  - 来源：2026-08-19 用户反馈"为什么只有批量扫描的时候能选择扫描模式呢？不太合理"
- **C53 平台集成模式 fix 修复结果不推送远程（无 PR）**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态：🔶 **后置候选（M11 评估）** —— 改动体量大（+80-120 行 / 2-3 文件），涉及 git push 副作用 + Octokit 集成 + 测试基建；需独立 Task 含方案设计（push 凭证来源、回滚机制、权限边界）+ e2e mock GitHub API；依赖 C50 提供推送凭证来源；2026-08-19 用户指示暂不入 PR1-PR3 排期
  - 位置：`apps/platform/server/services/executor/container-executor.ts`（第 48-51 行 clone + 第 71 行 `app.run()` + 第 95 行 `rm(workDir)` 清理）
  - 问题：平台集成模式（container executor）下 `fix` / `fix-and-pr` 模式：clone 仓库到工作目录 → 容器内 `DependfixApp.run()` 完成修复 → **第 95 行直接把 workDir 删除**。修复结果（改动的文件 / commit / branch）**只存在于本地临时目录，从未 push 到远程、未创建 PR**。用户反馈："修复结果只在本地，未推送到远程……显然没有修复并 PR 来的直观（也确实没有修复功能）"
  - 现状：
    - `container-executor.ts:49-51` `needsClone = mode !== 'report-only'` → clone；`app.run()` 执行修复
    - `finally`（第 95 行）`rm(workDir)` 删除工作目录——修复产物随之消失
    - 对比 B 模式（`action-trigger-executor.ts`）：通过 GitHub Action `workflow_dispatch` 触发，在远程 runner 上执行并 push/PR（远程有完整的 PR 闭环）
    - 缺：容器内修复后如何 push 回远程（git remote credential 注入方式、分支命名、commit、PR 创建）——当前**完全没有该链路**
  - 修复方向（候选）：
    - **方案 A（最小闭环）**：容器内 `app.run()` 完成后，若 mode 为 `fix`/`fix-and-pr`，把修复后的 workDir 提交到新分支并 push 到远程（需用 `ctx.credential?.token` 经 `http.extraheader` 注入 git credential，与 `cloneRepository` 一致），`fix-and-pr` 再调 GitHub API 创建 PR
    - **方案 B**：复用 CLI `createPullRequest` 能力（`packages/cli` 已有 PR 创建逻辑）下沉到 engine / 平台服务
    - **方案 C**：提示用户"平台集成模式不推送"并在 UI 明示（不实现推送）—— 不符合用户期望，不推荐
    - **推荐 A**：容器内 push + PR，复用 `http.extraheader` 凭据注入模式与 `repository` 实体的 `credentialId` 关联（C50 落地后凭据来源更明确）
  - 验收要点：`fix` 模式在平台集成执行后远程分支包含修复 commit（可 fetch 验证）；`fix-and-pr` 模式在 GitHub 创建 PR 且 body 含报告；失败时干净回退（不残留孤儿分支/PR）；工作目录清理时序改为 push 成功后再清理
  - 关联：C50（默认关联凭据）提供推送凭据；与 C52（单仓库模式选择）同属平台执行链路补齐
  - 来源：2026-08-19 用户反馈"平台集成模式下，仅修复有一个直接的问题，那就是修复结果只在本地，未推送到远程……没有修复并 PR 来的直观（也确实没有修复功能）"
- **C54 batch-runs 页面刷新策略(降低刷新周期 + 防抖动 + 手动刷新按钮)**（M6 平台可选项 / 2026-08-19 用户反馈登记）
  - 状态:🔵 **已规划落地（2026-08-19 todo.md C54 区块 / 进行中）**——原 🔶 待评估
  - 位置:`apps/platform/app/pages/batch-runs.vue` 第 119-149 行 `startPolling`(setInterval 2000ms)+ `fetchBatchRuns`(line 73,整表替换 `batchRuns.value = ...`)
  - 问题:`batch-runs` 页面对所有 `status === 'running'` 的批次做 **2 秒间隔**的 `setInterval` 全表拉取(`fetchBatchRuns` 每次整体替换 `batchRuns` 数组);同步对每个已展开行再 `fetchDetail` 一次;无防抖动。导致:
    1. **表格屏闪**:整表替换 → PrimeVue DataTable 重新 reconcile 行节点 → 行短暂消失/重排,长列表时观感差
    2. **网络/后端压力**:2s 全量 GET `/api/batch-runs` + N 次 `/api/batch-runs/[id]`,多个 running batch 同时存在时请求量翻倍
    - 用户反馈:"batch-runs 页面刷新数据过于频繁,并且页面没有增加防抖动,会导致表格屏闪"
  - 现状:
    - 轮询触发条件:`onMounted` 拉一次列表 → 若有 `status === 'running'` → `startPolling`(2s 间隔)
    - 终态收敛:`runningIds.value.length === 0` 时 `stopPolling`(自然停止)
    - 已展开行在轮询中重复拉详情(line 132-136)
    - 手动刷新按钮已存在(line 170-176 `pi-refresh` 图标),但点击只触发 `fetchBatchRuns` 不重置轮询节拍
  - 修复方向(候选):
    - **方案 A(用户采纳)**:① **降低刷新周期**:轮询间隔 2s → **60s**(用户决策,原建议 5s 仍嫌频繁;running 批次平均 30s+ 进度变化有限,60s 折中);② **整表替换 → 增量 reconcile**:服务端加 `updatedAt` 字段,客户端按 id 合并数组而非整表替换,避免 PrimeVue DataTable 重排;③ **保留并强化手动刷新按钮**:点击时强制立即拉一次并重置下次轮询计时(让用户感知"我点了,马上刷了");④ **防抖动**:三态分离(`firstLoad` UI 骨架 + `loading` 按钮反馈 + `inflight` 并发守卫),连续点击不会并发请求
    - **方案 B**:保留 2s 轮询但改为"前端窗口聚合"——服务端推送(WebSocket / SSE)推送 running batch 状态变化,客户端只更新受影响的行;改动大、需 SSE/WS 基建,不推荐
    - **方案 C**:`fetchBatchRuns` 仅在 `[...batchRuns]` 引用变化时才重渲(用 shallowRef / markRaw);改动小但治标不治本
    - **采纳 A**:纯前端 + 后端轻量字段扩展,改动量约 +260 行 / 7 文件(后端 1 字段 + 前端重写 + utils 抽取 + 测试 8 个),UX 改善显著
  - 验收要点:**轮询间隔 60s**(2026-08-19 用户决策,写死 `BATCH_POLL_INTERVAL_MS = 60_000` 常量便于后续微调);运行中表格屏闪消失(增量 reconcile 避免整表重排);手动刷新按钮点击后立即 loading 反馈,请求成功后 loading 消失;连续点击不会触发并发请求(`inflight` 守卫);首屏加载不卡死(`firstLoad` 与 `loading` 解耦)
  - **跟进项**:MySQL 部署前需将 `BatchRun.@UpdateDateColumn` 显式声明为 `datetime(3)`(默认 fsp=0 在 reconcile 步骤 3 会有相邻 save 同秒 → 误判无变化的盲区;当前 SQLite/Postgres 不受影响,utils 文件注释已记录);也可选在 `reconcileBatchRuns` 步骤 3 增加内容比对兜底(纯前端方案)
  - **审计记录(RG-B1 / B3 / W1 / S2 / S3 / S4 已修复,S1 顺序漂移兜底留 backlog,W2 MySQL 精度 caveat 加注释)**:见 [artifacts/review-gate/2026-08-19-c54-batch-runs.md](#) + 复审放行结论

- **C55 batch-runs 孤儿运行兜底(自动化 stale-cleanup + 手动 force-fail 应急逃生口)**（M6 平台 bugfix / 2026-08-19 用户实测反馈 + commit `ce523d4`）
  - 状态:✅ **已修复（2026-08-19）** — 自动化兜底覆盖 30 分钟+ 孤儿 + admin 手动 force-fail 覆盖 30 分钟内卡死
  - 位置:`apps/platform/server/services/batch/stale-cleanup.ts` + `apps/platform/server/plugins/stale-cleanup.ts` + `apps/platform/server/api/batch-runs/[id]/force-fail.post.ts` + `apps/platform/app/pages/batch-runs.vue`(Status 列旁"强制完成"按钮)
  - 问题:`batch-runs` 页面 status='running' 但下属 ScanRun 永远 '执行中'——根因 sync 进程崩溃 / async worker SIGKILL / GitHub Action runner 永久不回执等导致 ScanRun 已落库为 running 但永远无终态
  - 用户反馈："批量运行对任务超时没有兜底，会出现一直执行中的情况"
  - 现状:执行器(ContainerExecutor / SandboxExecutor / ActionResultFetcher)有 30 分钟单次超时,但**没有"stale running 兜底"**——进程被 kill / 客户端断开 / 异常路径绕过后,ScanRun 永远 running,BatchRun 也永远聚合 running
  - 修复方向(用户采纳 A+B 组合):
    - **A 自动化**:`cleanupStaleRuns()` 扫 stale ScanRun(running/pending + startedAt/createdAt < now - 30min)+ stale BatchRun(仅当下属有 stale run 才 failed,避免误杀慢批次)+ 错误码 `orphan_run`;`server/plugins/stale-cleanup.ts` 用 defineNitroPlugin + setInterval 5 分钟(STALE_CLEANUP_INTERVAL_MS env 可覆盖)+ 30s 首跑延迟 + nitro close hook 清 timer
    - **B 手动**:`POST /api/batch-runs/[id]/force-fail` admin 权限 + 幂等(已终态直接返回不重写 finishedAt)+ 仅改 running/pending 子 run + 错误码 `force_failed`;前端按钮 in-flight 守卫 + confirm 弹窗 + 成功后清 detailMap
    - 阈值默认 30 分钟 = ContainerExecutor.timeoutMs 默认;多实例场景下阈值需评审(单组织部署足够)
  - 验收要点:stale-cleanup 7 case 覆盖空库 / stale running / stale pending / mixed / 慢批次保护 / 已终态不动 / 自定义阈值;force-fail 5 case 覆盖空 id 400 / 404 / running + 子 run / completed 幂等 / failed 幂等;review-gate 1 轮 audit-quick Pass(0 blocker + 3 warning 已修复);V 阶段 OCR 确认按钮在 running 行旁渲染(i18n dev cache 未刷新,build 后正常)
  - 关联:与 C54 batch-runs 刷新策略同一页面,但解决不同问题(C54 是"轮询 + 防抖",C55 是"孤儿兜底");backlog C53 平台 fix 推送 PR 仍待评估;M10 独立沙箱后续 cgroup v2 资源限制(T1003)可参考此处的"30 分钟阈值"经验
  - 关联:C53(后置 M11 评估)+ PR1/C47(Dialog 默认不可拖动,该页 Dialog 同样受益)
  - 来源:2026-08-19 用户反馈"刷新周期增加,但是也提供一个手动刷新按钮";2026-08-19 用户决策"轮询时间改到 60 秒"

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

> **已归档（2026-08-10）**：T701 / T707 完整记录见 [todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)；剩余 3 项真实凭据人工验收见 [todo.md 待人工验收](todo.md)。

### M7.2 平台能力深化

> **M7.2 已归档（2026-08-12）**：T702（任务队列）/ T704（定时批量）/ T708（i18n）完整记录见 [todo-archive.md §M7.2](todo-archive.md#m72-平台能力深化已归档)。
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

- 状态：✅ **已完成（2026-08-12）** — `@dependfix/mcp@0.1.2` 已发布 npm（registry 实证）。详见 [todo-archive.md §M7.2](todo-archive.md#m72-平台能力深化已归档)
- 收口说明：npm 发布闭环；剩余 skill 双后端验证与 MCP 接入文档为轻量收尾，挂 [T904 文档同步](#t904-文档同步) 跟进（不阻塞）

### M7 已确认 backlog 登记（2026-08-09，设计决策 D1/D2/D3 用户确认）

> M7.1 设计文档（[platform-auth-users.md](../design/governance/platform-auth-users.md) §11）决策点 1/2/3 确认后登记的候选项，均为 M7.1 非目标。

- **D1-repo_admin 角色 + RepositoryAccess**：仓库级管理角色（管理特定仓库修复策略）需 `RepositoryAccess` 关联表；M7.1 单组织下与 org_admin 权限面重复，未实现。触发条件：多租户/多组织需求出现，或单实例出现"仓库级管理员"真实诉求。
- **D2-username 用户名字段**：better-auth `username` 插件（user.username 字段 + 用户名设置 API）；M7.1 用户管理按 email/name 展示足够。触发条件：用户明确需要用户名体系（公开平台展示名等）。
- **D3-多租户组织体系**：better-auth `organization` 插件（Organization/Member/Invitation/Team + 成员角色 API），替代 M7.1 的自建单组织模型。触发条件：多组织/多租户部署成为真实需求（当前 AUTH_MODE 企业/公开均为单实例单组织场景）。
- **D8-remove-user 关联资源检查**（2026-08-09 T701-2 审计登记）：设计决策点 8"用户名下存在仓库/凭据关联时拒绝删除（409）"未实施——当前 Repository/Credential 不直接引用 User（仅 organization_id/credential_id，均 SET NULL），"名下资源"无数据模型载体，删除用户不产生业务数据悬空。触发条件：引入 user→resource 关联（如创建者 created_by 或 D1 的 RepositoryAccess）时随模型落地。
- **T701 管理端点集成测试补强**（2026-08-09 T701-2 审计登记，2026-08-09 实施后修订）：设计 §9 矩阵的"list-users 分页/搜索、set-role 非 admin 403、ban/unban 会话失效、remove-user 级联、个人界面 changePassword/changeEmail 闭环"未落地（当前 guard 层 11 例覆盖函数语义；用户管理/个人界面已改为 better-auth 原生端点链路，authClient 直连 `/api/auth/*`）。触发条件：引入 @nuxt/test-utils 或 e2e 基建时统一落地（T701 验收/浏览器验证阶段评估）。
- **邮件发送器统一实现**（2026-08-09 T701-3 审计登记，2026-08-18 实施完成）：sendVerificationEmail / sendResetPassword / sendChangeEmailConfirmation 三处回调均为空实现（SMTP 未配置降级为 console.warn）；SMTP_HOST 配置后注册验证/密码重置/邮箱变更确认邮件均不实际发送（M6 既有模式）。**已实施**为 [todo.md §T912 SMTP 邮件发送器](todo.md#t912-smtp-邮件发送器统一实现2026-08-18-启动)（commit a030de9 mailer service 模块 + commit dba8b62 三回调接线），用户 2026-08-18 明确指示「引入 nodemailer 实现」。**剩余项**：T912-3 安全与文档（security.md §邮件发送安全 章节与 C28 合并）待排期。
- **SAML 2.0 SSO**：企业 SSO 仅 OIDC（better-auth `genericOAuth` 原生支持，覆盖 Azure AD / Okta / Keycloak / Google Workspace）；SAML 需额外集成层（better-auth 无原生支持，成本高），登记 backlog。触发条件：企业 IdP 仅提供 SAML（如部分传统 IdP）时评估。

### M7.2 i18n 非目标登记（2026-08-11，T708 规划定稿）

> T708 国际化 i18n 已完成并归档（见 [todo-archive.md §M7.2](todo-archive.md#m72-平台能力深化已归档)）。以下为本期明确不做、随需求登记后续的项。

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
> **治理完成情况（2026-08-19 盘点）**：本节 8 项治理缺口（C38-C45 + G1-G7）截至 2026-08-14 全部已修复（M8 T801-T806 落地）——详见 [todo-archive.md §M8](todo-archive.md#m8-安全加固与容器执行完备已归档)。下表保留治理登记与精简修复记录，详细实现指向 todo-archive §M8。**唯一仍 backlog 治理项为 C26 独立沙箱容器**（已激活为 [todo.md §M10](todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动) 实施规划 P1 进行中，承接 G5 治理项）。

- **C38 平台 Dockerfile 补 `USER` 降权**（P0，设计-实现偏差）
  - 状态：✅ **已修复（2026-08-14）** — entrypoint 降权方案（dependfix 用户 uid 100 + chown 数据卷 + su-exec）实证通过。详见 [todo-archive §M8 / T-C38](todo-archive.md#m8-安全加固与容器执行完备已归档)（原实现细节已迁移）
  - 内容：`executor-sandbox.md §2.2` 明确 M6 必做"非 root 用户运行（镜像 `USER` 降权）"，但 `apps/platform/Dockerfile` 无 `USER` 指令，容器以 root 运行——恶意依赖脚本以 root 执行削弱凭据最小化收敛效果
  - 来源：2026-08-14 安全专项评估（G1）
- **C39 CLI 本地模式安全防线**（P0，威胁模型与产品形态偏差）
  - 状态：✅ **已修复（2026-08-14，T803）** — fix/fix-and-pr 启动输出本地执行风险警告（可 `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制）；`executionEnvironment: 'container'` 区分不误报。详见 [todo-archive §M8 / T-C42](todo-archive.md#m8-安全加固与容器执行完备已归档)（原 C39 + C42 合并修复于 T803）
  - 内容：威胁模型将本地执行定位"仅开发调试"，但 CLI 是产品发布形态之一——本地模式零隔离，恶意依赖脚本直接在用户机器执行、可读用户 shell 全部环境
  - 来源：2026-08-14 安全专项评估（G2）
- **C40 执行期网络外联日志与限制**（P1）
  - 状态：✅ **已修复（M8 T805，2026-08-14，外联审计部分）**；**网络隔离（白名单 deny-by-default）留 [M10 C26 / T1002](todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)**
  - 内容：M8 阶段先实现外联审计日志供事故溯源；M10 阶段升级为应用层白名单拦截代理实现网络隔离
  - 来源：2026-08-14 安全专项评估（G3）
- **C41 验证命令单命令超时与资源上限**（P1）
  - 状态：✅ **已修复（M8 T802，2026-08-14，单命令超时部分）**；**cgroup 资源限制留 [M10 C26 / T1003](todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)**
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
  - 状态：✅ **已修复（M8 T806，2026-08-14）** — `code-quality-checklist.md` §5.3 必须级条款逐项核验动作 + Code Auditor 必查项同步。详见 [todo-archive §M8 / T-C44](todo-archive.md#m8-安全加固与容器执行完备已归档)
  - 内容：`standards/security.md` §5.3 必须级条款挂接 `code-reviewer` 检查点
  - 来源：2026-08-14 沙箱安全治理 Review Gate（RG-W2）
- **C45 平台容器工具链缺失（git/pnpm 未安装）**（2026-08-14 C38 修复实证发现）
  - 状态：✅ **已修复（M8 T801，2026-08-14）** — git + pnpm 11.18.0 + workspace node_modules 补齐 + pnpm-audit legacy range 前缀假跳过 bug 修复。详见 [todo-archive §M8 / T-C45](todo-archive.md#m8-安全加固与容器执行完备已归档)
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





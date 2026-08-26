# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M14 platform 进入 release 通道（T1310 执行中）

> **阶段背景（2026-08-26 启动）**：M13 治理 + UX 反馈 + 网络治理 + Code Scanning 全部闭环（12 子任务 / 26 commits 已推送至 origin/master，ahead=3 仅 M13.4 三 commits 待用户推送：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。本阶段承接 [todo-archive.md §M13](todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环) 后的下一阶段目标：让 `apps/platform` 作为第 6 个发布单元参与 release 链路但**不发 npm**——仿 momei 单包"独立 version + 独立 CHANGELOG"的精神，适配 dependfix monorepo + docker-only 平台。
>
> **前置依赖**：M13 阶段 T1310 5 commits 已 ahead 提交并已推送至 origin/master（`300b318` 登记 / `1819b59` 注册 apps/platform 发布单元 / `733e198` publish tag-only / `7b40a2c` docker 协作 / `a74d07d` 文档 + dependabot 防御 + CHANGELOG 初始段），本阶段承接其 F 阶段闭环（CI 裁决通过 + `pnpm verify:changelog` exit 0 + `pnpm changelog` 一次性重跑产出 0.1.0 段）。
>
> **拆分方案**：T1310 单子任务按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件需拆分）拆为 **7 个原子提交**：
>
> | 子任务 | 改动范围 | commits | 风险 |
> |:---|:---|:---:|:---:|
> | T1310-A packages.config.mjs 注册 | `scripts/packages.config.mjs` | 1 | 低 |
> | T1310-B release-publish tag-only | `scripts/release-publish.mjs` + tests | 1 | 中 |
> | T1310-C docker.yml platform_version | `.github/workflows/docker.yml` | 1 | 低 |
> | T1310-D release.yml → docker.yml 触发 | `.github/workflows/release.yml` | 1 | 中 |
> | T1310-E release 文档 | `docs/guide/release.md` | 1 | 极低 |
> | T1310-F dependabot 防御 | `.github/dependabot.yml` | 1 | 极低 |
> | T1310-G apps/platform 首次 CHANGELOG | `apps/platform/CHANGELOG.md` + todo.md 收口 | 1 | 极低 |
>
> **状态**：子任务串行实施，每子任务独立 PDTFC+ 循环；上一子任务 F 阶段闭环（commit 推送）后方可启动下一子任务。本阶段与 M13.4 UX 反馈批次无文件冲突（已 ahead 提交期间确认），可与 M13.4 推送并行进行。

---

## 待人工验收（真实环境，随可用性推进）

> 以下条目属 M7.1 / M7.2 / 发布管线阶段遗留的真实环境验证任务，**不在 M12 范围内**，保留随真实环境可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

实施记录与背景：[archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

实施记录：[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

---

### M14 platform 进入 release 通道（版本号 + CHANGELOG + docker 协作）

#### T1310 platform 进入 release 通道 —— 计划 2026-08-26（执行中）

- **优先级**：P1
- **依赖**：现有发布管线（`scripts/release-publish.mjs` / `release-version.mjs` / `changelog.mjs` / `packages.config.mjs`）与 docker workflow（`.github/workflows/docker.yml`）
- **背景**：
  - `apps/platform` 是 Nuxt 应用，发布通道 = docker 镜像（`docker.yml` 在 `push:master` / `workflow_dispatch` 时自动打 `latest + YYYY-MM-DD + sha-<short>` 三种 tag，三大 registry）
  - `apps/platform/package.json` `private: true`，从未进 npm 发包链路；历史 platform 改动被聚合进根 CHANGELOG 的 `dependfix@x.y.z` 段（如 0.3.3 段 `platform:` scope 多条）
  - 缺少独立的 platform 版本号 → 镜像版本与 commit sha 二元组无法回答"用户在跑哪个 platform 版本"；缺少独立 CHANGELOG → 平台自身改动无法独立追溯
- **目标**：仿 momei 单包"独立 version + 独立 CHANGELOG"的精神，适配 dependfix monorepo + docker-only 平台，让 `apps/platform` 作为第 6 个发布单元参与 release 链路但**不发 npm**
- **非目标**：不动 5 个 npm 包（`dependfix` / `@dependfix/{core,engine,skills,mcp}`）的 OIDC 发布路径；不动 `push:master` 自动 docker 发布的 `latest+date+sha` 三元组；不抢跑 T705（生产级部署 PG+Helm+Sentry 仍按延期项处理，本任务仅做"版本号基础设施"，生产部署能力不在范围）
- **执行范围**：
  - `scripts/packages.config.mjs`：新增 apps/platform 条目（`publishable:true`、`rootChangelog:false`、`publishOrder:6`、`npmPublishable:false` 新字段）+ 头部 JSDoc 补充新字段语义
  - `scripts/release-publish.mjs`：新增 action `tag-only` —— 当 `npmPublishable === false` 时跳过 `pnpm publish` 但仍创建 annotated git tag（保证 changelog 历史可比）
  - `scripts/release-publish.test.mjs`：新增 case 覆盖 platform tag-only 路径；fixture 扩展含 platform 条目
  - `scripts/changelog.mjs`：现有 `PACKAGES.filter(p=>p.changelog)` 已能扫到新条目，无需新增代码；沿用 fallback Dependencies 段机制（platform 首次 changelog 走 fallback）
  - `.github/workflows/docker.yml`：新增前置 job `extract-platform-version` 读 `apps/platform/package.json:version`；metadata-action `tags` 增加 <span v-pre>`type=raw,value=platform-<version>,enable=${{ github.event.inputs.platform_version != '' }}`</span> 行（仅在 `workflow_dispatch` 由 release.yml 主动传参时打）
  - `.github/workflows/release.yml`：在 `Release Publish` + `Push release tags` 之后新增"触发 docker workflow_dispatch"步骤，传 `platform_version` 入参
  - `docs/guide/release.md`：发布包清单表格加 platform 行 + 单独段说明"版本号 + CHANGELOG 通道 + docker 发布三件套，与 npm publish 解耦"
  - `.github/dependabot.yml`：把 `apps/platform/package.json` 加入 ignore（避免 dependabot 接管 platform version 号）
  - `apps/platform/package.json`：version 保持 0.1.0（用户确认从 0.1.0 起）；private 保持 true；description 加一句"独立版本号 + changelog 锚定，不发 npm"
  - `apps/platform/CHANGELOG.md`：首次跑 `pnpm changelog` 自动产出（含 0.1.0 初始段）
- **关键设计决策**：
  - **`PUBLISHABLE_PACKAGES` 过滤语义不改**：当前过滤 = `publishable && ...`；release-version 与 changelog 需要它包含 platform 以驱动 dep 图与 fallback 计算；release-publish 内部加 `npmPublishable` 判定即可
  - **新增字段 `npmPublishable`**：缺省 `true`（保留 5 个现有 npm 包行为 0 改动）；仅 platform 显式置 `false`
  - **tag 仍打**（`@dependfix/platform@x.y.z`）：changelog 历史比较需 prev tag 锚点；不打 tag → 永远孤立首段，history diff 不可用
  - **docker 与 release 触发闭环**：`release.yml` 完成后主动 `workflow_dispatch docker.yml` 传 `platform_version` 入参；`docker.yml` master 自动 push 仍走 `latest+date+sha`，不挂 version tag（保持简洁时序模型：version tag = release 完成事件 = 一次性产物）
  - **dependency backflow 预期**：`apps/platform` 依赖 `@dependfix/core/engine/cli`（`workspace:*`），release:version 提升 core/engine 时 `buildDepGraph` 会让 platform 至少 patch 跟随。这是符合预期的——platform 跟着依赖方走 patch，发布节奏与引擎同步
- **验收标准**：
  - `pnpm lint` / `pnpm typecheck` 0 error
  - `pnpm test`（含新增 tag-only case）全绿
  - `pnpm verify:changelog` exit 0（含 5 包段 + 新生 apps/platform 段）
  - `pnpm changelog` 一次性重跑 → `apps/platform/CHANGELOG.md` 首次生成（含 0.1.0 段，按 path-filter 收敛 `feat(platform): / fix(platform): / refactor(platform):` 等 commits）
  - `apps/platform/package.json:version` 保持 `0.1.0`（用户确认首次版本号）
  - `pnpm --filter dependfix release:publish --dry-run` 在 platform 加入后：plan 包含 platform 条目 action=`tag-only`，**不**调用 `pnpm publish`（mock 验证），仍创建 `@dependfix/platform@0.1.0` annotated tag
  - `git log -- apps/platform/ | head` 验证 path-filter 范围与 CHANGELOG 条目数大致对应
- **风险**：
  - **release-publish.mjs action 分支穷尽性**（low→medium）：新增 `tag-only` action 后需确保 `finalizeRelease` 的 `published` 字段包含 platform（即使它未真发 npm）；测试覆盖
  - **fallback 段在 platform 首次 changelog 的可用性**（low）：platform 首次无 prev tag，需走 fallback Dependencies 段，但 platform 依赖 core/engine/cli —— 若核心段未发 tag，fallback 链解析可能缺数据；测试覆盖
  - **release.yml → docker.yml 的 workflow_dispatch**（medium）：入参 `platform_version` 必须非空才打 version tag；不带入参时 docker.yml 行为兜底为仅 latest+date+sha
  - **dependency-backflow**（low）：platform 跟着 core/engine 升 patch → 每次 dependfix 升级时 platform version 跳 patch。预期行为，无需防御
- **follow-up（登记 backlog）**：
  - T705（生产级部署 PG+Helm+Sentry）落地后，platform 1.0 节奏评估
  - T703（跨平台 GitLab/Bitbucket）落地后，platform release 触发的版本文档是否需要补"跨平台适配"段
  - docker `platform-<x.y.z>` tag 是否需要补镜像 SBOM / provenance attestation 配合（当前 ACR 个人版不支持，参考 docker.yml:111-113）
- **原子提交切分**（commit 类型按 AGENTS.md）：
  1. `chore(scripts): packages.config.mjs 注册 apps/platform 条目 + 头部注释`
  2. `chore(release): publish 跳过 npmPublishable=false 包的 pnpm publish 但仍打 git tag`（含单测）
  3. `ci(docker): docker.yml 支持从 workflow inputs 读 platform_version 并打 platform-x.y.z tag`
  4. `ci(release): release.yml 完成后触发 docker workflow_dispatch 传 platform_version`
  5. `docs(release): platform 进入版本号+CHANGELOG 通道，与 npm publish 解耦`
  6. `ci(deps): dependabot 排除 apps/platform/package.json version 字段`
  7. `docs(plan): T1310 闭环登记 + apps/platform/CHANGELOG.md 首次生成`

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留 6 段，最近 3-5 阶段近线 + M13 增量；M0-M11 详细见 [archive/](archive/)） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细分片） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M13 全部；M13 已闭环 2026-08-26） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（M14 T1310 执行中） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 持续观察项登记在 [backlog.md §主线 #1](backlog.md#主线-1primevue-4--nuxt-hydration-rowgroup-known-issue)） |

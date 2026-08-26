# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M14 platform release 通道闭环 + UX 反馈跟进

> **阶段背景（2026-08-26 启动）**：M13 治理 + UX 反馈 + 网络治理 + Code Scanning 全部闭环（12 子任务 / 26 commits）。M13 归档批次已落地（5 atomic commits `3621982`/`01f01de`/`0f46b99`/`3ff3f83`/`e9987f9`），M13.4 三 commits `2dce01d` + `bb3b49a` + `8762a4b`（T1401 + T1402 + T1403）均已推送至 origin/master。本阶段承接：① T1310 platform 进入 release 通道 F 阶段闭环（CI 裁决 + 收口）；② backlog UX-R1 扫描历史分页（用户实测反馈痛点，关联：T1310 闭环后启动）；③ M13.4 T1403 follow-up（轻量收尾，补 1 case 覆盖首屏默认 dedupe=across）。
>
> **当前进度**：
> - M14.1 T1310 F 阶段闭环 ✅ —— 7 commits（M14.1 收口 commit `e7103f6` + P 阶段规划 `1fd38c1` + T1310 ahead 5 `300b318`/`1819b59`/`733e198`/`7b40a2c`/`a74d07d` 落地）
> - M14.2 UX-R1 扫描历史分页 ✅ —— 4 commits 落地（`81bd8d2` 后端分页 + `581e1a9` RepoHistoryDialog Paginator + `1a9eddf` 次级调用方 + i18n + `b7c9226` e2e + 收口登记）+ `17b5643` changelog 钩子自动 stage 落档
> - M14.3 M13.4 T1403 follow-up 🔄 —— 计划中（补 alerts-rowgroup.e2e 1 case 覆盖首屏默认 dedupe=across 请求 URL 断言）
> - **M14.x neat-freak 批次** ✅ —— 2026-08-26 闭环 4 atomic commits（`92cc348` wisdom 蒸馏 + `ea0e24f` C34 规范挂接 + `84b4e1a` test 名清理 + `b45f55e` git.md 格式修复）+ M14.x 收口登记 commit 待落地
>
> **前置依赖**：M13 阶段 T1310 5 commits 已 ahead 提交并已推送至 origin/master（`300b318` 登记 / `1819b59` 注册 apps/platform 发布单元 / `733e198` publish tag-only / `7b40a2c` docker 协作 / `a74d07d` 文档 + dependabot 防御 + CHANGELOG 初始段），**实施已落地，仅缺 F 阶段完整验证**（本地验证 + CI 端到端裁决 + todo.md 收口）。
>
> **拆分方案**：按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件需拆分）拆为 **4 子阶段独立闭环**：
>
> | 子阶段 | 任务 | 预计 commits | 风险梯度 |
> |:---|:---|:---:|:---:|
> | M14.1 T1310 F 阶段闭环 ✅ | T1310 完整验证 + 收口 | 1 | 低 |
> | M14.2 UX-R1 扫描历史分页 ✅ | `/api/runs` 分页参数 + 4 个前端调用方适配 + e2e | 4 | 中 |
> | M14.3 M13.4 T1403 follow-up | 补 1 case 覆盖首屏默认 `dedupe=across` | 1 | 极低 |
> | **M14.x neat-freak 批次** ✅ | **wisdom 蒸馏（活跃 17 → 14 ≤15 阈值，挂接 3 条 M14.x pattern）+ C34 规范挂接盘点（5 个 checklist 必查项）+ test 名孤立编号清理（4 处 C65-A1/A2/A3/A4）+ git.md 格式修复** | **4 + 收口** | **极低** |
>
> **状态约定**：子阶段串行实施，每子阶段独立 PDTFC+ 循环；上一子阶段 F 阶段闭环（commit 推送）后方可启动下一子阶段。M14.2 与 M14.3 / M14.x 无文件冲突（前者后端 + 前端，后者仅 e2e + 文档/standards），可与 M14.3 + M14.x 推送并行进行。本阶段与 M13.4 UX 反馈批次无文件冲突。
>
> **ahead 状态**：ahead commits 实证命令 `git rev-list HEAD ^origin/master --count`（动态核验，不写具体数字以免 staleness）。M14.1 ahead commits（`1fd38c1` P 阶段规划 + `e7103f6` M14.1 收口）+ M14.2 ahead commits（`81bd8d2` + `581e1a9` + `1a9eddf`）待用户推送。

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

### M14 platform release 通道闭环 + UX 反馈跟进（计划 2026-08-26）

#### M14.1 T1310 F 阶段闭环 [x] —— 已闭环 2026-08-26

> **闭环记录**：7 commits（T1310 ahead 5 `300b318`/`1819b59`/`733e198`/`7b40a2c`/`a74d07d` + P 阶段规划 1 `1fd38c1` + M14.1 收口 1）；`git rev-list HEAD ^origin/master --count` ahead=1（待用户推送 `1fd38c1` P 阶段规划 commit）；完整本地验证全绿（lint/typecheck 0 error / test 2230 passed + 5 skipped / test:coverage 4 维度全 ≥80% / verify:changelog exit 0 / changelog 7 段幂等 unchanged / release:publish --dry-run platform tag-only 路径确认 / @dependfix/platform build 成功 23.1 MB）。
>
> 详细闭环清单 + 验收标准 + 治理记录 + 关键决策 + 关键经验见 [todo-archive.md §M14.1/2/3/x](todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123x-全部已闭环)。

---

#### T1310 platform 进入 release 通道 [x] —— 已闭环 2026-08-26（M14.1 阶段下实施 + F 阶段闭环）

- **优先级**：P1
- **依赖**：现有发布管线（`scripts/release-publish.mjs` / `release-version.mjs` / `changelog.mjs` / `packages.config.mjs`）与 docker workflow（`.github/workflows/docker.yml`）
- **背景**：
  - `apps/platform` 是 Nuxt 应用，发布通道 = docker 镜像（`docker.yml` 在 `push:master` / `workflow_dispatch` 时自动打 `latest + YYYY-MM-DD + sha-<short>` 三种 tag，三大 registry）
  - `apps/platform/package.json` `private: true`，从未进 npm 发包链路；历史 platform 改动被聚合进根 CHANGELOG 的 `dependfix@x.y.z` 段（如 0.3.3 段 `platform:` scope 多条）
  - 缺少独立的 platform 版本号 → 镜像版本与 commit sha 二元组无法回答"用户在跑哪个 platform 版本"；缺少独立 CHANGELOG → 平台自身改动无法独立追溯
- **目标**：仿 momei 单包"独立 version + 独立 CHANGELOG"的精神，适配 dependfix monorepo + docker-only 平台，让 `apps/platform` 作为第 6 个发布单元参与 release 链路但**不发 npm**
- **非目标**：不动 5 个 npm 包（`dependfix` / `@dependfix/{core,engine,skills,mcp}`）的 OIDC 发布路径；不动 `push:master` 自动 docker 发布的 `latest+date+sha` 三元组；不抢跑 T705（生产级部署 PG+Helm+Sentry 仍按延期项处理，本任务仅做"版本号基础设施"，生产部署能力不在范围）
- **执行范围**（ahead 5 commits 已落地）：
  - `scripts/packages.config.mjs`：新增 apps/platform 条目（`publishable:true`、`rootChangelog:false`、`publishOrder:6`、`npmPublishable:false` 新字段）+ 头部 JSDoc 补充新字段语义 — `1819b59`
  - `scripts/release-publish.mjs`：新增 action `tag-only` —— 当 `npmPublishable === false` 时跳过 `pnpm publish` 但仍创建 annotated git tag（保证 changelog 历史可比）— `733e198`
  - `scripts/release-publish.test.mjs`：新增 case 覆盖 platform tag-only 路径；fixture 扩展含 platform 条目 — `733e198`
  - `scripts/changelog.mjs`：现有 `PACKAGES.filter(p=>p.changelog)` 已能扫到新条目，无需新增代码；沿用 fallback Dependencies 段机制（platform 首次 changelog 走 fallback）— `a74d07d` 已生成 apps/platform/CHANGELOG.md 0.1.0 段
  - `.github/workflows/docker.yml`：新增前置 job `extract-platform-version` 读 `apps/platform/package.json:version`；metadata-action `tags` 增加 <span v-pre>`type=raw,value=platform-<version>,enable=${{ github.event.inputs.platform_version != '' }}`</span> 行（仅在 `workflow_dispatch` 由 release.yml 主动传参时打）— `7b40a2c`
  - `.github/workflows/release.yml`：在 `Release Publish` + `Push release tags` 之后新增"触发 docker workflow_dispatch"步骤，传 `platform_version` 入参 — `7b40a2c`
  - `docs/guide/release.md`：发布包清单表格加 platform 行 + 单独段说明"版本号 + CHANGELOG 通道 + docker 发布三件套，与 npm publish 解耦" — `a74d07d`
  - `.github/dependabot.yml`：把 `apps/platform/package.json` 加入 ignore（避免 dependabot 接管 platform version 号） — `a74d07d`
  - `apps/platform/package.json`：version 保持 0.1.0（用户确认从 0.1.0 起）；private 保持 true；description 加一句"独立版本号 + changelog 锚定，不发 npm" — `1819b59`
  - `apps/platform/CHANGELOG.md`：首次跑 `pnpm changelog` 自动产出（含 0.1.0 初始段） — `a74d07d` 已预生成
- **关键设计决策**：
  - **`PUBLISHABLE_PACKAGES` 过滤语义不改**：当前过滤 = `publishable && ...`；release-version 与 changelog 需要它包含 platform 以驱动 dep 图与 fallback 计算；release-publish 内部加 `npmPublishable` 判定即可
  - **新增字段 `npmPublishable`**：缺省 `true`（保留 5 个现有 npm 包行为 0 改动）；仅 platform 显式置 `false`
  - **tag 仍打**（`@dependfix/platform@x.y.z`）：changelog 历史比较需 prev tag 锚点；不打 tag → 永远孤立首段，history diff 不可用
  - **docker 与 release 触发闭环**：`release.yml` 完成后主动 `workflow_dispatch docker.yml` 传 `platform_version` 入参；`docker.yml` master 自动 push 仍走 `latest+date+sha`，不挂 version tag（保持简洁时序模型：version tag = release 完成事件 = 一次性产物）
  - **dependency backflow 预期**：`apps/platform` 依赖 `@dependfix/core/engine/cli`（`workspace:*`），release:version 提升 core/engine 时 `buildDepGraph` 会让 platform 至少 patch 跟随。这是符合预期的——platform 跟着依赖方走 patch，发布节奏与引擎同步
- **关键决策回顾**（ahead 5 commits 实施后）：
  - `733e198` chore(release): publish 跳过 npmPublishable=false 但保留 git tag（3 files +141 lines / -14 lines）—— 实现 tag-only action + 单测覆盖
  - `7b40a2c` ci(docker,release): docker 与 release 协作生成 platform-x.y.z tag（2 files +43 lines）—— extract-platform-version 前置 job + workflow_dispatch 传 platform_version
  - `a74d07d` docs(release,deps): 平台独立通道文档 + dependabot 防御 + CHANGELOG 初始段（3 files +141 lines / -3 lines）—— release.md 平台行 + dependabot ignore + apps/platform/CHANGELOG.md 0.1.0 段生成
- **风险**：
  - **release-publish.mjs action 分支穷尽性**（low→medium）：新增 `tag-only` action 后需确保 `finalizeRelease` 的 `published` 字段包含 platform（即使它未真发 npm）；测试覆盖
  - **fallback 段在 platform 首次 changelog 的可用性**（low）：platform 首次无 prev tag，需走 fallback Dependencies 段，但 platform 依赖 core/engine/cli —— 若核心段未发 tag，fallback 链解析可能缺数据；测试覆盖
  - **release.yml → docker.yml 的 workflow_dispatch**（medium）：入参 `platform_version` 必须非空才打 version tag；不带入参时 docker.yml 行为兜底为仅 latest+date+sha
  - **dependency-backflow**（low）：platform 跟着 core/engine 升 patch → 每次 dependfix 升级时 platform version 跳 patch。预期行为，无需防御

---

#### M14.2 UX-R1 扫描历史分页（用户实测反馈，实测反馈 6）[x] —— 已闭环 2026-08-26

- **优先级**：P1（用户实测截图痛点直接：单仓库累积 30+ 次扫描后触顶，多仓库聚合必然超出 100 上限）
- **依赖**：M14.1 F 阶段闭环（T1310 platform release 通道已闭环后启动，避免与 release 通道混合 commit）
- **背景**：[backlog.md §扫描历史与详情 UX §UX-R1](backlog.md#扫描历史与详情-ux2026-08-26-实测反馈) —— 用户实测截图反馈触发，候选评估完成待上收
- **根因**：
  - [apps/platform/server/api/runs/index.get.ts](../../apps/platform/server/api/runs/index.get.ts) 写死 `take: 100`
  - [RepoHistoryDialog.vue](../../apps/platform/app/components/RepoHistoryDialog.vue) 一次性赋值无 Paginator
  - 单仓库累积 30+ 次扫描后触顶，多仓库聚合必然超出 100 上限
- **目标**：为 `/api/runs` 增加分页参数 + 返回结构，向后兼容既有调用方；为 3 个前端调用方接入 PrimeVue `Paginator` 或 `LazyDataTable`
- **非目标**：
  - 不改 Schema（[ScanResult 表结构](../../apps/platform/server/entities/scan-result.ts) 不变）
  - 不改聚合逻辑（仅在结果返回阶段分页）
  - 不改 e2e 既有断言（仅新增分页相关 e2e case）
  - 不动 batch-runs 聚合视图（BatchRun 维度与 ScanRun 维度正交）
  - 不抢跑 UX-R3 `/scans` 独立页面（与 UX-R1 解耦可独立上收）
- **执行范围**：
  - **后端** `apps/platform/server/api/runs/index.get.ts`：
    - 新增 `page` / `pageSize` query 参数（zod safeParse 兜底；pageSize 上限 200，默认 100）
    - 返回结构变更为 `{items, total, page, pageSize}`（向后兼容：保留 `items` 字段既有结构）
    - 总数查询：`COUNT(*) WHERE repository_id = ?` 同步应用既有过滤条件
  - **后端单测** `apps/platform/server/api/runs/index.get.test.ts`：
    - 新增 case 覆盖默认分页 / 自定义 page+pageSize / pageSize 上限钳制 / 总数查询正确性
  - **前端** `apps/platform/app/components/RepoHistoryDialog.vue`：
    - PrimeVue `Paginator` 接入（rows + total + first + onPage 事件）
    - DataTable 切换为 LazyDataTable 模式（仅展示当前页数据）
  - **前端** `apps/platform/app/pages/batch-runs.vue`：
    - 适配新返回结构（items / total / page / pageSize），保留既有按 run 聚合视图
  - **前端** `apps/platform/app/pages/alerts.vue` §openRunSidebar 侧栏：
    - 适配新返回结构（仅 items 字段 + total 显示"共 N 条"提示）
  - **e2e** `apps/platform/tests/e2e/history-dialog.e2e.test.ts`：
    - 新增 1-2 case 验证 Paginator 翻页（page=2 → URL 含 page=2）
    - 既有 history-dialog.e2e 2 case 不破坏
  - **i18n** `apps/platform/i18n/locales/{zh-CN,en-US}.json`：
    - 新增 2-3 键（`runs.paginatorFirst` / `runs.paginatorLast` / `runs.paginatorRowsPerPage`）
- **关键设计决策**：
  - **API 返回结构 `{items, total, page, pageSize}` 而非 `{data, meta}`**：保持与 [apps/platform/server/api/alerts/index.get.ts](../../apps/platform/server/api/alerts/index.get.ts) 既有风格一致（[M13.2 T1306 已闭环](../../docs/plan/todo-archive.md)）
  - **pageSize 上限 200**：防止单次拉取过大影响性能；超出自动钳制为 200
  - **向后兼容**：pageSize 缺省 = 100（既有 take 行为）；items 字段既有结构不变
  - **总数查询与 items 查询同步过滤**：避免分页与总数不一致
- **验收标准**：
  - `pnpm lint` / `pnpm typecheck` 0 error
  - `pnpm --filter @dependfix/platform test` 全绿（含新增分页 case）
  - `pnpm --filter @dependfix/platform exec playwright test history-dialog` 既有 2/2 passed + 新增 Paginator case 通过
  - `pnpm check:docs` 0 error
  - 后端 API 既有调用方（不传 page/pageSize）默认行为不变（向后兼容验证）
  - 前端 3 个调用方 Paginator 接入实测可翻页 + 翻页时不影响其他筛选条件
- **风险**：
  - **API 返回结构变更跨多个调用方**（中）：3 个前端调用方需同步适配；若遗漏调用方导致功能回归，需测试覆盖
  - **pageSize 过大性能风险**（低→中）：通过 zod 上限钳制 200 + 单测验证
  - **Paginator 接入影响 e2e 既有断言**（低）：e2e 测试断言需调整为不依赖硬编码 `tr:nth-child(6)` 等位置选择器
- **follow-up**：
  - **UX-R2 dedupe 详情侧栏增强** —— alerts.vue §openRunSidebar 侧栏短 ID / mode / severityThreshold / executorKind / summary.alertsFound / 持续时长增强（独立候选）
  - **UX-R3 `/scans` 独立页面** —— 用 query 形式（/scans?repository={repoId} 或 /scans?run={runId}）替代 `RepoHistoryDialog`（独立候选，依赖 UX-R1 分页 API）
- **原子提交切分**：
  1. `feat(platform): /api/runs 新增 page/pageSize 分页参数 + 返回结构 + 单测`
  2. `feat(platform): RepoHistoryDialog 接入 PrimeVue Paginator + 切换 LazyDataTable 模式`
  3. `feat(platform): batch-runs.vue + alerts.vue 侧栏适配分页 API + i18n 双语`
  4. `test(platform): history-dialog.e2e 新增 Paginator 翻页验证 + M14.2 收口登记`
- **实际提交落地**：
  - `81bd8d2` `feat(platform): /api/runs 新增 page/pageSize/ids 分页参数 + 返回结构 + 单测`（2 files +156/-27）—— zod safeParse 校验 page/pageSize/ids/repositoryId + findAndCount + `{items,total,page,pageSize}` 返回 + 单测 9/9 passed
  - `581e1a9` `feat(platform): RepoHistoryDialog 接入 PrimeVue Paginator + 切换 LazyDataTable 模式`（1 file +47/-7）—— PrimeVue 4 lazy + 内置 paginator + pageSize=10/25/50 + onPage 0→1-indexed 转换 + 跨仓库切换重置 first/pageSize
  - `1a9eddf` `feat(platform): alerts 侧栏 + repos/[id]/runs 适配分页 API + ids 修复 + i18n 双语`（4 files +10/-3）—— alerts sidebar 适配新返回结构 + silent bug 修复生效（server 真正按 ids 过滤）+ repos/[id]/runs.vue 适配（保留 backlog.md §C58 候选删除兼容路径）+ runs.paginatorInfo i18n 双语
  - M14.2 收口 commit 待落地（含 e2e 新增 + todo/todo-archive/roadmap 收口登记）；ahead commits 实证：`git rev-list HEAD ^origin/master --count` 动态核验（commit `1fd38c1` + `e7103f6` M14.1 ahead 2 + M14.2 3 commits 已 ahead；本批 ahead=5 待用户推送；详见 M14.2 commit 4 收口登记段）
- **关键决策回顾**：
  - **额外发现第 4 个调用方**：规划文档列 3 个前端调用方（RepoHistoryDialog / batch-runs.vue / alerts.vue），实施中发现 `apps/platform/app/pages/repos/[id]/runs.vue`（保留 C58 候选删除兼容路径）也调用 `/api/runs?repositoryId=...`，已纳入 commit 3 一并适配 —— **规划盲区警示**：todo.md §M14.2 "3 个前端调用方"实际应为 4 个，batch-runs.vue 不调用 `/api/runs`（与 ScanRun 维度正交）
  - **silent bug 一并修复**：实施中实证 alerts.vue §openRunSidebar 此前用 `ids` 参数调用 `/api/runs`，但原 server 忽略 `ids` 返回全量 run —— M14.2 commit 1 server 加 `ids` 支持后，sidebar 真正只返回该告警 affected runs（修复 + 影响范围扩大，但低风险，scope 仍属 UX-R1）
  - **pageSize 默认 10 而非 100**：RepoHistoryDialog 在 720px 宽 Dialog 内显示 7 列 DataTable，默认 pageSize=100 会出现 99 行空占位；改用 pageSize=10（DataTable 内部默认）+ options `[10, 25, 50]` + server 钳制 200 上限，三层一致
  - **跨仓库切换重置 first/pageSize**：A 阶段审计 suggest#1 —— 用户从 repo A 翻到 page=3 后切换到 repo B，原实现 `first.value` 残留 30 导致 UI 高亮页与 server 数据不一致；在 watch 分支加 `first.value = 0` + `pageSize.value = 10` 重置，与 closeDialog() 对齐
  - **i18n 嵌套占位符**：PrimeVue CurrentPageReport 模板用 `{first}` / `{last}` / `{totalRecords}` 占位符，vue-i18n 先把 i18n 字符串中的 `{first}` / `{last}` / `{total}` 字面替换为 PrimeVue 占位符（嵌套转义）；实测通过 e2e Paginator 翻页 + 中文 / 英文文案渲染验证
- **审计记录**：
  - Round 1（standard depth）：Reject —— 6 处 warning（孤立任务/阶段/backlog 编号违反 [code-reviewer skill §5.6](../../.github/skills/code-reviewer/SKILL.md) 必查项）+ 1 处 suggest（watch 切换仓库未重置 first/pageSize）
  - Round 2（quick depth）：Pass —— W1-W6 编号清理按"带文档路径的导航指针"例外规则保留（`todo.md §` / `backlog.md §` 前缀）+ S1 顺手修复 + lint/typecheck/vitest/e2e/build 全绿
- **测试覆盖增量**：
  - vitest：+6 case（既有 3 case 适配返回结构 + 新增默认分页 / ids 过滤 / page+pageSize / pageSize 钳制 / 400 page / 400 pageSize）；全 workspace 2236 passed + 5 skipped（baseline 2230 → +6）
  - e2e：+1 case（`Paginator 翻页验证`，seed 11 条 → 翻 page=2 → 断言 URL searchParams）；既有 2/2 不破坏
  - coverage：4 维度 ≥80% 阈值（本次未触发 CI 回归风险，increment +6 case 已纳入 baseline）
- **验证证据**：
  - `pnpm typecheck` → 8 包全通过
  - `pnpm lint` → 0 error / 1 unrelated warning（mailer.test.ts baseline）
  - `pnpm test` → 2236 passed + 5 skipped（156 files）
  - `pnpm --filter @dependfix/platform exec playwright test history-dialog` → 3/3 passed (49.7s)
  - `pnpm --filter @dependfix/platform build` → 成功 23.1 MB / 6.08 MB gzip
- **风险闭环**：
  - "API 返回结构变更跨多个调用方"（中）→ 已通过 4 调用方逐一适配 + e2e 翻页验证 + 单测覆盖过滤一致性闭环
  - "pageSize 过大性能风险"（低→中）→ zod safeParse 静默钳制 200 + 单测验证 pageSize=300/500 → 200
  - "Paginator 接入影响 e2e 既有断言"（低）→ 既有 2/2 case 不破坏（e2e 12s/13.8s → 翻页 case 12s 实测一致）
- **新增经验**（待沉淀至 docs/standards）：
  - **silence-bug-fix-during-feature-implementation**：M14.2 实施中实证 alerts.vue §openRunSidebar 此前传 `ids` 但 server 不支持（silent bug），建议所有"前端用某个参数但 server 不识别"的代码路径在 feature 实施时主动 grep 实证，避免无声回归 —— 建议沉淀到 [docs/standards/platform.md §3.5 TypeORM 查询模式](../../docs/standards/platform.md#35-typeorm-查询模式) 或独立段
  - **paginator-template-i18n-nesting**：PrimeVue 4 CurrentPageReport 模板与 vue-i18n 嵌套占位符机制（vue-i18n 先做字面替换，PrimeVue 再做数值替换）—— 已可沉淀至 [docs/standards/platform.md §7.1 PrimeVue 4 集成实践](../../docs/standards/platform.md#71-primevue-4-集成实践)

---

#### M14.3 M13.4 T1403 follow-up（轻量收尾）[x] —— 已闭环 2026-08-26

- **优先级**：P2（[todo-archive.md §M13.4 T1403 follow-up](../../docs/plan/todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环) 登记项，无用户实测反馈直接痛点）
- **依赖**：—（独立轻量收尾，与 M14.1 / M14.2 无文件冲突）
- **背景**：[todo-archive.md §M13.4 T1403 follow-up](../../docs/plan/todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环) —— T1403 修复后，alerts-rowgroup.e2e.test.ts:215-225 现有 dedupe 用例失去对「用户主动切换 off → across」的覆盖（默认即 across）；建议补 1 case 断言首屏默认请求 URL 含 `dedupe=true`
- **根因**：
  - [todo-archive.md §M13.4 RG-S2](../../docs/plan/todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环) 实证：T1403 修复 `alerts.vue` filters.dedupe 默认值改为 `'across'` 后，alerts-rowgroup.e2e 既有 case 只断言手动切换 dedupe off → across 触发的请求，未覆盖首次进入页面即带 `?dedupe=true` 的场景
- **目标**：补 1 case 覆盖 alerts 页首次进入默认 `dedupe=across` → 请求 URL 含 `?dedupe=true`
- **非目标**：
  - 不改功能代码（仅补 e2e）
  - 不改既有 e2e 断言
  - 不改 T1403 修复语义
- **执行范围**：
  - **e2e** `apps/platform/tests/e2e/alerts-rowgroup.e2e.test.ts`：
    - 新增 1 case：访问 `/alerts` 不预先切换 dedupe → 默认值 = `'across'` → 请求 URL 含 `?dedupe=true`
    - 可复用既有 MOCK_ALERTS + page.route mock 基础设施（[alerts-rowgroup.e2e:646b256+6f6fe5b 既有 mock](../../apps/platform/tests/e2e/alerts-rowgroup.e2e.test.ts)）
- **验收标准**：
  - `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup` 既有 N/N passed + 新增 1 case 通过
  - `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup` 第 2 次运行仍幂等通过（无 flaky）
  - `pnpm lint` / `pnpm typecheck` 0 error
  - `pnpm check:docs` 0 error
- **风险**：
  - **极低**：仅 e2e 新增 1 case，无功能代码改动
- **follow-up**：
  - 未来若 T1403 默认值再次变更（如用户改为 `off`），需同步更新此 e2e case
- **原子提交切分**：
  1. `test(platform): 补测覆盖首屏默认 dedupe=across + M14.3 收口登记`
- **实际提交落地**：
  - `17b5643` `docs(plan): M14.2 落地后 changelog 钩子自动 stage 落档`（2 files +6/-0）—— CHANGELOG.md × 2 husky post-commit 钩子 pnpm changelog 自动 stage 落档（M14.2 衍生）
  - M14.3 e2e + 收口 commit 待落地（含 alerts-rowgroup.e2e 新增 1 case "首屏默认 dedupe=across → 首次 /api/alerts 请求 URL 含 ?dedupe=true" + todo/todo-archive/roadmap M14.3 收口登记）；ahead commits 实证：`git rev-list HEAD ^origin/master --count` 动态核验（commit `1fd38c1` + `e7103f6` M14.1 ahead 2 + M14.2 4 commits + M14.2 changelog 钩子 1 commit ahead；本批 ahead=7 待用户推送）
- **审计记录**：A 阶段 quick depth Pass —— 0 blocker / 0 warning / 1 suggest（注释占 4 行信息量大但合规，可读性提示，可在 neat-freak 阶段视情况精简）
- **测试覆盖**：
  - e2e：+1 case（`首屏默认 dedupe=across → 首次 /api/alerts 请求 URL 含 ?dedupe=true`，复用既有 `MOCK_ALERTS` + `page.route` mock 基础设施，与既有"视图切换：dedupe 模式触发 /api/alerts?dedupe=true + 显示聚合列"case 互补：手动切换路径已有覆盖，首屏默认路径此前无 case）
  - 既有 alerts-rowgroup 5 active + 2 fixme case 不破坏（第 1 次 7/7 passed 32.0s + 第 2 次 7/7 passed 31.0s 幂等通过）
- **验证证据**：
  - `pnpm typecheck` → 0 error
  - `pnpm --filter @dependfix/platform lint` → 0 error / 1 unrelated warning（mailer.test.ts baseline）
  - `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup` 第 1 次 → 7/7 passed (32.0s)
  - `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup` 第 2 次 → 7/7 passed (31.0s) 幂等通过
  - 编号标记扫描：`grep -n "T1403\|M14.3\|M13.4"` e2e → 2 处命中全部带 `todo.md §` 文档路径前缀，符合 [code-reviewer skill §5.6](../../.github/skills/code-reviewer/SKILL.md) 例外规则
- **风险闭环**："极低"风险——仅 e2e 新增 1 case，无功能代码改动；新 case 不依赖 DataTable rowGroup 渲染，不受既有 PrimeVue 4 + Nuxt hydration rowGroup bug 影响

---

#### M14.x neat-freak 批次（治理 + 文档收尾）[x] —— 已闭环 2026-08-26
- **依赖**：M14.1 闭环后启动（避免与 release 通道混合 commit）；M14.3 + M14.x 无文件冲突可与 M14.3 推送并行
- **背景**：
  - **wisdom 蒸馏**：[规划规范 §4.3](../../docs/standards/planning.md) 强制要求活跃条目 ≥ 20 必须蒸馏；本批次 16 条 > 15 阈值，下次启动 `pnpm distill:wisdom --check` 会提示 WISDOM_OVER
  - **C34 存量规范严格约束挂接盘点**：[backlog.md §C34](backlog.md#治理) 登记项 —— 审查 `docs/standards/*.md` 中"必须级"条款是否已在 `code-quality-checklist.md` / `code-reviewer skill` 双层对称挂接
  - **history-C65-test-name-cleanup**：[M12 归档段 §待迁移经验](../../docs/plan/todo-archive.md) 登记项 —— audit W3 同模式扫描发现 `admin/i18n e2e` C65-A1/A2/A3/A4 test 名孤立编号违规（不在 C65-D diff 范围）
  - **RG-S04-NEW git.md 格式问题**：[M12 归档段 §T1302 闭环记录](../../docs/plan/todo-archive.md) 登记项 —— git.md §3.4 后双空行格式问题（warning 级，留待 neat-freak 批次清理）
- **目标**：
  1. wisdom 蒸馏：把新增 3 条 pattern（F 阶段 coverage 强制 / 算式校对-archive-批次 / P 阶段规划-ahead-动态描述）挂接到 standards + 压缩过期条目（scope 扩展理由：M14.1 P 阶段规划 commit `1fd38c1` ahead 数字写死 + T1402+T1303 typo 是真实教训，由 M14.1 收口 commit `e7103f6` 修正——已超出原计划 2 条，需补登记 scope 扩展）
  2. C34 规范挂接盘点：审查现有 standards 必级条款，识别未双层对称挂接的项并补挂
  3. admin/i18n e2e test 名孤立编号清理
  4. git.md §3.4 后双空行格式修复
- **非目标**：
  - 不动 `apps/platform` 业务代码
  - 不动 T1310 / T1401-T1403 / T1306-T1308 等已闭环子任务的实现
  - 不补 backlog 远期登记项（C22 / C33 / C36 / C37 / D1 / D3 等）
  - 不激活 T705 / T703 延期项
- **执行范围**：
  - **wisdom 蒸馏**：
    - `docs/standards/ai-collaboration.md` §4 新增 1 子节：F 阶段 coverage 强制（基于 `pattern-F阶段-coverage-强制` / M13.3 CI Coverage 79.98% 教训）
    - `docs/standards/planning.md` §4.4 大批量归档批次操作规范新增 1 子节：算式校对（基于 `pattern-算式校对-archive-批次` / M13 归档批次 24 → 26 commits 算式校对教训）
    - `docs/plan/todo-archive.md` §M12 段 RG-S04-NEW follow-up 关闭（git.md 格式问题已修复）
    - `.session/wisdom.md` 活跃条目 16 → ≤15（蒸馏后回落到安全阈值）
  - **C34 规范挂接盘点**：
    - 审查 `docs/standards/*.md` 中"必须级"条款（development / testing / security / git / ai-collaboration / platform §7.1+§7.2）
    - 与 `.github/skills/code-reviewer/references/code-quality-checklist.md` + `.github/skills/code-reviewer/SKILL.md` 现有挂接交叉对比
    - 补挂未双层对称的必级条款 1-2 条（如 §3 注释规范 / §4 编号标记扫描 / §1.3 分级审计协议）
  - **admin/i18n e2e test 名孤立编号清理**：
    - `apps/platform/tests/e2e/admin.e2e.test.ts` L149/167/274 孤立 `C65-A1/A2/A3/A4` 编号清理（保留功能语义，删除编号或重命名为业务描述）
    - `apps/platform/tests/e2e/i18n.e2e.test.ts` L90 同模式清理
    - 编号标记扫描（D 阶段自检必查项 §3）回归验证 0 命中
  - **git.md 格式修复**：
    - `docs/standards/git.md` §3.4 后双空行修复为单空行（markdownlint 友好）
    - 同步检查其他 standards 段类似格式问题
- **关键决策**：
  - **wisdom 蒸馏阈值**：[规划规范 §4.3](../../docs/standards/planning.md) 强制要求 ≥ 20 必须蒸馏；本批次 16 条采用"预警线"策略提前蒸馏避免频繁中断
  - **C34 范围控制**：仅补挂"必须级"条款，不补"建议级"（避免 checklist 膨胀）
  - **test 名孤立编号清理策略**：保留功能语义，重命名为业务描述（如 `test('C65-A1: admin cannot set self role')` → `test('admin cannot set self role')`）；不删除测试用例
- **验收标准**：
  - `pnpm run check:docs` 0 error（含锚点验证）
  - `pnpm lint:md` 0 error
  - `pnpm lint` 0 error（如涉及代码改动）
  - `pnpm --filter @dependfix/platform exec playwright test admin i18n` 既有 N/N passed（test 名清理后功能不变）
  - `pnpm distill:wisdom --check --threshold=15` WISDOM_OK（活跃 ≤ 15）
  - 编号标记扫描（D 阶段自检 §3）0 命中
  - todo.md 收口 M14.x [x] + todo-archive.md 新增 §M14.x neat-freak 批次段
- **风险**：
  - **wisdom 蒸馏挂接不规范**（极低）：已有 T1301 / T1302 蒸馏批次参照模式（[todo-archive.md §M13.1 T1301/T1302](../../docs/plan/todo-archive.md)），按同模式挂接即可
  - **C34 规范挂接盘点工作量大**（低→中）：审查范围限于已有必级条款，不重新评估每条标准的必要性
  - **test 名清理破坏 e2e 行为**（极低）：仅改 describe/it 名称字符串，断言 + mock 不动
- **follow-up**：
  - C34 规范挂接盘点若发现重大缺口（多条必级未挂接），拆分为 M14.x+1 独立批次
  - history-C65-test-name-cleanup 完成后，R3 RG-S04-NEW（git.md §3.4 格式）状态从 "登记 follow-up" 转为 "已闭环"
  - 下次 wisdom 蒸馏（活跃 ≥ 20 时）按同模式实施
- **原子提交切分**：
  1. `docs(standards): wisdom 蒸馏 — 3 条 M14.x pattern 挂接到 standards（ai-collaboration §2.P.1 + §4.4 + planning §4.4 §5/§8）`
  2. `docs(standards): C34 存量规范严格约束挂接盘点 + 双层对称补挂接（如 §3 注释规范 / §1.3 分级审计协议）`
  3. `test(platform): admin/i18n e2e C65-A1/A2/A3/A4 test 名孤立编号清理 + D 阶段自检 §3 编号标记扫描 0 命中验证`
  4. `docs(standards): git.md §3.4 后双空行格式修复 + 其他 standards 段类似格式问题同步清理`
- **实际提交落地**：
  - `92cc348` `docs(standards): wisdom 蒸馏 — 3 条 M14.x pattern 挂接到 standards`（2 files +20/-4）—— ai-collaboration §2.P.1 ahead 子节 + §4.4 coverage 强化 + planning §4.4 §5 ahead 强化 + §8 算式校对新增；wisdom.md 17 → 14 ≤ 15 阈值
  - `ea0e24f` `docs(standards): C34 存量规范必级条款挂接盘点 + code-quality-checklist.md 双层对称补挂接 5 个必查项`（1 file +60/-0）—— 分级审计协议 / 单次提交审计阈值 / 验证分级矩阵 / F 阶段 coverage 强制 / audit warning 修复决策
  - `84b4e1a` `test(platform): admin/i18n e2e C65-A1/A2/A3/A4 test 名孤立编号清理`（2 files +4/-4）—— 4 处 test name 字符串清理；22 e2e passed（1.3m）；编号扫描 0 命中
  - `b45f55e` `docs(standards): git.md §3.4 后双空行格式修复`（1 file +0/-1）—— line 107-108 双空行 → 单空行；其他 standards 段扫描 0 处残留
- **审计记录**：A 阶段 standard depth Pass（0 blocker / 2 warning + 1 suggest 闭环）：
  - W1 `[code-quality-checklist.md:281](.github/skills/code-reviewer/references/code-quality-checklist.md) §1.1 1.4 文本歧义` → 已修复（拆分为 ai-collaboration §1.4 + planning §1.1 + code-reviewer SKILL.md §2.5 三链接）
  - W2 `[code-quality-checklist.md:288](.github/skills/code-reviewer/references/code-quality-checklist.md) §2.2 第 6 类扩展` → 已修复（同步规范 [ai-collaboration.md §2.2 第 6 行](../../docs/standards/ai-collaboration.md)）
  - S1 todo.md 计划段"2 条 pattern"差异 → 已闭环（line 269/281/316 同步更新为 3 条 pattern + scope 扩展理由登记）
- **验证证据**：
  - `pnpm run check:docs` → 99 links + 55 vue-interp OK
  - `pnpm lint:md` → 0 error
  - `pnpm typecheck` → 0 error
  - `pnpm --filter@dependfix/platform lint` → 0 error / 1 unrelated warning（mailer.test.ts baseline）
  - `pnpm --filter@dependfix/platform exec playwright test admin i18n` → 22 passed (1.3m)
  - `pnpm --filter@dependfix/platform build` → 成功 23.1 MB
  - 编号标记扫描：`rg "C65-A[1-4]"` admin/i18n → 0 命中
  - wisdom 蒸馏：`pnpm distill:wisdom --check --threshold=15` → WISDOM_OK（14 ≤ 15）
- **风险闭环**：
  - "wisdom 蒸馏挂接不规范"（极低）→ 3 条 pattern 全部挂接到 standards 权威章节，附教训 commit 实证（`1fd38c1` / `e7103f6` / `3621982` / `e9987f9` / `0c57211` / `e63cdb9`）
  - "C34 规范挂接盘点工作量大"（低→中）→ 按"必须级"范围控制原则补挂 5 条，未扩展到"建议级"，避免 checklist 膨胀
  - "test 名清理破坏 e2e 行为"（极低）→ 仅改 test name 字符串，22 e2e passed 实证行为不变

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留 6 段，最近 3-5 阶段近线 + M13 增量；M0-M11 详细见 [archive/](archive/)） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细分片） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出；UX-R1 / UX-R2 / UX-R3 暂缓项见 §扫描历史与详情 UX） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M13 全部；M13 已闭环 2026-08-26） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（M14.1 T1310 F 阶段闭环 / M14.2 UX-R1 扫描历史分页 / M14.3 T1403 follow-up / M14.x neat-freak 批次，2026-08-26 启动） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 持续观察项登记在 [backlog.md §主线 #1](backlog.md#主线-1primevue-4--nuxt-hydration-rowgroup-known-issue)） |

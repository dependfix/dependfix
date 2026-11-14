# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M60 平台减法与沙箱可用性**（2026-11-14 规划，混合方案 C：减法 3 原子 + 沙箱 2 原子） |
| 下一阶段（未规划） | 第四期「文档与 AI 治理」；M59 沙箱残余（交付载体 / 视觉抖动 / env 硬化 / registry 预检等）留在 backlog |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M59 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M59 已归档；M60 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M60 平台减法与沙箱可用性（2026-11-14 规划，混合方案 C）

> **目标**：把平台页面侧的体量 / 死代码 / 同源展示口径一次性收敛，同时让沙箱执行器从「配置了也必然降级」变为「按部署形态可判定、可启用、可排障」。混合方案（用户 2026-11-14 选择）：减法 3 原子 + 沙箱 2 原子；交付载体（issue / 草稿 PR）与视觉抖动治理留在 backlog。
> **来源**：用户 2026-11-14「开始下阶段规划」+ 方案 C 选择；backlog 上收 8 条候选（页面体量 / 闲置解构 / 死代码 / 筛选抽取 / 标签 helper / severity 单点化 / 容器部署启用沙箱 / 沙箱启用与排障文档），候选池 47 → 39。
> **§3.4 阶段启动交叉核验（2026-11-14 实测）**：① 归档扫描 `页面体量|max-lines|死代码|筛选.*收敛|沙箱.*启用` → 无同题闭环（M14 S3 记录 alerts.vue 当时的 827 行未触发规则、未拆分；M16 S-1 仅 `SCAN_PENDING_MERGED` 单点死代码）；② `git log --oneline -- apps/platform/app/pages/{scans,alerts,repos}.vue` → 最近均为功能增量（分页状态 / 排序筛选），无拆分批次；③ 代码 anchor：`wc -l` = scans 1115 / alerts 900 / repos 885（非空行 1033 / 842 / 816）；`alerts.vue:278` 仍有闲置 `useFixNow` 解构；`settings.vue:58-59` 仍内联 severity 查找；`repo-history-dialog` 仅 `scans.vue:982` 挂载、`repos/[id]/runs.vue` 标注「保留兼容」。
> **容量基线（逐原子交付物求和，执行角色口径）**：commits 18-27（7-10 + 2-3 + 3-4 + 4-6 + 2-4）；files 37-54（12-18 + 4-6 + 5-8 + 11-14 + 5-8）；行 1950-3010（1050-1560 + 100-200 + 150-250 + 400-600 + 250-400）。
> **类型平衡**：🛠️2（M60.1 / M60.2）+ 🎨1（M60.3）+ 🛡️🚀1（M60.4）+ 📚1（M60.5）；🧪 内嵌各原子（拆分类跑 visual + e2e，沙箱类补自检与降级用例）。**🎨 缺口显式标注**：独立 UX 条目仅 1 项（低于建议值 2），理由是本期定位为「减法」，新增体验项由第四期「文档与 AI 治理」之后的体验批次承接；交付载体（issue / 草稿 PR）与视觉抖动治理留在 backlog，不属能力扩展缺口。
> **执行顺序**：M60.1 → M60.2 → M60.3 → M60.4 → M60.5（先让页面侧落定，再动执行面与文档；文档最后写，避免实现口径未定型时先固化）。
> **D 阶段决策点**：D1 页面拆分粒度（按「展示块 / 交互逻辑 / 数据派生」三层，优先纯展示子组件）；D2 死代码判定门槛（`rg` 零引用 + 路由 / 组件挂载点核对 + e2e 覆盖确认，缺一不删）；D3 容器部署是否默认内置 docker CLI（默认 **不内置**，用构建参数 opt-in，避免默认扩大攻击面）；D4 沙箱自检端点权限（管理员可见，只读，不返回 token；allowlist 只展示 host，不展示凭据类配置）。

### M60.1 平台大页面体量拆分（P2 🛠️）

- **目标**：`repos.vue` / `alerts.vue` / `scans.vue` 三页回到 `max-lines` 健康区间（ESLint 判定 `warning` 消失；非空行口径 ≤800），拆出可复用展示块与派生逻辑，行为零变化。
- **优先级**：P2。
- **范围**：三页各拆为独立子任务，每页一次提交批次，先展示层后逻辑层：
  - **M60.1a `repos.vue`**（885 行 / 非空 816）：抽仓库列表行 / 表单入口展示块到 `app/components/`，筛选与分页状态派生到 `app/composables/`。
  - **M60.1b `alerts.vue`**（900 / 非空 842）：抽告警分组展示与运行侧栏到 `app/components/`，修复入口状态派生到 composable；`useFixNow` 解构去留由 M60.2 判定，本原子只搬运。
  - **M60.1c `scans.vue`**（1115 / 非空 1033）：抽扫描行 / 筛选栏 / 详情挂载块，排序与时间区间派生到 composable。
- **验收标准**：① 每页 `awk 'NF' 文件 | wc -l` ≤ 800 且 `pnpm run lint:check` 不再对该文件报 `max-lines`；② 该页对应 e2e 全绿（repos-crud / scans 筛选与详情 / alerts 视图），platform 全量测试 0 failed；③ `test:visual` 两主题零差异（或差异仅限 backlog 已登记的亚像素抖动）；④ 抽出的组件 / composable 各有至少 1 条定向用例，且新增文件单测命名按页面归类。
- **不做什么**：不改交互与视觉设计、不合并页面、不动后端 API 与路由、不引入新状态库。
- **依赖**：无前置；`repo-history-dialog` 的挂载位置由 M60.2 判定后再动（本原子只搬不删）。
- **交付物**：7-10 commits / 12-18 files / 1050-1560 行（含移动），三个子任务各自独立验收；文档面不新增 `docs/standards/platform.md` 篇幅（该文件已在字符健康上限），必要时先压缩或落 `docs/design/`。
- **风险与缓解**：抽取导致响应式状态漂移 → 每抽一层跑一次定向 e2e + visual；`v-model` / provide-inject 边界不清 → 先抽无状态展示组件，逻辑层单独提交。
- **执行记录（2026-11-15，3 commits）**：`5eda5bb7` 仓库页（筛选栏 + 批量扫描弹窗 + `use-repo-filters` / `use-repo-scan-trigger`，非空 816 → 509）/ `b1fa6636` 告警页（筛选栏 + `use-alert-groups`，842 → 632）/ `c0a70252` 扫描页（汇总卡片 + 运行筛选条 + `use-run-filters` + 新增主视图视觉基线，1033 → 792）。分层口径与和计划的差异见 [页面体量治理设计](../design/governance/platform-page-decomposition.md)。证据：platform 单测 2643 passed、e2e 定向 45 passed + 1 flaky（重试通过）、视觉 22 passed 零差异、`lint:check` 0 error（2 存量 warning）、根 typecheck / `lint:css:check` / `gates:docs` 20 项通过；审计 R1 三分区 Pass（4 warning）+ 文档 Reject（§10 误引）→ 修复 → R2 全 Pass。偏差：repos 列表行、alerts 运行侧栏（已在 `alert-run-sidebar`）、scans 扫描行未抽（强耦合收益低，行级抽取登记 backlog），验收标准未变。

### M60.2 死代码与闲置绑定清理（P3 🛠️）

- **目标**：删除已确认无入口的页面 / 组件 / 解构，消除「读代码以为有功能、实际没有」的误导面。
- **优先级**：P3。
- **范围（已知目标 + 上限）**：① `alerts.vue:278` 闲置 `useFixNow` 解构；② `repos/[id]/runs.vue` 兼容页与 `repo-history-dialog` history 模式的入口判定；③ `rg` 扫描出的无引用导出 / composable / 样式块（**上限 2 处**，超出另立候选，不挤进本原子）。
- **验收标准**：① 每项删除前留证据：`rg` 零引用（含动态 `import()` / Nuxt 自动导入约定 / 字符串路由名三类入口扫描）+ 路由表 + 组件挂载点 + e2e 覆盖，四项缺一不删；② 删除后 `typecheck` 0 error、platform 全量测试 0 failed、e2e / visual 全绿；③ 若判定为「保留」，在文件头补齐入口说明与触发路径。
- **不做什么**：不做大范围重构；不对「疑似死代码」直接删除（判定链必须完整）；不删对外路由（`/repos/[id]/runs` 若保留需给出跳转指针）。
- **依赖**：M60.1 的抽取完成后再删（避免同时移动与删除导致 diff 难审）。
- **交付物**：2-3 commits / 4-6 files / 净删 100-200 行。
- **执行记录（2026-11-15，2 commits）**：`26c5a162` 移除告警页闲置 `useFixNow` 解构；其余为入口判定 → **保留** `repos/[id]/runs.vue`（唯一 `<repo-ai-toggle>` 挂载点，删除会丢失仓库级 AI 开关 UI；文件头已补触发路径与保留理由）+ `repo-history-dialog` history 模式标为死代码待清理 + backlog 登记删除前置（先迁移 AI 开关）。口径见 [页面体量治理设计 §3.2](../design/governance/platform-page-decomposition.md)。证据：platform 单测 2643 passed、alerts e2e 16 passed、视觉 22 passed、build / typecheck / `lint:check` / `gates:docs` 全通过；审计 R1 Reject（B1 删页丢失 AI 开关挂载点）→ 保留页 → R2 Pass（B1 + 4 warning 全 closed）。偏差：净删量低于计划（0 行代码删除，仅 6 行闲置绑定），原因是死代码判定链证明其余两项应保留。
- **风险与缓解**：误删仍被深链使用的页面 → 保留路由 + 重定向，先观察一个发布周期再物理删除；视觉基线连带变化 → 删除后重跑 visual 并复核差异来源。

### M60.3 列表筛选与标签展示单点化（P2 🎨）

- **目标**：`repos` / `batch-runs` / `scans` 三页筛选交互与 severity 展示标签收敛到单一实现，消除三处口径。
- **优先级**：P2。
- **范围**：三页的筛选 + 重置样板（字段与语义差异保留，抽共享交互骨架）；`settings.vue:58-59` 内联 `find(...)?.label` 改用展示 helper；severity 标签跨 runtime（前端 `scan-options.ts` / 服务端报告 / 通知文案）单点化。
- **验收标准**：① 三页筛选行为落成对照清单（字段 / 重置 / URL 同步 / 空态）并以定向 e2e 断言，清单文件路径写进 PR；② severity 标签只保留一处事实源：`rg -n "'Critical'|'High'" apps/platform/server apps/platform/app --glob '!**/*.test.ts'` 除单一事实源与 `HighRisk*` / `securityHigh` 类标识符外命中为 0（PR 记录期望命中数与清单）；③ 新增 helper 单测覆盖「未命中回退原值」分支；④ `test:visual` 两主题零差异。
- **不做什么**：不统一三页的筛选字段集合（语义不同，仅抽骨架）；不改筛选的默认值；不动服务端查询。
- **依赖**：M60.1 完成后（页面结构稳定再抽）。
- **交付物**：3-4 commits / 5-8 files / 150-250 行。
- **风险与缓解**：抽骨架时把某页特有交互带偏 → 每页保留薄封装 + 逐页对照清单；URL 状态同步回归 → 补一条 query 往返用例。

### M60.4 沙箱执行器可用性收口（P1 🛡️🚀）

- **目标**：沙箱「能不能用」可判定、可解释、可按部署形态启用——宿主模式开箱可用；容器模式提供显式 opt-in 路径，而不是静默降级。
- **优先级**：P1（可用性缺口：当前容器部署下 `isAvailable()` 恒 false）。
- **范围**：只读自检端点（daemon 探测 / 镜像候选可拉性 / 出站白名单概览 / 降级原因）；`SandboxExecutor.isAvailable()` 原因结构化落库并在运行详情与扫描页展示；平台镜像增加 `WITH_DOCKER_CLI` 构建参数（默认关闭）与 **rootless** socket 挂载示例（compose profile + 文档）。
- **验收标准**：① 宿主模式下自检端点返回 `available: true`，并列出实际镜像候选与 allowlist host（不含凭据）；② 容器模式默认构建下端点返回 `false` 且原因可读（指向文档段）；③ `WITH_DOCKER_CLI=true` 构建 + 挂 rootless socket 后端点返回 `true`，并用 gated 用例跑通一次 report-only——取证环境写入 PR（daemon 不可用时用例 `skip` 并记录跳过原因，不得以「设计已覆盖」替代）；④ 运行详情对 `sandbox_unavailable` 显示原因与处置链接（e2e 覆盖可见性）；⑤ **安全边界验收**：只允许 rootless socket（`/run/user/<uid>/docker.sock`），明确禁止宿主 `/var/run/docker.sock`，并在 deployment / 安全规范对应段落同步澄清既有「勿挂载 docker.sock」表述的边界。
- **不做什么**：默认不内置 docker CLI、不挂宿主 root docker socket、不引入 sysbox / K8s；不改变 sandbox 与 container 的降级顺序。
- **依赖**：M59 已交付的 `sandbox_unavailable` 分类与镜像三源解析；安全口径见 [security.md §5.3](../standards/security.md) 与 [sandbox-security-governance.md](../design/governance/sandbox-security-governance.md) §6/§7（使用侧指引与 C26 实施决策：Runtime = Docker rootless，宿主 socket 反例禁止）；文档由 M60.5 承接，不构成 M60.4 的前置。
- **交付物**：4-6 commits / 11-14 files / 400-600 行，commit 归属：自检端点与服务端原因结构化（2-3 文件）/ Dockerfile 构建参数 + compose profile（3 文件）/ UI 降级原因与链接（2 文件）/ 测试与 gated 用例（3-4 文件）/ 文档引用占位（1-2 文件）。
- **风险与缓解**：暴露 daemon 控制面 → 默认关闭 + 仅 rootless socket + 文档显著警示 + 构建参数需显式传入；自检端点被滥用做探测 → 仅管理员、只读、限流；D 阶段需对 rootless socket 方案做一次威胁建模评审（挂接 security 十三条复核点）。

### M60.5 沙箱启用与故障排查文档（P2 📚）

- **目标**：把「启用沙箱」写成可执行步骤 + 错误码判读表，覆盖部署形态矩阵与三项必备配置，并与既有沙箱章节去重。
- **优先级**：P2。
- **范围**：以 `docs/guide/quick-start.md` 既有沙箱章节（约 82 行：rootless 安装 / 三项错误码判定）为**基线做增补与去重**，新增「部署形态矩阵（宿主 Dev / 容器默认 / 容器 opt-in）」与「错误码 → 现象 / 根因 / 处置」表（单一位置，表落在 configuration 或 quick-start 中的一处，其余章节引用）；`deployment.md` 补容器形态与 socket 边界；`configuration.md` 只补缺项；`docs/i18n/en-US/` 三篇同步；设计稿 `executor-sandbox-implementation.md` §7 补「部署形态与可用性」小节并引用 M60.4 端点。
- **验收标准**：① 部署形态矩阵三行（宿主 Dev / 容器默认 / 容器 opt-in）各自给出可行执行器与命令；② 错误码表由 `rg -n "code: 'sandbox_" apps/platform/server` 提取全集核对（缺一即不合格），逐项含现象 / 根因 / 处置；③ 与 quick-start 既有章节无重复表述（同一事实只在表格处定义，其余为链接）；④ 中英 parity 通过（`node scripts/docs/check-guide-parity.mjs`）；⑤ `pnpm run gates:docs` 20 项通过。
- **不做什么**：不重写既有沙箱设计稿段落；不写与实现不一致的「已经默认可用」；不新增第二份配置默认值表（以 configuration 为单一事实源）。
- **依赖**：M60.4 实现定型后开始（避免文档先于口径）。
- **交付物**：2-4 commits / 5-8 files / 250-400 行。
- **风险与缓解**：文档与实现漂移 → 错误码表由 `rg` 生成并写进验收命令；中英漏同步 → 每篇成对修改后立即跑 parity。

## 上一阶段

M59（沙箱 fix 与执行可靠性）已于 2026-11-14 归档：执行记录见 [archive/todo-archive-phases-m59.md](archive/todo-archive-phases-m59.md)，路线图详情见 [archive/roadmap-phases-m59.md](archive/roadmap-phases-m59.md)。M58（发布链可信收口）已于 2026-11-12 归档：执行记录见 [archive/todo-archive-phases-m58.md](archive/todo-archive-phases-m58.md)，路线图详情见 [archive/roadmap-phases-m58.md](archive/roadmap-phases-m58.md)。

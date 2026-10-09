# 测试规范

## 1. 测试框架

- **单元/集成测试**: Vitest（与 Vite 生态无缝集成）
- **E2E**: Playwright（平台阶段启用）

## 2. 测试设计原则

- **目标驱动**: 测试先回答"本次要证明或否证什么风险"，禁止为了凑覆盖率、补截图或制造形式上的安全感而写低价值用例。
- **失败路径优先**: 修复 Bug、补守卫或收紧契约时，优先补会在缺陷存在时失败的断言，再补成功路径回归，而不是只测当前实现已经能通过的分支。
- **最小充分验证**: 优先运行与改动直接相关、最能区分风险的定向用例；只有当风险外溢到跨模块链路时，才升级为更大范围测试。
- **单用例单风险**: 每个测试块应尽量围绕一个行为风险、边界条件或回退契约命名，避免把多个不相关断言堆在同一用例里导致失败归因模糊。
- **运行时校验 vs 类型断言**: `JSON.parse(x) as RunResult` 是类型断言，**不**做运行时校验。任何对外边界（容器 stdout / 网络响应 / 跨进程数据）必须配套 `validate*()` 函数。typecheck 通过 ≠ 数据合法，契约漂移只能靠运行时校验兜底。

## 3. 测试组织

- **单元测试**: 与源文件同目录，命名 `*.test.ts`
  - 例：`packages/core/src/utils/index.test.ts`
- **集成测试**: `tests/` 目录，命名 `*.test.ts`
- **E2E**: `tests/e2e/` 目录，命名 `*.e2e.test.ts`

## 4. 测试策略

### 4.1 按风险分级执行

| 级别 | 适用场景 | 命令 |
|------|---------|------|
| 定向测试 | 日常开发、单文件改动 | `npx vitest run <file>` |
| 全量测试 | 提交前、跨模块改动、发布前 | `pnpm test` / `pnpm -r test` |
| Review Gate | 阶段归档前、关键交付 | `pnpm test` + typecheck + lint |

**原则**: 不是所有场景都一刀切全量执行。按改动类型选择：
- 纯工具函数 → 定向测试
- 跨模块 API 变更 → 全量测试
- 阶段收口 → 全量 + coverage

### 4.2 测试优先策略

1. 优先补当前缺陷会打断的断言、失败路径与边界行为
2. 不把测试阶段退化为机械补 coverage
3. 有效断言 > 覆盖率数字

### 4.3 命令预算与升级条件

| 命令类别 | 典型命令 | 默认 timeout | 适用场景 | 升级条件 |
| :--- | :--- | :--- | :--- | :--- |
| 定向测试 | `npx vitest run path/to/file.test.ts` | 10 分钟 | 单模块逻辑、小范围修复 | 发现跨模块回归或接口契约变化时升级到全量测试 |
| 全量测试 | `pnpm test` | 30 分钟 | 大规模重构、关键逻辑变更、周期性回归 | 核心链路或发布前收口时升级到 `pnpm verify` |
| Coverage | `pnpm test:coverage` | 30 分钟 | 覆盖率治理、回归任务、核心模块补测 | 若覆盖率下滑或存在核心链路改动，应补充定向/全量测试结果一起提交 |
| Verify | `pnpm verify` | 60 分钟 | 发布前、跨模块流程、需要完整证据链 | 仅在需要串联 `lint + typecheck + test` 时使用，不作为普通小改动默认命令 |

## 5. 覆盖率目标

统计口径以 `vitest.config.ts` 的 coverage.include 为唯一权威（新增源码目录时须两处同步）：`packages/*/src/**/*.ts` + `apps/platform/app/**/*.ts` + `apps/platform/server/**/*.ts` + `scripts/*.mjs`。`.vue` 组件与 Playwright e2e（`apps/platform/tests/e2e/`）不纳入 vitest 覆盖率统计——前者无组件级单测且 v8 对 SFC 插桩依赖 vue 插件（测试环境为纯 node），后者由 `test.exclude` 排除。

| 范围 | 目标 |
|------|:----:|
| 整体 | >= 80%（vitest thresholds 全局门槛；未达标时 `pnpm run test:coverage` 非零退出） |
| `packages/core/` / `packages/engine/` / `packages/cli/` / `packages/mcp/` | >= 80% |
| `apps/platform/server/` / `apps/platform/app/` | >= 80% |
| `scripts/` | >= 80% |

> 基线（2026-08-12 口径修正后）：整体 Statements 67.81% / Branches 65.39% / Functions 68.43% / Lines 67.83%，未达门槛。补测冲刺见 [archive/todo-archive-phases-m6-m7-t711.md §T711](../plan/archive/todo-archive-phases-m6-m7-t711.md#t711-覆盖率口径修正--冲刺至-80已归档)（T711 已 M7.2 阶段 2026-08-12 归档）。

提升策略：先补缺口分析，再逐模块推进，不追求一次性全量达标。

### 5.1 覆盖率冲刺执行方法

1. 开始补测试前，必须先做一次 fresh 基线分析：以当前 `pnpm test:coverage` 输出为准。
2. 在编辑测试前，必须先估算"离目标还差多少覆盖行数"，记录当前 lines、目标 lines、粗略缺口和预期先打的高 ROI 切片。
3. 估算缺口后，优先选择高 ROI 切片：大体量低覆盖文件、已有测试基础的模块、能稳定命中失败路径的 service。
4. 覆盖率补测坚持"小步快跑"：每次只改当前切片的测试文件，改完立即运行该测试文件或同级最小定向命令，先证明当前新增断言能稳定通过，再继续下一个切片。
5. 全量 `pnpm test:coverage` 只在两种情况下执行：一是累计的预期增益已经接近阶段目标，二是需要刷新全仓基线并决定下一批 ROI；禁止每补完一个小文件就立刻重跑全量 coverage。
6. 覆盖率冲刺过程中，必须持续把基线、估算缺口、已补切片、最近一次全量 checkpoint、剩余高 ROI 候选与未覆盖边界写入 `docs/plan/todo.md` 或专项记录，避免方法、进度和证据只停留在对话里。

## 6. 测试原则

- **行为导向**: 测试聚焦业务行为，验证"做了什么"，不是复刻实现细节。
- **最小复现优先**: 根因不明确时先编最小复现测试，一次验证一个假设。
- **覆盖维度**: 至少覆盖主流程、失败路径、边界条件。
- **Mock 原则**: mock 不掩盖真正的集成风险。优先真实调用，mock 仅在外部依赖不可控时使用。
- **Mock 上限对执行速度敏感（跨平台 flaky）**: 循环/轮询类测试的固定次数 mock（如 nock `times(100)`）在更快环境（CI Linux vs 本地 Windows）可能被突破 → 第 N+1 次请求 No match。优先用 `persist()`（无上限）或放大 10 倍并注明原因；此类测试本地连跑多次验证后仍需 CI 实证（[经验归档 §二十七](../design/governance/experience-archive.md)）。
- **失败处理**: 测试失败时先解释根因，再决定改代码还是改测试。严禁直接改断言让它绿掉。
- **函数签名变更必须同步所有调用方验证**：utility 函数签名变更（如 `alertsFound(summary)` → `alertsFound(view)`）后必须 grep 全仓调用方同步更新；`pnpm typecheck` **不**捕捉 vitest `vi.mock` 下的类型错误（mock 路径可能跳过部分类型检查）——F 阶段本地验证 `typecheck 0 error` **不是** audit 替代。修复协议：F 阶段本地 typecheck 后必须补 A 阶段 Review Gate（`audit-depth: quick` 起步）独立核验调用方一致性；utility 抽取后单测一次性覆盖所有分支并包含"调用方误用"回归 case。详见 [经验归档 §四十二](../design/governance/experience-archive.md)。
- **utility 单测一次性覆盖所有分支**：抽取后立即补单测覆盖所有分支（含 NaN / Infinity / 缺失字段 / 负时长 / 非法日期等边界）；不接受"先实现后补测"的两段式。`pnpm --filter @dependfix/platform test <utility>.test.ts` 在 D 阶段收尾时必须全过。
- **测试隔离 afterEach 模式（describe 块 cleanup 兜底）**：describe 块 cleanup 应统一用 `afterEach` 兜底（vitest 钩子），而非 it case 末尾手动 cleanup 块——后者在 `expectError` 抛错 / 异常分支时易跳过导致污染后续测试。M17.4 commit 1 后 `repos/batch.post.test.ts` L165 实测：手动 cleanup（L183-187）不在 try/finally，L181 抛错后 cleanup 跳过，L190 后续测试读到外组织凭据导致 `RESOURCE_NOT_IN_ORG` 误抛（audit suggest #2 即源自此）。修复协议：① describe 块内首行添加 `afterEach(async () => { /* 还原被修改的全局状态 */ })`；② 手动 cleanup 块（如 L183-187）保留但仅作正向恢复兜底（afterEach 失败时仍可执行）；③ `expectError` 内部 catch 后 `return err`（不抛错）— 但若 statusCode 不匹配会抛 `Error('expected handler to throw 403')`，此时清理需 afterEach 兜底。
- **test helper 强契约类型契约**：test helper 返回类型应反映测试断言模式：message 断言（如 `expect(err.message).toContain(...)`）可用 `Record<string, unknown>`；code/data 强契约断言（如 `expect(err.data?.code).toBe(...)`）需放宽为 `Record<string, any>` 或引入泛型（`expectError<T = Record<string, unknown>>`）。M17.4 commit 2 实测：`apps/platform/tests/api-helper.ts:32` `expectError` 返回 `Record<string, unknown>` 在 strict 模式下导致 6 处 `err.data?.code` 访问 TS2339。helper 选型决策：① message-only 测试用 `Record<string, unknown>`（vitest mock 路径特例，见上文 L85）；② code/data 强契约测试用 `Record<string, any>`（test helper 上下文 any 风险可控；JSDoc 注明 h3 1.15 createError 不透传顶层 code 需通过 data 读取）；③ 进阶用泛型 `expectError<T = Record<string, unknown>>`（调用处 `<{ code: string; field: string }>` 显式标注）。
- **CI 最终裁决**: 修复的验收标准是 CI 全部通过，不是本地通过。
- **测试输入用真实形态**: 测试 fixture 应使用真实格式的输入（如带固定前缀的 ID），合成数据会漏掉真实格式才触发的缺陷。
- **lint 门禁**: `--max-warnings N` 让存量 warning 变成 CI 硬门禁倒逼清理；测试名应与真实断言一致（误导性测试名会掩盖缺口）。
- **zod `parseOptional<T>` 三态语义 helper**（M25.4 commit `65a8ec1`）：`apps/platform/server/utils/zod-helpers.ts` 提供 `parseOptional<T>(schema, value): { success: boolean, value?: T, isProvided: boolean }` helper，强制三态语义区分——`success` 表达 schema.safeParse 通过与否；`value` 表达 schema 解析后的实际值（可能 `undefined`）；`isProvided` 表达"是否真的提供了该字段"（区分「未传」与「传 undefined」）。**M25.4 实证**：8 个单测覆盖三态语义边界 + 应用替换（M24.1 Phase 3 W2 alertFiring `!== undefined` 简化注释保留 + Phase 2 W6 ack fixture `acknowledgedAt` 必须非空）+ i18n-anchor-check 配套（[i18n.md §3.X locale 文件 insert anchor](./i18n.md#3x-locale-文件-insert-anchor-必须用目标-locale-文本m254-阶段实证)）。详见 [经验归档 §六十一 M25.4 教训 2](../design/governance/experience-archive-§49-§57-recent-investigation.md#六十一m254i18nanchorcheck工具化locale文件insertanchor错位污染检测zod陷阱helper20260908commits) + [经验归档 §五十六 M24.1 教训 4 zod `.optional()` 陷阱](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十六m241-pr-check-状态监测-mvp5-phase-串行--a-阶段-reject-内联修复--6-atomic-commits-闭环2026-09-03commits)。

### 6.1 E2E 实践模式（Playwright）

- **用例必须幂等**：同一数据库二次运行是回归验证手段（能暴露单次运行不可见的隐性缺陷，如 §三十 TypeORM 复合索引 bug）。固定名（如 `e2e-owner/e2e-repo`）二次运行必撞唯一索引 → 用例用 `Date.now()` 时间戳唯一名；global-setup 注册账号容忍已存在（200/201/422 均视为成功）。
- **服务端用构建产物**：`.output/server/index.mjs`（对齐生产形态），独立端口 + 独立库 + 独立 AUTH_SECRET；生产构建 synchronize 默认关闭，e2e 库必须 `DATABASE_SYNCHRONIZE=true` 显式开启。
- **会话复用**：global-setup 注册首用户 admin（首个注册自动 admin）保存 storageState，管理页用例 `test.use({ storageState })` 复用；权限用例（viewer）在测试内注册登录。
- **CI 单 worker 串行**：共享 SQLite 库下并行写互相干扰；CI `workers: 1` + retry 2 + blob 报告。
- **目录隔离**：`*.e2e.test.ts` 会被 vitest 默认扫描，vitest.config 必须 `exclude: ['**/tests/e2e/**']`。**新增 Playwright 容器同样要排除**——沿用 `*.test.ts` 命名（如 `tests/visual/**/*.visual.test.ts`）会命中 vitest 默认 include，`pnpm test` 直接失败；新增容器入库前先跑一次全量 `pnpm test`，并同步补 `test.exclude`。
- **容器内 Chromium 需 `TMPDIR=/dev/shm`**：容器 `/tmp` 处于 overlayfs 时，Chromium 默认 arg `--disable-dev-shm-usage`（共享内存落 `/tmp`）会让 renderer 在**真实页面**崩溃（`page.goto` 报 `Page crashed`，而 `about:blank` 与 `launch` 本身正常）→ 用 `TMPDIR=/dev/shm <playwright 命令>`（tmpfs）或 `ignoreDefaultArgs: ['--disable-dev-shm-usage']`。分层定位方法与完整实证见 [caomei-ui-migration.md §15.13](../design/governance/caomei-ui-migration.md)。
- **本机多 worker + 共享 SQLite 会偶发 flaky → 取证据用 `--workers=1`**：`workers` 仅在 CI 强制为 1，本机默认并行；e2e 共享同一 SQLite 文件时会出现锁 / 时序类偶发失败。「单跑失败但单独运行通过」不等于代码缺陷，先排除并发因素；**权威证据用 `--workers=1`（CI 等价）连跑两遍**。
- **运行时 `data/` 产物会污染本地 vitest 与 check-docs**：平台扫描 run 的克隆产物落在 gitignored 的 `apps/platform/data/runs/<runId>/`（实测约 1.4G）时，`pnpm test` 会收集其测试文件、`pnpm run check:docs` 会把产物目录计入（实测 986 处**全部**命中该目录，diff 相关 md 命中 0）；CI 干净检出不受影响。**规避**：`pnpm exec vitest run --exclude 'apps/platform/data/**'`（CLI `--exclude` 是覆盖而非追加配置值，须补全既有 exclude 项）。**配置层已根治（2026-10-01）**：`vitest.config.ts` 的 `test.exclude` + `check-docs.mjs` 遍历剪枝（`RUNTIME_EXCLUDED_PATHS`）。
- **vitest 的 root 随运行方式变化 → 排除模式必须覆盖两个 root**：仓库根运行（`pnpm test`）时 root = 仓库根（路径含 `apps/platform/...`）；在包目录内运行（`pnpm --filter <pkg> test`）时 root = 包目录（路径为 `app/...` / `data/...`）。只写仓库根相对模式在包目录模式下**不命中**——两条模式并存，并分别在两个模式下跑 `vitest list` 计数验证（只测一种必漏）。
- **大体积运行时目录的排除要「下降前剪枝」且用路径前缀而非通用目录名**：运行时目录下可能是成千上万克隆 / 产物文件，遍历后再过滤代价不可接受 → 剪枝放在遍历器内、进入目录前（命中目录一经剪枝，子目录不会被访问）。排除项用「相对遍历起点的**路径前缀**」（如 `apps/platform/data`），不用通用目录名（`data` 会误伤 `docs/data` 等同名目录）；相邻前缀（`apps/platform/database`）要有回归用例。
- **限流豁免**：better-auth 1.6.26 内置特殊规则（sign-in 10s/3 次）优先于 customRules，无代理 IP 头时回退共享桶（并行必 429）→ e2e 环境 `E2E_TEST=true` + `advanced.ipAddress.disableIpTracking: true` 完全跳过（[经验归档 §三十](../design/governance/experience-archive.md)）。
- **浏览器 UI 验证必须使用视觉模型 agent**：V 阶段派发 `ui-validator` subagent（视觉模型 opencode-go/qwen3.7-plus）截图审查；无视觉能力的 agent 只能报告计算样式值、无法确认视觉回归（[经验归档 §三十一](../design/governance/experience-archive.md) 同源纪律）。
- **Nuxt SSR+CSR 双层 fetch 的 mock 限制**：Playwright `page.route` 只在浏览器上下文生效，Nuxt SSR 阶段服务端 `fetchData`(onMounted SSR)直接走真实 API 不走 client mock。即使 client hydration 后 onMounted 跑 fetchData，`credentials.value` 已被 SSR 阶段服务端响应填充为 `[]`，后续 client 拉到的 mock 数据无法回写已显示的空 Select 状态。完整 mock 守卫需：(a) 关闭 SSR(spa mode)或 (b) 注入 service worker 拦截 server response 或 (c) 走 in-process 测试(Vitest + @vue/test-utils mount 组件 + mock `$fetch`)。**page.route mock 只能保证"client side 重新触发 fetch"才能命中**——SSR 已渲染的真实数据无法被覆盖。
- **Playwright webServer 缓存必须 rebuild**（生产形态对齐 + CI step 顺序）：Playwright `webServer.command` 启动的 Nuxt server 用 `.output/` 产物（或 dev cache `.nuxt/`）。修改 `.vue`/`.ts` 后，直接跑 `pnpm exec playwright test` 不会自动 rebuild —— webServer 加载旧 build，新代码不生效（debug 现象：加 `console.log` 不触发、按钮 click 没反应、click handler 未绑定）。修复：**修改 `.vue`/`.ts` 后必须强制 rebuild**——`rm -rf apps/platform/.nuxt apps/platform/.output` + `pnpm --filter @dependfix/platform build` 后再跑 e2e。诊断信号：playwright 新建独立 `.auth` 状态文件（目录时间戳更新），但 webServer 日志仍引用旧 chunk hash。与 CI test.yml step 6 nuxt prepare + step 7 core/engine/build 顺序对齐，本地 e2e 前补 `pnpm --filter @dependfix/platform build` 即可（避免 CI 通过 ≠ 本地通过漂移）。
- **`page.route` 注册顺序铁律**：Vue/Nuxt 应用 `onMounted` 在 hydration 后**立即**触发 fetch。`page.route` 必须在 `page.goto` **之前**注册（首选 `test.beforeEach` 模式），否则 onMounted 抢跑走真实 API（401/403）→ events 为空 → DataTable 不渲染 wrapper / rowGroup 不显示 subheader。
- **CI 失败分析必看 `error-context.md`**：playwright CI 失败时 `test-results/<spec>/error-context.md` 含 accessibility tree（DOM 实际渲染态：row class / cell text / role attribute / button 标签），比堆栈更快定位 DOM-based 测试失败。诊断顺序：error-context.md → trace.zip → webServer 日志 → console.log。
- **PrimeVue 4 wrapper class 重命名**：`scrollable` 包裹层从 `.p-datatable-wrapper`（PrimeVue 3）改为 `.p-datatable-table-container`（PrimeVue 4）。e2e 断言必须看实际渲染产物（playwright error-context.md 或 `page.evaluate` 输出 classList）。
- **PrimeVue 4 + Nuxt SSR hydration 状态机分歧**（已修复，保留为模式参考）：`onMounted` 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染（`page.reload()` 后能渲染可佐证非业务逻辑问题）。修复路径：迁移 alerts 加载到 `useAsyncData`（SSR 阶段 handler 执行 fetch 并塞进 payload，hydration 时数据已就绪）+ `useRequestFetch` 转发 cookie；已取消 2 个 alerts-rowgroup e2e `.fixme` 并新增 SSR 锁定 test。
- **Nuxt 4 payload 解析模式**：Nuxt 4 用 devalue 编码 SSR payload 到 `<script id="__NUXT_DATA__">`，结构是稀疏数组：对象属性也是位置引用（如 `id: 12` 表示 `payload[12]` = 实际字符串），必须递归解引用才能拿到字面量。e2e 取 session userId 模式：遍历数组找含 role 的对象 → deref role → deref id → string。编写 e2e 解析 Nuxt 4 SSR 注入数据时**不要假设标准 JSON 结构**，必须遍历稀疏数组 + 递归解引用。

### 6.2 真实基础设施集成测试（进程内，优先于后台服务冒烟）

验证依赖真实外部设施（Redis、DB 服务等）的代码路径时，**优先进程内集成测试**（vitest 直驱，跑完即退出），而非后台常驻服务冒烟——后者在 Windows shell 工具环境不可靠（进程脱离会话、`.output` 文件锁、端口/句柄占用，[经验归档 §三十一](../design/governance/experience-archive.md)）。

- **环境门控**：`describe.skipIf(!process.env.TEMP_XXX)` 或类似标记——本地设 env 启用（真实设施可达），CI 无设施自动 skip（不失败）。
- **幂等设计**：测试用 `Date.now()` 随机 id（如 `integration-${Date.now()}`），避免重复运行命中上次残留（等待中的 job、未清理的数据）。
- **依赖注入可测性**：被测模块的处理器/回调支持注入（如 worker 的 `processor` 参数），测试传 mock 断言"收到正确数据"，不依赖真实业务执行。
- **资源清理**：测试尾部显式 `close()` + `disconnect()`，避免连接泄漏与句柄堆积。
- **职责边界**：进程内集成测试覆盖"基础设施层行为"（入队/消费/去重/终态重建）；HTTP 层状态流转（pending→running→completed + 轮询）才需要后台服务验证（staging 或 CI service container）。

### 6.3 集成外部库测试模式（薄引用 — 完整规范见 development.md §5.1.15）

集成 `@octokit/auth-app` / Vue 插件 / TypeORM / better-auth 等外部库时，**集成层测试不 mock 真实被集成库**（保留真实代码路径可执行）；mock 仅替换被测单元边界。完整规范见 [development.md §5.1.15](./development.md) + [经验归档 §四十三](../../docs/design/governance/experience-archive-§41-§48-archive-batch.md#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试2026-08-29m18.4-audit-round-1-reject-后补修)。

### 6.4 E2E 网络抗性 + 未认证 API 调用标准模式

> 详见 [经验归档 §五十一 + §五十二](../design/governance/experience-archive.md)。

#### e2e global-setup 串行场景网络抗性

- **问题**：e2e global-setup 串行多次 setupPage.request / pageSignin（admin + viewer + storageState 序列化 6s+）后紧接 fixtures cleanup 首请求偶现 ECONNRESET（TCP RST，100ms 内）
- **根因排查边界**：handler / 单测 / 本地复现穷举 → 通过即接受兜底修复 + 根因 backlog 分离
- **修复模式**（test helper 层而非 handler 层）：复用 Playwright 1.62 `_sendRequestWithRetries` 内置 250ms 指数 backoff 重试（仅对 `e.code === 'ECONNRESET'` 触发）
- **JSDoc 精度**：必须穷举"哪些错误重试"+"哪些错误不重试"（`ECONNREFUSED` / `ETIMEDOUT` 等不重试）
- **根因排查**：候选按 ROI 排序 —— 候选 ③ SQLite WAL 模式 + `busy_timeout` 已落地（治本）；候选 ② Nitro h3 async generator 已判定非根因；候选 ④ fixtures API 节流为经验性 follow-up；候选 ① better-auth 1.7 transaction 关闭时序诊断基础设施已落地（`AUTH_TRACE=1` 开关），待 CI 复现（详见 [backlog.md §已知边界](../plan/backlog.md#已知边界与-known-issue)）

#### e2e 未认证 API 调用测试标准模式

- **问题**：Playwright 1.62 `describe` 块内 `test.use({ storageState })` 配置可能通过 fixture pool 隐式传播到该 scope 内所有 `browser.newContext()` 调用（包括未指定 storageState 的手动创建）—— 未认证 API 调用测试（期望 401/403）莫名收到 200/201
- **诊断信号**：网络追踪 `trace.zip` 中 `context-options` 携带上游 session token + `network` 子文件含完整 cookie / header / request 序列
- **修复模式**：测试 `browser.newContext()` 调用必须显式传 `storageState: { cookies: [], origins: [] }`（Playwright 1.62 文档推荐的"unauthenticated API call"模式），与 `test.use({ storageState })` 完全脱钩强制清空 cookies/origins
- **CI 失败时间模式诊断**：global-setup 失败 → 后续测试不运行 → 掩盖后续测试真实状态。CI 修复需走完整链路（global-setup → setup → tests → teardown），单一节点失败掩盖下游问题
- **未来扩展**：建立 helper `tests/e2e/helpers/unauth-request.helper.ts` 抽取重复模式（audit suggest 候选）

#### e2e 控制服务端 locale 用显式 cookie header（不操作浏览器上下文 cookie）

- **问题**：用 `clearI18nCookie` / `setI18nCookie` 操作浏览器上下文 cookie 来决定服务端 locale 时，客户端框架（如 `@nuxtjs/i18n` 的 `detectBrowserLanguage.useCookie`）可能在 `goto` 后**异步回写**该 cookie，与测试设置竞争 → 全量顺序运行偶发断言失败（期望英文返回中文）。
- **修复模式**：在请求 header 内**显式剥离 / 附加**目标 cookie，使断言与上下文 cookie 时序结构性解耦。
- **配套**：Playwright `APIRequestContext` 在显式传入 `cookie` header 时**不再合并**上下文 cookie jar（`_updateRequestCookieHeader` 短路），故从 jar 读取后过滤即等价「以显式 header 为准」。
- **归因反例**：不要把 e2e 语言偶发归因为「共享 SQLite 同名仓库」——先核对唯一键与 owner 生成方式（重复判据含 owner 时间戳时不成立）。

### 6.5 断言禁用恒真写法（裸数字 / 短字符串）

`expect(x).toContain('3')` / `toContain(3)` 等短断言会被 fixture 数据（日期 `2026-07-30` 含字符 `3`、ID、计数字段）污染**恒真**，计数错误 / 缺失无法拦截。**修复模式**：表格 / 结构化输出断言用**完整行**（如 `toContain('| Alerts disabled (repos) | 3 |')` 含标签与管道符）或 `toMatch` 正则锚定边界；数字断言优先 `toBe(n)` 直接测数据层而非渲染文本。反例：M29.5 报告计数测试 `expect(md).toContain('3')` 在计数=0 时仍通过。

**断言子串必须是被测输出的独有子串**：反向 / 正向断言若用了会出现在**其他字段**里的子串就会假绿——例如断言「提示含某产品名」时该串其实由错误消息（`error message`）或 fixture 数据提供，把实现改回旧行为后仍全绿。修复：锁定被测输出的独有子串（如按源区分的完整短语），并在新增后做 mutation（把实现改回旧行为）确认用例会失败。

**断言还要锁定失败来源（不止「有区分度」）**：`expect(() => f()).toThrow()` 无参会接受任何抛错——若被测路径下游还可能抛错，则「把关键清理循环包 try/catch 吞错并中止」这类回归会被静默放过（实测：吞错实现下 28/28 用例仍通过）。**方法论**：新增 / 修改断言后，主动做 2-3 个「故意破坏生产代码」的 mutation（删 guard / 吞错 / 改成继续执行），确认测试会失败；让该路径成为**唯一可能的抛错来源**（如注入恒正常的下游依赖）比断言错误消息更跨平台稳定。**token / 暗色类断言同样用 mutation 标定**：把主题偏好置为另一态实测取值并写入用例注释（如 `colorScheme`、弹层背景与输入文本色的亮 / 暗两态 RGB 值），否则断言可能恒真。

**外部命令输出的大小写 / 规范化形态会让反向断言恒真**：`git config --local --list` 输出**一律小写**键名（写入 `push.gpgSign=true` 输出恒为 `push.gpgsign=true`），故 `expect(list).not.toContain('push.gpgSign')` **无条件为真**。判断某键是否落盘改用 `git config --local --get <key>`（未设置时 exit 1 → 断言抛错），或断言小写形式。**环境相关断言优先「同环境反例对照」**：先在同一用例内断言「未隔离的裸操作必失败（原始错误信息）」，再断言「隔离后成功」——否则一旦环境恰好不触发问题（不同版本 / 传输方式），正例断言会退化为恒真。

**不可达的防御性分支不强求测试守护**：mutation 标定会暴露「改回旧实现仍全绿」的断言，但**并非所有存活 mutation 都是缺陷**——若该分支经分析**当前不可达**（如 catch 内 hint 链的第三个源：抛错方恒为第一个失败源），强行为其写用例只能构造假场景。**正确处理三步**：① 在规划条目登记「已知边界（审计确认，无需动作）」并写明不可达原因；② 为**可达**路径补调用点断言（锁定 wiring 本身，如「per-source 错误消息含该源指引」），使该类 mutation 可被击杀；③ commit body 记录决策理由。判据：mutation 存活的**行为**若只能通过构造现实中不存在的输入触发，即归此条而非「断言恒真」。

### 6.6 ESM 模块 mock 受限的处理原则

Vitest 对 ESM 命名导出（如 `node:fs` 的 `unlinkSync`）无法用 `vi.spyOn` 拦截，被测模块内部调用也无法直接注入失败。**处理原则（按优先级）**：① **真实故障注入**——优先用真实文件系统 / 进程级隔离制造故障（**零生产代码改动**，如把旁文件建成目录使 `unlinkSync` 抛错）；② **可注入依赖**——真实故障不可达时（如"复制完成后的库损坏"）才给生产代码加可选注入点（默认值即原实现，与既有注入风格保持一致）；③ 确认 `vi.mock` 对目标模块支持度后再用。**不得**为凑覆盖率写"看似 mock 实则恒过"的断言，也不得静默 `it.skip`——skip 必须带 TODO 理由并登记 backlog。**对照做法（M31.6 补 C90）**：M30.5 `db-restore` 的两个失败分支曾因 ESM mock 受限 `it.skip`，补齐时分别采用——① 真实文件系统故障注入（sidecar 部分删除失败：把 `-shm` 建成目录使 `unlinkSync` 抛错，零生产代码改动）；② 注入点（恢复后 `integrity_check` 失败分支在真实环境不可达，给 `restoreDatabase` 加可选 `inspect` 注入点）。

### 6.7 视觉回归（截图识别层，apps/platform）

`apps/platform/playwright.visual.config.ts` 是与 e2e **完全隔离**的独立工程：独立 testDir / 端口 / SQLite 库（`data/visual.sqlite`）/ 认证目录（`tests/visual/.auth/`），不并入 `pnpm test:e2e` 的 `testMatch` 与断言语义。入口 `pnpm --filter @dependfix/platform test:visual`（更新基线加 `:update`）；基线快照入仓库（`apps/platform/tests/visual/__screenshots__/`，可在 PR 中 review 差异）。服务端复用 `.output` 构建产物，**取证前必须先 build**（与 §6.1「webServer 缓存必须 rebuild」同因）。

- **环境固定（可复现前提）**：chromium / 1440×900 / deviceScaleFactor 1 / locale `zh-CN` / 时区 `Asia/Shanghai` / `colorScheme: 'light'`；`animations: 'disabled'` + `caret: 'hide'`；`workers: 1` + `retries: 0`（不稳定即失败并归因，不用重试掩盖抖动）。
- **主题以确定性方式注入**：写 localStorage `dependfix-color-mode`，不依赖系统 `prefers-color-scheme`（CI 无系统偏好、本地可能是深色偏好）；用例内另断言 `<html class="dark">` 兜底键名漂移。
- **数据确定性**：视觉套件跑独立库，globalSetup 每次**先清理再注入**专属 fixtures（`tests/visual/helpers/fixtures.ts`）。e2e 数据集**不可复用**——缺仓库标签，且 `firstSeenAt` / `lastSeenAt` 缺省时端点填 `now()`。e2e 库还会被用例累积写入（`repos-crud` 留记录、`scanRuns` 每次新建）→ 直接拿 e2e 库采基线必然漂移。视觉数据集含一个**跨 severity 的包**（`nodemailer` = high + medium）作为「一个包一组」的防回归锚点：alerts 页「按包」分组下「严重级别」列以**组排序键**（组内最高级别 rank × 步长 − 包名升序序号，组间唯一）为排序取值；若退回按行级 severity 排序，跨档包会被拆到不同区块、分组头重复出现 → 该基线即失败。
- **动态区域显式遮蔽**：运行时派生值（时间戳等）标 `data-visual-mask`，由 `dynamicMask()` 在截图前遮蔽，不用像素容差兜底。注意：**加遮蔽会改变基线像素**（Playwright 用实心色块覆盖），必须重新生成该页基线。
- **阈值口径**：`maxDiffPixels: 100` + `threshold: 0.1`（绝对像素上限，不用比例兜底）。两个数值对应两条互相独立、各自可逃逸的盲区轴（2026-10-01 收紧，取证与前后对照见下方各条）：
    - **色阈值轴**：pixelmatch 的 `maxDelta = 35215 × threshold²`（0.1 → 352）。原 0.2 档（1409）会把「同明度色相 / 灰度替换」判为同色——实测 `#52525b → #0f766e`（实底 neutral 按钮）色对 delta ≈ 1084（内置 `colorDelta` 实算 1083.6）：0.2 档判「同色」（整块按钮色变逃逸），0.1 档判「不同色」。
    - **面积预算轴**：超阈像素数上限。实测「少面积 × 高色差」变更（开关拇指 164 px，色差 ≈ 3×10⁴ 远超色阈值）在 200 档被吞（164 ≤ 200），100 档可检出。
    - **抗噪 ↔ 灵敏度取舍**：抗锯齿噪声由 Playwright 透传的 `includeAA: false` 经邻域判定排除、不参与计数 → 收紧这两项**不会**放大 AA 抖动；反证是「未注入样式的对照组在 `maxDiffPixels: 1` 下仍零差异」（repos / alerts 两页实测）。真正的取舍落在「跨机器渲染差异 vs 少面积色变检出」，故口径变更后须观察 1-2 次真实 CI run（视觉 job 已阻断）。
    - **残留边界**：影响面积 < 100 px 的改动仍不触发；且**用例要覆盖大面积 token 消费面**（历史实测：改 `$color-primary` 只触发 2/7 用例——活动导航文案 215-226px 超阈值失败，2 字导航项低于阈值放行；改 caomei 主题 token `theme.primary` 则 5/7 失败，暗色用例不受影响——暗色档单独覆盖 `--caomei-color-primary`）。小面积改动仍依赖人工 / `ui-validator` 复核。
- **覆盖边界（已知）**：`pr-checks` 行级渲染已由 M33.4 覆盖（fixtures 端点新增可选 `prChecks` 写入路径；`lastPolledAt` 由 fixtures 显式钉死，且视觉环境固定 `locale` + `timezoneId`，故时间列无需遮蔽即可逐像素复现）；`alerts` 宽表在 1440 视口横向溢出（实测 `clientWidth 1166 < scrollWidth 1318`）→ 整页基线只覆盖可视区左端，最右 `链接` / `详情` 两列已由 M33.5 覆盖：容器横向滚到最右后**元素级补拍**（`alerts-right-<theme>.png`），只改容器内部滚动位置，不动 viewport / 阈值 / 列宽。**弹窗内浮层**（M34.3）：`dialog-select-open-<theme>.png` 覆盖弹窗内 Select **展开态**——门户面板不在弹窗子树内，元素级截图取不到、整页截图又会与 fixed 定位元素拼接混合，故用**视口级**截图（`expectViewportScreenshot`）同时覆盖弹窗 + 遮罩 + 门户面板的合成结果；截图前另断言「面板不是弹窗后代」，挡住「面板未挂载 → 基线落成缺面板形态」的假绿。
- **基线假绿防护（写入路径锚定）**：基线覆盖 fixtures 数据时，用例必须先断言「行数 / 关键文案 / 标签色调」再截图——否则 fixtures 写入路径失效时页面回落空态，基线只是"被重新生成成空态"，测试依旧全绿（false green）。**覆盖声明须逐列核对**：如"结论标签四档"必须逐列核对档位来源（`conclusionTagTone` 取值域 danger/success/warning/primary，`neutral` 只出现在 Alert 状态列）——把两列档位混在一起计数会同时造成 overclaim 与真实缺口（M33.4 审计以 warning 指出）。
- **容差盲区（同明度色相 / 灰度替换）**：该类色变**已由 `threshold` 收紧（0.2 → 0.1）覆盖**，残留盲区为「影响面积 < 100 px」（面积预算下限，见上「阈值口径」）。历史实证（0.2 档）：`maxDelta = 35215 × threshold² ≈ 1409`，而实测 `#52525b ↔ #0f766e` delta ≈ 1084 < 1409 → 整块实底按钮的色变被判「同色」（两次独立实证：M33.9 主按钮 teal-600 → teal-700、M34.2 soft 底色 12% → 8% 均被吞，而当时 CI / 本地全绿）。**色板 / 间距类改动仍必须按内容核验基线**（`--update-snapshots=all` 强制重建 + 与 `git show HEAD:<png>` 逐像素 diff 出 bbox），不能只看「用例通过」——残留的 < 100 px 面积变更仍不会触发门禁。
- **元素级补拍**：整页基线覆盖不到的溢出区域（如宽表右端列）用元素级补拍（滚到最右后截取容器），只改**容器内部滚动位置**（取 `scrollWidth - clientWidth` 最大值 → 跨机器确定），不动 viewport / 阈值 / 列宽；helper 需支持可选 `mask` 参数以与整页基线同遮蔽口径。反例：M33.5 alerts 宽表 `链接` / `详情` 两列盲区（反例验证注入色变差异 40948 px ≫ 面积预算 100）。
- **反例验证纪律**：基线落地必须做一次「人为注入样式改动 → 用例如期失败 → 还原后全绿」，证明阈值非恒真，不得只跑正例。
- **灵敏度量的取证手法（可复用模板）**：把既有基线复制到临时 spec 的快照目录（`snapshotPathTemplate` 含 `testFilePath`，无法跨用例直接比对）→ `page.addStyleTag` 注入样式改动 → 用三档 expect 选项分别读：`{threshold: 0, maxDiffPixels: 1}` = 全量差异像素、`{threshold: 旧值, maxDiffPixels: 1}` = 超阈像素数、默认选项 = 门禁判定；不注入的对照组配 `maxDiffPixels: 1` 证明零漂移；新基线用**变异检验**（改目标区域底色 / 位移）证明真覆盖目标区域、非假绿；脚手架跑完即删。**本批实测**：实底 neutral → 主色色对全量差异 6407-6412 像素（旧档 0 超阈 → 逃逸；新档 5935 超阈 → 检出）；开关拇指 164 像素（旧档通过 → 新档失败）；未注入对照组在 `maxDiffPixels: 1` 下零差异。**注**：按类名注入必须排除变体（`tone` 类同时命中 ghost 变体，其底色透明 → 强制实底会制造高色差假信号）。
- **基线「纯偏移」归因手法（可复用模板）**：间距 / 位置类改动的基线更新必须回答「差异是否**只**由该偏移引起」——先 `git show HEAD:<png>` 取出旧基线，用临时 spec 把新旧 PNG 双解码到 canvas，在重叠区逐字节比较，输出三项：① 首个差异行之上是否逐行全同；② 0-8 范围内搜索最佳垂直位移（应恰等于改动像素数）；③ 该位移下 `new[y] === old[y-offset]` 的逐字节相等比例（应为 1.0，非 1.0 说明夹带了其它视觉变更）。
- **读基线须知**：`apps/platform/tests/visual/README.md` 记录 M31 已裁定的既有视觉差异（避免后人误判为新回归）与已知盲区。
- **与 `ui-validator` 的分工**：视觉回归只兜「像素漂移」，不做交互 / 可用性 / 语义审查；后者仍由 `ui-validator` 承担（见 §6.1 同款纪律）。
- **上游归因与上报**：异常经判定属组件库（`caomei-ui` / `reka-ui` 等）而非本仓代码时，按 [平台规范 §7.5](./platform.md#75-上游组件问题归因与-issue-上报流程) 执行（归因判定清单 / 取证 / 上报路径 / 模板要素 / 本仓侧处置）。
- **CI 接入**：`test.yml` 的 `visual` job（独立 runner + 失败产物上传 `apps/platform/test-results/`）**阻断语义已启用**——2026-09-29 CI run `36602407382` 在 `ubuntu-latest` 出现首个全绿 run（job conclusion = success，14 步全绿；基线采集环境与 runner 字体渲染一致性已实证），据此移除初期非阻断开关。视觉失败现使 Test workflow 变红（**workflow 级阻断信号**；仓库未配置 required status checks，故不构成硬性合并门禁）；失败产物仍随 artifact 上传供人工核查。
- **review 检查点**：本节三条「必须」级约定（取证前先 build / 加遮蔽须重生成基线 / 反例验证纪律）已挂 [code-quality-checklist 规范条款 review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵严格约束逐条挂接)。

### 6.8 取证工件必须与冻结代码同批生成

审计 / 文档引用的取证工件（截图、计算样式 JSON、报告样本）必须在**代码冻结后**、与最终验证链（`build` → 全量 e2e → 浏览器取证 → 计算样式取证）**同批生成**；文档中引用的数字只在链条尾部落笔。反例：工件早于最后一轮修复生成 → 文档数字与工件对不上，被审计双双指出。附带约束：工件脚本自身的测量口径（选择器作用域、需先打开的弹层 / 面板）也要随代码变化同步修正。

### 6.9 CI 阻断门禁接线（负例标定 / 自指面 / 阻断强度）

把某个本地检查脚本接入 CI 并声明为**阻断**时，必须做三件套自检，否则「绿」不可信或门禁语义被高估：

1. **负例标定**：植入 1 处违例（如临时探针文件 `// T9999`）确认脚本**退出码非 0**，跑后删除脚手架——否则「0 命中」无法区分「真绿」与「脚本失效 / 命令名写错」。
2. **自指面核对**：新步骤所在文件若在脚本扫描面内（如 `.github/workflows/*.yml` 被编号检测覆盖），其新增注释块自身不得含无指针规划编号，否则新门禁会被自己拉红。
3. **阻断强度显式声明**：仓库未配置 required status checks 时，CI 步骤只是 **workflow 级变红信号**而非硬性合并门禁，须在步骤注释与规范中写明（与视觉回归 job 同口径），避免把「变红」误读为「禁止合并」。

**配套**：步骤位置优先落在静态检查簇（便宜且早失败），并确认其不依赖前序构建产物；接入后本地复跑基线一次（0 命中 / exit 0）留痕。

## 7. 测试代码质量

- 测试代码本身也需要通过 lint + typecheck
- 测试描述（`it('does X')`）聚焦业务行为，使用清晰语言
- 避免过度耦合内部实现细节

## 8. 高效运行技巧

### 8.1 按需定向测试

在日常开发和修复 Bug 过程中，优先仅运行与本次改动直接相关的测试文件。全量测试极其缓慢，频繁运行会严重阻塞开发流程。

- 优先选择能直接命中当前风险、失败路径或契约边界的测试
- 若关键字方式无法稳定命中同类 `*.test.ts`，优先使用 `npx vitest run path/to/file.test.ts`

### 8.2 排查慢速测试

若发现测试异常缓慢，检查是否在每个 `test` 中重复进行了昂贵的资源创建/销毁操作，应尽量利用 `beforeAll` 和 `afterAll`。

## 9. 样例数据与夹具

- 准备 Dependabot 告警样例数据
- 准备 lockfile 漂移失败样例
- 准备 Code Scanning 样例数据
- 关键流程可在不依赖线上真实仓库的情况下做回归测试

## 10. 相关文档

- [开发规范](./development.md)
- [AI 协作规范](./ai-collaboration.md)
- [项目规划规范](./planning.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。

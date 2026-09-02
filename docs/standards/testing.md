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

> 基线（2026-08-12 口径修正后）：整体 Statements 67.81% / Branches 65.39% / Functions 68.43% / Lines 67.83%，未达门槛。补测冲刺见 [todo.md T711](../plan/todo.md)。

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
- **函数签名变更必须同步所有调用方验证**：utility 函数签名变更（如 `alertsFound(summary)` → `alertsFound(view)`）后必须 grep 全仓调用方同步更新；`pnpm typecheck` **不**捕捉 vitest `vi.mock` 下的类型错误（mock 路径可能跳过部分类型检查）——F 阶段本地验证 `typecheck 0 error` **不是** audit 替代。修复协议：F 阶段本地 typecheck 后必须补 A 阶段 Review Gate（`audit-depth: quick` 起步）独立核验调用方一致性；utility 抽取后单测一次性覆盖所有分支并包含"调用方误用"回归 case。M15.1 第 1 轮 Reject B1 实证：实现已通过单测 + typecheck，但调用方未对齐签名 → 审计快速 depth 仍能捕获。
- **utility 单测一次性覆盖所有分支**：抽取后立即补单测覆盖所有分支（含 NaN / Infinity / 缺失字段 / 负时长 / 非法日期等边界）；不接受"先实现后补测"的两段式。`pnpm --filter @dependfix/platform test <utility>.test.ts` 在 D 阶段收尾时必须全过。
- **测试隔离 afterEach 模式（describe 块 cleanup 兜底）**：describe 块 cleanup 应统一用 `afterEach` 兜底（vitest 钩子），而非 it case 末尾手动 cleanup 块——后者在 `expectError` 抛错 / 异常分支时易跳过导致污染后续测试。M17.4 commit 1 后 `repos/batch.post.test.ts` L165 实测：手动 cleanup（L183-187）不在 try/finally，L181 抛错后 cleanup 跳过，L190 后续测试读到外组织凭据导致 `RESOURCE_NOT_IN_ORG` 误抛（audit suggest #2 即源自此）。修复协议：① describe 块内首行添加 `afterEach(async () => { /* 还原被修改的全局状态 */ })`；② 手动 cleanup 块（如 L183-187）保留但仅作正向恢复兜底（afterEach 失败时仍可执行）；③ `expectError` 内部 catch 后 `return err`（不抛错）— 但若 statusCode 不匹配会抛 `Error('expected handler to throw 403')`，此时清理需 afterEach 兜底。
- **test helper 强契约类型契约**：test helper 返回类型应反映测试断言模式：message 断言（如 `expect(err.message).toContain(...)`）可用 `Record<string, unknown>`；code/data 强契约断言（如 `expect(err.data?.code).toBe(...)`）需放宽为 `Record<string, any>` 或引入泛型（`expectError<T = Record<string, unknown>>`）。M17.4 commit 2 实测：`apps/platform/tests/api-helper.ts:32` `expectError` 返回 `Record<string, unknown>` 在 strict 模式下导致 6 处 `err.data?.code` 访问 TS2339。helper 选型决策：① message-only 测试用 `Record<string, unknown>`（vitest mock 路径特例，见上文 L85）；② code/data 强契约测试用 `Record<string, any>`（test helper 上下文 any 风险可控；JSDoc 注明 h3 1.15 createError 不透传顶层 code 需通过 data 读取）；③ 进阶用泛型 `expectError<T = Record<string, unknown>>`（调用处 `<{ code: string; field: string }>` 显式标注）。
- **CI 最终裁决**: 修复的验收标准是 CI 全部通过，不是本地通过。
- **测试输入用真实形态**: 测试 fixture 应使用真实格式的输入（如带固定前缀的 ID），合成数据会漏掉真实格式才触发的缺陷。
- **lint 门禁**: `--max-warnings N` 让存量 warning 变成 CI 硬门禁倒逼清理；测试名应与真实断言一致（误导性测试名会掩盖缺口）。

### 6.1 E2E 实践经验（Playwright）

- **用例必须幂等**：同一数据库二次运行是回归验证手段（能暴露单次运行不可见的隐性缺陷，如 §三十 TypeORM 复合索引 bug）。固定名（如 `e2e-owner/e2e-repo`）二次运行必撞唯一索引 → 用例用 `Date.now()` 时间戳唯一名；global-setup 注册账号容忍已存在（200/201/422 均视为成功）。
- **服务端用构建产物**：`.output/server/index.mjs`（对齐生产形态），独立端口 + 独立库 + 独立 AUTH_SECRET；生产构建 synchronize 默认关闭，e2e 库必须 `DATABASE_SYNCHRONIZE=true` 显式开启。
- **会话复用**：global-setup 注册首用户 admin（首个注册自动 admin）保存 storageState，管理页用例 `test.use({ storageState })` 复用；权限用例（viewer）在测试内注册登录。
- **CI 单 worker 串行**：共享 SQLite 库下并行写互相干扰；CI `workers: 1` + retry 2 + blob 报告。
- **目录隔离**：`*.e2e.test.ts` 会被 vitest 默认扫描，vitest.config 必须 `exclude: ['**/tests/e2e/**']`。
- **限流豁免**：better-auth 1.6.26 内置特殊规则（sign-in 10s/3 次）优先于 customRules，无代理 IP 头时回退共享桶（并行必 429）→ e2e 环境 `E2E_TEST=true` + `advanced.ipAddress.disableIpTracking: true` 完全跳过（[经验归档 §三十](../design/governance/experience-archive.md)）。
- **浏览器 UI 验证必须使用视觉模型 agent**：V 阶段派发 `ui-validator` subagent（视觉模型 opencode-go/qwen3.7-plus）截图审查；无视觉能力的 agent 只能报告计算样式值、无法确认视觉回归（[经验归档 §三十一](../design/governance/experience-archive.md) 同源纪律）。
- **Nuxt SSR+CSR 双层 fetch 的 mock 限制**：Playwright `page.route` 只在浏览器上下文生效，Nuxt SSR 阶段服务端 `fetchData`(onMounted SSR)直接走真实 API 不走 client mock。即使 client hydration 后 onMounted 跑 fetchData，`credentials.value` 已被 SSR 阶段服务端响应填充为 `[]`，后续 client 拉到的 mock 数据无法回写已显示的空 Select 状态。完整 mock 守卫需：(a) 关闭 SSR(spa mode)或 (b) 注入 service worker 拦截 server response 或 (c) 走 in-process 测试(Vitest + @vue/test-utils mount 组件 + mock `$fetch`)。**page.route mock 只能保证"client side 重新触发 fetch"才能命中**——SSR 已渲染的真实数据无法被覆盖。
- **Playwright webServer 缓存必须 rebuild**（生产形态对齐 + CI step 顺序）：Playwright `webServer.command` 启动的 Nuxt server 用 `.output/` 产物（或 dev cache `.nuxt/`）。修改 `.vue`/`.ts` 后，直接跑 `pnpm exec playwright test` 不会自动 rebuild —— webServer 加载旧 build，新代码不生效（debug 现象：加 `console.log` 不触发、按钮 click 没反应、click handler 未绑定）。修复：**修改 `.vue`/`.ts` 后必须强制 rebuild**——`rm -rf apps/platform/.nuxt apps/platform/.output` + `pnpm --filter @dependfix/platform build` 后再跑 e2e。诊断信号：playwright 新建独立 `.auth` 状态文件（目录时间戳更新），但 webServer 日志仍引用旧 chunk hash。与 CI test.yml step 6 nuxt prepare + step 7 core/engine/build 顺序对齐，本地 e2e 前补 `pnpm --filter @dependfix/platform build` 即可（避免 CI 通过 ≠ 本地通过漂移）。
- **`page.route` 注册顺序铁律**：Vue/Nuxt 应用 `onMounted` 在 hydration 后**立即**触发 fetch。`page.route` 必须在 `page.goto` **之前**注册（首选 `test.beforeEach` 模式），否则 onMounted 抢跑走真实 API（401/403）→ events 为空 → DataTable 不渲染 wrapper / rowGroup 不显示 subheader。判定理由与代码模板：见 [docs/archive/2026-08-20-standards-revisions.md §5](../archive/2026-08-20-standards-revisions.md)。
- **CI 失败分析必看 `error-context.md`**：playwright CI 失败时 `test-results/<spec>/error-context.md` 含 accessibility tree（DOM 实际渲染态：row class / cell text / role attribute / button 标签），比堆栈更快定位 DOM-based 测试失败。诊断顺序：error-context.md → trace.zip → webServer 日志 → console.log。判定理由：见 [docs/archive/2026-08-20-standards-revisions.md §4](../archive/2026-08-20-standards-revisions.md)。
- **PrimeVue 4 wrapper class 重命名**：`scrollable` 包裹层从 `.p-datatable-wrapper`（PrimeVue 3）改为 `.p-datatable-table-container`（PrimeVue 4）。e2e 断言必须看实际渲染产物（playwright error-context.md 或 `page.evaluate` 输出 classList）。判定理由：见 [docs/archive/2026-08-20-standards-revisions.md §10](../archive/2026-08-20-standards-revisions.md)。
- **PrimeVue 4 + Nuxt SSR hydration 状态机分歧**（known-issue）：`onMounted` 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染；`page.reload()` 后能渲染可佐证非业务逻辑问题。修复路径：迁移 alerts 加载到 `useAsyncData` 让 SSR 阶段就有数据，或升级 PrimeVue 到修复版本。当前 2 个 alerts-rowgroup.e2e.test.ts 测试以 `test.fixme()` 标记（命名空间 `known-issue/primevue-hydration-rowgroup`），等修复后取消 `.fixme`。详细背景：见 [docs/archive/2026-08-20-standards-revisions.md §7](../archive/2026-08-20-standards-revisions.md) + [`docs/plan/backlog.md` 已知边界与 known-issue](../plan/backlog.md)。
- **Nuxt 4 payload 解析模式**：Nuxt 4 用 devalue 编码 SSR payload 到 `<script id="__NUXT_DATA__">`，结构是稀疏数组：`payload[0] = ["ShallowReactive",1]`、`payload[1] = {data:2, ...}`、`payload[15] = {role:21, id:12, ...}`。对象属性也是位置引用（`id: 12` 表示 `payload[12]` = 实际字符串），必须递归解引用才能拿到字面量。e2e 取 session userId 模式：遍历数组找含 role 的对象 → deref role → deref id → string。教训：编写 e2e 解析 Nuxt 4 SSR 注入数据时**不要假设标准 JSON 结构**，必须遍历稀疏数组 + 递归解引用。

### 6.2 真实基础设施集成测试（进程内，优先于后台服务冒烟）

验证依赖真实外部设施（Redis、DB 服务等）的代码路径时，**优先进程内集成测试**（vitest 直驱，跑完即退出），而非后台常驻服务冒烟——后者在 Windows shell 工具环境不可靠（进程脱离会话、`.output` 文件锁、端口/句柄占用，[经验归档 §三十一](../design/governance/experience-archive.md)）。

- **环境门控**：`describe.skipIf(!process.env.TEMP_XXX)` 或类似标记——本地设 env 启用（真实设施可达），CI 无设施自动 skip（不失败）。
- **幂等设计**：测试用 `Date.now()` 随机 id（如 `integration-${Date.now()}`），避免重复运行命中上次残留（等待中的 job、未清理的数据）。
- **依赖注入可测性**：被测模块的处理器/回调支持注入（如 worker 的 `processor` 参数），测试传 mock 断言"收到正确数据"，不依赖真实业务执行。
- **资源清理**：测试尾部显式 `close()` + `disconnect()`，避免连接泄漏与句柄堆积。
- **职责边界**：进程内集成测试覆盖"基础设施层行为"（入队/消费/去重/终态重建）；HTTP 层状态流转（pending→running→completed + 轮询）才需要后台服务验证（staging 或 CI service container）。

### 6.3 集成外部库测试模式（薄引用 — 完整规范见 development.md §5.1.15）

集成 `@octokit/auth-app` / Vue 插件 / TypeORM / better-auth 等外部库时，**集成层测试不 mock 真实被集成库**（保留真实代码路径可执行）；mock 仅替换被测单元边界。完整规范 + 教训 + mock 边界示例见 [development.md §5.1.15](./development.md) + [经验归档 §四十三](../../docs/design/governance/experience-archive.md#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试2026-08-29m18.4-audit-round-1-reject-后补修)。

### 6.4 E2E 网络抗性 + 未认证 API 调用标准模式

> 教训来源：M22.7 hotfix commit `f617b56`（CI run 33525721103 E2E global-setup ECONNRESET）+ M22.8 hotfix commit `bdcd900`（CI run 33533376712 未认证 API 测试 cookie 注入）+ [经验归档 §五十一](../design/governance/experience-archive.md) + §五十二。

#### e2e global-setup 串行场景网络抗性

- **问题**：e2e global-setup 串行多次 setupPage.request / pageSignin（admin + viewer + storageState 序列化 6s+）后紧接 fixtures cleanup 首请求偶现 ECONNRESET（TCP RST，100ms 内）
- **根因排查边界**：handler / 单测 / 本地复现穷举 → 通过即接受兜底修复 + 根因 backlog 分离
- **修复模式**（test helper 层而非 handler 层）：复用 Playwright 1.62 `_sendRequestWithRetries` 内置 250ms 指数 backoff 重试（仅对 `e.code === 'ECONNRESET'` 触发）
- **JSDoc 精度**：必须穷举"哪些错误重试"+"哪些错误不重试"（`ECONNREFUSED` / `ETIMEDOUT` 等不重试）
- **根因排查**：按 ROI 排序登记 backlog.md §已知边界 M22.7 衍生段（M 阶段规划时优先排查 better-auth 1.7 transaction close 时序 / Nitro h3 async generator / SQLite WAL 模式）

#### e2e 未认证 API 调用测试标准模式

- **问题**：Playwright 1.62 `describe` 块内 `test.use({ storageState })` 配置可能通过 fixture pool 隐式传播到该 scope 内所有 `browser.newContext()` 调用（包括未指定 storageState 的手动创建）—— 未认证 API 调用测试（期望 401/403）莫名收到 200/201
- **诊断信号**：网络追踪 `trace.zip` 中 `context-options` 携带上游 session token + `network` 子文件含完整 cookie / header / request 序列
- **修复模式**：测试 `browser.newContext()` 调用必须显式传 `storageState: { cookies: [], origins: [] }`（Playwright 1.62 文档推荐的"unauthenticated API call"模式），与 `test.use({ storageState })` 完全脱钩强制清空 cookies/origins
- **CI 失败时间模式诊断**：global-setup 失败 → 后续测试不运行 → 掩盖后续测试真实状态。CI 修复需走完整链路（global-setup → setup → tests → teardown），单一节点失败掩盖下游问题
- **未来扩展**：建立 helper `tests/e2e/helpers/unauth-request.helper.ts` 抽取重复模式（audit suggest 候选）

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

# 测试规范

## 1. 测试框架

- **单元 / 集成测试**：Vitest（与 Vite 生态无缝集成）；**E2E**：Playwright（平台阶段启用）。

## 2. 测试设计原则

- **目标驱动**：测试先回答「本次要证明或否证什么风险」，禁止为凑覆盖率、补截图或制造形式安全感而写低价值用例。
- **失败路径优先**：修复 Bug、补守卫或收紧契约时优先补会在缺陷存在时失败的断言，再补成功路径回归，而不是只测当前实现已能通过的分支。
- **最小充分验证**：优先运行与改动直接相关、最能区分风险的定向用例；仅当风险外溢到跨模块链路时才升级范围。
- **单用例单风险**：每个测试块围绕一个行为风险、边界条件或回退契约命名，避免多不相关断言堆在同一用例导致失败归因模糊。
- **运行时校验 vs 类型断言**：`JSON.parse(x) as RunResult` 是类型断言、**不**做运行时校验；任何对外边界（容器 stdout / 网络响应 / 跨进程数据）必须配套 `validate*()` 函数——typecheck 通过 ≠ 数据合法，契约漂移只能靠运行时校验兜底。

## 3. 测试组织

- **单元测试**与源文件同目录（`*.test.ts`）；**集成测试**放 `tests/`（`*.test.ts`）；**E2E** 放 `tests/e2e/`（`*.e2e.test.ts`）。

## 4. 测试策略

- **4.1 按风险分级执行**：不是所有场景都一刀切全量——纯工具函数 → 定向测试（`npx vitest run <file>`）；跨模块 API 变更 → 全量测试（`pnpm test` / `pnpm -r test`）；阶段收口 → 全量 + coverage；阶段归档前 / 关键交付 → Review Gate（`pnpm test` + typecheck + lint）。
- **4.2 测试优先策略**：优先补当前缺陷会打断的断言、失败路径与边界行为；不把测试阶段退化为机械补 coverage；**有效断言 > 覆盖率数字**。

**4.3 命令预算与升级条件**

| 命令类别 | 典型命令 | 默认 timeout | 适用场景 | 升级条件 |
| :--- | :--- | :--- | :--- | :--- |
| 定向测试 | `npx vitest run path/to/file.test.ts` | 10 分钟 | 单模块逻辑、小范围修复 | 发现跨模块回归或接口契约变化时升级到全量测试 |
| 全量测试 | `pnpm test` | 30 分钟 | 大规模重构、关键逻辑变更、周期性回归 | 核心链路或发布前收口时升级到 `pnpm verify` |
| Coverage | `pnpm test:coverage` | 30 分钟 | 覆盖率治理、回归任务、核心模块补测 | 覆盖率下滑或核心链路改动时应补定向 / 全量测试结果一起提交 |
| Verify | `pnpm verify` | 60 分钟 | 发布前、跨模块流程、需要完整证据链 | 仅在需串联 `lint + typecheck + test` 时使用，不作普通小改动默认命令 |

## 5. 覆盖率目标

- 统计口径以 `vitest.config.ts` 的 `coverage.include` 为**唯一权威**（新增源码目录时须两处同步）：`packages/*/src/**/*.ts` + `apps/platform/app/**/*.ts` + `apps/platform/server/**/*.ts` + `scripts/*.mjs`。`.vue` 组件与 Playwright e2e（`apps/platform/tests/e2e/`）**不纳入**（前者无组件级单测且 v8 对 SFC 插桩依赖 vue 插件，后者由 `test.exclude` 排除）。
- **目标**：整体 + `packages/core` / `packages/engine` / `packages/cli` / `packages/mcp` + `apps/platform/server` / `apps/platform/app` + `scripts/` 均 >= 80%（vitest thresholds 全局门槛；未达标时 `pnpm run test:coverage` 非零退出）。提升策略：先补缺口分析，再逐模块推进，不追求一次性全量达标。
- **5.1 覆盖率冲刺执行方法**：补测前先取一次 fresh 基线（`pnpm test:coverage` 输出为准）并估算「离目标还差多少覆盖行数」+ 预期先打的高 ROI 切片；优先选大体量低覆盖文件 / 已有测试基础的模块 / 能稳定命中失败路径的 service；坚持「小步快跑」（每次只改当前切片、改完立即跑该文件或同级最小定向命令）。全量 `pnpm test:coverage` 只在「累计增益接近阶段目标」或「需刷新全仓基线决定下一批 ROI」时执行，禁止每补完一个小文件就重跑全量。冲刺过程必须把基线 / 估算缺口 / 已补切片 / 最近一次全量 checkpoint / 剩余高 ROI 候选 / 未覆盖边界写入 [todo.md](../plan/todo.md) 或专项记录。

## 6. 测试原则

- **行为导向**（聚焦业务行为，不复刻实现细节）；**最小复现优先**（根因不明时先编最小复现测试，一次验证一个假设）；**覆盖维度**至少含主流程 / 失败路径 / 边界条件。
- **Mock 原则**：mock 不掩盖真正的集成风险——优先真实调用，仅在外部依赖不可控时使用。
- **Mock 上限对执行速度敏感（跨平台 flaky）**：循环 / 轮询类测试的固定次数 mock（如 nock `times(100)`）在更快环境（CI Linux vs 本地 Windows）可能被突破 → 第 N+1 次请求 No match；优先 `persist()`（无上限）或放大 10 倍并注明原因；此类测试本地连跑多次后仍需 CI 核验。
- **失败处理**：测试失败时先解释根因，再决定改代码还是改测试——**严禁直接改断言让它绿掉**。
- **函数签名变更必须同步所有调用方并验证**：utility 签名变更后 grep 全仓调用方同步更新；`pnpm typecheck` **不**捕捉 vitest `vi.mock` 下的类型错误——F 阶段本地 typecheck 后必须补 A 阶段 Review Gate 独立核验调用方一致性，utility 抽取后单测一次性覆盖全分支并含「调用方误用」回归 case。
- **utility 单测一次性覆盖所有分支**（含 NaN / Infinity / 缺失字段 / 负时长 / 非法日期），不接受「先实现后补测」两段式。
- **测试隔离用 `afterEach` 兜底**：describe 块 cleanup 统一用 `afterEach`（vitest 钩子），而非 it case 末尾手动 cleanup——后者在 `expectError` 抛错 / 异常分支时易被跳过导致污染后续测试；手动 cleanup 块可保留作正向恢复兜底。
- **test helper 强契约类型**：message 断言可用 `Record<string, unknown>`；code / data 强契约断言需放宽为 `Record<string, any>` 或引入泛型 `expectError<T = Record<string, unknown>>`（否则 strict 模式下 `err.data?.code` 访问报 TS2339）。
- **CI 最终裁决**：修复的验收标准是 CI 全部通过，不是本地通过。
- **测试输入用真实形态**：fixture 应使用真实格式输入（如带固定前缀的 ID），合成数据会漏掉真实格式才触发的缺陷。
- **lint 门禁**：`--max-warnings N` 让存量 warning 成为 CI 硬门禁倒逼清理；测试名必须与真实断言一致（误导性测试名会掩盖缺口）。
- **zod `parseOptional<T>` 三态语义 helper**：`apps/platform/server/utils/zod-helpers.ts` 提供 `parseOptional<T>(schema, value): { success, value?, isProvided }`，强制区分「未传」与「传 undefined」；应用处配套单测覆盖三态边界（[归档 §六十一](../design/governance/experience-archive-§49-§69-recent-investigation.md#六十一、m25-4-i18n-anchor-check-工具化-locale-文件-insert-anchor-错位污染检测-zod-optional-陷阱-helper-2026-09-08-commits-80912c2-65a8ec1) + [归档 §五十六](../design/governance/experience-archive-§49-§69-recent-investigation.md#五十六、m24-1-pr-check-状态监测-mvp-5-phase-串行-a-阶段-reject-内联修复-6-atomic-commits-闭环-2026-09-03-commits-36ee026-1068d6e-89e1344-e841b82-19037d5-4803372)）。

- **6.1 E2E 实践模式（Playwright）**：**用例必须幂等**（同一数据库二次运行是回归验证手段；固定名必撞唯一索引 → 用 `Date.now()` 时间戳唯一名，global-setup 注册账号容忍已存在 200/201/422）。**服务端用构建产物**（`.output/server/index.mjs`，独立端口 + 独立库 + 独立 AUTH_SECRET；e2e 库须显式 `DATABASE_SYNCHRONIZE=true`）。**会话复用**（global-setup 注册首用户 admin 保存 storageState，管理页用例复用；权限用例在测试内注册登录）。**CI 单 worker 串行**（共享 SQLite 并行写互相干扰：`workers: 1` + retry 2 + blob 报告）。**目录隔离**（`*.e2e.test.ts` 须 `exclude: ['**/tests/e2e/**']`；新增 Playwright 容器沿用 `*.test.ts` 命名会命中 vitest 默认 include → 入库前先跑全量 `pnpm test` 并同步补 `test.exclude`）。**容器内 Chromium 需 `TMPDIR=/dev/shm`**（`/tmp` 处于 overlayfs 时 renderer 会在真实页面崩溃，`page.goto` 报 `Page crashed`）。**本机多 worker + 共享 SQLite 会偶发 flaky**（`workers` 仅 CI 强制为 1；「单跑失败但单独运行通过」不等于代码缺陷，权威证据用 `--workers=1`（CI 等价）连跑两遍）。**运行时 `data/` 产物会污染本地 vitest 与 check-docs**（平台克隆产物落在 `apps/platform/data/runs/`；`vitest.config.ts` 的 `test.exclude` + `check-docs.mjs` 遍历剪枝已根治，临时规避用 CLI `--exclude`）。**排除模式必须覆盖两个 root**（仓库根运行 root = 仓库根，包目录内运行 root = 包目录；两条模式并存并分别用 `vitest list` 计数验证）。**运行时目录排除要「下降前剪枝」且用路径前缀而非通用目录名**（`apps/platform/data`，不用 `data`——会误伤 `docs/data`；相邻前缀须有回归用例）。**限流豁免**（better-auth 内置 sign-in 规则优先于 customRules，无代理 IP 头时回退共享桶 → e2e 环境 `E2E_TEST=true` + `advanced.ipAddress.disableIpTracking: true` 跳过）。**浏览器 UI 验证必须使用视觉模型 agent**（V 阶段派发 `ui-validator` subagent；无视觉能力者只能报告计算样式值、无法确认视觉回归）。**Nuxt SSR + CSR 双层 fetch 的 mock 限制**（`page.route` 只在浏览器上下文生效；SSR 已渲染的真实数据无法被覆盖 → 需 spa mode / service worker / in-process 测试）。**webServer 缓存必须 rebuild**（改 `.vue` / `.ts` 后须清 `.nuxt` / `.output` 并重建再跑 e2e，否则加载旧 build）。**`page.route` 注册顺序铁律**（必须在 `page.goto` 之前注册，否则 `onMounted` 抢跑走真实 API）。**CI 失败分析必看 `error-context.md`**（含 accessibility tree，比堆栈更快定位 DOM-based 失败；诊断顺序 error-context.md → trace.zip → webServer 日志）。**Nuxt 4 payload 解析**（devalue 编码为稀疏数组，属性也是位置引用，必须递归解引用；不要假设标准 JSON 结构）。
- **6.2 真实基础设施集成测试（进程内，优先于后台服务冒烟）**：验证依赖真实外部设施（Redis / DB 服务）的代码路径时优先进程内集成测试（vitest 直驱，跑完即退出），而非后台常驻服务冒烟（后者在 Windows shell 工具环境不可靠：进程脱离会话、文件锁、端口 / 句柄占用）。要求：**环境门控**（`describe.skipIf(!process.env.TEMP_XXX)`——本地设 env 启用、CI 无设施自动 skip 不失败）；**幂等设计**（随机 id 避免重复运行命中残留）；**依赖注入可测性**（处理器 / 回调支持注入，断言「收到正确数据」）；**资源清理**（尾部显式 `close()` + `disconnect()`）；**职责边界**（进程内覆盖基础设施层行为，HTTP 层状态流转才需后台服务 / CI service container）。
- **6.3 集成外部库测试模式（薄引用）**：集成外部库时**集成层测试不 mock 真实被集成库**（保留真实代码路径可执行），mock 仅替换被测单元边界；完整规范见 [development.md §5.1.15](./development.md#_5-1-工程实践规则)。

### 6.4 E2E 网络抗性 + 未认证 API 调用标准模式

- **网络抗性**：串行多次 setupPage.request / pageSignin 后紧接 fixtures cleanup 首请求偶现 `ECONNRESET`（TCP RST）。处理遵循「穷举排查 → test helper 层兜底（复用 Playwright 内置 backoff 重试，仅对指定错误码触发）→ 根因单独登记」三阶段；helper 兜底的 JSDoc 必须穷举「哪些错误重试」+「哪些错误不重试」。
- **未认证 API 调用**：`test.use({ storageState })` 可能经 fixture pool 隐式传播到该 scope 内所有 `browser.newContext()`（未认证用例莫名收到 200/201）。**修复模式**：测试 `browser.newContext()` 必须显式传 `storageState: { cookies: [], origins: [] }`，与 `test.use` 完全脱钩。
- **控制服务端 locale 用显式 cookie header**：用 `setI18nCookie` 操作浏览器上下文 cookie 时，客户端框架可能在 `goto` 后**异步回写**该 cookie，与测试设置竞争 → 全量顺序运行偶发断言失败。**做法**：在请求 header 内显式剥离 / 附加目标 cookie（Playwright `APIRequestContext` 在显式传入 `cookie` header 时不合并上下文 jar）。
- **CI 失败时间模式诊断**：global-setup 失败 → 后续测试不运行 → 掩盖后续真实状态；修复需走完整链路（global-setup → setup → tests → teardown）。

- **6.5 断言禁用恒真写法（裸数字 / 短字符串）**：`toContain('3')` / `toContain(3)` 会被 fixture 数据（日期含字符 `3`、ID、计数字段）污染**恒真**，计数错误 / 缺失无法拦截。**修复模式**：表格 / 结构化输出断言用**完整行**（含标签与管道符）或 `toMatch` 正则锚定边界；数字断言优先 `toBe(n)` 直接测数据层。**断言子串必须是被测输出的独有子串**（否则其他字段能提供该串则假绿），**且必须锁定失败来源**：`expect(() => f()).toThrow()` 无参会接受任何抛错 → 新增 / 修改断言后须主动做 2-3 个「故意破坏生产代码」的 mutation 确认用例会失败。**外部命令输出的大小写 / 规范化形态会让反向断言恒真**（如 `git config --local --list` 输出一律小写键名 → `not.toContain('push.gpgSign')` 无条件为真），改用 `git config --local --get <key>`；**环境相关断言优先「同环境反例对照」**。**不可达的防御性分支不强求测试守护**：mutation 存活但经分析当前不可达时，① 登记「已知边界（审计确认，无需动作）」+ 写明不可达原因；② 为**可达**路径补调用点断言；③ commit body 记录决策理由。**e2e 文案断言不得锁行尾**：带计数的菜单项 / 提示语用「前缀 + 数字占位」正则（如 `/导出全部筛选结果（共 \d+ 条/`），锁定尾部括号会在超限态追加后缀文案时假失败。
- **交互断言必须锁定「只能由目标行为产生」的状态**：点击 / 提交类断言若点击目标未绑定事件（事件挂在内部子元素上，如排序触发器是表头内的按钮），断言可能被**无关默认状态**满足（如列表默认排序恰好命中预期首行）→ 必须先确认事件绑定元素并点击它，再断言只能由该行为产生的可观测态（如排序属性）；三态控件（升 → 降 → 无）须逐次操作并**等待属性回写**后再判定，固定次数点击会因异步渲染读旧值而过冲。
- **6.6 ESM 模块 mock 受限的处理原则**：Vitest 对 ESM 命名导出无法用 `vi.spyOn` 拦截时，按优先级处理——① **真实故障注入**（用真实文件系统 / 进程级隔离制造故障，零生产代码改动）；② **可注入依赖**（真实故障不可达时才给生产代码加可选注入点，默认值即原实现）；③ 确认 `vi.mock` 支持度后再用。**不得**为凑覆盖率写「看似 mock 实则恒过」的断言，也不得静默 `it.skip`（skip 必须带 TODO 理由并登记 backlog）。

- **ESM 接线断言用「部分 mock + 委托真实实现」**：需断言「A 以某实参调用 B」时，用 `vi.mock` 的 `importOriginal` 保留其余导出、仅包装目标函数（记录实参后**委托真实实现**）——既锁定接线，又不破坏依赖真实行为的既有用例；实参容器由 `vi.hoisted` 提供，用例内断言后于 `beforeEach` 清空。

### 6.7 视觉回归（截图识别层，apps/platform）

`apps/platform/playwright.visual.config.ts` 是与 e2e **完全隔离**的独立工程（独立 testDir / 端口 / SQLite 库 / 认证目录），不并入 e2e 的 `testMatch` 与断言语义。入口 `pnpm --filter @dependfix/platform test:visual`（更新基线加 `:update`）；基线快照入仓库（PR 中 review 差异）。服务端复用 `.output` 产物，**取证前必须先 build**。环境固定（chromium / 1440×900 / deviceScaleFactor 1 / locale `zh-CN` / 时区 `Asia/Shanghai` / `colorScheme: 'light'` / `animations: 'disabled'` / `caret: 'hide'` / `workers: 1` / `retries: 0`）；主题以确定性方式注入（写 localStorage，不依赖系统 `prefers-color-scheme`）；数据确定性（独立库 + globalSetup 先清理再注入专属 fixtures，e2e 数据集不可复用）。

- **阈值口径**：`maxDiffPixels: 100` + `threshold: 0.1`（绝对像素上限，不用比例兜底），对应两条互相独立、各自可逃逸的盲区轴——**色阈值轴**（`maxDelta = 35215 × threshold²`，0.2 档会把同明度色相 / 灰度替换判为同色）与**面积预算轴**（超阈像素数上限，「少面积 × 高色差」变更在 200 档被吞、100 档可检出）。抗锯齿噪声由 Playwright 透传的 `includeAA: false` 排除，故收紧两项**不会**放大 AA 抖动；残留边界为「影响面积 < 100 px」仍需人工 / `ui-validator` 复核。
- **基线假绿防护（写入路径锚定）**：基线覆盖 fixtures 数据时，用例必须先断言「行数 / 关键文案 / 标签色调」再截图，否则 fixtures 写入路径失效时页面回落空态、基线被重新生成为空态仍全绿。**覆盖声明须逐列核对**档位来源，避免 overclaim 与真实缺口并存。
- **确定性取值锚定（先钉死取值，再入基线）**：会渲染进画面的**运行时派生值**必须在数据一侧钉死——实体主键（如 `ScanRun.id`，以短 ID 出现在运行抽屉 / 详情弹窗）、时间戳（`createdAt` 影响列表排序与统计卡，`startedAt` / `finishedAt` 渲染为时间与时长）、执行级错误文本等，缺省由「注入时刻 / 自动生成 ID」填充时基线会逐次漂移；fixtures 端点因此提供可选覆盖（`null` 与「不传」语义分离），关键取值（如主键）另以 **fail-fast 读取器**兜底——缺钉死即失败，不静默产出不可复现基线。瞬时派生值（如 cron 预览的 next-N 次触发时间）无法钉死时改用 `data-visual-mask` 遮蔽。
- **动态区域显式遮蔽**：运行时派生值标 `data-visual-mask` 由 `dynamicMask()` 在截图前遮蔽，不用像素容差兜底；**加遮蔽会改变基线像素**，必须重新生成该页基线。
- **兜底动作先验证副作用**：重试 / 复位动作要在**当前容器语义**下实测副作用后再采纳——模态弹窗内按 `Escape` 会关闭宿主弹窗（`closeOnEsc` 默认开启），使「复位后重试」直接失效；重试应只重复「原本要做的动作」，且首次等待不得低于原口径（压缩等待会把「慢但可通过」变成硬失败）。
- **元素级补拍**：整页基线覆盖不到的溢出区域（如宽表右端列）滚到最右后截取容器，只改**容器内部滚动位置**，不动 viewport / 阈值 / 列宽；helper 支持可选 `mask` 参数以与整页基线同遮蔽口径。**弹窗内浮层**（门户面板不在弹窗子树内）用**视口级**截图覆盖弹窗 + 遮罩 + 面板的合成结果，并先断言「面板不是弹窗后代」挡住假绿。
- **反例验证纪律**：基线落地必须做一次「人为注入样式改动 → 用例如期失败 → 还原后全绿」，证明阈值非恒真，不得只跑正例；**标定注入点按「页面主表面 → 文本色 → 边框」顺序选**，并记录差异像素与覆盖面积解释——`bg-elevated` 这类小面积 token 在整页基线上只命中数百像素（余量 6.5×），通过不等于基线灵敏，不得据此宣称「已证明」。**兜底类逻辑（重试）同样要做注入式标定**：注入目标故障后断言「最终成功 + 耗时 ≥ 首次等待窗口」，只靠「连跑 N 轮全绿」无法证明兜底分支被走到（1/6 抖动下 6 轮全绿概率约 33%）。**灵敏度取证手法**（可复用）：复制既有基线到临时 spec 的快照目录 → `page.addStyleTag` 注入改动 → 三档 expect 选项分别读全量差异像素 / 超阈像素数 / 门禁判定；不注入的对照组配 `maxDiffPixels: 1` 证明零漂移；新基线用**变异检验**证明真覆盖目标区域；脚手架跑完即删（按类名注入必须排除变体，其底色透明会制造高色差假信号）。**注入点必须落在新增层内部**（面板底色 / 弹窗底色 / 抽屉宽度 / 提示底色）——页面级全局样式只证明「阈值非恒真」，不能证明新基线对目标区域敏感；内容覆盖区另由截图前置断言承担。
- **测试库隔离与污染核验**：视觉库（`apps/platform/data/visual.sqlite`）与 e2e 库相互隔离，且只允许 fixtures 写入；**审计 / 探针不得向测试库写入业务数据**（探针一律只读或复制到 `/tmp`）。视觉复跑前若出现「与代码无关的整表差异」，先核对库内仓库集合是否等于 fixtures 集合（残留行会使视口级基线整体失配）；global-setup 现默认按 `VISUAL_FIXTURES.repos` 白名单清理并在截图前断言集合一致（`VISUAL_FIXTURES_AUTO_CLEAN=0` 可关闭，见 [visual/README.md](../../apps/platform/tests/visual/README.md)），确认污染后按主键清理再复跑，**不得**用重建基线掩盖污染。
- **纯偏移归因手法**（可复用）：间距 / 位置类改动的基线更新必须回答「差异是否**只**由该偏移引起」——把新旧 PNG 双解码到 canvas，在重叠区逐字节比较，输出「首个差异行之上是否逐行全同 / 0-8 范围内最佳垂直位移 / 该位移下逐字节相等比例」三项。
- **读基线须知**：`apps/platform/tests/visual/README.md` 记录已裁定的既有视觉差异（避免误判为新回归）与已知盲区；`pr-checks` 行级渲染 / `alerts` 宽表右端列 / 弹窗内浮层展开态 / 浮层落点页（schedules 表单浮层、scans 运行详情弹窗、alerts 运行抽屉、pr-checks Toast）的覆盖边界与未覆盖面（运行失败重试二次确认层、Tabs 切换态）见该 README 与 [迁移评估 §15](../design/governance/caomei-ui-migration.md)。
- **与 `ui-validator` 的分工**：视觉回归只兜「像素漂移」，不做交互 / 可用性 / 语义审查（后者由 `ui-validator` 承担）。**上游归因与上报**按 [平台规范 §7.5](./platform.md#_7-5-上游组件问题归因与-issue-上报流程) 执行。
- **CI 接入**：`test.yml` 的 `visual` job（独立 runner + 失败产物上传）**阻断语义已启用**——视觉失败使 Test workflow 变红（**workflow 级阻断信号**；仓库未配置 required status checks，故不构成硬性合并门禁）。
- **改动页面即需重建其基线（含以该页为取景底图的基线）**：整页 / 视口截图类基线在页面**可见结构 / 样式 / 文案**变更后必然失配（新增工具栏、页头改 flex、i18n 提示语增删词条等，即使「只加一个按钮」）；**以该页为取景底图的其他用例基线同样连带失配**（如弹窗内浮层的视口级截图会包含该页），需一并重建并连跑两遍验证幂等；未被视觉覆盖的页面须在交付说明显式登记「无视觉守卫」。**文案类改动同受本条款约束**（改的是一行字、检的是整张视图），且**归因前先比对失败谱**：像素数与差异区域在多次运行间一致时属确定性变更，不得归因为运行间抖动；**重建后的基线必须由不带 update 的连跑复核**——`--update-snapshots` 的落盘帧可能不是稳定帧，仅比对 update 产物不足以证明基线可用。判定口径与维护协议见 [visual/README.md](../../apps/platform/tests/visual/README.md)。
- **review 检查点**：本节「取证前先 build / 加遮蔽须重生成基线 / 反例验证纪律 / 文案类改动连带失配与失败谱归因」四条**必须**级约定已挂 [review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵-严格约束逐条挂接)。

### 6.8 取证工件必须与冻结代码同批生成

审计 / 文档引用的取证工件（截图、计算样式 JSON、报告样本）必须在**代码冻结后**、与最终验证链（`build` → 全量 e2e → 浏览器取证 → 计算样式取证）**同批生成**；文档中引用的数字只在链条尾部落笔。工件脚本自身的测量口径（选择器作用域、需先打开的弹层 / 面板）也要随代码变化同步修正。

- **mutation 工件必须可独立复核**：记录每个变异的文件、变异前 md5、失败用例名与复现命令；只写「N/N 击杀」汇总无法复核，审计会判证据链不完整；还原后须 md5 核对一致。

### 6.9 CI 阻断门禁接线（负例标定 / 自指面 / 阻断强度）

把某个本地检查脚本接入 CI 并声明为**阻断**时，必须做三件套自检，否则「绿」不可信或门禁语义被高估：

1. **负例标定**：植入 1 处违例（如临时探针文件）确认脚本**退出码非 0**，跑后删除脚手架——否则「0 命中」无法区分「真绿」与「脚本失效 / 命令名写错」。
2. **自指面核对**：新步骤所在文件若在脚本扫描面内，其新增注释块自身不得含无指针规划编号，否则新门禁会被自己拉红。
3. **阻断强度显式声明**：仓库未配置 required status checks 时，CI 步骤只是 **workflow 级变红信号**而非硬性合并门禁，须在步骤注释与规范中写明，避免把「变红」误读为「禁止合并」。

**配套**：步骤位置优先落在静态检查簇（便宜且早失败），并确认其不依赖前序构建产物；接入后本地复跑基线一次（0 命中 / exit 0）留痕。

**多入口复用时必须单点声明**：同一门禁集被 Test / release / 周回归多处消费时，集合声明收敛到一个脚本（现有 `scripts/run-doc-gates.mjs` 的 `DOC_GATES`），各调用方只引用该单一集合，并用单测锁定「Test 文档步骤与集合双向差集为空」与「release / profile 均引用该入口」——否则新增门禁只接一处会出现「Test 红但 release 仍可发版」的口径缺口。

**mutation 覆盖面**：mutation 必须打到「数据真正落库 / 分支真正复用」的层——只改端点传参覆不到编排层写回（实测：删除编排层两处来源写入后用例全绿），补「落库字段 / 复用分支 / 续用不覆写」断言后才检出。同类缺口见多仓共享 `workDir` 的复用分支。

### 6.10 脚本级与被测服务同进程的测试模式

- **入口 / 编排脚本用真实 shell 执行测试**：`sh` 直驱脚本 + 经 `PATH` 注入桩命令（`id` / `sleep` / `date`）重塑环境（降权分支、即时退避、时间快进），断言基于输出流与进程存活探测；Windows 用 `describe.skipIf` 跳过。
- **被测服务与测试同进程时不得用同步子进程调用**：`spawnSync` 会阻塞同进程事件循环——本进程内的审计代理无法 accept 连接、记录为空，会被误判为「服务未生效」；一律用异步 `spawn` + 等待退出，必要时配 kill 超时。
- **以脚本输出行为同步点发信号的用例**：断言须同时锁定退出形态（`{ code, signal }`）并在失败消息里说明 signal 非空即「信号落在处置安装之前」；只在特定调度下出现、运行期无法稳定复现的竞态，补**源码顺序断言**固化「处置先于就绪输出」不变量，不依赖运行期复现。放大窗口做负例标定时，桩命令（`PATH` 注入的 `sleep` 等）会屏蔽脚本内同名调用——须用绝对路径或换用未被桩住的命令。

- **shell 管道状态不可只取末命令**：`cmd | tail` 后接 `|| fail` 在 dash（无 `pipefail`）下是死代码——管道退出码取最后一个命令；需要拆分「捕获命令输出（带 `|| fail`）」与「解析输出」两步，并单独断言关键日志行。

### 6.11 门禁 / 脚本类单测的两个 mock 语义陷阱

- **`process.exit` 被 mock 时不会终止执行**：CLI 早返回分支只写 `process.exit(0)` 会在测试环境继续落到后续逻辑，使「删除该分支副作用」的 mutation 存活；早返回处须同时 `return`（与「文件不存在跳过」路径同形）。
- **夹具字面量会被被测门禁脚本自身扫到**：为 `scripts/**` 写单测时，夹具里写入会被该脚本判定的字面量（如规划编号）会让门禁在**源码层**命中自己；夹具改用运行时拼接构造（`['S','1'].join('-')`），或利用「行尾注释提取会跳过字符串字面量」的特性——但 `it(...)` 行整体作为测试名单元时不做引号感知。

### 6.12 审计轮次打点与验证链扩面复扫

- **多轮审计每轮发起前打点**：每轮都要记录**发起 + 返回**两个时刻；只记发起时刻时返回只能给上界，时间盒核验数据不完整。
- **默认验证链扩条后须复扫 override 面**：自定义链（自用 `commands` / 平台 `verifyCommands` / action `commands`）为**整链替换**，不会随默认链扩展自动跟随。

### 6.13 覆盖率回补与 CI 环境隔离

- **新增脚本的 patch 覆盖率**：默认参数箭头函数与顶层 `isDirectExecution` 守卫会被计入新增行——把可注入项做成显式参数 seam（如 `gates` / `exec`），测试里驱动真实最便宜命令；CLI 守卫按项目惯例 `v8 ignore` 并注明理由。否则逻辑全对的新脚本仍会卡在 patch 覆盖率门禁上。
- **依赖环境变量的用例必须在用例内隔离**：`GITHUB_ACTIONS` 等变量在 CI runner 恒为真，本地绿 ≠ CI 绿。断言「缺省行为」用 `vi.stubEnv('X','')` + `finally vi.unstubAllEnvs()`；断言「变量存在行为」显式 stub 真值后还原。

### 6.14 时间敏感用例：边界值不拿真实时钟的「恰好等于阈值」

- **做法**：涉及 `Date.now()` / timer / deadline 的断言优先给被测函数注入 `now`；无法注入时构造值必须留明确余量（如阈值 + 60s），不要用 `Date.now() + 阈值`——构造与取值间隔 ≥1ms 就会把余量吃掉，全量并发下偶发失败。
- **判据**：边界两侧用显式常量断言（`= 阈值` 允许 / `阈值 - 1` 拒绝），真实时钟只用于「远大于 / 远小于」的场景；单文件连跑 3 次仅作 smoke，稳定性证明以注入 `now` / 常量两侧断言为准（连跑全绿不能替代反例验证）。

## 7. 测试代码质量

- 测试代码本身也需通过 lint + typecheck；测试描述（`it('does X')`）聚焦业务行为、使用清晰语言；避免过度耦合内部实现细节。

## 8. 高效运行技巧

- **按需定向测试**：日常开发与修复 Bug 时优先只跑与本次改动直接相关的测试文件（全量测试缓慢，频繁运行严重阻塞开发）；关键字方式无法稳定命中同类 `*.test.ts` 时用 `npx vitest run path/to/file.test.ts`。
- **排查慢速测试**：检查是否在每个 `test` 中重复进行了昂贵的资源创建 / 销毁，应尽量利用 `beforeAll` / `afterAll`。

## 9. 样例数据与夹具

- 准备 Dependabot 告警、lockfile 漂移失败与 Code Scanning 样例数据，使关键流程可在不依赖线上真实仓库的情况下做回归测试。

## 10. 相关文档

- [开发规范](./development.md) / [AI 协作规范](./ai-collaboration.md) / [项目规划规范](./planning.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。

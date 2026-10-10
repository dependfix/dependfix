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
- **zod `parseOptional<T>` 三态语义 helper**：`apps/platform/server/utils/zod-helpers.ts` 提供 `parseOptional<T>(schema, value): { success, value?, isProvided }`，强制区分「未传」与「传 undefined」；应用处配套单测覆盖三态边界（[归档 §六十一](../design/governance/experience-archive-§49-§57-recent-investigation.md) + [归档 §五十六](../design/governance/experience-archive-§49-§57-recent-investigation.md)）。

- **6.1 E2E 实践模式（Playwright）**：**用例必须幂等**（同一数据库二次运行是回归验证手段；固定名必撞唯一索引 → 用 `Date.now()` 时间戳唯一名，global-setup 注册账号容忍已存在 200/201/422）。**服务端用构建产物**（`.output/server/index.mjs`，独立端口 + 独立库 + 独立 AUTH_SECRET；e2e 库须显式 `DATABASE_SYNCHRONIZE=true`）。**会话复用**（global-setup 注册首用户 admin 保存 storageState，管理页用例复用；权限用例在测试内注册登录）。**CI 单 worker 串行**（共享 SQLite 并行写互相干扰：`workers: 1` + retry 2 + blob 报告）。**目录隔离**（`*.e2e.test.ts` 须 `exclude: ['**/tests/e2e/**']`；新增 Playwright 容器沿用 `*.test.ts` 命名会命中 vitest 默认 include → 入库前先跑全量 `pnpm test` 并同步补 `test.exclude`）。**容器内 Chromium 需 `TMPDIR=/dev/shm`**（`/tmp` 处于 overlayfs 时 renderer 会在真实页面崩溃，`page.goto` 报 `Page crashed`）。**本机多 worker + 共享 SQLite 会偶发 flaky**（`workers` 仅 CI 强制为 1；「单跑失败但单独运行通过」不等于代码缺陷，权威证据用 `--workers=1`（CI 等价）连跑两遍）。**运行时 `data/` 产物会污染本地 vitest 与 check-docs**（平台克隆产物落在 `apps/platform/data/runs/`；`vitest.config.ts` 的 `test.exclude` + `check-docs.mjs` 遍历剪枝已根治，临时规避用 CLI `--exclude`）。**排除模式必须覆盖两个 root**（仓库根运行 root = 仓库根，包目录内运行 root = 包目录；两条模式并存并分别用 `vitest list` 计数验证）。**运行时目录排除要「下降前剪枝」且用路径前缀而非通用目录名**（`apps/platform/data`，不用 `data`——会误伤 `docs/data`；相邻前缀须有回归用例）。**限流豁免**（better-auth 内置 sign-in 规则优先于 customRules，无代理 IP 头时回退共享桶 → e2e 环境 `E2E_TEST=true` + `advanced.ipAddress.disableIpTracking: true` 跳过）。**浏览器 UI 验证必须使用视觉模型 agent**（V 阶段派发 `ui-validator` subagent；无视觉能力者只能报告计算样式值、无法确认视觉回归）。**Nuxt SSR + CSR 双层 fetch 的 mock 限制**（`page.route` 只在浏览器上下文生效；SSR 已渲染的真实数据无法被覆盖 → 需 spa mode / service worker / in-process 测试）。**webServer 缓存必须 rebuild**（改 `.vue` / `.ts` 后须清 `.nuxt` / `.output` 并重建再跑 e2e，否则加载旧 build）。**`page.route` 注册顺序铁律**（必须在 `page.goto` 之前注册，否则 `onMounted` 抢跑走真实 API）。**CI 失败分析必看 `error-context.md`**（含 accessibility tree，比堆栈更快定位 DOM-based 失败；诊断顺序 error-context.md → trace.zip → webServer 日志）。**Nuxt 4 payload 解析**（devalue 编码为稀疏数组，属性也是位置引用，必须递归解引用；不要假设标准 JSON 结构）。
- **6.2 真实基础设施集成测试（进程内，优先于后台服务冒烟）**：验证依赖真实外部设施（Redis / DB 服务）的代码路径时优先进程内集成测试（vitest 直驱，跑完即退出），而非后台常驻服务冒烟（后者在 Windows shell 工具环境不可靠：进程脱离会话、文件锁、端口 / 句柄占用）。要求：**环境门控**（`describe.skipIf(!process.env.TEMP_XXX)`——本地设 env 启用、CI 无设施自动 skip 不失败）；**幂等设计**（随机 id 避免重复运行命中残留）；**依赖注入可测性**（处理器 / 回调支持注入，断言「收到正确数据」）；**资源清理**（尾部显式 `close()` + `disconnect()`）；**职责边界**（进程内覆盖基础设施层行为，HTTP 层状态流转才需后台服务 / CI service container）。
- **6.3 集成外部库测试模式（薄引用）**：集成外部库时**集成层测试不 mock 真实被集成库**（保留真实代码路径可执行），mock 仅替换被测单元边界；完整规范见 [development.md §5.1.15](./development.md)。

### 6.4 E2E 网络抗性 + 未认证 API 调用标准模式

- **网络抗性**：串行多次 setupPage.request / pageSignin 后紧接 fixtures cleanup 首请求偶现 `ECONNRESET`（TCP RST）。处理遵循「穷举排查 → test helper 层兜底（复用 Playwright 内置 backoff 重试，仅对指定错误码触发）→ 根因单独登记」三阶段；helper 兜底的 JSDoc 必须穷举「哪些错误重试」+「哪些错误不重试」。
- **未认证 API 调用**：`test.use({ storageState })` 可能经 fixture pool 隐式传播到该 scope 内所有 `browser.newContext()`（未认证用例莫名收到 200/201）。**修复模式**：测试 `browser.newContext()` 必须显式传 `storageState: { cookies: [], origins: [] }`，与 `test.use` 完全脱钩。
- **控制服务端 locale 用显式 cookie header**：用 `setI18nCookie` 操作浏览器上下文 cookie 时，客户端框架可能在 `goto` 后**异步回写**该 cookie，与测试设置竞争 → 全量顺序运行偶发断言失败。**做法**：在请求 header 内显式剥离 / 附加目标 cookie（Playwright `APIRequestContext` 在显式传入 `cookie` header 时不合并上下文 jar）。
- **CI 失败时间模式诊断**：global-setup 失败 → 后续测试不运行 → 掩盖后续真实状态；修复需走完整链路（global-setup → setup → tests → teardown）。

- **6.5 断言禁用恒真写法（裸数字 / 短字符串）**：`toContain('3')` / `toContain(3)` 会被 fixture 数据（日期含字符 `3`、ID、计数字段）污染**恒真**，计数错误 / 缺失无法拦截。**修复模式**：表格 / 结构化输出断言用**完整行**（含标签与管道符）或 `toMatch` 正则锚定边界；数字断言优先 `toBe(n)` 直接测数据层。**断言子串必须是被测输出的独有子串**（否则其他字段能提供该串则假绿），**且必须锁定失败来源**：`expect(() => f()).toThrow()` 无参会接受任何抛错 → 新增 / 修改断言后须主动做 2-3 个「故意破坏生产代码」的 mutation 确认用例会失败。**外部命令输出的大小写 / 规范化形态会让反向断言恒真**（如 `git config --local --list` 输出一律小写键名 → `not.toContain('push.gpgSign')` 无条件为真），改用 `git config --local --get <key>`；**环境相关断言优先「同环境反例对照」**。**不可达的防御性分支不强求测试守护**：mutation 存活但经分析当前不可达时，① 登记「已知边界（审计确认，无需动作）」+ 写明不可达原因；② 为**可达**路径补调用点断言；③ commit body 记录决策理由。
- **6.6 ESM 模块 mock 受限的处理原则**：Vitest 对 ESM 命名导出无法用 `vi.spyOn` 拦截时，按优先级处理——① **真实故障注入**（用真实文件系统 / 进程级隔离制造故障，零生产代码改动）；② **可注入依赖**（真实故障不可达时才给生产代码加可选注入点，默认值即原实现）；③ 确认 `vi.mock` 支持度后再用。**不得**为凑覆盖率写「看似 mock 实则恒过」的断言，也不得静默 `it.skip`（skip 必须带 TODO 理由并登记 backlog）。

### 6.7 视觉回归（截图识别层，apps/platform）

`apps/platform/playwright.visual.config.ts` 是与 e2e **完全隔离**的独立工程（独立 testDir / 端口 / SQLite 库 / 认证目录），不并入 e2e 的 `testMatch` 与断言语义。入口 `pnpm --filter @dependfix/platform test:visual`（更新基线加 `:update`）；基线快照入仓库（PR 中 review 差异）。服务端复用 `.output` 产物，**取证前必须先 build**。环境固定（chromium / 1440×900 / deviceScaleFactor 1 / locale `zh-CN` / 时区 `Asia/Shanghai` / `colorScheme: 'light'` / `animations: 'disabled'` / `caret: 'hide'` / `workers: 1` / `retries: 0`）；主题以确定性方式注入（写 localStorage，不依赖系统 `prefers-color-scheme`）；数据确定性（独立库 + globalSetup 先清理再注入专属 fixtures，e2e 数据集不可复用）。

- **阈值口径**：`maxDiffPixels: 100` + `threshold: 0.1`（绝对像素上限，不用比例兜底），对应两条互相独立、各自可逃逸的盲区轴——**色阈值轴**（`maxDelta = 35215 × threshold²`，0.2 档会把同明度色相 / 灰度替换判为同色）与**面积预算轴**（超阈像素数上限，「少面积 × 高色差」变更在 200 档被吞、100 档可检出）。抗锯齿噪声由 Playwright 透传的 `includeAA: false` 排除，故收紧两项**不会**放大 AA 抖动；残留边界为「影响面积 < 100 px」仍需人工 / `ui-validator` 复核。
- **基线假绿防护（写入路径锚定）**：基线覆盖 fixtures 数据时，用例必须先断言「行数 / 关键文案 / 标签色调」再截图，否则 fixtures 写入路径失效时页面回落空态、基线被重新生成为空态仍全绿。**覆盖声明须逐列核对**档位来源，避免 overclaim 与真实缺口并存。
- **动态区域显式遮蔽**：运行时派生值标 `data-visual-mask` 由 `dynamicMask()` 在截图前遮蔽，不用像素容差兜底；**加遮蔽会改变基线像素**，必须重新生成该页基线。
- **元素级补拍**：整页基线覆盖不到的溢出区域（如宽表右端列）滚到最右后截取容器，只改**容器内部滚动位置**，不动 viewport / 阈值 / 列宽；helper 支持可选 `mask` 参数以与整页基线同遮蔽口径。**弹窗内浮层**（门户面板不在弹窗子树内）用**视口级**截图覆盖弹窗 + 遮罩 + 面板的合成结果，并先断言「面板不是弹窗后代」挡住假绿。
- **反例验证纪律**：基线落地必须做一次「人为注入样式改动 → 用例如期失败 → 还原后全绿」，证明阈值非恒真，不得只跑正例。**灵敏度取证手法**（可复用）：复制既有基线到临时 spec 的快照目录 → `page.addStyleTag` 注入改动 → 三档 expect 选项分别读全量差异像素 / 超阈像素数 / 门禁判定；不注入的对照组配 `maxDiffPixels: 1` 证明零漂移；新基线用**变异检验**证明真覆盖目标区域；脚手架跑完即删（按类名注入必须排除变体，其底色透明会制造高色差假信号）。
- **纯偏移归因手法**（可复用）：间距 / 位置类改动的基线更新必须回答「差异是否**只**由该偏移引起」——把新旧 PNG 双解码到 canvas，在重叠区逐字节比较，输出「首个差异行之上是否逐行全同 / 0-8 范围内最佳垂直位移 / 该位移下逐字节相等比例」三项。
- **读基线须知**：`apps/platform/tests/visual/README.md` 记录已裁定的既有视觉差异（避免误判为新回归）与已知盲区；`pr-checks` 行级渲染 / `alerts` 宽表右端列 / 弹窗内浮层展开态的覆盖边界见该 README 与 [迁移评估 §15](../design/governance/caomei-ui-migration.md)。
- **与 `ui-validator` 的分工**：视觉回归只兜「像素漂移」，不做交互 / 可用性 / 语义审查（后者由 `ui-validator` 承担）。**上游归因与上报**按 [平台规范 §7.5](./platform.md#75-上游组件问题归因与-issue-上报流程) 执行。
- **CI 接入**：`test.yml` 的 `visual` job（独立 runner + 失败产物上传）**阻断语义已启用**——视觉失败使 Test workflow 变红（**workflow 级阻断信号**；仓库未配置 required status checks，故不构成硬性合并门禁）。
- **review 检查点**：本节「取证前先 build / 加遮蔽须重生成基线 / 反例验证纪律」三条**必须**级约定已挂 [review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵严格约束逐条挂接)。

### 6.8 取证工件必须与冻结代码同批生成

审计 / 文档引用的取证工件（截图、计算样式 JSON、报告样本）必须在**代码冻结后**、与最终验证链（`build` → 全量 e2e → 浏览器取证 → 计算样式取证）**同批生成**；文档中引用的数字只在链条尾部落笔。工件脚本自身的测量口径（选择器作用域、需先打开的弹层 / 面板）也要随代码变化同步修正。

### 6.9 CI 阻断门禁接线（负例标定 / 自指面 / 阻断强度）

把某个本地检查脚本接入 CI 并声明为**阻断**时，必须做三件套自检，否则「绿」不可信或门禁语义被高估：

1. **负例标定**：植入 1 处违例（如临时探针文件）确认脚本**退出码非 0**，跑后删除脚手架——否则「0 命中」无法区分「真绿」与「脚本失效 / 命令名写错」。
2. **自指面核对**：新步骤所在文件若在脚本扫描面内，其新增注释块自身不得含无指针规划编号，否则新门禁会被自己拉红。
3. **阻断强度显式声明**：仓库未配置 required status checks 时，CI 步骤只是 **workflow 级变红信号**而非硬性合并门禁，须在步骤注释与规范中写明，避免把「变红」误读为「禁止合并」。

**配套**：步骤位置优先落在静态检查簇（便宜且早失败），并确认其不依赖前序构建产物；接入后本地复跑基线一次（0 命中 / exit 0）留痕。

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

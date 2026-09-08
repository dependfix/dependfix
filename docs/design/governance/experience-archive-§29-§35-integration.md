# 经验归档分片（§29 - §35）：集成测试与外部库（§二十九 - §三十五）

> 本分片从 [experience-archive.md](./experience-archive.md) §准入标准 分流而出（7 章，~82 行）。章节编号全局唯一，跨文件保持稳定；外链引用按 §编号 命中，与主窗口一致。

---

## 三十二、"已发布"判定不能依赖 npm CLI：Windows 下 execSync 超时必失效（2026-08-10）
- **案例**：发布管线自研化时实测 `isPublishedOnRegistry`（`execSync('npm view <pkg>@<version> version --json', { timeout: 10_000 })`）在 Windows 本地**每次都在 10s 整超时**（ETIMEDOUT，err.stderr 为空、status null），导致判定恒返回 null（保守跳过）——tag:released / release:publish 的"已发布判定"在本地完全失效。而同进程 Node fetch 直连 registry.npmjs.org 实测 1-2s 完成（E404 正确识别）。
- **根因**：npm CLI 在 Windows 是 `.cmd` 包裹（cmd.exe 派生 node 进程），单次启动 + registry 查询实测 >13s（与网络波动叠加），10s 超时必然触发；execSync 的 timeout 对 cmd 包裹进程的终止语义不可靠。**npm 慢不是网络慢**——registry 直连毫秒级响应，瓶颈在 CLI 启动开销。
- **修复**：`isPublishedOnRegistry` 改用 Node 原生 `fetch` 直连 `https://registry.npmjs.org/<pkg>`（abbreviated metadata header），语义保持：404→false / 非 2xx→null / `versions[version]` 命中→true；`AbortSignal.timeout(20_000)` 控超时；首次连接建立可能慢（UND_ERR_CONNECT_TIMEOUT 偶发）→ 网络异常重试一次（连接池复用后稳定），404/非 2xx 不重试；仍失败才保守返回 null。main 异步化并行查询（每包一次 fetch）。
- **启示**：
  - **registry 状态查询优先直连 API，不绕 npm CLI**：fetch 直连 registry.npmjs.org 无 CLI 启动开销、超时可控（AbortSignal）、无跨平台 shell 差异——发布/版本判定的标准实现。
  - **超时类缺陷要用"恰好在超时点失败"的模式识别**：10s 超时、每次都 10.0-10.2s 失败 = 稳定超时而非网络抖动；再对比同进程内其他网络操作耗时，即可定位"CLI 开销"还是"网络慢"。
  - **保守方向语义要保留**：查询失败返回 null（调用方跳过）比误判安全——漏发可重试，误发不可逆；重试逻辑只覆盖网络瞬态，不覆盖确定状态（404）。


## 二十九、e2e 测试基建：Playwright 落地模式与幂等设计（2026-08-10）
> 平台阶段启用 e2e（参考 momei 项目模式），22 用例覆盖全部页面关键功能点。

- **案例**：platform e2e 基建（playwright.config.ts + global-setup + helpers + 22 用例 + CI e2e job，提交 432c59a1）。过程中两次"二次运行必挂"暴露两个不同根因，均为单次运行无法发现的隐性缺陷。
- **启示**：
  - **e2e 用例必须幂等**：同一 SQLite 库二次运行，固定仓库名（如 e2e-owner/e2e-repo）必撞唯一索引；用例用 `Date.now()` 时间戳唯一名，global-setup 注册容忍已存在（200/201/422 均视为成功），"修改显示名"重复填写同值仍成功。
  - **e2e 服务端用构建产物**：`.output/server/index.mjs`（对齐生产形态），独立端口 + 独立库 + 独立 AUTH_SECRET；生产构建 synchronize 默认关闭，e2e 库必须 `DATABASE_SYNCHRONIZE=true` 显式开启。
  - **storageState 复用会话**：global-setup 注册首用户 admin（首个注册自动 admin）并保存认证状态，管理页用例 `test.use({ storageState })` 复用；viewer 权限用例在测试内注册登录。
  - **CI 单 worker 串行**：共享 SQLite 库下并行写会互相干扰；CI `workers: 1` + retry 2 + blob 报告；本地可并行。
  - **vitest 与 playwright 目录隔离**：e2e 文件命名 `*.e2e.test.ts` 会被 vitest 默认扫描（Playwright Test did not expect...），vitest.config `exclude: ['**/tests/e2e/**']` 必须显式排除。
  - **e2e 驱动发现生产缺陷**：二次运行暴露 TypeORM 复合索引 bug（§三十），说明 e2e"重复运行"本身是回归验证手段。


## 三十、TypeORM 1.x 列级复合索引 bug + better-auth 限流/生产细节（2026-08-10）
- **案例**：e2e 二次运行"添加仓库"用例 500（UNIQUE constraint failed: dependfix_repository.platform）——实体声明 `@Index(['owner','name','platform'], { unique: true })` 在列级，实测 SQLite DDL 生成 `UNIQUE ("platform")`（仅末列！），第二个仓库（platform='github'）插入必 500；单仓库场景永不暴露。修复：复合索引移到类级 `@Entity` 上 + organization.test.ts 回归用例（3 仓库共存 + 同 owner/name 冲突），DDL 实证 `UNIQUE ("owner","name","platform")`。
- **启示**：
  - **TypeORM 1.x 列级复合 `@Index([...])` 会错误生成单列索引**（只取末列），复合唯一索引必须声明在类级；同批检查其他实体（scan-run/scan-result/user/credential 均为单列 @Index，无此问题）。
  - **better-auth 1.6.26 内置限流特殊规则优先于 customRules**：sign-in/sign-up 默认 10s/3 次，`/sign-in/*` customRules 不生效；无代理 IP 头时回退共享桶（并行测试必 429）。豁免：`advanced.ipAddress.disableIpTracking: true` 完全跳过限流（e2e 用 E2E_TEST=true 条件注入）。
  - **better-auth 生产模式细节**：Set-Cookie 带 `__Secure-` 前缀（Secure cookie）；无 Origin 头的 Node fetch 请求被拒（MISSING_OR_NULL_ORIGIN）——手动 API 复现需带 origin 头 + 完整 cookie 名。
  - **手动复现纪律**：复现 500 前先清理测试库残留（同库重复创建必 500 干扰归因），server 日志（stderr）是定位第一手证据。


## 三十一、BullMQ 任务队列集成三坑 + 进程内集成测试方法论（2026-08-10）
> T702 任务队列（BullMQ 6 + ioredis 6 + Redis 7.4.1）真实环境验收暴露的三连坑，以及"后台服务冒烟不可靠 → 进程内集成测试"的方案演进。

- **案例**：T702 扫描队列 async 闭环验收。三轮冒烟均表现为"扫描 completed（同步路径）"或挂起，排查链：
  1. **queue/worker 共享 Redis 连接** → worker BLPOP 阻塞 queue 命令，POST /scan 挂起 120s+。修复：BullMQ 要求 Queue 与 Worker 独立连接（官方硬性要求）。
  2. **仅 ping 探测通过但 Redis 3.0 版本过低**（< BullMQ 6 要求 5.0）→ queue.add 挂起不报错。修复：probeRedis 加 `INFO server` 版本解析，< 5.0 判不可用降级 sync（渐进式降级语义）。
  3. **jobId 含冒号**：`scan:{repoId}` 被 BullMQ 6 拒绝（`Custom Id cannot contain :`，冒号是 Redis key 分隔符）→ add 抛错 → failover 自动降级同步 → **表面 completed 掩盖真实错误**。修复：`scan-` 前缀。此坑被 failover 掩盖，最终靠服务日志 `[scan] 入队失败，降级同步执行：Custom Id cannot contain :` 定位。
- **启示**：
  - **BullMQ 6 集成三铁律**：① 自定义 jobId 禁止冒号（Redis key 分隔符）；② Queue/Worker 必须独立 Redis 连接（BLPOP 阻塞）；③ Redis 版本门槛（>= 5.0）必须探测校验（仅 ping 不够——旧版本 add 挂起不报错）。同类依赖的版本门槛先查依赖源码/文档的 minimumVersion 实锤（BullMQ 6.0.9 `minimumVersion = '5.0.0'`）。
  - **failover 会掩盖真实错误**：自动降级（可用性优先）路径必须打 warn 日志且**冒烟验证必须能取到服务日志**——决定性证据来自日志而非猜测/试错循环。
  - **后台常驻服务冒烟在 Windows shell 工具环境不可靠**：`Start-Process` / `cmd start /b` 起的 node 进程脱离会话运行，占用 `.output` 文件锁（后续 build EPERM）、端口、句柄；且反复"起服务→请求→停服务"循环进展慢、易误判。**改用进程内集成测试**（见下）。
  - **进程内集成测试模式（真实基础设施验证首选）**：vitest 直接驱动基础设施（真实 Redis）——`describe.skipIf(!env)` 门控（CI 无 Redis 自动 skip，本地设 env 启用）、随机 id 幂等（`integration-${Date.now()}`，避免残留冲突）、进程内 worker 消费断言（scan-worker 支持 processor 注入，测试传 mock）、连接显式关闭。跑完即退出，无进程管理负担，可重复、可进 CI。**验证顺序修正**：优先进程内集成测试（确定性），后台服务冒烟仅作最后 HTTP 层补验。
  - **pnpm 11 allowBuilds 审批**：新增依赖带构建脚本（msgpackr-extract）时，pnpm-workspace.yaml `allowBuilds` 未审批 → `pnpm install` 报 ERR_PNPM_IGNORED_BUILDS（且 verifyDepsBeforeRun 自动 install 失败会阻断后续命令）——占位值（`set this to true or false`）必须显式赋值。
  - **ESLint 9 flat config 不读 .gitignore**：Playwright 生成物（playwright-report/ / test-results/ / blob-report/）被全量 lint 报海量错误（生成 JS 被当源码）——必须显式 ignores。e2e 运行后立即检查 lint 回归。
  - **Nuxt runtimeConfig 运行时覆盖只认 NUXT_ 前缀**（再印证 §三十 better-auth 案例）：构建期烘焙默认值，启动时无前缀 env（REDIS_URL 等）不生效——部署/验证环境一律 NUXT_ 前缀。


## 三十三、markdown 裸 HTML 标签破坏 VitePress 构建：lint 绿 ≠ docs build 绿（2026-08-10）
> 本条目与 §二十二 / §二十八 的第三次实证：**"检查全绿"只对"已跑过的检查"成立，未覆盖的环节（docs build）照样挂。**

- **案例**：两个 CI run 同时失败——Test workflow（run 31387884319）lint/lint:md/check:links/typecheck/test 全绿，挂最后的 `pnpm run build`（`pnpm -r build` 含 docs 包）；Pages Deploy workflow（run 31387884214）挂 `docs:build`。同一错误：`guide/release.md (368:55): Element is missing end tag.`。根因：`docs/guide/release.md` 263 行"已知限制与排查"表格中 `<path>` 是**裸 HTML 标签**（缺反引号），markdown-it 按 raw HTML 输出（SVG 元素非自闭合），Vue 编译器解析模板时因缺 `</path>` 报错；转换后 HTML 行号 368 > 源文件 268 行——**报错行号是转换产物行号，不能按源文件行号找**。引入 commit：765af514（发布指南重构）。
- **根因**：markdown 表格单元格内的 `<tag>` 若不用反引号包裹，会被 markdown-it 当作 raw HTML 原样透传，VitePress 的 vue 模板编译把任何非自闭合标签视为需要闭合 → 构建即失败。lint-md（`lint:md`）与 check-links 均**不检查 HTML 标签配对**，本地 `docs:build` 未纳入日常检查，问题被 CI 最后一步拦截前无人察觉。
- **修复**：`<path>` 加反引号转义（与同表 262 行 `<pkg>@<version>` 惯例一致）；本地验证（`pnpm --filter dependfix-docs build` 通过 + markdown-it 渲染断言 `&lt;path&gt;` 且 `html.includes('<path>')` = false）后提交（28ba588b + f724a800）。**配套防复发**：test.yml 将 docs 构建从末尾 `pnpm -r build` 中拆出并**前置**到 `check:links` 之后（`pnpm --filter dependfix-docs build`），末尾 build 排除 docs 包（`pnpm -r --filter=!dependfix-docs build`）避免重复构建。
- **启示**：
  - **表格/正文中的 `<占位符>` 必须反引号包裹**：markdown 中反引号内内容才会被转义为 `&lt;...&gt;`；裸 `<tag>` 会被当 raw HTML 透传进 Vue 模板。代码块（fenced code block）内不受影响（审计核实 133-137 行 `<core-anchor>` 等在 ```bash 块内安全），但若未来移出代码块（如改表格）必须补反引号。
  - **CI 全绿 ≠ 交付就绪**：检查矩阵之外仍有真实失败面（docs build 与 Pages 部署）。docs 变更的本地验证必须包含 `docs:build`，不能只跑 `lint:md` + `check:links`；CI 侧把高频失败面前置（docs build 提前），让失败在 1 分钟内暴露而不是等 test/typecheck 跑完。
  - **裸标签排查方法**：`rg '<[a-z][a-z0-9-]*>' | rg -v '`'` 扫描正文/表格裸标签 + 用 vitepress `createMarkdownRenderer` 渲染断言转义结果，是 docs 变更的可复用验证手段。


## 三十四、NUXT_ 前缀 env 的 destr 布尔陷阱 + 轮询聚合写回必须保护既有终态（2026-08-11）
> 批量扫描 e2e 闭环暴露的两个生产级坑，均被"真实执行"而非单测拦截。与 §三十一（NUXT_ 前缀）互为补充：前缀解决了"读不读得到"，本条解决"读到的值形态"。

- **案例一（destr 布尔陷阱）**：playwright webServer 已设 `NUXT_QUEUE_ENABLED=false`，runtimeConfig 也读到 false（服务日志 `queueEnabled=false`），但队列模式仍走 auto → 本地 Redis 可达 → async 入队无 worker 消费 → ScanRun 永远 pending → 批次永久 running。根因：**Nuxt 的 getEnv 用 destr 解析 env 值**（`NUXT_QUEUE_ENABLED=false` → 布尔 `false` 而非字符串 `'false'`），`parseQueueEnabled` 只认字符串三值（`'true'/'false'/'auto'`），布尔 `false` 掉进默认分支返回 `'auto'`——**运行时覆盖"看似生效实则失效"**。修复：解析函数签名改 `string | boolean | undefined`，布尔 `true/false` 显式映射；补布尔形态单测。排查路径：服务日志同时打印 `config.queueEnabled` 与 `process.env.NUXT_QUEUE_ENABLED` 对照（机制层"已生效" vs 解析层"形态不匹配"立刻现形）。
- **案例二（聚合写回覆盖既有终态）**：`executeBatchRun` async 模式全部入队失败时显式落库 `status='failed'`（无下属 run，聚合无法推导），但详情 API 的轮询聚合写回条件只看 `aggregation.status !== stored.status`——聚合只产出 `completed/running`，首次轮询即把 failed 覆盖成 completed（失败批次被展示为成功）。修复：写回决策抽纯函数 `shouldWriteBackStatus(stored, aggregation)`——**仅 running 态允许 status 流转，executor 显式落库的终态（failed）受保护**；对外 status 取"受保护后的有效值"。配套单测覆盖 running 流转 / failed 保护 / completed 幂等三态。
- **启示**：
  - **runtimeConfig 运行时覆盖值形态不可假设**：NUXT_ 前缀 env 经 destr 解析——`true/false` 变布尔、`123` 变 number、JSON 变对象。消费方（parse/校验）必须声明联合类型并逐形态处理，且**布尔形态必须有单测**（字符串测试全绿 ≠ 运行时形态正确）。
  - **轮询/后台收敛逻辑写回状态时必须尊重显式终态**：凡"推导值"（聚合、心跳、探活）写回"权威值"（executor/worker 显式落库），必须定义写回判定函数（何时允许覆盖），否则推导模型覆盖不了的状态（failed 兜底、人工置终态）会被推导值"修复"成错误终态。判定函数进领域模块 + 单测，比散落在 API 层更易审计。
  - **e2e"真实执行"是运行时形态类 bug 的最后防线**：单测 mock 的是字符串形态（构建期烘焙），运行时 destr 转换只在实际 server 进程 + 真实 env 注入下出现——e2e 必须跑真实 env 注入（NUXT_ 前缀）而不是只靠构建烘焙默认值。


## 三十五、新增 workspace 运行时依赖包必须同步所有构建链入口（2026-08-11）
> 教训形态：**"漏同步"**——新增包 + 既有入口清单未更新，CI/生产首跑才暴露。与 §二十六（依赖版本更新触发端到端验证）同族。

- **案例**：Security Auto Fix workflow（`uses: ./` 复合 action）首跑失败——`ERR_MODULE_NOT_FOUND: Cannot find module '@dependfix/engine/dist/index.mjs' imported from packages/cli/dist/runner.mjs`。根因：cli 运行时依赖 `@dependfix/engine`（tsdown external 不打包，产物 import dist），但 action.yml 构建命令只选 `--filter dependfix --filter @dependfix/core`——engine 包在后续任务中加入后，action 构建链未同步（test.yml 的显式 `core && engine && cli` 链和 apps/platform/Dockerfile 均已含 engine，action.yml 是唯一漏网入口）。tsdown 构建本身成功（external 不校验），失败发生在**构建后立即执行的 smoke check**（`node dist/bin.mjs --help`）——bin 加载即解析 engine dist。
- **修复**：构建命令补齐 `--filter @dependfix/engine`；本地模拟 CI 干净环境（删 engine dist）复跑修复后命令 → Scope 3 of 8、三包构建成功、smoke check 通过。
- **启示**：
  - **新增 workspace 运行时依赖（被 import 的包）后，必须全局搜索并同步所有"显式构建链"入口**：`rg -n "filter.*build|--filter" .github action.yml Dockerfile* package.json`——pnpm install 会按拓扑链接，但 `pnpm --filter X build` 不会自动带依赖构建（test.yml 注释已明示这一点，action.yml 是同类清单里的漏网者）。
  - **tsdown external 依赖的构建缺口要到"运行期加载"才暴露**：lint/typecheck/build 全绿不代表可运行——复合 action 的 smoke check（构建后立即执行 bin --help）是拦截此类问题的关键关卡，应保留。
  - **"新增包"的提交必须连带检查清单**：CI 构建链（test.yml）、部署构建链（Dockerfile）、action 构建链（action.yml）、release 构建链——四者各自维护 filter 清单时容易不同步；至少让新增运行时依赖包出现时逐个核对。

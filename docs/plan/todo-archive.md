# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。
- 早期阶段分片：
  - [M0 / M1](archive/todo-archive-phases-m0-m1.md)（2026-08-07 迁出）
  - [M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5](archive/todo-archive-phases-m2-m55.md)（2026-08-14 迁出，T906）
  - [M6 / M7.1 / M7.2 / T711](archive/todo-archive-phases-m6-m7-t711.md)（2026-08-20 neat-freak 归档批次迁出）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块（当前保留 **M8 / M9 / 2026-08-19 平台可用性 PR1-PR3 / 2026-08-19 batch-runs 增强 C54+C55 / 2026-08-20 平台 UI 增强 C59-C61** 共 5 个批次，符合"主窗口保留 3-5 个阶段"策略）。
- 当 `todo-archive.md` 超过 500 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-20）。

---


## M8: 安全加固与容器执行完备（已归档）

> 归档日期: 2026-08-14
> 归档方式: 从 [todo.md §M8](todo.md) 整体迁出（2026-08-19 启动 M10 时随主文档收口一并迁移至本归档主窗口）
> 阶段摘要: 参见 [roadmap.md §M8](roadmap.md)
> 设计文档: [sandbox-security-governance.md](../design/governance/sandbox-security-governance.md)（§5 治理决议 + §7 验收）

**阶段成果**: 兑现 [sandbox-security-governance.md §5 治理决议](../design/governance/sandbox-security-governance.md) G2-G7 + C45 实证发现——容器内 git/pnpm 工具链补齐（C45，P0）、验证命令单命令超时（C41）、凭据权限面启动检查（C42/C39）、供应链信号披露（C43）、执行期外联审计（C40）、规范挂接 review 检查点（C44）；同时封堵 dependfix 成为恶意依赖扩散工具的残余路径（C39 本地模式防线）。**20 个提交本地待推送**（M8 推送时与 M9 批量合并处理）。

### 规划决策（2026-08-14）

- **D1 优先级与执行顺序（Q1=安全优先）**：沙箱安全治理 §5 G2-G7 兑现与 M8 任务双线推进——容器工具链（C45）P0 锁定 → 验证超时（C41）→ 凭据防线（C39+C42 合并 P0）→ 供应链信号（C43）→ 外联审计（C40）→ 规范挂接（C44）
- **D2 entrypoint 降权 vs USER 指令（Q2=entrypoint 方案）**：C38 评估时选择 entrypoint 降权方案（dependfix 用户 + chown 数据卷 + su-exec）而非 Dockerfile USER 指令——兼容既有 root 所有权卷升级，su-exec 0755 非 setuid 无提权漏洞，避免 setuid 风险面
- **D3 现行 USER 降权是否破坏凭据最小化收敛（Q3=否）**：USER 降权后恶意脚本读 `/proc` 其他进程 env 受限（仅本用户进程），凭据最小化（解密仅执行时内存 + 不进进程环境）保持有效
- **D4 外联审计 vs 出站白名单（Q4=先后）**：M8 已落审计（T805），M10 C26 落白名单（出站 deny-by-default）——见 [backlog C40 / C26](backlog.md) 双轨迹
- **D5 规范挂接粒度（Q5=逐项核验）**：T806 在 `code-quality-checklist` §5.3 必须级条款逐条核验动作（规范单点声明原则 [documentation.md §4](../standards/documentation.md)：不抄条款全文）而非做模糊合规检查

### T801 容器工具链补齐 ✅（C45，P0）

- **交付物**: runtime 阶段镜像装 git + pnpm + workspace node_modules 打包
- **实现内容**: runtime 阶段 `apk add git`（实证 2.54.0，随 alpine 滚动 index 与 unzip/su-exec 同惯例，可复现性以基础镜像 digest 为基线）；pnpm 11.18.0 从构建链镜像（docker-minifier）零网络拷贝（与构建链版本一致，packageManager 11.17.0 差异由 toolchain 验证链处理）；**补齐 workspace node_modules 打包**（cli/engine/core 依赖链此前从未进镜像，`ERR_MODULE_NOT_FOUND`——C45 深化的第二缺口）；实证暴露并修复 pnpm-audit legacy range 前缀假跳过 bug（`>=0.2.4` 解析退化 `[0,0,0]`，minimist 0.0.8 被误判已达标，engine 层通用修复 + 4 测试）
- **验收**: 容器内全链路：report-only（1 alert）→ fix（0.0.8→0.2.4，组验证通过）→ fix --commit（无身份仓库 ensureGitConfig 自动配置）→ 报告产物
- **Review Gate**: 4 新增测试（range 解析 + abbr 包语义）+ 实证修复双路径

### T802 验证命令单命令超时 ✅（C41，P1）

- **交付物**: `verification-runner.execCommand` 单命令超时机制（默认 10 分钟可配）
- **实现内容**: `execCommand` 单命令超时（默认 10 分钟可配 `commandTimeoutMs`），超时中止并终止进程树（POSIX detached 进程组 / Windows taskkill /T /F，防孙进程残留）；超时归类 `timed out after Xms` 进 failure 与报告 error，报告无挂死
- **验收**: 4 新增测试 + taskkill 真实进程树终止实证
- **Review Gate**: deep 审计 Pass（防护孙进程路径覆盖）

### T803 凭据权限面启动检查 + 本地模式防线 ✅（C42+C39，P0 合并）

- **交付物**: `token-scope.ts` 启动自检 + `DependfixApp.executionEnvironment` 区分 + 本地执行风险警告
- **实现内容**:
  - 启动 `GET /user` 探测权限面（classic repo scope 超权限警告 / Code Scanning 缺 security-events 提示，失败静默）
  - fix/fix-and-pr 本地执行风险警告（`DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制，ContainerExecutor 容器环境不误报——`executionEnvironment: 'container'` 字段）
  - analyzeTokenScope 7 测试 + 网络层 4 测试
  - quick-start / 治理文档 / backlog 同步
- **验收**: 实测 `[local-exec]` warn 输出 / `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制生效 / classic repo scope 超权限警告 / fine-grained security-events 校验
- **Review Gate**: 2 轮独立审计 Pass

### T804 供应链信号披露 ✅（C43，P2）

- **交付物**: supply-chain 模块 + 报告/PR 警示区
- **实现内容**: supply-chain 模块解析 `pnpm-workspace.yaml` `allowBuilds`/`onlyBuiltDependencies`（行级解析无 yaml 依赖）+ 读 node_modules/.pnpm 实际包 lifecycle 脚本（peer 后缀 store 前缀匹配兜底）；run() 报告与 fix-and-pr PR body 双路径接入；报告新增 ⚠️ Supply Chain Warnings 节 + PR body 警示区（含包名/脚本类型）
- **验收**: 17 单测 + 2 集成测试（PR body 含/不含警示区）+ 真实仓库实证（esbuild→postinstall / better-sqlite3→install / 未批准不披露）
- **Review Gate**: APPROVE

### T805 执行期外联审计日志 ✅（C40，P1）

- **交付物**: `verification-runner` 网络外联审计代理（默认开启，可 `networkAuditDisabled` 关闭）
- **实现内容**: ① 本地审计代理（CONNECT 隧道 + 明文 HTTP 转发，10s 超时防挂死）注入 HTTP(S)_PROXY/ALL_PROXY 捕获尊重代理工具外联（curl/wget/npm/git），环境已有代理时不覆盖；② 命令输出 URL 提取（去重限 100/命令）确定性捕获 pnpm/npm registry 外联（实证 pnpm 11 undici 直连不走代理 env，输出含完整 tarball URL）；③ 执行日志输出（总数 info/明细 debug，仅方法+目标无请求体）
- **验收**: 实证 curl CONNECT `registry.npmjs.org:443` 捕获 + echo URL 提取双路径真实生效；13 新测试
- **覆盖边界**: undici 直连/原始 socket 不在列（连接级全量捕获留 [M10 C26 网络白名单](todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)）

### T806 安全规范挂接 review 检查点 ✅（C44，P1）

- **交付物**: `code-quality-checklist.md` §5.3 必须级条款核验动作
- **实现内容**: §5.3 十三条必须级条款逐项核验动作（非 root 执行 / 工作目录隔离 / 超时兜底 / pnpm 默认脚本防护 / 凭据最小化 / 权限面收敛 / 升级前研判 / 供应链信号披露 / 结果白名单回传 / 资源与网络 / 新执行后端威胁建模评审）+ 一行链接引用（规范单点声明原则 [documentation.md §4](../standards/documentation.md)：不抄条款全文）；Code Auditor 必查项同步薄引用；C34 存量全量盘点仍为待评估，独立排期
- **验收**: single-source-of-truth 双向校验通过（check-links 95 个 md 文件，`code-quality-checklist.md` 路径见 [code-reviewer skill SKILL.md](../../.github/skills/code-reviewer/SKILL.md) + Code Auditor 必查项同步）
- **Review Gate**: APPROVE

### M8 完成判定（全部通过）

- [x] T801-T806 全部交付，每项独立 Review Gate Pass + 分批提交（20 个提交本地待推送）
- [x] `pnpm lint` / `typecheck` / 定向测试通过（Dockerfile 类改动附容器实证）
- [x] G2-G7 + C45 全部修复并通过 [sandbox-security-governance.md §7 验收](../design/governance/sandbox-security-governance.md#7-验收与持续治理)
- [x] C44 闭环：规范 §5.3 必须级条款挂接 code-reviewer 检查点（[code-quality-checklist.md](../../.github/skills/code-reviewer/references/code-quality-checklist.md) + Code Auditor 必查项）

### 经验沉淀（M8 阶段）

- **单任务多 commit（20 个）**：T801-T806 各自独立 Review Gate 提交分批，避免单次大 diff 成本失控（沿用 M6 T601 教训，[experience-archive.md §二十四](../design/governance/experience-archive.md)）
- **实证驱动（C38 / C45）**：C45 容器工具链缺失由 C38 修复本地构建实证发现——离线本地 docker run 实证比 CI 端到端快得多，本阶段 6 任务均含实证步骤

### 已知边界 / 移交下一阶段 backlog

- **C26 独立沙箱容器**：随 T702 BullMQ 并发落地威胁加重，已激活为 [todo.md §M10](todo.md#m10-独立沙箱容器-c26-实施规划2026-08-19-启动)（2026-08-19 启动 P1）
- **C30 Publish Docker 双平台 CI 链路**：⏸️ 2026-08-18 用户决策暂缓（run 31862632207 23m 2s 成功完成证明当前 docker.yml 稳定工作，恢复条件详见 [backlog C30](backlog.md)）
- **C28 security.md §凭据加密存储 章节**：T602 已交付实现，文档待补；触发条件 T912-3 安全与文档进行中联动
- **C29 平台 UI 暗色模式**：暂缓（2026-08-10 用户指示），需 UI Validator 视觉验证

---

## M9: i18n 基建同步（已归档）

> 归档日期: 2026-08-18（代码与脚本工作 2026-08-15 完成，文档侧 M9 归档块与 todo.md M9 区块移除直至 2026-08-18 才补齐——视为 M9 收口闭环）
> 阶段摘要: 参见 [roadmap.md §M9](roadmap.md)
> 设计文档: [standards/i18n.md](../standards/i18n.md)（Review Gate Pass）

**阶段成果**: 从 momei 同步 i18n 治理体系基建——i18n 规范（语言分级 / freshness 分层 / 回退链 / 术语约束 / blocker 矩阵）+ 4 个审计脚本（`audit-locale-keys` 缺词 parity / `audit-duplicate-messages` 重复文案 / `dynamic-key-allowlist` 动态 key 白名单 / `check-i18n-duplicates` docs 防回流）+ 4 套 vitest 测试 75 例 + `@intlify/eslint-plugin-vue-i18n` 独立 lint + 5 个 npm script（3 个 `i18n:audit:*` 维度审计 + `docs:check:i18n` + `lint:i18n`）+ CI 接入（`lint:i18n` / `i18n:audit:missing` / `docs:check:i18n` 三步入 test.yml）。5 个原子 commit 覆盖 6 任务（T906 元任务融入相邻原子提交），合计 2556 行 inserts / 2539 行净增。Translation 内容（README / docs / platform 多语言）按本期决策留待后续阶段排期。

### 规划决策（2026-08-15 用户确认）

- **D1 范围（Q1=A）**：只同步基建，脚本**适当优化不全量同步**（核心 3 项：缺失 key / 动态 key / 重复文案；momei 其他脚本暂缓）
- **D2 docs 翻译结构（Q2=A）**：沿用 `docs/i18n/<locale>/` 镜像结构（README/docs 各 locale 一一对应）
- **D3 locale 模块化（Q3=B）**：locale 文件**模块化拆分延后**——脚本已兼容单文件（现状）与模块化（未来）双目录形态，未来切换无需重写
- **D4 vue-i18n lint（Q4=A）**：引入 `@intlify/eslint-plugin-vue-i18n` 但作为**独立命令**（`lint:i18n`）而非合并入常规 lint（插件执行慢，按需跑）；CI 必跑 + 升级 error 级别

> **注**：D1-D4 决策追溯自原 todo.md M9 区块"决策（2026-08-15 用户确认）：①②③④"四项结论。Q 编号（Q1=A / Q2=A / Q3=B / Q4=A）为执行侧补充的"提问-回答"映射，非 todo.md 原文档——便于需求澄清追溯，与其他阶段（M5/M6/M7）的 Q 编号口径一致。

### T901 i18n 规范同步 ✅

- **交付物**: `docs/standards/i18n.md`（191 行）+ `docs/standards/index.md` 登记
- **实现内容**: 适配自 momei `translation-governance.md`——语言发布分级（`draft` / `ui-ready` / `seo-ready`）+ docs freshness 分层（`must-sync` 30 天 / `summary-sync` 45 天 / `source-only` 不做 SLA）+ 回退链 + 术语约束 + blocker 矩阵；增补 dependfix locale 路径（`apps/platform/i18n/locales/<locale>.json` / `docs/i18n/<locale>/`）与 README 命名约定（`README.md` 中文原版 + `README.<locale>.md` 翻译版）
- **验收**: standards 单点声明 + check-links 通过
- **提交**: 49438f5 docs: 新增 i18n 规范并登记脚本命令
- **Review Gate**: APPROVE

### T902 脚本同步（momei 审计脚本迁移 + dependfix 适配） ✅

- **交付物**: 4 个 audit 脚本 + 1 个共享 CLI helper
  - `scripts/shared/cli.mjs`（107 行）—— 共享 CLI 参数解析（`--locale-root` / `--scan-root` / 输出格式）
  - `scripts/i18n/audit-locale-keys.mjs`（533 行）—— 缺词 parity（missing 阻塞级）/ unused（warning 级）双维度审计
  - `scripts/i18n/audit-duplicate-messages.mjs`（510 行）—— 跨语言重复文案候选审计（text / markdown / json 输出）
  - `scripts/i18n/dynamic-key-allowlist.mjs`（21 行）—— 动态 key 白名单（供审计与 eslint 复用）
  - `scripts/docs/check-i18n-duplicates.mjs`（121 行）—— docs 翻译防回流检查（posix 路径跨平台修复）
- **实现内容**: 路径参数化（`--locale-root` / `--scan-root`），兼容单文件（现状：`apps/platform/i18n/locales/zh-CN.json` 单文件）与模块化（未来：`apps/platform/i18n/locales/zh-CN/*.json` 目录）双目录形态
- **验收**: 全量审计结果——missing parity 0（zh-CN / en-US 两 locale key 一致）/ unused 54 候选（warning）/ duplicates 53 组候选 / docs 检查通过
- **提交**: a4d1668 feat(scripts): 同步 momei i18n 审计脚本并适配 dependfix 结构
- **Review Gate**: APPROVE

### T903 脚本测试（75 例覆盖双形态与边界） ✅

- **交付物**: 4 套 vitest 单测（覆盖双形态 + 格式化 + runAudit 集成）
  - `scripts/shared/cli.test.mjs`（142 行）
  - `scripts/i18n/audit-locale-keys.test.mjs`（280 行）
  - `scripts/i18n/audit-duplicate-messages.test.mjs`（291 行）
  - `scripts/docs/check-i18n-duplicates.test.mjs`（99 行）
- **实现内容**: 临时目录 fixture + 双目录形态（单文件 / 模块化）参数化 + 边界用例（空 locale / 多余 key / 重复文案阈值）
- **验收**: 75 测试全绿；包级定向测试修复（077823c fix(test): vitest setupFiles 改用绝对路径——`pnpm --filter <pkg> test` 在包目录运行 vitest，root=cwd=包目录，相对路径 setupFiles 解析失败导致全部测试初始化失败；改为 `resolve(import.meta.dirname, ...)` 与 alias 路径风格一致，与运行时 cwd 解耦；engine 830 / mcp 40 定向测试通过，根目录全量 1564 无回归）
- **提交**: a4d1668（含测试）+ 077823c（包级测试基建）
- **Review Gate**: APPROVE

### T904 npm scripts + eslint 接入 ✅

- **交付物**: 根 `package.json` 5 个新 script + `eslint.config.js` ESLINT_I18N 开关块
- **实现内容**:
  - `lint:i18n`：独立命令（执行慢不并入常规 lint），CI 跑 + 升级 error 级别
  - `i18n:audit:missing`：缺词 parity（CI blocker）
  - `i18n:audit:unused`：多余 key（warning）
  - `i18n:audit:duplicates`：重复文案候选
  - `docs:check:i18n`：docs 翻译防回流
  - `eslint.config.js`：新增 `ESLINT_I18N` 开关块（仅 `apps/platform` 生效，`recommended` 规则提升 error；保留 `json/yaml` 专项 files 避免 vue parser 误伤 ts 文件）
  - `vitest.config.ts`：coverage `include` 扩展为 `scripts/**/*.mjs`
- **验收**: `lint:i18n` 零 error；常规 `pnpm lint` 不受影响（耗时不变）；依赖 `@intlify/eslint-plugin-vue-i18n` 装入
- **提交**: eae70cf feat(platform): 接入 @intlify/eslint-plugin-vue-i18n 独立 lint 与 npm scripts
- **Review Gate**: APPROVE

### T905 CI 接入（test.yml） ✅

- **交付物**: `.github/workflows/test.yml` 3 个新步骤
- **实现内容**:
  - `lint:i18n`：vue-i18n 专项 lint 阻塞级
  - `i18n:audit:missing`：缺词 parity 阻塞级（CI 红 → 必须修复 → 防止新增翻译未同步）
  - `docs:check:i18n`：docs 翻译防回流阻塞级
  - `i18n:audit:unused` 与 `i18n:audit:duplicates` 不入 CI（warning 级，本地使用）
- **验收**: test.yml YAML 语法 + GitHub Actions 解析通过；本地模拟 CI 三步全绿
- **提交**: a61becc ci: 接入 i18n 校验步骤并排期 M9 基建任务
- **Review Gate**: APPROVE

### T906 文档收口（scripts/README + todo/roadmap） ✅

- **交付物**: `scripts/README.md` i18n 审计命令速查 + todo/roadmap M9 排期登记
- **实现内容**:
  - `scripts/README.md`：i18n 审计命令速查（命令名 + 参数 + 用途）
  - `docs/plan/todo.md`：新增 M9 区块（任务拆解表 + 完成定义 + 非目标）
  - `docs/plan/roadmap.md`：M9 阶段登记（表格 + 详细章节）
- **验收**: scripts/README 与 standards/i18n 交叉引用闭环；todo/roadmap 一致
- **提交**: 49438f5（scripts/README）+ a61becc（todo/roadmap 排期），T906 元任务融入相邻原子提交
- **Review Gate**: APPROVE

### M9 完成判定（全部通过）

- 全部 6 任务（T901-T906）交付，5 个原子 commit 覆盖 6 任务——T906 元任务融入相邻 commit（`scripts/README.md` 登记随 T901 commit `49438f5`；todo/roadmap 排期随 T905 commit `a61becc`），无独立 commit；每任务 Review Gate APPROVE
- 5 个原子 commit（按 T901→T906 任务顺序展示，与 git 时间顺序有差异：`077823c` 时间 02:51 在 M9 主体前 9 小时，是 M9 T903 包级测试基建前置，提交时跨 M8/M9 边界被 M9 复用）：
  - `49438f5` docs: 新增 i18n 规范并登记脚本命令（T901 + T906 部分）
  - `a4d1668` feat(scripts): 同步 momei i18n 审计脚本并适配 dependfix 结构（T902 + T903 测试）
  - `077823c` fix(test): vitest setupFiles 改用绝对路径修复包级定向测试（T903 包级测试基建前置）
  - `eae70cf` feat(platform): 接入 @intlify/eslint-plugin-vue-i18n 独立 lint 与 npm scripts（T904）
  - `a61becc` ci: 接入 i18n 校验步骤并排期 M9 基建任务（T905 + T906 部分）
- 总变更：规范 1 个 + 脚本 5 个（含测试）+ 配置 3 个（package.json / eslint.config.js / vitest.config.ts / test.yml）+ 文档 3 个（todo / roadmap / scripts/README）
- `pnpm lint` 零 error（常规 lint 与 lint:i18n 双向均零）
- `pnpm typecheck` 通过
- `pnpm test` 75 例脚本测试全绿 + 全量 1564 测试无回归
- `pnpm i18n:audit:missing` 零缺词；`pnpm docs:check:i18n` 零回流

### 遗留登记（归档时点）

- **后续阶段排期候选**（M9 非目标，移交下一阶段）：
  - `README.en-US.md` 翻译（按 i18n 规范 §2.1 `must-sync` tier，30 天 freshness）
  - `docs/i18n/en-US/` 镜像翻译（路线图摘要 / 开发指南 `summary-sync` 45 天；设计页 / 低频 Guide `source-only`）
  - `apps/platform` 多语言扩展（zh-TW / ko-KR / ja-JP 等第三方语言）
  - locale 模块化拆分（`split-locale-files` + `Locale Registry`）—— 脚本已兼容双形态，触发条件：单 locale 文件超阈值或命名空间冲突
- **C36 服务端 API 错误消息 i18n**（M7.2 T708 非目标，backlog 登记，2026-08-11）—— M9 基建补 docs 防回流与 lint 门禁，但服务端 55 处 `createError` / `statusMessage` 中文错误消息未纳入 i18n；候选方案：错误码化或服务端按 `Accept-Language` 返回本地化
- **C37 语言偏好多设备同步**（M7.2 T708 D3 决策，backlog 登记，2026-08-11）—— M9 基建补 lint 门禁，但用户登录态语言偏好持久化到服务端未实现（当前 Cookie 方案）；触发条件：多设备使用成为常态
- **C26 独立沙箱容器**（backlog 保留 M9 候选）—— 见 [backlog.md §沙箱与恶意依赖防护治理登记](backlog.md#沙箱与恶意依赖防护治理登记-2026-08-14-安全专项评估)，与 BullMQ worker 结合实现网络出站白名单 + 文件系统隔离

---

## 2026-08-19 平台可用性批次（PR1-PR3）

> **归档日期**: 2026-08-19~20
> **阶段摘要**: 用户实测反馈平台可用性问题（导入对话框默认全勾、批量导入无过滤、单仓库扫描无模式选择、扫描历史子路由不可达、Dialog 默认可拖拽等）一次性收口三个 PR；同时修复 unrouting 0.2.x 兼容 bug（应用层 Dialog 化）
> **状态**: ✅ 全部完成（PR1 / PR2 / PR3 + C51 子路由 Dialog 修复；5 commits 待推送）

**批次成果**: 批量导入对话框（C46 三维过滤 + C48 默认不勾选 + C49 分页缓存 + C50 默认关联凭据）+ 单仓库扫描模式（C52）+ Dialog 默认不可拖动（C47）+ 扫描历史 Dialog 化（C51 兼容修复）共 7 个 backlog 项批量收口。

### PR1: C47 + C48 原子修复 ✅

- **交付物**: `apps/platform/app/components/ImportReposDialog.vue` + 6 处 Dialog `draggable=false` + e2e `admin.e2e.test.ts`
- **实现内容**: 删除 `selectedRepos.value = importableRepos.value.filter((r) => !r.imported)` 自动赋值（C48 手滑风险消除）；6 处 PrimeVue Dialog 加 `:draggable="false"`（`ImportReposDialog.vue:111` / `repos.vue:467` 编辑 / `repos.vue:601` 批量扫描 / `schedules.vue:357` / `credentials.vue:224` / `runs.vue:177`）
- **关键 commit**: `cb788e7` fix(platform): 批量导入对话框默认不勾选仓库防手滑 + `9e26b56` chore(platform): 6 处 PrimeVue Dialog 默认不可拖动统一体验
- **完成定义**: C48 真实风险点消除（C48 默认不勾选，但保留"全选"按钮）；全站 6 处 Dialog 默认不可拖动（unrouting 子路由 bug 解除后 runs.vue 也能用上）
- **审计**: A 阶段 reviewer standard 第 1 轮 Reject → 第 2 轮 Pass；e2e `admin.e2e.test.ts` 验证默认未勾选

### PR2: C52 单仓库扫描模式补全 ✅

- **交付物**: `apps/platform/app/pages/repos.vue` 单仓库触发配置 Dialog + `triggerScan` 重构 + e2e `scan-config.e2e.test.ts`
- **实现内容**: 单仓库触发弹新增 mode（report-only/fix/fix-and-pr）+ severity（critical/high/medium/all）12 种组合选择；抽取 `batchModeOptions` / `batchSeverityOptions` 共享；后端 `scanRequestSchema` 已支持无需改动
- **关键 commit**: `1a663f3` feat(platform): 单仓库扫描支持 mode/severity 选择
- **完成定义**: 单仓库入口可触发 fix / fix-and-pr 模式（之前只可走批量扫描）；与批量扫描行为对齐
- **审计**: Reviewer standard 第 1 轮 Reject 4 处修复点 → 第 2 轮 Pass；e2e 验证 12 种组合至少 1 路径

### PR3: C46 + C49 + C50 批量导入能力补全 ✅

- **交付物**: `ImportReposDialog.vue` 三维过滤 + PrimeVue Paginator + 后端 `cachedFetch()` 工具 + `batch.post.ts` 默认凭据前置校验 + i18n zh-CN + en-US 各 +3 键 + 后端单测 + e2e
- **实现内容**: 三维过滤（fork `source` / visibility `all` / keyword 空）+ 后端 `octokit.paginate(per_page:100, maxPages:20)` + `lru-cache` TTL=5min max=64 并发去重 + 默认 pageSize=25 + 「默认关联凭据」下拉 + `defaultCredentialId` schema 字段 + 跨组织 403 / 不存在 400 / 透传 三路径校验
- **关键 commit**: `2a7f99f` feat(platform): 批量导入加过滤 / 分页缓存 / 默认凭据（14 文件 / +920 / -115 = +805 行净）
- **完成定义**: 100+ 仓库场景下不丢失候选；前端默认 pageSize=25 避免单页过载；5min 缓存降低 GitHub API 调用次数；批量导入后仓库默认带关联凭据；已勾选项在 filter / 分页 / pageSize 切换时保留（W10 教训）
- **审计**: Reviewer standard 第 1 轮 Reject 4 处修复点 → 第 2 轮 Pass；UI validator 视觉验证 Pass

### C51: 扫描历史子路由不可达（unrouting 0.2.x 兼容 bug + 应用层 Dialog 改造）✅

- **交付物**: `apps/platform/app/components/RepoHistoryDialog.vue` + `repos.vue` `pi-history` 改 `navigateTo('/repos?history={id}')` + e2e `history-dialog.e2e.test.ts`
- **实现内容**: `pages/repos/[id]/runs.vue` 子路由改用顶级路由 + query string 承载（绕开 unrouting 0.2.x 输出 `:id()` 触发 vue-router 4 / path-to-regexp 8.x lexer 兼容 bug）；super-search 调研确认上游短期不修，应用层 Dialog 化最稳
- **关键 commit**: `b067b3a` chore: gitignore .env 忽略 + `2102894` fix(platform): 扫描历史改用 Dialog+query 承载 + `0b9411b` docs(plan): C46-C53 登记
- **完成定义**: pi-history 按钮点击 → URL `/repos?history={id}` → 自动打开「扫描历史」Dialog；用户直接访问 deep-link 也可正确打开
- **审计**: review gate **Pass**（warning 级 UX 建议留待后续 C57 修复）

### 阶段治理记录

- **提交序列**: C51 修复 (`b067b3a` → `2102894` → `0b9411b`) → PR1 (`cb788e7` → `9e26b56`) → PR2 (`1a663f3`) → PR3 (`2a7f99f`) → docs 同步 (`0b8088f` → `9ae1767`)
- **累计 commits**: PR1+PR2+PR3 共 5 commits 待推送 + C51 相关 3 commits 待推送
- **审计覆盖**: 每个 PR reviewer standard 第 1 轮 + 第 2 轮 Pass；UI validator 视觉验证 Pass
- **历史教训**（已迁移至 docs/standards/，对应 8d02cce wisdom 蒸馏批次）:
  - W10 删除"自动逻辑"必须搜遍被动接收态路径 → [开发规范 §5.1.10](../standards/development.md)
  - W11 Nuxt SSR+CSR e2e `page.route` 拦截局限 → [测试规范 §6.1](../standards/testing.md)
  - W12 单文件跨 type 改动需提前规划 commit 拆分 → [Git 规范 §3.2](../standards/git.md)
  - W15 跨 Dialog 共享选项 i18n label key 同步共享 → [开发规范 §6](../standards/development.md)
  - W17 防御纵深对称性 — 同一资源多入口校验一致 → [安全规范 §3](../standards/security.md)

---

## 2026-08-19 batch-runs 增强（C54+C55）

> **归档日期**: 2026-08-19
> **阶段摘要**: 用户实测「batch-runs 页面刷新数据过于频繁,会导致表格屏闪」(C54) + 「批量运行对任务超时没有兜底,会出现一直执行中的情况」(C55) — 同页面两个不同维度问题
> **状态**: ✅ 全部完成（C54 60s 轮询 + 增量 reconcile + 三态分离；C55 stale-cleanup 自动化 + admin force-fail 应急逃生口）

**批次成果**: batch-runs 页面轮询节拍 2s → 60s 消除屏闪；孤儿运行兜底覆盖 30 分钟+ + admin 30 分钟内应急逃生口。

### C54: batch-runs 页面刷新策略 ✅

- **交付物**: `apps/platform/app/pages/batch-runs.vue` + `apps/platform/app/utils/reconcile-batch-runs.ts`(39 行) + 后端 `updatedAt` 字段 + `apps/platform/app/types/platform.ts` `BatchRunView` + 单测 7 case + e2e
- **实现内容**: `setInterval(2000)` → `BATCH_POLL_INTERVAL_MS = 60_000`（2026-08-19 用户决策，原建议 5s 仍嫌频繁）；后端 `toView` 加 `updatedAt` 字段（`BaseEntity.@UpdateDateColumn` 自动维护）；前端 `reconcileBatchRuns()` 按 id 增量合并（splice 反向删除 + splice(0,0,...) 批量插入 + updatedAt 变化行替换引用）；三态分离 `firstLoad`(UI 骨架) + `loading`(按钮反馈) + `inflight`(并发守卫) — RG-B1 修复首屏卡死致命 bug
- **关键 commit**: `3a2757b` feat(platform): batch-runs 刷新策略重构(60s 轮询 + 增量 reconcile + 三态分离 + 手动刷新 + 防抖) + `edb066c` docs(plan): batch-runs 刷新策略实施登记 + 同步 60s 决策
- **完成定义**: 60s 节拍无屏闪（DataTable 不再整表 reconcile）；手动刷新按钮立即 loading + 重置下次轮询计时 + 连续点击不并发；首屏不卡死（RG-B1 已修）；已勾选项 + 详情缓存 + 展开行引用稳定
- **审计**: A 阶段 code-reviewer standard 第 1 轮 Reject（RG-B1 + RG-B3 + W1/S2/S3/S4）→ 全部修复 → 第 2 轮 quick Pass；V 阶段 ui-validator 7 张截图 + OCR 验证 8 重点全过（含用户真实运行中场景 momei/cmyr-skills-agents/caomei-auth）
- **关联**: 与 PR1-PR3 同批但独立提交；M10 后续 cgroup v2 资源限制（T1003）可参考 30 分钟阈值经验

### C55: batch-runs 孤儿运行兜底 ✅

- **交付物**: `apps/platform/server/services/batch/stale-cleanup.ts` + `apps/platform/server/plugins/stale-cleanup.ts` + `apps/platform/server/api/batch-runs/[id]/force-fail.post.ts` + 前端"强制完成"按钮 + i18n 3 key × 2 语言 + 单测 12 case
- **实现内容**: A 自动化 `cleanupStaleRuns()` 扫 stale ScanRun + stale BatchRun（仅当下属有 stale run 才 failed 避免误杀慢批次）+ `orphan_run` 错误码 + nitro plugin 周期清理（30s 首跑 + 5min interval + env 覆盖 + nitro close hook 清 timer）+ B 手动 `POST /api/batch-runs/[id]/force-fail` admin 权限 + 幂等（已终态直接返回不重写 finishedAt）+ 仅改 running/pending 子 run + `force_failed` 错误码；前端按钮 in-flight 守卫 + confirm 弹窗
- **关键 commit**: `ce523d4` feat(platform): batch-runs 孤儿运行兜底(stale-cleanup 自动 + force-fail 手动) + `4c813f8` docs(plan): C55 登记 + 实施区块
- **完成定义**: 进程崩溃 / worker SIGKILL / Action runner 永久不回执等场景不再产生孤儿 running；stale-cleanup 30 分钟阈值（与 ContainerExecutor.timeoutMs 对齐）自动清理；admin force-fail 覆盖 30 分钟内卡死；已终态不重复处理；慢批次不被误杀
- **审计**: A 阶段 1 轮 audit-quick Pass（0 blocker + 3 warning 已修复）；V 阶段 OCR 确认按钮在 running 行旁渲染
- **历史教训**: D 阶段踩过 ScanRun.repository FK 约束 — 测试必须先建 Repository 实体；TypeORM `BatchRun.source` 是非空字段，`create({})` 空对象会 NOT NULL 失败

### 阶段治理记录

- **提交序列**: C54 (`3a2757b` → `edb066c`) → C55 (`ce523d4` → `4c813f8`) 共 4 commits 待推送
- **关联**: C54 + C55 同页面但解决不同问题（C54 轮询+防抖 / C55 孤儿兜底）；与 PR1-PR3 互不阻塞
- **历史教训**: C54 D 阶段踩过 unshift 反转顺序 bug 后切 splice(0,0,...)；RG-B1 `loading` 初值 true 误吞首屏请求是经典"UI 态与并发守卫复用 ref"反模式

---

## 2026-08-20 平台 UI 增强（C59 + C60 + C61）

> **归档日期**: 2026-08-20
> **阶段摘要**: 用户实测反馈暗色模式半亮半暗（C59）+ 表格缺排序（C60）+ 仪表板下方空（C61）三项 UX 问题一次性收口
> **状态**: ✅ 全部完成（C59 mixin 1 行修复 + 永久 e2e；C60 全 7 表 sortable + 业务语义；C61 仪表板 3 图表 + chart.js tree-shakable）

**批次成果**: 平台暗色模式全栈生效 + 7 个 DataTable sortable 三态 + 仪表板新增 severity 饼图/修复率环形/Top-10 包柱状图。

### C59: 暗色模式全局样式未生效 ✅

- **交付物**: `apps/platform/app/assets/styles/_mixins.scss:4-8` `@mixin dark-mode` 1 行修复（`:global(.dark) &` → `.dark &`）+ 永久回归测试 `apps/platform/tests/e2e/dark-mode.e2e.test.ts`
- **实现内容**: `main.scss` 是**全局 CSS**（`nuxt.config.ts:60` `css: ['primeicons/primeicons.css', '@/assets/styles/main.scss']`），无 scope；原 `_mixins.scss:4-8` `@mixin dark-mode { :global(.dark) & { @content; } }` 中 `:global()` 是 CSS Modules 语法（只在 `<style scoped>` 内有效），编译后 `:global(.dark)` 不是合法 CSS 选择器，浏览器静默忽略；改为 `.dark &` 后 4 处 `@include dark-mode`（main.scss body / header / auth + ImportReposDialog scoped）自动 work
- **关键 commit**: `9949504` fix(platform): 暗色模式 mixin 全局上下文失效（C59 修复） + `03ba3b2` docs(plan): C59 状态由待评估同步为已修复
- **完成定义**: 切到 dark mode 后 header / body / nav / auth / 全部自定义 SCSS 容器 跟随 `.dark` 切色；PrimeVue 组件（table/dialog/tag/select）与自定义 SCSS 视觉一致；切换动画 0.2s 流畅
- **审计**: V 阶段 ui-validator 验证「全暗」（原"半亮半暗"截图修复后变全暗）
- **关联**: 原 C29（T601 暗色模式 initial 实现，2026-08-10 用户反馈"依旧不可用"）兜底升档闭环

### C60: 平台表格排序 ✅

- **交付物**: `apps/platform/app/utils/sort-helpers.ts`(枚举常量表 + map helper) + 7 个 DataTable sortable 接入 + 单测 sort-helpers + e2e `apps/platform/tests/e2e/sortable.e2e.test.ts`
- **实现内容**: `sort-helpers.ts` 提供 `SEVERITY_RANK`(critical=5 > high=4 > medium=3 > low=2 > unknown=1) / `STATUS_RANK`(running=3 > completed=2 > failed=1) / `ROLE_RANK`(admin=3 > org_admin=2 > viewer=1) / `FIX_STATUS_RANK` / `RUN_STATUS_RANK` 常量 + `withSeverityRank<T>` / `withStatusRank<T>` / `withRoleRank<T>` map helper（派生字段下划线前缀 `_severityRank` / `_statusRank` / `_roleRank` 表示内部使用）+ `updateStatusRank` / `updateRoleRank` 同步 helper（运行时修改路径必须同步派生 rank — RG-B07 修复）；7 表 sortable（alerts/repos/batch-runs/schedules/credentials/users/repos/[id]/runs）+ `removableSort` 三态（asc/desc/none）+ 业务语义排序 + 零后端改动 + v1 不持久化
- **关键决策**: 2026-08-20 用户确认 1A 全覆盖 + 2B 客户端单列 + 3A 业务语义排序 + v1 不持久化 + v1 不实现多列
- **关键 commit**: `a1d5bd9` sort-helpers 工具 + `532ea78` 全平台 7 表 sortable 接入 + `6b994b5` runs.vue 列数对齐（audit warning 修复） + `5bba3f4` e2e sortable + admin 断言拆分 + `5fbad71` docs Pass 状态同步
- **完成定义**: 7 表 header 点击切换 asc → desc → none；枚举按业务语义（critical 必须排第一）；batch-runs 增量 reconcile 与排序并存（reconcile 不替换已排序数组引用 — C54 + C60 兼容）；repos 排序后 selectedRows 保留（W10 教训）；单测 32 case 全过；e2e sortable 全过
- **审计**: A 阶段 audit-standard 第 1 轮 Reject（9 blocker + 5 warning）→ 全部修复 → 第 2 轮 audit-quick **Pass**；V 阶段 ui-validator 768px 响应式 Conditional 已修复
- **历史教训**（已迁移至 [平台规范 §7.1](../standards/platform.md)，对应 8d02cce wisdom 蒸馏批次）:
  - C60-1 PrimeVue 4 sortable 用 `data-p-sortable-column` 属性（CSS class 已废弃）
  - C60-2 PrimeVue 4 `<Chart>` 内部用 `chart.js/auto` ~200KB 全量（vs 自实现 ChartCanvas 40 KB gzip）
  - C60-3 业务语义排序需 `default-sort-order="-1"`（PrimeVue 默认 asc 与业务顺序相反）
  - C60-4 运行时状态变更路径必须同步派生 rank（RG-B07）

### C61: 仪表板告警图表 ✅

- **交付物**: `apps/platform/app/components/ChartCanvas.vue`(tree-shakable Chart.js 包装) + `apps/platform/server/api/dashboard/stats.get.ts` 新增 `topPackages` 字段 + `apps/platform/app/pages/dashboard.vue` 3 图表卡片 + `apps/platform/package.json` `chart.js@^4.5.0` + i18n 9 键 × 2 语言 + 单测 4 case + e2e `apps/platform/tests/e2e/dashboard.e2e.test.ts`
- **实现内容**: severity 饼图（doughnut，5 段配色复用 `severityTagSeverity`）+ 修复率环形进度（doughnut，前端计算 fixedCount/alertsTotal）+ Top-10 包柱状图（bar，后端 `GROUP BY packageName LIMIT 10` 新增 `topPackages` 字段）；自实现 `ChartCanvas.vue`（tree-shakable 引入 + 仅注册 `LinearScale` / `CategoryScale` / `BarController` / `BarElement` / `DoughnutController` / `ArcElement` / `Tooltip` / `Legend` 子集）；实测 bundle 204 KB raw / 40 KB gzip（达成 < 50KB 目标，节省 150KB / 75% vs chart.js/auto 全量）
- **关键决策**: 2026-08-20 用户确认 2B 推荐方案（severity 饼图 + 修复率环形 + Top-10 包柱状图）；3 种方案对比 → 推荐 A+Top-10（B 方案）；chart.js 自实现而非 PrimeVue `<Chart>`（避免 `chart.js/auto` ~200KB 全量）
- **关键 commit**: `ffacfca` chart.js 依赖 + ChartCanvas + 后端 stats.topPackages + `5abd914` dashboard 图表区 + i18n + `402dc03` 768px 响应式 grid 单列 + `5bba3f4` e2e dashboard + `5fbad71` docs Pass 同步
- **完成定义**: 仪表板"告警按严重级别"下方新增 3 卡片（severity 饼图 + 修复率环形 + Top-10 包柱状图）；3 卡片同高（CSS grid `align-items: stretch`）；空数据 empty 占位；Top-10 柱状图横轴包名截断 20 字符 + tooltip 完整名；chart.js gzip < 50KB；vue-i18n audit 零告警
- **审计**: A 阶段 audit-standard 第 1 轮 Reject（9 blocker + 5 warning）→ 全部修复 → 第 2 轮 audit-quick **Pass**；V 阶段 ui-validator Conditional（768px 响应式 grid 单列已修复）

### 阶段治理记录

- **提交序列**: C59 (`9949504` → `03ba3b2`) → C60 (`a1d5bd9` → `532ea78` → `6b994b5` → `5bba3f4` → `5fbad71`) → C61 (`ffacfca` → `5abd914` → `402dc03` + `5bba3f4` + `5fbad71`) 共 10 commits 待推送
- **审计覆盖**: C59 1 轮 audit-quick Pass；C60+C61 audit-standard 第 1 轮 Reject (9 blocker + 5 warning) → 全部修复 → 第 2 轮 audit-quick Pass + V 阶段 ui-validator Conditional 768px 已修复
- **关联**: C60 + C61 同批启动但独立 PR 决策；与 M10 cgroup 资源限制（T1003）/ C61 chart 引入是无关路径；C58 alerts.vue 同类图表已登记 backlog
- **历史教训**: W13 Nuxt e2e webServer 缓存（修改 .vue 后必须 rebuild）；C61 选用自实现 ChartCanvas 而非 PrimeVue wrapper 是 tree-shakable 原则的具体实践



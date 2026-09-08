# 经验归档分片（§41 - §48）：归档批次与设计取舍（§四十一 - §四十八）

> 本分片从 [experience-archive.md](./experience-archive.md) §准入标准 分流而出（8 章，~371 行）。章节编号全局唯一，跨文件保持稳定；外链引用按 §编号 命中，与主窗口一致。

---

## 四十一、cgroup 集成测试需"可写探测"门控 + test 文件超 lint:max-lines 必须按被测域拆分（2026-08-20，CI run 32331677198 修复）
> 教训形态：**集成测试环境探测不充分 + 测试文件无主动拆分机制**——两个独立预存隐患被一次 refactor 触发的 CI 重跑同时暴露。

- **案例**：commit `65ee5fc refactor(scripts): 迁移调用方到 check-docs` 只动 `scripts/`、`*.workflow`、规范引用（功能与 CI 配置迁移），自身验证矩阵全过（`pnpm vitest run: 132 files / 1899 tests`）。push master 后 CI run 32331677198 同时报两个独立失败：
  - **失败一（cgroup 集成测试）**：`packages/engine/src/runners/cgroup.test.ts` 第 480 行（修复前；修复后因探针函数插入已偏移至 516 行）断言 `expect(handle.applied).toBe(true)` 失败。根因：`describe.skipIf(!realCgroupV2)` 只检查标记文件 `cgroup.controllers` 存在——GitHub-hosted runner 的 ubuntu-latest 默认用户**有 v2 标记但无 cgroup 写权限**，于是测试进入 describe 块，`applyCgroupLimits` 返回 `{ applied: false, reason: 'permission_denied' }`，断言硬挂（`expected false to be true`）。
  - **失败二（lint:max-lines）**：`packages/engine/src/app/helpers.test.ts` 1031 行超 ESLint `max-lines: 1000`（测试文件专属阈值，生产代码 800/函数 500/测试函数 800）。`pnpm run lint` 直接 exit 1，整 CI 红。
  - **失败三（coverage 级联）**：coverage job 跑同一份 vitest 套件，因失败一同样挂。
- **关键观察**：commit `65ee5fc` 未触碰 `cgroup.test.ts` 与 `helpers.test.ts`——两个都是**预存隐患**。cgroup 集成测试自 PR #241 引入时就在 CI 端挂（只是此前 commit 没触发 master 上的 test.yml），`helpers.test.ts` 早已超 1000 行（积累到 14 个被测域：mergeAiUsage / computeExitCode / buildCommitMessage / buildPrTitle / pullRequestCreationHint / dependabotAlertsTokenHint / codeScanningAlertsTokenHint / autoCleanupMergedBranches / closeSupersededPRs / tryLockfileRepair / resolveAlertRepositories / hasMultipleMajorVersions / buildVersionedOverrides / verifyProject）。本次 refactor 触发 master CI 重跑，两个旧账被一并清算。
- **修复**：
  - **Fix A — cgroup 集成测试可写探测**：`cgroup.test.ts` 加 `isCgroupV2Writable()` 辅助函数（先 `isCgroupV2()` 检查标记，再 mkdir/rm 探针 slice，捕获 EACCES/EPERM 静默返回 false，加 `finally` 兜底二次清理避免空目录残留），`describe.skipIf(!realCgroupV2Writable)`。自托管 runner（含本地 WSL2 v2 + 提权）继续跑真实集成测试，CI runner 优雅 skip。本地 `pnpm vitest run packages/engine/src/runners/cgroup.test.ts` 验证：36 passed + 1 skipped（原 36 + 1 之前硬挂的现在 skip）。
  - **Fix B — helpers.test.ts 按被测域拆分**：1031 行 → 9 个 `<domain>.test.ts`（最大 183 行），按"被测函数域"而非"被测文件"为拆分单位：
    - `merge-ai-usage.test.ts`（46）、`exit-code.test.ts`（172）、`commit-message.test.ts`（129，含 buildCommitMessage + buildPrTitle）、`token-hints.test.ts`（108，含 pullRequestCreationHint + dependabotAlertsTokenHint + codeScanningAlertsTokenHint 三个 hint 函数）、`branch-cleanup.test.ts`（145，含 prCreatorMock）、`lockfile-repair.test.ts`（75，含 pnpmFixerMock）、`resolve-repositories.test.ts`（64，含 configMock）、`versioned-overrides.test.ts`（183）、`verify-project.test.ts`（106，含 verificationRunnerMock）。
    - mocks 按需下沉到各文件（prCreatorMock 只去 branch-cleanup、configMock 只去 resolve-repositories、pnpmFixerMock 只去 lockfile-repair、verificationRunnerMock 只去 verify-project），避免全局共享导致误伤。原文件删除。
    - 验证：`pnpm --filter @dependfix/engine run lint` 0 error、`typecheck` 0 error、`vitest run` 48 files / 898 passed + 1 skipped（cgroup 集成测试 skip，其他全过），总测试数与拆分前一致。
- **启示**：
  - **CI 集成测试的"环境探测"必须落到"能跑通动作"而非"满足前提条件"**：cgroup v2 标记存在 ≠ 可写（GitHub-hosted runner 默认用户只读）、`/sys/fs/cgroup` 存在 ≠ 容器内可操作（cgroup namespace 限制）、`/proc/<pid>` 可读 ≠ 可 attach debugger。门控函数统一规范：`is<X>Runnable()` 双层探针（前提 + 最小副作用动作），失败静默 false → describe.skipIf 优雅跳过，避免在受限环境硬挂。教训登记对象：所有 describe.skipIf / test.skip 都应自审是否探测到了"能跑"而非"有资源"。**挂接治理检查点**：本次入档需挂 code-auditor 必查项 + lint 规则（新增 describe.skipIf 必须配 `is<X>Writable` 探针，禁止纯标记探测），否则下次同类硬挂仍会复现——印证 §三十九"教训入档 ≠ 防御生效"。
  - **测试文件超 lint:max-lines 必须按"被测域"主动拆分**：`max-lines` 是软门禁，超过时不应"扩容阈值"（生产代码 800 是设计意图，测试 1000 是合理上限），应按被测函数域拆分。规则：每个拆出文件对应一个或一组"被测函数域"（业务内聚而非机械切分），mocks 按需下沉避免跨文件依赖，imports 收敛到 `from '../<feature>'` 或 `from './<feature>'`。`helpers.test.ts` 类"中心化测试文件"是拆分高发地——多个 helpers 函数汇聚到一个 super-test 是历史债务，函数域分片化是更可持续的模式。**挂接治理检查点**：建议在 engine 包 vitest 配置加 pre-commit 自检（`find packages -name "*.test.ts" -size +40k` 报警），把"测试文件膨胀"转成主动信号。
  - **refactor 触发的 master CI 重跑会同时暴露多个无关预存隐患**：本次 commit 自身验证全过，但 push master 后 CI 暴露了 refactor 范围之外的两类问题。这印证 §二十二"CI 链式暴露"和 §二十八"CI 修复是剥洋葱"——任何 push master 的 refactor 都必须**显式声明已跑全量 lint/test 验证矩阵**（不仅是改动点），并对覆盖的"全链路"做断言（lint 绿 → typecheck 全绿 → vitest 全绿 → coverage 一绿）。本次 commit message 写了 `pnpm vitest run: 132 files / 1899 tests` 是全量验证，但 `pnpm run lint` 在 refactor commit 里**未明确列出**，导致 lint:max-lines 失败只在 CI 端暴露——验证矩阵描述应包含每个质量门（lint / typecheck / test / build），缺一项就可能漏检。**强化守则**：refactor / fix 类 commit message 的"验证矩阵"段落必须**逐条列出每个质量门的实际命令与结果**（`pnpm run lint` 0 error / `pnpm run typecheck` 0 error / `pnpm vitest run X files / Y passed`），禁止用"全过"等笼统描述。
  - **跨包级 lint 失败定位修复**：CI 报 `File has too many lines (1031). Maximum allowed is 1000` 时，先 `wc -l` + `git log --oneline <file>` 确认历史长度变化（确认是渐进积累 vs 一次性大改动），再决定拆分粒度。本次 14 个被测域 → 9 个文件是经验阈值：单文件 < 200 行（含 mock/header）能保证未来 6-12 个月仍有扩展余量，又避免过度碎片化（> 15 个 test 文件会显著增加 `pnpm vitest run` 启动开销）。


## 四十二、Coverage 阈值对 refactor 顺序敏感：纯 rename commit 可触发无关覆盖债务清算（2026-08-27，CI run #33068271005 修复）
> 教训形态：**覆盖率阈值的"挂账累积 + 一次性清算"**——M16.1 / M16.2 期间引入的新文件与改造既有文件覆盖不充分（部分新文件无对应测试），单次 feature commit 的覆盖下降被后续 commit 的测试增量抵消一部分但未完全恢复，整体 branches 从 80.30% 缓慢滑向 79.79%；M16.2 末尾的纯 rename refactor（commit `acfdc8d8`，组件 PascalCase → kebab-case，零源码逻辑变更）不产生新测试也不消耗覆盖，但作为 push master 的触发器暴露了此前累计的覆盖缺口。

- **案例**：CI run #33068271005（master, run #471，commit `acfdc8d8 refactor(platform): 组件命名统一改为小写连字符风格`）失败于 Coverage job 的 `pnpm run test:coverage` 步骤：
  - 错误：`ERROR: Coverage for branches (79.93%) does not meet global threshold (80%)` —— 全量 2268 tests passed + 5 skipped，lint/typecheck/build/e2e 全部 ✅，唯独 coverage 阈值门禁挂。
  - 失败诊断：`acfdc8d8` commit 自身未修改任何 `.ts` 源码（仅 6 个 `.vue` 文件 git mv + 模板标签 case 改写 + 注释引用更新），按"最小改动 + 零逻辑变更"原则不应改变分支覆盖率。**真凶**是 M16.1 + M16.2 阶段（commit `8c3ee84 → acfdc8d8` 11 个 commit）累积引入的新增/改造源文件覆盖不足：
    - `apps/platform/app/utils/alerts-view.ts`（M16.2 新增 +67 行）→ **0%** 覆盖（同目录其他 util 全部有 `.test.ts`，本文件遗漏）
    - `apps/platform/server/api/scan-history/summary.get.ts`（M16.1 新增 +208 行）→ 72.72% branches（safeParseSummary 防御分支 + aggregateByRepository 孤儿 run + lastRunAt 替换路径未覆盖）
    - `apps/platform/server/api/runs/index.get.ts`（M16.1 organizationId 隔离改造 +12 行）→ 75% branches（toView 防御序列化 + ids query 边界）
    - `apps/platform/server/api/repos/[id]/scan.post.ts`（M16.2 reuseScanRunId 改造 +44 行）→ 90.62% branches（终态冲突 409 分支 + 缺 id 400 分支）
  - 上次成功覆盖 run（#32998951372, commit `8c3ee84`）branches 80.30%，本次 79.79% —— 11 个 M16 commit 累计 -0.51%，刚好跌破 80% 阈值。
- **修复**：单次提交 5 个文件 / +415 行测试（不含 untracked `alerts-view.test.ts`），覆盖 M16 新代码的未触达防御分支：
  - 新增 `apps/platform/app/utils/alerts-view.test.ts`（108 行 / 18 测试 / 4 switch 函数全分支 → 文件覆盖 100%）
  - `summary.get.test.ts` +6 测试：safeParseSummary 防御（null / 非对象 JSON / 非法 JSON）+ aggregateByRepository 孤儿 run（PRAGMA FK OFF 制造孤儿）+ lastRunAt 替换（new→old / old→new 双向）+ readNumber 非有限数字（null / 字符串 / 对象 / 数组）
  - `runs/index.get.test.ts` +4 测试：toView 孤儿 run（PRAGMA FK OFF）/ summaryJson=null / errorJson 非空 / ids query 仅含逗号
  - `scan.post.test.ts` +2 测试：缺 id → 400 / queue.add 抛"已处于终态" → 409
  - `verification-gate.test.ts` +6 测试：enforceVerificationGate 主函数（行 47/52/61/64/71/74 branches）
  - 修复后本地三连跑 branches 80.27% / statements 84.91% / lines 85.01%（buffer +0.27% ≈ 16 branches），lint 0 error / typecheck 0 error / vitest 2305 passed + 5 skipped（159 files）。**M16 加权覆盖率达 98.9% statements / 88.8% branches**（远超整体均值，证明修复聚焦于 M16 引入的覆盖缺口而非广撒网）。
- **启示**：
  - **覆盖率阈值对"commit 顺序"敏感**：refactor 类的零逻辑变更 commit 也会触发全量 CI 重跑（包括 coverage job），因此 refactor commit 实际承担了"清算此前累计覆盖债务"的功能。**守则**：(1) 禁止把"refactor + feature"合并提交——refactor 必须独立、纯改名/纯结构调整，feature 单独提交带测试。(2) 阶段性 feature merge 后（每个 M 阶段收口时）**主动跑一次 `pnpm run test:coverage`** 验证阈值未越线，不要等下次 refactor 才暴露；建议在 `vitest.config.ts` 注释里加"阶段性阈值体检"提醒（或在 release pipeline 加 coverage drift check）。
  - **新文件必须有配套测试是硬纪律**：M16.2 抽出 `alerts-view.ts` 工具函数时仅按"单调用方 utility 由 audit suggest 触发（避免过早抽象）"的设计意图抽出，**未同步补 `.test.ts`**（同目录其他 util 全部有测试，本文件成为唯一例外）。`vitest.config.ts` 的 include 模式包含所有 `apps/platform/app/utils/*.ts`，所以覆盖率数据会即时反映——"未配测试 = 0%"是机械规则，不是设计意图。**挂接治理检查点**：建议在 apps/platform 加 lint 自检（`find apps/platform/app/utils -name "*.ts" ! -name "*.test.ts" | while read f; do test -f "${f%.ts}.test.ts" || echo "MISSING TEST: $f"; done`）或 vitest 配置 `coverage.includeAfter` 显式排除未测文件（让 0% 文件显眼化）。教训登记对象：所有 `apps/platform/app/utils/`、`apps/platform/server/utils/`、`packages/cli/src/skills/` 等"工具/服务/技能"目录新增文件。
  - **阈值守门不是"恢复 80%"就结束**：当前 80.27% 的 buffer（+0.27% / ~16 branches）极薄——任何新代码或测试执行抖动都可能再次跌破 80%（本次也是）。需要分批推到 ~81%（buffer +0.7%）才能有效避免反复触发，但**不建议**一次性跳到 82%（触及 executor/runtime-adapter 等复杂模块，flakiness 风险与工作量不成正比）。渐进阈值（80% → 81% → 82%）配合"阶段性体检"才能形成正循环，而非"跌破 → 紧急修复 → 再跌破"的被动循环。
  - **commit message 验证矩阵要含 coverage**：本次修复 commit 描述应明确列出 `pnpm run test:coverage` 的 branches/statements/lines/functions 四项百分比 + 与阈值的 buffer，避免后续读者误判"仅补测试"→ 实际还顺带做了一次完整 CI 验证矩阵。印证 §四十一末条"refactor / fix 类 commit message 的验证矩阵段落必须逐条列出每个质量门"——本条扩展到"coverage 也要列入"，且需明确 buffer 数字（如 `branches 80.27% (+0.27% / ~16 branches buffer)`）。
  - **教训入档触发条件确认**：本案例符合准入标准第 4 条"工具/环境陷阱（CI/coverage 阈值对 commit 顺序敏感）"，且与 §四十一 / §二十二 / §二十八"refactor 触发 CI 链式暴露"形成连续案例链——证明此模式 ≥ 3 次复现，**挂接治理检查点**：(a) 阶段性 coverage drift check（release pipeline / todo 阶段收口 checklist）；(b) apps/platform/app/utils 等"工具目录"新增文件必须配测试（lint 自检或 coverage 显眼化）；(c) refactor commit 验证矩阵强制含 coverage buffer 数字。


## 四十三、集成外部库必须读 README 标准用法 + e2e 真实路径冒烟测试（2026-08-29，M18.4 audit round 1 Reject 后补修）
### 案例

M18.1 commit 4（`adf370a feat(engine): AppAuthProvider + InstallationTokenCache 完整实施 + 单测补强`）实施 `AppAuthProvider.getOctokit()` 时，按直觉写：

```ts
new Octokit({
    auth: createAppAuth({ appId, privateKey, installationId }),  // ← 错误：auth 字段仅接受字符串 token
    baseUrl: 'https://api.github.com',
})
```

实际 `@octokit/auth-app@8.3.0` README 标准用法是：

```ts
new Octokit({
    authStrategy: createAppAuth,  // 函数本体（未调用）
    auth: { appId, privateKey, installationId },  // 配置对象
})
```

**真实路径测试结果**（M18.4 e2e 实施时）：
- 修复前（`auth: createAppAuth(...)`）：`@octokit/core` 走 `createTokenAuth(options.auth)` 路径 → 抛 `Token passed to createTokenAuth is not a string`
- round 1 修复（`authStrategy: createAppAuth(...)` —— 仍然错误，把 `createAppAuth` 调用结果当作策略传）：`@octokit/core` 走 authStrategy 路径调用 strategy 时 `authOptions.type = undefined`，命中 `default` 分支抛 `Invalid auth type: undefined`
- round 2 修复（`authStrategy: createAppAuth, auth: {...}` —— README 标准）：✅ 真实 JWT signing + installation token 注入 + API 调用全链路通过

**为什么此前所有测试都通过**：
- `app-provider.test.ts` 用 `vi.mock('@octokit/rest')` + `FakeOctokit`——**完全跳过 `@octokit/core` 真实构造路径**
- `app-provider.test.ts` 的 `createAppAuthMock.mockReturnValue({})`——**mock 的 `authCallable` 同步返回空对象，绕开真实 `auth(state, authOptions)` 异步拒绝分支**
- **mock 测试如果不能对齐真实行为，反而会掩盖 bug**

### 教训

1. **集成外部库前必须读 README 标准用法 + 真实路径冒烟**：凭直觉或训练数据写法可能错，README 是最权威的真实契约。`@octokit/auth-app` README §installation authentication 明确给出 `authStrategy: createAppAuth, auth: {...}` 双字段组合——这是契约基线，不是建议。
2. **mock 测试如果不能对齐真实行为，反而会掩盖 bug**：`vi.mock('@octokit/rest')` 让 `new Octokit(...)` 整个被替换，**mock 边界之外的 `@octokit/core` 真实代码路径永远走不到**——任何 `@octokit/core` 与 `@octokit/auth-app` 之间的集成 bug 都被掩盖。**单测 mock 边界必须刻意保持最小**（如 `vi.mock('@octokit/auth-app')` 而不 mock `@octokit/rest`，让 `@octokit/core` 真实代码路径可执行）。
3. **实施完成不算 Done，必须有"真实路径调用 + 断言关键行为"的可执行验证**：M18.1 commit 4 当时 "typecheck 通过 + 单测全过" 就 close 了，但实际生产调用是 `Cannot read properties of undefined (reading 'bind')` / `Invalid auth type: undefined`。**真实 e2e 冒烟测试（nock 拦截 + 真实 Octokit + 真实 RSA privateKey JWT signing）必须在集成外部库时落地**，不能仅依赖 mock 单元测试。
4. **mock 形态对齐声明必须实测，不能信**：即使测试代码注释声称"mock 形态与 README `Object.assign(auth.bind(null, state), { hook: hook.bind(null, state) })` 对齐"，**也必须用一个不 mock 的真实路径测试验证对齐声明是真的**——本次 round 1 注释声称对齐但实际 dispatch 行为完全错位。

### 与既有教训的关联

- **§四十二**（coverage 阈值对 refactor 顺序敏感）：同样是"看似测试通过实际未生效"的反模式——§四十二是 coverage 阈值被 refactor commit 误触发清零；本条是 mock 测试因 mock 边界过宽掩盖集成 bug。两者同源：**测试不能只看"绿"，必须验证"绿"的语义对应真实生产行为**。
- **§三十九 / §四十一**（CI 双 run 失败）：强调"验证工具不覆盖内容语义"——单测/lint/coverage 都是验证工具，但都不覆盖"集成层真实行为"。本条扩展这条 pattern 到"集成外部库"场景。
- **§M17.4**（nuxt typecheck 不实测不能信 Done 输出）：同类教训——"Done 输出"是 LLM 自报，不是真实结果。`typecheck Done` / `test passed` / `lint 0 error` 都是输出，**必须实测 typecheck 0 error + test 真正绿 + lint 真无 error**。本条扩展到"`mock` 声称对齐 README 但实际未对齐"。

### 挂接治理检查点

1. **`docs/standards/development.md` §编码规范**：新增 pattern **"集成外部库前必须读 README 标准用法 + 落地真实路径 e2e 冒烟测试（mock 边界保持最小）"**——避免训练数据 / 直觉写法引入契约偏差。
2. **`docs/standards/testing.md` §测试隔离**：新增 pattern **"集成层测试不 mock 真实被集成库（保留真实代码路径可执行）；mock 仅替换被测单元的边界"**——避免 mock 边界过宽掩盖集成 bug。
3. **`.github/agents/code-auditor.agent.md` 审计协议**：新增必查项 **"集成外部库时验证 README 标准用法引用 + e2e 真实路径测试存在 + mock 边界刻意保持最小"**——audit reject 案例（M18.4 round 1 B1）作为佐证。
4. **`docs/standards/ai-collaboration.md` §PDTFC+ 修复工作流**：扩展到"集成外部库实施完成不算 Done，必须有真实路径调用 + 断言关键行为"——与 §M17.4 nuxt typecheck 实测必须原则一致。

### 准入标准复核

本案例符合准入标准第 1 条"架构性陷阱（mock 边界过宽掩盖集成 bug）" + 第 3 条"反模式 / 教训重复触发（M18.1 commit 4 实施不完整 → M18.4 audit round 1 Reject → round 2 修复）"。挂接治理检查点 4 项可显著降低未来同类 bug 概率。


## 四十四、Code Scanning 命令注入漏洞修复 — execFileSync 替代 execSync（2026-08-30）
### 案例

GitHub Code Scanning 告警 #26 和 #27（`js/shell-command-constructed-from-input`，Medium 级别）：`packages/engine/src/github/pr-creator.ts` 中 `ensureGitConfig` 和 `gitConfigExists` 函数使用不安全的 `execSync` 和模板字符串拼接构造 shell 命令，存在命令注入风险。

**问题代码**：
```typescript
// 第 687行（告警 #26）
execSync(`git config user.name "${effectiveAuthor.name}"`, { cwd: workDir, stdio: 'pipe' })
// 第 690行（告警 #27）
execSync(`git config user.email "${effectiveAuthor.email}"`, { cwd: workDir, stdio: 'pipe' })
// 第 700行（同类问题）
execSync(`git config --local --get ${key}`, { cwd: workDir, stdio: 'pipe' })
```

**风险**：如果 `effectiveAuthor.name` 或 `effectiveAuthor.email` 包含双引号或其他特殊字符，可能导致命令注入。例如，如果 `name` 是 `"; rm -rf /; echo "`，则执行的命令变成：
```bash
git config user.name ""; rm -rf /; echo ""
```

**修复方案**：使用 `execFileSync` 替代 `execSync`，通过数组传递参数避免 shell 解释：
```typescript
// 修复后（安全）
execFileSync('git', ['config', 'user.name', effectiveAuthor.name], { cwd: workDir, stdio: 'pipe' })
execFileSync('git', ['config', 'user.email', effectiveAuthor.email], { cwd: workDir, stdio: 'pipe' })
execFileSync('git', ['config', '--local', '--get', key], { cwd: workDir, stdio: 'pipe' })
```

**验证**：lint + typecheck + test 全部通过（2492 passed, 5 skipped）

**commit**：`2d3419b fix(engine): 修复 pr-creator 中的命令注入漏洞`

### 教训

1. **execFileSync vs execSync**：涉及用户输入的 shell 命令必须使用 `execFileSync` 替代 `execSync`，避免命令注入。`execSync` 会将字符串传递给 shell 解释，而 `execFileSync` 直接执行文件，参数作为数组传递，不经过 shell 解释。

2. **根因分析 + 搜索优先**：本次修复前，先使用搜索优先模式确认 vite 依赖告警已是误报（8.2.2 已包含修复），避免不必要的升级。对于 Code Scanning 告警，应先分析根因，再制定修复方案。

3. **安全修复审计深度**：安全修复应使用 `deep` 级别审计，确保全面覆盖。本次修复使用 deep depth audit，确认无 blocker、warning 或 suggest。

4. **Code Scanning 告警处理流程**：
   - 使用 `gh api repos/owner/repo/code-scanning/alerts` 获取告警详情
   - 分析告警类型和位置
   - 使用搜索优先模式确认是否为误报
   - 制定修复方案并实施
   - 运行质量门验证
   - 使用 conventional-committer 提交

### 与既有教训的关联

- **§四十三**（集成外部库必须读 README 标准用法）：同样是"看似安全实际存在漏洞"的反模式——§四十三是 mock 测试掩盖集成 bug；本条是字符串拼接导致命令注入。两者同源：**安全不能只看"能跑"，必须验证"能跑"的语义对应真实安全行为**。

### 挂接治理检查点

1. **`docs/standards/security.md` §注入防护**：新增 pattern **"涉及用户输入的 shell 命令必须使用 execFileSync 替代 execSync，参数作为数组传递"**——避免命令注入漏洞。
2. **`docs/standards/development.md` §编码规范**：新增 pattern **"Code Scanning 告警处理流程：gh api 获取详情 → 搜索优先确认误报 → 制定修复方案 → 质量门验证 → conventional-committer 提交"**——标准化安全修复流程。
3. **`.github/agents/code-auditor.agent.md` 审计协议**：新增必查项 **"涉及 shell 命令的代码必须使用 execFileSync 替代 execSync，参数作为数组传递"**——Code Scanning 告警 #26/#27 作为佐证。

### 准入标准复核

本案例符合准入标准第 1 条"安全漏洞（命令注入）" + 第 4 条"工具/环境陷阱（shell 命令构造）"。挂接治理检查点 3 项可显著降低未来同类漏洞概率。

---


## 四十五、归档时区分已归档内容与必要信息（2026-08-30，M18 归档批次）
### 案例

M18 归档批次清理 `backlog.md` / `todo.md` 时两次"删过头"：删除了"维护规则"、待人工验收条目、长期主线任务详细描述、未上收待办项等必要信息。

### 正确做法

| 可删除 | 必须保留 |
|:--|:--|
| `闭环整理` 这类已归档内容（M16/M17/M18 归档批次的详细记录） | `维护规则`（backlog 的治理依据） |
| | `长期主线任务详细描述`（后续阶段理解任务背景） |
| | `未上收待办项`（活跃任务） |
| | `待人工验收条目`（真实环境验证任务） |
| | `周期性回归验证层`（健康检查层） |

### 判断标准

删除前问"这个信息在下一阶段启动时是否需要？"——如果需要，就保留。

### 教训

1. **归档时要区分"已归档内容"和"必要信息"**：`闭环整理`是已归档内容，可以删除；`维护规则`、`长期主线任务详细描述`是必要信息，必须保留；`未上收待办项`是活跃任务，必须保留。

2. **归档前应该先理解文件结构**：`todo.md` 的作用是登记当前阶段活跃待办；`backlog.md` 的作用是维护未进入正式阶段的候选池；两个文件的功能不同，清理策略也应该不同。

3. **归档时要保留足够的上下文**：长期主线任务需要保留详细描述，以便后续阶段理解任务背景；周期性回归验证层需要保留，因为它是健康检查层。

4. **归档后要验证链接**：删除内容后要检查是否有断链；使用 `pnpm run check:docs` 验证。

### 与既有教训的关联

- **§规划规范 §4.4 大批量归档批次操作规范**：本条补充了"区分已归档内容与必要信息"的规范，与已有的"anchor 实证"、"跨文件外链主动追踪"、"死链验证"等规范形成完整的归档操作指南。

### 挂接治理检查点

1. **`docs/standards/planning.md` §4.4 大批量归档批次操作规范**：新增第 9 条"区分已归档内容与必要信息"——明确可删除和必须保留的内容类型，以及判断标准。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（归档操作规范中缺少"区分已归档内容与必要信息"的指导）+ 第 3 条"重复违规预警"（两次"删过头"证明需要明确规范）。挂接治理检查点 1 项可显著降低未来同类问题概率。

---


## 四十六、PrimeVue ToggleSwitch v-model 嵌套字段触发 useAsyncData watch 浅监听失效（2026-08-31，M20.6）
### 案例

M20.6 alerts.vue 把 `dedupeOptions` Select 替换为 ToggleSwitch "显示已解决" 开关后，e2e 实证点击开关后 `/api/alerts` 请求数为 0（默认 includeSuperseded=false，过滤正确），但开关切换为 true 后 `/api/alerts?includeSuperseded=true` 请求未触发，表格数据不更新。

调试脚本 `_debug3.spec.ts` 实证：
- `aria-checked` 属性从 `false` 变为 `true`（ToggleSwitch 状态正确）
- 浏览器侧 `/api/alerts` 请求数为 0（refetch 未触发）

### 根因

Vue 3 + Nuxt useAsyncData watch 浅监听对 nested field mutation 不响应：
- `watch: [viewMode, filters]` 中 `filters` 是 `ref<AlertsFilters>`——Vue 3 watch 对 ref 浅比较（reference equality）
- ToggleSwitch v-model 修改 `filters.includeSuperseded = true` 是 reactive 字段修改（不替换 ref.value 整体）
- reactive 字段修改触发 ref.value 的 reactive trigger，但 watch 浅监听不看 ref.value 的字段变化

### 修复路径

```ts
// 错误：ref + watch 浅监听
const filters = ref<AlertsFilters>({...})
watch: [viewMode, filters],

// 正确：reactive + getter + deep watch
const filters = reactive<AlertsFilters>({...})
watch: [viewMode, () => filters, { deep: true }],]

// 显式 watch 兜底（保险）
watch(filters, () => { void refreshAlerts() }, { deep: true })
```

### 教训

1. **v-model 修改嵌套字段需要 `reactive` 而非 `ref`**：`ref` 适合整体替换的对象；`reactive` 适合字段级修改的对象。
2. **useAsyncData watch 默认浅监听**：默认对 source ref 浅比较，不监听 nested field mutation；需要 `deep: true` 或 getter source。
3. **调试 useAsyncData 行为用 `pageon-request`**：浏览器侧请求数可直接判断 refetch 是否触发，比 Vue devtools 更可靠。
4. **依赖 Nuxt useAsyncData 默认 `dedupe: 'cancel'` 抑制双触发**：内置 watch + 显式 watch 都可能触发 refresh，但 abortController 会取消旧 execute；改 dedupe 策略前需重新评估。

### 与既有教训的关联

- **§三十一、PR #26/#27 命令注入漏洞（fix(engine) execFileSync 替代 execSync）**：同模式——外部库/框架的默认行为不可信，必须实测。
- **§三十六、CI 双 run 失败：锚点漂移 + dependfix 验证链缺 nuxt prepare**：同模式——Nuxt 框架在 `pnpm typecheck` 通过但 build 失败，验证矩阵必须含 build。

### 挂接治理检查点

1. **`docs/standards/development.md` §Vue/Nuxt 响应式模式**：新增"V-model 修改嵌套字段 + useAsyncData watch 模式"——明确 v-model 嵌套字段必须用 `reactive` + `deep: true`，禁止 `ref` + 默认 watch。
2. **`.github/agents/code-auditor.agent.md` 必查项**：新增"useAsyncData watch 模式"——A 阶段 audit 检查 useAsyncData 调用点 watch 配置（必须含 deep 或 getter source + reactive fields）。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（Vue/Nuxt 响应式模式规范中缺少 v-model + useAsyncData watch 模式指导）+ 第 3 条"重复违规预警"（PrimeVue 4 + Nuxt SSR hydration rowGroup 已知 bug §三十一 / §三十二 同源根因：框架默认行为不可信）。挂接治理检查点 2 项可显著降低未来同类问题概率。

---


## 四十七、一次性脚本不应 over-engineering：tsx CLI 装饰器依赖 vs Node 22+ strip-types（2026-08-31，M20.7）
### 案例

M20.7 backfill 一次性脚本最初设计为 TypeScript + tsx CLI 入口：
1. 添加 `tsx ^4.23.1` 到 devDependencies
2. 新建 `register-entities.ts` helper 文件集中管理 entity metadata side-effect imports
3. scripts：`<script>` 加 `tsx server/database/scripts/backfill-scan-result.ts --dry-run` + `--apply`

用户质疑"添加 tsx 是为什么？这个脚本为什么要 TypeScript？"——触发反思：
- Node 20 LTS（engines `>=20`）不支持 .ts 直接运行
- Node 22.6+ `--experimental-strip-types` 只剥离类型注解，不处理装饰器
- TypeORM 装饰器依赖 `emitDecoratorMetadata`，是 TS 编译器专属能力

### 根因链

1. **Node 内置 TS 支持能力有限**：`--experimental-strip-types`（22.6+）只剥离 `:` 类型注解语法，不处理 `experimentalDecorators + emitDecoratorMetadata`（TS 编译器专属）
2. **TypeORM 装饰器依赖 TS emitDecoratorMetadata**：`@Entity('table_name')` + `@Column({...})` 装饰器运行后必须 emit 元数据到 `reflect-metadata`，否则 DataSource 构造时找不到 entity metadata → `EntityMetadataNotFoundError`
3. **一次性脚本的工程价值 vs 永久代价**：
   - 价值：迁移一次就完事，没有动态业务逻辑
   - 代价：tsx devDep 永久（每次 install 都下载）+ scripts 目录永久维护

### 诚实分析结果

**保留 tsx 的不可替代技术约束**：
- Node `--experimental-strip-types` 不支持装饰器（实测确认）
- TypeORM entity 装饰器依赖 emitDecoratorMetadata，tsx / ts-node / 自建 build 产物是唯一路径
- engines 升级到 `>=22`（Node 20 EOL 2026-04-30）—— 仍需 tsx（Node 22.6+ strip-types 仍不处理装饰器）

**可简化的工程优化**：
- 删 `register-entities.ts` 单独文件，整合到主脚本顶部 inline `eslint-disable` 块（净 -21 行）
- engines 升级 `>=20` → `>=22`（Node 20 EOL）

### 教训

1. **不要为了"项目完整性"添加不必要的 dev 依赖**：一次性脚本 + 永久 devDep 代价不匹配价值；评估价值 / 成本比。
2. **engines 应该与 Node LTS 实际部署版本对齐**：Node 20 已 EOL（2026-04-30），engines `>=20` 是历史遗留，实际部署是 Node 22+ 或 Node 24+。
3. **技术约束要说清楚"不可替代"vs"工程偏好"**：TypeORM 装饰器需要 emitDecoratorMetadata（技术约束，不可替代） vs 项目惯例（工程偏好，可改）。
4. **CLI 端 entity metadata 必须显式 import 触发装饰器**：tsx / vitest CLI 路径不走 Nitro auto-load，需在脚本入口处显式 import 触发 `@Entity` / `@Column` 装饰器注册。
5. **`--experimental-strip-types` 不支持装饰器**：实测验证——`@Entity('scan_result')` 行报 `SyntaxError: Invalid or unexpected token`；需要 `--experimental-transform-types`（23.6+，24 默认关闭）但仍不处理装饰器。

### 挂接治理检查点

1. **`docs/standards/development.md` §TypeScript 运行时依赖评估**：新增"一次性脚本 TypeScript 价值评估"——明确哪些场景必须 TypeScript（装饰器 / 类型严格安全）vs 哪些可以改 JavaScript（纯 SQL / 简单业务逻辑）。
2. **`apps/platform/package.json` `engines` 字段**：升级到 `>=22`（Node 20 EOL）；注释说明 Node 22.6+ 内置 strip-types 仍不处理装饰器。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（development.md §TypeScript 运行时依赖评估缺失）+ 第 4 条"工具/环境陷阱（Node strip-types 边界）"。挂接治理检查点 2 项可显著降低未来同类 over-engineering 风险。

---


## 四十八、归档批次预防性分片 + cross-reference 断链修复（2026-08-31，M20 归档批次）
### 案例

M20 归档批次执行时：
1. 当前 todo-archive.md 主窗口 638 行 + M20 段预估 100-130 行 ≈ 738-768 行
2. 超 [archive/index.md §1 `todo-archive.md` 健康窗口 700 行强制分片阈值]（[docs/plan/archive/index.md](../../plan/archive/index.md)）
3. 预防性迁出 M16 + M17（306 行）至新分片 `archive/todo-archive-phases-m16-m17.md`
4. 主窗口保留 3 个阶段（M20 / M19 / M18），符合"主窗口保留 3-5 个阶段"健康策略

执行后断链问题：
- `docs/plan/roadmap.md` 4 处 `todo-archive.md#m16-...` / `m17-...` 锚点失效（M16/M17 段已迁出，主窗口无对应标题）
- `docs/plan/backlog.md` 4 处同类锚点失效
- `docs/design/modules/data-model.md` 引用 `todo.md#当前阶段m20-...`（todo.md 已清空 M20 内容）
- `docs/index.md` 引用 `todo-archive.md#m16-...`（已迁出）

### 根因

预防性迁出阶段后，文档 cross-reference 指向已不存在的锚点：
- todo-archive.md 中 §M16 / §M17 段被替换为指针段落（"详见 archive/todo-archive-phases-m16-m17.md"），原锚点失效
- 其他文档（roadmap.md / backlog.md / data-model.md / docs/index.md）引用的是 todo-archive.md 内的锚点

### 修复路径

1. **roadmap.md 锚点转换**：
   ```md
   # 前
   [todo-archive.md §M16](todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档)
   # 后
   [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)
   ```

2. **锚点格式转换**：`--`（双连字符）→ 单词连续（如 `m161m162m163`），由 check-docs.mjs 自动生成

3. **`pnpm run check:docs` 验证**：find link 错误并全部修复（roadmap.md 4 处 + backlog.md 4 处 + data-model.md 1 处 + docs/index.md 1 处 = 10 处断链）

### 教训

1. **预防性迁出阶段后必须 `pnpm run check:docs` 验证所有锚点**：迁出主窗口内的§后，其他文档中引用该§的锚点全部失效。
2. **跨文件 cross-reference 必须统一更新**：roadmap.md / backlog.md / data-model.md / docs/index.md 中所有 M16/M17 引用都要同步更新到分片文件。
3. **锚点格式约定**：`--`（双连字符）在 check-docs.mjs 中转换为单词连续（如 `m161--m162` → `m161m162`），不要手动拼接。
4. **todo.md 状态变化后及时更新 cross-reference**：M20 完成后 todo.md 已清空 M20 内容，但 data-model.md 仍引用 `todo.md#当前阶段m20-...` 锚点。
5. **docs/index.md 状态描述也要同步**：M0-M16 已闭环 → M0-M20 已闭环。

### 挂接治理检查点

1. **`docs/standards/planning.md` §4.4 大批量归档批次操作规范**：新增第 10 条"预防性迁出后 cross-reference 更新"——明确迁出主窗口内的§后，必须更新所有文档中的锚点引用，并 `pnpm run check:docs` 验证。
2. **`scripts/check-docs.mjs`**：新增"跨文件锚点引用"报告——列出所有引用了已迁出§的文档路径和行号，便于预防性迁出后批量修复。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（planning.md §4.4 缺少"预防性迁出后 cross-reference 更新"规范）+ 第 3 条"重复违规预警"（M18 归档批次预防性迁出 M13/M12/M10 / M19 归档批次预防性迁出 M14/M15 均有类似断链风险）。挂接治理检查点 2 项可显著降低未来同类问题概率。

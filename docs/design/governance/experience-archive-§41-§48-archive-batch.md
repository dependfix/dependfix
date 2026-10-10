# 经验归档分片（§四十一 - §四十八）：归档批次与设计取舍

> 本分片从 [experience-archive.md](./experience-archive.md) 分流而出（章节编号全局唯一、跨文件稳定，外链按 `§编号` 命中）。**正文只写结论与落点**；过程叙事不写入本体系。

## 四十一、cgroup 集成测试需"可写探测"门控 + test 文件超 lint:max-lines 必须按被测域拆分（2026-08-20，CI run 32331677198 修复）

- **结论**：① **集成测试的环境探测必须落到「能跑通动作」而非「满足前提条件」**——门控统一 `is<X>Runnable()` 双层探针（前提检查 + 最小副作用动作），失败静默 false → `describe.skipIf` 优雅跳过；**禁止纯标记探测**（CI runner 有 cgroup v2 标记但无写权限时会硬挂）。② **测试文件超 `lint:max-lines` 必须按「被测域」主动拆分**，不得扩容阈值——每个拆出文件对应一个 / 一组业务内聚的「被测函数域」，mocks 按需下沉；经验粒度：单文件 < 200 行（含 mock / header）保留 6-12 个月扩展余量，且避免过度碎片化。③ **refactor 触发的 master CI 重跑会同时暴露多个无关预存隐患**——任何 push master 的 refactor 必须在 commit message **逐条列出每个质量门**（lint / typecheck / test / build）的实际命令与结果，禁止「全过」等笼统表述。

- **结论（续）**：④ **跨包级 lint 超行数失败的定位序**：先 `wc -l` + `git log --oneline <file>` 确认是渐进积累还是一次性改动，再决定拆分粒度（经验值：拆后单文件 < 200 行留 6-12 个月扩展余量，且避免 > 15 个测试文件带来的启动开销）。
- **落点**：code-auditor 主责边界（新增 `describe.skipIf` 必须配可写探针的必查项）；ai-collaboration.md §4.2（CI 修复是剥洋葱 / 每个 job 独立环境）；ESLint `max-lines` 规则；本条目自身（拆分粒度口径）

## 四十二、Coverage 阈值对 refactor 顺序敏感：纯 rename commit 可触发无关覆盖债务清算（2026-08-27，CI run #33068271005 修复）

- **结论**：① **覆盖率阈值对 commit 顺序敏感**——零逻辑变更的 refactor 也会触发全量 CI（含 coverage job），实际承担「清算此前累计覆盖债务」：**禁止 refactor 与 feature 合并提交**，阶段收口时主动跑一次全量 coverage 体检，不等下次 refactor 才暴露。② **新文件必须配测试是硬纪律**——工具 / 服务目录新增 `*.ts` 未配同名 `.test.ts` 即 0% 覆盖（机械规则，非设计意图）。③ **阈值守门不是「恢复 80%」就结束**——buffer 极薄（< 0.5%）时须渐进抬升（80% → 81% → ……）并配合阶段性体检，才能避免「跌破 → 紧急修复 → 再跌破」的被动循环。④ coverage 四项百分比与 buffer 数字须写入 commit message 验证矩阵。
- **落点**：ai-collaboration.md §4.4（F 阶段 coverage 强制 + 验证矩阵）；testing.md §5（覆盖率目标与冲刺方法）；本条目自身（各 CI job 独立环境）

## 四十三、集成外部库必须读 README 标准用法 + e2e 真实路径冒烟测试（2026-08-29，M18.4 audit round 1 Reject 后补修）
### 教训

1. **集成外部库前必须读 README 标准用法 + 真实路径冒烟**：凭直觉或训练数据写法可能错，README 是最权威的真实契约。`@octokit/auth-app` README §installation authentication 明确给出 `authStrategy: createAppAuth, auth: {...}` 双字段组合——这是契约基线，不是建议。
2. **mock 测试如果不能对齐真实行为，反而会掩盖 bug**：`vi.mock('@octokit/rest')` 让 `new Octokit(...)` 整个被替换，**mock 边界之外的 `@octokit/core` 真实代码路径永远走不到**——任何 `@octokit/core` 与 `@octokit/auth-app` 之间的集成 bug 都被掩盖。**单测 mock 边界必须刻意保持最小**（如 `vi.mock('@octokit/auth-app')` 而不 mock `@octokit/rest`，让 `@octokit/core` 真实代码路径可执行）。
3. **实施完成不算 Done，必须有"真实路径调用 + 断言关键行为"的可执行验证**：M18.1 commit 4 当时 "typecheck 通过 + 单测全过" 就 close 了，但实际生产调用是 `Cannot read properties of undefined (reading 'bind')` / `Invalid auth type: undefined`。**真实 e2e 冒烟测试（nock 拦截 + 真实 Octokit + 真实 RSA privateKey JWT signing）必须在集成外部库时落地**，不能仅依赖 mock 单元测试。
4. **mock 形态对齐声明必须实测，不能信**：即使测试代码注释声称"mock 形态与 README `Object.assign(auth.bind(null, state), { hook: hook.bind(null, state) })` 对齐"，**也必须用一个不 mock 的真实路径测试验证对齐声明是真的**——本次 round 1 注释声称对齐但实际 dispatch 行为完全错位。

### 挂接治理检查点

1. **`docs/standards/development.md` §编码规范**：新增 pattern **"集成外部库前必须读 README 标准用法 + 落地真实路径 e2e 冒烟测试（mock 边界保持最小）"**——避免训练数据 / 直觉写法引入契约偏差。
2. **`docs/standards/testing.md` §测试隔离**：新增 pattern **"集成层测试不 mock 真实被集成库（保留真实代码路径可执行）；mock 仅替换被测单元的边界"**——避免 mock 边界过宽掩盖集成 bug。
3. **`.github/agents/code-auditor.agent.md` 审计协议**：新增必查项 **"集成外部库时验证 README 标准用法引用 + e2e 真实路径测试存在 + mock 边界刻意保持最小"**——audit reject 案例（M18.4 round 1 B1）作为佐证。
4. **`docs/standards/ai-collaboration.md` §PDTFC+ 修复工作流**：扩展到"集成外部库实施完成不算 Done，必须有真实路径调用 + 断言关键行为"——与 §M17.4 nuxt typecheck 实测必须原则一致。

## 四十四、Code Scanning 命令注入漏洞修复 — execFileSync 替代 execSync（2026-08-30）
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

### 挂接治理检查点

1. **`docs/standards/security.md` §注入防护**：新增 pattern **"涉及用户输入的 shell 命令必须使用 execFileSync 替代 execSync，参数作为数组传递"**——避免命令注入漏洞。
2. **`docs/standards/development.md` §编码规范**：新增 pattern **"Code Scanning 告警处理流程：gh api 获取详情 → 搜索优先确认误报 → 制定修复方案 → 质量门验证 → conventional-committer 提交"**——标准化安全修复流程。
3. **`.github/agents/code-auditor.agent.md` 审计协议**：新增必查项 **"涉及 shell 命令的代码必须使用 execFileSync 替代 execSync，参数作为数组传递"**——Code Scanning 告警 #26/#27 作为佐证。

## 四十五、归档时区分已归档内容与必要信息（2026-08-30，M18 归档批次）
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

### 挂接治理检查点

1. **`docs/standards/planning.md` §4.4 大批量归档批次操作规范**：新增第 9 条"区分已归档内容与必要信息"——明确可删除和必须保留的内容类型，以及判断标准。

## 四十六、PrimeVue ToggleSwitch v-model 嵌套字段触发 useAsyncData watch 浅监听失效（2026-08-31，M20.6）
### 教训

1. **v-model 修改嵌套字段需要 `reactive` 而非 `ref`**：`ref` 适合整体替换的对象；`reactive` 适合字段级修改的对象。
2. **useAsyncData watch 默认浅监听**：默认对 source ref 浅比较，不监听 nested field mutation；需要 `deep: true` 或 getter source。
3. **调试 useAsyncData 行为用 `pageon-request`**：浏览器侧请求数可直接判断 refetch 是否触发，比 Vue devtools 更可靠。
4. **依赖 Nuxt useAsyncData 默认 `dedupe: 'cancel'` 抑制双触发**：内置 watch + 显式 watch 都可能触发 refresh，但 abortController 会取消旧 execute；改 dedupe 策略前需重新评估。

### 挂接治理检查点

1. **`docs/standards/development.md` §Vue/Nuxt 响应式模式**：新增"V-model 修改嵌套字段 + useAsyncData watch 模式"——明确 v-model 嵌套字段必须用 `reactive` + `deep: true`，禁止 `ref` + 默认 watch。
2. **`.github/agents/code-auditor.agent.md` 必查项**：新增"useAsyncData watch 模式"——A 阶段 audit 检查 useAsyncData 调用点 watch 配置（必须含 deep 或 getter source + reactive fields）。

## 四十七、一次性脚本不应 over-engineering：tsx CLI 装饰器依赖 vs Node 22+ strip-types（2026-08-31，M20.7）
### 教训

1. **不要为了"项目完整性"添加不必要的 dev 依赖**：一次性脚本 + 永久 devDep 代价不匹配价值；评估价值 / 成本比。
2. **engines 应该与 Node LTS 实际部署版本对齐**：Node 20 已 EOL（2026-04-30），engines `>=20` 是历史遗留，实际部署是 Node 22+ 或 Node 24+。
3. **技术约束要说清楚"不可替代"vs"工程偏好"**：TypeORM 装饰器需要 emitDecoratorMetadata（技术约束，不可替代） vs 项目惯例（工程偏好，可改）。
4. **CLI 端 entity metadata 必须显式 import 触发装饰器**：tsx / vitest CLI 路径不走 Nitro auto-load，需在脚本入口处显式 import 触发 `@Entity` / `@Column` 装饰器注册。
5. **`--experimental-strip-types` 不支持装饰器**：实测验证——`@Entity('scan_result')` 行报 `SyntaxError: Invalid or unexpected token`；需要 `--experimental-transform-types`（23.6+，24 默认关闭）但仍不处理装饰器。

### 挂接治理检查点

1. **`docs/standards/development.md` §TypeScript 运行时依赖评估**：新增"一次性脚本 TypeScript 价值评估"——明确哪些场景必须 TypeScript（装饰器 / 类型严格安全）vs 哪些可以改 JavaScript（纯 SQL / 简单业务逻辑）。
2. **`apps/platform/package.json` `engines` 字段**：升级到 `>=22`（Node 20 EOL）；注释说明 Node 22.6+ 内置 strip-types 仍不处理装饰器。

## 四十八、归档批次预防性分片 + cross-reference 断链修复（2026-08-31，M20 归档批次）
### 教训

1. **预防性迁出阶段后必须 `pnpm run check:docs` 验证所有锚点**：迁出主窗口内的§后，其他文档中引用该§的锚点全部失效。
2. **跨文件 cross-reference 必须统一更新**：roadmap.md / backlog.md / data-model.md / docs/index.md 中所有 M16/M17 引用都要同步更新到分片文件。
3. **锚点格式约定**：`--`（双连字符）在 check-docs.mjs 中转换为单词连续（如 `m161--m162` → `m161m162`），不要手动拼接。
4. **todo.md 状态变化后及时更新 cross-reference**：M20 完成后 todo.md 已清空 M20 内容，但 data-model.md 仍引用 `todo.md#当前阶段m20-...` 锚点。
5. **docs/index.md 状态描述也要同步**：M0-M16 已闭环 → M0-M20 已闭环。

### 挂接治理检查点

1. **`docs/standards/planning.md` §4.4 大批量归档批次操作规范**：新增第 10 条"预防性迁出后 cross-reference 更新"——明确迁出主窗口内的§后，必须更新所有文档中的锚点引用，并 `pnpm run check:docs` 验证。
2. **`scripts/check-docs.mjs`**：新增"跨文件锚点引用"报告——列出所有引用了已迁出§的文档路径和行号，便于预防性迁出后批量修复。

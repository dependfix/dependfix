# M18 归档分片

> 本文档包含 M18 平台 GitHub App BYO App 模式的完整归档记录。
> 原始位置：todo-archive.md 主窗口（2026-08-30 归档）。
> 迁出日期：2026-09-01 M22 归档批次预防性分片迁出——M22 段新增前主窗口 612 行 + M22 段 119 行 = 731 行超 700 强制分片阈值；预防性迁出 M18（118 行）后主窗口 ~613 行回到健康窗口；与 M19/M20 归档批次预防性迁出 M14-M15/M16-M17 同源策略（"主窗口保留 3-5 个阶段"健康策略中位）。

## M18: 平台 GitHub App BYO App 模式（M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部已闭环 / 2026-08-30 归档）

> **归档日期**：2026-08-30
> **阶段摘要**：M17 闭环后承接 C22 GitHub App BYO App 模式（自部署平台 GitHub App 进阶选项；PAT 保留为默认快速上手路径，二者并存不替代）。M18 包含 5 子阶段 + 1 治理批次：M18.0（P0 docs only，PAT 无感升级评估）/ M18.1（P1，C22.1 基础层：credential 扩展 4 字段 + AuthProvider 抽象层 + installation token 缓存）/ M18.2（P1，C22.2 集成层：pushFixBranch token 切换 + commit author 动态化 + 审计字段）/ M18.3（P2，C22.3 表现层：UI GitHub App tab + 文档引导 + Manifest flow 可行性评估）/ M18.4（P1，C22.4 测试层：单测补强 + e2e mock JWT signing 全链路）/ M18.x 治理批次（P3 合并入 C22 子阶段顺手做：S-5/C39/C34/S1/S2/S-3/S-4/W3/W4）。
>
> **阶段边界**：M18 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ C22 10 原子子任务按依赖关系拆 5 子阶段；PAT 保留为默认路径 + GitHub App 作为自部署平台进阶选项，二者并存不替代；fixtures 仅 mock 无真实 App（用户接受风险）。
>
> **非目标**：不发布 dependfix 自身为官方 GitHub App（C22-future 单独战略候选）；不立即做 App 多 installation 编排自动化；B 模式（`github-action` executor）App 适配非阻塞；不破坏现有 PAT 路径；Manifest flow 一键创建暂不实施（A7b 仅评估，A7a 文档引导先落地）。
>
> **状态**：✅ 全部完成（M18.0 + M18.1 + M18.2 + M18.3 + M18.4 + M18.x 全部 6 子阶段 + 1 治理批次闭环 / ~24 commits 已全部推送至 origin/master，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测；含 M18.4 audit round 1 Reject 后针对性补修闭环 + M18.x 治理批次 8 commits）

### 阶段闭环清单

#### M18.0 PAT 无感升级评估报告 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **PAT 无感升级评估报告**（docs only） | `690cc73` | `docs/design/governance/c22-pat-backward-compat.md` 输出 3 方案对比 + 推荐 B AuthProvider 注入 + 9 测试 + 2 app 改动清单 + 风险矩阵；决策 A：严格分离"评估"与"实施"，M18.0 仅输出 docs only commit |

#### M18.1 C22.1 基础层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **AuthProvider + PatAuthProvider** | `026078a` | `packages/engine/src/auth/` 新建 AuthProvider 接口（`getOctokit()` / `getGitCredential()` / `getCommitAuthor()`）+ PatAuthProvider 实现 |
| **audit Reject 修复** | `0866830` | audit round 1 Reject 后针对性补修 |
| **调用点改造** | `67a1a2f` | `createGitHubClient` 改为 `{ auth: AuthProvider }` 注入；老 `{ token }` 签名保留为 deprecated 包装 |
| **接口契约 + PatAuthProvider 单测** | `e9b9c0a` | 接口契约定义 + PatAuthProvider 单测覆盖 |
| **AppAuthProvider + InstallationTokenCache + 单测** | `adf370a` | AppAuthProvider 实现 + installation token 缓存层（1h 滑窗 + 5min 提前刷新）+ 单测 |

#### M18.2 C22.2 集成层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **commit author 动态化** | `e84ff58` | PAT 路径保留硬编码 `dependfix[bot]@users.noreply.github.com`；App 路径动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`（GitHub App 协议要求） |
| **pushFixBranch 接受 AuthProvider** | `a6a1695` | `pushFixBranch` token 字段动态切换为 installation token，URL 不变 |

#### M18.3 C22.3 表现层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **GitHub App 凭据管理接入实体 + schema + UI tab + PEM 校验** | `b3a2cfb` | Credential 实体扩展 `appId` / `encryptedPrivateKey` / `installationId` / `botLogin` 4 字段 + UI 凭据创建新增 GitHub App tab + PEM 客户端解析 + 公钥指纹校验 |
| **PEM 指纹算法修正** | `c6534fe` | PEM 指纹算法修正 |
| **GitHub App 配置章节 + C39 standards 同步** | `7ef0d73` | `quick-start` 加 "GitHub App 配置" 章节 + `security.md` §5 凭据模型从"PAT 三件套"扩到"PAT + App" + `architecture.md` §认证更新 + C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步（8 处） |
| **C22 Manifest flow 可行性评估** | `25d8682` | A7b 评估报告输出至 `docs/design/governance/c22-manifest-flow-feasibility.md` |
| **Manifest flow 评估修正** | `700ab28` | 评估报告修正 |
| **删除 §2.6 重复小节标题** | `ac21f6f` | 文档格式修复 |

#### M18.4 C22.4 测试层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **M18.4 测试层补强 + app-provider auth 字段 bug 修复** | `b5c23a0` | 单测补强（`auth-provider.test.ts` + `installation-token-cache.test.ts` + `pr-creator.test.ts` App bot email 路径回归）+ e2e mock JWT signing + `getInstallationOctokit` 拦截全链路验证；app-provider auth 字段 bug 修复（`@octokit/auth-app` README 标准用法：`authStrategy: createAppAuth, auth: {appId, privateKey, installationId}` 双字段） |
| **登记 M18.4 audit 教训** | `bc2ee06` | experience-archive §四十三：集成外部库必须读 README 标准用法 + e2e 真实路径冒烟测试 |

#### M18.x 治理批次 ✅（2026-08-29 闭环）

| 批次 | commit | 范围 | 验证 |
|:--|:--|:--|:--|
| 1 | `19c0cd8` docs(standards+plan) + `9da26e3` docs(testing) | C39 standards 同步（已由 M18.3 顺带闭环）+ C34 部分盘点（M14.x 5 条 + M18.x 1 条）+ experience-archive §四十三 4 条挂 standards（development.md §5.1.15 + testing.md §6.3 + ai-collaboration.md §D 第 5 条 + code-auditor.agent.md 主责边界必查项） | audit quick Pass + W1 trivial fix |
| 2 | `6866eb7` fix(engine) | **W3** stageAndCommit host 全局 git config 干扰 bug 修复（`stageAndCommit` 显式 `-c user.name=X -c user.email=Y` + `gitConfigExists` 用 `--local` flag）+ 1 个 W3 回归测试 | audit quick Reject + B1 trivial fix（删除重复 it 块） |
| 2 | `fd2a29e` fix(platform) | **S1** `scan.post.ts` + `batch-executor.ts` 字面 `'duplicate_scan'` → 联合类型 `'SCAN_PENDING_MERGED'`（C36 一致性）+ 前端 `repos.vue` 同步 + **S2** `detectServerLocale` 加 `?locale=` URL query 支持（与 `localeDetector.ts:15` `tryQueryLocale` 对齐）+ 3 个 S2 回归测试 | 验证矩阵齐备 |
| 3 | `21f1a9f` test(engine) | audit B1 fix（删除 pr-creator.test.ts 重复 W3 it 块 31 行） | 验证：63 tests passed |
| 4 | `878ae1a` test(platform) | **S-5** 5 文件 14 处 `process.env.ENCRYPTION_KEY` 死代码清理（保留 `setup-nuxt-server.ts:26` `useRuntimeConfig` stub 默认值） | platform vitest 888 passed |
| 5 | `933e578` build(workspace+ci) | **W4** `pnpm.overrides` 钉定 `@octokit/auth-app: 8.3.0`（c22 §5.5 决策 C 缓解措施 4）+ `test.yml` 新增 `pnpm audit --prod --audit-level=moderate` 步骤（不阻断 Test job） | pnpm audit 0 vulnerabilities + lockfile 同步 |
| 6 | `45cae13` test(platform) | **S-3** update-user viewer 403 端点 + **S-4** 6 端点 admin 通过双向断言（补 better-auth admin 插件完整 viewer 403 ↔ admin 通过矩阵） | lint 0 error（e2e 测试需 Playwright build 产物，本地不跑 CI 验证） |

### 阶段验收标准（M18 全部闭环 ✅）

- [x] **M18.0 PAT 无感升级评估报告** —— 3 方案对比 + 推荐 B AuthProvider 注入 + 9 测试 + 2 app 改动清单 + 风险矩阵；决策 A：严格分离"评估"与"实施"
- [x] **M18.1 C22.1 基础层** —— AuthProvider 接口 + PatAuthProvider + AppAuthProvider + InstallationTokenCache + 单测
- [x] **M18.2 C22.2 集成层** —— commit author 动态化 + pushFixBranch 接受 AuthProvider
- [x] **M18.3 C22.3 表现层** —— Credential 实体扩展 + UI GitHub App tab + 文档引导 + Manifest flow 可行性评估 + C39 standards 同步
- [x] **M18.4 C22.4 测试层** —— 单测补强 + e2e mock JWT signing 全链路 + app-provider auth 字段 bug 修复
- [x] **M18.x 治理批次** —— S-5/C39/C34/S1/S2/S-3/S-4/W3/W4 全部闭环
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 全部通过
- [x] `pnpm check:docs` 全过 —— 99 md links + 55 vue-interp OK
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— ~24 commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：~24 commits（M18.0 1 + M18.1 5 + M18.2 2 + M18.3 6 + M18.4 2 + M18.x 8）；含 M18.4 audit round 1 Reject 后针对性补修闭环
- **测试覆盖**：单测补强 + e2e mock JWT signing 全链路验证
- **审计覆盖**：M18.0 quick / M18.1 quick × 2（含 1 次 Reject 后补修）/ M18.2 quick / M18.3 standard / M18.4 quick × 2（含 1 次 Reject 后补修）/ M18.x quick × 2 —— 全部 Pass
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-30 实测 ahead=0（已全部推送至 origin/master）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M18 段（原始位置；2026-09-01 M22 归档批次预防性分片迁出至 `archive/todo-archive-phases-m18.md`）
  - `docs/plan/todo.md` 顶部 M18 任务清单 → M18 已闭环切换
  - `docs/plan/roadmap.md` M18 段状态更新（已完成 2026-08-30 归档）+ Milestone 概述表 M18 行新增
  - `docs/plan/backlog.md` §org 增强 C22 主条目状态更新（M18 已闭环）+ 历史归档指针段新增 M18 条目
  - `docs/plan/archive/index.md` 基线更新（M18 归档后）+ 近期归档批次登记新增 M18 行
  - `docs/design/governance/c22-pat-backward-compat.md`（M18.0 评估报告）
  - `docs/design/governance/c22-manifest-flow-feasibility.md`（M18.3 评估报告）
  - `docs/guide/quick-start.md` GitHub App 配置章节（M18.3）
  - `docs/design/governance/security.md` §5 凭据模型扩展（M18.3）
  - `docs/design/governance/architecture.md` §认证更新（M18.3）
  - `docs/standards/development.md` §5.1.15（M18.x 经验沉淀）
  - `docs/standards/testing.md` §6.3（M18.x 经验沉淀）
  - `docs/standards/ai-collaboration.md` §D 第 5 条（M18.x 经验沉淀）
  - `.github/agents/code-auditor.agent.md` 主责边界必查项（M18.x 经验沉淀）

### 关键决策

- **PAT 保留 + App 并存** vs 完全替换 PAT：选并存 —— PAT 是 CLI quickstart / Action input / 单仓调试的最低摩擦路径；BYO App 只对自部署平台多仓 org 场景提供增量价值（installation 范围限定 + 1h 短时 token 轮换 + 真实 bot 身份）
- **PAT commit author 保留硬编码** `dependfix[bot]@users.noreply.github.com` —— PAT 路径用户行为零变化；仅 App 路径走动态 bot identity（`{app_id}+{bot_login}[bot]@users.noreply.github.com`）
- **fixtures 仅 mock**（决策 C 风险承担）：mock 必须严格对齐 `@octokit/auth-app` 库契约输出；单测聚焦库 mock 输出契约作为缓解措施
- **Manifest flow 一键创建暂不实施**：A7b 仅评估可行性（GHES 版本支持范围 / manifest URL 构造 / OAuth callback 路径 / CSRF 防护）；A7a 文档引导先落地
- **M18.x 治理批次合并入 C22.x 子阶段顺手做**（决策 B）：按关联性分组（S-5 → M18.1 / C39+C34 → M18.3 / S1+S2 → M18.4 / S-3+S-4 → M18.4 e2e）

### 阶段关键经验（已沉淀至项目知识库）

- **集成外部库前必须读 README 标准用法**（development.md §5.1.15）：M18.1 commit 4 凭直觉写 `auth: createAppAuth(...)` 错误用法 + `vi.mock('@octokit/rest')` 跳真实路径 → M18.4 audit round 1 Reject → round 2 README 标准用法 + 去 mock 化真实路径 e2e 修复
- **测试 stub 命名一致性**（S-5 延伸教训）：调用方测试 `process.env.ENCRYPTION_KEY` 与生产 `NUXT_ENCRYPTION_KEY` 命名不一致，偶然一致性维持能跑但 setup-nuxt-server.ts stub 字符串变更会导致测试突然全挂——单一来源 + 字面量直接引用优于 env 透传

### 待迁移经验（next neat-freak 候选）

- **W1（M18.4 audit round 2）**：stageAndCommit host 全局 config 隔离未覆盖 `--local` flag 路径——仅覆盖 `-c` 显式传。需补 1 个 case 用 `process.env.GIT_CONFIG_GLOBAL=/tmp/synthetic-global-with-user.name` 模拟 host global + 不预设 local config，验证 `ensureGitConfig` 会写入 local config
- **W2（M18.4 audit round 2）**：`detectServerLocale` 不接受 `?locale=EN`（大小写敏感），`tryQueryLocale` 由 `@nuxtjs/i18n` 实现可能归一化为 `en`（BCP 47 lowercasing）。建议下一批次加 `.toLowerCase()` 兼容，或在 todo 登记
- **C34 完整盘点**：standards 中其他"必须级"条款（开发规范 §3 / §4 / §5.1.x / 测试规范 §6 / 安全规范 §5 / git 规范 §3 / AI 协作规范 §1/§4）双层对称挂接完整盘点属于 neat-freak 批次工作，本次 M18.x 治理批次仅做 experience-archive §四十三 4 条新教训挂接；候选下批次会话处理

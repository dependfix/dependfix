# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。
> 主窗口保留最近 3-5 个已归档阶段摘要；早期阶段归档分片见 [archive/](archive/)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。
- 早期阶段分片：
  - [M0 / M1](archive/todo-archive-phases-m0-m1.md)（2026-08-07 迁出，115 行）
  - [M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5](archive/todo-archive-phases-m2-m55.md)（2026-08-14 迁出，T906 执行，398 行）
  - [M6 / M7.1 / M7.2 / T711 / M8](archive/todo-archive-phases-m6-m7-t711.md)（2026-08-20 neat-freak 归档批次迁出，293 行）
  - **M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（2026-08-20 迁出）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块（当前保留 **2026-08-26 M15 扫描历史详情侧栏增强（UX-R2）/ 2026-08-26 M14 platform release 通道闭环 + UX 反馈跟进（M14.1+M14.2+M14.3+M14.x+M14.y）/ 2026-08-26 M13 治理 + UX 反馈 + 网络治理 + Code Scanning（M13.1+M13.2+M13.3+M13.4）/ 2026-08-21 M12 平台 UX 一致性 + i18n 治理 / C53 / 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次** 共 7 个批次，超出"主窗口保留 3-5 个阶段"策略但仍在 700 行分片阈值内）。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-26）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见下方 §M12 段。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 待推送：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见下方 §M13 段。
- **2026-08-26 归档批次（M14.1）**：M14.1 T1310 F 阶段闭环 1 子任务完整闭环，**7 commits 已推送至 `origin/master`**（含 T1310 ahead 5 commits + P 阶段规划 1 + M14.1 收口 1；`git rev-list HEAD ^origin/master --count` 实证：ahead=1，仅 `1fd38c1` P 阶段规划 commit 待推送；T1310 5 commits 已 ahead 提交并已推送至 origin/master）。详见下方 §M14 段。
- **2026-08-26 归档批次（M15）**：M15.1 UX-R2 4 子任务完整闭环；ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验（`git rev-list HEAD ^origin/master --count` 当前值含 3 commits 属于 M15 实施——`5c65177` docs 切换 + `1112017` feat 实现 + `0a60e3d` test 覆盖——加 1 commit 属于 release.yml CI 修复 `d517a7f` 不计入 M15 总投入）。详见下方 §M15 段。
- **2026-08-26 同期动作**：§2026-08-20 e2e 修复批次（C62+C63+C64+chore）从 todo-archive.md 主窗口迁出至 [archive/todo-archive-phases-m11.md §2026-08-20 e2e 修复批次](archive/todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（M15 归档批次顺带的 700 行分片阈值预防性迁出，与 §2026-08-20 平台 UI 增强 C59-C61 同源——属 M11 关联批次）。

---

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已闭环）

> **归档日期**：2026-08-26
> **阶段摘要**：M12 闭环后承接 backlog 治理前置 + 2026-08-25~26 用户实测反馈 5 项 UX 问题 + 网络治理长期主线 #2（network-audit G1 治本）+ Code Scanning 规则化 + code-quality-findings 接入 + T1310 platform 进入 release 通道。按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件超阈值需拆分）拆 **4 子阶段独立闭环 + T1310 同步推进**：M13.1 治理 + UX / M13.2 网络治理 + 告警去重 / M13.3 Code Scanning 规则化 + CQL / M13.4 UX 反馈批次立刻做（低风险）。
> **状态**：✅ 全部完成（M13.1+M13.2+M13.3+M13.4 全部 12 子任务闭环；26 commits 已推送至 origin/master，ahead=3 待用户推送 M13.4 三 commits）

### 阶段闭环清单

#### M13.1 治理前置 + 平台 UX 反馈 ✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1301 C1 wisdom 蒸馏** | `b57b8d8` | `.session/wisdom.md` 27 条 → 14 条活跃 + 12 条压缩为已蒸馏摘要（迁移 30 条到 docs/standards/*.md）；`pnpm distill:wisdom --check --threshold=15` WISDOM_OK（活跃 14 条低于预警阈值 15，符合[规划规范 §4.3](../../docs/standards/planning.md) "活跃 ≥ 20 必须蒸馏"约束） |
| **T1302 C2 neat-freak 批次** | `f43edf1` | 9 条新 wisdom pattern/principle 挂接到 standards（`development.md §5.1.12/§5.1.13/§5.1.14` + `ai-collaboration.md §4.4/§4.5/§4.6` + `git.md §3.4` + `testing.md §6.1`）+ `full-stack-master.agent.md` 新增 PDTFC+ 自检条目；Round 1 Reject 3 warning + 3 suggest → Round 2 Pass |
| **T1303 单仓库扫描互斥修复**（实测反馈 5.1） | `c2e3d7b` + `7282f65` | `repos.vue:468-469` 删除全局 `:disabled="scanningId !== null && scanningId !== data.id"`，仅保留 `:loading="scanningId === data.id"` 单仓库扫描态指示；playwright e2e `history-dialog` 2/2 passed |
| **T1304 历史 Dialog X 按钮修复**（实测反馈 5.2） | `25b46eb` | `RepoHistoryDialog.vue` 详情视图 `:closable="false"` + `:close-on-escape="false"`（PrimeVue 4 Dialog API 核验）；i18n 双语 +2 键；playwright e2e +1 case |

#### M13.2 网络治理 + 告警去重 ✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1305 B2 network-audit G1 治理**（长期主线 #2 切片） | `0f08c40` + `5269d0a` + `9c79fc9` | 候选方向 3 落地（治本根因而非逐次新增白名单）：verification 子进程命令输出 URL 提取**仅入 entries 备查，不再 addViolation**（stdout/stderr 文本语义上不是真实网络连接）；`buildSpawnEnv` 集中环境注入 telemetry 默认禁用（NUXT_TELEMETRY_DISABLED / NEXT_TELEMETRY_DISABLED / DO_NOT_TRACK）；4 个回归 case 锁定边界 |
| **T1306 告警跨次扫描去重**（实测反馈 6） | `e3d93b7` + `4447ff8` + `2ae2a77` | 后端 `/api/alerts` 新增 `dedupe=true` 参数（zod safeParse 兜底，默认 false 保后向兼容）；fingerprint = `${repositoryId}|${packageName}|${ruleId ?? ''}` + 聚合字段（occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）；原 SQL GROUP_CONCAT 子查询在 better-sqlite3 `:memory:` 子查询表名解析失败，改用应用层 JS 聚合（去 SQL dialect 依赖 + 测试稳定）；前端 DataTable 列扩展 + 详情侧栏（PrimeVue Sidebar） |
| **T1309 changelog 机制治本**（c811659 回归） | `6023da8` + `e9197c1` + `1cb0364` + `9b536e1` + `56de1a1` | 当 `generate({ releaseCount: 1 })` 输出空时新增 fallback 路径：`computeDependencyChanges` + `loadDepsAtTag` + `renderDependencySection` 三个纯函数；保留既有 `mergeUnreleased` 流程；"重跑幂等"语义保持；`pnpm verify:changelog` exit 0 |

#### M13.3 Code Scanning 规则化 + CQL ✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1307 C16 Code Scanning 规则分类配置化** | `792e8c8` + `7b1ac01` + `3cccce0` | `packages/engine/src/code-scanning/rule-config.ts` 新模块（208 行）；规则分类从硬编码常量表升级为 JSON 可配置加载；默认 = 当前常量表（向后兼容）；`CODE_SCANNING_RULES_CONFIG_PATH` env 覆盖 + `setActiveRulesConfig` 运行时注入；非法配置 → stderr 警告 + 降级默认；A 阶段 standard Pass，0 blocker |
| **T1308 C21 code-quality-findings 接入** | `b0f6e84` + `7b1ac01` + `3cccce0` + `e63cdb9` | 新增 `GET /repos/{owner}/{repo}/code-quality/findings` 数据源接入（cursor-based 分页 + 三层防御：MAX_CURSOR_PAGES=1000 / seenCursors / Link header 自然终止）；复用 `NormalizedSecurityAlert` 模型（source='code-quality'）；报告输出新增 `## Code Quality Findings` 段（独立于 Code Scanning 段）；平台 UI alerts 页 source filter 新增 Code Quality 选项；A 阶段 standard Round 1 4 blocker + 5 warning → Round 2 全闭环；CI Coverage 修复 `e63cdb9` 补测 14 case（branches 79.98% → 80.17%） |

#### M13.4 UX 反馈批次立刻做（低风险 UX 修复）✅

> 本批次背景（2026-08-26）：用户实测截图反馈 6 项 UX 问题，按 §1.1 ≤5-6 项硬上限 + 与 T1310 互不干扰原则，**3 项低风险立刻做（M13.4）** + **3 项进 backlog 暂缓（[backlog.md UX-R1~R3](backlog.md#扫描历史与详情-ux2026-08-26-实测反馈)）**。

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1401 失败原因展示**（实测反馈 1） | `2dce01d` + `8762a4b` | `RepoHistoryDialog.vue` 列表行 status Tag `:title="data.error?.message"` 悬浮展示 + 详情面板 Error Banner（code + message）；i18n 双语 +2 键；playwright e2e `history-dialog` 既有 2/2 passed |
| **T1402 alerts UI 增加 ruleId 列**（GHSA/CVE/rule 智能显示，实测反馈 4a） | `bb3b49a` + `8762a4b` | `alerts.vue` 新增 ruleId 列（4 列 source 不同 Tag 颜色：dependabot=success / pnpm-audit=warn-secondary / code-scanning=info / code-quality=contrast）；Dependabot GHSA 编号点击跳 htmlUrl；长 advisory URL 列宽固定 180px + ellipsis + `:title` 悬浮；i18n 双语 +1 键 |
| **T1403 dedupe 默认值改为跨次去重**（实测反馈 4b） | `bb3b49a` + `8762a4b` | `alerts.vue` filters.dedupe 默认值改为 'across'；**Code Auditor RG-B1 修复**：清理 dead ref `dedupeMode`/`DedupeMode`（自 T1306 commit `4447ff84` 引入以来从未被消费）+ JSDoc 迁移到 filters ref 上方 |

#### 同步推进 T1310（已 ahead 提交但未闭环）🔄

> 本阶段 M13 闭环期间同步推进 T1310 platform 进入 release 通道子任务（5 commits 已 ahead 提交并已推送至 origin/master，ahead=0 时已包含；归档时仅做引用登记，详细实施记录待 T1310 F 阶段闭环后单独归档）：

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| T1310 平台进入 release 通道（部分 ahead 已提交） | `300b318` + `1819b59` + `733e198` + `7b40a2c` + `a74d07d` | `scripts/packages.config.mjs` 新增 apps/platform 条目（`npmPublishable:false`）+ `release-publish.mjs` 新增 tag-only action + `docker.yml` 支持 workflow inputs 读 platform_version + `release.yml` 完成后触发 docker workflow_dispatch + `docs/guide/release.md` 平台独立通道文档 + dependabot 排除 `apps/platform/package.json` |

### 阶段验收标准（全部闭环 ✅）

- [x] 4 子阶段全部独立闭环（每个 ≥ 1 Review Gate Pass）—— M13.1 T1301 quick / T1302 standard / T1303 quick / T1304 quick；M13.2 T1305 quick / T1306 standard；M13.3 T1307 standard / T1308 standard 2 轮；M13.4 T1401+T1402+T1403 standard Round 1 → Round 2 全闭环
- [x] 12 子任务全部闭环（T1301+T1302+T1303+T1304+T1305+T1306+T1309+T1307+T1308+T1401+T1402+T1403 = 12 子任务；M13.4 三个子任务合并为 2 commits 实施）
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— vitest 2225 passed / playwright 6 alerts-rowgroup + 2 history-dialog 全部通过
- [x] branches 覆盖率维持 ≥ 80% —— M13.3 T1308 提交后 branches 79.98% → 80.17%（CI 阈值回归修复 `e63cdb9` 补测 14 case）
- [x] `pnpm check:docs` 全过 —— 99 links + 55 vue-interp OK
- [x] 用户实测反馈 5 项全部闭环 —— #5.1（单仓库扫描互斥修复 → T1303）+ #5.2（历史 Dialog X 按钮修复 → T1304）+ #1（失败原因展示 → T1401）+ #4a（alerts UI 增加 ruleId 列 → T1402）+ #4b（dedupe 默认值 → T1403）；另 3 项进 backlog 暂缓（[UX-R1~R3](backlog.md#扫描历史与详情-ux2026-08-26-实测反馈)）
- [x] CI 端到端裁决通过 —— 26 commits 已推送至 origin/master（ahead=3，仅 M13.4 三 commits 待用户推送）

### 阶段治理记录

- **总投入**：26 commits（M13.1 5 + M13.2 11 + M13.3 5 + M13.4 5 + T1310 同步 5 杂项 commit）
  - 注：T1310 5 commits（`300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d`）虽与 M13 同步推进但属于 T1310 子阶段，ahead 计数不计入 M13 ahead=3；M13.4 三 commits (`8762a4b` / `bb3b49a` / `2dce01d`) 是 ahead=3 待用户推送的精确范围（git rev-list origin/master..master --count 实证）
- **测试覆盖**：+14 个 case（code-quality-fetcher.test.ts 3 + token-hints.test.ts 5 + repo-alerts.test.ts 6）；vitest 2225 passed / playwright 6 alerts-rowgroup + 2 history-dialog 全部通过
- **branches coverage**：80.17% ≥ 80% 阈值
- **审计覆盖**：T1301 quick / T1302 standard 2 轮 / T1303 quick / T1304 quick / T1305 quick / T1306 standard / T1307 standard / T1308 standard 2 轮 / T1401+T1402+T1403 standard 2 轮——全部 Pass
- **文档落盘**：
  - `docs/standards/platform.md` §7.1 新增 3 条实战细节（multisortMeta 触发条件 + Select disabled rendering + bugfix 烟雾脚本）+ §3.5 TypeORM 查询模式（find options 无嵌套路径）
  - `docs/standards/security.md` §3 新增 4 条关键 pattern（前端拦截不等于服务端安全 + better-auth admin body shape 多样 + server middleware 路径过滤快速退出 + Nuxt server middleware 4 候选方案权衡）+ §5.3.1 网络外联审计语义更新
  - `docs/standards/development.md` §5.1.12/§5.1.13/§5.1.14（TDZ 调试陷阱 + 已测试文件补测胜于新建 + OR 链触发条件精确追踪）
  - `docs/standards/ai-collaboration.md` §4.4/§4.5/§4.6（F 阶段本地验证口径差异 + Code Auditor quick depth 时长校准 + audit warning 修复决策协议）
  - `docs/standards/git.md` §3.4（reset 重做 atomic commit）
  - `docs/standards/testing.md` §6.1（Nuxt 4 payload 解析 + Playwright webServer 用 build 产物）
  - `.github/agents/full-stack-master.agent.md` 新增 PDTFC+ 自检条目（D 阶段 §3c 文档归档批次自检 + §3b TypeORM 实体索引声明硬要求）
  - `docs/guide/release.md` 平台独立通道段
  - `docs/standards/git.md` §3 + `scripts/release-publish.mjs` + `scripts/changelog.mjs`（T1310 部分 ahead 已提交）

### 关键决策

- **T1301**：wisdom 蒸馏条目选择标准——保留高频复用 / 实战类 pattern / 项目 SOP（TDZ / 已测试文件补测 / OR 链追踪 / F 阶段验证口径 / Code Auditor quick depth / audit warning 决策协议 / reset 重做），其余迁移至 standards（30 条 → docs/standards/*.md）
- **T1305**：候选方向 3（命令输出 URL 与真实外联区分）治本根因而非逐次新增白名单；stdout/stderr 文本语义上不是真实网络连接；候选方向 1/2（构建工具生态文档站类目预置白名单 / SRI 哈希钉资源）优先级降低
- **T1306**：聚合实现——原计划 SQL `GROUP_CONCAT` 子查询聚合 `affectedRunIds`，但 better-sqlite3 `:memory:` 子查询表名解析失败（"no such table: scan_result"）；改用应用层 JS 聚合（去 SQL dialect 依赖 + 测试稳定），N+1 风险可控（`.take(500)` 上限 + 应用层去重 O(n)）
- **T1309**：changelog 机制治本——参考 conventional-changelog-monorepo / lerna 标准实践 = 当 release 仅由传递依赖变更触发时，输出 `### Dependencies` 段列出依赖版本变化（社区标准答案）
- **T1307**：模块级 active config 单例 + `afterEach(resetActiveRulesConfig)` 防止测试间相互污染；`DependfixApp` 构造时按 env 加载并先 reset 后 set（避免跨 app 残留）
- **T1308**：复用 `NormalizedSecurityAlert` 模型（与 code-scanning 同源形态）；Octokit v17 类型未含 code-quality/findings 端点，使用 `client.request('GET ...', ...)` raw 端点；per-source 错误隔离（与 code-scanning 同模式，任一失败 → 记录 FETCH_FAILED + 保留成功源，全部失败才抛错）
- **T1402**：仅前端轻量展示已有 ruleId 字段，不依赖 ScanResult schema 扩展；与 [backlog.md C66-C](backlog.md) 完整版（独立 Identifiers 列 + 多 CVE 展开）解耦
- **T1403**：仅改前端默认，不改后端默认 false（保持向后兼容）；Code Auditor RG-B1 修复 dead ref + JSDoc 迁移

### 阶段关键经验（已沉淀至项目知识库）

- **wisdom 蒸馏条目选择标准**：保留高频复用 / 实战类 pattern / 项目 SOP；其余迁移至 standards；活跃条目阈值管理（14 < 15 OK，下次新增命中阈值后提示蒸馏）
- **命令输出 URL 误判治本**：stdout/stderr 字符串是文本而非真实网络连接；verification 子进程 telemetry 默认禁用避免 deny-by-default 误判
- **better-sqlite3 `:memory:` 子查询表名解析失败**：SQL `GROUP_CONCAT` 子查询在测试环境失败；改用应用层 JS 聚合（去 SQL dialect 依赖 + 测试稳定）
- **TypeORM 1.x 复合索引必须类级声明**：M13 阶段 T1307 关联 C53/C28 验证过此模式；e2e 二次运行暴露第二个仓库 500 错误
- **F 阶段本地验证口径差异**（二次复发，C65-D 12 commits 同样犯过）：F 阶段"完整验证"必须含 `pnpm run test:coverage`（全 workspace）+ 检查 4 维度是否 ≥ 阈值；CI Coverage 79.98% < 80% 教训（`e63cdb9` 修复）
- **PrimeVue 4 v-model 数据形态契约**：TypeScript 类型 vs 运行时不一致（C64 expandedPackages Record → string[] + multisortMeta）；编写 v-model 绑定时需直接看 `node_modules/primevue/<comp>/index.mjs` 内部实现，不能信类型定义

### 待迁移经验（next neat-freak 候选）

- **M13.3 T1308 fetcher 注入扩展点**：Code Quality rule.category（maintainability / reliability 等）当前未注入 NormalizedSecurityAlert；后续 fetcher 注入后可补报告 markdown 展示 category 列
- **M13.4 T1403 follow-up**：`alerts-rowgroup.e2e.test.ts:215-225` 现有 dedupe 用例在 T1403 修复后失去对「用户主动切换 off → across」的覆盖（默认即 across）；建议补 1 case 断言首屏默认请求 URL 含 `dedupe=true`
- **T1307 follow-up**：模块级 active config 单例；多个 DependfixApp 共存场景（cli 测试 / 多 batch 调度）已通过 reset 防御，未来如引入 worker pool 需考虑 per-worker config 隔离
- **T1307 follow-up**：JSON 配置格式后续支持 wildcard（如 js/*-injection）
- **T1308 follow-up**：平台 ScanRequest schema 扩展 codeQualityEnabled（当前仅展示用，未启用生产扫描）

---

## M14: platform release 通道闭环 + UX 反馈跟进（M14.1/2/3/x/y 全部已闭环）

> **归档日期**：2026-08-26
> **阶段摘要**：M13 闭环后承接 T1310 F 阶段闭环 + backlog UX-R1 扫描历史分页（用户实测反馈痛点）+ M13.4 T1403 follow-up（轻量收尾）+ neat-freak 批次治理 + 依赖批量治理。按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件需拆分）拆为 **4 子阶段独立闭环 + M14.y 依赖批量治理同步推进**：M14.1 T1310 F 阶段闭环 / M14.2 UX-R1 扫描历史分页 / M14.3 M13.4 T1403 follow-up / M14.x neat-freak 批次（wisdom 蒸馏 17>15 阈值 + C34 挂接盘点 + test 名清理 + git.md 格式修复）/ M14.y 依赖批量治理（4 个 dependabot major PR：#31 octokit/request-error 5→7 / #32 better-auth 1.6→1.7 + 新 PR #53 / #39 conventional-changelog 7→8 加 dependabot ignore / #49 PrimeVue 4→5 暂缓登记 backlog）。
> **状态**：✅ M14.1 全部完成（1 子任务 / 7 commits：T1310 ahead 5 + P 阶段规划 1 + M14.1 收口 1；ahead=0 已推送）/ ✅ M14.2 全部完成（5 commits：4 atomic commits 后端分页 + RepoHistoryDialog Paginator + 次级调用方适配 + i18n + e2e + 收口登记 + M14.2 changelog 钩子 stage 落档 1；ahead=0 已推送）/ ✅ M14.3 全部完成（1 子任务 / 2 commits：`17b5643` M14.2 changelog 钩子 stage 落档 + `5ccaaf4` M14.3 e2e + 收口登记；ahead=0 已推送）/ ✅ M14.x neat-freak 批次全部完成（4 atomic commits：wisdom 蒸馏 + C34 规范挂接 + test 名清理 + git.md 格式修复；ahead=0 已推送）/ ✅ M14.y 依赖批量治理（4 个 dependabot major PR；ahead=0 已推送）

### 阶段闭环清单

#### M14.1 T1310 F 阶段闭环 ✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1310 platform 进入 release 通道**（ahead 实施 + F 阶段闭环） | `300b318` + `1819b59` + `733e198` + `7b40a2c` + `a74d07d` + `1fd38c1` + 收口 commit | `scripts/packages.config.mjs` 新增 apps/platform 条目（`npmPublishable:false`）+ `release-publish.mjs` 新增 tag-only action + `docker.yml` 支持 workflow inputs 读 platform_version + `release.yml` 完成后触发 docker workflow_dispatch + `docs/guide/release.md` 平台独立通道文档 + dependabot 排除 `apps/platform/package.json` + F 阶段完整本地验证（lint/typecheck/test/test:coverage 4 维度全 ≥80% / verify:changelog / changelog 幂等 / release:publish --dry-run platform tag-only 路径 / @dependfix/platform build 成功） |

#### M14.2 UX-R1 扫描历史分页 ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **UX-R1 扫描历史分页**（后端 + 4 个前端调用方适配 + silent bug 修复 + e2e + i18n） | `81bd8d2` + `581e1a9` + `1a9eddf` + 收口 commit | `/api/runs` 新增 zod safeParse 校验 `page`（默认 1 / 最小 1）/ `pageSize`（默认 100 / 钳制 200）/ `repositoryId` / `ids`（逗号分隔 run id 列表）；返回结构变更为 `{items, total, page, pageSize}`；`findAndCount` 同步应用过滤；向后兼容（pageSize 缺省 = 100 既有 take 行为；items 字段既有结构不变）。前端 4 调用方适配（RepoHistoryDialog 接 PrimeVue 4 lazy + 内置 paginator + paginator-template + current-page-report-template i18n 嵌套占位符 + 跨仓库切换重置 first/pageSize + alerts.vue §openRunSidebar silent bug 修复：原 server 忽略 ids 返回全量 run → 现真正按 ids 过滤返回该告警 affected runs + repos/[id]/runs.vue 适配 + i18n `runs.paginatorInfo` 双语）。后端单测 +6 case（默认分页 / ids 过滤 / page+pageSize / pageSize 钳制 / 400 page / 400 pageSize）；e2e +1 case "Paginator 翻页验证"（seed 11 条 → 默认 pageSize=10 → NextPage → page=2 断言 URL searchParams）；既有 2/2 case 不破坏。A 阶段 standard Round 1 Reject 6 warning + 1 suggest → Round 2 quick Pass |

#### M14.3 M13.4 T1403 follow-up ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1403 follow-up 首屏默认 dedupe=across 请求 URL 断言** | `17b5643` + M14.3 e2e + 收口 commit | alerts-rowgroup.e2e.test.ts 新增 1 case `首屏默认 dedupe=across → 首次 /api/alerts 请求 URL 含 ?dedupe=true`，复用既有 MOCK_ALERTS + page.route mock 基础设施，与既有"视图切换：dedupe 模式触发 /api/alerts?dedupe=true + 显示聚合列"case 互补（手动切换路径已有覆盖，首屏默认路径此前无 case）；既有 5 active + 2 fixme case 不破坏（第 1 次 7/7 passed 32.0s + 第 2 次 7/7 passed 31.0s 幂等通过）；A 阶段 quick depth Pass（0 blocker / 0 warning / 1 suggest 注释占 4 行可读性提示） |

#### M14.x neat-freak 批次 ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **wisdom 蒸馏**（活跃 17 → 14 ≤ 15 阈值，挂接 3 条 M14.x pattern） | `92cc348` | ai-collaboration.md §2.P.1 ahead 状态动态描述原则新增子节 + §4.4 coverage 强制（hard requirement）强化 + planning.md §4.4 §5 ahead commits 实证 + 动态描述强化 + §4.4 §8 算式校对新增子节；3 条 pattern：pattern-F 阶段-coverage-强制（M13.3 CI Coverage 79.98% < 80% 教训）/ pattern-算式校对-archive-批次（M13 归档批次 24 → 26 commits 算式校对教训）/ pattern-P 阶段规划-ahead-动态描述（M14.1 P 阶段规划 commit `1fd38c1` ahead 数字写死 + T1402+T1303 typo 教训）；教训 commit 引用 `1fd38c1` / `e7103f6` / `3621982` / `e9987f9` / `0c57211` / `e63cdb9` |
| **C34 存量规范必级条款挂接盘点 + code-quality-checklist.md 双层对称补挂接** | `ea0e24f` | 5 个新必查项：分级审计协议（audit-depth）/ 单次提交审计阈值（10 文件 / 800 行）/ 验证分级矩阵（最低验证要求）/ F 阶段本地验证必须含 coverage 必查项（hard requirement）/ audit warning 修复决策协议（修复 vs 登记 backlog）；每个必查项含必查场景 + 规范参考链接 + 教训 commit 实证；按 documentation.md §4 规范单点声明原则双层对称 |
| **admin/i18n e2e C65-A1/A2/A3/A4 test 名孤立编号清理** | `84b4e1a` | admin.e2e.test.ts 3 处 + i18n.e2e.test.ts 1 处 = 共 4 处 test name 重命名（仅改 test name 字符串，断言 + mock + 测试逻辑零改动）；22 e2e passed（1.3m）行为不变；编号标记扫描 0 命中 |
| **git.md §3.4 后双空行格式修复** | `b45f55e` | git.md line 107-108 连续 2 空行 → 1 空行（markdownlint MD012 no-multiple-blanks 友好）；其他 standards 段（development / testing / security / ai-collaboration / platform / planning / documentation）扫描 0 处残留 |

### 阶段验收标准（M14.1/2/3/x/y 全部闭环 ✅）

- [x] M14.1 T1310 F 阶段闭环 —— 完整本地验证全绿（lint/typecheck 0 error / test 2230 passed + 5 skipped / test:coverage 4 维度全 ≥80% / verify:changelog exit 0 / changelog 7 段幂等 unchanged / release:publish --dry-run platform tag-only 路径确认 / @dependfix/platform build 成功 23.1 MB）
- [x] M14.2 UX-R1 扫描历史分页 —— 完整本地验证全绿（lint/typecheck 0 error / test 2236 passed + 5 skipped / coverage 4 维度 ≥80% / @dependfix/platform exec playwright test history-dialog 3/3 passed / @dependfix/platform build 成功 23.1 MB）
- [x] M14.3 M13.4 T1403 follow-up —— 完整本地验证全绿（lint/typecheck 0 error / @dependfix/platform exec playwright test alerts-rowgroup 7/7 passed 第 1 次 32.0s + 第 2 次 31.0s 幂等通过 / @dependfix/platform build 成功）
- [x] M14.x neat-freak 批次 —— 完整本地验证全绿（check:docs 99 links + 55 vue-interp OK / lint:md 0 error / typecheck 0 error / lint 0 error / @dependfix/platform exec playwright test admin i18n 22/22 passed / @dependfix/platform build 成功 23.1 MB / distill:wisdom WISDOM_OK 14 ≤ 15 阈值 / 编号标记扫描 0 命中）
- [x] M14.y 依赖批量治理（4 个 dependabot major PR）—— #31 octokit/request-error 5→7 rebase 后自动合 / #32 better-auth 1.6→1.7 + generic OAuth 重写适配已闭 + 新 PR #53 / #39 conventional-changelog 7→8 加 dependabot major ignore / #49 PrimeVue 4→5 暂缓已闭登记 [backlog.md §延期 / 暂缓项](backlog.md#延期--暂缓项)；commit `bcafa71` M14.y 依赖批量治理进度登记 + 多个 dependabot PR commits
- [x] `pnpm check:docs` 全过（实测验证 OK）

### 阶段治理记录（M14.1/2/3/x/y）

- **M14.1 总投入**：7 commits（T1310 ahead 5 commits + P 阶段规划 1 commit + M14.1 收口 1 commit）/ 1 子任务
  - 注：T1310 5 commits（`300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d`）属于 T1310 子阶段（与 M13 同步推进），ahead 计数不计入 M13 ahead=3；M14.1 ahead=1 仅 P 阶段规划 commit `1fd38c1`（`git rev-list HEAD ^origin/master --count` 实证）
- **M14.2 总投入**：5 atomic commits（后端分页 1 + RepoHistoryDialog Paginator 1 + 次级调用方 + i18n 1 + e2e + 收口登记 1 + M14.2 changelog 钩子 stage 落档 1）/ 1 子任务
  - 注：ahead commits 实证 `git rev-list HEAD ^origin/master --count` 动态核验（不写具体数字以免 staleness，详见 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md#44-大批量归档批次操作规范)）
- **M14.3 总投入**：2 atomic commits（M14.2 changelog 钩子 stage 落档 1 + M14.3 e2e + 收口登记 1）/ 1 子任务
  - 注：M14.2 changelog 钩子 commit `17b5643` 实质属 M14.2 收口衍生（husky post-commit 钩子 pnpm changelog 自动 stage），归到 M14.3 总投入统计更准确
- **测试覆盖**：vitest 2236 passed + 5 skipped（157 files，baseline 2230 + M14.2 +6 case）/ coverage 4 维度全 ≥80% 阈值
- **e2e 覆盖**：history-dialog 既有 2/2 + M14.2 新增 1/3 case；alerts-rowgroup 既有 5 active + 2 fixme + M14.3 新增 1 case 第 1 次 7/7 + 第 2 次 7/7 幂等通过
- **审计覆盖**：
  - M14.1：F 阶段收口归档未触发新增 A 阶段审计（T1310 5 commits 在 M13 阶段已通过 Review Gate 标准）
  - M14.2：A 阶段 standard Round 1 Reject 6 warning（孤立编号违规）+ 1 suggest（watch 切换仓库未重置 first/pageSize）→ Round 2 quick Pass（W1-W6 编号清理按 "带文档路径的导航指针" 例外规则 + S1 顺手修复）
  - M14.3：A 阶段 quick depth Pass（0 blocker / 0 warning / 1 suggest 注释占 4 行可读性提示）
  - M14.x：A 阶段 standard depth Pass（0 blocker / 2 warning + 1 suggest 闭环 —— W1 §1.1 1.4 文本歧义已修复为三链接分开 + W2 §2.2 第 6 类改动类型已同步规范 + S1 todo.md 计划段"2 条 pattern"差异已在收口 commit 同步更新为 3 条 + scope 扩展理由登记）
- **M14.x 总投入**：4 atomic commits（wisdom 蒸馏 1 + C34 规范挂接 1 + test 名清理 1 + git.md 格式修复 1）+ 收口 commit 1 / 1 子任务
  - 注：ahead commits 实证 `git rev-list HEAD ^origin/master --count` 动态核验（不写具体数字以免 staleness）
- **wisdom 蒸馏统计**：活跃条目 17 → 14（-18%，≤ 15 阈值达标）。3 条 M14.x 新增 pattern 挂接到 standards 权威章节，wisdom 文件本身 gitignored（不入仓库）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M14 段（本段）
  - `docs/plan/todo.md` §M14.1 [x] + §M14.2 [x] + §M14.3 [x] + §M14.x [x] + 顶部 banner 更新
  - `docs/plan/roadmap.md` M14 状态更新

### 关键决策（M14.1/2/x）

**M14.1：**

**M14.1：**
- **apps/platform 独立通道**：仿 momei 单包"独立 version + 独立 CHANGELOG"精神，适配 dependfix monorepo + docker-only 平台；`scripts/packages.config.mjs` 新增 `npmPublishable:false` 字段（缺省 true 保 5 个现有 npm 包行为 0 改动）
- **tag-only action**：当 `npmPublishable === false` 时跳过 `pnpm publish` 但仍创建 annotated git tag（changelog 历史比较需 prev tag 锚点；不打 tag → 永远孤立首段，history diff 不可用）
- **docker 与 release 触发闭环**：`release.yml` 完成后主动 `workflow_dispatch docker.yml` 传 `platform_version` 入参；`docker.yml` master 自动 push 仍走 `latest+date+sha`，不挂 version tag（保持简洁时序模型：version tag = release 完成事件 = 一次性产物）
- **dependency backflow 预期**：`apps/platform` 依赖 `@dependfix/core/engine/cli`（`workspace:*`），release:version 提升 core/engine 时 `buildDepGraph` 会让 platform 至少 patch 跟随——预期行为，无需防御
- **F 阶段本地验证口径**（[AI 协作规范 §4 修复工作流原则](../../docs/standards/ai-collaboration.md) + §4.4 F 阶段本地验证口径差异 hard requirement）：本次 F 阶段"完整验证"含 `pnpm run test:coverage`（全 workspace）+ 检查 4 维度 ≥ 阈值；CI Coverage 79.98% < 80% 二次复发风险已通过 `e63cdb9` 教训固化，本批次验证全部 ≥80%（branches 80.22% / statements 85.13% / functions 84.91% / lines 85.23%）

**M14.2：**
- **API 返回结构 `{items, total, page, pageSize}` 而非 `{data, meta}`**：保持与 [apps/platform/server/api/alerts/index.get.ts](../../apps/platform/server/api/alerts/index.get.ts) 既有风格一致（M13.2 T1306 已闭环）
- **pageSize 静默钳制 200**：zod schema `.transform(v => Math.min(v, PAGE_SIZE_MAX))` 超出自动钳制，不抛错；防止单次拉取过大影响性能；既有调用方不传 pageSize = 默认 100 行为不变
- **4 个前端调用方逐一适配**（规划盲区修订）：M14.2 规划文档列 3 个前端调用方，实施中发现 `apps/platform/app/pages/repos/[id]/runs.vue`（保留 backlog.md §C58 候选删除兼容路径）也调用 `/api/runs?repositoryId=...`，纳入 commit 3 一并适配 —— batch-runs.vue 实际不调用 `/api/runs`（BatchRun 维度与 ScanRun 维度正交）
- **silent bug 一并修复**：实施中实证 alerts.vue §openRunSidebar 此前用 `ids` 参数调用 `/api/runs`，但原 server 忽略 `ids` 返回全量 run —— M14.2 commit 1 server 加 `ids` 支持后，sidebar 真正只返回该告警 affected runs（修复 + 影响范围扩大，但低风险，scope 仍属 UX-R1）
- **pageSize 默认 10 而非 100**：RepoHistoryDialog 在 720px 宽 Dialog 内显示 7 列 DataTable，默认 pageSize=100 会出现 99 行空占位；改用 pageSize=10（DataTable 内部默认）+ options `[10, 25, 50]` + server 钳制 200 上限，三层一致
- **跨仓库切换重置 first/pageSize**：A 阶段审计 suggest#1 —— 用户从 repo A 翻到 page=3 后切换到 repo B，原实现 `first.value` 残留 30 导致 UI 高亮页与 server 数据不一致；在 watch 分支加 `first.value = 0` + `pageSize.value = 10` 重置，与 closeDialog() 对齐

**M14.x：**
- **wisdom 蒸馏阈值预警线策略**：[规划规范 §4.3](../../docs/standards/planning.md) 强制要求活跃 ≥ 20 必须蒸馏；本批次 17 条采用"预警线"策略提前蒸馏避免频繁中断（与 M13.1 T1301 / T1302 蒸馏批次参照模式一致）
- **wisdom 蒸馏 scope 扩展**（3 条 vs 计划 2 条）：原计划仅含 pattern-F 阶段-coverage-强制 + pattern-算式校对-archive-批次；实施中发现 M14.1 P 阶段规划 commit `1fd38c1` ahead 数字写死 + T1402+T1303 typo 是真实教训，由 M14.1 收口 commit `e7103f6` 修正——已超出原计划 2 条需补登记 scope 扩展（todo.md §M14.x line 269 已同步更新）
- **C34 范围控制**：仅补挂"必须级"条款（5 个新必查项），不补"建议级"——避免 checklist 膨胀
- **test 名孤立编号清理策略**：保留功能语义，重命名为业务描述（如 `test('C65-A1：自己 row 的 role Select 含 disabled（防止自我降级）')` → `test('自己 row 的 role Select 含 disabled（防止自我降级）')`）；不删除测试用例
- **git.md 双空行 vs markdownlint MD012**：git.md §3.4 后 line 107-108 连续 2 空行违反 markdownlint MD012 no-multiple-blanks；保留"§3.4 type 选择校准"作为 §3.4 子内容（不单独成节）—— 修复为 1 空行保留与 §4 章节的视觉分隔

### 阶段关键经验（已沉淀至项目知识库）

- **apps/platform docker-only 平台独立通道模式**：依赖 docker workflow 而非 npm publish 的发布单元，独立 version + 独立 CHANGELOG + tag-only action 3 件套，可被其他 monorepo 项目复用
- **`npmPublishable` 字段语义扩展**：`scripts/packages.config.mjs` 新增字段保 npmPublishable=true 缺省行为（5 个现有 npm 包 0 改动），仅显式置 false 的 platform 走 tag-only；通过字段扩展而非新分支逻辑收敛代码路径
- **F 阶段本地验证强制 coverage**（二次固化）：本次 M14.1 F 阶段验证包含完整 test:coverage 4 维度 + ahead=1 待用户推送（与 M13.3 CI Coverage 79.98% 实证教训 + [规划规范 §4.4 大批量归档批次操作规范 §算式校对](../../docs/standards/planning.md#44-大批量归档批次操作规范) 一致）
- **M14.2 silent bug fix during feature implementation**：实施中实证 alerts.vue §openRunSidebar 此前传 `ids` 但 server 不支持（silent bug），建议所有"前端用某个参数但 server 不识别"的代码路径在 feature 实施时主动 grep 实证，避免无声回归
- **M14.2 PrimeVue 4 Paginator + vue-i18n 嵌套占位符**：PrimeVue CurrentPageReport 模板用 `{first}` / `{last}` / `{totalRecords}` 占位符，vue-i18n 先做字面替换（i18n 字符串中 `{first}` → `{first}` 字面），PrimeVue 再做数值替换 —— 嵌套转义机制需保持 i18n 字符串占位符与 PrimeVue 占位符同名同结构
- **M14.x wisdom 蒸馏 scope 扩展协议**：wisdom 蒸馏批次实施时可主动扩展 scope（如 M14.x 从 2 条扩到 3 条），条件是真实 commit 教训触发（M14.1 P 阶段规划 commit `1fd38c1` ahead 数字 + typo 实证），且 todo.md 计划段同步登记 scope 扩展理由；不允许静默扩展
- **M14.x code-quality-checklist 双向同步**：checklist 必查项与 standards 条款**双层对称**（checklist 详版章节 + standards 权威声明）—— 任一方扩展另一方必须同步（如 M14.x audit 实证 §2.2 第 6 类扩展需同步 ai-collaboration.md §2.2 表 + checklist §验证分级矩阵）
- **M14.x audit warning 修复 vs 登记决策**：W1/W2 修复（低成本 + 文本歧义 + 规范扩展——属于"修复"判定）+ S1 登记 todo.md 收口 commit 处理（属于"登记 backlog"判定）。详见 [ai-collaboration.md §4.6 audit warning 修复决策协议](../../docs/standards/ai-collaboration.md) 实证

### 待迁移经验（next neat-freak 候选）

- **M14.x 已闭环**：wisdom 蒸馏（17 → 14）+ C34 挂接盘点（5 个 checklist 必查项）+ test 名清理（4 处 C65-A1/A2/A3/A4）+ git.md 格式修复（双空行）—— M14 阶段全部 4 子阶段闭环完成，下次 neat-freak 批次触发条件为 wisdom 活跃 ≥ 20 阈值（按 [规划规范 §4.3](../../docs/standards/planning.md)）
- **M14.2 silent bug fix 经验沉淀**：本次新增 1 条 M14.2 silent bug fix during feature implementation pattern 经验，建议沉淀到 `docs/standards/platform.md §3.5 TypeORM 查询模式` 或独立段
- **M14.2 PrimeVue Paginator + i18n 嵌套占位符经验**：建议沉淀到 `docs/standards/platform.md §7.1 PrimeVue 4 集成实践`
- **M14.x §3.4 type 选择校准 vs §4 章节边界**：git.md 修复双空行时保留 §3.4 子内容（type 选择校准）作为该 section 子内容，不单独成节——若未来增长可独立成 §3.5
- **T1310 follow-up**：T705（生产级部署 PG+Helm+Sentry）落地后，platform 1.0 节奏评估（已在 todo.md §M14.1 follow-up 登记）
- **T1310 follow-up**：T703（跨平台 GitLab/Bitbucket）落地后，platform release 触发的版本文档是否需要补"跨平台适配"段
- **docker `platform-<x.y.z>` tag 镜像 SBOM / provenance attestation 配合**：当前 ACR 个人版不支持，待官方支持后补

---

## M15: 扫描历史详情侧栏增强（UX-R2）（已闭环）

> **归档日期**: 2026-08-26
> **阶段摘要**: M14.2 UX-R1 闭环后承接 [backlog.md §扫描历史与详情 UX](backlog.md#扫描历史与详情-ux2026-08-26-实测反馈) UX-R2，在 alerts 去重视图中增强受影响运行 Sidebar 可辨识度——展示运行短 ID / 模式 / 严重级别阈值 / 执行器 / 告警数 / 开始时间与持续时间，按执行器显示 GitHub Action 外链；新增独立 RunDetailDialog 复用 `GET /api/runs/:id` 与 `requestSequence` 守卫。**不**触碰 `/api/runs` 后端契约、**不**动 `RepoHistoryDialog.vue`、**不**做数据层迁移 / PrimeVue 升级 / C36/C37 i18n。UX-R3（`/scans` 独立页面 + 替代 RepoHistoryDialog）属 backlog 候选（高风险，跨 5+ 文件），顺延 M16。
> **阶段边界**: M15 只实现 UX-R2，scope 严格收敛以避免阶段膨胀。
> **状态**: ✅ 全部完成（M15 1 子阶段 / 4 子任务全部闭环 / 2 轮 code-auditor quick depth Pass / ahead 部分待用户推送）

### 阶段闭环清单

#### M15.1 UX-R2 扫描历史详情侧栏增强 ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **UX-R2-A 扩展 Sidebar 运行视图**（5 列运行元数据 + utility 抽取 + i18n） | `1112017` | `alerts.vue` §RunDetailView 新增运行短 ID / 模式 / 严重级别阈值 / 执行器 / 告警数 / 开始时间与持续时间；复用既有 `/api/runs` 数据 + `requestSequence` 守卫防过期响应；空字段与缺失时间稳定降级。**`1112017` 实际包含（实证 `git show --stat`）**：① `apps/platform/app/components/RunDetailDialog.vue` 新增 279 行 + `apps/platform/app/pages/alerts.vue` 增改 97 行 + `apps/platform/app/utils/run-view.ts` 新增 47 行（5 文件 / +425/-12）；② 抽取 6 工具函数（`shortRunId` / `alertsFound` / `runModeLabel` / `runExecutorLabel` / `runThresholdLabel` / `formatRunDuration`）统一 alerts 与 RunDetailDialog 调用；③ i18n 中英文各新增 7 个 alerts 键（运行 ID / 模式 / 阈值 / 执行器 / 告警数 / 耗时 / 时长格式）+ `runs.statusDegraded` 退化文案 |
| **UX-R2-B 按执行器控制 Run URL**（条件渲染） | `1112017` | Sidebar 运行外链仅 `executorKind === 'github-action'` 且存在 `runUrl` 时显示；容器 + sandbox 隐藏内部 URL；**不**伪造内部 Run URL；既有 GitHub Action 链接保持可点击 |
| **UX-R2-C 补充详情入口**（RunDetailDialog 复用现有详情接口） | `1112017` | 同 A 段：`apps/platform/app/components/RunDetailDialog.vue`（279 行）+ 复用 `GET /api/runs/:id` 与 `requestSequence` 守卫防 stale 覆盖；失败 Error Banner 与 GitHub Action 外链独立展示；**不**在 Sidebar 内重复结果表格；加载失败与空结果不阻塞 Sidebar 列表 |
| **UX-R2-D 回归与收口**（单测 + e2e 覆盖） | `0a60e3d` | `0a60e3d` 实际仅含测试文件（实证 `git show --stat`：2 文件 / +251 行），**不**含 utility / i18n / `runs.statusDegraded`（这些均在 `1112017`）。本 D 段交付物：① `apps/platform/tests/unit/run-view.test.ts` 新增 104 行 / 16 case 单测——覆盖 6 工具函数所有分支（含 NaN / Infinity / 缺失字段 / 负时长 / 非法日期边界）；② `apps/platform/tests/e2e/alerts-sidebar.e2e.test.ts` 新增 147 行 / 2 case e2e——覆盖 Sidebar 元数据展示 + GitHub Action / 容器 URL 条件渲染 |
| **M15 P 阶段规划 + docs 切换** | `5c65177` | `todo.md` 顶部切换 M15 + `backlog.md` §扫描历史与详情 UX UX-R2 主条目状态切换 + `roadmap.md` M15 段新增 + `archive/index.md` 基线更新（M15 仅承接 UX-R2，UX-R3 顺延 M16） |

### 阶段验收标准（M15 全部闭环 ✅）

- [x] 4 子任务（UX-R2-A / -B / -C / -D）全部闭环 —— Sidebar 5 列运行元数据 + Run 外链按执行器条件渲染 + RunDetailDialog 详情入口 + i18n + 单测 + e2e
- [x] A 阶段 2 轮 code-auditor quick depth Pass（[code-auditor.agent.md §3 quick depth 协议](../../.github/agents/code-auditor.agent.md)）—— Round 1 Reject 1 blocker（B1 `alertsFound` 误用——函数签名变更未同步调用方；详 Pattern §3 同模式扫描）+ Round 2 Pass（B1 修复 + utility 抽取 + 16 case 覆盖所有分支 + 4 suggest 顺手处理：S1 `runModeLabel` 分支补测 + S2 阈值展示一致性 + S3 alerts.vue 行数 827 未触发 max-lines 规则 + S4 e2e 中文硬编码暂保留与既有 alerts-rowgroup 风格一致）
- [x] `pnpm lint` 0 error / `pnpm typecheck` 0 error
- [x] vitest 单测全过（run-view.test.ts 16 case + 既有 2128+5skip）+ coverage branches 80.12% ≥ 80% 阈值
- [x] `@dependfix/platform exec playwright test alerts-sidebar` 2/2 通过；既有 alerts-rowgroup 5 active + 2 fixme 行为不变
- [x] `pnpm run check:docs` OK（99 md links + 55 vue-interp 全过）
- [x] `pnpm i18n:audit:missing` 0 missing（中英文双语键齐全）
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] **不**修改 `/api/runs` 契约（M14.2 已闭环分页 + `ids` 过滤契约，M15 仅消费既有 contract）；**不**动 `RepoHistoryDialog.vue`；**不**扩数据层；**不**升 PrimeVue；**不**做 C36/C37 i18n

### 阶段治理记录

- **总投入**: 3 commits ahead（M15 实施：`5c65177` M15 P 阶段 docs 切换 + `1112017` M15.1 UX-R2 实施 + `0a60e3d` M15.1 回归覆盖） + 本批次归档 1 个 atomic commit（跨 5 文件）。注：`d517a7f ci: release.yml Create GitHub Release 步骤补 GH_TOKEN env` 属于 release.yml CI 修复，**不**计入 M15 总投入
- **测试覆盖**: +18 case（`run-view.test.ts` 16 case + `alerts-sidebar.e2e.test.ts` 2 case）；既有 alerts-rowgroup 7 case（5 active + 2 fixme）行为不变
- **branches coverage**: 80.12% ≥ 80% 阈值（M15 仅前端 + i18n + utility 抽取 + 单测 + e2e 改动，未触发后端 schema → 不致 Coverage 回归）
- **审计覆盖**: 2 轮独立 Review Gate quick depth Pass（Round 1 1 blocker + Round 2 0 blocker / 0 warning 新增 / 4 suggest）；按 [AI 协作规范 §1.3 分级审计执行协议](../../docs/standards/ai-collaboration.md) 选 quick depth（理由：M15 不涉及架构 / 不跨模块 / 不涉及安全敏感代码，但涉及 utility 抽取 + 跨文件调用方类型契约 → 审计不可降级到最低 depth）
- **ahead commits 实证**: `git rev-list HEAD ^origin/master --count` 当前值为 M15 实施 3 commits + release.yml CI 修复 1 commit 共 4 commits ahead；按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md#44-大批量归档批次操作规范) ahead 数字动态核验（不写死具体数字以免 staleness）
- **文档落盘**: `docs/plan/todo-archive.md` §M15 段（本段）+ `docs/plan/todo.md` 顶部 M15 任务清单 → M15 已闭环切换 + `docs/plan/roadmap.md` M15 行/段状态更新（M15 已闭环）+ `docs/plan/backlog.md` §扫描历史与详情 UX UX-R2 闭环迁出至历史归档指针段 + 文档位置速查同步 + `docs/plan/archive/index.md` 基线更新 + M15 归档批次登记
- **本次归档批次附加动作**: §2026-08-20 e2e 修复批次（C62+C63+C64+chore）从 todo-archive.md 主窗口迁出至 [archive/todo-archive-phases-m11.md §2026-08-20 e2e 修复批次](archive/todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（主窗口 700 行分片阈值前的预防性迁出，与 §2026-08-20 平台 UI 增强 C59-C61 同源——属 M11 关联批次）

### 关键决策（M15）

- **A 阶段 Quick depth 第 1 轮 Reject B1 root cause 实证**: `alertsFound` 函数签名变更未同步调用方 —— `Code Auditor quick depth` Pass 模式在 M15 小范围改动下命中 1 blocker；本批次 F 阶段本地验证虽通过，**但**审计仍捕获"实现已通过单测但调用方未对齐签名"的盲点（`pnpm typecheck` 0 error **不**捕捉 vitest mock 下的类型错误）—— 审计 depth 选择以"改动是否涉及架构 / 跨模块 / 类型契约"为准，**不**以"改动小"为降级标准
- **不修改后端契约降低风险**: M15 严格限定"消费既有 `/api/runs` 契约"不修改后端 schema —— 既有的 `alerts.vue §openRunSidebar` 调用 `/api/runs?ids=...` + `RepoHistoryDialog` Paginator + `repos/[id]/runs.vue` 等 4 调用方不破坏；M14.2 已有分页 + `ids` 过滤契约即够 UX-R2 消费
- **utility 抽取降低重复**: 实现收尾时 audit suggest 顺手抽出 6 个纯函数到 `run-view.ts`，单测 16 case 一次性覆盖所有分支；后续 M16/M17 如遇类似格式化需求可复用本 pattern（"先实现再看是否需要抽取"的反向顺序在 audit suggest 触发后采纳）
- **Sidebar 字段优先级**: 5 列选运行短 ID / 模式 / 严重级别阈值 / 执行器 / 告警数 / 开始时间 / 持续时间 —— 用户痛点：同一告警关联多次运行时 Sidebar 仅显示仓库名 + 状态，无法区分运行实例；新增字段复用既有 `/api/runs` 数据，零额外请求
- **不实现 UX-R3 scope 严格收敛**: UX-R3（`/scans` 独立页面 + 替代 RepoHistoryDialog）属 backlog 候选（高风险，跨 5+ 文件）—— M15 严格限定 UX-R2 scope 以避免阶段膨胀；UX-R3 顺延 M16 启动前需先做 §M16 P 阶段规划（按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md) 拆分子阶段）

### 阶段关键经验（已沉淀至项目知识库）

- **A 阶段 quick depth 在小改动下仍命中 blocker**: M15 改动范围小（alerts.vue + RunDetailDialog + run-view.ts + tests）但 audit quick depth Round 1 Reject 1 blocker（B1 `alertsFound`）—— 审计 depth 选择**不**以改动大小为降级标准，改以"是否涉及架构 / 跨模块 / 类型契约"为准。本批次改动虽小但涉及 utility 抽取 + 跨文件调用方，audit depth 不可降级
- **utility 抽取 vs 实现优先 reverse pattern**: 本批次 audit suggest 顺手抽出 run-view.ts 6 函数（原计划仅实现）—— 说明"先实现再看是否需要抽取"在 audit suggest 触发后可采纳，与 M14.x `test 名孤立编号清理` 同模式（audit suggest 触发顺手处理）
- **`pnpm typecheck` 不捕捉 vitest mock 下类型错误**: A 阶段 B1 命中根因 —— vitest `vi.mock` 可能跳过部分类型检查路径，F 阶段本地验证 `typecheck 0 error` **不**是 audit 替代；audit depth 选择仍需 standard 或 quick + audit agent 独立核验
- **退化 / 边界稳定 design pattern**: 空字段降级（`run.shortId` 缺失不显示 ID cell 而非 `undefined`）+ 加载失败 / 空结果不阻塞 Sidebar 列表 —— 长尾运行数据缺失场景用户体验稳定；建议沉淀到 `docs/standards/platform.md`（待 neat-freak 批次）
- **新增 utility 单测一次性覆盖所有分支**: 抽取 6 函数后单测 16 case 一次到位（不依赖"先测一两个 case 再补"）—— audit S1 suggest 顺手补 `runModeLabel` 分支覆盖即是审计+开发的近距离协作案例

### 待迁移经验（next neat-freak 候选）

- **运行元数据展示一致性**: Sidebar 5 列 + RowGroup 显示的 run 状态/告警数应在 dashboard / batch-runs 也保持一致格式 —— 当前 `alerts.vue` Sidebar 字段格式若与 `batch-runs.vue` 不一致会触发 UX 反馈；建议下次 neat-freak 批次统一抽出 `run-view.ts` 共用（batch-runs 同步抽取）
- **e2e 中文硬编码 vs i18n 决策**: A 阶段 audit S4 暂保留 `alerts-sidebar.e2e.test.ts` 中文硬编码（与既有 alerts-rowgroup 风格一致）—— 项目级 e2e 中文 vs i18n 决策待下次 neat-freak 统一（i18n e2e 维护成本 vs 稳定性收益评估）
- **run-view.ts 抽取 spread 到其他页面**: 当前 utility 仅供 `alerts.vue` 使用 —— `batch-runs.vue` / `repos/[id]/runs.vue` / `RunDetailDialog.vue` 未来如有类似格式化需求可参考本批次抽取模式；建议作为"action: 观察下次相关需求出现"
- **UX-R3 上收时机**: backlog UX-R3（`/scans` 独立页面 + 替代 RepoHistoryDialog）属候选（高风险 / 5+ 文件）—— M16 启动时建议先做 P 阶段规划拆分子阶段（M16.1 summary API + M16.2 页面骨架 + M16.3 RepoHistoryDialog 迁移）

---

## M12: 平台 UX 一致性 + i18n 治理（已闭环）

> **归档日期**：2026-08-25（commit 历史回溯 2026-08-21）
> **阶段摘要**：M11 闭环后承接 2026-08-21 用户实测反馈 10 项平台 UX / 安全 / i18n 问题，按 §1.1 ≤ 5-6 项硬上限拆 4 子批次独立实施。**所有 19 commits 已推送至 origin/master**（C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2）。
> **状态**：✅ 全部完成

### 阶段闭环清单

| 子任务 | 关键 commit | 状态 | 备注 |
|:--|:--|:--:|:--|
| **C65-A1** admin 禁止对自己 setRole（前端 UI 层） | `1d7c5c8` | ✅ | 6 文件 / +81/-1 行；`isSelfTarget` 独立可测 + 6 vitest 用例；admin e2e 断言 self row `aria-disabled="true"` / other row `aria-disabled="false"` |
| **C65-A2** 角色名称国际化 | `2076fda` | ✅ | 4 文件 / +37/-6 行；ROLES computed 化 + roleLabel 同源切换；i18n e2e 双语断言 |
| **C65-A3** 服务端强制拦截 admin 自修改 | `b10e270` | ✅ | 2 文件 / +331 行；Nuxt server middleware 拦截 5 端点（set-role / ban-user / remove-user / impersonate-user / **update-user**）+ 双层防护（self-target + last-admin guard）；错误码提取为常量 |
| **C65-A4** update-user 端点覆盖（防 W-1 绕过） | 合入 `b10e270` | ✅ | audit round 1 W-1 检出 update-user 端点绕过 → 修复合入 C65-A3 同 commit |
| **C65-B1** i18n 配置统一来源 | `789ed2f` | ✅ | 4 文件 / +86/-27 行；双文件拆分根因：`defineI18nConfig` 是 jiti 顶层 import 不可见的运行时全局（实测 ReferenceError）→ 物理拆分 `nuxt-i18n-config.ts`（jiti 安全）+ `i18n.config.ts`（vue-i18n 运行时，Nuxt transform pipeline 加载）；`as const` 锁定字面量类型避免 spread 宽化 |
| standards check:docs 列入 review 必查项 | `781cbc6` | ✅ | 1 文件；把 `pnpm run check:docs` 列入 A 阶段 review 必查项 + 触发条件 diff 含 `docs/**/*.md` |
| **C65-C1** cron 表达式预览 | `5dff002`（合入） | ✅ | 3 文件新增 + 4 文件修改 +377/-3 行；**决策**：方案 B 自实现（0 新增依赖，复用 cron-parser next()）；cronstrue 实测 unpackedSize 1.23MB（todo.md 估 ~10KB gzip 严重偏差）+ cronstrue-i18n 不存在于 npm registry；3 文件新增 = utils + test + e2e |
| **C65-C2** 时区选择框 | `5dff002`（合入） | ✅ | 合并入 C65-C1 同 commit（共享 timezoneOptions + browserTimezone reactive state）；`Intl.supportedValuesOf('timeZone')` ~600 项 + 浏览器时区首位 + 旧 Node 不可用兜底 6 项 |
| **C65-D1** env-events 表格 sortable（补全 C60） | `348502d` | ✅ | 5 文件 / +179/-7 行；6 列（type/severity/repository/message/notified/createdAt）removable-sort 三态；独立 ENV_EVENT_SEVERITY_RANK 常量避免与 alerts SEVERITY_RANK 值集污染 sort 字段；单测 8 + e2e 3 |
| **C65-D2** alerts 双 chevron 修复 | `132b944` | ✅ | 2 文件 / +20/-12 行；删除自定义 chevron + 简化 `<span>` 交互 + 保留整体可点击 + 键盘 enter/space + :aria-expanded（audit W2 修复方案 A）；e2e 新增 1 用例断言 `i.alerts__group-toggle` count = 0 防回归 |
| **C65-D3** alerts 视图切换（按包 / 按项目 / 原始） | `374a278` | ✅ | 6 文件 / +277/-32 行；后端 TypeORM find options → QueryBuilder 重构（1.x find options order 不支持嵌套路径 scanRun.repository.owner，行为等价）；前端 Select 三选一 + 动态 DataTable 属性 + viewMode='none' 不传 groupBy + 切换重置 multiSortMeta + expandedPackages；C64 rowGroup hydration known-issue 保持 fixme |
| **C65-D4** alerts 图表与仪表盘去重 | `ad6ce70` | ✅ | 2 文件 / +24/-242 行（净 -218）；决策直接删除顶部 3 图区块（severity 饼图 + fixRate 环形 + Top-10 柱状图）+ 卸载 useDashboardStats + 删除 charts 相关 SCSS ~100 行；e2e 删除 2 用例 + 新增 1 个去重断言用例 |
| todo.md C65-D 收口 | `8601c15` | ✅ | todo.md M12 段 9 子任务全部 [x] 闭环 + 阶段状态 banner |
| todo.md C65-A 收口 | `84bc83e` + `4de796b` | ✅ | 2 个独立收口 commit |
| todo.md C65-B 收口 | `4d8f164` | ✅ | C65-B1 闭环收口 |
| todo.md C65-C 收口 | `9100bac` | ✅ | C65-C1/C2 闭环收口 |
| CI 修复 batch-runs/[id].get 分支补测 | `0c57211` | ✅ | branches 79.88% → 80.02%（+8 分支），目标文件 55.17% → 82.75%（+27.58%）；3 个定向 case 覆盖 line 36/45-49/50/58/65 全部未命中分支 |
| CI 修复 test/e2e 不稳定断言 | `4043918` | ✅ | 修复 CI 间歇性断言失败 |
| engine network-audit 默认白名单追加 rolldown.rs | `2104b9f` | ✅ | 临时修复 vite 6/7 跨 major 升级 verification 输出 URL 被 deny-by-default 拦截 |
| docs backlog 登记 network-audit 默认白名单持续扩展问题 | `0eb8704` | ✅ | 治本方案设计登记 backlog G1 行 |

### 阶段验收标准（全部闭环 ✅）

- [x] 4 个子批次全部独立闭环（每个 ≥ 1 Review Gate Pass）—— A1/A3/B1/C1/C2/D1/D2/D3/D4 共 9 轮 audit Pass（quick / standard）
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error（仅 1 pre-existing mailer warning）
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— vitest 705 passed + 4 skipped / playwright 22 baseline + C65-D 7 new case
- [x] branches 覆盖率维持 ≥ 80% —— 79.88% → 80.02%（CI 阈值回归修复后）；目标文件 [id].get.ts 82.75%
- [x] `pnpm check:docs` 全过 —— 95 md links + 55 md vue-interp OK（standards/platform.md §7.2 新增 i18n 单点声明条款）
- [x] 用户实测反馈 10 项全部闭环 —— #1-#10 全部转 C65-A/B/C/D 4 子批次闭环（#8 单 admin 不得降级登记 backlog 远期，需后端事务级 admin 计数校验，独立批次）
- [x] CI 端到端裁决通过 —— 所有 commits 推送至 origin/master + Coverage job branches ≥ 80%

### 阶段治理记录

- **总投入**：19 commits（C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2；todo.md 收口 5 commits 已含在 C65-A/B/C/D 子批次计数内）；总变更 ~60 文件跨 platform / engine / packages / docs / standards
- **测试覆盖**：vitest +705（含 C65-A 6 + C65-C 10 + C65-D 8+4 vitest case）/ playwright 22 baseline + 7 new case（C65-D sortable env-events 3 + alerts-rowgroup 4）；全部推送前 lint + typecheck + test:coverage（CI 修复后）
- **审计覆盖**：9 轮独立 Review Gate（C65-A1 quick / C65-A3 standard / C65-B1 quick / C65-C standard 2 轮 / C65-D1 quick / C65-D2 quick / C65-D3 standard / C65-D4 quick + CI 修复 quick）—— 全部 Pass
- **文档落盘**：`docs/standards/platform.md` §7.2 新增 i18n 单点声明条款（jiti 加载边界 + 双文件拆分根因 + as const 字面量锁定）；`docs/standards/development.md` §3 注释规范（同模式扫描第 2 轮验证生效）；`docs/standards/git.md` §3 提交规范（F 阶段本地验证口径差异教训）
- **关键决策**：
  - C65-A3 → 纵深防御模型 = 前端拦截 + 服务端强制（前端拦截 ≠ 服务端安全，devtools / 恶意客户端可绕过）；Nuxt server middleware 实现 5 端点拦截 + 双层防护
  - C65-B1 → 双文件拆分根因（jiti vs Nuxt transform pipeline 运行时全局可见性差异，物理拆分承载运行时全局调用的配置与纯字面量导出配置）
  - C65-C1 → 自实现预览（0 新增依赖，复用 cron-parser 已装的成熟 next()）；cronstrue 实测偏差拒绝引入
  - C65-D3 → TypeORM 1.x find options order 不支持嵌套路径 → 全部走 QueryBuilder（统一代码路径 + 行为等价）
  - C65-D4 → 删除 vs 差异化决策：选删除（最简 + 与 dashboard 完全去重 + alerts 聚焦表格）；差异化（按 alerts 实时过滤聚合）工作量大且 C64 known-issue 存在

### 阶段关键经验（已沉淀至项目知识库）

- **前端拦截不等于服务端安全**：任何"防自修改 / 防越权 / 防 XSS / 防 CSRF"必须服务端兜底；better-auth adminMiddleware 仅校验权限不校验 self-target，是已知 gap。纵深防御 = 前端拦截 + 服务端强制
- **jiti vs Nuxt transform pipeline**：`nuxt.config.ts` 顶层 import 走 jiti（无 transform pipeline），@nuxtjs/i18n 等 Nuxt 模块通过 addImports 注入的运行时全局在 jiti evaluate 模块顶层时不可用 → `ReferenceError`。任何被 nuxt.config.ts 顶层 import 的模块都不能在模块体顶层调用这种 Nuxt 模块注入的运行时全局，否则 typecheck 阶段 `loadNuxt` 立即失败
- **TypeORM 1.x 复合索引必须类级声明**：列级 `@Index(['col1', 'col2'])` 会生成仅含末列的单列索引；e2e 二次运行会暴露第二个仓库的 500 错误（教训见经验 §三十）
- **TypeORM find options 不支持嵌套路径 order by**：1.x `find({ order: { 'scanRun.repository.owner': 'ASC' } })` 抛 `EntityPropertyNotFoundError`；必须用 QueryBuilder（`createQueryBuilder().leftJoinAndSelect().orderBy()`）；本批次 C65-D3 把整个 `find()` 调用统一替换为 QueryBuilder，简化代码路径
- **§3 同模式扫描必须全 diff 扩展**：违规修复时仅清理声明范围内的违规会漏掉同模式新增（经验 §十六 + §十七 + §三十九）。修复模式：以"违规类型"为锚点扫描全 diff（包括新增 untracked 文件 + `<style>` 块注释 + test/it 名 + JSDoc），而非以"已声明范围"扫描
- **F 阶段本地验证口径差异**：`pnpm --filter <pkg> test`（仅特定包）≠ CI 跑 `pnpm test` 全 workspace + coverage 4 维度。本批次 C65-D 12 commits 推送后 CI Coverage job 失败（branches 79.88% < 80%）根因即此。**修复协议**：F 阶段"完整验证"必须含 `pnpm run test:coverage`（全 workspace）+ 检查 4 维度是否 ≥ 阈值，而非仅 `pnpm --filter @dependfix/platform test`。**CI 通过 = 最终裁决，本地通过 ≠ 完成**
- **OR 链触发条件精确追踪**：statusWriteBack=false 仍可能因 count diff 进入写回块（`batch-runs/[id].get.ts` 案例）；CI 阈值回归优先在已有测试文件加 case，不新建文件
- **Code Auditor quick depth 实测用时校准**：C65-D1 ~50s / CI 修复 ~79s，远低于 5min 时间盒；快速 depth 与 standard depth 决策应基于"是否涉及架构 / 跨模块 / 安全性"而非用时顾虑

### 待迁移经验（next neat-freak 候选）

- **C53-后-A/B/C**（M11 推进批次，C53 衍生 P2/P3 子任务）已全部闭环（931b5b7 / bfecf6a / 5d7ee97）
- **wisdom 蒸馏批次**（P3）：本阶段新增 7 条 → 18 活跃，距 20 阈值仍有空间，下次 neat-freak 处理
- **历史 C65 test 名孤立编号清理**：audit W3 同模式扫描发现 admin/i18n e2e C65-A1/A2/A3/A4 test 名孤立编号违规（不在 C65-D diff 范围），下次 neat-freak 批次统一清理
- **D2-S1 PrimeVue rowToggleButton aria-expanded**：Pass-through 不传 context（含 expanded 状态），低成本 dynamic 实现不可行；待 PrimeVue 升级到修复版本或迁移 alerts 加载到 useAsyncData 让 SSR 阶段就有数据
- **D3 suggest-2 viewMode 快速切换请求竞态**：低概率 UI 闪一下旧数据；可在 fetchAlerts 顶部维护 lastRequestId + 响应时丢弃过期 id；本次 PR 范围外

### 文档位置速查

- 4 子批次任务拆解背景 + 启动顺序 + 验收要点：原 backlog.md §2026-08-21 平台 UX 反馈批次评估（C65 待启动）段已清理（2026-08-25 neat-freak 归档批次）
- 阶段总体规划（依赖图 / 推荐启动顺序 / 子批次规划详情）：原 backlog.md §M12 平台 UX 一致性 + i18n 治理（待启动）段已清理（2026-08-25 neat-freak 归档批次）
- 实施记录 / commit 引用 / 验证矩阵：本文档 §M12 段（详见上方闭环清单 + 治理记录 + 关键经验）

---

---


## M8: 安全加固与容器执行完备（已归档 → 迁出至分片）

> **2026-08-20 neat-freak 归档批次迁出**：M8 段已迁至 [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8），不再在 todo-archive.md 主窗口保留。本条仅保留导航指针。
>
> **原始背景**：M8 阶段 6 任务（T801-T806）由 C38-C45 治理项驱动，20 个提交本地待推送。详见分片文档。

---


## C53: 平台集成模式 fix 修复结果推送远程（已归档）

> **归档日期**: 2026-08-20
> **归档方式**: 实施 3 commits（`83ec736` / `46b7c15` / `3ed8303`）+ 3 轮 Review Gate 全部 Pass；M11 启动任务，登记 [todo-archive.md §M11 推进批次](todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) 后续 P3 子任务
> **阶段摘要**: 闭环 M6 阶段"修复结果仅在本地临时目录"问题——A 模式（`ContainerExecutor`）fix / fix-and-pr 完成后新增推送修复分支到远程 + 创建 PR 两条链路，引入 `pr_creation_failed` 错误码 + 状态机 dispatched 语义 + workDir 保留 24h 供诊断
> **状态**: ✅ 全部完成（C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序）

**批次成果**: 平台 A 模式执行链路完整闭环——修复结果通过 pushFixBranch + createPrForFix 落到远程真实分支/PR，与 B 模式（GitHub Action）形成完整执行后端矩阵。引入 §8.2 状态机扩展（`pr_creation_failed → dispatched`）与 B 模式 `run_url_not_resolved` 语义对齐。

### C53-1: 容器内 push 链路 ✅

- **交付物**: `apps/platform/server/services/executor/container-executor.ts` + `container-executor-push.test.ts` + `scan-orchestrator.service.ts` + `scan-orchestrator.test.ts`
- **实现内容**:
  - 模块级 export `extractBranchName(workDir)`（`git rev-parse --abbrev-ref HEAD`，detached HEAD 抛错）
  - 模块级 export `pushFixBranch(branch, workDir, token?)`（`git push origin <branch>`，token 走 `http.extraheader` base64 basic auth，避免进 argv/URL）
  - `execute()` 在 `app.run()` 成功后对 `fix` / `fix-and-pr` 模式调 push；push 失败归类 `push_failed`
  - `scan-orchestrator` A 模式分支捕获 `runUrl` 落库（与 B 模式对齐）
- **关键 commit**: `83ec736` feat(platform): A 模式 ContainerExecutor 推送修复分支到远程（4 files +215 lines）
- **完成定义**: 7 个 push 单元测试（extractBranchName × 3 + pushFixBranch × 4）+ 2 个 A 模式 runUrl 集成测试
- **审计**: 2 轮 standard Pass with Warning（Round 1 RG-B01 blocker：orchestrator 缺 runUrl 捕获 → 修复 + 2 补强测试；Round 2 RG-W04 拼写错误修复）

### C53-2: PR 创建 + 状态机扩展 ✅

- **交付物**: `apps/platform/server/services/executor/container-executor.ts` + `container-executor-pr.test.ts` + `scan-run-state.ts` + `scan-run-state.test.ts` + `scan-orchestrator.test.ts` + `packages/engine/src/app/index.ts`（re-export）
- **实现内容**:
  - 模块级 export `createPrForFix(result, owner, name, branch, token)` 复用引擎 `createGitHubClient` + `createPullRequest` + `generatePRBody` + `buildPrTitle` + `fetchDefaultBranch` 五个函数
  - `execute()` 在 push 成功后对 `fix-and-pr` 模式调 PR 创建；PR 失败归类 `pr_creation_failed`
  - `runUrl` 兜底为 branch URL（PR 失败时仍可显示供用户手动开 PR）
  - 状态机扩展：`resolveScanRunState('container', { code: 'pr_creation_failed' }, undefined)` → `dispatched` + `errorJson`（与 B 模式对齐）
  - 引擎侧 `packages/engine/src/app/index.ts` 新增 re-export `buildPrTitle` + `fetchDefaultBranch`（之前未对外暴露）
- **关键 commit**: `46b7c15` feat(platform): A 模式 ContainerExecutor 创建 PR + 状态机 dispatched（6 files +261 lines，跨 2 包）
- **完成定义**: 4 个 PR 单元测试（mock engine 按需精确替换）+ 5 个 A 模式状态机 case + 1 个 A 模式 orchestrator 集成 case
- **审计**: 1 轮 standard Pass（2 warning：RG-W1 注释误导修复 / RG-W2 sanitizeErrorMessage 不覆盖 `Authorization: token xxx` 既有缺陷，登记后续 patch）

### C53-3: 清理时序（workDir 保留 24h + 远程分支清理工具）✅

- **交付物**: `apps/platform/server/services/executor/container-executor.ts` + `container-executor-cleanup.test.ts`
- **实现内容**:
  - 模块级 export `moveToPending(workDir, runId, pendingRoot, retentionMs=24h)`：移动 workDir 到 `_pending/{runId}/` + 写 `.meta.json`（含 `writtenAt` / `retentionMs` / `expiresAt` / `reason` 字段）
  - 模块级 export `cleanupRemoteBranch(branch, workDir, token?)`：best-effort 远程分支清理（失败静默）
  - `execute()` 在 push 成功 + PR 失败路径：先 `moveToPending` 保留 24h，再 return `pr_creation_failed`
  - runId 路径穿越防御（白名单 `[A-Za-z0-9_-]+`）
  - 设计选择：PR 失败保留远程分支（用户可手动开 PR），`cleanupRemoteBranch` 当前不主动调用
- **关键 commit**: `3ed8303` feat(platform): A 模式 PR 失败时保留 workDir 24h + 远程分支清理工具（2 files +222 lines）
- **完成定义**: 4 个 moveToPending 单元测试（real fs / 临时目录）+ 3 个 cleanupRemoteBranch 单元测试（mock child_process）
- **审计**: 1 轮 standard Pass（3 warning 登记后续 P3 patch：集成测试缺失 / stale-cleanup 任务缺失 / metadata 写入失败一致性）

### C53 阶段治理记录

- **提交序列**: C53-1 (`83ec736`) → C53-2 (`46b7c15`) → C53-3 (`3ed8303`) 共 3 commits（M11 启动任务）
- **总变更**: 5 新增 + 5 修改 = 10 文件 +898 行（跨 2 包：apps/platform + packages/engine）
- **审计覆盖**: 3 轮独立 Review Gate（C53-1 2 轮 + C53-2 1 轮 + C53-3 1 轮）；所有轮次 Pass with Warning（warning 全部登记后续 patch）
- **关联升级**: 13 条修复执行安全基线（[security.md §5.3 修复执行安全](../standards/security.md)）全过；新增 §5.4 凭据权限阶（A 模式 fit-and-pr 需要 wide-scope PAT / B 模式推荐）+ §5.5 凭据加密存储（C28 + T912-3 联动）

### C53 经验沉淀

- **vitest mock + `util.promisify` 兼容**：mock execFile 必须在 `vi.hoisted` 内部设置 `Symbol.for('nodejs.util.promisify.custom')` 标记为 Promise 风格，否则 `promisify(execFile)` 包装时插入 callback 期望导致 mock 永不触发 → 测试 timeout
- **跨包 import 阻塞 typecheck**：引擎 `app/index.ts` 此前未 re-export `buildPrTitle` / `fetchDefaultBranch`，平台 import 报 TS2305；要在引擎侧 re-export（1 处侵入）而非在平台内内联（破坏 DRY）
- **状态机扩展与 B 模式对齐**：`pr_creation_failed` 命名与 B 模式 `result_fetch_failed` / `run_url_not_resolved` 保持一致，方便上层 UI 通用 dispatched 提示；同步避免新创错误码带来的认知负担
- **runUrl 兜底为 branch URL**：PR 失败时保留远程分支（用户可手动开 PR），UI 仍能跳转查看修复产物；这是平台 A 模式相对 B 模式的关键体验差异——B 模式是 GitHub 托管 runner 上自动开 PR，A 模式需要用户在 UI 提示下手动开 PR

### C53 衍生子任务（已在 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md) §M11 推进批次 详细闭环）

- C53-后-A stale-cleanup 任务（_pending 24h 清理）
- C53-后-B sanitizeErrorMessage 补充 `Authorization: token xxx` 模式
- C53-后-C A 模式 dispatched UI 提示（手动开 PR）

---

## M10: 独立沙箱容器 C26 实施规划（已归档）

> **归档日期**: 2026-08-20
> **阶段摘要**: 兑现沙箱治理决议 G5——Docker rootless runtime + 应用层白名单代理 + cgroup v2 资源限制 + Node 20 自动识别；`SandboxExecutor` 与 `ContainerExecutor` 并存；自托管 docker-compose 优先 / K8s+Helm 仅规划
> **状态**: ✅ 全部完成（T1001 B1+B2 + T1002 + T1003 + T1004 全部 commit + Review Gate Pass；13 commits + T912 主体同步归档）

**批次成果**: Docker rootless runtime + RuntimeAdapter 抽象层（B1 commit `b189aaa` `a07f577` + B2 commit `b6083a7`）+ 出站白名单拦截代理（commit `c68029a` `9da2421`，Review Gate 2 轮 Pass）+ cgroup v2 资源限制（commit `a85fb03` `32658e7`，Review Gate 1 轮 Pass）+ 文档收口 + 治理决议更新（commit `5ae5165` `e48b097` `06377b2` `b289668`，Review Gate 2 轮 Pass）。共 13 commits。

**设计文档落盘**: [executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计)（§7.1 RuntimeAdapter 抽象 + §7.2 镜像策略 + §7.3 部署形态 + §7.4 与 ContainerExecutor 并存 + §7.5 K8s+Helm 部署预留 + §7.6 验收对照 + §7.7 设计反例）；[sandbox-security-governance.md §5 G5 升级](../design/governance/sandbox-security-governance.md#5-治理决议与登记) 为"实施规划已就绪" + [§7 验收段补 M10 4 子任务验收方式](../design/governance/sandbox-security-governance.md#7-验收与持续治理)；[quick-start.md §启用 rootless sandbox 执行](../guide/quick-start.md) docker rootless daemon 启动指引子段（67 行 / 5 项前置 + 5 步指引 + 3 条反模式绝对禁止）。

**M10 移交下一阶段候选（已全部闭环）**: **T1005 sandbox 路由接线** —— commit `0ea8149` / `5542e33` / `b6bce6c` / `64135ed` / `809aa3b`，5 commits；**C28 security.md §凭据加密存储章节补齐** —— commit `fcef918`；**branches 阈值恢复 80% 冲刺** —— 已完成（branches 80.32% → 80.49%）。

---

## T912: SMTP 邮件发送器主体收口（T912-3 → C28 联动）

> **归档日期**: 2026-08-20
> **阶段摘要**: 兑现 `auth.ts` 三处空回调（sendVerificationEmail / sendResetPassword / sendChangeEmailConfirmation）→ 引入 nodemailer + mailer service 三层降级（transport 未配置 → noop / 失败 → fail-closed）+ i18n 双语邮件模板 + coverage 回归修复
> **状态**: ✅ 主体全部完成（T912-1 mailer service 模块 + T912-2 三回调接线 + T912 coverage 回归修复；T912-3 安全与文档已合并入 C28）

**批次成果**: 引入 nodemailer + 自实现 mailer service（apps/platform/server/services/mailer/）—— transport.ts（SMTP 连接 + 测试环境 noop）+ templates.ts（en-US/zh-CN 双语 + inline style 邮件客户端兼容）+ index.ts（sendMail + sendTemplateMail + MailerError + fail-closed 语义）。T912-3 邮件发送安全（[security.md §5.3 修复执行安全](../standards/security.md)）已合并入 **C28 security.md §凭据加密存储章节补齐**（commit `fcef918`）。

**关键 commit**: `edc9c94` mailer service 模块 + `6f00937` 三回调接线 + `6e28207` coverage 回归修复。

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
- **历史教训**（已迁移至 [平台规范 §7.1](../standards/platform.md)，对应 8d02cce wisdom 蒸馏批次）:
  - C61-1 PrimeVue 4 sortable 用 `data-p-sortable-column` 属性（CSS class 已废弃）
  - C61-2 PrimeVue 4 `<Chart>` 内部用 `chart.js/auto` ~200KB 全量（vs 自实现 ChartCanvas 40 KB gzip）

### 阶段治理记录

- **提交序列**: C59 (`9949504` → `03ba3b2`) → C60 (`a1d5bd9` → `532ea78` → `6b994b5` → `5bba3f4` → `5fbad71`) → C61 (`ffacfca` → `5abd914` → `402dc03` + `5bba3f4` + `5fbad71`) 共 10 commits 待推送
- **审计覆盖**: C59 1 轮 audit-quick Pass；C60+C61 audit-standard 第 1 轮 Reject (9 blocker + 5 warning) → 全部修复 → 第 2 轮 audit-quick Pass + V 阶段 ui-validator Conditional 768px 已修复
- **关联**: C60 + C61 同批启动但独立 PR 决策；与 M10 cgroup 资源限制（T1003）/ C61 chart 引入是无关路径；C58 alerts.vue 同类图表已登记 backlog
- **历史教训**: W13 Nuxt e2e webServer 缓存（修改 .vue 后必须 rebuild）；C61 选用自实现 ChartCanvas 而非 PrimeVue wrapper 是 tree-shakable 原则的具体实践

---

## 2026-08-20 M11 推进批次（业务可见性 + 沙箱落地 + 安全文档 + 通知基建）

> **归档日期**: 2026-08-20
> **阶段摘要**: C53 闭环触发 M11 启动 → 三方面子任务全部闭环：
> 1. **业务可见性 + UX**：C53-后-A/B/C（C53 衍生 P2/P3）+ C56/C57（批量扫描 + 扫描历史 UX 小修）
> 2. **沙箱落地**：T1005-A/B/C/D（sandbox 路由接线 4 子任务 + degraded 状态机 + 仓库级 sandboxLimits）
> 3. **安全文档**：C28（security.md §凭据加密存储章节补齐 + 凭据权限阶）
> 4. **通知基建**：C-ENV-CHANGE-ALERT（环境容器变化告警——audit_event 表 + NotificationChannel 接口 + Email 实现 + scan-orchestrator 触发 + env-events UI）
> 5. **告警可视化**：C58（alerts 按包聚合 + 图表卡片复用 C61）
> **状态**: ✅ 全部完成（22 commits 总投入：M11 推进批次 12 commits + 此前 M11 启动批次 10 commits）
> **详细归档**: 见 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)

### M11 推进批次摘要

**子任务闭环清单**（详细实现与 commit 见分片文档）：

| 子任务 | 优先级 | 关键 commit | 完成要点 |
|:--|:--:|:--|:--|
| C53-后-A stale-cleanup | P2 | `931b5b7` | nitro plugin 周期清理 `_pending/` workDir + 7 个真实 fs 测试 |
| C53-后-B sanitizeErrorMessage | P3 | `bfecf6a` | 正则扩展 basic/token/Bearer 三 scheme + 6 个测试 |
| C53-后-C dispatched UI 提示 | P3 | `5d7ee97` | i18n 双键 + runs.vue/batch-runs.vue 条件渲染 pr_creation_failed 提示 |
| T1005-A sandbox UI 选项 | P1 | `0ea8149` | Dropdown + i18n 双语 + executorKind 类型扩展 |
| T1005-B sandboxLimits 透传 | P2 | `5542e33` / `b6bce6c` | B1 实体+schema+zod（11 测试）+ B2 orchestrator 透传（16 测试） |
| T1005-C degraded 状态机 | P1 | `64135ed` | degraded 分支实现 + degradedCount + 14 个断言 |
| T1005-D quick-start 同步 | P2 | `809aa3b` | 移除过时警告 + G5 行更新 |
| C28 凭据加密存储章节 | P2 | `fcef918` | §5.5 算法契约 + 密钥派生 + fail-closed + 密钥轮换边界 |
| C56 批量扫描 Dialog 乐观关闭 | P3 | `cda5b90` | 提交前 batchDialogVisible=false + 失败回滚 |
| C57 扫描历史返回列表按钮 | P3 | `cda5b90` | RepoHistoryDialog header slot pi-arrow-left |
| **C58 告警聚合 + 图表** | P3 | `a562ab2` / `5bb0f96` | useDashboardStats composable + dashboard-charts helper（27 测试）+ alerts 顶部 3 图表 + rowGroup + expandableRowGroups + 4 e2e |
| **C-ENV-CHANGE-ALERT 环境告警** | P3 | 6 commits `aeee3f0`/`f57683e`/`15f1c9a`/`3f4653f`/`64f005e`/`f678196` | audit_event 表 + 类级复合索引 + SQLite migration + NotificationChannel 接口 + Email + Slack/Webhook Stub + 邮件模板双语 + scan-orchestrator A/B 触发 + env-events UI + 权限防护 + 11 e2e |

### M11 阶段治理记录

- **总变更**: 22 commits（C58 + C-ENV-CHANGE-ALERT 12 commits + 此前 M11 启动批次 10 commits）
- **测试覆盖**: +56 新测试 = 681 tests pass
- **branches coverage**: 80.49% ≥ 80% 阈值
- **审计覆盖**:
  - C58 + C-ENV-CHANGE-ALERT：2 轮深度 standard Pass（第 1 轮 Reject 9 blocker + warning → 全部修复 → 第 2 轮 Pass）
  - C53-后 / T1005 / C28 / C56 / C57：quick Pass / standard Pass 各自
- **文档落盘**: `docs/standards/security.md` §5.4 + §5.5 / `docs/design/governance/executor-sandbox.md` §7.8 / `docs/guide/quick-start.md` 同步
- **关键经验**（已迁移至 docs/standards/）:
  - **TypeORM 1.x 复合索引必须类级声明**：列级 `@Index(['col1', 'col2'])` 会生成仅含末列的单列索引；e2e 二次运行会暴露第二个仓库的 500 错误
  - **PrimeVue 4 rowGroup 模式**：必须预排序 + `sortMode="multiple"` + `expandableRowGroups` + DataTableExpandedRows 期望 `Record<string, boolean>`
  - **fire-and-forget 通知失败语义**：scan-orchestrator 主流程不 await；channel 内部 try/catch + console.error；AuditEvent.notified 字段供后续重试
  - **图表复用决策**：PrimeVue `<Chart>` 内部 `chart.js/auto` ~200KB → 自实现 ChartCanvas tree-shakable 40KB gzip（节省 75%）

### M11 验收标准（全部闭环 ✅）

- [x] 平台 A 模式 `fix-and-pr` 真实环境跑通（push + PR 闭环 + UI 提示）—— C53 闭环
- [x] T1005 路由接线后 sandbox 执行器可真实触发（docker daemon 可用时）—— T1005-A/B/C/D 闭环
- [x] security.md §5.4 + §5.5 凭据权限阶 + 加密存储章节落地 —— C28 闭环
- [x] C56 / C57 平台 UX 用户反馈小修闭环 —— `cda5b90` 闭环
- [x] branches 80% 覆盖率维持 —— 80.49%
- [x] `pnpm lint` / `typecheck` / `test` 全绿 —— 677/681 passed + lint 0 error + typecheck 0 error
- [x] CI 端到端裁决通过 —— 2 轮深度审计全部 Pass

---


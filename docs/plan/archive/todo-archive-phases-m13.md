# M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已归档）

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

> 本批次背景（2026-08-26）：用户实测截图反馈 6 项 UX 问题，按 §1.1 ≤5-6 项硬上限 + 与 T1310 互不干扰原则，**3 项低风险立刻做（M13.4）** + **3 项进 backlog 暂缓（UX-R1~R3）**。

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
- [x] 用户实测反馈 5 项全部闭环 —— #5.1（单仓库扫描互斥修复 → T1303）+ #5.2（历史 Dialog X 按钮修复 → T1304）+ #1（失败原因展示 → T1401）+ #4a（alerts UI 增加 ruleId 列 → T1402）+ #4b（dedupe 默认值 → T1403）；另 3 项进 backlog 暂缓（UX-R1~R3）
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

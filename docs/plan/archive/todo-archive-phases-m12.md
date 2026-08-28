# M12: 平台 UX 一致性 + i18n 治理（已闭环 / 2026-08-21 归档 → 2026-08-28 预防性分片迁出）

> **归档日期**：2026-08-25（commit 历史回溯 2026-08-21）
> **阶段摘要**：M11 闭环后承接 2026-08-21 用户实测反馈 10 项平台 UX / 安全 / i18n 问题，按 §1.1 ≤ 5-6 项硬上限拆 4 子批次独立实施。**所有 19 commits 已推送至 origin/master**（C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2）。
> **状态**：✅ 全部完成
>
> **2026-08-28 预防性分片迁出**：本段已从 [todo-archive.md 主窗口](../../todo-archive.md) 迁出至本分片（todo-archive.md M17 归档批次主窗口新增 152 行后超 700 分片阈值；与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略）。主窗口不再保留完整实施记录，仅保留导航指针。

## 阶段闭环清单

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

## 阶段验收标准（全部闭环 ✅）

- [x] 4 个子批次全部独立闭环（每个 ≥ 1 Review Gate Pass）—— A1/A3/B1/C1/C2/D1/D2/D3/D4 共 9 轮 audit Pass（quick / standard）
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error（仅 1 pre-existing mailer warning）
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— vitest 705 passed + 4 skipped / playwright 22 baseline + C65-D 7 new case
- [x] branches 覆盖率维持 ≥ 80% —— 79.88% → 80.02%（CI 阈值回归修复后）；目标文件 [id].get.ts 82.75%
- [x] `pnpm check:docs` 全过 —— 95 md links + 55 md vue-interp OK（standards/platform.md §7.2 新增 i18n 单点声明条款）
- [x] 用户实测反馈 10 项全部闭环 —— #1-#10 全部转 C65-A/B/C/D 4 子批次闭环（#8 单 admin 不得降级登记 backlog 远期，需后端事务级 admin 计数校验，独立批次）
- [x] CI 端到端裁决通过 —— 所有 commits 推送至 origin/master + Coverage job branches ≥ 80%

## 阶段治理记录

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

## 阶段关键经验（已沉淀至项目知识库）

- **前端拦截不等于服务端安全**：任何"防自修改 / 防越权 / 防 XSS / 防 CSRF"必须服务端兜底；better-auth adminMiddleware 仅校验权限不校验 self-target，是已知 gap。纵深防御 = 前端拦截 + 服务端强制
- **jiti vs Nuxt transform pipeline**：`nuxt.config.ts` 顶层 import 走 jiti（无 transform pipeline），@nuxtjs/i18n 等 Nuxt 模块通过 addImports 注入的运行时全局在 jiti evaluate 模块顶层时不可用 → `ReferenceError`。任何被 nuxt.config.ts 顶层 import 的模块都不能在模块体顶层调用这种 Nuxt 模块注入的运行时全局，否则 typecheck 阶段 `loadNuxt` 立即失败
- **TypeORM 1.x 复合索引必须类级声明**：列级 `@Index(['col1', 'col2'])` 会生成仅含末列的单列索引；e2e 二次运行会暴露第二个仓库的 500 错误（教训见经验 §三十）
- **TypeORM find options 不支持嵌套路径 order by**：1.x `find({ order: { 'scanRun.repository.owner': 'ASC' } })` 抛 `EntityPropertyNotFoundError`；必须用 QueryBuilder（`createQueryBuilder().leftJoinAndSelect().orderBy()`）；本批次 C65-D3 把整个 `find()` 调用统一替换为 QueryBuilder，简化代码路径
- **§3 同模式扫描必须全 diff 扩展**：违规修复时仅清理声明范围内的违规会漏掉同模式新增（经验 §十六 + §十七 + §三十九）。修复模式：以"违规类型"为锚点扫描全 diff（包括新增 untracked 文件 + `<style>` 块注释 + test/it 名 + JSDoc），而非以"已声明范围"扫描
- **F 阶段本地验证口径差异**：`pnpm --filter <pkg> test`（仅特定包）≠ CI 跑 `pnpm test` 全 workspace + coverage 4 维度。本批次 C65-D 12 commits 推送后 CI Coverage job 失败（branches 79.88% < 80%）根因即此。**修复协议**：F 阶段"完整验证"必须含 `pnpm run test:coverage`（全 workspace）+ 检查 4 维度是否 ≥ 阈值，而非仅 `pnpm --filter @dependfix/platform test`。**CI 通过 = 最终裁决，本地通过 ≠ 完成**
- **OR 链触发条件精确追踪**：statusWriteBack=false 仍可能因 count diff 进入写回块（`batch-runs/[id].get.ts` 案例）；CI 阈值回归优先在已有测试文件加 case，不新建文件
- **Code Auditor quick depth 实测用时校准**：C65-D1 ~50s / CI 修复 ~79s，远低于 5min 时间盒；快速 depth 与 standard depth 决策应基于"是否涉及架构 / 跨模块 / 安全性"而非用时顾虑

## 待迁移经验（next neat-freak 候选）

- **C53-后-A/B/C**（M11 推进批次，C53 衍生 P2/P3 子任务）已全部闭环（931b5b7 / bfecf6a / 5d7ee97）
- **wisdom 蒸馏批次**（P3）：本阶段新增 7 条 → 18 活跃，距 20 阈值仍有空间，下次 neat-freak 处理
- **历史 C65 test 名孤立编号清理**：audit W3 同模式扫描发现 admin/i18n e2e C65-A1/A2/A3/A4 test 名孤立编号违规（不在 C65-D diff 范围），下次 neat-freak 批次统一清理
- **D2-S1 PrimeVue rowToggleButton aria-expanded**：Pass-through 不传 context（含 expanded 状态），低成本 dynamic 实现不可行；待 PrimeVue 升级到修复版本或迁移 alerts 加载到 useAsyncData 让 SSR 阶段就有数据
- **D3 suggest-2 viewMode 快速切换请求竞态**：低概率 UI 闪一下旧数据；可在 fetchAlerts 顶部维护 lastRequestId + 响应时丢弃过期 id；本次 PR 范围外

## 文档位置速查

- 4 子批次任务拆解背景 + 启动顺序 + 验收要点：原 backlog.md §2026-08-21 平台 UX 反馈批次评估（C65 待启动）段已清理（2026-08-25 neat-freak 归档批次）
- 阶段总体规划（依赖图 / 推荐启动顺序 / 子批次规划详情）：原 backlog.md §M12 平台 UX 一致性 + i18n 治理（待启动）段已清理（2026-08-25 neat-freak 归档批次）
- 实施记录 / commit 引用 / 验证矩阵：本分片文档（详见上方闭环清单 + 治理记录 + 关键经验）

# 当前阶段任务

> **M7 已归档（2026-08-12）**：M7.1 认证与用户体系（2026-08-10 归档）+ M7.2 平台能力深化（2026-08-12 归档，T702/T704/T708/T709/T710 全部完成），详细记录见 [todo-archive.md §M7.2](todo-archive.md#m72-平台能力深化已归档)。
> **T711 覆盖率冲刺进行中（2026-08-12 用户指示优先）**：覆盖率统计口径修正已完成（thresholds 80% 生效，CI coverage job 转红直至达标），分阶段补测进行中，见下方 T711 区块。
> **T705 / T703 已延期（2026-08-12 用户指示）**：生产级部署（PostgreSQL/Helm/Sentry）与跨平台 Git（GitLab/Bitbucket）暂缓排期，见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)。
> **T706 已完成（2026-08-12）**：`@dependfix/mcp@0.1.2` 已发布 npm（registry 实证）；skill 双后端验证与 MCP 接入文档为轻量收尾（随文档同步跟进）。

---

### T711 覆盖率口径修正 + 冲刺至 80%（口径已完成，冲刺进行中）

- 优先级：`P2`（质量门禁，事实性 CI 阻塞）
- 背景：`vitest.config.ts` coverage.include 只统计 `packages/*/src`，忽略了 `apps/platform`（server/app 源码 + 25+ 测试文件）与 `scripts/*.mjs`（9 个 `.test.mjs`），覆盖率数字虚高失真。用户要求：优化统计口径 + 目标设为 80%。
- 口径修正（2026-08-12 已完成）：
  - [x] coverage.include 扩展为 5 段：`packages/{core,engine,cli,mcp}/src/**/*.ts` + `apps/platform/app/**/*.ts` + `apps/platform/server/**/*.ts` + `scripts/*.mjs`
  - [x] exclude 追加 `**/*.test.mjs`；`.vue` 组件与 e2e 不纳入（口径声明见 [testing.md §5](../standards/testing.md)）
  - [x] thresholds 四维 80（statements/branches/functions/lines）
  - [x] testing.md §5 目标表同步（整体 60% → 80%，模块目标统一 80%，登记新口径基线）
- **基线（新口径）**：Statements **67.81%**（4382/6462）/ Branches 65.39% / Functions 68.43% / Lines 67.83%——未达门槛，`pnpm run test:coverage` 当前非零退出（CI coverage job 会红，直至冲刺达标）。
- **缺口分析（低覆盖高 ROI 候选）**：
  - `apps/platform`：`server/api/*` 22 个 Nuxt 路由 handler 全 0%、`app/` composables/middleware/plugins 全 0%（e2e 覆盖但单测未覆盖）、`database/typeorm-adapter.ts` 0%、`queue.service.ts` 8%、`scan-orchestrator.service.ts` 5%、`utils/auth.ts` 0%
  - `scripts`：整体 33.66%——check-links 0% / distill-wisdom 0% / sync-skills 0% / auto-version 29% / tag-released-versions 20%
  - `packages/mcp`：整体 35%（bin.ts 0%、index.ts 39%——入口薄壳）
  - `packages/cli`：runner.ts 0%、bin.ts 0%、skills/source.ts 25%
  - `packages/core`：errors/app-error 44%、report/writer 69%、若干 re-export 入口 0%（planner/index、toolchain/index）
  - `packages/engine`：app/branch-cleanup 31%、app/index 62%、runners/verification-gate 73%
- **分阶段计划（2026-08-12 启动，每阶段 checkpoint 跑全量 coverage 记录数字并独立提交）**：

  | 阶段 | 内容 | 缺口（statements） | 状态 |
  |:--|:--|--:|:--|
  | 1 | `scripts` 提升至 80%（distill-wisdom/check-links/sync-skills 纯函数提取 + 补测；auto-version/tag-released-versions 等补测） | 419 | ✅ 完成（2026-08-12，四维 ≥ 80%） |
  | 2 | `apps/platform/server` api 路由层 + database + queue 服务补测 | 550 | ✅ 完成（2026-08-13，api 16/22 + 服务层 7 文件） |
  | 3 | `packages/cli` 入口 + `apps/platform/app` 层补测 | 100 | ⬜（已达标，可跳过或低优先） |
  | 4 | 全局收口（branches/functions 维度补强，目标四维均 ≥ 80%） | — | ✅ 完成（2026-08-13） |

- **阶段 1 完成记录（2026-08-12）**：scripts 33.7% → **Stmts 81.8% / Branch 80.59% / Funcs 83.08% / Lines 81.76%**（四维达标）；全量测试 1363 passed / 4 skipped 无回归。批次：1a（b57d476b distill/sync）→ 1b（ce336a90 check-links）→ 1c（fd6a2074 auto-version/tag-released）→ 1d（47459b4a 发布脚本 main）→ 1e（f3ed43c2 release-publish main）→ 1f（538f268e create-release-plan）→ 1g（6bd81b1d changelog mergeUnreleased），每批 Review Gate Pass。
  - 已知边界：release-version main 写回真实 package.json 不可测（放弃，61%）；changelog 顶层循环依赖本地 tag 短路 / npm 可达（离线 CI 需注意）；isPreMajor 测试断言 0.x 与真实版本耦合（1.0.0 发布后需同步更新，登记 Note）。
  - 下一阶段：阶段 2 `apps/platform/server`（api 路由层 + database + queue，缺口 550 stmts）
- **阶段 2 checkpoint（2026-08-12）**：
  - **api 路由层 16/22 handler 已覆盖**（除 auth/[...].ts better-auth 代理外全部）：repos（index/[id]/importable/batch/batch-scan/scan.post）、credentials（index/[id]）、runs（index/[id]）、batch-runs（index/[id]）、alerts、dashboard、schedules（index/[id]/trigger）
  - 测试基建：`apps/platform/tests/api-helper.ts`（h3 event 构造：req.body 预置 unenv 风格 + context.params；expectError；:memory: SQLite）+ `setup-nuxt-server.ts`（5 个 Nuxt auto-import 注入）+ vitest setupFiles
  - 测试模式（已审计通过）：guard 层 mock（鉴权由 guard.test.ts 单独覆盖）、`repo.create()` 手动 save（plain object 不触发 BeforeInsert）、vi.hoisted（mock factory 提升）、Octokit class mock
  - **全量 checkpoint：Statements 81.53% / Lines 81.59% / Functions 80.61%（三达标）/ Branches 76.38%（未达标，阶段 4 攻坚）**；1434 passed / 4 skipped
  - 剩余高 ROI（branches 缺口）：scan-orchestrator（缺 52）、utils/auth（缺 38）、typeorm-adapter（缺 30）、queue.service（16）+ redis/scan-queue、database/index（10）、engine/branch-cleanup（19）+ app/index（17）+ pnpm-audit-fetcher（21）、cli/skills/index（24）、app/middleware/auth（10）
  - 补测候选（suggest 登记）：scan.post 409 终态分支、importable private 无 push 权限过滤、batch-scan 混合 id 过滤、credentials token:'' 保护分支

- 冲刺执行按 [testing.md §5.1 覆盖率冲刺执行方法](../standards/testing.md)（fresh 基线 → 高 ROI 切片 → 小步快跑 → 全量 checkpoint）。
- 验收：`pnpm run test:coverage` 四维全部 >= 80%（CI coverage job 转绿）。
- **✅ 达成记录（2026-08-13）**：全量 checkpoint **Statements 85.89% / Branches 80.6% / Functions 85.51% / Lines 85.96%**——四维全部 ≥ 80%，`pnpm run test:coverage` 零 ERROR；1494 passed / 4 skipped；lint 0/0 + typecheck 全过。阶段 3（cli 入口/app 层）已无必要（全局达标），标记可跳过；后续补测按需（审计 suggest 项登记：typeorm-adapter createdAt 同毫秒 flaky、transaction 回滚断言、redis error 监听断言、queue close disconnect 断言）。
- 任务粒度：口径修正单批提交（1 配置 + 2 文档）；冲刺按切片分批提交（单批 <= 10 文件）。

---

## 待人工验收（真实环境，随可用性推进）

- **T701 真实凭据 3 项**：真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）、真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）、构建期配置凭据后按钮显示路径实测——[todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)
- **T702 HTTP 层状态流转**：pending→running→completed + 前端轮询体验（需后台服务/staging 或 CI redis service）
- **T704 async 定时触发**：BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）；Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）
- **发布管线收尾（P3）**：release:auto-version 完整流程待 schedule 启用后首个 cron 裁决；main 副作用路径测试观察项

## 当前状态

- **T711 覆盖率冲刺进行中（2026-08-12）**：口径修正已完成（coverage.include 5 段 + thresholds 四维 80），分阶段补测启动——阶段 1 `scripts`（缺口 419 stmts）。基线：Statements 67.81% / Branches 65.39% / Functions 68.43% / Lines 67.83%，未达门槛时 `pnpm run test:coverage` 非零退出（CI coverage job 红属预期，冲刺达标后转绿）。
- **T706 已完成（2026-08-12）**：`@dependfix/mcp@0.1.2` 已发布 npm；skill 双后端验证与 MCP 接入文档为轻量收尾。
- **T705 / T703 已延期（2026-08-12 用户指示）**：生产级部署与跨平台 Git 移至 [backlog.md §M7.2](backlog.md#m72-平台能力深化) 待评估；恢复排期时注意 PostgreSQL 迁移对 T702 独立 worker 形态的解锁价值。
- **M7 已归档（2026-08-12）**：M7.2 T702/T704/T708/T709/T710 全部完成并归档，详见 [todo-archive.md §M7.2](todo-archive.md#m72-平台能力深化已归档)；M7.1 归档见 [todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)。

## 已知边界

- M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
- Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
- security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。
- 平台 UI 暗色模式不可用（暂缓，后续优化，[backlog.md §M6](backlog.md) C29）。
- `todo-archive.md` 已超 500 行治理阈值（575 行），早期阶段（M2-M5.5）分片迁移任务已登记 [backlog.md T906](backlog.md#t906-todo-archive-分片迁移m2-m55--docsplanarchive)。

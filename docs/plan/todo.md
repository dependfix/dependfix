# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M21

> **状态**：M21 P 阶段规划完成（2026-08-31），等待 D 阶段实施触发。
>
> **范围限定（5 项任务，类型平衡）**：🛡️ 治理 2 + 🔧 技术债 1 + 🚀 能力 1 + 🧪 测试 1 = 5 项，符合 [planning.md §1.1 ≤5-6 项硬上限](../standards/planning.md)。
>
> **M20 完成摘要**：5 子阶段（M20.1/M20.3/M20.5/M20.6/M20.7）全部闭环，8 commits 已落地。详见 [todo-archive.md §M20](todo-archive.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)。
>
> **待人工验收**：T701/T702/T704 真实环境验证（backlog.md §待人工验收）随可用性推进。

### M21 任务清单（P 阶段规划中 / 2026-08-31）

#### M21.1（P3，🛡️ 治理）Code Scanning RG-W01 + RG-W02（`execFileSync` 替换 `execSync` 2 处）

- **目标**：消除 2 处 Code Scanning `js/shell-command-constructed-from-input` 告警（命令注入隐患）
- **范围**：
  - RG-W01：`packages/engine/src/github/pr-creator.ts:214` `execSync('git add .')`
  - RG-W02：`packages/engine/src/fixers/pnpm/index.ts:144` `execSync(command)` 含模板拼接
- **验收标准**：
  - [ ] 2 处 `execSync` 替换为 `execFileSync` + 参数数组（避免 shell 解释）
  - [ ] `pnpm --filter @dependfix/engine test` 全过（既有 `pr-creator.test.ts` + `fixers-pnpm.test.ts` 测试覆盖）
  - [ ] `pnpm lint` + `pnpm typecheck` 0 error
  - [ ] 本地 grep 实证 0 处 execSync 模板拼接（命令：`rg -n "execSync.*插值" packages/engine/src`）
- **不做什么**：不重构其他 execSync 调用（如 `git config` 静态命令无注入风险）；不升级 pnpm / git 版本；不引入新依赖
- **依赖**：M18.4 已闭环（pr-creator.ts 上下文已具备）；Code Scanning audit #26/#27 已记录（[经验归档 §四十四](../../docs/design/governance/experience-archive.md)）
- **交付物**：2 atomic commits（`fix(engine) execFileSync 替换 pr-creator.ts` + `fix(engine) execFileSync 替换 fixers-pnpm/index.ts`）+ 既有测试不回归
- **风险与缓解措施**：参数化命令数组需正确转义特殊字符（如 git URL 含空格等）；缓解：复用既有测试覆盖（pr-creator.test.ts 已覆盖 PR 创建全链路）+ 新增 1 case 验证带空格路径

#### M21.2（P3，🛡️ 治理）M18.x 剩余风险 W1 + W2 + audit suggest 1+2（4 项集中清理）

- **目标**：闭环 M18.x 治理批次遗留的 4 项非阻塞 warning + suggest 清理
- **范围**：
  - **W1**：`stageAndCommit --local` flag 路径回归测试（`packages/engine/src/git/stage-and-commit.test.ts` 新增 case 用 `process.env.GIT_CONFIG_GLOBAL=/tmp/synthetic-global-with-user.name` 模拟 host global + 不预设 local config）
  - **W2**：`detectServerLocale` 大小写兼容（`apps/platform/server/utils/localized-error.ts:tryQueryLocale` 加 `.toLowerCase()` 让 `?locale=EN` 接受）
  - **audit suggest 1**：`test.describe` 嵌套冗余 `test.use` 清理（`apps/platform/tests/e2e/*.e2e.test.ts`）
  - **audit suggest 2**：空 `beforeAll` 钩子清理（vitest 钩子无操作直接删除）
- **验收标准**：
  - [ ] 4 项均完成（commit message 引用编号 W1/W2/S1/S2 实证）
  - [ ] `pnpm --filter @dependfix/engine test` 全部通过（含新加 W1 回归 case）
  - [ ] `pnpm --filter @dependfix/platform test` locale 检测单测覆盖大小写（`?locale=EN` / `?locale=en-US` 都接受）
  - [ ] `pnpm lint` 0 error + `pnpm typecheck` 0 error
  - [ ] A 阶段 code-auditor quick depth Pass（建议 `audit-depth: quick`）
- **不做什么**：不重构 stageAndCommit 主流程；不引入新依赖；不破坏 better-auth / Nuxt i18n 集成
- **依赖**：M18.4 已闭环；M16.3 `detectServerLocale` 已落地（W2 是其延伸）；BullMQ 队列无需本批次涉及
- **交付物**：3-4 commits（每个子项 1 fix + 1 test 或合并；建议 4 commits 拆分明细便于 review）
- **风险与缓解措施**：W1 回归测试涉及 `process.env.GIT_CONFIG_GLOBAL` 副作用，可能影响其他测试并行；缓解：用 `vi.stubEnv` 隔离 + 测试结束 `vi.unstubAllEnvs`

#### M21.3（P3，🔧 技术债）S-5 `process.env.ENCRYPTION_KEY` 死代码清理（6 处 → helper 抽取）

- **目标**：消除 6 处测试 stub 偶然一致性风险，抽取统一 helper（与 M17.5 `authedCookieHeader` 抽取同源策略）
- **范围**：
  - 5 文件删除 `process.env.ENCRYPTION_KEY` 赋值/清理对：
    - `apps/platform/server/services/scan-orchestrator.test.ts:115,120,128`
    - `apps/platform/server/api/credentials/index.test.ts:28,33,71,73`
    - `apps/platform/server/api/credentials/[id].test.ts:28,39,92-94`
    - `apps/platform/server/api/repos/importable.get.test.ts:80,91`
    - `apps/platform/server/api/repos/batch.post.test.ts:31,36`
  - 抽取 `setTestEncryptionKey(key)` helper 到 `tests/setup-nuxt-server.ts`（与 `setupMemoryDatabase` 同模式）
- **验收标准**：
  - [ ] 5 文件 14 处 `process.env.ENCRYPTION_KEY` 赋值/清理对全部清除（grep 实证 0 命中）
  - [ ] 新增 `setTestEncryptionKey` helper 单测覆盖（默认 stub 行为 / 自定义 key 行为 / cleanup 验证）
  - [ ] 调用方测试全部通过（既有 `853 passed` 不回归 + helper 单测新增 ≥ 4 case）
  - [ ] `pnpm lint` 0 error + `pnpm --filter @dependfix/platform typecheck` 0 error
- **不做什么**：不动 `tests/setup-nuxt-server.ts:26` 默认 stub 字符串；不修改 `NUXT_ENCRYPTION_KEY` 路径；不引入新依赖
- **依赖**：M17.1 已闭环（service 改读 `useRuntimeConfig().encryptionKey`，`process.env.ENCRYPTION_KEY` 不再是密钥源）
- **交付物**：2 commits（`refactor(platform): 抽取 setTestEncryptionKey helper` + `refactor(platform): 调用方测试替换 process.env.ENCRYPTION_KEY 死代码`）
- **风险与缓解措施**：helper 签名设计需确保调用方语义不变；缓解：与 M17.5 `authedCookieHeader` 抽取同源策略（vitest 单测 + 调用方既有测试双重验证）+ helper 默认参数与 `useRuntimeConfig` stub 字符串保持一致

#### M21.4（P3，🚀 能力扩展）B3 PR 自动合并闭环（mergify 模板 + auto-merge guide）

- **目标**：提供 mergify 配置模板 + auto-merge guide 文档，让用户可一键启用 PR 自动合并
- **范围**：
  - `.github/mergify.yml` 模板（按 dependabot / dependfix PR 规则配置 auto-merge 条件 + author 限制）
  - `docs/guide/auto-merge.md` 指南（启用步骤 + mergify 配置说明 + 安全注意事项 + 危险场景示例）
  - README 简短提及（保持简短，详细看 guide）
- **验收标准**：
  - [ ] mergify.yml 通过 mergify schema 验证（`mergify config validate` 或本地 yaml lint）
  - [ ] auto-merge.md 涵盖 mergify 安装 / 配置 / 启用条件 / 危险情况（如依赖 PR 自动合并不当）
  - [ ] `pnpm --filter dependfix-docs build` 通过（docs 结构正确）
  - [ ] `pnpm run check:docs` 0 error + `pnpm run lint:md` 0 error
- **不做什么**：不内置自动合并（用户自己启用 mergify 后即可生效）；不发布 mergify action；不修改 dependfix 自身 PR 提交流程
- **依赖**：无（独立交付物）
- **交付物**：2 commits（`docs(guide): 新增 .github/mergify.yml 模板` + `docs(guide): 新增 docs/guide/auto-merge.md 启用指南`）
- **风险与缓解措施**：mergify 误启用可能导致依赖 PR 自动合并不当；缓解：明确告知用户"先在 fork 仓库试运行" + mergify 配置加 `author` 限制（仅 dependabot / dependfix bot）+ auto-merge.md 列出"危险场景 checklist"（依赖大版本升级 / 涉及 breaking change / 测试覆盖不足）

#### M21.5（P3，🧪 测试覆盖）T704 async 定时触发 + Schedule CRUD e2e 补强

- **目标**：补强 T704 async 定时触发的端到端测试覆盖，从单测扩展到 e2e 闭环
- **范围**：
  - `apps/platform/tests/e2e/schedules.e2e.test.ts` 新建（或扩展现有）
  - 覆盖场景：创建 schedule / 列表 schedule / 编辑 schedule / 删除 schedule / 触发 schedule（async） / BullMQ upsertJobScheduler 短间隔（every < 1min）
  - 边界 case：重复创建同名 schedule / 并发触发 / 失败 schedule 状态流转
- **验收标准**：
  - [ ] playwright e2e ≥ 6 case 全过（含 async 等待）
  - [ ] BullMQ 短间隔集成测试通过（需 Redis ≥ 5 或降级路径 + 进程内集成测试模式）
  - [ ] `pnpm lint` 0 error + `pnpm --filter @dependfix/platform typecheck` 0 error
  - [ ] headless 稳定通过（不依赖真实 GitHub API；CI 环境 ≥ 3 次连跑无 flaky）
- **不做什么**：不重构 schedule CRUD 后端；不动 BullMQ 配置；不引入新依赖
- **依赖**：M7.2 T704 已交付（schedule CRUD 后端已实现）；BullMQ 队列基础设施已落地（M7.2 T702）
- **交付物**：2 commits（`test(platform): 新增 schedules e2e 覆盖 CRUD + 触发` + `test(platform): BullMQ upsertJobScheduler 短间隔集成测试`）
- **风险与缓解措施**：async 测试可能 flaky（CI 环境等待时间不稳定）；缓解：使用 `pollUntil` / `waitFor` 稳定等待策略 + 进程内集成测试模式（`describe.skipIf(!redisAvailable)`）+ 随机 id 幂等（参考 [经验归档 §三十一](../../docs/design/governance/experience-archive.md) BullMQ 队列集成教训）

**范围限定（M21 阶段整体）**：不涉及架构变更；不引入新依赖；不升级 better-auth / PrimeVue；fixtures 仍 mock（真实凭据验证属 T701 真实环境验证任务保留于 backlog）。

**预期清理 backlog 已上收主条目**（M21 全部 5 子阶段闭环后）：S-5 / B3 / T704 三个有独立主条目的；W1/W2/RG-W01/RG-W02/audit suggest 1+2 在 backlog 中无独立主条目（仅 session file `still_active_tasks` 跟踪），实施后通过 session 收口登记。

**子任务详细度遵循** [planning.md §2.5 任务详细度要求](../standards/planning.md#25-任务详细度要求)（8 要素 + 禁止模糊口径 + A 阶段 code-auditor 必查项审计）。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md) |
| 未排期 / 延期 / 远期 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |

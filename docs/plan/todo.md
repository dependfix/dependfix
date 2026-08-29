# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M18 平台 GitHub App BYO App 模式 — P 阶段启动（2026-08-29）

> **状态**：M18 P 阶段已落地（2026-08-29 docs(plan) commit），承接 M17 全部 6 子阶段已闭环归档（2026-08-28 9 commits 全部已推送至 `origin/master`，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测）。M18 P 阶段包含 5 子阶段拆分 + 3 用户决策固化 + 关键风险记录。
>
> **范围**：C22 GitHub App BYO App 模式（自部署平台 GitHub App 进阶选项；PAT 保留为默认快速上手路径，二者并存不替代）+ M18.0 PAT 无感升级评估（独立 docs only P0 子阶段）。
>
> **5 子阶段 + 1 治理批次**：
> - **M18.0**（P0 docs only）：PAT 无感升级评估报告（3 方案对比 + 推荐 B AuthProvider 注入 + 9 测试 + 2 app 改动清单 + 风险矩阵）
> - **M18.1**（P1）：C22.1 基础层 — credential 扩展（`appId` / `encryptedPrivateKey` / `installationId` / `botLogin` 4 字段）+ AuthProvider 抽象层（`packages/engine/src/auth/` 新建）+ installation token 缓存层（1h 滑窗 + 5min 提前刷新）
> - **M18.2**（P1）：C22.2 集成层 — `pushFixBranch` token 切换 + commit author 动态化（PAT 路径保留硬编码兼容）+ 审计字段扩展（`authProvider` + `installationId`）
> - **M18.3**（P2）：C22.3 表现层 — UI 凭据创建新增 GitHub App tab + 文档引导（`quick-start` + `security.md` §5 + `architecture.md` §认证）+ Manifest flow 可行性评估（A7b 仅评估，A7a 文档引导先落地）
> - **M18.4**（P1）：C22.4 测试层 — 单测补强（`auth-provider.test.ts` + `installation-token-cache.test.ts` + `pr-creator.test.ts` App bot email 路径回归）+ e2e mock JWT signing + `getInstallationOctokit` 拦截全链路验证
> - **M18.x 治理批次**（P3，合并入 C22.x 子阶段顺手做，不单独排子阶段）：S-5 / C39 / C34 / S1 / S2 / S-3 / S-4 audit suggest 延后候选
>
> **3 用户决策固化**（2026-08-29）：
> 1. **M18.0 评估子阶段独立** — 决策 A：严格分离"评估"与"实施"，M18.0 仅输出 docs only commit（`docs/design/governance/c22-pat-backward-compat.md`）
> 2. **GitHub App fixture 管理** — 决策 C：仅 mock，无真实 App fixture；**风险承担方：用户已接受**（违反"防升级回归"目的部分由 mock 替代真实行为；e2e 不能验证真实 GitHub App 行为如 installation token 失效 / rate limit / JWT 签名边界）
> 3. **M18.x 治理批次时机** — 决策 B：合并入 C22.x 子阶段顺手做（按关联性分组：S-5 → M18.1 / C39+C34 → M18.3 / S1+S2 → M18.4 / S-3+S-4 → M18.4 e2e）
>
> **总投入预估**：~11 commits（M18.0 docs×1 + M18.1 refactor×1 + feat×2 + M18.2 refactor×1 + feat×1 + M18.3 feat×1 + docs×2 + M18.4 test×2）
>
> **关键决策记录**：
> - **PAT 保留 + App 并存** vs 完全替换 PAT：选并存 —— PAT 是 CLI quickstart / Action input / 单仓调试的最低摩擦路径；BYO App 只对自部署平台多仓 org 场景提供增量价值（installation 范围限定 + 1h 短时 token 轮换 + 真实 bot 身份）
> - **PAT commit author 保留硬编码** `dependfix[bot]@users.noreply.github.com` —— PAT 路径用户行为零变化；仅 App 路径走动态 bot identity（`{app_id}+{bot_login}[bot]@users.noreply.github.com`）
> - **fixtures 仅 mock**（决策 C 风险承担）：mock 必须严格对齐 `@octokit/auth-app` 库契约输出；单测聚焦库 mock 输出契约作为缓解措施
> - **Manifest flow 一键创建暂不实施**：A7b 仅评估可行性（GHES 版本支持范围 / manifest URL 构造 / OAuth callback 路径 / CSRF 防护）；A7a 文档引导先落地
>
> **依赖关系**：M18.0（评估） → M18.1（基础层） → M18.2 + M18.4 并行 → M18.3（表现层） → M18.4 e2e 闭环
>
> **下一步候选**：
> - **M18.0 D 阶段**：输出 PAT 无感升级评估报告（`docs/design/governance/c22-pat-backward-compat.md`，1 个 docs only commit）
> - **backlog 主条目候选池（M19+ 可拣选）**：C23（max-repos 总量上限）/ C24（org 级 alerts 批量拉取）/ B1（PR 关闭评论 + label）/ B2（固定分支单线）/ T701-T704 真实环境验证（OAuth/OIDC/SMTP/BullMQ）
>
> ---
>
> ## M18 阶段实施状态（ahead=10，已落地 + 推送待用户）
>
> **M18.0**（P0 docs only）：✅ `690cc73 docs(design): 落地 C22 PAT 无感升级评估报告（M18.0 评估子阶段）`——2026-08-29
>
> **M18.1**（P1 基础层）：✅ 5 commits（`026078a` AuthProvider + PatAuthProvider / `0866830` audit Reject 修复 / `67a1a2f` 调用点改造 / `e9b9c0a` 接口契约 + PatAuthProvider 单测 / `adf370a` AppAuthProvider + InstallationTokenCache + 单测）——2026-08-29
>
> **M18.2**（P1 集成层）：✅ 2 commits（`e84ff58` commit author 动态化 / `a6a1695` pushFixBranch 接受 AuthProvider）——2026-08-29
>
> **M18.3**（P2 表现层）：✅ 6 commits（`b3a2cfb` GitHub App 凭据管理接入实体 + schema + UI tab + PEM 校验 / `c6534fe` PEM 指纹算法修正 / `7ef0d73` GitHub App 配置章节 + C39 standards 同步 / `25d8682` C22 Manifest flow 可行性评估 / `700ab28` Manifest flow 评估修正 / `ac21f6f` 删除 §2.6 重复小节标题）——2026-08-29
>
> **M18.4**（P1 测试层）：✅ 2 commits（`b5c23a0 fix(engine): M18.4 测试层补强 + app-provider auth 字段 bug 修复` / `bc2ee06 docs(design): 登记 M18.4 audit 教训（集成外部库必须 e2e 真实路径冒烟测试））——2026-08-29
>
> ### M18.4 实施关键事件
>
> - **audit quick depth round 1 Reject**（B1 blocker）：原计划仅 `auth → authStrategy` 字段修复，实际不成立——真实 `@octokit/auth-app@8.3.0` 要求 `authStrategy: createAppAuth, auth: {appId, privateKey, installationId}` 双字段（README 标准用法）。
> - **round 2 修复**：按 [@octokit/auth-app README](https://github.com/octokit/auth-app.js#installation-authentication) 双字段标准用法修复 + 去 mock 化 `auth-flow.test.ts` 真实路径 e2e（不 mock `@octokit/auth-app` / `@octokit/rest`，用 `node:crypto.generateKeyPairSync('rsa', {modulusLength: 2048})` 生成真实 PKCS8 PEM 私钥 + nock 拦截真实 HTTP）
> - **app-provider.test.ts 调整**：mock 形态验证改 `FakeOctokit` 构造参数（`options.authStrategy + options.auth`）+ 缓存逻辑
> - **pr-creator.test.ts 新增** 5 case：stageAndCommit author 路径回归（PAT 默认 / App 路径 / 已有 config 不覆盖 / 端到端 commit author 实际生效 × 2）+ `process.env.GIT_CONFIG_GLOBAL=/dev/null` 测试隔离
> - **audit round 2 Pass**（13:30:00Z 启动，约 5 分钟 quick depth）
>
> ### M18.4 剩余风险（不阻塞，登记 M19+ / M18.2 治理批次）
>
> - **W3（audit）**：`stageAndCommit` host 全局 git config 干扰 bug——`ensureGitConfig` 用 `gitConfigExists('user.name')` 未隔离 host 全局 config；M18.2 集成前修复（注入 `env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }` 到 execSync）
> - **W4（audit）**：`@octokit/auth-app` 版本钉定未实施——`packages/engine/package.json:54` 仍 `^8.3.0` caret range；按 [c22 §5.5 决策 C 缓解措施 4](../../docs/design/governance/c22-pat-backward-compat.md#55-决策-c-fixture-仅-mock-风险承担方)，M19+ 治理批次处理：`pnpm.overrides` 钉定 + CI `pnpm audit` 步骤
>
> ### M18.4 经验沉淀（experience-archive §四十三）
>
> 集成外部库必须读 README 标准用法 + e2e 真实路径冒烟测试——B1 教训根因：M18.1 commit 4 实施时**未读 README 标准用法**（凭直觉写 `auth: createAppAuth(...)` 而非 `authStrategy: createAppAuth, auth: {...}`），且 `app-provider.test.ts` mock 边界过宽（`vi.mock('@octokit/rest')` 完全跳过 `@octokit/core` 真实代码路径）掩盖集成 bug。挂接治理检查点 4 项登记至 [experience-archive.md §四十三](../../docs/design/governance/experience-archive.md#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试2026-08-29m18.4-audit-round-1-reject-后补修)。
>
> ### M18.x 治理批次（合并入 C22.x 顺手做）
>
> 仍按 P3 延期处理——S-5 / C39 / C34 / S1 / S2 / S-3 / S-4 audit suggest 延后候选维持 backlog 状态。

---

## 待人工验收（真实环境，随可用性推进）

> 以下条目属 M7.1 / M7.2 / 发布管线阶段遗留的真实环境验证任务，**不在 M12 范围内**，保留随真实环境可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

实施记录与背景：[archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

实施记录：[archive/todo-archive-phases-m10-c53-c59c61.md §T912](archive/todo-archive-phases-m10-c53-c59c61.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 个已归档阶段：M17 / M16 / M15 / M14 / M13 + M12/M8/C53 等指针段；M12 已分片至 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md) / 早期阶段分片见 [archive/](archive/)） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 + 2026-08-28 M16 归档批次新增的 [todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出 / UX-R1 已由 M14.2 闭环迁出 / UX-R2 已由 M15 闭环迁出 / UX-R3 已由 M16.1 闭环迁出 / **C38 / S-2 / S-4 / 服务端 API i18n 范围外扩展 已由 M17 归档批次闭环迁出**） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（**M0-M17 已闭环归档**；M17 安全与可用性收口 6 子阶段 2026-08-28 9 commits 已全部推送至 origin/master ahead=0） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（**当前无活跃实施阶段**：M17 全部 6 子阶段已闭环归档 2026-08-28 9 commits（含 session 收尾）已全部推送至 `origin/master` ahead=0；等待用户启动 M18） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 主线 #1 状态从"暂停"变"已缓解"——M16.4 useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog） |

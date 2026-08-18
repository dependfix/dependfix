# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。
- 早期阶段分片：[M0 / M1](archive/todo-archive-phases-m0-m1.md)（2026-08-07 迁出）、[M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5](archive/todo-archive-phases-m2-m55.md)（2026-08-14 迁出，T906）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块（当前保留 M6 / M7.1 / M7.2 / M8 / M9 / T711）。
- 当 `todo-archive.md` 超过 500 行时，将早期阶段迁入分片归档。

---

## M6: 最小平台 MVP（已归档）

> 归档日期: 2026-08-08
> 阶段摘要: 参见 [roadmap.md §M6](roadmap.md)
> 状态: 已完成（T601-T605 + T607 全部完成；CI Test 端到端裁决通过；Docker 镜像构建 CI 链路未裁决通过，登记 backlog C30）
> 最终提交: `7cb1ad22d` docs(plan): 登记 C29 平台 UI 暗色模式待修复问题（含 M6 收尾修复批次 ec7221fd / 6cfbcb3c / 6edb4ac7）

**阶段成果**: 可独立部署的最小平台 MVP——Nuxt 4 全栈平台（仓库/凭据管理 + 同步扫描 + 仪表板 + 注册登录）+ `@dependfix/mcp` MCP Server（4 tool）+ 执行器设计与沙箱评估文档 + B 模式 Action 触发与结果回填。991 tests（CI Test workflow 实测）。

### 规划决策（2026-08-07 用户确认）

- **D1 执行深度（Q1）**：平台扫描以 A 模式（完整修复链路）为主——平台容器内置 git/node/pnpm 工具链，复用 `DependfixApp` 程序化接口完整执行；B 模式（触发目标仓库 GitHub Action）为降级
- **D2 执行模型（Q2）**：同步执行先行（请求内完成，前端 loading）；阻塞时间过长再演进后台异步（M7 T702 BullMQ 承接）
- **D3 MCP（Q3）**：保留在 M6（原 T605/T606 合并为本阶段 T605，容量约束"进一出一"，同为 `@dependfix/mcp` 交付物）
- **D4 沙箱（Q4=A）**：执行器抽象 + 容器内执行（平台 Docker 容器即沙箱）；独立沙箱容器 / GitHub Action 后端仅设计不实现
- **D5 Action 降级触发（Q5=B）**：平台对已配置 action 的仓库触发 `workflow_dispatch`（需 `actions: write`）；结果回填曾为已知边界 → M6 增强（C25）实现
- **D6 平台定位**：平台 = 触发器/调度器 + 结果展示（控制面）；修复执行（数据面）以 Executor 抽象隔离
- **D7 平台结构参考**：`apps/platform/` 对齐 momei 项目结构（Nuxt 全栈：`server/api` + `server/services` + `server/database` + better-auth + TypeORM + SQLite）

### T601 平台项目骨架搭建 ✅

- **交付物**: `apps/platform/` Nuxt 4 全栈项目 + Dockerfile + docker-compose.yml
- **实现内容**: Nuxt 4 初始化（TypeScript strict、`<script setup>`）+ PrimeVue 4 + `@primeuix/themes` + SCSS（BEM）+ 暗色模式 `.dark` 类；better-auth 集成（邮箱密码登录 + TypeORM Adapter + 会话持久化 30 天 + SMTP 未配置自动跳过邮箱验证 + `REGISTRATION_DISABLED` 关闭注册）；TypeORM + SQLite（`server/database/sqlite/`）；Dockerfile 多阶段 alpine（构建含 git/pnpm 工具链）；env 隔离约束（`PORT` 可配、DB 文件路径独立）
- **非目标**: 页面业务功能（T602-T604）、i18n / PWA / Sentry（M7）
- **验收**: 根 lint/typecheck 通过（含平台，CI 实测）；`pnpm dev` 注册登录闭环本地验证；docker compose 拉起依赖镜像构建（C30 观察）
- **Review Gate / 经验**: T601 单次大 diff 成本失控教训 → 长任务分批提交治理（a808b376 立规，经验归档 §二十四）

### T602 仓库与凭据管理 ✅

- **交付物**: Repository CRUD + Credential 加密存储 + Web UI
- **实现内容**: Repository 实体（owner/repo/platform/defaultBranch/packageManager/credentialId）+ CRUD API（Zod 校验）；Credential 实体（classic-pat / fine-grained-pat / github-app）+ AES-256-GCM 加密存储（`ENCRYPTION_KEY` 平台级密钥，解密仅在执行时 worker 内存中）；Dependabot alerts 读取必须显式凭据（G2 处置）；Web UI 仓库列表/添加/编辑/删除 + 凭据管理页
- **验收**: Web UI 增删改查闭环；DB 中 token 为密文（直查 sqlite 验证）+ 解密单元测试

### T603 扫描触发与结果存储 ✅

- **交付物**: ScanRun/ScanResult 持久化 + 同步扫描执行（ContainerExecutor）+ Web UI 触发与结果查看
- **实现内容**: ScanRun/ScanResult 实体（repoId/mode/severityThreshold/status/startedAt/finishedAt/summary）；Executor 抽象（T607 契约）——`ContainerExecutor`（默认，平台容器内置工具链，clone + 执行 `DependfixApp` + 结果回填）；同步执行模型（请求内执行，失败 → `failed`，原子写不写半截结果）；Web UI 触发单仓库扫描 + 结果/报告查看；同仓库扫描互斥锁（e1ef2a95，M6 轻量版，M7 T702 BullMQ 承接）
- **验收**: Web UI 触发扫描并查看结构化结果；结果持久化 SQLite 重启可查

### T604 仪表板与告警视图 ✅

- **交付物**: 仪表板 + 告警筛选视图 + 扫描历史
- **实现内容**: 仪表板统计（仓库数/告警数按严重级别/已修复数/最近扫描）+ 告警视图（按仓库/严重级别/来源筛选）+ 扫描历史列表与详情（仓库级扫描历史页 + 详情 Dialog）
- **非目标**: 趋势图表、通知（M7）、导出
- **验收**: 用户登录后可查看全局告警状态并筛选

### T605 MCP Server（原 T605 + T606 合并）✅

- **交付物**: `packages/mcp`（`@dependfix/mcp`）+ 4 个 tool + CLI 一致性断言
- **实现内容**: `packages/mcp` 初始化（tsdown 构建 ESM + CJS + dts）；集成 `@modelcontextprotocol/sdk`（stdio 传输）；`fetch_alerts`（只读，schema 见 [mcp-server.md](../design/governance/mcp-server.md)）/ `get_last_report`（只读）/ `run_scan`（写入，复用 `DependfixApp` 默认 report-only）/ `fix_dependency`（写入，复用 `overrideTransitiveDependency`）；MCP tool 与 CLI 输出一致性断言（fetch-alerts nock 一致性断言 4 用例）
- **非目标**: npm 发布与 skill 双后端集成（M7 T706）、多传输（http/SSE）
- **验收**: `npx @dependfix/mcp` 启动注册 4 个 tool（`dist/bin.mjs` 生成 + `createMcpServer` 冒烟测试）；一致性断言测试通过

### T607 执行器设计与沙箱评估（设计先行 + Action 触发实现）✅

- **交付物**: 执行器/沙箱设计文档 + `ActionTriggerExecutor` + B 模式接入评估结论
- **实现内容**: 设计文档（恶意依赖升级威胁建模 + 执行器方案矩阵 + Executor 接口契约）——见 [executor-sandbox.md](../design/governance/executor-sandbox.md)；`ActionTriggerExecutor`（对配置 action 的仓库触发 `workflow_dispatch`，凭据复用仓库关联 Credential，workflow 文件名仓库配置声明）；B 模式接入评估（使用方式/体验/成本写入设计文档 §5）；mcp-server.md 里程碑编号修正
- **非目标**: 独立沙箱容器执行实现（M7）、action 结果回填（M6 内由 C25 增强实现）
- **验收**: 设计文档 Review Gate 通过；平台可触发 `workflow_dispatch` 并返回触发结果；B 模式接入成本评估结论落盘

### M6 完成判定（全部通过）

- [x] T601-T605 + T607 全部交付并通过 Review Gate（M6 终审 deep Review Gate，warning 3/4 处置见 C27/C28）
- [x] `pnpm typecheck` + `pnpm lint` + 全量测试 + `pnpm build` 通过（CI Test workflow 实测 991 passed；本地串行验证）
- [x] `docker compose` 部署链路可构建（镜像构建 CI 端到端未裁决，登记 C30）
- [x] MCP tool 注册冒烟 + CLI 一致性断言通过
- [x] 沙箱设计文档 Review Gate + `workflow_dispatch` 触发实测

### M6 阶段治理记录（2026-08-07 ~ 2026-08-08）

- **提交序列**: M6 规划（681efec5）→ T601（48f9c7eb）→ **T607 设计文档（56b0e518，设计先行于 T602）** → T602（85aca268）→ ActionTriggerExecutor（1c7cdb90）→ T603（3d645b54 数据层 / 209bc48c 执行链路 / 98b3f4ab 前端）→ T604（506dd7c9 API / 2cb941e3 UI）→ T605（014f6d2c + 69f32796）→ server 别名（fb62e259）→ 完成标记（1d2ff14b）→ 发布包清单单点化（83edffc5）+ 经验归档 §二十五（89a2f142）→ REGISTRATION_DISABLED（9a4309cb）→ backlog 登记 C27/C28（216b00cb）→ C25 结果回填（17c5082f + 60d9fd6e 修复）→ 互斥锁（e1ef2a95）→ CI 链式修复（6b41556e / fcc161b4 / e16aeda4）→ **交付后收尾批次**（ec7221fd repositoryUpdateSchema partial 崩溃修复 / 6cfbcb3c platform lint 脚本与 vue 格式 / 6edb4ac7 dashboard stats findOne 缺 where 条件修复 / 7cb1ad22d 登记 C29 平台 UI 暗色模式待修复）
- **Review Gate**: 每任务独立审计 + M6 终审 deep Review Gate（warning：W3 C27 runUrl 状态语义 → 随 C25 实现联动闭环；W4 C28 security.md 凭据加密章节 → 登记 backlog 待评估）
- **M6 增强批次**: C25 B 模式结果回填（`ActionResultFetcher`：轮询 run 完成 → 下载 `dependfix-report-{runId}` artifact → 解析 JSON 落库；orchestrator 三分支 completed/dispatched/failed）；同仓库互斥锁（withRepoLock，进程内 FIFO）；REGISTRATION_DISABLED
- **发布体系**: `@dependfix/mcp` 纳入发布包清单（发布包清单单点化 refactor）
- **CI 端到端裁决（2026-08-08 推送后）**: Test workflow ✅（lint + lint:md + typecheck + 991 tests + nuxt prepare + workspace 预构建）；CodeQL ×2 ✅；Pages ✅；Publish Docker ❌（QA ✅；build 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 的 concurrency cancel-in-progress 取消，登记 C30，根因已定位）
- **经验沉淀**: 归档 §二十四（单次大 diff 成本失控：长任务分批提交）/ §二十五（新增发布包散落遗漏：包清单单点声明）；规范 a808b376（任务粒度约束与提交规模上限）
- **已知边界（归档时点）**: Docker 镜像构建 CI 链路未裁决（C30）；M5.5 GitHub 源端到端复验仍依赖后续 CI 运行；security.md 凭据加密章节待补（C28）；平台 UI 暗色模式不可用待修复（C29）
- **遗留登记（转入 backlog）**: C26（独立沙箱容器实现，M7 候选）、C28（security.md 凭据章节）、C29（平台 UI 暗色模式）、C30（Docker CI build 取消排查）；M7 T701-T706

---

## M7.1: 认证与用户体系（已归档）

> 归档日期: 2026-08-10（T701/T707 代码交付完成，**剩余 3 项真实凭据人工验收**见下方「遗留登记」）
> 阶段摘要: 参见 [roadmap.md §M7](roadmap.md)
> 设计文档: [platform-auth-users.md](../design/governance/platform-auth-users.md)（Review Gate 两轮 Pass）

### T701 RBAC 权限管理 + 用户管理 + 个人界面 ✅

- **交付物**: 角色权限系统 + 用户管理界面 + 个人设置界面
- **实现内容**: 子任务 1（数据层）：单组织归属（Organization 实体 + Repository/Credential.organizationId + 默认组织初始化 + 存量迁移）+ 角色模型（admin/org_admin/viewer 三角色）+ better-auth admin 插件 + 角色迁移 + guard 扩展（requireRole/requireOrgResource）；子任务 2（管理 UI）：用户列表/搜索/启用禁用/角色分配 + 页面守卫；子任务 3（个人界面）：资料/密码/邮箱/绑定账号/语言偏好占位
- **非目标**: 审计日志、邀请注册（backlog）、T707 第三方登录、repo_admin/username/多租户（backlog，决策 D1/D2/D3）
- **验收**: 权限矩阵 guard 11 例 + 浏览器验证 8/8 + organization.test.ts 8 例（存量填充/幂等/并发安全）+ 写操作收紧 admin/org_admin 披露
- **提交**: 5811e524 + 8d515aa8 + 2c2620e6 + dc712df1 + ce36ec37 + a115e351 + 781d3fa5 + 3cc58165 + 08a68315（含平台增强：仓库批量导入 85c6988d + e2e 基建 432c59a1）
- **Review Gate**: 子任务独立审计 + T701 收口审计 Pass（W1 注释编号清理后复审通过）

### T707 认证扩展：OIDC SSO / GitHub·Google OAuth / 邮箱域名黑白名单 ✅（代码交付，3 项人工验收待办）

- **交付物**: 多登录方式 + 部署模式互斥配置 + 注册准入控制
- **实现内容**:
  - 子任务 1（部署模式与准入）：`AUTH_MODE=enterprise|public` 互斥（启动校验非法值拒绝）；注册准入 `user.create.before` hook 单一准入点（REGISTRATION_DISABLED 总开关 + email 缺失 fail-closed + 域名白名单/黑名单）；首用户 admin 短路优先（决策点 11）；`disableSignUp` 不合并 enterprise 空白名单（P1 死锁修复：端点级拦截阻断首用户 bootstrap）
  - 子任务 2（OAuth）：GitHub/Google `socialProviders` 条件化（凭据齐全才启用）；登录页按钮（`resolveSocialProviders` 纯函数 6 例单测）；可用性布尔仅根级 env（前后端通道一致）
  - 子任务 3（OIDC SSO）：`genericOAuth` 插件条件化（discoveryUrl/issuer 二选一 + 手动端点覆盖 + `requireIssuerValidation: true` RFC 9207 防护）；`genericOAuthClient()` 客户端注册；enterprise 登录页按钮
- **决策**: D1 部署模式互斥（enterprise 白名单 / public 黑名单）；决策点 6 修订（enterprise 白名单空 = 完全关闭自动开通）；决策点 11 新增（首用户 admin 优先于准入检查）——2026-08-10 用户确认
- **验收**: 单测 92/92（email-domain 11 + auth-access 集成 10 + social-providers 6）+ e2e 22 用例 + ui-validator 视觉 8/8 + lint/typecheck/build；「未配置登录方式自动隐藏」与「单测/e2e 覆盖项」勾选完成
- **提交**: bd6e9ffc（T707-1）+ 56e56f95（T707-2）+ 6f4b7d1f（T707-3）+ 25ac7540（状态同步）
- **Review Gate**: T707-1 双轮（首轮 REJECT P1 死锁 + P2×3/P3×5 → 修复后复审 APPROVE）；T707-2/3 各 APPROVE
- **遗留登记（待人工验收，真实凭据）**: ① 真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）；② 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持的 IdP）；③ 构建期配置凭据后按钮显示路径实测

---

## M7.2: 平台能力深化（已归档）

> 归档日期: 2026-08-12（T702/T704/T708/T709/T710 代码交付完成；T711 覆盖率冲刺进行中不归档；T705/T703 按用户指示延期至 backlog）
> 阶段摘要: 参见 [roadmap.md §M7](roadmap.md)
> 设计文档: [platform-scheduled-batch.md](../design/governance/platform-scheduled-batch.md)（T704，Review Gate Pass）

### T702 任务队列与并发控制（BullMQ + Redis + 渐进式降级） ✅

- **交付物**: 基于 BullMQ + Redis 的任务调度系统（异步扫描队列 + 并发控制 + 优先级 + 去重 + 重试）
- **实现决策**: D1 扫描异步化（入队立即返回 + 前端轮询；B 模式结果回填异步化）；D2 Redis 基础设施（本地本机 Redis / 生产 compose / 无 Redis 同步降级）；D3 worker 部署形态（独立进程 / in-process worker / 同步降级三态）
- **实现内容**: 子任务 1（队列基础设施）：redis.ts 连接封装（lazyConnect + ping 探测）+ scan-queue.ts（BullMQ jobId 去重 + priority 1/5/10 + 指数退避）+ scan-worker.ts + queue-mode.ts 模式决策纯函数（14 例单测）；子任务 2（扫描 API 异步化）：scan.post 三态（入队/pending/同步）+ runScanForRepository 拆分 + repos.vue 轮询（2s）+ queue.service.ts 惰性单例 + 真实 Redis 7.4.1 集成测试 4 例（入队→消费/去重/终态重建）；子任务 3（部署运维）：docker-compose redis:7-alpine + NUXT_REDIS_URL/QUEUE_*/IN_PROCESS_WORKER env + .env.example
- **验收**: 单测 106/106 + e2e 23 用例；降级路径实测（Redis 3.0 version_too_old → sync completed）；队列闭环真实 Redis 集成测试；修复 jobId 冒号限制（scan- 前缀）与 parseQueueEnabled 布尔解析两个冒烟缺陷
- **提交**: 93057088（T702-1）+ d909b89c（T702-2）+ 57a84a1c（T702-3），双轮 Review Gate APPROVE
- **非目标**: webhook 触发（队列优先级预留 5，登记 backlog）、跨实例分布式锁的精细调优（BullMQ 默认即可）
- **遗留登记（待人工验收）**: HTTP 层 pending→running→completed 状态流转 + 前端轮询体验（需后台服务/staging 环境）

### T704 定时扫描与批量处理（cron 调度 + 批量选择 + 聚合报告） ✅

- **交付物**: 定时调度 + 批量执行 + 聚合报告（到点自动触发 + 多仓库一次执行 + 跨仓库统计）
- **实现决策**: D1 双模调度（BullMQ upsertJobScheduler / node-cron 降级）；D2 4 种仓库选择策略（all/organization/tag/explicit + tags JSON 列）；D3 聚合轮询更新（无 Worker 回调）；D4 tags JSON 字符串列
- **实现内容**: 子任务 1（数据模型）：Schedule/BatchRun 实体 + Repository.tags + ScanRun.batchRunId + Zod 校验（scheduleSchema 交叉校验 + cronIsValid 5/6 段 + isValidTimezone，23 例单测）；子任务 2（调度服务 + API + 前端）：scheduler.service 双模单例 + selector 4 策略权限隔离 + Schedule CRUD + 手动触发 + /schedules 页面（15+29 例单测）；子任务 3（批量执行 + 聚合报告）：batch-scan API + batch-runs 列表/详情 + 聚合统计纯函数 + scheduled-scan processor + repos 复选框批量扫描 + /batch-runs 页面 + e2e 闭环
- **验收**: platform 单测 179 过/4 条件跳过 + e2e 25 用例 + lint/typecheck/build；修复 e2e 根因（NUXT_QUEUE_ENABLED destr 布尔解析）；Review Gate 3 分区并发 + 复审（B1 聚合写回覆盖 failed 终态等 4 项关闭）
- **提交**: 9f13aa0b（T704-1）+ 55fa20a9 + 45c3d3cf（T704-2）+ b830630e + ee0f533f + d6112649 + 81969be6 + d2898023 + 35b2e95c（T704-3）
- **非目标**: webhook 触发（T702 预留 priority=5）、标签管理独立 UI（tags 经仓库编辑表单输入）、定时计划执行历史趋势图、邮件通知（SMTP 配置依赖，登记后续）、跨组织批量选择（随多租户 backlog）
- **遗留登记（待人工验收）**: ① async 定时触发集成测试（BullMQ upsertJobScheduler 短间隔验证，需 Redis >= 5）；② Schedule CRUD e2e 补覆盖（当前单测覆盖，e2e 未覆盖）

### T708 国际化 i18n（全平台 UI 双语 zh-CN / en-US） ✅

- **交付物**: 全平台 UI 双语（zh-CN 默认 / en-US /en 前缀）+ 语言切换/检测/本地化格式
- **实现决策**: D1 @nuxtjs/i18n v10 + prefix_and_default；D2 检测优先级 URL > Cookie > 浏览器 > 默认；D3 偏好存 Cookie（多设备同步登记 C37）；D4 PrimeVue locale 联动；D5 datetime/number 格式本地化
- **实现内容**: 子任务 1（基建）：@nuxtjs/i18n 10.6.0 + primelocale 2.4.0 + localeDetector（resolveLocale 纯函数 7 例）+ 语言包骨架 40 键 + 切换器 + PrimeVue 联动插件；子任务 2（认证框架）：login/register/settings/users/dashboard/index 六页面文案抽取（153 键）；子任务 3（业务大页）：repos/schedules 文案 t() 化（288 键，batchModeOptions 响应式）；子任务 4（其余业务+收尾）：alerts/credentials/batch-runs/runs 抽取（410 键）+ d() 日期格式统一 + detectBrowserLanguage 修复 + e2e 基建（hydration 等待/Origin 头）+ i18n e2e 3 用例
- **验收**: 单测 186/190 + e2e 28 用例 + lint/typecheck/build；全平台用户可见中文零命中（含全角标点口径）；README 补 i18n 说明
- **提交**: 4 子任务分批提交（基建 / 认证框架 / 业务大页 / 其余收尾），逐批 Review Gate Pass
- **非目标**: 服务端 API 错误消息 i18n（C36）、语言偏好多设备同步（C37）、第三方语言
- **已知边界**: localeDetector 执行面当前未激活（@intlify/h3 惰性绑定，平台无服务端 useTranslation 调用），TypeError 隐患已消除但端到端触发验证待服务端翻译场景引入时覆盖

### T709 治理规范收敛：验证分级矩阵与分级审计执行协议去冲突 ✅

- **交付物**: 消除两套分级体系冲突（同一张表三处重复抄写、两维关系未声明、默认 deep 覆盖不一致）
- **实现内容**: ai-collaboration.md §1.3 升级为 audit-depth 唯一权威协议；code-reviewer SKILL / code-auditor agent / full-stack-master agent+skill 收敛为一行引用（补"未声明默认 deep"）
- **验收**: 全库 grep 单点声明 + lint:md + check:links（115 文件）+ 编号扫描零命中；deep 审计 Pass
- **提交**: 单批（2026-08-12）

### T710 CI lint 警告清理（10 → 0） ✅

- **交付物**: pnpm run lint 警告 10 → 0（test/release/docker 三工作流恢复绿）
- **实现内容**: 批次 1+2（templates.ts 未用参数 + no-dynamic-delete 重建 + overrides-io 拆分）；批次 3（processRepoForFix 681 行拆 repo-fix.ts/repo-alerts.ts）；批次 4（3 个 >1000 行测试文件拆 describe + test-helpers）；批次 5（repos.vue 980 行拆 ImportReposDialog.vue）
- **验收**: 全仓 lint 0 警告；全量测试无回归（core 129 + engine 764 + platform 186/190 + e2e 28）
- **提交**: 8f95a2ec + 660362fb + e9998354 + 4ee9cf59

### 遗留登记（归档时点）

- **转入当前任务 [todo.md](todo.md)**: T711 覆盖率冲刺（进行中，口径修正已完成，分阶段补测中）；T705 生产级部署 / T703 跨平台 Git（已延期，见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)）
- **待人工验收（真实环境）**: T701 真实凭据 3 项（OAuth 闭环 / OIDC 闭环 / 配置显示路径）；T702 HTTP 层状态流转 + 前端轮询；T704 async 定时触发集成测试 + Schedule CRUD e2e
- **已知边界（归档时点）**: 见 [todo.md 已知边界](todo.md) 与 [backlog.md](backlog.md)（C26/C28/C29/C30、C33、C34、C36/C37、B1/B2、T904/T905/T906、D1/D2/D3/D8 触发条件项）

---

## T711: 覆盖率口径修正 + 冲刺至 80%（已归档）

> 归档日期: 2026-08-14（2026-08-12 启动 ~ 2026-08-13 达成，独立于里程碑的质量冲刺）
> 阶段摘要: 参见 [roadmap.md](roadmap.md)
> 完成记录: 见下方；冲刺执行方法见 [testing.md §5.1 覆盖率冲刺执行方法](../standards/testing.md)

**阶段成果**: 覆盖率统计口径修正（coverage.include 5 段 + thresholds 四维 80%）+ 分阶段补测至四维全部 ≥ 80%——**Statements 85.89% / Branches 80.6% / Functions 85.51% / Lines 85.96%**（2026-08-13 全量 checkpoint，`pnpm run test:coverage` 零 ERROR，1494 passed / 4 skipped，lint 0/0 + typecheck 全过）。

### 阶段 1 scripts 提升至 80% ✅（2026-08-12）

- scripts 33.7% → **Stmts 81.8% / Branch 80.59% / Funcs 83.08% / Lines 81.76%**（四维达标）；全量 1363 passed / 4 skipped 无回归
- 批次：1a（b57d476b distill/sync）→ 1b（ce336a90 check-links）→ 1c（fd6a2074 auto-version/tag-released）→ 1d（47459b4a 发布脚本 main）→ 1e（f3ed43c2 release-publish main）→ 1f（538f268e create-release-plan）→ 1g（6bd81b1d changelog mergeUnreleased），每批 Review Gate Pass
- 已知边界：release-version main 写回真实 package.json 不可测（放弃，61%）；changelog 顶层循环依赖本地 tag 短路 / npm 可达（离线 CI 需注意）；isPreMajor 测试断言 0.x 与真实版本耦合（1.0.0 发布后需同步更新，登记 Note）

### 阶段 2 apps/platform/server 补测 ✅（2026-08-12）

- api 路由层 16/22 handler 覆盖（除 auth/[...].ts better-auth 代理外全部）+ 服务层 7 文件
- 测试基建：`apps/platform/tests/api-helper.ts`（h3 event 构造 + expectError + :memory: SQLite）+ `setup-nuxt-server.ts`（5 个 Nuxt auto-import 注入）+ vitest setupFiles
- checkpoint：Statements 81.53% / Lines 81.59% / Functions 80.61%（三达标）/ Branches 76.38%（未达标，阶段 4 攻坚）；1434 passed / 4 skipped

### 阶段 4 全局收口 ✅（2026-08-13）

- branches/functions 维度补强（scan-orchestrator / utils/auth / typeorm-adapter / queue 服务 / branch-cleanup / pnpm-audit-fetcher 等）
- 最终 checkpoint：**Statements 85.89% / Branches 80.6% / Functions 85.51% / Lines 85.96%**——四维 ≥ 80%，1494 passed / 4 skipped
- 阶段 3（cli 入口/app 层）已无必要（全局达标），标记跳过

### 遗留登记（归档时点）

- 补测候选（审计 suggest）：typeorm-adapter createdAt 同毫秒 flaky、transaction 回滚断言、redis error 监听断言、queue close disconnect 断言——按需随后续任务补
- 待人工验收：见 [todo.md 待人工验收](todo.md)

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



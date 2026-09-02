# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 | 状态 |
|------|------|--------|:----:|
| M0: 基线收敛 | Monorepo 骨架、配置模型、工具链策略、告警模型 | P0 | 已完成 |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 | 已完成 |
| M2: GitHub Action 接入 | workflow_dispatch + 定时 + PR + AI Token + Prompt 防护 | P1 | 已完成（2026-08-05 归档；G2 处置闭环） |
| M3: Code Scanning 扩展 | 规则分级、可模板化修复、建议输出 | P1 | 已完成（2026-08-06 归档；T301-T305 全部完成） |
| M4: 多仓库治理 | 自动发现、并发控制、报告归档 | P2 | 已完成（2026-08-06 归档；T401-T404 全部完成） |
| M4.5: 跨线升级显式授权 | `--allow-major-upgrade` 跨线告警显式授权自动升级（仅 CLI，实例复核 + 完整验证 + 回滚） | P2 | 已完成（2026-08-07 归档；T405 完成） |
| M4.6: Monorepo 成员级修复 | workspace 成员包直接依赖告警自动升级（T406 成员级修复器 + T407 分流接线） | P1 | 已完成（2026-08-07 归档；T406/T407 完成，Review Gate 三审 PASS） |
| M5: AI Breaking Change 研判 | Changelog 采集、LLM 研判、修复生成、质量门、CLI 解耦 | P1 | 已完成（2026-08-07 归档；T501-T506 全部完成，903 tests，Review Gate 每任务独立审计） |
| M5.5: Skill 编排（CLI 先行） | 产品 skill 分发（npx skills 主通道 + 自研兜底）与主流 agent 工具接入，MCP 为后续增强后端 | P2 | 已完成（2026-08-07 归档；T506-T508 完成，929 tests，Review Gate 每任务独立审计 PASS） |
| M6: 最小平台 MVP | 仓库管理、凭据管理、仪表板、MCP Server、Docker 部署 | P1 | 已完成（2026-08-08 归档；T601-T605+T607 全部完成，991 tests） |
| M7: 企业级平台增强 | M7.1 认证与用户体系（RBAC+用户管理+个人界面、OIDC SSO / GitHub·Google OAuth、邮箱域名黑白名单）；M7.2 平台能力深化（BullMQ+Redis、定时批量、i18n、生产部署、跨平台 Git、MCP 发布） | P2 | 已归档（M7.1 2026-08-10 / M7.2 2026-08-12，T702/T704/T708/T709/T710/T706 完成；T705/T703 延期 2026-08-12；后续任务 T711 覆盖率冲刺） |
| M8: 安全加固与容器执行完备 | 兑现沙箱安全治理决议（G2-G7）：容器工具链补齐（C45）、验证命令单命令超时（C41）、凭据权限面检查（C42/C39）、供应链信号披露（C43）、外联审计日志（C40）、规范挂接 review 检查点（C44） | P0-P2 | 已完成（2026-08-14 归档；T801-T806 全部完成，20 个提交本地待推送） |
| M9: i18n 基建同步 | 从 momei 同步 i18n 治理规范与审计脚本（缺失 key / 动态 key / 重复文案 + vue-i18n 专项 lint + docs 防回流），为 i18n 优化铺路 | P2 | 已完成（2026-08-18 归档；T901-T906 全部完成，5 个原子提交覆盖 6 任务，2556 行 inserts / 2539 行净增；翻译内容与多语言扩展留后续阶段） |
| M10: 独立沙箱容器 C26 实施规划 | 兑现沙箱治理决议 G5——Docker rootless runtime + 应用层白名单代理 + cgroup v2 资源限制 + Node 20 自动识别；`SandboxExecutor` 与 `ContainerExecutor` 并存；自托管 docker-compose 优先 / K8s+Helm 仅规划 | P1 | 已完成（2026-08-20 归档；T1001 B1+B2 + T1002 + T1003 + T1004 全部 commit，13 commits 待推送；设计收口于 executor-sandbox.md §7 + sandbox-security-governance.md §5 G5 + quick-start.md §启用 rootless sandbox 执行；T912 主体同步归档，T912-3 合并入 C28） |
| M11: 业务可见性 + 沙箱落地 + 安全文档 | 由 C53 闭环触发启动 ① 业务可见性：C53 已闭环（push + PR 闭环 + runUrl 兜底）+ C56/C57/C58 平台 UX 用户反馈；② 沙箱落地：T1005 sandbox 路由接线（M10 实施规划遗留）；③ 安全文档：C28 security.md §凭据加密存储章节 + T912-3 邮件发送安全 + 凭据权限阶（§5.4）；④ 通知基建：C-ENV-CHANGE-ALERT（环境容器变化告警） | P1 | 已完成（2026-08-20 归档，22 commits：M11 启动批次 10 commits + M11 推进批次 12 commits；C58 + C-ENV-CHANGE-ALERT 两轮深度 standard Pass；详见 [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) 详细归档） |
| M12: 平台 UX 一致性 + i18n 治理 | 承接 2026-08-21 用户实测反馈 10 项平台 UX / 安全 / i18n 问题：① 用户管理安全 + 角色 i18n（C65-A，P1：admin self-protection 前端/服务端强制拦截 + 角色标签 i18n）；② i18n 单点声明治理（C65-B，P2：jiti vs Nuxt transform pipeline 双文件拆分）；③ schedules 增强（C65-C，P2：cron 表达式预览 + 时区选择框）；④ 平台表格 / 视图增强（C65-D，P2：env-events sortable + alerts 双 chevron 修复 + alerts 视图切换 + alerts 图表去重） | P1-P2 | 已完成（2026-08-21 归档，19 commits（C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2）；全部推送至 origin/master / ahead=0 / branches 80.02%；详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)，2026-08-28 M17 归档批次预防性分片迁出） |
| M13: 治理 + UX 反馈 + 网络治理 + Code Scanning | 承接 M12 闭环后 backlog 治理前置 + 2026-08-25~26 用户实测反馈 5 项 UX 问题：① 治理前置（M13.1，P0+C1+C2：wisdom 蒸馏 27→14 + neat-freak 批次挂接 standards；实测反馈 UX bug 5.1 单仓库扫描互斥修复 + 5.2 历史 Dialog X 按钮误触修复）；② 网络治理 + 告警去重（M13.2，P1+B2：network-audit 默认白名单可持续治理 G1 + 告警跨次扫描去重实测反馈 6 + changelog 机制治本 c811659 回归）；③ Code Scanning 规则化 + CQL（M13.3，P2：C16 规则分类配置化 + C21 code-quality-findings 接入）；④ UX 反馈批次立刻做（M13.4，P1：T1401 失败原因展示 + T1402 alerts UI ruleId 列 + T1403 dedupe 默认跨次去重，2026-08-26 实测截图 6 项中选 3 项低风险；其余 3 项进 backlog 暂缓 UX-R1~R3） | P0-P2 | 已完成（2026-08-26 归档，26 commits（M13.1 5 + M13.2 11 + M13.3 5 + M13.4 5）；ahead=3 仅 M13.4 三 commits 待用户推送（T1401+T1402+T1403+todo.md 收口）；全部 commit 含 12 子任务闭环 + CI 阈值回归修复 e63cdb9 + 9 轮独立 Review Gate Pass；详见 [todo-archive.md §M13](archive/todo-archive-phases-m13.md)） |
| M14: platform 进入 release 通道 + UX 反馈跟进 | 让 `apps/platform` 作为第 6 个发布单元参与 release 链路但**不发 npm**——仿 momei 单包"独立 version + 独立 CHANGELOG"的精神，适配 dependfix monorepo + docker-only 平台 + 承接 backlog UX-R1 扫描历史分页（用户实测反馈痛点）+ M13.4 T1403 follow-up + neat-freak 治理批次：① `scripts/packages.config.mjs` 注册 apps/platform 条目（`npmPublishable:false`）；② `scripts/release-publish.mjs` 新增 tag-only action；③ `docker.yml` 支持 workflow inputs 读 platform_version；④ `release.yml` 完成后触发 docker workflow_dispatch；⑤ `docs/guide/release.md` 平台独立通道文档；⑥ dependabot 排除 `apps/platform/package.json`；⑦ `/api/runs` 新增 `page`/`pageSize`/`ids` 分页参数 + `{items, total, page, pageSize}` 返回结构；09 4 个前端调用方适配（RepoHistoryDialog PrimeVue Paginator + alerts.vue + repos/[id]/runs.vue + i18n）+ silent bug 修复（alerts sidebar ids 参数）；⑩ alerts-rowgroup.e2e 新增首屏默认 `dedupe=across` 请求 URL 断言；⑪ wisdom 蒸馏挂接 3 条 M14.x pattern；⑫ C34 存量规范必级条款挂接盘点 + code-quality-checklist.md 双层对称补挂接 5 个必查项；⑬ admin/i18n e2e C65-A1/A2/A3/A4 test 名孤立编号清理；⑭ git.md §3.4 后双空行格式修复；⑮ M14.y 依赖批量治理（4 个 dependabot major PR）| P1 | 全部完成（M14.1 T1310 F 阶段闭环 ✅ 2026-08-26 落地 7 commits / M14.2 UX-R1 扫描历史分页 ✅ 2026-08-26 落地 5 commits / M14.3 M13.4 T1403 follow-up ✅ 2026-08-26 落地 1 commit / M14.x neat-freak 批次 ✅ 2026-08-26 落地 5 commits / M14.y 依赖批量治理 ✅ 2026-08-26 闭环 4 个 dependabot major PR；M14 阶段 19 commits 全部落地，ahead=0，`git rev-list HEAD ^origin/master --count` 实证核验；详见[archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)，2026-08-31 M19 归档批次预防性分片迁出至分片） |
| M15: 扫描历史详情侧栏增强（UX-R2） | 承接 M14.2 UX-R1 后的 UX-R2：让去重告警 Sidebar 展示运行短 ID、模式、严重级别阈值、执行器、告警数、开始时间与持续时间，按执行器显示 GitHub Action 外链；新增独立 `RunDetailDialog` 复用 `GET /api/runs/:id`；**不**实现 UX-R3 `/scans` 页面 / **不**修改 `/api/runs` 后端契约（M14.2 已闭环 / 仅消费既有契约）/ **不**动 `RepoHistoryDialog.vue` / **不**做数据层去重 / **不**升 PrimeVue。4 子任务（M15.1 UX-R2-A / -B / -C / -D）全部独立闭环 | P1 | 已完成（2026-08-26 归档；3 commits ahead 待用户推送：`5c65177` P 阶段 docs 切换 + `1112017` feat 实施（5 文件 / +425/-12：A/B/C + utility 抽取 + i18n 7 键 + `runs.statusDegraded`，实证 `git show --stat`）+ `0a60e3d` test 覆盖 D（2 文件 / +251：16 case 单测 + 2 case e2e，不含 utility/i18n）；2 轮 code-auditor quick depth Pass；不进 M16 / UX-R3 顺延 M16 待 P 阶段规划；详见 [archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)，2026-08-31 M19 归档批次预防性分片迁出至分片） |
| M16: 平台可用性深化 | 把 `apps/platform` 从 demo 落地为实际可用项目；覆盖 5 项 UI/API/技术债痛点——M16.1 UX-R3 `/scans` 页面（含 `/api/runs` 组织隔离）/ M16.2 C66-D alerts "立即修复此仓库" 入口（reuseScanRunId）/ M16.3 C36 服务端 API 错误消息 i18n / M16.4 PrimeVue hydration 主线 #1 缓解（alerts 迁移 useAsyncData）/ M16.5 T701-e2e 管理端点集成测试补强 | P1 | 已完成（2026-08-28 归档；M16.1 + M16.2 + M16.3 + M16.4 + M16.5 D 阶段均已实施 + A 阶段 standard depth Pass；M16 全部 5 项闭环；**ahead=0 已全部推送至 origin/master**（M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5 = 19 commits，含 kebab-case rename refactor `acfdc8d8` 触发的 CI Coverage 修复批次；`git rev-list HEAD ^origin/master --count` 2026-08-28 实测 ahead=0）；branches coverage 80.27% → 85.67%（远超 80% CI 阈值）；5 轮独立 Review Gate Pass；详见 [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)） |
| M17: 安全与可用性收口 | 承接 M16 闭环后 backlog 4 条目（安全性 + i18n + 测试基建）：M17.1 C38 encryptionKey 标准化统一 `NUXT_ENCRYPTION_KEY` 路径（service 直读 env → runtimeConfig + nuxt.config 移除 inline fallback + 同步更新 docker-compose / .env.example + playwright 临时兜底删除；P1 安全硬缺口）/ M17.2-4 服务端 API i18n 范围外扩展（沿用 M16.3 C36 已沉淀 `createLocalizedError` 模式，10 文件分 3 子阶段 credentials / schedules / batch-runs + repos batch；P2 沿用）/ M17.5 S-2 `authedCookieHeader` 抽取至 `tests/e2e/helpers/`（纯重构 + 用户指令 lint auto-fix 接受；P3 测试基建清理）/ M17.6 S-4 better-auth admin viewer role check 单测补强（`ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` 5 端点 viewer 403 单测；P3 测试完整性）| P1-P3 | 已完成（2026-08-28 归档；M17.1 + M17.2 + M17.3 + M17.4 + M17.5 + M17.6 D 阶段均已实施 + A 阶段 6 轮独立 Review Gate Pass 含 M17.4 commit 2 standard depth Reject 后补修闭环；M17 全部 6 子阶段闭环；**ahead=0 已全部推送至 origin/master**（M17.1 1 + M17.2 1 + M17.3 1 + M17.4 2 + M17.5 2 + M17.6 1 + session 收尾 1 = 9 commits；`git rev-list HEAD ^origin/master --count` 2026-08-28 实测 ahead=0——校正 session 文件 stale `ahead=8` 描述）；含 M17.4 commit 2 audit Reject 7 个 typecheck error 后针对性补修闭环（M17 session 关键教训：nuxt typecheck 不实测不能信 Done 输出）+ M17.5 lint-fix 独立 chore commit + session 收尾治理 commit `9bdb2dc`（8 条 pattern/principle 沉淀至 standards/testing.md §6 + standards/git.md §3.5 + standards/ai-collaboration.md §1.4/§4.4/§4.6 + code-auditor.agent.md）；详见 [archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口m171m172m173m174m175m176-全部已闭环--2026-08-28-归档)） |
| M18: 平台 GitHub App BYO App 模式 | 承接 M17 闭环后 backlog §org 增强 §C22 上收为待实施主条目（2026-08-28 用户实测触达：自部署平台管理员视角 classic PAT `repo` scope 权限过大、可直接推送代码超出"自动修复"预期风险；fine-grained PAT 需逐仓库勾选 + SSO 流程繁琐、离职轮换管理困难）；定位 PAT 保留为默认快速上手路径 + GitHub App 作为自部署平台进阶选项，二者并存不替代。GitHub App 增量价值：installation 范围限定（按仓库授权限）+ 1h 短时 installation token 自动轮换 + 真实 `[bot]` 身份 + per-installation 审计日志。5 子阶段拆分 + 1 治理批次：M18.0（P0 docs only，PAT 无感升级评估）+ M18.1（P1，C22.1 基础层：credential 扩展 4 字段 + AuthProvider 抽象层 + installation token 缓存）+ M18.2（P1，C22.2 集成层：pushFixBranch token 切换 + commit author 动态化 + 审计字段）+ M18.3（P2，C22.3 表现层：UI GitHub App tab + 文档引导 + Manifest flow 可行性评估）+ M18.4（P1，C22.4 测试层：单测补强 + e2e mock JWT signing 全链路）+ M18.x 治理批次（P3 合并入 C22 子阶段顺手做：S-5/C39/C34/S1/S2/S-3/S-4） | P0-P3 | 已完成（2026-08-30 归档；M18.0 1 + M18.1 5 + M18.2 2 + M18.3 6 + M18.4 2 + M18.x 8 = ~24 commits 已全部推送至 origin/master ahead=0；含 M18.4 audit round 1 Reject 后针对性补修闭环；详见 [todo-archive.md §M18](archive/todo-archive-phases-m18.md#m18-平台-github-app-byo-app-模式m180m181m182m183m184m18x-全部已闭环--2026-08-30-归档)） |
| M19: 治理 + 能力扩展 + 测试补强 | 承接 M18 闭环后 backlog 候选池，按"类型平衡"原则选取 5 项任务：技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项。M19.1（P3，技术债）C34 存量规范严格约束挂接盘点 / M19.2（P2，能力扩展）C23 发现规模上限 max-repos / M19.3（P2，用户体验）B1 PR 关闭评论 + label / M19.4（P2，测试覆盖）T701-e2e 管理端点集成测试补强 / M19.5（P2，用户体验）C8 per-source 错误隔离 | P2-P3 | 已完成（2026-08-31 归档；5 atomic commits 已全部推送至 origin/master ahead=0 —— M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671`；5 轮独立 Review Gate Pass —— M19.1 quick / M19.2 standard / M19.3 standard / M19.4 quick / M19.5 standard；本批次清理 backlog 5 个已上收主条目：B1 / C23 / C8 / T701-e2e / C34；详见 [todo-archive.md §M19](todo-archive.md#m19-治理-能力扩展-测试补强m191m192m193m194m195-全部已闭环-2026-08-31-归档)） |
| M20: ScanResult 数据模型重构 | per-alert 模型 + reconcile + API 简化 + UI 调整 + backfill 脚本 | P2 | 已完成（2026-08-31 归档；M20.1/M20.3/M20.5/M20.6/M20.7 全部闭环，8 commits） |
| M21: 治理收口 + 能力扩展 + 测试补强 | 承接 M20 闭环后 backlog 候选池 + M18.x 治理剩余风险；4 项任务按类型平衡原则：M21.1（P3，🛡️ 治理）Code Scanning RG-W01 + RG-W02 `execFileSync` 替换 `execSync` 2 处 / M21.2（P3，🛡️ 治理）M18.x 剩余风险 W1 + W2 + audit suggest 1+2 集中清理 / M21.4（P3，🚀 能力扩展）B3 PR 自动合并闭环 / M21.5（P3，🧪 测试覆盖）T704 async 定时触发 + Schedule CRUD e2e 补强（M21.3 重复登记——S-5 已由 M18.x commit `878ae1a` 闭环，本批次删除） | P3 | 已完成（2026-08-31 归档；M21.1 + M21.2 + M21.4 + M21.5 全部 4 子阶段闭环；11 atomic commits 实施 + 4 docs 收口 = 15 commits 已全部推送至 origin/master ahead=0；详见 [todo-archive.md §M21](todo-archive.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)） |
| M22: SQLite 数据保护防御加固 | 2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故（代码内未找到清空路径，最可能清空来源在代码外部——shell/CI/运维/误操作）。事故暴露 5 条可加固设计风险（详见 [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)），按 [规划规范 §1.1 任务粒度约束](../standards/planning.md) + 类型平衡原则拆 **6 原子条目独立闭环**：M22 沉淀（P0，🛡️ 治理）阶段登记 + 事故复盘 + 5 防御规范挂接 / M22.1（P0，🛡️ 治理）SQLite 启动期自动备份 hard requirement（backup.ts + ensureDatabaseInitialized 之前同步调用 + fsync/rename 写安全 + 保留策略 + fail-open）/ M22.2（P0，🛡️ 治理）db-restore 命令式恢复（`--from` + `--yes` 双门控 + 覆盖前自动备份 + 旁文件清理 + 前后 integrity_check）/ M22.3（P1，🛡️ 治理）db-doctor 自检工具（文件元信息 + 10 项 PRAGMA + 各表 COUNT(*) + 六类结论判定 + 人读机读双模）/ M22.4（P1，🛡️ 治理）TypeORM synchronize 显式 opt-in + 启动日志 / M22.5（P1，🛡️ 治理）TypeORM migrationsRun 显式 opt-in + 默认改为 false / M22.6（P1，🛡️ 治理）e2e/fixtures 端点双门控 + runtimeConfig 兜底防 esbuild 折叠 | P0-P1 | 已完成（2026-09-01 归档；M22 沉淀 + M22.1 + M22.2 + M22.3 + M22.4 + M22.5 + M22.6 全部 6 原子条目闭环；9 atomic commits 实施 + 4 docs 收口 = 13 commits / ahead=7 待用户主动推送（`git rev-list HEAD ^origin/master --count` 2026-09-01 实测）；含 M22.4 Round 1 Reject（migrationsRun 默认值越界落地）+ M22.6 Round 1 Reject（Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱）→ 修订为 runtimeConfig 兜底；详见 [todo-archive.md §M22](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)） |
| M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强 | 2026-09-02 用户决策启动，承接 M22 闭环 + M22.7+M22.8 hotfix 衍生根因治理债 + backlog §C66 告警视图增强（2026-08-25 用户实测反馈）+ 测试基建清理；按"类型平衡"原则（治理 1 + 根因 2（治理相关）+ 能力 1 + 测试 1）拆 **5 原子条目独立闭环**：M23.0（P2，🛡️ 治理）M22 neat-freak 收敛（security.md §2.1 权威 + development.md §5.1.18 / platform.md §3.7 收敛为引用）+ wisdom 21 条蒸馏 + 4 条 pattern 挂 standards（code-auditor 「构建产物 grep 兜底」必查项 / development.md §5.1.20 atomic commit 边界 / ai-collaboration.md §4 PDTFC+ CI 偶发错误三阶段协议 / testing.md e2e 未认证 API 调用标准模式）/ M23.1（P1，🛡️ 治理/治本）M22.7 ECONNRESET 根因排查（4 候选按 ROI 选 1：推荐 SQLite WAL 模式切换）/ M23.2（P1，🛡️ 治理/治本）M22.8 Playwright fixture pool cookie 注入根因排查（3 候选按 ROI 选 1：推荐 fixture pool `test.use → browser.newContext` 注入路径源码实证）/ M23.3（P2，🚀 能力扩展）C66 告警视图增强 A1+A2+C+D 4 子任务（ScanResult ghsaId/cveIds + fetcher 透传 + alerts UI Identifiers 列 + reuseScanRunId fix 模式；B1 数据层去重暂缓）/ M23.4（P3，🧪 测试补强）T1 cron-preview wall-clock 依赖消除（范围收敛：T2 + T3 已由 M21.1 commit `0a83c74 + a77e557` + M21.2 commit `fe7cc0f + ad376c8` 闭环） | P1-P3 | 启动（M23 P 阶段规划 2026-09-02 落地 todo.md + roadmap.md + backlog.md；前置：M22 hotfix commits 已推送至 origin/master；ahead 实证 `git rev-list HEAD ^origin/master --count`；D 阶段待用户触发） |

> **本路线图定位**：按 [规划规范 §2.1](../standards/planning.md) 仅维护阶段概览（目标 / 优先级 / 状态）。详细实施记录 / commit 引用 / 关键决策 / 经验教训见对应归档段（详见下方"## 详细任务"索引）。

## M0: 基线收敛

Monorepo 骨架搭建、核心配置模型、工具链版本策略固定、标准化告警模型定义。已完成。

> 详细任务与完成记录见 [archive/todo-archive-phases-m0-m1.md §M0](archive/todo-archive-phases-m0-m1.md#m0-基线收敛已归档)

## M1: MVP 单仓库自动修复

跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取、过滤、修复、验证和报告的全链路闭环。

**交付物**:
- `dependfix` CLI —— 通过 `npx dependfix` 运行
- `@dependfix/core` —— 作为独立 npm 包发布
- 三条命令：`report`（报告）、`fix`（修复+验证）、`fix-and-pr`（参数预留）
- 本地文件变更，不推送不创建 PR

> 详细任务见 [archive/todo-archive-phases-m0-m1.md §M1](archive/todo-archive-phases-m0-m1.md#m1-mvp-单仓库自动修复已归档)

## M2: GitHub Action 接入

将 M1 能力接入 GitHub Actions，支持 `workflow_dispatch` + `schedule` 触发，输出报告 artifact，支持创建修复分支与 PR。包含用户自定义 AI Token 支持和 Prompt 注入防护。

> 详细任务见 [todo-archive.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入已归档)
>
> **M2 已交付（2026-08-05 归档）**：消费者仓库可通过 `uses: dependfix/dependfix@v1` 一行接入安全告警自动修复（fix-and-pr 默认、PR 去重、分支清理、分组升级、pnpm audit fallback）。G2 处置闭环：Dependabot alerts 需 PAT（`security_events` / `Dependabot alerts: read`）或 GitHub App token；Code Scanning 对 GITHUB_TOKEN 可访问（T-G2-2 已验证）。

## M3: Code Scanning 扩展

接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

> 详细任务见 [todo-archive.md §M3](archive/todo-archive-phases-m2-m55.md#m3-code-scanning-扩展已归档)
>
> **M3 已交付（2026-08-05 归档）**：Code Scanning alerts 与 Dependabot 并行采集（`--code-scanning` / `DEPENDFIX_CODE_SCANNING` / action `code-scanning` input），A/B/C 三级规则分层（自动修复 / 建议修复 / 仅报告），eol-last 自动修复闭环（T303），无法自动修复问题输出报告 + PR body 建议区块（T304），G1 工具链固定（T305）。
>
> **M3 收尾（2026-08-06）**：收尾修复批次（e1aad1e+c20218e，PR 标题动态化等 6 项）、env 前缀迁移（38722c5）、overrides 两轮复盘（89d8c508 / 06843b9d）、PR #27 反馈修复（a82f6580，PR body ✅ Fixed Alerts 告警级明细）。
>
> **前置（G2）已解除（2026-08-04 探针验证）**：Code Scanning alerts 对 GITHUB_TOKEN 可访问（HTTP 200，`security-events: read` 即可），M3 无需额外 token 方案；仅 Dependabot alerts 需要 PAT / GitHub App token。
>
> **规划要点（2026-08-05 启动）**：数据源**并行**而非回退（区别于 pnpm-audit）；复用 `SEVERITY_MAP` 的 code-scanning 映射与 fixers/code-scanning stub；G1（PIN_TOOLCHAIN stub）承接为 T305 并行任务。

## M4: 多仓库治理增强

支持 owner 级仓库自动发现、并发控制与失败隔离、仓库白名单/黑名单策略、报告归档与趋势统计。

> 详细任务见 [todo-archive.md §M4](archive/todo-archive-phases-m2-m55.md#m4-多仓库治理增强已归档)

## M4.6: Monorepo 成员级修复增强

workspace 成员包直接依赖告警的自动修复：成员 manifest 升级能力（T406）+ 告警分流与 app 接线（T407）。

> 详细任务见 [todo-archive.md §M4.6](archive/todo-archive-phases-m2-m55.md#m46-monorepo-成员级修复增强已归档)

## M5: AI Breaking Change 研判

Changelog / Release Notes 采集、多 AI 提供商封装、AI 研判（问题分类 + 修复方案 + 代码 patch）、AI 输出安全校验与质量门、CLI 解耦重构（平台化前置）。

> 详细任务见 [todo-archive.md §M5](archive/todo-archive-phases-m2-m55.md#m5-ai-breaking-change-研判已归档)
>
> **M5 已交付（2026-08-07 归档）**：T501-T506 全部完成——Changelog 双源采集（T501）、多 provider 研判引擎 + Zod 结构化输出 + prompt 注入防护（T502）、结构化 patch 应用与回滚（T503）、安全门 + 完整验证链（T504）、CLI 解耦平台化（T505）、app 触发接线 + 报告 aiUsage 聚合段（T506）。4 项规划决策（AI 提供商 / 触发时机 / Token 来源 / 成本默认值）已确认。903 tests。

## M5.5: Skill 编排（CLI 先行）

将 dependfix 的自动化修复能力封装为可分发的 Agent Skill（`dependfix-remediator`），通过 CLI 直接调用，支持主流 agent 工具（Claude Code / GitHub Copilot / Cursor / OpenCode）接入；MCP 作为后续增强执行后端（M6 T605/M7 T706，合并口径见 [todo-archive.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)），与 CLI 后端并存。

**背景与决策（2026-08-07 用户确认）**：MCP Server 原规划在 M6/M7 才落地，但当前 CLI 能力面（report/fix/fix-and-pr/cleanup-branches + 多仓库 + 双源 + PR 链路）已覆盖 MCP 规划的 4 个 tool（fetch_alerts / run_scan / fix_dependency / get_last_report）。skill 编排不依赖 MCP 即可工作；MCP 的增量价值是结构化 schema、无 shell 客户端覆盖与常驻进程批处理，属增强路径而非前置条件。

**生态决策（2026-08-07 补充）**：`npx skills`（vercel-labs/skills，2026-01 发布，28.1k stars）已成为主流 agent skills 安装方式（70+ agents、自动检测本机工具、无需提交 registry）——作为**主安装通道**（发布 = git push 仓库根 `skills/` 目录）；自研 `dependfix skills install` 仅作离线兜底。内部开发 skill（code-reviewer 等）以 `metadata.internal: true` 标记，不进入生态正常发现。

> **M5.5 已交付（2026-08-07 归档）**：产品 skill（`dependfix-remediator`）权威源与 CLI 编排（T506）、npx skills 生态主通道 + 自研兜底安装器（T507，本机 3 agent 实测 + 可见性矩阵 1/11）、MCP 双后端扩展点（T508，一致性断言清单）；`@dependfix/skills` 纳入发布与 CHANGELOG 体系。已知边界：GitHub 源端到端复验依赖 CI 裁决（本地网络受限）。

> 详细任务见 [todo-archive.md §M5.5](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)（编号说明：M5.5 T506-T508 与已归档 M5 的 T506 重叠，以"阶段 + 编号"全称区分）

## M6: 最小平台 MVP

在 M5 完成后交付一个可独立部署的集中管理平台的最小可用版本：仓库管理、凭据管理、手动触发扫描、仪表板、Docker Compose 部署。

> **G2 驱动**：凭据管理须支持 PAT（classic / fine-grained）与 GitHub App 双模型——GITHUB_TOKEN 无法读取 Dependabot alerts，平台扫描必须依赖显式凭据（见 [M2 分片 G2 处置记录](archive/todo-archive-phases-m2-m55.md#g2-处置记录github_token-无法访问-dependabot-alerts) 方案矩阵）。

> **规划要点（2026-08-07 启动，任务定义见 [todo-archive.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)）**：执行深度 A（平台容器完整修复链路）为主、B（触发目标仓库 Action）为降级；同步执行先行；MCP 保留并合并（T605 四 tool 完整交付）；沙箱问题重新评估（Q4=A 设计 + 容器内执行最小实现，T607 设计先行于 T603）；Action 触发实现 + 结果回填（C25 增强实现）。

> **M6 已交付（2026-08-08 归档）**：T601-T605 + T607 全部完成——Nuxt 4 平台骨架（T601）、仓库与凭据管理 AES-256-GCM 加密存储（T602）、扫描触发与结果存储（T603）、仪表板与告警视图（T604）、`@dependfix/mcp` MCP Server 4 tool（T605）、执行器设计与沙箱评估 + ActionTriggerExecutor（T607）；M6 增强：B 模式结果回填（C25）、同仓库扫描互斥锁、REGISTRATION_DISABLED。991 tests。CI Test 端到端裁决通过；Docker 镜像构建 CI 链路 **2026-08-18 暂缓裁决**（run 31862632207 双平台构建 23m 2s 成功完成证明当前 docker.yml 配置可稳定工作，恢复条件见 backlog C30）；平台 UI 暗色模式待修复（C29）。

> 详细任务见 [todo-archive.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)

## M7: 企业级平台增强（已归档）

拆两个子阶段（2026-08-09 规划定稿，需求澄清见 [archive/todo-archive-phases-m6-m7-t711.md §M7.1 + §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)）：

- **M7.1 认证与用户体系**（已归档 2026-08-10，见 [todo-archive.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)）：T701 RBAC + 用户管理 + 个人界面（三角色，决策 D1/D2/D3 已确认）、T707 认证扩展（`AUTH_MODE` 互斥二选一：enterprise OIDC SSO + 域名白名单 / public GitHub·Google OAuth + 域名黑名单）。设计文档：[platform-auth-users.md](../design/governance/platform-auth-users.md)（Review Gate Pass）。
- **M7.2 平台能力深化**（已归档 2026-08-12，见 [todo-archive.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)）：T702 BullMQ+Redis 任务队列（✅ 2026-08-10）、T704 定时扫描与批量（✅ 2026-08-11）、T708 国际化 i18n（✅ 2026-08-11）、T709 治理规范收敛 + T710 CI lint 清理（✅ 2026-08-12）、T706 MCP 发布（✅ 2026-08-12，`@dependfix/mcp@0.1.2`）；T705 生产级部署（PostgreSQL + Helm + Sentry）、T703 跨平台 Git（GitLab/Bitbucket）**已延期 2026-08-12**（用户指示，见 [backlog.md §延期 / 暂缓项](backlog.md#延期--暂缓项)）；T711 覆盖率冲刺已归档（✅ 2026-08-13 四维 ≥ 80%，见 [todo-archive.md §T711](archive/todo-archive-phases-m6-m7-t711.md#t711-覆盖率口径修正--冲刺至-80已归档)）。

## M8: 安全加固与容器执行完备（已归档）

> **背景（2026-08-14）**：安全专项评估确认"dependfix 自身不得成为漏洞扩散工具"为核心原则（[沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md)）。威胁链建模识别 4 条扩散路径（A 合法包投毒 / B 恶意仓库 owner 扫描 / C PR 合入流向下游 / D M7 并发共享容器），登记治理决议 G1-G7。G1（C38 容器执行进程非 root 降权）已修复（2026-08-14，`eb8f3c59`）；实证发现容器内 git/pnpm 工具链从未安装（C45，ContainerExecutor fix 链路实际不可用）。
>
> **M8 已归档（2026-08-14）**：T801 容器工具链补齐（C45，P0）→ T802 验证命令单命令超时（C41）→ T803 凭据权限面检查 + 本地模式防线（C42/C39）→ T804 供应链信号披露（C43）→ T805 外联审计日志（C40）→ T806 规范挂接 review 检查点（C44）。任务详情与验收见 [archive/todo-archive-phases-m6-m7-t711.md §M8](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)（2026-08-19 归档文档从 todo.md 主文档迁出；2026-08-20 neat-freak 批次从 todo-archive.md 主窗口迁出至分片）；沙箱治理决议 G5（C26 独立沙箱容器）已激活为 [archive/todo-archive-phases-m10-c53-c59c61.md §M10](archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划已归档) 实施规划（2026-08-20 收口归档）
>
> **M8 移交下一阶段候选（backlog 登记）**：C26 独立沙箱容器（网络出站白名单 + cgroup + 每任务容器，BullMQ worker 结合）、C30 镜像构建 CI 链路裁决（⏸️ 2026-08-18 用户决策暂缓——见 backlog C30）、C28 凭据加密存储文档章节、C29 平台 UI 暗色模式。

## M9: i18n 基建同步（已归档）

> **背景（2026-08-15）**：momei 已沉淀成熟的 i18n 治理体系（语言分级 / freshness 分层 / 缺词 blocker / 动态 key 白名单 / 重复文案审计 / vue-i18n 专项 lint），dependfix 平台（M7.2 T708）已有基础 i18n（zh-CN + en-US 双语）但缺审计门禁与治理规范。M9 同步基建铺路，翻译内容留后续阶段。
>
> **M9 已交付（2026-08-15 代码与脚本 / 2026-08-18 文档归档收口）**：T901 规范同步 → T902 脚本同步（4 个 audit + 1 个 shared CLI）→ T903 脚本测试（75 例）→ T904 npm scripts + `@intlify/eslint-plugin-vue-i18n` 独立 lint 接入 → T905 CI 接入（test.yml 3 个新步骤）→ T906 文档收口（scripts/README + todo/roadmap）。5 个原子 commit（按 T901→T906 任务顺序：`49438f5` → `a4d1668` → `077823c` → `eae70cf` → `a61becc`；`077823c` 时间在 M9 主体前 9 小时跨 M8/M9 边界被 M9 复用），合计 2556 行 inserts / 2539 行净增。规划决策与验收详情见 [todo-archive.md §M9](archive/todo-archive-phases-m11.md#m9-i18n-基建同步已归档)。
>
> **M9 移交下一阶段候选（backlog 登记）**：README.en-US.md 翻译（`must-sync` tier）/ docs/i18n/en-US 镜像翻译（`summary-sync` / `source-only`）/ platform 多语言扩展（zh-TW / ko-KR / ja-JP）/ locale 模块化拆分（脚本已兼容双形态，单 locale 超阈值或命名空间冲突时触发）。

## M10: 独立沙箱容器 C26 实施规划（已归档）

> **背景（2026-08-14→19）**：M8 阶段安全专项评估确认"dependfix 自身不得成为漏洞扩散工具"（[沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md) §3 路径 D：BullMQ 并发后恶意仓库 A 的脚本可读仓库 B 的工作目录与环境）。G5 治理项登记 → 2026-08-19 决策会议基于 super-search 一手调研完成 6 项决策 → 启动 M10 实施规划。**前置依赖**（T702 / T802 / T805 / C38 / C45）全部已落地。
>
> **M10 已交付（2026-08-19 启动 / 2026-08-20 收口）**：T1001 B1+B2 Docker rootless runtime + RuntimeAdapter 抽象层（B1 commit `b189aaa` `a07f577` + B2 commit `b6083a7`）→ T1002 出站白名单拦截代理（commit `c68029a` `9da2421`，Review Gate 2 轮 Pass）→ T1003 cgroup v2 资源限制（commit `a85fb03` `32658e7`，Review Gate 1 轮 Pass）→ T1004 文档收口 + 治理决议更新（commit `5ae5165` `e48b097` `06377b2` `b289668`，Review Gate 2 轮 Pass）。共 13 commits 待推送。
>
> **关键决策（2026-08-19 用户确认）**：Q1 Runtime = Docker rootless（抽象预留不强绑 rootless）；Q2 镜像 = 复用平台 runtime 阶段；Q3 部署 = 自托管 docker-compose 优先 + K8s+Helm 仅规划；Q4 白名单 = 默认 npm/github + env 临时扩展；Q5 cgroup 资源 = `Repository.sandboxLimits` 仓库级 + 平台缺省；Q6 旧路径 = `SandboxExecutor` 与 `ContainerExecutor` 并存，默认 `container`。
>
> **同步收口（2026-08-20）**：T912 SMTP 邮件发送器主体（T912-1 mailer service + T912-2 三回调接线 + coverage 回归）已 commit 同步归档；T912-3 安全与文档剩余项合并入 backlog **C28**（凭据加密存储章节补齐）。T912-3 邮件发送安全章节与 C28 联动统一处理。
>
> **设计文档落盘**：[executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计)（§7.1 RuntimeAdapter 抽象 + §7.2 镜像策略 + §7.3 部署形态 + §7.4 与 ContainerExecutor 并存 + §7.5 K8s+Helm 部署预留 + §7.6 验收对照 + §7.7 设计反例）；[sandbox-security-governance.md §5 G5 升级](../design/governance/sandbox-security-governance.md#5-治理决议与登记) 为"实施规划已就绪" + [§7 验收段补 M10 4 子任务验收方式](../design/governance/sandbox-security-governance.md#7-验收与持续治理)；[quick-start.md §启用 rootless sandbox 执行（规划中）](../guide/quick-start.md) docker rootless daemon 启动指引子段（67 行 / 5 项前置 + 5 步指引 + 3 条反模式绝对禁止）。
>
> **M10 移交下一阶段候选（backlog 登记）**：**T1005 sandbox 路由接线**（schema 扩展 `executorKind = 'sandbox'` + `scan-orchestrator.service.ts` `resolveExecutorKind` 分支 + `sandbox_unavailable` 降级契约落地；T1004 quick-start 显式标注待 T1005 落地后启用）；**C28 security.md §凭据加密存储章节补齐**（T912-3 联动）；**M10 收尾小修**：sandbox-security-governance.md §6 反模式 docker.sock CVE 归因与 quick-start.md 对齐（T1004 审计 R2 残留 warning 项）；**branches 阈值恢复 80% 冲刺启动条件已满足**：M10 全部 commit 已推高 cgroup.ts 81.94% + network-audit.ts 81.96%（T1002 + T1003），剩余低分支文件清单（branch-cleanup / naming-strategy / distill-wisdom / batch.post / [id].get）可启动冲刺。

## M11: 业务可见性 + 沙箱落地 + 安全文档（已完成 2026-08-20 归档）

由 C53 闭环触发启动的复合阶段，覆盖业务可见性（push + PR 闭环 + runUrl 兜底）、沙箱落地（T1005 路由接线）、安全文档（C28 + T912-3）、通知基建（C-ENV-CHANGE-ALERT）四类需求。22 commits 全部落地 + C58 与 C-ENV-CHANGE-ALERT 两轮深度 standard Pass。

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 经验教训：见 [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)

## M12: 平台 UX 一致性 + i18n 治理（已完成 2026-08-21 归档）

承接 2026-08-21 用户实测反馈 10 项平台 UX / 安全 / i18n 问题，按 ≤ 5-6 项硬上限拆 4 子批次（C65-A 用户管理安全 + 角色 i18n / C65-B i18n 单点声明治理 / C65-C schedules 增强 / C65-D 平台表格与视图增强）独立实施。19 commits 全部推送至 origin/master，branches coverage 80.02%（CI 阈值回归修复后），9 轮独立 Review Gate Pass。

**关键决策**：

- **C65-A3** 纵深防御模型 = 前端拦截 + 服务端强制（前端拦截 ≠ 服务端安全，devtools / 恶意客户端可绕过）；Nuxt server middleware 实现 5 端点拦截 + 双层防护
- **C65-B1** 双文件拆分根因（jiti vs Nuxt transform pipeline 运行时全局可见性差异，物理拆分承载运行时全局调用的配置与纯字面量导出配置）
- **C65-C1** 自实现预览（0 新增依赖，复用 cron-parser 已装的成熟 next()）；cronstrue 实测 unpackedSize 1.23MB（todo.md 估 ~10KB gzip 严重偏差）+ cronstrue-i18n 不存在于 npm registry，拒绝引入
- **C65-D3** TypeORM 1.x find options order 不支持嵌套路径 → 全部走 QueryBuilder（统一代码路径 + 行为等价）
- **C65-D4** 删除 vs 差异化决策：选删除（最简 + 与 dashboard 完全去重 + alerts 聚焦表格）

> 详细子任务清单 + commit 引用 + 实施记录 / 关键经验 / 待迁移经验：见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（2026-08-28 M17 归档批次预防性分片迁出）

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已完成 2026-08-26 归档）

承接 M12 闭环后 backlog 治理前置 + 2026-08-25~26 用户实测反馈 5 项 UX 问题，按 ≤ 5-6 项硬上限 + 跨 packages+apps > 10 文件超阈值需拆分原则拆 4 子阶段独立闭环（M13.1 治理前置 + 平台 UX 反馈 / M13.2 网络治理 + 告警去重 / M13.3 Code Scanning 规则化 + CQL / M13.4 UX 反馈批次立刻做）+ T1310 platform release 通道同步推进。26 commits + 9 轮独立 Review Gate Pass + CI 阈值回归修复（branches 79.98% → 80.17%）。

**关键决策**：

- **T1301**：wisdom 蒸馏条目选择标准——保留高频复用 / 实战类 pattern / 项目 SOP，其余迁移至 standards
- **T1305**：候选方向 3（命令输出 URL 与真实外联区分）治本根因而非逐次新增白名单；候选方向 1/2 优先级降低
- **T1306**：聚合实现——SQL `GROUP_CONCAT` 子查询在 better-sqlite3 `:memory:` 失败，改用应用层 JS 聚合（去 SQL dialect 依赖 + 测试稳定）
- **T1308**：复用 `NormalizedSecurityAlert` 模型；Octokit v17 类型未含 code-quality/findings 端点，使用 `client.request('GET ...', ...)` raw 端点；per-source 错误隔离（与 code-scanning 同模式）
- **T1403**：仅改前端默认，不改后端默认 false（保持向后兼容）

> 详细子任务清单 + commit 引用 + 实施记录 + 关键经验 / 待迁移经验：见 [todo-archive.md §M13](archive/todo-archive-phases-m13.md)

## M14: platform 进入 release 通道 + UX 反馈跟进（已完成 2026-08-26 归档）

承接 backlog UX-R1 扫描历史分页（用户实测反馈痛点）+ M13.4 T1403 follow-up + neat-freak 治理批次。19 commits 全部落地（ahead=0，`git rev-list HEAD ^origin/master --count` 实证核验），含 5 子阶段（M14.1 platform release 通道闭环 / M14.2 UX-R1 / M14.3 T1403 follow-up / M14.x neat-freak / M14.y 依赖批量治理）+ dependabot major PR 4 个。

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验：见 [archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)（2026-08-31 M19 归档批次预防性分片迁出至分片）

## M15: 扫描历史详情侧栏增强 UX-R2（已完成 2026-08-26 归档）

承接 M14.2 UX-R1 后的 UX-R2 反馈：增强 alerts 去重视图 Sidebar 的运行可辨识度（运行短 ID / 模式 / 严重级别阈值 / 执行器 / 告警数 / 开始时间 / 持续时间），按执行器显示 GitHub Action 外链，新增独立 `RunDetailDialog` 复用 `GET /api/runs/:id`。4 子任务（M15.1 UX-R2-A / -B / -C / -D）全部独立闭环。**不**触碰后端契约 / **不**动 `RepoHistoryDialog.vue` / **不**做数据层迁移 / PrimeVue 升级 / C36/C37 i18n。UX-R3 顺延 M16 待 P 阶段规划。

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验：见 [archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)（2026-08-31 M19 归档批次预防性分片迁出至分片，M15 段实施内容完整保留于分片文件）

## M16: 平台可用性深化（已完成 2026-08-28 归档）

把 `apps/platform` 从 demo 落地为实际可用项目；5 项 UI/API/技术债痛点收敛（M16.1 UX-R3 `/scans` 页面 / M16.2 alerts 一键修复入口 reuseScanRunId / M16.3 C36 服务端 API 错误消息 i18n / M16.4 PrimeVue hydration 主线 #1 缓解 alerts 迁移 useAsyncData / M16.5 T701-e2e 管理端点集成测试补强）。19 commits 全部推送至 origin/master（ahead=0），branches coverage 80.27% → 85.67%（远超 80% CI 阈值），5 轮独立 Review Gate Pass。

**关键决策**：

- **M16.3**：`code` 强契约位置 `data.code`（h3 1.15 `createError` 不透传任意顶层字段，实证 `apps/platform/node_modules/h3/dist/index.mjs:64-139`）；locale 检测策略 `cookie(i18n_locale) > Accept-Language > 默认 zh-CN`；`params` 模板插值接口预留（当前无 throw 使用，单测间接验证 no-op 行为）
- **M16.4**：watch 自动 refetch 替代原 3 处手动 `fetchAlerts()` 调用；`useRequestFetch()` 解决 SSR cookie 转发（Nuxt 4 官方方案）；utility 抽取 `apps/platform/app/utils/alerts-view.ts` 9 case 单测（audit suggest 触发的抽取）；refreshAlerts 类型不兼容 PrimeVue Button @click PointerEvent 用 `() => { void refreshAlerts() }` 包裹
- **M16.5**：viewer storageState 复用（global-setup 注册 + browser.newContext 隔离 context + `__Secure-` cookie 在 HTTP webServer 下手工拼接）；测试基础设施 `tests/setup-nuxt-server.ts` 加 `getRequestURL` 注入 globalThis（middleware 测试需要）；e2e DOM 适配 PrimeVue Password id 透传到外层 div（选择器 `div#token input`）

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验：见 [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)

## M17: 安全与可用性收口（已完成 2026-08-28 归档）

承接 M16 闭环后 backlog 4 条目（安全性 + i18n + 测试基建），按"安全性 P1 优先 + i18n 范围外扩展按模块化分组 + 测试基建顺手做"原则拆 6 子阶段独立闭环（M17.1 C38 encryptionKey 标准化统一 `NUXT_ENCRYPTION_KEY` 路径 / M17.2-4 服务端 API i18n 范围外扩展 10 文件 3 子阶段 / M17.5 S-2 `authedCookieHeader` 抽取至 e2e helpers / M17.6 S-4 better-auth admin viewer role check 单测补强 5 端点 viewer 403 矩阵）。6 轮独立 Review Gate Pass 含 M17.4 commit 2 standard depth Reject 后补修闭环（nuxt typecheck 输出 "Done" ≠ TS 0 error —— 必须实测确认 0 error）。

**关键决策**：

- **M17.1**：服务路径单一权威来源 `useRuntimeConfig().encryptionKey`（统一入口 + 避免双入口漂移）+ 删除 L34 临时兜底保留 L30 标准部署凭据（两条 env line 独立配置项）
- **M17.2-4**：i18n 改造模式严格沿用 M16.3 `createLocalizedError`（0 新设计成本）+ 避开"4 端口合 1 批"反模式（M17.4 总 13 文件拆 2 commits 实证）+ `ServerErrorCode` 字母序跨 batch 累积跟踪登记 backlog
- **M17.4 commit 2 audit Reject**：nuxt typecheck 输出 "Done" ≠ TS 0 error（nuxt typecheck 走 `vue-tsc` pipeline 在某些情况下容忍 TS error；执行方"typecheck 7 包全 Done"宣称**不可信**——必须实测确认 0 error）+ audit Reject 后针对性补修 + 重验证三件套（不回退到全量重试模式）
- **M17.5**：重构 vs 实现优先 reverse pattern（audit suggest 触发采纳）+ JSDoc 注释聚合 3 文件原始注释 + 零行为变更 + rg 字节级比对实证 + lint auto-fix 接受策略（独立 chore commit；与历史 commit `64bc1a5` 因误带 docs 提交回滚形成对比）
- **M17.6**：vitest 风格 + playwright 真实 better-auth 端点（不 mock better-auth 库内部逻辑——mock 后测的不是 better-auth 真实行为，违反"防升级回归"目的）+ `vi.hoisted` + `mockImplementationOnce` 模式统一 mock + 5 端点 viewer 403 矩阵 + 锁定 better-auth admin 当前版本 role 行为

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验：见 [archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口m171m172m173m174m175m176-全部已闭环--2026-08-28-归档)

## M18: 平台 GitHub App BYO App 模式（已完成 2026-08-30 归档）

承接 M17 闭环后 backlog §org 增强 §C22 上收主条目（2026-08-28 用户实测触达：自部署平台管理员视角 classic PAT `repo` scope 权限过大、可直接推送代码超出"自动修复"预期风险；fine-grained PAT 需逐仓库勾选 + SSO 流程繁琐、离职轮换管理困难）。定位 PAT 保留为默认快速上手路径 + GitHub App 作为自部署平台进阶选项，二者并存不替代。GitHub App 增量价值：installation 范围限定 + 1h 短时 installation token 自动轮换 + 真实 `[bot]` 身份 + per-installation 审计日志。5 子阶段 + 1 治理批次（M18.0 docs only / M18.1 基础层 / M18.2 集成层 / M18.3 表现层 / M18.4 测试层 / M18.x 治理批次）共 ~24 commits 全部推送至 origin/master ahead=0，含 M18.4 audit round 1 Reject 后针对性补修闭环。

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验：见 [todo-archive.md §M18](archive/todo-archive-phases-m18.md#m18-平台-github-app-byo-app-模式m180m181m182m183m184m18x-全部已闭环--2026-08-30-归档)

## M19: 治理 + 能力扩展 + 测试补强（已完成 2026-08-31 归档）

承接 M18 闭环后 backlog 候选池，按"类型平衡"原则（技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项）选取 5 项任务独立闭环（M19.1 C34 存量规范严格约束挂接盘点 / M19.2 C23 发现规模上限 max-repos / M19.3 B1 PR 关闭评论 + label / M19.4 T701-e2e 管理端点集成测试补强 / M19.5 C8 per-source 错误隔离）+ M19.x 收口（孤立编号清理）。5 atomic commits 全部推送至 origin/master ahead=0，5 轮独立 Review Gate Pass（M19.1 quick / M19.2 standard / M19.3 standard / M19.4 quick / M19.5 standard）含 1 个 blocker + 8 个 warning 全部修复。本批次清理 backlog 5 个已上收主条目（B1 / C23 / C8 / T701-e2e / C34），同期预防性分片迁出 M14 + M15 至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验：见 [todo-archive.md §M19](todo-archive.md#m19-治理-能力扩展-测试补强m191m192m193m194m195-全部已闭环-2026-08-31-归档)

## M20: ScanResult 数据模型重构（已完成 2026-08-31 归档）

per-alert 模型 + reconcile + API 简化 + UI 调整 + backfill 脚本。5 子阶段（M20.1 引擎侧 upstreamId 注入 / M20.3 ScanResult 实体升级 + reconcile 函数 / M20.5 API 简化 + dashboard 调整 / M20.6 UI 调整 + i18n / M20.7 一次性 backfill 脚本）全部闭环，8 commits 已落地。

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 经验教训：见 [todo-archive.md §M20](todo-archive.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)

---

## M21: 治理收口 + 能力扩展 + 测试补强（已完成 2026-08-31 归档）

承接 M20 闭环后 backlog 候选池 + M18.x 治理剩余风险；按"类型平衡"原则（🛡️ 治理 2 项 + 🚀 能力扩展 1 项 + 🧪 测试覆盖 1 项）选取 4 项任务独立闭环（M21.3 段为重复登记——S-5 已由 M18.x commit `878ae1a` 闭环，本批次 P 阶段规划删除并迁 backlog 历史归档指针段）。4 子阶段（M21.1 Code Scanning RG-W01 + RG-W02 execFileSync 替换 execSync 2 处命令注入修复 / M21.2 M18.x 剩余风险 W1 + W2 + audit suggest 1+2 集中清理 / M21.4 B3 PR 自动合并闭环（mergify 模板 + auto-merge guide + audit W1 vitepress sidebar 修复）/ M21.5 T704 async 定时触发 + Schedule CRUD e2e 补强（playwright e2e 6 case + BullMQ upsertJobScheduler 短间隔集成测试））。**11 atomic commits 实施 + 4 docs 收口 = 15 commits 已全部推送至 origin/master ahead=0**（`git rev-list HEAD ^origin/master --count` 2026-08-31 实测）。

**关键决策**：

- **M21.1** execSync → execFileSync + 参数数组（标准 npm:child_process 安全用法）；既有测试不回归
- **M21.3** M21.3 段原计划抽取 `setTestEncryptionKey(key)` helper 部分无真实用例需求（grep 自定义调用 = 0 命中），属 over-engineering；S-5 已由 M18.x commit `878ae1a` 闭环；M21 P 阶段规划批次删除 M21.3 段并迁 backlog 历史归档指针段（backlog 维护规则 5 追溯执行）
- **M21.4** mergify 模板扩展而非全新——复用既有 `.github/mergify.yml` 模板按 dependabot / dependfix PR 规则扩展 author 正则覆盖；不发布 mergify action，不修改 dependfix 自身 PR 提交流程
- **M21.5** e2e 同步降级（playwright.config.ts:36 NUXT_QUEUE_ENABLED=false 强制 sync 路径）+ BullMQ async 测试分离（describe.skipIf 门控）

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验：见 [todo-archive.md §M21](todo-archive.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)

---
## M22: SQLite 数据保护防御加固（已完成 2026-09-01 归档）

承接 2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故（用户管理账号 / 仓库 / 凭据 / 扫描结果全部丢失；代码内未找到清空路径，最可能清空来源在代码外部——shell / CI / 运维 / 误操作）。事故暴露 5 条可加固设计风险，按 [规划规范 §1.1 任务粒度约束](../standards/planning.md) + 类型平衡原则拆 **6 原子条目 + 1 沉淀批次独立闭环**（P0-P1，🛡️ 治理）：M22 沉淀（事故复盘 + 5 防御规范挂接）/ M22.1（SQLite 启动期自动备份 hard requirement）/ M22.2（db-restore 命令式恢复）/ M22.3（db-doctor 自检工具）/ M22.4（TypeORM synchronize 显式 opt-in + 启动日志）/ M22.5（TypeORM migrationsRun 显式 opt-in + 默认 false）/ M22.6（e2e/fixtures 端点双门控 + runtimeConfig 兜底防 esbuild 折叠）。9 atomic commits 实施 + 4 docs 收口 = 13 commits / ahead=7 待用户主动推送（`git rev-list HEAD ^origin/master --count` 2026-09-01 实测）。含 M22.4 Round 1 Reject（migrationsRun 默认值越界落地）+ M22.6 Round 1 Reject（Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱）→ 修订为 runtimeConfig 兜底。

**关键决策**：

- **M22.4 atomic commit 边界** — 提取 `migrationsRun` 为 const 支撑启动日志 vs 改 const 计算语义（默认值反转）是两件事，必须分 commit；M22.4 仅做提取 const 保持原 `!== "false"` 默认值，M22.5 单独反转（避免越界落地 M22.5 核心改动）
- **M22.6 runtime gate 设计** — `process.env.NODE_ENV` 在 Nitro/esbuild 构建期被静态替换为构建时值，prod build 表达式折叠为 `... || true` 永远 404；改用 Nuxt `runtimeConfig.e2eFixturesAllowed`（`NUXT_` 前缀运行时覆盖通道）绕开 esbuild define
- **M22.6 资产授权路径** — e2eFixturesAllowed 在 `nuxt.config.ts` 注册（prod build 默认 false），playwright e2e webServer 通过 `NUXT_E2E_FIXTURES_ALLOWED=true` 显式开启；prod 部署误设 `E2E_TEST=true` 但缺 `NUXT_E2E_FIXTURES_ALLOWED` 仍 404（双门控兜底真正生效）
- **M22.6 vs M22.4 独立实现** — 双门控核心是"两个独立开关都不能被简单绕过"；M22.4 保护生产构建不被 synchronize 误开（dev/test 不再自动），M22.6 保护 e2e/fixtures 端点不被 E2E_TEST 误开；两者使用相同的"显式 opt-in + 文档引用规范"模式

**关键经验（已挂 standards）**：

- `docs/standards/development.md §5.1.19` TypeORM 1.x synchronize 与 migrationsRun 反模式禁止（hard requirement）—— M22.4 / M22.5 同步 opt-in；NOT NULL 列无 default 时启动期日志 + 恢复路径
- `docs/standards/platform.md §3.6` e2e / fixtures 端点双门控规范 —— hard requirement + 为什么不用 `process.env.NODE_ENV`（esbuild define 折叠陷阱）+ D 阶段自检扩展构建产物 grep 兜底 + A 阶段 Review Gate 必查项
- `docs/standards/security.md §2.1` SQLite 数据库防护 5 子节 —— §2.1.1 启动期自动备份 / §2.1.2 命令式恢复 / §2.1.3 数据库自检工具 / §2.1.4 与 e2e/fixtures 端点关系 / §2.1.5 实证（M22 事故复盘）
- `docs/standards/platform.md §3.7` SQLite 启动期备份 + 自检工具 —— 3 文件（backup.ts / db-restore.ts / db-doctor.ts）+ D 阶段自检验证
- 详见 [todo-archive.md §M22](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档) 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 经验教训 / 待迁移经验

---

## M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强（启动 2026-09-02）

承接 M22 闭环 + M22.7（CI 33525721103 E2E global-setup ECONNRESET hotfix）+ M22.8（CI 33533376712 未认证 API 测试 cookie 注入 hotfix）hotfix 衍生根因治理债 + [backlog.md](backlog.md) §C66 告警视图增强（2026-08-25 用户实测反馈）+ 测试基建清理。按"类型平衡"原则（🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1）拆 **5 原子条目独立闭环**，符合 [规划规范 §1.1 任务粒度约束](../standards/planning.md) ≤ 5-6 硬上限。

**前置依赖**：M22 hotfix commits（M22.7 `f617b56 + 51e8c13` + M22.8 `bdcd900 + 2472b05`）已全部推送到 origin/master；ahead 数字实证 `git rev-list HEAD ^origin/master --count`（M23 D 阶段开工前重新实证）。

### M23.0 治理批次（合并 G1+G2+G3，🛡️ 治理）

> **范围**：① **G1** [M22 neat-freak 收敛](backlog.md#延期--暂缓项)（security.md §2.1 为 SQLite 防护规则权威完整声明，development.md §5.1.18 / platform.md §3.7 第 1/2/3 条收敛为引用 + 仅保留差异化信息）；② **G2** wisdom 21 条蒸馏（`pnpm distill:wisdom`，活跃条目 ≤ 20 阈值）；③ **G3** wisdom 4 条 pattern 挂 standards：code-auditor.agent.md 「构建产物 grep 兜底」必查项 / development.md §5.1.20 atomic commit 边界示例 / ai-collaboration.md §4 PDTFC+ CI 偶发错误三阶段协议 / testing.md e2e global-setup + 未认证 API 调用标准模式。
>
> **优先级**：P2（治理）
>
> **验收**：
>
> - security.md §2.1 为权威完整声明（SQLite 防护 5 子节），development.md §5.1.18 + platform.md §3.7 收敛为引用 + 仅保留差异化信息（差异化信息段不重复 SQLite 防护规则全文）
> - wisdom 活跃条目 ≤ 20（`pnpm distill:wisdom --check` 实证）
> - 4 条 pattern 正式挂入对应 standards / agent 文档（含交叉引用链接）
> - `pnpm run lint:md` + `pnpm run check:docs` 0 error
>
> **关键决策**：
>
> - G1 选 `security.md §2.1` 为权威完整声明（安全防线定位最贴切）；development.md §5.1.18 收敛为引用 + 仅保留开发角度差异化信息（"禁止"段 / "应用范围" / "实证"）；platform.md §3.7 收敛为引用 + 仅保留平台角度差异化信息（调用时机 / 协同关系）

### M23.1 M22.7 根因排查（🛡️ 治理 / 治本）

> **范围**：从 [backlog.md §E2E global-setup 串行场景 ECONNRESET 根因（M22.7 hotfix 衍生）](backlog.md) 4 候选按 ROI 排查 1 项。
>
> **优先级**：P1（治理 / 治本）
>
> **P0 候选（推荐）**：③ SQLite WAL 模式 + `journalMode=delete` → `journalMode=wal` + busy_timeout 优化（治本收益最大 + 风险最低 + 与 M22 防御加固体系一致）；如 P0 排查失败降级 P1 = ① better-auth 1.7 transaction 关闭时序
>
> **非目标**：M22.7 helper 层 maxRetries 兜底已落地保留不动；本条目专注根因排查 + 治本修复
>
> **验收**：
>
> - 选定根因结论（实证证据 + 失败模式分析）登记到 backlog.md + experience-archive.md
> - 若产生修复代码（如 WAL 模式切换），按 [PDTFC+ 修复工作流](../standards/ai-collaboration.md#4-修复工作流原则) 落地 atomic commit + CI run 验证
> - 关闭 [backlog.md §E2E global-setup 串行场景 ECONNRESET 根因 候选根因排查 M23 优先](backlog.md) 段
> - wisdom.md 新增 pattern 沉淀（如 SQLite WAL 模式切换 / better-auth transaction 时序）

### M23.2 M22.8 根因排查（🛡️ 治理 / 治本）

> **范围**：从 [backlog.md §Playwright 1.62 fixture pool 注入 cookie 根因（M22.8 hotfix 衍生）](backlog.md#playwright-1.62-fixture-pool-注入-cookie-根因m228-hotfix-衍生) 3 候选按 ROI 排查 1 项。
>
> **优先级**：P1（治理 / 治本）
>
> **P0 候选（推荐）**：① Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证（直接验证 fixture pool 行为假设 + 可产出测试层防御加固）；如 P0 排查失败降级 P1 = ② better-auth 中间件对非 /api/auth/* 端点 Set-Cookie 路径扫描
>
> **非目标**：M22.8 测试层 `storageState: { cookies: [], origins: [] }` 显式隔离已落地保留不动；本条目专注根因排查 + 治本修复
>
> **验收**：
>
> - 选定根因结论（源码追溯证据 + 测试复现脚本）登记到 backlog.md + experience-archive.md
> - 若产生修复代码（如 Playwright fixture 隔离 helper / 平台级 setup pattern），按 [PDTFC+ 修复工作流](../standards/ai-collaboration.md#4-修复工作流原则) 落地 atomic commit
> - 关闭 [backlog.md §Playwright 1.62 fixture pool 注入 cookie 根因 候选根因排查 M23 优先](backlog.md#playwright-1.62-fixture-pool-注入-cookie-根因m228-hotfix-衍生) 段
> - wisdom.md 新增 pattern 沉淀（如 Playwright fixture pool 隐式传播 / fixture isolation helper）

### M23.3 C66 告警视图增强（🚀 能力扩展 / UX）

> **范围**：承接 2026-08-25 用户实测反馈；按 [backlog.md §远期登记 / 未排期增强候选 §C66 告警视图增强](backlog.md#远期登记--未排期增强候选) 5 子任务中 **A1+A2+C+D 4 子任务**实施（B 数据层去重 B1 暂缓，应用层去重已实施满足当前需求）：
>
> - **C66-A1** ScanResult 数据模型扩展：加 `ghsaId` / `cveIds` 列 + TypeORM 1.x 类级复合索引迁移（按 §3b D 阶段自检强制项）
> - **C66-A2** fetcher 提取 GHSA + CVE：Dependabot API `cve_id` + `identifiers[]` 透传 / pnpm-audit `cves[]` 透传；`NormalizedSecurityAlert` 接口加字段
> - **C66-C** alerts UI 增加 GHSA / CVE 列：单列智能 `Identifiers` 列（GHSA 优先，fallback CVE，多 CVE 展开）+ 复用 alerts-rowgroup 视觉
> - **C66-D** fix 模式复用 scanRunId：`POST /api/repos/[id]/scan` 接受 `reuseScanRunId` 跳过重拉 + alerts 视图加 "立即修复此仓库" 入口
>
> **优先级**：P2（能力扩展 / UX）
>
> **非目标**：C66-B 数据层去重（B1 暂缓）；独立 `Identifiers` 列 vs `ruleId` 列分离保留为后续增强候选（触发：用户要求按 GHSA 单独搜索/过滤 / 多 CVE 展开视图）；不重写 Dependabot 详情页；不立即支持自定义 advisory 来源（GitLab Advisory Database 等）；不破坏现有 fixStatus / 修复链路
>
> **验收**：
>
> - ScanResult 实体 ghsaId/cveIds 列 + TypeORM 1.x 复合索引迁移（**类级声明**，§3b 教训）
> - NormalizedSecurityAlert 接口扩展 + Dependabot / pnpm-audit fetcher 透传字段
> - alerts.vue Identifiers 列渲染（GHSA 优先 + 多 CVE 展开） + i18n 键全语言覆盖
> - POST /api/repos/[id]/scan 接受 `reuseScanRunId` 跳过重拉（schema 校验 + 复用现有 ScanResult alerts）
> - alerts 视图加 "立即修复此仓库" 入口（reuseScanRunId 透传）
> - e2e 二轮验证复合索引（按 §3b D 阶段自检强制项：`pnpm --filter @dependfix/platform test:e2e` 连跑两遍验证幂等）
> - A 阶段 code-auditor standard depth Pass（跨 packages/core + apps/platform，文件数 > 8 触发并发审计）
>
> **关键决策回顾（2026-08-25 用户确认）**：
>
> - **B1 数据层去重** vs B2 UI 层 GROUP BY / B3 每次清空：选 B1 —— 彻底解决重复 + 自然支持 fix 复用 + 不破坏审计；**备注：B1 暂缓，应用层去重（方案 B2 等价）已实施且满足当前业务需求；如未来需要 fix 复用 / 历史 fixStatus 跨次保留再迁移到 B1**
> - **C3 单列智能** vs C1 两列分开 / C2 单列合并：选 C3 —— 用户原话"GHSA ID ... 这才是能真正跨平台追溯漏洞的关键信息"

### M23.4 测试补强（🧪 测试补强 / 治理收口）

> **范围**（注：原计划 T2 + T3 已分别由 M21.1 commit `0a83c74 + a77e557` + M21.2 commit `fe7cc0f + ad376c8` 闭环，本段范围收敛仅保留 T1）：
>
> - **T1** [backlog.md §测试基础设施清理 §cron-preview 时区测试 wall-clock 依赖消除](backlog.md#测试基础设施清理) S1+S2 两条：S1 用 `vi.setSystemTime` 写固定-now 用例断言 `diffHours === 16` + 对照用例固定到 8h 窗口断言 `diffHours === 8`（强制两个分支都被覆盖）；S2 改 `cron-preview.test.ts:89` 断言为 `expect(diffHours === 8 || diffHours === 160).toBe(true)`
>
> **优先级**：P3（测试补强 / 治理收口）
>
> **验收**：
>
> - cron-preview.test.ts 0 真实 wall clock 依赖（`vi.setSystemTime` 固定-now 断言）
> - vitest 单测通过 + lint + typecheck 0 error
> - 编号标记扫描 0 命中（按 §3 D 阶段自检强制项 + code-auditor 主责边界必查项）

### M23 阶段交付概览

- **总条目**：5 原子条目（M23.0 / M23.1 / M23.2 / M23.3 / M23.4）
- **类型分布**：🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1
- **预估 commits**：8-12（治理批次 2-3 + 根因排查各 1-2 + C66 实施 1-2 + 测试补强 2-3）
- **关键风险**：
  - M23.1 / M23.2 根因排查可能无代码 commit（仅结论 + 关闭 backlog 项）；如产生修复需走 PDTFC+ 修复工作流
  - M23.3 跨 packages/core + apps/platform，文件数 > 8 触发并发审计
  - M23.3 C66-A1 TypeORM 1.x 复合索引迁移必须类级声明（§3b 教训，e2e 二轮验证）
- **前置**：M22 hotfix commits 已推送至 origin/master；ahead 数字 D 阶段开工前 `git rev-list HEAD ^origin/master --count` 实证

---

## 详细任务

- 当前阶段任务：[todo.md](todo.md)（**M23 M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强**：2026-09-02 用户决策启动；候选池从 backlog.md §短期 / 一次性候选任务 + §已知边界 选取，按"类型平衡"原则拆 **5 原子条目**独立闭环：M23.0 治理批次 + M23.1 M22.7 根因排查 + M23.2 M22.8 根因排查 + M23.3 C66 告警视图增强 + M23.4 测试补强（范围收敛：仅保留 T1 cron-preview wall-clock）；详见 [§M23](#m23-m22-治理债收口--根因排查--能力扩展--测试补强启动-2026-09-02) 段；前置：M22 hotfix commits 已推送至 origin/master；ahead 数字 `git rev-list HEAD ^origin/master --count` 实证；待人工验收 T701/T702/T704 项随真实环境推进）
- 已归档阶段：[todo-archive.md](todo-archive.md)（主窗口保留最近 4 段：2026-09-01 M22 / 2026-08-31 M21 / 2026-08-31 M20 / 2026-08-31 M19；**2026-09-01 M22 归档批次预防性迁出 M18 至新分片 [archive/todo-archive-phases-m18.md](archive/todo-archive-phases-m18.md)**（M22 段 119 行新增前主窗口 612 行 + M22 段预估 80-100 行将超 700 分片阈值；M18 单段迁出与 M19/M20 归档批次迁出 M14-M15/M16-M17 同源策略）；2026-08-31 M20 归档批次预防性迁出 M16 + M17 至新分片 [archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)；2026-08-31 M19 归档批次预防性迁出 M14 + M15 至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)；2026-08-30 M18 归档批次预防性迁出 M13 至新分片 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)；2026-08-28 M17 归档批次预防性迁出 M12 至新分片 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)；2026-08-28 M16 归档批次预防性迁出 M10 / T912 / C53 / 2026-08-20 平台 UI 增强 C59-C61 至新分片 [archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)；早期阶段见 [archive/index.md](archive/index.md) 分片索引）
- 后续阶段任务（延期项 + 未排期增强候选）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录

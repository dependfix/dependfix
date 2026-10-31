# 专项设计与治理（governance）

> 本目录收录**专项设计、治理边界、迁移方案与跨模块杂项**文档，不按模块拆分。
> 已实现/正在实现的模块设计见 [modules](../modules/index.md)。

## 文档索引

| 文档 | 类型 | 状态 |
|:-----|:-----|:-----|
| [系统架构](./architecture.md) | 整体架构 | ✅ 已落地（2026-08-05 修正） |
| [安全设计](./security.md) | 安全治理 | ✅ 已落地 |
| [GitHub Action 工作流](./github-action-workflow.md) | 专项设计（Action 接入） | ✅ 已落地（M2） |
| [.gitignore 自动管理](./gitignore-management.md) | 杂项治理 | ✅ 已落地 |
| [仓库名自动推断](./repo-auto-inference.md) | 杂项设计 | ✅ 已落地 |
| [Session Wisdom 蒸馏机制](./session-wisdom-distillation.md) | AI 治理（知识沉淀） | ✅ 已落地（2026-08-06） |
| [经验归档](./experience-archive.md) | 经验备份（持续追加，准入标准见文件头；§1-§99 共 77 条，按内容逻辑分片为 7 个分片文件，章节编号全局唯一） | ✅ 持续追加 |
| [Skill 分发治理](./skill-distribution.md) | 专项治理（M5.5 Skill 编排） | ✅ 已落地（2026-08-07） |
| [执行器设计与沙箱评估](./executor-sandbox.md) | 专项设计（T607 设计先行） | ✅ 设计已落地（M10 隔离基础设施 + M38 执行进程隔离；沙箱内真实引擎执行为占位；平台入口已临时关闭 2026-10-27） |
| [沙箱与恶意依赖防护治理](./sandbox-security-governance.md) | 专项治理（2026-08-14 安全评估） | ✅ 已落盘（2026-08-14） |
| [MCP Server 设计](./mcp-server.md) | 专项设计（M6） | ✅ 已落地（`@dependfix/mcp` 0.2.0 已发布，8 个 tool） |
| [平台认证与用户体系设计](./platform-auth-users.md) | 专项设计（M7.1 T701/T707 设计先行） | ✅ 已落地（2026-08-09，Review Gate Pass） |
| [定时扫描与批量处理设计](./platform-scheduled-batch.md) | 专项设计（M7.2 T704 设计先行） | ✅ 已落地（T704 实现 + M21.5 async/e2e；真实环境验收见 backlog T704） |
| [平台 AI 研判集成设计](./platform-ai-integration.md) | 专项设计（apps/platform AI 研判端到端联通） | ✅ 已落地（M25.2a 基础层 + M26.1 应用层，见 [M26](../../plan/archive/todo-archive-phases-m26.md)） |
| [文档站 + 包 README 多语言实施设计](./docs-and-readme-i18n.md) | 专项设计（en-US 接入，参照 momei） | ✅ 已实施（M26.3 文档站 + 包 README en-US P0，见 [M26](../../plan/archive/todo-archive-phases-m26.md)） |
| [apps/platform PrimeUI 主题库降级设计](./primeui-themes-v2-downgrade.md) | 专项设计（@primeuix/themes 3.x → 2.x MIT 降级） | ✅ 已实施（M25.1 完成 3.x → 2.x MIT 降级；M31.5 全链卸载 PrimeVue 后本方案载体退役，主题能力见 [caomei-ui 迁移评估](./caomei-ui-migration.md)） |
| [apps/platform UI 组件库迁移评估（PrimeVue → caomei-ui）](./caomei-ui-migration.md) | 迁移方案（规避 PrimeUI 商业许可 + 下游组件库统一） | ✅ 已实施（M31 迁移闭环 / 2026-09-29 归档，见 [M31](../../plan/archive/todo-archive-phases-m31.md#m31-apps-platform-ui-组件库迁移-primevue-→-caomei-ui-m31-1-m31-6-全部已闭环-2026-09-29-归档)） |
| [overrides 保护名单](./override-protect-policy.md) | 方案 B / A1 载体（按仓库粒度） | ✅ 已实施（M29.4） |
| [C22 PAT 无感升级评估](./c22-pat-backward-compat.md) | 评估报告（M18.0 P0 docs only 子阶段） | ✅ 已落地（2026-08-29，Review Gate Pass） |
| [文档治理执行规范](./doc-governance.md) | 文档治理（字符/条数预算 + 处置矩阵 + 8 步流程 + 归档不变量） | ✅ 已落地（2026-10-26 首版；`check:doc-governance` 机检） |
| [工程实践判例](./engineering-practice-notes.md) | 规范配套（从 `development.md §5.1` 迁出的实现细节与旧编号映射） | ✅ 持续追加（非规范，不作为放行依据） |
| [规范与文档治理设计](./spec-and-doc-governance.md) | 专项设计（文档治理边界 + modules/governance 分流依据 + 写作规范 + 实施计划） | 📚 历史参考（2026-09-09 v1；现行流程见 doc-governance） |
| [规范与经验管理体系重构设计](./standards-experience-refactor.md) | 专项设计（规范方法论层化 + 经验三层收敛 + 导航分层 + 阈值/门禁统一；承接 spec-and-doc-governance v2） | ✅ 已落地（2026-10-10：M41.1~M41.5 全部闭环归档，见 [M41](../../plan/archive/todo-archive-phases-m41.md#m41-规范与经验管理体系重构-m41-1-m41-5-全部已闭环-2026-10-10-归档)） |
| [运行失败分类与筛选设计](./run-failure-taxonomy.md) | 专项设计（运行失败阶段分类 + 可重试判定 + 筛选 / 重试入口） | ✅ 已落地（2026-10-07：分类 + 落库回填 + 筛选 + 展示；2026-10-16 补受约束重试入口） |
| [扫描偏好（设备级）设计](./scan-preferences.md) | 专项设计（设备级 localStorage 偏好：优先级 / 写入时机 / SSR 与可测性） | ✅ 已落地（2026-10-07，M37.2） |
| [平台执行模型隔离设计](./executor-process-isolation.md) | 专项设计（M38 设计先行：BullMQ 锁续期失败根因 + 三方案选型） | ✅ 已落地（2026-10-09 M38 闭环归档，选型 ①′ 独立 worker 进程；2026-10-30 M51.5 增量：交付类 git 异步化 + 运行预算契约 §8.5/§8.6） |
| [PR 构建与部署信号采集设计](./pr-build-deploy-signals.md) | 专项设计（PR 构建 / 部署多源聚合：GitHub Checks + Commit Statuses + Deployments，可选 provider 日志富化） | ✅ 已实施（M43.2a/b 采集与持久化 + M45.6 关注集；2026-10-30 M51.2 增量：结论口径统一与同 ref 收敛 §3.10） |
| [队列僵尸任务终结与去重键释放设计](./queue-stale-recovery.md) | 专项设计（宿主机重启后 pending/running 收敛 + BullMQ 去重键释放 + 触发自愈 + worker 慢重试） | ✅ 已落地（2026-10-18，Review Gate R2 Pass） |
| [平台通知与邮件推送设计](./platform-notification.md) | 专项设计（事件分层 + 组织 / 个人配置 + 收件人分流 + 合并降噪；issue #190） | ✅ 已落地（2026-10-22 M46 归档；B1-B4 闭环，B5 已随 M47.5 进入规划） |
| [验证链与目标仓库 CI 口径对齐设计](./verification-ci-alignment.md) | 专项设计（M47.1：workflow 命令口径解析 / 差异披露 / 默认分支健康预检） | ✅ 已落地（2026-10-23，M47.1；Review Gate R2 Pass） |
| [平台本地日志通道统一设计](./platform-logging.md) | 专项设计（进程级日志统一 + 本地文件轮转 + 致命错误落盘） | ✅ 已实施（2026-10-28，M49 追加临时待办；Review Gate R3 Pass） |
| [设计镜像清单（en-US）](../mirror-manifest.md) | 文档治理（en 镜像结构映射 / 未镜像分片登记） | ✅ 已落地（由 `docs:check:mirror` 机检，随 `gates:docs` 执行） |
| [1.0 发布门槛与就绪度台账](./release-1.0-readiness.md) | 发布治理（G1-G8 门槛 / P0-P1 分档 / 真实环境矩阵 / 批次计划） | 🔶 进行中（2026-10-25 立项；目标 1.0.0） |
| [发布前安全告警门禁设计](./release-security-gate.md) | 发布治理（Dependabot + Code Scanning 发布级阻断 / 豁免台账 / fail-closed 决策） | ✅ 已落地（2026-10-29，`release.yml` 接线 + 单测） |
| [对外 PR 交付闭环设计](./pr-delivery-closure.md) | 专项设计（M48：家族锁步 / CI 独有脚本 / 失败指纹 / 提交面 / PR 回环 / 归因） | ✅ 已落地（2026-10-25，M48.1-M48.6 六原子闭环；2026-10-30 M51.4 增量：基线红交付降级 §16） |
| [告警级修复结果回写设计](./alert-outcome-writeback.md) | 专项设计（1.0-F1：`ScanResult.fixStatus` 回写契约 / 产出优先级 / 通知口径） | ✅ 已实施（2026-10-30，M51.1；Review Gate R1 两分区 Reject → R2 A Reject / B Pass → R3 A Pass） |
| [平台 PR 回环反馈设计](./pr-feedback-loop.md) | 专项设计（1.0-F1：观察态 / 幂等评论 / 关闭与重试边界 / 与监测器分工） | ✅ 已实施（2026-10-30，M51.3 a/b；retry 按用户裁定延后，契约保留在 §8） |
| [仓库级执行预算与超时配置设计](./repo-execution-limits.md) | 专项设计（四个超时仓库级覆盖 + 平台封顶 + Worker 锁 / 孤儿阈值同源 + 前端设置面） | 🔶 设计定稿（2026-10-30，D1-D3 已裁定；待上收） |

## 使用约定

- 本目录只存放**专项讨论、治理边界、迁移方案与执行治理**文档（参照 momei governance 惯例）。
- 某个专项文档已无法对应当前实现时，应修正为治理 delta 文档，或直接归档 / 删除。
- 过时但暂不删除的文档归档到 `governance/archive/`（当前暂无，按需创建）。
- 单篇超出行数健康窗口时按**连续尾部章节**迁出为同级分片（主文档保留设计本体 + 分片索引，分片章节编号跨文件稳定）；分片规则与阈值以 [文档规范 §3](../../standards/documentation.md#_3-文档行数阈值) 为准。

# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 | 状态 |
|------|------|--------|:----:|
| M0: 基线收敛 | Monorepo 骨架 + 配置模型 + 工具链策略 + 告警模型 | P0 | 已完成（[archive/todo-archive-phases-m0-m1.md §M0](archive/todo-archive-phases-m0-m1.md#m0-基线收敛-已归档)） |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 | 已完成（[archive/todo-archive-phases-m0-m1.md §M1](archive/todo-archive-phases-m0-m1.md#m1-mvp-单仓库自动修复-已归档)） |
| M2: GitHub Action 接入 | workflow_dispatch + 定时 + PR + AI Token + Prompt 防护 | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入-已归档)） |
| M3: Code Scanning 扩展 | 规则分级 + 可模板化修复 + 建议输出 | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M3](archive/todo-archive-phases-m2-m55.md#m3-code-scanning-扩展-已归档)） |
| M4: 多仓库治理增强 | 自动发现 + 并发控制 + 报告归档 | P2 | 已完成（[archive/todo-archive-phases-m2-m55.md §M4](archive/todo-archive-phases-m2-m55.md#m4-多仓库治理增强-已归档)） |
| M4.5: 跨线升级显式授权 | `--allow-major-upgrade` 跨线告警显式授权自动升级 | P2 | 已完成（[archive/todo-archive-phases-m2-m55.md §M4.5](archive/todo-archive-phases-m2-m55.md#m4-5-跨线升级显式授权-已归档)） |
| M4.6: Monorepo 成员级修复增强 | workspace 成员包直接依赖告警自动升级（T406 + T407） | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M4.6](archive/todo-archive-phases-m2-m55.md#m4-6-monorepo-成员级修复增强-已归档)） |
| M5: AI Breaking Change 研判 | Changelog 采集 + LLM 研判 + 修复生成 + 质量门 + CLI 解耦 | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M5](archive/todo-archive-phases-m2-m55.md#m5-ai-breaking-change-研判-已归档)） |
| M5.5: Skill 编排（CLI 先行） | 产品 skill 分发 + npx skills 主通道 + MCP 后端扩展 | P2 | 已完成（[archive/todo-archive-phases-m2-m55.md §M5.5](archive/todo-archive-phases-m2-m55.md#m5-5-skill-编排-cli-先行-已归档)） |
| M6: 最小平台 MVP | 仓库 + 凭据 + 仪表板 + MCP Server + Docker 部署 | P1 | 已完成（[archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp-已归档)） |
| M7: 企业级平台增强 | M7.1 用户体系 + M7.2 平台能力深化 | P2 | 已归档（[archive/todo-archive-phases-m6-m7-t711.md §M7](archive/todo-archive-phases-m6-m7-t711.md)） |
| M8: 安全加固与容器执行完备 | 兑现沙箱安全治理决议 G2-G7 | P0-P2 | 已完成（[archive/todo-archive-phases-m6-m7-t711.md §M8](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备-已归档)） |
| M9: i18n 基建同步 | 从 momei 同步 i18n 治理规范 + 审计脚本 | P2 | 已完成（[archive/todo-archive-phases-m11.md §M9](archive/todo-archive-phases-m11.md#m9-i18n-基建同步-已归档)） |
| M10: 独立沙箱容器 C26 实施规划 | Docker rootless runtime + 应用层白名单代理 + cgroup v2 资源限制 | P1 | 已完成（[archive/todo-archive-phases-m10-c53-c59c61.md §M10](archive/todo-archive-phases-m10-c53-c59c61.md)） |
| M11: 业务可见性 + 沙箱落地 + 安全文档 | C53 闭环触发 + T1005 sandbox 路由 + C28 security.md + C-ENV-CHANGE-ALERT | P1 | 已完成（[archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次-业务可见性-沙箱落地-安全文档-通知基建)） |
| M12: 平台 UX 一致性 + i18n 治理 | 2026-08-21 用户实测反馈 10 项平台 UX/安全/i18n 问题 | P1-P2 | 已完成（[archive/todo-archive-phases-m12.md §M12](archive/todo-archive-phases-m12.md)） |
| M13: 治理 + UX 反馈 + 网络治理 + Code Scanning | 2026-08-25~26 用户实测反馈 + 网络治理 + Code Scanning 规则化 | P0-P2 | 已完成（[archive/todo-archive-phases-m13.md §M13](archive/todo-archive-phases-m13.md)） |
| M14: platform release 通道 + UX 反馈跟进 | apps/platform 第 6 个发布单元 + UX-R1 + neat-freak 治理 | P1 | 已完成（[archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环-ux-反馈跟进-m14-1-2-3-x-y-全部已闭环)） |
| M15: 扫描历史详情侧栏增强（UX-R2） | 承接 M14.2 UX-R1 后的 RunDetailDialog | P1 | 已完成（[archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强-ux-r2-已闭环)） |
| M16: 平台可用性深化 | 把 apps/platform 从 demo 落地为实际可用项目 | P1 | 已完成（[archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化-m16-1-m16-2-m16-3-m16-4-m16-5-全部已闭环-2026-08-28-归档)） |
| M17: 安全与可用性收口 | C38 encryptionKey + 服务端 API i18n + admin viewer role check | P1-P3 | 已完成（[archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口-m17-1-m17-2-m17-3-m17-4-m17-5-m17-6-全部已闭环-2026-08-28-归档)） |
| M18: 平台 GitHub App BYO App 模式 | PAT + GitHub App 二者并存 + 5 子阶段 + 治理批次 | P0-P3 | 已完成（[archive/todo-archive-phases-m18.md §M18](archive/todo-archive-phases-m18.md#m18-平台-github-app-byo-app-模式-m18-0-m18-1-m18-2-m18-3-m18-4-m18-x-全部已闭环-2026-08-30-归档)） |
| M19: 治理 + 能力扩展 + 测试补强 | 按类型平衡原则 5 项任务（技术债 + 能力 + 体验 + 测试） | P2-P3 | 已完成（[archive/todo-archive-phases-m19-m21.md §M19](archive/todo-archive-phases-m19-m21.md#m19-治理-能力扩展-测试补强-m19-1-m19-2-m19-3-m19-4-m19-5-全部已闭环-2026-08-31-归档)） |
| M20: ScanResult 数据模型重构 | per-alert 模型 + reconcile + API 简化 + UI + backfill | P2 | 已完成（[archive/todo-archive-phases-m19-m21.md §M20](archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构-m20-1-m20-3-m20-5-m20-6-m20-7-全部已闭环-2026-08-31-归档)） |
| M21: 治理收口 + 能力扩展 + 测试补强 | Code Scanning RG-W + M18.x 剩余风险 + B3 PR 自动合并 + T704 e2e | P3 | 已完成（[archive/todo-archive-phases-m19-m21.md §M21](archive/todo-archive-phases-m19-m21.md#m21-治理收口-能力扩展-测试补强-m21-1-m21-2-m21-4-m21-5-全部已闭环-2026-08-31-归档)） |
| M22: SQLite 数据保护防御加固 | 2026-09-01 dependfix.sqlite 数据清空事故 + 6 原子条目 | P0-P1 | 已完成（[archive/todo-archive-phases-m22.md §M22](archive/todo-archive-phases-m22.md#m22-sqlite-数据保护防御加固-m22-1-m22-2-m22-3-m22-4-m22-5-m22-6-全部已闭环-2026-09-01-归档)） |
| M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强 | M22.7+M22.8 根因 + C66 告警视图增强 | P1-P3 | 已完成（[archive/todo-archive-phases-m23.md §M23](archive/todo-archive-phases-m23.md#m23-m22-治理债收口-根因排查-能力扩展-测试补强-m23-0-m23-1-m23-2-m23-3-m23-4-全部已闭环-2026-09-02-归档)） |
| M24: PR Check MVP + 治理债 + 测试补强 + 用户体验 | PR Check 状态监测 MVP + M22.7+M22.8 残留根因 + C36 i18n | P1-P3 | 已完成（[M24 分片](archive/todo-archive-phases-m24.md)） |
| M25: PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline + M24 follow-up 工具化 | C70 PrimeUI 降级 + C68 AI 研判基础层 + lint baseline + i18n-anchor-check + zod-helpers | P1-P3 | 已完成（[M25 分片](archive/todo-archive-phases-m25.md)） |
| M26: 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀 | C68 P1 应用层 + C67 + C69 P0 + primeicons 降级 + baseline 22 warnings 治理 + e2e 适配 + 经验归档沉淀 | P1-P3 | 已完成（[M26 分片](archive/todo-archive-phases-m26.md)） |
| M27: 用户体验 + 治理优先 | M27.1 重复评估修正 + M27.2 W1 apps/platform stylelint + M27.3 W2 logger 补测 + M27.4 W4 container-executor 补测 + M27.5 ECONNRESET 候选 ① 诊断 | P1-P3 | 已完成（[M27 分片](archive/todo-archive-phases-m27.md#m27-用户体验-治理优先-m27-1-m27-2-w1-m27-3-w2-m27-4-w4-m27-5-全部已闭环-2026-09-10-归档)） |
| M28: 治理债清理 + 能力扩展 | M28.1 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 + M28.2 C14 多 cs lint 性能 + M28.3 C15 B 类规则样本核对 + M28.4 C33 MCP P3 + M28.5 M22.8 follow-up ② | P2-P3 | 已完成（[M28 分片](archive/todo-archive-phases-m28.md)；2026-09-11 用户决策方案 M28-A + M28.1 重编号 + 完整 5 候选闭环 + M28.6 归档批次落地，commits 已推送 origin/master） |
| M29: 修复交付链路正确性 + 能力扩展 | C73 git 配置污染隔离 + C75 验证链纳入 test + C77 override 复发防护 + C78 alerts 未启用/获取失败区分 + C71 pnpm 路径级 overrides + C72 批量导入 archived/disabled 过滤 + vite 漏洞插队 hotfix + C79 devEx 配置缺口 + C80-A CI 审计覆盖（M29.8/M29.9 为 M29.1 衍生） | P2-P3 | 已完成（已归档，2026-10-01 M34 归档批次预防性分片迁出至 [archive/todo-archive-phases-m29.md §M29](archive/todo-archive-phases-m29.md#m29-修复交付链路正确性-能力扩展-m29-1-m29-9-全部已闭环-2026-09-27-归档)） |
| M30: 治理债清理 + 迁移可行性验证 + 能力扩展 + 测试补强 | C87 跳过类审计退出码 + C86 max-lines 拆分 + C84 文档对齐 + C74 getCommitAuthor 接线（App 路径）+ db-restore 补测 + UI 组件库迁移可行性验证 V1-V3 | P2-P3 | 已完成（[archive/todo-archive-phases-m30.md §M30](archive/todo-archive-phases-m30.md#m30-治理债清理-迁移可行性验证-能力扩展-测试补强-m30-1-m30-6-全部已闭环-2026-09-28-归档)） |
| M31: apps/platform UI 组件库迁移（PrimeVue → caomei-ui） | B0 基线与双库并存接线 + B1a/B1b DataTable 迁移 + B2 表单/浮层切换 + B3 收尾卸载与回归 + C90 db-restore 补强 | P2-P3 | 已完成（[M31 分片](archive/todo-archive-phases-m31.md#m31-apps-platform-ui-组件库迁移-primevue-→-caomei-ui-m31-1-m31-6-全部已闭环-2026-09-29-归档)） |
| M32: 能力扩展优先 | C76 平台验证命令配置 + C85 目标仓库专属配置 + C89 Code Scanning 未启用区分 + C82 git 签名语义边界 + C92 视觉回归最小集 | P3 | 已完成（[M32 分片](archive/todo-archive-phases-m32.md#m32-能力扩展优先-m32-1-m32-5-全部已闭环-2026-09-30-归档)） |
| M33: 治理债收口 + 测试基建扩展 | C91 review 检查点补挂 + 视觉回归 CI 转阻断 + M31 dependabot 死配置清理 + C93/C94 视觉回归覆盖扩展 + C80 观察期阻断语义 + M33.7 迁移入口 + M33.8–M33.10 UI 修复 + M33.11 存量漏洞治理 | P3 | 已完成（[archive/todo-archive-phases-m33.md §M33](archive/todo-archive-phases-m33.md#m33-治理债收口-测试基建扩展-m33-1-m33-11-全部已闭环-2026-09-30-归档)；2026-09-30 归档） |
| M34: 治理与体验收口 + 组件库升级与巡检基建 | devEx `data/` 产物污染治理 + caomei-ui 0.5.0 升级（弹窗 Select 裁剪/层级） + 视觉回归灵敏度与弹窗覆盖 + 上游组件问题归因流程 + label 间距统一 + 字段堆叠口径复用化 + PrimeUI 文档同步 + C83 验证链失败基线 | P2-P3 | 已完成（[todo-archive-phases-m34.md §M34](archive/todo-archive-phases-m34.md#m34-治理与体验收口-组件库升级与巡检基建-m34-1-m34-7-全部已闭环-2026-10-01-归档)；2026-10-01 归档） |
| M35: 批量运行终态兜底对账 + 进度可见性修复 | 周期兜底对账服务 + 写回逻辑收敛 + `finishedAt` 真实化 + sync 立即终结 + 前端口径修正 + 存量订正脚本 + 设计口径同步 | P2-P3 | 已完成（[todo-archive-phases-m35.md §M35](archive/todo-archive-phases-m35.md#m35-批量运行终态兜底对账-进度可见性修复-m35-1-m35-6-全部已闭环-2026-10-02-归档)；2026-10-02 归档） |
| M36: 治理债清仓 + 可观测性与测试稳定性 | C81 孤立规划编号存量清理（分批）+ 文档陈旧状态清理 + BatchRun 写回竞态收敛 + 告警源可审计性判据 + api-i18n e2e 顺序偶发 + dependfix-platform 镜像体积治理 + pnpm overrides key 语义归一化 + Docker 首次启动数据库初始化与部署文档 + 扫描队列孤儿 job 释放 + 队列消费者维度自动降级 | P1-P3 | 已完成（[M36 分片](archive/todo-archive-phases-m36.md#m36-治理债清仓-可观测性与测试稳定性-m36-1-m36-10-全部已闭环-2026-10-05-归档)；2026-10-05 归档） |
| M37: 运行可观测性与体验记忆 | 运行失败分类与筛选 + 落库回填（failureStage / failureKind，不含重试入口）+ 扫描 / 批量扫描偏好记忆（方案 C 混合）+ BatchRun 写回与告警源错误信号残余治理 + caomei-ui 版本口径同步 + 孤立编号检测脚本接入 CI 门禁 + 目标仓库 git hooks 隔离 | P1-P3 | 已完成（2026-10-06 用户决策方案 B + 同日授权追加 M37.6；2026-10-08 已闭环归档，见 [M37 分片](archive/todo-archive-phases-m37.md#m37-运行可观测性与体验记忆-m37-1-m37-6-全部已闭环-2026-10-08-归档)） |
| M38: 平台执行模型隔离 | 队列执行进程隔离（方案 ①′ 独立 worker 进程，治本）+ Worker 锁参数显式化与锁问题事件观测（止血）+ `scan.post` failover 透传 reuse + e2e 全页卡片计数断言解耦 + `scan-queue.ts` 注释 jobId 口径订正 + schedule 表单复用 scan-options 口径 | P1-P3 | 已完成（2026-10-06 用户授权 / 2026-10-09 已闭环归档，见 [M38 分片](archive/todo-archive-phases-m38.md#m38-平台执行模型隔离-m38-1-m38-6-全部已闭环-2026-10-09-归档)） |
| M39: 平台视图体验与可观测补强 | 扫描页筛选与分页优化 + 扫描历史弹窗体验 + 告警视图「按包」聚合跨 severity 重复分组修正 + 运行日志下载与批量下载 + PR Check 监测启用链路打通 + 环境事件覆盖扩展 | P2-P3 | 已完成（2026-10-09 用户决策方案 A / 2026-10-10 已闭环归档，见 [M39 分片](./archive/todo-archive-phases-m39-m40.md#m39-平台视图体验与可观测补强-m39-1-m39-6-全部已闭环-2026-10-10-归档)） |
| M40: 运行时可靠性与可观测性深化 | 部署产物版本戳陈旧校验 + 失败 run 落 summary 快照 + 执行超时可配置化 + 队列 worker 崩溃自动重启 + sandbox 降级回退路径落执行日志 + 平台环境变量文档完整性治理 | P2 | 已完成（2026-10-10 用户决策方案 A / D2 以环境变量文档治理替换 M40.6；2026-10-10 已闭环归档，见 [M40 分片](./archive/todo-archive-phases-m39-m40.md#m40-运行时可靠性与可观测性深化-m40-1-m40-6-全部已闭环-2026-10-10-归档)） |
| M41: 规范与经验管理体系重构 | standards 去实现化瘦身 + 经验体系三层收敛与精简 + 规范/经验门禁落地（CI 阻断）+ 文档站导航分层 + 阈值与事实源唯一化 | P2-P3 | 已完成（2026-10-10 用户决策方案 B / 2026-10-10 已闭环归档，见 [M41 分片](archive/todo-archive-phases-m41.md#m41-规范与经验管理体系重构-m41-1-m41-5-全部已闭环-2026-10-10-归档)） |
| M42: 修复交付正确性 + 平台能力与体验补强 | network-audit 出站白名单镜像源扩充与动态发现 + `.gitignore` 幂等判定归一化 + 扫描复用路径误置既有 run 为 failed 修复 + PR Check 手动触发 + 平台列表页表格基础能力补强 + 严重级别展示策略统一 | P2-P3 | 已完成（2026-10-10 用户决策方案 A+B 混合 / 2026-10-11 已闭环归档，见 [M42 归档分片](archive/todo-archive-phases-m42.md#m42-修复交付正确性-平台能力与体验补强-m42-1-m42-6-全部已闭环-2026-10-11-归档)） |
| M43: PR Check 能力补强 + 运行时可靠性与工程治理 | PR Check 列表仓库标识 + PR 构建/部署错误多源采集（GitHub 三源聚合）+ 容器内 `pnpm install` 环境性失败可观测性与归因口径 + 扫描触发去重合并前端感知 + git 非仓库 / push 钩子边界收口 + 工程脚本加固（门禁产物排除 + 蒸馏计数假阴性） | P2-P3 | 已完成（2026-10-12 用户决策方案 A / 2026-10-14 已闭环归档，见 [M43 分片](archive/todo-archive-phases-m43.md#m43-pr-check-能力补强-运行时可靠性与工程治理-2026-10-12-用户决策方案-a-2026-10-14-归档)） |
| M44: 验证链治本 + 文档门禁可信度收口 | 验证命令链纳入 `typecheck`（治本）+ 文档门禁机检缺口收敛（四类静默缺陷）+ 文档口径与命名一致性收口 + 设计文档存量超健康窗口分批拆分 + 站点语言切换器未翻译页 404 兜底 + `tech-stack` 平台依赖表行级一致性 | P2-P3 | 已完成（2026-10-14 用户决策方案 A / 2026-10-15 已闭环归档，见 [M44 分片](archive/todo-archive-phases-m44.md#m44-验证链治本-文档门禁可信度收口-m44-1-m44-6-全部已闭环-2026-10-15-归档)） |
| M45: 运行可靠性与交付链收口 | 自用验证链面差收口 + 零告警仓库修复前基线采样成本 + 队列 worker 按 role 跳过周期插件 + 运行失败受约束重试入口 + 浮层类组件视觉覆盖扩面 + PR Check 告警关注集 | P2-P3 | 已完成（2026-10-15 用户决策方案 A / 2026-10-19 已闭环归档，见 [M45 分片](archive/todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)） |
| M46: 运行结果可信度与可观测性 | 环境性失败与「有告警未修」可见性 + 跨 major / 截断 / 子目录跳过披露 + 基线完整链与门禁回滚粒度 + 执行容器内存下限与 OOM 归因 + 平台通知与邮件推送（issue #190）+ 视觉库 fixtures 前置断言 | P1-P3 | 已完成（2026-10-20 用户决策方案 A / 2026-10-22 已闭环归档，见 [M46 分片](archive/todo-archive-phases-m46.md#m46-运行结果可信度与可观测性-2026-10-20-用户决策方案-a-2026-10-22-归档)） |
| M47: 交付判定可信与运行自证 | 验证链与目标仓库 CI 口径对齐 + 构建版本回执与安装日志语义 + 环境性失败归因收口 + pnpm store 持久化与提交卫生 + 通知周汇总（`weekly_digest`）+ 工程门禁与提交卫生收口 | P1-P3 | 已完成（2026-10-22 用户决策方案 A′ / 2026-10-24 已闭环归档，见 [M47 分片](archive/todo-archive-phases-m47.md#m47-交付判定可信与运行自证-2026-10-22-用户决策方案-a′-2026-10-24-归档)） |
| M48: 对外 PR 交付闭环 | 兄弟包 / peer 家族锁步升级 + CI 独有脚本纳入验证链 + 同告警尝试指纹去重 + 提交面白名单与 YAML 定点编辑 + PR 创建后 CI 回环 + 外部作业归因与合并门禁 | P0-P1 | 已完成（2026-10-24 用户决策 D+E / 2026-10-25 已闭环归档，见 [M48 分片](archive/todo-archive-phases-m48.md#m48-对外-pr-交付闭环-2026-10-24-用户决策-d-e-2026-10-25-归档)） |
| M49: 0.6.0 发版清障 | 自产 code scanning 告警清零 + 依赖漏洞清零 + Security 门禁转正 + 发版文档漂移收口 + 0.6.0 发布与发布后验证 | P0 | 已完成（2026-10-25 用户决策 / 2026-10-29 已闭环归档，见 [M49 详情分片](archive/roadmap-phases-m49.md#m49-0-6-0-发版清障-2026-10-25-用户决策-2026-10-29-已闭环-归档) + [M49 归档分片](archive/todo-archive-phases-m49.md#m49-0-6-0-发版清障-2026-10-25-用户决策-2026-10-29-归档)） |
| M50: 通知可信度收口（1.0-E） | `critical` 告警必选不可关闭 + 通知严重级别术语与阈值命名收敛 + 周报投递重试与窗口锁 + `/settings` 与通知页 dark 视觉覆盖 | P1-P3 | 已完成（2026-10-29 用户决策 / 2026-10-30 已闭环归档，见 [M50 详情分片](archive/roadmap-phases-m50.md) + [M50 归档分片](archive/todo-archive-phases-m50.md)） |
| M51: 语义与数据收口（1.0-F1） | 告警级修复结果回写 + PR Check 结论统一与同 ref 收敛 + 平台 PR 回环 + 基线红交付降级 + 取消面与单仓剩余预算 + 配置写入闸门与 alerts 排序兜底 | P0-P2 | 已完成（2026-10-30 用户决策 / 2026-10-30 已闭环归档，见 [M51 详情分片](archive/roadmap-phases-m51.md) + [M51 归档分片](archive/todo-archive-phases-m51.md)） |
| M52: 文档平价与验证收口（1.0-F2） | en-US 指南与设计镜像平价 + 归档锚点按产物 id 迁移 + pr-checks 归因渲染与视觉确定性 + G5 覆盖率复测 + caomei-ui 1.0.0-rc.1 升级（用户追加） | P1-P2 | 已完成（2026-10-30 规划 / 2026-10-31 已闭环归档，见 [M52 详情分片](archive/roadmap-phases-m52.md) + [M52 归档分片](archive/todo-archive-phases-m52.md)） |
| 1.0: 发布门槛收口 | E 通知可信度（= M50，已归档）+ F1 语义与数据（= M51，已归档）+ F2 文档与验证（= M52，已归档）+ G 发布工程（M53：契约冻结 / 迁移指南 / 真实环境矩阵 / `@v1`） | P0-P1 | 进行中（E / F1 / F2 已闭环；G 待规划；台账见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)） |

> **本路线图定位**：按 [规划规范 §2.1](../standards/planning.md) 仅维护阶段概览（目标 / 优先级 / 状态）。详细实施记录 / commit 引用 / 关键决策 / 经验教训见对应归档段（详见下方"## 详细任务"索引）。

> **M0 - M38 阶段详情已迁出**：见 [archive/roadmap-phases-m0-m38.md](archive/roadmap-phases-m0-m38.md)（2026-10-15 M44.4 批次③ 迁出；主文档保留概述表与最近阶段）。

> **M39-M52 阶段详情已迁出**：M39-M48 见 [archive/roadmap-phases-m39-m48.md](archive/roadmap-phases-m39-m48.md)（2026-10-26 文档治理批次迁出）；M49 见 [archive/roadmap-phases-m49.md](archive/roadmap-phases-m49.md)（2026-10-29 归档批次迁出）；M50 见 [archive/roadmap-phases-m50.md](archive/roadmap-phases-m50.md)（2026-10-30 归档批次迁出）；M51 见 [archive/roadmap-phases-m51.md](archive/roadmap-phases-m51.md)（2026-10-30 归档批次迁出）；M52 见 [archive/roadmap-phases-m52.md](archive/roadmap-phases-m52.md)（2026-10-31 归档批次迁出）。主文档保留里程碑概述表与当前阶段状态。

## 当前阶段：无活跃阶段

M52（文档平价与验证收口，1.0-F2 批次）已于 2026-10-31 闭环并归档，阶段详情见 [archive/roadmap-phases-m52.md](archive/roadmap-phases-m52.md) + [archive/todo-archive-phases-m52.md](archive/todo-archive-phases-m52.md)。1.0 门槛批次 E（M50）/ F1（M51）/ F2（M52）全部完成。

**后续（已授权，待规划）**：G 发布工程（M53，契约冻结 / 迁移指南 / 真实环境矩阵 / `@v1`）；真实环境验证所需凭据 / staging / AI 预算由用户提供。M52 残余（视觉边缘抖动、zh CLI 表缺口、G5 mutation 覆盖面）与 0.6.0 发布残余已登记 [backlog.md](backlog.md)。

---

## 详细任务

- 当前阶段任务：[todo.md](todo.md)（**无活跃阶段**）
- 已归档阶段：[todo-archive.md](todo-archive.md)（阶段索引 + 分片；M0-M52 全部已归档；分片治理见 [archive/index.md](archive/index.md)）
- 下一阶段（已授权，待规划）：**G 发布工程**（M53；台账见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)）
- 后续阶段任务（延期项 + 未排期增强候选）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录

# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。
>
> **当前状态**：**M26 阶段 7 原子条目全部已闭环 / 2026-09-10 归档**（ahead=0 已推送至 origin/master；详见 [todo-archive.md §M26](todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档) + [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md) 完整实施记录）。

---

## M26 阶段归档闭环摘要（2026-09-10 / ahead=0 / 36 commits）

**M26 阶段承接 M25.2b + M25 follow-up #3/#4/#5 + C67 + C69**：方案 A 治理优先 + 能力扩展 + UX + 测试补强。**7 原子条目独立闭环**（🚀 2 + 🛡️ 3 + 📚 2 + UX 隐含在 M26.1/M26.2/M26.3），符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md)。

| 原子条目 | 优先级 | 类型 | 闭环 commits | 详情 |
|:--|:--|:--|:--|:--|
| **M26.1** M25.2b 应用层 | P1 | 🚀 能力 + UX | 10 commits | C68 P1 应用层（4 API 端点 + UI + i18n + docs） |
| **M26.2** C67 批量导入 Resource owner 化 | P2 | 🚀 能力 + UX | 4 commits | 与 MCP `discover_repos` `owner: string[]` 对齐 |
| **M26.3** C69 文档站 + 包 README 多语言 en-US P0 | P2 | 📚 治理 | 7 commits | VitePress 脚手架 + 8 个 en-US md + 包 README 双语化 + check:readme-i18n |
| **M26.4a** primeicons@8.x → 7.x 降级 | P3 | 🛡️ License 治理 | 1 commit | 消除最后 1 个 PrimeUI License 包 |
| **M26.4b** baseline 22 warnings 治理 | P3 | 🧪 治理 | 4 commits | 22 → 0 warnings 全部治本（不扩展 max-warnings） |
| **M26.4c** e2e 测试适配 M26.1/M26.2 行为变更 | P3 | 🧪 治理 | 5 commits | 仅测试侧适配，不改生产代码 |
| **M26.5** 经验归档沉淀（wisdom 蒸馏 + experience-archive §五十八-§六十二） | P2 | 📚 治理 | 1 commit | wisdom 活跃 17 → 7 ≤ 15 阈值已合规 |
| **配套治理 + docs 收口 + CI Coverage 修复** | — | 🛡️ 治理 | 8 commits | pre-commit identity guard + stylelint + check:docs 重构 + CI Coverage 80% 修复 |

**总投入**：**23 atomic commits 实施 + 13 配套 commits（re-audit 修复 + docs 收口 + 治理补丁 + CI Coverage 修复）= 36 commits**。ahead commits 实证 = **0**（全部已推送至 origin/master / 2026-09-10 实测）。

**关键决策 D1-D4**：
- **D1**：7 原子条目按 §1.1 任务粒度约束（每原子 < 5 commits / < 800 行推荐粒度，< 10 文件 / < 800 行硬阈值）+ §1.1 L12 类型平衡原则选 7 原子；2026-09-08 决策时为 6 原子，2026-09-10 增 M26.4c 后为 7 原子
- **D2**：M26.4 拆分为 M26.4a（primeicons 降级）+ M26.4b（baseline warnings）—— 不相干内容不合并（用户决策 2026-09-08）
- **D3**：M26.3 C69 仅落地 P0（5 commits / 0.5-1 切片），P1 增强留 M27+
- **D4**：M26.5 双轨制（wisdom 蒸馏 + experience-archive §五十八-§六十二）—— 覆盖 M25 沉淀的 2 条新 wisdom + 25 commits 文档治理批次新增 pattern

**关键经验（已挂 standards）**：
- [ai-collaboration.md §1.4](../standards/ai-collaboration.md) 跨文档一致性核验纪律
- [development.md §5.1.22](../standards/development.md) lint baseline 治理（治本 vs 临时方案）
- [i18n.md §3.X](../standards/i18n.md) locale 文件管理 + insert anchor 目标 locale 文本
- [testing.md §6](../standards/testing.md) zod `parseOptional` 三态语义
- [planning.md §4.4](../standards/planning.md) 大批量归档批次操作规范（anchor 实证 + 跨文件外链追踪 + 跨目录相对路径精确 + commit 分组追踪 + ahead 实证 + 死链验证）
- [ai-collaboration.md §2.0](../standards/ai-collaboration.md) PDTFC+ coverage 验证步骤（session 验证矩阵必须含 pnpm test:coverage）

---

## M27 阶段候选评估（待用户决策启动）

**M26 已完整闭环**（ahead=0 / 2026-09-10 归档），下一阶段候选按"类型平衡"原则从 [backlog.md](backlog.md) §短期 / 一次性候选任务 选取。下次会话启动后建议先 `pnpm distill:wisdom --check` 实证状态（WISDOM_OK 8 active ≤ 20 阈值）。

### 未上收 backlog 候选清单（候选池按"类型平衡"原则 + 跨模块 ≥ 2 + 治理优先）

按 backlog §短期 / 一次性候选任务 / 延期 / 暂缓项 / 已知边界 / 待人工验收 等段分类汇总（详见 [backlog.md](backlog.md)）：

| 候选 ID | 主题 | 优先级 | 类型 | 触发条件 / 关联 |
|:--|:--|:--|:--|:--|
| **C66** 告警视图增强 | GHSA/CVE 关联 + 跨次扫描去重 + fix 复用 | P2 | 🚀 UX | 用户实测反馈 / fix 复用被 B 模式性能瓶颈触发 |
| **C33** MCP P3 | pnpm-audit 本地 tool + 统一错误包装 + 返回结构对齐 | P3 | 🚀 能力 | 等本地场景真实需求 |
| **C36** 服务端 API 错误消息 i18n | 全端点错误响应 `message` 键按 locale 返回 | P2 | 🚀 UX | 中文用户看不懂硬编码英文 |
| **C37** 语言偏好多设备同步 | 多设备切换重新设置 | P3 | 🚀 UX | 用户实测反馈多设备用户；前置 C36 |
| **D1** repo_admin + RepositoryAccess | 仓库级 admin 角色区别于全局 admin | P3 | 🚀 能力 | 当前 owner 角色对仓库控制粒度不足；关联 C22 |
| **D3** 多租户组织体系 | 多组织/org 共存 + org 切换 | P3 | 🚀 能力 | 单-org 模型限制 org 切换；前置 D1 |
| **D8** remove-user 关联资源检查 | 无 user→resource 关联时暂不需要 | P3 | 🧪 治理 | 前置 D1 资源关联表 |
| **B2** 固定分支单线设计 | 独立平台部署后修复频率上升，需要固定修复分支 | P3 | 🧪 治理 | v1.0.0 后 M12 平台 UX 修复链路上线；关联 T210 |
| **C15** B 类规则真实仓库样本核对 | js/py/java 精选集 + go/ruby/csharp/cpp 落 C 兜底 | P3 | 🧪 治理 | 来源 T302 Review Gate 2026-08-05 |
| **C9** summary 字段未渲染 | T304 遗留；告警 summary 已收集未渲染 | P3 | 🚀 UX | 来源 T304 Review Gate 2026-08-05 |
| **C13** app/helpers ↔ cli/helpers 值级循环依赖 | 运行时安全；建议下沉公共层 | P3 | 🧪 治理 | 来源 M3 收尾审查登记 |
| **C14** 多 cs 告警逐告警全项目 lint 性能 | 合并验证 | P3 | 🚀 能力 | 来源 T303 Review Gate |
| **T905** git worktree 并行开发预案 | 多 agent 并行开发成为常态 | P3 | 🧪 治理 | 当前单 agent 工作流无需启用 |
| **SAML 2.0 SSO** | D2 username 等待 SAML SSO 上后再决定 username 模型 | P3 | 🚀 能力 | 当前 better-auth OIDC 优先 |
| **T701** 真实凭据 3 项 | OAuth / OIDC 登录闭环 + 构建期配置凭据后按钮显示路径 | P3 | 🚀 能力 | 真实环境验证任务 |
| **T702** HTTP 层状态流转 | 状态流转时间序列正确性 + 前端轮询体验 | P3 | 🧪 治理 | 真实环境验证任务 |
| **T704** async 定时触发 | BullMQ upsertJobScheduler 短间隔 every 集成测试 + Schedule CRUD e2e | P3 | 🧪 治理 | M21.5 已部分闭环；真实环境验证任务 |
| **M22 neat-freak 收敛** | security.md §2.1 权威 + development.md §5.1.18 / platform.md §3.7 收敛为引用 | P1 | 📚 治理 | M23.0 G1 已部分收敛；剩余收敛待下次 neat-freak 批次 |
| **W1** apps/platform 增配 stylelint + lint 系列 scripts | stylelint@17.15.0 + stylelint-config-cmyr + lint:i18n/css/md | P2 | 🧪 治理 | 已 2026-09-09 入 backlog；`cd79724` 已 commit 部分落 `docs/platform` stylelint 配置 |
| **W2** logger.ts 26 branches 100% 未覆盖补单测 | `apps/platform/server/utils/logger.ts` 26 branches 100% 未覆盖 | P2 | 🧪 测试 | CI Coverage 修复 follow-up |
| **W3** await-thenable 7 测试文件治理 | CI Coverage 修复 follow-up；M26.4b 已部分治理 | P3 | 🧪 测试 | 治本同套模式补单测 |
| **W4** container-executor.ts 35.2% branches 覆盖 | `apps/platform/server/services/executor/container-executor.ts` 68 uncovered / 105 total | P3 | 🧪 测试 | M26 阶段改动引入；可走覆盖率治理批次 |
| **C30** Publish Docker build job 失败排查 | 2026-08-18 用户决策暂缓 | P3 | 🛡️ 治理 | 双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作 |
| **T705** 生产级部署（PostgreSQL + Helm + Sentry） | 2026-08-12 用户指示暂缓排期 | P2 | 🚀 能力 | — |
| **T703** 跨平台 Git（GitLab + Bitbucket） | 2026-08-12 用户指示暂缓排期 | P3 | 🚀 能力 | — |
| **PrimeVue 4 → 5 升级评估** | §M14.2 / dependabot #49 触发评估 | P3 | 🚀 能力 | 需评估 PrimeVue 5 migration guide 工作量；与主线 #1 联动决策 |

**插队例外清单**（按 [规划规范 §3.1](../../docs/standards/planning.md)）：仅 3 类可走 todo.md 当前阶段 + 阶段编号：
1. **安全问题**：已确认的安全漏洞（Code Scanning 告警、Snyk/Dependabot critical、有 PoC 的安全 issue）
2. **漏洞问题**：依赖链中高危漏洞（critical CVE、GHSA 标识 critical/high 且影响 dependfix 自身或被 dependfix 管理的仓库）
3. **直接影响可用性的任务**：生产环境故障、P0/P1 事故恢复、CI 主链路阻塞、用户报告的 blocker 级功能缺失

> **backlog 候选评估决策权**：本批次候选清单仅为汇总参考，最终阶段启动决策（候选选取 / 切片 / 范围 / 治理优先级）由用户决策后由 AI 执行 PDTFC+ 流程。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| **当前阶段 M26 已闭环（2026-09-10 归档）** | [todo-archive.md §M26](todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档) + [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)（完整实施记录） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 3 个阶段：M26 指针 + M23 + M22 完整段；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md)（**M26 归档批次同步清理**：C67 / C68 / C69 / M25 follow-up #3 primeicons 降级 / M25 follow-up #4 baseline 9 warnings 治理 / M25 follow-up #5 经验归档沉淀 全部已闭环移除） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M26 段已 2026-09-10 用户决策启动 + 7 原子条目完整闭环 + 归档；M25 段状态从「进行中」→「已闭环」） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
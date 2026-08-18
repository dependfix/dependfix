# 当前阶段任务

> **T912 SMTP 邮件发送器（2026-08-18 启动，P2 进行中）**：引入 `nodemailer` 统一实现 better-auth 三处邮件回调（`sendVerificationEmail` / `sendResetPassword` / `sendChangeEmailConfirmation`），原 M6 模式（SMTP 未配置降级 `console.warn`）不再静默空跑；触发条件达成（[backlog §M7.1 「邮件发送器统一实现」](backlog.md#m71-认证与用户体系)登记）。任务拆解见下方 T912 区块。
> **M9 i18n 基建同步已归档（2026-08-15）**：T901-T906 全部交付（5 个原子 commit 覆盖 6 任务，2556 行 inserts / 2539 行净增，详见 [todo-archive.md §M9](todo-archive.md#m9-i18n-基建同步已归档)）。依据 [i18n 规范](../standards/i18n.md) 与 momei translation-governance 蓝本，落地语言分级 / freshness 分层 / 缺词 blocker / 动态 key 白名单 / 重复文案审计 / vue-i18n 专项 lint / docs 防回流门禁；为后续 i18n 内容扩展（README 中英双版本 → docs 翻译 → platform 多语言）铺路。翻译内容与多语言扩展留后续阶段排期。
> **M8 安全加固与容器执行完备已归档（2026-08-14）**：T801-T806 全部交付（20 个提交，本地待推送）。依据 [沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md) §5 治理决议（G2-G7）与 [backlog.md §沙箱与恶意依赖防护治理登记](backlog.md)（C39-C45）排期，封堵 dependfix 成为恶意依赖扩散工具的残余路径。任务拆解见下方 M8 区块。
> **T711 覆盖率冲刺已归档（2026-08-14）**：四维 ≥ 80% 达成（Stmts 85.89% / Branch 80.6% / Funcs 85.51% / Lines 85.96%，1494 tests），记录见 [todo-archive.md §T711](todo-archive.md#t711-覆盖率口径修正--冲刺至-80已归档)。
> **T705 / T703 已延期（2026-08-12 用户指示）**：生产级部署（PostgreSQL/Helm/Sentry）与跨平台 Git（GitLab/Bitbucket）暂缓排期，见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)。
> **T706 已完成（2026-08-12）**：`@dependfix/mcp@0.1.2` 已发布 npm；skill 双后端验证与 MCP 接入文档为轻量收尾（随文档同步跟进）。

---

## M8: 安全加固与容器执行完备（2026-08-14 启动，已归档）

- 优先级：`P0-P2`（安全是本项目核心目标——更新依赖修复漏洞，但修复过程不能引入新漏洞）
- 背景：2026-08-14 安全专项评估（[sandbox-security-governance.md](../design/governance/sandbox-security-governance.md)）完成威胁链建模与治理登记；G1（C38 容器降权）已修复。本阶段兑现剩余治理项（G2-G7 + C45），并以 C45 实证发现（容器内 git/pnpm 工具链从未安装，ContainerExecutor fix 链路实际不可用）为 P0 首项。
- 任务拆解（按依赖与优先级）：

| 任务 | 治理项 | 优先级 | 内容 | 验收要点 |
|:--|:--|:--|:--|:--|
| **T801 容器工具链补齐** | C45 | P0 | runtime 阶段安装 git + pnpm（pnpm 钉定 11.18.0 零网络拷贝；git 随 alpine 滚动，可复现以基础镜像 digest 为基线）；容器内执行链路实证（report-only + fix 冒烟） | ✅ **已完成（2026-08-14）**：git 2.54.0（apk）+ pnpm 11.18.0（构建链镜像零网络拷贝）；补齐 cli/engine/core workspace node_modules 打包；实证暴露并修复 pnpm-audit legacy range 前缀假跳过 bug（engine 层 + 4 测试）；容器内全链路：report-only 1 alert → fix 0.0.8→0.2.4 → fix --commit（ensureGitConfig）→ 报告产物。记录见 [backlog C45](backlog.md) |
| **T802 验证命令单命令超时** | C41（G4） | P1 | `verification-runner.execCommand` 增加单命令 timeout（默认 10 分钟可配），恶意死循环脚本超时中止 | ✅ **已完成（2026-08-14）**：`execCommand` 单命令超时（默认 10 分钟可配 `commandTimeoutMs`），超时中止并终止进程树（POSIX 进程组 / Windows taskkill /T /F，防孙进程残留）；超时归类 `timed out after Xms` 进 failure 与报告 error，报告无挂死；4 新增测试 + taskkill 真实进程树终止实证 |
| **T803 凭据权限面启动检查 + 本地模式防线** | C42+C39（G6+G2） | P0（合并 C39 P0 / C42 P1，取最高） | CLI/Action 启动时 token 权限探测（repo scope / security-events 等），超权限警告；本地模式执行不可信代码风险提示 | ✅ **已完成（2026-08-14）**：启动 `GET /user` 探测权限面（classic repo scope 超权限警告 / Code Scanning 缺 security-events 提示，失败静默）；fix/fix-and-pr 本地执行风险警告（`DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制，ContainerExecutor 容器环境不误报）；analyzeTokenScope 7 测试 + 网络层 4 测试；quick-start / 治理文档 / backlog 同步 |
| **T804 供应链信号披露** | C43（G7） | P2 | 报告/PR 警示区：本次新增/升级包带 lifecycle scripts 且被目标仓库 `allowBuilds` 批准时披露 | ✅ **已完成（2026-08-14）**：supply-chain 模块解析 `pnpm-workspace.yaml` `allowBuilds`/`onlyBuiltDependencies`（行级解析无 yaml 依赖）+ 读 node_modules/.pnpm 实际包 lifecycle 脚本（peer 后缀 store 前缀匹配兜底）；run() 报告与 fix-and-pr PR body 双路径接入；报告新增 ⚠️ Supply Chain Warnings 节 + PR body 警示区（含包名/脚本类型）；17 单测 + 2 集成测试（PR body 含/不含警示区）；真实仓库实证（esbuild→postinstall / better-sqlite3→install / 未批准不披露） |
| **T805 执行期外联审计日志** | C40（G3） | P1 | 容器执行期间网络外联记录（备查，出站白名单留 M9 C26） | ✅ **已完成（2026-08-14）**：verification-runner 执行期外联审计（默认开启）——本地审计代理（CONNECT+HTTP 转发，10s 超时防挂死）注入代理 env 捕获 curl/wget/npm 外联（环境已有代理不覆盖）+ 命令输出 URL 提取确定性捕获 pnpm registry 外联（实证 pnpm 不走代理 env）；执行日志输出（总数 info/明细 debug，仅方法+目标）；实证 curl CONNECT + echo URL 双路径真实生效；13 新测试 |
| **T806 安全规范挂接 review 检查点** | C44 | P1 | `code-reviewer` 的 `code-quality-checklist` 补 §5.3 检查点（与 C34 存量盘点联动） | ✅ **已完成（2026-08-14）**：`code-quality-checklist.md` 新增"修复执行安全基线（必查项）"——§5.3 十三条必须级条款逐项核验（非 root / 工作目录隔离 / 超时兜底 / pnpm 脚本防护 / 凭据最小化 / 权限面收敛 / 研判 / 供应链披露 / 白名单回传 / 资源与网络 / 威胁建模评审）+ 链接引用（单点声明不抄条款）；Code Auditor 必查项同步薄引用；C34 存量盘点保持待评估独立排期 |

- 完成定义：T801-T806 全部交付，每项独立 Review Gate Pass + 分批提交；`pnpm lint` / `typecheck` / 定向测试通过（Dockerfile 类改动附容器实证）。
- 非目标（移交下一阶段 backlog）：C26 独立沙箱容器（网络出站白名单 + cgroup + 每任务容器，BullMQ worker 结合）、C30 镜像构建 CI 链路裁决、C28 凭据加密存储文档章节、C29 平台 UI 暗色模式。

---

## T912: SMTP 邮件发送器统一实现（2026-08-18 启动）

- 优先级：`P2`（真实部署必需，不阻塞开发与功能主线；SMTP 未配置时降级 console.warn 不影响现有流程）
- 背景：M7.1 T701/T707 实施后 better-auth 配置了 `sendVerificationEmail` / `sendResetPassword` / `sendChangeEmailConfirmation` 三处回调钩子，**当前均为空实现**（仅 `console.warn` 日志）。`.env.example:15-20` 提供 SMTP_* 配置项，`nuxt.config.ts:81` `smtpEnabled: !!process.env.SMTP_HOST` 已有判定，但 SMTP 配置后邮件仍不实际发送——真实部署邮箱验证 / 密码重置 / 邮箱变更链路断裂。
- 来源：[backlog.md §M7.1 「邮件发送器统一实现」](backlog.md#m71-认证与用户体系)（2026-08-09 T701-3 审计登记），触发条件「引入邮件发送依赖（如 nodemailer）或 SMTP 配置成为真实部署需求时」已达成。
- 决策（2026-08-18 用户指示）：引入 `nodemailer`（Node.js 生态事实标准、零网络依赖、可纯 ESM 接入、better-auth 官方示例推荐）。
- 任务拆解（按依赖与优先级）：

| 任务 | 优先级 | 内容 | 验收要点 |
|:--|:--|:--|:--|
| **T912-1 nodemailer 接入 + mailer service** | P2 | `apps/platform/server/services/mailer/` 新建模块；封装 `nodemailer.createTransport`（基于 `runtimeConfig.smtp*`）+ `sendMail({ to, subject, html, text })` 统一接口；SMTP 未配置时降级 `console.warn` + 返回 `{ delivered: false, mode: 'noop' }`；错误隔离（catch → AppError 上报） | ✅ 单元测试覆盖：未配置 / 配置成功 / 配置失败 / 连接超时 4 路径 |
| **T912-2 三回调接线** | P2 | `server/utils/auth.ts` 三处 `sendVerificationEmail` / `sendResetPassword` / `sendChangeEmailConfirmation` 从空 console.warn 改为 `mailer.sendMail(...)`；模板走 i18n（zh-CN / en-US），支持最小渲染（链接 + 用户邮箱 + 过期提示）；保留 console.warn 降级但增加实测日志区分（`[mailer:noop]` / `[mailer:delivered]`） | ✅ 三回调集成测试覆盖；i18n locale 模板抽取；与现有 SMTP 配置开关兼容 |
| **T912-3 安全与文档** | P3 | 防滥用：SMTP 凭据（`SMTP_USER` / `SMTP_PASS`）仅从 `runtimeConfig` 读取不进前端 bundle；速率限制提示（注册验证邮件防刷，留钩子待 T913）；`docs/standards/security.md` §X.3 补「邮件发送安全」（最小暴露 + 失败 fail-closed）；`docs/standards/security.md` §凭据加密存储 章节合并入 C28 修复 | ✅ security.md 双章节补齐；C28 修复同步 |

- 完成定义：T912-1 ~ T912-3 全部交付，每项独立 Review Gate Pass + 分批提交；`pnpm lint` / `typecheck` / platform 单测（≥ 80% 覆盖率不破坏）/ 集成测试通过；SMTP 配置下可真实发送（开发用 MailHog / Mailtrap 实证）；SMTP 未配置降级路径不破坏既有流程。
- 非目标（移交 backlog）：模板引擎（直接 string template 而非 MJML/Handlebars）；批量发送（newsletter 类场景）；DKIM / SPF 自动配置；队列化邮件发送（M7.2 BullMQ 集成留给真实流量需求触发）。

---

## 待评估候选（2026-08-18 整理，按优先级）

> 上下文：T912 SMTP 邮件发送器为当前活跃任务；以下候选暂不实施，待 SMTP 完成 / 用户明确排期后再启动。所有项已在 [backlog.md](backlog.md) 独立登记，本表为执行排序 + 关联追踪视图。

| 优先级 | backlog 编号 | 任务 / 内容摘要 | 依赖 | 触发条件 |
|:--|:--|:--|:--|:--|
| **🔴 P1** | **C30** | Publish Docker 双平台构建 CI 链路裁决（拆分平台 / 优先 amd64 / 验证 gha cache） | 无 | 阻塞"镜像构建 CI 端到端裁决"结论 |
| **🟡 P1** | **C26** | 独立沙箱容器（每任务/每仓库容器 + 网络出站白名单 + cgroup） | T702（BullMQ worker） | M9 候选；多租户并发场景触发 |
| **🟢 P2** | **C28** | security.md §凭据加密存储 章节补齐（T602 AES-256-GCM 文档化） | T912-3 联动 | T912 邮件发送安全章节同步补齐 |
| **🟢 P2** | **C29** | 平台 UI 暗色模式修复（PrimeVue 组件样式异常） | 无 | 暂缓；需 UI Validator 视觉验证 |
| **🟢 P2** | **M9 后续** | i18n 内容扩展（README.en-US / docs/i18n/en-US / platform 多语言） | M9 基建 | 翻译内容与多语言扩展 |
| **⚪ P3** | **C36** | 服务端 API 错误消息 i18n（55 处 `createError` 中文化解） | 无 | 英文用户实际使用反馈时 |
| **⚪ P3** | **C37** | 语言偏好多设备同步（Cookie → 服务端 user 字段） | 无 | 多设备使用成为常态 |
| **⚪ P3** | **D1-repo_admin** | 仓库级管理角色 + RepositoryAccess 关联表 | 无 | 多租户/多组织需求出现 |
| **⚪ P3** | **D2-username** | better-auth username 插件 | 无 | 用户明确需要用户名体系 |
| **⚪ P3** | **D3-多租户** | better-auth organization 插件（替代单组织模型） | 无 | 多组织/多租户部署成为真实需求 |
| **⚪ P3** | **D8** | remove-user 关联资源检查（引入 user→resource 关联时） | 无 | 引入 created_by / RepositoryAccess 触发 |
| **⚪ P3** | **T701-e2e** | 管理端点集成测试补强（list-users 分页 / set-role 403 / ban/unban 会话失效 / remove-user 级联 / 个人界面 changePassword/changeEmail 闭环） | 无 | 引入 @nuxt/test-utils 或 e2e 基建 |
| **⚪ P3** | **C33** | MCP P3 能力补充（pnpm-audit 本地 tool / 错误包装 helper / 完整 RunResult） | 无 | 远期登记 |
| **⚪ P3** | **SAML 2.0** | 企业 SSO SAML 支持（better-auth 无原生支持） | 无 | 企业 IdP 仅 SAML 时 |
| **⚪ P3** | **B1 / B2** | PR label `dependfix` + 关闭评论 / 固定分支单线 | 无 | PR 数量影响查询性能时 |
| **⚪ P3** | **T905** | git worktree 并行开发预案 | T505（已交付） | 多 agent 并行成为常态 |
| **⚪ P3** | **C21** | GitHub Code Quality Standard findings 接入 | 无 | 最小报告接入评估 |
| **⚪ P3** | **C22** | GitHub App / installation token 认证（CLI 侧） | 无 | org 场景 PAT 痛点 |
| **⚪ P3** | **C23** | 发现规模上限 `max-repos` | 无 | 大 org 全量发现场景 |
| **⚪ P3** | **C24** | org 级 alerts API 批量拉取 | 无 | 大 org 用户痛点 |
| **⚪ P3** | **C34** | 存量规范严格约束挂接盘点（review 检查点补齐） | 无 | 用户排期（不急） |
| **⚪ P3** | **T705 / T703** | 生产级部署 / 跨平台 Git（已延期 2026-08-12） | T702 / M6 | 用户指示恢复 |

- 完成定义：暂不实施——本表为 backlog 排序追踪视图，用户排期任一项时移入正式任务区块（参考 M8/M9 格式）。
- 关联：
  - **C26 + C30 + C28**：用户在 2026-08-18 明确指示「考虑解决」（C26 独立沙箱 / C30 Publish Docker CI / C28 security.md 章节补齐），排入 P1 / P2 待评估；
  - **C29 + M9 后续**：平台能力深化，依赖用户产品方向决策；
  - **D1-D8 + T701-e2e**：M7.1 设计决策点候选项，触发条件未达不实施；
  - **P3 项**：远期登记，随真实需求触发。

---

## 待人工验收（真实环境，随可用性推进）

- **T701 真实凭据 3 项**：真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）、真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）、构建期配置凭据后按钮显示路径实测——[todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)
- **T702 HTTP 层状态流转**：pending→running→completed + 前端轮询体验（需后台服务/staging 或 CI redis service）
- **T704 async 定时触发**：BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）；Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）
- **发布管线收尾（P3）**：release:auto-version 完整流程待 schedule 启用后首个 cron 裁决；main 副作用路径测试观察项

## 当前状态

- **M9 i18n 基建同步已归档（2026-08-18）**：T901-T906 全部交付，详见 [todo-archive.md §M9](todo-archive.md#m9-i18n-基建同步已归档)；代码与脚本工作 2026-08-15 完成（含 todo/roadmap 排期登记），文档侧 M9 归档块直至 2026-08-18 才补齐——本次补齐视为 M9 收口闭环。
- **M8 安全加固与容器执行完备已交付（2026-08-14）**：T801-T806 全部完成，每项独立 Review Gate Pass + 分批提交。
- **T711 已归档（2026-08-14）**：覆盖率冲刺完成（四维 ≥ 80%），记录见 [todo-archive.md §T711](todo-archive.md#t711-覆盖率口径修正--冲刺至-80已归档)。
- **M7 已归档（2026-08-12）**：M7.1/M7.2 归档（T702/T704/T708/T709/T710/T706 完成），详见 [todo-archive.md](todo-archive.md)。
- **T705 / T703 已延期（2026-08-12 用户指示）**：移至 [backlog.md §M7.2](backlog.md#m72-平台能力深化) 待评估。

## 已知边界

- M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
- Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
- security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。
- 平台 UI 暗色模式不可用（暂缓，后续优化，[backlog.md §M6](backlog.md) C29）。
- 容器内 git/pnpm 工具链缺失（M6 遗留）——**已修复（T801，2026-08-14）**，见 [backlog.md](backlog.md) C45。

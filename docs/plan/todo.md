# 当前阶段任务

> **M9 i18n 基建同步（2026-08-15 启动）**：从 momei 同步 i18n 治理规范与审计脚本（缺失 key / 动态 key / 重复文案校验 + `@intlify/eslint-plugin-vue-i18n` 独立 lint），为下一阶段 i18n 优化（README 中英双版本 → docs 翻译 → platform 多语言扩展）做准备。任务拆解见下方 M9 区块。
> **M8 安全加固与容器执行完备已归档（2026-08-14）**：T801-T806 全部交付（20 个提交，本地待推送）。依据 [沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md) §5 治理决议（G2-G7）与 [backlog.md §沙箱与恶意依赖防护治理登记](backlog.md)（C39-C45）排期，封堵 dependfix 成为恶意依赖扩散工具的残余路径。任务拆解见下方 M8 区块。
> **T711 覆盖率冲刺已归档（2026-08-14）**：四维 ≥ 80% 达成（Stmts 85.89% / Branch 80.6% / Funcs 85.51% / Lines 85.96%，1494 tests），记录见 [todo-archive.md §T711](todo-archive.md#t711-覆盖率口径修正--冲刺至-80已归档)。
> **T705 / T703 已延期（2026-08-12 用户指示）**：生产级部署（PostgreSQL/Helm/Sentry）与跨平台 Git（GitLab/Bitbucket）暂缓排期，见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)。
> **T706 已完成（2026-08-12）**：`@dependfix/mcp@0.1.2` 已发布 npm；skill 双后端验证与 MCP 接入文档为轻量收尾（随文档同步跟进）。

---

## M9: i18n 基建同步（2026-08-15 启动）

- 优先级：`P2`（为后续 i18n 优化铺路，不阻塞安全与功能主线）
- 背景：momei 已沉淀成熟的 i18n 治理体系（语言分级 / freshness 分层 / 缺词 blocker / 动态 key 白名单 / 重复文案审计 / vue-i18n 专项 lint）。dependfix 平台已有基础 i18n（zh-CN + en-US 双语），但缺审计门禁与治理规范。本轮同步基建（规范 + 脚本 + 门禁），翻译内容（README.en-US.md / docs 翻译 / 多语言扩展）留后续阶段。
- 决策（2026-08-15 用户确认）：① 只同步基建，脚本适当优化不全量同步（缺失 key / 动态 key / 重复文案为核心）；② docs 翻译沿用 `docs/i18n/<locale>/` 镜像结构；③ 模块化拆分延后（脚本已兼容双形态）；④ `@intlify/eslint-plugin-vue-i18n` 引入但独立命令（执行慢）+ CI 校验。
- 任务拆解（按依赖与优先级）：

| 任务 | 内容 | 验收要点 |
|:--|:--|:--|
| **T901 规范同步** | momei translation-governance 适配为 `docs/standards/i18n.md`（语言分级 / freshness 分层 / 回退链 / 术语约束 / blocker 矩阵）+ standards/index.md 登记 | ✅ **已完成（2026-08-15）** |
| **T902 脚本同步** | `scripts/shared/cli.mjs` + `scripts/i18n/{audit-locale-keys,audit-duplicate-messages,dynamic-key-allowlist}.mjs` + `scripts/docs/check-i18n-duplicates.mjs`，路径参数化（`--locale-root` / `--scan-root`）、单文件/模块化双形态兼容 | ✅ **已完成（2026-08-15）**：missing parity 0（两 locale key 一致）、unused 54 候选（warning）、duplicates 53 组候选、docs 检查通过 |
| **T903 脚本测试** | 三个同步脚本补 vitest 单测（临时目录 fixture，覆盖双形态与边界） | ✅ **已完成（2026-08-15）**：42 测试全绿 |
| **T904 npm scripts + eslint 接入** | 根 package.json 接线 `i18n:audit*` / `docs:check:i18n` / `lint:i18n`；安装 `@intlify/eslint-plugin-vue-i18n`；eslint.config.js 加 `ESLINT_I18N` 开关块（限 apps/platform，recommended 规则提升 error） | ✅ **已完成（2026-08-15）**：lint:i18n 零 error；常规 lint 不受影响 |
| **T905 CI 接入** | test.yml 增加 `lint:i18n` + `i18n:audit:missing` + `docs:check:i18n` 步骤 | ✅ **已完成（2026-08-15）** |
| **T906 文档收口** | scripts/README.md 登记新命令；todo/roadmap 排期 | ✅ **已完成（2026-08-15）** |

- 完成定义：T901-T906 全部交付，每项独立 Review Gate Pass + 分批提交；`pnpm lint` / `typecheck` / 定向测试 / `lint:i18n` / `i18n:audit:missing` 通过。
- 非目标（后续阶段）：README.en-US.md 翻译、docs/i18n/en-US 翻译、platform 多语言扩展（zh-TW/ko-KR/ja-JP）、locale 模块化拆分（split-locale-files + Locale Registry）。

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
- 非目标（M9 backlog）：C26 独立沙箱容器（网络出站白名单 + cgroup + 每任务容器，BullMQ worker 结合）、C30 镜像构建 CI 链路裁决、C28 凭据加密存储文档章节、C29 平台 UI 暗色模式。

---

## 待人工验收（真实环境，随可用性推进）

- **T701 真实凭据 3 项**：真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）、真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）、构建期配置凭据后按钮显示路径实测——[todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)
- **T702 HTTP 层状态流转**：pending→running→completed + 前端轮询体验（需后台服务/staging 或 CI redis service）
- **T704 async 定时触发**：BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）；Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）
- **发布管线收尾（P3）**：release:auto-version 完整流程待 schedule 启用后首个 cron 裁决；main 副作用路径测试观察项

## 当前状态

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

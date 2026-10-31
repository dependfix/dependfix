# 安全开发规范 (Security Development Standards)

## 0. 事实源与边界 (Source & Scope)

本文档定义具体的开发安全控制措施和技术要求，与 [AGENTS.md](../../AGENTS.md) 的安全规范为引用关系。

## 1. 身份验证与授权 (Authentication & Authorization)

- **严格鉴权**：所有涉及用户数据的 API 必须校验会话。
- **权限最小化**：严格区分角色权限，使用包含性校验而非判等逻辑。
- **密码安全**：严禁明文存储密码，使用 better-auth 默认安全哈希机制。

## 2. 数据安全 (Data Security)

- **输入校验**：所有 API 输入使用 `zod` 校验，严禁直接信任原始输入。
- **防止注入**：使用 TypeORM 参数化查询，严禁拼接 SQL 字符串。
- **敏感信息屏蔽**：API 返回前必须脱敏（隐藏密码、Token 等字段）。
- **Secrets 管理**：严禁将密钥、Token 提交至 Git，必须使用 `.env`。
- **不可信路径组件白名单校验**：`runId` 等不可信路径组件（来自 URL / 请求体 / 外部输入）必须**双重**校验——白名单正则（如 `RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/`）+ 相对路径校验（`relative(workRoot, workDir).startsWith('..')`）；不合法时 **early return 在 try 外**，跳过 mkdir / adapter.run / finally rm（清理逻辑在路径不可信时同样危险）。
- **读取外部可控配置文件（如目标仓库 `.github/*.yml`）的安全增量**：内容由外部仓库完全控制，「非法 / 超限 / 缺失一律降级回退、不中断主流程」之外还必须做到——① **日志中的错误摘要截断**（YAML 解析错误会携带文件片段）；② **原型链风险键过滤须在 schema 解析之前**（`__proto__` / `constructor` / `prototype`，与 env / CLI 入口共用同一谓词——zod 的 record 会**静默丢弃** own `__proto__` 键，过滤放后面就只剩静默丢弃、没有告警）；③ **未知键检测用 `Object.hasOwn`**（`in` 会命中原型链导致漏报）；④ **必须 `lstat` 拒绝软链 / 非普通文件**（软链指向 `/dev/zero` 时 `size` 为 0，字节上限形同虚设；同步 `readFileSync` 还会阻塞事件循环，连超时 / 取消定时器都无法触发）。完整读取 / 合并 / 降级矩阵以 [dependency-fixer.md §12.7](../design/modules/dependency-fixer-records.md) 为唯一权威。

### 2.1 SQLite 数据库防护（不可恢复数据事故防线）

依赖 better-sqlite3 单文件 SQLite 的应用（`apps/platform`）必须实施以下防护，避免任何形式的清空 / 误删 / schema 重建导致业务数据永久丢失。

- **2.1.1 启动期自动备份（hard requirement）**：`server/database/backup.ts` 存在并在 `ensureDatabaseInitialized()` 之前**同步**调用；备份路径 `data/backups/${basename}.${YYYY-MM-DDTHH-mm-ss}.bak`；触发条件为源文件存在 + size > 0 + 后缀非 `.bak`；写入必须 `fsync` + `rename`（确保断电不留半成品）；保留最近 N 份（默认 10，`BACKUP_RETENTION_COUNT` 可覆盖，按 mtime 升序清理）；失败时 catch + 日志，**不阻塞启动**（fail-open）。
- **2.1.2 命令式恢复**：`server/database/scripts/db-restore.ts` 存在且含 CLI 入口守卫；用法 `pnpm db:restore --from=<backup-file>`；必须 `--yes` 二次确认；恢复前自动备份当前库（`data/backups/auto.${timestamp}-${ms}.bak`，纳入保留策略）；恢复后删除属于旧库的 `-wal` / `-shm` / `-journal` 旁文件。
- **2.1.3 数据库自检工具**：`server/database/scripts/db-doctor.ts` 存在且含入口守卫（`pnpm db:doctor`）；输出各表行数 + `freelist_count` + `page_count` + `schema_version` + `journal_mode` + `integrity_check` + `sqlite_sequence` + 文件大小与时间戳；**判定逻辑**——`schema_version = 0` + 各表空 → 全新库；`schema_version > 0` + 各表空 → 数据被清空或从未注入；`freelist_count > 0` → 有数据被删未 VACUUM；`integrity_check != 'ok'` → 数据库损坏。
- **2.1.4 与 e2e / fixtures 端点的关系**：`server/api/e2e/*` 端点双门控（`E2E_TEST` + `runtimeConfig.e2eFixturesAllowed` 兜底）也是数据保护的一环；**不能**用 `process.env.NODE_ENV === 'production'` 作第二门控（构建期静态替换致表达式折叠，prod build 恒 404，详见 [platform.md §3.6](./platform.md)）。
- **2.1.5 防御措施挂接**：本节防御加固由 2026-09-01 `dependfix.sqlite` 数据清空事故触发（事故根因与应急响应见 [归档 §五十](../design/governance/experience-archive-§49-§69-recent-investigation.md#五十、sqlite-数据库业务数据被清空-开发环境不可恢复事故-2026-09-01) + [工程实践判例 EP-16](../design/governance/engineering-practice-notes.md) + [platform.md §3.7](./platform.md)）。

## 3. Web 安全防护 (Web Protection)

- **XSS 防护**：默认使用 Vue 模板转义，`v-html` 使用须严格审计。
- **CSRF 防护**：API 必须使用 SameSite Cookie 策略或 CSRF Token。
- **CORS 策略**：生产环境严禁 `Access-Control-Allow-Origin: *`。
- **防御纵深对称性**：同一资源的多处 API 入口必须保持校验一致——引入「资源 × 资源」校验的 PR，D 阶段先 grep 同资源其他入口并主动补齐（如 `batch.post.ts` 加「凭据 × 组织」校验后，`importable.get.ts` 用同一 `credentialId` 的入口必须同步加 `requireOrgResource`），否则对称缺失会被 audit 第 1 轮拒绝。
- **前端拦截 ≠ 服务端安全**：前端 UI 拦截（`isSelfTarget` + `<Select disabled>` + `confirm`）只是 UX 层，devtools / 恶意客户端可绕过；任何「防自修改 / 防越权 / 防 XSS / 防 CSRF」逻辑必须服务端兜底（better-auth adminMiddleware 仅校验权限不校验 self-target，是已知 gap）——纵深防御 = 前端拦截 + 服务端强制（见 `apps/platform/server/middleware/auth-self-guard.ts`）。
- **better-auth admin 端点 body shape 多样**：better-auth admin 插件各端点 body shape 不一致——`set-role` / `ban-user` / `remove-user` / `impersonate-user` 字段平铺，但 `update-user` 字段嵌套在 `body.data` 下；Nuxt server middleware 拦截逻辑必须按 endpoint 路径分发到不同 parser，否则 `update-user` 路径完全绕过（已验证的绕过漏洞，见 `node_modules/better-auth/dist/plugins/admin/routes.mjs`）。
- **Nuxt server middleware 路径过滤快速退出**：`server/middleware/` 目录自动加载、对每个请求都执行；白名单过滤必须**前置**（path / method 检查 → return 早退），否则 admin / users / repos 等路由都跑一遍 `getSession` + 数据库查询（性能浪费且增大 attack surface）。三层快速过滤模板：`path.startsWith` → `method === POST` → 端点 Set 判定。
- **Nuxt server middleware vs plugin hook 选型**：拦截 better-auth admin 端点的 4 候选——`databaseHooks.user.update.before`（无 target userId 与 body 上下文）／plugin hook（admin 插件仅暴露 `after`）／**Nuxt server middleware（采用）**（路径拦截 + cookie 转发 `getSession` + `readBody` 拿 target，跨端点通用）／Nitro plugin（层级更低但路径过滤重复）。代价是每个 admin 操作多一次 `getSession`（非热路径，可接受）。

## 4. 日志与监控 (Logging & Monitoring)

- **日志审计**：重要操作（登录、删除、权限变更）必须记录审计日志。
- **无敏感信息日志**：日志中严禁包含密码、Token 等信息。

## 5. 依赖与供应链安全 (Dependency & Supply Chain Security)

- **5.1 依赖管理**：定期关注依赖漏洞公告；引入新包须经必要性评估；升级时检查版本发布时间与 diff 并在沙箱中验证；出现「依赖升级了但漏洞还在」时先排查 `pnpm-workspace.yaml` 中同包是否同时存在通用 / 版本化两条覆盖（通用钉定会胜出）——机制与清理以 [development.md §5.1.32](./development.md#_5-1-工程实践规则) 为**唯一权威**。
- **5.2 供应链信任边界（AI 推荐包与外部工具引入必查）**：**AI 推荐包来源验证**（AI 推荐的依赖包约 20% 在官方 registry 中不存在——安装前必须查官方 registry 页面，警惕 typosquatting 拼写相近包）；**钉版本 + 锁文件**（新增依赖锁定精确版本并提交锁文件；CI 中 GitHub Actions 必须钉不可变版本）；**外部工具 / 技能来源可信**（引入 MCP server / agent / skill / `git+https` 依赖前核对来源仓库 URL 与维护组织，只装官方组织或自有仓库，警惕「伪装成有用文档 / 技能」的诱导信任）；**最小权限**（MCP server 与自动化 agent 不运行于 root、不挂载全盘、数据库端口不暴露公网）；**依赖审计进 CI**（本地抽查不能代替；当前为阻断级（2026-10-27 转正，见 [§5.6](#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c)），无可用修复版本的豁免见 [§5.7](#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05)）；**成熟窗口口径**：`minimumReleaseAge` 以分钟计（默认 1440 = 1 天），补丁被窗口挡住时的对照实验步骤与 `overrides` / 排除条目的钉定边界见 [development.md §5.1.57](./development.md)。
- **5.3 修复执行安全（dependfix 自身不得成为漏洞扩散工具）**：dependfix 的核心动作是升级第三方依赖（拉取并执行不可信代码），所有执行路径（本地 CLI / GitHub Action / 平台容器 / 沙箱容器）必须满足以下基线，完整工程化解读见 [沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md)。
  - **执行环境基线（必须）**：**非 root 执行**（镜像 `USER` 降权，不挂载 `docker.sock`、不授予额外特权）；**工作目录隔离**（独立临时目录如 `runs/{runId}/`，执行后清理）；**超时兜底**（每次执行须有总超时，新增命令 / 子进程须自带单命令超时）；**保持 pnpm 默认脚本防护**（不得扩大 lifecycle scripts 执行面，不代目标仓库追加 `allowBuilds` 批准）；**资源与网络**（资源上限 + 执行期网络受限，保留外联日志）。
  - **凭据基线（必须）**：**平台密钥隔离**（`NUXT_ENCRYPTION_KEY` / `AUTH_SECRET` 等永不传入执行进程环境）；**按仓库最小注入**（仅注入本次执行所需最小集合，解密仅执行时内存、用后即弃）；**防泄露通道**（凭据不得进 argv / URL，走 `http.extraheader` 等带外通道；错误消息 / 命令输出 / 报告日志必须脱敏）；**权限面收敛**（扫描不可信仓库必须使用专用低权限 token，不得用全量 scope 的 PAT）。
  - **供应链基线（必须）**：**升级前研判**（自动升级前必须完成 changelog / diff 研判，不可省略）；**供应链信号披露**（报告 / PR 必须披露「本次新增 / 升级的包是否带 lifecycle scripts 且已被目标仓库批准」）；**结果白名单回传**（执行进程仅回传结构化结果，不赋予自由输出执行能力）。
  - **准入流程（必须）**：新增执行后端（ExecutorKind）或改变执行边界（网络 / 文件系统 / 权限 / 并发形态）时，必须对照 [executor-sandbox.md 风险表](../design/governance/executor-sandbox.md) 逐项评估并记录缓解措施，评审通过方可实现。
  - **5.3.1 网络外联审计（执行期网络行为可观测）**：**真实外联 = deny-by-default 阻断**（本地拦截代理对非白名单域名返回 502 不建上游连接，命中记 `network_violations`；白名单默认含 `*.npmjs.org` / 常见镜像站（`*.npmmirror.com` / `registry.yarnpkg.com` / `npm.jsr.io` / `mirrors.cloud.tencent.com` / `repo.huaweicloud.com` / `npm.pkg.github.com`——镜像站 registry 与其 tarball CDN 域**成对登记**，只放 registry 域会让 tarball 仍被拦）/ GitHub API 域 / `rolldown.rs`；另从 `workDir` 配置面**动态发现生效 registry**（`pnpm config list --json` 抽取 `registry` 与 `@scope:registry` 键的 host，仅读本地不联网，host 粒度严格校验，异常时 fail-open 依次回退 `npm_config_registry` 环境变量与预置清单——企业私服自带的独立 CDN 域仍需显式配置），可经 `DEPENDFIX_ALLOWED_DOMAINS` 扩展；**白名单不因「命令输出里出现的 URL」扩展**（防绕过配置面扩白名单））；**命令输出 URL = 仅 audit 记录、不阻断**（stdout / stderr 中出现的 URL 是文本而非真实连接，旧逻辑误判合法链接为违规并触发 verification fail——新逻辑统一入 entries 备查，实测 pnpm / Nuxt CLI 的 telemetry 链接不再阻断）；**工具链 telemetry 默认禁用**（verification 子进程默认注入 `NUXT_TELEMETRY_DISABLED=1` / `NEXT_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`，父进程已设置时不覆盖）。捕获面见 `packages/engine/src/runners/network-audit.ts`（registry 发现见 `packages/engine/src/runners/registry-discovery.ts`）。
- **5.4 凭据权限阶（C53 落地）**：执行模式与所需权限——`report-only` 需 `security-events: read`；A 模式 fix（仅 commit）需 `contents: write`；A 模式 fix-and-pr 需 `contents: write` + `pull-requests: write`（启用重复 PR 评论 / label / 基线红 issue 载体时加 `issues: write`，见 [pr-delivery-closure.md §16.3](../design/governance/pr-delivery-closure.md#_16-3-issue-载体)）；B 模式（GitHub Action）需 `actions: read + write`——**默认推荐**（目标仓库已配 action 时权限面最窄，PR 创建用 runner 内置 `GITHUB_TOKEN`，平台 token 不需 `contents` / `pull-requests` 写权限，这是 B 模式核心安全价值）。**A 模式 fix-and-pr 必须 wide-scope**（平台 token 直接调 API 需 classic PAT 勾选 `repo` 或 fine-grained PAT 授权 `Contents: write` + `Pull requests: write`；不推荐多租户 SaaS 场景）。**凭据权限最小化**（扫描不可信仓库必须用专用低权限 token）。**UI 显式提示**（执行触发时应显示当前所选凭据的权限范围）。详见 [executor-sandbox.md §8.4](../design/governance/executor-sandbox-implementation.md#_8-4-凭据权限阶-重要安全考量)。

### 5.5 凭据加密存储（C28 已闭环，2026-08-20）

平台 Credential 实体采用 **AES-256-GCM 对称加密**，实现见 `apps/platform/server/services/credential.service.ts`。

- **算法契约（与实现逐项对齐）**：**算法** AES-256-GCM（GCM 自带完整性校验，篡改会抛错、不返回错误明文）；**密钥** `NUXT_ENCRYPTION_KEY`（任意长度输入 → `sha256` 派生 32 字节，`deriveKey`；未配置时**抛错禁用凭据功能**，fail-closed，与 [platform.md §5](./platform.md) 一致）；**IV** 12 字节随机（NIST SP 800-38D 推荐，每次加密重新生成）；**authTag** 16 字节；**密文格式** `{iv}.{authTag}.{ciphertext}`（三段 base64 以**点号**拼接）；**格式校验** `decryptToken` 先 `split('.')` 校验恰好 3 段，非法格式抛错（防 fail-open）。
- **凭据生命周期**：**创建**（`encryptToken` → 存 `Credential.encryptedToken`，`hasToken` 布尔标记，API 永不返回明文）；**读取**（`decryptToken` → 内存 token → 注入执行上下文，用后即弃）；**更新**（重新 encrypt 覆盖，非 token 字段直写）；**删除**（直接删行，关联 `credentialId` 置空）。
- **设计要点**：**密钥隔离**（平台运维配置，**永不**进入执行进程环境）；**解密仅执行时内存**（用后即弃，随闭包释放）；**来源单一**（`Repository.credentialId` → `Credential.encryptedToken` → 解密 → 运行时配置，禁止二次读取）；**凭据邮件安全**（SMTP 凭据仅从 `runtimeConfig` 读取，**不进入前端 bundle**；速率限制防刷；失败 fail-closed）。
- **密钥轮换（边界说明）**：当前无 key version——`NUXT_ENCRYPTION_KEY` 变更会使存量密文不可解密；轮换需先批量解密 → 新密钥重加密 → 更新全部 Credential 行。**不在本规范强制范围内**（单机自托管密钥变更频率极低），登记为未来增强项。
- **审计必查项（Code Auditor 必查）**：新增 Credential 字段必须走加密存储（禁止明文 token 类字段）；任意外部 HTTP 客户端必须确认 baseUrl 是 GitHub 官方 API（防 typo squatting / SSRF）；错误消息 / 日志 / 报告禁止打印明文 token（`sanitizeErrorMessage` 覆盖 URL 内嵌 + Authorization 三 scheme）；`decryptToken` 解密失败必须抛错（防 fail-open）；密文格式校验（split 3 段）不可删除。

### 5.6 依赖审计阻断语义（信号级 → 阻断的转正条件，2026-09-30 用户决策方案 C）

`test.yml` 的依赖审计自 **2026-10-27** 起分为**阻断面**与**信号面**：prod 审计阻断 Test job；全量审计保留为信号。此前 2026-09-30 方案 C（观察期）以 `|| true` 运行；因 `audit.ignore` 使 clean 字面串不可达，原观察期计数未达成（挂起），2026-10-27 按 §5.7 末句「修订 clean 判据」通道转正，证据后置（翻转后连续 3 次 push run id）。

- **阻断面（2026-10-27 起）**：`pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org`，**无 `|| true`**。
  - 显式 `--registry` 固定公共 audit endpoint：本地或 runner 默认 registry 可能是 npmmirror 等无 audit endpoint 的镜像；缺少该参数时 `--ignore-registry-errors` 会把「endpoint 不存在」当作 registry 故障并 exit 0，使门禁静默失效。
  - `--ignore-registry-errors` 只把 registry 故障降为 exit 0，不放宽漏洞判定（pnpm 11.17.0 实测：registry 不可达 + flag → exit 0；无 flag → exit 1；真实漏洞 + flag → exit 1）。
  - `pnpm-workspace.yaml` 的 `audit.ignore`（当前仅 minimatch，无兼容修复版本，见 [§5.7](#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05)）仍生效；ignored 条目不参与阻断。
- **信号面（保留）**：`pnpm audit --audit-level=moderate --registry=https://registry.npmjs.org || true` 覆盖 prod + devDeps；失败仅作信号，不阻断 Test job。
- **判据（2026-10-27 修订，替代字面串）**：阻断步骤结论为 `success`（命令 exit 0）**且日志含审计结果行**（`No known vulnerabilities found`；或 `N vulnerabilities found` 与 `Severity: ... (N ignored)` 两行同时出现）才计为 clean；仅 `fetch failed` + success 是 registry 故障放行，不计为证据（用于 3 次 push / 周回归 / G1 ④）。`audit.ignore` 命中的条目允许存在；不再要求 `No known vulnerabilities found` 字面串——`audit.ignore` 在册时该字面串不可达。出现未豁免的 moderate+ 漏洞时命令 exit 1。
- **统计命令（第三方可复现，需 `gh` 已认证）**：仅统计翻转后的 run（前置 run 无该步骤，jq 空输出不可作证据）。`gh run list --workflow test.yml --branch master --event push --limit 3 --json databaseId` 取 3 个 run id；对每个 id 执行 `gh run view <id> --json jobs --jq '.jobs[] | select(.name=="Test") | .steps[] | select(.name=="pnpm audit (prod, moderate+, blocking)") | .conclusion'` 期望 `success`，并检查步骤日志含审计结果行（`No known vulnerabilities found`；或 `N vulnerabilities found` + `Severity: ... (N ignored)` 两行；仅 `fetch failed` + success 不计）。
- **转正记录（2026-10-27，证据 2026-10-28 回填）**：转正日期 2026-10-27；原「翻转前连续 3 次 clean」未达成（计数挂起），按 §5.7 修订通道转正。**证据**：翻转后 3 次 `master` push 的 prod 阻断步骤均 `success` 且日志含审计结果行——`40372808067`（`84615ce2`，1 high ignored）、`40466448172`（`ea07afa9`，1 high ignored）、`40690157020`（`16a19b6c`，1 low + 1 high ignored）；其中 `40690157020` 的 Test job 整体因 `check:doc-governance`（文档字符预算）失败，与审计步骤无关，已由 `ea89e7ec` 修复。Weekly Regression `40693124400`（`16a19b6c`，2026-10-28）`success`，gate 日志含审计结果行（2 found / 1 low + 1 high ignored）。
- **本地复现**：`pnpm audit --prod --audit-level=moderate --registry=https://registry.npmjs.org`；仓库脚本 `security:audit-deps` 已内置 `--ignore-registry-errors --registry=https://registry.npmjs.org`。
- **审计必查项**：阻断步骤必须无 `|| true`、必须含 `--registry=https://registry.npmjs.org` + `--ignore-registry-errors`；全量信号步骤必须保留；§5.6 / §5.8 与检查点矩阵必须同批更新；转正记录必须有**翻转后**连续 3 个 `master` push run id 且日志含审计结果行，不得只写「按记录」或以 `fetch failed` + success 充数。

### 5.7 无可用修复版本漏洞的审计豁免（audit.ignore，2026-10-05）

当 advisory 声明了 patched 版本但**无法以兼容方式落地**时，overrides / `pnpm update` / `pnpm audit --fix` 均无法修复，`pnpm audit` 会持续失败并阻断周期性回归。满足以下任一情形即可按本节**显式豁免**，而非放宽或关闭门禁：

1. patched 版本**尚未发布**（registry 上不存在可安装版本）；
2. patched 版本已发布，但**只有跨大版本修复**且消费者上游仍依赖旧 API（升级会破坏运行 / 构建）——此时「复核条件」必须写明消费者就绪判据（如「eslint 链改用 minimatch ≥11 后移除」）。

> 两类豁免均只适用于 **moderate / low**。**high 不得**据此豁免：high 必须先尝试修复，确无可用修复版本时按 §5.9 台账以 `no-fix` / `hard-fix` 登记。

- **配置位置**：`pnpm-workspace.yaml` 顶层 `audit.ignore`（GHSA 列表）；脚本命令见 [§5.6](#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c)（2026-10-27 起随 prod 阻断转正）。
- **禁止用 `--ignore` / `--ignore-unfixable` 进脚本**：pnpm 的 `--ignore` 是「一次性配置写入器」——只把编号写回配置并直接 exit 0（不执行审计），写进 CI 或 npm script 会使审计步骤恒为 exit 0、门禁彻底失效；`--ignore-unfixable` 还依赖 advisory 的 patched 元数据，对「声明了 patched 版本但未发布」的条目判为可修复、实际不写入任何编号。
- **保留阻断强度**：`audit.ignore` 仅过滤列表内编号，未列入的新漏洞仍使 `pnpm audit` exit 1。
- **对 §5.6 阻断判据的影响（2026-10-27 起）**：`audit.ignore` 在册时日志通常为两行（`N vulnerabilities found` + `Severity: ... (N ignored)`），不再依赖 `No known vulnerabilities found` 字面串；§5.6 判据已修订为「阻断步骤 exit 0 **且日志含审计结果行**（ignored 不参与阻断）」。node-forge 已于 1.4.2 修复并移除豁免、glob 已通过 override 升到 14.0.3 修复（2026-10-31）；当前在册仅 minimatch，上游发布兼容修复版本后按上表移除并复跑。
- **当前豁免清单与依据**（每条必须登记 GHSA + 依赖路径 + 复核条件，禁止只写编号）：

| GHSA | 包 / 受影响范围 | 依赖路径 | 复核条件（满足即移除） |
|:--|:--|:--|:--|
| GHSA-g3hv-75wg-m249 | minimatch < 11.0.1 | `@nuxtjs/i18n > @intlify/unplugin-vue-i18n > eslint`（3.1.5）；`nuxt > nitropack > archiver > readdir-glob`（5.1.9）；`@typescript-eslint/typescript-estree`（10.2.4） | 消费者上游改用 minimatch ≥ 11.0.1（eslint / readdir-glob / typescript-estree 放弃 v3/v5/v10 API）；当前仅构建期工具链路径 |

> 原 `GHSA-vfj7-8cjw-p6xm`（braces ≤ 3.0.3）因 advisory 于 2026-10-23 撤回而移除；原 `GHSA-86w9-cpqp-85rv`（node-forge ≤ 1.4.0）因上游 1.4.2 发布、原 `GHSA-3g3m-2fjr-6pw4`（glob ≥ 9.0.0、≤ 14.0.1）因 `overrides.glob` 升到 `^14.0.3` 验证通过，均于 2026-10-31 移除（复核记录见 [backlog.md](../plan/backlog.md)）。本表当前条目为 **moderate**，按 §5.9 不入发布豁免台账；若升级为 high 须按 `hard-fix` 登记。

- **复核节奏**：条目同步登记于 [backlog.md 已知边界](../plan/backlog.md)（持续观察）；每周回归或依赖升级时复查上游是否已发布修复版本，发布后立即移除豁免并复跑 `pnpm audit`。advisory 被**撤回**或受影响范围不再匹配（`withdrawn_at` / range 变更）时，同样移除对应条目并记录依据——撤回表示该漏洞不再有效，不能以「无修复版本」为由继续挂账。
- **审计必查项**：新增 `audit.ignore` 条目必须同时给出 GHSA + 依赖路径 + 复核条件；禁止把 `--ignore` / `--ignore-unfixable` 写入任何 CI workflow 或 npm script；上游发布**兼容**修复版本后必须移除对应豁免条目，不得长期挂账。
- **判据修订授权（2026-10-27）**：若 `audit.ignore` 使 clean 字面串不可达，可按本节同批修订 §5.6 判据并记录理由与证据时序；本仓库已于 2026-10-27 据此转正（原观察期计数挂起 → 翻转后连续 3 次 push run id 回填）。
- **与发布门禁的关系（2026-10-29）**：本节 `audit.ignore` 只豁免 CI audit 阻断，**不构成发布豁免**——属 critical 的条目不得据此发布，属 high 的条目须同时登记 [§5.9 台账](#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策)（`.github/release-security-exemptions.json`）。

### 5.8 仓库自身安全门禁与 Security Auto Fix 停用（2026-10-25 用户决策）

- **Security Auto Fix 定时任务保持停用**：本仓库的 `.github/workflows/security-auto-fix.yml` 自 2026-10-17 起 `disabled_manually`。理由：dependfix 自身（及平台）已会创建修复 PR，定时 Action 再建同类 PR 会与人工 / 平台 PR 冲突；**本仓库不再依赖该 Action 做自修**。
- **替代为 Security 门禁**：Dependabot alerts 作发现面 → 依赖审计作**阻断面**（命令与判据见 [§5.6](#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c)，周回归使用同一命令）→ 全量依赖审计仅作 `test.yml` 的信号步骤（不进周回归）→ code scanning 覆盖代码质量告警。1.0 门槛另要求「未被 §5.7 豁免的 critical / high 为 0」；**每次发布的放行口径见 [§5.9](#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策)**（critical 一律不得豁免）。
- **门禁强度不得回退**：禁止用 `--ignore` / `--ignore-unfixable` 放宽；无修复版本的豁免按 [§5.7](#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05) 逐条登记；转正判据见 [§5.6](#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c)（2026-10-27 已转正；阻断步骤 exit 0 且日志含审计结果行 + 3 个 `master` push run id）。
- **1.0 门槛**：依赖审计必须为阻断级、**未被 §5.7 豁免的** critical / high 为 0（critical 一律不得豁免；本条不因 [§5.9](#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策) 的「修复难度大」类豁免放宽），详见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md#_2-门槛与判定-g1-g8)。

### 5.9 发布前安全告警门禁（Dependabot alerts + Code Scanning，2026-10-29 用户决策）

每次发布前必须核对本仓库的安全告警（`state=open` + `state=dismissed`），按严重级别决定是否放行；门禁已在 `release.yml` 中自动执行（`pnpm run check:release-security`），失败即中止发布。本节是**发布级门禁**，与 [§5.6](#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c) / [§5.7](#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05) 的 **CI 命令级阻断**互补：`pnpm audit` 绿灯不等于可发布（devDeps / 传递依赖 / 代码质量告警可能未被 audit 覆盖）；反之 `audit.ignore` 也不构成发布豁免。

- **执行面**：`release.yml` 在质量门与 changelog 校验之后、`release:publish` 之前运行 `Check release security alerts` 步骤（阻断判定）；另在 `Auto version` 之前运行 `Pre-check release security alerts` 只读预检，避免定时发布先提升版本再被拦下。本地可在版本提升前跑同一命令做**早期核对**（提前暴露问题，不替代 CI）。判定实现见 `scripts/check-release-security-alerts.mjs`。
- **分级口径**：

| 级别 | 发布门禁 | 处置要求 |
|:--|:--|:--|
| critical | 阻断 | 必须修复后才可发布，**禁止任何形式豁免**（「无修复版本」「仅 devDeps」「影响面小」均不成立）——上游无修复版本时须移除 / 替换该依赖或下线受影响能力，不得挂账发布 |
| high | 原则上阻断 | open 告警仅「上游无可用修复版本」（`no-fix`）或「修复需破坏性升级 / 跨模块改造，无法在本发布窗口完成」（`hard-fix`）两类情形可豁免；dismissed 告警仅可按误报（`false-positive`）登记。豁免须登记台账并持续追踪，尽快安排修复 |
| moderate / low | 不阻断 | 可暂缓，随后续版本修复，不要求逐条登记（GitHub 原值 `medium` 归一为 moderate） |

- **Code Scanning 参照同一口径**：按 `security_severity_level` 判定（原值 `medium` → moderate）；缺失时按 `rule.severity` 映射——`error` → high、`warning` → moderate、`note` / `none` → low。
- **dismiss 不能替代修复**：critical 告警一旦被 dismiss 即阻断发布（须修复后重新扫描；Dependabot 告警可重新打开后升级依赖消除，Code Scanning 可通过修正扫描规则消除误报）。high 被 dismiss 仅可按 `false-positive` 登记，且 Code Scanning 必须按实例 `location` 登记——同一 rule 的其他实例不会被连带放行。`auto_dismissed` 表示告警已自动关闭（不再适用），不参与阻断。
- **豁免台账（high 的唯一登记落点，机器可读）**：[`.github/release-security-exemptions.json`](../../.github/release-security-exemptions.json)。每条必须具备 9 个字段——`source`（`dependabot` / `code-scanning`）、`id`（GHSA / rule id）、`severity`（仅 `high`；critical 与 moderate / low 不得登记）、`category`（`no-fix` / `hard-fix` 仅对 open 告警生效；`false-positive` 仅对 dismissed 告警生效，且 `reason` 须写明原 dismiss 原因）、`target`（包与受影响范围）、`path`（依赖路径）、`reason`（豁免依据）、`review`（复核条件：上游发版 / 截止版本）、`tracking`（追踪落点）。**Code Scanning 条目另需 `location`（实例文件路径），缺失即台账非法**。条目须同步 [backlog.md 已知边界](../plan/backlog.md)；当前无在册条目（node-forge 已于 1.4.2 修复并移除，2026-10-31）。
- **fail-closed**：token 缺失、API 401/403/404、请求超时（10s）与 429/5xx 重试耗尽（总尝试 3 次）、响应非数组、告警级别无法判定 → 一律判失败，不得视为「无告警」（404 通常表示该仓库未启用对应告警源）。**token 按来源分离**：Dependabot 用 `GH_PAT`（classic `security_events` 或 fine-grained `Dependabot alerts: read`；`GITHUB_TOKEN` 恒 403，见 [github-action-workflow.md §7](../design/governance/github-action-workflow.md)）；Code Scanning 在 Actions 中优先用 `GITHUB_TOKEN`（受 workflow `security-events: read` 控制），本地回退 `GH_PAT` / `GH_TOKEN`。
- **检查命令**：`pnpm run check:release-security`（等价于 `node scripts/check-release-security-alerts.mjs`；仓库 slug 取 `GITHUB_REPOSITORY` 或 `--repo`，本地可用 `GH_PAT` / `GH_TOKEN` 提供 token）。stale 台账（无匹配 high 告警）输出 warning 但放行，复核时按 `review` 条件移除。
- **记录落点**：CI 步骤日志（run id）为放行证据；豁免与复核依据落在台账 JSON + backlog 已知边界，不要求写入发布 commit body。
- **自动化状态**：已在 `release.yml` 接线（2026-10-29），实现设计见 [发布前安全告警门禁设计](../design/governance/release-security-gate.md)。修改判定口径 / 台账结构 / workflow 步骤时须同步本节与 [review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md)，并保持「critical 禁止豁免」不可放宽。
- **审计必查项**：critical 是否被豁免（出现即 Reject）；台账条目 9 字段（Code Scanning 含 `location`）是否齐全、`category` 与告警状态是否绑定、是否双向追踪；是否以 dismiss / `audit.ignore` / `--ignore` 绕过 critical；`release.yml` 步骤是否仍在 `release:publish` 之前且 fail-closed（token 缺失不得跳过）。

## 6. 终端命令与自动化安全 (CLI & Automation)

- **空路径规避**：严禁将空字符串或未定义变量作为路径参数传给删除命令。
- **路径校验**：文件 / 目录删除操作前必须验证目标路径有效性。
- **命令注入防护**：涉及用户输入的 shell 命令必须使用 `execFileSync` 替代 `execSync`，参数作为数组传递（如 `execFileSync('git', ['config', 'user.name', name], { cwd: workDir })`），避免 shell 解释导致注入。

## 7. AI 输出安全

- **代码质量门**：AI 生成的代码必须通过 lint / typecheck 校验。
- **影响范围限制**：AI 单次 patch 修改文件数有限制。
- **人工审核**：AI 输出置信度低于阈值时仅输出建议，不自动提交。

## 8. 不可简化清单

- 输入校验（所有 API 输入必须经 `zod` 校验）；鉴权逻辑（涉及用户数据的接口必须有正确权限边界）；XSS 防护（用户输入渲染前必须转义或清理）；SQL 注入防护（必须参数化查询）；敏感信息脱敏（API 返回前必须隐藏密码、Token 等）；错误处理（关键操作异常不能静默吞掉）；国际化文本（UI 文本必须 `$t()` 包裹）。

## 9. 相关文档

- [开发规范](./development.md) / [API 规范](./api.md) / [Git 规范](./git.md)

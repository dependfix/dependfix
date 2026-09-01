# 安全开发规范 (Security Development Standards)

## 0. 事实源与边界 (Source & Scope)

本文档定义具体的开发安全控制措施和技术要求，与 `AGENTS.md` 的安全规范为引用关系。

## 1. 身份验证与授权 (Authentication & Authorization)

- **严格鉴权**: 所有涉及用户数据的 API 必须校验会话。
- **权限最小化**: 严格区分角色权限，使用包含性校验而非判等逻辑。
- **密码安全**: 严禁明文存储密码，使用 better-auth 默认安全哈希机制。

## 2. 数据安全 (Data Security)

- **输入校验**: 所有 API 输入使用 `zod` 校验，严禁直接信任原始输入。
- **防止注入**: 使用 TypeORM 参数化查询，严禁拼接 SQL 字符串。
- **敏感信息屏蔽**: API 返回前必须脱敏（隐藏密码、Token 等字段）。
- **Secrets 管理**: 严禁将密钥、Token 提交至 Git，必须使用 `.env`。
- **不可信路径组件白名单校验**: `runId` 等不可信路径组件（来自 URL / 请求体 / 外部输入）必须**双重**校验：白名单正则（如 `RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/`）+ 相对路径校验（`relative(workRoot, workDir).startsWith('..')`）。runId 不合法时 **early return 在 try 外**，跳过 mkdir / adapter.run / finally rm —— 避免对越界路径执行副作用（rm、删除等"清理逻辑"在路径不可信时同样危险）。

### 2.1 SQLite 数据库防护（不可恢复数据事故防线）

依赖 better-sqlite3 单文件 SQLite 的应用（`apps/platform`）必须实施以下防护，避免任何形式的清空 / 误删 / schema 重建导致业务数据永久丢失。

#### 2.1.1 启动期自动备份（hard requirement）

- **强制项**：`apps/platform/server/database/backup.ts` 存在并在 `ensureDatabaseInitialized()` 之前同步调用
- **备份路径**：`data/backups/${basename}.${YYYY-MM-DDTHH-mm-ss}.bak`（时间戳格式 ISO 8601 紧凑型）
- **触发条件**：源文件存在 + size > 0 + 后缀不是 `.bak`
- **写入安全**：`fsync` + `rename`（`fs.openSync` + `fs.writeSync` + `fs.fsyncSync` + `fs.renameSync`）——确保断电时不会留下半成品
- **保留策略**：最近 N 份（默认 10，`BACKUP_RETENTION_COUNT` env 可覆盖），按 mtime 升序清理超出部分
- **失败处理**：catch + `console.error('[database] backup failed:', error)`，**不阻塞启动**（fail-open）

#### 2.1.2 命令式恢复

- **强制项**：`apps/platform/server/database/scripts/db-restore.ts` 存在，含 CLI 入口守卫（`process.argv[1]` 校验，见 [development.md §5.1.5](./development.md)）
- **用法**：`pnpm db:restore --from=<backup-file>`
- **二次确认**：必须 `--yes` flag 才执行（避免误操作覆盖当前数据库）
- **覆盖前自动备份**：恢复前先把当前数据库备份到 `data/backups/auto.${timestamp}-${ms}.bak`，确保恢复失败可回滚；`auto.` 前缀使其纳入备份保留策略，与启动期备份命名空间隔离
- **旁文件清理**：恢复后删除属于旧数据库的 `-wal` / `-shm` / `-journal` 文件，避免陈旧日志被当作新库的崩溃恢复数据回放

#### 2.1.3 数据库自检工具

- **强制项**：`apps/platform/server/database/scripts/db-doctor.ts` 存在，含 CLI 入口守卫
- **用法**：`pnpm db:doctor`
- **输出**：各表行数 + `freelist_count` + `page_count` + `schema_version` + `journal_mode` + `integrity_check` + `sqlite_sequence` + 文件大小 + mtime/atime/birth time
- **判定逻辑**（输出末尾给出结论）：
  - `schema_version = 0` + 各表空 → **全新数据库**（首次启动）
  - `schema_version > 0` + 各表空 → **数据被清空** 或 **从未注入**（结合 history 区分）
  - `freelist_count > 0` → **有数据被删除但未 VACUUM**
  - `integrity_check != 'ok'` → **数据库损坏**

#### 2.1.4 与 e2e / fixtures 端点的关系

- `apps/platform/server/api/e2e/*` 端点双门控（`E2E_TEST` + `runtimeConfig.e2eFixturesAllowed` 兜底）也是 SQLite 数据保护的一环——防止生产环境误暴露清空端点
- **不能用 `process.env.NODE_ENV === 'production'` 作第二门控**（Nitro/esbuild 构建期把 `process.env.NODE_ENV` 静态替换为构建时值，prod build 表达式折叠后永远 404；详见 [platform.md §3.6](./platform.md)「为什么不用 `process.env.NODE_ENV`」陷阱段）
- 详见 [platform.md §3.6](./platform.md)

#### 2.1.5 实证

2026-09-01 `dependfix.sqlite` 数据清空事故：用户报告数据库启动后业务表全空，事后无法回滚。根因排查发现代码内无清空路径（synchronize 失败会回滚、cleanupStaleRuns 只清理 ScanRun/BatchRun、e2e fixtures 受门控保护、backfill 只处理 ScanResult），最可能清空来源在代码外部（shell / CI / 运维 / 误操作）。但项目无任何备份机制，事故无法回滚。本规范作为防御措施挂接。详见 [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01) + [development.md §5.1.18](./development.md) + [platform.md §3.7](./platform.md)。

## 3. Web 安全防护 (Web Protection)

- **XSS 防护**: 默认使用 Vue 模板转义。`v-html` 使用须严格审计。
- **CSRF 防护**: 确保 API 使用 SameSite Cookie 策略或 CSRF Token。
- **CORS 策略**: 生产环境严禁 `Access-Control-Allow-Origin: *`。
- **防御纵深对称性**: 同一资源的多处 API 入口必须保持校验一致。例如：在 `batch.post.ts` 加「凭据 × 组织」校验后，`importable.get.ts` 用同一 `credentialId` 的入口必须**同步**加 `requireOrgResource(event, credential.organizationId)`；否则对称缺失会被 audit 第 1 轮拒绝（RG-W1 类问题）。任何引入"资源 × 资源"校验的 PR，D 阶段先 grep 同资源其他入口，主动补齐后再提交。
- **前端拦截 ≠ 服务端安全**：前端 UI 拦截（`isSelfTarget` + `<Select disabled>` + `confirm`）只是 UX 层——devtools / 恶意客户端可直接调用 `authClient.admin.*` API 绕过。任何"防自修改 / 防越权 / 防 XSS / 防 CSRF"逻辑必须服务端兜底（better-auth adminMiddleware 仅校验权限不校验 self-target，是已知 gap），前端拦截仅作 UX 优化。纵深防御模型 = 前端拦截 + 服务端强制（Nuxt server middleware 实现 5 端点拦截 + 双层防护）。C65-A3 闭环：commit `b10e270`（`apps/platform/server/middleware/auth-self-guard.ts`）。
- **better-auth admin 端点 body shape 多样**：better-auth 1.6.26 admin 插件各端点 body shape 不一致——`set-role` / `ban-user` / `remove-user` / `impersonate-user` 字段平铺（`userId, role` 等直接平铺），但 `update-user` 字段嵌套在 `body.data` 下（`userId, data: <嵌套对象>`）。Nuxt server middleware 拦截逻辑必须分别处理（看 endpoint 路径分发到不同 parser），否则 `update-user` 路径完全绕过。本批次 audit W-1 即抓出此绕过漏洞（已修复）。详见 `node_modules/better-auth/dist/plugins/admin/routes.mjs`。
- **Nuxt server middleware 路径过滤快速退出**：Nuxt server middleware 在 `server/middleware/` 目录自动加载，对每个请求都执行；白名单过滤必须**前置**（path / method 检查 → return 早退），否则 admin / users / repos 等路由都跑一遍 `auth.api.getSession` + 数据库查询，性能浪费且增加 attack surface。三层快速过滤模板（`path.startsWith` → `method === POST` → `SELF_MUTATION_ENDPOINTS.has`）确保仅拦截必要请求。`apps/platform/server/middleware/auth-self-guard.ts:58-67` 参考实现。
- **Nuxt server middleware vs plugin hook 选型权衡**：拦截 better-auth admin 端点的 4 候选方案对比——
  1. `databaseHooks.user.update.before`：仅收 `(data, ctx)`，无 target userId + 无 body 上下文
  2. plugin hook（admin plugin）：admin 插件仅暴露 `after` hooks，无 `before` hooks
  3. **Nuxt server middleware（采用）**：路径拦截 + cookie 转发 better-auth `getSession` + `readBody` 拿 target —— 完整上下文，跨端点通用
  4. Nitro plugin：在更低层级执行但路径过滤逻辑重复

  选 Nuxt server middleware 因其路径/方法快速过滤 + cookie/session/body 三类上下文一次拿到，符合"端点拦截"语义。代价：每个 admin 操作多一次 `getSession`（admin 操作非热路径，可接受）。

## 4. 日志与监控 (Logging & Monitoring)

- **日志审计**: 重要操作（登录、删除、权限变更）必须记录审计日志。
- **无敏感信息日志**: 日志中严禁包含密码、Token 等信息。

## 5. 依赖与供应链安全 (Dependency & Supply Chain Security)

### 5.1 依赖管理

- **定期更新**: 关注依赖包安全漏洞公告。
- **最小化依赖**: 引入新包需经过必要性评估。
- **依赖升级纪律**: 依赖升级时检查版本发布时间、diff，在沙箱中验证。

### 5.2 供应链信任边界（AI 推荐包与外部工具引入必查）

AI 生成的代码与自动化引入的依赖/工具是独立投毒面，引入前按以下条款核验：

- **AI 推荐包来源验证**: AI 推荐的依赖包约 20% 在官方 registry 中不存在（斯坦福 57.6 万样本研究）——安装前必须查官方 registry 页面（npm / PyPI 等），警惕 typosquatting 拼写相近包。
- **钉版本 + 锁文件**: 新增依赖必须锁定精确版本并提交锁文件（pnpm-lock.yaml 等）；CI 中 GitHub Actions 必须钉不可变版本（如 setup-uv v8 起无 major tag）。
- **外部工具/技能来源可信**: 引入 MCP server、agent、skill 或 `git+https` 依赖前，核对来源仓库 URL 与维护组织，只装官方组织或自有仓库；警惕"伪装成有用文档/技能"的诱导信任（TrustFall 模式）。
- **最小权限**: MCP server 与自动化 agent 不运行于 root、不挂载全盘、数据库端口不暴露公网。
- **依赖审计进 CI**: 依赖审计（pnpm audit 等）必须进入 CI 门禁，本地抽查不能代替。

### 5.3 修复执行安全（dependfix 自身不得成为漏洞扩散工具）

dependfix 的核心动作是升级第三方依赖——**拉取并执行不可信代码**。更新依赖是为了修复漏洞，但修复过程中绝不能引入新的漏洞。所有执行路径（本地 CLI / GitHub Action / 平台容器 / 沙箱容器）必须满足以下基线，详见 [沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md)（工程化解读与治理登记）。

**执行环境基线（必须）**：

- **非 root 执行**: 执行不可信代码的进程必须以非 root 用户运行（镜像 `USER` 降权），容器不得挂载 `docker.sock`、不得授予额外特权。
- **工作目录隔离**: 执行工作目录必须为独立临时目录（如 `runs/{runId}/`），执行后清理。
- **超时兜底**: 每次执行必须有总超时；新增命令/子进程必须自带单命令超时，不得依赖外层总超时兜底。
- **保持 pnpm 默认脚本防护**: 不得扩大依赖 lifecycle scripts 执行面（保持 pnpm 10+ 默认仅执行 `allowBuilds`/`onlyBuiltDependencies` 批准包）；批准列表属于目标仓库信任边界，dependfix 不得代目标仓库追加批准。
- **资源与网络**: 执行环境应具备资源上限（M7 阶段落地 cgroup）；执行期网络出站应受限（M7 阶段默认 deny + registry/GitHub API 白名单），M6 阶段保留外联日志。

#### 5.3.1 网络外联审计（执行期网络行为可观测）

verification 阶段（依赖修复后的 `pnpm install --frozen-lockfile` / `pnpm lint` / `pnpm build`）执行期网络外联审计按以下规则落地，捕获面见 [`packages/engine/src/runners/network-audit.ts`](../../packages/engine/src/runners/network-audit.ts)：

- **真实外联 = deny-by-default 阻断**：本地拦截代理对非白名单域名返回 502 不建立上游连接，命中记录 `network_violations`（deny-by-default）。白名单默认含 `*.npmjs.org` / GitHub API 域 / `rolldown.rs`，可经 `DEPENDFIX_ALLOWED_DOMAINS` 扩展。
- **命令输出 URL = 仅 audit 记录，不阻断**（治本候选方向 3，2026-08-25 落地）：stdout/stderr 中出现的 URL 是文本而非真实网络连接；旧逻辑误判 `pnpm.io` / `rolldown.rs` 等合法链接为 `network_violation` 触发 verification fail。新逻辑统一入 `networkAudit` entries 备查，**不再作为 verification fail 依据**。run `dependfix-mt8nasq2-0iiiry` 实证：pnpm 11.x warnings 把 `https://pnpm.io/catalogs` 写进 stderr，Nuxt CLI 把 `https://telemetry.nuxt.com` 写进 stdout，这些链接不应阻断 verification。
- **工具链 telemetry 默认禁用**（治本 D2，2026-08-25 落地）：verification 子进程默认注入 `NUXT_TELEMETRY_DISABLED=1` / `NEXT_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`，禁止 Nuxt CLI 默认 telemetry 上报外联 telemetry.nuxt.com:443。父进程已设置时不覆盖（保留用户显式选择）。

**凭据基线（必须）**：

- **平台密钥隔离**: `NUXT_ENCRYPTION_KEY` / `AUTH_SECRET` 等平台密钥永不传入执行进程环境。
- **按仓库最小注入**: 凭据仅注入本次执行所需最小集合，解密仅执行时内存、用后即弃。
- **防泄露通道**: 凭据不得进 argv / URL（走 `http.extraheader` 等带外通道）；错误消息、命令输出、报告日志必须脱敏。
- **权限面收敛**: 扫描不可信仓库（owner 模式、平台仓库管理）必须使用专用低权限 token，不得使用全量 scope 的 PAT。

**供应链基线（必须）**：

- **升级前研判**: 自动升级前必须完成 changelog/diff 研判，研判不可省略。
- **供应链信号披露**: 报告/PR 必须披露"本次新增/升级的包是否带 lifecycle scripts 且已被目标仓库批准"，供合入前人工确认。
- **结果白名单回传**: 执行进程仅回传结构化结果，不赋予自由输出执行能力。

**准入流程（必须）**：

- **新执行后端威胁建模评审**: 新增执行后端（ExecutorKind）或改变执行边界（网络、文件系统、权限、并发形态）时，必须对照 [executor-sandbox.md 风险表](../design/governance/executor-sandbox.md) 逐项评估并记录缓解措施，评审通过方可实现。

### 5.4 凭据权限阶（C53 落地，2026-08-20）

平台执行器按模式分级需要不同的 Token 权限（详见 [executor-sandbox.md §8.4](../design/governance/executor-sandbox.md#84-凭据权限阶重要安全考量)）：

| 执行模式 | 凭据权限要求 | 推荐场景 |
|:--|:--|:--|
| report-only | `security-events: read`（拉告警） | 全部用户 |
| A 模式 fix（仅 commit） | `contents: write` | 自托管 + 强可控 PAT |
| A 模式 fix-and-pr | `contents: write` + `pull-requests: write`（+ `issues: write` 当启用重复 PR 评论/label，M19.3 起） | 自托管 + 强可控 PAT |
| B 模式（GitHub Action） | `actions: read + write` | **默认推荐**——目标仓库已配置 action 时权限面最窄 |

**核心原则**：

- **B 模式优先**：当目标仓库已配置 action 且凭据具备 `actions: read + write` 时，平台自动选择 B 模式；B 模式的 PR 创建在目标仓库 runner 上完成（使用 runner 内置 `GITHUB_TOKEN`），平台 token 不需要 `contents` / `pull-requests` 写权限——**这是 B 模式核心安全价值**
- **A 模式 fix-and-pr 必须 wide-scope**：使用平台 token 直接调 GitHub API（push + 创建 PR），需要 classic PAT 勾选 `repo` 或 fine-grained PAT 显式授权 `Contents: write` + `Pull requests: write`；不推荐在多租户 SaaS 场景使用
- **凭据权限最小化**：扫描不可信仓库（owner 模式 / 平台仓库管理）必须使用专用低权限 token（与 §5.3 凭据基线"权限面收敛"条目一致）
- **UI 显式提示**：执行触发时（如 report-only / fix / fix-and-pr 切换），UI 应显示当前所选凭据的权限范围（C28 设计已落地 §5.5；UI 增强项登记 [backlog.md §M11 C53-后-C](../plan/backlog.md) 待触发）

### 5.5 凭据加密存储（C28 已闭环，2026-08-20）

平台 Credential 实体存储采用 **AES-256-GCM 对称加密**（T602 已交付实现，实现见 `apps/platform/server/services/credential.service.ts`），设计要点：

**算法契约（与实现逐项对齐）**：

- **算法**：AES-256-GCM（authenticated encryption）——GCM 模式自带完整性校验，解密时自动验证密文是否被篡改；篡改会抛错，不会返回错误明文
- **密钥**：`NUXT_ENCRYPTION_KEY` 平台级密钥（任意长度输入）→ `sha256` 派生 32 字节密钥（`deriveKey`）；未配置时**抛错禁用凭据功能**（fail-closed，不静默降级为明文——与 [platform.md §5 凭据安全规范](./platform.md) 一致）
- **IV**：12 字节随机（96 bit，NIST SP 800-38D 推荐；每次加密重新生成，`randomBytes(12)`）
- **authTag**：16 字节（128 bit，GCM 认证标签）
- **密文格式**：`{iv}.{authTag}.{ciphertext}`（三段 base64 以点号拼接；注意是点号 `.` 分隔——历史文档 platform.md 曾误写为冒号 `iv:tag:ciphertext`，C28 已修正）
- **格式校验**：`decryptToken` 先 `split('.')` 校验恰好 3 段；非法格式抛错（不静默返回空 token，防 fail-open）

**凭据生命周期（CRUD 的加密时机）**：

- **创建**：`encryptToken(plaintext, NUXT_ENCRYPTION_KEY)` → 存 `Credential.encryptedToken`；`hasToken` 布尔字段标记（API 永不返回明文）
- **读取**：`decryptToken(encryptedToken, NUXT_ENCRYPTION_KEY)` → 内存 token → 注入 `ScanExecutorContext.credential`；用后即弃（执行结束随闭包释放）
- **更新**：更新 token 即重新 encrypt 覆盖 `encryptedToken`；非 token 字段（name/note）直写
- **删除**：`DELETE /api/credentials/[id]` 直接删行；关联 Repository 的 `credentialId` 置空（ON DELETE SET NULL 语义）

**设计要点（保留原 4 条）**：

- **密钥隔离**：`NUXT_ENCRYPTION_KEY` 由平台运维配置（K8s Secret / docker `.env`），**永不**进入执行进程环境，与 §5.3 "平台密钥隔离" 条款一致
- **解密仅执行时内存**：每次扫描任务从 `Credential.encryptedToken` 解密为内存 token，**用后即弃**（执行结束随闭包释放）
- **来源单一**：平台 `Repository.credentialId` → `Credential.encryptedToken` → AES-256-GCM `decryptToken` → `RuntimeConfig.githubToken` / `alertsToken`，禁止从平台存储二次读取
- **凭据邮件安全**：SMTP 凭据（`smtpHost` / `smtpUser` / `smtpPassword`）仅从 `runtimeConfig` 读取，**不进入前端 bundle**；速率限制防刷；失败时 fail-closed（不静默吞错）

**密钥轮换（边界说明）**：

- 当前实现无 key version——`NUXT_ENCRYPTION_KEY` 变更会使存量密文不可解密（解密抛错）。轮换需先批量解密旧密文 → 用新密钥重加密 → 更新全部 Credential 行。**此操作不在本规范强制范围内**（单机自托管场景密钥变更频率极低），登记为未来增强项（若引入多租户 SaaS 多租户密钥隔离再实现）

**审计必查项（Code Auditor 必查）**：

- 任何新增 Credential 字段必须走加密存储（禁止明文 token 类字段）
- 任意外部 HTTP 客户端必须确认 baseUrl 是 GitHub 官方 API（防 typo squatting / SSRF）
- 错误消息 / 日志 / 报告禁止打印明文 token（与 §5.3 "防泄露通道" 一致；`sanitizeErrorMessage` 覆盖 URL 内嵌 + Authorization basic/token/Bearer 三 scheme）
- `decryptToken` 解密失败必须抛错（防 fail-open）；禁止 catch 后静默返回空 token
- 密文格式校验（split 3 段）不可删除（防构造畸形密文绕过）

## 6. 终端命令与自动化安全 (CLI & Automation)

- **空路径规避**: 严禁将空字符串或未定义变量作为路径参数传给删除命令。
- **路径校验**: 文件/目录删除操作前必须验证目标路径有效性。
- **命令注入防护**: 涉及用户输入的 shell 命令必须使用 `execFileSync` 替代 `execSync`，参数作为数组传递，避免 shell 解释导致的命令注入漏洞。例如：```typescript
// 不安全（存在命令注入风险）
execSync(`git config user.name "${name}"`, { cwd: workDir })

// 安全（参数作为数组传递，不经过 shell 解释）
execFileSync('git', ['config', 'user.name', name], { cwd: workDir })
```

## 7. AI 输出安全

- **代码质量门**: AI 生成的代码必须通过 lint/typecheck 校验。
- **影响范围限制**: AI 单次 patch 修改文件数有限制。
- **人工审核**: AI 输出置信度低于阈值时仅输出建议，不自动提交。

## 8. 不可简化清单

- 输入校验：所有 API 输入必须经过 `zod` 校验
- 鉴权逻辑：涉及用户数据的接口必须有正确的权限边界
- XSS 防护：用户输入渲染前必须转义或清理
- SQL 注入防护：必须使用参数化查询
- 敏感信息脱敏：API 返回前必须隐藏密码、Token 等
- 错误处理：关键操作异常不能静默吞掉
- 国际化文本：UI 文本必须使用 `$t()` 包裹

## 9. 相关文档

- [开发规范](./development.md)
- [API 规范](./api.md)
- [Git 规范](./git.md)

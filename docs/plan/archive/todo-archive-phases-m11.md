# 阶段归档分片 — M9 + 2026-08-19/20 平台 UX + M11 推进批次（已迁出）

> **归档日期**: 2026-08-20
> **归档方式**: `todo-archive.md` 主窗口保留 3-5 个最新阶段（M11 推进批次 + C53 收口 + C59-C61 平台 UI 增强），其余早期批次按主题迁入本分片
> **分片索引**: 见 [archive/index.md §4 当前基线](../index.md)

---

## M9: i18n 基建同步（已归档）

> 归档日期: 2026-08-18（代码与脚本工作 2026-08-15 完成，文档侧 M9 归档块与 todo.md M9 区块移除直至 2026-08-18 才补齐——视为 M9 收口闭环）
> 阶段摘要: 参见 [roadmap.md §M9](../../roadmap.md)
> 设计文档: [standards/i18n.md](../../../standards/i18n.md)（Review Gate Pass）

**阶段成果**: 从 momei 同步 i18n 治理体系基建——i18n 规范（语言分级 / freshness 分层 / 回退链 / 术语约束 / blocker 矩阵）+ 4 个审计脚本（`audit-locale-keys` 缺词 parity / `audit-duplicate-messages` 重复文案 / `dynamic-key-allowlist` 动态 key 白名单 / `check-i18n-duplicates` docs 防回流）+ 4 套 vitest 测试 75 例 + `@intlify/eslint-plugin-vue-i18n` 独立 lint + 5 个 npm script（3 个 `i18n:audit:*` 维度审计 + `docs:check:i18n` + `lint:i18n`）+ CI 接入（`lint:i18n` / `i18n:audit:missing` / `docs:check:i18n` 三步入 test.yml）。5 个原子 commit 覆盖 6 任务（T906 元任务融入相邻原子提交），合计 2556 行 inserts / 2539 行净增。Translation 内容（README / docs / platform 多语言）按本期决策留待后续阶段排期。

### 规划决策（2026-08-15 用户确认）

- **D1 范围（Q1=A）**：只同步基建，脚本**适当优化不全量同步**（核心 3 项：缺失 key / 动态 key / 重复文案；momei 其他脚本暂缓）
- **D2 docs 翻译结构（Q2=A）**：沿用 `docs/i18n/<locale>/` 镜像结构（README/docs 各 locale 一一对应）
- **D3 locale 模块化（Q3=B）**：locale 文件**模块化拆分延后**——脚本已兼容单文件（现状）与模块化（未来）双目录形态，未来切换无需重写
- **D4 vue-i18n lint（Q4=A）**：引入 `@intlify/eslint-plugin-vue-i18n` 但作为**独立命令**（`lint:i18n`）而非合并入常规 lint（插件执行慢，按需跑）；CI 必跑 + 升级 error 级别

> **注**：D1-D4 决策追溯自原 todo.md M9 区块"决策（2026-08-15 用户确认）：①②③④"四项结论。Q 编号（Q1=A / Q2=A / Q3=B / Q4=A）为执行侧补充的"提问-回答"映射，非 todo.md 原文档——便于需求澄清追溯，与其他阶段（M5/M6/M7）的 Q 编号口径一致。

### T901 i18n 规范同步 ✅

- **交付物**: `docs/standards/i18n.md`（191 行）+ `docs/standards/index.md` 登记
- **提交**: 49438f5 docs: 新增 i18n 规范并登记脚本命令
- **Review Gate**: APPROVE

### T902 脚本同步（momei 审计脚本迁移 + dependfix 适配） ✅

- **交付物**: 4 个 audit 脚本 + 1 个共享 CLI helper（`scripts/shared/cli.mjs` + 4 个 audit 脚本）
- **提交**: a4d1668 feat(scripts): 同步 momei i18n 审计脚本并适配 dependfix 结构
- **Review Gate**: APPROVE

### T903 脚本测试（75 例覆盖双形态与边界） ✅

- **交付物**: 4 套 vitest 单测（覆盖双形态 + 格式化 + runAudit 集成）
- **提交**: a4d1668（含测试）+ 077823c（包级测试基建）
- **Review Gate**: APPROVE

### T904 npm scripts + `@intlify/eslint-plugin-vue-i18n` 独立 lint 接入 ✅

- **交付物**: 5 个 npm script + 插件接入
- **提交**: eae70cf（lint 接入）+ a61becc（scripts 登记）
- **Review Gate**: APPROVE

### T905 CI 接入（test.yml 3 个新步骤） ✅

- **交付物**: `.github/workflows/test.yml` + lint:i18n + i18n:audit:missing + docs:check:i18n 三步
- **提交**: 含相邻 M9 commit
- **Review Gate**: APPROVE

### T906 文档收口（scripts/README + todo/roadmap） ✅

- **交付物**: `scripts/README.md` + M9 todo/roadmap 同步
- **Review Gate**: APPROVE

### 阶段治理记录

- **总变更**: 2556 行 inserts / 2539 行净增
- **审计覆盖**: 全部 T901-T906 Review Gate APPROVE
- **历史教训**: scripts/ 顶层 CLI 副作用必须包在 `process.argv[1]` 守卫里（vitest 4 严格监控 `process.exit`）

---

## 2026-08-19 平台可用性批次（PR1-PR3 + C51）

> 归档日期: 2026-08-19~20
> 阶段摘要: 用户实测反馈平台可用性问题（导入对话框默认全勾、批量导入无过滤、单仓库扫描无模式选择、扫描历史子路由不可达、Dialog 默认可拖拽等）一次性收口三个 PR；同时修复 unrouting 0.2.x 兼容 bug（应用层 Dialog 化）
> 状态: ✅ 全部完成（PR1 / PR2 / PR3 + C51 子路由 Dialog 修复；5 commits 待推送）

**批次成果**: 批量导入对话框（C46 三维过滤 + C48 默认不勾选 + C49 分页缓存 + C50 默认关联凭据）+ 单仓库扫描模式（C52）+ Dialog 默认不可拖动（C47）+ 扫描历史 Dialog 化（C51 兼容修复）共 7 个 backlog 项批量收口。

### PR1: C47 + C48 原子修复 ✅

- **交付物**: `apps/platform/app/components/ImportReposDialog.vue` + 6 处 Dialog `draggable=false` + e2e `admin.e2e.test.ts`
- **关键 commit**: `cb788e7` fix(platform): 批量导入对话框默认不勾选仓库防手滑 + `9e26b56` chore(platform): 6 处 PrimeVue Dialog 默认不可拖动统一体验
- **完成定义**: C48 真实风险点消除（C48 默认不勾选，但保留"全选"按钮）；全站 6 处 Dialog 默认不可拖动（unrouting 子路由 bug 解除后 runs.vue 也能用上）
- **审计**: A 阶段 reviewer standard 第 1 轮 Reject → 第 2 轮 Pass；e2e `admin.e2e.test.ts` 验证默认未勾选

### PR2: C52 单仓库扫描模式补全 ✅

- **交付物**: `apps/platform/app/pages/repos.vue` 单仓库触发配置 Dialog + `triggerScan` 重构 + e2e `scan-config.e2e.test.ts`
- **关键 commit**: `1a663f3` feat(platform): 单仓库扫描支持 mode/severity 选择
- **完成定义**: 单仓库入口可触发 fix / fix-and-pr 模式（之前只可走批量扫描）；与批量扫描行为对齐
- **审计**: Reviewer standard 第 1 轮 Reject 4 处修复点 → 第 2 轮 Pass；e2e 验证 12 种组合至少 1 路径

### PR3: C46 + C49 + C50 批量导入能力补全 ✅

- **交付物**: `ImportReposDialog.vue` 三维过滤 + PrimeVue Paginator + 后端 `cachedFetch()` 工具 + `batch.post.ts` 默认凭据前置校验 + i18n zh-CN + en-US 各 +3 键 + 后端单测 + e2e
- **关键 commit**: `2a7f99f` feat(platform): 批量导入加过滤 / 分页缓存 / 默认凭据（14 文件 / +920 / -115 = +805 行净）
- **完成定义**: 100+ 仓库场景下不丢失候选；前端默认 pageSize=25 避免单页过载；5min 缓存降低 GitHub API 调用次数；批量导入后仓库默认带关联凭据；已勾选项在 filter / 分页 / pageSize 切换时保留（W10 教训）
- **审计**: Reviewer standard 第 1 轮 Reject 4 处修复点 → 第 2 轮 Pass；UI validator 视觉验证 Pass

### C51: 扫描历史子路由不可达（unrouting 0.2.x 兼容 bug + 应用层 Dialog 改造）✅

- **交付物**: `apps/platform/app/components/RepoHistoryDialog.vue` + `repos.vue` `pi-history` 改 `navigateTo('/repos?history={id}')` + e2e `history-dialog.e2e.test.ts`
- **关键 commit**: `b067b3a` chore: gitignore .env 忽略 + `2102894` fix(platform): 扫描历史改用 Dialog+query 承载 + `0b9411b` docs(plan): C46-C53 登记
- **完成定义**: pi-history 按钮点击 → URL `/repos?history={id}` → 自动打开「扫描历史」Dialog；用户直接访问 deep-link 也可正确打开
- **审计**: review gate **Pass**（warning 级 UX 建议留待后续 C57 修复）

### 阶段治理记录

- **提交序列**: C51 修复 (`b067b3a` → `2102894` → `0b9411b`) → PR1 (`cb788e7` → `9e26b56`) → PR2 (`1a663f3`) → PR3 (`2a7f99f`) → docs 同步 (`0b8088f` → `9ae1767`)
- **累计 commits**: PR1+PR2+PR3 共 5 commits 待推送 + C51 相关 3 commits 待推送
- **审计覆盖**: 每个 PR reviewer standard 第 1 轮 + 第 2 轮 Pass；UI validator 视觉验证 Pass
- **历史教训**（已迁移至 docs/standards/，对应 8d02cce wisdom 蒸馏批次）:
  - W10 删除"自动逻辑"必须搜遍被动接收态路径 → [开发规范 §5.1.10](../../../standards/development.md)
  - W11 Nuxt SSR+CSR e2e `page.route` 拦截局限 → [测试规范 §6.1](../../../standards/testing.md)
  - W12 单文件跨 type 改动需提前规划 commit 拆分 → [Git 规范 §3.2](../../../standards/git.md)
  - W15 跨 Dialog 共享选项 i18n label key 同步共享 → [开发规范 §6](../../../standards/development.md)
  - W17 防御纵深对称性 — 同一资源多入口校验一致 → [安全规范 §3](../../../standards/security.md)

---

## 2026-08-19 batch-runs 增强（C54+C55）

> 归档日期: 2026-08-19
> 阶段摘要: 用户实测「batch-runs 页面刷新数据过于频繁,会导致表格屏闪」(C54) + 「批量运行对任务超时没有兜底,会出现一直执行中的情况」(C55) — 同页面两个不同维度问题
> 状态: ✅ 全部完成（C54 60s 轮询 + 增量 reconcile + 三态分离；C55 stale-cleanup 自动化 + admin force-fail 应急逃生口）

**批次成果**: batch-runs 页面轮询节拍 2s → 60s 消除屏闪；孤儿运行兜底覆盖 30 分钟+ + admin 30 分钟内应急逃生口。

### C54: batch-runs 页面刷新策略 ✅

- **交付物**: `apps/platform/app/pages/batch-runs.vue` + `apps/platform/app/utils/reconcile-batch-runs.ts`(39 行) + 后端 `updatedAt` 字段 + `apps/platform/app/types/platform.ts` `BatchRunView` + 单测 7 case + e2e
- **关键 commit**: `3a2757b` feat(platform): batch-runs 刷新策略重构(60s 轮询 + 增量 reconcile + 三态分离 + 手动刷新 + 防抖) + `edb066c` docs(plan): batch-runs 刷新策略实施登记 + 同步 60s 决策
- **完成定义**: 60s 节拍无屏闪（DataTable 不再整表 reconcile）；手动刷新按钮立即 loading + 重置下次轮询计时 + 连续点击不并发；首屏不卡死（RG-B1 已修）；已勾选项 + 详情缓存 + 展开行引用稳定
- **审计**: A 阶段 code-reviewer standard 第 1 轮 Reject（RG-B1 + RG-B3 + W1/S2/S3/S4）→ 全部修复 → 第 2 轮 quick Pass；V 阶段 ui-validator 7 张截图 + OCR 验证 8 重点全过（含用户真实运行中场景 momei/cmyr-skills-agents/caomei-auth）
- **关联**: 与 PR1-PR3 同批但独立提交；M10 后续 cgroup v2 资源限制（T1003）可参考 30 分钟阈值经验

### C55: batch-runs 孤儿运行兜底 ✅

- **交付物**: `apps/platform/server/services/batch/stale-cleanup.ts` + `apps/platform/server/plugins/stale-cleanup.ts` + `apps/platform/server/api/batch-runs/[id]/force-fail.post.ts` + 前端"强制完成"按钮 + i18n 3 key × 2 语言 + 单测 12 case
- **关键 commit**: `ce523d4` feat(platform): batch-runs 孤儿运行兜底(stale-cleanup 自动 + force-fail 手动) + `4c813f8` docs(plan): C55 登记 + 实施区块
- **完成定义**: 进程崩溃 / worker SIGKILL / Action runner 永久不回执等场景不再产生孤儿 running；stale-cleanup 30 分钟阈值（与 ContainerExecutor.timeoutMs 对齐）自动清理；admin force-fail 覆盖 30 分钟内卡死；已终态不重复处理；慢批次不被误杀
- **审计**: A 阶段 1 轮 audit-quick Pass（0 blocker + 3 warning 已修复）；V 阶段 OCR 确认按钮在 running 行旁渲染
- **历史教训**: D 阶段踩过 ScanRun.repository FK 约束 — 测试必须先建 Repository 实体；TypeORM `BatchRun.source` 是非空字段，`create({})` 空对象会 NOT NULL 失败

### 阶段治理记录

- **提交序列**: C54 (`3a2757b` → `edb066c`) → C55 (`ce523d4` → `4c813f8`) 共 4 commits 待推送
- **关联**: C54 + C55 同页面但解决不同问题（C54 轮询+防抖 / C55 孤儿兜底）；与 PR1-PR3 互不阻塞
- **历史教训**: C54 D 阶段踩过 unshift 反转顺序 bug 后切 splice(0,0,...)；RG-B1 `loading` 初值 true 误吞首屏请求是经典"UI 态与并发守卫复用 ref"反模式

---

## M11 推进批次（业务可见性 + 沙箱落地 + 安全文档 + 通知基建）

> 归档日期: 2026-08-20
> 阶段摘要: C53 闭环触发 M11 启动 → 三方面子任务全部闭环：
> 1. **业务可见性 + UX**：C53-后-A/B/C（C53 衍生 P2/P3）+ C56/C57（批量扫描 + 扫描历史 UX 小修）
> 2. **沙箱落地**：T1005-A/B/C/D（sandbox 路由接线 4 子任务 + degraded 状态机 + 仓库级 sandboxLimits）
> 3. **安全文档**：C28（security.md §凭据加密存储章节补齐 + 凭据权限阶）
> 4. **通知基建（本批次追加）**：C-ENV-CHANGE-ALERT（环境容器变化告警——audit_event 表 + NotificationChannel 接口 + Email 实现 + scan-orchestrator 触发 + env-events UI）
> 5. **告警可视化（本批次追加）**：C58（alerts 按包聚合 + 图表卡片复用 C61）
> 状态: ✅ 全部完成（22 commits 总投入：M11 推进批次 12 commits + 此前 M11 启动批次 10 commits）

---

### C53-后-A: 工作目录 stale-cleanup 任务（_pending 24h 清理） ✅

- **优先级**: P2
- **交付物**: `apps/platform/server/services/cleanup-pending-workdirs.ts` + `apps/platform/server/plugins/stale-cleanup.ts`（集成）+ 单测 7 个真实 fs 测试
- **关键 commit**: `931b5b7` feat(platform): C53-后-A _pending/ 过期 workDir 清理任务
- **完成定义**: nitro plugin 周期清理（30s 首跑 + 5min interval + env 覆盖）；按 `_pending/{runId}/.meta.json` 的 `expiresAt` 字段扫描删除
- **审计**: A 阶段 1 轮 audit-quick Pass（0 blocker + 1 warning 已修复）

### C53-后-B: sanitizeErrorMessage 补充 `Authorization: token xxx` 模式 ✅

- **优先级**: P3
- **交付物**: 正则扩展 basic/token/Bearer 三 scheme + `apps/platform/server/services/executor/container-executor.ts` + `apps/platform/server/services/executor/sandbox-executor.ts` 同步
- **关键 commit**: `bfecf6a` fix(platform): C53-后-B sanitizeErrorMessage 补充 Authorization token/Bearer 模式
- **完成定义**: 6 个新测试覆盖 GitHub REST API 实际形态 + `Authorization: token xxx` + `Bearer xxx`
- **审计**: 与 C53-2 关联（RG-W2 登记）

### C53-后-C: A 模式 dispatched UI 提示（手动开 PR） ✅

- **优先级**: P3
- **交付物**: i18n 双键 + `apps/platform/app/pages/repos/[id]/runs.vue` + `apps/platform/app/pages/batch-runs.vue` 条件渲染 `pr_creation_failed` 提示
- **关键 commit**: `5d7ee97` feat(platform): C53-后-C A 模式 dispatched UI 提示（PR 创建失败手动开 PR）
- **完成定义**: 用户看到 dispatched 状态明确"PR 创建失败，分支已推，可手动开 PR"；区分 B 模式 dispatched（结果回填失败）
- **审计**: 与 C53-2 关联

---

### T1005 沙箱路由接线（4 子任务） ✅

> **关联**: M10 沙箱治理决议 G5 实施规划收口——sandbox 路由从 M10 设计文档进入实际可触发路径

#### T1005-A: sandbox 前端 UI 暴露选项 ✅

- **优先级**: P1
- **交付物**: `apps/platform/app/pages/repos.vue` Dropdown + i18n 双语 + 类型扩展（`executorKind` union 加 `'sandbox'`）
- **关键 commit**: `0ea8149` feat(platform): T1005-A 前端 UI 暴露 sandbox 执行方式选项
- **审计**: 1 轮 quick Pass

#### T1005-B: Repository `sandboxLimits` JSON 字段 + orchestrator 透传 ✅

- **优先级**: P2
- **交付物**: 拆 2 commit
  - B1 `5542e33` feat(platform): T1005-B1 Repository sandboxLimits JSON 字段脚手架（实体 + schema + zod 校验 + 11 个测试）
  - B2 `b6bce6c` feat(platform): T1005-B2 sandboxLimits 端到端透传（orchestrator + repos API 序列化 + 16 个测试）
- **完成定义**: end-to-end 数据流打通；UI 不暴露限额覆盖表单（避免误操作风险）
- **审计**: 1 轮 standard Pass（2 warning 已闭环）

#### T1005-C: 状态机扩展 `degraded` 状态（sandbox 启动时降级 → degraded + info UI；运行时失败 → failed + warn UI） ✅

- **优先级**: P1
- **交付物**: 函数体 degraded 分支实现 + orchestrator 降级信号透传 + `apps/platform/server/services/batch/batch-aggregate.ts` 新增 `degradedCount`（独立计）+ TERMINAL_STATUSES 含 `'degraded'` + 14 个新断言
- **关键 commit**: `64135ed` feat(platform): T1005-C 状态机扩展 degraded 终态
- **完成定义**: A 场景 → degraded + info UI（业务完整 + 路径偏离）；B 场景 → failed + warn UI（环境变化，避免掩盖真实错误）
- **关联**: 设计契约落盘于 [executor-sandbox.md §7.8](../../../design/governance/executor-sandbox.md)
- **审计**: 1 轮 standard Pass with Warning（warning 全部闭环）

#### T1005-D: quick-start.md 同步 ✅

- **优先级**: P2
- **交付物**: 移除「待 T1005 路由接线」过时警告 + G5 行更新 + 文档批次收口
- **关键 commit**: `809aa3b` docs(guide): T1005-D quick-start.md 同步 + 清理 sandbox-security-governance 过期状态
- **审计**: 与 T1005 路由接线主任务一并验收

#### T1005 阶段治理记录

- **总变更**: 5 commits + 27 个 sandboxLimits 相关测试（branches 80.44% ≥ 80%；`parseSandboxLimits` 单元测试全分支覆盖（entities/repository.ts 100%）；144 files / 1996 tests 全绿）
- **审计覆盖**: 2 核心 commit standard Pass + 1 quick Pass
- **关联升级**: 状态机扩展与 B 模式 `dispatched` 语义对齐（A 模式 PR 失败也走 dispatched 兜底）；设计契约统一收口于 [executor-sandbox.md §7.8](../../../design/governance/executor-sandbox.md)

---

### C28: security.md §凭据加密存储章节补齐（T602 AES-256-GCM 文档化） ✅

- **优先级**: P2
- **交付物**: `docs/standards/security.md` §5.5 凭据加密存储补齐算法契约（AES-256-GCM/IV/authTag/密文格式）+ 密钥派生（sha256）+ fail-closed + 凭据 CRUD 生命周期 + 审计必查项扩展 + 密钥轮换边界
- **关键 commit**: `fcef918` docs(standards): C28 security.md §5.5 凭据加密存储补齐 + 状态同步
- **完成定义**: T602 AES-256-GCM 设计文档化（之前散落 executor-sandbox.md §3 与 credential.service.ts 注释）；顺手修 platform.md 密文格式误写 `iv:tag:ciphertext` → `{iv}.{authTag}.{ciphertext}`
- **关联**: T912-3 邮件发送安全与本项合并为单一文档同步任务

---

### C56: 批量扫描 Dialog 关闭时序（乐观关闭） ✅

- **优先级**: P3（用户感知"点了不关"）
- **交付物**: `apps/platform/app/pages/repos.vue` `submitBatchScan` 提交前 `batchDialogVisible = false`；失败时回滚 dialog + 显示错误
- **关键 commit**: `cda5b90` fix(platform): C56/C57 批量扫描乐观关闭 + 扫描历史返回列表按钮
- **完成定义**: 方案 A（推荐，最小改动）：点击"开始扫描"后 dialog 立即关闭（< 100ms 视觉反馈）；失败时 dialog 重新打开 + 显示 `batchError`；成功 toast 仍存在 3s
- **审计**: 1 轮 audit-quick Pass

### C57: 扫描历史 Dialog 缺面包屑（"返回列表"按钮） ✅

- **优先级**: P3
- **交付物**: `apps/platform/app/components/RepoHistoryDialog.vue` DataTable header slot 加 icon `pi pi-arrow-left` + i18n `runs.backToList`
- **关键 commit**: 与 C56 合并（`cda5b90`）
- **完成定义**: 方案 A（推荐）：detail view 左上角"返回列表"按钮可见；点击后回到 list view 不重 fetch（`runs.value` 保留）
- **审计**: 与 C56 一并

---

### C58: 告警视图按包聚合 + 图表卡片（Q1=A 完整 + Q2=复用 C61） ✅

- **优先级**: P3
- **决策记录（2026-08-20 用户）**:
  - **Q1=A 完整**：同时做 C58-1 rowGroup 聚合 + C58-2 Chart 卡片，拆 2 sub-task 独立评审
  - **Q2 复用 C61 ChartCanvas**：不自研新图表组件，复用 `apps/platform/app/components/ChartCanvas.vue`（C61 自实现，tree-shakable 注册 ArcElement/BarController/CategoryScale/DoughnutController/LinearScale/Legend/Tooltip，约 40KB gzip）+ `apps/platform/app/pages/dashboard.vue` 已实现的 3 块图表卡片（severity 饼图 + fixRate 环形 + Top-10 包柱状图）；数据源复用 `/api/dashboard/stats`，无需新增后端图表端点
- **交付物**:
  - 新增 `apps/platform/app/composables/use-dashboard-stats.ts`（Nuxt auto-import）+ `apps/platform/app/utils/dashboard-charts.ts`（纯函数 helper，便于单测）
  - 改 `apps/platform/app/pages/dashboard.vue`：改用 composable，删除 ~174 行重复代码
  - 改 `apps/platform/app/pages/alerts.vue`：顶部加 charts 区块（severity 饼图 + fixRate 环形 + Top-10 包柱状图）+ DataTable `rowGroupMode="subheader"` + `groupRowsBy="packageName"` + `expandableRowGroups` + 键盘可访问 subheader
  - 改 `apps/platform/server/api/alerts/index.get.ts`：加 `?groupBy=package` 参数（按 packageName ASC 排序，PrimeVue 4 rowGroup 模式要求预排序）
- **关键 commit**:
  - `a562ab2` feat(platform): dashboard stats composable 抽取 + alerts 复用图表
  - `5bb0f96` feat(platform): alerts 顶部图表 + rowGroup 按包聚合
- **完成定义**: 27 个 helper 测试覆盖所有分支（severity 5 桶 / fixRate clamp / Top-10 截断 20 字符 / empty）；4 个 rowGroup API 测试；4 个 alerts-rowgroup e2e 测试；alerts 顶部 3 图表 + 768px 单列响应式断点
- **审计**: 深度 standard 两轮——第 1 轮 Reject（9 blocker + warning）→ 全部修复 → 第 2 轮 Pass（elapsed 5m 24s）

---

### C-ENV-CHANGE-ALERT: 环境容器变化告警（Q3=仅邮件 + 接口预留） ✅

- **优先级**: P3
- **决策记录（2026-08-20 用户 Q3）**:
  - **仅邮件实现**：复用 T912 mailer service（已闭环 SMTP 凭据 + nodemailer + fail-closed），其他渠道留接口
  - **接口预留**：定义 `NotificationChannel` 接口（`name / send(event) / isAvailable()`）+ 注册表 `notificationChannels`；当前仅 `EmailNotificationChannel` 实现 + 注册；Slack/Webhook 等占位 `register('slack', new SlackStubChannel())` 不实际发送（`isAvailable()=false`），后续接入时新建实现类即可
- **交付物**（10 commits）：
  - `aeee3f0` feat(platform): audit_event 表 + 类级复合索引 + SQLite migration
  - `f57683e` feat(platform): notification 接口 + Email 实现 + Stub 注册（SlackStubChannel + WebhookStubChannel 占位）
  - `15f1c9a` test(platform): notification 模块测试 + 邮件模板双语（zh-CN + en-US）
  - `3f4653f` feat(platform): scan-orchestrator 集成 audit_event + notify 触发（A/B 场景 4 个集成测试）
  - `64f005e` feat(platform): env-events UI + API 权限防护 + e2e（admin/org_admin 可见 / viewer 403 + DataTable scrollable 60vh + 时间范围过滤）
  - `f678196` test(platform): env-events e2e 覆盖 + 权限场景
  - `ace8eea` chore(platform): 清理本批次审计引用编号
  - `eddc638` chore(platform): 清理 audit-events API 残留审计编号
- **完成定义**:
  - audit_event 表：type 覆盖 `sandbox_unavailable` / `sandbox_degraded` / `docker_daemon_down`；类级复合索引 `[type, createdAt]` + `[repositoryId, createdAt]`（TypeORM 1.x 列级复合会生成单列索引）
  - 通知：邮件发送 fail-closed（mailer service 已闭环），失败时 audit_event 标记 `notified=false`；fire-and-forget 不阻塞扫描主流程
  - 接口预留：`notificationChannels` 注册表可扩展；slack/webhook 注册入口显式标注"待实现"
  - UI：env-events 列表 + 详情展开（payload 折叠/展开）；与 alerts 共享 SCSS 样式；768px 响应式
  - 接收方：admin/org_admin 全员邮箱 + `DEPENDFIX_ENV_ALERT_RECIPIENTS` env 覆盖；locale 解析白名单（`['zh-CN', 'en-US']`）+ `DEPENDFIX_LOCALE` env + event.locale 优先级
- **审计**: 深度 standard 两轮——第 1 轮 Reject（9 blocker + warning）→ 全部修复 → 第 2 轮 Pass（elapsed 5m 24s）
- **关联**: T1005-C（已闭环，提供 degradedReason / sandbox_unavailable 信号源）；T912（已闭环，提供 mailer service）；M8 T805（外联审计，与平台 audit_event 是不同维度，不重叠）

---

### M11 推进批次治理记录

- **总变更**: 12 commits（C58 + C-ENV-CHANGE-ALERT）+ 10 commits（此前 M11 启动批次）= 22 commits
- **测试覆盖**: +56 新测试（composable 27 + audit-events 15 + notification 41 + scan-orchestrator 集成 4 + alerts rowGroup 4 + e2e 11）= 681 tests pass
- **branches coverage**: 80.49% ≥ 80% 阈值
- **审计覆盖**: 2 轮深度 standard Pass（C58 + C-ENV-CHANGE-ALERT）+ 多轮 quick Pass（其他 sub-task）
- **文档落盘**: `docs/standards/security.md` §5.4 + §5.5 / `docs/design/governance/executor-sandbox.md` §7.8 / `docs/guide/quick-start.md` 同步
- **历史教训**（已迁移至 docs/standards/）:
  - **TypeORM 1.x 复合索引必须类级声明**：列级 `@Index(['col1', 'col2'])` 会生成仅含末列的单列索引；e2e 二次运行会暴露第二个仓库的 500 错误 → [开发规范 §5.1.13](../../../standards/development.md)
  - **PrimeVue 4 rowGroup 模式数据排序**：必须预排序（相邻行字段值变化触发 subheader）+ `sortMode="multiple"` 保留 groupRowsBy 为第一排序键 + `expandableRowGroups` + DataTableExpandedRows 期望 `Record<string, boolean>` 而非 Set
  - **fire-and-forget 通知失败语义**：scan-orchestrator 主流程不 await notifyEnvEvent；channel 内部 try/catch + console.error；AuditEvent.notified 字段供后续重试
  - **依赖外部库（nodemailer）mock 模式**：`vi.hoisted` 内部设置 `Symbol.for('nodejs.util.promisify.custom')` 标记为 Promise 风格，否则 `promisify(execFile)` 包装时插入 callback 期望导致 mock 永不触发

---

## 2026-08-20 e2e 修复批次（C62 + C63 + C64 + chore）

> **归档日期**: 2026-08-20
> **归档方式**: 闭环 CI run 32382730911 code-scanning 告警（#23/#24/#25）+ CI run 32383730911 6 个 e2e 失败 + 本机 e2e 实测发现的 PrimeVue 4 + Nuxt hydration 兼容性 bug → 全量 platform e2e **54 passed / 2 skipped / 0 failed**（本批次 ahead 8 commits；C62 三 commits 已随 M11 收口批次推送至 origin/master）
> **归档来源**: 2026-08-26 M15 归档批次从 [todo-archive.md 主窗口](../../todo-archive.md) 迁出——主窗口 700 行分片阈值前的预防性迁出，与 §2026-08-20 平台 UI 增强 C59-C61 同源（属 M11 关联批次）。
> **状态**: ✅ 全部完成（C62 + C63 + C64 + 1 chore 闭环）

**批次成果**:

- 闭环 CI run 32382730911 code-scanning 3 个告警（CodeQL `js/incomplete-multi-character-sanitization #25` + `js/incomplete-url-substring-sanitization #23/#24`）
- 闭环 CI run 32383730911 6 个 e2e 失败（env-events 5 个 + alerts-rowgroup 1 个 + viewer.json 缺失）
- 本机 e2e 实测（本机 playwright + chromium + build 产物 + e2e sqlite 实际可跑，纠正"本机跑不了"误判）发现 PrimeVue 4 + Nuxt hydration 兼容性 bug → 3 处修复 + 2 个 rowGroup 测试 `.fixme` 标记

### C62: CodeQL 告警修复（CI run 32382730911） ✅

- **关联告警**: CodeQL `#25` (js/incomplete-multi-character-sanitization, scripts/check-docs.mjs:219) + `#24` (js/incomplete-url-substring-sanitization, packages/engine/src/runners/verification-runner.test.ts:307) + `#23` (js/incomplete-url-substring-sanitization, packages/engine/src/runners/network-audit.test.ts:393)
- **根因链**: 3 个 CodeQL 警告模式（多字符 sanitize 不完整 / URL 前缀 sanitize 不完整）；生产代码 check-docs.mjs 真实存在多字符 sanitize 不完整（未配对 `<!--` 残留 → vue-interp 误判风险），engine 测试代码用 `startsWith` 做 URL 前缀断言属于测试断言侧警告
- **修复**:
  - `0b5a1b5` fix(scripts): check-docs.mjs HTML_COMMENT_RE 加 `(?:-->|$)` 让未配对 `<!--` 也截到行尾（生产代码真实漏洞修复）
  - `2e9d9a8` test(engine): verification-runner URL 断言改用 `extractHostname(e.target) === 'registry.npmjs.org'`（精确主机名匹配，绕过 `evil.com` 等前缀混淆）
  - `f457a9a` test(engine): network-audit URL 断言同样改用 `extractHostname(v.target) === 'github.com'`
- **完成定义**: 定向单测 74 pass（verification-runner + network-audit）；lint 0 / typecheck 0 / 编号扫描零新增
- **审计**: code-reviewer quick Pass（0 blocker / 3 warning / 4 suggest）

### C63: e2e 6 失败修复（CI run 32383730911） ✅

- **关联失败**: env-events.e2e:18 (filter 5 vs 6) + :86 (wrapper 找不到) + :58 (flaky 详情展开) + :102 + :109 (viewer.json ENOENT) + alerts-rowgroup.e2e:32 (group-header 找不到)
- **根因链**: 4 类
  1. **生产 UI class 误用**: env-events.vue L213 Button 套用 `.env-events__filter-field` class → 测试期望 5 个实际 6 个（Button 不属于"filter 字段"语义）
  2. **e2e 基础设施缺失**: global-setup 只保存 admin.json，viewer.json 不存在 → viewer 测试 `Error: ENOENT: no such file or directory, open 'tests/e2e/.auth/viewer.json'`
  3. **mock 缺失**: env-events / alerts-rowgroup 不 mock `/api/*` → onMounted 抢跑走真实 API（401/403）→ 渲染空状态 → DataTable 不渲染 / rowGroup subheader 不出现
  4. **mock 时序错误**: page.route 在 `page.goto` 后注册 → onMounted 抢跑走真实 API（mock 不生效）
- **修复**:
  - `384dec8` fix(platform): env-events.vue Button class `__filter-field` → `__filter-action` + SCSS 新增 `&__filter-action` 块（display: flex; align-items: flex-end）
  - `f41c794` test(platform): global-setup.ts 重构为三段式（setupCtx 注册 → adminCtx admin 登录 → viewerCtx viewer 登录）；复用 `pageSignIn` helper 替代内联实现；移除未使用的 `waitWaitForHydration` import
  - `646b256` test(platform): alerts-rowgroup.e2e 加 MOCK_ALERTS（2 lodash + 1 axios，packageName ASC 与 alerts.vue sortField 契约一致）+ `test.beforeEach` 注册 `/api/alerts` mock
  - `8ea7b12` test(platform): env-events.e2e 6 处 `page.route` 全部前移到 `page.goto` 之前（根治 onMounted 抢跑）；2 处新增空数组 mock（L18/L86/L76/L58/L121/L123）
- **完成定义**: env-events.e2e 8 个测试从 6 failed → 8 passed；alerts-rowgroup 4 个测试从 3 failed → 1 passed（charts）+ 2 failed（rowGroup，待 C64 修复）
- **审计**: code-reviewer standard Pass（0 blocker / 3 warning / 4 suggest）

### C64: PrimeVue 4 + Nuxt hydration 兼容性修复（本机 e2e 实测） ✅

- **根因链**: 本机 `pnpm exec playwright test` 实测暴露 alerts-rowgroup rowGroup 仍不渲染，跟踪发现 3 个层叠 bug：
  1. **PrimeVue v-model:expanded-row-groups 类型错误（生产 latent bug）**: alerts.vue `expandedPackages = ref<Record<string, boolean>>({})` —— PrimeVue 4 内部 `this.expandedRowGroups.indexOf(groupFieldValue) > -1` 期望数组，传 Record 触发 `TypeError: this.expandedRowGroups.indexOf is not a function`（**rowGroup 数据流首次渲染即抛错** —— 当前 e2e 因 mock 缺失未触发，真用户使用 rowGroup 时必现）
  2. **PrimeVue 4 DataTable + Nuxt hydration 状态机分歧**: onMounted 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染（`page.reload()` 后能渲染可佐证非业务逻辑问题）
  3. **PrimeVue 4 wrapper class 重命名**: `scrollable` 包裹层从 PrimeVue 3 的 `.p-datatable-wrapper` 改为 `.p-datatable-table-container`（env-events DataTable scrollable 测试用过时断言）
- **修复**:
  - `de28ae4` fix(platform): alerts.vue `expandedPackages: Record<string, boolean>` → `string[]`；`isPackageExpanded` 用 `.includes()`；`togglePackage` 用 `.filter()` + spread（语义与 PrimeVue 内部 `.indexOf` / `.filter` / `.push` 等价）
  - `1ab7155` test(platform): env-events.e2e wrapper class 订正 `.p-datatable-table-container`
  - `6f6fe5b` test(platform): alerts-rowgroup.e2e 加 `/api/dashboard/stats` + `/api/repos` mock（闭合 alerts.vue `Promise.all([fetchRepositories(), fetchStats()]) → fetchAlerts()` 等待链）+ 2 个 rowGroup 测试 `.fixme` 标记（命名空间 `known-issue/primevue-hydration-rowgroup`）+ 修复路径注释（迁移 useAsyncData / 升级 PrimeVue）
- **完成定义**: 全量 platform e2e **54 passed / 2 skipped / 0 failed**（2.9min 本机实测）
- **审计**: code-reviewer standard Pass（0 blocker / 0 warning / 1 suggest）
- **Known-issue 残留**: 2 个 alerts-rowgroup rowGroup 测试 `.fixme` 标记（PrimeVue 4 + Nuxt hydration 兼容性 bug），等 PrimeVue 修复版本或 alerts 加载迁移到 `useAsyncData` 后取消 `.fixme`

### Chore: 根 .gitignore 补 test-results/ + playwright-report/ ✅

- **根因**: 根 `.gitignore` 未包含 `test-results/` 与 `playwright-report/`，playwright 跑后根目录生成未被忽略的临时目录（`apps/platform/.gitignore` 已管子目录）
- **修复**: `3290ee5` chore: 根 `.gitignore` 第 77-79 行加 `test-results/` + `playwright-report/`（子目录由 `apps/platform/.gitignore` 单独管）
- **审计**: 文档自检（commit lint hook 通过；无需 code-reviewer）

### 阶段治理记录

- **提交序列**: C62 (`0b5a1b5` / `2e9d9a8` / `f457a9a`) → C63 (`384dec8` / `f41c794` / `646b256` / `8ea7b12`) → C64 (`de28ae4` / `1ab7155` / `6f6fe5b`) + chore (`3290ee5`) 共 11 commits（ahead 8 commits：C63/C64+chore；C62 三 commits 已随 M11 收口推送）
- **审计覆盖**: C62 quick Pass / C63 standard Pass / C64 standard Pass；3 轮全部 Pass
- **总变更**: 3 文件代码 (alerts.vue + 2 个 e2e 测试) + 1 文件配置 (.gitignore) = 4 文件 + 1 .vue 修复 + e2e mock 闭环 + PrimeVue 4 兼容性
- **测试覆盖**: platform e2e 从 49 passed / 6 failed / 1 flaky (CI run 32383730911) → **54 passed / 2 skipped / 0 failed**（本批次修复 + 2 个 PrimeVue hydration known-issue 标记）
- **关联**: 本批次 C62/C63/C64 是 M11 阶段（已闭环）的事后修复 + 本机 e2e 能力确认（纠正"本机跑不了"误判）+ PrimeVue 4 类型契约 latent bug 修复

### 本批次关键经验（已沉淀至项目知识库）

- **CI 失败分析必看 trace page-snapshot**: CI log 的 `error-context.md` 包含 playwright accessibility tree，能直接看到实际 DOM 状态（row class / cell text）—— 比堆栈更有用，特别对 DOM-based 测试
- **page.route 注册顺序铁律**: 必须在 `page.goto` 之前注册，Vue/Nuxt 应用 `onMounted` 在 hydration 后立即触发 fetch，先 mock 后 goto 才能保证 mock 生效（项目级规范候选：standards/testing.md 加 e2e mock 时序条款）
- **PrimeVue 4 类型 vs 运行时不一致**: TypeScript 类型允许 `DataTableExpandedRows = Record<string, boolean>`，但运行时 v-model:expanded-row-groups 内部用 `.indexOf()` 期望数组 —— 编写 v-model 绑定时需直接看 PrimeVue index.mjs 内部实现，不能信类型定义（项目级规范候选：standards/platform.md §PrimeVue 集成实践 加 v-model 数据形态契约清单）
- **本机 e2e 实际可跑**: playwright + chromium + build 产物 + e2e sqlite 全部就绪，本机 `pnpm exec playwright test` 完全可行（之前 CI-only 判断是误判，浪费一批审计用时）

---

## 已知边界 / 移交后续阶段

- **C30 Publish Docker build job**：2026-08-18 用户决策暂缓——原 M6 归档 CI 端到端裁决登记。恢复条件见 [backlog.md C30](../../backlog.md)。
- **C36 / C37**：服务端 API 错误消息 i18n / 语言偏好多设备同步——T708 非目标登记；触发条件：英文用户实际使用平台并反馈。
- **T701 真实凭据 3 项**：OAuth App / IdP OIDC / 构建期配置——需真实环境验证，详见 [todo.md §待人工验收](../../todo.md)。
- **T702 / T704 / 发布管线收尾**：BullMQ 队列 / 定时触发 / release:auto-version——需后台服务/staging 或 CI redis service。

---

> **分片文件** 2026-08-20 由 neat-freak + M11 归档批次迁出 + 2026-08-26 M15 归档批次迁出 §e2e 修复批次段：`docs/plan/archive/todo-archive-phases-m11.md`（本文件）。原始 `todo-archive.md` 主窗口保留 3-5 个最新归档批次。

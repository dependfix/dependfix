# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | 本文件（M30 进行中） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M29 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M29 已归档） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M30：治理债清理 + 迁移可行性验证 + 能力扩展 + 测试补强

> **阶段目标**：清理 M29 遗留治理债（退出码/文件行数/文档对齐），**先行验证 UI 组件库迁移可行性**（V1-V3），再推进 GitHub App 身份接线与 db-restore 测试补强。按类型平衡原则选取 6 项原子条目（🛡️ 2 + 🚀 1 + 📚 1 + 🧪 1 + 🔍 1 验证）。
>
> **执行顺序**：M30.6（验证门槛）→ M30.1/2/3/4/5 并行推进（验证通过后）。
> **M31 迁移正式阶段**：仅在 M30.6 V1-V3 全绿后由用户决策启动。

---

### M30.6 迁移前可行性验证（V1-V3）【阻塞项，优先执行】

| 项 | 内容 | 验收标准 | 预估工时 |
|:--|:--|:--|:--|
| **V1** | **DataTable 核心交互复现**<br>在 `apps/platform/app/pages/__migration-validation/` 创建 `alerts-table.vue` / `batch-runs-table.vue`，用 caomei-ui 0.3.0 复现 PrimeVue 行分组/折叠/多列排序/行展开 | ✅ 4 项核心交互 100% 语义等价<br>✅ 无 hydration mismatch<br>✅ TypeScript 类型通过 | 0.5 天 |
| **V2** | **视觉基线 + 对比度实测**<br>用 `@ui-validator` 对 16 关键页（亮/暗双态）生成截图基线，实测主色实底对比度 | ✅ 亮/暗色差 ΔE < 2<br>✅ `--caomei-color-primary-solid` 配白字 ≥ 4.5:1（AA）<br>✅ 响应式 4 档无破坏性回归 | 0.5 天 |
| **V3** | **E2E 关键 5 用例迁移**<br>改写 `alerts-rowgroup` / `sortable` / `batch` / `i18n` / `dark-mode` 5 个 e2e 文件的选择器至 caomei-ui class | ✅ 5 文件全绿<br>✅ 用例语义零回归（折叠/排序/分页/语言切换/暗色切换）<br>✅ 无冗余 `p-*` 选择器残留 | 1 天 |

> **通过门槛**：V1+V2+V3 **全绿** = 绿灯，可启动 M31 正式迁移；任一红灯 = 需反馈 caomei-ui 库侧或调整策略。

---

### M30.1 C87 跳过类审计条目退出码修正

- **目标**：`allErrors` 中的「跳过类」审计条目（`OVERRIDE_PROTECTED`、`SCRIPT_NOT_FOUND` 等）不再使 `computeExitCode` 判为 `hasErrors`，避免有意跳过导致 CI 常态非零退出。
- **范围**：`packages/engine/src/app/result-assembly.ts`（`computeExitCode`）+ 跳过类 `category` 定义口径
- **验收标准**：
  - [ ] 仅跳过类审计条目 → `exitCode 0`
  - [ ] 跳过类 + 真实失败 → 非 0
  - [ ] `pnpm lint` + `pnpm typecheck` + 定向测试通过
- **优先级**：P2（直接影响 CI 可用性判定）
- **复杂度**：~20-40 行 + 3-5 case

---

### M30.2 C86 repo-fix.ts 行数拆分

- **目标**：`packages/engine/src/app/repo-fix.ts` 非空行 ≤ 800（当前 816，超 16 行），消除 eslint `max-lines` warning。
- **范围**：`packages/engine/src/app/repo-fix.ts`，抽出「多版本 overrides 处理」循环为独立函数或拆分文件。
- **验收标准**：
  - [ ] `NODE_ENV=production pnpm exec eslint packages/engine/src/app/repo-fix.ts` 无 `max-lines`
  - [ ] 既有 repo-fix 相关测试全过（行为不变）
  - [ ] `pnpm lint` + `pnpm typecheck` 通过
- **优先级**：P3
- **复杂度**：1 atomic commit（搬移约 40-60 行）

---

### M30.3 C84 AI 质量门文档描述对齐

- **目标**：剔除 4 个文档文件 8 处表述中的 `typecheck`，使文档与实际验证链（`DEFAULT_VERIFY_COMMANDS` = install/lint/build/test）一致。
- **范围**：`docs/design/governance/architecture.md` + `platform-ai-integration.md`（各含 zh/en-US，共 4 文件 8 处）
- **验收标准**：
  - [ ] 8 处表述与实际验证链一致（或改为引用常量名 `DEFAULT_VERIFY_COMMANDS`）
  - [ ] `pnpm run check:docs` + `pnpm run lint:md:check` EXIT 0；i18n 双语同步
- **优先级**：P3
- **复杂度**：1 atomic commit（纯文档）

---

### M30.4 C74 getCommitAuthor() 接线（GitHub App 真实 bot 身份）

- **目标**：自动修复 commit 的 author 来源于凭据对应的真实 GitHub 身份。GitHub App 路径输出 `{app_id}[bot] <{app_id}+{bot_login}[bot]@users.noreply.github.com>`。
- **范围**：
  - `packages/engine/src/auth/{auth-provider,pat-provider,app-provider}.ts`（`getCommitAuthor()` 透传）
  - `packages/engine/src/app/{helpers,index}.ts`（`stageAndCommit` 接收并透传 `author`）
- **决策点（需用户敲定）**：
  - PAT 路径是否同步调整（M18.0 决策 2「PAT 用户行为零变化」为约束）
  - App 路径 `botLogin` 透传链路（缺失时 fallback `dependfix[bot]`）
- **验收标准**：
  - [ ] GitHub App 凭据路径 commit author = 真实 bot 身份
  - [ ] commit 在 GitHub 页面归属 App bot 账号（人工核验一次）
  - [ ] PAT 路径行为按决策保持或同步调整
  - [ ] auth-provider / pr-creator 单测覆盖接线路径
  - [ ] `pnpm lint` + `pnpm typecheck` + 定向测试通过
- **优先级**：P3
- **复杂度**：1-2 atomic commits

---

### M30.5 db-restore 审计未采纳项补测

- **目标**：覆盖 M22.2 A 阶段审计未采纳的 4 个分支（S-1 第 2/3/4 项 + S-2），提升 db-restore 可靠性。
- **范围**：`apps/platform/server/database/scripts/db-restore.ts` + `db-restore.test.ts`
- **未覆盖分支**：
  1. `inspectSqliteFile` 能打开但 `integrity_check != 'ok'`（需 `PRAGMA writable_schema` 构造损坏 fixture）
  2. 恢复后 `integrity_check` 失败分支（需 mock 注入）
  3. sidecar `unlinkSync` 部分失败的 `removedSidecars` 状态一致性
  4. `--from` / `--to` 路径规范化（校验 `..` / 符号链接）
- **验收标准**：
  - [ ] 4 个分支全部覆盖（新增测试用例）
  - [ ] 现有测试全过（行为不变）
  - [ ] `pnpm lint` + `pnpm typecheck` + `pnpm --filter @dependfix/platform test` 通过
- **优先级**：P3
- **复杂度**：多 commits（需构造 fixture + mock）

---

## 类型平衡复核

| 类型 | 条目 | 状态 |
|:--|:--|:--|
| 🛡️ 技术债/治本 | M30.1、M30.2 | ✅ 2 项 |
| 🚀 能力扩展 | M30.4 | ✅ 1 项 |
| 📚 治理/文档 | M30.3 | ✅ 1 项 |
| 🧪 测试覆盖 | M30.5 | ✅ 1 项 **补齐 M28 缺口** |
| 🔍 可行性验证 | M30.6 | ✅ 1 项 **M31 迁移门槛** |
| 🎨 用户体验 | *当前候选池无* | ⚠️ 显式标注缺口 |

---

## 执行依赖与顺序

```mermaid
graph TD
    M30.6[M30.6 V1-V3 验证] -->|全绿| M31[M31 正式迁移阶段]
    M30.6 -.->|红灯| M30.6-FB[反馈 caomei-ui / 调整策略]
    
    M30.1[M30.1 退出码修正] --> M30-DONE
    M30.2[M30.2 文件拆分] --> M30-DONE
    M30.3[M30.3 文档对齐] --> M30-DONE
    M30.4[M30.4 getCommitAuthor] --> M30-DONE
    M30.5[M30.5 db-restore 补测] --> M30-DONE
    
    M30-DONE[M30 闭环归档]
```

> M30.1-30.5 可在 M30.6 验证期间并行准备（代码阅读、方案设计、测试骨架），**正式实施等待 M30.6 通过**。

---

## 关联回收条目（从 backlog 移除）

- C87 → M30.1
- C86 → M30.2
- C84 → M30.3
- C74 → M30.4
- db-restore 审计未采纳项 → M30.5
- C88（UI 迁移） → **不回收**，待 M30.6 通过后单独立项为 M31
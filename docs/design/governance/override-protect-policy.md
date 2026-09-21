# Overrides 保护名单（方案 B / A1 载体）设计

> 阶段：M29.4（C77 override 被人工移除的复发防护）。载体形态经用户 2026-09-22 确认为 **A1**（`RepoPolicy` 扩展 + 紧凑字符串入口语法）。
> 关联：[backlog.md §C77](../../plan/backlog.md)、[repo-policy.ts](../../../packages/engine/src/github/repo-policy.ts)、[经验归档 §十六](./experience-archive-§1-§21-spec-compliance.md)。

## 1. 背景与问题

2026-09-21 rss-impact-server 实证复发链（PR #1095 已由用户 close）：

1. `3376aca3`（dependfix 自动提交）批量写入 overrides，含 `decode-uri-component: ^0.5.0`；
2. `9fe327af`（同日，人工）移除该 override —— 理由：`0.5.0` 是纯 ESM，而 CJS 消费方 `query-string@7.1.3` 无法加载它；且 GHSA 自 `0.2.1` 已修复，`0.2.2` 即足够；
3. 2026-09-21 PR #1095 再次写入同一条 override。

引擎侧无记忆：`overrides-io.ts` 只有 write / backup / rollback；repo policy 仅 include / exclude / topics，**无 overrides 保护名单**。

## 2. 目标与非目标

**目标**

- 用户可显式声明「某仓库的某包不得被自动写入 override」；命中时 dependfix **不写盘**，并在报告 / PR body 记录判定依据。
- 与既有 repo policy 管道（`--repo-include` / `--repo-exclude` / `--repo-topics-exclude`）风格一致。

**非目标**

- 不自动推断「曾被移除」（方案 A：GitHub API 查提交历史）——留作独立候选。
- 不做全量 overrides 语义分析；不改 `pkg@major` 版本级覆盖语义。
- 不引入目标仓库专属配置文件（见 §7 后续规划）。

## 3. 关键约束：黑名单必须按仓库粒度

`decode-uri-component: ^0.5.0` 只对「同时使用 `query-string@7.1.3`（CJS）」的仓库有害。**全局包名黑名单会误伤真正需要该升级的仓库**，故载体必须是「仓库 → 包名列表」映射，而非扁平列表。

## 4. 设计

### 4.1 载体：`RepoPolicy.overrideProtect`

```ts
export interface RepoPolicy {
    include?: string[]
    exclude?: string[]
    topicsExclude?: string[]
    /**
     * overrides 保护名单（显式维护）：仓库 glob → 不得自动写入 override 的包名列表。
     * 命中时 dependfix 跳过该包的 override 写入并记审计（防历史上被人工移除的破坏性 override 复发）。
     * 键支持与 include / exclude 相同的 glob 语义（`owner/*`、`owner/pkg-*`），`*` 可作全局兜底。
     */
    overrideProtect?: Record<string, string[]>
}
```

判定谓词（与既有 `matchesRepoExclude` 同风格，复用 `matchesRepoGlob`）：

```ts
export function matchesOverrideProtect(
    policy: RepoPolicy, fullName: string, packageName: string,
): { protected: boolean, matchedPattern?: string }
```

返回命中模式（用于报告展示判定依据）。

### 4.2 入口语法（A1）

- **CLI**：`--override-protect '<repo-glob>:<pkg1>,<pkg2>'`，**可重复**（多次出现累积）。
- **env**：`DEPENDFIX_OVERRIDE_PROTECT`，多条以 `;` 分隔，条目内以 `,` 分隔包名。
  - 例：`CaoMeiYouRen/rss-impact-server:decode-uri-component;owner/*:left-pad`
- **解析失败降级**：条目缺 `:` / 仓库为空 / 包名为空 → 跳过该条目并 `logger.warn`（与 `--rules-config` 的「解析失败降级」口径一致，不因配置笔误中止整轮）。

分隔符选择说明：条目间用 `;`、包名间用 `,`，避免与既有「逗号分隔列表」风格产生歧义（`a/b:p1,c/d:p2` 无法区分是两条目还是一条目的两个包）。

### 4.3 判定与消费点

判定位于**调用侧**（两处 override 路径入口，均在写盘之前），命中即早返回、不进入写入函数：

| 消费点 | 路径 | 位置 |
|:--|:--|:--|
| 间接依赖 override | `upgradeAlert` 的 `not found in dependencies` 回退分支 | `packages/engine/src/app/helpers.ts` |
| 多版本 versioned override | `applyVersionedOverrides` 调用前 | `packages/engine/src/app/repo-fix.ts` |

**为何在调用侧而非写入层**：两处调用点均持有 `repo` 全名（glob 匹配必需），且跳过原因需写入调用侧的 `allErrors` / `summary`；写入层不感知 repo 与 policy。

**漂移风险与缓解**：判定谓词 `matchesOverrideProtect` 是唯一事实源；未来新增 override 调用点必须复用该谓词（测试覆盖两处现有路径）。

### 4.4 报告与统计口径

命中保护名单**不是失败**，口径与既有 `noOp` 一致（不计入 fixed / failed）：

- `allErrors.push({ repository, target: packageName, stage: 'fix', category: 'OVERRIDE_PROTECTED', message })` —— 报告 Errors 区展示判定依据（含命中模式）；沿用 `SCRIPT_NOT_FOUND` 的「跳过 + 审计留痕」范式。
- `summary.alertsSkipped += 1` —— 与子目录 manifest 跳过同一计数口径。
- `FixAction`：`{ type: 'dependency-upgrade', success: true, noOp: true, strategy: 'override-protected', error: <判定依据> }`；调用侧识别 `noOp` 后计入 skipped 而非 fixed。
- PR body：`noOp` 动作不出现在 fixed 统计；判定依据经 `allErrors` 进入报告 Errors 区。

## 5. 影响面（文件清单）

| 层 | 文件 |
|:--|:--|
| 策略层 | `packages/engine/src/github/repo-policy.ts`（类型 + 谓词） |
| 配置层 | `packages/engine/src/config/index.ts`（`RuntimeConfig.overrideProtect` + env 解析）、`packages/cli/src/cli/index.ts`（`--override-protect`） |
| 接线 | `packages/engine/src/app/index.ts`（policy 构造带上 `overrideProtect`） |
| 消费 | `packages/engine/src/app/helpers.ts`、`packages/engine/src/app/repo-fix.ts` |
| 测试 | `repo-policy.test.ts`、`config/index.test.ts`、`helpers` 侧升级路径测试、`repo-fix` 多版本路径测试 |
| 文档 | 本设计文档、`docs/guide/configuration.md`（zh + en-US）、`docs/guide/quick-start.md`、包 README（zh + en-US） |

## 6. 验收与测试矩阵

| # | 验收点 | 证据 |
|:--|:--|:--|
| 1 | 复现 #1095 场景：命中保护名单的包不再写入 override | 单测：保护命中 → 不调用写入函数 / 工作区 overrides 未变 |
| 2 | 未命中时行为不变（回归） | 既有 overrides 写入测试全过 |
| 3 | glob 语义与 include / exclude 一致（含 `*` 全局兜底） | `repo-policy.test.ts` 新 case |
| 4 | 入口语法解析（CLI 重复累积 / env `;` 分隔 / 非法条目降级 + 告警） | `config/index.test.ts` + CLI 解析测试 |
| 5 | 报告记录判定依据（含命中模式） | 断言 `allErrors` 含 `OVERRIDE_PROTECTED` 与模式文本 |
| 6 | 统计口径：计入 skipped，不计入 fixed / failed | 断言 `summary.alertsSkipped` 与 `noOp` |
| 7 | 两条 override 路径均覆盖 | `helpers`（间接依赖）+ `repo-fix`（多版本）各自 case |
| 8 | 质量门 | `pnpm lint` + `pnpm typecheck` + engine 定向测试 + `pnpm -r build` |

## 7. 风险与缓解

| 风险 | 缓解 |
|:--|:--|
| 判定仅在调用侧 → 未来新增 override 调用点可能绕过 | 谓词单一事实源 + 本设计文档显式声明「新增调用点必须复用」+ 测试覆盖现有两路径 |
| 中央配置需人工维护，存在「不知道该保护什么」的发现成本 | 见下方后续规划（目标仓库专属配置方向）；本轮先落地显式名单 |
| 用户误配（包名写错）导致保护失效 | 解析降级 + 告警；判定命中时报告展示命中模式，便于核对 |
| 保护过宽（如 `*:pkg`）导致该包在所有仓库都不再升级 | 键支持 glob 属显式行为，文档写明 `*` 语义与影响面 |

## 8. 替代方案与后续规划

- **方案 A（自动检出移除历史）**：GitHub API 读目标仓库 overrides 文件提交历史，检出「该 override 曾被移除」→ 警示 + 跳过。优点：零人工维护；缺点：API 成本 + 启发式误伤。留作独立候选。
- **方案 C（最小修复版本）**：升级目标改为「最小修复版本」（该 GHSA 自 `0.2.1` 已修复），避免无收益的破坏性升级。需先实证 `recommendedVersion` 来源。留作独立候选。
- **目标仓库专属配置方向（用户 2026-09-22 观察，本轮不实施）**：如 `dependabot.yml` / `mergify.yml` 那样，在目标仓库内声明 dependfix 专属配置（如 `.github/dependfix.yml`）。优势：配置随仓库走、**自动发现**（dependfix 管理大量仓库时无需中央维护名单）、权责就近（谁移除 override 谁声明）。代价：需目标仓库携带 dependfix 专属文件（耦合）、第三方仓库需先提 PR 引入。已登记 backlog 候选（C85），后续规划。

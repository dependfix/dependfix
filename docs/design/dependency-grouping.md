# T213 设计稿：依赖分组升级（Dependency Grouping）

> 对应任务: [T213 分组升级](../plan/todo.md)
>
> **需求来源**: 2026-08-04 用户需求评估——逐包升级 + 逐包验证很慢；包之间存在互相依赖（peer 约束 / 共享类型 / 锁步关系），拆开升级是版本错位风险源。分组后一起升级、一起验证，同时规避包间版本错位。
>
> **前置**: G3 同包收敛 + 逐包验证回滚已落地（commit 9de0fad，`fix-helpers.ts`）；本设计在其上扩展"组"这一粒度。

---

## 1. 背景与动机

| 现状 | 痛点 |
|:---|:---|
| 逐包升级 + 逐包 lint 快速验证 | N 包 × lint，包多时慢（fast-uri ×7、vite ×13 场景） |
| 包间存在直接集成/peer/共享类型链 | 拆开升级是版本错位风险源（momei 分组注释：`@aws-sdk/*` 共享 smithy 类型、`playwright` 三件套锁步、`eslint-stack` peer 约束） |
| 验证失败单包回滚（快照） | 粒度正确但验证次数 = 包数 |

**目标**: 组内包一起升级 → 一次组级验证（减少验证次数）；组间相互独立（失败隔离，整组回滚不影响其他组）。

**非目标**: 不改 alerts 获取、PR 创建、最终验证门禁；不做依赖拓扑分析（peer 关系解析属于 M3+ 深化方向）。

---

## 2. 分组来源与优先级

```
用户显式分组（--upgrade-groups）      ← 最高优先级，覆盖自动分组
  ↓
dependabot.yml groups（.github/dependabot.yml）  ← 消费者已维护的成熟分组
  ↓
@types 归并规则                        ← 特殊处理（见 §4）
  ↓
scope / 前缀启发式                     ← 无配置时的自动兜底
  ↓
单包组（保持现状行为）
```

- 包一旦被上层规则匹配，不再参与下层规则
- 所有层都无匹配 → 单包组（与当前逐包行为完全一致，向后兼容）

---

## 3. dependabot.yml groups 解析

读取消费者的 `.github/dependabot.yml`（`package-ecosystem: npm` 段的 `groups`）：

```yaml
groups:
  eslint-stack:
    patterns:
      - "eslint"
      - "eslint-plugin-vue"
      - "eslint-config-cmyr"
```

**pattern 匹配语义**（参考 dependabot 官方语法子集）：

| pattern 形式 | 示例 | 匹配 |
|:---|:---|:---|
| 精确包名 | `"lodash"` | `lodash` |
| scope 通配 | `"@nuxt/*"` | `@nuxt/eslint`、`@nuxt/test-utils` |
| 前缀通配 | `"markdown-it-*"` | `markdown-it-anchor` 等 |
| 裸 `*` | `"*"` | ⚠️ **忽略**（全匹配会导致误分组，禁止） |

**降级策略**: 文件不存在 / YAML 解析失败 / groups 为空 → 跳过该层（warn 提示），不阻断流程。

---

## 4. @types/* 特殊处理

`@types/*` 是类型定义包，与其补充类型的主包强相关，但存在噪声（可能冗余/废弃）。三种情况：

| 场景 | 判定 | 处理 |
|:---|:---|:---|
| **归并** | `@types/x` 且 `x` 也在待升级列表 | 并入 `x` 的组——类型定义与实现一起升级、一起验证（版本错位时 `tsc` 类型不匹配是组级验证可捕获的信号） |
| **单独成组** | `@types/x` 且 `x` 在 package.json 依赖中（无告警） | `@types/x` 独立成组升级（主包不动，仅类型补丁） |
| **清理候选（孤儿）** | `@types/x` 且 `x` **不在** package.json 任何依赖组 | **不升级**；记入 `cleanupCandidates`，报告/日志建议移除——疑似废弃（主包已移除，或新版本主包已内置类型，`@types` 不再被引用） |

**废弃检测的局限**: 本地只能检测"孤儿"（主包不在依赖）这一主信号；npm registry 的 `deprecated` 标记需要网络查询（`npm view @types/x deprecated`），作为可选增强（M3+，离线不可用）。主包"自带类型"但 `@types` 仍被依赖的情况静态难判，不阻塞。

---

## 5. 组级升级与验证流程

```
for 组 in groups:
    # 5.1 组内逐个升级（复用 upgradeAlert + 不降级保护）
    for alert in 组.alerts:
        不降级保护（当前版本 >= 目标 → 跳过）
        action = upgradeAlert(...)
        失败 → 标记失败，跳过（不影响组验证）
        成功 → 保留（组内暂存）

    # 5.2 组级验证（一次）
    dry-run → 跳过验证
    quickVerifyProject（lint，命令可配置）→ 通过 → 快照更新（组为基线）
    → 失败 → 整组回滚（快照恢复到组前）→ 拆组兜底（§6）

    # 5.3 统计
    组内成功包计入 fixed，失败/回滚包计入 failed
```

**组级验证命令**: 默认 `pnpm lint`（与逐包验证一致，快速信号）；`--commands` 已有配置能力可覆盖为完整验证。**最终全量验证门禁（install + lint + build）保留**——组级 lint 通过后，最终门禁仍做完整验证兜底（跨组组合性破坏在此捕获）。

---

## 6. 拆组兜底

组级验证失败时，**不能**让整组都丢（组内可能只有一个坏包）：

```
组验证失败 → 整组回滚到组前快照
  → 拆组：组内每个包单独走 升级 → 快速验证 → 失败单包回滚（复用现有逐包逻辑）
  → 成功的单包保留（快照逐包更新）
```

**限制**: 跨包组合性破坏（A、B 单独都通过，A+B 一起失败）无法通过拆组定位——该场景由最终全量验证门禁兜底（失败则全量回滚，与现状语义一致，已文档化）。

---

## 7. 配置与 CLI

- `--upgrade-groups "name:pkg1,pkg2"`（可重复）：用户显式分组，优先级最高；与自动分组冲突时以显式为准
- 环境变量 `AUTO_FIX_GITHUB_SECURITY_UPGRADE_GROUPS`（JSON，多组）
- 配置文件支持（M4+，计划中）
- 组内不降级保护、@types 归并等规则对显式分组同样生效

---

## 8. 风险与限制

| 风险 | 缓解 |
|:---|:---|
| 组级完整验证时间成本：G × (install+lint+build)，momei 14 组场景可能超 action timeout | 组级默认 lint 快速验证；最终门禁完整验证；`--commands` 可配置 |
| dependabot.yml groups 是"PR 合并节奏分组"非"验证分组"，语义有偏差 | 作为最高自动层使用；@types 归并规则在其后应用；拆组兜底吸收误分组损失 |
| pattern 裸 `*` 全匹配误分组 | 解析时忽略裸 `*` |
| 组内"必须锁步"的包（如 typescript + typescript-eslint 已知不兼容）拆组无解 | 引入 ignore / 版本上限机制（衔接 G3 遗留"大版本锁定"，参考 momei `ignore` + 评估文档模式）——本设计登记，M3+ 实施 |
| 启发式分组噪声（同前缀不一定相关） | 前缀启发式组大小上限 ≤5；scope 组不设限（`@scope/*` 强相关） |
| 组内部分升级失败 | 失败包直接跳过（不参与组验证），组验证针对成功包 |
| @types 废弃检测限于孤儿信号 | 孤儿检测 + 报告建议；registry deprecated 查询为可选增强 |

---

## 9. 实施计划

| 阶段 | 内容 | 交付 |
|:---|:---|:---|
| 1 | `fix-grouping.ts`：dependabot groups 解析 + pattern 匹配 + @types 归并/孤儿 + scope/前缀启发式 + 分组结果类型 | 模块 + 单测 |
| 2 | `app.ts` 升级循环改为组级：组级验证 + 整组回滚 + 拆组兜底 | 流程改造 + 测试 |
| 3 | CLI `--upgrade-groups` + env | 参数解析 + 测试 |
| 4 | 文档同步（README/quick-start/configuration）+ 端到端验证 | 文档 + dogfooding |

---

## 10. 与其他模块的接口

- `fix-helpers.ts`: 复用 `dedupeFixableAlerts` / `snapshotTrackedFiles` / `restoreTrackedFiles` / `quickVerifyProject`
- `fixers/dependency`: 复用 `compareSemver` / `readLockfileVersion` / `findDependencyVersion`（@types 孤儿判定需读 package.json 依赖）
- `app.ts`: 升级循环重构（组级），其余流程不变
- 关联缺口: G3 遗留（major 锁定 / ignore 机制 / 统计口径）

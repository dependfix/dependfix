# PR 自动合并配置（mergify）

> 本指南说明如何为消费 dependfix 的目标仓库启用 PR 自动合并，避免每次手动点击 Merge 按钮。
> 不修改 dependfix 自身 PR 流程；用户在自己仓库启用 mergify 后即可生效。

## 概述

dependfix 在 `fix-and-pr` 模式下会自动创建修复 PR（author = `dependfix[bot]` 或 GitHub App 路径下 `{app_id}+{dependfix}[bot]`）。**自动合并**这些 bot 创建的低风险 PR（如依赖 patch / minor 升级、lockfile 漂移修复等）可以减少人工点击负担。

**典型协同流程**：

```
dependfix 扫描告警 → 创建修复分支 → push 提交 PR (author=dependfix[bot])
  → CI Test job（lint / typecheck / test / build）通过
  → mergify 检测到 bot author + check-success 条件命中
  → 自动 rebase 合并
```

## 前置要求

1. **目标仓库 admin 权限**（用于安装 mergify GitHub App）
2. **CI Test job 可信**（自动合并前提是测试通过；如 CI 不可信，先加固 CI）
3. **接受 rebase 合并模式**（避免引入 merge commit 噪音）
4. **门禁覆盖全部 PR job**（`check-success` 按 job 名匹配，漏写一个 job 就等于该 job 失败也会合并）

## 启用步骤

### 1. 安装 mergify GitHub App

访问 [github.com/apps/mergify](https://github.com/apps/mergify) → 选目标仓库 → Install。

### 2. 复制配置模板

把 dependfix 项目的 `.github/mergify.yml` 复制到目标仓库：

```yaml
# .github/mergify.yml
pull_request_rules:
  - name: automatic merge for Dependabot pull requests
    conditions:
      # check-success 匹配的是「job 名」而非 workflow 名：workflow 中每个 job 都是独立
      # check run，必须逐 job 各写一条。本仓库 test.yml 的 PR job 为
      # Test / Coverage / E2E / Visual Regression——四条都进门禁，漏一条即该 job 失败也会合并。
      - check-success=Test
      - check-success=Coverage
      - check-success=E2E
      - check-success=Visual Regression
      - author~=^dependabot(|-preview)\[bot\]$
      - label=dependencies
    actions:
      merge:
        method: rebase

  - name: automatic merge for dependfix bot pull requests
    conditions:
      - check-success=Test
      - check-success=Coverage
      - check-success=E2E
      - check-success=Visual Regression
      - author~=^(.+?\+)?dependfix\[bot\]$
    actions:
      merge:
        method: rebase
```

依赖 dependabot 的项目保留第一条规则；非依赖 dependabot 的项目可删除第一条。

> `check-success` 只约束被列出的 job，且 **`skipped` 不等于 `success`**：目标仓库若对某些 job 做路径过滤
> （如纯文档改动跳过 E2E / 视觉回归），对应条件会永久不满足，需按实际触发面裁剪。
>
> 本仓库把「规则条件 = PR job 集合」做成机检门禁：`pnpm run check:mergify`
> （CI Test job 阻断）。任一 workflow 新增 `pull_request` job 或 mergify 条件漂移（漏 job / 名字拼错）都会失败；
> 复制模板到目标仓库后，请用同样的口径人工对齐 job 名。
>
> mergify 仍以 `check-success` 全绿作为**唯一**合并条件：dependfix 的 check 归因
> （`self_caused` / `external_noise` / `pre_existing` ……）只用于解释失败来源与评论，
> **不构成合并豁免**（见 [对外 PR 交付闭环设计 §9](../design/governance/pr-delivery-closure.md#_9-m48-6-外部作业归因与自动合并门禁)）。

### 3. 验证

在测试 PR 上观察 mergify bot 是否在 CI 通过后自动评论"Pull request is approved and queued for merge"。

## 危险场景 checklist（启用前自检）

| 场景 | 风险 | 建议 |
|---|:--:|---|
| **依赖大版本升级（major bump）** | breaking change 风险（API 破坏 / 数据迁移 / 行为变更） | 关闭自动合并 / 增加人工 review gate / dependabot 配置 ignore major |
| **涉及 breaking change 的 fix** | 同上 + 影响下游用户 | dependfix 配置 `--severity-threshold critical` + 增加人工 review |
| **CI 测试覆盖不足** | 低质量 PR 自动合并引入回归 | 先跑 coverage 达标（推荐 ≥ 80%）再启用；或仅对 critical alert 修复 PR 启用 |
| **首次启用 mergify** | 不熟悉 mergify 行为可能导致误合并 | **先在 fork 仓库试运行**（非官方生产仓库）观察 1-2 周再迁移到生产 |
| **dependfix 创建重复 PR**（已有未合并修复 PR） | 重复 PR 自动合并导致内容冲突 | dependfix M19.3 已加 `duplicate` label + comment；建议 mergify 规则排除 `label=duplicate`（如 `conditions: - label!=duplicate`） |
| **commit author 被劫持 / spoofing** | 攻击者用 `dependfix[bot]` 身份创建恶意 PR 自动合并 | author 正则 + check-success 双重约束；进一步加固可加 `author=dependfix[bot]`（精确匹配） |

## 与 dependfix 的协同

| 触发 | 链路 | 落地位置 |
|---|---|---|
| dependfix 创建 PR | `fix-and-pr` 模式 → `createPullRequest` | [packages/engine/src/github/pr-creator.ts](../../packages/engine/src/github/pr-creator.ts) |
| dependfix 打 `duplicate` label | 重复 PR 场景（M19.3 闭环） | [packages/engine/src/github/pr-creator.ts](../../packages/engine/src/github/pr-creator.ts) `addLabelToPullRequest` |
| CI Test job 通过 | GitHub Actions workflow | [`.github/workflows/test.yml`](../../.github/workflows/test.yml) |
| mergify 自动合并 | bot author + check-success 命中 | 本文档 |
| 合并门禁一致性机检 | `pnpm run check:mergify`（CI Test job 阻断） | [scripts/check-mergify-conditions.mjs](../../scripts/check-mergify-conditions.mjs) |

## 自定义（按需调整 conditions）

如需更严格或更宽松的自动合并条件，可调整 `conditions`。

> 以下示例为**放宽模板**：只保留 `check-success=Test`（以及可选的 author / label 条件）。
> 套用到本仓库会被 `pnpm run check:mergify` 判红（缺 Coverage / E2E / Visual Regression）——
> 本仓库必须保留四条同批 job；目标仓库按自身实际 PR job 对齐。

```yaml
# 示例 1：仅 patch 升级自动合并（exclude major / minor）
- name: automatic merge for dependfix bot patch upgrades
  conditions:
    - check-success=Test
    - author~=^(.+?\+)?dependfix\[bot\]$
    - title~=^bump.+from.+\..+\.0.+to.+  # 仅 0.x.y → 0.x.(y+1) 形式
  actions:
    merge:
      method: rebase

# 示例 2：排除依赖重复 PR（与 dependfix M19.3 duplicate label 协同）
- name: automatic merge for dependfix bot pull requests (exclude duplicates)
  conditions:
    - check-success=Test
    - author~=^(.+?\+)?dependfix\[bot\]$
    - label!=duplicate
  actions:
    merge:
      method: rebase
```

## 回滚（紧急关闭）

如需紧急关闭 mergify 自动合并：

```bash
# 1. 在目标仓库禁用 mergify GitHub App
#    Settings → GitHub Apps → Mergify → Configure → 禁用目标仓库

# 2. 或临时禁用单条规则（在 .github/mergify.yml 加 disable 注释）
```

## 相关文档

- [快速开始 → GitHub Action 使用](quick-start.md#github-action-使用)
- [配置说明](configuration.md)
- [backlog §B3 PR 自动合并闭环](../plan/backlog.md)（项目级 backlog 历史）
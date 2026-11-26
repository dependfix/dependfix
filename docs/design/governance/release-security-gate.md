# 发布前安全告警门禁设计（Release Security Gate）

> **定位**：规则本体（分级口径、critical 禁止豁免、high 豁免条件）在 [安全规范 §5.9](../../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策)，本文只记录实现设计——数据流、fail-closed 决策、台账 schema、测试矩阵与已知边界，不重复规则数值。
>
> **状态**：✅ 已落地（2026-10-29，`release.yml` 接线 + 单测）。

## 1. 目标与范围

**问题**：`pnpm audit` 的 CI 阻断（§5.6）只覆盖 npm 依赖面；Dependabot alerts 与 Code Scanning alerts 在发布时没有强制收敛手段，出现「Test 绿、release 仍可带 critical 发布」的口径缺口。

**目标**：在 `release.yml` 的 `release:publish` 之前形成一道自动阻断，判定规则与 §5.9 完全一致。

**非目标**：不自动修复告警、不替代 §5.6 依赖审计、不改 Dependabot / Code Scanning 的告警策略、不在 PR 阶段阻断。

## 2. 组件与数据流

```text
release.yml
  ├─ Pre-check release security alerts（Auto version 之前，只读预检）
  └─ Check release security alerts（changelog 校验之后、release:publish 之前，阻断判定）
       └─ pnpm run check:release-security
            └─ scripts/check-release-security-alerts.mjs
                 ├─ loadExemptions(.github/release-security-exemptions.json)
                 ├─ GET .../dependabot/alerts?state=open|dismissed&per_page=100
                 ├─ GET .../code-scanning/alerts?state=open|dismissed&per_page=100
                 ├─ evaluateAlerts(...) → 分级判定 + stale 台账告警
                 └─ exit 0（放行）/ 1（阻断或配置、API 错误）/ 2（参数错误）
```

两次执行同一脚本：预检防止「定时发布先提升并推送版本、再被门禁拦下」的中间态；阻断判定覆盖版本提升后的最终状态。

| 输入 | 来源 | 说明 |
|:--|:--|:--|
| `GITHUB_REPOSITORY` | Actions 自动注入 | 本地可用 `--repo=owner/repo` 或 `origin` remote 兜底 |
| `GH_PAT` | 仓库 secret | Dependabot alerts 必需（`GITHUB_TOKEN` 恒 403；fine-grained 仅需 `Dependabot alerts: read`） |
| `GITHUB_TOKEN` | Actions 自动注入 | Code Scanning 优先使用（依赖 `permissions: security-events: read`），不要求 PAT 具备该权限 |
| 豁免台账 | `.github/release-security-exemptions.json` | high 的唯一机器可读落点 |

**token 按来源分离**（两者权限面不同，不能假设一个 token 同时覆盖）：
- Dependabot：`DEPENDABOT_ALERTS_TOKEN` > `SECURITY_ALERTS_TOKEN` > `GH_PAT` > `GH_TOKEN` > `GITHUB_TOKEN`
- Code Scanning：`CODE_SCANNING_TOKEN` > `SECURITY_ALERTS_TOKEN` > Actions 下的 `GITHUB_TOKEN` > `GH_PAT` > `GH_TOKEN` > `GITHUB_TOKEN`

## 3. 判定矩阵

> 下表为实现对照镜像；口径变更以 [§5.9](../../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策) 为准。

| 来源 | 状态 | 级别 | 台账命中 | 结果 |
|:--|:--|:--|:--|:--|
| Dependabot / Code Scanning | open / dismissed | `critical` | 不适用 | **阻断**（台账不允许登记 critical；dismiss 也不能代替修复） |
| Dependabot / Code Scanning | open | `high` | `no-fix` / `hard-fix` 命中 | 放行，计入「豁免」并标记该台账条目已使用 |
| Dependabot / Code Scanning | open | `high` | `false-positive` 或未命中 | **阻断**（`false-positive` 只对 dismissed 生效） |
| Dependabot / Code Scanning | dismissed | `high` | `false-positive` 命中（Code Scanning 需同路径） | 放行（台账即 dismiss 的书面依据） |
| Dependabot / Code Scanning | dismissed | `high` | `no-fix` / `hard-fix` 或未命中 | **阻断**（dismiss 不能把真实漏洞登记成「无修复版本」豁免） |
| Dependabot / Code Scanning | 任一 | `moderate` / `low` | 不适用 | 放行，仅统计 |
| 任一来源 | 任一 | `unknown`（字段缺失 / 值不可映射） | 不适用 | **阻断**（不能当作无告警） |

**级别归一**：GitHub API 原值为 `critical / high / medium / low`（无 moderate），`medium` 统一归一为 `moderate`；Code Scanning 优先取 `security_severity_level`，缺失时 `rule.severity` 按 `error → high` / `warning → moderate` / `note` / `none` → `low` 映射。

## 4. 豁免台账 schema

```json
{
  "exemptions": [
    {
      "source": "dependabot",
      "id": "GHSA-xxxx-yyyy-zzzz",
      "severity": "high",
      "category": "no-fix",
      "target": "pkg <= 1.2.3",
      "path": "workspace > ... > pkg",
      "reason": "无可用修复版本",
      "review": "pkg 发布 > 1.2.3 后移除",
      "tracking": "docs/plan/backlog.md（已知边界条目）"
    }
  ]
}
```

**校验规则**（`loadExemptions`）：9 个字段必须为非空字符串（Code Scanning 条目另需 `location` 实例路径，缺失即非法；`location` 参与台账唯一性，同一 rule 不同文件可分别登记）；`false-positive` 的 `reason` 须写明原 dismiss 原因；`source ∈ {dependabot, code-scanning}`；`severity` 仅允许 `high`（`critical` 报「禁止豁免」，`moderate` / `low` 报「无需登记」）；`category ∈ {no-fix, hard-fix, false-positive}`（`false-positive` 用于登记被 dismiss 的误报）；`source:id` 不允许重复；任一条目不合法 → 整套台账作废并 exit 1（不允许半套台账放行）。

**stale 台账**：台账条目没有匹配的 high 告警时输出 `::warning::` 但**不阻断**——GitHub 会在依赖修复后自动关闭告警，记账清理不应阻塞发布；复核节奏以台账 `review` 与 backlog 为准。

## 5. fail-closed 决策表

> **采集时点（2026-11-26）**：`formatCollectionTime()` 让所有返回路径（PASS / FAIL / token 缺失 / 仓库未定 /
> 台账不可读或非法 / 拉取异常）的首行为 `[release-security] 采集时点 <UTC ISO 8601>`；参数错误路径在
> **stderr 流内首行**输出同一格式（usage 仍走 stdout）。时点取「门禁输出 / 汇总时刻」，长拉取下即采集完成时刻，
> 不表示发起时刻。判定逻辑与退出码不变，仅新增一行可自证时点的证据。

| 场景 | 行为 |
|:--|:--|
| 无任何 token | exit 1，提示可用 secret 名单 |
| API 401 / 403 | exit 1，附 Dependabot / Code Scanning 权限指引（`GH_PAT`），**不得视为无告警** |
| API 404 | exit 1，提示「该仓库未启用对应告警源」 |
| 请求超时（10s）/ 429 与 5xx 总尝试 3 次（2 次重试）仍失败 | exit 1（不得卡死 job） |
| 响应非数组 | exit 1 |
| 分页超过 20 页（约 2000 条） | exit 1，拒绝静默截断 |
| 台账不可读 / JSON 非法 / 字段非法 | exit 1，且不下发 API 请求 |
| 告警级别无法判定 | exit 1 |
| stale 台账 | warning，exit 0 |

## 6. 与既有门禁的边界

| 门禁 | 覆盖面 | 与本节关系 |
|:--|:--|:--|
| §5.6 `pnpm audit`（prod 阻断） | npm 依赖（prod） | 互补：audit 绿不等于 alert 面干净（devDeps / 传递依赖 / 代码告警） |
| §5.7 `audit.ignore` | audit 命令级豁免 | **不构成发布豁免**；high 条目须同时在台账登记 |
| §5.9 本门禁 | Dependabot + Code Scanning open 告警 | 发布级唯一阻断点 |
| Security Auto Fix（已停用） | 自动建修复 PR | 不参与发布判定 |

## 7. 测试矩阵

`scripts/check-release-security-alerts.test.mjs`（41 例）覆盖：

- 级别映射（error / warning / note / none / 缺失 / `medium → moderate` / `security_severity_level` 优先 / state 保留）
- 台账校验（合法 / JSON 非法 / 顶层结构错 / critical 登记 / 字段缺失 / 枚举非法 / 重复）
- 判定（critical 阻断 / dismissed critical 阻断 / high 未豁免阻断 / dismissed high 未登记阻断 / high 已豁免放行 / Code Scanning 按 rule id + 实例路径豁免 / 同路径多告警共用一条台账 / moderate·low 放行 / unknown 阻断 / stale warning）
- 分页与容错（Link rel=next 合并 / 403 不重试 / 429·5xx 重试 / 分页超限 / 非数组 / 无 next）
- 仓库 slug 与 token 优先级（https / ssh / 裸 slug / remote 兜底 / 失败）
- CLI 参数解析（等号 / 空格形式 / `--help` / 未知参数 / 缺值 / 空值）
- runCheck 集成（PASS / 阻断 / 缺 token / 缺 repo / 台账不可读 / 台账非法不下发请求 / 403 提示）
- 仓库内实际台账可解析且不含 critical（事实源自洽）

## 8. 已知边界与演进

- **`GH_PAT` 需人工配置**：缺失时发布必失败（fail-closed）。换取的是「不会静默跳过门禁」；配置口径见 [发布指南](../../guide/release.md#前置配置-一次性)。
- **仅在 `release.yml`**：PR / push 阶段不阻断（fork PR 无 secret，接入会误报）；如需提前暴露，本地在版本提升前跑同一命令。
- **stale 台账不阻断**：依赖修复后需人工按 `review` 条件移除；连续多个发布窗口未清理时由 A 阶段审计提示。
- **dismissed 告警按台账判定**：high 的误报关闭需登记 `false-positive` 条目（Code Scanning 需按 `location` 实例登记）；critical 不允许 dismiss 放行（只能修复或修正扫描规则）。仅拉取 `open` + `dismissed`，`auto_dismissed`（自动关闭、不再适用）不参与判定。
- **告警面扩展**：若后续接入 secret scanning 等新来源，在 `runCheck` 增加 fetch + `classify*`，并同步 §5.9 与检查点矩阵。

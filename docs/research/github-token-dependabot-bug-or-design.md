# GITHUB_TOKEN 无法访问 Dependabot Alerts：Bug 还是故意设计？

> 调研时间：2026-08-04
> 方法：超级搜索 + GitHub 官方 issue/discussion 原文抓取 + 交叉验证
> 结论：**两者都有——本质是"安全设计意图 + 权限模型边界"，但官方文档存在误导性缺陷**

---

## 一、结论速览

| 观点 | 支持证据强度 | 结论 |
|---|---|---|
| **故意设计**（安全加固） | 🥇 强（官方 changelog + 权限模型设计） | ✅ 核心事实 |
| **Bug/文档误导**（文档与行为不符） | 🥈 中（官方文档确实写了 security_events 可用） | ✅ 部分成立（文档缺陷） |

**最终判断**：GITHUB_TOKEN 无 Dependabot 读取权限**是故意的安全设计**（Actions 内置应用的权限模型从未支持该权限），但**官方 REST 文档措辞存在误导**，让用户误以为是 bug 或权限配置问题。

---

## 二、"故意设计"观点的论据（🥇 强证据）

### 论据 1：`vulnerability-alerts` 是 GitHub App-only 权限，Actions 权限模型从未支持

[gh-aw #22707](https://github.com/github/gh-aw/issues/22707)（GitHub 官方内部工具仓库，2026-03）：

> **"`vulnerability-alerts` is a GitHub App-only permission — it is not a valid GitHub Actions workflow permission key. GitHub Actions rejects it at queue time."**
> （vulnerability-alerts 是仅 GitHub App 的权限——它不是合法的 Actions 工作流权限键。Actions 在排队时就拒绝它。）

**含义**：Dependabot 告警读取权限**只存在于 GitHub App 授权模型**中；Actions 工作流的 `permissions:` 键列表**根本不含**这个权限。你在 workflow 里写 `security-events: write` 或 `vulnerability-alerts: read` 都不会产生该权限——前者无效，后者直接解析报错。

### 论据 2：GitHub 官方对 Dependabot 相关令牌持续收紧（有 changelog 佐证）

[GitHub Blog changelog（2021-02-18）](https://github.blog/changelog/2021-02-18-github-actions-workflows-triggered-by-dependabot-prs-will-run-with-read-only-permissions/)：

> **"Workflows triggered by Dependabot PRs will run with read-only permissions... Starting March 1st, 2021"**
> （Dependabot PR 触发的 workflflows 将只读运行）

[dependabot-core #3253](https://github.com/dependabot/dependabot-core/issues/3253)（官方确认）：

> **"We recently made changes to dependabot which means they will receive a read-only GITHUB_TOKEN and will not have access to any secrets."**
> （我们近期修改了 Dependabot：它只获得只读 GITHUB_TOKEN，且无法访问任何 secrets。）

**含义**：GitHub 对 Dependabot 相关的令牌访问有**明确的、多次收紧的历史**——Dependabot 触发的流程故意限制令牌能力，防止供应链攻击面扩大。这与"不给 Actions 内置应用 Dependabot 读取权限"是同一安全策略的延续。

### 论据 3：GITHUB_TOKEN 最小权限原则是官方既定方向

[GitHub Docs: Use GITHUB_TOKEN for authentication](https://docs.github.com/actions/reference/authentication-in-a-workflow) + [StepSecurity 分析](https://www.stepsecurity.io/blog/github-token-how-it-works-and-how-to-secure-automatic-github-action-tokens)：

- 2023 年起 GITHUB_TOKEN **默认只读**（此前默认读写）
- GitHub 官方反复强调"least-privilege"（最小权限）
- Dependabot 告警属于 **GitHub Advanced Security（GHAS）数据**——安全敏感度最高的数据类别，刻意不给内置令牌是合理设计

### 论据 4：社区管理员的权威解释

[GitHub Community #60612](https://github.com/orgs/community/discussions/60612)（社区管理员 zaataylor 回复）：

> **"The default GITHUB_TOKEN alone will never have enough permissions on its own... because the underlying Actions App the token is minted for can't be customized to have the Dependabot alerts read permission."**
> （默认 GITHUB_TOKEN 永远不可能有足够权限……因为为其铸造令牌的 Actions 应用无法被配置为拥有 Dependabot alerts 读取权限。）

**含义**：这不是"权限没配好"的问题，而是**架构上不可能**——Actions 应用本身没有该权限的配置位。

---

## 三、"Bug/文档误导"观点的论据（🥈 中强证据）

### 论据 1：官方 REST 文档确实声称 security_events 可用

[GitHub Docs: REST API endpoints for Dependabot alerts](https://docs.github.com/en/rest/dependabot/alerts) 原文：

> **"OAuth app tokens and personal access tokens (classic) need the `repo` or `security_events` scope to use this endpoint."**
> （OAuth 应用令牌和经典 PAT 需要 `repo` 或 `security_events` scope 才能使用此端点。）

**矛盾点**：`security_events` 是 Actions 工作流 `permissions:` 里**存在**的键（对应 CodeQL 扫描告警），文档暗示它对 Dependabot 也有效——但实际对 Actions 令牌无效。用户按文档配置后得到 403。

### 论据 2：用户实测与文档直接冲突

[GitHub Community #60612](https://github.com/orgs/community/discussions/60612) 的 WIStudent 评论（2024-11）：

> **"The GitHub documentation explicitly says that this endpoint should work with that permission... This is either not working as intended or the GitHub documentation is wrong."**
> （GitHub 文档明确说该端点应该能配合这个权限工作……这要么是未按预期工作，要么是文档错了。）

发帖人 laughedelic（2023-07）：

> **"Since the documentation doesn't mention anything special about GitHub Actions... I assume that this is a bug or an unintentional limitation."**
> （文档没提 Actions 有任何特殊之处……我认为这是个 bug 或无意中的限制。）

### 论据 3：文档与实际行为的边界混乱长期未澄清

- #60612 从 2023-07 提出，**2026-06 仍有人回复**（bm1216 的 PAT write 权限实测）
- 官方文档至今（2026-03-10 版本）仍未明确区分"Actions 令牌 vs GitHub App 令牌"的权限差异
- 用户只能靠社区讨论踩坑摸索，说明文档引导不足

---

## 四、综合裁定

| 维度 | 判定 |
|---|---|
| **是否故意** | ✅ **是**——Actions 内置应用的设计上就无 Dependabot 权限位（App-only 权限），且 GitHub 对 Dependabot 令牌有系统性收紧历史 |
| **是否 bug** | ⚠️ **不是功能 bug**，但**文档是"文档 bug"**——官方 REST 文档对 Actions 场景的权限说明具有误导性，且多年未澄清 |
| **本质** | 安全设计意图（GHAS 数据不暴露给内置令牌）+ 权限模型边界（App-only）+ **文档缺陷**（未说明 Actions 例外） |
| **用户观感** | "文档说可以 → 实际不行" = 看起来像 bug，实际是文档漏写了例外 |

---

## 五、对你的实际影响

| 场景 | 影响 |
|---|---|
| **你的 dependabot-monitor.py**（Hermes cron + PAT） | ✅ 不受影响——PAT 是独立令牌，可配 `security_events` scope，绕过 Actions 限制 |
| **GitHub Actions 里想读告警** | 必须用 GitHub App 安装令牌（可配置 Dependabot 读取权限）或 PAT；GITHUB_TOKEN 永远不行 |
| **如果 GitHub 未来改进** | 关注官方 roadmap——目前无迹象表明会开放该权限给 Actions 令牌（安全策略倾向维持现状） |

---

## 六、参考资料

- [GitHub Community #60612: Can't access Dependabot alerts API](https://github.com/orgs/community/discussions/60612)
- [gh-aw #22707: vulnerability-alerts is App-only permission](https://github.com/github/gh-aw/issues/22707)
- [gh-aw #17978: token narrowing omits Dependabot permission](https://github.com/github/gh-aw/issues/17978)
- [dependabot-core #3253: Dependabot read-only token](https://github.com/dependabot/dependabot-core/issues/3253)
- [GitHub Blog: Dependabot PR workflows read-only (2021)](https://github.blog/changelog/2021-02-18-github-actions-workflows-triggered-by-dependabot-prs-will-run-with-read-only-permissions/)
- [GitHub Docs: REST API endpoints for Dependabot alerts](https://docs.github.com/en/rest/dependabot/alerts)
- [GitHub Docs: Use GITHUB_TOKEN for authentication](https://docs.github.com/actions/reference/authentication-in-a-workflow)

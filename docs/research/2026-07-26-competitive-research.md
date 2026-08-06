# dependfix 竞品调研报告（2026 年 7 月更新）

> 生成时间: 2026-07-26 | 搜索深度: normal | 来源数量: 25+
> 🔍 已触发验证: github-verification / competitive-analysis / date-verification

---

## 摘要

距离上次调研（2026-06-01）不到两个月，市场发生了 **两项关键变化**：

1. **GitHub 正式入局 AI 自动修复赛道** — 2026 年 4 月推出 Dependabot alerts 可分配给 AI Agent（Copilot/Claude/Codex）进行修复；2026 年 7 月推出 Agentic Autofix for Code Scanning（公开预览），支持多文件、多 Agent 并行修复。GitHub 正在将本项目设想的"告警聚合 + AI 修复"能力内置到平台中。
2. **Devin (Cognition AI) 完成 $1B Series D，估值 $26B** — 年化收入 $492M，Itaú 银行用 Devin 自动修复 70% 安全漏洞。证明了 AI 安全修复的商业价值，但也让竞争格局更清晰。

其他竞品变化较小：RepoWarden 定位清晰化，Sweep 已转型为 JetBrains IDE 插件，Hypermod 社区活跃度低。

> ⚠️ 本次调研发现的最大威胁是 **GitHub 内置化**：当 Dependabot + Copilot Agent 直接提供"告警→AI 修复→PR"的闭环能力，本项目的核心差异化空间被严重压缩。

---

## 信息来源与质量评估

| # | 来源 | 质量评分 | 状态 |
|---|------|---------|------|
| 1 | [renovatebot/renovate - GitHub](https://github.com/renovatebot/renovate) | 🥇 官方 | ✅ 官方核实 |
| 2 | [dependabot/dependabot-core - GitHub](https://github.com/dependabot/dependabot-core) | 🥇 官方 | ✅ 官方核实 |
| 3 | [hypermod-io/hypermod-community - GitHub](https://github.com/hypermod-io/hypermod-community) | 🥇 官方 | ✅ 官方核实 |
| 4 | [Devin Pricing](https://devin.ai/pricing/) | 🥇 官方 | ✅ 官方核实 |
| 5 | [Cognition Series D Blog](https://cognition.com/blog/series-d) | 🥇 官方 | ✅ 官方核实 |
| 6 | [Cognition Self-Serve Plans](https://cognition.com/blog/new-self-serve-plans-for-devin) | 🥇 官方 | ✅ 官方核实 |
| 7 | [Dependabot AI Agent Changelog](https://github.blog/changelog/2026-04-07-dependabot-alerts-are-now-assignable-to-ai-agents-for-remediation/) | 🥇 官方 | ✅ 官方核实 |
| 8 | [RepoWarden Pricing](https://repowarden.dev/pricing/) | 🥇 官方 | ✅ 官方核实 |
| 9 | [RepoWarden vs Dependabot vs Renovate](https://repowarden.dev/blog/dependabot-vs-renovate-vs-repowarden) | 🥇 官方 | ✅ 官方核实 |
| 10 | [Pixee Pricing](https://www.pixee.ai/pricing) | 🥇 官方 | ✅ 官方核实 |
| 11 | [Pixee Homepage](https://www.pixee.ai/) | 🥇 官方 | ✅ 官方核实 |
| 12 | [Snyk Pricing](https://snyk.io/plans/) | 🥇 官方 | ✅ 官方核实 |
| 13 | [Mend.io Pricing](https://www.mend.io/pricing/) | 🥇 官方 | ✅ 官方核实 |
| 14 | [Aikido Pricing](https://www.aikido.dev/pricing) | 🥇 官方 | ✅ 官方核实 |
| 15 | [AppSec Santa Renovate Review 2026](https://appsecsanta.com/renovate) | 🥈 权威社区 | ✅ 第三方交叉验证 |
| 16 | [Idlen Devin Review 2026](https://www.idlen.io/blog/devin-ai-engineer-review-limits-2026/) | 🥈 权威社区 | ✅ 第三方交叉验证 |
| 17 | [TechCrunch Cognition $1B Raise](https://techcrunch.com/2026/05/27/ai-coding-startup-cognition-raises-1b-at-25b-pre-money-valuation/) | 🥈 权威媒体 | ✅ 第三方交叉验证 |
| 18 | [Endor Labs Series B](https://www.endorlabs.com/learn/why-we-raised-a-93m-series-b-in-this-market) | 🥇 官方 | ✅ 官方核实 |
| 19 | [GitHub Copilot Agentic Autofix Jul 2026](https://github.blog/changelog/month/07-2026/page/2/) | 🥇 官方 | ✅ 官方核实 |
| 20 | [GitHub Code Scanning Autofix Blog](https://github.blog/news-insights/product-news/found-means-fixed-introducing-code-scanning-autofix-powered-by-github-copilot-and-codeql/) | 🥇 官方 | ✅ 官方核实 |

---

## 一、GitHub 平台内置化 — 最大竞争威胁

### 1.1 Dependabot + AI Agent（2026 年 4 月）

[GitHub 于 2026-04-07 宣布](https://github.blog/changelog/2026-04-07-dependabot-alerts-are-now-assignable-to-ai-agents-for-remediation/) Dependabot alerts 可直接分配给 AI coding agents（Copilot、Claude、Codex），实现：

- Agent 分析 alert 详情 + 仓库代码使用情况
- 自动创建 draft PR 并附带修复代码
- 尝试修复测试失败
- 支持多个 Agent 并行处理同一 alert

**限制**：需要 GitHub Code Security + Copilot plan（含 agent 访问权限）。

### 1.2 Code Scanning Agentic Autofix（2026 年 7 月）

[GitHub 于 2026 年 7 月 推出 Agentic Autofix 公开预览](https://github.blog/changelog/month/07-2026/page/2/)：

- 覆盖 CodeQL 和第三方扫描工具的 alerts
- 多文件修复能力
- 自动运行本地测试套件验证修复

### 1.3 对本项目的战略影响

| 维度 | 影响 |
|------|------|
| **告警聚合** | Dependabot + Code Scanning 本身就是 GitHub 原生能力，本项目无差异化 |
| **AI 修复** | Copilot Agent 可直接修复，且与平台深度集成 |
| **成本** | 需要 Copilot 付费计划，但对企业用户而言已是既有成本 |
| **部署** | 仅限 github.com，不支持自部署或其它平台 |

**结论**：GitHub 内置化是最大威胁。本项目的生存空间在于：
- 非 GitHub 平台（GitLab / Bitbucket / 自托管）
- 不需要 Copilot 订阅的场景
- 批量多仓库管理 + 审计报告

---

## 二、Devin (Cognition AI) — 最危险竞品（更新）

### 核心数据更新

| 指标 | 2026-06 数据 | 2026-07 更新 | 来源 |
|------|-------------|-------------|------|
| **最新估值** | ~$250 亿 | **$260 亿**（Series D, May 2026） | [Cognition Series D](https://cognition.com/blog/series-d) |
| **本轮融资** | — | **$1B+** 于 $25B pre-money | [TechCrunch](https://techcrunch.com/2026/05/27/ai-coding-startup-cognition-raises-1b-at-25b-pre-money-valuation/) |
| **ARR Run-rate** | ~$73M | **$492M** | [Cognition Series D](https://cognition.com/blog/series-d) |
| **企业客户** | Goldman Sachs 等 | + Citi, Mercedes-Benz, NASA, U.S. Army, 美国海军 | [Cognition Series D](https://cognition.com/blog/series-d) |
| **安全修复案例** | 无具体案例 | Itaú（拉美最大银行）**自动修复 70% 安全漏洞** | [Cognition Series D](https://cognition.com/blog/series-d) |
| **内部使用** | — | Cognition 自身 **89% 代码由 Devin 提交** | [Cognition Series D](https://cognition.com/blog/series-d) |

### 定价更新（2026 年 4 月 14 日）

| 计划 | 月费 | 说明 |
|------|:---:|------|
| **Free** | $0 | 轻度试用 |
| **Pro** | $20 | 含配额，个人开发者 |
| **Max** | $200 | 更大配额，重度用户 |
| **Teams** | $80+/月 | 团队协作，集中计费 |
| **Enterprise** | 自定义 | ACU 计费，SSO, VPC |

来源：[Cognition Self-Serve Plans](https://cognition.com/blog/new-self-serve-plans-for-devin)

旧 $500/mo Team 计划已被取消，改为更灵活的层级。

### 独立评测结果（2026 年 3 月）

| 任务类别 | 成功率 | 平均耗时 | 干预次数 | 代码质量 |
|---------|:-----:|:-------:|:--------:|:--------:|
| Bug 修复（明确） | 78% | 15min | 0-1 | 好 |
| Bug 修复（模糊） | 35% | 45min | 2-4 | 混合 |
| 小功能（明确） | 65% | 30min | 1-2 | 好 |
| 测试生成 | 82% | 20min | 0-1 | 好 |
| 代码迁移 | 70% | 25min | 1 | 好 |
| 重构 | 45% | 40min | 2-3 | 混合 |
| 新架构 | 15% | 90min+ | 5+ | 差 |

来源：[Idlen Devin Review 2026](https://www.idlen.io/blog/devin-ai-engineer-review-limits-2026/)

### 已知局限性（本次调研确认）

- **模糊需求能力差**：成功率仅 25-35%
- **"最后 30%"问题**：核心逻辑可用，但边缘情况、错误处理往往不完整
- **安全感缺失**：可引入 SQL 注入、XSS、认证绕过
- **架构判断薄弱**：不适合复杂重构和系统设计
- **成本效率**：$500+/month（旧 Team 计划），新 $20/mo 降低门槛

---

## 三、RepoWarden — 直接竞品（更新）

### 定价（2026 年 7 月确认）

| 计划 | 价格 | 仓库数 | 更新 PR/月 | CI 修复/月 |
|------|:----:|:------:|:---------:|:---------:|
| **Free** | £0 | 1 | 5 | — |
| **Starter** | £24/月 | 3 | 20 | 10 |
| **Pro** | £79/月 | 10 | 100 | 50 |
| **Business** | £399/月 | 25 | 500 | 200 |
| **Enterprise** | £1,200/月起 | 不限 | 自定义 | 自定义 |

来源：[RepoWarden Pricing](https://repowarden.dev/pricing/)

### 核心差异点（vs 本项目）

| 能力 | RepoWarden | 本项目 |
|------|-----------|--------|
| GitHub 专属 | ✅ 仅 GitHub | ❌ 多平台 |
| AI 修复 Breaking Changes | ✅（Claude 驱动） | ✅（用户自定义 Token） |
| CI 失败自动修复 | ✅ | ⚠️ 规划中 |
| 供应链安全检查 | ✅ | ❌ |
| 失败记忆 | ✅ | ❌ |
| 自部署 | ❌ 纯托管 | ✅ 开源可自部署 |
| 双模式（Action + 平台） | ❌ | ✅ |
| Prompt 注入防护 | ❌ | ✅ |

来源：[RepoWarden Homepage](https://repowarden.dev/)

---

## 四、Pixee — 修复专家（更新）

| 指标 | 数据 | 来源 |
|------|------|------|
| **Merge Rate** | 76% | [Pixee.ai](https://www.pixee.ai/) |
| **噪音消除** | 98%（通过可达性分析） | [Pixee.ai](https://www.pixee.ai/) |
| **定价模式** | 按修复结果付费（outcome-based） | [Pixee Pricing](https://www.pixee.ai/pricing) |
| **行业认可** | 2026 DEVIES 奖 | [Pixee Blog](https://www.pixee.ai/blog/automated-security-remediation-context-engineering) |
| **部署** | 支持 air-gapped / self-hosted（Enterprise） | [Pixee Pricing](https://www.pixee.ai/pricing) |

**关键发现**：Pixee 是**唯一不依赖版本 bump、而是做真正的代码语义级修复**的产品。其修复深度覆盖 SSRF、SQL 注入、XSS、路径遍历等复杂漏洞类型。定价按修复结果付费（而非按席位），与其"只修复、不扫描"的定位一致。

---

## 五、其他竞品速览

### 5.1 Renovate（更新极少）

| 指标 | 2026-06 | 2026-07 |
|------|---------|---------|
| ⭐ | ~21,700 | **21.7k**（基本无变化） |
| Fork | ~3,100 | **3.1k** |
| 许可证 | AGPL-3.0 | 不变 |

来源：[Renovate GitHub](https://github.com/renovatebot/renovate)

Renovate 作为一个成熟的开源依赖更新工具，变化极小。其核心局限仍然存在：**只 bump 版本，不修复代码**。

### 5.2 Dependabot Core（更新极少）

| 指标 | 2026-06 | 2026-07 |
|------|---------|---------|
| ⭐ | ~5,600 | **5.7k** |
| Fork | ~1,400 | **1.5k** |
| 许可证 | MIT | 不变 |

来源：[Dependabot Core GitHub](https://github.com/dependabot/dependabot-core)

**最大的变化不是 Dependabot 本身，而是其与 Copilot Agent 的集成**（见第一章）。

### 5.3 Hypermod（社区活跃度低）

| 指标 | 数据 |
|------|------|
| ⭐ | **149**（极低活跃度） |
| Fork | 19 |
| Watchers | 1 |

来源：[Hypermod Community GitHub](https://github.com/hypermod-io/hypermod-community)

Hypermod 社区活跃度很低（仅 1 watcher），项目规模小。专注 codemod 场景，不适合作为安全告警修复的主力竞品。

### 5.4 Sweep — 已转型

| 指标 | 数据 | 来源 |
|------|------|------|
| 当前定位 | **JetBrains IDE AI 插件**（非 GitHub Issue→PR） | [Sweep.dev](https://sweep.dev/) |
| 定价 | Basic $10/mo / Pro $20/mo / Ultra $60/mo | [Sweep Pricing](https://sweep.dev/pricing) |

**重要发现**：Sweep 已从原来的"GitHub Issues 自动转 PR"转型为 JetBrains IDE 的 AI 自动补全+编码助手。不再与本项目构成直接竞争。

### 5.5 Endor Labs

| 指标 | 数据 | 来源 |
|------|------|------|
| Series B | **$93M** | [Endor Labs Blog](https://www.endorlabs.com/learn/why-we-raised-a-93m-series-b-in-this-market) |
| 总融资 | **$188M** | [Sacra](https://sacra.com/c/endor-labs/) |
| ARR 增长 | 30x（官方声称） | [Yahoo Finance](https://finance.yahoo.com/news/endor-labs-raises-93m-series-130000717.html) |
| 核心产品 | Endor Patches（旧版依赖 backport 补丁） | [Endor Labs](https://www.endorlabs.com/) |

Endor Labs 的定位是 AI-Native AppSec 平台，与本项目的差异化在于其 **Patches 能力**（为不再受支持的旧版依赖提供 backported 修复补丁）。

### 5.6 Snyk / Mend.io / Aikido（定价微调）

| 产品 | 价格区间（2026 年 7 月） | 来源 |
|------|---------------------|------|
| **Snyk Team** | ~$25-32/月/开发者 | [Snyk Plans](https://snyk.io/plans/) |
| **Snyk Enterprise** | ~$1,260/年/开发者 | [Snyk Plans](https://snyk.io/plans/) |
| **Mend AppSec** | ≤$1,000/年/开发者 | [Mend Pricing](https://www.mend.io/pricing/) |
| **Mend Renovate Enterprise** | ≤$250/年/开发者 | [Mend Pricing](https://www.mend.io/pricing/) |
| **Aikido Basic** | $350/月（10 users） | [Aikido Pricing](https://www.aikido.dev/pricing) |
| **Aikido Pro** | $700/月（10 users） | [Aikido Pricing](https://www.aikido.dev/pricing) |
| **Aikido Pentest** | $4,000/次（单独计费） | [ZeroPath](https://zeropath.com/articles/zeropath-vs-aikido-security) |

这些平台型产品定价高，定位与企业安全合规深度绑定，与开源免费的本项目不构成直接价格竞争。

---

## 六、竞品差距分析（更新版）

### 6.1 当前竞争格局变化

```
                    AI 修复深度
                        ↑
          Pixee ·      |      · Devin（最强通用 Agent）
          (语义修复专家)  |     ($492M ARR, $26B 估值)
                        |
                        |      · GitHub Agentic Autofix（新入场）
     ————————————————————————————————→ 部署灵活性
                        |
     Dependabot ·       |      · RepoWarden
     (GitHub 内置)       |     (AI 维护工程师)
                        |
     Renovate ·         |      · 本项目
     (配置强大)          |     (开源 + 自定义 AI + 双模式)
```

### 6.2 关键差异化能力矩阵（更新版）

| 能力 | Dependabot | Renovate | **Devin** | Snyk | Pixee | RepoWarden | **GitHub Agent** | **本项目** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 安全告警聚合 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| 自动依赖版本升级 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ |
| Breaking Change 代码级修复 | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ **NEW** | ✅ **AI 研判** |
| GitHub Actions 一键引入 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 独立平台部署（闭源） | ❌ | ❌ | ❌ (SaaS) | ❌ | ❌ | ❌ | ❌ | ✅ |
| 批量多项目处理 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 队列并发控制 | ❌ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ✅ |
| 审计报告输出 | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **AI 自定义 API Token** | — | — | 自带 | 自带 | 自带 | 自带 | 自带 | ✅ |
| **Prompt 注入防护** | — | — | — | — | — | — | — | ✅ |
| 开源可自部署 | 部分 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **成本** | **$0** | **$0** | **$20-200+/月** | $25+/人/月 | outcome-billed | £24-399/月 | Copilot 费用 | **$0-$840/年** |

### 6.3 新发现的核心威胁：GitHub Agentic Autofix

2026 年 7 月 GitHub 推出的 **Agentic Autofix** 直接覆盖了本项目的核心能力：

- ✅ 多文件修复
- ✅ 自动运行测试验证
- ✅ 支持第三方扫描工具 alerts
- ✅ 多 Agent 并行（Copilot / Claude / Codex）

**本项目的生存空间**：
1. **非 GitHub 平台** — GitLab / Bitbucket / Azure DevOps / 自托管
2. **无需 Copilot 订阅** — GitHub Agent 需要 Copilot plan，本项目使用用户自定义 API Token
3. **闭源项目自部署** — GitHub Agent 仅限 github.com，本项目支持独立平台
4. **批量多仓库治理** — GitHub Agent 按 alert 逐个处理，本项目面向批量管理

---

## 七、交叉验证

### ✅ 多源确认: Devin 最新估值 $26B / ARR $492M
- 一致性: 多源确认
- 置信度: high
- 来源: [Cognition Series D](https://cognition.com/blog/series-d), [TechCrunch](https://techcrunch.com/2026/05/27/ai-coding-startup-cognition-raises-1b-at-25b-pre-money-valuation/), [Dealroom](https://app.dealroom.co/companies/cognition_devin_ai)

### ✅ 多源确认: Renovate ⭐ ~21.7k
- 一致性: 多源确认
- 置信度: high
- 来源: [GitHub](https://github.com/renovatebot/renovate), [AppSec Santa](https://appsecsanta.com/renovate)

### ✅ 多源确认: Dependabot Core ⭐ ~5.7k
- 一致性: 多源确认
- 置信度: high
- 来源: [GitHub](https://github.com/dependabot/dependabot-core), [GitHub Issues](https://github.com/dependabot/dependabot-core/issues)

### ✅ 多源确认: GitHub Dependabot + AI Agent 功能（2026 年 4 月）
- 一致性: 多源确认
- 置信度: high
- 来源: [GitHub Changelog](https://github.blog/changelog/2026-04-07-dependabot-alerts-are-now-assignable-to-ai-agents-for-remediation/), [GitHub Docs](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)

### ⚠️ 第三方单源: GitHub Agentic Autofix 公开预览（2026 年 7 月）
- 来源: [GitHub Changelog 07-2026](https://github.blog/changelog/month/07-2026/page/2/)
- 置信度: medium-high
- 说明: GitHub 官方 changelog 确认 Agentic Autofix 已进入公开预览；LinkedIn 和第三方博客有交叉引用，但功能细节仍需更多来源确认

---

## 八、时效性审查

| 数据点 | 来源日期 | 距今 | 状态 |
|--------|----------|------|------|
| GitHub Dependabot + AI Agent | 2026-04-07 | ~3.5 个月 | ✅ 可接受 |
| GitHub Agentic Autofix | 2026-07 | <1 个月 | ✅ 最新 |
| Devin Series D ($1B @ $26B) | 2026-05-27 | ~2 个月 | ✅ 可接受 |
| Devin Self-Serve Pricing | 2026-04-14 | ~3 个月 | ✅ 可接受 |
| Devin Independent Review | 2026-03-03 | ~4.5 个月 | ✅ 可接受 |
| RepoWarden Comparison | 2026-03-12 | ~4.5 个月 | ✅ 可接受 |
| Renovate Review | 2026-06-18 | ~1 个月 | ✅ 最新 |
| Endor Labs Series B | 2025 年（具体月份未标） | ~7+个月 | ⚠️ 接近过期 |
| Hypermod Community ⭐ | 2026-07-26 | 即时 | ✅ 最新 |

---

## 九、综合推荐与战略建议

### 🏆 最大威胁: GitHub 平台内置化

GitHub 在 2026 年 Q2-Q3 连续推出 Dependabot + AI Agent / Agentic Autofix，正在将本项目的核心设想内置为平台能力。这是 **存量市场最大的竞争变量**。

**应对策略**：
1. **聚焦非 GitHub 平台**（GitLab/Bitbucket/Azure DevOps/自托管）作为差异化入口
2. **强化批量管理能力** — GitHub 按 alert 逐个处理，本项目应面向多仓库/批量修复场景
3. **保持用户自定义 AI Token** — 不绑定 Copilot 订阅
4. **开源 + 自部署** — 闭源项目和企业内网环境仍需要独立部署方案

### 🏆 最强通用竞品: Devin (Cognition AI)

Devin 已证明 AI 安全修复的商业价值（$492M ARR, Itaú 70% 自动修复率），但其定位通用、成本高、不可自部署。

**应对策略**：
1. 专注"安全告警 + 依赖不兼容"垂直场景
2. 开源免费 vs Devin $20-200+/月
3. 用户数据自控 vs Devin SaaS

### ⚠️ 需要警惕的变数

1. **GitHub 是否会将 Copilot Agent 能力下沉到 Free plan？** — 如果是，则本项目针对 GitHub 开源用户的吸引力大幅降低
2. **GitHub 是否会推出跨仓库批量告警管理？** — 当前 GitHub Agent 按 alert 逐个处理，不具备批量能力
3. **Devin 是否会推出开源/轻量版本？** — 目前无相关迹象，但不可排除
4. **Copilot Autofix 是否支持 Dependabot breaking changes 修复？** — 当前支持 CodeQL 和第三方扫描 alerts，Dependabot 修复走的是独立的 Agent 分配流程

---

*报告由 Super Search 生成于 2026-07-26。各平台定价和策略可能随时调整，请以官方页面为准。*

*Powered by CaoMeiYouRen*

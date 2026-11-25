# PR 交付收口：决策、边界与后续实证（pr-delivery-closure.md §13-§16）

> 本分片自 [pr-delivery-closure.md](./pr-delivery-closure.md) 按连续尾部章节迁出（章节编号全局唯一、跨文件稳定）。

## 13. 决策记录

| 编号 | 决策 | 备选与否决理由 |
|:--|:--|:--|
| D1 | 精选家族清单为权威，peer 仅校验 | 自动推导误报高；`eslint` 与 `@typescript-eslint/*` 不是同 major 关系 |
| D2 | `--mirror-ci-scripts` 可选执行脚本子集 | 默认执行成本不可控；`--strict-ci` 阻断会让存量仓库直接红 |
| D3 | PR 正文**尝试计数**为权威载体，签名可选 | 平台表对 CLI / Action 不可用；运行报告不跨运行；创建时尚无失败文本 |
| D4 | 声明路径 + 固定 glob 白名单 | 黑名单永远漏；整仓 `add` 已实证混入生成物 |
| D5 | opt-in 有界轮询，per-PR + per-run 双预算 | 默认 close 风险高；无界 / 仅 per-PR 会突破 job 预算 |
| D6 | 未知分类兜底 `unknown` | 默认 `self_caused` 会误关，默认 `external_noise` 会洗白回归 |
| D7 | 同 key 第 3 次尝试起跳过 | 零重试放大瞬时失败；无限重试制造红 PR 循环 |
| D8 | 合并后 check 采集不在本阶段 | 需新增平台轮询面，超出 6 原子容量；登记后续候选 |
| D9 | 归因不绕过 mergify 门禁 | mergify 无归因扩展点；按归因放行会合并真实回归 |
| D10 | 平台侧建 PR 后回环不在本阶段 | 平台已有 PR Check 告警；CLI / Action 是巡检红 PR 的主要来源 |

## 14. 已知边界与后续候选

1. 家族清单只覆盖首批 4 个；新增家族需补规则与夹具。
2. 尝试计数依赖 PR 正文；人工改写后退化为未命中。
3. 失败签名去重仅在 M48.5 开启时增强证据；默认按尝试次数。
4. CI mirror 只执行 `pnpm/npm/yarn [run] <script>` 单一形态（`./node_modules/.bin/` 前缀归一化；`corepack pnpm@<v>` 钉定、脚本名含 `.` 等不接受）；带 workspace filter / recursive / `--if-present` / 额外参数 / env 赋值、`docker build` / 复合 shell 均只披露。每仓最多 3 条，脚本需存在于根 `package.json#scripts`；多仓共享 workDir 时按该检出计算；只校验形态与存在性，不审计脚本体。
5. CLI 侧回环不跨进程续等；平台侧建 PR 后回环为后续候选。
6. 合并后 check 新采集、聚合 issue、自动启用 mergify 均不在本阶段；已登记 backlog 候选。

## 15. 关联文档

- [验证链与目标仓库 CI 口径对齐](./verification-ci-alignment.md)
- [PR 构建与部署信号采集](./pr-build-deploy-signals.md)
- [依赖分组升级设计](../modules/dependency-grouping.md)
- [队列僵尸任务终结与去重键释放](./queue-stale-recovery.md)
- [依赖修复执行记录](../modules/dependency-fixer-records.md)
- [自动合并指南](../../guide/auto-merge.md)
- [规划规范](../../standards/planning.md) / [测试规范](../../standards/testing.md)

## 16. M51.4 基线红 / 安装失败的交付降级（2026-10-30）

### 16.1 背景与目标

修复后安装验证仍为既有失败（基线红）时，交付一直被**整段跳过**：改动回滚、报告记一条
`PRE_EXISTING_FAILURE`、退出码中性。使用者只看到日志，没有可跟踪的载体，平台运行也表现为
「有告警、无 PR」。

目标：给这条路径一个**可跟踪载体**（issue / 草稿 PR / 仅报告三档），默认行为不变。

**非目标**：不改 `PRE_EXISTING_FAILURE` 归因语义与跳过类白名单，不改安装失败判据与回滚链。

### 16.2 档位与配置

配置键 `DEPENDFIX_ON_BASELINE_RED`（`RuntimeConfig.onBaselineRed`，默认 `skip`；无 CLI flag）：

| 档位 | 行为 | 改动落地 | 载体 |
|:--|:--|:--|:--|
| `skip`（默认） | 审计记录 + 回滚（与引入前逐字一致） | 否 | 无（仅报告 / 平台标签） |
| `issue` | 按失败指纹开 issue（去重、关闭后不重开），随后仍回滚 | 否 | issue |
| `draft` | 不回滚，照常提交 / 推送，PR 以**草稿**创建 | 是（草稿 PR） | draft PR |

- 仅 `fix-and-pr` 生效；`fix` 模式下（平台执行链）能力主线不在引擎 PR 面，因此**只记录**
  `summary.deliverySkipped*`，由平台展示「交付跳过」（见 §16.5）。
- dry-run 一律按 `skip`：dry-run 无交付面可降级，且必须回滚。
- 配置校验：非法值 fail-fast（`ON_BASELINE_RED must be one of: skip, issue, draft`）。

### 16.3 issue 载体

- **失败指纹**：`sha256(repositories.sort + failingCommands.sort).slice(0, 16)`。
  刻意**不含**错误文本、时间戳与 run id——同一仓库 + 同一失败命令即视为同一失败，
  CI 日志抖动不会造成 issue 重复；而错误文本可能携带路径 / 凭据，不进正文也不进指纹。
- **落点**：`installBlockedRepos[0]`（首先命中的受影响仓库），与失败同源——若沿用运行级
  「第一个仓库」，仓库顺序变化会让同一指纹的去重扫描落到另一个仓库而重复开 issue。
- **去重**：正文首位 HTML marker `<!-- dependfix:delivery-skip fp=<fp> -->`；查询 `state: 'all'`
  最近 100 条 issue/PR 条目并排除 PR 条目。**命中已关闭 issue 也复用**（关闭即人工确认的
  「已知问题」，不自动重开）；查询 / 创建失败只 warn，交付跳过与退出码语义不变。
- **标题 / 正文**：标题 `dependfix 交付跳过：<仓库集> 安装验证仍有既有失败`；正文含运行 id、
  受影响仓库、失败命令、「先修安装链再重跑」的处置步骤与「关闭后不会自动重开」说明。
- **标签**：尝试打 `dependfix`（仓库未建该标签时可能被静默丢弃）。标签只是检索便利，
  去重与幂等**不依赖标签**（靠正文 marker）。
- **权限面**：需要 token 具备 `issues: write`（PAT 一般已含 `repo` 范围；fine-grained token 需显式勾选）。

### 16.4 draft 载体

- `pulls.create` 携带 `draft: true`；正文最前插入警告区块（仓库 + 失败命令 + 「CI 会以同一既有失败
  为红，先修安装链再转正」）。非草稿档正文逐字不变。
- 草稿 PR 计入 `summary.prsOpened`，并额外计入 `summary.deliverySkipDraftPrs`。
- `--wait-pr-checks` 在草稿档**不等待**：CI 必然复现既有失败，等待只会烧掉 job 预算。

### 16.5 报告与平台展示

- `RunResult.deliverySkips?: DeliverySkipRecord[]`（仓库集 / 失败命令 / 载体）→ 报告
  `## Delivery Skipped` 段（无记录不渲染）。
- `RunSummary` 新增 `deliverySkipped`（去重仓库数）、`deliverySkipIssues`（本次新建 issue 数）、
  `deliverySkipDraftPrs`（草稿 PR 数），由 `computeSummary` 按记录幂等派生。
- 平台：运行列表的告警列展示「交付跳过 N 个仓库」标签；运行详情（`repo-history-dialog` 的
  结果行与 `run-detail-dialog` 元信息）另附载体计数（新建 issue / 草稿 PR）——避免把
  「无 PR / 0 修复」误读成「扫描无告警」。旧 `summaryJson` 缺字段时按 0 处理（不渲染）。

### 16.6 退出码中性（不变）

`PRE_EXISTING_FAILURE` 仍在跳过类白名单内：三档都不改变 exit code。`draft` 档虽然创建了 PR，
但该仓库的「本次引入的验证失败」判定不变（既有失败不归因），因此退出码与 `skip` 档一致。

### 16.7 已知边界

1. 平台执行链（`fix + commit`）只记录 summary，不创建 issue / 草稿 PR：平台交付面在
   `platform-delivery`，与引擎 `fix-and-pr` 的载体创建不是同一路径（候选已于 2026-11-25 上收
   [M67.2](../../plan/todo.md)，落地后本边界失效）。
2. issue 去重只扫最近 100 条 issue；更早的同指纹 issue 不会被命中（fail-open：最多多开一条）。
3. 人工关闭 issue 即视为已确认；后续同指纹运行不再新建（报告仍记 `deliverySkipped`）。
4. 指纹不含错误文本：同一命令的不同根因会落在同一个 issue（人工跟踪粒度取舍，见 §16.3）。
5. 多仓库运行时 issue 落在**首先命中的受影响仓库**（`installBlockedRepos[0]`）；草稿 PR 仍落在
   运行级第一个仓库（与尝试标记同一约定）。
6. **marker 可被伪造**：能写 issue 的账号贴出同 marker 可抑制本次创建（fail-open：少开一条 issue，
   不会误删）。后续可限定 `user.type === 'Bot'`。
7. 失败命令串原样进入 issue 正文（公开）：若 `commands` 里含 `https://user:token@registry` 这类
   内联凭据会外泄——与 PR 正文既有口径一致（不改本批范围），配自定义命令时应走环境变量。

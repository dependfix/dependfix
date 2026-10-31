# 1.0 发布门槛与就绪度台账

> **状态**：🔶 进行中（2026-10-25 立项；目标 `1.0.0`）
> **定位**：1.0 的**唯一门槛清单与证据台账**。各专项设计仍以自身文档为准（如 [pr-delivery-closure.md](./pr-delivery-closure.md)、[security.md](../../standards/security.md)），本文件只回答「1.0 还差什么、怎么判定、什么时候做」。
> **维护规则**：每次批次收口更新「当前读数」与「批次」列；门槛判定变化必须附证据（run id / analysis id / 命令输出 / 文档 diff）；不得在未留证据的情况下把门槛标绿。

## 1. 1.0 的承诺（对外语义）

1. **semver 承诺**：`1.0.0` 起，破坏性变更必须走 `2.0.0`（0.x 阶段不受此约束）。
2. **入口承诺**：CLI（`report-only` / `fix` / `fix-and-pr`）、GitHub Action、MCP Server、Agent Skill、管理平台五条路径均可独立使用并有文档。
3. **部署承诺**：Docker 单容器 + SQLite 为默认可用形态；PostgreSQL / Helm 为可选形态（不在 1.0 阻断面，见 §3.3）。
4. **安全承诺**：**发布物**（5 个 npm 包 + platform Docker 镜像）不带未被 [§5.7](../../standards/security.md#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05) 豁免的 critical / high 漏洞；仓库依赖审计为**阻断级**门禁。
5. **可回滚承诺**：发布可回滚（tag / 镜像 tag / npm 版本均保留），数据升级有迁移与备份路径。

## 2. 门槛与判定（G1-G8）

> 量化断言均附测量命令与时点；无法当次复现的历史读数标注来源。

| 门槛 | 达标条件（可判定） | 证据物 | 当前读数（最近更新 2026-10-31） | 批次 |
|:--|:--|:--|:--|:--|
| **G1 安全清零** | ① 发布物（5 npm 包 + platform 镜像）无**未被 §5.7 豁免的** critical / high 生产漏洞；② code scanning 0 条未处置告警；③ 存在 **prod 阻断步骤**（`pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org`，无 `|| true`，见 security.md §5.6）+ 全量依赖信号步骤；周回归使用同一 prod 阻断命令；④ 周回归最近 3 次`security:audit-deps` 均通过且日志含审计结果行（记录 run id；M49.3 只要求 1 次，3 次为 1.0 G1 口径） | 全工作区 `pnpm audit --prod --registry=https://registry.npmjs.org` + 按发布包审计记录；code scanning API（analysis id）；`test.yml` 步骤；周回归 run | ◐ 全工作区 23 条（4 high / 15 moderate / 4 low，1 ignored；`2026-10-25` 实测，含 dev；10-23 周回归 prod 口径为 11 条〔2 high / 8 moderate / 1 low，1 ignored〕）；Dependabot 31 条（2 critical / 5 high，其中 node-forge 属 §5.7 豁免）；code scanning 2 条；（M49.3 前）审计步骤仍 `|| true`；周回归连续 4 周红。**M49.2a/2b 后（`2026-10-26`）**：全量 audit 0 条 advisory（0 critical / 0 moderate / 0 low；另 1 high ignored = node-forge），prod audit 0 条；Dependabot critical / high 6 条可修复项已关闭 + node-forge 豁免；medium / low 已清零（`2026-10-26T12:41Z` 关闭），开放项仅 node-forge high；code scanning 已复扫 0 条（analysis `2026499469`）。**M49.3 后（2026-10-27）**：prod 阻断步骤已上线（无`|| true`，含`--registry` + `--ignore-registry-errors`），全量信号保留；3 次 master push run id（翻转后，日志含审计结果行）已回填：`40372808067` / `40466448172` / `40690157020`（步骤均 success；`40690157020` 整体因文档字符预算失败，与审计无关，已由 `ea89e7ec` 修复）；周回归 `40693124400`success（gate 日志含审计结果行）。M49.3 闭环。**M49.5 后（`2026-10-29`）**：版本已复核（5 npm 包发布 + 7 个 tag + GitHub Release）；**发布物安全复核未执行**（待 Docker run 收尾 + 按发布包 audit）；发布前安全告警门禁已落地（`check:release-security`，critical 含 dismissed 一律阻断、high 需台账）并接在`release.yml`；**本地备用通道未执行该门禁**（0.6.0 经该通道发布，已登记 backlog）。G1 ④「周回归最近 3 次」仍待累计 | M49 + F2 |
| **G2 契约冻结** | CLI 参数与模式、Action inputs、报告 JSON schema、配置键、平台 DB schema 五类冻结清单成文；弃用策略与 0.x→1.0 迁移指南成文 | `docs/guide/contract-freeze.md`（五类清单 + 弃用策略 + 迁移指南）+ `pnpm run check:contract-freeze`（`gates:docs`） | ✅ **2026-10-31 M53.1 闭环**：五类清单逐项成文（CLI 43 / 运行模式 4 / Action 31 / `RuntimeConfig` 41 / `DEPENDFIX_*` 48 / 报告 17+11 / DB 15 表）；弃用策略（1 minor 提前期、移除只在 2.0）与 5 条迁移指南（`--version` 元数据缺陷 / 引擎交付链导出异步化 / `--allow-major-upgrade` 无 env / `on-baseline-red` 默认 skip / `signalsJson` 收敛后语义）成文；机检 11 类比对全绿并接入 `gates:docs`（含 zh·en quick-start 参数表 == `argsDef`） | G |
| **G3 真实环境 E2E** | G3.0–G3.8 九条独立路径各留 1 条证据 + G3.9 AI 横切另计（2 家 × 5 场景） | run id / 截图 / 日志 / 报告产物 | ❌ 全部仅有 mock / 单元证据 · **M53.5 先做执行框架**（实跑待用户提供 OAuth / IdP / staging / 测试仓 / AI Key） | G（依赖外部资源） |
| **G4 CI 稳定性** | `master` 连续 20 次 push 绿或连续 2 周无红；flake 率 < 2%；无 P0 事故 30 天 | `gh run list --limit 100` 统计（分子 = 非绿 run 数，分母 = 窗口内 run 数） | ◐ 近 40 次 34 绿（3 失败 / 3 取消）；失败含 dependabot 分支 2 次与 master「Dependabot Updates」1 次，取消为 Docker 被后续 push 取代。**0.6.0 发布后窗口起点（`2026-10-29`）**：`efaa555f` Test 全绿 1 次（`40744772890`，E2E / Coverage / Visual 同步 success），后续 push 继续累计 | G（观察窗口） |
| **G5 测试与覆盖率** | 四维 ≥ 80%（现阈值）；关键模块 mutation 全覆盖；全量测试无 flaky 复发 | `pnpm test` + `pnpm test:coverage`（报告口径：四维百分比）+ mutation 工件 | ◐ 覆盖率已复测（2026-10-31）：Statements 89.51% / Branches 84.14% / Functions 89.97% / Lines 89.62%（`pnpm test:coverage` exit 0）；mutation 仅覆盖归因模块 3/3（工件 `artifacts/review-gate/2026-10-31-m52-4-mutation.md`），**关键模块全覆盖未达成**；flaky 面：`budget.test.ts` 时间边界连跑 10 次全绿、视觉比对 20/20 ×2，全量 `pnpm test` 与已知 e2e flaky（scan-config / repos-crud）待 G 批次；剩余分档见 [M52.4 闭环](../../plan/archive/todo-archive-phases-m52.md) | F2 部分闭环（M52.4）+ G 引用 |
| **G6 文档与可发现性** | 五入口指南完整；关键文档 en-US 平价（含本台账）；0.x→1.0 迁移指南；`@v1` 滚动 tag 可用 | 文档站构建 + `@v1` tag | ◐ M49 发版面 6 处漂移已闭环（AI 输入名 / M5 遗留 / MCP tool 数 / 设计索引 3 行，2026-10-26）；用户可见入口（quick-start / 首页 / README）的 Action 示例已回填 `v0.6.0`（2026-10-29）；版本引用已全部回填（用户可见 4 + 设计文档 4 + en-US 镜像 2）；指南与设计镜像结构平价已由 M52 收口（本台账 en 入口行已补）；剩余 = 设计文档全量英译（1.0 后评估）+ 无 `@v1`（0.x→1.0 迁移指南已由 M53.1 落地） | M49（发版面）+ F2（已闭环）+ G |
| **G7 运维与发布** | 镜像 / 备份恢复 / 启动迁移 / 回滚均实测；发布自动化可启用（`schedule` / `push` 开关就绪）；Postgres+Helm 记为可选并文档化 | deployment.md 实测记录 + release workflow | ◐ Docker / SQLite 备份恢复可用；Postgres+Helm 暂缓；自动化未启用（0.x 设计如此） | G |
| **G8 产品指标** | 采集并公开「近 30 个 dependfix PR 的 CI 绿率 / 人工介入率 / 误关率」，且在 1.0 发布说明中引用 | 统计脚本 + 发布说明 | ⬜ 无采集（F1 已闭环但未产出统计脚本）· **已上收 M53.3**（脚本先行，读数待 30 天窗口） | G |

## 3. 工作分档（1.0 scope cut，2026-10-25 用户初步确认）

> 分档依据：P0 = 1.0 阻断（正确性 / 安全 / 用户可感知的关键缺陷）；P1 = 1.0 期望（可随批或 1.0.1）；1.0 后 = 明确不进 1.0 的重大功能或大改。候选详情仍以 [backlog.md](../../plan/backlog.md) 为准。

### 3.1 P0 阻断（23 项 = 候选 19 + 安全 4）

| 批次 | 项 | 说明 |
|:--|:--|:--|
| **E（通知可信度）= M50** | ① critical 告警必选不可关闭 ② 通知严重级别术语与阈值命名 ③ 周报投递重试与窗口锁 ④ `/settings` 与通知页 dark 视觉 | 已授权；4 原子一批；**2026-10-29 上收 M50 / 2026-10-30 已归档**（[M50 归档分片](../../plan/archive/todo-archive-phases-m50.md)）：用户决策 = M 编号 M50（F1/F2/G 顺延 M51-M53）/ 通知侧保留 `Critical`·`High` 专有名词 / `critical` 独立计数桶（沿用同一 `maxPerHour`）；执行顺序 1→2→3→4（视觉基线必须晚于文案改动） |
| **F1（语义与数据）** | ① 平台 PR Check 创建后回环 ② 平台 / CLI `completed + null` 口径统一 ③ `ScanResult` 修复结果回写（converged 状态）④ 基线红 / 安装失败的交付降级策略 ⑤ 交付类同步调用纳入运行级取消面 ⑥ 单仓通用执行预算 / deadline ⑦ JSON 配置列写入闸门（`sandboxLimits` / `tags`）⑧ alerts 原始列表排序并列兜底 ⑨ head 侧同 ref 多轮 check run 收敛 | 9 项；③ 影响通知真实性，①③ 优先；**已闭环（M51，2026-10-30 归档）**：6 原子全部闭环，九项映射见 [M51 归档分片](../../plan/archive/todo-archive-phases-m51.md)（M51.1=③、M51.2=②+⑨、M51.3=①〔评论 / 关闭已落地；有界重试按用户 2026-10-30 裁定延后，契约见 pr-feedback-loop.md §8〕、M51.4=④、M51.5=⑤+⑥、M51.6=⑦+⑧）；阶段首父链 35 commits / 唯一 diff 136 文件 / +6598 −503；6 原子均经 Review Gate，首个通过前分区 Reject 共 10 次，收口后全部 Pass |
| **F2（文档与验证）** | ① `en-US` 配置指南存量漂移 ② `quick-start` en-US 裁剪漂移 ③ zh 设计文档拆分后 en-US 镜像漂移（含本台账平价）④ 归档双连字符死锚（含 `#31-…` 与 `-de-` 家族）⑤ pr-checks 归因标签渲染验证 ⑥ 视觉基线运行间非确定性 | 6 项；①-④ 为文档平价，⑤-⑥ 为质量证据；**2026-10-30 上收 M52 / 2026-10-31 已闭环归档**（[M52 归档分片](../../plan/archive/todo-archive-phases-m52.md)）：①② 指南平价机检（`docs:check:guides`）、③④ 设计镜像结构映射 + 锚点产物 id 门禁（`docs:check:mirror` / `anchor-id`）、⑤ 归因标签视觉守卫、⑥ 视觉确定性取证（含 update 落帧修复）；用户追加 caomei-ui 1.0.0-rc.1 升级（不占编号）同批闭环 |
| **安全（非候选）** | ① 2 条自产 code scanning 告警 ② 未被 §5.7 豁免的 critical / high 清零（Dependabot 同口径）③ 审计门禁转正（prod 阻断 + 全量信号）④ 周回归转绿 | ③ / ④ 依赖 ①② |

### 3.2 P1 期望（8 项，可随批或 1.0.1）

镜像脚本形态扩展（`pnpm --filter` / 递归 / env 前缀）、白名单内运行前改动归属、provider 原生日志富化、列表页筛选 / 分页共享抽取、`caomei-ui-migration.md` 保序拆分、`architecture.md` 未采用项清理、规范文件瘦身（`ai-collaboration` / `platform` / `git`，含 `ai-collaboration` 健康上界子项）、M44 蒸馏条款检查点挂接。

### 3.3 1.0 后（候选 15 条 + 暂缓 / 远期 8 项；2026-10-25 用户初步确认）

> `#N` = [backlog §候选评估中](../../plan/backlog.md) 自上而下第 N 条（**2026-10-30 台账冻结时实测 53 项** = 10-29 的 58 项 − F1 上收 9 项〔已转 M51〕+ 2026-10-30 复盘派生 4 项；其后阶段内新增 8 项〔用户实测派生 2 + 复审衍生 4 + 收口登记 2〕、上收 F2 七项、再登记全量镜像 1 项，backlog 概览现为 55 项（M53 上收 2 项后），既有条目的前置位置序号随之变化）。其中「`ai-collaboration.md` 健康上界」与 §3.2 的「规范文件瘦身」同源归并（前者属后者子集）；台账分档（19 + 8 + 15 = 43 条候选 / 42 个主题）不因上收收缩，1.0 scope 不变；上收后 `#N` 整体前移，引用以条目主题为准。
>
> **位置序号脆弱性提示**：`#N` 为文档位置序号，任何候选增删都会使其后条目前移（2026-10-29 上收 4 条即发生）。引用候选时以「条目主题」为准，`#N` 仅作当次实测的定位辅助。
>
> **2026-10-27 用户决策**：本地日志通道统一已上收 M49 追加临时待办（不占条目编号）；Sentry 走官方 SaaS；Axiom 作为后续增量；除本地日志优化外的可观测性条目延后到 1.0 之后排期。

**候选 15 条**按主题合并为 10 组：

1. 运行面漏洞检测（镜像基底 / 运行时二进制 / OS 包，新告警源）—— #14
2. 独立 installer 容器与 runtime 工具链移出 —— #37
3. 仓库级 `allowMajorUpgrade` —— #41
4. 执行资源采集扩展 —— #43
5. 服务端跨设备扫描偏好 —— #18
6. 死代码 / 设计快照 / 体量治理（闲置解构、history 模式不可达、设计快照陈旧、`max-lines` 超标）—— #17 / #19 / #20 / #21
7. 设置页严重级别查找与展示标签 helper 收敛 —— #23
8. 企业私服独立 CDN 白名单 —— #24
9. 文档 / 规范债务（归档强调、归档 file-dead 前缀、分片口径）—— #26 / #27 / #28
10. 升级探针合批 —— #42

**暂缓 / 远期 8 项**：T703 GitLab + Bitbucket、D1 仓库级 admin、D3 多租户组织、SAML 2.0 SSO、B2 固定分支单线、C37 多设备语言偏好、C68 Git 代理 / 镜像、T705 生产级部署（PostgreSQL + Helm，记为可选形态；Sentry 已拆出为独立可观测性候选，不随 T705 暂缓）。

**决策记录**：以上 1.0 后项在 1.0 发布说明中作为「已知非目标」列出，避免用户预期错位；实施另行立项。

## 4. 真实环境验证矩阵（G3）

> 源清单：[backlog.md §待人工验收](../../plan/backlog.md#待人工验收-真实环境-随可用性推进)。本表把 T701（真实凭据 3 项）映射为 G3.0（登录）、T702 / T704 映射到 G3.4、PR Check polling 映射到 G3.5、发布管线收尾映射到 G3.8，并补充 AI（G3.9）与安装升级（G3.8）两条路径。

| # | 路径 | 现状 | 1.0 需留证据 | 前置 | backlog 条目 |
|:--|:--|:--|:--|:--|:--|
| G3.0 | 平台登录（GitHub / Google OAuth、IdP OIDC、构建期凭据按钮） | 单测 + e2e | 三种登录各一次真实闭环 + 按钮显示路径实测 | OAuth App / IdP / 构建期凭据 | T701 |
| G3.1 | CLI `report-only`（GitHub + pnpm-audit） | 单测 / nock | 一次真实仓库报告（含告警数与 MD / JSON 报告） | GitHub token | —（新增） |
| G3.2 | CLI `fix` / `fix-and-pr` | 单测 / app 级用例 | 一次真实分支 + commit + PR（含验证链与报告） | 可写测试仓库 | —（新增） |
| G3.3 | GitHub Action | 本仓库 dogfooding（已停，见 §6） | 消费者仓库一次 `workflow_dispatch` 全绿 + PR | 测试仓库 + secrets | —（新增） |
| G3.4 | 平台：扫描 / 批量 / 定时 | e2e + docker smoke | staging 一次真实扫描 + 一次定时触发（跑状态流转） | staging + Redis | T702 / T704 |
| G3.5 | 平台：PR Check / 通知 | 单测 + e2e | 一次真实 polling 落库 + 一次真实邮件投递 | 真实凭据 + 邮箱 | PR Check 真实 polling |
| G3.6 | MCP Server（8 tool） | 包已发布 + 单测 | 真实客户端（Claude / Copilot / Cursor 任一）调用扫描与修复 | MCP 客户端 | —（新增） |
| G3.7 | Agent Skill | 包已发布 + 内容测试 | 一次安装 + 对话式修复闭环 | AI 编码工具 | —（新增） |
| G3.8 | 安装与升级 | 0.6.0 已发布（npm 5 包 + 7 个 tag + GitHub Release，2026-10-29 本地 / 2026-10-28T18:24Z；`--version` 缺陷待 0.6.1；Docker 镜像待复核） | `npx` / 全局安装 / Docker 三条路径 + 0.5.x→1.0 升级 | npm + Docker | 发布管线收尾 |
| G3.9 | AI 研判（横切 G3.1-G3.5） | 全链 mock | 2 家 provider × 5 场景（成功 / 限流 / 超时 / 非法 JSON / 未配密钥） | AI Key + 预算 | —（新增） |

> 资源前置（2026-10-25 用户确认「应当提供」）：OAuth / OIDC 凭据、staging + Redis、AI API Key 与预算在 G 批次前提供；未提供则 G3 不判定，1.0 不发布。
> AI 预算：单次上限 ≤ ¥20，超限即中止本次验证并记录（不自动追加预算）。

## 5. 批次计划

| 批次 | 目标 | 内容 | 依赖 |
|:--|:--|:--|:--|
| **R（M49）** | **0.6.0 发版** | code scanning 清零 / 依赖清零 / 审计门禁转正 / 发版文档漂移 / 版本提升与发布 | 无 |
| **E** | 通知可信度（= M50） | §3.1 E 四项 | R 完成（2026-10-29 已规划 / 2026-10-30 已归档，任务正文见 [M50 归档分片](../../plan/archive/todo-archive-phases-m50.md)） |
| **F1** | 语义与数据（= M51） | §3.1 F1 九项（①③ 优先），按语义聚类为 6 原子 | M50 已闭环（2026-10-30）；**已闭环 + 归档（2026-10-30，任务正文见 [M51 归档分片](../../plan/archive/todo-archive-phases-m51.md)）** |
| **F2** | 文档与验证（= M52） | §3.1 F2 六项 + G5 复测（G8 采集顺延 G 决策） | **2026-10-31 已闭环归档**（4 原子 + 4 批追加临时待办；[M52 归档分片](../../plan/archive/todo-archive-phases-m52.md)；`gates:docs` 16 → 19 项） |
| **G** | 1.0 发布（= M53） | G2 契约冻结与迁移指南 + G7 运维实测与发布预演 + G8 指标脚本 + G5 mutation 扩面 + G3 执行框架（实跑待资源）；G4 窗口与 `@v1` 保持观察 | **2026-10-31 已上收 M53**（5 原子，用户决策：不真发 0.6.1 / 不启用自动发布 / 不承诺 1.0.0 本阶段发布；见 [todo.md](../../plan/todo.md)） |

**M49 内部顺序**：M49.1 → M49.2a → M49.2b → M49.4 → M49.3 → M49.5（M49.3 改为**先翻转、后取证**：原「翻转前累积 3 次 clean」口径因 node-forge 豁免使字面串不可达而未达成，按 §5.7 末句「修订 clean 判据」通道转正；翻转后连续 3 次 `master` push 的 prod 阻断步骤 `conclusion=success` 且日志含审计结果行，回填为证据；回填前不闭环，任一 run 失败则回退 `|| true` 或按 §5.7 评估）。

**估算口径**：按项计数（23 P0 + 8 P1 + 5 验证组 + 5 发布工程项），不按日历；日历取决于外部资源到位时间与 E/F 批次容量。

## 6. 安全策略（2026-10-25 用户决策）

- **Security Auto Fix 定时任务保持停用**（2026-10-17 起 `disabled_manually`）：dependfix 自身已由 dependfix 创建修复 PR，避免与人工 / 平台 PR 冲突；本仓库不再依赖该 Action 做自修。
- **依赖安全由「Security 门禁」承担**：Dependabot alerts 作发现面 → 依赖审计作**阻断面**（`pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org`，周回归使用同一命令）→ 全量依赖审计仅作 `test.yml` 信号步骤（不进周回归）→ code scanning 覆盖代码质量告警。
- **本轮动作（M49）**：清零未被 §5.7 豁免的 critical / high → 移除可解除的 `audit.ignore` → 已按 [security.md §5.6](../../standards/security.md#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c) 转正（2026-10-27）。`audit.ignore` 使 clean 字面串不可达，故按 §5.7 末句的「修订 clean 判据」通道**同批修订 §5.6**（阻断面 = prod 审计 ≥moderate；信号面 = 全量依赖审计；判据 = 阻断步骤 exit 0 且日志含审计结果行），3 个 `master` push run id 待回填。
- **不得**用 `--ignore` / `--ignore-unfixable` 放宽门禁；无可用修复版本的豁免按 [§5.7](../../standards/security.md#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05) 逐条登记 GHSA + 路径 + 复核条件。

## 7. 发布工程清单（G2 / G7）

- [ ] **冻结清单**：CLI 参数 / 模式、Action inputs、报告 JSON schema（`RunResult` / `FixAction` / `RunSummary`）、配置键（`DEPENDFIX_*` + 平台 `NUXT_*`）、平台 DB schema（实体 + 迁移）五类，落在 `docs/guide/release.md` 新增「1.0 契约冻结清单」章节，并标注「1.0 后变更须 2.0」。
  - **1.0 前已发生的 schema 增量（须并入冻结清单）**：`RunResult.alertOutcomes?`（M51.1，告警级处置结果，平台据此回写 `ScanResult.fixStatus`）。可选字段、缺省即 `not-tried`，对旧消费方向后兼容，但冻结后任何字段增删都按 2.0 处理。契约见 [data-model.md §告警级修复结果回写](../modules/data-model.md#告警级修复结果回写-m51-1)。
- [ ] **迁移指南** 0.x → 1.0：Node 基线、pnpm 版本、环境变量、平台数据迁移、Action 引用（`@v1`）。
- [ ] **`@v1` 滚动 tag**：1.0 发布后创建并验证 `uses: dependfix/dependfix@v1`。
- [ ] **发布自动化**：按 [release.md](../../guide/release.md) 的 1.0 规划启用 `schedule`（或 `push`）触发，首个 cron 由人工裁决。
- [ ] **回滚演练**：npm 版本 / git tag / Docker tag 三面回滚各一次。

## 8. 维护规则

1. 每批次收口更新 §2「当前读数」与「批次」列，并附证据（run id / analysis id / 命令输出 / 文档 diff）。
2. 新增 1.0 候选先入 backlog，再按 §3 分档；调整分档视为 scope 变更，需用户确认。
3. 1.0 发布后本文件转为「1.0 发布记录」（保留门槛判定与证据），不再作为活跃台账。

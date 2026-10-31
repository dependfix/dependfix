# 待办归档分片：M37 运行可观测性与体验记忆

> 本分片由 2026-10-11 M42 归档批次从 [todo-archive.md](../todo-archive.md) 主窗口预防性迁出（M42 段新增后主窗口完整段将达 6 个，超 [archive/index.md §2](../archive/index.md) 定义的 3-5 个阶段上界；M37 为主窗口最早完整段）。章节编号与锚点保持原样。

---

## M37: 运行可观测性与体验记忆（M37.1~M37.6 全部已闭环 / 2026-10-08 归档）

> **归档日期**：2026-10-08
> **阶段摘要**：承接 M36 完整闭环归档后的 backlog 候选池，2026-10-06 用户决策**方案 B（可观测性能力优先）**——从 backlog §候选评估中上收 6 项候选（另 1 项 M36.1 CI 门禁自 archive §4 保留清单上收），收敛为 5 原子条目，以「运行失败分类与筛选」为主线；同日补充授权按 [§3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 可用性插队例外追加 M37.6（目标仓库 git hooks 隔离，生产交付 blocker），并授权开 M38（设计先行，见 [roadmap §M38](../roadmap.md)）。**6 原子条目全部闭环**，覆盖 🚀 1 + 🎨 1 + 🛡️ 2 + 📚 1 + 🛠️ 1。
>
> - **M37.6** [P1 🛡️] 目标仓库 git hooks 隔离（`--no-verify` 单一常量 + 回归用例 + 常量契约断言）—— `cb5c146` + `ae0eacf`
> - **M37.1** [P2 🚀] 运行失败分类与筛选 + 落库回填（分类纯函数 + 三列 + 前缀感知迁移 + 回填脚本 + API 三维筛选 + UI 阶段展示）—— `1ea7c27` + `b40db65` + `e14edc8` + `367a286` + `4b48f7c` + `b1f62fc`
> - **M37.2** [P2 🎨] 扫描 / 批量扫描偏好记忆（设备级 localStorage + 显式默认 + 重置 + 设置页卡片）—— `d86e461` + `a012773` + `c77c437`；来源 [issue #136](https://github.com/dependfix/dependfix/issues/136)，2026-10-15 已关闭
> - **M37.3** [P3 🛡️] 批量写回与告警源错误信号残余（失败路径条件写回 + 详情响应一致性 + per-source 去重 + 提示链三源合一）—— `5382e67` + `340ca85` + `fb3ff1d`
> - **M37.4** [P3 📚] caomei-ui 版本口径同步（`0.3.0` → `0.5.0` + 结构化复扫账目）—— `fc966c2` + `6ec48f0`
> - **M37.5** [P3 🛠️] 孤立编号检测接入 CI 门禁（Test job 阻断 + 负例标定 + 规范 / 脚本说明）—— `4003e5c`
>
> **commit 数量实证**：`git log master --first-parent --oneline c4d623e..HEAD`（自 M36 归档末 commit 起）去重统计 = **19 commits**（M37.6 2 + 阶段启动 / 授权登记 2 + M37.1 6 + M37.2 3 + M37.3 3 + M37.4 2 + M37.5 1，逐项见上方列表；每个 commit 仅归属一条目，无重复计数）。
>
> **关键决策 D1-D6**（2026-10-06~08 用户裁定 + 执行期收敛）：
>
> - **D1**：组合定型方案 B（可观测性能力优先，5 原子条目）+ 补充授权追加 M37.6；UX 独立条目 1 项（M37.2），M37.1 兼含筛选与阶段展示。
> - **D2**：M37.1 本阶段仅「分类 + 筛选 + 展示」，`failure_code` / `failure_stage` / `failure_kind` 三列均落库；受约束重试入口延后登记 backlog。
> - **D3**：M37.2 载体采用方案 C 混合（localStorage 上次选择 + 可选配置化默认 + 重置，无服务端实体）；服务端跨设备偏好登记 backlog。
> - **D4**：M37.3 复用 M36.3 条件写回模式（乐观锁 = 读取时状态）——本批新增失败通道 helper（只写终态字段）并删除收敛后无调用方的「整份载荷」变体。
> - **D5**：M37.4 仅同步「版本类当前口径」，历史 / 迁移叙述保留原版本号（结构化复扫账目留痕于条目 AC）。
> - **D6**：M37.6 隔离选型为 `--no-verify`（跨平台无路径构造；`post-commit` 不在跳过范围），push 侧隔离登记 backlog。
>
> **类型平衡复核**：🚀 能力扩展 1（M37.1）/ 🎨 用户体验 1（M37.2）/ 🛡️ 技术债与交付可靠性 2（M37.3 + M37.6）/ 📚 文档 1（M37.4）/ 🛠️ CI 防护 1（M37.5）；🎨 独立条目 1 项低于建议值 2，缺口已在条目中显式标注（M37.1 承载筛选与阶段展示）。
>
> **关键实证**（细节见各条目闭环记录与相关规范文档）：
>
> - **M37.6**：隔离参数收敛为单一常量（`--no-verify` 置于 `commit` 子命令后，覆盖 husky `core.hooksPath` 重定向）；回归用例植入非 0 退出 `pre-commit`（写标记 + `exit 1`）+ 同环境裸 commit 反例防恒真。
> - **M37.1**：分类纯函数 + 集中映射表（`unknown` 兜底，未映射码保留 `code` 供审计）；`engine_delivery_failed` 从 message 的类别括号回读细分；落库覆盖全部失败写路径（含复用既有 run 时清空三列）；回填脚本 dry-run 默认 + 幂等 + 无法判定写 `unknown`；e2e 首轮捕获 `SelectItem` 空串 value 的 SSR 500（改哨兵值后两遍全绿）。
> - **M37.2**：`preferences` 构造期不读存储（`onMounted` / 打开弹窗时填充）；存储解析与读写全路径 try/catch（含访问 `localStorage` 即抛错的安全策略场景）；「上次选择」在提交时记录；设置页「未设置」哨兵清除该维度显式默认。
> - **M37.3**：新增 `persistBatchFailedIfRunning`（只写 `status` / `finishedAt` / `updatedAt`，不写计数与 summary），三条失败路径收敛 + 详情 GET 未落库一律重读；新增 `alertsFetchTokenHint` 三源合一 + 报告 catch 去重（消除重复信号与日志汇总 `unknown` 归组）。
> - **M37.4**：三处当前版本口径同步 + 结构化复扫（`0.3.0` 共 34 处 / 10 文件逐处分类，均属历史与 from-version 叙述）；同源复核发现依赖表行级不一致（登记候选）。
> - **M37.5**：负例探针确认退出码非 0（638 文件 / 1 命中 → exit 1，删除后 637 / 0 → exit 0）；步骤置于静态检查簇（`check:readme-i18n` 与 `docs:build` 之间，无兜底改写）；阻断强度口径写入步骤注释。
>
> **审计**：A 阶段覆盖全部 6 原子条目 —— M37.6（standard Pass + quick 复审 Pass）；M37.1（deep 2 分区并发 Pass → quick 复审 Pass）；M37.2（standard 2 分区并发 Pass → quick 复审 Pass）；M37.3（deep 2 分区并发 Pass → quick 复审 Pass + R2 非阻塞项收口）；M37.4（quick Pass → quick 复审 Pass + 收口 commit）；M37.5（standard Pass，3 项 suggest 已应用或判定）。全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **19**（`git rev-list origin/master ^HEAD --count` = 0，双向核验）；本归档 + 蒸馏批次 commits 另计，均待用户推送确认。
>
> **关联**：[roadmap.md §M37](roadmap-phases-m0-m38.md#m37-运行可观测性与体验记忆-2026-10-06-用户决策方案-b-2026-10-08-已闭环-归档) + [archive/index.md](../archive/index.md) + [run-failure-taxonomy.md](../../design/governance/run-failure-taxonomy.md) + [scan-preferences.md](../../design/governance/scan-preferences.md) + [backlog.md](../backlog.md)（M37 执行期延后项与审计衍生候选）

# 待办归档分片：M36 治理债清仓 + 可观测性与测试稳定性

> 本分片由 2026-10-10 M41 归档批次从 [todo-archive.md](../todo-archive.md) 主窗口预防性迁出（M41 段新增后主窗口完整段将达 6 个，超 [archive/index.md §2](../archive/index.md) 定义的 3-5 个阶段上界；M36 为主窗口最早完整段）。章节编号与锚点保持原样。

---

## M36: 治理债清仓 + 可观测性与测试稳定性（M36.1~M36.10 全部已闭环 / 2026-10-05 归档）

> **归档日期**：2026-10-05
> **阶段摘要**：承接 M35 完整闭环归档后的 backlog 候选池，2026-10-02 用户决策**方案 A（治理债清仓）**——从 backlog 上收可立即启动的 5 项候选（C81 孤立规划编号存量清理 / 设计与索引文档陈旧状态 / BatchRun 写回竞态 / 告警源可审计性判据 / api-i18n e2e 顺序偶发）；同期用户直接指令与用户报告缺陷相继追加 M36.6（镜像体积治理）/ M36.7（pnpm overrides key 归一化）/ M36.8（Docker 首次启动数据库初始化 + 部署文档）/ M36.9（扫描队列孤儿 job 释放）/ M36.10（队列模式消费者维度降级）。**10 原子条目全部闭环**，覆盖 🛡️ 7 + 📚 1 + 🚀 1 + 🧪 1。
> **commit 数量实证**：`git log master --first-parent --oneline` 自 M35 归档末 `9596b14` 起去重统计 = **42 commits**（阶段启动 `dbe2547` + 10 原子条目的实现与闭环登记）；另含非本阶段远端 commit（dependabot bump `5722929` / merge `0980e2f` / CI 豁免 `97c8056` + `be35700`）与独立研判批次（`1b981ee` 运行失败分类设计先行稿 / `52d38dc` 扫描偏好候选登记）。归档时 `git rev-list HEAD ^origin/master --count` 实测 = 0（M36 全部 commits 已推送 `origin/master`）。
> **关键决策 D1-D7**（2026-10-02~04 用户裁定 + 执行期追加）：
> - **D1**：组合定型方案 A（治理债清仓，5 原子条目）；🎨 UX 缺口显式标注。同期追加 M36.6~M36.10——M36.6 / M36.7 属 [规划规范 §3.4](../../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估问题--2026-09-10)「用户直接决策」路径，M36.8~M36.10 属 [§3.1 插队例外](../../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)第 3 类「直接影响可用性」。
> - **D2**：M36.1 判定口径「注释块级 + 真常量白名单 + 优先改写为带文档指针的导航指针，无法归指者删编号留正文」；批量替换每子批次 < 10 文件。
> - **D3**：M36.3 条件写回下沉共享层，保持 GET「对非 running 批次仍对齐计数」既有契约；不引入悲观锁。
> - **D4**：M36.4 判据改为「无任何成功源且存在失败源」；明确 `repoResults` / 报告「扫描成功」连锁语义。
> - **D5**：M36.6 对齐 momei / caomei-auth 的 `.output`-only 形态；sandbox 未来独立入口须自包含。
> - **D6**：M36.7 按语义等价类归一化 override key；major-0 caret（`^0.0` ≠ `^0`）保持区分，不引入 `semver`。
> - **D7**：M36.8 基线迁移采用实体元数据运行时生成（`Table.create`，前缀感知 + 跨方言）；compose 部署层默认 `DATABASE_MIGRATIONS_RUN=true`（应用默认仍 false）；保留手动 / 一键初始化脚本 + 补齐 Docker 部署文档。
> **类型平衡复核**：🛡️ 技术债 / 缺陷修复 7（M36.1 / M36.3 / M36.6 / M36.7 / M36.8 / M36.9 / M36.10）/ 📚 文档治理 1（M36.2）/ 🚀 可观测性 1（M36.4）/ 🧪 测试基建 1（M36.5）；🎨 用户体验由 M36.8 承载（Docker 首启即用 + 部署文档）。
> **关键实证**（细节见各条目闭环记录）：
> - **M36.1**：新增 `scripts/check-orphan-ids.mjs` + 22 用例；清理全仓孤立编号（packages/scripts 46 行 + apps/platform 157 行 + engine 2 行）；A 阶段发现检测正则漏裸 `W\d` / `S\d`（RG-B01）→ 扩展 + 回归用例，复扫 0 命中（627 文件）。
> - **M36.2**：索引 23/24 双侧 + `platform-ai-integration` 状态/组件名 + `docs-and-readme-i18n` 状态 + architecture / platform-scheduled-batch 同源项；en 索引补 Run Failure Taxonomy 行恢复 21/21 parity；A 阶段 RG-B1（同文档 §13 状态自相矛盾）修复。
> - **M36.3**：新增共享条件写回 `persistBatchAggregation`（读取时状态乐观锁）；详情 GET / sync 尾部 / 周期对账三处统一；并发用例经反向 mutation 核验非假绿。
> - **M36.4**：判据改 `failedSources.length > 0 && successfulSources === 0`；`platform.md §6.1` 落仓库级失败判据 + 连锁影响。
> - **M36.5**：根因实测=客户端 `@nuxtjs/i18n` 异步回写 `i18n_locale` cookie 竞态（证伪「同名仓库」假设）；`requestCookieHeader` 剥离 `i18n_locale` 结构性解耦；全量 e2e `--workers=1` 连跑两遍 175 passed ×2（0 flaky）。
> - **M36.6**：镜像 1.1GB → 239MB（`.output`-only）；compose 默认拉镜像 + PUID/PGID fail-closed 权限控制。
> - **M36.7**：override key 语义归一化（`@^1` 与 `@1` 只保留一种）；major-0 caret 守卫。
> - **M36.8**：新增基线迁移 `CreateInitialSchema1600000000000` + 8 早期迁移幂等 / 前缀感知 + `db:init` + 部署文档；第二轮镜像级 `ENV DATABASE_MIGRATIONS_RUN=true` + 镜像冒烟门禁。
> - **M36.9**：扫描队列孤儿 job 按 run 归属释放 + pending 排队误杀修正；真实 Redis 集成 6 passed ×3。
> - **M36.10**：`resolveQueueMode` 纳入 `inProcessWorker` 消费者维度，`auto` 无进程内 worker 自动降级同步；文档降级矩阵同步。
> **审计轮次**：A 阶段覆盖全部 10 原子条目（M36.1 2 分区 standard → quick；M36.2 standard Reject → quick；M36.3 standard Pass；M36.4 standard Pass；M36.5 standard Pass；M36.6 多轮 standard → quick；M36.7 standard → quick ×2；M36.8 3 分区 standard + 2 分区 quick；M36.9 standard Reject → quick Pass；M36.10 standard → quick），全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
> **未完成项 / 已知边界**（均登记 backlog §候选评估中，不随本阶段闭环）：① BatchRun 反向竞态（async 全部入队失败 stale save）与 stale-cleanup 无条件 save；② 详情 GET 计数无变化时并发响应瞬时不一致；③ 部分源失败汇总的仓库级错误重复信号；④ caomei-ui 版本陈旧（`tech-stack.md:36` / `platform.md:16` 标 `0.3.0`，实际 `0.5.0`）；⑤ M36.1 检测脚本未接入 CI 门禁；⑥ M36.6 未在新镜像实跑一次 `DependfixApp.run()` 全链路（需真实 GitHub 凭据）；⑦ M36.7 `^0 ↔ 0` 等罕用等价形态保守欠合并。
> **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 归档时实测 = 0（M36 全部 commits 已推送 `origin/master`）。
> **关联**：[roadmap.md §M36](../roadmap.md#m36-治理债清仓--可观测性与测试稳定性2026-10-02-用户决策方案-a--2026-10-05-已闭环--归档) + [backlog.md](../backlog.md)（M36 衍生候选）+ [archive/index.md](../archive/index.md)

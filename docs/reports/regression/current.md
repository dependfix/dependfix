# 回归日志窗口

本文件记录周期性回归检查的结果，由 `scripts/regression/run-periodic-regression.mjs` 自动维护。

## 当前窗口与索引

- 活动记录: 0 条
- 窗口限制: 8 条记录或 400 行（先到先触发滚动归档）
- 归档路径: `docs/reports/regression/archive/`

## 维护规则

1. 新记录插入到本节之后、历史记录之前。
2. 当活动记录超过 8 条或总行数超过 400 行时，触发滚动归档。
3. 归档时将最旧的记录迁移到 `docs/reports/regression/archive/` 目录。
4. 每条记录使用 `<!-- regression-window:start:id -->` 和 `<!-- regression-window:end:id -->` 标记包裹。

## 归档规则

- 归档文件命名: `YYYY-MM-DD-<profile>.md`
- 归档时保留原始格式和元数据
- 归档后更新本文件的窗口索引

---

<!-- 以下为自动生成的回归记录，手动编辑请谨慎 -->

<!-- regression-window:start:periodic-regression:weekly:2026-09-05 -->

<!-- regression-window:start:periodic-regression:pre-release:2026-09-05 -->

<!-- regression-window:start:periodic-regression:phase-close:2026-09-05 -->
## 2026-09-05 阶段收口前周期性回归（自动回填）

- 执行入口: `pnpm regression:phase-close -- --dry-run`
- 证据 artifact: [md](../../../artifacts/review-gate/2026-09-05-phase-close-regression.md) / [json](../../../artifacts/review-gate/2026-09-05-phase-close-regression.json)
- 结果摘要: `Prepared`；blocker=0，warning=0。
- 已执行验证: test:coverage=DRY RUN，security:audit-deps=DRY RUN，docs:check:i18n=DRY RUN，lint:md:check=DRY RUN，check:docs=DRY RUN，i18n:audit:missing=DRY RUN，lint=DRY RUN，typecheck=DRY RUN，build=DRY RUN，verify:changelog=DRY RUN
- 回归窗口: 53 行 / 2 条，归档判定=窗口健康。
- Review Gate: `Prepared` / `none`；主要问题=无。
- 未覆盖边界: 本轮为 dry-run，仅验证编排与回填，不代表真实回归执行结果。

<!-- regression-window:end:periodic-regression:phase-close:2026-09-05 -->

## 2026-09-05 发版前周期性回归（自动回填）

- 执行入口: `pnpm regression:pre-release -- --dry-run`
- 证据 artifact: [md](../../../artifacts/review-gate/2026-09-05-pre-release-regression.md) / [json](../../../artifacts/review-gate/2026-09-05-pre-release-regression.json)
- 结果摘要: `Prepared`；blocker=0，warning=0。
- 已执行验证: test:coverage=DRY RUN，security:audit-deps=DRY RUN，docs:check:i18n=DRY RUN，lint:md:check=DRY RUN，check:docs=DRY RUN，i18n:audit:missing=DRY RUN，lint=DRY RUN，typecheck=DRY RUN，build=DRY RUN，verify:changelog=DRY RUN
- 回归窗口: 40 行 / 1 条，归档判定=窗口健康。
- Review Gate: `Prepared` / `none`；主要问题=无。
- 未覆盖边界: 本轮为 dry-run，仅验证编排与回填，不代表真实回归执行结果。

<!-- regression-window:end:periodic-regression:pre-release:2026-09-05 -->

## 2026-09-05 周级周期性回归（自动回填）

- 执行入口: `pnpm regression:weekly -- --dry-run`
- 证据 artifact: [md](../../../artifacts/review-gate/2026-09-05-weekly-regression.md) / [json](../../../artifacts/review-gate/2026-09-05-weekly-regression.json)
- 结果摘要: `Prepared`；blocker=0，warning=0。
- 已执行验证: test:coverage=DRY RUN，security:audit-deps=DRY RUN，docs:check:i18n=DRY RUN，lint:md:check=DRY RUN，check:docs=DRY RUN，i18n:audit:missing=DRY RUN，lint=DRY RUN，typecheck=DRY RUN，build=DRY RUN
- 回归窗口: 40 行 / 1 条，归档判定=窗口健康。
- Review Gate: `Prepared` / `none`；主要问题=无。
- 未覆盖边界: 本轮为 dry-run，仅验证编排与回填，不代表真实回归执行结果。

<!-- regression-window:end:periodic-regression:weekly:2026-09-05 -->
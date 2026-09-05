# 回归记录归档

本目录存放从 `docs/reports/regression/current.md` 滚动归档的历史回归记录。

## 归档规则

1. 当 `current.md` 中的活动记录超过 8 条或总行数超过 400 行时，触发滚动归档。
2. 归档时将最旧的记录迁移到本目录。
3. 归档文件命名格式: `YYYY-MM-DD-<profile>.md`
   - `YYYY-MM-DD`: 回归检查执行日期
   - `<profile>`: 回归检查配置文件名称（weekly/pre-release/phase-close）

## 文件格式

归档文件保留原始回归记录的完整格式，包括:

- 执行入口命令
- 证据 artifact 链接
- 结果摘要
- 已执行验证列表
- 回归窗口状态
- Review Gate 结论
- Findings（blocker/warning）

## 访问方式

归档文件可通过以下方式访问:

- 直接浏览本目录
- 从 `current.md` 中的证据 artifact 链接跳转
- 使用 `git log` 查看历史变更

## 维护说明

- 归档文件由 `scripts/regression/run-periodic-regression.mjs` 自动创建
- 手动编辑归档文件时请保持格式一致性
- 定期清理过期的归档文件（建议保留最近 6 个月的记录）

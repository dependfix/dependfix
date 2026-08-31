# Server Database Scripts

一次性数据迁移 + 运维脚本。所有脚本通过 `tsx` 直接运行 TypeScript 源码，无需先 build。

## backfill-scan-result（M20.7 一次性脚本）

### 背景

旧 schema 的 ScanResult 是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），无 reconcile 逻辑，
上游已关闭的告警永远残留。M20.3 升级为 per-alert 模型（每行 = 一个独立告警），M20.5 API 加 `supersededAt IS NULL`
默认过滤，M20.6 前端"显示已解决"开关。

本脚本把现有 N×run 重复行迁移到新模型：

- **决策 1**：fixStatus='success' 永不被 supersede（保留修复记录）
- **决策 2**：聚合时若有 success 行保留该行；否则保留最早 createdAt 行；其他 DELETE
- **决策 3**：upstreamId 必须规范化。本脚本合成的 upstreamId 使用 `${source}:backfill-${rowId}` 命名空间隔离
  （避免与 todo.md §M20.1 `normalizeUpstreamId()` 输出冲突，未来 reconcile 用真 ID 创建新行不会命中）
- **决策 4**：fixStatus='success' 行不受 supersededAt 影响

### 用法

```bash
# 1. 预览迁移计划（默认模式，不写库）
pnpm db:backfill:dry-run

# 2. 实跑迁移（必须 --apply + y/N 二次确认）
pnpm db:backfill
# 脚本会先打印 dry-run 计划 + 询问 "确认实跑？(yes/no):"
```

### 数据库连接

沿用 `createDataSourceOptions` 逻辑，通过环境变量配置：

- `DATABASE_PATH`：SQLite 数据库路径（默认 `data/dependfix.sqlite`）
- `DATABASE_TYPE`：mysql / postgres / sqlite（默认 sqlite）
- `DATABASE_URL`：MySQL/PostgreSQL 连接串

### 安全门

1. **默认 dry-run 模式**：未传 `--apply` 时只打印计划
2. **y/N 二次确认**：apply 模式必须交互式确认
3. **整批事务化**：所有 DELETE / UPDATE 包在一个事务里，失败回滚保证"全成功或全失败"

### 幂等性

重复执行结果一致：

- 第二次执行时 `toDelete` 长度 0（行已删）
- 第二次执行时 `toSupersede` 长度 0（行已 superseded，filter IsNull() 排除）
- 第二次执行时 `preservedSuccess` 计数仍正确（success 行永远保留）

### 回滚

本脚本**不**实现自动回滚。建议：

1. 迁移前备份数据库（`cp data/dependfix.sqlite data/dependfix.sqlite.bak`）
2. 迁移后发现问题：`cp data/dependfix.sqlite.bak data/dependfix.sqlite`
3. 严重场景：revert git commit + 重新跑 migrations

### 输出示例

```
[DRY-RUN] backfill 统计
  仓库数:           3
  处理前行数:       91
  处理后行数:       13  (减少 78 行)
  删除重复行:       78
  保留修复记录:     5  (fixStatus='success' 永不被 supersede)
  标记已关闭:       8
```
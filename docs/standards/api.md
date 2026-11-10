# API 规范

## 1. 概述

本文档定义 dependfix 平台后端的 API 通用规范，包括响应格式、状态码和参数校验规则。

## 2. HTTP 方法

| 方法 | 用途 |
|------|------|
| GET | 获取资源（幂等） |
| POST | 创建新资源 |
| PUT | 更新资源 |
| DELETE | 删除资源 |

## 3. 统一响应格式

```typescript
interface ApiResponse<T = any> {
    code: number       // 业务状态码，200 表示成功
    message: string    // 状态描述或错误信息
    data?: T           // 成功时返回的数据
}
```

### 状态码

| Code | Description |
|------|-------------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |

## 4. 分页格式

```typescript
interface PaginatedData<T> {
    items: T[]
    total: number
    page: number
    limit: number
    totalPages: number
}
```

**排序确定性（严格约束）**：列表查询（含分页 / 截断 `take(N)`）必须显式排序；主排序键可并列（同毫秒时间戳、同分组名）时追加唯一列（通常主键）`DESC` 作次键——行序不得依赖数据库返回顺序，否则同一查询两次可能不同（视觉基线与截断集合抖动）。次键只保证确定性，业务意图顺序仍由数据显式决定。本约束自 2026-10-30 起对**新增 / 修改**的列表查询生效，已挂 [review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md)。平台侧覆盖进度（2026-11-10）：已覆盖 alerts 分组、`runs`（列表 / 导出，见 §4.1）、`audit-events`、`pr-checks`、`notifications`、`batch-runs` 列表、`runs/[id]` 结果明细；**已知仍未纳入**（本次未做全量清单，需另立条目评估，属存量未覆盖而非违规）：`repos` / `schedules` / `credentials`、`scan-history/summary`（`take(500)` 统计窗口）、`batch-runs/[id]` 子运行列表。

### 4.1 runs 列表排序与开始时间区间（`GET /api/runs` / `GET /api/runs/logs-export`）

两个端点共用同一套参数与排序实现（`server/utils/runs-query.ts`），导出取数顺序必须与列表一致：

| 参数 | 取值 | 语义 |
|:--|:--|:--|
| `sortBy` | `createdAt`（缺省）/ `startedAt` | 主排序键；缺省为既有 `createdAt DESC`（此时忽略 `sortOrder`），显式传入时按 `sortOrder` 排序 |
| `sortOrder` | `asc` / `desc`（缺省 `desc`） | 主排序键方向 |
| `from` / `to` | ISO 8601（必须带时区，如 `2026-09-01T00:00:00.000Z`） | `startedAt` 闭区间；`from > to` → 400；`startedAt` 为 NULL 的行在区间过滤时被排除 |

**NULL 语义（跨库统一）**：`startedAt` 排序时 NULL 行固定排在末尾（与 asc / desc 无关），实现为 `CASE WHEN started_at IS NULL THEN 1 ELSE 0 END ASC`，避免 PostgreSQL（`DESC` 默认 NULLS FIRST）与 SQLite / MySQL 的差异；主键并列时按 `createdAt DESC, id DESC` 保证翻页稳定。

**UI 已知边界**：caomei `DataTable` 未暴露 `manualSorting`，受控排序后仍会对**当前页**做一次客户端排序；服务端的 NULL 末尾契约在「同一页同时含 NULL / 非 NULL」时可能被组件库重排。接口与导出以服务端结果为准，页面仅作展示。

**导出**：窗口导出（显式 `page` / `pageSize`）与全量导出均应用同一 `sortBy` / `sortOrder` / `from` / `to`；文件头写 `# 筛选：from=...` / `# 筛选：to=...`，与列表同源。

## 5. 认证

- 使用 better-auth 作为认证框架
- 基于 Cookie 的 Session 机制
- API handler 使用守卫函数进行权限校验

## 6. 参数校验

- 所有输入使用 Zod schema 校验
- 前后端共用的 schema 定义在独立模块中

## 7. 相关文档

- [安全规范](./security.md)
- [开发规范](./development.md)

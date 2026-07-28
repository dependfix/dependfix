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

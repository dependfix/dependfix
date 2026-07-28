# 性能规范

> 本文档作为占位规范，平台阶段开发时将补充具体基线。

## 1. 适用范围

- Nuxt 全栈平台核心页面（首页、仪表板等）
- 客户端 JS/CSS 构建产物

## 2. Lighthouse 基线（目标态）

| 维度 | 目标 |
|------|:----:|
| Performance | >= 90 |
| Accessibility | >= 90 |
| Best Practices | >= 90 |
| SEO | >= 90 |

## 3. 资源预算

- 首屏客户端 JS（gzip）：<= 260KB
- 单异步 Chunk（gzip）：<= 120KB
- PR 增量预算：<= 20KB（gzip）

## 4. 相关文档

- [开发规范](./development.md)

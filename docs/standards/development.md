# 开发规范

本文档从 momei 继承并适配，定义 dependfix 项目的编码规范。

## 1. 核心原则

- 最小改动原则：只改必须改的，不做无关重构。
- 显式优于隐式：类型、导入、导出都应明确声明。
- 早返回，少嵌套：优先 guard clause。
- 错误处理：不吞异常，不空 catch。

## 2. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 文件 | `kebab-case.ts` | `app-error.ts` |
| 类型/接口 | `PascalCase`，优先 `interface` | `RuntimeConfig` |
| 函数/变量 | `camelCase` | `resolveRuntimeConfig` |
| 常量 | `UPPER_SNAKE_CASE` | `RUNTIME_MODES` |

## 3. 目录约束

```
packages/core/src/
├── alerts/       # 告警模型
├── errors/       # 错误模型
├── filters/      # 过滤器
├── planner/      # 修复规划
├── report/       # 报告
├── toolchain/    # 工具链
└── utils/        # 通用工具（纯函数，不依赖外部服务）
```

- `packages/core/` 不依赖任何运行时环境（Node / 浏览器 API）
- `packages/cli/` 可依赖 Node.js API
- 禁止循环引用

## 4. TypeScript

- 严格模式（`strict: true` 以后启用，当前 `noImplicitAny: false` 为过渡状态）
- 类型检查 `tsc --noEmit` 必须通过
- 不允许 `any` 逃逸（逐步收紧）

## 5. 测试

- 单元测试与源文件同目录（`foo.spec.ts`）
- 优先 Vitest

## 6. 相关文档

- [测试规范](./testing.md)
- [API 规范](./api.md)
- [安全规范](./security.md)

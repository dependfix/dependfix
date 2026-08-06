# 开发规范

## 1. 核心原则

- **模块化与组件化**: 遵循高内聚低耦合，公共逻辑迁移到 `utils/` 或可复用模块。
- **降低耦合度**: 纯函数与副作用代码分层；核心模块依赖方向单向、可注入。
- **提升复用率**: 重复逻辑抽象为工具函数，删减样板代码。
- **类型安全**: 全面使用 TypeScript。严禁使用 `any`，不确定类型时优先使用 `unknown` + 类型守卫。
- **显式假设原则**: 需求、边界不清晰时，必须先暴露假设并澄清，禁止靠默认猜测推进实现。
- **搜索优先原则**: 当需要外部信息或根因不明确时，优先搜索获取一手信息。详见 [AI 协作规范](./ai-collaboration.md)。
- **最小变更原则**: 聚焦目标本身，减少对无关代码的触动。
- **实用性优先**: 避免过度设计。引入新功能前评估真实价值与成本。
- **决策梯子原则**: 实现前按顺序判断 —
  1. 真的需要做吗？不需要就跳过（YAGNI）
  2. 代码库里已经有了？复用，别重写
  3. 已安装的依赖能解决？用现有依赖
  4. 能用 util 封装？封装复用
  5. 能一行搞定？一行
  6. 实在不行：写最少能工作的代码

## 2. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 文件 | `kebab-case.ts` | `app-error.ts`、`runtime-config.ts` |
| Vue 组件 | `PascalCase.vue` | `DashboardView.vue` |
| 类型/接口 | `PascalCase`，优先 `interface` | `NormalizedSecurityAlert`、`RuntimeConfig` |
| 函数/变量 | `camelCase` | `resolveRuntimeConfig`、`isValidRepoIdentifier` |
| 常量 | `UPPER_SNAKE_CASE` | `RUNTIME_MODES`、`SEVERITY_THRESHOLDS` |

## 3. 注释规范

- **注释只解释关键点**: 优先说明"为什么这样写""边界条件""隐含约束/副作用"，不把代码表面行为复述一遍。
- **复杂逻辑必须补注释**: 涉及复杂分支、状态切换、兼容性兜底、协议契约、性能或安全取舍的代码必须加注释。
- **导出函数默认应有 JSDoc**: 简要说明用途、边界、返回语义与副作用。
- **禁止无效或过量注释**: 不机械给每行、每个变量加注释。
- **注释必须随实现同步**: 修改逻辑时同步更新或删除过时注释。
- **禁止开发流程编号标记**: 注释与测试名中一律不得出现 `C1:`、`T303`、`G2`、`M4+`、`R2`、`P0` 这类规划 / 任务 / 审计 / backlog 编号（含 `C1：xxx` 与 `it('C1: xxx')` 形式）。阶段与编号是规划文档（`docs/plan/`）中区分进度的概念，代码中无意义且无法反查；追溯用 `git blame` / 审计记录。例外：代码内真实存在的常量（如 HTTP 错误码 `E401`），以及**指向规划文档的导航说明**（如"背景详见 `docs/plan/todo.md`「已知缺口 G2」"、"见 todo.md G3"、"见 backlog B1"）——导航指针内的规划编号属例外，因为它们提供真实可查的文档锚点，但必须同时写明文档路径或章节名，不得只写孤立编号。**执行挂接**：D 阶段自检（full-stack-master agent）与 A 阶段 Review Gate 必查项（code-auditor agent）均含本检查；违反案例见 [经验归档 §十六](../design/governance/2026-08-06-experience-archive.md)。
- **同一解释只写一处**: 相同背景说明（平台坑、口径、设计取舍）在仓库内只保留一处，通常放在首次出现或语义最贴近的位置；其他位置要么不写，要么用一句话指向文档。
- **详细解释放文档，代码只留短指针**: 完整设计背景、复盘结论、口径变更写入 `docs/design/`、`docs/research/` 或复盘文档；代码注释只保留一句"为什么"或文档指针，不展开长文。
- **简化标记约定**: 主动选择简化实现时使用 `// lean:` 标记：
  ```typescript
  // lean: global lock, per-account locks if throughput matters
  // lean: single query, batch if > 1000 items
  ```

## 4. 目录约束

```
packages/core/src/           # 核心域层，不依赖任何运行时环境
├── alerts/                  # 告警标准化模型
├── errors/                  # 错误模型（AppError）
├── filters/                 # 告警过滤引擎
├── planner/                 # 修复规划模型
├── report/                  # 报告模型
├── toolchain/               # 工具链策略
└── utils/                   # 纯函数工具（不依赖外部服务）

packages/cli/src/            # CLI 入口，可依赖 Node.js API
├── cli/                     # 参数解析与运行入口
├── config/                  # 配置层（多源合并、校验）
├── github/                  # GitHub API 集成
├── fixers/                  # 修复器（dependency / pnpm / code-scanning）
├── runners/                 # 执行器
└── app.ts                   # 应用骨架

apps/platform/               # Nuxt 全栈平台（后续阶段）
├── server/                  # API 路由、中间件、数据库
├── pages/                   # 页面路由
├── components/              # Vue 组件
├── composables/             # 组合式 API
└── utils/                   # 前后端工具函数
```

### 依赖约束

- `packages/core/` 不依赖任何运行时环境（Node / 浏览器 API）
- `packages/cli/` 可依赖 Node.js API，但核心编排逻辑应与 CLI 入口松耦合
- `packages/core/` ← `packages/cli/` 单向依赖，禁止反向
- 禁止循环引用

## 5. TypeScript

- 严格模式逐步收紧（当前 `noImplicitAny: false` 为过渡状态）
- `tsc --noEmit` 必须通过
- 禁止 `any` 逃逸（逐步清零）
- 优先使用 `interface` 定义类型，需要联合类型时使用 `type`

### 5.1 工程经验

#### 5.1.1 错误路径 helper 自身不抛异常

- 统一用 `toErrorMessage(value)` 提取错误消息（Error→message、string→原样、可序列化→JSON、其余→类型描述），禁止在 catch 块手写 `instanceof` 分支。
- 错误路径 helper 必须 try/catch 包裹 `JSON.stringify`（循环引用会 throw，掩盖原始错误），且必须有单测锚定。

#### 5.1.2 日志输出人读/机读双模

- 所有输出考虑"人读 vs 机读"双路径：`process.stdout.isTTY` 检测 → TTY 输出格式化彩色文本，非 TTY（CI/管道）输出 JSON。

#### 5.1.3 截断带固定前缀的 ID 先去除前缀

- 对 `prefix-<唯一段>` 形式的 ID，禁止直接 `slice(0, N)`（唯一部分会被丢光）；先去掉固定前缀再截断，或取最后一个分隔段。
- 文件名/分支名采用 `YYYYMMDD-HHmmss-{唯一尾段}`（字典序==时间序且唯一）。

#### 5.1.4 改名/迁移全局排查命名残留

- 命名前缀抽为统一常量 + 封装读取辅助，所有读取必须走它（防漏网）。
- 改名后全局搜索旧名（含 env 前缀、错误消息、注释、示例），不只看文件引用。

## 6. 样式规范（平台阶段适用）

- **纯 SCSS**: 禁止 CSS-in-JS、Tailwind。所有样式以纯 SCSS 编写。
- **SCSS 复用**: 优先使用全局变量（Variables）和混合宏（Mixins）。
- **BEM 命名**: 组件样式遵循 `block__element--modifier` 规范。
- **禁止 `!important`**: 破坏 CSS 层级结构。
- **暗色模式**: 通过 `:global(.dark) .selector` 覆盖样式。

## 7. 包命名规范

| 子包 | npm 名 | 类型 | 说明 |
|------|--------|------|------|
| `packages/core` | `@dependfix/core` | 内部库 | 核心领域模型，被其他包消费 |
| `packages/cli` | `dependfix` | CLI 工具 | 用户通过 `npx dependfix` 调用 |
| `packages/github` | `@dependfix/github` | 内部库 | GitHub API 集成 |
| `packages/action` | `@dependfix/action` | Action | GitHub Action 入口 |
| `packages/mcp` | `@dependfix/mcp` | MCP Server | MCP 协议服务 |

- CLI / 可执行入口使用 **unscoped** `dependfix` 名称
- 内部库使用 **scoped** `@dependfix/*` 前缀

## 8. 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档变更
- `refactor`: 代码重构
- `test`: 测试相关
- `ci`: CI 配置变更
- `chore`: 构建/工具链变动
- `perf`: 性能优化

提交语言使用中文或用户使用的语言。单次提交对应一个逻辑变更，避免"大杂烩"提交。

## 9. 提交前检查

在 `git commit` 之前必须通过以下检查：

1. **Review Gate**: 所有改动必须经过至少一轮 review，且 A 阶段（`@code-auditor`）已放行。
2. **Lint**: `pnpm lint` 零 error。
3. **Typecheck**: `pnpm typecheck` 零 error。
4. **测试**: 定向测试通过；命中全量测试条件时执行 `pnpm test`。
5. **提交执行**: 必须通过 `conventional-committer` skill 提交（禁止裸 `git commit -m`），详见 [Git 规范](./git.md) 与 [AGENTS.md 提交规范](../../AGENTS.md#提交规范-commit-convention)。

## 10. 相关文档

- [测试规范](./testing.md)
- [API 规范](./api.md)
- [安全规范](./security.md)
- [文档规范](./documentation.md)
- [项目规划规范](./planning.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。

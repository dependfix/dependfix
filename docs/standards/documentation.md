# 文档规范

## 1. 文档结构

```
docs/
├── index.md                 # 文档站首页（VitePress）
├── design/                  # 架构、数据模型、安全设计
│   ├── architecture.md      # 系统架构与模块边界
│   ├── data-model.md        # 标准化告警/配置/报告模型
│   └── security.md          # 认证体系、Prompt 防护、平台安全
├── guide/                   # 使用指南
│   ├── quick-start.md       # 快速开始
│   ├── configuration.md     # 配置说明
│   ├── tech-stack.md        # 技术栈详解
│   └── ai-development.md    # AI 协同开发指南
├── plan/                    # 规划与任务
│   ├── roadmap.md           # 路线图（阶段概览）
│   ├── todo.md              # 当前阶段任务
│   └── backlog.md           # 待办积压（后续阶段详细任务）
├── research/                # 调研与策略
│   ├── competitive-research.md
│   ├── cost-estimate.md
│   └── strategy.md
├── archive/                 # 历史文档归档
└── standards/               # 项目规范（本目录）
```

## 2. Markdown 约定

- **单个 H1 标题**: 每个文件一个 `# 标题`，层级不跳级（`#` → `##` → `###`）
- **中文语境**: 统一使用全角括号 `（）`，禁止半角括号混用
- **代码块**: 标注语言 ` ```typescript `、` ```bash `、` ```yaml `
- **图表**: 优先使用 Mermaid，不嵌入难维护的图片描述
- **VitePress 容器**: 关键信息使用 `::: info` / `::: warning` / `::: danger`
- **链接**: 使用相对路径，确保路径真实可用。本地文件链接默认**不带锚点**（`path.md`）：锚点 slug 规则跨平台不一致（GitHub 移除全角标点 `（）`、`、` 等，VS Code / VitePress 保留），带锚点链接在部分平台会失效；必须带锚点时，目标标题避免全角标点，且锚点需能被 [`check:links` 脚本](../../scripts/check-links.mjs) 验证通过
- **链接检查**: `pnpm run check:links`（`scripts/check-links.mjs`，零依赖）验证全部 md 文件的本地路径存在性与锚点匹配——按宽松规范化（小写 + 移除标点/符号/空白）兼容 GitHub / VS Code / VitePress 三种 slug 规则差异，只抓真实断链与假锚点，已接入 CI（test.yml）

## 3. 文档行数阈值

| 文档 | 健康窗口 | warning 触发 | 强制分片 |
|------|:-------:|:-----------:|:-------:|
| README | <= 300 行 | 301-400 | > 400 行 |
| `roadmap.md` | <= 800 行 | 801-900 | > 900 行 |
| `todo.md` | <= 500 行 | 501-600 | > 600 行 |
| `backlog.md` | <= 500 行 | 501-700 | > 700 行 |
| `todo-archive.md` | <= 500 行 | 501-700 | > 700 行 |

超阈值时优先拆分到 `archive/` 分片，主文档保留近线窗口与索引入口。

## 4. 事实源层次

| 层级 | 文件 | 职责 |
|:----:|------|------|
| L0 | `AGENTS.md` | 项目级 AI 行为准则、安全红线、角色矩阵 |
| L1 | `docs/standards/*.md` | 专项规范（开发、测试、文档等） |
| L2 | `docs/design/*.md` | 架构与数据模型设计 |
| L3 | 平台适配文件 | 工具差异、目录发现 |

冲突顺序：L0 > L1 > L2 > L3。

## 5. 设计文档分层

- **模块设计**: 稳定模块总设计写入 `docs/design/`
- **治理/专题**: 专项治理、迁移方案、评估报告写入 `docs/design/` 或后续的 `docs/design/governance/`

## 6. 文档同步原则

- 代码变更时同步更新相关设计文档
- 路径、链接、命令必须真实可用
- 设计文档先于大规模实现落盘
- README 简洁入口，细节回收到 `docs/` 专题页

## 7. 相关文档

- [开发规范](./development.md)
- [项目规划规范](./planning.md)
- [Git 规范](./git.md)

> 本文档从上游 momei 项目继承并适配，更新规范时优先参考其最新版本。

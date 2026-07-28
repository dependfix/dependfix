# 项目规范 (Project Standards)

> 本文件为 dependfix 项目级规范的索引入口。各专项规范的详细内容以独立文件形式存放于本目录。

## 规范复用策略

本项目当前处于早期开发阶段（M0→M1），在形成自身完整的项目规范前，**默认参照 [momei](https://github.com/CaoMeiYouRen/momei) 项目的成熟规范体系执行**。

最迟在正式发布（v1.0.0）前，本项目应完成规范独立化，将 momei 中适用的部分内化并裁剪为适合本项目的版本。

## 规范索引

| 规范 | 当前策略 | 说明 |
|------|---------|------|
| AI 协作规范 | 参照 momei `docs/standards/ai-collaboration.md` | PDTFC+ 工作流、搜索优先原则、验证矩阵 |
| 开发规范 | 参照 momei `docs/standards/development.md` | 命名规范、目录约束、模块分层 |
| 文档规范 | 参照 momei `docs/standards/documentation.md` | 文档层级、标题规范、Mermaid 图表 |
| 测试规范 | 参照 momei `docs/standards/testing.md` | Vitest + Playwright、测试分级、覆盖率目标 |
| 安全规范 | 参照 momei `docs/standards/security.md` | 安全红线、密钥管理、输入校验 |
| 项目规划 | 参照 momei `docs/standards/planning.md` | 路线图维护、里程碑定义、任务分解 |
| Git 规范 | 参照 momei `docs/standards/git.md` | 分支策略、提交规范、PR 流程 |
| API 规范 | 参照 momei `docs/standards/api.md` | REST API 设计、错误码、分页规范 |

## 项目级特殊约定

以下约定为 dependfix 项目特有，或与 momei 存在差异：

### 执行模式

- 本项目的 CLI 支持三种运行模式（`report-only` / `fix` / `fix-and-pr`），与本地/CI 运行模式正交
- AI 研判相关功能默认不自动合并，仅创建分支/PR 待人工审核

### 安全告警处理优先级

1. Critical 的依赖漏洞
2. High 的依赖漏洞
3. 会阻塞 CI 的 lockfile 问题
4. 可模板化处理的 code scanning 问题
5. 其余问题只输出建议

### 文档结构约定

```
docs/
├── index.md                 # 文档站首页
├── design/                  # 架构、数据模型、安全设计
├── guide/                   # 快速开始、配置、技术栈
├── plan/                    # todo、roadmap、backlog
├── research/                # 竞品分析、策略、成本估算
├── archive/                 # 历史设计文档归档
└── standards/               # 项目规范（本目录）
```

### 质量门

参见 [AGENTS.md §必要检查](../../AGENTS.md#必要检查)：

- `lint` 和 `typecheck` 是代码变更的基线检查
- `build` 和 `test` 按改动影响按需执行
- 所有改动在最终交付前须经过 `code-reviewer` 审查

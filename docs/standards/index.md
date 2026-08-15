# 项目规范 (Project Standards)

> 本文件为 dependfix 项目级规范的索引入口。各专项规范的详细内容以独立文件形式存放于本目录。

## 规范复用策略

本项目的 AI 协作规范、开发规范、文档规范、测试规范在 1.0.0 前参考 [momei](https://github.com/CaoMeiYouRen/momei) 项目的成熟体系完成独立化；1.0.0 后按本项目自身实践演进，形成自有规范。

以下为本项目已自主维护的规范文档：

## 规范索引

| 规范 | 文件 | 说明 |
|------|------|------|
| AI 协作规范 | [ai-collaboration.md](ai-collaboration.md) | PDTFC+ 工作流、搜索优先原则、验证矩阵 |
| AI 资产治理 | [ai-governance.md](ai-governance.md) | Skills / Agents 分层、命名、生命周期 |
| 开发规范 | [development.md](development.md) | 命名规范、目录约束、模块分层 |
| 文档规范 | [documentation.md](documentation.md) | 文档层级、标题规范、Mermaid 图表 |
| 测试规范 | [testing.md](testing.md) | Vitest + Playwright、测试分级、覆盖率目标 |
| 安全规范 | [security.md](security.md) | 安全红线、密钥管理、输入校验、AI 输出安全 |
| 项目规划 | [planning.md](planning.md) | 路线图维护、里程碑定义、任务分解、归档流程 |
| Git 规范 | [git.md](git.md) | 分支策略、提交规范、Review 前置 |
| API 规范 | [api.md](api.md) | REST API 设计、错误码、分页规范 |
| 性能规范 | [performance.md](performance.md) | Lighthouse 基线、资源预算（平台阶段适用） |
| 外部 Skills | [external-skills-intake.md](external-skills-intake.md) | 外部 skill 准入清单与失效处理 |
| i18n 规范 | [i18n.md](i18n.md) | README/docs 多语言、平台 UI 国际化、语言分级与回退链 |

## 开发指南

| 指南 | 文件 | 说明 |
|------|------|------|
| AI 协同开发 | [../guide/ai-development.md](../guide/ai-development.md) | Agent-First 开发流程与 PDTFC+ 实践 |

## 项目级特殊约定

以下约定为 dependfix 项目特有：

### 执行模式

- 本项目 CLI 支持三种运行模式：`report-only` / `fix` / `fix-and-pr`
- AI 研判相关功能默认不自动合并，仅创建分支/PR 待人工审核

### 安全告警处理优先级

1. Critical 的依赖漏洞
2. High 的依赖漏洞
3. 会阻塞 CI 的 lockfile 问题
4. 可模板化处理的 code scanning 问题
5. 其余问题只输出建议

### 质量门

参见 [AGENTS.md §必要检查](../../AGENTS.md#必要检查)：

- `lint` 和 `typecheck` 是代码变更的基线检查
- `build` 和 `test` 按改动影响按需执行
- 所有改动在最终交付前须经过项目内 [code-reviewer](../../.github/skills/code-reviewer/SKILL.md) 审查

# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 | 状态 |
|------|------|--------|:----:|
| M0: 基线收敛 | 项目骨架、配置模型、工具链策略 | P0 | 已完成 |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 | 未开始 |
| M2: GitHub Action 接入 | workflow_dispatch + 定时 + PR | P1 | 未开始 |
| M3: Code Scanning 扩展 | 规则分级、可模板化修复、建议输出 | P1 | 未开始 |
| M4: 多仓库治理 | 自动发现、并发控制、报告归档 | P2 | 未开始 |
| M5: AI Breaking Change 研判 | Changelog 采集、AI 分析、修复生成 | P1 | 未开始 |
| M6: 平台化 | Nuxt 全栈 + RBAC + 任务队列 + 批量处理 | P2 | 未开始 |

## M0: 基线收敛

把项目从模板状态收敛到可承载自动化方案的基础形态。包括：项目骨架搭建、核心配置模型、工具链策略固定、标准告警模型定义。

## M1: MVP 单仓库自动修复

跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取、过滤、修复、验证和报告的全链路闭环。这是项目的首个可运行版本。

## M2: GitHub Action 接入

将 M1 能力接入 GitHub Actions，支持 `workflow_dispatch` + `schedule` 触发，输出报告 artifact，支持创建修复分支与 PR，使用最小权限集。

## M3: Code Scanning 扩展

接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

## M4: 多仓库治理增强

支持 owner 级仓库自动发现、并发控制与失败隔离、仓库白名单/黑名单策略、报告归档与趋势统计。

## M5: AI Breaking Change 研判

引入 AI 能力：Changelog / Release Notes 采集、多 AI 提供商封装、AI 研判（问题分类 + 修复方案 + 代码 patch）、AI 输出安全校验与质量门、修复经验提取与复用。

## M6: 独立平台部署

Nuxt 全栈 Web UI + REST API、Git 仓库连接管理（GitHub / GitLab / Bitbucket）、BullMQ + Redis 任务队列、RBAC 权限管理、批量处理与聚合报告、Docker Compose / Helm Chart 部署。

---

## 详细任务

- 当前阶段任务（M0-M1）：[todo.md](todo.md)
- 后续阶段任务（M2-M6）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录

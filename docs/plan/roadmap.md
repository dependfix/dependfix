# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 | 状态 |
|------|------|--------|:----:|
| M0: 基线收敛 | Monorepo 骨架、配置模型、工具链策略、告警模型 | P0 | 已完成 |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 | 未开始 |
| M2: GitHub Action 接入 | workflow_dispatch + 定时 + PR + AI Token + Prompt 防护 | P1 | 未开始 |
| M3: Code Scanning 扩展 | 规则分级、可模板化修复、建议输出 | P1 | 未开始 |
| M4: 多仓库治理 | 自动发现、并发控制、报告归档 | P2 | 未开始 |
| M5: AI Breaking Change 研判 | Changelog 采集、LLM 研判、修复生成、质量门 | P1 | 未开始 |
| M6: 最小平台 MVP | 仓库管理、凭据管理、手动扫描、仪表板、Docker 部署 | P1 | 未开始 |
| M7: 企业级平台增强 | RBAC、BullMQ+Redis、跨平台 Git、批量处理、Helm Chart | P2 | 未开始 |

## M0: 基线收敛

Monorepo 骨架搭建、核心配置模型、工具链版本策略固定、标准化告警模型定义。已完成。

> 详细任务与完成记录见 [todo-archive.md §M0](todo-archive.md#m0-基线收敛已归档)

## M1: MVP 单仓库自动修复

跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取、过滤、修复、验证和报告的全链路闭环。

> 详细任务见 [todo.md §M1](todo.md#m1-mvp-单仓库自动修复)

## M2: GitHub Action 接入

将 M1 能力接入 GitHub Actions，支持 `workflow_dispatch` + `schedule` 触发，输出报告 artifact，支持创建修复分支与 PR。包含用户自定义 AI Token 支持和 Prompt 注入防护。

> 详细任务见 [backlog.md §M2](backlog.md#m2-github-action-接入)

## M3: Code Scanning 扩展

接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

> 详细任务见 [backlog.md §M3](backlog.md#m3-code-scanning-扩展)

## M4: 多仓库治理增强

支持 owner 级仓库自动发现、并发控制与失败隔离、仓库白名单/黑名单策略、报告归档与趋势统计。

> 详细任务见 [backlog.md §M4](backlog.md#m4-多仓库治理增强)

## M5: AI Breaking Change 研判

Changelog / Release Notes 采集、多 AI 提供商封装、AI 研判（问题分类 + 修复方案 + 代码 patch）、AI 输出安全校验与质量门。

> 详细任务见 [backlog.md §M5](backlog.md#m5-ai-breaking-change-研判)

## M6: 最小平台 MVP

在 M5 完成后交付一个可独立部署的集中管理平台的最小可用版本：仓库管理、凭据管理、手动触发扫描、仪表板、Docker Compose 部署。

> 详细任务见 [backlog.md §M6](backlog.md#m6-最小平台-mvp)

## M7: 企业级平台增强

补齐多租户、高可用与跨平台能力：RBAC 权限、BullMQ + Redis 任务队列、GitLab/Bitbucket 支持、定时批量、PostgreSQL、Helm Chart。

> 详细任务见 [backlog.md §M7](backlog.md#m7-企业级平台增强)

---

## 详细任务

- 当前阶段任务（M0-M1）：[todo.md](todo.md)
- 后续阶段任务（M2-M7）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录

# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 | 状态 |
|------|------|--------|:----:|
| M0: 基线收敛 | Monorepo 骨架、配置模型、工具链策略、告警模型 | P0 | 已完成 |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 | 已完成 |
| M2: GitHub Action 接入 | workflow_dispatch + 定时 + PR + AI Token + Prompt 防护 | P1 | 已完成（2026-08-05 归档；G2 处置闭环） |
| M3: Code Scanning 扩展 | 规则分级、可模板化修复、建议输出 | P1 | 已完成（2026-08-06 归档；T301-T305 全部完成） |
| M4: 多仓库治理 | 自动发现、并发控制、报告归档 | P2 | 进行中（2026-08-06 启动） |
| M5: AI Breaking Change 研判 | Changelog 采集、LLM 研判、修复生成、质量门 | P1 | 未开始 |
| M6: 最小平台 MVP | 仓库管理、凭据管理、仪表板、MCP Server、Docker 部署 | P1 | 未开始 |
| M7: 企业级平台增强 | RBAC、BullMQ+Redis、跨平台 Git、MCP Skill 集成、Helm Chart | P2 | 未开始 |

## M0: 基线收敛

Monorepo 骨架搭建、核心配置模型、工具链版本策略固定、标准化告警模型定义。已完成。

> 详细任务与完成记录见 [todo-archive.md §M0](todo-archive.md)

## M1: MVP 单仓库自动修复

跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取、过滤、修复、验证和报告的全链路闭环。

**交付物**:
- `dependfix` CLI —— 通过 `npx dependfix` 运行
- `@dependfix/core` —— 作为独立 npm 包发布
- 三条命令：`report`（报告）、`fix`（修复+验证）、`fix-and-pr`（参数预留）
- 本地文件变更，不推送不创建 PR

> 详细任务见 [todo-archive.md §M1](todo-archive.md)

## M2: GitHub Action 接入

将 M1 能力接入 GitHub Actions，支持 `workflow_dispatch` + `schedule` 触发，输出报告 artifact，支持创建修复分支与 PR。包含用户自定义 AI Token 支持和 Prompt 注入防护。

> 详细任务见 [todo-archive.md §M2](todo-archive.md#m2-github-action-接入已归档)
>
> **M2 已交付（2026-08-05 归档）**：消费者仓库可通过 `uses: dependfix/dependfix@v1` 一行接入安全告警自动修复（fix-and-pr 默认、PR 去重、分支清理、分组升级、pnpm audit fallback）。G2 处置闭环：Dependabot alerts 需 PAT（`security_events` / `Dependabot alerts: read`）或 GitHub App token；Code Scanning 对 GITHUB_TOKEN 可访问（T-G2-2 已验证）。

## M3: Code Scanning 扩展

接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

> 详细任务见 [todo-archive.md §M3](todo-archive.md#m3-code-scanning-扩展已归档)
>
> **M3 已交付（2026-08-05 归档）**：Code Scanning alerts 与 Dependabot 并行采集（`--code-scanning` / `DEPENDFIX_CODE_SCANNING` / action `code-scanning` input），A/B/C 三级规则分层（自动修复 / 建议修复 / 仅报告），eol-last 自动修复闭环（T303），无法自动修复问题输出报告 + PR body 建议区块（T304），G1 工具链固定（T305）。
>
> **M3 收尾（2026-08-06）**：收尾修复批次（e1aad1e+c20218e，PR 标题动态化等 6 项）、env 前缀迁移（38722c5）、overrides 两轮复盘（89d8c508 / 06843b9d）、PR #27 反馈修复（a82f6580，PR body ✅ Fixed Alerts 告警级明细）。
>
> **前置（G2）已解除（2026-08-04 探针验证）**：Code Scanning alerts 对 GITHUB_TOKEN 可访问（HTTP 200，`security-events: read` 即可），M3 无需额外 token 方案；仅 Dependabot alerts 需要 PAT / GitHub App token。
>
> **规划要点（2026-08-05 启动）**：数据源**并行**而非回退（区别于 pnpm-audit）；复用 `SEVERITY_MAP` 的 code-scanning 映射与 fixers/code-scanning stub；G1（PIN_TOOLCHAIN stub）承接为 T305 并行任务。

## M4: 多仓库治理增强

支持 owner 级仓库自动发现、并发控制与失败隔离、仓库白名单/黑名单策略、报告归档与趋势统计。

> 详细任务见 [todo.md §M4](todo.md#m4-多仓库治理增强)

## M5: AI Breaking Change 研判

Changelog / Release Notes 采集、多 AI 提供商封装、AI 研判（问题分类 + 修复方案 + 代码 patch）、AI 输出安全校验与质量门。

> 详细任务见 [backlog.md §M5](backlog.md)

## M6: 最小平台 MVP

在 M5 完成后交付一个可独立部署的集中管理平台的最小可用版本：仓库管理、凭据管理、手动触发扫描、仪表板、Docker Compose 部署。

> **G2 驱动**：凭据管理须支持 PAT（classic / fine-grained）与 GitHub App 双模型——GITHUB_TOKEN 无法读取 Dependabot alerts，平台扫描必须依赖显式凭据（见 [todo-archive.md G2 处置记录](todo-archive.md#g2-处置记录-github_token-无法访问-dependabot-alerts) 方案矩阵）。

> 详细任务见 [backlog.md §M6](backlog.md)

## M7: 企业级平台增强

补齐多租户、高可用与跨平台能力：RBAC 权限、BullMQ + Redis 任务队列、GitLab/Bitbucket 支持、定时批量、PostgreSQL、Helm Chart。

> 详细任务见 [backlog.md §M7](backlog.md)

---

## 详细任务

- 当前阶段任务（M4）：[todo.md](todo.md)
- 后续阶段任务（M5-M7）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录

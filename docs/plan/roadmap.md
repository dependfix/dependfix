# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 |
|------|------|--------|
| M0: 基线收敛 | 项目骨架、配置模型、工具链策略 | P0 |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 |
| M2: GitHub Action 接入 | 支持 workflow_dispatch + 定时 + PR | P1 |
| M3: Code Scanning 扩展 | 规则分级、可模板化修复、建议输出 | P1 |
| M4: 多仓库治理 | 自动发现、并发控制、报告归档 | P2 |
| M5: AI Breaking Change 研判 | Changelog 采集、AI 分析、修复生成 | P1 |
| M6: 平台化 | Nuxt 全栈 + RBAC + 任务队列 + 批量处理 | P2 |

## M2: GitHub Action 接入

将 M1 能力接入 GitHub Actions：

- 支持 `workflow_dispatch` + `schedule` 触发
- 报告 artifact 输出
- 创建修复分支与 PR
- 最小权限集

## M3: Code Scanning 扩展

- Code Scanning alerts 标准化采集
- A/B/C 三级规则分层
- 白名单规则自动修复
- 不可修复问题输出建议

## M4: 多仓库治理增强

- owner 级仓库自动发现
- 并发控制与失败隔离
- 仓库白名单/黑名单
- 报告归档与趋势统计

## M5: AI Breaking Change 研判

- Changelog / Release Notes 采集
- 多 AI 提供商封装（OpenAI / Anthropic / DeepSeek）
- AI 研判：问题分类 + 修复方案 + 代码 patch
- AI 输出安全校验与质量门
- 经验提取与复用（codemod 脚本/补丁）

## M6: 独立平台部署

- Nuxt 全栈 Web UI + REST API
- Git 仓库连接管理（GitHub / GitLab / Bitbucket）
- BullMQ + Redis 任务队列
- RBAC 权限管理（Admin / Org Admin / Repo Admin / Viewer）
- 批量处理与聚合报告
- Docker Compose / Helm Chart 部署

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录

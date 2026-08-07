# 当前阶段任务（无进行中阶段）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）/ M3（Code Scanning 扩展）/ M4（多仓库治理增强）/ M4.5（跨线升级显式授权）/ M4.6（Monorepo 成员级修复增强）/ M5（AI Breaking Change 研判）/ **M5.5（Skill 编排，CLI 先行）** 已完成，归档见 [todo-archive.md](todo-archive.md)。
> **M5.5（2026-08-07 归档）**：T506-T508 全部交付（929 tests），Review Gate 每任务独立审计 PASS；产品 skill（`dependfix-remediator`）npx skills 生态主通道 + 自研兜底安装器 + MCP 双后端扩展点落地；`@dependfix/skills` 纳入发布与 CHANGELOG 体系。

---

## 当前状态

- **无进行中阶段**：M5.5（Skill 编排，CLI 先行）已于 2026-08-07 归档，全部任务完成。
- **下一阶段**：M6（最小平台 MVP：仓库/凭据管理、扫描触发与结果存储、仪表板、MCP Server、Docker 部署），任务定义见 [backlog.md §M6](backlog.md#m6-最小平台-mvp)；启动时按 backlog 定义转入本文档。
- **已知边界**：M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限），推送后复跑确认。

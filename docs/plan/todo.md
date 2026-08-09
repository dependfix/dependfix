# 当前阶段任务（已完成：@dependfix/engine 拆包）

> M0-M6 已完成并归档，见 [todo-archive.md](todo-archive.md) 与 [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)。
> **M6（2026-08-08 归档）**：T601-T605 + T607 全部交付（991 tests，CI Test 端到端裁决通过），最小平台 MVP 落地；Docker 镜像构建 CI 链路未裁决（backlog C30）。

---

## 当前状态

- **已完成任务**：`@dependfix/engine` 拆包（方案 B，2026-08-09 用户决策）——4 批次全部交付
  - 背景：mcp 依赖 cli（dependfix 包）导致应用层互相依赖 + 连带安装膨胀 + 版本耦合；`DependfixApp` 被 cli/mcp/platform 三方共享。拆出共享执行引擎包 `@dependfix/engine`，cli/mcp/platform 共同依赖。
  - 验收点：
    - [x] 批次 1：engine 包骨架 + `github/` 与 `code-scanning/` 迁移（71916091）
    - [x] 批次 2：`fixers/` + `config/` + `report/` + `multirepo/` 迁移（7f839710）
    - [x] 批次 3：`app/`（DependfixApp）+ helpers/grouping/runners/verification/alerts/ai 迁移，cli 薄壳化（b5a736f6）
    - [x] 批次 4：mcp/platform 依赖切换 + 发布链路恢复（engine/mcp publishable + changelog + release.md）
  - 结果：mcp 依赖 `@dependfix/engine` + `@dependfix/core`（不再依赖 dependfix）；engine/mcp 发布链路就绪（首次发布需手动 `pnpm publish` + 补 tag，见 release.md）
- **下一阶段**：M7（企业级平台增强），任务定义见 [backlog.md §M7](backlog.md#m7-企业级平台增强)。
- **已知边界**：
  - M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
  - Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
  - 平台 UI 暗色模式不可用，待修复（[backlog.md §M6](backlog.md) C29）。
  - security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。

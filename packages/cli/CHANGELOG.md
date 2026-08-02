# dependfix

## 0.1.0

首次公开发布（0.x 预览版）。

### Minor Changes

- 新增 CLI 命令：`report-only`（生成报告）、`fix`（本地修复 + 验证）、`fix-and-pr`（修复并创建 PR）、`cleanup-branches`（清理已合并的修复分支）
- 新增运行时配置解析：支持 CLI 参数、环境变量与配置文件多源合并
- 接入 Dependabot Alerts 拉取（基于 `@octokit/rest`）
- 新增依赖升级修复器：支持版本前缀保留、直接升级失败自动回退 pnpm overrides、备份与回滚
- 新增 pnpm frozen-lockfile 修复器：支持逐级策略升级（`--lockfile-only` 修复 / 重新生成 / 切换工具链）
- 支持通过 pnpm overrides 修复间接（transitive）依赖漏洞
- 新增最小验证执行器：支持命令序列执行与输出脱敏（lint + build 验证）
- 新增 GitHub Composite Action（`action.yml`）：消费者仓库可零配置接入，支持 `workflow_dispatch` + 定时触发、Workflow Summary 输出与报告 artifact 上传
- fix-and-pr 模式支持 PR 内容指纹去重：重复修复自动跳过并关闭旧 PR
- `fix` 模式支持 `--commit` 直接提交本地变更
- 支持从 `git remote origin` 自动推断 `--repo` 参数

### Patch Changes

- 修正 Action 工作目录为消费者 checkout，并改为 node 直调 CLI
- 修正报告文件名与分支名使用 runId 尾段，避免固定前缀截断导致相互覆盖
- 修正 overrideTransitiveDependency 根据 `pnpm-workspace.yaml` 存在性选择写入位置
- 运行结束后自动在目标仓库 `.gitignore` 中追加 `dependfix-reports/`
- 依赖升级完成后自动清理残留的 `.bak` 备份文件
- 修复 exports 的 `types` 条件排序警告

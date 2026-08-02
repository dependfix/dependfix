# dependfix

# 0.1.0 (2026-08-02)


### ✨ 新功能

* 实现仓库选择和告警过滤引擎，迁移 CLI 到 citty ([d7bb161](https://github.com/dependfix/dependfix/commit/d7bb161))
* 添加仓库标识验证功能及相关文档 ([5b1683c](https://github.com/dependfix/dependfix/commit/5b1683c))
* **action:** Action 默认使用 fix-and-pr 模式并同步文档 ([63ea69d](https://github.com/dependfix/dependfix/commit/63ea69d))
* **cli:** 从 git remote origin 自动推断 --repo 参数 ([52d00ba](https://github.com/dependfix/dependfix/commit/52d00ba))
* **cli:** 实现 DependfixApp 编排管线与 CLI 入口串联 ([4b41b70](https://github.com/dependfix/dependfix/commit/4b41b70))
* **cli:** 实现 fix-and-pr 模式 — 分支创建、提交推送与 PR 创建 ([84e1b7d](https://github.com/dependfix/dependfix/commit/84e1b7d))
* **cli:** 实现 GitHub 客户端封装，引入 @octokit/rest ([efe8f59](https://github.com/dependfix/dependfix/commit/efe8f59))
* **cli:** 新增 cleanup-branches 清理模式（交互确认 + 分支清理） ([fb59550](https://github.com/dependfix/dependfix/commit/fb59550))
* **cli:** 支持通过 pnpm overrides 修复间接（transitive）依赖漏洞 ([ad99c66](https://github.com/dependfix/dependfix/commit/ad99c66))
* **cli:** fix 模式支持 --commit 本地直接提交 ([12393dc](https://github.com/dependfix/dependfix/commit/12393dc))
* **cli:** fix-and-pr 模式 PR 去重（内容指纹 + 查重跳过 + 关旧开新） ([6602bdb](https://github.com/dependfix/dependfix/commit/6602bdb))
* **fixer:** 实现 pnpm frozen-lockfile 修复器, 支持逐级策略升级 ([0525374](https://github.com/dependfix/dependfix/commit/0525374))
* **fixer:** 实现依赖升级修复器, 支持版本前缀保留与自动回滚 ([64c6f84](https://github.com/dependfix/dependfix/commit/64c6f84))
* **github:** 接入 Dependabot Alerts 拉取并映射为标准化模型 ([f31166e](https://github.com/dependfix/dependfix/commit/f31166e))
* **runner:** 实现最小验证执行器, 支持命令序列执行与脱敏 ([0c8c576](https://github.com/dependfix/dependfix/commit/0c8c576))


### 🐛 Bug 修复

* 报告文件名与分支名改用 runId 尾段，修复固定前缀截断导致相互覆盖 ([60a0e8d](https://github.com/dependfix/dependfix/commit/60a0e8d))
* **cli:** 依赖升级完成后自动清理残留的 .bak 备份文件 ([94d5a87](https://github.com/dependfix/dependfix/commit/94d5a87))
* **cli:** 运行结束后自动在目标仓库 .gitignore 中追加 dependfix-reports/ ([8b1b37a](https://github.com/dependfix/dependfix/commit/8b1b37a))
* **cli:** overrideTransitiveDependency 根据 pnpm-workspace.yaml 存在性选择写入位置 ([8e750a3](https://github.com/dependfix/dependfix/commit/8e750a3))
* **cli:** upgradeAlert 改为 try→fallback 模式，直接升级失败自动回退 overrides ([a0950fb](https://github.com/dependfix/dependfix/commit/a0950fb))
* **package:** 修复 exports 中 types 条件排序警告, 更新 T105 状态 ([cae3202](https://github.com/dependfix/dependfix/commit/cae3202))


### 📦 代码重构

* 迁移到 pnpm workspace Monorepo 架构并完成 M0 基线收敛 ([ba0f14a](https://github.com/dependfix/dependfix/commit/ba0f14a))
* **cli:** 清理 M0 descriptor stubs 并补充 lockfile-drift fixtures ([e89026a](https://github.com/dependfix/dependfix/commit/e89026a))
* **test:** 单元测试命名统一为 *.test.ts，同步配置并扩展测试规范 ([798e9b5](https://github.com/dependfix/dependfix/commit/798e9b5))

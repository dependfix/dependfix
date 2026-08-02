# @dependfix/core

# 0.1.0 (2026-08-02)


### ✨ 新功能

* 实现仓库选择和告警过滤引擎，迁移 CLI 到 citty ([d7bb161](https://github.com/dependfix/dependfix/commit/d7bb161))
* 添加仓库标识验证功能及相关文档 ([5b1683c](https://github.com/dependfix/dependfix/commit/5b1683c))
* **cli:** 实现 GitHub 客户端封装，引入 @octokit/rest ([efe8f59](https://github.com/dependfix/dependfix/commit/efe8f59))
* **cli:** 新增 cleanup-branches 清理模式（交互确认 + 分支清理） ([fb59550](https://github.com/dependfix/dependfix/commit/fb59550))
* **cli:** 支持通过 pnpm overrides 修复间接（transitive）依赖漏洞 ([ad99c66](https://github.com/dependfix/dependfix/commit/ad99c66))
* **cli:** fix-and-pr 模式 PR 去重（内容指纹 + 查重跳过 + 关旧开新） ([6602bdb](https://github.com/dependfix/dependfix/commit/6602bdb))
* **core:** 日志输出支持 TTY 格式化彩色文本，非 TTY 保持 JSON ([45bbfa6](https://github.com/dependfix/dependfix/commit/45bbfa6))
* **report:** 实现 Markdown / JSON 报告生成器 ([a0556d9](https://github.com/dependfix/dependfix/commit/a0556d9))


### 🐛 Bug 修复

* 报告文件名与分支名改用 runId 尾段，修复固定前缀截断导致相互覆盖 ([60a0e8d](https://github.com/dependfix/dependfix/commit/60a0e8d))
* **package:** 修复 exports 中 types 条件排序警告, 更新 T105 状态 ([cae3202](https://github.com/dependfix/dependfix/commit/cae3202))


### 📦 代码重构

* 迁移到 pnpm workspace Monorepo 架构并完成 M0 基线收敛 ([ba0f14a](https://github.com/dependfix/dependfix/commit/ba0f14a))
* **test:** 单元测试命名统一为 *.test.ts，同步配置并扩展测试规范 ([798e9b5](https://github.com/dependfix/dependfix/commit/798e9b5))

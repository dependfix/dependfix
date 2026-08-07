# @dependfix/core

# [0.2.0](https://github.com/dependfix/dependfix/compare/@dependfix/core@0.1.0...@dependfix/core@0.2.0) (2026-08-07)


### ✨ 新功能

* 报告文件补齐 GHSA 审计粒度与失败原因展示 ([6eaf367](https://github.com/dependfix/dependfix/commit/6eaf367))
* 接入 Code Scanning alerts 采集（T301） ([7b8feb3](https://github.com/dependfix/dependfix/commit/7b8feb3))
* **cli:** 支持 workspace 成员级直接依赖自动升级（M4.6 T406/T407） ([7fb264e](https://github.com/dependfix/dependfix/commit/7fb264e))
* Code Scanning 规则分层 A/B/C 与白名单机制（T302） ([5b3e076](https://github.com/dependfix/dependfix/commit/5b3e076))
* Code Scanning 建议型输出（T304） ([dead17e](https://github.com/dependfix/dependfix/commit/dead17e))
* Code Scanning 模板化规则修复器（T303） ([aebf258](https://github.com/dependfix/dependfix/commit/aebf258))
* pnpm audit fallback——本地无 token 依赖漏洞审计与修复 ([d9fef68](https://github.com/dependfix/dependfix/commit/d9fef68))
* PR body 新增 ✅ Fixed Alerts 告警级明细（用户反馈 PR [#27](https://github.com/dependfix/dependfix/issues/27)） ([a82f658](https://github.com/dependfix/dependfix/commit/a82f658))
* **report:** AI 用量聚合段（aiUsage 进报告/JSON/摘要）+ 修复 CI lint-md 穿透 node_modules ([a753029](https://github.com/dependfix/dependfix/commit/a753029))


### 🐛 Bug 修复

* **cli:** 跨线告警不自动修复且不误标 fixed/converged（PR [#28](https://github.com/dependfix/dependfix/issues/28) 复盘） ([220df7b](https://github.com/dependfix/dependfix/commit/220df7b))
* **cli:** verify 工具链同版本 + PR body 截断 + 统计口径拆分（C2/C6/C7） ([cf12e38](https://github.com/dependfix/dependfix/commit/cf12e38))
* M3 收尾遗留修复（用户确认批次） ([e1aad1e](https://github.com/dependfix/dependfix/commit/e1aad1e))


### 📦 代码重构

* 清理注释与测试名中的开发流程编号标记（C/T/M/G/R/P 系列） ([3c714cc](https://github.com/dependfix/dependfix/commit/3c714cc))
* 清理注释与测试名中的开发流程编号标记（T405/T406/T407 等） ([3a8fbda](https://github.com/dependfix/dependfix/commit/3a8fbda))
* src 目录结构收敛——根目录仅保留入口文件 ([bb24ef0](https://github.com/dependfix/dependfix/commit/bb24ef0))

# 0.1.0 (2026-08-03)


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

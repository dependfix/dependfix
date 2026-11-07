# @dependfix/core

# [1.0.0](https://github.com/dependfix/dependfix/compare/@dependfix/core@0.7.0...@dependfix/core@1.0.0) (2026-11-06)

### ⚙️ 运行时基线更新

* 本版本仅随仓库基线调整（依赖 / 运行时 / 构建配置）提升，无包内功能变更；对照根 CHANGELOG 同版本段。

### 首个稳定版

* 1.0.0 首个稳定版：本包随 1.0 契约冻结一并发布（迁移说明见仓库根 `docs/guide/contract-freeze.md`）

# [0.7.0](https://github.com/dependfix/dependfix/compare/@dependfix/core@0.6.0...@dependfix/core@0.7.0) (2026-11-01)


### ✨ 新功能

* **core:** 交付跳过契约与报告段 ([aa90062](https://github.com/dependfix/dependfix/commit/aa90062))
* **core:** 新增告警级修复结果契约与引擎产出 ([1d5e187](https://github.com/dependfix/dependfix/commit/1d5e187))
* **monorepo:** 统一 PR Check 结论口径并按 workflow run 收敛同名轮次 ([2a9a588](https://github.com/dependfix/dependfix/commit/2a9a588))


### 🐛 Bug 修复

* **engine:** 区分已启动后被取消的 git 失败文案 ([f6d8911](https://github.com/dependfix/dependfix/commit/f6d8911))
* **engine:** 收口交付异步化的取消、预算与编码边界 ([11c1427](https://github.com/dependfix/dependfix/commit/11c1427))

# [0.6.0](https://github.com/dependfix/dependfix/compare/@dependfix/core@0.5.0...@dependfix/core@0.6.0) (2026-10-28)


### ✨ 新功能

* **core:** NormalizedSecurityAlert 新增 dependencyPath 可选字段 ([a2e3669](https://github.com/dependfix/dependfix/commit/a2e3669))
* **core:** 在运行汇总中新增环境性失败计数 ([c313255](https://github.com/dependfix/dependfix/commit/c313255))
* **core:** 报告 Repositories 渲染 dependencyPath 依赖链 ([e83347a](https://github.com/dependfix/dependfix/commit/e83347a))
* **core:** 报告新增 check 归因小节 ([9ebadc1](https://github.com/dependfix/dependfix/commit/9ebadc1))
* **core:** 报告新增既有失败归因字段与标注 ([dbf9066](https://github.com/dependfix/dependfix/commit/dbf9066))
* **core:** 新增 CI check 失败归因分类纯函数 ([cce39c0](https://github.com/dependfix/dependfix/commit/cce39c0))
* **core:** 新增 CI 脚本镜像契约与验证来源标注 ([f28e480](https://github.com/dependfix/dependfix/commit/f28e480))
* **core:** 新增同告警尝试记录契约与跳过原因 ([1ee3cef](https://github.com/dependfix/dependfix/commit/1ee3cef))
* **core:** 新增家族锁步记录与报告摘要 ([251c392](https://github.com/dependfix/dependfix/commit/251c392))
* **core:** 新增跳过与截断分组统计 ([9003494](https://github.com/dependfix/dependfix/commit/9003494))
* **core:** 新增验证链与目标仓库 CI 口径模型与渲染 ([384d2a2](https://github.com/dependfix/dependfix/commit/384d2a2))
* **engine:** 区分 Dependabot alerts 未启用与获取失败 ([6fd6aad](https://github.com/dependfix/dependfix/commit/6fd6aad))
* **engine:** 接入 PR check 回环与报告字段 ([ff8fa60](https://github.com/dependfix/dependfix/commit/ff8fa60))
* **engine:** 新增交付提交集合判定与路径白名单 ([71ccef1](https://github.com/dependfix/dependfix/commit/71ccef1))


### 🐛 Bug 修复

* **core:** 报告未启用告警的开启指引改为源无关 ([c7e5cce](https://github.com/dependfix/dependfix/commit/c7e5cce))
* **engine:** 容器内安装失败保留进程级信号并改判环境性失败不归因 ([4fee403](https://github.com/dependfix/dependfix/commit/4fee403))
* **engine:** 环境性安装失败不再归因目标仓库 ([0d1dd45](https://github.com/dependfix/dependfix/commit/0d1dd45))

# [0.5.0](https://github.com/dependfix/dependfix/compare/@dependfix/core@0.4.0...@dependfix/core@0.5.0) (2026-09-18)


### ✨ 新功能

* **core,engine:** NormalizedSecurityAlert 接口 + fetcher 透传 GHSA + CVE ([b6e7716](https://github.com/dependfix/dependfix/commit/b6e7716))
* **engine,core:** NormalizedSecurityAlert 新增 upstreamId 字段（M20.1） ([acb2d35](https://github.com/dependfix/dependfix/commit/acb2d35))
* **engine:** per-source 错误隔离汇总（M19.5 C8） ([a20ea02](https://github.com/dependfix/dependfix/commit/a20ea02))
* **platform:** M26.3 C69 包 README 双语化 ([bb61814](https://github.com/dependfix/dependfix/commit/bb61814))

# [0.4.0](https://github.com/dependfix/dependfix/compare/@dependfix/core@0.2.0...@dependfix/core@0.4.0) (2026-08-26)


### ✨ 新功能

* **core:** 报告供应链信号警示区渲染（T804） ([28c189e](https://github.com/dependfix/dependfix/commit/28c189e))
* **engine:** 接入 GitHub Code Quality findings 数据源 ([b0f6e84](https://github.com/dependfix/dependfix/commit/b0f6e84))


### 🐛 Bug 修复

* **platform:** 修复 T912 coverage 回归（mailer String(error) fallback 真覆盖 + app-error 全分支补测） ([6e28207](https://github.com/dependfix/dependfix/commit/6e28207))
* **security:** 修复 CodeQL 告警（Actions 权限 / shell 参数化 / ReDoS / 表格转义） ([34e5575](https://github.com/dependfix/dependfix/commit/34e5575))

## [0.2.1](https://github.com/dependfix/dependfix/compare/@dependfix/core@0.2.0...@dependfix/core@0.2.1) (2026-08-12)

### 🐛 Bug 修复

* **security:** 修复 CodeQL 告警（Actions 权限 / shell 参数化 / ReDoS / 表格转义） ([34e5575](https://github.com/dependfix/dependfix/commit/34e5575))

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

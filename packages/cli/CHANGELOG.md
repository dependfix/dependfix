# dependfix

# [0.3.0](https://github.com/dependfix/dependfix/compare/dependfix@0.2.0...dependfix@0.3.0) (2026-08-12)


### ✨ 新功能

* **mcp:** 实施 P1 能力补充（run_scan 参数化 / fetch_alerts 双源 / fix_dependency 多类型） ([62a655e](https://github.com/dependfix/dependfix/commit/62a655e))
* **mcp:** 实施 P2 能力补充（discover_repos / cleanup_branches / AI 透传 / history） ([d312570](https://github.com/dependfix/dependfix/commit/d312570))


### 🐛 Bug 修复

* **test:** 修复全量并发时 cli git/子进程测试超时 flaky ([db4d8e6](https://github.com/dependfix/dependfix/commit/db4d8e6))


### 📦 代码重构

* **cli:** 补充 alerts 模块出口并显式声明 fetcher 聚合口径 ([9e025f5](https://github.com/dependfix/dependfix/commit/9e025f5))
* **engine:** 拆包批次 2（fixers/config/report/multirepo 迁入 engine） ([7f83971](https://github.com/dependfix/dependfix/commit/7f83971))
* **engine:** 拆包批次 3（app/helpers/ai/runners 等迁入 engine，cli 薄壳化） ([b5a736f](https://github.com/dependfix/dependfix/commit/b5a736f))
* **engine:** 拆出 @dependfix/engine 共享执行引擎（批次 1：github/code-scanning 迁移） ([7191609](https://github.com/dependfix/dependfix/commit/7191609))

# [0.2.0](https://github.com/dependfix/dependfix/compare/dependfix@0.1.0...dependfix@0.2.0) (2026-08-07)


### ✨ 新功能

* 多版本共存分别 overrides 修复链路（run 31021398673 复盘） ([89d8c50](https://github.com/dependfix/dependfix/commit/89d8c50))
* 工具链固定 PIN_TOOLCHAIN 接线（T305，G1 闭环） ([486fea7](https://github.com/dependfix/dependfix/commit/486fea7))
* 接入 Code Scanning alerts 采集（T301） ([7b8feb3](https://github.com/dependfix/dependfix/commit/7b8feb3))
* **cli:** 报告归档与趋势统计（M4 T404） ([2a7fed0](https://github.com/dependfix/dependfix/commit/2a7fed0))
* **cli:** 仓库白名单/黑名单策略（M4 T403） ([5860fb4](https://github.com/dependfix/dependfix/commit/5860fb4))
* **cli:** 多仓库并发控制与限流退避（M4 T402） ([fedb720](https://github.com/dependfix/dependfix/commit/fedb720))
* **cli:** 分支清理三层方案——supersede 删旧分支 + cleanup-branches-auto + 文档引导 ([04c6689](https://github.com/dependfix/dependfix/commit/04c6689))
* **cli:** 实现 AI 输出安全校验与质量门（范围/路径/敏感信息/命令注入） ([31997ad](https://github.com/dependfix/dependfix/commit/31997ad))
* **cli:** 实现 AI 研判引擎（provider 抽象 + Zod schema + prompt 防护 + usage 聚合） ([3475e6e](https://github.com/dependfix/dependfix/commit/3475e6e))
* **cli:** 实现 Changelog 采集（registry 元数据 + GitHub Releases + breaking 提取） ([21c07b6](https://github.com/dependfix/dependfix/commit/21c07b6))
* **cli:** 实现修复方案生成器（结构化 patch 应用 + 版本锁定 + 等待上游说明） ([f9affe5](https://github.com/dependfix/dependfix/commit/f9affe5))
* **cli:** 新增 --allow-major-upgrade 跨线告警显式授权自动升级 ([edfb9e0](https://github.com/dependfix/dependfix/commit/edfb9e0)), closes [#28](https://github.com/dependfix/dependfix/issues/28)
* **cli:** 增加每仓库最大告警处理数至 20 ([a1c065f](https://github.com/dependfix/dependfix/commit/a1c065f))
* **cli:** 支持 workspace 成员级直接依赖自动升级（M4.6 T406/T407） ([7fb264e](https://github.com/dependfix/dependfix/commit/7fb264e))
* **cli:** AI 链路 app 接线（T506：config/触发接入/分流闭环/action 输入） ([7509e3e](https://github.com/dependfix/dependfix/commit/7509e3e))
* **cli:** G2 处置 T-G2-3——双 token 支持（最小权限 alerts token + 主操作 token） ([0e5b231](https://github.com/dependfix/dependfix/commit/0e5b231))
* **cli:** owner 级仓库自动发现（M4 T401） ([cb801b6](https://github.com/dependfix/dependfix/commit/cb801b6))
* Code Scanning 规则分层 A/B/C 与白名单机制（T302） ([5b3e076](https://github.com/dependfix/dependfix/commit/5b3e076))
* Code Scanning 建议型输出（T304） ([dead17e](https://github.com/dependfix/dependfix/commit/dead17e))
* Code Scanning 模板化规则修复器（T303） ([aebf258](https://github.com/dependfix/dependfix/commit/aebf258))
* commit message 标题含包名（Dependabot bump 风格） ([de13155](https://github.com/dependfix/dependfix/commit/de13155)), closes [#25](https://github.com/dependfix/dependfix/issues/25)
* pnpm audit fallback——本地无 token 依赖漏洞审计与修复 ([d9fef68](https://github.com/dependfix/dependfix/commit/d9fef68))
* PR body 新增 ✅ Fixed Alerts 告警级明细（用户反馈 PR [#27](https://github.com/dependfix/dependfix/issues/27)） ([a82f658](https://github.com/dependfix/dependfix/commit/a82f658))
* **report:** AI 用量聚合段（aiUsage 进报告/JSON/摘要）+ 修复 CI lint-md 穿透 node_modules ([a753029](https://github.com/dependfix/dependfix/commit/a753029))
* **skills:** 新增 dependfix skills install/doctor 与内部 skill 生态防发现 ([480497b](https://github.com/dependfix/dependfix/commit/480497b))
* T213 依赖分组升级（Dependency Grouping） ([b962374](https://github.com/dependfix/dependfix/commit/b962374))


### 🐛 Bug 修复

* 版本化 overrides 改大版本 key + 存在脆弱实例门槛（run 31028234123 复盘） ([06843b9](https://github.com/dependfix/dependfix/commit/06843b9)), closes [#26](https://github.com/dependfix/dependfix/issues/26)
* 修复跨 manifest 降级与 pnpm v11 lockfile 解析（run 30929090403 复盘） ([640fe8c](https://github.com/dependfix/dependfix/commit/640fe8c))
* 修正 P0 manifest 判定误伤——lockfile manifest 的间接依赖回归修复（run 30933266831） ([7b0fbb6](https://github.com/dependfix/dependfix/commit/7b0fbb6))
* **cli:** 符号链接逃逸防护 + pnpm overrides 假成功检测（C5/C1） ([12af197](https://github.com/dependfix/dependfix/commit/12af197))
* **cli:** 覆盖策略细化——单版本直接依赖按版本判定 + workspace 成员包识别（C10/C11） ([1092785](https://github.com/dependfix/dependfix/commit/1092785))
* **cli:** 告警源 per-source 错误隔离（C8） ([6715798](https://github.com/dependfix/dependfix/commit/6715798))
* **cli:** 空仓库清单不再静默成功 + M4 完成判定同步 ([2c5933d](https://github.com/dependfix/dependfix/commit/2c5933d))
* **cli:** 跨线告警不自动修复且不误标 fixed/converged（PR [#28](https://github.com/dependfix/dependfix/issues/28) 复盘） ([220df7b](https://github.com/dependfix/dependfix/commit/220df7b))
* **cli:** 修复 M4 backlog 登记项（R1-R8 + P3 观察项） ([3d19d49](https://github.com/dependfix/dependfix/commit/3d19d49))
* **cli:** 验证门禁 + 回滚——验证失败不再创建坏 PR/坏提交 ([b415186](https://github.com/dependfix/dependfix/commit/b415186))
* **cli:** commit message 明细化 + PR 创建 403 指引 + Windows 多行提交修复 ([fac32f9](https://github.com/dependfix/dependfix/commit/fac32f9))
* **cli:** G2 处置 T-G2-1——fetch 401/403 硬失败，杜绝静默空跑 ([a9e61b8](https://github.com/dependfix/dependfix/commit/a9e61b8))
* **cli:** G3 同包收敛 + 逐包升级验证回滚——消除重复覆盖/降级与全量回滚 ([9de0fad](https://github.com/dependfix/dependfix/commit/9de0fad))
* **cli:** R4 CJS 产物加载 p-queue（ESM-only）改为动态 import ([ac8ce5c](https://github.com/dependfix/dependfix/commit/ac8ce5c))
* **cli:** verify 工具链同版本 + PR body 截断 + 统计口径拆分（C2/C6/C7） ([cf12e38](https://github.com/dependfix/dependfix/commit/cf12e38))
* M3 收尾遗留修复（用户确认批次） ([e1aad1e](https://github.com/dependfix/dependfix/commit/e1aad1e))
* PR body 按包聚合展示升级与失败明细 ([d96ee87](https://github.com/dependfix/dependfix/commit/d96ee87)), closes [#23](https://github.com/dependfix/dependfix/issues/23)
* **test:** pr-creator 分支用例补齐超时参数（根治全量并行 flaky） ([451cdcc](https://github.com/dependfix/dependfix/commit/451cdcc))


### 📦 代码重构

* 环境变量前缀迁移为 DEPENDFIX_（方案 B） ([38722c5](https://github.com/dependfix/dependfix/commit/38722c5))
* 清理注释与测试名中的开发流程编号标记（C/T/M/G/R/P 系列） ([3c714cc](https://github.com/dependfix/dependfix/commit/3c714cc))
* 清理注释与测试名中的开发流程编号标记（T405/T406/T407 等） ([3a8fbda](https://github.com/dependfix/dependfix/commit/3a8fbda))
* 清理注释与测试名中的开发流程编号标记残留并纳入 Review Gate 必查项 ([528d1aa](https://github.com/dependfix/dependfix/commit/528d1aa))
* **cli:** 优化注释——移除 G2 开发编号标签，原因指向文档 ([7a51e85](https://github.com/dependfix/dependfix/commit/7a51e85))
* **cli:** CLI 执行与解析解耦（createPipeline 平台化前置 + C13 解环） ([e30f2a3](https://github.com/dependfix/dependfix/commit/e30f2a3))
* src 目录结构收敛——根目录仅保留入口文件 ([bb24ef0](https://github.com/dependfix/dependfix/commit/bb24ef0))

# [0.1.0](https://github.com/dependfix/dependfix/compare/ba0f14a...dependfix@0.1.0) (2026-08-03)


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

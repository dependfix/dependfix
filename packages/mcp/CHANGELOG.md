# @dependfix/mcp

## [1.0.0](https://github.com/dependfix/dependfix/compare/@dependfix/mcp@0.3.1...@dependfix/mcp@1.0.0) (2026-11-06)

### ⚙️ 依赖更新

* bump `@dependfix/core` to 1.0.0 (was 0.7.0)
* bump `@dependfix/engine` to 1.0.0 (was 0.6.0)

### 首个稳定版

* 1.0.0 首个稳定版：本包随 1.0 契约冻结一并发布（迁移说明见仓库根 `docs/guide/contract-freeze.md`）

## [0.3.1](https://github.com/dependfix/dependfix/compare/@dependfix/mcp@0.3.0...@dependfix/mcp@0.3.1) (2026-11-01)

### ⚙️ 依赖更新

* bump `@dependfix/core` to 0.7.0 (was 0.6.0)
* bump `@dependfix/engine` to 0.6.0 (was 0.5.0)

# [0.3.0](https://github.com/dependfix/dependfix/compare/@dependfix/mcp@0.2.0...@dependfix/mcp@0.3.0) (2026-10-28)


### 📦 代码重构

* **engine:** 锁文件修复调用方适配异步签名 ([7a91501](https://github.com/dependfix/dependfix/commit/7a91501))


### 💥 BREAKING CHANGES

* **engine:** @dependfix/engine 的 tryLockfileRepair 由同步改为异步（返回 Promise）。

# [0.2.0](https://github.com/dependfix/dependfix/compare/@dependfix/mcp@0.1.4...@dependfix/mcp@0.2.0) (2026-09-18)


### ✨ 新功能

* **engine:** 新增发现规模上限 max-repos（C23） ([c998d58](https://github.com/dependfix/dependfix/commit/c998d58))
* **mcp:** runScan 返回结构 RunResult 对齐 5 字段 ([5cf2d22](https://github.com/dependfix/dependfix/commit/5cf2d22))
* **mcp:** 新增 pnpm_audit 本地回退数据源 tool ([9207481](https://github.com/dependfix/dependfix/commit/9207481))
* **platform:** M26.3 C69 包 README 双语化 ([bb61814](https://github.com/dependfix/dependfix/commit/bb61814))


### 🐛 Bug 修复

* **docs:** 恢复 packages/mcp/README.md 中文源描述 ([a461c4c](https://github.com/dependfix/dependfix/commit/a461c4c))


### 📦 代码重构

* **engine+test+mcp+platform:** 调用点改造为 auth 路径 ([67a1a2f](https://github.com/dependfix/dependfix/commit/67a1a2f))

## [0.1.4](https://github.com/dependfix/dependfix/compare/@dependfix/mcp@0.1.2...@dependfix/mcp@0.1.4) (2026-08-26)


### 🐛 Bug 修复

* **changelog:** 补全 cli 0.3.3 / mcp 0.1.3 被动升级 Dependencies 段（c811659 回归治本） ([e9197c1](https://github.com/dependfix/dependfix/commit/e9197c1))

## 0.1.2 (2026-08-12)

### ✨ 新功能

* **mcp:** 实施 P1 能力补充（run_scan 参数化 / fetch_alerts 双源 / fix_dependency 多类型） ([62a655e](https://github.com/dependfix/dependfix/commit/62a655e))
* **mcp:** 实施 P2 能力补充（discover_repos / cleanup_branches / AI 透传 / history） ([d312570](https://github.com/dependfix/dependfix/commit/d312570))
* **mcp:** 新增 @dependfix/mcp MCP Server（T605） ([014f6d2](https://github.com/dependfix/dependfix/commit/014f6d2))

### 🐛 Bug 修复

* **mcp:** 修正 fetch_alerts severity 阈值语义并复用 core 过滤校验 API ([4fc22fb](https://github.com/dependfix/dependfix/commit/4fc22fb))
* **types:** strict 迁移修复（null/undefined 收窄与类型对齐） ([50c9dac](https://github.com/dependfix/dependfix/commit/50c9dac))

### 📦 代码重构

* **engine:** 拆包批次 4（mcp/platform 切换 engine 依赖，恢复发布链路） ([74f821a](https://github.com/dependfix/dependfix/commit/74f821a))
* **mcp:** 收口复用缺口（统一错误包装 / 复用 cli 默认配置 / enum 对齐常量） ([fd99262](https://github.com/dependfix/dependfix/commit/fd99262))
* **release:** 发布包清单单点化 + 修复 changelog 已发布判定 ([83edffc](https://github.com/dependfix/dependfix/commit/83edffc))

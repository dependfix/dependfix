# @dependfix/mcp

# 0.1.0 (2026-08-09)


### ✨ 新功能

* **mcp:** 实施 P1 能力补充（run_scan 参数化 / fetch_alerts 双源 / fix_dependency 多类型） ([62a655e](https://github.com/dependfix/dependfix/commit/62a655e))
* **mcp:** 实施 P2 能力补充（discover_repos / cleanup_branches / AI 透传 / history） ([d312570](https://github.com/dependfix/dependfix/commit/d312570))
* **mcp:** 新增 @dependfix/mcp MCP Server（T605） ([014f6d2](https://github.com/dependfix/dependfix/commit/014f6d2))


### 🐛 Bug 修复

* **mcp:** 修正 fetch_alerts severity 阈值语义并复用 core 过滤校验 API ([4fc22fb](https://github.com/dependfix/dependfix/commit/4fc22fb))


### 📦 代码重构

* **mcp:** 收口复用缺口（统一错误包装 / 复用 cli 默认配置 / enum 对齐常量） ([fd99262](https://github.com/dependfix/dependfix/commit/fd99262))
* **release:** 发布包清单单点化 + 修复 changelog 已发布判定 ([83edffc](https://github.com/dependfix/dependfix/commit/83edffc))

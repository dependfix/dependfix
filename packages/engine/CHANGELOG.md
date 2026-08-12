# @dependfix/engine

## 0.1.1 (2026-08-12)


### 🐛 Bug 修复

* **engine:** 验证失败时附 stdout/stderr 摘要提升可观测性 ([36aa07f](https://github.com/dependfix/dependfix/commit/36aa07f))
* **engine:** overrides 生成先判定大版本冲突并与已有条目取 max 合并 ([2d5cc0c](https://github.com/dependfix/dependfix/commit/2d5cc0c))
* **security:** 修复 CodeQL 告警（Actions 权限 / shell 参数化 / ReDoS / 表格转义） ([34e5575](https://github.com/dependfix/dependfix/commit/34e5575))
* **types:** strict 迁移修复（null/undefined 收窄与类型对齐） ([50c9dac](https://github.com/dependfix/dependfix/commit/50c9dac))


### 📦 代码重构

* **engine:** 拆包批次 2（fixers/config/report/multirepo 迁入 engine） ([7f83971](https://github.com/dependfix/dependfix/commit/7f83971))
* **engine:** 拆包批次 3（app/helpers/ai/runners 等迁入 engine，cli 薄壳化） ([b5a736f](https://github.com/dependfix/dependfix/commit/b5a736f))
* **engine:** 拆包批次 4（mcp/platform 切换 engine 依赖，恢复发布链路） ([74f821a](https://github.com/dependfix/dependfix/commit/74f821a))
* **engine:** 拆出 @dependfix/engine 共享执行引擎（批次 1：github/code-scanning 迁移） ([7191609](https://github.com/dependfix/dependfix/commit/7191609))

# 0.1.0 (2026-08-09)


### 📦 代码重构

* **engine:** 拆包批次 2（fixers/config/report/multirepo 迁入 engine） ([7f83971](https://github.com/dependfix/dependfix/commit/7f83971))
* **engine:** 拆包批次 3（app/helpers/ai/runners 等迁入 engine，cli 薄壳化） ([b5a736f](https://github.com/dependfix/dependfix/commit/b5a736f))
* **engine:** 拆出 @dependfix/engine 共享执行引擎（批次 1：github/code-scanning 迁移） ([7191609](https://github.com/dependfix/dependfix/commit/7191609))

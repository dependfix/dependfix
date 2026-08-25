# @dependfix/engine

# [0.2.0](https://github.com/dependfix/dependfix/compare/@dependfix/engine@0.1.3...@dependfix/engine@0.2.0) (2026-08-25)


### ✨ 新功能

* **engine:** cgroup v2 资源限制（执行期宿主侧硬性 OOM/CPU 上限） ([a85fb03](https://github.com/dependfix/dependfix/commit/a85fb03))
* **engine:** 供应链信号披露收集与 PR 警示区（T804） ([ed2f239](https://github.com/dependfix/dependfix/commit/ed2f239))
* **engine:** 凭据权限面启动检查与本地模式执行风险提示（T803） ([ad3fbb1](https://github.com/dependfix/dependfix/commit/ad3fbb1))
* **engine:** 执行期网络外联审计（T805） ([2d4b253](https://github.com/dependfix/dependfix/commit/2d4b253))
* **engine:** 网络审计代理升级为出站白名单拦截（deny-by-default） ([c68029a](https://github.com/dependfix/dependfix/commit/c68029a))
* **engine:** 识别 pnpm minimumReleaseAge 错误码并输出可读失败提示 ([aa75415](https://github.com/dependfix/dependfix/commit/aa75415))
* **platform:** A 模式 ContainerExecutor 创建 PR + 状态机 dispatched ([46b7c15](https://github.com/dependfix/dependfix/commit/46b7c15))


### 🐛 Bug 修复

* **engine:** cgroup 集成测试加可写探测门控（GitHub-hosted runner 优雅 skip） ([3963af0](https://github.com/dependfix/dependfix/commit/3963af0))
* **engine:** network-audit 默认白名单追加 rolldown.rs ([2104b9f](https://github.com/dependfix/dependfix/commit/2104b9f)), closes [#41](https://github.com/dependfix/dependfix/issues/41)
* **engine:** pnpm-audit legacy patched_versions range 前缀剥离（假跳过修复） ([ff9c66d](https://github.com/dependfix/dependfix/commit/ff9c66d))
* **engine:** 修复 pnpm audit 版本提取正则 ReDoS（CodeQL 告警 22） ([e62a1c3](https://github.com/dependfix/dependfix/commit/e62a1c3))
* **engine:** 显式指定 pnpm audit 官方 registry 防止镜像站漏报 ([0dccfa6](https://github.com/dependfix/dependfix/commit/0dccfa6))
* **engine:** 验证命令单命令超时中止并归类（T802） ([af30313](https://github.com/dependfix/dependfix/commit/af30313))


### 📦 代码重构

* **engine:** helpers.test.ts 按被测域拆分（lint:max-lines 解除） ([95693e0](https://github.com/dependfix/dependfix/commit/95693e0))

## 0.1.3 (2026-08-12)


### 🐛 Bug 修复

* **engine:** 清理 lint 警告（未使用参数、动态删除与 IO 组拆分） ([8f95a2e](https://github.com/dependfix/dependfix/commit/8f95a2e))
* **engine:** 验证失败时附 stdout/stderr 摘要提升可观测性 ([36aa07f](https://github.com/dependfix/dependfix/commit/36aa07f))
* **engine:** overrides 生成先判定大版本冲突并与已有条目取 max 合并 ([2d5cc0c](https://github.com/dependfix/dependfix/commit/2d5cc0c))
* **security:** 修复 CodeQL 告警（Actions 权限 / shell 参数化 / ReDoS / 表格转义） ([34e5575](https://github.com/dependfix/dependfix/commit/34e5575))
* **types:** strict 迁移修复（null/undefined 收窄与类型对齐） ([50c9dac](https://github.com/dependfix/dependfix/commit/50c9dac))


### 📦 代码重构

* **engine:** 拆包批次 2（fixers/config/report/multirepo 迁入 engine） ([7f83971](https://github.com/dependfix/dependfix/commit/7f83971))
* **engine:** 拆包批次 3（app/helpers/ai/runners 等迁入 engine，cli 薄壳化） ([b5a736f](https://github.com/dependfix/dependfix/commit/b5a736f))
* **engine:** 拆包批次 4（mcp/platform 切换 engine 依赖，恢复发布链路） ([74f821a](https://github.com/dependfix/dependfix/commit/74f821a))
* **engine:** 拆出 @dependfix/engine 共享执行引擎（批次 1：github/code-scanning 迁移） ([7191609](https://github.com/dependfix/dependfix/commit/7191609))
* **engine:** processRepoForFix 拆分为步骤管线（repo-fix/repo-alerts 模块） ([660362f](https://github.com/dependfix/dependfix/commit/660362f))

---
name: test-engineer
description: 编写、补齐、运行和优化测试时使用，优先覆盖 Vitest 场景，也适用于组件逻辑、工具函数、状态管理和服务层的测试设计。用户提到 test、unit test、integration test、coverage、mock、Vitest、补测试时都应触发。
metadata:
  internal: true
---

# Test Engineer

铁律：测试要证明行为，而不是机械复刻实现细节。

## 工作流

- [ ] Step 1: 理解被测对象 ⚠️ REQUIRED
	- [ ] 1.1 先读源码与现有测试，找出关键分支和依赖。
	- [ ] 1.2 判断更适合写单元、集成还是更高层验证。
- [ ] Step 2: 设计测试集 ⚠️ REQUIRED
	- [ ] 2.1 至少覆盖主流程、失败路径和边界条件。
	- [ ] 2.2 确认哪些依赖需要 mock，哪些更适合真实调用。
- [ ] Step 3: 实现测试
	- [ ] 3.1 测试描述聚焦业务行为和预期结果。
	- [ ] 3.2 避免过度耦合内部实现细节。
- [ ] Step 4: 执行并解释结果
	- [ ] 4.1 运行最相关的测试命令。
	- [ ] 4.2 失败时先解释根因，再决定改代码还是改测试。

## 关注点

- 测试命名是否说明行为。
- mock 是否掩盖了真正的集成风险。
- 边界条件是否覆盖空值、异常和顺序问题。
- 新功能是否补了回归保护。

## 项目特化提示

- 如果仓库已有 tests/testSetup.ts 或全局 mock 入口，优先复用，不要在每个测试里重复造轮子。
- 涉及前端逻辑时，优先考虑对 useI18n、路由和外部请求的可控 mock。
- 写测试前先核对 package.json 中真实存在的测试命令与运行方式。
- **平台 e2e（Playwright）**：`apps/platform/tests/e2e/`，运行 `pnpm --filter @dependfix/platform test:e2e`（服务端用构建产物，需先 build）。关键纪律：
  - 用例必须**幂等**：固定数据名（如仓库 `e2e-owner/e2e-repo`）二次运行必撞唯一索引 → 用 `Date.now()` 时间戳唯一名；global-setup 注册账号容忍已存在。
  - **e2e 二次运行是回归验证手段**：能暴露单次运行不可见的隐性缺陷（TypeORM 列级复合索引 bug 即由此暴露）。
  - e2e 库是共享 SQLite（`data/e2e.sqlite`），CI 单 worker 串行；本地多 worker 并行时避免用例间共享可变数据。
  - better-auth 限流：e2e 环境 `E2E_TEST=true` 已豁免（disableIpTracking），测试内无需处理 429。
  - 详细经验见 [testing.md §6.1](../../../docs/standards/testing.md) 与 [经验归档 §二十九/§三十](../../../docs/design/governance/experience-archive.md)。

## 反模式

- 只测 happy path。
- 用快照或内部实现断言替代关键业务断言。
- 测试失败时直接改断言让它绿掉。

## 交付前检查

- [ ] 覆盖了主流程、失败路径和边界场景。
- [ ] 测试断言体现业务行为而非内部细节。
- [ ] 已运行相关测试或明确说明未运行原因。
- [ ] 如仍有测试缺口，已明确指出。











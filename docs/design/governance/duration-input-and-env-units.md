# 时长输入与环境变量单位设计（2026-11-09）

> **状态**：✅ 已落地（2026-11-09，用户授权追加；实现与本文档同批提交）
> **范围**：`packages/core`（共享解析）、`packages/engine`（配置 / 验证 / 安装超时）、`apps/platform`（仓库表单、只读预算端点、执行器 / 清理 / 队列 env）
> **上游**：[仓库级执行预算与超时配置设计](./repo-execution-limits.md)（仓库级覆盖与封顶）、[开发规范 §5.1.57](../../standards/development.md)
> **目标**：把「时长」从裸毫秒长数字收敛为可读单位输入，同时让服务端保存失败能定位到具体字段

## 1. 背景

| 问题 | 证据 |
|:--|:--|
| 保存失败只显示「参数校验失败」 | 服务端 zod `issues` 已透传到 `data.issues`，前端只读 `message`；错误被上抛到表格上方，用户不知道改哪个字段 |
| 时长以毫秒长数字录入 | 环境变量文档示例为 `1800000` / `600000`；用户需要心算分钟 |
| `parseInt` 截断单位 | `parseInt('600ms')` → `600`，被当成 600ms；`parseInt('30m')` → `30` |
| 表单校验与服务端脱节 | 客户端无时长范围校验；服务端 400 后无字段级反馈 |

## 2. 决策

| # | 决策 | 理由 |
|:--|:--|:--|
| D1 | 共享解析放 `packages/core/src/utils/duration.ts`，使用 `ms@2.1.3` | engine 与 platform 均依赖 core；单一实现避免 `parseInt` 口径分叉 |
| D2 | 环境变量纯数字仍按**毫秒** | 变量名以 `_MS` 结尾，既有部署文档与 compose 均以毫秒示例；必须向后兼容 |
| D3 | 表单纯数字按**分钟** | 旧表单标签为「（分钟）」，用户已有 `45` 的输入习惯；字段小字写明规则 |
| D4 | 环境变量非法 / 越界：平台侧**回退默认**（clamp + `warnings`）；engine `readEnvConfig` **抛配置错误**，`verify` / `install` 两个运行期解析器**回退默认并输出一次 warn** | 平台配置错误不应让服务不可用；CLI / Action 需要尽早失败；运行期解析器无法 fail-fast，但必须留下可见信号 |
| D5 | 表单保存失败统一在弹窗内展示：服务端 `issues` 映射到字段行内错误 + 顶部摘要；未知失败走摘要 | 满足「错误在模态框内、指明字段」；页面错误只保留加载 / 删除 / 扫描等非表单路径 |
| D6 | 合法范围由 `/api/settings/execution-limits` 的 `bounds` 下发 | 执行上限的 max 是运行期封顶值（可用 env 调整），前端不得硬编码 |

## 3. 契约

### 3.1 共享解析（core）

```ts
parseDurationMs('1800000')                 // 1_800_000（纯数字缺省毫秒）
parseDurationMs('45', { defaultUnit: 'm' }) // 2_700_000
parseDurationMs('30m')                      // 1_800_000
formatDurationMs(1_800_000)                 // '30m'
formatDurationMs(5_400_000)                 // '90m'
```

- 空串 / 非法 / 非正数 → `undefined`（由调用方决定回退或报错）；先 floor 再判正，`0.5ms` 不会被当作有效 0 透传。
- 展示取能整除的最大单位（`d` → `h` → `m` → `s`），无法整除到秒保留 `ms`。

### 3.2 环境变量

| 变量 | 位置 | 解析 |
|:--|:--|:--|
| `EXECUTION_TIMEOUT_MS` / `DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS` | `server/utils/execution-limits.ts` | `parseDurationMs` + 边界 clamp |
| `DEPENDFIX_VERIFY_TIMEOUT_MS` / `DEPENDFIX_INSTALL_TIMEOUT_MS` | 同上 / `verification-runner` / `install-timeouts` | 解析后按各自 10s–30min 边界采纳；非法 / 越界回退默认并输出一次 warn |
| `CLONE_TIMEOUT_MS` | `container-executor.ts` | `resolveCloneTimeoutMs` |
| `STALE_CLEANUP_INTERVAL_MS` / `_RUNNING_GRACE_MS` / `_PENDING_GRACE_MS` | `plugins/stale-cleanup.ts` | 非法 / 0 / 负数回退默认 |
| `QUEUE_BACKOFF_MS` | `queue-mode.ts` | 非法 / 非正数回退 5 秒；兼容 `NUXT_` 覆盖后为 number 的形态 |
| `DEPENDFIX_PR_CHECK_TIMEOUT_MS` / `_RUN_BUDGET_MS` / `DEPENDFIX_JOB_BUDGET_MS` / `DEPENDFIX_MAX_BACKOFF_MS` | `packages/engine/src/config/validation.ts` | 非法值抛 `CONFIG_VALIDATION_ERROR` |

`DEPENDFIX_MAX_BACKOFF_MS` 未出现在 `docs/guide/configuration.md`（存量缺口），其单位支持以本节与开发规范 §5.1.57 为准。

### 3.3 表单

- 4 个时长字段接受 `30m` / `1h` / `90s` / `2.5m`；纯数字按分钟；留空 = 继承。
- 编辑回显为可读单位；占位符 = 当前全局生效值（来自只读端点）。
- 每个字段下方显示合法范围（执行上限使用封顶值）；折叠区底部提示单位规则。
- 客户端校验：必填 / 字符集 / 时长格式与边界 / 子项 ≤ 执行上限；服务端仍是最终裁决。
- 服务端 `issues[].path` 映射到字段（`executionTimeoutMs` → `executionTimeout`、`prCheckFocus.providers` → `focusProviders` 等），行内展示 `issue.message`；摘要用本地化文案。
- 首个错误字段自动聚焦；错误落在时长字段时自动展开折叠区。

### 3.4 只读端点

`GET /api/settings/execution-limits` 新增：

```json
{
  "bounds": {
    "execution": { "minMs": 60000, "maxMs": 3600000 },
    "verifyCommand": { "minMs": 10000, "maxMs": 1800000 },
    "install": { "minMs": 10000, "maxMs": 1800000 },
    "clone": { "minMs": 60000, "maxMs": 1800000 }
  }
}
```

`maxExecutionTimeoutMs` 语义不变；`bounds.execution.maxMs` 与它同值。子项的实际生效上限是 `min(bounds.maxMs, 执行上限)`（服务端 `resolveExecutionLimits` 的夹取口径），前端提交前仍以「子项 ≤ 执行上限」做交叉校验。

## 4. 不做

- 不改仓库级 / 全局时长的毫秒存储契约与 API 字段名（仍为 `*Ms`）。
- 不改队列、执行、清理语义；`ms` 不用于并发数 / 重试次数等非时长数字。
- 不引入日期库；不重写表单为 schema 驱动。
- 服务端 zod 自定义文案仍为中文（英文界面下摘要本地化，行内文案暂用服务端原文）。

## 5. 验收与证据

| 验收点 | 证据 |
|:--|:--|
| 共享解析纯数字 / 单位 / 非法 / 越界 | `packages/core/src/utils/duration.test.ts` |
| 表单纯数字按分钟 / 单位 / 空值 | `app/utils/duration.test.ts` |
| 服务端 issue → 字段定位 | e2e：非法时长提交后弹窗内红框，表格上方无错误 |
| 编辑回显 | e2e：`45` 写入后回显 `45m`，API 落库 `2700000` |
| env 单位等价 | 单测：`30m` 与 `1800000` 同值；`5m` 与 `300000` 同值 |
| 只读端点 bounds | `execution-limits.get.test.ts` 键集与边界断言 |

## 6. 风险

| 风险 | 缓解 |
|:--|:--|
| 纯数字语义歧义（表单分钟 / env 毫秒） | 字段小字与 env 文档分别写明；单测锁定两种口径 |
| 客户端边界与服务端 schema 漂移 | 边界由只读端点下发；服务端 400 的 issues 仍回映射兜底 |
| `ms` v2 为 CJS | core / platform 均显式声明依赖；core 构建 external，客户端只在自己的 bundle 内解析 |
| 未验证的 `NUXT_` 数值覆盖 | `parseRetryConfig` 兼容 `string` / `number`；其余 `NUXT_` 时长变量不在此列 |

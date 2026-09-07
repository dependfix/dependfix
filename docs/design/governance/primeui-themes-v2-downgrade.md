# apps/platform PrimeUI 主题库降级设计（@primeuix/themes 3.x → 2.x）

> 本文档为 **apps/platform（Nuxt 管理平台）的 `@primeuix/themes` 3.x → 2.x 降级方案**专项设计先行稿。PrimeVue 4.x 框架本身仍为 MIT（`Copyright (c) 2018-2025 PrimeTek`），但其配套主题库 `@primeuix/themes@3.x` 采用 **PrimeUI 商业 License**（社区免费版有年收入 / 规模限制且强制 license key）；降级到 `@primeuix/themes@2.x`（MIT）可彻底消除商业 license 风险。
>
> **状态**：设计先行稿，未进入阶段实施面（挂载到 [backlog.md 短期/一次性候选任务](../../plan/backlog.md)）。

## 1. 背景与目标

### 1.1 背景

`apps/platform`（Nuxt 管理平台）当前依赖 PrimeVue 4.5.5 UI 框架与 `@primeuix/themes@3.0.0` 主题库。PrimeVue 4.x 框架本体仍是 MIT，但配套主题库 `3.x` 是 PrimeUI 商业 license：

- ✅ 社区免费版：年收入 < $1M USD + 开发者 < 5 + 员工 < 10 + 风险投资 < $3M
- ⚠️ **强制 license key**（即使免费社区版，浏览器端离线验证）
- ⚠️ 缺失 / 无效 / 过期 → 页面显示 license notice
- ⚠️ 禁止反编译 / 去除 license 机制

PrimeTek 在 2024-2025 推出 PrimeUI 商业化政策：
- PrimeVue 5.x+ 全栈改 PrimeUI License（[$599-$799/dev 每年](https://primeui.store/primeui)）
- 现有 PrimeVue 4.x MIT 版本保持 MIT，但 `@primeuix/themes` 主题库已转商业
- `primeicons@8.x` 与 `@primeuix/themes@3.x` 同源（PrimeUI License）

### 1.2 现状

`apps/platform/package.json` 直接依赖：

```json
{
    "@primeuix/themes": "^3.0.0"
}
```

`apps/platform/nuxt.config.ts:1`：

```typescript
import Aura from '@primeuix/themes/aura'
import { definePreset } from '@primeuix/themes'
```

`docs/guide/tech-stack.md` 当前文档标注 `@primeuix/themes | ^2.x`（**已过时**，实际装的是 `^3.0.0`）。

### 1.3 目标

1. **降级 `@primeuix/themes`** 从 `^3.0.0` 到 `^2.0.3`（**MIT 协议**）
2. **保持 Nuxt 主题渲染效果**（Aura preset + 自定义 DependfixPreset 仍按预期工作）
3. **不需要配置 PrimeUI license key**（降级到 MIT 后无需 license key 验证）
4. **保持 PrimeVue 4.5.5 主体不变**（避免引入 PrimeVue 5.x 全栈 PrimeUI License）

## 2. 现状盘点

### 2.1 apps/platform 主题使用面

```bash
$ rg "from '@primeuix" apps/platform/
apps/platform/nuxt.config.ts:1:import Aura from '@primeuix/themes/aura'
apps/platform/nuxt.config.ts:2:import { definePreset } from '@primeuix/themes'
```

仅 `nuxt.config.ts` 两行 import，没有其他文件直接引用。

### 2.2 依赖协议分布（PrimeUI 相关）

| 依赖 | 版本 | License | 必要性 |
|:---|:---:|:---:|:---|
| `primevue` | 4.5.5 | MIT | 必需 |
| `@primevue/nuxt-module` | 4.5.5 | MIT | 必需 |
| `@primevue/core`、`@primevue/forms`、`@primevue/icons`、`@primevue/metadata` | 4.5.5 | MIT | 必需 |
| `@primeuix/styled` | 0.7.4 (transitive) | MIT | 必需 |
| `@primeuix/utils` | 0.6.4 (transitive) | MIT | 必需 |
| **`@primeuix/themes`** | **3.0.0**（直接）| **PrimeUI License** | **降级目标** |
| `@primeui/license-manager` | 1.0.0 (transitive) | PrimeUI License | 随 themes 降级自动消失 |
| `primeicons` | 8.0.0 | PrimeUI License | 保留（项目只用 pi-check-circle / pi-times-circle）|

### 2.3 自定义主题

`apps/platform/nuxt.config.ts:7-22`：

```typescript
const DependfixPreset = definePreset(Aura, {
    semantic: {
        primary: {
            '50': '#f0fdfa',  // teal-50
            ...
            '600': '#0d9488',  // teal-600
            ...
        },
    },
})
```

使用 `definePreset(Aura, { semantic: { primary: { ... } } })` 扩展 Aura 的 primary 色阶。**`definePreset` API 在 `@primeuix/themes` 2.x 与 3.x 一致**（API 向后兼容）。

### 2.4 依赖协议扫描基线

依赖 pnpm 已有 license 扫描能力（`pnpm licenses list --prod --json`），可生成详细 license 报告作为审计基线。本次降级后预期：

- **PrimeUI License 包数**：5 → **0**（@primeuix/themes / @primeui/license-manager / primeicons 8.x）
  - 注：`primeicons` 8.x 仍为 PrimeUI License，但项目仅用 `pi-check-circle` / `pi-times-circle` 两个图标，可评估降级到 7.x（MIT）作为后续优化
- **Total Unknown license**：7 → **3**（移除 PrimeUI 5 个未知）

## 3. 架构决策

### 3.1 降级 vs 迁移对比

| 方案 | License | 改动量 | 风险 | 推荐度 |
|:---|:---:|:---:|:---:|:---:|
| **A. 降级 `@primeuix/themes` 3.x → 2.x** | MIT | **1 commit**（1 import + 1 版本号）| API 兼容（`definePreset` 一致），需小范围验证 Aura preset 渲染 | **推荐** |
| B. PrimeVue 4.x → OpenVue 1.0 | MIT（社区 fork） | 3-5 commits（import 批量替换）| OpenVue 1.0-rc 阶段，长期维护性未验证 | 备选 |
| C. PrimeVue → Element Plus / Naive UI / Vuetify | MIT | 全部 Vue 组件重写（18 个 PrimeVue 组件 × 13 页面）| 时间跨度长（1-2 周），license 风险远小于迁移成本 | **不推荐** |
| D. 维持 `@primeuix/themes@3.x` + 申请 PrimeUI 商业 license | 需付费 | 配置 license key + 文档 | 依赖用户 / 组织是否符合社区免费版条件 | 仅当其他方案失败 |

**决策**：选 **A（降级 v2）**。

理由：
1. **依赖最小改动**（1 个 import + 1 个版本号约束）
2. **API 完全兼容**（`definePreset` 在 v2 已稳定，自定义 DependfixPreset 大概率无需改）
3. **完全 MIT**（v2 是 MIT，无商业 license 风险与 license key 配置）
4. **保留 PrimeVue 4.5.5 全栈能力**（不引入 fork 或迁移库）
6. **可回退**（如果 v2 验证失败，可切到 OpenVue 方案 B）

### 3.2 兼容性验证清单

`@primeuix/themes@2.0.3` 与 PrimeVue 4.5.5 + `@primevue/nuxt-module@4.5.5` 的兼容性需验证：

| 验证项 | 方法 | 预期结果 |
|:---|:---|:---|
| 主题渲染 | `pnpm dev` 启动 Nuxt，访问 `/login` `/repos` `/alerts` 等关键页面 | teal-600 主色（`#0d9488`）正确显示，dark mode 切换正常 |
| DataTable 渲染 | 访问 `/alerts` `/scans` `/repos/[id]/runs` 等含 DataTable 的页面 | Column / Tag / 排序 / 分页正常工作 |
| 类型兼容 | `pnpm --filter @dependfix/platform typecheck` | 无 type 错误 |
| 构建兼容 | `pnpm --filter @dependfix/platform build` | Nuxt build 成功 |
| 测试兼容 | `pnpm --filter @dependfix/platform test` | 1124 个测试全部通过 |

### 3.3 备选方案（OpenVue 迁移）作为未来评估

如果 v2 降级遇到 API 不兼容（v3 引入了 styled mode 重写，理论上 v2 → v3 是 breaking，反向 v3 → v2 也可能有差异），备选：

- **OpenVue 1.0**：PrimeVue 4.5.5 的 MIT 社区 fork
- 网址：<https://openvue.dev/>
- 提供 `@openvue/migrate` codemod 自动替换 import
- 当前 1.0-rc 阶段，**长期维护性未验证**（OpenVue Foundation 维护，非 PrimeTek 官方）
- 适合作为 v1.0 release 前的候选方案

### 3.4 不做什么

- 不升级 PrimeVue 5.x（避免全栈 PrimeUI License）
- 不迁移其他 UI 库（Element Plus / Naive UI / Vuetify 成本极高）
- 不申请 PrimeUI 商业 license（依赖用户 / 组织资格，本文档不替用户决策）
- 不删除 `primeicons`（PrimeIcons 8.x 是 PrimeUI License，但项目仅用 2 个图标，可评估降级到 7.x 作为后续优化；本次暂保留）
- 不重写 `DependfixPreset`（`definePreset` API 在 v2 一致，理论上无需改）

## 4. 实施步骤

### 4.1 实施步骤清单

| # | 内容 | commit 数 | 风险 |
|:---:|:---|:---:|:---|
| 1 | `apps/platform/package.json`：`@primeuix/themes` 版本约束 `^3.0.0` → `^2.0.3` | 1 | 低（pnpm lock 重新解析）|
| 2 | `pnpm install` 验证 lock + node_modules 同步 | 0 | 低 |
| 3 | `apps/platform/nuxt.config.ts`：检查 `import Aura from '@primeuix/themes/aura'` 路径在 v2 是否仍存在（如不存在需调整）| 0-1 | 中（v2 vs v3 import  可能变化）|
| 4 | `pnpm --filter @dependfix/platform typecheck` 通过 | 0 | 低 |
| 5 | `pnpm --filter @dependfix/platform test` 通过 | 0 | 低 |
| 6 | `pnpm --filter @dependfix/platform build` 通过 | 0 | 低 |
| 7 | `pnpm dev` 视觉回归（dev 模式启动 Nuxt，访问关键页面确认主题渲染 + dark mode 切换）|0 | 中 |
| 8 | `docs/guide/tech-stack.md` 修正 `@primeuix/themes` 版本号（实际版本）|1 | 低 |
| **合计** | — | **2-3 commits** | **总体低** |

### 4.2 验证证据

落地前 baseline（commit 范围）：

```bash
# 1. 主题包版本
$ pnpm list @primeuix/themes --filter @dependfix/platform
@primeuix/themes@3.0.0

# 2. 主题包 license
$ cat node_modules/.pnpm/@primeuix+themes@3.0.0/node_modules/@primeuix/themes/LICENSE.md | head -3
# PrimeUI License

# 3. 全 workspace PrimeUI License 包
$ pnpm licenses list --prod --json | jq '.["Unknown"] | length'
7
# 含 5 个 PrimeUI 相关
```

落地后预期：

```bash
# 1. 主题包版本
$ pnpm list @primeuix/themes --filter @dependfix/platform
@primeuix/themes@2.0.3

# 2. 主题包 license
$ pnpm view @primeuix/themes@2.0.3 license
MIT

# 3. 全 workspace PrimeUI License 包
$ pnpm licenses list --prod --json | jq '.["Unknown"] | length'
3
# 移除 PrimeUI 5 个（@primeuix/themes + @primeuix/styled@1.0.0 + @primeuix/utils@0.8.1 + @primeui/license-manager + primeicons）
# 剩 3 个（@primeuix/styled@0.7.4 transitive + stack-trace + tosource，仍待查证）

# 4. license 分布
# MIT: 713 → 718（+5 PrimeUI 相关转 MIT）
# Unknown: 7 → 2（移除 5 个）
```

### 4.3 回滚预案

如果 v2 降级后 Aura preset 渲染异常或 build 失败：

1. **方案 A1**：pin 到 `@primeuix/themes@2.0.0`（v2 最早版，避免 v2 minor 变更风险）
2. **方案 B**：迁移到 OpenVue 1.0（社区 fork，API 完全兼容）
3. **方案 D**：申请 PrimeUI 商业 license（用户决策）

回滚步骤： `git revert <降级 commit>` → `pnpm install` 恢复。

## 5. 验收标准

### 5.1 落地验收

- `apps/platform/package.json` `@primeuix/themes` 约束为 `^2.0.3`
- `pnpm install` 成功
- `pnpm --filter @dependfix/platform typecheck` 通过
- `pnpm --filter @dependfix/platform test` 通过（1124 tests passed | 7 skipped）
- `pnpm --filter @dependfix/platform build` 通过
- `pnpm dev` 视觉回归：teal 主色（`#0d9488`）在 light + dark mode 都正确显示；DataTable 渲染正常
- `pnpm licenses list --prod --json` 输出：PrimeUI License 包从 5 个 → 0 个
- `docs/guide/tech-stack.md` 标注 `@primeuix/themes | ^2.x`

### 5.2 治理验收

- 仓库根 `THIRD_PARTY_NOTICES.md`（后续独立 commit，可选）补充 PrimeUI License → MIT 转换记录
- 任何新依赖引入前跑 `pnpm licenses list --prod --json` 审计

## 6. 上收触发条件（何时纳入 [todo.md](../../plan/todo.md) 当前阶段）

任一条件触发时，从 backlog 上收到 todo.md §当前阶段：

1. 用户实测反馈 apps/platform 部署出现 PrimeUI license notice（合规紧迫）
2. 用户实测反馈需要长期 license 合规（公开部署 / 商业化）
3. 与 C68 AI 研判平台集成联动（M28 阶段合并实施 license 治理 + i18n 治理 + AI 研判）
4. 与 C69 文档站 + 包 README 多语言实施联动（docs 站翻译文档提到 license 治理）
5. 用户明确触发上收

## 7. 关键决策回顾

（待用户上收阶段时填充）

- **降级到 @primeuix/themes@2.x** vs 维持 v3 + 申请 license key：选降级 v2 —— 改动最小 + 协议 MIT + 不依赖用户 / 组织规模
- **仅降级 themes 主题库** vs PrimeVue 4.x 全栈迁移：选仅 themes —— PrimeVue 4.x 框架本体仍 MIT，迁移全栈成本远高于 license 风险
- **本次先文档 + 挂 backlog** vs 直接落地：与 C68 / C69 一致，先文档沉淀 + 评估，避免一次性大改动
- **保留 primeicons 8.x** vs 降级到 7.x（MIT）：本次暂保留 —— 项目仅用 2 个图标（pi-check-circle / pi-times-circle），license 风险有限；后续可独立评估

## 8. 关联文档

- [`docs/standards/i18n.md`](../../standards/i18n.md) — i18n 规范（与本文档平行设计先行稿 C68 / C69 一致）
- [`docs/design/governance/platform-ai-integration.md`](./platform-ai-integration.md) — apps/platform AI 研判集成设计先行稿 C68
- [`docs/design/governance/docs-and-readme-i18n.md`](./docs-and-readme-i18n.md) — 文档站 + 包 README 多语言实施设计先行稿 C69
- [`docs/standards/platform.md`](../../standards/platform.md) — 平台 UI 主题现状（`@primeuix/themes` + Aura preset + `darkModeSelector: '.dark'`）
- [`docs/guide/tech-stack.md`](../../guide/tech-stack.md) — 技术栈文档（需修正 `@primeuix/themes` 版本号）
- [`docs/plan/roadmap.md`](../../plan/roadmap.md) — M7.2 平台能力深化阶段的 license 治理候选
- [`docs/plan/backlog.md`](../../plan/backlog.md) — 候选条目登记

## 9. 文档元数据

- **设计先行稿创建时间**：2026-09-08
- **触发**：用户调研"apps/platform/node_modules/@primeuix/themes/LICENSE.md 存在 PrimeUI License 风险问题，评估回滚版本还是迁移到其他 UI 库"
- **关联阶段**：未上收（仅挂 backlog）；候选阶段为 M28+（与 C68 / C69 联动）
- **审计依据**：本文档作为 P0 落地的设计依据，未走 A 阶段 audit（与 design docs 治理惯例一致）
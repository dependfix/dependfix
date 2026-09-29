# apps/platform 视觉回归基线说明

本目录承载 `apps/platform` 的**像素级视觉回归**资产。口径（环境固定、阈值、维护协议、覆盖边界）以
[测试规范 §6.7](../../../../docs/standards/testing.md) 为唯一权威，此处只补充**读基线时必须知道的信息**。

## 入口与更新

- 比对：`pnpm --filter @dependfix/platform test:visual`
- 更新基线：`pnpm --filter @dependfix/platform test:visual:update`（仅在有意的视觉变更并完成归因后使用）
- 前置：套件跑 `.output` 构建产物，**取证 / 更新基线前必须先 `pnpm --filter @dependfix/platform build`**，
  否则比对的是过期产物（可能假绿）。
- 数据：`tests/visual/global-setup.ts` 每次运行前重置并注入 `helpers/fixtures.ts` 的确定性数据集
  （独立 SQLite 库 `data/visual.sqlite`，与 e2e 库隔离）。
- 端口：config 使用 `reuseExistingServer: false`，端口 3102 被残留进程占用时（如上次会话被强行中断）会直接报
  `http://127.0.0.1:3102 is already used` —— 结束残留的 `.output/server/index.mjs` 进程后重跑即可。

## 已裁定的既有视觉差异（不要误判为新回归）

下列差异是 M31（PrimeVue → caomei-ui 迁移）收尾时**已逐项裁定**的既有形态。基线快照会如实包含它们；
若后续看到这些位置的像素变化，先对照裁定依据，而不是直接当作新回归上报。

**M31.5 裁定 8 项（7 项接受 + 1 项已修复）**——逐项依据（含测量方式与截图索引）见
[caomei-ui-migration.md §15.13 第 6 条](../../../../docs/design/governance/caomei-ui-migration.md#1513-b3-收尾实证m3152026-09-29)：

| 项 | 结论 |
| :--- | :--- |
| 6 处次要动作按钮为深灰实底（`tone="neutral"`，未加 `text`） | 接受（保持实底形态） |
| `code-quality` 的 ruleId 用 `neutral` 档（与 default 同色） | 接受 |
| `import-repos-dialog` owner 选择器触发器 badge 丢失 | 接受（信息在下拉项内保留） |
| `Message` soft 档无边框 | 接受 |
| DataTable 内建分页报表文案丢失 | 接受（独立 Paginator 场景由页面自渲染报表） |
| `import-repos-dialog` 新增 Paginator 页码按钮组 | 接受（可用性提升） |
| `index.vue` 加载 spinner 由 40px 改为 32px 档 | 已修复（覆盖 `--caomei-progress-spinner-size: 40px`） |
| `repo-history-dialog` 的 `#header` 内容上移为兄弟节点 | 接受 |

**另一处跨页形态**（同属迁移期裁定）：

- `env-events` 表格改为外层容器滚动后**表头不再吸顶**（迁移前组件库曾固定表头）→ 接受；依据见
  [§15.11 第 5 条](../../../../docs/design/governance/caomei-ui-migration.md#1511-其余表页迁移实证m3132026-09-28)。
- 6 处 `tone="neutral"` 实底次要动作按钮的实测计算样式（`--caomei-color-neutral-solid` + 白字）见
  [§15.13 第 5 条](../../../../docs/design/governance/caomei-ui-migration.md#1513-b3-收尾实证m3152026-09-29)；
  `Message` soft 档无边框即上表第 4 项。

## 覆盖边界（现状）

- `pr-checks`：该页行数据由 GitHub 轮询产生，fixtures 端点暂无对应写入路径 → 基线只覆盖页面骨架、
  summary 卡片、空态与表头密度，**不覆盖行级渲染**（候选已登记 `docs/plan/backlog.md`）。
- `alerts`：1440 视口下表格容器横向溢出，最右 `链接` / `详情` 两列不在基线画面内（既有宽表设计；
  候选已登记 `docs/plan/backlog.md`）。
- 三个页面仅取亮色（`pr-checks` / `dialog-import-repos` / `login`），明暗两态仅覆盖 `alerts` / `repos`。

## 不做什么

视觉回归只兜「像素漂移」。交互、可用性、可访问性与语义正确性由 `ui-validator`（浏览器验证）与
e2e 功能层承担，不要用本目录替代它们。

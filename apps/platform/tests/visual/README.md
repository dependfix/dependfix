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
- 库内仓库集合：global-setup 会在注入后断言 `data/visual.sqlite` 的仓库集合**必须等于**
  `VISUAL_FIXTURES.repos`。默认先按该白名单清理多余仓库（走 `DELETE /api/e2e/fixtures`，仅作用于视觉库）；
  残留不一致时在截图前失败并列出「多余 / 缺失」，不进入像素比对。`VISUAL_FIXTURES_AUTO_CLEAN=0`
  可关闭自动清理（此时仍会重置并注入 fixtures，只是不删除多余仓库，便于保留现场 / 查看差异清单；
  集合不一致时套件仍会在截图前中止）。不要在视觉库手工新增仓库；需要新仓库时扩展 `VISUAL_FIXTURES.repos`。
- 端口：config 使用 `reuseExistingServer: false`，端口 3102 被残留进程占用时（如上次会话被强行中断）会直接报
  `http://127.0.0.1:3102 is already used` —— 结束残留的 `.output/server/index.mjs` 进程后重跑即可。

### 更新基线的正确形态（三步，缺一步不算完成）

1. `pnpm --filter @dependfix/platform build`（前置，见上）；
2. `pnpm --filter @dependfix/platform test:visual:update`；
3. **不带 update** 连跑两遍 `test:visual`。

第 3 步不是保险而是判据：`--update-snapshots` 的落盘帧可能不是稳定帧——2026-10-16 观察，构建后**首次** update 落盘的
`dialog-select-open-{light,dark}` 与随后连续三次 no-update 帧在弹窗遮罩下的表格区（y 298-419，约 4k 像素）不一致，而
**二次** update 与 no-update 帧逐字节一致。

### 连带失配与归因顺序

以某页为取景底图的基线在该页**文案**变更后同样失配（不只是结构 / 样式）。2026-10-16 案例：repos 表单提示语补入
`typecheck` 使 `dialog-select-open-{light,dark}` 失配 2080 / 2403 px，且**跨 5 次运行像素数逐字相同**（确定性变更，
不是运行间抖动）。

归因顺序：先比对失败谱在多次运行间是否一致 → 一致即查该页可见文本 / 结构的最近变更 → 确认为有意的内容变更后重建基线。
**不要**用 `data-visual-mask` 或元素级截图掩盖**这类内容变更的连带失配**（遮蔽与元素级补拍是「运行时动态区域」与「视口外溢出区域」的既定手法，不适用于掩盖可见文案差异）——那会永久丢失「文案是否已同步」这一可检信号。

## 已裁定的既有视觉差异（不要误判为新回归）

下列差异是 M31（PrimeVue → caomei-ui 迁移）收尾时**已逐项裁定**的既有形态。基线快照会如实包含它们；
若后续看到这些位置的像素变化，先对照裁定依据，而不是直接当作新回归上报。

**M31.5 裁定 8 项（7 项接受 + 1 项已修复）**——逐项依据（含测量方式与截图索引）见
[caomei-ui-migration.md §15.13 第 6 条](../../../../docs/design/governance/caomei-ui-migration.md#_15-13-b3-收尾实证-m31-5-2026-09-29)：

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
  [§15.11 第 5 条](../../../../docs/design/governance/caomei-ui-migration.md#_15-11-其余表页迁移实证-m31-3-2026-09-28)。
- 6 处 `tone="neutral"` 实底次要动作按钮的实测计算样式（`--caomei-color-neutral-solid` + 白字）见
  [§15.13 第 5 条](../../../../docs/design/governance/caomei-ui-migration.md#_15-13-b3-收尾实证-m31-5-2026-09-29)；
  `Message` soft 档无边框即上表第 4 项。

**上游版本升级带来的基线刷新（caomei-ui 0.6.0，2026-10-12）**——依据见
[§15.15](../../../../docs/design/governance/caomei-ui-migration.md#_15-15-caomei-ui-0-6-0-升级回归实证-插队热修-2026-10-12)：

| 项 | 结论 |
| :--- | :--- |
| `DataTable` 在 `sort-mode="multiple"` 下**所有可排序列**均渲染 `__sort-index`（未参与排序者带 `--reserved` 且文本为空） | 接受（库侧 UX 改进：排序时列宽不再跳动）；视觉用例断言已限定 `:not(.caomei-data-table__sort-index--reserved)` |
| `dialog` 内容底色 `bg → bg-elevated`（暗色 `#1e293b` = `rgb(30, 41, 59)`）；`Drawer` / `Popover` 同批改 `bg-elevated`、`Popover` 圆角 `radius-lg` | 接受（库侧设计口径）；`dark-mode` e2e 的背景断言已同步为新 token 取值 |

## 覆盖边界（现状）

- `pr-checks`：行级渲染已由 M33.4 覆盖——fixtures 端点新增可选 `prChecks` 写入路径（5 行覆盖结论标签四档 danger / success / warning / primary 与 Alert 状态三态 firing / 已 ack / OK）；时间列由 fixtures 钉死 `lastPolledAt` + 视觉环境固定 `locale` / `timezoneId` 保证 `toLocaleString()` 确定性，无需 `data-visual-mask`。**失败信号归因标签（2026-10-31）**：首行两个失败信号分别带 `attribution: self_caused`（danger 档）与 `external_noise`（neutral 档），用例断言两段文案（`本次改动导致` / `外部噪音`）与两个色调 class 同时存在——只断文案会漏色调映射改革，只断 class 会漏 i18n 键漂移。重建基线时该图变化 4242 px（ratio 0.01，新增两个标签）。注：fixtures 端点的信号写入映射此前漏透传 `attribution`（schema 允许但落库丢字段），已同批修复。
- `alerts`：1440 视口下表格容器横向溢出（`clientWidth 1166 < scrollWidth 1318`），整页基线只覆盖可视区左端；最右 `链接` / `详情` 两列由 `alerts-right-<theme>.png` 覆盖（M33.5：容器横向滚到最右后的元素级补拍，仅改容器内部滚动位置，不动 viewport / 阈值 / 列宽）。
- 弹窗内浮层（M34.3）：`dialog-select-open-<theme>.png` 覆盖弹窗内 Select **展开态**（light / dark 各一张）。用**视口级**截图而非元素级 / 整页——门户面板挂在 body、不在弹窗子树内（元素级取不到），整页截图又会把 fixed 定位的遮罩与面板混进拼接；截图前另断言「面板不是弹窗后代」，防止面板未挂载时基线被落成缺面板形态。
- 三个页面仅取亮色（`pr-checks` / `dialog-import-repos` / `login`），明暗两态覆盖 `alerts` / `repos` / `notifications` / `settings` / `dialog-select-open`（后者因门户面板与遮罩存在叠色，分主题采基线）。
- **`settings` / `notifications`（M50.4）**：个人设置页与通知管理员页各按整页截图覆盖明暗两态（`settings-<theme>.png` / `notifications-<theme>.png`）。前置断言锁定本页承载的通知语义（必选 `Critical` 只读行、周汇总提示、`严重级别阈值` 文案）与「当前生效」完整兜底串、语言选值、AI 表单已加载；设备级扫描偏好为空时走系统兜底（确定性），故不额外遮蔽。
  - **投递记录为「空态」**：视觉库不注入 `notification_log`，`最近投递记录` 卡片只覆盖空态与表头；行级状态 / 类别 / 时间列**无基线覆盖**（登记为盲区）。
  - **纵向溢出**：`settings` 整页为 1440×1473（两张卡片位于 900 视口线以下），靠 `fullPage` 拼接覆盖；实测无粘性元素重复与懒加载区块，故不使用 `data-visual-mask`。与 `alerts` 的**横向**溢出边界（整页基线只覆盖左端 + `alerts-right-*` 补拍）是两类不同处理。
- **浮层落点页（M45.5，light 4 张 + dark 1 张）**——均按视口级截图覆盖「页面 + 遮罩 + 浮层」的合成结果：
  - `schedules-form-layer-<theme>.png`：定时计划「新建计划」弹窗 + 业务类型 Select 的**门户面板展开态**。表单的 cron 预览是「当前时刻 + cron」派生值（逐日/逐周变化），已在 `schedules.vue` 标 `data-visual-mask`（遮蔽块入基线）；其余字段与提示文案静态。
  - `scans-run-detail-light.png`：`/scans?run=` 深链触发的 `repo-history-dialog`（`scans.vue` 唯一弹窗落点）。该视图**不渲染运行元信息块**（id / 时间 / 时长），内容主体是结果表——故运行 ID 与时间戳不是本基线的检查面，时间列由底图运行列表覆盖。
  - `alerts-run-drawer-light.png`：`alert-run-sidebar` 的 `CaomeiDrawer` 展开态（右侧滑入面板 + 遮罩）。
  - `pr-checks-toast-light.png`：`CaomeiToastProvider` 的门户轻提示，由「立即检查」在监测未启用时触发（视觉环境未设 `ACTION_STATUS_MONITOR_ENABLED` → 端点返回 `skipped`，**不触网、不改库**，故可与其它用例同批串行）。

### 数据集的确定性取值（新增基线的前置）

凡是会进入画面的**运行时派生值**，必须在 fixtures 一侧钉死，否则基线逐次漂移：

| 取值 | 缺省行为 | 处置 |
| :--- | :--- | :--- |
| `ScanRun.id` | `BaseEntity` 雪花 ID（每次注入不同） | fixtures 可选 `id` 显式钉死；短 ID 会渲染在运行抽屉 / 运行详情弹窗上 |
| `ScanRun.createdAt` | `@CreateDateColumn`（注入时刻） | 可选 `createdAt`；影响运行列表排序与「最近扫描」统计卡 |
| `ScanRun.startedAt` / `finishedAt` | 端点填注入时刻 `now()` | 可选覆盖（`null` = 显式置空，与「不传走状态默认值」区分）；渲染在运行列表 / 运行抽屉的时间与时长列 |
| `ScanRun.summaryJson` / `errorJson` | 可缺省 | 可选 `summary` / `error`；失败运行的详情横幅据此渲染 |
| `ScanResult.createdAt` | `@CreateDateColumn`（注入时刻） | 可选 `createdAt`；**不直接渲染**，但决定 alerts 页「原始列表」的行序（端点按 `createdAt DESC` 排序，同批次插入并列会让行序漂移）→ 视觉 fixtures 逐条取同条 `firstSeenAt` |
| 瞬时时刻（cron 预览、`now()` 派生文案） | 随运行时刻变化 | 页面侧 `data-visual-mask` 遮蔽（加遮蔽必须重生成基线） |
| 设置页「当前生效」派生行 | 读设备级 `localStorage`（`dependfix-scan-preferences`） | 新上下文为空 → 走系统兜底，基线取该兜底文案；若将来把「上次选择」写入存储，需在用例侧显式钉死 |
| 设置页 AI 研判表单 | 组织接口返回的 provider / model / URL | 视觉库为默认组织，字段稳定；用例断言 `#aiModel` 非空，接口失败时先失败而非截成空表单 |
| 设置页「界面语言」 | `useI18n().locale`（默认 `zh-CN`，受 cookie / 浏览器语言检测影响） | 视觉环境以固定 admin 上下文启动、无语言 cookie → 恒为 `zh-CN`；用例断言下拉含「简体中文」，避免语言偏好变化无声进入基线 |

用例侧以 `pinnedRunId(index)` 读取钉死取值并 **fail-fast**：fixtures 被改动去掉 `id` 时用例直接失败，而不是静默产出一张不可复现的基线。

### 运行间确定性取证（2026-10-31）

取证口径分两条路径，**结论不同，不能混用**：

| 路径 | 轮次 | 结果 |
| :--- | :--- | :--- |
| **比对路径**（`toHaveScreenshot`，自带重试）`dialog-select-open-dark` | 连续 10 次不带 update | 10/10 通过 |
| **比对路径** 全量 20 例 | 连续 2 次 | 20/20 通过（31.4s / 29.6s） |
| **重写路径**（`--update-snapshots=all`）全量 20 例 | 连续 3 次 | 3/3 快照集合 sha256 相同（`8970afaa…`；复算命令 `cd apps/platform && find tests/visual/__screenshots__ -name '*.png' \| sort \| xargs sha256sum \| sha256sum`），随后 2 次比对全绿 |
| **重写路径** `dialog-select-open-dark` 单图 | 连续 10 次 | 9/10 与基线逐字节相同；**1/10 出现 99 px / maxΔ2**（比值 0.0076%）的窄带差异 |

**两条订正**（此前的说法都不成立，以此处为准）：

1. **「`--update-snapshots` 连跑 N 轮即字节稳定」是伪证**。不带值时的 preset 是 `changed`，比较通过时**根本不写盘**（Playwright 1.64 `updateSnapshots: 'changed'` 语义），10 轮"重建"其实是同一个文件的哈希。要取证必须用 `=all` 并同时记录 mtime。
2. **update 路径写出的帧此前与比对帧不同**：`=all` 重写后立刻比对会 1218-1313 px 失配（`dialog-select-open-{light,dark}` / `repos-{light,dark}`，2026-10-31 实测）。根因是 update 不做比对、直接落首帧，可能落在门户定位 / 字体替换的中间态；`toHaveScreenshot` 自己会重试到连续两帧一致，所以只有 update 路径中招。**处置**：`waitForVisualStable` 增加「连续两帧截图逐字节相同才返回」（`helpers/visual.ts`），修复后全量 `=all` 3 轮快照集合恒定、随后比对 20/20。

**残余风险（未消除，已登记 backlog 候选 P2）**：`dialog-select-open-dark` 仍有 1/10 概率出现 99 px / maxΔ2 的边缘窄带差异（bbox x 476-483 × y 303-723，位于门户面板左缘）。量级低于门禁（`maxDiffPixels` 100 / `threshold` 0.1 → maxDelta 352），但**仅剩 1 px 余量**——若抖动放大即会偶发红。未加遮罩的原因：Playwright 的 `mask` 只能按元素遮罩，遮住面板边缘等于遮住目标内容本身；根因（门户面板定位的亚像素取值）需单独排查，已登记为 backlog 候选（P2：门户面板左缘亚像素抖动，触发条件 = 该基线偶发红或差异放大）。两帧检查口径补充：取帧为**视口级**，`fullPage` 基线（settings / notifications / alerts）折叠线以下区域不在该检查内，仍由 `toHaveScreenshot` 的比对重试兜底；12 × 120ms 上限内未收敛时**告警不抛错**（避免慢机器假红），日志可定位本轮基线可能非稳定帧。

### 反例标定记录（新增基线非恒真的证据）

| 轮次 | 注入点（暗色档） | 受影响基线 | 差异像素 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `--caomei-color-bg-elevated` → `#4b2e83` | `notifications-dark` / `settings-dark` | 33582 px（3%）/ 654 px | 两例均失败；654 px 说明该 token 在设置页只覆盖小块面积（卡片走 `--caomei-color-bg`），不是基线失敏 |
| 2 | `--caomei-color-text` → `#334155` | `notifications-dark` / `settings-dark` | 8411 px / 15211 px | 两例均失败，正文色变更可被稳定检出 |

- 阈值口径：`threshold 0.1`（maxDelta 352）+ `maxDiffPixels 100`（`playwright.visual.config.ts`）。
- 两组注入均用**文件备份还原**（非 `git checkout`），还原后 `git diff` 为空并复跑全绿；标定不改变任何基线文件。
- 后续若要验证「小面积 token」的灵敏度，应改用页面主表面 token（`--caomei-color-bg` / `--caomei-color-border`），`bg-elevated` 在设置页余量偏薄（6.5×）。

### 集合校验的已知边界

- 集合按 `owner/name` 比较（视觉库为单平台测试库）；同 key 不同 `platform` 的仓库在视觉库中不会出现，若出现会被清理端点按 owner/name 一并删除。
- 清理走 repository 级联（PRCheck → ScanResult → ScanRun → Repository），不级联 `schedule.repositoryIds`（JSON 引用）。视觉库不应创建定时计划；若探针创建过 schedule，需手工清理该行。
- 集合真值来自 `GET /api/repos` 的全量返回；该端点未来若引入分页 / 默认过滤，需同步调整门禁的集合来源（`server/api/repos/index.ts` 已留注释）。
- 清理作用于视觉服务进程当前 `DATABASE_PATH` 指向的库（config 固定 `data/visual.sqlite`）；不要把该 env 指向主库运行视觉套件。

### 已知盲区（本轮未覆盖，登记观察项）

- **运行失败「受约束重试入口」+ 二次确认层**（M45.4 的 `run-detail-dialog` + `CaomeiConfirmDialog`）：只挂在 `alerts` 页，且需要「告警 → `transient` 失败运行」链路；现有视觉数据集的告警只指向已完成运行，补齐会连带重建 `alerts` 基线（改动面超出视觉扩面条目）→ 待该链路有独立需求时再覆盖。
- `scans` 的 Tabs 切换态（按仓库聚合视图）与 `schedules` 列表行（视觉库不注入定时计划 fixtures，仅覆盖空态 + 表单浮层）。
- Toast 的其余 tone（success / danger）与「自动消失」时序。
- 设置页交互态（保存成功 / 校验错误提示 / 禁用点击）与通知页发送测试邮件的提示条：本批只覆盖静态渲染态。
- `Select` 门户面板「首次点击偶发不挂载」的根因未定位（本地实测约 1/6 轮次，重跑即绿）；用例侧以 `openSelectPanel` 做**一次**有界重试兜底（首等 10 秒 + 再点一次等 15 秒，**不按 Escape**——面板未挂载时 Escape 会连带关闭宿主模态弹窗）。
  - **兜底有效性标定**：注入「吞掉首次 pointerdown」后运行该 helper，面板最终可见且耗时 10.6 秒（≥ 首等窗口），证明首击失败后确实由第二次点击补开；标定脚本为一次性探针，未入库。
  - 重试只覆盖「再点一次」，若面板选择器改名 / 结构回归，两次都会失败并照常抛错（fail loud，不产生假绿）。

## 顺序约束与 M45.6 连带重建记录（2026-10-19）

视觉基线原建立在「M45.5 先于 M45.6 执行」的决策上（`docs/plan/todo.md` §M45.5 风险 R4）。
**M45.6（PR Check 告警关注集）已落地**，其实际影响面与当时的预测**不一致**，记录如下：

- **连带重建的基线（2 张）**：`dialog-select-layer.visual.test.ts` 的 `dialog-select-open-light.png` /
  `dialog-select-open-dark.png`——原因是关注集配置区块加在**仓库编辑弹窗**（`repo-form-dialog.vue`），
  弹窗变高导致该组「视口级」截图失配；重建后不带 update 连跑两遍均通过。
- **未受影响的基线（含 M45.5 新增 5 张）**：`pr-checks` 页面仅在**配置了关注集**时才多渲染
  「关注集生效 / 未关注」两个标签；视觉数据集不写 `prCheckFocus` → 页面 DOM 不变，基线逐字节一致
  （实测 `pr-checks-light.png` 未变化，无需重建）。
- **M45.6 的像素盲区**：关注集标注（「关注集生效」/「未关注」）**无视觉基线覆盖**——需要「仓库配好关注集 +
  该 PR 行含未命中信号」的组合，会连带重建 `pr-checks` 基线且价值低于成本；已由 e2e 可见性用例
  （`tests/e2e/pr-checks.e2e.test.ts` 的「未命中关注集的信号在展开行标注『未关注』」）承担断言，
  视觉面登记为本轮已知盲区。

**后续约束**：任何改动 `schedules` / `scans` / `alerts` / `pr-checks` / 仓库编辑弹窗的可见结构或文案，
都须按 [测试规范 §6.7](../../../../docs/standards/testing.md) 「改动页面即需重建其基线」连带重建受影响基线，
并**不带 update 连跑两遍**复核。

## 不做什么

视觉回归只兜「像素漂移」。交互、可用性、可访问性与语义正确性由 `ui-validator`（浏览器验证）与
e2e 功能层承担，不要用本目录替代它们。

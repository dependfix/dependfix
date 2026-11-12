# 1.0 发布门槛与就绪度台账

> **状态**：🔶 进行中（2026-10-25 立项；目标 `1.0.0`）
> **定位**：1.0 的**唯一门槛清单与证据台账**。各专项设计仍以自身文档为准（如 [pr-delivery-closure.md](./pr-delivery-closure.md)、[security.md](../../standards/security.md)），本文件只回答「1.0 还差什么、怎么判定、什么时候做」。
> **维护规则**：每次批次收口更新「当前读数」与「批次」列；门槛判定变化必须附证据（run id / analysis id / 命令输出 / 文档 diff）；不得在未留证据的情况下把门槛标绿。

## 1. 1.0 的承诺（对外语义）

1. **semver 承诺**：`1.0.0` 起，破坏性变更必须走 `2.0.0`（0.x 阶段不受此约束）。
2. **入口承诺**：CLI（`report-only` / `fix` / `fix-and-pr`）、GitHub Action、MCP Server、Agent Skill、管理平台五条路径均可独立使用并有文档。
3. **部署承诺**：Docker 单容器 + SQLite 为默认可用形态；PostgreSQL / Helm 为可选形态（不在 1.0 阻断面，见 §3.3）。
4. **安全承诺**：**发布物**（5 个 npm 包 + platform Docker 镜像）不带未被 [§5.7](../../standards/security.md#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05) 豁免的 critical / high 漏洞；仓库依赖审计为**阻断级**门禁。
5. **可回滚承诺**：发布可回滚（tag / 镜像 tag / npm 版本均保留），数据升级有迁移与备份路径。

## 2. 门槛与判定（G1-G8）

> 量化断言均附测量命令与时点；无法当次复现的历史读数标注来源。

| 门槛 | 达标条件（可判定） | 证据物 | 当前读数（最近更新 2026-11-07；1.0.0 已发布，G5 / G6 / G8 转 ✅） | 批次 |
|:--|:--|:--|:--|:--|
| **G1 安全清零** | ① 发布物（5 npm 包 + platform 镜像）无**未被 §5.7 豁免的** critical / high 生产漏洞；② code scanning 0 条未处置告警；③ 存在 **prod 阻断步骤**（`pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org`，无 `|| true`，见 security.md §5.6）+ 全量依赖信号步骤；周回归使用同一 prod 阻断命令；④ 周回归最近 3 次`security:audit-deps` 均通过且日志含审计结果行（记录 run id；M49.3 只要求 1 次，3 次为 1.0 G1 口径） | 全工作区 `pnpm audit --prod --registry=https://registry.npmjs.org` + 按发布包审计记录；code scanning API（analysis id）；`test.yml` 步骤；周回归 run | ✅ **2026-11-05 达标**（④ 补齐后）——全工作区历史读数 23 条（4 high / 15 moderate / 4 low，1 ignored；`2026-10-25` 实测，含 dev；10-23 周回归 prod 口径为 11 条〔2 high / 8 moderate / 1 low，1 ignored〕）；Dependabot 31 条（2 critical / 5 high，其中 node-forge 属 §5.7 豁免）；code scanning 2 条；（M49.3 前）审计步骤仍 `|| true`；周回归连续 4 周红。**M49.2a/2b 后（`2026-10-26`）**：全量 audit 0 条 advisory（0 critical / 0 moderate / 0 low；另 1 high ignored = node-forge），prod audit 0 条；Dependabot critical / high 6 条可修复项已关闭 + node-forge 豁免；medium / low 已清零（`2026-10-26T12:41Z` 关闭），开放项仅 node-forge high；code scanning 已复扫 0 条（analysis `2026499469`）。**M49.3 后（2026-10-27）**：prod 阻断步骤已上线（无`|| true`，含`--registry` + `--ignore-registry-errors`），全量信号保留；3 次 master push run id（翻转后，日志含审计结果行）已回填：`40372808067` / `40466448172` / `40690157020`（步骤均 success；`40690157020` 整体因文档字符预算失败，与审计无关，已由 `ea89e7ec` 修复）；周回归 `40693124400`success（gate 日志含审计结果行）。M49.3 闭环。**M49.5 后（`2026-10-29`）**：版本已复核（5 npm 包发布 + 7 个 tag + GitHub Release）；**发布物安全复核未执行**（待 Docker run 收尾 + 按发布包 audit）；发布前安全告警门禁已落地（`check:release-security`，critical 含 dismissed 一律阻断、high 需台账）并接在`release.yml`；**本地备用通道未执行该门禁**（0.6.0 经该通道发布，已登记 backlog）。G1 ④「周回归最近 3 次」仍待累计（当前 2 次：40693124400（10-28 dispatch）+ 41101319146（10-30 schedule）；再 1 次通过即满足）。**0.7.0 发布后复核（`2026-11-02`）**：发布物 4 个 npm 包 + 6 个 tag + GitHub Release v0.7.0（Latest / 非 prerelease）；镜像 platform-0.5.0 已由 dispatch 41439905381 发布（四标签 + 双架构，见 G7），health 已于 11-05 经 ACR 验证、客户端 manifest 未复核；prod 审计 exit 0（1 low + 1 ignored moderate = minimatch，§5.7）；Dependabot 开放 1 条 low（#125 deepmerge；#126 minimatch 已于 11-05 前关闭）；Code Scanning 开放 **0** 条 → **① 非豁免 critical / high = 0**；`npx dependfix@0.7.0 --version = 0.7.0`（关闭 0.6.0 的`--version` 缺陷）。**④ 达标（3/3）：40693124400（10-28 dispatch）+ 41101319146（10-30 schedule）+ 42017415845（11-05 手动触发，PASS security:audit-deps 且日志含审计结果行：2 vulnerabilities found / 1 low | 1 moderate (1 ignored)）**，本行转 ✅（① 非豁免 critical / high = 0；② code scanning 0；③ 阻断步骤在 `test.yml` 与周回归同一命令）。**1.0.0 发布后（2026-11-07）**：发布 run `42351775424` 的门禁与发布后复跑均 PASS——`check:release-security` critical 0 / high 0 / moderate 1 / low 1；`pnpm audit --prod --audit-level=moderate` 2 条（1 low + 1 §5.7 豁免 moderate = `minimatch`，口径为工作区生产依赖图，非逐包 tarball 审计）；Code Scanning 开放 0 条 → npm 发布物与工作区生产依赖的非豁免 critical / high = 0 成立，镜像面留待 G7 回填 | M49 + F2 + M54.2 |
| **G2 契约冻结** | CLI 参数与模式、Action inputs、报告 JSON schema、配置键、平台 DB schema 五类冻结清单成文；弃用策略与 0.x→1.0 迁移指南成文 | `docs/guide/contract-freeze.md`（五类清单 + 弃用策略 + 迁移指南）+ `pnpm run check:contract-freeze`（`gates:docs`） | ✅ **2026-10-31 M53.1 闭环**：五类清单逐项成文（CLI 43 / 运行模式 4 / Action 31 / `RuntimeConfig` 41 / `DEPENDFIX_*` 48 / 报告 17+11 / DB 15 表）；弃用策略（1 minor 提前期、移除只在 2.0）与 5 条迁移指南（`--version` 元数据缺陷 / 引擎交付链导出异步化 / `--allow-major-upgrade` 无 env / `on-baseline-red` 默认 skip / `signalsJson` 收敛后语义）成文；机检 11 类比对全绿并接入 `gates:docs`（含 zh·en quick-start 参数表 == `argsDef`） | G |
| **G3 真实环境 E2E** | G3.0–G3.8 九条独立路径各留 1 条证据 + G3.9 AI 横切另计（2 家 × 5 场景） | run id / 截图 / 日志 / 报告产物 | ❌ **执行框架已就绪（2026-11-01 M53.5）**：十条路径的四要素 + 最小命令见 [真实环境矩阵指南](../../guide/real-env-matrix.md)，证据模板 / 字段校验（`pnpm check:real-env`）可用；**G3.8 有本地预演 `partial` 证据**（三条安装路径 + Docker 静态检查；`@latest`、远端镜像与 0.5.x→1.0 升级另计）。其余九条仍只有 mock / 单元证据，实跑待用户提供 OAuth / IdP / staging / 测试仓 / AI Key（G3.0 当前 `pending`：GitHub / Google / OIDC 均未实跑；Google 入口因无可用 Google 账号暂不可测）；全部 `passed` 后由 `pnpm check:real-env --require-all` 作 1.0 发布前专项检查。**1.0 发布豁免（2026-11-01）**：G3 实跑未完成，不构成通过；发布说明「已知限制」披露（骨架见 [release-1.0.md](../../guide/release-1.0.md)）。**retry_condition**：用户提供 OAuth / IdP / staging+Redis / 测试仓 / AI Key×2 / `read:packages` 后按真实环境矩阵补测，Google OAuth 待账号可用后单独补测。 | G（依赖外部资源） |
| **G4 CI 稳定性** | `master` 连续 20 次 push 绿或连续 2 周无红；flake 率 < 2%；无 P0 事故 30 天 | `gh run list --limit 100` 统计（分子 = 非绿 run 数，分母 = 窗口内 run 数） | ◐ 近 40 次 34 绿（3 失败 / 3 取消）；失败含 dependabot 分支 2 次与 master「Dependabot Updates」1 次，取消为 Docker 被后续 push 取代。**0.6.0 发布后窗口起点（`2026-10-29`）**：`efaa555f` Test 全绿 1 次（`40744772890`，E2E / Coverage / Visual 同步 success），后续 push 继续累计。**2026-11-01 复测**：0.6.0 后 15 次 push 中 4 次 Test 失败。**2026-11-02 冻结读数（M54.4，实测）**：① 降级判据「最近 10 次 master push 的 Test 0 失败」→ **9/10 绿，未达成**，唯一红 = `41347144192`（`5bbebc9f`，`2026-11-01T20:29:57Z`），失败点 `scripts/release/preflight.test.mjs:347`「预演前后工作区状态不一致」，diff 仅 `M apps/platform/CHANGELOG.md`；其后下一次 push（`56191e91` / `41347687263`，`2026-11-01T20:36:02Z`）立即回绿，本地全量复跑未复现（372 文件 / 5715 passed），判为 CI 并行下的测试隔离缺陷（候选登记，非产品回归）。② 0.6.0（`2026-10-28T18:24Z`）以来 38 次 master push 中 30 绿（8 红；不含 0.6.0 发布自身 1 次，含则 31/39），**20 连绿 / 2 周无红亦未达成**。run id 清单与 JSON 快照见 `artifacts/m54.4/g4-window.txt` / `g4-test-runs.json`（gitignored）。**1.0 发布豁免（2026-11-01）**：按「最近 10 次 master push Test 0 失败」降级判据，未达成则披露实际读数；`flake 率 < 2%` 与「30 天无 P0」保留为观察项，不作为 1.0 阻断（已知 flaky 两文件复测 20/20 绿，见 G5 行）。**retry_condition**：最近 10 次 master push 的 Test 全部成功即关闭本豁免；仅在 20 连绿 / 2 周无红窗口真正满足时才可改写该口径。 | G（观察窗口）+ M54.4 |
| **G5 测试与覆盖率** | 四维 ≥ 80%（现阈值）；关键模块 mutation 全覆盖（范围 = §2.3 三链）；全量测试无 flaky 复发 | `pnpm test` + `pnpm test:coverage`（报告口径：四维百分比）+ mutation 工件 | ✅ **2026-11-02 M54.3**：关键模块清单成文（3 条链 + 选择理由，见 §2.3）；三条链 5 + 4 + 4、合计 **13/13 击杀**（工件 `artifacts/review-gate/2026-11-02-m54-3-mutation.md`：文件 / 变异前 md5 / 失败用例 / 复现命令，还原后 md5 一致），关键模块面 **3/3 已建守卫**，**不声称全仓 100% mutation**；累计 24（M52.4 3 + M53.3 8 + 本批 13）。覆盖率复测（同批，`pnpm test:coverage` exit 0）：Statements 89.76% / Branches 84.22% / Functions 90.44% / Lines 89.88%（四维均不低于 2026-10-31 读数）；全量 372 passed / 2 skipped 文件、5715 passed / 10 skipped 用例。flaky 面（scan-config / repos-crud）有界复测已完成（M54.4 `2026-11-02`：两文件各连跑 10 次、每次 5 / 10 例，**20/20 绿、0 flake**，日志 `artifacts/m54.4/flaky-retest.log`）；历史分档见 [M52.4 闭环](../../plan/archive/todo-archive-phases-m52.md)。**1.0.0 发布日复核（2026-11-07）转 ✅**：发布 run `42351775424` 的 `pnpm run test` 通过（CTA 记为 371 passed + 1 修后回绿），本地同 HEAD 全量 `pnpm test` = 372 文件 / 5720 passed / 10 skipped；四维覆盖率维持 M54.3 读数（89.76 / 84.22 / 90.44 / 89.88），关键模块三链 13/13 守卫在位，全仓 mutation 不在 1.0 口径 | M54.3 + M54.4 + M52.4 / G 引用 |
| **G6 文档与可发现性** | 五入口指南完整；关键文档 en-US 平价（含本台账）；0.x→1.0 迁移指南；`@v1` 滚动 tag 可用 | 文档站构建 + `@v1` tag | ✅ M49 发版面 6 处漂移已闭环（AI 输入名 / M5 遗留 / MCP tool 数 / 设计索引 3 行，2026-10-26）；用户可见入口（quick-start / 首页 / README）的 Action 示例已回填 `v0.6.0`（2026-10-29）；版本引用已全部回填（用户可见 4 + 设计文档 4 + en-US 镜像 2）；指南与设计镜像结构平价已由 M52 收口（本台账 en 入口行已补）；剩余 = 设计文档全量英译（1.0 后评估）。**1.0.0 发布后（2026-11-07）转 ✅**：`@v1` 滚动标签已创建（annotated `097723a7` → 解引用 `83c966fd`，与 `v1.0.0` 同一发布提交），`uses: dependfix/dependfix@v1` 可用；发布说明由根 CHANGELOG 1.0.0 段生成，含迁移指南链接 | M49（发版面）+ F2（已闭环）+ G |
| **G7 运维与发布** | 镜像 / 备份恢复 / 启动迁移 / 回滚均实测；发布自动化可启用（`schedule` / `push` 开关就绪）；Postgres+Helm 记为可选并文档化 | [deployment.md 实测记录](../../guide/deployment.md) + [release.md 启用清单](../../guide/release.md) + release workflow | ◐ **运维实测 ✅（2026-10-31 M53.2）**：镜像启动 + `/api/health` + report-only 扫描（run `68647e2b00824e3b` 1.7 s `completed`/exit 0）；自动备份 323,584 字节 → `db:restore` → 三方逐表 0 差异 + `integrity_check: ok`；迁移前滚 19 → 回退 1 → 再前滚 1；队列收敛双分支（无消费者 pending 30 s → 带消费者 1 s 完成；running 中被杀 → 重启后 `orphan_run` 收口 + 释放 job）；同时修复两处阻断缺陷（F1 worker 无消费者 / F2 WAL 空备份，含 `db:restore` 同源路径）。**发布自动化**：`schedule` / `push` 开关就绪、8 项启用清单与 dry-run 成文，但「可启用」仍待 G1-G8 全绿与直推 master 验证（清单第 1/5 项）——故本行整体保持 ◐。**发布级回滚**（迁移回退已实测）：**M54.5 逐面演练（2026-11-02，面清单 = npm / git tag / GitHub Release / `@v1` / Docker / 数据库）**——npm drill 通过（`deprecate --dry-run` 无副作用）、git tag drill 通过（本地一次性 tag 创建 / 删除，生产 tag 不变）、数据库引用 M53.2 备份恢复实测、GitHub Release 仅判据核对（删除 / 重建未执行）、`@v1` 延后至 1.0.0 发布后、**Docker 面演练当时（11-02 傍晚）blocked 且镜像未核实，同日 19:50 由 dispatch `41439905381` 补发，余客户端 manifest / health 未复核（health 已于 11-05 经 ACR 验证）**；**不宣称全部面已演练**（记录见 [release-1.0.md §5.1](../../guide/release-1.0.md#_5-1-演练记录-m54-5-2026-11-02)）。Postgres+Helm 仍记为可选（未引入）。**0.6.0 镜像 tag 缺失已定位并修复（2026-11-01）**：docker 派发运行 `40745976335` 的 build job 触及 **120 分钟 job 上限**被 kill（build step 已跑 115.5 分钟），`platform-0.4.0` 从未推送；已把预算提到 240 分钟、发布构建单列并发组并禁用取消（防被 push 取代白烧算力），`release.yml` 派发钉 `v<锚版本>` 且判据为 `git tag --points-at HEAD`。根治方向（原生 arm runner / 按架构拆 job）已登记 backlog。远端镜像复核仍待具备 `read:packages` 的 token（本环境 GHCR 私有 / Docker Hub 不可达）。**0.7.0（`2026-11-02`）**：本地手动发布通道发布完成（4 个 npm 包 + 6 tag + GitHub Release），镜像另经 `docker.yml` dispatch `41439905381`（`--ref v0.7.0`，`platform_version=0.5.0`，success）补齐 `platform-0.5.0`——`latest` / `2026-11-02` / `platform-0.5.0` / `sha-a049a56` 四标签、双架构 manifest `sha256:71f6633…a244f1`、**build job 22m03s**（240 分钟预算余量确认），`BUILD_VERSION=0.5.0` 已注入；客户端复核：**ACR 已实测**（2026-11-05，公开仓库匿名拉取 + `docker run` 冒烟 PASS，`/api/health` = 0.5.0 / `a049a561`，15 张业务表）——但该 tag 在 ACR 解析为**单一 amd64 manifest**（index 仅按 digest 可取，含 amd64 + arm64），**双架构未通过 ACR 验证**；GHCR（需 `read:packages`）与 Docker Hub 仍 blocked。**1.0.0（2026-11-07）**：`release.yml` 发布成功后按 `--ref v1.0.0` + `platform_version=1.0.0` 派发 `docker.yml`（首轮 `42352117141` 超时取消，见后文）。**1.0.0 镜像（2026-11-07，原生多架构）**：QEMU 方案两次触 240 分钟上限被取消（`42351771958` / `42352117141`）；改原生 amd64 + arm64 runner + digest 合成后 run `42381362295` 全绿（无版本派发另由 `42376062304` 验证 9/9），三 registry × 4 tag 回读 **12/12 双架构**（`linux/amd64 + linux/arm64`），并新增回读门禁（`f7917cab`）防单架构静默降级；**1.0.0 镜像 `/api/health` 已于 2026-11-07 本地复核**（ACR 拉取 + `smoke-test.sh`：`1.0.0` / `5c810587…` / 15 表，PASS），发布自动化仍未启用（用户决策），故整行维持 ◐ | G + M54.2 |
| **G8 产品指标** | 采集并公开「近 30 个 dependfix PR 的 CI 绿率 / 人工介入率 / 误关率」，且在 1.0 发布说明中引用 | 统计脚本 + 发布说明 | ✅ **脚本已就绪（2026-10-31 M53.3）**：`scripts/metrics/pr-health.mjs`（API / 本地快照两路径，缺 token 直接失败、不返回 0 值读数）+ 28 例单测（含夹具确定值）锁定口径（夹具读数：绿 5/7 · 介入 2/7 · 误关 2/7）；**真实读数（2026-11-01，`--days=30 --limit=30`）**：30 个 PR / CI 绿率 24/30 = 80% / 人工介入 0% / 误关 0%。**2026-11-02 复算（M54.4，同日冻结）**：30 个 PR / CI 绿率 **25/30 = 83.3%** / 人工介入 0% / 误关 0%（绿 25 / 红 5 / pending 0；报告 `artifacts/metrics/pr-health-20261102.{md,json,snapshot.json}`，gitignored）。窗口为滚动 30 天，**1.0 发布说明引用发布当日复算值**（不得沿用 11-01 的 24/30）；**1.0.0 发布说明已引用（2026-11-07）转 ✅**：GitHub Release `v1.0.0` 正文「指标（G8，2026-11-07 复算）」段收录 **25/30 = 83.3% / 人工介入 0.0% / 误关 0.0%**（窗口 2026-10-08 → 2026-11-07）与取数命令，产物 `artifacts/metrics/pr-health-20261107.{md,json,snapshot.json}`（gitignored）；同一读数同步写入根 CHANGELOG 1.0.0 段。**引用要求（M54.1）**：发布说明骨架已固定「指标（G8）」段，必须含该读数与取数命令，见 [release-1.0.md](../../guide/release-1.0.md)。 | G + M54.4 |

### 2.1 G8 指标口径（写死，改动须同步 `scripts/metrics/pr-health.mjs` 与夹具）

- **窗口**：`--days`（默认 30）内创建、按创建时间倒序取前 `--limit`（默认 30，上界 1000）个 PR；三指标分母统一 = `window.prCount` = `min(窗口内 PR 数, limit)`。
- **CI 绿率**：head 提交的 check run（**不含 commit status API**）至少一个 `success` 且无失败 / 未完成；无 check、全 neutral / skipped、pending 均不算绿（分档计数单独披露）。
- **人工介入率**：PR 上出现非机器人作者的 commit 或 review（机器人 = actor type `Bot` / 登录名 `[bot]` 后缀 / 已知名单；**未关联到账号的 commit 按人工处理**）；由人创建的 PR 通常因自带人工 commit 而计入，`humanAuthored` 单独披露、不进分子。
- **误关率**：关闭后被人重开（含重开后仍 open / 随后合入），或关闭未合并后同一 head 分支（base 相同）的新 PR 在其关闭之后合入；`closedAt` 缺失时回退 `createdAt`，两者都缺或 `mergedAt` 不可解析时「再落地」分支不计入（`reopened` 不受此限）。另给 `closureRate`（误关 / `closedUnmerged`：曾关闭未合并，含重开后合入）作诊断；`reopened` 不区分重开者（自动化重开也计入），属已声明边界。
- **取数**：`GITHUB_TOKEN=<token> pnpm metrics:pr-health --repo=dependfix/dependfix --out-dir=artifacts/metrics`；`--out-dir` 同时落 `pr-health-<date>.snapshot.json`，可回灌 `--source=file` 离线复算（夹具 `scripts/metrics/__fixtures__/pr-health.sample.json` 的三指标 = 上表读数，单测锁定）。窗口内 0 个 PR 默认失败（`--allow-empty` 显式放行），避免把「没取到数」写成 0% 绿率。本脚本需 token + 网络，**不纳入 `gates:docs`**，单测由 `pnpm test` 覆盖。

### 2.2 1.0.0 发布窗口决策（2026-11-01 用户）

| 决策 | 结论 | 判定语义 |
|:--|:--|:--|
| 规划 commit | `3a95f2e5`（2026-11-01 `docs(plan): 规划 M54 1.0.0 发布窗口`） | 本表为决策落盘位置；执行清单与发布说明骨架见 [1.0.0 发布清单与发布说明骨架](../../guide/release-1.0.md)（M54.1） |
| 发布目标 | **先 0.7.0 再 1.0.0**（原定 0.6.1，2026-11-01 执行期改为按脚本推导的 0.7.0，见下行） | 0.7.0（= `dependfix` 锚版本）验证 M53 修复后的发布链（Docker 预算 / tag 派发 / `--version`）；1.0.0 目标窗口 **2026-11-15** |
| 中间版本口径（用户 2026-11-01 执行期裁定） | **按 `release:plan` 推导发布** | `dependfix` 0.7.0 / `@dependfix/core` 0.7.0 / `@dependfix/engine` 0.6.0 / `@dependfix/mcp` 0.3.1（传导）/ `@dependfix/platform` 0.5.0；`@dependfix/skills` 无改动不发布。不人工降级为 0.6.1——0.x 的 feat 与破坏性变更按仓库规则进 minor |
| 门禁口径 | **有条件发布** | G3 实跑 / G4 窗口按已披露豁免降级；G5 关键模块 mutation、G6 发版文档、G7 回滚演练等可执行项补齐；G8 引用真实读数 |
| Google OAuth | **接受未测并披露** | G3.0 保持 `pending`（**无 G3.0 证据**），发布说明「已知限制」写明无可用 Google 账号；GitHub / OIDC 通道亦未实跑，资源到位后补测 |
| G4 降级判据 | **最近 10 次 master push 的 Test 0 失败** | 未达成则记录实际读数与豁免，不得写成 20 连绿 / 2 周无红 |
| G3 豁免边界 | **不宣称 G3 通过** | G3.0–G3.9 实跑未完成，G3.8 仅 `partial`；资源到位后按真实环境矩阵补测 |
| 版本方案（2026-11-05 用户） | **六个发布包全部随 1.0.0** | `dependfix` / `core` / `engine` / `mcp` / `skills` / `platform` 均 `major` → `1.0.0`；`platform` 仍走 tag-only + 镜像 `platform-1.0.0`；`release-plan.md` 按此手写（docs-only 窗口下 `release:plan` 不产计划） |
| 发布通道（2026-11-05 用户） | **`release.yml` 的 OIDC dispatch** | 本地通道仅应急；dispatch 会以 `--ref v1.0.0` 自动派发 docker 并带 `platform_version=1.0.0` |
| 镜像复核通道（2026-11-05 用户） | **经阿里云 ACR 核实** | 匿名拉取 + `docker run` 冒烟验证 `/api/health`；ACR 个人版定位为 amd64 备份通道（按 tag 行为依推送路径而变）；双架构用 GHCR / Docker Hub 或 OCI digest（ACR 企业版路径 1.0 不采用，见[发布管线设计 §4.7](release-pipeline.md)） |
| G1 ④ 第 3 次周回归（2026-11-05 用户） | 等 11-06 计划运行或手动触发一次 | 2026-11-05 已手动触发 `42017415845`（同 `weekly` profile），成功即满足 3 次 |

### 2.3 G5 关键模块清单（3 条链，2026-11-02 M54.3）

> 判据：任一条链的判定被改写，都会静默改变「是否归因本次改动 / 升到哪个版本 / 退出码是否红」，且后果落在 CI 常态与定时扫描上。清单只声明这三个模块面受 mutation 守卫，**不等于全仓 full mutation**。

| 链 | 模块（单一事实源） | 选择理由 | 本批变异 |
|:--|:--|:--|:--|
| ① 验证结果判定链 | `packages/engine/src/app/verify-project.ts` | 基线豁免 / 零写操作豁免 / 安装失败识别 / 既有失败去重任一失效 → 把目标仓库既有红算到本次修复（回滚合法修复），或反向放过本次引入的红 | 5（V1-V5） |
| ② 升级选择链 | `packages/engine/src/app/repo-fix-major.ts` + `upgrade-alert.ts` | 同包多告警取最高目标 / 脆弱实例复核 / 环境性失败停机 / 间接依赖回退 overrides：选错目标或漏停机 → 交付不可用版本或耗空预算 | 4（U1-U4） |
| ③ 基线红 / 退出码链 | `packages/engine/src/app/skipped-delivery.ts` + `result-assembly.ts` | 载体落点 / dry-run 降级 / 既有失败与环境性失败的非归因谓词：误判即平台 `engine_exit_2` 误标 failed 或静默放过真实失败 | 4（B1-B4） |

- **证据**：`artifacts/review-gate/2026-11-02-m54-3-mutation.md`（gitignored；逐条文件 / 变异前 md5 / 失败用例 / 复现命令，还原后 md5 核对一致；驱动脚本与机读结果同目录归档）。累计 mutation 24（M52.4 3 + M53.3 8 + 本批 13）。
- **补测记录**：V4（去重守卫关闭）首轮存活 → 补「基线安装失败已先记录 → 修复后同命令只保留一条」；V5（去重谓词放宽到只比类别）标定新增反向用例「其它仓库的同命令既有失败不被吞掉」。两例均为新增，未改写既有断言。
- **不做什么**：不追求全仓 mutation 分数；不把本表读成「关键模块已 100% 变异覆盖」（未覆盖分支靠 review 与已知边界兜底）。

## 3. 工作分档（1.0 scope cut，2026-10-25 用户初步确认）

> 分档依据：P0 = 1.0 阻断（正确性 / 安全 / 用户可感知的关键缺陷）；P1 = 1.0 期望（可随批或 1.0.1）；1.0 后 = 明确不进 1.0 的重大功能或大改。候选详情仍以 [backlog.md](../../plan/backlog.md) 为准。

### 3.1 P0 阻断（23 项 = 候选 19 + 安全 4）

| 批次 | 项 | 说明 |
|:--|:--|:--|
| **E（通知可信度）= M50** | ① critical 告警必选不可关闭 ② 通知严重级别术语与阈值命名 ③ 周报投递重试与窗口锁 ④ `/settings` 与通知页 dark 视觉 | 已授权；4 原子一批；**2026-10-29 上收 M50 / 2026-10-30 已归档**（[M50 归档分片](../../plan/archive/todo-archive-phases-m50.md)）：用户决策 = M 编号 M50（F1/F2/G 顺延 M51-M53）/ 通知侧保留 `Critical`·`High` 专有名词 / `critical` 独立计数桶（沿用同一 `maxPerHour`）；执行顺序 1→2→3→4（视觉基线必须晚于文案改动） |
| **F1（语义与数据）** | ① 平台 PR Check 创建后回环 ② 平台 / CLI `completed + null` 口径统一 ③ `ScanResult` 修复结果回写（converged 状态）④ 基线红 / 安装失败的交付降级策略 ⑤ 交付类同步调用纳入运行级取消面 ⑥ 单仓通用执行预算 / deadline ⑦ JSON 配置列写入闸门（`sandboxLimits` / `tags`）⑧ alerts 原始列表排序并列兜底 ⑨ head 侧同 ref 多轮 check run 收敛 | 9 项；③ 影响通知真实性，①③ 优先；**已闭环（M51，2026-10-30 归档）**：6 原子全部闭环，九项映射见 [M51 归档分片](../../plan/archive/todo-archive-phases-m51.md)（M51.1=③、M51.2=②+⑨、M51.3=①〔评论 / 关闭已落地；有界重试按用户 2026-10-30 裁定延后，契约见 pr-feedback-loop.md §8〕、M51.4=④、M51.5=⑤+⑥、M51.6=⑦+⑧）；阶段首父链 35 commits / 唯一 diff 136 文件 / +6598 −503；6 原子均经 Review Gate，首个通过前分区 Reject 共 10 次，收口后全部 Pass |
| **F2（文档与验证）** | ① `en-US` 配置指南存量漂移 ② `quick-start` en-US 裁剪漂移 ③ zh 设计文档拆分后 en-US 镜像漂移（含本台账平价）④ 归档双连字符死锚（含 `#31-…` 与 `-de-` 家族）⑤ pr-checks 归因标签渲染验证 ⑥ 视觉基线运行间非确定性 | 6 项；①-④ 为文档平价，⑤-⑥ 为质量证据；**2026-10-30 上收 M52 / 2026-10-31 已闭环归档**（[M52 归档分片](../../plan/archive/todo-archive-phases-m52.md)）：①② 指南平价机检（`docs:check:guides`）、③④ 设计镜像结构映射 + 锚点产物 id 门禁（`docs:check:mirror` / `anchor-id`）、⑤ 归因标签视觉守卫、⑥ 视觉确定性取证（含 update 落帧修复）；用户追加 caomei-ui 1.0.0-rc.1 升级（不占编号）同批闭环 |
| **安全（非候选）** | ① 2 条自产 code scanning 告警 ② 未被 §5.7 豁免的 critical / high 清零（Dependabot 同口径）③ 审计门禁转正（prod 阻断 + 全量信号）④ 周回归转绿 | ③ / ④ 依赖 ①② |

### 3.2 P1 期望（8 项，可随批或 1.0.1）

镜像脚本形态扩展（`pnpm --filter` / 递归 / env 前缀）、白名单内运行前改动归属、provider 原生日志富化、列表页筛选 / 分页共享抽取、`caomei-ui-migration.md` 保序拆分、`architecture.md` 未采用项清理、规范文件瘦身（`ai-collaboration` / `platform` / `git`，含 `ai-collaboration` 健康上界子项）、M44 蒸馏条款检查点挂接。

### 3.3 1.0 后（候选 15 条 + 暂缓 / 远期 8 项；2026-10-25 用户初步确认）

> `#N` = [backlog §候选评估中](../../plan/backlog.md) 自上而下第 N 条（**2026-10-30 台账冻结时实测 53 项** = 10-29 的 58 项 − F1 上收 9 项〔已转 M51〕+ 2026-10-30 复盘派生 4 项；其后阶段内新增 8 项〔用户实测派生 2 + 复审衍生 4 + 收口登记 2〕、上收 F2 七项、再登记全量镜像 1 项，backlog 概览此后为 55 项（M53 上收 2 项后；后续批次仍会增长，实时数以 [backlog 概览](../../plan/backlog.md) 行为准，2026-11-01 机械复算 66 项），既有条目的前置位置序号随之变化）。其中「`ai-collaboration.md` 健康上界」与 §3.2 的「规范文件瘦身」同源归并（前者属后者子集）；台账分档（19 + 8 + 15 = 43 条候选 / 42 个主题）不因上收收缩，1.0 scope 不变；上收后 `#N` 整体前移，引用以条目主题为准。
>
> **位置序号脆弱性提示**：`#N` 为文档位置序号，任何候选增删都会使其后条目前移（2026-10-29 上收 4 条即发生）。引用候选时以「条目主题」为准，`#N` 仅作当次实测的定位辅助。
>
> **2026-10-27 用户决策**：本地日志通道统一已上收 M49 追加临时待办（不占条目编号）；Sentry 走官方 SaaS；Axiom 作为后续增量；除本地日志优化外的可观测性条目延后到 1.0 之后排期。

**候选 15 条**按主题合并为 10 组：

1. 运行面漏洞检测（镜像基底 / 运行时二进制 / OS 包，新告警源）—— #14
2. 独立 installer 容器与 runtime 工具链移出 —— #37
3. 仓库级 `allowMajorUpgrade` —— 已落地（M55.5，2026-11-08 归档）
4. 执行资源采集扩展 —— #43
5. 服务端跨设备扫描偏好 —— #18
6. 死代码 / 设计快照 / 体量治理（闲置解构、history 模式不可达、设计快照陈旧、`max-lines` 超标）—— #17 / #19 / #20 / #21
7. 设置页严重级别查找与展示标签 helper 收敛 —— #23
8. 企业私服独立 CDN 白名单 —— #24
9. 文档 / 规范债务（归档强调、归档 file-dead 前缀、分片口径）—— #26 / #27 / #28
10. 升级探针合批 —— #42

**暂缓 / 远期 8 项**：T703 GitLab + Bitbucket、D1 仓库级 admin、D3 多租户组织、SAML 2.0 SSO、B2 固定分支单线、C37 多设备语言偏好、C68 Git 代理 / 镜像、T705 生产级部署（PostgreSQL + Helm，记为可选形态；Sentry 已拆出为独立可观测性候选，不随 T705 暂缓）。

**决策记录**：以上 1.0 后项在 1.0 发布说明中作为「已知非目标」列出，避免用户预期错位；实施另行立项。

## 4. 真实环境验证矩阵（G3）

> 源清单：[backlog.md §待人工验收](../../plan/backlog.md#待人工验收-真实环境-随可用性推进)。本表把 T701（真实凭据 3 项）映射为 G3.0（登录）、T702 / T704 映射到 G3.4、PR Check polling 映射到 G3.5、发布管线收尾映射到 G3.8，并补充 AI（G3.9）与安装升级（G3.8）两条路径。
> **执行框架已就绪（2026-11-01 M53.5）**：每条路径的「前置资源 / 最小可执行命令 / 证据字段 / 验收判据」见 [真实环境矩阵指南](../../guide/real-env-matrix.md)；证据模板由 `pnpm check:real-env --init` 生成到 `artifacts/real-env/`（gitignored），`pnpm check:real-env` 校验字段完整性（缺字段 / 证据文件不存在即失败），`--require=...` / `--require-all` 作发布前门禁。**模板就绪与 `pending` 都不等于通过**。

| # | 路径 | 现状 | 前置资源 | 执行步骤（最小） | 证据字段 | 验收判据 | backlog |
|:--|:--|:--|:--|:--|:--|:--|:--|
| G3.0 | 平台登录（GitHub / Google OAuth、IdP OIDC、构建期凭据按钮） | 单测 + e2e（Google 暂不可测，先只跑 GitHub） | GitHub OAuth App；Google 凭据**不可用**（无可用 Google 账号）；IdP OIDC（`AUTH_MODE=enterprise`） | 两种模式各启动一次，各登录 → 登出 → 再登录 | 截图 + `/api/auth/get-session` 脱敏响应 + 启动日志 | GitHub / OIDC 各成功一次；Google 凭据就绪后补测；未登录页面重定向 `/login`、受保护 API 401（2026-11-01 已决策接受 Google 未测并披露；G3.0 仍为 `pending`，资源到位后补测） | T701 |
| G3.1 | CLI `report-only`（GitHub + pnpm-audit） | 单测 / nock | 只读 token（`Dependabot alerts: read`；带 `--code-scanning` 另需 `security-events: read`） | `report-only --repo=… --code-scanning` | stdout 摘要 + `dependfix-report-*.md` / `.json` + 告警计数 | 退出码 0；MD 与 JSON 的 `alertsFound` 一致 | —（新增） |
| G3.2 | CLI `fix` / `fix-and-pr` | 单测 / app 级用例 | 可写仓 token（+ `contents: write` / `pull_requests: write`） | `fix-and-pr --repo=… --max-alerts-per-repository=1` | 分支 / commit / PR URL + 验证链输出（install→lint→build→typecheck→test） | PR 真实创建且 CI 绿；失败路径可回滚 | —（新增） |
| G3.3 | GitHub Action | 本仓库 dogfooding（已停，见 §6） | 消费者测试仓 + `github-token` / `dependabot-alerts-token` | 测试仓 `workflow_dispatch` 一次 | run id + 步骤日志 + PR | run 全绿并产出 PR；仅 `github-token` 时硬失败并提示切换数据源 | —（新增） |
| G3.4 | 平台：扫描 / 批量 / 定时 | e2e + docker smoke | staging + Redis + admin / org_admin 会话 | `POST /api/repos/{id}/scan`、`POST /api/repos/batch-scan`、`POST /api/schedules/{id}/trigger` | run id + 状态流转 + 队列日志 + 批量聚合进度 | 单仓与批量各一次；定时触发一次；`running` 被杀后收敛 `orphan_run` | T702 / T704 |
| G3.5 | 平台：PR Check / 通知 | 单测 + e2e | 真实 PR + `ACTION_STATUS_MONITOR_ENABLED=true` + SMTP / 邮箱 | `POST /api/pr-checks/poll` + 触发一次通知 | 落库记录 + 邮件原文（脱敏）+ 开关生效日志 | 结论与 GitHub 一致；邮件真实送达；重试仅对周报路径要求 | PR Check 真实 polling |
| G3.6 | MCP Server（8 tool） | 包已发布 + 单测 | MCP 客户端 + `GITHUB_TOKEN` + `fix_dependency` 的 `workDir` | 客户端调用 `run_scan` / `fix_dependency` 各一次 | 配置片段（脱敏）+ tool 调用记录 | 两个 tool 成功；缺 token 返回结构化错误 | —（新增） |
| G3.7 | Agent Skill | 包已发布 + 内容测试 | AI 编码工具 + 可写仓 | `npx skills add dependfix/dependfix -s dependfix-remediator -g` 后对话触发 | 安装输出 + 对话记录 + PR | 一次安装 + 一次闭环 | —（新增） |
| G3.8 | 安装与升级 | **本地预演 `partial`（M53.4）**；0.6.0 已发布（npm 5 包 + 7 tag + Release），`--version` 缺陷待 0.7.0；Docker 远端镜像与 0.5.x→1.0 升级未验证 | npm + Docker registry（`read:packages`） | build → preflight → 三路径安装 → `docker run` 核对 health → `@latest` → 0.5.x→1.0 升级 | `preflight.json` + 版本输出 + 镜像 manifest + health | 三路径版本一致；双架构镜像存在；**0.5.x→1.0** 升级可用（0.7.0 仅中间验证） | 发布管线收尾 |
| G3.9 | AI 研判（横切 G3.1-G3.5） | 全链 mock | 2 家 provider Key + 预算 | **2 家 × 5 场景 = 10 次**（限流 / 超时 / 非法 JSON 用 stub 注入） | 耗时 / token / 费用 + 降级行为 | 10 次可复现；单次 ≤ ¥20；无 Key 不影响主流程 | —（新增） |

**需要用户提供的资源（未提供则对应路径保持 `pending` / `blocked`，不影响其他路径实跑）**

| 资源 | 影响路径 | 状态（2026-11-01） |
|:--|:--|:--|
| GitHub OAuth App / Google OAuth 凭据 | G3.0（public） | 未提供；Google 凭据不可用（无可用 Google 账号） |
| IdP OIDC client | G3.0（enterprise） | 未提供 |
| GitHub token（只读 + `security-events: read`） | G3.1 / G3.6 | 未提供 |
| GitHub token（+ 写权限） | G3.2 | 未提供 |
| 测试仓（可写）+ Action 输入 token | G3.2 / G3.3 / G3.5 | 未提供 |
| staging + Redis + admin 会话 | G3.4 / G3.5 | 未提供 |
| 收件邮箱 / SMTP | G3.5 | 未提供 |
| MCP 客户端 / AI 编码工具 | G3.6 / G3.7 | 部分可用 |
| AI Key × 2 + 预算（单次 ≤ ¥20） | G3.9 | 未提供 |
| Docker registry 读权限（`read:packages`） | G3.8 | 未提供 |

> 资源前置（2026-10-25 用户确认「应当提供」）：OAuth / OIDC 凭据、staging + Redis、AI API Key 与预算在 G 批次前提供；未提供则 G3 不判定，1.0 不发布。
> AI 预算：单次上限 ≤ ¥20，超限即中止本次验证并记录（不自动追加预算）。

## 5. 批次计划

| 批次 | 目标 | 内容 | 依赖 |
|:--|:--|:--|:--|
| **R（M49）** | **0.6.0 发版** | code scanning 清零 / 依赖清零 / 审计门禁转正 / 发版文档漂移 / 版本提升与发布 | 无 |
| **E** | 通知可信度（= M50） | §3.1 E 四项 | R 完成（2026-10-29 已规划 / 2026-10-30 已归档，任务正文见 [M50 归档分片](../../plan/archive/todo-archive-phases-m50.md)） |
| **F1** | 语义与数据（= M51） | §3.1 F1 九项（①③ 优先），按语义聚类为 6 原子 | M50 已闭环（2026-10-30）；**已闭环 + 归档（2026-10-30，任务正文见 [M51 归档分片](../../plan/archive/todo-archive-phases-m51.md)）** |
| **F2** | 文档与验证（= M52） | §3.1 F2 六项 + G5 复测（G8 采集顺延 G 决策） | **2026-10-31 已闭环归档**（4 原子 + 4 批追加临时待办；[M52 归档分片](../../plan/archive/todo-archive-phases-m52.md)；`gates:docs` 16 → 19 项） |
| **G** | 1.0 发布（= M53） | G2 契约冻结与迁移指南 + G7 运维实测与发布预演 + G8 指标脚本 + G5 mutation 扩面 + G3 执行框架（实跑待资源）；G4 窗口与 `@v1` 保持观察 | **2026-11-01 已闭环归档**（5 原子 + 1 批追加临时待办；任务正文见 [M53 归档分片](../../plan/archive/todo-archive-phases-m53.md)；G3 仅执行框架 + G3.8 partial） |
| **M54** | 1.0.0 发布窗口执行 | M54.1 决策台账 / M54.2 0.7.0 / M54.3 G5 mutation / M54.4 G4+G8 / M54.5 G7 回滚 / M54.6 1.0.0 + `@v1` | **2026-11-07 已闭环归档**（6 原子 + 1 批追加临时待办；正文见 [M54 归档分片](../../plan/archive/todo-archive-phases-m54.md)） |

**M49 内部顺序**：M49.1 → M49.2a → M49.2b → M49.4 → M49.3 → M49.5（M49.3 改为**先翻转、后取证**：原「翻转前累积 3 次 clean」口径因 node-forge 豁免使字面串不可达而未达成，按 §5.7 末句「修订 clean 判据」通道转正；翻转后连续 3 次 `master` push 的 prod 阻断步骤 `conclusion=success` 且日志含审计结果行，回填为证据；回填前不闭环，任一 run 失败则回退 `|| true` 或按 §5.7 评估）。

**估算口径**：按项计数（23 P0 + 8 P1 + 5 验证组 + 5 发布工程项），不按日历；日历取决于外部资源到位时间与 E/F 批次容量。

## 6. 安全策略（2026-10-25 用户决策）

- **Security Auto Fix 定时任务保持停用**（2026-10-17 起 `disabled_manually`）：dependfix 自身已由 dependfix 创建修复 PR，避免与人工 / 平台 PR 冲突；本仓库不再依赖该 Action 做自修。
- **依赖安全由「Security 门禁」承担**：Dependabot alerts 作发现面 → 依赖审计作**阻断面**（`pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org`，周回归使用同一命令）→ 全量依赖审计仅作 `test.yml` 信号步骤（不进周回归）→ code scanning 覆盖代码质量告警。
- **本轮动作（M49）**：清零未被 §5.7 豁免的 critical / high → 移除可解除的 `audit.ignore` → 已按 [security.md §5.6](../../standards/security.md#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c) 转正（2026-10-27）。`audit.ignore` 使 clean 字面串不可达，故按 §5.7 末句的「修订 clean 判据」通道**同批修订 §5.6**（阻断面 = prod 审计 ≥moderate；信号面 = 全量依赖审计；判据 = 阻断步骤 exit 0 且日志含审计结果行），3 个 `master` push run id 待回填。
- **不得**用 `--ignore` / `--ignore-unfixable` 放宽门禁；无可用修复版本的豁免按 [§5.7](../../standards/security.md#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05) 逐条登记 GHSA + 路径 + 复核条件。

## 7. 发布工程清单（G2 / G7）

- [x] **冻结清单**：CLI 参数 / 模式、Action inputs、报告 JSON schema（`RunResult` / `FixAction` / `RunSummary`）、配置键（`DEPENDFIX_*` + 平台 `NUXT_*`）、平台 DB schema（实体 + 迁移）五类，落在 [contract-freeze.md](../../guide/contract-freeze.md)（M53.1 独立成页；[release.md](../../guide/release.md) 保留策略摘要与指针），并标注「1.0 后变更须 2.0」。
  - **1.0 前已发生的 schema 增量（须并入冻结清单）**：`RunResult.alertOutcomes?`（M51.1，告警级处置结果，平台据此回写 `ScanResult.fixStatus`）。可选字段、缺省即 `not-tried`，对旧消费方向后兼容，但冻结后任何字段增删都按 2.0 处理。契约见 [data-model.md §告警级修复结果回写](../modules/data-model.md#告警级修复结果回写-m51-1)。
- [x] **迁移指南（行为变更）** 0.x → 1.0：正文见 [contract-freeze.md](../../guide/contract-freeze.md)「0.x → 1.0 迁移指南」（M53.1，5 条：`--version` 元数据缺陷 / 引擎交付链导出异步化 / `--allow-major-upgrade` 无 env / `on-baseline-red` 默认 skip / `signalsJson` 收敛后语义）；`@v1` 引用随 M54.6 生效。
- [x] **迁移指南（部署面）**：Node 基线（`^22.23.4 || ^24.22.1`，见 [quick-start.md](../../guide/quick-start.md) / [tech-stack.md](../../guide/tech-stack.md)）、pnpm 版本、平台数据迁移与回滚 —— [deployment.md](../../guide/deployment.md)「升级」段已覆盖镜像升级 / 迁移自举 / 备份与回退；**2026-11-07 复核结论**：Node 基线 `^22.23.4 || ^24.22.1` 与镜像基础 `node:24.22.1-alpine`（deployment.md「镜像与版本」段）一致；pnpm 三分——CI / 开发由 `packageManager`（`pnpm@11.17.0`）钉版本，镜像内移除 corepack shim 后显式安装 `pnpm@11.18.0`，两者 minor 差异由验证链的 `toolchainPnpmVersion` 处理（`apps/platform/Dockerfile`）；升级与回滚路径见 deployment.md「升级」段（固定版本可回滚镜像 tag、`pnpm db:migrate:revert`）。
- [x] **`v1` 滚动标签**：已创建（2026-11-07，annotated `097723a7` → 解引用 `83c966fd`，与 `v1.0.0` 同一发布提交），`uses: dependfix/dependfix@v1` 可用。
- [ ] **发布自动化**：按 [release.md](../../guide/release.md) 的启用清单操作；**1.0.0 发布本身不启用**自动发布，启用须用户另行授权。
- [ ] **回滚演练**（部分完成，保留待办）：面清单 = npm / git tag / GitHub Release / `@v1` / Docker / 数据库。npm、git tag、数据库 = drill 通过（数据库为引用 M53.2 实测）；GitHub Release = 仅判据核对；**Docker = 标签 / 构建 / health 已实测（`platform-0.5.0` / 22m03s / ACR 冒烟 `/api/health` = 0.5.0）；双架构未验证**（ACR tag 单架构、GHCR blocked）；`@v1` = 已创建（`097723a7`），回退命令未演练（M54.6，记录见 [release-1.0.md §5.1](../../guide/release-1.0.md#_5-1-演练记录-m54-5-2026-11-02)）。
  - **Docker 面 retry_condition**：在具备 `read:packages` token 或 Docker Hub 可达后执行（镜像已由 `41439905381` 发布，缺的是双架构 / 客户端 manifest 证明） `docker buildx imagetools inspect ghcr.io/dependfix/dependfix:platform-<版本>` → 双架构 manifest → `imagetools create` 重指旧 digest → `docker run --rm` 核对 `/api/health`；在此之前 1.0 发布说明不得声称回滚全部面已演练。

## 8. 维护规则

1. 每批次收口更新 §2「当前读数」与「批次」列，并附证据（run id / analysis id / 命令输出 / 文档 diff）。
2. 新增 1.0 候选先入 backlog，再按 §3 分档；调整分档视为 scope 变更，需用户确认。
3. 1.0 发布后本文件转为「1.0 发布记录」（保留门槛判定与证据），不再作为活跃台账。

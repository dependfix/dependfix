# 经验归档分片（§七十九 - §八十七）：运维实测与发布链沉淀

> 本分片为 [§70-§85 索引](./experience-archive-§70-§99-delivery-platform.md) 的第二片（原分片按 `^##` H2 边界拆分，章节编号与锚点不变；自 §八十六 起只更新范围标签与 H1，**文件名沿用建立时规划上界** `-§79-§85-`）；正文只写结论与落点。

## 七十九、M53.2 运维实测批次经验沉淀（惰性单例启动点 / WAL 备份 / 早退守卫）

> **批次**：M53.2 G7 运维实测与发布自动化预演（2026-10-31）。**准入依据**：④ 工具 / 环境陷阱（Nitro 插件启动时机、SQLite WAL 快照语义、测试早退守卫）+ ② 决策需溯源（为何把消费端做成显式插件、为何备份必须在线快照）。落点见各条目末行。

### 1. 惰性单例的「唯一初始化点」不能挂在按角色跳过的插件副作用上

- **现象**：队列服务是惰性单例，唯一主动调用 `getQueueService()` 的启动插件 `stale-cleanup` 按进程角色在 worker 侧被跳过 → 默认双进程部署（compose `QUEUE_WORKER=1`）下 worker 从不创建消费者，所有扫描 run 永久 `pending`，job 停在 `bull:scan:prioritized`，直到 20 分钟后被判孤儿。功能单测与 e2e 全绿（e2e 强制 `NUXT_QUEUE_ENABLED=false`，走同步路径，从不触发该形态）。
- **手法**：把「本进程要消费」做成**显式启动点**（`queue-consumer` 插件），并对「角色=worker 但没有消费者」判为配置错误直接失败（退出进程由入口看护重启），不留静默降级；插件分类清单与「每个插件都已分类」机检同步。运维证据以容器实测为唯一裁决——单元 / e2e 覆盖不到「进程角色 × 队列模式」组合。
- **落点**：[platform.md §10.6](../../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程) + `server/plugins/queue-consumer.ts` 与其单测 + 检查点矩阵 `platform.md §10.6` 行。

### 2. WAL 模式下「复制主库文件」得到的不是备份

- **现象**：应用强制 `journal_mode=wal`；启动备份与 `db:restore` 的覆盖前备份都用 `readFileSync` 复制主库。实测优雅停止后主文件仍 4KB、数据全在 `-wal`，备份产物 `schema_version=0 / 0 张表`；`db:restore` 随后还会删除 `-wal`/`-shm`，于是「撤销恢复」的唯一凭据被换成空库。
- **手法**：所有快照走 SQLite 一致性快照（`db.backup` / `VACUUM INTO`），写入 `.tmp` → `fsync` → `rename`；备份失败即中止（不得先删旁文件）；生产写连接保持打开构造回归用例（裸复制实现在该用例下必然失败）。
- **落点**：[security.md §2.1.1 / §2.1.2](../../standards/security.md) + [EP-16](engineering-practice-notes.md) + 检查点矩阵 `security.md §2.1` 行 + `backup.test.ts` / `db-restore.test.ts`。

### 3. 测试里的「跳过守卫」会把断言失败变成静默通过

- **现象**：`PRAGMA busy_timeout` 断言读的是 `rows[0].busy_timeout`（SQLite 实际列名是 `timeout`），恒为 0；而同一用例前面有 `if (!ds?.isInitialized) return`——初始化在测试夹具里长期失败，断言从未真正执行，回归被掩盖了整个批次。
- **手法**：测试中的跳过分支必须是**显式且带原因**的（或直接断言前置条件成立），禁止用 `return` 把「环境没准备好」变成绿灯；修断言时同步核对 SQLite 返回列名等外部契约。
- **落点**：`server/database/index.test.ts`（改为显式断言初始化成功）+ [testing.md §6.9](../../standards/testing.md) 检查点（负例 / 守卫有效性）。

## 八十、发布链预演批次经验沉淀（并发取消 / overrides 位置 / npx tarball）

> **批次**：M53.4 发布链预演与安装实测（2026-11-01）。**准入依据**：④ 工具 / 环境陷阱（Actions 并发语义、pnpm 11 配置迁移、npx 参数形态）+ ② 决策需溯源（为何发布构建单列并发组、为何镜像钉 release tag）。落点见各条目末行。

### 1. 版本化产物的构建不能被普通 push 的并发组取消

- **现象**：0.6.0 发布后派发的 docker 运行（`40745976335`）的 build job 触及 **120 分钟 job 上限**被 kill（build step 已跑 115.5 分钟，arm64 QEMU 构建尚未结束）→ `platform-0.4.0` 镜像 tag 从未推送。CI 侧无告警（发布链其余步骤全绿），归档对账时仅登记为「推送中 / 疑似挂起、待复核」，未定位到 job 上限。归因初判曾写成「被后续 push 并发取消」，复核 run annotation（`The job has exceeded the maximum execution time of 2h0m0s`）后订正：并发取消方向相反（更早的 push run 被该 dispatch 取消）。
- **手法**：① 提高 build job 预算（120 → 240 分钟）并记录首个发布的 step 时长（根治方向：原生 arm runner / 按架构拆 job）；② 发布构建单列并发组并禁用取消（防被 push 取代白烧算力）；③ 版本化镜像钉在**发布 tag**（`gh workflow run --ref v<锚版本>`）而不是 master HEAD，且派发判据用 `git tag --points-at HEAD`（「tag 存在」在后续 push 上恒真，会让每次 push 都白跑并钉在旧 tag）。版本化产物缺失要能被「事后复核」发现，不能只依赖当次 job 结论。
- **落点**：`.github/workflows/docker.yml` 并发声明 + `.github/workflows/release.yml` 派发步骤 + [release.md Docker 镜像复核](../../guide/release.md#docker-镜像复核-0-6-0-0-7-0)。

### 2. pnpm 11 起 `pnpm.overrides` 只读 `pnpm-workspace.yaml`

- **现象**：预演脚本在临时工程 `package.json` 写 `pnpm.overrides` 指向本地 tarball，pnpm 11 只发一条 warning（`The "pnpm" field ... is no longer read`）就**静默忽略**，内部包回落到 registry 上已发布的同名版本——安装成功、`--version` 正确，但测的根本不是本地产物。
- **手法**：overrides 写到 `pnpm-workspace.yaml`；安装后断言 lockfile 中出现 `file:` specifier，否则判失败（「装上了」不等于「装的是本地包」）。
- **落点**：[release.md 发布链预演](../../guide/release.md#发布链预演与安装实测-本地-不发版) + `scripts/release/preflight.mjs` 的 `checkLockfileUsesTarballs`。

### 3. `npx <tarball>` 不是「运行 tarball 里的 bin」

- **现象**：`npx ./dependfix-0.6.0.tgz --version` 把 tarball 当命令执行（`Permission denied`），不是安装后运行。
- **手法**：`npx --yes -p <tarball> <bin> --version`；「全局安装」用 `npm i -g --prefix <临时目录>` 隔离，避免污染用户全局环境；三条安装路径各留一条证据（脚本内 / npx / 全局）。
- **落点**：[release.md 发布链预演](../../guide/release.md#发布链预演与安装实测-本地-不发版) 的实测表。

## 八十一、M53 归档批次经验沉淀（测试前提 / 视觉标定 / 模板重建 / 品牌按钮 / 交付纪律）

> **批次**：M53 阶段归档 + 沉淀（2026-11-01，含登录页第三方登录按钮品牌化追加批次）。**准入依据**：④ 工具 / 环境陷阱（构建期布尔与本地 `.env`、证据模板全量重建、视觉基线标定）+ ② 决策需溯源（门禁干净 HEAD 验证、测试文件同名、跨提交合批、归档计数与先例核验）。落点见各条目末行。

### 1. 构建期布尔会被本地 `.env` 染色，测试前提要在用例侧钉死

- **现象**：`githubAvailable` / `googleAvailable` 等在 `nuxt.config.ts` 按构建期 env 烘焙；开发机存在 OAuth 凭据时，e2e「未配置第三方凭据 → 第三方区隐藏」用例本地必红，CI 干净检出却绿。登录页视觉基线同样会随构建机环境变化。
- **手法**：e2e 用 `NUXT_PUBLIC_*_AVAILABLE=false` 钉「隐藏」前提，视觉环境钉 `true` 模拟「凭据已配置展示态」；两端都写，只钉一侧仍留环境依赖。
- **落点**：[testing.md §6.15](../../standards/testing.md#_6-15-构建期布尔-本地-env-的测试前提) + `playwright.config.ts` / `playwright.visual.config.ts` env 注释。

### 2. `--init --init-force` 会重写全部证据模板

- **现象**：为同步 G3.0 的 `next_action` 执行 `--init --init-force`，10 条模板全部重建，G3.8 已填的 `partial` frontmatter 被覆盖；`--init-force` 单独使用不生效（必须与 `--init` 同时给）。
- **手法**：带证据的条目重建前先备份目标文件，或只删除目标单条后 `--init`；重建后复跑 `check:real-env` 并核对 `status` / `evidence` 未回退（本次按原证据回填并在正文注明「未新增实测」）。
- **落点**：[real-env-matrix.md §2](../../guide/real-env-matrix.md#_2-证据格式与校验)。

### 3. 视觉反例标定按 token 实际像素写，注入与还原都要重建

- **现象**：以 `$space-2` → `$space-4` 做反例标定，若口头记成「4px→16px」会高估灵敏度（`$space-2` 实为 8px）；注入后不 `build` 就比对，测的是旧 `.output`。
- **手法**：标定记录写实际像素值（8px→16px）与差异像素 / 闸值倍数（1559 px ≈ 15.6× `maxDiffPixels`）；注入与还原各自 `build` 后重跑，还原态再连续两轮比对确认。
- **落点**：[testing.md §6.7](../../standards/testing.md#_6-7-视觉回归-截图识别层-apps-platform) 反例验证纪律。

### 4. 第三方登录按钮用官方标识 + 品牌文案

- **现象**：统一 `User` 图标 + ghost 按钮会让 GitHub / Google 入口退化成「看不出是哪个平台」的文本链接。
- **手法**：GitHub mark 用官方单色路径 + `currentColor`（暗色自动反转），Google 用官方四色 G（不随主题改色），OIDC 用盾牌；文案用品牌官方大小写（`使用 GitHub 登录`），不回显 provider id；基座用 `secondary` 描边态。
- **落点**：[platform-auth-users.md §7](../../design/governance/platform-auth-users.md#_7-前端设计) + `app/components/social-login-button.vue`。

### 5. 门禁类改动提交后在干净 HEAD 复跑

- **现象**：`--fix` 修好但未写回索引 / 工作区与提交态不一致时，工作区跑绿不代表 HEAD 绿；门禁改造批次只跑工作区会把「fix 通道刚修好」误判为通过。
- **手法**：提交后 `git status` 清空再跑 `lint:check` / `gates:docs` / typecheck，作为门禁证据。
- **落点**：[git.md §3.7](../../standards/git.md#_3-7-提交态自洽-amend-提交前必须核对全部关联文件入库)。

### 6. 新建测试文件前先查同名

- **现象**：直接写 `foo.test.ts` 可能覆盖已存在的同名文件（本仓曾整文件覆盖回滚语义用例，测试数变化被新用例掩盖）。
- **手法**：写文件前 `git ls-files | grep foo.test`；扩展既有语义用新文件名 + 独立 describe，不复用同名路径。
- **落点**：[testing.md §7](../../standards/testing.md#_7-测试代码质量)。

### 7. 跨提交依赖要合批，可独立编译优先于文件数

- **现象**：类型 / 参数先被后续编排消费、或正文说明依赖新模块时，拆成两个提交会留下不可编译的中间提交。
- **手法**：拆分前逐个提交核对可编译性；存在跨提交依赖就合批，并在正文说明原因，不以「文件数超阈值」为由硬拆。文件已顶格 `max-lines` 时要落行为变更，先把纯搬迁 / 日志辅助拆成独立提交（搬迁提交声明唯一差异），再落行为。
- **落点**：[git.md §3.2](../../standards/git.md#_3-2-单文件跨-type-改动需提前规划-commit-拆分)。

### 8. 归档计数取终态；先例必须可检索；候选追加放尾部

- **现象**：沿用中间态数字会让 todo / 归档 / 审计三方不一致；引用「同类问题已复现」但全仓搜不到会被判依据失真；候选池前置插入会让既有 `#N` 引用整体漂移。
- **手法**：容量 / 文件 / 行数在收口动作完成后用 `git diff --shortstat` 重取（登录页品牌化批次 `c46fb7c7^..4c2920ea` 实测 20 文件 / +234 −44；本 M53 归档批次实测 18 文件 / +243 −140）；引用先例前 `rg` 确认；候选新增追加到列表尾部，必须前置时引用改主题名。
- **落点**：[planning.md §4.4](../../standards/planning.md#_4-4-大批量归档批次操作规范) 第 22 / 26 / 27 条。

## 八十二、preflight「工作区不留痕」CI 偶发红：模块导入副作用 + 浅克隆无 tag（2026-11-05）

> 教训形态：**测试导入即执行的生产脚本** + **把「registry 查不到」当未发布证据**。同一断言第 2 次在 CI 红（2026-11-01 / 2026-11-03），backlog 触发条件命中后收口。

- **现象**：`scripts/release/preflight.test.mjs`「真实打包（离线）」用例比较预演前后 `git status --porcelain`，CI 偶发 `expected [ Array(1) ] to deeply equal []`，diff 仅 `M apps/platform/CHANGELOG.md`；本地全量复跑不复现，下一次 push 又回绿。
- **根因一（并发写者）**：`scripts/changelog.mjs` 的生成流程写在模块顶层、无 `isDirectExecution` 守卫——`scripts/changelog.test.mjs` 静态导入即对真实仓库跑一遍七份 CHANGELOG 生成。CI 日志把 `updated apps/platform/CHANGELOG.md（清理残留未发布段）` 打印在该测试文件下，时间与 preflight 的 `git status` 快照窗口重叠。**本地不复现的原因**：本地 tag 齐全 → 残留段判定不命中，只打印 `unchanged`（导入期仍执行生成，只是不写盘）。
- **根因二（为何被判残留）**：清理判据是「版本低于当前 + 无 tag + npm 未发布」；`apps/platform` 的 `npmPublishable: false` 使它永远查不到 registry 版本（恒 `false`），叠加 CI `actions/checkout` 默认浅克隆不带 tag → 全部历史段被判为残留段删除。
- **手法**：① 生成流程收敛到 `main()` + 入口守卫，导入零副作用（`headDate` / `repo` 的 git 子进程一并惰性化到 `main()` 内）；② 非 npm 发布包改用「未知 → 保留」的发布探针（返回 `null`），只信任 tag 证据，并让 `isVersionTagged` 对这类包跳过 registry 查询；③ 回归用例用 `vi.resetModules()` 重导入断言无 stdout（旧版导入会打印 7 行 `unchanged`，负例已实证），另加「浅克隆 + 非 npm 包 → 全部历史段保留」组合例。
- **启示**：CI 里「本地不复现」的偶发红，先在同一次 run 的 stdout 里找并发写者（vitest 把模块/子进程输出归属到执行中的测试文件），再比对本地与 CI 的**环境前提差异**（tag / 浅克隆 / registry 可达性），不要先收窄断言本身——收窄只会掩盖写者。
- **落点**：`scripts/changelog.test.mjs`（导入零副作用 + 发布探针用例，L1）+ [code-auditor 必查项「Node 脚本 main 入口守卫」](../../../.github/agents/code-auditor.agent.md)（L2；存量脚本不在其触发面，故以模块级用例固化）。

## 八十三、QEMU 跨架构镜像构建 4 小时不完成：改原生 arm runner + digest 合成（2026-11-07）

> 教训形态：**把「跨架构编译」交给 QEMU 模拟** + **认为同一构建参数上次 22 分钟这次也会 22 分钟**。1.0.0 发布时两路并发构建同时撞上，均触 240 分钟上限被取消。

- **现象**：`docker.yml` 单 job 内 `build-push-action` 以 `platforms: linux/amd64,linux/arm64` + QEMU 构建。release 派发 `42352117141` 的 build job 跑满 4h00m19s 被取消，push 自动触发 `42351771958` 同样 4h00m41s 被取消；日志末段 `#50 ● Bundling client (3h 51m …)` 连续 3h51m 无进展，未产出任何镜像 tag。**0.7.0（`41439905381`）同参数只用了 22m03s**，且 `apps/platform/Dockerfile` 自 v0.7.0 起无改动——即失败与代码无关，是模拟执行环境的耗时不可预期。
- **根因**：arm64 目标在 amd64 runner 上经 QEMU 模拟执行 `pnpm install` 与 Nuxt/Vite 前端打包，CPU 密集阶段被放大到不可完成；两路构建并行（`push` 与 release 派发分属不同 concurrency 分组，互不取消）进一步争用，把本来"刚好能过"的路径推过上限。
- **手法**（参照 caomei-auth）：① 构建拆矩阵——`linux/amd64` 用 `ubuntu-latest`、`linux/arm64` 用 `ubuntu-24.04-arm` 原生执行；② 各架构 `outputs: type=image,…,push-by-digest=true`，按 registry 各推一次（三个 registry 镜像名不同，digest 不可跨 registry 复用），digest 落 artifact；③ `merge` job 下载 digest 后用 `docker buildx imagetools create -t <tag> <repo>@<amd64> <repo>@<arm64>` 合成 manifest，tag 由 metadata-action 生成；④ 合成后新增回读门禁：`imagetools inspect --raw | jq` 断言 `linux/amd64` 与 `linux/arm64` 同时在，缺失即红；⑤ `push` 触发加 `paths` 过滤（`apps/platform/**`、`packages/**`、依赖清单），文档/计划/工作流提交不再起镜像构建。provenance 统一关闭（ACR 拒绝 OCI attestation，`imagetools create` 也无法跨 registry 传递）。
- **验证**：最终发布 run `42376735406` 全绿——三 registry × 4 tag 回读 **12/12 双架构**；无 `platform_version` 的验证派发 `42376062304`（master，3 tag × 3 仓库 9/9，且无 `platform-` 标签）。过程中三次迭代各暴露一个真问题：① `sync-readme` 缺 `actions/checkout`（`ERR: './README.md' file doesn't exit`）；② `imagetools create` **不支持** `--annotation`（`annotations are not supported yet`），OCI 标签必须在构建阶段用 `labels` 写入；③ 单架构耗时波动极大（热缓存 amd64 2m21s / arm64 1m10s，冷缓存 amd64 9m37s，最慢 41m32s），60 分钟预算对冷缓存偏紧，已提到 90 分钟。
- **启示**：多架构构建不要依赖 QEMU 跑完整构建链，尤其中间有前端打包 / 原生编译；原生 arm runner 把 4 小时压到 1 分钟级。另：那条"上次 22 分钟"的对照只能证明链路可用，**不能**证明下次也在预算内——并行度、共享 runner 负载都会改变结果，预算与拆分要按最坏情况设计。
- **边界**：`ubuntu-24.04-arm` 需仓库为公开或已开通 arm runner 额度；`imagetools create` 生成的是新 index，**原单架构 manifest 上的 attestation 不会保留**（provenance 需单独设计，见 security.md 供应链条目）。
- **落点**：`.github/workflows/docker.yml`（原生 amd64/arm64 矩阵 + digest 合成 + 双架构回读门禁，L1 机检）；[发布指南 §1.0.0 发布记录](../../guide/release.md#_1-0-0-发布记录-m54-6-2026-11-07-已执行)（L2 记录与限制）。后续新增多架构发布单元照此矩阵模板实现，不再回到单 job QEMU。

## 八十四、M55 归档批次经验沉淀（引擎判定真实形态 / schema 默认值 / 预算夹取 / 状态口径）

> 教训形态：**把「写盘成功」当「生效」** + **`partial()` 不会去掉默认值** + **阶段头容量手写** + **状态翻转只改一处**。

- **版本化 override 的生效判定要按真实形态**：`overrides` 里有「父级限定键（`parent>child`）」与「peer-only 实例」两种真实形态——前者会遮蔽通用键，后者没有可写的实例；只校验「写盘成功」会把它们判成 `override did not take effect` 并整仓回滚。做法：改写只动「同包且仍低于目标」的键；peer-only 保守返回 `manual review: peer-only` 并保留工作区；PR 正文与报告的 `From` / `Strategy` 同源（`versioned-override` 独立文案）。
- **Zod `schema.partial()` 不会移除默认值**：对带 `.default()` 的字段做 `partial()`，PUT 只改 `note` 也会把执行器字段写回默认值——新列落库前必须先拆 create / update 两套 schema（update 走无默认字段基线）。
- **预算夹取按「剩余预算」分配，跳过必须单列**：基线链按剩余预算收缩单命令超时；quick-verify 跳过「基线已红」命令；「有告警但 0 写入」跳过基线采样。跳过项必须进报告单列，且仍不交付 / 不回滚——把跳过折叠成通过会让 0 产出被读成成功。
- **失败路径的日志要在 `try` 外持有引用**：执行器在 `push_failed` / `pr_creation_failed` 早退分支返回 `logsJson`，编排 catch-all 若在 `try` 内声明引用就拿不到——在 `try` 外持有可变引用，并用「抛错路径仍有日志」用例锁定。
- **孤儿判定按 run 快照精判**：上限可配后，`stale-cleanup` 不能再用全局常量判孤儿；保留「下界查询 + JS 精判」两步结构，逐 run 按 `scan_run` 快照判定（60 min 运行在 40 min 不判孤儿、30 min 判孤儿）。
- **阶段头容量必须逐条求和**：手写区间明显偏小（M55 规划实测 2400-3400 行 vs 逐条求和 2950-4400 行，下界比约 +23% / 上界比约 +29%），会把「插队 ≥ 原计划 50%」的强制再平衡推迟；分母必须由各原子「交付物」逐条相加并随拆分重算，且容量基线不设倍数口径（归档容量校准的倍数口径见 [planning.md §4.4 第 25 条](../../standards/planning.md#_4-4-大批量归档批次操作规范)）。
- **验收标签沿用设计稿编号**：设计稿用 `AC1-AC9` + `AC4b` 时，规划条目直接用该标签、新增续编 `AC10` 起；重排成枚举序号会让映射行指向不存在的条款。
- **状态翻转要扫全部承载位**：除 `todo.md` 速查表与 `roadmap.md`，还必须扫 `archive/index.md §4 当前基线` 与 `docs/index.md` 首页里程碑；「归档目录不用改」是最常见的漏改理由。
- **豁免不等于证据且三处同源**：接受「未测」只改发布口径，不改证据状态；豁免须附 `retry_condition`，并在就绪度台账 / 执行清单 / 发布说明三处同口径。
- **发布三则（复认 + 补强）**：① 版本口径以 `release:plan` 推导为准，不人工把 feat / 破坏性变更降成 patch；② 发布提交必须是 master tip（push 后落任何提交都会让 HEAD 锚点校验中止），发布窗口内冻结 master；③ 发布物存在性按类分别取证（npm / tag / Release / 镜像构建 run），缺项写「未证实」；`regression:pre-release` 不含发版专属门禁（安全门禁 / preflight / e2e / 视觉），不得用其 Pass 代替发版结论。
- **去重 / 跳过谓词要配反向用例**：改宽谓词（丢掉任一判定键）时正向用例仍全绿，行为从「重复记录」变成「静默丢记录」；为每个判定键补「另一实体同值仍各自记录」的反向例并用单键变异标定。
- **lint-md 长表格会误配对行内代码**：一行同时含粗体 / 全角括号 / 多个行内代码时，`no-space-in-inline-code` 会把空格报在相邻正常代码段上，整文件 `--fix` 会静默丢空格；用「行拆分 + 前缀二分」定位最小触发片段再改写。
- **落点**：[development.md §5.1.40 / §5.1.41 / §5.1.45 / §5.1.47](../../standards/development.md) + [testing.md §6.9](../../standards/testing.md) + [planning.md §2.5 / §3.1.1](../../standards/planning.md) + [documentation.md §2 / §6](../../standards/documentation.md) + [release-pipeline.md §4.3 / §6](release-pipeline.md) + [queue-stale-recovery.md](queue-stale-recovery.md) + 检查点矩阵（新增 7 行 + 扩展 1 行）。

## 八十五、M56 归档批次经验沉淀（平台生命周期 / 三态跳过 / 静默失败探测 / QueryBuilder 排序 / e2e fixtures 幂等 / 分片追加）

> **批次**：M56 1.0 后平台可信与运行成本收口（2026-11-09 归档）。以下 6 条按「现象 / 手法 / 落点」收敛。

### 1. PR 生命周期写回用「读取时状态」做乐观锁

- **现象**：存量 PR Check 行只有 `state: open` 采集通道，PR 关闭后仍按 firing 告警展示；若用整行 `save` 同步终态，会用 stale 行覆盖并发写入的 ack（`acknowledgedAt` 丢失）。
- **手法**：新增生命周期列（open / closed / merged / unknown，迁移默认 unknown）；关闭态以 open 列表差集 + `pulls.get`（404 按 closed）补齐；终态同步用条件 UPDATE（`WHERE pr_state = 读取时值`）只写终态字段，读改写整行仅用于非终态路径；firing / acknowledged 统计均排除 closed / merged。
- **落点**：[pr-build-deploy-signals.md §3.11](pr-build-deploy-signals.md) + [development.md §5.1.36](../../standards/development.md)（条件 UPDATE = 乐观锁）。

### 2. 验证跳过的「原因」决定阻断语义

- **现象**：把「未验证」与「验证失败」都折叠成 `verificationPassed` 布尔时，0 写入运行要么白付终验成本，要么被误判为通过；预算跳过与无写入跳过的交付影响也不同。
- **手法**：跳过显式化（`verificationSkipped`）并与归因口径分流——`budget`（改动未验证）置 `verificationBlocking=true` 阻断整次交付；`no-write`（无改动可验证）置 `false`，不回滚、不记失败、不阻断同运行其他仓库。基线采样触发面按「可写工作」判定，跨 major 未授权只否决 lockfile 告警贡献（否则有写入却跳过基线 → 失败被误标既有失败）。
- **落点**：[dependency-fixer-records.md §12.9](../modules/dependency-fixer-records.md) + [development.md §5.1.41](../../standards/development.md)（跳过 / 未验证不得折叠为通过）。

### 3. 静默失败的判定必须结构化探测，不能只看 stderr

- **现象**：`git stash create` 在索引锁 / 权限失败时**静默退出 1**（stdout / stderr 均空），只按文本分类永远判不出原因；继续在不可回滚的工作区写盘会把坏改动留在工作树。
- **手法**：文本正则作快路径，未知时探测 git dir：`index.lock` 存在 → 索引锁（新鲜锁 < 5s 先重试一次，避免并发短锁误中止）；否则写探针文件读 errno（EACCES / EPERM / EROFS → 权限，ENOSPC / EDQUOT → 磁盘）。失败统一留证据（stderr 尾部 + 工作区状态 + HEAD），硬故障档中止运行且不自动回滚。
- **落点**：[run-failure-taxonomy.md §5.9](run-failure-taxonomy.md) + [development.md §5.1.47](../../standards/development.md)（失败证据原文回退）。

### 4. TypeORM QueryBuilder 的 `CASE WHEN` 必须 `addSelect` 别名后再排序

- **现象**：`orderBy('CASE WHEN run.x IS NULL THEN 1 ELSE 0 END')` 会把 `CASE WHEN run` 当作实体别名，抛 `alias was not found`；NULL 固定末尾的跨库排序无法直接写进 `orderBy`。
- **手法**：`addSelect(表达式, 'alias')` 后 `orderBy('alias')`；并列补唯一列次键（`createdAt DESC, id DESC`）保证翻页稳定；计数查询会自动清 order / select，不影响 `getCount`。
- **落点**：本文件判例（development.md §5.1 规则表满 24 条，按「给不出触发面写判例」口径留此）。

### 5. e2e fixtures 幂等 upsert 会返回旧行

- **现象**：fixtures 端点按复合唯一索引 `(repositoryId, prNumber, headSha)` 查重复用、已存在不更新字段；用例复用同名 repo / 同号 PR 时，新增字段或新期望被静默忽略 → 「新字段缺失 / 展开无信号」的假失败。
- **手法**：自包含用例先 `DELETE /api/e2e/fixtures` 清理同名 repo，或让每个用例使用唯一主键（时间戳 / 序号）；断言前先确认 fixture 写入结果包含本轮新增字段。e2e 跑 `.output` 产物，改源码后必须重建再跑。
- **落点**：[testing.md §6.1](../../standards/testing.md)（E2E 幂等与构建产物）。

### 6. 分片按实测范围命名后，追加条目要同批改名 / 计数 / 重指

- **现象**：把规划上界命名的分片拆成实测范围命名后，往「最新片」追加新章节会让文件名范围立刻失真；原样追加会留下 `§79-§84` 的文件里装 §八十五。
- **手法**：追加章节时同步重命名最新片（本次 `§79-§84` → `§79-§85`）、更新分片 H1 与维护约定的「最新片」指针、重指全部外链（索引表 / 镜像清单 / 归档分片）并复核计数（分片文件数 / 条目数）；拆分保真仍按非空行序列逐行比对。
- **落点**：[planning.md §4.4 第 13 / 17 条](../../standards/planning.md) + [documentation.md §3](../../standards/documentation.md)（分片命名约定）。

## 八十六、M57 归档批次经验沉淀（并列次键用例区分度 / 终态条件写 / 门禁未知态 / 受管块插入 / 视觉连带）

> **批次**：M57 执行面可信与发布验证收口（2026-11-10 归档）。以下 5 条按「现象 / 手法 / 落点」收敛。
> **准入依据**：第 1 / 3 / 5 条为 ③（同类问题复现 ≥2：M51.6 → M57.5、M49.3 → M57.3、M42 视觉连带 → M57.5）；第 2 条为 ②（终态通知归属的决策需溯源）；第 4 条为 ③ + ④（工具 / 环境陷阱，标记嵌套在 M44 / M45 归档期已两次出现）。

### 1. 并列次键用例必须让「插入顺序 ≠ 主键顺序」

- **现象**：为列表补 `id DESC` 次键后，用例造「同毫秒插入两行 + 断言主键倒序」看似可区分，实则主键由雪花算法单调生成、部分库（实测 SQLite）同键并列的返回序恰好等于插入倒序——去掉次键后用例仍全绿（mutation 存活）。
- **手法**：让插入顺序与主键顺序解耦（显式指定主键值），或造 N 行完全并列并断言截断窗口固定取主键最大的 N 行（最小若干行必被截掉）；不确定时先做「移除次键」的 mutation 复核。
- **落点**：[api.md §4](../../standards/api.md)（排序确定性严格约束）+ 检查点矩阵「api.md §4 排序确定性」行。

### 2. 终态条件写：`affected = 0` 时连通知一起收口

- **现象**：把编排层终态写回从整行 `save` 改为条件更新后，若仍对「库内已终态」的旧行发终态通知，会与清理侧（stale-cleanup 已发过同一 run 的失败通知）重复投递；`cooldownHours` 配 0 时是真实重复发信。
- **手法**：写回函数返回 `{ run, written }`；`written === false` 时保留库内终态、**跳过终态通知**并输出结构化告警（含 attempted / observed 状态）；`affected` 缺省按成功处理，与清理侧同口径。
- **落点**：[development.md §5.1.36](../../standards/development.md)（条件 UPDATE = 乐观锁）+ 检查点矩阵「并发终态写」行 + [queue-stale-recovery.md §9](queue-stale-recovery.md)。

### 3. 门禁聚合器的「未知态」：退出码 0 ≠ 通过

- **现象**：带 `--ignore-registry-errors` 的审计步骤在 registry 不可达时 exit 0；只看退出码会把「没查成」记成「查过且干净」。反向也踩过坑：把开关名 `ignore-registry-errors` 当故障特征，而 `pnpm run` 会把整条命令（含开关名）回显进捕获输出 → 每次真实执行都命中，真实漏洞失败被降级为「未知」放行（本轮 R1 审计 blocker）。
- **手法**：① 以「是否出现审计结论行」为主判据，网络特征只在缺结论行时用于归因；结论行存在时以结论为准；② 匹配前剥离命令回显行（`$` / `>` 前缀）与 ANSI 转义（强制着色会把结论数字包起来）；③ 未知态降级为 warning、不计入通过项，并在 `summary` / 证据 / 窗口 / CI Job Summary 暴露计数；④ 用例夹具必须用含回显的真实输出形态。
- **落点**：[testing.md §6.9](../../standards/testing.md)（退出码 0 ≠ 通过）+ 检查点矩阵「testing.md §6.9 退出码 0 ≠ 通过」行 + [security.md §5.6 判据](../../standards/security.md)。

### 4. 受管证据块的插入点不能按「首个二级标题」定位

- **现象**：滚动证据文件用 `<!-- marker:start:id -->` / `end` 包裹条目，条目标题在块内部；按「首个日期标题」插入会把新块塞进上一条的 start / end 之间，产生标题与标记分离、块标记交叉配对的多层嵌套（实测 4 start / 4 end 全配对但三层嵌套，阅读面只剩最外层）。
- **手法**：插入点取「首个受管块 start 标记」与「首个既有标题」中更早者；用例断言两个 start 标记顺序与 end 一致、旧内容零改动。
- **落点**：[testing.md §6.9](../../standards/testing.md)（受管证据块插入必须顶层）+ 检查点矩阵同节行。

### 5. 排序契约变更会连带视觉基线，旧基线的差异就是灵敏性证据

- **现象**：结果明细补 `id DESC` 次键后，同 severity 组内行序反转，`scans-run-detail` 视口级基线检出 2065 px（ratio 0.01）差异。
- **手法**：确认差异只落在行序（包名 / 来源 / 徽章集合不变）后同批重建基线，更新后连跑两遍确认稳定，并在视觉 README 记录因果；重建前的失败读数保留为「基线对该变更敏感」的证据。
- **落点**：[testing.md §6.7](../../standards/testing.md)（视觉回归）+ `apps/platform/tests/visual/README.md` 覆盖边界段。

## 八十七、M58 归档批次经验沉淀（发布执行器内嵌门禁与 token / 产物所在工作流验证 / 文档机制断言取证 / 工作流级负例）

> **批次**：M58 发布链可信收口（2026-11-12）。**准入依据**：② 决策需溯源（为何把发布后冒烟放在 docker 工作流、为何本地通道允许显式绕过）+ ④ 工具 / 环境陷阱（workflow 环境变量注入面、异步 dispatch 的产物时序）。落点见各条目末行。

### 1. 执行器内嵌门禁必须同时核「调用它的 workflow 步骤」的 token 注入

- **现象**：给本地 / CI 共用的发布执行器（`release:publish`）内嵌 fail-closed 门禁后，「workflow 文件没改」被当成「CI 行为不变」；实际 CI 的发布步骤没有注入门禁所需 secret 的环境变量，于是在执行器内被自己的门禁拦死——且失败点落在 15 分钟 preflight 之后，白付成本。
- **手法**：接入门禁时列出执行器的全部调用点（本地脚本 / workflow 步骤 / 其他脚本），逐点核对 token、registry、工作目录等前置；workflow 侧补 `env` 并在注释说明「第 N 次同源执行」；触发面覆盖「自愈补 tag」轮（并非只有 `publish` 动作）；绕过参数的理由必须单行化 + 限长（它会进终端摘要与发布证据，换行可伪造后续日志行）。
- **落点**：[release.md](../../guide/release.md) 发布前安全检查 + [security.md §5.9](../../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策) 本地通道同口径段 + 检查点矩阵 §5.9 行。

### 2. 「发布后验证」放产物所在工作流，不在派发方轮询

- **现象**：发布工作流对镜像只做异步 `workflow_dispatch`，镜像在另一个工作流里构建（20-40 分钟）；若把 post-release 冒烟写在发布工作流，只能长时间轮询等镜像，把验证变成发布阻塞点。
- **手法**：把验证 job 放到产物工作流的产物合成之后（`needs: <publish job>` + 版本入参门控，`push` 构建不跑），矩阵用原生 runner 分架构拉取并运行，job 级 `continue-on-error` + Job Summary / `::warning::` 让失败可见但不改发布结论；历史 tag 巡检与当前版本冒烟分开（前者只读 manifest，后者运行时断言）。
- **落点**：[release-pipeline.md §4.6](../../design/governance/release-pipeline.md#_4-6-发布后镜像冒烟与历史-tag-巡检-2026-11-12-m58-4) + `docker.yml` 的 `post-release-smoke`。

### 3. 文档写「通道机制」必须以最新 run 日志回读为准，并写明推送路径分层

- **现象**：把一次历史取样（0.5.0 在 amd64 主机按 tag 取到单架构）写成 registry 的恒定属性；实际推送路径从 buildx 多平台直推改为 digest 合成后，同一 registry 的 tag 已回读为双平台 index（1.0.0 run 日志 4/4）。文档因此与自家 CI 回读门禁语义相反。
- **手法**：机制类断言先回读对应 run 日志取证，再按「推送路径 / 客户端平台 / registry API」分层表述（哪层已验证、哪层未实测）；历史 tag 不可假定与当前路径同行为；无法取证的维度写「未实测」，不以「平台限制」一词概括。
- **落点**：[release-pipeline.md §4.7](../../design/governance/release-pipeline.md#_4-7-镜像通道矩阵与-acr-架构边界-2026-11-12-m58-5) + [deployment.md](../../guide/deployment.md) 镜像通道定位 + [release-1.0.md](../../guide/release-1.0.md) 发布说明限制行。

### 4. 「门禁能拦住」要有工作流级负例，且负例本身必须零发布副作用

- **现象**：只在命令层证明审计失败（临时工程注入漏洞依赖）仍不能证明 workflow 接线正确：步骤顺序、`if` 条件、`|| true`、前置 job 跳过语义都可能让门禁形同虚设。
- **手法**：建短生命周期分支注入已知漏洞依赖并推送，`workflow_dispatch` 触发发布工作流，按预期在阻断步失败；用 `gh run view --json jobs` 核对**其后所有发布步骤为 skipped**，日志含漏洞条目；随后删除分支、确认默认分支 lockfile 未变。负例 run id 与失败步骤写入设计稿，作为「阻断面成立」的证据。
- **落点**：[release-pipeline.md §4.5](../../design/governance/release-pipeline.md#_4-5-发布前门禁清单与实测时长-2026-11-12-m58-2) 工作流级负例段 + 检查点矩阵 §5.6 第 ⑥ 项。

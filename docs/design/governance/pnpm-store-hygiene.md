# pnpm store 双份并存与无界增长治理（2026-11-24）

> 状态：✅ 已实施（2026-11-24，入口检出告警 + zh / en-US 文档更正；一次性清理仍属运维动作，见 §5.1）
> 关联：[部署 §pnpm store 与依赖缓存](../../guide/deployment.md#pnpm-store-与依赖缓存) · [配置 `PNPM_CONFIG_STORE_DIR`](../../guide/configuration.md) · [容器入口脚本](../../../apps/platform/docker/entrypoint.sh) · [安全规范 §2.1（备份口径）](../../standards/security.md)

## 1. 事件与现象

2026-11-24 在宿主机上发现 `/root/projects/dependfix` 占用 **16 GB**，`du -xhd1` 拆解：

| 路径 | 体积 | 性质 |
|:-----|:-----|:-----|
| `data/pnpm-store` | 8.7 GB | **受管** store（入口派生 `PNPM_CONFIG_STORE_DIR=$DATA_DIR/pnpm-store`，M47.4 起） |
| `data/.pnpm-store` | 6.6 GB | **pnpm 自行选择**的 store（同一批依赖的第二份，无任何组件引用） |
| `data/runs` | 85 MB | 运行工作区（clone / 安装 / 验证产物） |
| `data/backups` + `data/logs` | 27 MB | 数据库启动备份与进程日志 |
| 仓库本体（代码 + `node_modules` + `.git`） | ≈ 1.3 GB | 与 16 GB 无关 |

关键旁证：`find -size +1G` 无命中（全是海量小 blob，不是巨型日志或镜像），`data/runs` 仅 85 MB（工作区回收正常），说明**磁盘几乎全部消费在「同一批依赖缓存存了两份」**。

## 2. 根因链

### 2.1 pnpm 的「一文件系统一份 store」规则

[pnpm settings · storeDir](https://pnpm.io/settings#storedir) 的官方口径：

- store 必须与安装目录在**同一文件系统**才走硬链接；跨文件系统时退化为复制；
- 项目所在文件系统上没有 home 目录时，store 建在**该文件系统的挂载点根**（如挂载在 `/mnt` 则为 `/mnt/.pnpm-store`）；
- 没有任何上层目录可硬链接时（容器只挂载项目可写），才退到 `<project>/node_modules/.pnpm-store`。

因此 store 的位置由「安装目录在哪个挂载点」决定，**不由 HOME 决定**。

### 2.2 容器内为什么落在 `$DATA_DIR/.pnpm-store`

出厂镜像同时满足两个条件，pnpm 必然自建 per-filesystem store：

1. run 工作区默认 `RUN_WORK_ROOT=/app/data/runs`，位于 **data 卷**（挂载点 `/app/data`）；
2. `HOME=/home/dependfix` 在**镜像层**（overlay，另一个文件系统）→ 无法硬链接到 HOME store。

结论：pnpm 在「项目所在文件系统的挂载点根」建 store，即容器内 `/app/data/.pnpm-store`，映射到宿主就是 `data/.pnpm-store`（属推断，实证命令见 §4：`pnpm store path` 与 `docker inspect` 的 Mount Destination）。

旁证该 data 目录确实是**挂载点根**：其中存在 `pg_data` / `redis-data`，而本仓 `apps/platform/docker-compose.yml` 使用命名卷（`dependfix-data`），不会产生这两个子目录——说明宿主部署是 bind-mount 形态（外部 compose 或旧部署）。

### 2.3 为什么同时存在第二份

| 时期 | 入口行为 | pnpm store 落点 |
|:-----|:---------|:----------------|
| M47.4 之前（≤ 2026-10-23） | 不派生 store 变量 | pnpm 自行选择 → `$DATA_DIR/.pnpm-store`（6.6 GB 来源） |
| M47.4 起（`50e55e61`，2026-10-24） | `entrypoint.sh:81` 派生并 `export PNPM_CONFIG_STORE_DIR=$DATA_DIR/pnpm-store` | 受管目录从零累积 → `$DATA_DIR/pnpm-store`（8.7 GB 来源） |

升级时**既没迁移也没清理**旧 store，同一批目标仓库的依赖在两处各存一份，形成 15.3 GB 的双份占用（逐条重叠率未实测，仅按两份 `du` 之和与「runs 仅 85 MB」推定；量化判据见 §4）。

> 📌 **口径更正（2026-11-24 已落地）**：本批前有两处表述在数据卷形态下不成立——
> ① [deployment.md](../../guide/deployment.md) 的「pnpm store 与依赖缓存」节曾称默认 store「落在 `$HOME/.local/share/pnpm/store`」：默认落点在跨文件系统时是 per-filesystem store（见 2.2），即 `$DATA_DIR/.pnpm-store`；
> ② [configuration.md](../../guide/configuration.md)（en-US 同）的 `PNPM_CONFIG_STORE_DIR` 行曾称不可用时「回退 `$HOME` 下 pnpm 默认位置」：回退后的实际落点同样是 `$DATA_DIR/.pnpm-store`。
> 两处均已按实际落点改写（同批覆盖 `docker-compose.yml` 与 `.env.full.example` 的注释），[deployment.md](../../guide/deployment.md) 的「回退 pnpm 默认位置」措辞保留并补注实际落点与「双份 store」小节。这也是「回退若仍在发生，第二份会继续增长」的原因。

### 2.4 单份 store 为什么也能到 8.7 GB

1. **无自动 GC**：`pnpm store prune` 只出现在文档里，产品内无任何定期清理，历史版本条目永久累积；
2. **每仓库全量依赖**：目标仓库的 `dependencies` + `devDependencies` 全部小版本变体都进同一 store，按部署文档经验值 0.5–1.5 GB/仓库，8.7 GB ≈ 6–17 个仓库量级（属正常累积，非单点异常）；
3. **pnpm 大版本 layout 并存（条件性）**：store 根下按版本分目录（如 `v10` / `v11`）。当前镜像固定 `pnpm@11.18.0`，但若该数据卷经历过更早 pnpm 大版本的安装，旧 layout 不会被自动回收，同一批包会在两套 layout 里各存一份（判据见 §4）。

## 3. 不变量

- **I1 受管 store 唯一**：数据卷内至多一份受管 store（`$DATA_DIR/pnpm-store`），不得长期存在第二份自动 store。
- **I2 检出优先于删除**：入口与平台只做检出与告警，**不得**自动删除用户数据目录。检出不写入目标目录（不建目录、不 prune、不显式 `chown`）；以 root 启动时既有的数据卷属主归一化（`chown -R $DATA_DIR`）仍覆盖整个卷，不排除该目录——只改属主、不改内容，属既有行为。
- **I3 清理可判据**：清理前必须确认「`pnpm store path` 指向受管目录」+「无运行中任务」+「目标为单一明确路径」。
- **I4 文档与实际行为一致**：回退口径、备份排除项必须与 pnpm 实际落点一致，不得沿用「回退到 `$HOME`」的错误表述。

## 4. 判定与取证

| 判据 | 命令（宿主 / 容器） | 结论 |
|:-----|:-------------------|:-----|
| 当前生效 store | `docker compose exec -u <PUID>:<PGID> platform pnpm store path` | 返回 `/app/data/pnpm-store/v*` ⇒ 受管生效；返回 `/app/data/.pnpm-store/v*` ⇒ 回退仍在发生 |
| 两份是否为遗留 | `stat -c '%y %n' data/pnpm-store data/.pnpm-store` + `find data/.pnpm-store -maxdepth 1 -newermt '<M47.4 日期>'` | 全部更早 ⇒ 遗留；有近期写入 ⇒ 回退频繁触发 |
| 入口是否走了回退 | `docker compose logs platform \| grep -i 'pnpm store'` | 出现 `warn: pnpm store 目录 … 回退` ⇒ 权限 / 只读挂载问题 |
| 是否叠了旧 layout | `du -sh data/pnpm-store/* data/.pnpm-store/*` | 同时存在 `v10` 与 `v11` ⇒ 需按版本清理 |
| 是否挂载点根 | <span v-pre>`docker inspect platform --format '{{json .Mounts}}'`</span> | `/app/data` 为 Mount Destination ⇒ 2.2 成立 |

## 5. 处置

### 5.1 一次性清理（运维动作，不随代码发布）

1. 判定：按 §4 确认受管 store 与实际落点，确认无运行中扫描 / 批次；
2. 回收：`pnpm store prune`（受管 store，仅删无引用条目）→ 复核体积；
3. 删除遗留：停容器后按**单一明确路径**删除 `data/.pnpm-store`（先 `du -sh` + `stat` 核对，避免误删受管目录）；
4. 复核：重启后 `pnpm store path` 仍指向 `/app/data/pnpm-store/v*`，且 `data/.pnpm-store` 不再重建。

### 5.2 防复发（本批次实施范围，2026-11-24 已落地）

1. **入口检出告警**（`entrypoint.sh`）：受管 store 生效且 `$DATA_DIR/.pnpm-store` 存在时打印一条 `warn`（含路径、体积核对与清理命令），不自动删除（I2）；回退分支（根路径 / 相对路径 / 创建失败 / 探针不可写）的告警文案同步更正为 pnpm 实际落点，回退期间不再误报「遗留」。新增 `entrypoint.test.mjs` 六例：遗留存在（恰一条 warn + 目录零改动）/ root 启动形态（compose 默认）/ 不存在（不输出遗留告警）/ 受管 store 即该目录（不告警）/ 等价形态（尾斜杠、`./` 段、软链三变体，不告警）/ 回退发生（只报回退）。
2. **文档同步（zh + en-US）**：`deployment.md §pnpm store 与依赖缓存` 新增「双份 store 成因与判定」小节，更正默认落点表述、补注回退实际落点，备份示例 `--exclude` 同时覆盖 `./pnpm-store` 与 `./.pnpm-store`；`configuration.md` 与 en-US 镜像的 `PNPM_CONFIG_STORE_DIR` 行同步更正回退口径。
3. **本设计文档 + governance 索引**：根因与判据集中在此，避免同一事实散落在部署文档注释里。

### 5.3 明确不做

- 不自动删除 / 自动 prune 用户数据卷内的目录（含 run 工作区硬链接解除后的孤儿 blob）；
- 不做 store 体积指标接口与阈值告警（按 [规划规范 §3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 评估后登记 backlog，先观察清理后的增长曲线）；
- 不改 `RUN_WORK_ROOT` 或镜像分层来「顺便」消除跨文件系统（属部署形态变更，需单独评估）。

## 6. 验收标准

1. 入口在默认部署（`DATA_DIR` 即数据卷挂载点根）下存在遗留 `.pnpm-store` 时输出恰一条 warn；不删除、不 prune、不建目录、不写入内容，且入口不对该目录做额外 `mkdir` / 显式 `chown`（root 启动时的整卷属主归一化属既有行为，见 §3 I2）；不存在时零输出。
2. 回退分支文案与 pnpm 实际落点一致（默认部署下为 `$DATA_DIR/.pnpm-store`），不再声称 `$HOME`；`docker-compose.yml` / `.env.full.example` 的注释同口径。
3. `deployment.md` 与 en-US 镜像页结构对齐（H2 数量不变，新增小节两侧各一处 H3 可映射），备份命令的排除项覆盖两种目录名。
4. 文档门禁链路（`gates:docs`）全绿；`deployment.md` 的 zh / en 结构对等由人工核对（`docs:check:guides` 的 `GUIDE_PAIRS` 未覆盖该页）。
5. 清理后受管 store 单份存在，`pnpm store path` 与入口日志一致。

> 验收状态（2026-11-24）：1-4 由本批用例、`gates:docs` 与人工结构核对覆盖（1 的等价形态另有 3 种变体——尾斜杠 / `./` 段 / 软链，同 1 个用例内覆盖）；5 属运维动作，待宿主执行 §5.1 后复核（不随代码发布）。

## 7. 风险与已知边界

- **误删风险**：两目录名字相近（`pnpm-store` / `.pnpm-store`），运维命令必须写全路径；入口只告警不删除，且对尾斜杠 / `./` / 软链等等价形态按真实路径判定，不把正在使用的受管 store 报成遗留。
- **检出面受默认部署约束**：pnpm 的真实落点是「安装目录所在文件系统的挂载点根」，入口按 `$DATA_DIR` 推导。自定义 `DATA_DIR` 为子目录、或把 `RUN_WORK_ROOT` 指到另一个文件系统时，实际遗留目录可能在别处而入口检不出（告警文案已限定「默认部署下」）；此时按 §4 判据手工核对。
- **属主面**：root 启动的既有数据卷属主归一化（`chown -R $DATA_DIR`）覆盖整个数据卷，不排除遗留目录——只改属主、不改内容，属既有行为（§3 I2）。
- **硬链接假象**：`du` 对同一次遍历内的硬链接只计一次，因此「runs 很小」不代表可以删 store——删除受管 store 会让新安装冷下载，但已存在的 run 工作区文件仍有效。
- **回退不可完全避免**：只读挂载、`PUID`/`PGID` 未授权、相对路径都会触发回退；告警只能让问题可见，不改变 fail-open 语义。
- **容量无硬上限**：仓库数 × 依赖数是线性驱动，本设计不引入配额（超出前解决方案：`pnpm store prune` + 按版本清理）。

## 8. 开放问题

1. 是否把「store 体积 + 遗留目录」做成只读观测接口（`/api/v1`）而非仅启动日志？
2. `pnpm store prune` 能否安全地做成受管定时任务（需解决「prune 期间有 run 在安装」的并发语义）？
3. 是否需要在镜像升级路径上提供旧 store 迁移 / 回收提示（deprecation 窗口）？

## 9. 关联文档

- [部署指南 §pnpm store 与依赖缓存](../../guide/deployment.md#pnpm-store-与依赖缓存)
- [配置指南 · `PNPM_CONFIG_STORE_DIR`](../../guide/configuration.md)
- [容器入口脚本](../../../apps/platform/docker/entrypoint.sh)
- [执行器进程隔离](executor-process-isolation.md)（run 工作区与执行形态）
- [规划规范 §3.1 追加临时待办](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)

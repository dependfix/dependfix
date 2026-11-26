# 运行面漏洞周检（Node 运行时 + Alpine apk）

> **状态**：✅ 已落地（2026-11-26，M68.2）
> **来源**：M68 主题 A「运行面安全与镜像供应链」第二原子；2026-10-22 / 11-11 两次 Node / Alpine 安全公告均由外部巡检发现，仓库内只有 `apps/platform/docker/check-node-version.mjs` 的静态下限闸门
> **关联**：`scripts/check-runtime-surface.mjs`、`.github/workflows/runtime-surface-weekly.yml`、[平台镜像工具链变体](./platform-image-variants.md)

## 1. 问题与范围

平台镜像的运行面由两部分组成：**Node 运行时二进制**（官方 `node:26.13.1-alpine` 基底）与 **Alpine 基底 apk 包**（
musl / openssl / zlib / git 等）。`check-node-version.mjs` 只在构建期断言「不低于各发布线的最低已修复版本」，
对被固定 digest 的镜像，**基底内的 apk 包不会随上游安全更新自动前进**——2026-10-22 与 11-11 两次公告都是靠外部
巡检才发现，属于「无周期告警源」缺口。

**范围**：本仓交付镜像（平台 slim / full 与沙箱镜像共用同一基底）的运行面版本清单与公开漏洞库比对，输出可判读结论。
**不做什么**：不做被管理仓库的运行面产品化（另条候选）；不引入 trivy / syft 全量 SBOM；不自动升级依赖或自动开 PR
（豁免 / 基线由人工确认）。

## 2. 数据源实证（2026-11-26 实测，可复现）

| 数据源 | 端点 | 形态 | 实测结论 |
|:--|:--|:--|:--|
| Node 发布索引 | `https://nodejs.org/dist/index.json` | 数组，每项含 `version` / `date` / `security` | 884 条目，147 条带 `security: true`；`v26.13.1`（2026-11-10）为 26 线最新且 `security=true`，与 2026-11-11 公告基线一致 |
| Alpine secdb | `https://secdb.alpinelinux.org/v3.24/{main,community}.json` | `packages[].pkg.secfixes = { <修复版本>: [CVE…] }` | 3.24 main 98 KB / 291 个包带 `secfixes`；`zlib` 记录 `1.3.2-r1 → CVE-2026-85091`、`1.4-r0 → CVE-2026-4738` |
| GitHub Advisory（**首版不用**） | `https://api.github.com/advisories?cve_id=<CVE>` | 按 CVE 反查 GHSA | `CVE-2026-4738` 返回的 GHSA 描述是 **OSGeo** 的缓冲区问题且无对应包条目——跨生态的 CVE→Advisory join 不可靠，不能据此给 Alpine 包定级 |

**失败形态实证（可复算）**：非 2xx、JSON 结构不符（缺 `packages` / `secfixes` 形态变化）、分支未知
（`/etc/alpine-release` 无法映射到 secdb 分支）、apk 清单为空、任意版本串无法解析 → 一律 `unknown`，见 §3 退出码。

```bash
# 数据源不可达 → UNKNOWN / exit 2（fail-closed，不当作 PASS）
node scripts/check-runtime-surface.mjs --image=dependfix-smoke:m68-slim --secdb-base=https://secdb.invalid
# 采集输出异常（Alpine 版本无法映射）→ UNKNOWN / exit 2；由单测的 collect 注入锁定
# 空 apk 清单 / 无法解析的包行 → UNKNOWN / exit 2（单测锁定）
# 干净基线（已安装即修复版本）→ PASS / exit 0
# --secdb-dir 指向**根目录**，脚本会自行拼 `<branch>/`；布局：<fixture>/v3.24/{main,community}.json
node scripts/check-runtime-surface.mjs --image=dependfix-smoke:m68-slim \
  --secdb-dir=<fixture> --node-index=<fixture>/node-index.json
```

**合并口径**：脚本按「main + community」合并 secdb（2026-11-26 实测两侧共 3,524 个修复版本记录），
不是只读 main；§2 表中的 291 是 v3.24 main 单侧的带 `secfixes` 包数。

## 3. 判定语义

| 面 | 判定 | 级别 | 数据源 |
|:--|:--|:--|:--|
| Node | 同 major 线内**最新 security 发布** > 运行版本 | `high`（安全版本落后） | `dist/index.json` 的 `security` 标记 |
| Node | 版本串无法解析（形态变化） | `unknown`（仍使退出码非零） | 同上 |
| Node | major 线不在发布索引（EOL / 缺记录） | `high`（无法确认补丁状态） | 同上 |
| Node | 该线在索引中没有 `security: true` 记录 | `unknown`（不臆造结论） | 同上 |
| Alpine apk | 已安装版本 < secdb 中同包任一 `secfixes` 版本 | `unknown`（数据源不提供 severity，不臆造） | `secdb` 分支 JSON |
| Alpine apk | 版本无法解析（如 secdb 中的 `opensmtpd 6.6.2p1-r0`） | `unknown`（**不得**当作「不落后」） | 同上 |

- **版本比较**：apk 版本语义（数字段 / 日期型版本 / 字母版次 / `_alpha` `_beta` `_pre` `_rc` 后缀 / `-rN` 修订号），
  不是 semver；实现见 `scripts/check-runtime-surface.mjs` 的 `compareApkVersion`，边界单测覆盖
  `quickjs-2021-03-27-r5` / `cacti-1.2.31-0` / `_rc` / `_p` / 字母版次。
- **语义边界**：本工具**不判断修复版本是否可安装**（secdb 只给修复版本号，不给仓库可达性），结论是
  「已安装版本落后于 secdb 修复版本」，是否换基座 / `apk upgrade` 由人工判断（见 §8）。
- **退出码**：`0` 干净；`1` 命中 findings；`2` 数据源 / 环境异常（`unknown`）。**2 不得被当作 PASS**，workflow 按
  失败处理（fail-closed）。
- **`unknown` 的两种语义**（摘要里分开标注）：`结论` 行的 `UNKNOWN（数据源 / 环境异常）` 表示这次运行本身不可信；
  finding 的「级别 unknown」表示**找到了落后项，但数据源不提供 severity**。后者是有效 finding，退出码为 1。

## 4. 与静态基线闸门的关系

| 层 | 位置 | 时机 | 判据 |
|:--|:--|:--|:--|
| 静态下限 | `apps/platform/docker/check-node-version.mjs` | 镜像构建期 | 不低于各发布线的最低已修复版本（低于即 build 失败） |
| 动态最新 | 本设计 | 每周 + dispatch | 是否落后于**当前**最新 security 发布 / 是否存在 secdb 修复版本 |

两层互补：静态闸门防止基座回退，周检发现「基底 digest 固定后上游又发了安全更新」的漂移。

## 5. 豁免与基线更新路径

- 豁免清单 `scripts/check-runtime-surface-baseline.json`：`{ exempt: [{ id, fixed?, reason, expires }] }`，只登记
  **人工确认**的误报或暂时无法修复项。
  - `reason` 与 `expires`（`YYYY-MM-DD`）**必填**——不允许永久豁免；格式非法时整次运行 `unknown`（fail-closed），
    不静默退化为「无豁免」。
  - `id` 为 `apk:<包名>` / `node:v<版本>`；建议同时写 `fixed`（修复版本）把豁免钉子钉在具体版本上，
    只按包名豁免会让后续新 CVE / 新修复版本被一并吞掉。
  - `expires` 到期后自动重新计入 findings（不静默放行）。
- 基线更新（如基底 digest 抬升）由人工执行：改 `apps/platform/Dockerfile` 的 `FROM` tag + digest，构建期
  `check-node-version` 与镜像冒烟会同步校验；本工具**不自动改 Dockerfile、不自动提 PR**。

## 6. 交付形态

- **脚本**：`node scripts/check-runtime-surface.mjs --image <ref>`（默认 `caomeiyouren/dependfix:latest`），
  采集面 = 容器内 `node -v` + `/etc/alpine-release` + `apk info -v`；`--node-index` / `--secdb-dir` 可指向本地 fixture
  （单测与离线复算），`--summary <path>` 写 Markdown Job Summary。
- **workflow**：`.github/workflows/runtime-surface-weekly.yml`（`schedule` 每周 + `workflow_dispatch`，可传镜像 ref，
  仅允许 dependfix 发布形态的镜像名），Job Summary 含镜像 ref / digest / Node 版本 / Alpine 分支 /
  **apk 清单（`<details>` 表格）** / findings（id / 级别 / **数据源** / 说明）/ 豁免 / 结论；无 secret 依赖。
- **成本**：单次只拉取已发布镜像（slim 约 408 MB）+ 3 个 HTTP 请求，不构建镜像、不跑 Nuxt。

## 7. 首次实测（2026-11-26，平台 slim 镜像）

- 采集面：`node v26.13.1` / Alpine `3.24.4` / 33 个 apk 包（单次 `docker run`）。
- Node 面：`v26.13.1` 已是 26 线最新 security 发布 → 无 finding。
- apk 面：`zlib 1.3.2-r1` < secdb 修复版 `1.4-r0`（`CVE-2026-4738`），且 3.24 main 索引已发布 `1.4-r0`
  → **1 项 finding**（`unknown` 级别，exit 1）。说明告警源在真实镜像上有效，不是只会通过空基线。
- 反向取证：把已安装版本当作唯一修复版本的 fixture secdb 下运行 → `PASS`（exit 0）；`--secdb-base` /
  `--node-index` 指向不可达地址 → `UNKNOWN`（exit 2）。三种退出码均实测。
- **首个周检 run 预期为红**（真实 finding 尚未修复）——这是设计意图：先暴露，再按 §5 人工抬升基底并回填。
- 摘要同时输出 33 个 apk 的清单（`<details>` 表格）与 finding 的数据源列（`secdb.alpinelinux.org`）。
- **首个 finding 的处理（2026-11-26）**：上游 `node:26.13.1-alpine` tag 未重建（仍是 2026-11-11 的 digest），
  故按「构建期 `apk upgrade`」修复——重建后 `zlib 1.4-r0`（同批 `libssl3 3.5.9-r1` / `busybox r31` / `musl 1.2.6-r3`），
  本地镜像周检 **PASS**（exit 0），`smoke-test.sh` 亦 PASS。**已发布镜像**要等下一次发布重建后才转绿；在此之前
  周检红是真实的「生产镜像仍落后」信号，不得登记豁免掩盖。

## 8. 边界与残余

- secdb 不提供 severity，GHSA 跨生态 join 不可靠（§2 实证），故 apk 面统一 `unknown` 级别，靠「有无 finding」判读；
- 覆盖面仅 Node 二进制与 apk 清单，不含 npm 依赖（由 Dependabot 覆盖）与镜像内 `.output` 的第三方 JS；
- 数据源可用性依赖 nodejs.org / secdb.alpinelinux.org；不可达时按 `unknown` 失败，需要人工复核（不自动降级为 PASS）；
- 首版未做「修复版本是否可安装」的判断，结论只给「需抬升基底镜像 / 复核」指引。

## 9. 用户可达性判定

按 [规划规范 §2.6](../../standards/planning.md#_2-6-用户可达性与-ui-交付判定-hard-requirement-2026-11-24) 为 **API-only ③**：
交付面是脚本（`pnpm run check:runtime-surface` 的退出码与 stdout）+ workflow 的 Job Summary；无 UI 诉求。

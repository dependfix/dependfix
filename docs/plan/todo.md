# 当前阶段任务（M3）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）已完成，归档见 [todo-archive.md](todo-archive.md)。
> M4 及之后阶段的任务见 [backlog.md](backlog.md)。

---

## M3: Code Scanning 扩展

**目标**: 接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

**前置（已解除）**: T-G2-2（2026-08-04 探针验证）——Code Scanning alerts 对 GITHUB_TOKEN 可访问（HTTP 200，`security-events: read` 即可），**M3 无需额外 token 方案**；仅 Dependabot alerts 需要 PAT / GitHub App token（G2 已处置闭环）。

**设计要点（实现前确认）**:
- **数据源并行而非回退**：M3 的 Code Scanning 与 Dependabot 是**并行源**（`fetchAlerts` 扩展为组合获取），区别于 `pnpm-audit` 的互斥回退；`AlertSource` 枚举已含 `'code-scanning'`，`SEVERITY_MAP` 已有 error/warning/note → high/medium/low 映射
- **现状复用**：`packages/cli/src/fixers/code-scanning/index.ts` 已有 stub（M0 遗留）、core `AlertSeverity` 含 `'unknown'` 位
- **报告列语义**：§4 Repositories 的 GHSA 列对 code-scanning 显示的是 `ruleId`（如 `js-sqli`），M3 落地时顺手将列名改为语义化的 "Rule/Advisory"（Review Gate 遗留 P3）

### 建议执行顺序

```
T301（采集器）→ T302（规则分层）→ T303（模板修复器）→ T304（建议输出）
                                      ↘
                          T305（工具链固定 G1，P2 可并行）
```

---

### T301 接入 Code Scanning Alerts 拉取

- **优先级**: P1
- **依赖**: T102（GitHub client）、T004（标准告警模型）；前置 T-G2-2 已完成
- **状态**: ⬜ 未开始
- **交付物**: `packages/cli/src/github/code-scanning-fetcher.ts`（参照 dependabot-fetcher 模式）

**任务内容**:

- [ ] 拉取 open 状态 Code Scanning 告警（`GET /repos/{owner}/{repo}/code-scanning/alerts`，octokit.paginate 分页）
- [ ] 转换为标准告警模型：`source: 'code-scanning'`、`ruleId`（rule.id）、severity 走 `mapCodeScanningSeverity`（`security_severity_level` 优先，缺失时 rule.severity 映射）
- [ ] fixable 语义：Code Scanning 告警默认**不可自动修复**（`fixable: false`、`fixStrategy: null`），修复能力由 T303 规则模板按规则启用
- [ ] 报告中可展示 Code Scanning 告警（与 Dependabot 并行，§4 表 Rule/Advisory 列）

**完成定义**:

- [ ] report-only / fix 模式下 Dependabot 与 Code Scanning 告警并行展示、互不覆盖
- [ ] 拉取失败（401/403）沿用 T-G2-1 硬失败语义 + hint

---

### T302 规则分层与白名单机制

- **优先级**: P1
- **依赖**: T301
- **状态**: ⬜ 未开始
- **交付物**: `packages/cli/src/code-scanning/rule-classifier.ts`（规则分类策略）

**任务内容**:

- [ ] 定义 A/B/C 三类规则分层：A=自动修复白名单 / B=建议修复 / C=仅报告
- [ ] 建立自动修复白名单（首批：低风险、可模板化、无破坏性的规则，如 `no-unused-vars`、`jsdoc/check-alignment` 类；**具体规则集实现时评审确认**）
- [ ] 建立仅建议输出的规则列表（高风险/需人工判断规则）
- [ ] 规则分类可配置（后续可扩展配置文件，M4+）

**完成定义**:

- [ ] 系统能区分"自动修复""建议修复""仅报告"三类，且分类结果在报告中可见

---

### T303 实现可模板化规则修复器

- **优先级**: P1
- **依赖**: T302、T107（验证执行器）
- **状态**: ⬜ 未开始
- **交付物**: `packages/cli/src/fixers/code-scanning/` 首批修复模板（替换 M0 stub）

**任务内容**:

- [ ] 选择一组低风险规则作为首批支持对象（A 类白名单子集）
- [ ] 实现补丁生成与验证（复用 verification-runner；`FixAction.type` 扩展或复用现有类型承载 code-scanning 修复记录）
- [ ] 失败时回退到建议模式（不静默、可审计）

**完成定义**:

- [ ] 至少一类 Code Scanning 问题可完成自动修复闭环（修复 → 验证 → 报告/PR）

---

### T304 实现建议型输出

- **优先级**: P1
- **依赖**: T301、T302、T108（报告）
- **状态**: ⬜ 未开始
- **交付物**: Code Scanning 修复建议报告（报告 §4 之外新增建议区块或并入现有表格）

**任务内容**:

- [ ] 输出规则 ID、位置（文件:行）、摘要、建议修复方向
- [ ] 区分未自动修复原因（B/C 类规则 / 白名单外 / 修复失败回退）
- [ ] PR body 中展示 Code Scanning 建议（fix-and-pr 模式）

**完成定义**:

- [ ] 无法自动修复的问题不会静默丢失（报告中明确可见 + 原因标注）

---

### T305 工具链固定（G1 承接）

- **优先级**: P2
- **依赖**: 无（独立于 T301-T304，可并行）
- **状态**: ⬜ 未开始（承接 [G1](#g1-pin_toolchain-策略未真正固定-pnpm-版本) 评估结论）
- **交付物**: `packages/cli/src/fixers/pnpm/index.ts` 的 PIN_TOOLCHAIN 策略接线 + config 输入

**任务内容**:

- [ ] config 新增 `toolchainPnpmVersion`（`--toolchain-pnpm-version` / env `AUTO_FIX_GITHUB_SECURITY_TOOLCHAIN_PNPM_VERSION`，缺省从 packageManager 解析）
- [ ] `repairLockfile` 接收 toolchain 并传入策略命令；`getStrategyCommand('PIN_TOOLCHAIN')` 改用 `corepack pnpm@<version> install --lockfile-only`（corepack 不可用/下载失败 → 降级为裸命令，靠策略链 REGENERATE 兜底）
- [ ] `tryLockfileRepair` 传递 toolchain；激活 `resolvePnpmVersion`（当前死代码）
- [ ] 修复成功后校验 lockfile 格式与声明版本一致（防格式漂移——wisdom 记录 pnpm v11 overrides 迁移教训）
- [ ] 测试：corepack 成功 / corepack 缺失降级 / packageManager 解析 / config 解析

**完成定义**:

- [ ] LOCKFILE_VERSION_MISMATCH 场景用声明版本 pnpm 重生成 lockfile（不再是"与 REGENERATE 相同"的 stub）
- [ ] corepack 不可用时行为不劣于现状（REGENERATE/REINSTALL 兜底）

---

## M3 完成判定

- [ ] report-only / fix 模式并行展示 Dependabot + Code Scanning 告警（Rule/Advisory 列语义化）
- [ ] A/B/C 三层规则分类落地：自动修复 / 建议修复 / 仅报告
- [ ] 至少一类 Code Scanning 问题自动修复闭环（T303）
- [ ] 无法自动修复的问题不静默丢失（T304）
- [ ] G1 工具链固定落地（T305）或明确延后并说明理由
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过；Review Gate 放行

---

## 已知缺口登记

### G1 PIN_TOOLCHAIN 策略未真正固定 pnpm 版本

- **状态**: 🔶 待实现（已承接至 M3 T305）
- **位置**: `packages/cli/src/fixers/pnpm/index.ts`
- **问题**: `RepairLockfileParams.toolchain`（`toolchain.pnpmVersion`）虽被接受并文档声明"优先于 packageManager"，但 `repairLockfile()` 内部从未调用 `resolvePnpmVersion()`，`PIN_TOOLCHAIN` 策略命令与 `REGENERATE` 完全相同（`pnpm install --lockfile-only`），未按 toolchain 固定版本执行
- **引入**: 自初版 fixer 起即为 stub（类型 + 测试骨架已搭，实现未接线）
- **评估结论（2026-08-05）**: **建议暂不改，M3 阶段处理**——
  ① 非阻塞：`LOCKFILE_VERSION_MISMATCH` 策略链有 REINSTALL 兜底，修复仍能成功（仅 lockfile 可能被当前 pnpm 版本重生成，存在格式漂移风险）；
  ② 缺输入源：`toolchain.pnpmVersion` 在 config 层无 CLI/env 来源，现在接线只能做"从 packageManager 解析"的半套方案；
  ③ corepack 可用性 / 首次下载依赖网络，需真实环境验证（本地 Windows 难以模拟 CI）；
  ④ 届时作为"工具链固定"功能统一设计（config 输入 + corepack 执行与降级 + 修复后验证 packageManager 一致性），即 M3 T305
- **下一步**: T305（config 输入 → repairLockfile 接线 → corepack 执行与降级 → 测试）

---

## 已完成登记：M2 阶段治理（2026-08-04 ~ 2026-08-05）

### G2 GITHUB_TOKEN 无法访问 Dependabot alerts API（产品设计级限制）——已闭环

- **结论**: 本质是故意设计（`vulnerability-alerts` 为 GitHub App-only 权限）+ 官方文档缺陷；处置任务 T-G2-1~5 全部完成（fetch 硬失败 / Code Scanning 探针验证 / 双 token 方案 / pnpm audit fallback / 规划文档闭环），详细记录已随 M2 归档至 [todo-archive.md §M2](todo-archive.md#m2-github-action-接入已归档)

### G3 overrides 覆盖策略——已处理 + 遗留观察

- **已落地**: 同包收敛 / 不降级保护 / 逐包验证回滚 / 分组升级（T213）/ manifest 归属防护 / pnpm v11 lockfile 解析（P1）
- **遗留观察点**（不阻塞，随运行反馈再评估）:
  - major overrides 确认机制：暂不实现自动拦截（评估 2026-08-05，逐包验证+回滚已兜底）
  - 报告统计口径：`alertsSkipped` 混合多种语义，需独立字段（如 alertsConverged）
  - 根直接依赖 + lockfile manifest 告警一律跳过有覆盖损失（可细化为"推荐版本 < 根锁定版本才跳过"）
  - monorepo 成员包直接依赖盲区（isRootDirectDependency 仅读根 package.json）
  - pnpm catalog 依赖的 override 行为未实测

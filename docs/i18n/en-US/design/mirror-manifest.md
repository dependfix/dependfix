# Design Mirror Manifest (en-US)

> 中文入口页见 [design/mirror-manifest.md](../../../design/mirror-manifest.md)（站点根 locale 入口）。
> 本文件是 en-US 设计镜像的**唯一登记处**：哪些 zh 设计分片被镜像、哪些没有、每个镜像页的 H2 如何对应，都在这里。
> 背景与决策见 [文档规范 §6 「设计镜像结构映射」](https://github.com/dependfix/dependfix/blob/master/docs/standards/documentation.md)（结构映射 + 索引补全，不逐字重译 60+ 篇）。
> 机检：`pnpm run docs:check:mirror`（`scripts/docs/check-design-mirror.mjs`）会校验三方一致——zh 文件集、
> 本清单登记、en 设计页集合；同时校验每页 H2 映射与两侧真实标题逐条对应。**新增 / 删除 zh 分片或 en 镜像时必须同步本文件**，
> 否则门禁失败。
> 阅读提示：未镜像的 zh 分片不是「不存在」，只是没有英文版；需要英文说明时请以 zh 为准（或按需提交翻译 PR）。

## Mirrored pages

### docs/design/governance/architecture.md → docs/i18n/en-US/design/governance/architecture.md

| zh H2 | en H2 |
|:---|:---|
| 项目组成 | 1. Project composition |
| 总体方案 | 2. Overall plan |
| 功能模块 | 3. Functional modules |
| 仓库列表获取 | — 未镜像（zh §仓库列表获取） |
| 修复优先级 | — 未镜像（zh §修复优先级） |
| 运行模式 | 4. Run modes |
| 专用 Agent 设计 | — 未镜像（zh §专用 Agent 设计） |
| pnpm frozen-lockfile 自动修复 | — 未镜像（zh 同名节） |
| 报告设计 | — 未镜像（报告结构见 modules/report-generator.md） |
| 技术选型 | 5. Tech stack |
| 分片索引（迁出章节） | — 仅索引，无正文 |

### docs/design/governance/spec-and-doc-governance.md → docs/i18n/en-US/design/governance/spec-and-doc-governance.md

| zh H2 | en H2 |
|:---|:---|
| 1. 背景与问题 | 1. Background & problems |
| 2. 文档分类与分流规则 | 2. Three-category governance boundaries |
| 3. 写作规范 | 3. Writing conventions |
| 4. 文档分片规则 | — 未镜像（现行口径见 doc-governance.md §4.2） |
| 5. 经验归档（experience-archive）维护规则 | — 未镜像（现行口径见 doc-governance.md） |
| 6. 审计与合规 | — 未镜像（现行口径见 doc-governance.md §6） |
| 7. 实施计划（治理批次 G1-G6） | 4. Implementation plan |
| 8. 修订历史 | — 未镜像（zh 侧修订记录） |
| 9. 相关文档 | 6. Related docs |

### docs/design/governance/platform-ai-integration.md → docs/i18n/en-US/design/governance/platform-ai-integration.md

| zh H2 | en H2 |
|:---|:---|
| 1. 背景与目标 | 1. Background & goals |
| 2. 现状盘点 | 2. Current status (after M25.2a closure) |
| 3. 架构决策 | 3. Architecture decision |
| 4. 范围 | 4. Scope |
| 5. 数据模型详情 | 5. Data model details |
| 6. API 契约 | 6. API contract |
| 7. UI 改造详情 | 7. UI transformation details |
| 分片索引（迁出章节） | — 仅索引（迁出内容见 zh platform-ai-integration-governance.md） |

### docs/design/governance/index.md → docs/i18n/en-US/design/governance/index.md

| zh H2 | en H2 |
|:---|:---|
| 文档索引 | Document index |
| 使用约定 | Usage conventions |

## English-side sections

> 英文页面里存在、但 zh 事实源把内容放在**别的分片**（或确为英文独有）的小节。第三列写清 zh 落点，
> 避免「英文独有的内容其实 zh 早就有」这种误判；确无 zh 对应的写 `—（英文版独有）`。

| en page | en H2 | zh 对应 |
|:---|:---|:---|
| `docs/i18n/en-US/design/governance/architecture.md` | 6. Platform architecture (apps/platform) | `docs/design/governance/architecture-platform.md` §平台架构（apps/platform） |
| `docs/i18n/en-US/design/governance/architecture.md` | 7. Major risks and mitigations | `docs/design/governance/architecture-platform.md` §主要风险与应对 |
| `docs/i18n/en-US/design/governance/architecture.md` | 8. apps/platform end-to-end AI assessment integration (M26 phase) | `docs/design/governance/architecture-platform.md` §apps/platform 端到端 AI 研判集成（M26 阶段） |
| `docs/i18n/en-US/design/governance/spec-and-doc-governance.md` | 5. Success metrics | —（英文版独有） |
| `docs/i18n/en-US/design/governance/platform-ai-integration.md` | 8. Security & governance | `docs/design/governance/platform-ai-integration-governance.md` §8. 安全性与治理 |
| `docs/i18n/en-US/design/governance/platform-ai-integration.md` | 9. Acceptance criteria | `docs/design/governance/platform-ai-integration-governance.md` §9. 验收标准 |
| `docs/i18n/en-US/design/governance/platform-ai-integration.md` | 10. Adopt trigger condition (when to enter todo.md current stage) | `docs/design/governance/platform-ai-integration-governance.md` §10. 上收触发条件（何时纳入 todo.md 当前阶段） |
| `docs/i18n/en-US/design/governance/platform-ai-integration.md` | 11. Key decision review (to be filled when user adopts stage) | `docs/design/governance/platform-ai-integration-governance.md` §11. 关键决策回顾 |
| `docs/i18n/en-US/design/governance/platform-ai-integration.md` | 12. Related docs | `docs/design/governance/platform-ai-integration-governance.md` §12. 关联文档 |
| `docs/i18n/en-US/design/governance/platform-ai-integration.md` | 13. Document metadata | `docs/design/governance/platform-ai-integration-governance.md` §13. 文档元数据 |

## Not mirrored

> 以下 zh 分片**没有** en 版本，逐条登记以消除静默缺口。en 治理索引中对应行直接指向 zh 文件。

| zh source | 理由 |
|:---|:---|
| `docs/design/mirror-manifest.md` | 中文入口页（正文在 en 侧清单，站点要求 en 页有根 locale 对应页） |
| `docs/design/governance/alert-outcome-writeback.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/architecture-platform.md` | 部分镜像：§平台架构 / §主要风险与应对 / §端到端 AI 研判集成 已译入 en `architecture.md`（见 §English-side sections）；其余未译 |
| `docs/design/governance/c22-manifest-flow-feasibility.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/c22-pat-backward-compat-records.md` | 记录 / 落地分片（随主文档演进，暂不翻译） |
| `docs/design/governance/c22-pat-backward-compat.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/caomei-ui-migration.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/doc-governance.md` | 治理执行规范（现行权威；en 索引行指向 zh，1.0 后评估） |
| `docs/design/governance/docs-and-readme-i18n-rollout.md` | 记录 / 落地分片（随主文档演进，暂不翻译） |
| `docs/design/governance/docs-and-readme-i18n.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/engineering-practice-notes.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/executor-process-isolation.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/executor-sandbox-implementation.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/executor-sandbox.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/experience-archive-§1-§21-spec-compliance.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/experience-archive-§22-§28-ci-environment.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/experience-archive-§29-§35-integration.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/experience-archive-§36-§40-toolchain.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/experience-archive-§41-§48-archive-batch.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/experience-archive-§49-§69-recent-investigation.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/experience-archive-§70-§99-delivery-platform.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/experience-archive.md` | 经验归档分片（中文判例语料，翻译无收益） |
| `docs/design/governance/github-action-workflow.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/gitignore-management.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/mcp-server.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/override-protect-policy.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/platform-ai-integration-governance.md` | 部分镜像：§8-§13 已译入 en `platform-ai-integration.md`（见 §English-side sections）；其余未译 |
| `docs/design/governance/platform-auth-users.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/platform-logging.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/platform-notification.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/platform-scheduled-batch-rollout.md` | 记录 / 落地分片（随主文档演进，暂不翻译） |
| `docs/design/governance/platform-scheduled-batch.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/pr-build-deploy-signals.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/pr-delivery-closure.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/pr-feedback-loop.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/primeui-themes-v2-downgrade.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/queue-stale-recovery.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/release-1.0-readiness.md` | 1.0 台账（内部发布计划；en 索引行指向 zh） |
| `docs/design/governance/release-pipeline.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/release-security-gate.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/repo-auto-inference.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/repo-execution-limits.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/run-failure-taxonomy.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/sandbox-security-governance.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/scan-preferences.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/security.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/session-wisdom-distillation.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/skill-distribution.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/standards-experience-refactor.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/governance/verification-ci-alignment.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/data-model.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/dependabot-fetcher-runtime.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/dependabot-fetcher.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/dependency-fixer-records.md` | 记录 / 落地分片（随主文档演进，暂不翻译） |
| `docs/design/modules/dependency-fixer.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/dependency-grouping.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/github-client-testing.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/github-client.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/index.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/pnpm-audit-fallback.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/pnpm-lockfile-fixer-records.md` | 记录 / 落地分片（随主文档演进，暂不翻译） |
| `docs/design/modules/pnpm-lockfile-fixer.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |
| `docs/design/modules/report-generator-records.md` | 记录 / 落地分片（随主文档演进，暂不翻译） |
| `docs/design/modules/report-generator.md` | 未重译（结构映射口径见文档规范 §6；全量镜像属 1.0 后评估项） |

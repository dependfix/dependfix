# Special Design & Governance (governance)

> This directory contains **special design, governance boundaries, migration plans and cross-module miscellaneous** documents, not split by module.
> For module designs that are implemented / in progress see [modules](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/index.md).

## Document index

| Document | Type | Status |
|:---------|:-----|:-------|
| [System Architecture](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture.md) | Overall architecture | ✅ Landed (revised 2026-08-05) |
| [Security Design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/security.md) | Security governance | ✅ Landed |
| [GitHub Action Workflow](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/github-action-workflow.md) | Special design (Action integration) | ✅ Landed (M2) |
| [.gitignore Auto Management](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/gitignore-management.md) | Miscellaneous governance | ✅ Landed |
| [Repository Name Auto Inference](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/repo-auto-inference.md) | Miscellaneous design | ✅ Landed |
| [Session Wisdom Distillation](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/session-wisdom-distillation.md) | AI governance (knowledge accumulation) | ✅ Landed (2026-08-06) |
| [Experience Archive](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/experience-archive.md) | Experience backup (continuously appended, see file head for entry criteria; §1-§57 split into 6 fragment files by content logic, chapter numbering globally unique) | ✅ Continuously appended |
| [Skill Distribution](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/skill-distribution.md) | Special governance (M5.5 Skill orchestration) | ✅ Landed (2026-08-07) |
| [Executor Design & Sandbox Assessment](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/executor-sandbox.md) | Special design (T607 design first) | 🔶 Designing (2026-08-08) |
| [Sandbox & Malicious Dependency Defense](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/sandbox-security-governance.md) | Special governance (2026-08-14 security assessment) | ✅ Filed (2026-08-14) |
| [MCP Server Design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/mcp-server.md) | Future planning (M6) | 🔶 Not started |
| [Platform Auth & Users Design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-auth-users.md) | Special design (M7.1 T701/T707 design first) | ✅ Landed (2026-08-09, Review Gate Pass) |
| [Scheduled Scan & Batch Design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-scheduled-batch.md) | Special design (M7.2 T704 design first) | 🔶 Designing (2026-08-10) |
| [Platform AI Integration Design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/platform-ai-integration.md) | Special design (apps/platform AI assessment end-to-end) | 🔶 Design first draft (see [backlog](https://github.com/dependfix/dependfix/blob/master/docs/plan/backlog.md) candidate, not yet adopted) |
| [Docs + README i18n Design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/docs-and-readme-i18n.md) | Special design (en-US adoption, reference momei) | 🔶 Design first draft (see [backlog](https://github.com/dependfix/dependfix/blob/master/docs/plan/backlog.md) candidate, not yet adopted) |
| [apps/platform PrimeUI Theme Downgrade Design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/primeui-themes-v2-downgrade.md) | Special design (@primeuix/themes 3.x → 2.x MIT downgrade) | 🔶 Design first draft (see [backlog](https://github.com/dependfix/dependfix/blob/master/docs/plan/backlog.md) candidate, not yet adopted) |
| [C22 PAT Backward Compat Assessment](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/c22-pat-backward-compat.md) | Assessment report (M18.0 P0 docs only sub-phase) | ✅ Landed (2026-08-29, Review Gate Pass) |
| [Spec & Doc Governance Design](./spec-and-doc-governance.md) | Special design (doc governance boundary + modules/governance split + writing spec + implementation plan) | ✅ Landed (2026-09-09, G1 P-phase output) |

## Usage conventions

- This directory only stores **special discussions, governance boundaries, migration plans and execution governance** documents (referencing momei governance conventions).
- When a special document no longer corresponds to current implementation, it should be revised to a governance delta document, or directly archived / deleted.
- Outdated but not-yet-deleted documents are archived to `governance/archive/` (currently none, create on demand).
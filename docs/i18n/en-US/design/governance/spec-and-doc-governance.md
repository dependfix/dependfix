# Spec & Doc Governance Design (spec-and-doc-governance)

> **Status**: Special design first draft (landed 2026-09-09)
> **Scope**: Governance boundaries, writing conventions and maintenance rules for three doc categories — `docs/standards/` / `docs/design/` / `docs/plan/`
> **Goal**: Eliminate current spec file bloat (ai-collaboration 448 lines / development 447 lines / platform 350 lines / planning 242 lines) + research / archive mixing + modules / governance boundary blur, and establish an auditable doc governance baseline

## 1. Background & problems

### 1.1 Background

With rapid iteration (M0-M25, 25 phases), the three core doc categories keep growing without governance:

| Dimension | Current | Threshold (health / warning / split) |
|:----------|:--------|:--------------------------------------|
| `docs/standards/ai-collaboration.md` | 448 lines | 200 / 400 / > 400 |
| `docs/standards/development.md` | 447 lines | 200 / 400 / > 400 |
| `docs/standards/platform.md` | 350 lines | 200 / 400 / > 400 |
| `docs/standards/planning.md` | 242 lines | 200 / 400 / > 400 |
| `docs/standards/security.md` | 229 lines | 200 / 400 / > 400 |
| `docs/standards/testing.md` | 176 lines | 200 / 400 / > 400 |
| `docs/plan/roadmap.md` | 347 lines | 800 / 900 / > 900 (exceeded warning) |
| `docs/plan/todo-archive.md` | 1963 lines | 500 / 700 / > 700 (exceeded split) |
| `docs/plan/backlog.md` | 372 lines | 500 / 700 / > 700 |
| `docs/design/governance/experience-archive.md` | 1664 lines | 500 / 700 / > 700 (exceeded split) |

### 1.2 Three main problems

**Problem A: spec files mixing "why / lessons / experience"**

`docs/standards/` specs should only write "what to do / not to do" (execution boundary),. however development.md §5.1.x 21 sub-sections, ai-collaboration.md §4.x PDTFC+ practical lessons, planning.md §4.4 11 practical cases are all "why + lessons + evidence" content.

## 2. Three-category governance boundaries

### 2.1 `docs/standards/` — execution boundary (what to do / not to do)

**Allowed**: contract rules, hard thresholds, blocker matrices, single-source-of-truth statements.

**Not allowed**:
- Practical cases (move to `docs/design/governance/experience-archive.md`)
- "Why we chose X" rationale (move to related design doc)
- Implementation experience (move to experience-archive)
- Cross-references that depend on a specific version's behavior (move to version-bounded design doc)

**Maintenance rule**: When spec file exceeds 400 lines, split the "what" and "why" content into separate doc files.

### 2.2 `docs/design/` — design rationale (why & how)

Two sub-categories:

- **`docs/design/modules/`** (single monorepo package design, by package): e.g. `docs/design/modules/data-model.md`, `docs/design/modules/dependency-grouping.md`
- **`docs/design/governance/`** (cross-module / governance / major-change specific design): e.g. `docs/design/governance/architecture.md`, `docs/design/governance/security.md`

**Allowed**: design rationale, implementation approach, dependency diagrams, migration paths.

**Not allowed**:
- Single-line code snippets that should be inlined into source code comments
- Quick reference cards (move to standards or README)
- Daily operation instructions (move to `docs/guide/`)

### 2.3 `docs/plan/` — phase management (current / future / archived)

Three sub-categories:

- **`docs/plan/roadmap.md`** — milestone overview (per-milestone <= 200 chars + archive link; see Chinese source for detail)
- **`docs/plan/todo.md`** — current stage only (main window empty between phases)
- **`docs/plan/todo-archive.md` + `docs/plan/archive/`** — archived phases (master window keeps last 5 phases, rest moved to archive fragments)
- **`docs/plan/backlog.md`** — candidate pool (long-term / periodic / short-term / known boundaries)

**Allowed**: phase closeout records, candidate entry source of truth, cross-batch citation.

**Not allowed**:
- Implementation details (move to standards or design)
- Current-phase-only detail (move to PR description)

## 3. Writing conventions

### 3.1 Standards writing convention

Standards files must follow:

- **Single declarative subject**: each section heading must be a declarative statement of "what to do" (e.g. "TypeScript strict mode is required"), not a description of "how to do"
- **Single source of truth**: similar rules must be stated in only one place, other places reference it via link
- **Version awareness**: rules must explicitly indicate applicable version range (e.g. "since 0.2.0")
- **Verification path**: each rule must have a corresponding verifier (lint rule / typecheck / test / manual check)

### 3.2 Design doc writing convention

Design docs must follow:

- **Context first**: state problem background first, then design rationale
- **Alternatives considered**: list at least 2 alternatives with explicit comparison table
- **Implementation path**: list implementation steps + verification matrix
- **Impact assessment**: explicit list of who is affected + how to migrate

### 3.3 Plan doc writing convention

Plan docs must follow:

- **Phase closure record**: each archived phase has 5 elements (objective / scope / acceptance criteria / not-do / deliverable / risk + mitigation)
- **Ahead commits verified**: ahead of origin/master N commits must use `git rev-list HEAD ^origin/master --count` to verify (avoid stale estimates)
- **Cross-references precise**: archive anchor must use `looseNorm` form (avoid parens-to-anchor pitfalls)

## 4. Implementation plan

### 4.1 Phase 1 (immediate)

- Audit all standards files exceeding 400 lines, plan split timeline
- Add explicit "type" tag to each standard doc (standard / design / plan)
- Add `last_reviewed: YYYY-MM-DD` frontmatter to each standard doc

### 4.2 Phase 2 (M25 follow-up)

- Split development.md §5.1.x into experience-archive
- Split ai-collaboration.md §4.x into experience-archive
- Split planning.md §4.4 into experience-archive

### 4.3 Phase 3 (governed maintenance)

- Add doc governance checks to CI (line count thresholds, anchor validity, cross-reference consistency)
- Add doc governance dashboard to `docs/plan/todo.md` (G1 governance entry)

## 5. Success metrics

| Metric | Target | Verification |
|:-------|:-------|:-------------|
| Standards file line count | All ≤ 400 | `wc -l docs/standards/*.md` |
| Standards file single-source rule | No duplicate rules | Manual review + grep |
| Design doc alternatives table | 100% | Manual review |
| Plan doc ahead commits verified | 100% | `git rev-list` output matches text |

## 6. Related docs

- [Experience archive §四十二 M13 audit 算式校对](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/experience-archive.md) — arithmetic check rules
- [Experience archive §四十五 M18 doc over-cleanup](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/experience-archive.md) — doc cleanup lessons
- [Experience archive §四十八 M20 preventive split cross-reference update](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/experience-archive.md) — split cross-reference update lessons
- [Experience archive §四十九 M21 backlog cleanup](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/experience-archive.md) — backlog cleanup lessons
- [Architecture design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture.md) — overall architecture baseline
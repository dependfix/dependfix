---
layout: home

hero:
    name: "dependfix"
    text: "Auto-fix GitHub security alerts"
    tagline: "Batch, controllable fixes and automated PR creation for Dependabot / Code Scanning alerts"
    actions:
        - theme: brand
          text: Quick Start
          link: /en-US/guide/quick-start
        - theme: alt
          text: GitHub
          link: https://github.com/dependfix/dependfix

features:
    - title: CLI with zero setup
      details: Four command modes (report-only / fix / fix-and-pr / cleanup-branches), runnable via npx with no dependencies, supports owner / topic multi-repo management.
      link: /en-US/guide/quick-start
    - title: GitHub Action integration
      details: "Wire into CI with a single line: uses: dependfix/dependfix@v1. Supports scheduled, manual and PR-triggered runs with customizable verification commands."
      link: /en-US/guide/quick-start
    - title: AI breaking-change assessment
      details: Automatically fetch Changelog on major upgrades, multi-provider assessment (DeepSeek / OpenAI), structured patches with safety-gated recommendations.
      link: /en-US/guide/quick-start
    - title: Local fallback without a token
      details: When GITHUB_TOKEN is missing, automatically fall back to pnpm audit (--alerts-source pnpm-audit) so offline single-host scans work.
      link: /en-US/design/governance/architecture
    - title: Standalone management platform
      details: "Nuxt full-stack Web UI: repo / credential management, scan triggering, dashboard, RunDetailDialog, PR Check monitoring; deployable with one Docker command."
      link: /en-US/design/governance/architecture
    - title: Agent Skill / MCP Server
      details: dependfix-remediator skill lets AI assistants (Claude Code / Copilot / Cursor) drive fixes conversationally; MCP Server exposes scan/fix capabilities to AI tools.
      link: /en-US/design/governance/architecture
    - title: Auto-fix frozen-lockfile
      details: Seven categories of pnpm i --frozen-lockfile failures with multi-strategy repair chain (disclosure-driven per docs audit and supply-chain signal).
      link: /en-US/design/governance/architecture
    - title: Security & governance
      details: PR content fingerprint dedup (close old, open new) + no-token-on-disk + minimum-privilege credential injection + egress allowlist audit + dangerous-PR threshold gating.
      link: /en-US/design/governance/architecture
    - title: Architecture & data model
      details: Module boundaries, dependency-group upgrades, dependency graph and execution matrix; system design in architecture docs.
      link: /en-US/design/governance/architecture
    - title: Roadmap
      details: M0-M22 all archived (2026-09-01); current phase tasks and future plans in roadmap and todo.
      link: /en-US/plan/roadmap
    - title: Standards
      details: "10 standards index entry: AI collaboration, development, testing, documentation, security, Git, planning, API and more."
      link: /en-US/standards/i18n
---

> **Note**: This is the English version of the documentation. Use the language switcher in the nav bar to switch back to the Chinese source of truth at any time.
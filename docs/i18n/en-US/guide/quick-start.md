# Quick Start

## Prerequisites

- Node.js >= 20
- pnpm (latest stable recommended)
- GitHub Token (for alert fetching and PR creation; **local without a token still works via `--alerts-source pnpm-audit` fallback**, see [Local without a token](#local-without-a-tokenpnpm-audit-fallback))
  - `report-only` / `fix` modes: require `security-events: read` permission
  - `fix-and-pr` mode: additionally requires `contents: write` + `pull-requests: write` permissions

## Installation

```bash
# Global install
pnpm add -g dependfix

# Or run directly (no install required)
npx dependfix report --repo owner/repo --github-token $GITHUB_TOKEN
```

## Basic Usage

### Report-only mode (view alerts)

```bash
# When running inside a git repo, --repo is auto-detected
cd /path/to/your-repo
dependfix report-only --github-token $GITHUB_TOKEN

# Explicitly specify repo
dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

Reports are generated to `./dependfix-reports/` directory (Markdown + JSON dual format).

### Fix mode

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --severity-threshold high
```

By default, the fix mode creates a branch and pushes it without opening a PR (use `fix-and-pr` to open a PR).

### fix-and-pr mode

```bash
dependfix fix-and-pr \
  --repo owner/repo \
  --github-token $GITHUB_TOKEN \
  --severity-threshold high \
  --pr-title "[dependfix] Auto-fix Dependabot alerts" \
  --pr-body "Automated fixes for Dependabot alerts."
```

Opens a PR directly. Default branch target is `main`.

### cleanup-branches mode

```bash
dependfix cleanup-branches --repo owner/repo --github-token $GITHUB_TOKEN --keep-last 3
```

Cleans up historical fix branches and keeps the latest 3 by default.

## Local without a token (pnpm-audit fallback)

If no `GITHUB_TOKEN` is available, dependfix can fall back to `pnpm audit` as the alert source:

```bash
dependfix report-only --alerts-source pnpm-audit
```

This reads alerts from the local `pnpm audit` JSON output (no GitHub API call required) and is suitable for single-host offline scenarios.

The fallback design is described in [pnpm audit fallback design](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/architecture).

## Configuration file

For complex scenarios, use a `dependfix.config.ts` config file (the framework follows a staged-load pattern from `@dependfix/core`):

```ts
// dependfix.config.ts
import { defineConfig } from '@dependfix/core'

export default defineConfig({
    github: {
        token: process.env.GITHUB_TOKEN!,
    },
    ai: {
        provider: 'openai-compatible',
        model: 'deepseek-v4-flash',
        apiKey: process.env.DEPENDFIX_AI_API_KEY!,
        trigger: 'both', // failure | major | both
    },
    scan: {
        severityThreshold: 'high',
    },
})
```

See [Configuration](../guide/configuration.md) for the full config schema.

## Common flags

| Flag | Description | Default |
| --- | --- | --- |
| `--repo <owner/repo>` | Target repository (auto-inferred inside git repo) | - |
| `--github-token <token>` | GitHub Token | `GITHUB_TOKEN` env |
| `--severity-threshold <level>` | Minimum severity to process | `high` |
| `--alerts-source <source>` | Alert data source (`github` / `pnpm-audit`) | `github` |
| `--mode <mode>` | Execution mode (`report-only` / `fix` / `fix-and-pr` / `cleanup-branches`) | `report-only` |
| `--ai` | Enable AI breaking-change assessment | `false` |
| `--ai-provider <provider>` | AI provider (`openai-compatible` / `anthropic`) | `openai-compatible` |
| `--ai-model <model>` | AI model name | `deepseek-v4-flash` |
| `--ai-trigger <trigger>` | AI trigger range (`failure` / `major` / `both`)`) | `both` |
| `--pr-title <title>` | PR title | - |
| `--pr-body <body>` | PR body | - |

See [Configuration](../guide/configuration.md) for the full CLI flag reference.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (no alert, or all alerts handled normally) |
| `1` | Partial failure (some alerts failed) |
| `2` | Complete failure (e.g., Token invalid, network error) |

## Next steps

- See [Configuration](../guide/configuration.md) for the full configuration options
- See [Tech Stack](../guide/tech-stack.md) to understand the runtime model
- See [PR Auto-merge Configuration](https://github.com/dependfix/dependfix/blob/master/docs/guide/auto-merge.md) to set up automatic PR merging
- See [AI Co-development](https://github.com/dependfix/dependfix/blob/master/docs/guide/ai-development.md) to learn how AI assistants use dependfix
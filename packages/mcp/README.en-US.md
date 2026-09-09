# @dependfix/mcp

<!-- i18n: switch -->
[简体中文](./README.md) | [English](./README.en-US.md)

> dependfix MCP Server package. Exposes dependfix's scan/fix capabilities to AI coding assistants (Claude, Copilot, Cursor, etc.) via [Model Context Protocol](https://modelcontextprotocol.io/).

## Installation

```bash
pnpm add @dependfix/mcp
```

## Tools

| Tool | Function | Inputs |
|:-----||:---------|:-------|
| `fetch_alerts` | Fetch Dependabot security alerts for specified repo (optionally parallel Code Scanning, read-only) | `repo`, `severity?`, `code_scanning?` |
| `discover_repos` | Auto-discover repos by owner / org (read-only) | `owner[]`, `topics?`, `include?`, `exclude?`, `probe_dependabot?` |
| `run_scan` | Run dependfix scan and fix on target repo | `repo`, `mode?`, `severity?`, `code_scanning?`, `max_alerts?`, `max_concurrency?`, `dry_run?`, `allow_major_upgrade?`, `ai_enabled?`, `ai_provider?`, `ai_model?`, `ai_trigger?` |
| `fix_dependency` | Fix single dependency or lockfile (override / direct / lockfile) | `workDir`, `fix_type?`, `packageName?`, `targetVersion?` |
| `cleanup_branches` | Clean up merged/closed dependfix branches (non-interactive) | `repo`, `dry_run?` |
| `history` | Query history run summary for specified repo (read-only) | `repo` |
| `get_last_report` | Read most recent JSON report (read-only) | — |

Parameter semantics align with CLI (severity is threshold semantics: `high` keeps critical + high; `dry_run` defaults inferred from mode; AI params only pass through switch and model, apiKey read from env var).

## Configuration

Add via MCP config file (stdio transport):

```json
{
  "mcpServers": {
    "dependfix": {
      "command": "npx",
      "args": ["@dependfix/mcp"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

Environment variables:

| Variable | Description |
|:---------|:------------|
| `GITHUB_TOKEN` | GitHub access credential (required for fetching alerts / running scans / branch cleanup) |
| `DEPENDFIX_MCP_REPORT_DIR` | JSON report output dir (default `./dependfix-reports`) |
| `DEPENDFIX_AI_API_KEY` | AI assessment API Key (required when `run_scan` `ai_enabled` enabled; only via env var, never via tool params) |

## Security boundaries

- Credentials only read from environment variables (`GITHUB_TOKEN` / `DEPENDFIX_AI_API_KEY`), tool params do not pass sensitive information
- `cleanup_branches` is pure GitHub API ops (list/status/delete remote branch), no local repo needed; only deletes `dependfix/` prefixed merged/closed branches, never touches open PR branches
- `fix_dependency` requires locally cloned repo dir (`workDir`, operates on package.json / pnpm-workspace.yaml / pnpm-lock.yaml)

## Local development

```bash
pnpm --filter @dependfix/mcp build   # Build dist
pnpm --filter @dependfix/mcp test    # Consistency test
node packages/mcp/dist/bin.mjs       # stdio launch
```

## Design

See [mcp-server.md](https://github.com/dependfix/dependfix/blob/master/docs/design/governance/mcp-server.md) (Tool schema, CLI consistency, error handling, capability gaps and evolution path).

## Related packages

- [dependfix main project](https://github.com/dependfix/dependfix) — this package's source and full docs
- [@dependfix/core](https://github.com/dependfix/dependfix/blob/master/packages/core/README.md) — core domain model library (this package depends on)
- [@dependfix/engine](https://github.com/dependfix/dependfix/blob/master/packages/engine/README.md) — execution engine (this package depends on)
- [dependfix](https://github.com/dependfix/dependfix/blob/master/packages/cli/README.md) — CLI application entry (same source capabilities)
- [@dependfix/skills](https://github.com/dependfix/dependfix/blob/master/packages/skills/README.md) — Agent Skill source of truth
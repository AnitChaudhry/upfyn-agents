---
description: Run statusline diagnostics — checks installation, config, performance, and identifies issues
---

# Statusline Doctor

Run comprehensive diagnostics on the statusline installation.

## Instructions

1. Run `ccsl doctor` in the terminal
2. Show the full output to the user
3. If there are any issues (indicated by X or warning symbols), explain what each issue means and how to fix it

## What It Checks

| Check | What It Verifies |
|-------|-----------------|
| bash | Bash is available and its version |
| git | Git is available (needed for GitHub field) |
| settings.json | Has `statusLine` config pointing to the command |
| statusline-command.sh | Entry point script exists at ~/.claude/ |
| v2 engine | core.sh exists in ~/.claude/statusline/ |
| Theme file | Active theme .sh file exists |
| Layout file | Active layout .sh file exists |
| CLAUDE.md | Agent redirect section is present (prevents built-in agent conflicts) |
| Config | statusline-config.json is valid JSON |
| Performance | Benchmark: <50ms excellent, <100ms good, >100ms slow |

## Common Fixes

- **Missing files**: Run `ccsl install` or `ccsl update`
- **Missing CLAUDE.md section**: Run `ccsl update`
- **Slow performance**: Normal on Windows Git Bash cold start — actual Claude Code rendering is faster
- **Invalid config**: Delete `~/.claude/statusline-config.json` and run `ccsl install --quick`

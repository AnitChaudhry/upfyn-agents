---
description: Show all available statusline slash commands and CLI commands
---

# Statusline Help

Show the user all available statusline commands.

## Slash Commands (use inside Claude Code)

| Command | Description |
|---------|-------------|
| `/sls-theme` | List themes |
| `/sls-theme <name>` | Set theme (default, nord, tokyo-night, catppuccin, gruvbox) |
| `/sls-layout` | List layouts |
| `/sls-layout <name>` | Set layout (compact, standard, full) |
| `/sls-preview` | Preview with current settings |
| `/sls-preview <theme> <layout>` | Preview with overrides |
| `/sls-config` | Show all config options |
| `/sls-config <key> <value>` | Set a config option |
| `/sls-doctor` | Run diagnostics |
| `/sls-help` | This help |

## CLI Commands (use in any terminal)

| Command | Description |
|---------|-------------|
| `ccsl install` | Interactive install wizard |
| `ccsl install --quick` | Quick install with defaults |
| `ccsl uninstall` | Remove everything |
| `ccsl update` | Update scripts, keep config |
| `ccsl theme` / `ccsl theme set <name>` | List/set theme |
| `ccsl layout` / `ccsl layout set <name>` | List/set layout |
| `ccsl preview [--theme x] [--layout x]` | Preview rendering |
| `ccsl config` / `ccsl config set <k> <v>` | Show/set options |
| `ccsl doctor` | Run diagnostics |
| `ccsl version` | Show version |
| `ccsl help` | Show CLI help |

## Quick Examples

- Change to Nord theme: `/sls-theme nord`
- Switch to full layout (6 rows): `/sls-layout full`
- Preview Tokyo Night + compact: `/sls-preview tokyo-night compact`
- Lower compaction warning to 80%: `/sls-config compaction_warning_threshold 80`
- Check installation health: `/sls-doctor`

Present this information clearly to the user in a formatted way.

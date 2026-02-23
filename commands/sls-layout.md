---
description: List available statusline layouts or set a layout. Examples: /sls-layout, /sls-layout full
argument-hint: "[layout-name]"
---

# Statusline Layout

Manage the statusline layout for Claude Code.

## Current Config

```
!cat ~/.claude/statusline-config.json 2>/dev/null || echo '{"theme":"default","layout":"standard"}'
```

## Available Layouts

| Layout | Rows | What It Shows |
|--------|------|---------------|
| `compact` | 2 | Model, Dir, Context%, Cost — minimal footprint |
| `standard` | 4 | Skill, Model, GitHub, Dir, Tokens, Cost, Context bar — balanced |
| `full` | 6 | Everything: adds Session tokens, Duration, Lines, Cache, Vim mode, Agent name |

## Instructions

If `$ARGUMENTS` is provided (a layout name):
1. Run `ccsl layout set $ARGUMENTS` in the terminal
2. Show the result to the user
3. Tell them to restart Claude Code or start a new conversation for the layout to take effect

If no arguments provided:
1. Run `ccsl layout` in the terminal to list layouts with the current selection highlighted
2. Show the output to the user
3. Tell them they can set a layout with `/sls-layout <name>` or `ccsl layout set <name>`

**Valid layout names:** compact, standard, full

If the user provides an invalid layout name, show them the valid options above.

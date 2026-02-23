---
description: List available statusline themes or set a theme. Examples: /sls-theme, /sls-theme nord
argument-hint: "[theme-name]"
---

# Statusline Theme

Manage the statusline theme for Claude Code.

## Current Config

```
!cat ~/.claude/statusline-config.json 2>/dev/null || echo '{"theme":"default","layout":"standard"}'
```

## Available Themes

| Theme | Description |
|-------|-------------|
| `default` | Classic purple/pink/cyan — the original |
| `nord` | Arctic, blue-tinted — frost palette |
| `tokyo-night` | Vibrant neon — dark city glow |
| `catppuccin` | Warm pastels — Mocha variant |
| `gruvbox` | Retro groovy — warm earth tones |

## Instructions

If `$ARGUMENTS` is provided (a theme name):
1. Run `ccsl theme set $ARGUMENTS` in the terminal
2. Show the result to the user
3. Tell them to restart Claude Code or start a new conversation for the theme to take effect

If no arguments provided:
1. Run `ccsl theme` in the terminal to list themes with the current selection highlighted
2. Show the output to the user
3. Tell them they can set a theme with `/sls-theme <name>` or `ccsl theme set <name>`

**Valid theme names:** default, nord, tokyo-night, catppuccin, gruvbox

If the user provides an invalid theme name, show them the valid options above.

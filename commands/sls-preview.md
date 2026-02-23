---
description: Preview the statusline with sample data. Optionally specify theme/layout overrides. Examples: /sls-preview, /sls-preview nord full
argument-hint: "[theme] [layout]"
---

# Statusline Preview

Preview the statusline rendering with sample data.

## Current Config

```
!cat ~/.claude/statusline-config.json 2>/dev/null || echo '{"theme":"default","layout":"standard"}'
```

## Instructions

Parse `$ARGUMENTS` for optional theme and layout overrides. Arguments can be in any order — detect which is a theme and which is a layout.

**Valid themes:** default, nord, tokyo-night, catppuccin, gruvbox
**Valid layouts:** compact, standard, full

Build the ccsl preview command:
- No arguments: run `ccsl preview`
- Theme only: run `ccsl preview --theme <name>`
- Layout only: run `ccsl preview --layout <name>`
- Both: run `ccsl preview --theme <name> --layout <name>`

Run the command in the terminal and show the output to the user.

After showing the preview, remind the user:
- To apply a theme: `/sls-theme <name>` or `ccsl theme set <name>`
- To apply a layout: `/sls-layout <name>` or `ccsl layout set <name>`
- Changes take effect on Claude Code restart

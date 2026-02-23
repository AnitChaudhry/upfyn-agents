---
description: Show or modify statusline configuration options. Examples: /sls-config, /sls-config bar_width 50
argument-hint: "[key] [value]"
---

# Statusline Configuration

View or modify statusline configuration.

## Current Config

```
!cat ~/.claude/statusline-config.json 2>/dev/null || echo '{"theme":"default","layout":"standard"}'
```

## Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `compaction_warning_threshold` | number | 85 | Context % at which "X% left" warning appears |
| `bar_width` | number | 40 | Width of the context progress bar in characters |
| `cache_ttl_seconds` | number | 5 | How long git/skill cache lives before refresh |
| `show_burn_rate` | boolean | false | Show cost-per-minute calculation |
| `show_vim_mode` | boolean | true | Show vim mode indicator (full layout only) |
| `show_agent_name` | boolean | true | Show active agent name (full layout only) |

## Instructions

If `$ARGUMENTS` has two values (key and value):
1. Run `ccsl config set <key> <value>` in the terminal
2. Show the result
3. Tell them changes take effect on next statusline refresh

If `$ARGUMENTS` has one value (just a key):
1. Read `~/.claude/statusline-config.json`
2. Show the current value of that specific option
3. Suggest how to change it

If no arguments:
1. Run `ccsl config` in the terminal to show all current settings
2. Show the output
3. Tell them they can change options with `/sls-config <key> <value>`

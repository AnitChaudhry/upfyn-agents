# Upfyn Agents - Terminal Task Board for Coding Agents

A terminal-native task board for managing multiple AI coding agent sessions with isolated git worktrees.

## Quick Start

```bash
# Install dependencies
npm install

# Run in a git project directory
node src/index.js .

# Or run in dashboard mode (no git project required)
node src/index.js -g

# Or use the binary
npx upfyn
```

## Architecture

```
src/
├── index.js              # Entry point, CLI arg parsing
├── app.js                # Main App class, event loop, rendering
├── db/
│   ├── models.js         # Task, Project, TaskConnection, TaskStatus
│   └── database.js       # SQLite wrapper (better-sqlite3), schema, CRUD
├── config/
│   └── config.js         # Global + project config (TOML)
├── agent/
│   └── agent.js          # Agent definitions, detection, spawn args
├── git/
│   ├── git.js            # git helpers (is_repo, diff, branch, merge)
│   ├── worktree.js       # git worktree create/remove
│   └── provider.js       # GitHub PR operations via gh CLI
├── tmux/
│   └── tmux.js           # tmux session management (server "upfyn")
├── tui/
│   ├── board.js          # BoardState - task board column/row navigation
│   ├── canvas.js         # CanvasState - nodes + arrows view
│   ├── html-preview.js   # HTML preview popup
│   ├── sidebar.js        # Project sidebar state
│   ├── popups.js         # Shell, diff, search, PR, confirm popups
│   └── theme.js          # Hex color theming helpers
└── utils/
    └── mermaid.js        # Lightweight mermaid parser
```

## Key Concepts

### Task Workflow
```
Backlog → Planning → Running → Review → Done
            ↓           ↓         ↓        ↓
         worktree    Agent     optional  cleanup
         + Agent     working   PR        (keep
         planning             (resume)   branch)
```

- **Backlog**: Task ideas, not started
- **Planning**: Creates git worktree at `.upfyn/worktrees/{slug}`, copies configured files, runs init script, starts agent in planning mode
- **Running**: Agent is implementing (sends "proceed with implementation")
- **Review**: Optionally create PR. Tmux window stays open. Can resume to address feedback
- **Done**: Cleanup worktree + tmux window (branch kept locally)

### Session Persistence
- Tmux window stays open when moving Running → Review
- Resume from Review simply changes status back to Running (window already exists)
- No special agent resume logic needed — the session stays alive in tmux

### Database Storage
All databases stored centrally (not in project directories):
- macOS: `~/Library/Application Support/upfyn-agents/`
- Linux: `~/.config/upfyn-agents/`
- Windows: `%APPDATA%/upfyn-agents/`

Structure:
- `index.db` - Global project index
- `projects/{hash}.db` - Per-project task database (hash of project path)

### Tmux Architecture
```
┌─────────────────────────────────────────────────────────┐
│                 tmux server "upfyn"                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Session: "my-project"                              │ │
│  │  ┌────────┐  ┌────────┐  ┌────────┐               │ │
│  │  │Window: │  │Window: │  │Window: │               │ │
│  │  │task2   │  │task3   │  │task4   │               │ │
│  │  │(Claude)│  │(Claude)│  │(Claude)│               │ │
│  │  └────────┘  └────────┘  └────────┘               │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

- **Server**: Dedicated tmux server named `upfyn` (`tmux -L upfyn`)
- **Sessions**: Each task gets its own session
- Separate from user's regular tmux sessions
- View sessions: `tmux -L upfyn list-sessions`
- Attach: `tmux -L upfyn attach`

### Theme Configuration
Colors configurable via `~/.config/upfyn-agents/config.toml`:
```toml
[theme]
color_selected = "#ead49a"      # Selected elements (yellow)
color_normal = "#5cfff7"        # Normal borders (cyan)
color_dimmed = "#9C9991"        # Inactive elements (dark gray)
color_text = "#f2ece6"          # Text (light rose)
color_accent = "#5cfff7"        # Accents (cyan)
color_description = "#C4B0AC"   # Task descriptions (dimmed rose)
color_column_header = "#a0d2fa" # Column headers (light blue gray)
color_popup_border = "#9ffcf8"  # Popup borders (light cyan)
color_popup_header = "#69fae7"  # Popup headers (light cyan)
```

## Keyboard Shortcuts

### Board Mode
| Key | Action |
|-----|--------|
| `h/l` or arrows | Move between columns |
| `j/k` or arrows | Move between tasks |
| `o` | Create new task |
| `Enter` | Open task popup (tmux view) / Edit task (backlog) |
| `x` | Delete task (with confirmation) |
| `d` | Show git diff for task |
| `m` | Move task forward (advance workflow) |
| `M` | Move directly to Running (skip Planning) |
| `r` | Resume task (Review → Running) |
| `/` | Search tasks (jumps to and opens task) |
| `c` | Toggle canvas view |
| `e` | Toggle project sidebar |
| `q` | Quit |

### Canvas Mode
| Key | Action |
|-----|--------|
| `h/j/k/l` | Select nodes by direction |
| `H/J/K/L` | Move selected node |
| `a` | Start connection (arrow) |
| `x` | Delete connection |
| `+/-` | Zoom in/out |
| `p` | HTML preview |
| `b` | Open HTML in browser |
| `c` or `Esc` | Back to board |

### Task Popup (tmux view)
| Key | Action |
|-----|--------|
| `Ctrl+j/k` or `Ctrl+n/p` | Scroll up/down |
| `Ctrl+d/u` | Page down/up |
| `Ctrl+g` | Jump to bottom |
| `Ctrl+q` or `Esc` | Close popup |
| Other keys | Forwarded to tmux/agent |

### PR Creation Popup
| Key | Action |
|-----|--------|
| `Tab` | Switch between title/description |
| `Ctrl+s` | Create PR and move to Review |
| `Esc` | Cancel |

## Code Patterns

### terminal-kit TUI
- Uses terminal-kit's `fullscreen`, `grabInput`, `moveTo`, `colorRgb`
- Single `App` class holds all state and rendering methods
- `draw()` clears screen and redraws everything each frame
- Key events handled via `term.on('key', ...)`
- Theme colors stored as hex strings, converted via `parseHex()` → `term.colorRgb(r, g, b)`

### Error Handling
- Functions throw on error; callers wrap in try/catch
- Gracefully handle missing tmux sessions/worktrees

### Database
- `better-sqlite3` (synchronous, fast)
- Schema created on open with `CREATE TABLE IF NOT EXISTS`
- DateTime stored as ISO 8601 strings

### Shell Operations
- `child_process.execSync` for git/tmux/gh CLI calls
- `child_process.spawnSync` for tmux attach (inherits stdio)

## Dependencies

| Package | Purpose |
|---------|---------|
| `terminal-kit` | TUI framework (screen, keyboard, colors) |
| `better-sqlite3` | SQLite database (sync, fast) |
| `toml` | Parse TOML config files |
| `html-to-text` | Convert HTML to terminal-friendly text |
| `open` | Open URLs/files in system browser |
| `which` | Detect installed CLI tools |

Runtime requirements:
- Node.js 18+
- tmux (for agent sessions)
- git (for worktrees)
- gh CLI (for PR operations)
- Agent CLI (claude, aider, codex, etc.)

## Common Tasks

### Adding a new task field
1. Add field to `createTask()` in `src/db/models.js`
2. Add column to schema in `src/db/database.js`
3. Update `insertTask`, `updateTask`, `rowToTask` in database.js
4. Update UI rendering in `src/app.js`

### Adding a new theme color
1. Add to `DEFAULT_THEME` in `src/config/config.js`
2. Use `this.setColor(theme.color_*)` in app.js drawing methods

### Adding a new agent
1. Add to `KNOWN_AGENTS` array in `src/agent/agent.js`
2. Add case to `buildInteractiveCommand()` and `buildSpawnArgs()`

### Adding a keyboard shortcut
1. Find the appropriate `handle*Key()` method in `src/app.js`
2. Add case for the new key
3. Update footer text in `drawFooter()`

### Adding a new popup
1. Add state class in `src/tui/popups.js`
2. Add property to `App` class (initialized to `null`)
3. Add `draw*()` method in app.js
4. Add `handle*Key()` method in app.js
5. Add check in `handleKey()` to route to handler

## Supported Agents

Detected automatically via `knownAgents()` in order of preference:
1. **claude** - Anthropic's Claude Code CLI
2. **aider** - AI pair programming in your terminal
3. **codex** - OpenAI's Codex CLI
4. **gh-copilot** - GitHub Copilot CLI
5. **opencode** - AI-powered coding assistant
6. **cline** - AI coding assistant for VS Code
7. **q** - Amazon Q Developer CLI

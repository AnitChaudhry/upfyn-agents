<div align="center">
  <h1>Upfyn Agents</h1>
  <p><strong>A terminal-native task board for managing multiple AI coding agent sessions with isolated git worktrees.</strong></p>
  <p>Manage Claude Code, Aider, Codex, GitHub Copilot, and more — all from one unified terminal interface.</p>
</div>

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UPFYN AGENTS  my-project                     │
├──────────┬───────────┬───────────┬───────────┬──────────────────────┤
│ BACKLOG  │ PLANNING  │  RUNNING  │  REVIEW   │  DONE               │
│ ───────  │ ────────  │  ───────  │  ──────   │  ────               │
│          │           │           │           │                      │
│ > Auth   │  Refactor │  Fix bug  │  Add API  │  Setup CI           │
│   [claude│  [claude] │  [aider]  │  [claude] │  [claude]           │
│          │           │           │  PR #42   │                      │
│  Caching │           │           │           │                      │
│  [aider] │           │           │           │                      │
│          │           │           │           │                      │
├──────────┴───────────┴───────────┴───────────┴──────────────────────┤
│ [o] new [/] search [m] move [d] diff [s] sessions [S] SVG [q] quit │
└─────────────────────────────────────────────────────────────────────┘
```

Each task flows through five stages. When a task moves to **Planning**, Upfyn automatically creates an isolated git worktree and spawns your chosen AI agent inside a dedicated tmux session:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Upfyn Agents TUI                               │
├─────────────────────────────────────────────────────────────────────┤
│  Backlog  │  Planning  │  Running  │  Review  │  Done               │
│  ┌─────┐  │  ┌─────┐   │  ┌─────┐  │  ┌─────┐ │                    │
│  │Task1│  │  │Task2│   │  │Task3│  │  │Task4│ │                    │
│  └─────┘  │  └─────┘   │  └─────┘  │  └─────┘ │                    │
└───────────┴────────────┴──────┬────┴──────┬───┴────────────────────┘
                    │           │           │
                    ▼           ▼           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    tmux server "upfyn"                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Session: task-a1b2c3d4--my-project--refactor-auth              │ │
│  │  ┌──────────────────────────────────────┐                      │ │
│  │  │  claude --dangerously-skip-perms ... │                      │ │
│  │  │  > Planning implementation...        │                      │ │
│  │  └──────────────────────────────────────┘                      │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Session: task-e5f6g7h8--my-project--fix-bug                    │ │
│  │  ┌──────────────────────────────────────┐                      │ │
│  │  │  aider --message "Fix the login..." │                      │ │
│  │  │  > Implementing fix...               │                      │ │
│  │  └──────────────────────────────────────┘                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                    │           │
                    ▼           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Git Worktrees                                     │
│                                                                      │
│  .upfyn/worktrees/refactor-auth/    ← branch: task/refactor-auth    │
│  .upfyn/worktrees/fix-bug/          ← branch: task/fix-bug          │
│  .upfyn/worktrees/add-api/          ← branch: task/add-api          │
│                                                                      │
│  Each worktree = isolated copy of the repo for parallel work         │
└─────────────────────────────────────────────────────────────────────┘
```

## Task Workflow

```
  ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌────────┐    ┌──────┐
  │ BACKLOG │───>│ PLANNING │───>│ RUNNING │───>│ REVIEW │───>│ DONE │
  └─────────┘    └──────────┘    └─────────┘    └────────┘    └──────┘
                      │              │              │              │
                 Create worktree  Agent is      Optional PR    Cleanup
                 Spawn agent     implementing   Push + PR      worktree
                 in planning     (auto-sent     Can resume     Keep branch
                 mode            "proceed")     from here
```

- **Backlog** — Ideas and upcoming tasks. Edit title/description here.
- **Planning** — Worktree created, agent spawned in planning mode. Agent analyzes the codebase and creates a plan.
- **Running** — Agent is implementing. Upfyn sends "proceed with implementation" automatically.
- **Review** — Work done. Optionally create a PR via `gh`. Resume to address feedback.
- **Done** — Worktree cleaned up, tmux session killed. Branch preserved locally.

## Canvas View

Press `c` to switch to the canvas — a spatial view of all tasks with connections:

```
┌─────────────────────────────────────────────────────────────────────┐
│ CANVAS [c]Board [a]Connect [+/-]Zoom [S]SVG                        │
│                                                                      │
│   ┌──────────────────────┐          ┌──────────────────────┐        │
│   │ Setup Database       │─────────>│ Add API Endpoints    │        │
│   │ [done] claude        │          │ [running] claude     │        │
│   └──────────────────────┘          └──────────────────────┘        │
│                                              │                       │
│                                              │ "after API"           │
│                                              ▼                       │
│   ┌──────────────────────┐          ┌──────────────────────┐        │
│   │ Write Tests          │<─────────│ Frontend Integration │        │
│   │ [backlog] aider      │          │ [planning] claude    │        │
│   └──────────────────────┘          └──────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

- Navigate nodes with `h/j/k/l`, move them with `H/J/K/L`
- Draw connections with `a` (connect mode)
- Export the entire strategy to **SVG** with `S`

## SVG Export

Press `S` from either view to export a publication-ready SVG of your task board or canvas:

```
Board view → upfyn-board-{timestamp}.svg    (columns + cards)
Canvas view → upfyn-canvas-{timestamp}.svg  (nodes + arrows)
```

SVGs include full color theming, status badges, agent labels, and connection arrows.

## Session Management

Press `s` to view all active agent sessions:

```
┌──────────────────────────────────────────────────────┐
│ Agent Sessions                                        │
│                                                       │
│ Active sessions on tmux server "upfyn":               │
│                                                       │
│   task-a1b2c3d4--my-project--refactor-auth            │
│     Created: 12m ago                                  │
│                                                       │
│   task-e5f6g7h8--my-project--fix-bug                  │
│     Created: 45m ago                                  │
│                                                       │
│ Attach: tmux -L upfyn attach -t <session>             │
│ View:   tmux -L upfyn list-sessions                   │
└──────────────────────────────────────────────────────┘
```

Open any task's live session with `Enter` to see the agent's output in real-time:

```
┌──────────────────────────────────────────────────────┐
│ Fix authentication bug                   [Ctrl+q]    │
│                                                       │
│ claude> I'll fix the authentication bug by updating   │
│ the token validation logic in auth.js...              │
│                                                       │
│ Changes made:                                         │
│   src/auth.js - Fixed token expiry check              │
│   src/middleware.js - Added refresh logic              │
│                                                       │
│ Ready for review.                                     │
│                                                       │
│ [Ctrl+j/k] Scroll  [Ctrl+d/u] Page  [Ctrl+g] Bottom  │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **tmux** — Agent sessions run in a dedicated tmux server
- **git** — Worktree isolation for parallel development
- **gh** (optional) — GitHub CLI for PR operations
- At least one AI coding agent (Claude Code, Aider, Codex, etc.)

### Install & Run

```bash
# Install
npm install

# Run in a git project directory
node src/index.js .

# Or use the binary after npm link
npx upfyn

# Dashboard mode (multi-project, no git required)
npx upfyn -g
```

### Configuration

Global config at `~/.config/upfyn-agents/config.toml` (Linux) or `%APPDATA%/upfyn-agents/config.toml` (Windows):

```toml
default_agent = "claude"

[worktree]
enabled = true
auto_cleanup = true
base_branch = "main"

[theme]
color_selected = "#ead49a"
color_normal = "#5cfff7"
color_dimmed = "#9C9991"
color_text = "#f2ece6"
color_accent = "#5cfff7"
color_description = "#C4B0AC"
color_column_header = "#a0d2fa"
color_popup_border = "#9ffcf8"
color_popup_header = "#69fae7"
```

Per-project config at `<project>/.upfyn/config.toml`:

```toml
default_agent = "aider"
base_branch = "develop"
github_url = "https://github.com/org/repo"
copy_files = ".env,config.json"
init_script = "npm install"
```

## Keyboard Reference

### Board View

| Key | Action |
|-----|--------|
| `h` / `l` | Move between columns |
| `j` / `k` | Move between tasks |
| `o` | Create new task |
| `Enter` | Open task session / edit backlog task |
| `x` | Delete task (with confirmation) |
| `d` | Show git diff for task branch |
| `m` | Move task to next stage |
| `M` | Move directly to Running (skip Planning) |
| `r` | Resume task (Review back to Running) |
| `/` | Search tasks by title |
| `s` | View active agent sessions |
| `S` | Export current view to SVG |
| `c` | Switch to canvas view |
| `e` | Toggle project sidebar |
| `q` | Quit |

### Canvas View

| Key | Action |
|-----|--------|
| `h` / `j` / `k` / `l` | Select nodes by direction |
| `H` / `J` / `K` / `L` | Move selected node |
| `a` | Start connection (draw arrow) |
| `x` | Delete connection from selected node |
| `+` / `-` | Zoom in / out |
| `p` | HTML preview of selected node |
| `b` | Open HTML content in browser |
| `S` | Export canvas to SVG |
| `c` / `Esc` | Back to board view |

### Task Session Popup

| Key | Action |
|-----|--------|
| `Ctrl+j` / `Ctrl+k` | Scroll up/down |
| `Ctrl+d` / `Ctrl+u` | Page down/up |
| `Ctrl+g` | Jump to bottom |
| `Ctrl+q` / `Esc` | Close popup |
| Other keys | Forwarded to the agent session |

### PR Creation

| Key | Action |
|-----|--------|
| `Tab` | Switch between title and description |
| `Ctrl+s` | Push branch + create PR |
| `Esc` | Cancel |

### Task Description Input

| Key | Action |
|-----|--------|
| `#` / `@` | Open file search (fuzzy find project files) |
| `Enter` | Save and create task |
| `Esc` | Cancel |

## Supported Agents

Detected automatically in order of preference:

| Agent | Command | Description |
|-------|---------|-------------|
| Claude Code | `claude` | Anthropic's Claude Code CLI |
| Aider | `aider` | AI pair programming in your terminal |
| Codex | `codex` | OpenAI's Codex CLI |
| GitHub Copilot | `gh copilot` | GitHub Copilot CLI |
| OpenCode | `opencode` | AI-powered coding assistant |
| Cline | `cline` | AI coding assistant |
| Amazon Q | `q` | Amazon Q Developer CLI |

## Architecture

```
src/
├── index.js              # Entry point, CLI arg parsing
├── app.js                # Main App class — rendering, key handling, actions
├── db/
│   ├── models.js         # Task, Project, TaskConnection data structures
│   └── database.js       # SQLite operations (CRUD, schema, migrations)
├── config/
│   └── config.js         # Global + per-project TOML configuration
├── agent/
│   └── agent.js          # Agent registry, detection, command building
├── git/
│   ├── git.js            # Git helpers (branch, diff, merge)
│   ├── worktree.js       # Worktree lifecycle (create, init, remove)
│   └── provider.js       # GitHub PR operations via gh CLI
├── tmux/
│   └── tmux.js           # Session management (spawn, capture, kill)
├── tui/
│   ├── board.js          # Board navigation state
│   ├── canvas.js         # Canvas state (nodes, zoom, pan, connections)
│   ├── html-preview.js   # HTML preview (terminal + browser)
│   ├── sidebar.js        # Project sidebar state
│   ├── popups.js         # All popup state classes
│   └── theme.js          # Hex color utilities
└── utils/
    ├── mermaid.js         # Mermaid diagram parser
    └── svg-export.js      # SVG export (board + canvas views)
```

## Database

All data stored centrally — never inside your project directories:

| Platform | Location |
|----------|----------|
| Linux | `~/.config/upfyn-agents/` |
| macOS | `~/Library/Application Support/upfyn-agents/` |
| Windows | `%APPDATA%/upfyn-agents/` |

- `index.db` — Global project index
- `projects/{hash}.db` — Per-project task database

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <strong>Built by <a href="https://thinqmesh.com">Thinqmesh Technologies</a></strong>
</div>

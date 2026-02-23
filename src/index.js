#!/usr/bin/env node

import { resolve } from 'node:path';
import { App } from './app.js';
import { isGitRepo } from './git/git.js';

const args = process.argv.slice(2);

let mode = 'project';
let projectPath = null;

if (args.includes('-g') || args.includes('--global')) {
  mode = 'dashboard';
} else if (args.includes('-h') || args.includes('--help')) {
  console.log(`
  Upfyn Agents — Terminal task board for AI coding agents

  Usage:
    upfyn [path]     Launch in project mode (default: current dir)
    upfyn -g         Launch in dashboard mode (no git required)
    upfyn -h         Show this help

  Board:
    h/j/k/l          Navigate columns and tasks
    o                 New task
    Enter             Open task / edit backlog
    x                 Delete task
    m                 Move task forward
    M                 Move directly to Running
    r                 Move task back (resume)
    d                 Show git diff
    /                 Search tasks
    s                 View active agent sessions
    S                 Export board/canvas to SVG
    c                 Toggle canvas view
    e                 Toggle project sidebar
    q                 Quit

  Canvas:
    h/j/k/l          Select nodes by direction
    H/J/K/L          Move selected node
    a                 Connect nodes (draw arrow)
    x                 Delete connection
    +/-              Zoom in/out
    p                 HTML preview
    b                 Open in browser
    S                 Export canvas to SVG
    c/Esc            Back to board
`);
  process.exit(0);
} else {
  const pathArg = args[0] || '.';
  projectPath = resolve(pathArg);

  // If not a git repo and no explicit path, fall back to dashboard
  if (!args[0] && !isGitRepo(projectPath)) {
    mode = 'dashboard';
    projectPath = null;
  }
}

const app = new App(mode, projectPath);
app.run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

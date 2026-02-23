/**
 * Cross-platform session manager for agent sessions.
 *
 * Backends:
 *  - tmux   (Linux/macOS with tmux installed)
 *  - wt     (Windows with Windows Terminal)
 *  - shell  (fallback — background process with log file)
 *
 * All backends expose the same API so the rest of the app
 * doesn't need to know which platform it's running on.
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, openSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

// ───────────────────── config dir ─────────────────────

function configBaseDir() {
  const p = platform();
  if (p === 'darwin') return join(homedir(), 'Library', 'Application Support', 'upfyn-agents');
  if (p === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'upfyn-agents');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'upfyn-agents');
}

function sessionsDir() {
  const d = join(configBaseDir(), 'sessions');
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function sessionDir(name) {
  const d = join(sessionsDir(), name);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

// ───────────────────── platform detect ─────────────────────

const IS_WIN = platform() === 'win32';

function hasTmux() {
  try {
    execSync('tmux -V', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function hasWt() {
  if (!IS_WIN) return false;
  try {
    execSync('where wt.exe', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

/** Detect the best available backend */
let _backend = null;
export function getBackend() {
  if (_backend) return _backend;
  if (hasTmux()) _backend = 'tmux';
  else if (hasWt()) _backend = 'wt';
  else _backend = 'shell';
  return _backend;
}

export const AGENT_SERVER = 'upfyn';

// ═══════════════════════════════════════════
//  TMUX BACKEND
// ═══════════════════════════════════════════

const tmuxBackend = {
  spawnSession(sessionName, workingDir, command, args = []) {
    let shellCommand = command;
    for (const arg of args) {
      const escaped = arg.replace(/'/g, "'\"'\"'");
      shellCommand += ` '${escaped}'`;
    }
    // Unset CLAUDECODE env var so agents don't think they're nested
    const cleanCmd = 'unset CLAUDECODE CLAUDE_CODE_SESSION 2>/dev/null; ' + shellCommand;
    const result = spawnSync('tmux', [
      '-L', AGENT_SERVER, 'new-session', '-d',
      '-s', sessionName, '-c', workingDir,
      'sh', '-c', cleanCmd,
    ], { stdio: 'pipe' });
    if (result.status !== 0) {
      throw new Error(`tmux new-session failed: ${result.stderr?.toString() || ''}`);
    }
    // Also save session info for listSessions consistency
    const dir = sessionDir(sessionName);
    writeFileSync(join(dir, 'cmd'), shellCommand);
    writeFileSync(join(dir, 'backend'), 'tmux');
  },

  sessionExists(sessionName) {
    try {
      execSync(`tmux -L ${AGENT_SERVER} has-session -t "${sessionName}"`, { stdio: 'pipe' });
      return true;
    } catch { return false; }
  },

  captureOutput(sessionName, lines = 50) {
    try {
      return execSync(
        `tmux -L ${AGENT_SERVER} capture-pane -t "${sessionName}" -p -S -${lines}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
    } catch { return ''; }
  },

  sendKeys(sessionName, keys) {
    try {
      execSync(
        `tmux -L ${AGENT_SERVER} send-keys -t "${sessionName}" "${keys.replace(/"/g, '\\"')}" Enter`,
        { stdio: 'pipe' }
      );
    } catch { /* ignore */ }
  },

  killSession(sessionName) {
    try {
      execSync(`tmux -L ${AGENT_SERVER} kill-session -t "${sessionName}"`, { stdio: 'pipe' });
    } catch { /* ignore */ }
    // Cleanup session dir
    const dir = join(sessionsDir(), sessionName);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  },

  listSessions() {
    try {
      const output = execSync(
        `tmux -L ${AGENT_SERVER} list-sessions -F "#{session_name}\t#{session_activity}\t#{session_created}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      return output.trim().split('\n').filter(Boolean).map(line => {
        const [name, lastActivity, created] = line.split('\t');
        return { name, lastActivity: parseInt(lastActivity, 10) || 0, created: parseInt(created, 10) || 0, backend: 'tmux' };
      });
    } catch { return []; }
  },

  attachSession(sessionName) {
    spawnSync('tmux', ['-L', AGENT_SERVER, 'attach', '-t', sessionName], { stdio: 'inherit' });
  },
};

// ═══════════════════════════════════════════
//  WINDOWS TERMINAL BACKEND
// ═══════════════════════════════════════════

const wtBackend = {
  spawnSession(sessionName, workingDir, command, args = []) {
    const dir = sessionDir(sessionName);
    const logFile = join(dir, 'log');

    // Build the full command
    let fullCmd = command;
    for (const arg of args) {
      fullCmd += ` "${arg.replace(/"/g, '\\"')}"`;
    }

    writeFileSync(join(dir, 'cmd'), fullCmd);
    writeFileSync(join(dir, 'backend'), 'wt');
    writeFileSync(logFile, '');

    // Build a wrapper script that runs the agent
    // Use backslashes for cmd.exe compatibility and quote paths with spaces
    const wrapperScript = join(dir, 'run.cmd');
    const winWorkDir = workingDir.replace(/\//g, '\\');
    const cmdContent = [
      '@echo off',
      ':: Clear inherited env vars that block nested agent launches',
      'set CLAUDECODE=',
      'set CLAUDE_CODE_SESSION=',
      `cd /d "${winWorkDir}"`,
      'echo.',
      `echo [Upfyn Agents] Running: ${fullCmd.split('"')[0].trim()}...`,
      'echo.',
      fullCmd,
      'echo.',
      'echo [Upfyn Agents] Agent session ended.',
      'pause',
    ].join('\r\n') + '\r\n';
    writeFileSync(wrapperScript, cmdContent);

    // Quote the wrapper script path (may contain spaces)
    const quotedWrapper = `"${wrapperScript}"`;

    // Spawn in a new Windows Terminal tab
    try {
      const child = spawn('wt.exe', [
        '-w', '0', 'nt',
        '--title', sessionName,
        '--', 'cmd', '/c', quotedWrapper,
      ], {
        stdio: 'ignore',
        detached: true,
        windowsHide: false,
      });
      if (child.pid) {
        writeFileSync(join(dir, 'pid'), String(child.pid));
      }
      child.unref();
    } catch {
      // Fallback: open in a new cmd window
      const child = spawn('cmd', ['/c', 'start', '', 'cmd', '/c', quotedWrapper], {
        stdio: 'ignore',
        detached: true,
        windowsHide: false,
      });
      if (child.pid) {
        writeFileSync(join(dir, 'pid'), String(child.pid));
      }
      child.unref();
    }

    // Mark as alive
    writeFileSync(join(dir, 'alive'), '1');
  },

  sessionExists(sessionName) {
    const dir = join(sessionsDir(), sessionName);
    return existsSync(join(dir, 'alive'));
  },

  captureOutput(sessionName, lines = 50) {
    const logFile = join(sessionsDir(), sessionName, 'log');
    if (!existsSync(logFile)) return '  Session running in a separate terminal tab.\n  Switch to that tab to interact with the agent.\n';
    try {
      const content = readFileSync(logFile, 'utf-8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).join('\n');
    } catch { return ''; }
  },

  sendKeys(sessionName, keys) {
    // Cannot send keys to Windows Terminal tabs programmatically
    // This is a limitation — user must switch tabs manually
  },

  killSession(sessionName) {
    const dir = join(sessionsDir(), sessionName);
    const pidFile = join(dir, 'pid');
    if (existsSync(pidFile)) {
      try {
        const pid = readFileSync(pidFile, 'utf-8').trim();
        if (pid) {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'pipe' });
        }
      } catch { /* process may already be gone */ }
    }
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  },

  listSessions() {
    return listSessionDirs('wt');
  },

  attachSession(sessionName) {
    // No direct attach for WT — user switches tabs
  },
};

// ═══════════════════════════════════════════
//  SHELL FALLBACK BACKEND (background process)
// ═══════════════════════════════════════════

const shellBackend = {
  spawnSession(sessionName, workingDir, command, args = []) {
    const dir = sessionDir(sessionName);
    const logFile = join(dir, 'log');

    let fullCmd = command;
    for (const arg of args) {
      fullCmd += IS_WIN ? ` "${arg.replace(/"/g, '\\"')}"` : ` '${arg.replace(/'/g, "'\"'\"'")}'`;
    }

    writeFileSync(join(dir, 'cmd'), fullCmd);
    writeFileSync(join(dir, 'backend'), 'shell');
    writeFileSync(logFile, '');

    // Spawn as a background child process — clear env vars that block nested agents
    const shell = IS_WIN ? 'cmd' : 'sh';
    const cleanCmd = IS_WIN ? `set CLAUDECODE= && set CLAUDE_CODE_SESSION= && ${fullCmd}` : `unset CLAUDECODE CLAUDE_CODE_SESSION 2>/dev/null; ${fullCmd}`;
    const shellArgs = IS_WIN ? ['/c', cleanCmd] : ['-c', cleanCmd];

    const out = openSync(logFile, 'a');
    const child = spawn(shell, shellArgs, {
      cwd: workingDir,
      stdio: ['ignore', out, out],
      detached: true,
    });

    if (child.pid) {
      writeFileSync(join(dir, 'pid'), String(child.pid));
    }
    writeFileSync(join(dir, 'alive'), '1');

    child.on('exit', () => {
      const aliveFile = join(dir, 'alive');
      if (existsSync(aliveFile)) rmSync(aliveFile);
    });
    child.unref();
  },

  sessionExists(sessionName) {
    const dir = join(sessionsDir(), sessionName);
    if (!existsSync(join(dir, 'alive'))) return false;
    // Double-check the process is still running
    const pidFile = join(dir, 'pid');
    if (existsSync(pidFile)) {
      try {
        const pid = readFileSync(pidFile, 'utf-8').trim();
        if (IS_WIN) {
          execSync(`tasklist /FI "PID eq ${pid}" /NH`, { stdio: 'pipe' });
        } else {
          process.kill(parseInt(pid), 0);
        }
        return true;
      } catch {
        // Process gone — clean up
        const aliveFile = join(dir, 'alive');
        if (existsSync(aliveFile)) rmSync(aliveFile);
        return false;
      }
    }
    return false;
  },

  captureOutput(sessionName, lines = 50) {
    const logFile = join(sessionsDir(), sessionName, 'log');
    if (!existsSync(logFile)) return '';
    try {
      const content = readFileSync(logFile, 'utf-8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).join('\n');
    } catch { return ''; }
  },

  sendKeys(sessionName, keys) {
    // Cannot send keys to detached process stdin
  },

  killSession(sessionName) {
    const dir = join(sessionsDir(), sessionName);
    const pidFile = join(dir, 'pid');
    if (existsSync(pidFile)) {
      try {
        const pid = readFileSync(pidFile, 'utf-8').trim();
        if (pid) {
          if (IS_WIN) {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'pipe' });
          } else {
            process.kill(parseInt(pid), 'SIGTERM');
          }
        }
      } catch { /* process may already be gone */ }
    }
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  },

  listSessions() {
    return listSessionDirs('shell');
  },

  attachSession(sessionName) {
    // Cannot attach to background process
  },
};

// ───────────────────── shared helpers ─────────────────────

function listSessionDirs(backendFilter) {
  const base = sessionsDir();
  const results = [];
  try {
    for (const name of readdirSync(base)) {
      const dir = join(base, name);
      if (!statSync(dir).isDirectory()) continue;
      const backendFile = join(dir, 'backend');
      if (!existsSync(backendFile)) continue;
      const backend = readFileSync(backendFile, 'utf-8').trim();
      if (backendFilter && backend !== backendFilter) continue;
      const alive = existsSync(join(dir, 'alive'));
      if (!alive) continue;
      const created = statSync(dir).ctimeMs / 1000;
      results.push({ name, created: Math.floor(created), lastActivity: Math.floor(Date.now() / 1000), backend });
    }
  } catch { /* ignore */ }
  return results;
}

// ═══════════════════════════════════════════
//  PUBLIC API — delegates to active backend
// ═══════════════════════════════════════════

function backend() {
  const b = getBackend();
  if (b === 'tmux') return tmuxBackend;
  if (b === 'wt') return wtBackend;
  return shellBackend;
}

export function spawnSession(sessionName, workingDir, command, args = []) {
  return backend().spawnSession(sessionName, workingDir, command, args);
}

export function sessionExists(sessionName) {
  // Check all backends — session might have been created by a different one
  if (tmuxBackend.sessionExists(sessionName)) return true;
  if (wtBackend.sessionExists(sessionName)) return true;
  if (shellBackend.sessionExists(sessionName)) return true;
  return false;
}

export function captureOutput(sessionName, lines = 50) {
  // Try tmux first (it has the richest capture), then file-based
  const b = getSessionBackend(sessionName);
  if (b === 'tmux') return tmuxBackend.captureOutput(sessionName, lines);
  if (b === 'wt') return wtBackend.captureOutput(sessionName, lines);
  if (b === 'shell') return shellBackend.captureOutput(sessionName, lines);
  // Fallback: try tmux then files
  const tmuxOut = tmuxBackend.captureOutput(sessionName, lines);
  if (tmuxOut) return tmuxOut;
  return shellBackend.captureOutput(sessionName, lines);
}

export function sendKeys(sessionName, keys) {
  const b = getSessionBackend(sessionName);
  if (b === 'tmux') return tmuxBackend.sendKeys(sessionName, keys);
  // wt and shell can't send keys — no-op
}

export function killSession(sessionName) {
  // Try all backends
  tmuxBackend.killSession(sessionName);
  const dir = join(sessionsDir(), sessionName);
  if (existsSync(dir)) {
    wtBackend.killSession(sessionName);
    shellBackend.killSession(sessionName);
  }
}

export function listSessions() {
  const sessions = [];
  // Merge from all backends
  const tmuxSessions = tmuxBackend.listSessions();
  sessions.push(...tmuxSessions);
  // Add file-based sessions not already in tmux list
  const fileSessions = listSessionDirs(null);
  for (const s of fileSessions) {
    if (!sessions.find(x => x.name === s.name)) sessions.push(s);
  }
  return sessions;
}

export function attachSession(sessionName) {
  const b = getSessionBackend(sessionName);
  if (b === 'tmux') return tmuxBackend.attachSession(sessionName);
}

/** Detect which backend owns a specific session */
function getSessionBackend(sessionName) {
  // Check file first
  const backendFile = join(sessionsDir(), sessionName, 'backend');
  if (existsSync(backendFile)) {
    return readFileSync(backendFile, 'utf-8').trim();
  }
  // Fallback: check tmux
  if (tmuxBackend.sessionExists(sessionName)) return 'tmux';
  return null;
}

// Re-export for compatibility
export { parseTaskId, parseProjectName } from './compat.js';

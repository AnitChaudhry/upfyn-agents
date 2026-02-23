import { execSync, spawnSync } from 'node:child_process';

/** Tmux server name for agent sessions */
export const AGENT_SERVER = 'upfyn';

/** Spawn a new agent session in the upfyn tmux server */
export function spawnSession(sessionName, workingDir, agentCommand, args = []) {
  let shellCommand = agentCommand;
  for (const arg of args) {
    const escaped = arg.replace(/'/g, "'\"'\"'");
    shellCommand += ` '${escaped}'`;
  }

  const result = spawnSync('tmux', [
    '-L', AGENT_SERVER,
    'new-session', '-d',
    '-s', sessionName,
    '-c', workingDir,
    'sh', '-c', shellCommand,
  ], { stdio: 'pipe' });

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString() : '';
    throw new Error(`tmux new-session failed: ${stderr}`);
  }
}

/** List all sessions on the upfyn server */
export function listSessions() {
  try {
    const output = execSync(
      `tmux -L ${AGENT_SERVER} list-sessions -F "#{session_name}\t#{session_activity}\t#{session_created}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    return output.trim().split('\n').filter(Boolean).map(line => {
      const [name, lastActivity, created] = line.split('\t');
      return {
        name,
        lastActivity: parseInt(lastActivity, 10) || 0,
        created: parseInt(created, 10) || 0,
      };
    });
  } catch {
    return [];
  }
}

/** Check if a specific session exists */
export function sessionExists(sessionName) {
  try {
    execSync(`tmux -L ${AGENT_SERVER} has-session -t ${sessionName}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Capture the last N lines of output from a session's pane */
export function capturePane(sessionName, lines = 50) {
  try {
    return execSync(
      `tmux -L ${AGENT_SERVER} capture-pane -t ${sessionName} -p -S -${lines}`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
  } catch {
    return '';
  }
}

/** Send keys to a session */
export function sendKeys(sessionName, keys) {
  try {
    execSync(
      `tmux -L ${AGENT_SERVER} send-keys -t ${sessionName} "${keys.replace(/"/g, '\\"')}" Enter`,
      { stdio: 'pipe' }
    );
  } catch {
    // Ignore errors
  }
}

/** Attach directly to an agent session (blocking) */
export function attachSession(sessionName) {
  spawnSync('tmux', ['-L', AGENT_SERVER, 'attach', '-t', sessionName], { stdio: 'inherit' });
}

/** Kill a session */
export function killSession(sessionName) {
  try {
    execSync(`tmux -L ${AGENT_SERVER} kill-session -t ${sessionName}`, { stdio: 'pipe' });
  } catch {
    // Ignore errors
  }
}

/** Parse task ID from session name (task-{id}--{project}--{slug}) */
export function parseTaskId(sessionName) {
  const m = sessionName.match(/^task-([^-]+)/);
  return m ? m[1] : null;
}

/** Parse project name from session name */
export function parseProjectName(sessionName) {
  const parts = sessionName.split('--');
  return parts.length > 1 ? parts[1] : null;
}

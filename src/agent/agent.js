import whichSync from 'which';
import { platform } from 'node:os';

const IS_WIN = platform() === 'win32';

/** Known coding agents */
const KNOWN_AGENTS = [
  { name: 'claude', command: 'claude', description: "Anthropic's Claude Code CLI", coAuthor: 'Claude <noreply@anthropic.com>' },
  { name: 'aider', command: 'aider', description: 'AI pair programming in your terminal', coAuthor: 'Aider <noreply@aider.chat>' },
  { name: 'codex', command: 'codex', description: "OpenAI's Codex CLI", coAuthor: 'Codex <noreply@openai.com>' },
  { name: 'gh-copilot', command: 'gh', description: 'GitHub Copilot CLI', coAuthor: 'GitHub Copilot <noreply@github.com>' },
  { name: 'opencode', command: 'opencode', description: 'AI-powered coding assistant', coAuthor: 'OpenCode <noreply@opencode.ai>' },
  { name: 'cline', command: 'cline', description: 'AI coding assistant for VS Code', coAuthor: 'Cline <noreply@cline.bot>' },
  { name: 'q', command: 'q', description: 'Amazon Q Developer CLI', coAuthor: 'Amazon Q <noreply@amazon.com>' },
];

/** Check if a command is available on the system */
function isAvailable(command) {
  try {
    whichSync.sync(command);
    return true;
  } catch {
    return false;
  }
}

/** Get list of known agents */
export function knownAgents() {
  return KNOWN_AGENTS.map(a => ({ ...a }));
}

/** Detect available agents */
export function detectAvailableAgents() {
  return KNOWN_AGENTS.filter(a => isAvailable(a.command)).map(a => ({ ...a }));
}

/** Get a specific agent by name */
export function getAgent(name) {
  return KNOWN_AGENTS.find(a => a.name === name) || null;
}

/** Find the default agent (first available in preference order) */
export function defaultAgent() {
  for (const agent of KNOWN_AGENTS) {
    if (isAvailable(agent.command)) return { ...agent };
  }
  return null;
}

/** Build interactive shell command for an agent with a prompt */
export function buildInteractiveCommand(agent, prompt) {
  if (IS_WIN) return buildWindowsCommand(agent, prompt);
  const escaped = prompt.replace(/'/g, "'\"'\"'");
  switch (agent.name) {
    case 'claude':    return `claude --dangerously-skip-permissions '${escaped}'`;
    case 'aider':     return `aider --message '${escaped}'`;
    case 'codex':     return `codex '${escaped}'`;
    case 'gh-copilot': return `gh copilot suggest '${escaped}'`;
    case 'opencode':  return `opencode '${escaped}'`;
    case 'cline':     return `cline '${escaped}'`;
    case 'q':         return `q chat '${escaped}'`;
    default:          return `${agent.command} '${escaped}'`;
  }
}

/** Build Windows-compatible command (cmd.exe safe, double-quote escaping) */
export function buildWindowsCommand(agent, prompt) {
  const escaped = prompt.replace(/"/g, '""');
  switch (agent.name) {
    case 'claude':    return `claude --dangerously-skip-permissions "${escaped}"`;
    case 'aider':     return `aider --message "${escaped}"`;
    case 'codex':     return `codex "${escaped}"`;
    case 'gh-copilot': return `gh copilot suggest "${escaped}"`;
    case 'opencode':  return `opencode "${escaped}"`;
    case 'cline':     return `cline "${escaped}"`;
    case 'q':         return `q chat "${escaped}"`;
    default:          return `${agent.command} "${escaped}"`;
  }
}

/** Build spawn args for an agent */
export function buildSpawnArgs(agent, prompt, taskId) {
  const args = [];
  switch (agent.name) {
    case 'claude':
      args.push('--session', taskId, prompt);
      break;
    case 'aider':
      args.push('--message', prompt);
      break;
    case 'gh-copilot':
      args.push('copilot', 'suggest', prompt);
      break;
    default:
      args.push(prompt);
  }
  return args;
}

/** Get status of all known agents */
export function allAgentStatus() {
  return KNOWN_AGENTS.map(agent => ({
    agent: { ...agent },
    available: isAvailable(agent.command),
  }));
}

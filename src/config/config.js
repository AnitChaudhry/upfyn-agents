import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import TOML from 'toml';

/** Get the upfyn-agents config directory */
function configBaseDir() {
  const p = platform();
  if (p === 'darwin') return join(homedir(), 'Library', 'Application Support', 'upfyn-agents');
  if (p === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'upfyn-agents');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'upfyn-agents');
}

/** Default theme colors */
const DEFAULT_THEME = {
  color_selected: '#ead49a',
  color_normal: '#5cfff7',
  color_dimmed: '#9C9991',
  color_text: '#f2ece6',
  color_accent: '#5cfff7',
  color_description: '#C4B0AC',
  color_column_header: '#a0d2fa',
  color_popup_border: '#9ffcf8',
  color_popup_header: '#69fae7',
};

/** Default worktree config */
const DEFAULT_WORKTREE = {
  enabled: true,
  auto_cleanup: true,
  base_branch: 'main',
};

/** Parse hex color string to {r, g, b} */
export function parseHex(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length !== 6) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

/** Load global config from config dir */
export function loadGlobalConfig() {
  const configPath = join(configBaseDir(), 'config.toml');
  const defaults = {
    default_agent: 'claude',
    worktree: { ...DEFAULT_WORKTREE },
    theme: { ...DEFAULT_THEME },
  };

  if (!existsSync(configPath)) return defaults;

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = TOML.parse(content);
    return {
      default_agent: parsed.default_agent || defaults.default_agent,
      worktree: { ...defaults.worktree, ...parsed.worktree },
      theme: { ...defaults.theme, ...parsed.theme },
    };
  } catch {
    return defaults;
  }
}

/** Save global config */
export function saveGlobalConfig(config) {
  const dir = configBaseDir();
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, 'config.toml');
  let out = `default_agent = "${config.default_agent}"\n\n[worktree]\n`;
  out += `enabled = ${config.worktree.enabled}\n`;
  out += `auto_cleanup = ${config.worktree.auto_cleanup}\n`;
  out += `base_branch = "${config.worktree.base_branch}"\n\n[theme]\n`;
  for (const [k, v] of Object.entries(config.theme)) {
    out += `${k} = "${v}"\n`;
  }
  writeFileSync(configPath, out);
}

/** Load project config from <project>/.upfyn/config.toml */
export function loadProjectConfig(projectPath) {
  const configPath = join(projectPath, '.upfyn', 'config.toml');
  const defaults = {
    default_agent: null,
    base_branch: null,
    github_url: null,
    copy_files: null,
    init_script: null,
  };

  if (!existsSync(configPath)) return defaults;

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = TOML.parse(content);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

/** Merge global + project config */
export function mergeConfig(global, project) {
  return {
    defaultAgent: project.default_agent || global.default_agent,
    worktreeEnabled: global.worktree.enabled,
    autoCleanup: global.worktree.auto_cleanup,
    baseBranch: project.base_branch || global.worktree.base_branch,
    githubUrl: project.github_url || null,
    theme: { ...global.theme },
    copyFiles: project.copy_files || null,
    initScript: project.init_script || null,
  };
}

/** Get the global config directory path */
export function getConfigDir() {
  return configBaseDir();
}

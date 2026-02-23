#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const VERSION = '2.1.0';

const PKG_DIR = path.resolve(__dirname, '..');
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const SL_DIR = path.join(CLAUDE_DIR, 'statusline');
const CONFIG_PATH = path.join(CLAUDE_DIR, 'statusline-config.json');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const SCRIPT_DEST = path.join(CLAUDE_DIR, 'statusline-command.sh');

const CLAUDE_MD_PATH = path.join(CLAUDE_DIR, 'CLAUDE.md');
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands');
const THEMES = ['default', 'nord', 'tokyo-night', 'catppuccin', 'gruvbox'];
const LAYOUTS = ['compact', 'standard', 'full'];
const SLS_COMMANDS = ['sls-theme', 'sls-layout', 'sls-preview', 'sls-config', 'sls-doctor', 'sls-help'];

// Marker for our managed section in CLAUDE.md
const CLAUDE_MD_START = '<!-- skill-statusline:start -->';
const CLAUDE_MD_END = '<!-- skill-statusline:end -->';

// Terminal colors
const R = '\x1b[0m';
const B = '\x1b[1m';
const D = '\x1b[2m';
const GRN = '\x1b[32m';
const YLW = '\x1b[33m';
const RED = '\x1b[31m';
const CYN = '\x1b[36m';
const WHT = '\x1b[97m';
const PURPLE = '\x1b[38;2;168;85;247m';
const PINK = '\x1b[38;2;236;72;153m';
const TEAL = '\x1b[38;2;6;182;212m';
const GRAY = '\x1b[38;2;90;90;99m';
const ORANGE = '\x1b[38;2;251;146;60m';

function log(msg) { console.log(msg); }
function success(msg) { log(`  ${GRAY}\u2502${R}  ${GRN}\u2713${R} ${msg}`); }
function warn(msg) { log(`  ${GRAY}\u2502${R}  ${YLW}\u26A0${R} ${msg}`); }
function fail(msg) { log(`  ${GRAY}\u2502${R}  ${RED}\u2717${R} ${msg}`); }
function info(msg) { log(`  ${GRAY}\u2502${R}  ${CYN}\u2139${R} ${msg}`); }
function bar(msg) { log(`  ${GRAY}\u2502${R}  ${D}${msg}${R}`); }
function blank() { log(`  ${GRAY}\u2502${R}`); }

function header() {
  log('');
  log(`  ${GRAY}\u250C${''.padEnd(58, '\u2500')}\u2510${R}`);
  log(`  ${GRAY}\u2502${R}                                                          ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2502${R}   ${PURPLE}${B}\u2588\u2588\u2588${R} ${PINK}${B}\u2588\u2588\u2588${R}  ${WHT}${B}skill-statusline${R}  ${D}v${VERSION}${R}          ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2502${R}   ${PURPLE}\u2588${R} ${PINK}\u2588${R} ${PURPLE}\u2588${R}  ${D}Rich statusline for Claude Code${R}           ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2502${R}   ${PURPLE}${B}\u2588\u2588\u2588${R} ${PINK}${B}\u2588\u2588\u2588${R}                                           ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2502${R}                                                          ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2502${R}   ${TEAL}Thinqmesh Technologies${R}                                ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2502${R}   ${GRAY}skills.thinqmesh.com${R}                              ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2502${R}                                                          ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u251C${''.padEnd(58, '\u2500')}\u2524${R}`);
}

function footer() {
  log(`  ${GRAY}\u2502${R}`);
  log(`  ${GRAY}\u2514${''.padEnd(58, '\u2500')}\u2518${R}`);
  log('');
}

function divider() {
  log(`  ${GRAY}\u251C${''.padEnd(58, '\u2500')}\u2524${R}`);
}

// ── Config helpers ──

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return { version: 2, theme: 'default', layout: 'standard', options: {} };
}

function writeConfig(config) {
  config.version = 2;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

// ── CLAUDE.md management ──
// Adds instructions to ~/.claude/CLAUDE.md so Claude Code knows to use ccsl
// instead of the built-in statusline-setup agent (which fails on Windows
// and conflicts with our setup).

const CLAUDE_MD_SECTION = `${CLAUDE_MD_START}
## Statusline — Managed by skill-statusline v2

The Claude Code statusline is fully configured and managed by the \`skill-statusline\` npm package. Do NOT use the built-in \`statusline-setup\` agent for any statusline configuration — it is not compatible with this setup.

### How It Works
- \`~/.claude/settings.json\` → points to \`bash ~/.claude/statusline-command.sh\`
- \`~/.claude/statusline-command.sh\` → entry point, delegates to v2 engine
- \`~/.claude/statusline/core.sh\` → v2 engine (themes, layouts, accurate context tracking)
- \`~/.claude/statusline-config.json\` → user preferences (theme, layout, options)

### When the user asks about statusline configuration, use these CLI commands:

| Action | Command |
|--------|---------|
| Change theme | \`ccsl theme set <name>\` |
| Change layout | \`ccsl layout set <name>\` |
| List themes | \`ccsl theme\` |
| List layouts | \`ccsl layout\` |
| Preview | \`ccsl preview\` |
| Preview with overrides | \`ccsl preview --theme <name> --layout <name>\` |
| Show config | \`ccsl config\` |
| Set config option | \`ccsl config set <key> <value>\` |
| Diagnostics | \`ccsl doctor\` |
| Update scripts | \`ccsl update\` |
| Reinstall | \`ccsl install\` |
| Uninstall | \`ccsl uninstall\` |

**Available themes:** default, nord, tokyo-night, catppuccin, gruvbox
**Available layouts:** compact (2 rows), standard (4 rows), full (6 rows)
**Config options:** compaction_warning_threshold, bar_width, cache_ttl_seconds, show_burn_rate, show_vim_mode, show_agent_name

### Slash Commands (installed in ~/.claude/commands/)

Users can also use these slash commands inside Claude Code:
- \`/sls-theme [name]\` — List or set theme
- \`/sls-layout [name]\` — List or set layout
- \`/sls-preview [theme] [layout]\` — Preview with sample data
- \`/sls-config [key] [value]\` — Show or set config options
- \`/sls-doctor\` — Run diagnostics
- \`/sls-help\` — Show all commands

### IMPORTANT
- NEVER spawn the \`statusline-setup\` agent — it will fail on Windows and conflict with this setup
- All statusline changes are made via \`ccsl\` CLI commands (run in terminal) or \`/sls-*\` slash commands
- Changes take effect on next Claude Code restart (or next statusline refresh for config changes)
${CLAUDE_MD_END}`;

function installClaudeMd() {
  let content = '';
  if (fs.existsSync(CLAUDE_MD_PATH)) {
    content = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
    // Remove existing section if present
    const startIdx = content.indexOf(CLAUDE_MD_START);
    const endIdx = content.indexOf(CLAUDE_MD_END);
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.substring(0, startIdx) + content.substring(endIdx + CLAUDE_MD_END.length);
      content = content.replace(/\n{3,}/g, '\n\n').trim();
    }
  }
  // Append our section
  content = content ? content + '\n\n' + CLAUDE_MD_SECTION + '\n' : CLAUDE_MD_SECTION + '\n';
  fs.writeFileSync(CLAUDE_MD_PATH, content);
}

function uninstallClaudeMd() {
  if (!fs.existsSync(CLAUDE_MD_PATH)) return false;
  let content = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  const startIdx = content.indexOf(CLAUDE_MD_START);
  const endIdx = content.indexOf(CLAUDE_MD_END);
  if (startIdx === -1 || endIdx === -1) return false;
  content = content.substring(0, startIdx) + content.substring(endIdx + CLAUDE_MD_END.length);
  content = content.replace(/\n{3,}/g, '\n\n').trim();
  if (content) {
    fs.writeFileSync(CLAUDE_MD_PATH, content + '\n');
  } else {
    // File is empty after removing our section — delete it
    fs.unlinkSync(CLAUDE_MD_PATH);
  }
  return true;
}

// ── Slash commands management ──

function installCommands() {
  ensureDir(COMMANDS_DIR);
  const cmdSrc = path.join(PKG_DIR, 'commands');
  if (!fs.existsSync(cmdSrc)) return 0;
  let count = 0;
  for (const cmd of SLS_COMMANDS) {
    const src = path.join(cmdSrc, `${cmd}.md`);
    const dest = path.join(COMMANDS_DIR, `${cmd}.md`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      count++;
    }
  }
  return count;
}

function uninstallCommands() {
  let count = 0;
  for (const cmd of SLS_COMMANDS) {
    const f = path.join(COMMANDS_DIR, `${cmd}.md`);
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      count++;
    }
  }
  // Remove commands dir if empty and we created it
  try {
    if (fs.existsSync(COMMANDS_DIR) && fs.readdirSync(COMMANDS_DIR).length === 0) {
      fs.rmdirSync(COMMANDS_DIR);
    }
  } catch (e) {}
  return count;
}

// ── File copy helpers ──

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function installFiles() {
  ensureDir(CLAUDE_DIR);
  ensureDir(SL_DIR);

  // Copy lib/ → ~/.claude/statusline/
  const libSrc = path.join(PKG_DIR, 'lib');
  if (fs.existsSync(libSrc)) {
    for (const f of fs.readdirSync(libSrc)) {
      fs.copyFileSync(path.join(libSrc, f), path.join(SL_DIR, f));
    }
  }

  // Copy themes/ → ~/.claude/statusline/themes/
  const themesSrc = path.join(PKG_DIR, 'themes');
  if (fs.existsSync(themesSrc)) {
    copyDir(themesSrc, path.join(SL_DIR, 'themes'));
  }

  // Copy layouts/ → ~/.claude/statusline/layouts/
  const layoutsSrc = path.join(PKG_DIR, 'layouts');
  if (fs.existsSync(layoutsSrc)) {
    copyDir(layoutsSrc, path.join(SL_DIR, 'layouts'));
  }

  // Copy entry point
  const slSrc = path.join(PKG_DIR, 'bin', 'statusline.sh');
  fs.copyFileSync(slSrc, SCRIPT_DEST);

  return true;
}

// ── Interactive prompt ──

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function chooseFromList(rl, label, items, current) {
  blank();
  info(`${B}${label}${R}`);
  blank();
  items.forEach((item, i) => {
    const marker = item === current ? ` ${GRN}(current)${R}` : '';
    log(`  ${GRAY}\u2502${R}     ${CYN}[${i + 1}]${R} ${item}${marker}`);
  });
  blank();
  const answer = await ask(rl, `  ${GRAY}\u2502${R}   > `);
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < items.length) return items[idx];
  return current || items[0];
}

// ── Commands ──

async function install() {
  const isQuick = args.includes('--quick');
  const config = readConfig();

  header();

  if (isQuick) {
    blank();
    info(`${B}Quick install${R} — using defaults`);
    blank();
  } else {
    // Interactive wizard
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const themeNames = ['Default (classic purple/pink/cyan)', 'Nord (arctic, blue-tinted)', 'Tokyo Night (vibrant neon)', 'Catppuccin (warm pastels)', 'Gruvbox (retro groovy)'];
    blank();
    info(`${B}Choose a theme:${R}`);
    blank();
    themeNames.forEach((name, i) => {
      log(`  ${GRAY}\u2502${R}     ${CYN}[${i + 1}]${R} ${name}`);
    });
    blank();
    const tAnswer = await ask(rl, `  ${GRAY}\u2502${R}   > `);
    const tIdx = parseInt(tAnswer, 10) - 1;
    if (tIdx >= 0 && tIdx < THEMES.length) config.theme = THEMES[tIdx];

    const layoutNames = ['Compact (2 rows \u2014 minimal)', 'Standard (4 rows \u2014 balanced)', 'Full (6 rows \u2014 everything)'];
    blank();
    info(`${B}Choose a layout:${R}`);
    blank();
    layoutNames.forEach((name, i) => {
      log(`  ${GRAY}\u2502${R}     ${CYN}[${i + 1}]${R} ${name}`);
    });
    blank();
    const lAnswer = await ask(rl, `  ${GRAY}\u2502${R}   > `);
    const lIdx = parseInt(lAnswer, 10) - 1;
    if (lIdx >= 0 && lIdx < LAYOUTS.length) config.layout = LAYOUTS[lIdx];

    rl.close();
    blank();
  }

  // Install files
  installFiles();
  success(`${B}statusline/${R} directory installed to ~/.claude/`);

  // Write config
  if (!config.options) config.options = {};
  writeConfig(config);
  success(`Config: theme=${CYN}${config.theme}${R}, layout=${CYN}${config.layout}${R}`);

  // Update settings.json
  const settings = readSettings();
  if (!settings.statusLine) {
    settings.statusLine = {
      type: 'command',
      command: 'bash ~/.claude/statusline-command.sh'
    };
    writeSettings(settings);
    success(`${B}statusLine${R} config added to settings.json`);
  } else {
    success(`statusLine already configured in settings.json`);
  }

  // Add CLAUDE.md instructions (prevents built-in statusline-setup agent)
  installClaudeMd();
  success(`CLAUDE.md updated (statusline agent redirect)`);

  // Install slash commands to ~/.claude/commands/
  const cmdCount = installCommands();
  if (cmdCount > 0) {
    success(`${B}${cmdCount} slash commands${R} installed (/sls-theme, /sls-layout, ...)`);
  }

  divider();
  blank();
  log(`  ${GRAY}\u2502${R}   ${GRN}${B}Ready.${R} Restart Claude Code to see the statusline.`);
  blank();
  log(`  ${GRAY}\u2502${R}   ${WHT}${B}Layout: ${config.layout}${R}  ${WHT}${B}Theme: ${config.theme}${R}`);
  blank();

  if (config.layout === 'compact') {
    log(`  ${GRAY}\u2502${R}    ${PURPLE}Opus 4.6${R}             ${GRAY}\u2502${R} ${TEAL}Downloads/Project${R}  ${GRAY}\u2502${R} ${WHT}47%${R} ${GRN}$1.23${R}`);
    log(`  ${GRAY}\u2502${R}    ${WHT}Context:${R} ${GRN}\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588${R}${D}\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591${R} 50%`);
  } else if (config.layout === 'full') {
    log(`  ${GRAY}\u2502${R}    ${PINK}Skill:${R} Edit               ${GRAY}\u2502${R}  ${WHT}GitHub:${R} User/Repo/main`);
    log(`  ${GRAY}\u2502${R}    ${PURPLE}Model:${R} Opus 4.6            ${GRAY}\u2502${R}  ${TEAL}Dir:${R} Downloads/Project`);
    log(`  ${GRAY}\u2502${R}    ${YLW}Window:${R} 8.5k + 1.2k       ${GRAY}\u2502${R}  ${GRN}Cost:${R} $1.23`);
    log(`  ${GRAY}\u2502${R}    ${YLW}Session:${R} ${D}25k + 12k${R}        ${GRAY}\u2502${R}  ${D}+156/-23  12m34s${R}`);
    log(`  ${GRAY}\u2502${R}    ${CYN}Cache:${R} ${D}W:5k R:2k${R}          ${GRAY}\u2502${R}  ${TEAL}NORMAL${R} ${CYN}@reviewer${R}`);
    log(`  ${GRAY}\u2502${R}    ${WHT}Context:${R} ${GRN}\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588${R}${D}\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591${R} 50%`);
  } else {
    log(`  ${GRAY}\u2502${R}    ${PINK}Skill:${R} Edit               ${GRAY}\u2502${R}  ${WHT}GitHub:${R} User/Repo/main`);
    log(`  ${GRAY}\u2502${R}    ${PURPLE}Model:${R} Opus 4.6            ${GRAY}\u2502${R}  ${TEAL}Dir:${R} Downloads/Project`);
    log(`  ${GRAY}\u2502${R}    ${YLW}Tokens:${R} 8.5k + 1.2k       ${GRAY}\u2502${R}  ${GRN}Cost:${R} $1.23`);
    log(`  ${GRAY}\u2502${R}    ${WHT}Context:${R} ${GRN}\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588${R}${D}\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591${R} 50%`);
  }

  blank();
  bar(`Script:    ${R}${CYN}~/.claude/statusline-command.sh${R}`);
  bar(`Engine:    ${R}${CYN}~/.claude/statusline/core.sh${R}`);
  bar(`Config:    ${R}${CYN}~/.claude/statusline-config.json${R}`);
  bar(`Settings:  ${R}${CYN}~/.claude/settings.json${R}`);
  blank();
  bar(`Docs     ${R}${TEAL}https://skills.thinqmesh.com${R}`);
  bar(`GitHub   ${R}${PURPLE}https://github.com/AnitChaudhry/skill-statusline${R}`);

  footer();
}

function uninstall() {
  header();
  blank();
  info(`${B}Uninstalling statusline${R}`);
  blank();

  // Remove statusline directory
  if (fs.existsSync(SL_DIR)) {
    fs.rmSync(SL_DIR, { recursive: true });
    success(`Removed ~/.claude/statusline/`);
  }

  // Remove script
  if (fs.existsSync(SCRIPT_DEST)) {
    fs.unlinkSync(SCRIPT_DEST);
    success(`Removed ~/.claude/statusline-command.sh`);
  } else {
    warn(`statusline-command.sh not found`);
  }

  // Remove config
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
    success(`Removed ~/.claude/statusline-config.json`);
  }

  // Remove from settings.json
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      if (settings.statusLine) {
        delete settings.statusLine;
        writeSettings(settings);
        success(`Removed statusLine from settings.json`);
      }
    } catch (e) {
      warn(`Could not parse settings.json`);
    }
  }

  // Remove CLAUDE.md section
  if (uninstallClaudeMd()) {
    success(`Removed statusline section from CLAUDE.md`);
  }

  // Remove slash commands
  const cmdRemoved = uninstallCommands();
  if (cmdRemoved > 0) {
    success(`Removed ${cmdRemoved} slash commands`);
  }

  blank();
  log(`  ${GRAY}\u2502${R}   ${GRN}${B}Done.${R} Restart Claude Code to apply.`);

  footer();
}

function update() {
  header();
  blank();
  info(`${B}Updating statusline scripts${R} (preserving config)`);
  blank();

  installFiles();
  success(`Scripts updated to v${VERSION}`);

  const config = readConfig();
  success(`Config preserved: theme=${CYN}${config.theme}${R}, layout=${CYN}${config.layout}${R}`);

  // Refresh CLAUDE.md instructions
  installClaudeMd();
  success(`CLAUDE.md refreshed`);

  // Refresh slash commands
  const cmdCount = installCommands();
  if (cmdCount > 0) {
    success(`${cmdCount} slash commands refreshed`);
  }

  blank();
  log(`  ${GRAY}\u2502${R}   ${GRN}${B}Done.${R} Restart Claude Code to apply.`);

  footer();
}

function preview() {
  const themeName = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : null;
  const layoutName = args.includes('--layout') ? args[args.indexOf('--layout') + 1] : null;

  const sampleJson = JSON.stringify({
    cwd: process.cwd(),
    session_id: 'preview-session',
    version: '2.0.0',
    model: { id: 'claude-opus-4-6', display_name: 'Opus' },
    workspace: { current_dir: process.cwd(), project_dir: process.cwd() },
    cost: { total_cost_usd: 1.23, total_duration_ms: 754000, total_api_duration_ms: 23400, total_lines_added: 156, total_lines_removed: 23 },
    context_window: {
      total_input_tokens: 125234, total_output_tokens: 34521,
      context_window_size: 200000, used_percentage: 47, remaining_percentage: 53,
      current_usage: { input_tokens: 85000, output_tokens: 12000, cache_creation_input_tokens: 5000, cache_read_input_tokens: 2000 }
    },
    vim: { mode: 'NORMAL' },
    agent: { name: 'code-reviewer' }
  });

  // Check if v2 engine is installed
  const coreFile = path.join(SL_DIR, 'core.sh');
  let scriptPath;
  if (fs.existsSync(coreFile)) {
    scriptPath = coreFile;
  } else if (fs.existsSync(SCRIPT_DEST)) {
    scriptPath = SCRIPT_DEST;
  } else {
    // Use the package's own script
    scriptPath = path.join(PKG_DIR, 'lib', 'core.sh');
  }

  const env = { ...process.env };
  if (themeName) env.STATUSLINE_THEME_OVERRIDE = themeName;
  if (layoutName) env.STATUSLINE_LAYOUT_OVERRIDE = layoutName;

  // For preview with package's own files, set STATUSLINE_DIR
  if (!fs.existsSync(path.join(SL_DIR, 'core.sh'))) {
    // Point to package's own lib directory structure
    env.HOME = PKG_DIR;
  }

  try {
    const escaped = sampleJson.replace(/'/g, "'\\''");
    const result = execSync(`printf '%s' '${escaped}' | bash "${scriptPath.replace(/\\/g, '/')}"`, {
      encoding: 'utf8',
      env,
      timeout: 5000
    });
    log('');
    log(result);
    log('');
  } catch (e) {
    warn(`Preview failed: ${e.message}`);
  }
}

function themeCmd() {
  const config = readConfig();

  if (subcommand === 'set') {
    const name = args[2];
    if (!name || !THEMES.includes(name)) {
      header();
      blank();
      fail(`Unknown theme: ${name || '(none)'}`);
      blank();
      info(`Available: ${THEMES.join(', ')}`);
      footer();
      process.exit(1);
    }
    config.theme = name;
    writeConfig(config);
    header();
    blank();
    success(`Theme set to ${CYN}${B}${name}${R}`);
    blank();
    log(`  ${GRAY}\u2502${R}   Restart Claude Code to apply.`);
    footer();
    return;
  }

  // List themes
  header();
  blank();
  info(`${B}Themes${R}`);
  blank();
  THEMES.forEach(t => {
    const marker = t === config.theme ? ` ${GRN}\u2190 current${R}` : '';
    log(`  ${GRAY}\u2502${R}     ${CYN}${t}${R}${marker}`);
  });
  blank();
  bar(`Set theme: ${R}${CYN}ccsl theme set <name>${R}`);
  bar(`Preview:   ${R}${CYN}ccsl preview --theme <name>${R}`);
  footer();
}

function layoutCmd() {
  const config = readConfig();

  if (subcommand === 'set') {
    const name = args[2];
    if (!name || !LAYOUTS.includes(name)) {
      header();
      blank();
      fail(`Unknown layout: ${name || '(none)'}`);
      blank();
      info(`Available: ${LAYOUTS.join(', ')}`);
      footer();
      process.exit(1);
    }
    config.layout = name;
    writeConfig(config);
    header();
    blank();
    success(`Layout set to ${CYN}${B}${name}${R}`);
    blank();
    log(`  ${GRAY}\u2502${R}   Restart Claude Code to apply.`);
    footer();
    return;
  }

  // List layouts
  header();
  blank();
  info(`${B}Layouts${R}`);
  blank();
  const descriptions = { compact: '2 rows \u2014 minimal', standard: '4 rows \u2014 balanced', full: '6 rows \u2014 everything' };
  LAYOUTS.forEach(l => {
    const marker = l === config.layout ? ` ${GRN}\u2190 current${R}` : '';
    log(`  ${GRAY}\u2502${R}     ${CYN}${l}${R} ${D}(${descriptions[l]})${R}${marker}`);
  });
  blank();
  bar(`Set layout: ${R}${CYN}ccsl layout set <name>${R}`);
  bar(`Preview:    ${R}${CYN}ccsl preview --layout <name>${R}`);
  footer();
}

function configCmd() {
  const config = readConfig();

  if (subcommand === 'set') {
    const key = args[2];
    const value = args[3];
    if (!key || value === undefined) {
      header();
      blank();
      fail(`Usage: ccsl config set <key> <value>`);
      blank();
      info(`Keys: compaction_warning_threshold, bar_width, cache_ttl_seconds,`);
      info(`      show_burn_rate, show_vim_mode, show_agent_name`);
      footer();
      process.exit(1);
    }
    if (!config.options) config.options = {};
    // Parse booleans and numbers
    if (value === 'true') config.options[key] = true;
    else if (value === 'false') config.options[key] = false;
    else if (!isNaN(value)) config.options[key] = Number(value);
    else config.options[key] = value;

    writeConfig(config);
    header();
    blank();
    success(`Set ${CYN}${key}${R} = ${CYN}${value}${R}`);
    footer();
    return;
  }

  // Show config
  header();
  blank();
  info(`${B}Current configuration${R}`);
  blank();
  log(`  ${GRAY}\u2502${R}     ${WHT}Theme:${R}   ${CYN}${config.theme}${R}`);
  log(`  ${GRAY}\u2502${R}     ${WHT}Layout:${R}  ${CYN}${config.layout}${R}`);
  if (config.options && Object.keys(config.options).length > 0) {
    blank();
    info(`${B}Options${R}`);
    blank();
    for (const [k, v] of Object.entries(config.options)) {
      log(`  ${GRAY}\u2502${R}     ${D}${k}:${R} ${CYN}${v}${R}`);
    }
  }
  blank();
  bar(`File: ${R}${CYN}~/.claude/statusline-config.json${R}`);
  footer();
}

function doctor() {
  header();
  blank();
  info(`${B}Diagnostic check${R}`);
  blank();

  let issues = 0;

  // 1. Bash
  try {
    const bashVer = execSync('bash --version 2>&1', { encoding: 'utf8' }).split('\n')[0];
    success(`bash: ${D}${bashVer.substring(0, 60)}${R}`);
  } catch (e) {
    fail(`bash not found`);
    issues++;
  }

  // 2. Git
  try {
    execSync('git --version', { encoding: 'utf8' });
    success(`git available`);
  } catch (e) {
    warn(`git not found (GitHub field will show "no-git")`);
  }

  // 3. settings.json
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      if (settings.statusLine && settings.statusLine.command) {
        success(`settings.json has statusLine config`);
      } else {
        fail(`settings.json missing statusLine entry`);
        issues++;
      }
    } catch (e) {
      fail(`settings.json is invalid JSON`);
      issues++;
    }
  } else {
    fail(`~/.claude/settings.json not found`);
    issues++;
  }

  // 4. Entry point script
  if (fs.existsSync(SCRIPT_DEST)) {
    success(`statusline-command.sh exists`);
  } else {
    fail(`~/.claude/statusline-command.sh not found`);
    issues++;
  }

  // 5. v2 engine
  const coreFile = path.join(SL_DIR, 'core.sh');
  if (fs.existsSync(coreFile)) {
    success(`v2 engine installed (statusline/core.sh)`);

    // Check theme file
    const config = readConfig();
    const themeFile = path.join(SL_DIR, 'themes', `${config.theme}.sh`);
    if (fs.existsSync(themeFile)) {
      success(`Theme "${config.theme}" found`);
    } else {
      fail(`Theme "${config.theme}" not found at ${themeFile}`);
      issues++;
    }

    // Check layout file
    const layoutFile = path.join(SL_DIR, 'layouts', `${config.layout}.sh`);
    if (fs.existsSync(layoutFile)) {
      success(`Layout "${config.layout}" found`);
    } else {
      fail(`Layout "${config.layout}" not found at ${layoutFile}`);
      issues++;
    }
  } else {
    warn(`v2 engine not installed (running v1 fallback)`);
  }

  // 6. CLAUDE.md agent redirect
  if (fs.existsSync(CLAUDE_MD_PATH)) {
    const mdContent = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
    if (mdContent.includes(CLAUDE_MD_START)) {
      success(`CLAUDE.md has statusline agent redirect`);
    } else {
      warn(`CLAUDE.md exists but missing statusline section`);
      info(`Run ${CYN}ccsl install${R} or ${CYN}ccsl update${R} to add it`);
    }
  } else {
    warn(`No ~/.claude/CLAUDE.md (built-in statusline agent may interfere)`);
    info(`Run ${CYN}ccsl install${R} or ${CYN}ccsl update${R} to fix`);
  }

  // 7. Slash commands
  if (fs.existsSync(COMMANDS_DIR)) {
    const installed = SLS_COMMANDS.filter(c => fs.existsSync(path.join(COMMANDS_DIR, `${c}.md`)));
    if (installed.length === SLS_COMMANDS.length) {
      success(`All ${SLS_COMMANDS.length} slash commands installed`);
    } else if (installed.length > 0) {
      warn(`${installed.length}/${SLS_COMMANDS.length} slash commands installed`);
      info(`Run ${CYN}ccsl update${R} to install missing commands`);
    } else {
      warn(`No slash commands found in ~/.claude/commands/`);
      info(`Run ${CYN}ccsl install${R} or ${CYN}ccsl update${R} to add them`);
    }
  } else {
    warn(`~/.claude/commands/ not found (slash commands not installed)`);
    info(`Run ${CYN}ccsl install${R} or ${CYN}ccsl update${R} to add them`);
  }

  // 8. Config file
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      success(`statusline-config.json is valid`);
    } catch (e) {
      fail(`statusline-config.json is invalid JSON`);
      issues++;
    }
  } else {
    warn(`No config file (using defaults)`);
  }

  // 9. Performance benchmark
  blank();
  info(`${B}Performance benchmark${R}`);
  blank();
  try {
    const sampleJson = '{"model":{"id":"claude-opus-4-6","display_name":"Opus"},"workspace":{"current_dir":"/tmp"},"cost":{"total_cost_usd":0.5},"context_window":{"context_window_size":200000,"used_percentage":50,"current_usage":{"input_tokens":90000,"output_tokens":10000,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}';
    const target = fs.existsSync(coreFile) ? coreFile : SCRIPT_DEST;
    if (target && fs.existsSync(target)) {
      const start = Date.now();
      execSync(`printf '%s' '${sampleJson}' | bash "${target.replace(/\\/g, '/')}"`, {
        encoding: 'utf8',
        timeout: 10000
      });
      const elapsed = Date.now() - start;
      const color = elapsed < 50 ? GRN : elapsed < 100 ? YLW : RED;
      const label = elapsed < 50 ? 'excellent' : elapsed < 100 ? 'good' : 'slow';
      log(`  ${GRAY}\u2502${R}  ${color}\u25CF${R} Execution: ${color}${B}${elapsed}ms${R} (${label}, target: <50ms)`);
    }
  } catch (e) {
    fail(`Benchmark failed: ${e.message.substring(0, 50)}`);
    issues++;
  }

  blank();
  if (issues === 0) {
    log(`  ${GRAY}\u2502${R}   ${GRN}${B}All checks passed.${R}`);
  } else {
    log(`  ${GRAY}\u2502${R}   ${RED}${B}${issues} issue(s) found.${R} Run ${CYN}ccsl install${R} to fix.`);
  }

  footer();
}

function showVersion() {
  log(`skill-statusline v${VERSION}`);
}

function showHelp() {
  header();
  blank();
  log(`  ${GRAY}\u2502${R}   ${WHT}${B}Commands:${R}`);
  blank();
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl install${R}            Install with theme/layout wizard`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl install --quick${R}    Install with defaults`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl uninstall${R}          Remove statusline`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl update${R}             Update scripts (keep config)`);
  blank();
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl theme${R}              List themes`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl theme set <name>${R}   Set active theme`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl layout${R}             List layouts`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl layout set <name>${R}  Set active layout`);
  blank();
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl preview${R}            Preview with sample data`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl preview --theme x${R}  Preview a specific theme`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl preview --layout x${R} Preview a specific layout`);
  blank();
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl config${R}             Show current config`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl config set k v${R}     Set config option`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl doctor${R}             Run diagnostics`);
  log(`  ${GRAY}\u2502${R}      ${CYN}ccsl version${R}            Show version`);
  blank();
  log(`  ${GRAY}\u2502${R}   ${WHT}${B}Slash Commands${R} ${D}(inside Claude Code):${R}`);
  blank();
  log(`  ${GRAY}\u2502${R}      ${PINK}/sls-theme${R}              List or set theme`);
  log(`  ${GRAY}\u2502${R}      ${PINK}/sls-layout${R}             List or set layout`);
  log(`  ${GRAY}\u2502${R}      ${PINK}/sls-preview${R}            Preview with sample data`);
  log(`  ${GRAY}\u2502${R}      ${PINK}/sls-config${R}             Show or set config options`);
  log(`  ${GRAY}\u2502${R}      ${PINK}/sls-doctor${R}             Run diagnostics`);
  log(`  ${GRAY}\u2502${R}      ${PINK}/sls-help${R}               Show all commands`);
  blank();
  log(`  ${GRAY}\u2502${R}   ${WHT}${B}Themes:${R} ${THEMES.join(', ')}`);
  log(`  ${GRAY}\u2502${R}   ${WHT}${B}Layouts:${R} ${LAYOUTS.join(', ')}`);
  blank();
  log(`  ${GRAY}\u2502${R}   ${WHT}${B}What it shows:${R}`);
  blank();
  log(`  ${GRAY}\u2502${R}      ${PINK}Skill${R}      Last tool used (Read, Write, Terminal, Agent...)`);
  log(`  ${GRAY}\u2502${R}      ${PURPLE}Model${R}      Active model name and version`);
  log(`  ${GRAY}\u2502${R}      ${WHT}GitHub${R}     user/repo/branch with dirty indicators`);
  log(`  ${GRAY}\u2502${R}      ${TEAL}Dir${R}        Last 3 segments of working directory`);
  log(`  ${GRAY}\u2502${R}      ${YLW}Tokens${R}     Current window: input + output`);
  log(`  ${GRAY}\u2502${R}      ${GRN}Cost${R}       Session cost in USD`);
  log(`  ${GRAY}\u2502${R}      ${WHT}Context${R}    Accurate progress bar with compaction warning`);
  log(`  ${GRAY}\u2502${R}      ${D}+ Session tokens, duration, lines, cache, vim, agent (full layout)${R}`);
  blank();
  bar(`Docs     ${R}${TEAL}https://skills.thinqmesh.com${R}`);
  bar(`GitHub   ${R}${PURPLE}https://github.com/AnitChaudhry/skill-statusline${R}`);

  footer();
}

// ── Main ──

if (command === 'install' || command === 'init') {
  install();
} else if (command === 'uninstall' || command === 'remove') {
  uninstall();
} else if (command === 'update' || command === 'upgrade') {
  update();
} else if (command === 'preview') {
  preview();
} else if (command === 'theme') {
  themeCmd();
} else if (command === 'layout') {
  layoutCmd();
} else if (command === 'config') {
  configCmd();
} else if (command === 'doctor' || command === 'check') {
  doctor();
} else if (command === 'version' || command === '--version' || command === '-v') {
  showVersion();
} else if (command === 'help' || command === '--help' || command === '-h') {
  showHelp();
} else {
  if (command) {
    log('');
    warn(`Unknown command: ${command}`);
  }
  showHelp();
}

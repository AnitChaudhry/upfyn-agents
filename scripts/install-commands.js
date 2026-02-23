#!/usr/bin/env node
/**
 * Upfyn-Code — Slash Command Installer
 *
 * Copies slash command .md files to ~/.claude/commands/
 * so they become available as /upfynai-* inside Claude Code CLI.
 *
 * Run manually: node scripts/install-commands.js
 * Or via CLI:   uc install-commands
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS_SOURCE = path.join(__dirname, '..', 'commands');
const COMMANDS_DEST = path.join(os.homedir(), '.claude', 'commands');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
};

function main() {
  console.log(`\n${colors.bright}Upfyn-Code — Installing Slash Commands${colors.reset}\n`);

  // Ensure ~/.claude/commands/ exists
  if (!fs.existsSync(COMMANDS_DEST)) {
    fs.mkdirSync(COMMANDS_DEST, { recursive: true });
    console.log(`${colors.green}✅${colors.reset} Created ${colors.dim}${COMMANDS_DEST}${colors.reset}`);
  }

  // Read all .md files from commands source
  if (!fs.existsSync(COMMANDS_SOURCE)) {
    console.error(`${colors.yellow}⚠️${colors.reset}  Commands source not found: ${COMMANDS_SOURCE}`);
    process.exit(1);
  }

  const files = fs.readdirSync(COMMANDS_SOURCE).filter(f => f.endsWith('.md'));

  if (files.length === 0) {
    console.log(`${colors.yellow}⚠️${colors.reset}  No command files found in ${COMMANDS_SOURCE}`);
    process.exit(1);
  }

  let installed = 0;
  let updated = 0;

  for (const file of files) {
    const src = path.join(COMMANDS_SOURCE, file);
    const dest = path.join(COMMANDS_DEST, file);

    const existed = fs.existsSync(dest);
    fs.copyFileSync(src, dest);

    if (existed) {
      updated++;
      console.log(`${colors.cyan}🔄${colors.reset} Updated  /${file.replace('.md', '')}`);
    } else {
      installed++;
      console.log(`${colors.green}✅${colors.reset} Installed /${file.replace('.md', '')}`);
    }
  }

  console.log(`\n${colors.bright}Done!${colors.reset} ${installed} installed, ${updated} updated`);
  console.log(`${colors.dim}Commands are now available in Claude Code CLI${colors.reset}`);
  console.log(`${colors.dim}Try: /upfynai to start the web UI${colors.reset}\n`);
}

main();

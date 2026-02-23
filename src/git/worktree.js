import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

const UPFYN_DIR = '.upfyn';
const WORKTREES_DIR = 'worktrees';

/** Detect main branch (main or master) */
function detectMainBranch(projectPath) {
  try {
    execSync('git rev-parse --verify main', { cwd: projectPath, stdio: 'pipe' });
    return 'main';
  } catch {
    try {
      execSync('git rev-parse --verify master', { cwd: projectPath, stdio: 'pipe' });
      return 'master';
    } catch {
      return execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
    }
  }
}

/** Create a new git worktree for a task */
export function createWorktree(projectPath, taskSlug) {
  const wtPath = join(projectPath, UPFYN_DIR, WORKTREES_DIR, taskSlug);

  // If worktree already exists and is valid, return it
  if (existsSync(wtPath) && existsSync(join(wtPath, '.git'))) {
    return wtPath;
  }

  // Clean up partial worktree
  if (existsSync(wtPath)) {
    rmSync(wtPath, { recursive: true, force: true });
  }

  // Ensure parent directory exists
  const parent = dirname(wtPath);
  mkdirSync(parent, { recursive: true });

  const mainBranch = detectMainBranch(projectPath);
  const branchName = `task/${taskSlug}`;

  // Delete branch if it exists from previous failed attempt
  try {
    execSync(`git branch -D ${branchName}`, { cwd: projectPath, stdio: 'pipe' });
  } catch {
    // Ignore
  }

  execSync(
    `git worktree add "${wtPath}" -b ${branchName} ${mainBranch}`,
    { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
  );

  return wtPath;
}

/**
 * Initialize a worktree by copying files and running init script.
 * Returns array of warning messages.
 */
export function initializeWorktree(projectPath, worktreePath, copyFiles, initScript) {
  const warnings = [];

  if (copyFiles) {
    for (let entry of copyFiles.split(',')) {
      const fileName = entry.trim();
      if (!fileName) continue;
      const src = join(projectPath, fileName);
      const dst = join(worktreePath, fileName);

      const dstDir = dirname(dst);
      if (!existsSync(dstDir)) {
        try {
          mkdirSync(dstDir, { recursive: true });
        } catch (e) {
          warnings.push(`Failed to create directory for '${fileName}': ${e.message}`);
          continue;
        }
      }

      if (!existsSync(src)) {
        warnings.push(`copy_files: '${fileName}' not found in project root, skipping`);
        continue;
      }

      try {
        if (statSync(src).isDirectory()) {
          warnings.push(`copy_files: '${fileName}' is a directory, only individual files are supported`);
          continue;
        }
      } catch {
        // Ignore stat errors
      }

      try {
        copyFileSync(src, dst);
      } catch (e) {
        warnings.push(`Failed to copy '${fileName}' to worktree: ${e.message}`);
      }
    }
  }

  if (initScript && initScript.trim()) {
    try {
      execSync(initScript.trim(), {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
        shell: true,
      });
    } catch (e) {
      warnings.push(`init_script failed: ${e.message}`);
    }
  }

  return warnings;
}

/** Remove a git worktree */
export function removeWorktree(projectPath, taskSlug) {
  const wtPath = join(projectPath, UPFYN_DIR, WORKTREES_DIR, taskSlug);
  try {
    execSync(`git worktree remove "${wtPath}" --force`, { cwd: projectPath, stdio: 'pipe' });
  } catch {
    try {
      execSync('git worktree prune', { cwd: projectPath, stdio: 'pipe' });
    } catch {
      // Ignore
    }
  }
}

/** Get the worktree path for a task */
export function worktreePath(projectPath, taskSlug) {
  return join(projectPath, UPFYN_DIR, WORKTREES_DIR, taskSlug);
}

/** Check if a worktree exists */
export function worktreeExists(projectPath, taskSlug) {
  return existsSync(worktreePath(projectPath, taskSlug));
}

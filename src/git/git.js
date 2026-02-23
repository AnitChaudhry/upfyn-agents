import { execSync } from 'node:child_process';

/** Check if a path is inside a git repository */
export function isGitRepo(path) {
  try {
    execSync('git rev-parse --git-dir', { cwd: path, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Get the root directory of the git repository */
export function repoRoot(path) {
  return execSync('git rev-parse --show-toplevel', { cwd: path, encoding: 'utf-8' }).trim();
}

/** Get current branch name */
export function currentBranch(path) {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd: path, encoding: 'utf-8' }).trim();
}

/** Get diff stat between two branches */
export function diffStat(path, base, target) {
  return execSync(`git diff ${base} ${target} --stat`, { cwd: path, encoding: 'utf-8' });
}

/** Get full diff between two branches */
export function diffFull(path, base, target) {
  return execSync(`git diff ${base} ${target}`, { cwd: path, encoding: 'utf-8' });
}

/** Merge a branch into current branch */
export function mergeBranch(path, branch, message) {
  execSync(`git merge ${branch} --no-ff -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: path,
    encoding: 'utf-8',
  });
}

/** Delete a branch */
export function deleteBranch(path, branch, force = false) {
  const flag = force ? '-D' : '-d';
  try {
    execSync(`git branch ${flag} ${branch}`, { cwd: path, stdio: 'pipe' });
  } catch {
    // Ignore errors
  }
}

import { execSync } from 'node:child_process';

/** Pull request states */
export const PullRequestState = {
  Open: 'open',
  Merged: 'merged',
  Closed: 'closed',
  Unknown: 'unknown',
};

/** Get the state of a pull request via gh CLI */
export function getPrState(projectPath, prNumber) {
  try {
    const output = execSync(
      `gh pr view ${prNumber} --json state`,
      { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
    );
    const data = JSON.parse(output);
    const state = (data.state || '').toUpperCase();
    if (state === 'MERGED') return PullRequestState.Merged;
    if (state === 'CLOSED') return PullRequestState.Closed;
    if (state === 'OPEN') return PullRequestState.Open;
    return PullRequestState.Unknown;
  } catch {
    return PullRequestState.Unknown;
  }
}

/**
 * Create a pull request via gh CLI.
 * @returns {{ prNumber: number, prUrl: string }}
 */
export function createPr(projectPath, title, body, headBranch) {
  const output = execSync(
    `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --head ${headBranch}`,
    { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
  );

  const prUrl = output.trim();
  const parts = prUrl.split('/');
  const prNumber = parseInt(parts[parts.length - 1], 10) || 0;

  return { prNumber, prUrl };
}

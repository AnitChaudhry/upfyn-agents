import { randomUUID } from 'node:crypto';

/** Task status enum values */
export const TaskStatus = {
  Backlog: 'backlog',
  Planning: 'planning',
  Running: 'running',
  Review: 'review',
  Done: 'done',
};

/** Ordered list of columns */
export const COLUMNS = [
  TaskStatus.Backlog,
  TaskStatus.Planning,
  TaskStatus.Running,
  TaskStatus.Review,
  TaskStatus.Done,
];

/** Create a new Task object */
export function createTask(title, agent, projectId) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title,
    description: null,
    status: TaskStatus.Backlog,
    agent,
    projectId,
    sessionName: null,
    worktreePath: null,
    branchName: null,
    prNumber: null,
    prUrl: null,
    canvasX: 0,
    canvasY: 0,
    htmlContent: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate tmux session name: task-{id8}--{project}--{slug}
 */
export function generateSessionName(task, projectName) {
  const slug = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return `task-${task.id.slice(0, 8)}--${projectName}--${slug}`;
}

/** Create a new Project object */
export function createProject(name, path) {
  return {
    id: randomUUID(),
    name,
    path,
    githubUrl: null,
    defaultAgent: null,
    lastOpened: new Date().toISOString(),
  };
}

/** Create a new TaskConnection object */
export function createConnection(fromTaskId, toTaskId, label = '') {
  return {
    id: randomUUID(),
    fromTaskId,
    toTaskId,
    label,
  };
}

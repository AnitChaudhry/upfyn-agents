import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir, platform } from 'node:os';

/** Get the upfyn-agents config directory (platform-specific) */
function configDir() {
  const p = platform();
  if (p === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'upfyn-agents');
  }
  if (p === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'upfyn-agents');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'upfyn-agents');
}

/** Create a stable hash from a path string */
function hashPath(pathStr) {
  return createHash('md5').update(pathStr).digest('hex').slice(0, 16);
}

/** Ensure a directory exists */
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Open or create a project database (stored centrally in config dir).
 * @param {string} projectPath - Absolute path to the project
 * @returns {import('better-sqlite3').Database}
 */
export function openProjectDb(projectPath) {
  const projDir = join(configDir(), 'projects');
  ensureDir(projDir);
  const pathHash = hashPath(projectPath);
  const dbPath = join(projDir, `${pathHash}.db`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initProjectSchema(db);
  return db;
}

/**
 * Open or create the global index database.
 * @returns {import('better-sqlite3').Database}
 */
export function openGlobalDb() {
  const dir = configDir();
  ensureDir(dir);
  const dbPath = join(dir, 'index.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initGlobalSchema(db);
  return db;
}

function initProjectSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      agent TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_name TEXT,
      worktree_path TEXT,
      branch_name TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      canvas_x REAL DEFAULT 0.0,
      canvas_y REAL DEFAULT 0.0,
      html_content TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

    CREATE TABLE IF NOT EXISTS task_connections (
      id TEXT PRIMARY KEY,
      from_task_id TEXT NOT NULL,
      to_task_id TEXT NOT NULL,
      label TEXT DEFAULT '',
      FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_conn_from ON task_connections(from_task_id);
    CREATE INDEX IF NOT EXISTS idx_conn_to ON task_connections(to_task_id);
  `);
}

function initGlobalSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      github_url TEXT,
      default_agent TEXT,
      last_opened TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS running_agents (
      session_name TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_running_project ON running_agents(project_id);
  `);
}

// === Task CRUD ===

export function insertTask(db, task) {
  db.prepare(`
    INSERT INTO tasks (id, title, description, status, agent, project_id,
      session_name, worktree_path, branch_name, pr_number, pr_url,
      canvas_x, canvas_y, html_content, created_at, updated_at)
    VALUES (@id, @title, @description, @status, @agent, @projectId,
      @sessionName, @worktreePath, @branchName, @prNumber, @prUrl,
      @canvasX, @canvasY, @htmlContent, @createdAt, @updatedAt)
  `).run(task);
}

export function updateTask(db, task) {
  db.prepare(`
    UPDATE tasks SET
      title = @title, description = @description, status = @status,
      agent = @agent, session_name = @sessionName,
      worktree_path = @worktreePath, branch_name = @branchName,
      pr_number = @prNumber, pr_url = @prUrl,
      canvas_x = @canvasX, canvas_y = @canvasY,
      html_content = @htmlContent, updated_at = @updatedAt
    WHERE id = @id
  `).run(task);
}

export function deleteTask(db, taskId) {
  db.prepare('DELETE FROM task_connections WHERE from_task_id = ? OR to_task_id = ?').run(taskId, taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    agent: row.agent,
    projectId: row.project_id,
    sessionName: row.session_name,
    worktreePath: row.worktree_path,
    branchName: row.branch_name,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    canvasX: row.canvas_x ?? 0,
    canvasY: row.canvas_y ?? 0,
    htmlContent: row.html_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTask(db, taskId) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  return row ? rowToTask(row) : null;
}

export function getTasksByStatus(db, status) {
  return db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at')
    .all(status).map(rowToTask);
}

export function getAllTasks(db) {
  return db.prepare('SELECT * FROM tasks ORDER BY created_at').all().map(rowToTask);
}

// === Project CRUD ===

export function upsertProject(db, project) {
  db.prepare(`
    INSERT INTO projects (id, name, path, github_url, default_agent, last_opened)
    VALUES (@id, @name, @path, @githubUrl, @defaultAgent, @lastOpened)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      github_url = excluded.github_url,
      default_agent = excluded.default_agent,
      last_opened = excluded.last_opened
  `).run(project);
}

export function getAllProjects(db) {
  return db.prepare('SELECT * FROM projects ORDER BY last_opened DESC').all().map(row => ({
    id: row.id,
    name: row.name,
    path: row.path,
    githubUrl: row.github_url,
    defaultAgent: row.default_agent,
    lastOpened: row.last_opened,
  }));
}

// === Connection CRUD ===

export function insertConnection(db, conn) {
  db.prepare(
    'INSERT INTO task_connections (id, from_task_id, to_task_id, label) VALUES (@id, @fromTaskId, @toTaskId, @label)'
  ).run(conn);
}

export function deleteConnection(db, connectionId) {
  db.prepare('DELETE FROM task_connections WHERE id = ?').run(connectionId);
}

export function getAllConnections(db) {
  return db.prepare('SELECT id, from_task_id, to_task_id, label FROM task_connections').all().map(row => ({
    id: row.id,
    fromTaskId: row.from_task_id,
    toTaskId: row.to_task_id,
    label: row.label,
  }));
}

export function getConnectionsForTask(db, taskId) {
  return db.prepare(
    'SELECT id, from_task_id, to_task_id, label FROM task_connections WHERE from_task_id = ? OR to_task_id = ?'
  ).all(taskId, taskId).map(row => ({
    id: row.id,
    fromTaskId: row.from_task_id,
    toTaskId: row.to_task_id,
    label: row.label,
  }));
}

export function updateTaskPosition(db, taskId, x, y) {
  db.prepare('UPDATE tasks SET canvas_x = ?, canvas_y = ? WHERE id = ?').run(x, y, taskId);
}

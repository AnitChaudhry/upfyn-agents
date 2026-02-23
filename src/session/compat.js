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

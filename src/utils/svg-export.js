import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { COLUMNS } from '../db/models.js';
import { NODE_WIDTH, NODE_HEIGHT, edgeAnchor } from '../tui/canvas.js';

/**
 * Export the canvas view (tasks + connections) as an SVG file.
 * @param {Array} tasks - All tasks
 * @param {Array} connections - All connections
 * @param {object} theme - Theme config
 * @param {string} projectName - Project name for title
 * @returns {string} Path to the generated SVG file
 */
export function exportCanvasToSvg(tasks, connections, theme, projectName) {
  const padding = 60;
  const scale = 12;

  // Calculate bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tasks) {
    minX = Math.min(minX, t.canvasX);
    minY = Math.min(minY, t.canvasY);
    maxX = Math.max(maxX, t.canvasX + NODE_WIDTH);
    maxY = Math.max(maxY, t.canvasY + NODE_HEIGHT);
  }
  if (!tasks.length) { minX = 0; minY = 0; maxX = 200; maxY = 100; }

  const svgW = (maxX - minX) * scale + padding * 2;
  const svgH = (maxY - minY) * scale + padding * 2 + 40;

  const ox = -minX * scale + padding;
  const oy = -minY * scale + padding + 40;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n`;
  svg += `<rect width="100%" height="100%" fill="#1a1a2e"/>\n`;

  // Title
  svg += `<text x="${svgW / 2}" y="30" text-anchor="middle" font-family="monospace" font-size="18" fill="${theme.color_accent}" font-weight="bold">UPFYN AGENTS - ${escXml(projectName)}</text>\n`;

  // Marker for arrows
  svg += `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">\n`;
  svg += `<polygon points="0 0, 10 3.5, 0 7" fill="${theme.color_accent}"/></marker></defs>\n`;

  // Draw connections
  for (const conn of connections) {
    const from = tasks.find(t => t.id === conn.fromTaskId);
    const to = tasks.find(t => t.id === conn.toTaskId);
    if (!from || !to) continue;

    const a = edgeAnchor(from, to.canvasX + NODE_WIDTH / 2, to.canvasY + NODE_HEIGHT / 2);
    const b = edgeAnchor(to, from.canvasX + NODE_WIDTH / 2, from.canvasY + NODE_HEIGHT / 2);

    const x1 = a.x * scale + ox;
    const y1 = a.y * scale + oy;
    const x2 = b.x * scale + ox;
    const y2 = b.y * scale + oy;

    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${theme.color_accent}" stroke-width="2" marker-end="url(#arrowhead)"/>\n`;

    if (conn.label) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      svg += `<text x="${mx}" y="${my - 5}" text-anchor="middle" font-family="monospace" font-size="10" fill="${theme.color_dimmed}">${escXml(conn.label)}</text>\n`;
    }
  }

  // Draw task nodes
  for (const task of tasks) {
    const x = task.canvasX * scale + ox;
    const y = task.canvasY * scale + oy;
    const w = NODE_WIDTH * scale;
    const h = NODE_HEIGHT * scale;

    // Box
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" fill="#16213e" stroke="${theme.color_normal}" stroke-width="2"/>\n`;

    // Status badge
    const statusColors = { backlog: '#888', planning: '#f0c040', running: '#4080ff', review: '#ff8040', done: '#40c040' };
    const badgeColor = statusColors[task.status] || '#888';
    svg += `<rect x="${x + 6}" y="${y + 6}" width="8" height="8" rx="4" fill="${badgeColor}"/>\n`;

    // Title
    const titleText = task.title.length > 22 ? task.title.slice(0, 21) + '~' : task.title;
    svg += `<text x="${x + 20}" y="${y + 16}" font-family="monospace" font-size="13" fill="${theme.color_text}" font-weight="bold">${escXml(titleText)}</text>\n`;

    // Status + agent
    svg += `<text x="${x + 8}" y="${y + h - 10}" font-family="monospace" font-size="10" fill="${theme.color_dimmed}">[${task.status}] ${escXml(task.agent)}</text>\n`;

    // PR badge
    if (task.prUrl) {
      svg += `<text x="${x + w - 30}" y="${y + 16}" font-family="monospace" font-size="10" fill="#4080ff">PR</text>\n`;
    }
  }

  svg += `</svg>`;

  const filePath = join(tmpdir(), `upfyn-canvas-${Date.now()}.svg`);
  writeFileSync(filePath, svg);
  return filePath;
}

/**
 * Export the board view (task columns) as an SVG file.
 */
export function exportBoardToSvg(tasks, theme, projectName) {
  const colW = 200;
  const cardH = 60;
  const cardGap = 10;
  const headerH = 50;
  const padding = 20;

  // Count max cards in any column
  const maxCards = Math.max(1, ...COLUMNS.map(status => tasks.filter(t => t.status === status).length));
  const svgW = COLUMNS.length * (colW + padding) + padding;
  const svgH = headerH + maxCards * (cardH + cardGap) + padding * 2 + 40;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n`;
  svg += `<rect width="100%" height="100%" fill="#1a1a2e"/>\n`;

  // Title
  svg += `<text x="${svgW / 2}" y="30" text-anchor="middle" font-family="monospace" font-size="18" fill="${theme.color_accent}" font-weight="bold">UPFYN AGENTS - ${escXml(projectName)}</text>\n`;

  for (let i = 0; i < COLUMNS.length; i++) {
    const status = COLUMNS[i];
    const colTasks = tasks.filter(t => t.status === status);
    const x = padding + i * (colW + padding);
    const y = 40 + padding;

    // Column header
    svg += `<text x="${x + colW / 2}" y="${y + 20}" text-anchor="middle" font-family="monospace" font-size="14" fill="${theme.color_column_header}" font-weight="bold">${status.toUpperCase()} (${colTasks.length})</text>\n`;
    svg += `<line x1="${x}" y1="${y + 28}" x2="${x + colW}" y2="${y + 28}" stroke="${theme.color_dimmed}" stroke-width="1"/>\n`;

    // Cards
    for (let j = 0; j < colTasks.length; j++) {
      const task = colTasks[j];
      const cy = y + headerH + j * (cardH + cardGap);

      svg += `<rect x="${x}" y="${cy}" width="${colW}" height="${cardH}" rx="4" ry="4" fill="#16213e" stroke="${theme.color_normal}" stroke-width="1"/>\n`;

      const titleText = task.title.length > 24 ? task.title.slice(0, 23) + '~' : task.title;
      svg += `<text x="${x + 10}" y="${cy + 22}" font-family="monospace" font-size="12" fill="${theme.color_text}">${escXml(titleText)}</text>\n`;
      svg += `<text x="${x + 10}" y="${cy + 42}" font-family="monospace" font-size="10" fill="${theme.color_dimmed}">[${escXml(task.agent)}]${task.prUrl ? ' PR' : ''}${task.htmlContent ? ' HTML' : ''}</text>\n`;
    }
  }

  svg += `</svg>`;

  const filePath = join(tmpdir(), `upfyn-board-${Date.now()}.svg`);
  writeFileSync(filePath, svg);
  return filePath;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

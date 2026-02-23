import { COLUMNS } from '../db/models.js';

/** Canvas constants */
export const NODE_WIDTH = 28;
export const NODE_HEIGHT = 6;
export const GRID_SPACING_X = 36;
export const GRID_SPACING_Y = 10;

/** View mode */
export const ViewMode = { Board: 'board', Canvas: 'canvas' };

/** Connection drawing mode */
export const ConnectMode = {
  Inactive: { type: 'inactive' },
  SelectingTarget: (fromTaskId) => ({ type: 'selectingTarget', fromTaskId }),
  EnteringLabel: (fromTaskId, toTaskId, labelBuf = '') => ({ type: 'enteringLabel', fromTaskId, toTaskId, labelBuf }),
};

/**
 * Canvas state for the node/arrow view.
 */
export class CanvasState {
  constructor() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.selectedNode = 0;
    this.connectMode = ConnectMode.Inactive;
    this.connections = [];
  }

  /** Auto-layout tasks in a grid grouped by status column */
  static autoLayout(tasks) {
    for (let colIdx = 0; colIdx < COLUMNS.length; colIdx++) {
      let row = 0;
      for (const task of tasks) {
        if (task.status === COLUMNS[colIdx]) {
          if (task.canvasX === 0 && task.canvasY === 0) {
            task.canvasX = colIdx * GRID_SPACING_X;
            task.canvasY = row * GRID_SPACING_Y;
          }
          row++;
        }
      }
    }
  }

  zoomIn() { this.zoom = Math.min(this.zoom + 0.1, 3.0); }
  zoomOut() { this.zoom = Math.max(this.zoom - 0.1, 0.3); }
  pan(dx, dy) { this.panX += dx; this.panY += dy; }

  selectNext(total) {
    if (total > 0) this.selectedNode = (this.selectedNode + 1) % total;
  }

  selectPrev(total) {
    if (total > 0) this.selectedNode = this.selectedNode === 0 ? total - 1 : this.selectedNode - 1;
  }

  /** Select nearest node in a direction */
  selectInDirection(tasks, dx, dy) {
    if (!tasks.length) return;
    const current = tasks[this.selectedNode];
    if (!current) return;

    let bestIdx = this.selectedNode;
    let bestScore = Infinity;

    for (let i = 0; i < tasks.length; i++) {
      if (i === this.selectedNode) continue;
      const rx = tasks[i].canvasX - current.canvasX;
      const ry = tasks[i].canvasY - current.canvasY;
      const dot = rx * dx + ry * dy;
      if (dot <= 0) continue;
      const dist = Math.sqrt(rx * rx + ry * ry);
      if (dist < bestScore) {
        bestScore = dist;
        bestIdx = i;
      }
    }
    this.selectedNode = bestIdx;
  }

  /** Move the selected task's canvas position */
  moveSelected(tasks, dx, dy) {
    const task = tasks[this.selectedNode];
    if (task) {
      task.canvasX += dx;
      task.canvasY += dy;
    }
  }
}

/**
 * Compute anchor point on the edge of a task box closest to a target point.
 */
export function edgeAnchor(task, targetX, targetY) {
  const cx = task.canvasX + NODE_WIDTH / 2;
  const cy = task.canvasY + NODE_HEIGHT / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: cx, y: cy };

  const halfW = NODE_WIDTH / 2;
  const halfH = NODE_HEIGHT / 2;
  const slopeToCorner = halfH / halfW;
  const slope = Math.abs(dx) > 0.001 ? Math.abs(dy / dx) : Infinity;

  if (slope < slopeToCorner) {
    const signX = dx >= 0 ? 1 : -1;
    return { x: cx + signX * halfW, y: cy + dy * (halfW / Math.abs(dx)) };
  } else {
    const signY = dy >= 0 ? 1 : -1;
    return { x: cx + dx * (halfH / Math.abs(dy)), y: cy + signY * halfH };
  }
}

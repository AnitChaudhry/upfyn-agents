import { COLUMNS } from '../db/models.js';

/**
 * Board state for column/row navigation.
 */
export class BoardState {
  constructor() {
    this.tasks = [];
    this.selectedColumn = 0;
    this.selectedRow = 0;
  }

  /** Get tasks in a specific column */
  tasksInColumn(column) {
    const status = COLUMNS[column];
    if (!status) return [];
    return this.tasks.filter(t => t.status === status);
  }

  /** Get the currently selected task */
  selectedTask() {
    const col = this.tasksInColumn(this.selectedColumn);
    return col[this.selectedRow] || null;
  }

  moveLeft() {
    if (this.selectedColumn > 0) {
      this.selectedColumn--;
      this.clampRow();
    }
  }

  moveRight() {
    if (this.selectedColumn < COLUMNS.length - 1) {
      this.selectedColumn++;
      this.clampRow();
    }
  }

  moveUp() {
    if (this.selectedRow > 0) {
      this.selectedRow--;
    }
  }

  moveDown() {
    const count = this.tasksInColumn(this.selectedColumn).length;
    if (this.selectedRow < count - 1) {
      this.selectedRow++;
    }
  }

  clampRow() {
    const count = this.tasksInColumn(this.selectedColumn).length;
    if (count === 0) {
      this.selectedRow = 0;
    } else if (this.selectedRow >= count) {
      this.selectedRow = count - 1;
    }
  }
}

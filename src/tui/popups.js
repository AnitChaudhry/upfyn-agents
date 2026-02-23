/**
 * Popup state classes for various UI dialogs.
 */

/** Shell popup (tmux pane capture) */
export class ShellPopup {
  constructor(sessionName, taskTitle) {
    this.sessionName = sessionName;
    this.taskTitle = taskTitle;
    this.content = '';
    this.scrollOffset = 0;
  }

  scrollDown() { this.scrollOffset++; }
  scrollUp() { if (this.scrollOffset > 0) this.scrollOffset--; }
  pageDown() { this.scrollOffset += 10; }
  pageUp() { this.scrollOffset = Math.max(0, this.scrollOffset - 10); }
  jumpToBottom(totalLines) {
    this.scrollOffset = Math.max(0, totalLines - 20);
  }
}

/** Diff popup (git diff output) */
export class DiffPopup {
  constructor(taskTitle, diffContent) {
    this.taskTitle = taskTitle;
    this.diffContent = diffContent;
    this.scrollOffset = 0;
  }

  scrollDown() { this.scrollOffset++; }
  scrollUp() { if (this.scrollOffset > 0) this.scrollOffset--; }
  pageDown() { this.scrollOffset += 10; }
  pageUp() { this.scrollOffset = Math.max(0, this.scrollOffset - 10); }
}

/** Task search popup */
export class TaskSearchState {
  constructor() {
    this.query = '';
    this.matches = [];
    this.selected = 0;
  }
}

/** PR creation confirmation popup */
export class PrConfirmPopup {
  constructor(taskId) {
    this.taskId = taskId;
    this.prTitle = '';
    this.prBody = '';
    this.editingTitle = true;
    this.generating = false;
  }
}

/** PR creation status popup */
export class PrStatusPopup {
  constructor() {
    this.status = 'creating'; // 'creating' | 'pushing' | 'success' | 'error'
    this.prUrl = null;
    this.errorMessage = null;
  }
}

/** Done confirmation popup (when PR is open) */
export class DoneConfirmPopup {
  constructor(taskId, prNumber, prState) {
    this.taskId = taskId;
    this.prNumber = prNumber;
    this.prState = prState; // 'open' | 'merged' | 'closed' | 'unknown'
  }
}

/** Delete confirmation popup */
export class DeleteConfirmPopup {
  constructor(taskId, taskTitle) {
    this.taskId = taskId;
    this.taskTitle = taskTitle;
  }
}

/** Review confirmation popup (ask if user wants to create PR) */
export class ReviewConfirmPopup {
  constructor(taskId) {
    this.taskId = taskId;
  }
}

/** File search dropdown */
export class FileSearchState {
  constructor() {
    this.pattern = '';
    this.matches = [];
    this.selected = 0;
  }
}

import termkit from 'terminal-kit';
const { terminal: term } = termkit;

import { COLUMNS, TaskStatus, createTask, generateSessionName, createConnection } from './db/models.js';
import { openProjectDb, openGlobalDb, insertTask, updateTask, deleteTask, getAllTasks,
  upsertProject, getAllProjects, insertConnection, deleteConnection, getAllConnections,
  updateTaskPosition, getTask } from './db/database.js';
import { loadGlobalConfig, loadProjectConfig, mergeConfig, parseHex } from './config/config.js';
import { detectAvailableAgents, getAgent, buildInteractiveCommand } from './agent/agent.js';
import { isGitRepo, currentBranch, diffStat, diffFull } from './git/git.js';
import { createWorktree, initializeWorktree, removeWorktree } from './git/worktree.js';
import { getPrState, createPr } from './git/provider.js';
import * as session from './session/session.js';
import { BoardState } from './tui/board.js';
import { CanvasState, ViewMode, ConnectMode, NODE_WIDTH, NODE_HEIGHT, edgeAnchor } from './tui/canvas.js';
import { SidebarState } from './tui/sidebar.js';
import { HtmlPreviewState, openInBrowser } from './tui/html-preview.js';
import { ShellPopup, DiffPopup, TaskSearchState, PrConfirmPopup, PrStatusPopup,
  DoneConfirmPopup, DeleteConfirmPopup, ReviewConfirmPopup, FileSearchState,
  TaskDetailPopup } from './tui/popups.js';
import { hexToRgb } from './tui/theme.js';
import { parseMermaid } from './utils/mermaid.js';
import { exportCanvasToSvg, exportBoardToSvg } from './utils/svg-export.js';
import { createProject } from './db/models.js';
import { basename } from 'node:path';
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Input modes */
const InputMode = {
  Normal: 'normal',
  InputTitle: 'inputTitle',
  InputDescription: 'inputDescription',
  CanvasConnect: 'canvasConnect',
  CanvasLabel: 'canvasLabel',
  HtmlPreview: 'htmlPreview',
};

/**
 * Main Application class.
 */
export class App {
  constructor(mode, projectPath) {
    this.mode = mode; // 'project' | 'dashboard'
    this.projectPath = projectPath;
    this.shouldQuit = false;

    // State
    this.board = new BoardState();
    this.inputMode = InputMode.Normal;
    this.inputBuffer = '';
    this.inputCursor = 0;
    this.pendingTaskTitle = '';
    this.editingTaskId = null;
    this.viewMode = ViewMode.Board;
    this.canvasState = new CanvasState();
    this.sidebar = new SidebarState();

    // Popups
    this.shellPopup = null;
    this.diffPopup = null;
    this.taskSearch = null;
    this.prConfirmPopup = null;
    this.prStatusPopup = null;
    this.doneConfirmPopup = null;
    this.deleteConfirmPopup = null;
    this.reviewConfirmPopup = null;
    this.fileSearch = null;
    this.htmlPreview = null;
    this.taskDetailPopup = null;
    this.highlightedFilePaths = new Set();

    // Config
    const globalConfig = loadGlobalConfig();
    const projectConfig = projectPath ? loadProjectConfig(projectPath) : {
      default_agent: null, base_branch: null, github_url: null, copy_files: null, init_script: null
    };
    this.config = mergeConfig(globalConfig, projectConfig);
    this.availableAgents = detectAvailableAgents();

    // Database
    this.db = projectPath ? openProjectDb(projectPath) : null;
    this.globalDb = openGlobalDb();
    this.projectName = projectPath ? basename(projectPath) : 'dashboard';

    // Register project in global db
    if (projectPath) {
      const proj = createProject(this.projectName, projectPath);
      proj.githubUrl = this.config.githubUrl;
      proj.defaultAgent = this.config.defaultAgent;
      upsertProject(this.globalDb, proj);
    }

    // Load tasks
    this.refreshTasks();

    // Load sidebar projects
    this.sidebar.projects = getAllProjects(this.globalDb).map(p => ({
      name: p.name,
      path: p.path,
    }));

    // Shell popup refresh timer
    this._shellTimer = null;

    // Column scroll offsets for board view
    this.columnScrollOffsets = [0, 0, 0, 0, 0];
  }

  refreshTasks() {
    if (this.db) {
      this.board.tasks = getAllTasks(this.db);
      this.canvasState.connections = getAllConnections(this.db);
      CanvasState.autoLayout(this.board.tasks);
    }
  }

  async run() {
    // Check for TTY — terminal-kit needs a real terminal
    if (!process.stdout.isTTY) {
      console.error('Error: Upfyn Agents requires an interactive terminal (TTY).');
      console.error('Run this command directly in your terminal, not piped or redirected.');
      console.error('\nUsage: upfyn [path]    or    upfyn -g');
      process.exit(1);
    }

    term.fullscreen(true);
    term.hideCursor();
    term.grabInput({ mouse: false });

    // Handle terminal resize
    term.on('resize', () => {
      this.draw();
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      this.cleanup();
    });

    this.draw();

    return new Promise((resolve) => {
      term.on('key', (key) => {
        this.handleKey(key);
        if (this.shouldQuit) {
          this.cleanup();
          resolve();
          return;
        }
        this.draw();
      });
    });
  }

  /** Clean up terminal state on exit */
  cleanup() {
    term.fullscreen(false);
    term.showCursor();
    term.grabInput(false);
    term.styleReset();
    term.processExit(0);
  }

  // ═══════════════════════════════════════════
  //  DRAWING
  // ═══════════════════════════════════════════

  draw() {
    // Buffer all output to prevent flicker — cork holds writes,
    // uncork flushes everything to the terminal as a single chunk
    process.stdout.cork();

    term.moveTo(1, 1);
    term.eraseDisplay();

    const width = (Number.isFinite(term.width) && term.width > 0) ? term.width : 80;
    const height = (Number.isFinite(term.height) && term.height > 0) ? term.height : 24;

    if (this.viewMode === ViewMode.Canvas) {
      this.drawCanvas(width, height);
    } else {
      this.drawBoard(width, height);
    }

    // Draw popups on top
    if (this.shellPopup) this.drawShellPopup(width, height);
    if (this.diffPopup) this.drawDiffPopup(width, height);
    if (this.taskSearch) this.drawTaskSearch(width, height);
    if (this.prConfirmPopup) this.drawPrConfirmPopup(width, height);
    if (this.prStatusPopup) this.drawPrStatusPopup(width, height);
    if (this.doneConfirmPopup) this.drawDoneConfirmPopup(width, height);
    if (this.deleteConfirmPopup) this.drawDeleteConfirmPopup(width, height);
    if (this.reviewConfirmPopup) this.drawReviewConfirmPopup(width, height);
    if (this.htmlPreview) this.drawHtmlPreview(width, height);
    if (this.fileSearch) this.drawFileSearch(width, height);
    if (this.taskDetailPopup) this.drawTaskDetailPopup(width, height);

    // Input line
    if (this.inputMode === InputMode.InputTitle || this.inputMode === InputMode.InputDescription) {
      this.drawInputLine(width, height);
    }

    // Footer
    this.drawFooter(width, height);

    // Flush all buffered output at once — no flicker
    process.nextTick(() => process.stdout.uncork());
  }

  /** Word-wrap text to fit within maxWidth, returning array of lines */
  wrapText(text, maxWidth) {
    if (!text || maxWidth <= 0) return [];
    const lines = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      if (para.trim() === '') { lines.push(''); continue; }
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        if (!word) continue;
        if (line.length + word.length + (line ? 1 : 0) > maxWidth) {
          if (line) lines.push(line);
          // Handle words longer than maxWidth
          if (word.length > maxWidth) {
            for (let i = 0; i < word.length; i += maxWidth) {
              lines.push(word.slice(i, i + maxWidth));
            }
            line = '';
          } else {
            line = word;
          }
        } else {
          line = line ? line + ' ' + word : word;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  /** Calculate card height for a task */
  cardHeight(task, innerWidth, maxDescLines) {
    // top border (1) + title lines + desc lines + agent line (1) + bottom border (1)
    const titleLines = this.wrapText(task.title, innerWidth - 1).length || 1;
    const descLines = task.description
      ? Math.min(this.wrapText(task.description, innerWidth - 1).length, maxDescLines)
      : 0;
    return 1 + titleLines + descLines + 1 + 1; // top border + title + desc + agent + bottom border
  }

  /** Draw a single bordered card, returns actual height used */
  drawCard(x, y, w, task, isSelected, maxDescLines, contentHeight, theme) {
    const innerW = w - 2; // inside borders
    const textW = innerW - 1; // 1 char padding inside border
    const borderColor = isSelected ? theme.color_selected : theme.color_normal;
    const titleLines = this.wrapText(task.title, textW);
    if (titleLines.length === 0) titleLines.push(task.title || 'Untitled');
    const descLines = task.description ? this.wrapText(task.description, textW) : [];
    const visibleDescLines = descLines.slice(0, maxDescLines);
    const h = 1 + titleLines.length + visibleDescLines.length + 1 + 1;

    // Top border
    if (y >= 1 && y <= contentHeight) {
      this.moveTo(x, y);
      this.setColor(borderColor);
      term('┌' + '─'.repeat(Math.max(0, w - 2)) + '┐');
    }

    // Title lines (bold, full text wrapped)
    let row = y + 1;
    for (let i = 0; i < titleLines.length; i++) {
      if (row >= 1 && row <= contentHeight) {
        this.moveTo(x, row);
        this.setColor(borderColor);
        term('│');
        if (isSelected) {
          this.setColor(theme.color_text);
        } else {
          this.setColor(theme.color_popup_header);
        }
        term.bold(' ' + titleLines[i].padEnd(textW).slice(0, textW));
        this.setColor(borderColor);
        term('│');
      }
      row++;
    }

    // Description lines (dimmed, wrapped)
    for (let i = 0; i < visibleDescLines.length; i++) {
      if (row >= 1 && row <= contentHeight) {
        this.moveTo(x, row);
        this.setColor(borderColor);
        term('│');
        this.setColor(isSelected ? theme.color_text : theme.color_description);
        term(' ' + visibleDescLines[i].padEnd(textW).slice(0, textW));
        this.setColor(borderColor);
        term('│');
      }
      row++;
    }

    // Agent badge line
    if (row >= 1 && row <= contentHeight) {
      this.moveTo(x, row);
      this.setColor(borderColor);
      term('│');
      this.setColor(theme.color_dimmed);
      let badge = ` [${task.agent}]`;
      if (task.prUrl) badge += ' PR';
      if (task.htmlContent) badge += ' HTML';
      if (descLines.length > maxDescLines) badge += ` (+${descLines.length - maxDescLines} more)`;
      term(badge.padEnd(innerW).slice(0, innerW));
      this.setColor(borderColor);
      term('│');
    }
    row++;

    // Bottom border
    if (row >= 1 && row <= contentHeight) {
      this.moveTo(x, row);
      this.setColor(borderColor);
      term('└' + '─'.repeat(Math.max(0, w - 2)) + '┘');
    }

    return h;
  }

  drawBoard(width, height) {
    const theme = this.config.theme;
    const sidebarWidth = this.sidebar.visible ? 22 : 0;
    const boardWidth = width - sidebarWidth;
    const colWidth = Math.max(10, Math.floor(boardWidth / COLUMNS.length));
    const boardStartX = sidebarWidth + 1;
    const contentHeight = height - 2; // leave room for header + footer
    const cardStartY = 4; // after header + column header + separator
    const maxDescLines = 5; // max description lines per card

    // Header
    this.moveTo(1, 1);
    this.setColor(theme.color_accent);
    const headerText = ` UPFYN AGENTS  ${this.projectName} `;
    term.bold(headerText);
    this.setColor(theme.color_dimmed);
    term(' '.repeat(Math.max(0, width - headerText.length)));

    // Sidebar
    if (this.sidebar.visible) {
      this.drawSidebar(sidebarWidth, contentHeight);
    }

    // Columns
    for (let col = 0; col < COLUMNS.length; col++) {
      const x = boardStartX + col * colWidth;
      const isSelectedCol = col === this.board.selectedColumn;
      const tasks = this.board.tasksInColumn(col);
      const cardW = colWidth - 1; // leave 1 char gap between columns

      // Column header with dashed border
      this.moveTo(x, 2);
      this.setColor(isSelectedCol && !this.sidebar.focused ? theme.color_selected : theme.color_dimmed);
      const headerLabel = ` ${COLUMNS[col]} (${tasks.length})`;
      // Draw bordered column header
      term('┌─');
      if (isSelectedCol && !this.sidebar.focused) {
        this.setColor(theme.color_selected);
        term.bold(headerLabel);
      } else {
        this.setColor(theme.color_column_header);
        term(headerLabel);
      }
      this.setColor(isSelectedCol && !this.sidebar.focused ? theme.color_selected : theme.color_dimmed);
      term('─'.repeat(Math.max(0, cardW - 3 - headerLabel.length)) + '┐');

      // Column border line
      this.moveTo(x, 3);
      this.setColor(isSelectedCol && !this.sidebar.focused ? theme.color_selected : theme.color_dimmed);
      term('├' + '─'.repeat(Math.max(0, cardW - 2)) + '┤');

      // Auto-scroll: ensure selected card is visible
      if (isSelectedCol && !this.sidebar.focused) {
        this.ensureCardVisible(col, tasks, cardW - 2, maxDescLines, contentHeight - cardStartY);
      }

      const scrollOffset = this.columnScrollOffsets[col] || 0;

      // Draw task cards
      let curY = cardStartY;
      for (let row = 0; row < tasks.length; row++) {
        const task = tasks[row];
        const ch = this.cardHeight(task, cardW - 2, maxDescLines);

        // Skip cards above scroll offset
        if (row < scrollOffset) continue;

        if (curY + ch > contentHeight) break; // no more room

        const isSelected = isSelectedCol && row === this.board.selectedRow && !this.sidebar.focused;
        this.drawCard(x, curY, cardW, task, isSelected, maxDescLines, contentHeight, theme);
        curY += ch + 1; // 1 line gap between cards
      }

      // Draw column side borders for remaining space
      for (let ry = curY; ry <= contentHeight; ry++) {
        this.moveTo(x, ry);
        this.setColor(isSelectedCol && !this.sidebar.focused ? theme.color_selected : theme.color_dimmed);
        term('│');
        this.moveTo(x + cardW - 1, ry);
        term('│');
      }

      // Column bottom border
      if (contentHeight + 1 <= height) {
        this.moveTo(x, contentHeight);
        this.setColor(isSelectedCol && !this.sidebar.focused ? theme.color_selected : theme.color_dimmed);
        term('└' + '─'.repeat(Math.max(0, cardW - 2)) + '┘');
      }
    }
  }

  /** Ensure the selected card is visible by adjusting scroll offset */
  ensureCardVisible(col, tasks, innerWidth, maxDescLines, availableHeight) {
    const selectedRow = this.board.selectedRow;
    if (tasks.length === 0) { this.columnScrollOffsets[col] = 0; return; }

    // Scroll up if needed
    if (selectedRow < (this.columnScrollOffsets[col] || 0)) {
      this.columnScrollOffsets[col] = selectedRow;
      return;
    }

    // Scroll down if needed — calculate cumulative heights
    let offset = this.columnScrollOffsets[col] || 0;
    let cumH = 0;
    for (let i = offset; i < tasks.length; i++) {
      const ch = this.cardHeight(tasks[i], innerWidth, maxDescLines) + 1;
      if (i === selectedRow) {
        if (cumH + ch > availableHeight) {
          // Need to scroll — increase offset until it fits
          while (offset < selectedRow) {
            offset++;
            cumH = 0;
            for (let j = offset; j <= selectedRow; j++) {
              cumH += this.cardHeight(tasks[j], innerWidth, maxDescLines) + 1;
            }
            if (cumH <= availableHeight) break;
          }
          this.columnScrollOffsets[col] = offset;
        }
        return;
      }
      cumH += ch;
    }
  }

  drawSidebar(sidebarWidth, contentHeight) {
    const theme = this.config.theme;
    this.moveTo(1, 2);
    this.setColor(this.sidebar.focused ? theme.color_selected : theme.color_normal);
    term.bold(' PROJECTS');

    this.moveTo(1, 3);
    this.setColor(theme.color_dimmed);
    term('─'.repeat(sidebarWidth - 1));

    for (let i = 0; i < this.sidebar.projects.length; i++) {
      const y = 4 + i;
      if (y >= contentHeight) break;
      this.moveTo(1, y);
      const isSelected = this.sidebar.focused && i === this.sidebar.selectedProject;
      if (isSelected) {
        this.setColor(theme.color_selected);
        term.bold('> ');
      } else {
        term('  ');
      }
      this.setColor(isSelected ? theme.color_text : theme.color_description);
      const name = this.sidebar.projects[i].name;
      term(name.length > sidebarWidth - 4 ? name.slice(0, sidebarWidth - 5) + '~' : name);
    }

    // Vertical separator
    for (let y = 2; y <= contentHeight; y++) {
      this.moveTo(sidebarWidth, y);
      this.setColor(theme.color_dimmed);
      term('│');
    }
  }

  drawCanvas(width, height) {
    const theme = this.config.theme;
    const tasks = this.board.tasks;
    const cs = this.canvasState;

    // Header
    this.moveTo(1, 1);
    this.setColor(theme.color_accent);
    let modeLabel;
    if (cs.connectMode.type === 'inactive') {
      modeLabel = ' CANVAS [c]Board [a]Connect [+/-]Zoom [p]Preview [b]Browser ';
    } else if (cs.connectMode.type === 'selectingTarget') {
      modeLabel = ' SELECT TARGET (Enter=confirm, Esc=cancel) ';
    } else {
      modeLabel = ' TYPE LABEL (Enter=save, Esc=cancel) ';
    }
    term.bold(modeLabel);

    // Draw connections (arrows)
    for (const conn of cs.connections) {
      const fromTask = tasks.find(t => t.id === conn.fromTaskId);
      const toTask = tasks.find(t => t.id === conn.toTaskId);
      if (!fromTask || !toTask) continue;

      const from = edgeAnchor(fromTask, toTask.canvasX + NODE_WIDTH / 2, toTask.canvasY + NODE_HEIGHT / 2);
      const to = edgeAnchor(toTask, fromTask.canvasX + NODE_WIDTH / 2, fromTask.canvasY + NODE_HEIGHT / 2);

      // Simple line drawing
      const sx = Math.round((from.x - cs.panX) * cs.zoom) + 1;
      const sy = Math.round((from.y - cs.panY) * cs.zoom) + 2;
      const ex = Math.round((to.x - cs.panX) * cs.zoom) + 1;
      const ey = Math.round((to.y - cs.panY) * cs.zoom) + 2;

      // Draw arrow line with Unicode
      this.setColor(theme.color_accent);
      if (sx > 0 && sx <= width && sy > 0 && sy < height) {
        this.moveTo(sx, sy);
        term('*');
      }
      if (ex > 0 && ex <= width && ey > 0 && ey < height) {
        this.moveTo(ex, ey);
        term('>');
      }
      // Draw label at midpoint
      if (conn.label) {
        const mx = Math.round((sx + ex) / 2);
        const my = Math.round((sy + ey) / 2);
        if (mx > 0 && mx + conn.label.length <= width && my > 0 && my < height) {
          this.moveTo(mx, my);
          this.setColor(theme.color_dimmed);
          term(conn.label);
        }
      }
    }

    // Draw task nodes
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const isSelected = i === cs.selectedNode;
      const isConnectSrc = cs.connectMode.type === 'selectingTarget' && cs.connectMode.fromTaskId === task.id;

      const x = Math.round((task.canvasX - cs.panX) * cs.zoom) + 1;
      const y = Math.round((task.canvasY - cs.panY) * cs.zoom) + 2;

      if (x + NODE_WIDTH < 1 || x > width || y + NODE_HEIGHT < 1 || y >= height) continue;

      // Box border color
      if (isConnectSrc) {
        this.setColor('#00ff00');
      } else if (isSelected) {
        this.setColor(theme.color_selected);
      } else {
        this.setColor(theme.color_normal);
      }

      // Top border
      this.moveTo(Math.max(1, x), y);
      term('┌' + '─'.repeat(Math.min(NODE_WIDTH - 2, width - x - 1)) + '┐');

      // Title
      this.moveTo(Math.max(1, x), y + 1);
      term('│');
      this.setColor(isSelected ? theme.color_text : theme.color_description);
      const maxW = NODE_WIDTH - 3;
      const label = task.title.length > maxW ? task.title.slice(0, maxW - 1) + '~' : task.title;
      term(' ' + label.padEnd(maxW));
      if (isConnectSrc) this.setColor('#00ff00');
      else if (isSelected) this.setColor(theme.color_selected);
      else this.setColor(theme.color_normal);
      term('│');

      // Status line
      this.moveTo(Math.max(1, x), y + 2);
      term('│');
      this.setColor(theme.color_dimmed);
      const statusLine = ` [${task.status}] ${task.agent}`;
      term(statusLine.padEnd(NODE_WIDTH - 2).slice(0, NODE_WIDTH - 2));
      if (isConnectSrc) this.setColor('#00ff00');
      else if (isSelected) this.setColor(theme.color_selected);
      else this.setColor(theme.color_normal);
      term('│');

      // Bottom border
      this.moveTo(Math.max(1, x), y + 3);
      term('└' + '─'.repeat(Math.min(NODE_WIDTH - 2, width - x - 1)) + '┘');

      // HTML badge
      if (task.htmlContent) {
        this.moveTo(Math.max(1, x) + NODE_WIDTH - 5, y);
        this.setColor('#ff6666');
        term('HTML');
      }
    }
  }

  drawShellPopup(width, height) {
    const theme = this.config.theme;
    const popup = this.shellPopup;
    const pw = Math.min(82, width - 4);
    const ph = Math.floor(height * 0.75);
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    // Refresh content from tmux
    popup.content = session.captureOutput(popup.sessionName, ph + 20);

    this.drawPopupBox(px, py, pw, ph, ` ${popup.taskTitle} [Ctrl+q]Close `, theme);

    const lines = popup.content.split('\n');
    const start = Math.min(popup.scrollOffset, Math.max(0, lines.length - (ph - 2)));
    for (let i = 0; i < ph - 2 && start + i < lines.length; i++) {
      this.moveTo(px + 1, py + 1 + i);
      this.setColor(theme.color_text);
      const line = lines[start + i] || '';
      term(line.slice(0, pw - 2));
    }
  }

  drawDiffPopup(width, height) {
    const theme = this.config.theme;
    const popup = this.diffPopup;
    const pw = Math.min(100, width - 4);
    const ph = Math.floor(height * 0.8);
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ` Diff: ${popup.taskTitle} [Esc]Close `, theme);

    const lines = popup.diffContent.split('\n');
    const start = Math.min(popup.scrollOffset, Math.max(0, lines.length - (ph - 2)));
    for (let i = 0; i < ph - 2 && start + i < lines.length; i++) {
      this.moveTo(px + 1, py + 1 + i);
      const line = (lines[start + i] || '').slice(0, pw - 2);
      // Color diff lines
      if (line.startsWith('+')) { this.setColor('#00ff00'); }
      else if (line.startsWith('-')) { this.setColor('#ff4444'); }
      else if (line.startsWith('@@')) { this.setColor(theme.color_accent); }
      else { this.setColor(theme.color_text); }
      term(line);
    }
  }

  drawTaskSearch(width, height) {
    const theme = this.config.theme;
    const search = this.taskSearch;
    const pw = Math.min(60, width - 4);
    const ph = Math.min(20, height - 4);
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ' Search Tasks [Esc]Cancel ', theme);

    this.moveTo(px + 1, py + 1);
    this.setColor(theme.color_text);
    term('/ ' + search.query + '_');

    for (let i = 0; i < search.matches.length && i < ph - 3; i++) {
      this.moveTo(px + 1, py + 3 + i);
      const [id, title, status] = search.matches[i];
      const isSelected = i === search.selected;
      if (isSelected) {
        this.setColor(theme.color_selected);
        term.bold('> ');
      } else {
        term('  ');
      }
      this.setColor(isSelected ? theme.color_text : theme.color_description);
      const line = `[${status}] ${title}`;
      term(line.slice(0, pw - 4));
    }
  }

  drawPrConfirmPopup(width, height) {
    const theme = this.config.theme;
    const popup = this.prConfirmPopup;
    const pw = Math.min(70, width - 4);
    const ph = Math.min(20, height - 4);
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ' Create PR [Ctrl+s]Submit [Tab]Switch [Esc]Cancel ', theme);

    if (popup.generating) {
      this.moveTo(px + 2, py + 2);
      this.setColor(theme.color_accent);
      term('Generating PR description...');
      return;
    }

    this.moveTo(px + 1, py + 1);
    this.setColor(popup.editingTitle ? theme.color_selected : theme.color_dimmed);
    term.bold(' Title:');
    this.moveTo(px + 1, py + 2);
    this.setColor(theme.color_text);
    term(popup.prTitle.slice(0, pw - 3) + (popup.editingTitle ? '_' : ''));

    this.moveTo(px + 1, py + 4);
    this.setColor(!popup.editingTitle ? theme.color_selected : theme.color_dimmed);
    term.bold(' Description:');
    const bodyLines = popup.prBody.split('\n');
    for (let i = 0; i < bodyLines.length && i < ph - 7; i++) {
      this.moveTo(px + 1, py + 5 + i);
      this.setColor(theme.color_text);
      term(bodyLines[i].slice(0, pw - 3));
    }
  }

  drawPrStatusPopup(width, height) {
    const theme = this.config.theme;
    const popup = this.prStatusPopup;
    const pw = 50;
    const ph = 6;
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ' PR Status ', theme);

    this.moveTo(px + 2, py + 2);
    if (popup.status === 'creating' || popup.status === 'pushing') {
      this.setColor(theme.color_accent);
      term(popup.status === 'creating' ? 'Creating PR...' : 'Pushing to PR...');
    } else if (popup.status === 'success') {
      this.setColor('#00ff00');
      term('PR created! ' + (popup.prUrl || ''));
      this.moveTo(px + 2, py + 3);
      this.setColor(theme.color_dimmed);
      term('[Enter] close');
    } else {
      this.setColor('#ff4444');
      term('Error: ' + (popup.errorMessage || 'Unknown error'));
      this.moveTo(px + 2, py + 3);
      this.setColor(theme.color_dimmed);
      term('[Enter] close');
    }
  }

  drawDoneConfirmPopup(width, height) {
    const theme = this.config.theme;
    const popup = this.doneConfirmPopup;
    const pw = 50;
    const ph = 7;
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ' Move to Done ', theme);

    this.moveTo(px + 2, py + 2);
    this.setColor(theme.color_text);
    term(`PR #${popup.prNumber} is ${popup.prState}`);
    this.moveTo(px + 2, py + 3);
    term('Move to Done anyway?');
    this.moveTo(px + 2, py + 4);
    this.setColor(theme.color_dimmed);
    term('[y] yes  [n] no');
  }

  drawDeleteConfirmPopup(width, height) {
    const theme = this.config.theme;
    const popup = this.deleteConfirmPopup;
    const pw = Math.min(60, width - 4);
    const ph = 7;
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ' Delete Task ', theme);

    this.moveTo(px + 2, py + 2);
    this.setColor(theme.color_text);
    term(`Delete "${popup.taskTitle.slice(0, pw - 12)}"?`);
    this.moveTo(px + 2, py + 3);
    term('This will remove the worktree and tmux session.');
    this.moveTo(px + 2, py + 4);
    this.setColor(theme.color_dimmed);
    term('[y] yes  [n] no');
  }

  drawReviewConfirmPopup(width, height) {
    const theme = this.config.theme;
    const pw = 50;
    const ph = 7;
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ' Move to Review ', theme);

    this.moveTo(px + 2, py + 2);
    this.setColor(theme.color_text);
    term('Create a PR for this task?');
    this.moveTo(px + 2, py + 4);
    this.setColor(theme.color_dimmed);
    term('[y] create PR  [n] skip  [Esc] cancel');
  }

  drawHtmlPreview(width, height) {
    const theme = this.config.theme;
    const preview = this.htmlPreview;
    const pw = Math.floor(width * 0.8);
    const ph = Math.floor(height * 0.8);
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph,
      ` HTML Preview: ${preview.taskTitle} [b]Browser [Esc]Close `, theme);

    const lines = preview.renderedText.split('\n');
    const start = Math.min(preview.scrollOffset, Math.max(0, lines.length - (ph - 2)));
    for (let i = 0; i < ph - 2 && start + i < lines.length; i++) {
      this.moveTo(px + 1, py + 1 + i);
      this.setColor(theme.color_text);
      term((lines[start + i] || '').slice(0, pw - 2));
    }
  }

  drawInputLine(width, height) {
    const theme = this.config.theme;
    const y = height - 1;
    this.moveTo(1, y);
    this.setColor(theme.color_accent);
    const label = this.inputMode === InputMode.InputTitle ? 'Title: ' : 'Prompt: ';
    term.bold(label);
    this.setColor(theme.color_text);
    term(this.inputBuffer + '_');
  }

  drawFooter(width, height) {
    const theme = this.config.theme;
    this.moveTo(1, height);
    this.setColor(theme.color_dimmed);

    let text;
    switch (this.inputMode) {
      case InputMode.Normal:
        if (this.sidebar.focused) {
          text = ' [j/k] navigate  [Enter] open  [l] board  [e] hide sidebar  [q] quit';
        } else if (this.viewMode === ViewMode.Canvas) {
          text = ' [h/j/k/l] select  [H/J/K/L] move  [a] connect  [x] del conn  [+/-] zoom  [S] SVG  [c] board  [q] quit';
        } else {
          const col = this.board.selectedColumn;
          if (col === 0) text = ' [o] new  [v] view  [/] search  [Enter] edit  [x] del  [d] diff  [m] plan  [M] run  [s] sessions  [S] SVG  [c] canvas  [e] sidebar  [q] quit';
          else if (col === 1) text = ' [o] new  [v] view  [/] search  [Enter] open  [x] del  [d] diff  [m] run  [s] sessions  [S] SVG  [c] canvas  [e] sidebar  [q] quit';
          else if (col < 4) text = ' [o] new  [v] view  [/] search  [Enter] open  [x] del  [d] diff  [m] move  [r] back  [s] sessions  [S] SVG  [c] canvas  [e] sidebar  [q] quit';
          else text = ' [o] new  [v] view  [/] search  [Enter] open  [x] del  [s] sessions  [S] SVG  [c] canvas  [e] sidebar  [q] quit';
        }
        break;
      case InputMode.InputTitle:
        text = ' Enter task title... [Esc] cancel [Enter] next';
        break;
      case InputMode.InputDescription:
        text = ' Enter prompt for agent... [#] file search [Esc] cancel [Enter] save';
        break;
      case InputMode.HtmlPreview:
        text = ' [j/k] scroll [b] open in browser [Esc] close';
        break;
      default:
        text = '';
    }
    term(text.slice(0, width));
  }

  /** Draw a popup box outline */
  drawTaskDetailPopup(width, height) {
    const popup = this.taskDetailPopup;
    const task = popup.task;
    const theme = this.config.theme;

    // Full-screen popup with margin
    const mx = 3, my = 2;
    const pw = width - mx * 2;
    const ph = height - my * 2;
    const px = mx;
    const py = my;
    const innerW = pw - 4; // padding inside borders

    this.drawPopupBox(px, py, pw, ph, ` ${task.title.slice(0, pw - 10)} [v]View [Esc]Close `, theme);

    // Build content lines
    const lines = [];

    // Status + Agent
    lines.push({ label: 'Status', value: task.status.toUpperCase(), color: theme.color_accent });
    lines.push({ label: 'Agent', value: task.agent, color: theme.color_text });
    lines.push({ label: '', value: '' }); // blank line

    // Title (full, wrapped)
    lines.push({ label: 'TITLE', value: '', color: theme.color_column_header, isHeader: true });
    const titleWrapped = this.wrapText(task.title, innerW);
    for (const line of titleWrapped) {
      lines.push({ label: '', value: line, color: theme.color_text });
    }
    lines.push({ label: '', value: '' });

    // Description (full, wrapped)
    if (task.description) {
      lines.push({ label: 'DESCRIPTION', value: '', color: theme.color_column_header, isHeader: true });
      const descWrapped = this.wrapText(task.description, innerW);
      for (const line of descWrapped) {
        lines.push({ label: '', value: line, color: theme.color_description });
      }
      lines.push({ label: '', value: '' });
    }

    // Metadata
    lines.push({ label: 'DETAILS', value: '', color: theme.color_column_header, isHeader: true });
    if (task.branchName) lines.push({ label: 'Branch', value: task.branchName, color: theme.color_text });
    if (task.worktreePath) lines.push({ label: 'Worktree', value: task.worktreePath, color: theme.color_dimmed });
    if (task.sessionName) lines.push({ label: 'Session', value: task.sessionName, color: theme.color_dimmed });
    if (task.prUrl) lines.push({ label: 'PR', value: task.prUrl, color: theme.color_accent });
    if (task.prNumber) lines.push({ label: 'PR #', value: String(task.prNumber), color: theme.color_accent });
    if (task.createdAt) lines.push({ label: 'Created', value: task.createdAt, color: theme.color_dimmed });
    if (task.updatedAt) lines.push({ label: 'Updated', value: task.updatedAt, color: theme.color_dimmed });
    lines.push({ label: 'ID', value: task.id, color: theme.color_dimmed });

    // Render lines with scroll
    const visibleLines = ph - 3; // inside borders minus title bar
    const maxScroll = Math.max(0, lines.length - visibleLines);
    if (popup.scrollOffset > maxScroll) popup.scrollOffset = maxScroll;

    for (let i = 0; i < visibleLines && (i + popup.scrollOffset) < lines.length; i++) {
      const line = lines[i + popup.scrollOffset];
      const ry = py + 2 + i;
      this.moveTo(px + 2, ry);

      if (line.isHeader) {
        this.setColor(line.color || theme.color_column_header);
        term.bold(line.label);
      } else if (line.label) {
        this.setColor(theme.color_dimmed);
        term(line.label + ': ');
        this.setColor(line.color || theme.color_text);
        term(line.value.slice(0, innerW - line.label.length - 2));
      } else {
        this.setColor(line.color || theme.color_text);
        term(line.value.slice(0, innerW));
      }
    }

    // Scroll indicator
    if (lines.length > visibleLines) {
      this.moveTo(px + pw - 12, py + ph - 1);
      this.setColor(theme.color_dimmed);
      term(` ${popup.scrollOffset + 1}/${lines.length} `);
    }
  }

  handleTaskDetailKey(key) {
    const popup = this.taskDetailPopup;
    switch (key) {
      case 'ESCAPE': case 'q': case 'v':
        this.taskDetailPopup = null;
        break;
      case 'j': case 'DOWN': case 'CTRL_J':
        popup.scrollDown();
        break;
      case 'k': case 'UP': case 'CTRL_K':
        popup.scrollUp();
        break;
      case 'CTRL_D':
        popup.pageDown();
        break;
      case 'CTRL_U':
        popup.pageUp();
        break;
      case 'ENTER':
        // If task has a session, open shell popup
        const task = popup.task;
        if (task.sessionName && session.sessionExists(task.sessionName)) {
          this.taskDetailPopup = null;
          this.shellPopup = new ShellPopup(task.sessionName, task.title);
        }
        break;
    }
  }

  drawPopupBox(x, y, w, h, title, theme) {
    this.setColor(theme.color_popup_border);

    // Clear popup area
    for (let row = y; row < y + h; row++) {
      this.moveTo(x, row);
      term(' '.repeat(w));
    }

    // Top border
    this.moveTo(x, y);
    term('┌' + '─'.repeat(w - 2) + '┐');

    // Sides
    for (let row = y + 1; row < y + h - 1; row++) {
      this.moveTo(x, row);
      term('│');
      this.moveTo(x + w - 1, row);
      term('│');
    }

    // Bottom border
    this.moveTo(x, y + h - 1);
    term('└' + '─'.repeat(w - 2) + '┘');

    // Title
    if (title) {
      this.moveTo(x + 2, y);
      this.setColor(theme.color_popup_header);
      term.bold(title);
    }
  }

  // ═══════════════════════════════════════════
  //  KEY HANDLING
  // ═══════════════════════════════════════════

  handleKey(key) {
    // Check for active popups first
    if (this.fileSearch) return this.handleFileSearchKey(key);
    if (this.deleteConfirmPopup) return this.handleDeleteConfirmKey(key);
    if (this.doneConfirmPopup) return this.handleDoneConfirmKey(key);
    if (this.reviewConfirmPopup) return this.handleReviewConfirmKey(key);
    if (this.prStatusPopup) return this.handlePrStatusKey(key);
    if (this.prConfirmPopup) return this.handlePrConfirmKey(key);
    if (this.shellPopup) return this.handleShellPopupKey(key);
    if (this.diffPopup) return this.handleDiffPopupKey(key);
    if (this.taskSearch) return this.handleTaskSearchKey(key);
    if (this.htmlPreview) return this.handleHtmlPreviewKey(key);
    if (this.taskDetailPopup) return this.handleTaskDetailKey(key);

    // Input modes
    if (this.inputMode === InputMode.InputTitle) return this.handleInputTitleKey(key);
    if (this.inputMode === InputMode.InputDescription) return this.handleInputDescriptionKey(key);

    // Canvas mode
    if (this.viewMode === ViewMode.Canvas) {
      if (this.canvasState.connectMode.type === 'selectingTarget') return this.handleCanvasConnectKey(key);
      if (this.canvasState.connectMode.type === 'enteringLabel') return this.handleCanvasLabelKey(key);
      return this.handleCanvasKey(key);
    }

    // Sidebar focused
    if (this.sidebar.focused) return this.handleSidebarKey(key);

    // Normal board mode
    this.handleBoardKey(key);
  }

  handleBoardKey(key) {
    switch (key) {
      case 'q': this.shouldQuit = true; break;
      case 'h': case 'LEFT': this.board.moveLeft(); break;
      case 'l': case 'RIGHT': this.board.moveRight(); break;
      case 'j': case 'DOWN': this.board.moveDown(); break;
      case 'k': case 'UP': this.board.moveUp(); break;
      case 'o': this.startCreateTask(); break;
      case 'ENTER': this.openSelectedTask(); break;
      case 'x': this.confirmDeleteTask(); break;
      case 'd': this.showDiff(); break;
      case 'm': this.moveTaskForward(); break;
      case 'M': this.moveTaskToRunning(); break;
      case 'r': this.moveTaskBack(); break;
      case '/': this.startSearch(); break;
      case 'e': this.sidebar.toggle(); break;
      case 'c': this.viewMode = ViewMode.Canvas; break;
      case 'S': this.exportSvg(); break;
      case 's': this.showSessions(); break;
      case 'v': this.viewSelectedTask(); break;
    }
  }

  handleSidebarKey(key) {
    switch (key) {
      case 'q': this.shouldQuit = true; break;
      case 'j': case 'DOWN': this.sidebar.moveDown(); break;
      case 'k': case 'UP': this.sidebar.moveUp(); break;
      case 'l': case 'RIGHT': this.sidebar.unfocus(); break;
      case 'e': this.sidebar.toggle(); break;
      case 'ENTER':
        const proj = this.sidebar.selectedProjectInfo();
        if (proj) this.switchProject(proj.path);
        break;
      case 'h': this.sidebar.focused = true; break;
    }
  }

  handleCanvasKey(key) {
    const tasks = this.board.tasks;
    const cs = this.canvasState;
    switch (key) {
      case 'q': this.shouldQuit = true; break;
      case 'c': case 'ESCAPE': this.viewMode = ViewMode.Board; break;
      case 'h': cs.selectInDirection(tasks, -1, 0); break;
      case 'l': cs.selectInDirection(tasks, 1, 0); break;
      case 'j': cs.selectInDirection(tasks, 0, 1); break;
      case 'k': cs.selectInDirection(tasks, 0, -1); break;
      case 'H': cs.moveSelected(tasks, -2, 0); this.saveNodePosition(); break;
      case 'L': cs.moveSelected(tasks, 2, 0); this.saveNodePosition(); break;
      case 'J': cs.moveSelected(tasks, 0, 2); this.saveNodePosition(); break;
      case 'K': cs.moveSelected(tasks, 0, -2); this.saveNodePosition(); break;
      case '+': case '=': cs.zoomIn(); break;
      case '-': cs.zoomOut(); break;
      case 'a': this.startCanvasConnect(); break;
      case 'x': this.deleteSelectedConnection(); break;
      case 'p': this.showHtmlPreview(); break;
      case 'b': this.openHtmlInBrowser(); break;
      case 'S': this.exportSvg(); break;
    }
  }

  handleCanvasConnectKey(key) {
    const tasks = this.board.tasks;
    const cs = this.canvasState;
    switch (key) {
      case 'ESCAPE': cs.connectMode = ConnectMode.Inactive; break;
      case 'j': cs.selectNext(tasks.length); break;
      case 'k': cs.selectPrev(tasks.length); break;
      case 'ENTER':
        const target = tasks[cs.selectedNode];
        if (target && cs.connectMode.fromTaskId !== target.id) {
          cs.connectMode = ConnectMode.EnteringLabel(cs.connectMode.fromTaskId, target.id);
        }
        break;
    }
  }

  handleCanvasLabelKey(key) {
    const cs = this.canvasState;
    const mode = cs.connectMode;
    if (key === 'ESCAPE') {
      cs.connectMode = ConnectMode.Inactive;
    } else if (key === 'ENTER') {
      // Create connection
      if (this.db) {
        const conn = createConnection(mode.fromTaskId, mode.toTaskId, mode.labelBuf);
        insertConnection(this.db, conn);
        this.refreshTasks();
      }
      cs.connectMode = ConnectMode.Inactive;
    } else if (key === 'BACKSPACE') {
      cs.connectMode = ConnectMode.EnteringLabel(mode.fromTaskId, mode.toTaskId, mode.labelBuf.slice(0, -1));
    } else if (key.length === 1) {
      cs.connectMode = ConnectMode.EnteringLabel(mode.fromTaskId, mode.toTaskId, mode.labelBuf + key);
    }
  }

  handleInputTitleKey(key) {
    if (key === 'ESCAPE') {
      this.inputMode = InputMode.Normal;
      this.inputBuffer = '';
    } else if (key === 'ENTER') {
      if (this.inputBuffer.trim()) {
        if (this.editingTaskId) {
          // Update existing task title
          const task = this.board.tasks.find(t => t.id === this.editingTaskId);
          if (task) {
            task.title = this.inputBuffer.trim();
            task.updatedAt = new Date().toISOString();
            if (this.db) updateTask(this.db, task);
          }
          this.inputMode = InputMode.Normal;
          this.editingTaskId = null;
          this.inputBuffer = '';
          this.refreshTasks();
        } else {
          this.pendingTaskTitle = this.inputBuffer.trim();
          this.inputBuffer = '';
          this.inputMode = InputMode.InputDescription;
        }
      }
    } else if (key === 'BACKSPACE') {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
    } else if (key.length === 1) {
      this.inputBuffer += key;
    }
  }

  handleInputDescriptionKey(key) {
    if (key === 'ESCAPE') {
      this.inputMode = InputMode.Normal;
      this.inputBuffer = '';
      this.pendingTaskTitle = '';
    } else if (key === 'ENTER') {
      this.createNewTask(this.pendingTaskTitle, this.inputBuffer.trim() || null);
      this.inputMode = InputMode.Normal;
      this.inputBuffer = '';
      this.pendingTaskTitle = '';
    } else if (key === 'BACKSPACE') {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
    } else if (key === '#' || key === '@') {
      // Start file search
      this.startFileSearch();
    } else if (key.length === 1) {
      this.inputBuffer += key;
    }
  }

  handleShellPopupKey(key) {
    const popup = this.shellPopup;
    switch (key) {
      case 'CTRL_Q': case 'ESCAPE':
        this.shellPopup = null;
        break;
      case 'CTRL_J': case 'CTRL_N':
        popup.scrollDown();
        break;
      case 'CTRL_K': case 'CTRL_P':
        popup.scrollUp();
        break;
      case 'CTRL_D':
        popup.pageDown();
        break;
      case 'CTRL_U':
        popup.pageUp();
        break;
      case 'CTRL_G':
        popup.jumpToBottom(popup.content.split('\n').length);
        break;
      default:
        // Forward key to tmux
        if (key.length === 1) {
          session.sendKeys(popup.sessionName, key);
        }
        break;
    }
  }

  handleDiffPopupKey(key) {
    switch (key) {
      case 'ESCAPE': this.diffPopup = null; break;
      case 'j': case 'DOWN': this.diffPopup.scrollDown(); break;
      case 'k': case 'UP': this.diffPopup.scrollUp(); break;
      case 'CTRL_D': this.diffPopup.pageDown(); break;
      case 'CTRL_U': this.diffPopup.pageUp(); break;
    }
  }

  handleTaskSearchKey(key) {
    const search = this.taskSearch;
    if (key === 'ESCAPE') {
      this.taskSearch = null;
    } else if (key === 'ENTER') {
      if (search.matches.length > 0) {
        const [id] = search.matches[search.selected];
        this.taskSearch = null;
        this.jumpToTask(id);
      }
    } else if (key === 'DOWN') {
      if (search.selected < search.matches.length - 1) search.selected++;
    } else if (key === 'UP') {
      if (search.selected > 0) search.selected--;
    } else if (key === 'BACKSPACE') {
      search.query = search.query.slice(0, -1);
      this.updateSearchMatches();
    } else if (key.length === 1) {
      search.query += key;
      this.updateSearchMatches();
    }
  }

  handleHtmlPreviewKey(key) {
    switch (key) {
      case 'ESCAPE': this.htmlPreview = null; break;
      case 'j': case 'DOWN': this.htmlPreview.scrollDown(); break;
      case 'k': case 'UP': this.htmlPreview.scrollUp(); break;
      case 'b': this.openHtmlInBrowser(); break;
    }
  }

  handleDeleteConfirmKey(key) {
    if (key === 'y') {
      this.performDeleteTask(this.deleteConfirmPopup.taskId);
      this.deleteConfirmPopup = null;
    } else if (key === 'n' || key === 'ESCAPE') {
      this.deleteConfirmPopup = null;
    }
  }

  handleDoneConfirmKey(key) {
    if (key === 'y') {
      this.performMoveToDone(this.doneConfirmPopup.taskId);
      this.doneConfirmPopup = null;
    } else if (key === 'n' || key === 'ESCAPE') {
      this.doneConfirmPopup = null;
    }
  }

  handleReviewConfirmKey(key) {
    const taskId = this.reviewConfirmPopup.taskId;
    if (key === 'y') {
      this.reviewConfirmPopup = null;
      this.startPrCreation(taskId);
    } else if (key === 'n') {
      this.reviewConfirmPopup = null;
      this.performMoveToReview(taskId, false);
    } else if (key === 'ESCAPE') {
      this.reviewConfirmPopup = null;
    }
  }

  handlePrConfirmKey(key) {
    const popup = this.prConfirmPopup;
    if (key === 'ESCAPE') {
      this.prConfirmPopup = null;
    } else if (key === 'TAB') {
      popup.editingTitle = !popup.editingTitle;
    } else if (key === 'CTRL_S') {
      this.submitPr();
    } else if (key === 'BACKSPACE') {
      if (popup.editingTitle) {
        popup.prTitle = popup.prTitle.slice(0, -1);
      } else {
        popup.prBody = popup.prBody.slice(0, -1);
      }
    } else if (key === 'ENTER' && !popup.editingTitle) {
      popup.prBody += '\n';
    } else if (key.length === 1) {
      if (popup.editingTitle) popup.prTitle += key;
      else popup.prBody += key;
    }
  }

  handlePrStatusKey(key) {
    if (key === 'ENTER' || key === 'ESCAPE') {
      this.prStatusPopup = null;
    }
  }

  // ═══════════════════════════════════════════
  //  ACTIONS
  // ═══════════════════════════════════════════

  startCreateTask() {
    this.inputMode = InputMode.InputTitle;
    this.inputBuffer = '';
    this.editingTaskId = null;
  }

  createNewTask(title, description) {
    if (!this.db) return;
    const agent = this.config.defaultAgent;
    const task = createTask(title, agent, this.projectName);
    if (description) task.description = description;
    insertTask(this.db, task);
    this.refreshTasks();
  }

  openSelectedTask() {
    const task = this.board.selectedTask();
    if (!task) return;

    if (task.status === 'backlog') {
      // Edit the task
      this.editingTaskId = task.id;
      this.inputMode = InputMode.InputTitle;
      this.inputBuffer = task.title;
      return;
    }

    // Open shell popup if session exists, otherwise show task detail
    if (task.sessionName && session.sessionExists(task.sessionName)) {
      this.shellPopup = new ShellPopup(task.sessionName, task.title);
    } else {
      this.taskDetailPopup = new TaskDetailPopup(task);
    }
  }

  /** Open task detail popup (press v for view) */
  viewSelectedTask() {
    const task = this.board.selectedTask();
    if (!task) return;
    this.taskDetailPopup = new TaskDetailPopup(task);
  }

  confirmDeleteTask() {
    const task = this.board.selectedTask();
    if (!task) return;
    this.deleteConfirmPopup = new DeleteConfirmPopup(task.id, task.title);
  }

  performDeleteTask(taskId) {
    if (!this.db) return;
    const task = this.board.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Kill tmux session
    if (task.sessionName) {
      session.killSession(task.sessionName);
    }

    // Remove worktree
    if (task.worktreePath && this.projectPath) {
      try {
        const slug = task.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
        removeWorktree(this.projectPath, slug);
      } catch { /* ignore */ }
    }

    deleteTask(this.db, taskId);
    this.refreshTasks();
  }

  showDiff() {
    const task = this.board.selectedTask();
    if (!task || !task.branchName || !this.projectPath) return;

    try {
      const diff = diffFull(this.projectPath, this.config.baseBranch, task.branchName);
      this.diffPopup = new DiffPopup(task.title, diff || 'No changes');
    } catch (e) {
      this.diffPopup = new DiffPopup(task.title, `Error getting diff: ${e.message}`);
    }
  }

  moveTaskForward() {
    const task = this.board.selectedTask();
    if (!task || !this.db) return;

    const colIdx = COLUMNS.indexOf(task.status);
    if (colIdx >= COLUMNS.length - 1) return;

    const nextStatus = COLUMNS[colIdx + 1];

    switch (nextStatus) {
      case 'planning':
        this.moveToPlanning(task);
        break;
      case 'running':
        this.moveToRunning(task);
        break;
      case 'review':
        this.reviewConfirmPopup = new ReviewConfirmPopup(task.id);
        break;
      case 'done':
        if (task.prNumber) {
          const prState = getPrState(this.projectPath, task.prNumber);
          if (prState === 'open') {
            this.doneConfirmPopup = new DoneConfirmPopup(task.id, task.prNumber, prState);
            return;
          }
        }
        this.performMoveToDone(task.id);
        break;
    }
  }

  moveTaskToRunning() {
    const task = this.board.selectedTask();
    if (!task || !this.db) return;
    if (task.status === 'backlog') {
      this.moveToPlanning(task);
      // Then immediately to running
      this.refreshTasks();
      const updated = this.board.tasks.find(t => t.id === task.id);
      if (updated) this.moveToRunning(updated);
    }
  }

  moveTaskBack() {
    const task = this.board.selectedTask();
    if (!task || !this.db) return;

    const colIdx = COLUMNS.indexOf(task.status);
    if (colIdx <= 0) return;

    // Review -> Running (resume)
    if (task.status === 'review') {
      task.status = 'running';
      task.updatedAt = new Date().toISOString();
      updateTask(this.db, task);
      this.refreshTasks();
    }
  }

  moveToPlanning(task) {
    if (!this.projectPath || !this.db) return;

    const slug = task.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);

    try {
      // Create worktree
      const wtPath = createWorktree(this.projectPath, slug);

      // Initialize worktree
      const warnings = initializeWorktree(
        this.projectPath, wtPath, this.config.copyFiles, this.config.initScript
      );

      // Generate session name
      const sessionName = generateSessionName(task, this.projectName);

      // Build planning prompt
      const prompt = task.description
        ? `Plan the implementation for: ${task.title}\n\nDetails: ${task.description}\n\nAnalyze the codebase and create a detailed plan. Do NOT implement yet.`
        : `Plan the implementation for: ${task.title}\n\nAnalyze the codebase and create a detailed plan. Do NOT implement yet.`;

      // Get agent and spawn session
      const agent = getAgent(task.agent) || getAgent('claude');
      if (agent) {
        const cmd = buildInteractiveCommand(agent, prompt);
        session.spawnSession(sessionName, wtPath, cmd, []);

        // Poll for Claude acceptance prompt (only works with tmux backend)
        if (agent.name === 'claude' && session.getBackend() === 'tmux') {
          this.pollForClaudeAcceptance(sessionName);
        }
      }

      // Update task
      task.status = 'planning';
      task.sessionName = sessionName;
      task.worktreePath = wtPath;
      task.branchName = `task/${slug}`;
      task.updatedAt = new Date().toISOString();
      updateTask(this.db, task);
      this.refreshTasks();
    } catch (e) {
      // Show error in a diff popup as a simple notification
      this.diffPopup = new DiffPopup('Error', `Failed to move to planning: ${e.message}`);
    }
  }

  moveToRunning(task) {
    if (!this.db) return;

    // If already has a session, just update status
    if (task.sessionName && session.sessionExists(task.sessionName)) {
      // Send "proceed with implementation" to Claude
      session.sendKeys(task.sessionName, 'proceed with implementation');
    }

    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    updateTask(this.db, task);
    this.refreshTasks();
  }

  performMoveToReview(taskId, withPr = false) {
    if (!this.db) return;
    const task = this.board.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.status = 'review';
    task.updatedAt = new Date().toISOString();
    updateTask(this.db, task);
    this.refreshTasks();
  }

  startPrCreation(taskId) {
    const task = this.board.tasks.find(t => t.id === taskId);
    if (!task) return;
    this.prConfirmPopup = new PrConfirmPopup(taskId);
    this.prConfirmPopup.prTitle = task.title;
    this.prConfirmPopup.prBody = task.description || '';
  }

  submitPr() {
    const popup = this.prConfirmPopup;
    if (!popup || !this.projectPath) return;

    const task = this.board.tasks.find(t => t.id === popup.taskId);
    if (!task || !task.branchName) return;

    this.prConfirmPopup = null;
    this.prStatusPopup = new PrStatusPopup();

    try {
      // Push branch first
      execSync(`git push -u origin ${task.branchName}`, {
        cwd: this.projectPath,
        stdio: 'pipe',
      });

      const { prNumber, prUrl } = createPr(
        this.projectPath, popup.prTitle, popup.prBody, task.branchName
      );

      task.prNumber = prNumber;
      task.prUrl = prUrl;
      task.status = 'review';
      task.updatedAt = new Date().toISOString();
      if (this.db) updateTask(this.db, task);

      this.prStatusPopup.status = 'success';
      this.prStatusPopup.prUrl = prUrl;
      this.refreshTasks();
    } catch (e) {
      this.prStatusPopup.status = 'error';
      this.prStatusPopup.errorMessage = e.message;
    }
  }

  performMoveToDone(taskId) {
    if (!this.db) return;
    const task = this.board.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Kill tmux session
    if (task.sessionName) {
      session.killSession(task.sessionName);
    }

    // Remove worktree (keep branch)
    if (this.projectPath && task.branchName) {
      const slug = task.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
      try { removeWorktree(this.projectPath, slug); } catch { /* ignore */ }
    }

    task.status = 'done';
    task.sessionName = null;
    task.worktreePath = null;
    task.updatedAt = new Date().toISOString();
    updateTask(this.db, task);
    this.refreshTasks();
  }

  startSearch() {
    this.taskSearch = new TaskSearchState();
  }

  updateSearchMatches() {
    const query = this.taskSearch.query.toLowerCase();
    this.taskSearch.matches = this.board.tasks
      .filter(t => t.title.toLowerCase().includes(query))
      .map(t => [t.id, t.title, t.status]);
    this.taskSearch.selected = 0;
  }

  jumpToTask(taskId) {
    const task = this.board.tasks.find(t => t.id === taskId);
    if (!task) return;
    const colIdx = COLUMNS.indexOf(task.status);
    if (colIdx >= 0) {
      this.board.selectedColumn = colIdx;
      const colTasks = this.board.tasksInColumn(colIdx);
      const rowIdx = colTasks.findIndex(t => t.id === taskId);
      if (rowIdx >= 0) this.board.selectedRow = rowIdx;
    }
    // Open the task
    this.openSelectedTask();
  }

  startCanvasConnect() {
    const tasks = this.board.tasks;
    if (!tasks.length) return;
    const task = tasks[this.canvasState.selectedNode];
    if (task) {
      this.canvasState.connectMode = ConnectMode.SelectingTarget(task.id);
    }
  }

  deleteSelectedConnection() {
    const tasks = this.board.tasks;
    const cs = this.canvasState;
    const task = tasks[cs.selectedNode];
    if (!task || !this.db) return;

    // Find connections involving this task
    const conns = cs.connections.filter(
      c => c.fromTaskId === task.id || c.toTaskId === task.id
    );
    if (conns.length > 0) {
      deleteConnection(this.db, conns[0].id);
      this.refreshTasks();
    }
  }

  saveNodePosition() {
    const task = this.board.tasks[this.canvasState.selectedNode];
    if (task && this.db) {
      updateTaskPosition(this.db, task.id, task.canvasX, task.canvasY);
    }
  }

  showHtmlPreview() {
    const task = this.board.tasks[this.canvasState.selectedNode];
    if (task && task.htmlContent) {
      this.htmlPreview = new HtmlPreviewState(task.title, task.htmlContent);
    }
  }

  openHtmlInBrowser() {
    const task = this.viewMode === ViewMode.Canvas
      ? this.board.tasks[this.canvasState.selectedNode]
      : this.board.selectedTask();
    if (task && task.htmlContent) {
      openInBrowser(task.htmlContent).catch(() => {});
    }
  }

  switchProject(projectPath) {
    this.projectPath = projectPath;
    this.projectName = basename(projectPath);
    this.db = openProjectDb(projectPath);

    const globalConfig = loadGlobalConfig();
    const projectConfig = loadProjectConfig(projectPath);
    this.config = mergeConfig(globalConfig, projectConfig);

    this.refreshTasks();
    this.sidebar.unfocus();
    this.board.selectedColumn = 0;
    this.board.selectedRow = 0;
  }

  // ═══════════════════════════════════════════
  //  SVG EXPORT
  // ═══════════════════════════════════════════

  exportSvg() {
    try {
      let filePath;
      if (this.viewMode === ViewMode.Canvas) {
        filePath = exportCanvasToSvg(
          this.board.tasks, this.canvasState.connections,
          this.config.theme, this.projectName
        );
      } else {
        filePath = exportBoardToSvg(
          this.board.tasks, this.config.theme, this.projectName
        );
      }
      this.diffPopup = new DiffPopup('SVG Exported', `SVG saved to:\n${filePath}\n\nPress Esc to close.`);
      // Also try to open it
      openInBrowser(`file://${filePath}`).catch(() => {});
    } catch (e) {
      this.diffPopup = new DiffPopup('Export Error', `Failed to export SVG: ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════
  //  SESSION MANAGEMENT
  // ═══════════════════════════════════════════

  showSessions() {
    const sessions = session.listSessions();
    if (!sessions.length) {
      this.diffPopup = new DiffPopup('Agent Sessions', 'No active agent sessions.\n\nSessions are created when you move tasks to Planning or Running.');
      return;
    }

    const backendName = session.getBackend();
    let content = `Active sessions (${backendName} backend):\n\n`;
    for (const s of sessions) {
      const age = Math.floor((Date.now() / 1000 - s.created) / 60);
      content += `  ${s.name}`;
      if (s.backend) content += `  [${s.backend}]`;
      content += `\n    Created: ${age}m ago\n\n`;
    }
    if (backendName === 'tmux') {
      content += `\nAttach: tmux -L upfyn attach -t <session>\n`;
      content += `View:   tmux -L upfyn list-sessions`;
    } else if (backendName === 'wt') {
      content += `\nAgent sessions run in separate terminal tabs.\n`;
      content += `Switch tabs to interact with agents directly.`;
    } else {
      content += `\nAgent sessions run as background processes.\n`;
      content += `Output is captured in log files.`;
    }

    this.diffPopup = new DiffPopup('Agent Sessions', content);
  }

  // ═══════════════════════════════════════════
  //  FILE SEARCH
  // ═══════════════════════════════════════════

  startFileSearch() {
    if (!this.projectPath) return;
    this.fileSearch = new FileSearchState();
    this.updateFileSearchMatches();
  }

  updateFileSearchMatches() {
    if (!this.projectPath || !this.fileSearch) return;
    const pattern = this.fileSearch.pattern.toLowerCase();
    try {
      const files = this.walkFiles(this.projectPath, '', 3); // max depth 3
      this.fileSearch.matches = files
        .filter(f => f.toLowerCase().includes(pattern))
        .slice(0, 15);
      this.fileSearch.selected = 0;
    } catch {
      this.fileSearch.matches = [];
    }
  }

  walkFiles(dir, prefix, maxDepth) {
    if (maxDepth <= 0) return [];
    const results = [];
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'target') continue;
        const fullPath = join(dir, entry);
        const relPath = prefix ? `${prefix}/${entry}` : entry;
        try {
          const stat = statSync(fullPath);
          if (stat.isFile()) results.push(relPath);
          else if (stat.isDirectory()) results.push(...this.walkFiles(fullPath, relPath, maxDepth - 1));
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return results;
  }

  handleFileSearchKey(key) {
    const fs = this.fileSearch;
    if (key === 'ESCAPE') {
      this.fileSearch = null;
    } else if (key === 'ENTER') {
      if (fs.matches.length > 0) {
        const file = fs.matches[fs.selected];
        this.inputBuffer += file;
        this.highlightedFilePaths.add(file);
      }
      this.fileSearch = null;
    } else if (key === 'DOWN') {
      if (fs.selected < fs.matches.length - 1) fs.selected++;
    } else if (key === 'UP') {
      if (fs.selected > 0) fs.selected--;
    } else if (key === 'BACKSPACE') {
      fs.pattern = fs.pattern.slice(0, -1);
      this.updateFileSearchMatches();
    } else if (key.length === 1) {
      fs.pattern += key;
      this.updateFileSearchMatches();
    }
  }

  drawFileSearch(width, height) {
    const theme = this.config.theme;
    const fs = this.fileSearch;
    const pw = Math.min(60, width - 4);
    const ph = Math.min(20, height - 4);
    const px = Math.floor((width - pw) / 2) + 1;
    const py = Math.floor((height - ph) / 2) + 1;

    this.drawPopupBox(px, py, pw, ph, ' File Search [Esc]Cancel [Enter]Insert ', theme);

    this.moveTo(px + 1, py + 1);
    this.setColor(theme.color_text);
    term('# ' + fs.pattern + '_');

    for (let i = 0; i < fs.matches.length && i < ph - 3; i++) {
      this.moveTo(px + 1, py + 3 + i);
      const isSelected = i === fs.selected;
      if (isSelected) {
        this.setColor(theme.color_selected);
        term.bold('> ');
      } else {
        term('  ');
      }
      this.setColor(isSelected ? theme.color_text : theme.color_description);
      term(fs.matches[i].slice(0, pw - 4));
    }
  }

  // ═══════════════════════════════════════════
  //  MERMAID IMPORT
  // ═══════════════════════════════════════════

  /** Import a mermaid diagram into the canvas as tasks + connections */
  importMermaid(mermaidText) {
    if (!this.db) return;
    const graph = parseMermaid(mermaidText);
    if (!graph) return;

    const nodeToTaskId = new Map();

    // Create tasks for each node
    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      const task = createTask(node.label, this.config.defaultAgent, this.projectName);
      task.canvasX = (graph.direction === 'LR' ? i : Math.floor(i / 3)) * 36;
      task.canvasY = (graph.direction === 'LR' ? 0 : i % 3) * 10;
      insertTask(this.db, task);
      nodeToTaskId.set(node.id, task.id);
    }

    // Create connections for each edge
    for (const edge of graph.edges) {
      const fromId = nodeToTaskId.get(edge.from);
      const toId = nodeToTaskId.get(edge.to);
      if (fromId && toId) {
        const conn = createConnection(fromId, toId, edge.label);
        insertConnection(this.db, conn);
      }
    }

    this.refreshTasks();
  }

  // ═══════════════════════════════════════════
  //  CLAUDE ACCEPTANCE POLLING
  // ═══════════════════════════════════════════

  /**
   * Poll tmux pane for Claude's "Yes, I accept" prompt,
   * then automatically send acceptance.
   */
  pollForClaudeAcceptance(sessionName) {
    const maxAttempts = 30;
    let attempts = 0;

    const poll = () => {
      if (attempts >= maxAttempts) return;
      attempts++;

      try {
        const output = session.captureOutput(sessionName, 10);
        if (output.includes('Yes, I accept') || output.includes('Do you want to proceed')) {
          session.sendKeys(sessionName, 'y');
          return;
        }
        // Also check for the --dangerously-skip-permissions acceptance
        if (output.includes('accept the risks')) {
          session.sendKeys(sessionName, 'yes');
          return;
        }
      } catch { /* ignore */ }

      setTimeout(poll, 2000);
    };

    // Start polling after a short delay
    setTimeout(poll, 3000);
  }

  // ═══════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════

  moveTo(x, y) {
    if (x >= 1 && y >= 1 && x <= term.width && y <= term.height) {
      term.moveTo(x, y);
    }
  }

  setColor(hex) {
    const rgb = hexToRgb(hex);
    term.colorRgb(rgb.r, rgb.g, rgb.b);
  }
}

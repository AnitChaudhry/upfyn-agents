use crate::db::{Task, TaskConnection, TaskStatus};

/// View mode toggle between board and canvas
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewMode {
    Board,
    Canvas,
}

impl Default for ViewMode {
    fn default() -> Self {
        Self::Board
    }
}

/// Connection drawing mode state
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectMode {
    /// Not drawing a connection
    Inactive,
    /// Selected source task, waiting for target
    SelectingTarget { from_task_id: String },
    /// Selected both, waiting for label input
    EnteringLabel {
        from_task_id: String,
        to_task_id: String,
        label_buf: String,
    },
}

impl Default for ConnectMode {
    fn default() -> Self {
        Self::Inactive
    }
}

/// State for the canvas view
#[derive(Debug)]
pub struct CanvasState {
    /// Viewport pan offset
    pub pan_x: f64,
    pub pan_y: f64,
    /// Zoom level (1.0 = 100%)
    pub zoom: f64,
    /// Index of the currently selected node in the tasks list
    pub selected_node: usize,
    /// Connection drawing mode
    pub connect_mode: ConnectMode,
    /// Cached connections from DB
    pub connections: Vec<TaskConnection>,
}

/// Width/height of task boxes on canvas (in canvas coordinate units)
pub const NODE_WIDTH: f64 = 28.0;
pub const NODE_HEIGHT: f64 = 6.0;
/// Spacing for auto-layout grid
pub const GRID_SPACING_X: f64 = 36.0;
pub const GRID_SPACING_Y: f64 = 10.0;

impl CanvasState {
    pub fn new() -> Self {
        Self {
            pan_x: 0.0,
            pan_y: 0.0,
            zoom: 1.0,
            selected_node: 0,
            connect_mode: ConnectMode::Inactive,
            connections: vec![],
        }
    }

    /// Auto-layout tasks in a grid grouped by status column
    pub fn auto_layout(tasks: &mut [Task]) {
        let columns = TaskStatus::columns();
        for (col_idx, status) in columns.iter().enumerate() {
            let mut row = 0;
            for task in tasks.iter_mut() {
                if task.status == *status {
                    if task.canvas_x == 0.0 && task.canvas_y == 0.0 {
                        task.canvas_x = col_idx as f64 * GRID_SPACING_X;
                        task.canvas_y = row as f64 * GRID_SPACING_Y;
                    }
                    row += 1;
                }
            }
        }
    }

    pub fn zoom_in(&mut self) {
        self.zoom = (self.zoom + 0.1).min(3.0);
    }

    pub fn zoom_out(&mut self) {
        self.zoom = (self.zoom - 0.1).max(0.3);
    }

    pub fn pan(&mut self, dx: f64, dy: f64) {
        self.pan_x += dx;
        self.pan_y += dy;
    }

    /// Move selection to next node
    pub fn select_next(&mut self, total: usize) {
        if total > 0 {
            self.selected_node = (self.selected_node + 1) % total;
        }
    }

    /// Move selection to previous node
    pub fn select_prev(&mut self, total: usize) {
        if total > 0 {
            self.selected_node = if self.selected_node == 0 {
                total - 1
            } else {
                self.selected_node - 1
            };
        }
    }

    /// Find node index closest in the given direction from current selection
    pub fn select_in_direction(&mut self, tasks: &[Task], dx: f64, dy: f64) {
        if tasks.is_empty() {
            return;
        }
        let current = match tasks.get(self.selected_node) {
            Some(t) => (t.canvas_x, t.canvas_y),
            None => return,
        };

        let mut best_idx = self.selected_node;
        let mut best_score = f64::MAX;

        for (i, task) in tasks.iter().enumerate() {
            if i == self.selected_node {
                continue;
            }
            let rel_x = task.canvas_x - current.0;
            let rel_y = task.canvas_y - current.1;

            // Check if this node is roughly in the requested direction
            let dot = rel_x * dx + rel_y * dy;
            if dot <= 0.0 {
                continue;
            }

            let dist = (rel_x * rel_x + rel_y * rel_y).sqrt();
            if dist < best_score {
                best_score = dist;
                best_idx = i;
            }
        }

        self.selected_node = best_idx;
    }

    /// Move the selected task's canvas position
    pub fn move_selected(&self, tasks: &mut [Task], dx: f64, dy: f64) {
        if let Some(task) = tasks.get_mut(self.selected_node) {
            task.canvas_x += dx;
            task.canvas_y += dy;
        }
    }
}

impl Default for CanvasState {
    fn default() -> Self {
        Self::new()
    }
}

use agtx::db::{Task, TaskConnection, TaskStatus};
use agtx::tui::canvas_state::{CanvasState, ConnectMode, ViewMode, NODE_WIDTH, NODE_HEIGHT, GRID_SPACING_X, GRID_SPACING_Y};

fn create_test_task(title: &str, status: TaskStatus) -> Task {
    let mut task = Task::new(title, "claude", "test-project");
    task.status = status;
    task
}

fn create_positioned_task(title: &str, x: f64, y: f64) -> Task {
    let mut task = Task::new(title, "claude", "test-project");
    task.canvas_x = x;
    task.canvas_y = y;
    task
}

// === ViewMode Tests ===

#[test]
fn test_view_mode_default() {
    assert_eq!(ViewMode::default(), ViewMode::Board);
}

// === CanvasState Tests ===

#[test]
fn test_canvas_state_new() {
    let state = CanvasState::new();
    assert_eq!(state.pan_x, 0.0);
    assert_eq!(state.pan_y, 0.0);
    assert_eq!(state.zoom, 1.0);
    assert_eq!(state.selected_node, 0);
    assert_eq!(state.connect_mode, ConnectMode::Inactive);
    assert!(state.connections.is_empty());
}

#[test]
fn test_canvas_state_default() {
    let state = CanvasState::default();
    assert_eq!(state.zoom, 1.0);
}

#[test]
fn test_zoom_in_out() {
    let mut state = CanvasState::new();
    state.zoom_in();
    assert!((state.zoom - 1.1).abs() < 0.01);
    state.zoom_out();
    assert!((state.zoom - 1.0).abs() < 0.01);
}

#[test]
fn test_zoom_bounds() {
    let mut state = CanvasState::new();
    // Zoom in to max
    for _ in 0..50 {
        state.zoom_in();
    }
    assert!(state.zoom <= 3.0);

    // Zoom out to min
    for _ in 0..100 {
        state.zoom_out();
    }
    assert!(state.zoom >= 0.3);
}

#[test]
fn test_pan() {
    let mut state = CanvasState::new();
    state.pan(10.0, 5.0);
    assert_eq!(state.pan_x, 10.0);
    assert_eq!(state.pan_y, 5.0);
    state.pan(-3.0, -2.0);
    assert_eq!(state.pan_x, 7.0);
    assert_eq!(state.pan_y, 3.0);
}

#[test]
fn test_select_next_prev() {
    let mut state = CanvasState::new();

    // With 3 tasks
    state.select_next(3);
    assert_eq!(state.selected_node, 1);
    state.select_next(3);
    assert_eq!(state.selected_node, 2);
    state.select_next(3);
    assert_eq!(state.selected_node, 0); // wraps

    state.select_prev(3);
    assert_eq!(state.selected_node, 2); // wraps back
    state.select_prev(3);
    assert_eq!(state.selected_node, 1);
}

#[test]
fn test_select_next_empty() {
    let mut state = CanvasState::new();
    state.select_next(0); // should not panic
    assert_eq!(state.selected_node, 0);
}

#[test]
fn test_select_in_direction() {
    let mut state = CanvasState::new();
    let tasks = vec![
        create_positioned_task("Left", 0.0, 0.0),
        create_positioned_task("Right", 40.0, 0.0),
        create_positioned_task("Above", 0.0, 20.0),
    ];

    // Starting at task 0 (0,0), move right
    state.select_in_direction(&tasks, 1.0, 0.0);
    assert_eq!(state.selected_node, 1); // should select "Right"

    // From task 1 (40,0), move up (positive y)
    state.select_in_direction(&tasks, 0.0, 1.0);
    assert_eq!(state.selected_node, 2); // should select "Above"
}

#[test]
fn test_select_in_direction_no_match() {
    let mut state = CanvasState::new();
    let tasks = vec![
        create_positioned_task("Only", 0.0, 0.0),
    ];
    state.select_in_direction(&tasks, 1.0, 0.0);
    assert_eq!(state.selected_node, 0); // stays on same
}

#[test]
fn test_move_selected() {
    let mut state = CanvasState::new();
    let mut tasks = vec![
        create_positioned_task("Task", 10.0, 20.0),
    ];
    state.move_selected(&mut tasks, 5.0, -3.0);
    assert_eq!(tasks[0].canvas_x, 15.0);
    assert_eq!(tasks[0].canvas_y, 17.0);
}

#[test]
fn test_auto_layout() {
    let mut tasks = vec![
        create_test_task("Backlog 1", TaskStatus::Backlog),
        create_test_task("Backlog 2", TaskStatus::Backlog),
        create_test_task("Running 1", TaskStatus::Running),
    ];

    CanvasState::auto_layout(&mut tasks);

    // Backlog is column 0
    assert_eq!(tasks[0].canvas_x, 0.0 * GRID_SPACING_X);
    assert_eq!(tasks[0].canvas_y, 0.0 * GRID_SPACING_Y);
    assert_eq!(tasks[1].canvas_x, 0.0 * GRID_SPACING_X);
    assert_eq!(tasks[1].canvas_y, 1.0 * GRID_SPACING_Y);

    // Running is column 2
    assert_eq!(tasks[2].canvas_x, 2.0 * GRID_SPACING_X);
    assert_eq!(tasks[2].canvas_y, 0.0 * GRID_SPACING_Y);
}

#[test]
fn test_auto_layout_preserves_existing_positions() {
    let mut tasks = vec![
        create_positioned_task("Already Positioned", 100.0, 200.0),
    ];
    tasks[0].status = TaskStatus::Backlog;

    CanvasState::auto_layout(&mut tasks);

    // Should not overwrite since canvas_x and canvas_y are not both 0
    assert_eq!(tasks[0].canvas_x, 100.0);
    assert_eq!(tasks[0].canvas_y, 200.0);
}

// === TaskConnection Tests ===

#[test]
fn test_task_connection_new() {
    let conn = TaskConnection::new("task-1", "task-2", "blocks");
    assert!(!conn.id.is_empty());
    assert_eq!(conn.from_task_id, "task-1");
    assert_eq!(conn.to_task_id, "task-2");
    assert_eq!(conn.label, "blocks");
}

#[test]
fn test_task_connection_empty_label() {
    let conn = TaskConnection::new("a", "b", "");
    assert_eq!(conn.label, "");
}

// === ConnectMode Tests ===

#[test]
fn test_connect_mode_default() {
    assert_eq!(ConnectMode::default(), ConnectMode::Inactive);
}

// === Task Model New Fields ===

#[test]
fn test_task_has_canvas_fields() {
    let task = Task::new("Test", "claude", "proj");
    assert_eq!(task.canvas_x, 0.0);
    assert_eq!(task.canvas_y, 0.0);
    assert!(task.html_content.is_none());
}

// === Constants ===

#[test]
fn test_node_dimensions_reasonable() {
    assert!(NODE_WIDTH > 0.0);
    assert!(NODE_HEIGHT > 0.0);
    assert!(GRID_SPACING_X > NODE_WIDTH);
    assert!(GRID_SPACING_Y > NODE_HEIGHT);
}

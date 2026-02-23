use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::widgets::canvas::{Canvas, Context};
use ratatui::widgets::{Block, Borders};
use ratatui::Frame;

use crate::db::Task;

use super::canvas_shapes::{ArrowLine, TaskBox};
use super::canvas_state::{CanvasState, ConnectMode, NODE_HEIGHT, NODE_WIDTH};

/// Color for normal task nodes
const COLOR_NODE: Color = Color::Cyan;
/// Color for the selected task node
const COLOR_SELECTED: Color = Color::Yellow;
/// Color for connection arrows
const COLOR_ARROW: Color = Color::Magenta;
/// Color for the "connecting from" source node highlight
const COLOR_CONNECT_SRC: Color = Color::Green;
/// Color for nodes with HTML content
const COLOR_HTML_BADGE: Color = Color::LightRed;

/// Compute anchor point on the edge of a task box closest to a target point
fn edge_anchor(task: &Task, target_x: f64, target_y: f64) -> (f64, f64) {
    let cx = task.canvas_x + NODE_WIDTH / 2.0;
    let cy = task.canvas_y + NODE_HEIGHT / 2.0;
    let dx = target_x - cx;
    let dy = target_y - cy;

    if dx.abs() < 0.001 && dy.abs() < 0.001 {
        return (cx, cy);
    }

    // Determine which edge the line exits from
    let half_w = NODE_WIDTH / 2.0;
    let half_h = NODE_HEIGHT / 2.0;
    let slope_to_corner = half_h / half_w;
    let slope = if dx.abs() > 0.001 {
        (dy / dx).abs()
    } else {
        f64::MAX
    };

    if slope < slope_to_corner {
        // Exits through left or right edge
        let sign_x = if dx >= 0.0 { 1.0 } else { -1.0 };
        let ex = cx + sign_x * half_w;
        let ey = cy + dy * (half_w / dx.abs());
        (ex, ey)
    } else {
        // Exits through top or bottom edge
        let sign_y = if dy >= 0.0 { 1.0 } else { -1.0 };
        let ey = cy + sign_y * half_h;
        let ex = cx + dx * (half_h / dy.abs());
        (ex, ey)
    }
}

/// Draw the canvas view into a frame area
pub fn draw_canvas(
    f: &mut Frame,
    area: Rect,
    tasks: &[Task],
    state: &CanvasState,
) {
    // Compute canvas bounds with padding
    let margin = 10.0;
    let x_min = state.pan_x - margin;
    let y_min = state.pan_y - margin;
    let canvas_w = (area.width as f64) / state.zoom;
    let canvas_h = (area.height as f64 * 2.0) / state.zoom; // *2 because Braille doubles vertical resolution
    let x_max = x_min + canvas_w;
    let y_max = y_min + canvas_h;

    let mode_label = match &state.connect_mode {
        ConnectMode::Inactive => " Canvas [c]Board [a]Connect [+/-]Zoom ",
        ConnectMode::SelectingTarget { .. } => " SELECT TARGET (Enter=confirm, Esc=cancel) ",
        ConnectMode::EnteringLabel { .. } => " TYPE LABEL (Enter=save, Esc=cancel) ",
    };

    let canvas = Canvas::default()
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(mode_label)
                .border_style(Style::default().fg(Color::DarkGray)),
        )
        .x_bounds([x_min, x_max])
        .y_bounds([y_min, y_max])
        .marker(ratatui::symbols::Marker::Braille)
        .paint(|ctx: &mut Context| {
            // Draw connections first (behind nodes)
            draw_connections(ctx, tasks, state);
            // Draw task nodes
            draw_nodes(ctx, tasks, state);
            // Draw labels on nodes
            draw_labels(ctx, tasks, state);
        });

    f.render_widget(canvas, area);
}

fn draw_connections(ctx: &mut Context, tasks: &[Task], state: &CanvasState) {
    for conn in &state.connections {
        let from = tasks.iter().find(|t| t.id == conn.from_task_id);
        let to = tasks.iter().find(|t| t.id == conn.to_task_id);

        if let (Some(from_task), Some(to_task)) = (from, to) {
            let to_cx = to_task.canvas_x + NODE_WIDTH / 2.0;
            let to_cy = to_task.canvas_y + NODE_HEIGHT / 2.0;
            let from_cx = from_task.canvas_x + NODE_WIDTH / 2.0;
            let from_cy = from_task.canvas_y + NODE_HEIGHT / 2.0;

            let (x1, y1) = edge_anchor(from_task, to_cx, to_cy);
            let (x2, y2) = edge_anchor(to_task, from_cx, from_cy);

            ctx.draw(&ArrowLine {
                x1,
                y1,
                x2,
                y2,
                color: COLOR_ARROW,
            });

            // Draw label at midpoint
            if !conn.label.is_empty() {
                let mid_x = (x1 + x2) / 2.0;
                let mid_y = (y1 + y2) / 2.0;
                ctx.print(mid_x, mid_y, ratatui::text::Line::from(
                    ratatui::text::Span::styled(&conn.label, Style::default().fg(COLOR_ARROW)),
                ));
            }
        }
    }
}

fn draw_nodes(ctx: &mut Context, tasks: &[Task], state: &CanvasState) {
    for (i, task) in tasks.iter().enumerate() {
        let color = node_color(i, task, state);
        ctx.draw(&TaskBox {
            x: task.canvas_x,
            y: task.canvas_y,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            color,
        });
    }
}

fn draw_labels(ctx: &mut Context, tasks: &[Task], state: &CanvasState) {
    for (i, task) in tasks.iter().enumerate() {
        let color = node_color(i, task, state);

        // Task title (truncated to fit box)
        let max_chars = (NODE_WIDTH as usize).saturating_sub(2);
        let title: String = task.title.chars().take(max_chars).collect();
        ctx.print(
            task.canvas_x + 1.0,
            task.canvas_y + NODE_HEIGHT - 2.0,
            ratatui::text::Line::from(ratatui::text::Span::styled(
                title,
                Style::default().fg(color),
            )),
        );

        // Status badge
        let badge = task.status.as_str();
        ctx.print(
            task.canvas_x + 1.0,
            task.canvas_y + 1.0,
            ratatui::text::Line::from(ratatui::text::Span::styled(
                badge,
                Style::default().fg(Color::DarkGray),
            )),
        );

        // HTML badge if task has HTML content
        if task.html_content.is_some() {
            ctx.print(
                task.canvas_x + NODE_WIDTH - 5.0,
                task.canvas_y + 1.0,
                ratatui::text::Line::from(ratatui::text::Span::styled(
                    "HTML",
                    Style::default().fg(COLOR_HTML_BADGE),
                )),
            );
        }
    }
}

fn node_color(index: usize, task: &Task, state: &CanvasState) -> Color {
    // Highlight source node in connect mode
    if let ConnectMode::SelectingTarget { ref from_task_id } = state.connect_mode {
        if task.id == *from_task_id {
            return COLOR_CONNECT_SRC;
        }
    }
    if index == state.selected_node {
        COLOR_SELECTED
    } else {
        COLOR_NODE
    }
}

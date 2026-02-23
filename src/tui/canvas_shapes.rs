use ratatui::style::Color;
use ratatui::widgets::canvas::{Painter, Shape};

/// A rectangle with a centered label (task box on canvas)
pub struct TaskBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub color: Color,
}

impl Shape for TaskBox {
    fn paint(&self, painter: &mut Painter) {
        // Draw top and bottom edges
        let steps = (self.width * 2.0) as usize;
        for i in 0..=steps {
            let px = self.x + (i as f64 * self.width / steps as f64);
            // Top edge
            if let Some((cx, cy)) = painter.get_point(px, self.y + self.height) {
                painter.paint(cx, cy, self.color);
            }
            // Bottom edge
            if let Some((cx, cy)) = painter.get_point(px, self.y) {
                painter.paint(cx, cy, self.color);
            }
        }
        // Draw left and right edges
        let steps_v = (self.height * 2.0) as usize;
        for i in 0..=steps_v {
            let py = self.y + (i as f64 * self.height / steps_v as f64);
            // Left edge
            if let Some((cx, cy)) = painter.get_point(self.x, py) {
                painter.paint(cx, cy, self.color);
            }
            // Right edge
            if let Some((cx, cy)) = painter.get_point(self.x + self.width, py) {
                painter.paint(cx, cy, self.color);
            }
        }
    }
}

/// An arrow line between two points (line + arrowhead)
pub struct ArrowLine {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub color: Color,
}

impl Shape for ArrowLine {
    fn paint(&self, painter: &mut Painter) {
        let dx = self.x2 - self.x1;
        let dy = self.y2 - self.y1;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 0.001 {
            return;
        }

        // Draw the line with small steps
        let steps = (len * 3.0) as usize;
        for i in 0..=steps {
            let t = i as f64 / steps as f64;
            let px = self.x1 + dx * t;
            let py = self.y1 + dy * t;
            if let Some((cx, cy)) = painter.get_point(px, py) {
                painter.paint(cx, cy, self.color);
            }
        }

        // Draw arrowhead (two short lines angled from the endpoint)
        let arrow_len = 2.0_f64.min(len * 0.3);
        let angle = dy.atan2(dx);
        let spread = 0.5; // ~28 degrees

        for &sign in &[-1.0_f64, 1.0] {
            let a = angle + std::f64::consts::PI + sign * spread;
            let ax = self.x2 + arrow_len * a.cos();
            let ay = self.y2 + arrow_len * a.sin();
            let head_steps = (arrow_len * 3.0) as usize;
            for i in 0..=head_steps {
                let t = i as f64 / head_steps as f64;
                let px = self.x2 + (ax - self.x2) * t;
                let py = self.y2 + (ay - self.y2) * t;
                if let Some((cx, cy)) = painter.get_point(px, py) {
                    painter.paint(cx, cy, self.color);
                }
            }
        }
    }
}

/// A small diamond shape (used for connection midpoints or decorators)
pub struct Diamond {
    pub cx: f64,
    pub cy: f64,
    pub size: f64,
    pub color: Color,
}

impl Shape for Diamond {
    fn paint(&self, painter: &mut Painter) {
        let s = self.size;
        let points = [
            (self.cx, self.cy + s),
            (self.cx + s, self.cy),
            (self.cx, self.cy - s),
            (self.cx - s, self.cy),
        ];
        // Draw edges between consecutive diamond vertices
        for i in 0..4 {
            let (x1, y1) = points[i];
            let (x2, y2) = points[(i + 1) % 4];
            let steps = (s * 4.0) as usize;
            for j in 0..=steps {
                let t = j as f64 / steps as f64;
                let px = x1 + (x2 - x1) * t;
                let py = y1 + (y2 - y1) * t;
                if let Some((cx, cy)) = painter.get_point(px, py) {
                    painter.paint(cx, cy, self.color);
                }
            }
        }
    }
}

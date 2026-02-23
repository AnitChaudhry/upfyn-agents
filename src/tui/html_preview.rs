use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;

/// State for the HTML preview popup
#[derive(Debug)]
pub struct HtmlPreviewState {
    pub task_title: String,
    pub html_content: String,
    pub scroll_offset: u16,
    pub rendered_text: String,
}

impl HtmlPreviewState {
    pub fn new(task_title: String, html_content: String) -> Self {
        let rendered_text = render_html_to_text(&html_content);
        Self {
            task_title,
            html_content,
            scroll_offset: 0,
            rendered_text,
        }
    }

    pub fn scroll_down(&mut self) {
        self.scroll_offset = self.scroll_offset.saturating_add(1);
    }

    pub fn scroll_up(&mut self) {
        self.scroll_offset = self.scroll_offset.saturating_sub(1);
    }

    pub fn page_down(&mut self) {
        self.scroll_offset = self.scroll_offset.saturating_add(10);
    }

    pub fn page_up(&mut self) {
        self.scroll_offset = self.scroll_offset.saturating_sub(10);
    }
}

/// Convert HTML to plain text for terminal display
fn render_html_to_text(html: &str) -> String {
    html2text::from_read(html.as_bytes(), 80)
}

/// Open HTML content in the system browser via a temp file
pub fn open_in_browser(html: &str) -> anyhow::Result<()> {
    let tmp_dir = std::env::temp_dir();
    let file_path = tmp_dir.join("agtx_preview.html");
    std::fs::write(&file_path, html)?;
    open::that(&file_path)?;
    Ok(())
}

/// Draw the HTML preview popup
pub fn draw_html_preview(f: &mut Frame, area: Rect, state: &HtmlPreviewState) {
    // Center the popup with some margin
    let popup_area = centered_rect(80, 80, area);

    let title = format!(" HTML Preview: {} [b]Browser [Esc]Close ", state.task_title);
    let lines: Vec<Line> = state
        .rendered_text
        .lines()
        .map(|line| {
            Line::from(Span::styled(
                line.to_string(),
                Style::default().fg(Color::White),
            ))
        })
        .collect();

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(
                    title,
                    Style::default()
                        .fg(Color::LightCyan)
                        .add_modifier(Modifier::BOLD),
                ))
                .border_style(Style::default().fg(Color::Cyan)),
        )
        .wrap(Wrap { trim: false })
        .scroll((state.scroll_offset, 0));

    // Clear the area behind the popup
    f.render_widget(ratatui::widgets::Clear, popup_area);
    f.render_widget(paragraph, popup_area);
}

/// Helper to create a centered rectangle within a given area
fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let popup_width = area.width * percent_x / 100;
    let popup_height = area.height * percent_y / 100;
    let x = area.x + (area.width.saturating_sub(popup_width)) / 2;
    let y = area.y + (area.height.saturating_sub(popup_height)) / 2;
    Rect::new(x, y, popup_width, popup_height)
}

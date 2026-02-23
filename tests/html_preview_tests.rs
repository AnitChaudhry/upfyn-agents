use agtx::tui::html_preview::HtmlPreviewState;

#[test]
fn test_html_preview_state_new() {
    let state = HtmlPreviewState::new(
        "Test Task".to_string(),
        "<h1>Hello</h1><p>World</p>".to_string(),
    );
    assert_eq!(state.task_title, "Test Task");
    assert_eq!(state.scroll_offset, 0);
    assert!(!state.rendered_text.is_empty());
    // Should contain the text content from HTML
    assert!(state.rendered_text.contains("Hello"));
    assert!(state.rendered_text.contains("World"));
}

#[test]
fn test_html_preview_scroll() {
    let mut state = HtmlPreviewState::new(
        "Task".to_string(),
        "<p>Content</p>".to_string(),
    );
    assert_eq!(state.scroll_offset, 0);

    state.scroll_down();
    assert_eq!(state.scroll_offset, 1);

    state.scroll_down();
    assert_eq!(state.scroll_offset, 2);

    state.scroll_up();
    assert_eq!(state.scroll_offset, 1);

    // Should not go below 0
    state.scroll_up();
    state.scroll_up();
    assert_eq!(state.scroll_offset, 0);
}

#[test]
fn test_html_preview_page_scroll() {
    let mut state = HtmlPreviewState::new(
        "Task".to_string(),
        "<p>Content</p>".to_string(),
    );

    state.page_down();
    assert_eq!(state.scroll_offset, 10);

    state.page_down();
    assert_eq!(state.scroll_offset, 20);

    state.page_up();
    assert_eq!(state.scroll_offset, 10);

    // Should not go below 0
    state.page_up();
    state.page_up();
    assert_eq!(state.scroll_offset, 0);
}

#[test]
fn test_html_preview_complex_html() {
    let html = r#"
    <html>
    <body>
        <h1>Title</h1>
        <ul>
            <li>Item 1</li>
            <li>Item 2</li>
        </ul>
        <a href="https://example.com">Link</a>
    </body>
    </html>
    "#;

    let state = HtmlPreviewState::new("Complex".to_string(), html.to_string());
    assert!(state.rendered_text.contains("Title"));
    assert!(state.rendered_text.contains("Item 1"));
    assert!(state.rendered_text.contains("Item 2"));
}

#[test]
fn test_html_preview_empty_html() {
    let state = HtmlPreviewState::new(
        "Empty".to_string(),
        "".to_string(),
    );
    // Should not panic on empty input
    assert_eq!(state.scroll_offset, 0);
}

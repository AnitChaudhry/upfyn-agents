import { convert } from 'html-to-text';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * HTML preview state
 */
export class HtmlPreviewState {
  constructor(taskTitle, htmlContent) {
    this.taskTitle = taskTitle;
    this.htmlContent = htmlContent;
    this.scrollOffset = 0;
    this.renderedText = renderHtmlToText(htmlContent);
  }

  scrollDown() { this.scrollOffset++; }
  scrollUp() { if (this.scrollOffset > 0) this.scrollOffset--; }
  pageDown() { this.scrollOffset += 10; }
  pageUp() { this.scrollOffset = Math.max(0, this.scrollOffset - 10); }
}

/** Convert HTML to plain text for terminal display */
function renderHtmlToText(html) {
  try {
    return convert(html, { wordwrap: 80 });
  } catch {
    return html;
  }
}

/** Open HTML content in the system browser via a temp file */
export async function openInBrowser(html) {
  const filePath = join(tmpdir(), 'upfyn_preview.html');
  writeFileSync(filePath, html);
  const { default: open } = await import('open');
  await open(filePath);
}

/**
 * Lightweight Mermaid flowchart parser.
 * Supports: graph TD/LR, A --> B, A[Label] --> B[Label], A -->|label| B
 */

export const Direction = { TopDown: 'TD', LeftRight: 'LR' };

/** Parse a Mermaid flowchart string into nodes and edges */
export function parseMermaid(input) {
  const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let direction = Direction.TopDown;
  const first = lines[0].toLowerCase();
  if (!first.startsWith('graph') && !first.startsWith('flowchart')) return null;
  if (first.includes('lr') || first.includes('rl')) direction = Direction.LeftRight;

  const nodes = [];
  const edges = [];
  const seen = new Set();

  for (const line of lines.slice(1)) {
    if (line.startsWith('%%') || line.startsWith('style') || line.startsWith('class')) continue;

    const edge = parseEdge(line);
    if (edge) {
      const fromLabel = extractLabel(line, edge.from) || edge.from;
      const toLabel = extractLabel(line, edge.to) || edge.to;
      if (!seen.has(edge.from)) { seen.add(edge.from); nodes.push({ id: edge.from, label: fromLabel }); }
      if (!seen.has(edge.to)) { seen.add(edge.to); nodes.push({ id: edge.to, label: toLabel }); }
      edges.push(edge);
    } else {
      const node = parseStandaloneNode(line);
      if (node && !seen.has(node.id)) { seen.add(node.id); nodes.push(node); }
    }
  }

  if (!nodes.length) return null;
  return { direction, nodes, edges };
}

function parseEdge(line) {
  const arrows = ['--->', '-->', '-.->',  '==>', '---'];
  for (const arrow of arrows) {
    const pos = line.indexOf(arrow);
    if (pos === -1) continue;
    const left = line.slice(0, pos).trim();
    let right = line.slice(pos + arrow.length).trim();
    let label = '';
    if (right.startsWith('|')) {
      const end = right.indexOf('|', 1);
      if (end > 0) {
        label = right.slice(1, end).trim();
        right = right.slice(end + 1).trim();
      }
    }
    const from = extractNodeId(left);
    const to = extractNodeId(right);
    if (from && to) return { from, to, label };
  }
  return null;
}

function extractNodeId(s) {
  s = s.trim();
  if (!s) return null;
  const end = s.search(/[\[{(>/]/);
  const id = (end === -1 ? s : s.slice(0, end)).trim();
  return id || null;
}

function extractLabel(line, nodeId) {
  const pairs = [['[', ']'], ['{', '}'], ['(', ')'], ['>', ']']];
  for (const [open, close] of pairs) {
    const search = nodeId + open;
    const start = line.indexOf(search);
    if (start === -1) continue;
    const labelStart = start + search.length;
    const end = line.indexOf(close, labelStart);
    if (end === -1) continue;
    const label = line.slice(labelStart, end).trim();
    if (label) return label;
  }
  return null;
}

function parseStandaloneNode(line) {
  const id = extractNodeId(line);
  if (!id) return null;
  if (!line.includes('[') && !line.includes('{') && !line.includes('(')) return null;
  const label = extractLabel(line, id) || id;
  return { id, label };
}

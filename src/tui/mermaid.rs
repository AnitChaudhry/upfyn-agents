/// Lightweight Mermaid flowchart parser
/// Supports: graph TD/LR, A --> B, A[Label] --> B[Label], A -->|label| B

/// A parsed node from Mermaid syntax
#[derive(Debug, Clone, PartialEq)]
pub struct MermaidNode {
    pub id: String,
    pub label: String,
}

/// A parsed edge (arrow) from Mermaid syntax
#[derive(Debug, Clone, PartialEq)]
pub struct MermaidEdge {
    pub from: String,
    pub to: String,
    pub label: String,
}

/// Direction of the flowchart
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Direction {
    TopDown,
    LeftRight,
}

/// Parsed Mermaid flowchart
#[derive(Debug, Clone)]
pub struct MermaidGraph {
    pub direction: Direction,
    pub nodes: Vec<MermaidNode>,
    pub edges: Vec<MermaidEdge>,
}

/// Parse a Mermaid flowchart string into nodes and edges
pub fn parse_mermaid(input: &str) -> Option<MermaidGraph> {
    let mut direction = Direction::TopDown;
    let mut nodes: Vec<MermaidNode> = Vec::new();
    let mut edges: Vec<MermaidEdge> = Vec::new();
    let mut seen_nodes: std::collections::HashSet<String> = std::collections::HashSet::new();

    let lines: Vec<&str> = input.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();

    if lines.is_empty() {
        return None;
    }

    // First line should be graph direction
    let first = lines[0].to_lowercase();
    if first.starts_with("graph") || first.starts_with("flowchart") {
        if first.contains("lr") || first.contains("rl") {
            direction = Direction::LeftRight;
        }
        // else default TopDown
    } else {
        return None; // Not a valid mermaid graph
    }

    // Parse remaining lines for edges and nodes
    for line in &lines[1..] {
        // Skip comments and style directives
        if line.starts_with("%%") || line.starts_with("style") || line.starts_with("class") {
            continue;
        }

        // Try to parse as edge: A --> B, A -->|label| B, A --- B
        if let Some(edge) = parse_edge(line) {
            // Register nodes
            let from_label = extract_label(line, &edge.from).unwrap_or_else(|| edge.from.clone());
            let to_label = extract_label(line, &edge.to).unwrap_or_else(|| edge.to.clone());

            if seen_nodes.insert(edge.from.clone()) {
                nodes.push(MermaidNode {
                    id: edge.from.clone(),
                    label: from_label,
                });
            }
            if seen_nodes.insert(edge.to.clone()) {
                nodes.push(MermaidNode {
                    id: edge.to.clone(),
                    label: to_label,
                });
            }
            edges.push(edge);
        } else if let Some(node) = parse_standalone_node(line) {
            // Standalone node definition: A[Label]
            if seen_nodes.insert(node.id.clone()) {
                nodes.push(node);
            }
        }
    }

    if nodes.is_empty() {
        return None;
    }

    Some(MermaidGraph {
        direction,
        nodes,
        edges,
    })
}

/// Parse an edge line like "A --> B" or "A -->|label| B"
fn parse_edge(line: &str) -> Option<MermaidEdge> {
    // Match patterns: -->, --->, ---|label|, -->|label|
    let arrow_patterns = ["-->", "--->", "---", "-.->", "==>"];

    for arrow in &arrow_patterns {
        if let Some(arrow_pos) = line.find(arrow) {
            let left = line[..arrow_pos].trim();
            let right_start = arrow_pos + arrow.len();
            let right_part = line[right_start..].trim();

            // Extract edge label if present: -->|label| or ---|label|
            let (edge_label, target) = if right_part.starts_with('|') {
                if let Some(end_pipe) = right_part[1..].find('|') {
                    let label = right_part[1..1 + end_pipe].trim().to_string();
                    let rest = right_part[2 + end_pipe..].trim();
                    (label, rest)
                } else {
                    (String::new(), right_part)
                }
            } else {
                (String::new(), right_part)
            };

            let from_id = extract_node_id(left)?;
            let to_id = extract_node_id(target)?;

            return Some(MermaidEdge {
                from: from_id,
                to: to_id,
                label: edge_label,
            });
        }
    }

    None
}

/// Extract just the node ID from a node reference like "A" or "A[Some Label]" or "A{Decision}"
fn extract_node_id(s: &str) -> Option<String> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    // Find first bracket/brace/paren
    let id_end = s
        .find(|c: char| c == '[' || c == '{' || c == '(' || c == '>' || c == '/')
        .unwrap_or(s.len());
    let id = s[..id_end].trim();
    if id.is_empty() {
        None
    } else {
        Some(id.to_string())
    }
}

/// Extract label from a node reference like "A[Some Label]"
fn extract_label(line: &str, node_id: &str) -> Option<String> {
    // Find the node_id in the line followed by [label] or {label} or (label)
    let patterns: &[(char, char)] = &[('[', ']'), ('{', '}'), ('(', ')'), ('>', ']')];

    for &(open, close) in patterns {
        let search = format!("{}{}", node_id, open);
        if let Some(start) = line.find(&search) {
            let label_start = start + search.len();
            if let Some(end) = line[label_start..].find(close) {
                let label = line[label_start..label_start + end].trim();
                if !label.is_empty() {
                    return Some(label.to_string());
                }
            }
        }
    }
    None
}

/// Parse a standalone node definition like "A[Label]"
fn parse_standalone_node(line: &str) -> Option<MermaidNode> {
    let id = extract_node_id(line)?;
    let label = extract_label(line, &id).unwrap_or_else(|| id.clone());
    // Only count as standalone if it has a bracket (otherwise it's just an ID which isn't meaningful alone)
    if line.contains('[') || line.contains('{') || line.contains('(') {
        Some(MermaidNode { id, label })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_graph() {
        let input = "graph TD\n    A --> B\n    B --> C";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.direction, Direction::TopDown);
        assert_eq!(graph.nodes.len(), 3);
        assert_eq!(graph.edges.len(), 2);
    }

    #[test]
    fn test_parse_lr_direction() {
        let input = "graph LR\n    A --> B";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.direction, Direction::LeftRight);
    }

    #[test]
    fn test_parse_flowchart_keyword() {
        let input = "flowchart TD\n    A --> B";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.direction, Direction::TopDown);
    }

    #[test]
    fn test_parse_labeled_nodes() {
        let input = "graph TD\n    A[Start] --> B[End]";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.nodes[0].label, "Start");
        assert_eq!(graph.nodes[1].label, "End");
    }

    #[test]
    fn test_parse_edge_labels() {
        let input = "graph TD\n    A -->|yes| B\n    A -->|no| C";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.edges[0].label, "yes");
        assert_eq!(graph.edges[1].label, "no");
    }

    #[test]
    fn test_parse_decision_nodes() {
        let input = "graph TD\n    A{Decision} --> B[Action]";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.nodes[0].id, "A");
        assert_eq!(graph.nodes[0].label, "Decision");
    }

    #[test]
    fn test_dedup_nodes() {
        let input = "graph TD\n    A --> B\n    A --> C\n    B --> C";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.nodes.len(), 3); // A, B, C — no duplicates
        assert_eq!(graph.edges.len(), 3);
    }

    #[test]
    fn test_invalid_input() {
        assert!(parse_mermaid("not a graph").is_none());
        assert!(parse_mermaid("").is_none());
    }

    #[test]
    fn test_skip_comments() {
        let input = "graph TD\n    %% this is a comment\n    A --> B";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.nodes.len(), 2);
    }

    #[test]
    fn test_extract_node_id() {
        assert_eq!(extract_node_id("A"), Some("A".to_string()));
        assert_eq!(extract_node_id("A[Label]"), Some("A".to_string()));
        assert_eq!(extract_node_id("A{Decision}"), Some("A".to_string()));
        assert_eq!(extract_node_id(""), None);
    }

    #[test]
    fn test_complex_graph() {
        let input = r#"graph TD
    Start[User Request] --> Parse{Valid?}
    Parse -->|yes| Process[Process Request]
    Parse -->|no| Error[Show Error]
    Process --> Done[Complete]
    Error --> Done"#;

        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.nodes.len(), 5);
        assert_eq!(graph.edges.len(), 5);
        assert_eq!(graph.nodes[0].label, "User Request");
        assert_eq!(graph.nodes[1].label, "Valid?");
    }
}

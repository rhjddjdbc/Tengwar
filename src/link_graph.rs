use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Serialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub group: usize,
}

#[derive(Serialize)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
}

#[derive(Serialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

fn extract_wikilinks(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if i + 1 < chars.len() && chars[i] == '[' && chars[i + 1] == '[' {
            // find closing ]]
            let mut j = i + 2;
            let mut buf = String::new();
            let mut closed = false;
            while j < chars.len() {
                if j + 1 < chars.len() && chars[j] == ']' && chars[j + 1] == ']' {
                    closed = true;
                    break;
                }
                buf.push(chars[j]);
                j += 1;
            }
            if closed {
                // Support [[target|display]] syntax — take only target part
                let target = buf.split('|').next().unwrap_or("").trim().to_string();
                if !target.is_empty() {
                    out.push(target);
                }
                i = j + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Builds a link graph: nodes = all .md files, edges = wikilinks.
#[tauri::command]
pub fn build_link_graph(root: String) -> Result<GraphData, String> {
    let base = Path::new(&root);
    if !base.is_dir() {
        return Err(format!("Not a folder: {root}"));
    }

    // First pass: collect all files
    let mut files: Vec<(String, String)> = Vec::new(); // (relative_path, display_name)
    let mut stack = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else { continue };
            if file_type.is_dir() {
                if name == ".git"
                    || name == "node_modules"
                    || name == "target"
                    || name.starts_with('.')
                {
                    continue;
                }
                stack.push(path);
            } else if file_type.is_file() {
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                if matches!(ext.as_str(), "md" | "markdown") {
                    let rel = path
                        .strip_prefix(base)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| name.clone());
                    files.push((rel, name));
                }
            }
        }
    }

    // Build lookup by "display name without extension" -> rel_path
    let mut by_name: HashMap<String, String> = HashMap::new();
    for (rel, name) in &files {
        let stem = Path::new(name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| name.clone());
        by_name.insert(stem, rel.clone());
        // also index by full relative path with extension
        by_name.insert(rel.clone(), rel.clone());
    }

    // Second pass: read each file, find wikilinks, build edges
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut edge_set: HashSet<(String, String)> = HashSet::new();
    for (rel, _name) in &files {
        let full_path = base.join(rel);
        let Ok(content) = std::fs::read_to_string(&full_path) else { continue };
        let links = extract_wikilinks(&content);
        for link in links {
            // Resolve link to a target relative path
            let target = if let Some(t) = by_name.get(&link) {
                t.clone()
            } else {
                // Try with .md appended
                let with_ext = format!("{link}.md");
                if let Some(t) = by_name.get(&with_ext) {
                    t.clone()
                } else {
                    // Unknown target — still create a node for it
                    format!("__virtual__{link}")
                }
            };
            if target == *rel {
                continue; // ignore self-links
            }
            let key = (rel.clone(), target.clone());
            if edge_set.insert(key) {
                edges.push(GraphEdge { from: rel.clone(), to: target });
            }
        }
    }

    // Collect all node IDs: real files + virtual nodes from unresolved
    // links. HashSet for membership avoids O(n) Vec::contains inside a
    // loop that runs once per edge.
    let mut seen: HashSet<String> = files.iter().map(|(r, _)| r.clone()).collect();
    let mut node_ids: Vec<String> = files.iter().map(|(r, _)| r.clone()).collect();
    for edge in &edges {
        if seen.insert(edge.to.clone()) {
            node_ids.push(edge.to.clone());
        }
    }

    let nodes: Vec<GraphNode> = node_ids
        .iter()
        .map(|id| {
            let label = if id.starts_with("__virtual__") {
                id.trim_start_matches("__virtual__").to_string()
            } else {
                Path::new(id)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| id.clone())
            };
            // Group by top-level folder
            let group = id.split('/').next().map(|s| s.len()).unwrap_or(0) % 8;
            GraphNode { id: id.clone(), label, group }
        })
        .collect();

    Ok(GraphData { nodes, edges })
}
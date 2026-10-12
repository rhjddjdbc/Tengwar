use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS};

pub(crate) fn render_c4(lines: &[&str]) -> String {
    #[derive(Clone)]
    struct C4Node {
        kind: String,
        alias: String,
        label: String,
        desc: String,
        parent: Option<String>,
    }
    #[derive(Clone)]
    struct Boundary {
        alias: String,
        label: String,
    }
    let mut nodes: Vec<C4Node> = Vec::new();
    let mut boundaries: Vec<Boundary> = Vec::new();
    let mut relations: Vec<(String, String, String)> = Vec::new();
    let mut stack: Vec<String> = Vec::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("C4") || line == "{" || line.starts_with("title") { continue; }
        if line == "}" {
            stack.pop();
            continue;
        }

        if line.starts_with("Container_Boundary(") || line.starts_with("System_Boundary(") {
            let kind = if line.starts_with("Container_Boundary(") { "Container_Boundary" } else { "System_Boundary" };
            let inner = &line[kind.len() + 1..];
            let inner = inner.trim_end_matches('{').trim().trim_end_matches(')');
            let parts = split_quoted(inner);
            if !parts.is_empty() {
                let alias = parts[0].clone();
                let label = parts.get(1).map(|s| s.trim_matches('"').to_string()).unwrap_or_else(|| alias.clone());
                boundaries.push(Boundary { alias: alias.clone(), label });
                stack.push(alias);
            }
            continue;
        }

        for kind in &["Person_Ext", "Person", "SystemDb_Ext", "SystemDb", "System_Ext", "System",
                      "ContainerDb", "Container", "Component"] {
            if line.starts_with(&format!("{kind}(")) {
                let inner = &line[kind.len() + 1..];
                let inner = inner.trim_end_matches(')');
                let parts = split_quoted(inner);
                if !parts.is_empty() {
                    let alias = parts[0].clone();
                    let label = parts.get(1).map(|s| s.trim_matches('"').to_string()).unwrap_or_else(|| alias.clone());
                    let desc = parts.get(2).map(|s| s.trim_matches('"').to_string()).unwrap_or_default();
                    nodes.push(C4Node {
                        kind: kind.to_string(),
                        alias, label, desc,
                        parent: stack.last().cloned(),
                    });
                }
                break;
            }
        }
        if line.starts_with("Rel(") || line.starts_with("Rel_Back(") || line.starts_with("BiRel(") {
            let inner = line.split('(').nth(1).unwrap_or("").trim_end_matches(')');
            let parts = split_quoted(inner);
            if parts.len() >= 3 {
                relations.push((parts[0].clone(), parts[1].clone(), parts[2].trim_matches('"').to_string()));
            }
        }
    }
    if nodes.is_empty() { return err("No C4 elements."); }

    let top_nodes: Vec<&C4Node> = nodes.iter().filter(|n| n.parent.is_none()).collect();
    let box_w: f64 = 220.0;
    let box_h: f64 = 100.0;
    let gap_x: f64 = 70.0;
    let gap_y: f64 = 80.0;
    let pad: f64 = 40.0;

    let cols = ((top_nodes.len() as f64).sqrt().ceil() as usize).clamp(1, 3);
    let rows = (top_nodes.len() + cols - 1) / cols;

    let mut pos: HashMap<String, (f64, f64, f64, f64)> = HashMap::new();
    let mut row_heights = vec![0.0_f64; rows];
    for r in 0..rows {
        for c in 0..cols {
            let i = r * cols + c;
            if i >= top_nodes.len() { break; }
            let n = top_nodes[i];
            let children: Vec<&C4Node> = nodes.iter().filter(|x| x.parent.as_deref() == Some(&n.alias)).collect();
            let h_ = if children.is_empty() {
                box_h
            } else {
                let inner_rows = ((children.len() as f64).sqrt().ceil() as usize).max(1);
                let inner_h = inner_rows as f64 * (box_h + 20.0);
                inner_h.max(box_h + 40.0) + 40.0
            };
            row_heights[r] = row_heights[r].max(h_);
        }
    }

    let mut y = pad;
    for r in 0..rows {
        let mut x = pad;
        for c in 0..cols {
            let i = r * cols + c;
            if i >= top_nodes.len() { break; }
            let n = top_nodes[i];
            let children: Vec<&C4Node> = nodes.iter().filter(|x| x.parent.as_deref() == Some(&n.alias)).collect();
            let h_ = if children.is_empty() {
                box_h
            } else {
                let inner_rows = ((children.len() as f64).sqrt().ceil() as usize).max(1);
                (inner_rows as f64 * (box_h + 20.0)).max(box_h + 40.0) + 40.0
            };
            pos.insert(n.alias.clone(), (x, y, box_w, h_));
            x += box_w + gap_x;
        }
        y += row_heights[r] + gap_y;
    }

    for boundary in &boundaries {
        if let Some(&(bx, by, bw, _)) = pos.get(&boundary.alias) {
            let children: Vec<&C4Node> = nodes.iter().filter(|x| x.parent.as_deref() == Some(&boundary.alias)).collect();
            if children.is_empty() { continue; }
            let inner_rows = ((children.len() as f64).sqrt().ceil() as usize).max(1);
            let inner_cols = ((children.len() + inner_rows - 1) / inner_rows).max(1);
            let inner_box_w = (bw - 40.0) / inner_cols as f64 - 10.0;
            let inner_box_h = 60.0;
            let mut cy = by + 40.0;
            for r in 0..inner_rows {
                let mut cx = bx + 20.0;
                for c in 0..inner_cols {
                    let idx = r * inner_cols + c;
                    if idx >= children.len() { break; }
                    let child = children[idx];
                    pos.insert(child.alias.clone(), (cx, cy, inner_box_w, inner_box_h));
                    cx += inner_box_w + 10.0;
                }
                cy += inner_box_h + 20.0;
            }
        }
    }

    let max_x = pos.values().map(|(x, _, w_, _)| x + w_).fold(0.0_f64, f64::max);
    let max_y = pos.values().map(|(_, y, _, h_)| y + h_).fold(0.0_f64, f64::max);
    let w = max_x + pad;
    let h = max_y + pad;

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);

    for boundary in &boundaries {
        if let Some(&(bx, by, bw, bh)) = pos.get(&boundary.alias) {
            svg.push_str(&format!(
                r##"<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="10" class="d-b4" fill-opacity="0.35" stroke-dasharray="6,4"/>"##
            ));
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="start" font-size="11" font-weight="700" class="d-tm">{}</text>"##,
                bx + 10.0, by + 20.0, esc(&boundary.label)
            ));
        }
    }

    for (from, to, label) in &relations {
        if let (Some(&(ax, ay, aw, ah)), Some(&(bx, by, bw, bh))) = (pos.get(from), pos.get(to)) {
            let x1 = ax + aw / 2.0; let y1 = ay + ah / 2.0;
            let x2 = bx + bw / 2.0; let y2 = by + bh / 2.0;
            svg.push_str(&format!(
                r##"<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="d-l" marker-end="url(#d-arrow)"/>"##
            ));
            if !label.is_empty() {
                svg.push_str(&format!(
                    r##"<text x="{}" y="{}" text-anchor="middle" font-size="10" class="d-tm">{}</text>"##,
                    (x1 + x2) / 2.0, (y1 + y2) / 2.0 - 6.0, esc(label)
                ));
            }
        }
    }

    for n in &nodes {
        if !pos.contains_key(&n.alias) { continue; }
        let (x, y, bw, bh) = pos[&n.alias];
        let is_ext = n.kind.ends_with("_Ext");
        let cls = if is_ext { "d-b2" } else { "d-b" };
        let is_person = n.kind.starts_with("Person");
        let is_db = n.kind.contains("Db");
        if is_person {
            svg.push_str(&format!(
                r##"<ellipse cx="{}" cy="{}" rx="{}" ry="{}" class="{cls}"/>"##,
                x + bw / 2.0, y + bh / 2.0, bw / 2.0, bh / 2.0
            ));
        } else if is_db {
            svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="16" class="{cls}"/>"##));
        } else {
            svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="6" class="{cls}"/>"##));
        }
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="9" font-weight="700" class="d-ta">{}</text>"##,
            x + bw / 2.0, y + 18.0, esc(&n.kind)
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="12.5" font-weight="600" class="d-t">{}</text>"##,
            x + bw / 2.0, y + bh / 2.0 - 2.0, esc(&n.label)
        ));
        if !n.desc.is_empty() {
            let d = if n.desc.chars().count() > 28 { n.desc.chars().take(28).collect::<String>() } else { n.desc.clone() };
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10" class="d-tm">{}</text>"##,
                x + bw / 2.0, y + bh / 2.0 + 14.0, esc(&d)
            ));
        }
    }
    svg.push_str("</svg>");
    svg
}

fn split_quoted(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let mut in_q = false;
    let mut depth: i32 = 0;
    for c in s.chars() {
        if c == '"' { in_q = !in_q; cur.push(c); continue; }
        if !in_q {
            if c == '(' { depth += 1; }
            if c == ')' { depth -= 1; }
            if c == ',' && depth == 0 { parts.push(cur.trim().to_string()); cur.clear(); continue; }
        }
        cur.push(c);
    }
    if !cur.trim().is_empty() { parts.push(cur.trim().to_string()); }
    parts
}
use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS};

#[derive(Clone)]
struct FlowNode {
    label: String,
    shape: String,
    subgraph: Option<String>,
}
#[derive(Clone)]
struct Subgraph {
    id: String,
    label: String,
}

pub(crate) fn render_flowchart(lines: &[&str]) -> String {
    let mut nodes: HashMap<String, FlowNode> = HashMap::new();
    let mut edges: Vec<(String, String, String)> = Vec::new();
    let mut order: Vec<String> = Vec::new();
    let mut subgraphs: Vec<Subgraph> = Vec::new();
    let mut sg_stack: Vec<String> = Vec::new();
    let mut direction = "TD".to_string();
    let mut class_defs: HashMap<String, String> = HashMap::new();
    let mut node_styles: HashMap<String, String> = HashMap::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() { continue; }

        if let Some(rest) = line.strip_prefix("direction ") {
            direction = rest.trim().to_uppercase();
            continue;
        }

        if let Some(rest) = line.strip_prefix("classDef ") {
            if let Some((name, style_part)) = rest.split_once(' ') {
                class_defs.insert(name.trim().to_string(), style_part.trim().to_string());
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("class ") {
            let mut parts = rest.split_whitespace();
            let class_name = parts.next().unwrap_or("").to_string();
            if let Some(style) = class_defs.get(&class_name) {
                for id in parts {
                    node_styles.insert(id.trim_matches(',').to_string(), style.clone());
                }
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("style ") {
            if let Some((id, style_part)) = rest.split_once(' ') {
                node_styles.insert(id.trim().to_string(), style_part.trim().to_string());
            }
            continue;
        }
        if line.starts_with("click ") { continue; }

        if line.starts_with("subgraph") {
            let rest = line.strip_prefix("subgraph").unwrap().trim();
            let (id, label) = if let Some((label, alias)) = rest.split_once(" as ") {
                (alias.trim().to_string(), label.trim().to_string())
            } else if !rest.is_empty() {
                (rest.to_string(), rest.to_string())
            } else {
                (format!("sg{}", subgraphs.len()), String::new())
            };
            subgraphs.push(Subgraph { id: id.clone(), label });
            sg_stack.push(id);
            continue;
        }
        if line == "end" {
            sg_stack.pop();
            continue;
        }

        let parts = split_flow_edges(line);
        for p in &parts {
            if let Some((id, label, shape)) = parse_node(p) {
                if !nodes.contains_key(&id) { order.push(id.clone()); }
                nodes.entry(id.clone()).or_insert(FlowNode {
                    label,
                    shape,
                    subgraph: sg_stack.last().cloned(),
                });
            }
        }
        if parts.len() >= 2 {
            for i in 0..parts.len() - 1 {
                let from = extract_id(&strip_edge_label(&parts[i]));
                let to = extract_id(&strip_edge_label(&parts[i + 1]));
                let label = extract_edge_label(&parts[i + 1]);
                if let (Some(f), Some(t)) = (from, to) {
                    edges.push((f, t, label));
                }
            }
        }
    }

    if order.is_empty() { return err("No flowchart detected."); }

    let box_w: f64 = 170.0;
    let box_h: f64 = 54.0;
    let gap_x: f64 = 70.0;
    let gap_y: f64 = 90.0;
    let pad: f64 = 40.0;
    let sub_pad: f64 = 24.0;

    let cols = ((order.len() as f64).sqrt().ceil() as usize).max(1);
    let rows = (order.len() + cols - 1) / cols;

    let mut pos: HashMap<String, (f64, f64)> = HashMap::new();
    let mut y = pad + 20.0;
    for r in 0..rows {
        let mut x = pad + 20.0;
        for c in 0..cols {
            let i = r * cols + c;
            if i >= order.len() { break; }
            pos.insert(order[i].clone(), (x, y));
            x += box_w + gap_x;
        }
        y += box_h + gap_y;
    }

    let mut sg_bounds: HashMap<String, (f64, f64, f64, f64)> = HashMap::new();
    for node in &order {
        if let Some(ref sg) = nodes[node].subgraph {
            let (nx, ny) = pos[node];
            let entry = sg_bounds.entry(sg.clone()).or_insert((f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY));
            entry.0 = entry.0.min(nx);
            entry.1 = entry.1.min(ny);
            entry.2 = entry.2.max(nx + box_w);
            entry.3 = entry.3.max(ny + box_h);
        }
    }
    for (_, b) in sg_bounds.iter_mut() {
        b.0 -= sub_pad;
        b.1 -= sub_pad + 24.0;
        b.2 += sub_pad;
        b.3 += sub_pad;
    }

    let max_x = pos.values().map(|(x, _)| x + box_w).fold(0.0_f64, f64::max);
    let max_y = pos.values().map(|(_, y)| y + box_h).fold(0.0_f64, f64::max);
    let w = max_x + pad + 20.0;
    let h = max_y + pad + 20.0;

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);

    for sg in &subgraphs {
        if let Some(&(x, y, x2, y2)) = sg_bounds.get(&sg.id) {
            let bw = x2 - x;
            let bh = y2 - y;
            svg.push_str(&format!(
                r##"<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="10" class="d-b4" fill-opacity="0.4"/>"##
            ));
            if !sg.label.is_empty() {
                svg.push_str(&format!(
                    r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" font-weight="600" class="d-tm">{}</text>"##,
                    x + bw / 2.0, y + 16.0, esc(&sg.label)
                ));
            }
        }
    }
    let _ = direction;

    for (f, t, label) in &edges {
        let (ax, ay) = match pos.get(f) { Some(v) => *v, None => continue };
        let (bx, by) = match pos.get(t) { Some(v) => *v, None => continue };
        let cx1 = ax + box_w / 2.0;
        let cy1 = ay + box_h / 2.0;
        let cx2 = bx + box_w / 2.0;
        let cy2 = by + box_h / 2.0;
        svg.push_str(&format!(
            r##"<line x1="{cx1}" y1="{cy1}" x2="{cx2}" y2="{cy2}" class="d-l" marker-end="url(#d-arrow)"/>"##
        ));
        if !label.is_empty() {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="11" class="d-tm">{}</text>"##,
                (cx1 + cx2) / 2.0, (cy1 + cy2) / 2.0 - 6.0, esc(label)
            ));
        }
    }

    for (id, style_str) in &node_styles {
        svg.push_str(&format!(r##"<style>#{id} {{ {style_str} }}</style>"##));
    }

    for id in &order {
        let (x, y) = pos[id];
        let n = &nodes[id];
        let style_attr = if node_styles.contains_key(id.as_str()) {
            format!(r##" style="fill:inherit;stroke:inherit""##)
        } else {
            String::new()
        };
        match n.shape.as_str() {
            "diamond" => {
                let cx = x + box_w / 2.0;
                let cy = y + box_h / 2.0;
                svg.push_str(&format!(
                    r##"<polygon id="{id}" points="{cx},{y} {},{cy} {cx},{} {},{cy}" class="d-b2"{style_attr}/>"##,
                    x + box_w, y + box_h, x
                ));
            }
            "round" => {
                svg.push_str(&format!(
                    r##"<rect id="{id}" x="{x}" y="{y}" width="{box_w}" height="{box_h}" rx="{}" class="d-b3"{style_attr}/>"##,
                    box_h / 2.0
                ));
            }
            "cylinder" => {
                svg.push_str(&format!(
                    r##"<rect id="{id}" x="{x}" y="{y}" width="{box_w}" height="{box_h}" rx="12" class="d-b"{style_attr}/>"##
                ));
                svg.push_str(&format!(
                    r##"<ellipse cx="{}" cy="{}" rx="{}" ry="6" class="d-b"/>"##,
                    x + box_w / 2.0, y, box_w / 2.0
                ));
            }
            "hexagon" => {
                let inset = 18.0;
                svg.push_str(&format!(
                    r##"<polygon id="{id}" points="{},{cy} {},{y} {},{y} {},{cy} {},{y2} {},{y2}" class="d-b"{style_attr}/>"##,
                    x, x + inset, x + box_w - inset, x + box_w,
                    x + box_w - inset, x + inset,
                    cy = y + box_h / 2.0,
                    y2 = y + box_h,
                ));
            }
            _ => {
                svg.push_str(&format!(
                    r##"<rect id="{id}" x="{x}" y="{y}" width="{box_w}" height="{box_h}" rx="10" class="d-b"{style_attr}/>"##
                ));
            }
        }
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="12.5" font-weight="500" class="d-t" pointer-events="none">{}</text>"##,
            x + box_w / 2.0, y + box_h / 2.0 + 5.0, esc(&n.label)
        ));
    }
    svg.push_str("</svg>");
    svg
}

fn split_flow_edges(line: &str) -> Vec<String> {
    let bytes = line.as_bytes();
    let mut parts: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c == '-' || c == '=' {
            let mut j = i;
            while j < bytes.len() && matches!(bytes[j] as char, '-' | '=' | '>' | '.') { j += 1; }
            if j > i + 1 {
                parts.push(cur.clone());
                cur.clear();
                i = j;
                continue;
            }
        }
        cur.push(c);
        i += 1;
    }
    parts.push(cur);
    parts.into_iter().filter(|s| !s.trim().is_empty()).collect()
}

fn strip_edge_label(s: &str) -> String {
    let mut out = String::new();
    let mut in_label = false;
    for c in s.chars() {
        if c == '|' { in_label = !in_label; continue; }
        if !in_label { out.push(c); }
    }
    out.trim().to_string()
}

fn extract_edge_label(s: &str) -> String {
    let mut out = String::new();
    let mut in_label = false;
    for c in s.chars() {
        if c == '|' { in_label = !in_label; continue; }
        if in_label { out.push(c); }
    }
    out.trim().to_string()
}

fn parse_node(s: &str) -> Option<(String, String, String)> {
    let s = s.trim();
    if s.is_empty() { return None; }
    let mut id_end = 0;
    for (i, c) in s.char_indices() {
        if c.is_alphanumeric() || c == '_' { id_end = i + c.len_utf8(); } else { break; }
    }
    if id_end == 0 { return None; }
    let id = &s[..id_end];
    let rest = s[id_end..].trim();
    if rest.is_empty() { return Some((id.into(), id.into(), "rect".into())); }
    let (shape, inner) = if rest.starts_with("([") && rest.ends_with("])") { ("round", &rest[2..rest.len() - 2]) }
        else if rest.starts_with("((") && rest.ends_with("))") { ("round", &rest[2..rest.len() - 2]) }
        else if rest.starts_with("{{") && rest.ends_with("}}") { ("hexagon", &rest[2..rest.len() - 2]) }
        else if rest.starts_with('{') && rest.ends_with('}') { ("diamond", &rest[1..rest.len() - 1]) }
        else if rest.starts_with("[(") && rest.ends_with(")]") { ("cylinder", &rest[2..rest.len() - 2]) }
        else if rest.starts_with('[') && rest.ends_with(']') { ("rect", &rest[1..rest.len() - 1]) }
        else if rest.starts_with('(') && rest.ends_with(')') { ("round", &rest[1..rest.len() - 1]) }
        else { ("rect", id) };
    let label = inner.trim().trim_matches('"').trim();
    Some((id.into(), label.into(), shape.into()))
}

fn extract_id(s: &str) -> Option<String> {
    let id: String = s.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
    if id.is_empty() { None } else { Some(id) }
}
use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS};

#[derive(Clone)]
struct StateNode {
    label: String,
    parent: Option<String>,
    is_composite: bool,
    kind: String,
}

pub(crate) fn render_state(lines: &[&str]) -> String {
    let mut states: HashMap<String, StateNode> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut transitions: Vec<(String, String, String)> = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut state_notes: Vec<(String, String, String)> = Vec::new();

    let ensure = |id: &str,
                  states: &mut HashMap<String, StateNode>,
                  order: &mut Vec<String>,
                  parent: Option<&str>| {
        if !states.contains_key(id) {
            states.insert(id.to_string(), StateNode {
                label: id.to_string(),
                parent: parent.map(|s| s.to_string()),
                is_composite: false,
                kind: String::new(),
            });
            order.push(id.to_string());
        }
    };

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("stateDiagram") || line.starts_with("direction") { continue; }

        if line.starts_with("note ") {
            let rest = &line[5..];
            let lower = rest.to_lowercase();
            let (side, after) = if lower.starts_with("left of ") {
                ("left", &rest[8..])
            } else if lower.starts_with("right of ") {
                ("right", &rest[9..])
            } else {
                continue;
            };
            if let Some(colon) = after.find(':') {
                let target = after[..colon].trim().to_string();
                let text = after[colon + 1..].trim().trim_matches('"').to_string();
                state_notes.push((target, text, side.to_string()));
            }
            continue;
        }

        if line == "}" {
            if let Some(parent) = stack.pop() {
                if let Some(s) = states.get_mut(&parent) { s.is_composite = true; }
            }
            continue;
        }

        if line.ends_with('{') {
            let inner = line.trim_end_matches('{').trim();
            let (id, label) = if let Some(rest) = inner.strip_prefix("state ") {
                if let Some((label, alias)) = rest.split_once(" as ") {
                    (alias.trim().to_string(), label.trim().trim_matches('"').to_string())
                } else {
                    (rest.trim().to_string(), rest.trim().to_string())
                }
            } else {
                (inner.to_string(), inner.to_string())
            };
            let parent = stack.last().cloned();
            ensure(&id, &mut states, &mut order, parent.as_deref());
            if let Some(s) = states.get_mut(&id) {
                s.label = label;
                s.is_composite = true;
            }
            stack.push(id);
            continue;
        }

        if let Some(rest) = line.strip_prefix("state ") {
            if let Some((name, kind_part)) = rest.split_once("<<") {
                let name = name.trim();
                let kind = kind_part.trim_end_matches(">>").trim();
                let parent = stack.last().cloned();
                ensure(name, &mut states, &mut order, parent.as_deref());
                if let Some(s) = states.get_mut(name) { s.kind = kind.to_string(); }
                continue;
            }
        }

        if let Some(idx) = line.find("-->") {
            let from = line[..idx].trim();
            let rest = &line[idx + 3..];
            let (to, label) = if let Some(colon) = rest.find(':') {
                (rest[..colon].trim(), rest[colon + 1..].trim().to_string())
            } else {
                (rest.trim(), String::new())
            };
            if !from.is_empty() && !to.is_empty() {
                let parent = stack.last().cloned();
                ensure(from, &mut states, &mut order, parent.as_deref());
                ensure(to, &mut states, &mut order, parent.as_deref());
                transitions.push((from.into(), to.into(), label));
            }
        }
    }

    if order.is_empty() { return err("No states found."); }

    let top_states: Vec<String> = order.iter().filter(|id| states[*id].parent.is_none()).cloned().collect();

    let box_w: f64 = 190.0;
    let box_h: f64 = 54.0;
    let gap_x: f64 = 80.0;
    let gap_y: f64 = 100.0;
    let pad: f64 = 40.0;

    let cols = ((top_states.len() as f64).sqrt().ceil() as usize).clamp(1, 3);
    let rows = (top_states.len() + cols - 1) / cols;

    let mut pos: HashMap<String, (f64, f64, f64, f64)> = HashMap::new();
    let mut row_heights = vec![0.0_f64; rows];
    for r in 0..rows {
        for c in 0..cols {
            let i = r * cols + c;
            if i >= top_states.len() { break; }
            let id = &top_states[i];
            let children: Vec<&String> = order.iter().filter(|s| states[*s].parent.as_deref() == Some(id.as_str())).collect();
            let h_ = if children.is_empty() { box_h } else { box_h + 40.0 + children.len() as f64 * 40.0 };
            row_heights[r] = row_heights[r].max(h_);
        }
    }
    let mut y = pad;
    for r in 0..rows {
        let mut x = pad;
        for c in 0..cols {
            let i = r * cols + c;
            if i >= top_states.len() { break; }
            let id = &top_states[i];
            let children: Vec<&String> = order.iter().filter(|s| states[*s].parent.as_deref() == Some(id.as_str())).collect();
            let h_ = if children.is_empty() { box_h } else { box_h + 40.0 + children.len() as f64 * 40.0 };
            pos.insert(id.clone(), (x, y, box_w, h_));
            x += box_w + gap_x;
        }
        y += row_heights[r] + gap_y;
    }
    let max_x = pos.values().map(|(x, _, w_, _)| x + w_).fold(0.0_f64, f64::max);
    let max_y = pos.values().map(|(_, y, _, h_)| y + h_).fold(0.0_f64, f64::max);
    let w = max_x + pad;
    let h = max_y + pad;

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);

    // Compute where the line from (cx,cy) toward (fx,fy) exits the
    // rectangle centered at (cx,cy) with half-size (hw,hh). This lets
    // arrows stop at the box edge instead of diving into the center
    // (where they get hidden by the box fill).
    fn edge_point(cx: f64, cy: f64, hw: f64, hh: f64, fx: f64, fy: f64) -> (f64, f64) {
        let dx = fx - cx;
        let dy = fy - cy;
        if dx.abs() < 1e-9 && dy.abs() < 1e-9 { return (cx, cy); }
        let tx = if dx.abs() > 1e-9 { hw / dx.abs() } else { f64::INFINITY };
        let ty = if dy.abs() > 1e-9 { hh / dy.abs() } else { f64::INFINITY };
        let t = tx.min(ty);
        (cx + dx * t, cy + dy * t)
    }

    for (from, to, label) in &transitions {
        // Start state: [*] --> X
        if from == "[*]" {
            if let Some((bx, by, bw, _)) = pos.get(to).copied() {
                let cx = bx + bw / 2.0;
                let cy = by - 20.0;
                let sx = cx - 60.0;
                svg.push_str(&format!(r##"<circle cx="{sx}" cy="{cy}" r="6" class="d-fg"/>"##));
                svg.push_str(&format!(
                    r##"<line x1="{}" y1="{cy}" x2="{cx}" y2="{cy}" class="d-l" marker-end="url(#d-arrow)"/>"##,
                    sx + 6.0
                ));
            }
            continue;
        }
        // End state: X --> [*]
        if to == "[*]" {
            if let Some((ax, ay, aw, ah)) = pos.get(from).copied() {
                let cx = ax + aw / 2.0;
                let cy = ay + ah + 20.0;
                svg.push_str(&format!(
                    r##"<line x1="{cx}" y1="{}" x2="{cx}" y2="{cy}" class="d-l" marker-end="url(#d-arrow)"/>"##,
                    ay + ah
                ));
                svg.push_str(&format!(r##"<circle cx="{cx}" cy="{cy}" r="8" fill="none" class="d-l"/>"##));
                svg.push_str(&format!(r##"<circle cx="{cx}" cy="{cy}" r="5" class="d-fg"/>"##));
            }
            continue;
        }
        // Regular transition. Arrow starts at A's edge toward B's center,
        // ends at B's edge toward A's center. Without this the arrowhead
        // is drawn under B's fill and disappears.
        if let (Some((ax, ay, aw, ah)), Some((bx, by, bw, bh))) =
            (pos.get(from).copied(), pos.get(to).copied())
        {
            let cx1 = ax + aw / 2.0; let cy1 = ay + ah / 2.0;
            let cx2 = bx + bw / 2.0; let cy2 = by + bh / 2.0;

            let (sx, sy) = edge_point(cx1, cy1, aw / 2.0, ah / 2.0, cx2, cy2);
            let (ex, ey) = edge_point(cx2, cy2, bw / 2.0, bh / 2.0, cx1, cy1);

            svg.push_str(&format!(
                r##"<line x1="{sx}" y1="{sy}" x2="{ex}" y2="{ey}" class="d-l" marker-end="url(#d-arrow)"/>"##
            ));
            if !label.is_empty() {
                svg.push_str(&format!(
                    r##"<text x="{}" y="{}" text-anchor="middle" font-size="11" class="d-tm">{}</text>"##,
                    (sx + ex) / 2.0, (sy + ey) / 2.0 - 8.0, esc(label)
                ));
            }
        }
    }

    for id in &top_states {
        let (x, y, w_, h_) = pos[id];
        let node = &states[id];
        let children: Vec<&String> = order.iter().filter(|s| states[*s].parent.as_deref() == Some(id.as_str())).collect();

        match node.kind.as_str() {
            "fork" | "join" => {
                svg.push_str(&format!(r##"<rect x="{x}" y="{}" width="{w_}" height="8" rx="2" class="d-fg"/>"##, y + box_h / 2.0 - 4.0));
            }
            "choice" => {
                let cx = x + w_ / 2.0; let cy = y + box_h / 2.0;
                svg.push_str(&format!(
                    r##"<polygon points="{cx},{} {},{cy} {cx},{} {},{cy}" class="d-b2"/>"##,
                    y, x + w_, y + box_h, x
                ));
            }
            _ => {
                if !children.is_empty() {
                    svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{w_}" height="{h_}" rx="10" class="d-b4"/>"##));
                    svg.push_str(&format!(
                        r##"<line x1="{x}" y1="{}" x2="{}" y2="{}" class="d-l d-thin"/>"##,
                        y + 34.0, x + w_, y + 34.0
                    ));
                    svg.push_str(&format!(
                        r##"<text x="{}" y="{}" text-anchor="middle" font-size="13" font-weight="600" class="d-t">{}</text>"##,
                        x + w_ / 2.0, y + 22.0, esc(&node.label)
                    ));
                    let mut cy = y + 50.0;
                    for child in &children {
                        let child_node = &states[*child];
                        svg.push_str(&format!(
                            r##"<rect x="{}" y="{cy}" width="{}" height="32" rx="16" class="d-b"/>"##,
                            x + 12.0, w_ - 24.0
                        ));
                        svg.push_str(&format!(
                            r##"<text x="{}" y="{}" text-anchor="middle" font-size="11.5" class="d-t">{}</text>"##,
                            x + w_ / 2.0, cy + 20.0, esc(&child_node.label)
                        ));
                        cy += 40.0;
                    }
                } else {
                    svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{w_}" height="{box_h}" rx="27" class="d-b"/>"##));
                    svg.push_str(&format!(
                        r##"<text x="{}" y="{}" text-anchor="middle" font-size="13" font-weight="600" class="d-t">{}</text>"##,
                        x + w_ / 2.0, y + box_h / 2.0 + 5.0, esc(&node.label)
                    ));
                }
            }
        }
    }

    for (target, text, side) in &state_notes {
        if let Some((tx, ty, tw, th)) = pos.get(target).copied() {
            let is_left = side == "left";
            let nw = 140.0;
            let nh = 46.0;
            let nx = if is_left { tx - nw - 20.0 } else { tx + tw + 20.0 };
            let ny = ty + (th - nh) / 2.0;
            svg.push_str(&format!(
                r##"<rect x="{nx}" y="{ny}" width="{nw}" height="{nh}" rx="4" class="d-b2" stroke-dasharray="4,3"/>"##
            ));
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10.5" class="d-t">{}</text>"##,
                nx + nw / 2.0, ny + nh / 2.0 + 4.0, esc(text)
            ));
            let line_x = if is_left { nx + nw } else { nx };
            let anchor_x = if is_left { tx } else { tx + tw };
            svg.push_str(&format!(
                r##"<line x1="{line_x}" y1="{}" x2="{anchor_x}" y2="{}" class="d-l d-dash d-thin"/>"##,
                ny + nh / 2.0, ty + th / 2.0
            ));
        }
    }

    svg.push_str("</svg>");
    svg
}
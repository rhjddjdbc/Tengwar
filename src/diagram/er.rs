use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS, Relation};

pub(crate) fn render_er(lines: &[&str]) -> String {
    let mut entities: HashMap<String, Vec<String>> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut current: Option<String> = None;
    let mut relations: Vec<Relation> = Vec::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line == "erDiagram" { continue; }
        if line.ends_with('{') {
            let name = line.trim_end_matches('{').trim();
            if !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_') {
                entities.entry(name.into()).or_default();
                if !order.contains(&name.to_string()) { order.push(name.into()); }
                current = Some(name.into());
                continue;
            }
        }
        if line == "}" { current = None; continue; }
        if let Some(ref c) = current { entities.get_mut(c).unwrap().push(line.into()); continue; }
        if let Some((from, rest)) = line.split_once(' ') {
            if let Some((card, rest2)) = rest.split_once(' ') {
                if card.contains('-') {
                    let (to, label) = rest2.split_once(':').map(|(a, b)| (a.trim(), b.trim())).unwrap_or((rest2.trim(), ""));
                    if !to.is_empty() && to.chars().all(|c| c.is_alphanumeric() || c == '_') {
                        relations.push(Relation {
                            from: from.into(),
                            op: card.into(),
                            to: to.into(),
                            label: label.into(),
                            from_card: String::new(),
                            to_card: String::new(),
                        });
                    }
                }
            }
        }
    }

    // Mermaid creates entities implicitly when they appear only in a
    // relation. Walk the relations and make sure both endpoints exist
    // as entities, so `A ||--o{ B : "has"` renders two boxes even
    // without explicit `A { … }` blocks.
    for rel in &relations {
        if !entities.contains_key(&rel.from) {
            entities.entry(rel.from.clone()).or_default();
        }
        if !order.contains(&rel.from) {
            order.push(rel.from.clone());
        }
        if !entities.contains_key(&rel.to) {
            entities.entry(rel.to.clone()).or_default();
        }
        if !order.contains(&rel.to) {
            order.push(rel.to.clone());
        }
    }

    if order.is_empty() { return err("No entities found."); }

    let box_w: f64 = 220.0;
    let header_h: f64 = 34.0;
    let attr_h: f64 = 22.0;
    let pad: f64 = 30.0;
    let gap_x: f64 = 100.0;
    let gap_y: f64 = 100.0;

    let cols = ((order.len() as f64).sqrt().ceil() as usize).clamp(1, 3);
    let rows = (order.len() + cols - 1) / cols;
    let heights: Vec<f64> = order.iter().map(|n| {
        let c = entities[n].len() as f64;
        (header_h + 16.0).max(header_h + c * attr_h + 14.0)
    }).collect();

    let mut row_heights = vec![0.0_f64; rows];
    for r in 0..rows {
        for c in 0..cols {
            let i = r * cols + c;
            if i < order.len() { row_heights[r] = row_heights[r].max(heights[i]); }
        }
    }

    let mut pos: HashMap<&str, (f64, f64, f64, f64)> = HashMap::new();
    let mut y = pad;
    for r in 0..rows {
        let mut x = pad;
        for c in 0..cols {
            let i = r * cols + c;
            if i >= order.len() { break; }
            pos.insert(order[i].as_str(), (x, y, box_w, heights[i]));
            x += box_w + gap_x;
        }
        y += row_heights[r] + gap_y;
    }
    let w = pad * 2.0 + cols as f64 * box_w + (cols as f64 - 1.0) * gap_x;
    let h = y - gap_y + pad;

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);

    for rel in &relations {
        let (ax, ay, aw, ah) = match pos.get(rel.from.as_str()) { Some(v) => *v, None => continue };
        let (bx, by, bw, bh) = match pos.get(rel.to.as_str()) { Some(v) => *v, None => continue };
        let cx1 = ax + aw / 2.0; let cy1 = ay + ah / 2.0;
        let cx2 = bx + bw / 2.0; let cy2 = by + bh / 2.0;
        svg.push_str(&format!(
            r##"<line x1="{cx1}" y1="{cy1}" x2="{cx2}" y2="{cy2}" class="d-l2"/>"##
        ));
        if !rel.label.is_empty() {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="11" class="d-tm">{}</text>"##,
                (cx1 + cx2) / 2.0, (cy1 + cy2) / 2.0 - 8.0, esc(&rel.label)
            ));
        }
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="11.5" class="d-ta2 d-mono d-bold">{}</text>"##,
            cx1 + (cx2 - cx1) * 0.15, cy1 + (cy2 - cy1) * 0.15 - 8.0, esc(&rel.op)
        ));
    }

    for name in &order {
        let (x, y, w_, h_) = pos[name.as_str()];
        svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{w_}" height="{h_}" rx="8" class="d-b2"/>"##));
        svg.push_str(&format!(
            r##"<line x1="{x}" y1="{}" x2="{}" y2="{}" class="d-l2 d-thin"/>"##,
            y + header_h, x + w_, y + header_h
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="13.5" font-weight="600" class="d-t">{}</text>"##,
            x + w_ / 2.0, y + 22.0, esc(name)
        ));
        for (idx, attr) in entities[name].iter().enumerate() {
            let is_pk = attr.contains("PK");
            let is_fk = attr.contains("FK");
            let deco = format!(
                "{}{}",
                if is_pk { " [PK]" } else { "" },
                if is_fk { " [FK]" } else { "" }
            );
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" font-size="11.5" class="d-t d-mono">{}{deco}</text>"##,
                x + 14.0, y + header_h + 18.0 + idx as f64 * attr_h, esc(attr)
            ));
        }
    }
    svg.push_str("</svg>");
    svg
}
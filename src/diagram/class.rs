use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS, Relation};

#[derive(Clone)]
struct ClassDef {
    stereotype: Option<String>,
    attrs: Vec<String>,
    is_abstract: bool,
}

pub(crate) fn render_class(lines: &[&str]) -> String {
    let mut classes: HashMap<String, ClassDef> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut relations: Vec<Relation> = Vec::new();
    let mut notes: Vec<(String, String)> = Vec::new();
    let mut current: Option<String> = None;

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line == "classDiagram" { continue; }

        if let Some(rest) = line.strip_prefix("note for ") {
            if let Some((target, text)) = rest.split_once(' ') {
                notes.push((target.trim().into(), text.trim().trim_matches('"').into()));
                continue;
            }
        }

        if let Some(rest) = line.strip_prefix("class ") {
            let has_body = rest.ends_with('{');
            let name = rest.trim_end_matches('{').trim().to_string();
            if name.is_empty() || !name.chars().all(|c| c.is_alphanumeric() || c == '_') { continue; }
            classes.entry(name.clone()).or_insert_with(|| {
                ClassDef { stereotype: None, attrs: Vec::new(), is_abstract: false }
            });
            if !order.contains(&name) { order.push(name.clone()); }
            current = if has_body { Some(name) } else { None };
            continue;
        }
        if line == "}" || line == "{" { current = None; continue; }
        if let Some(ref c) = current {
            let trimmed = line.trim();
            if trimmed.starts_with("<<") && trimmed.ends_with(">>") {
                let stereo = trimmed.trim_matches(|ch| ch == '<' || ch == '>').to_string();
                classes.get_mut(c).unwrap().stereotype = Some(stereo.clone());
                if stereo == "abstract" { classes.get_mut(c).unwrap().is_abstract = true; }
            } else {
                classes.get_mut(c).unwrap().attrs.push(trimmed.to_string());
            }
            continue;
        }

        if let Some(rel) = parse_class_relation(line) {
            relations.push(rel);
        }
    }

    if order.is_empty() { return err("No classes found."); }

    let mut fields_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut methods_map: HashMap<String, Vec<String>> = HashMap::new();
    for name in &order {
        let mut fields = Vec::new();
        let mut methods = Vec::new();
        for attr in &classes[name].attrs {
            if attr.contains('(') && attr.contains(')') {
                methods.push(attr.clone());
            } else {
                fields.push(attr.clone());
            }
        }
        fields_map.insert(name.clone(), fields);
        methods_map.insert(name.clone(), methods);
    }

    let box_w: f64 = 260.0;
    let header_h: f64 = 42.0;
    let attr_h: f64 = 20.0;
    let section_gap: f64 = 6.0;
    let pad: f64 = 30.0;
    let gap_x: f64 = 100.0;
    let gap_y: f64 = 100.0;

    let cols = ((order.len() as f64).sqrt().ceil() as usize).clamp(1, 3);
    let rows = (order.len() + cols - 1) / cols;

    let heights: Vec<f64> = order.iter().map(|n| {
        let nf = fields_map[n].len() as f64;
        let nm = methods_map[n].len() as f64;
        let mut h = header_h + 12.0;
        if nf > 0.0 { h += nf * attr_h + section_gap; }
        if nm > 0.0 { h += nm * attr_h + section_gap; }
        h.max(header_h + 20.0)
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
        let (marker_start, marker_end) = match rel.op.as_str() {
            "<|--" | "--|>" | "<|.." | "..|>" => ("", "d-tri"),
            "*--" | "--*" => ("", "d-arrow"),
            "o--" | "--o" => ("", "d-open"),
            _ => ("", "d-arrow"),
        };
        let dashed = if rel.op.contains("..") { " d-dash" } else { "" };
        let start_attr = if marker_start.is_empty() { String::new() } else { format!(r##" marker-start="url(#{marker_start})""##) };
        svg.push_str(&format!(
            r##"<line x1="{cx1}" y1="{cy1}" x2="{cx2}" y2="{cy2}" class="d-l{dashed}" marker-end="url(#{marker_end})"{start_attr}/>"##
        ));
        if !rel.label.is_empty() {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="11" class="d-tm">{}</text>"##,
                (cx1 + cx2) / 2.0, (cy1 + cy2) / 2.0 - 8.0, esc(&rel.label)
            ));
        }
        if !rel.from_card.is_empty() {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10" class="d-tm d-mono">{}</text>"##,
                cx1 + (cx2 - cx1) * 0.15, cy1 + (cy2 - cy1) * 0.15 - 4.0, esc(&rel.from_card)
            ));
        }
        if !rel.to_card.is_empty() {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10" class="d-tm d-mono">{}</text>"##,
                cx1 + (cx2 - cx1) * 0.85, cy1 + (cy2 - cy1) * 0.85 - 4.0, esc(&rel.to_card)
            ));
        }
    }

    for name in &order {
        let (x, y, w_, h_) = pos[name.as_str()];
        let c = &classes[name];
        let box_cls = if c.is_abstract { "d-b2" } else { "d-b" };
        svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{w_}" height="{h_}" rx="8" class="{box_cls}"/>"##));
        svg.push_str(&format!(
            r##"<line x1="{x}" y1="{}" x2="{}" y2="{}" class="d-l d-thin"/>"##,
            y + header_h, x + w_, y + header_h
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="13.5" font-weight="600" class="d-t">{}</text>"##,
            x + w_ / 2.0, y + 22.0, esc(name)
        ));
        if let Some(ref s) = c.stereotype {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10.5" font-style="italic" class="d-tm">«{}»</text>"##,
                x + w_ / 2.0, y + 36.0, esc(s)
            ));
        }

        let fields = &fields_map[name];
        let methods = &methods_map[name];
        let mut cursor = y + header_h + 14.0;

        if !fields.is_empty() {
            for field in fields {
                svg.push_str(&format!(
                    r##"<text x="{}" y="{cursor}" font-size="11.5" class="d-t d-mono">{}</text>"##,
                    x + 14.0, esc(field)
                ));
                cursor += attr_h;
            }
            cursor += section_gap;
        }

        if !fields.is_empty() && !methods.is_empty() {
            svg.push_str(&format!(
                r##"<line x1="{x}" y1="{}" x2="{}" y2="{}" class="d-lg d-thin"/>"##,
                cursor - section_gap / 2.0, x + w_, cursor - section_gap / 2.0
            ));
        }

        if !methods.is_empty() {
            for method in methods {
                let (left, right) = if let Some(pc) = method.rfind(')') {
                    let l = &method[..=pc];
                    let r = method[pc + 1..].trim();
                    (l.to_string(), r.to_string())
                } else {
                    (method.clone(), String::new())
                };
                svg.push_str(&format!(
                    r##"<text x="{}" y="{cursor}" font-size="11.5" class="d-t d-mono">{}</text>"##,
                    x + 14.0, esc(&left)
                ));
                if !right.is_empty() {
                    svg.push_str(&format!(
                        r##"<text x="{}" y="{cursor}" text-anchor="end" font-size="11" class="d-tm d-mono">{}</text>"##,
                        x + w_ - 14.0, esc(&right)
                    ));
                }
                cursor += attr_h;
            }
        }
    }

    // Notes go *below* their target class, not to the right. Placing them
    // right used to overlap the next grid column, because gap_x (100) is
    // smaller than the note width (160). Below is free: gap_y (100) is
    // reserved vertical spacing.
    for (target, text) in &notes {
        if let Some((tx, ty, tw, th)) = pos.get(target.as_str()).copied() {
            let nw = 180.0_f64.min(tw);
            let nh = 60.0;
            let nx = tx + (tw - nw) / 2.0;
            let ny = ty + th + 16.0;

            svg.push_str(&format!(
                r##"<rect x="{nx}" y="{ny}" width="{nw}" height="{nh}" rx="4" class="d-b2" stroke-dasharray="4,3"/>"##
            ));
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="11" class="d-t">{}</text>"##,
                nx + nw / 2.0, ny + nh / 2.0 + 4.0, esc(text)
            ));
            svg.push_str(&format!(
                r##"<line x1="{}" y1="{}" x2="{}" y2="{ny}" class="d-l d-dash d-thin"/>"##,
                tx + tw / 2.0, ty + th, nx + nw / 2.0
            ));
        }
    }

    svg.push_str("</svg>");
    svg
}

fn parse_class_relation(line: &str) -> Option<Relation> {
    let ops = ["<|--", "--|>", "<|..", "..|>", "<--", "-->", "<..", "..>", "*--", "--*", "o--", "--o", "--"];
    for op in &ops {
        if let Some(idx) = line.find(op) {
            let left = line[..idx].trim();
            let after = &line[idx + op.len()..];
            let (from_name, from_card) = extract_id_and_card_left(left);
            let (to_name, to_card, label) = extract_id_card_and_label_right(after);
            if from_name.is_empty() || to_name.is_empty() { continue; }
            if !from_name.chars().all(|c| c.is_alphanumeric() || c == '_') { continue; }
            if !to_name.chars().all(|c| c.is_alphanumeric() || c == '_') { continue; }
            return Some(Relation {
                from: from_name,
                op: (*op).into(),
                to: to_name,
                label,
                from_card,
                to_card,
            });
        }
    }
    None
}

fn extract_id_and_card_left(s: &str) -> (String, String) {
    let s = s.trim();
    if s.starts_with('"') {
        if let Some(end) = s[1..].find('"') {
            let card = s[1..1 + end].to_string();
            let name = s[end + 2..].trim().to_string();
            return (name, card);
        }
    }
    if let Some(space) = s.rfind('"') {
        if let Some(start) = s[..space].rfind('"') {
            let card = s[start + 1..space].to_string();
            let name = s[..start].trim().to_string();
            return (name, card);
        }
    }
    (s.to_string(), String::new())
}

fn extract_id_card_and_label_right(s: &str) -> (String, String, String) {
    let s = s.trim();
    let (main, label) = if let Some(colon) = s.find(':') {
        (s[..colon].trim(), s[colon + 1..].trim().to_string())
    } else {
        (s, String::new())
    };
    let main = main.trim();
    if main.starts_with('"') {
        if let Some(end) = main[1..].find('"') {
            let card = main[1..1 + end].to_string();
            let name = main[end + 2..].trim().to_string();
            return (name, card, label);
        }
    }
    if main.ends_with('"') {
        if let Some(start) = main[..main.len() - 1].rfind('"') {
            let card = main[start + 1..main.len() - 1].to_string();
            let name = main[..start].trim().to_string();
            return (name, card, label);
        }
    }
    (main.to_string(), String::new(), label)
}
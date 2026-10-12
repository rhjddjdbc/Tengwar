use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS};

pub(crate) fn render_requirement(lines: &[&str]) -> String {
    #[derive(Clone)]
    struct Req { kind: String, name: String, id: String, text: String, risk: String }
    let mut reqs: Vec<Req> = Vec::new();
    let mut current: Option<Req> = None;
    let mut relations: Vec<(String, String, String)> = Vec::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("requirementDiagram") { continue; }
        if line == "}" { if let Some(c) = current.take() { reqs.push(c); } continue; }
        let kinds = ["functionalRequirement", "performanceRequirement", "interfaceRequirement",
                     "physicalRequirement", "designConstraint", "requirement"];
        let mut matched = false;
        for k in &kinds {
            if let Some(rest) = line.strip_prefix(k) {
                let rest = rest.trim();
                if rest.ends_with('{') {
                    let name = rest.trim_end_matches('{').trim().to_string();
                    current = Some(Req { kind: k.to_string(), name, id: String::new(), text: String::new(), risk: String::new() });
                    matched = true; break;
                }
            }
        }
        if matched { continue; }
        if let Some(ref mut c) = current {
            if let Some(v) = line.strip_prefix("id:") { c.id = v.trim().to_string(); }
            else if let Some(v) = line.strip_prefix("text:") { c.text = v.trim().to_string(); }
            else if let Some(v) = line.strip_prefix("risk:") { c.risk = v.trim().to_string(); }
            continue;
        }
        for op in &["- contains ->", "- copies ->", "- derives ->", "- satisfies ->",
                    "- verifies ->", "- refines ->", "- traces ->"] {
            if let Some(idx) = line.find(op) {
                let from = line[..idx].trim().into();
                let to = line[idx + op.len()..].trim().into();
                relations.push((from, to, op.trim_matches('-').trim_matches('>').trim().into()));
                break;
            }
        }
    }
    if let Some(c) = current { reqs.push(c); }
    if reqs.is_empty() { return err("No requirements."); }

    let bw: f64 = 210.0; let bh: f64 = 90.0; let gx: f64 = 50.0; let gy: f64 = 60.0; let pad: f64 = 40.0;
    let cols = ((reqs.len() as f64).sqrt().ceil() as usize).clamp(1, 3);
    let rows = (reqs.len() + cols - 1) / cols;
    let mut pos: HashMap<String, (f64, f64)> = HashMap::new();
    let mut y = pad;
    for r in 0..rows {
        let mut x = pad;
        for c in 0..cols {
            let i = r * cols + c;
            if i >= reqs.len() { break; }
            pos.insert(reqs[i].name.clone(), (x, y));
            x += bw + gx;
        }
        y += bh + gy;
    }
    let w = pad * 2.0 + cols as f64 * bw + (cols - 1) as f64 * gx;
    let h = y - gy + pad;

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);
    for (from, to, label) in &relations {
        if let (Some(&(ax, ay)), Some(&(bx, by))) = (pos.get(from), pos.get(to)) {
            let x1 = ax + bw / 2.0; let y1 = ay + bh / 2.0;
            let x2 = bx + bw / 2.0; let y2 = by + bh / 2.0;
            svg.push_str(&format!(
                r##"<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="d-l d-dash" marker-end="url(#d-arrow)"/>"##
            ));
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10" class="d-tm">{}</text>"##,
                (x1 + x2) / 2.0, (y1 + y2) / 2.0 - 6.0, esc(label)
            ));
        }
    }
    for r in &reqs {
        let (x, y) = pos[&r.name];
        svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="6" class="d-b"/>"##));
        svg.push_str(&format!(
            r##"<rect x="{x}" y="{y}" width="{bw}" height="20" rx="6" class="d-b4" fill-opacity="0.6"/>"##
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" font-size="11" font-weight="700" class="d-ta">{}</text>"##,
            x + 8.0, y + 14.0, esc(&r.kind)
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" font-size="12.5" font-weight="600" class="d-t">{}</text>"##,
            x + 8.0, y + 38.0, esc(&r.name)
        ));
        if !r.id.is_empty() {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" font-size="10" class="d-tm">id: {}</text>"##,
                x + 8.0, y + 54.0, esc(&r.id)
            ));
        }
        if !r.text.is_empty() {
            let t = if r.text.chars().count() > 32 { r.text.chars().take(32).collect::<String>() } else { r.text.clone() };
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" font-size="10" class="d-t">{}</text>"##,
                x + 8.0, y + 70.0, esc(&t)
            ));
        }
    }
    svg.push_str("</svg>");
    svg
}


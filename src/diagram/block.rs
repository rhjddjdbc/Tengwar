use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS};

pub(crate) fn render_block(lines: &[&str]) -> String {
    let mut cols = 3usize;
    let mut blocks: Vec<(String, String)> = Vec::new();
    let mut edges: Vec<(String, String)> = Vec::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("block") { continue; }
        if let Some(c) = line.strip_prefix("columns ") {
            if let Ok(v) = c.trim().parse::<usize>() { cols = v.max(1); }
            continue;
        }
        let tokens = tokenize_blocks(line);
        for tok in &tokens {
            if let Some((id, label)) = parse_block_token(tok) {
                blocks.push((id, label));
            }
        }
        if line.contains("-->") {
            let parts: Vec<&str> = line.split("-->").map(|s| s.trim()).collect();
            if parts.len() == 2 {
                let f = parts[0].split_whitespace().last().unwrap_or("");
                let t = parts[1].split_whitespace().next().unwrap_or("");
                if !f.is_empty() && !t.is_empty() { edges.push((f.into(), t.into())); }
            }
        }
    }
    if blocks.is_empty() { return err("No blocks found."); }

    let box_w: f64 = 180.0;
    let box_h: f64 = 60.0;
    let gap: f64 = 20.0;
    let pad: f64 = 30.0;
    let rows = (blocks.len() + cols - 1) / cols;
    let w = pad * 2.0 + cols as f64 * box_w + (cols - 1) as f64 * gap;
    let h = pad * 2.0 + rows as f64 * box_h + (rows - 1) as f64 * gap;

    let mut pos: HashMap<String, (f64, f64)> = HashMap::new();
    for (i, (id, _)) in blocks.iter().enumerate() {
        let r = i / cols;
        let c = i % cols;
        let x = pad + c as f64 * (box_w + gap);
        let y = pad + r as f64 * (box_h + gap);
        pos.insert(id.clone(), (x, y));
    }

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);

    for (f, t) in &edges {
        if let (Some(&(ax, ay)), Some(&(bx, by))) = (pos.get(f), pos.get(t)) {
            svg.push_str(&format!(
                r##"<line x1="{}" y1="{}" x2="{}" y2="{}" class="d-l" marker-end="url(#d-arrow)"/>"##,
                ax + box_w / 2.0, ay + box_h / 2.0,
                bx + box_w / 2.0, by + box_h / 2.0
            ));
        }
    }
    for (id, label) in &blocks {
        let (x, y) = pos[id];
        svg.push_str(&format!(r##"<rect x="{x}" y="{y}" width="{box_w}" height="{box_h}" rx="8" class="d-b"/>"##));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="12.5" font-weight="500" class="d-t">{}</text>"##,
            x + box_w / 2.0, y + box_h / 2.0 + 5.0, esc(label)
        ));
    }
    svg.push_str("</svg>");
    svg
}

fn tokenize_blocks(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut depth = 0;
    for c in line.chars() {
        match c {
            '[' | '(' | '{' => { depth += 1; cur.push(c); }
            ']' | ')' | '}' => { depth -= 1; cur.push(c); }
            ' ' | '\t' if depth == 0 => {
                if !cur.is_empty() { out.push(cur.clone()); cur.clear(); }
            }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() { out.push(cur); }
    out
}

fn parse_block_token(tok: &str) -> Option<(String, String)> {
    if let Some(bracket_start) = tok.find('[') {
        let id = tok[..bracket_start].trim().to_string();
        let label = tok[bracket_start + 1..].trim_end_matches(']').trim_matches('"').to_string();
        if !id.is_empty() { return Some((id, label)); }
    }
    if let Some(paren_start) = tok.find('(') {
        let id = tok[..paren_start].trim().to_string();
        let label = tok[paren_start + 1..].trim_end_matches(')').trim_matches('"').to_string();
        if !id.is_empty() { return Some((id, label)); }
    }
    if !tok.is_empty() && tok.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Some((tok.into(), tok.into()));
    }
    None
}


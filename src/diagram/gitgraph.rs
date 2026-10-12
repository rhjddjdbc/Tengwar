use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS};

pub(crate) fn render_gitgraph(lines: &[&str]) -> String {
    #[derive(Clone)]
    struct Commit { id: String, branch: String, parents: Vec<String>, tag: String }
    let mut branches: Vec<String> = vec!["main".into()];
    let mut current = "main".to_string();
    let mut commits: Vec<Commit> = Vec::new();
    let mut counter = 0;

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("gitGraph") { continue; }
        if let Some(b) = line.strip_prefix("branch ") {
            let name = b.trim().to_string();
            if !branches.contains(&name) { branches.push(name); }
            continue;
        }
        if let Some(c) = line.strip_prefix("checkout ") {
            current = c.trim().to_string();
            continue;
        }
        if line.starts_with("commit") {
            let id = if line.contains("id:") {
                line.split("id:").nth(1).unwrap_or("").split_whitespace().next().unwrap_or("").trim_matches('"').trim_matches(',').to_string()
            } else {
                counter += 1; format!("c{counter}")
            };
            let tag = if line.contains("tag:") {
                line.split("tag:").nth(1).unwrap_or("")
                    .split_whitespace().next().unwrap_or("")
                    .trim_matches('"').trim_matches(',').to_string()
            } else {
                String::new()
            };
            let parent = commits.iter().rev().find(|c| c.branch == current).map(|c| c.id.clone());
            commits.push(Commit { id, branch: current.clone(), parents: parent.into_iter().collect(), tag });
            continue;
        }
        if line.starts_with("merge") {
            let target = line.split_whitespace().nth(1).unwrap_or("").to_string();
            let mp = commits.iter().rev().find(|c| c.branch == current).map(|c| c.id.clone());
            let tp = commits.iter().rev().find(|c| c.branch == target).map(|c| c.id.clone());
            let mut parents = Vec::new();
            if let Some(p) = mp { parents.push(p); }
            if let Some(p) = tp { parents.push(p); }
            counter += 1;
            commits.push(Commit { id: format!("m{counter}"), branch: current.clone(), parents, tag: String::new() });
        }
    }
    if commits.is_empty() { return err("No commits."); }

    let lw: f64 = 80.0; let rh: f64 = 50.0; let px: f64 = 40.0; let py: f64 = 40.0;
    let w = px * 2.0 + branches.len() as f64 * lw;
    let h = py * 2.0 + commits.len() as f64 * rh + 40.0;

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);
    for (i, b) in branches.iter().enumerate() {
        let x = px + i as f64 * lw + lw / 2.0;
        svg.push_str(&format!(
            r##"<rect x="{}" y="10" width="{}" height="22" rx="11" class="d-b"/>"##,
            x - 35.0, 70.0
        ));
        svg.push_str(&format!(
            r##"<text x="{x}" y="25" text-anchor="middle" font-size="11" font-weight="600" class="d-t">{}</text>"##,
            esc(b)
        ));
        svg.push_str(&format!(
            r##"<line x1="{x}" y1="40" x2="{x}" y2="{}" class="d-lm d-dash-sm"/>"##,
            h - 30.0
        ));
    }
    let mut cp: HashMap<String, (f64, f64)> = HashMap::new();
    for (i, c) in commits.iter().enumerate() {
        let idx = branches.iter().position(|b| b == &c.branch).unwrap_or(0);
        let x = px + idx as f64 * lw + lw / 2.0;
        let y = py + 40.0 + i as f64 * rh;
        cp.insert(c.id.clone(), (x, y));
    }
    for c in &commits {
        let (cx, cy) = cp[&c.id];
        for p in &c.parents {
            if let Some((px_, py_)) = cp.get(p).copied() {
                let mid = (cy + py_) / 2.0;
                svg.push_str(&format!(
                    r##"<path d="M {px_} {py_} C {px_} {mid} {cx} {mid} {cx} {cy}" class="d-l" fill="none" stroke-width="2"/>"##
                ));
            }
        }
    }
    for c in &commits {
        let (x, y) = cp[&c.id];
        let r: f64 = if c.parents.len() > 1 { 9.0 } else { 7.0 };
        svg.push_str(&format!(
            r##"<circle cx="{x}" cy="{y}" r="{r}" class="d-b4" stroke="var(--d-accent)" stroke-width="2"/>"##
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" font-size="11" class="d-t d-mono">{}</text>"##,
            x + 14.0, y + 4.0, esc(&c.id)
        ));
        if !c.tag.is_empty() {
            let tag_w = c.tag.chars().count() as f64 * 7.0 + 16.0;
            let tag_x = x - tag_w - 10.0;
            let tag_y = y - 10.0;
            svg.push_str(&format!(
                r##"<rect x="{tag_x}" y="{tag_y}" width="{tag_w}" height="18" rx="9" class="d-b2"/>"##
            ));
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10" font-weight="700" class="d-ta2">{}</text>"##,
                tag_x + tag_w / 2.0, tag_y + 13.0, esc(&c.tag)
            ));
        }
    }
    svg.push_str("</svg>");
    svg
}


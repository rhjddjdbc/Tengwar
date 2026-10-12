use super::common::{esc, err, svg_start};

pub(crate) fn render_journey(lines: &[&str]) -> String {
    let mut title = String::new();
    let mut sections: Vec<(String, Vec<(String, i32, Vec<String>)>)> = Vec::new();
    let mut cur: Option<(String, Vec<(String, i32, Vec<String>)>)> = None;
    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("journey") { continue; }
        if let Some(t) = line.strip_prefix("title ") { title = t.trim().to_string(); continue; }
        if let Some(s) = line.strip_prefix("section ") {
            if let Some(c) = cur.take() { sections.push(c); }
            cur = Some((s.trim().to_string(), Vec::new()));
            continue;
        }
        let parts: Vec<&str> = line.split(':').map(|s| s.trim()).collect();
        if parts.len() >= 2 {
            if let Ok(score) = parts[0].parse::<i32>() {
                let name = parts[1].to_string();
                let actors: Vec<String> = if parts.len() > 2 {
                    parts[2].split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
                } else { Vec::new() };
                if let Some(ref mut c) = cur { c.1.push((name, score, actors)); }
            }
        }
    }
    if let Some(c) = cur { sections.push(c); }
    if sections.is_empty() { return err("No journey data."); }

    let row_h: f64 = 60.0; let pad: f64 = 40.0; let label_w: f64 = 180.0;
    let total: usize = sections.iter().map(|(_, t)| t.len()).sum();
    let h = pad * 2.0 + sections.len() as f64 * 30.0 + total as f64 * row_h + if title.is_empty() { 0.0 } else { 30.0 };
    let w: f64 = 900.0;

    let mut svg = svg_start(w, h);
    let mut y = pad;
    if !title.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="{y}" text-anchor="middle" font-size="16" font-weight="600" class="d-t">{}</text>"##,
            w / 2.0, esc(&title)
        ));
        y += 40.0;
    }
    let score_colors = ["#ef4444", "#f97316", "#fbbf24", "#84cc16", "#22c55e"];
    for (sname, tasks) in &sections {
        svg.push_str(&format!(
            r##"<text x="{pad}" y="{y}" font-size="13" font-weight="700" class="d-ta">{}</text>"##,
            esc(sname)
        ));
        y += 24.0;
        for (name, score, actors) in tasks {
            let cy = y + row_h / 2.0;
            svg.push_str(&format!(
                r##"<text x="{pad}" y="{}" font-size="13" class="d-t">{}</text>"##,
                cy + 4.0, esc(name)
            ));
            let bx = pad + label_w;
            let bw = 400.0;
            svg.push_str(&format!(
                r##"<rect x="{bx}" y="{}" width="{bw}" height="20" rx="10" class="d-lg"/>"##,
                cy - 10.0
            ));
            let idx = ((*score - 1).clamp(0, 4)) as usize;
            let fw = bw * (*score).clamp(1, 5) as f64 / 5.0;
            svg.push_str(&format!(
                r##"<rect x="{bx}" y="{}" width="{fw}" height="20" rx="10" fill="{}"/>"##,
                cy - 10.0, score_colors[idx]
            ));
            if !actors.is_empty() {
                svg.push_str(&format!(
                    r##"<text x="{}" y="{}" font-size="11" class="d-tm">{}</text>"##,
                    bx + bw + 20.0, cy + 4.0, esc(&actors.join(", "))
                ));
            }
            y += row_h;
        }
        y += 6.0;
    }
    svg.push_str("</svg>");
    svg
}


use super::common::{esc, err, svg_start};

pub(crate) fn render_quadrant(lines: &[&str]) -> String {
    let mut title = String::new();
    let mut x_axis = ("Low".to_string(), "High".to_string());
    let mut y_axis = ("Low".to_string(), "High".to_string());
    let mut quadrants = ["Q1".to_string(), "Q2".to_string(), "Q3".to_string(), "Q4".to_string()];
    let mut points: Vec<(String, f64, f64)> = Vec::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("quadrantChart") { continue; }
        if let Some(t) = line.strip_prefix("title ") { title = t.trim().to_string(); continue; }
        if let Some(x) = line.strip_prefix("x-axis ") {
            let p: Vec<&str> = x.split("-->").map(|s| s.trim()).collect();
            if p.len() == 2 { x_axis = (p[0].into(), p[1].into()); }
            continue;
        }
        if let Some(y) = line.strip_prefix("y-axis ") {
            let p: Vec<&str> = y.split("-->").map(|s| s.trim()).collect();
            if p.len() == 2 { y_axis = (p[0].into(), p[1].into()); }
            continue;
        }
        if let Some(q) = line.strip_prefix("quadrant-") {
            if let Some(colon) = q.find(':') {
                if let Ok(idx) = q[..colon].trim().parse::<usize>() {
                    if (1..=4).contains(&idx) { quadrants[idx - 1] = q[colon + 1..].trim().to_string(); }
                }
            }
            continue;
        }
        if let Some(colon) = line.find(':') {
            let name = line[..colon].trim().to_string();
            let rest = line[colon + 1..].trim();
            if let Some(inner) = rest.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
                let c: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
                if c.len() == 2 {
                    if let (Ok(x), Ok(y)) = (c[0].parse::<f64>(), c[1].parse::<f64>()) {
                        points.push((name, x, y));
                    }
                }
            }
        }
    }
    if points.is_empty() { return err("No points found."); }

    let size: f64 = 500.0;
    let pad: f64 = 60.0;
    let w = size + pad * 2.0;
    let h = size + pad * 2.0 + if title.is_empty() { 0.0 } else { 40.0 };
    let top = pad + if title.is_empty() { 0.0 } else { 40.0 };

    let mut svg = svg_start(w, h);
    if !title.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="30" text-anchor="middle" font-size="16" font-weight="600" class="d-t">{}</text>"##,
            w / 2.0, esc(&title)
        ));
    }
    let qcls = ["d-b4", "d-b2", "d-b3", "d-b"];
    let qpos: [(f64, f64); 4] = [(0.5, 0.0), (0.0, 0.0), (0.0, 0.5), (0.5, 0.5)];
    for i in 0..4 {
        let (xf, yf) = qpos[i];
        let x = pad + xf * size;
        let y = top + yf * size;
        svg.push_str(&format!(
            r##"<rect x="{x}" y="{y}" width="{}" height="{}" class="{}" fill-opacity="0.5"/>"##,
            size / 2.0, size / 2.0, qcls[i]
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" font-weight="700" class="d-tm">{}</text>"##,
            x + size / 4.0, y + 20.0, esc(&quadrants[i])
        ));
    }
    svg.push_str(&format!(
        r##"<line x1="{}" y1="{top}" x2="{}" y2="{}" class="d-lm"/>"##,
        pad + size / 2.0, pad + size / 2.0, top + size
    ));
    svg.push_str(&format!(
        r##"<line x1="{pad}" y1="{}" x2="{}" y2="{}" class="d-lm"/>"##,
        top + size / 2.0, pad + size, top + size / 2.0
    ));
    svg.push_str(&format!(
        r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" class="d-tm">{}</text>"##,
        pad + size / 4.0, top + size + 20.0, esc(&x_axis.0)
    ));
    svg.push_str(&format!(
        r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" class="d-tm">{}</text>"##,
        pad + size * 3.0 / 4.0, top + size + 20.0, esc(&x_axis.1)
    ));
    svg.push_str(&format!(
        r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" class="d-tm" transform="rotate(-90, {}, {})">{}</text>"##,
        pad - 32.0, top + size * 3.0 / 4.0,
        pad - 32.0, top + size * 3.0 / 4.0,
        esc(&y_axis.0)
    ));
    svg.push_str(&format!(
        r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" class="d-tm" transform="rotate(-90, {}, {})">{}</text>"##,
        pad - 32.0, top + size / 4.0,
        pad - 32.0, top + size / 4.0,
        esc(&y_axis.1)
    ));
    for (name, x, y) in &points {
        let px = pad + x.clamp(0.0, 1.0) * size;
        let py = top + (1.0 - y.clamp(0.0, 1.0)) * size;
        svg.push_str(&format!(r##"<circle cx="{px}" cy="{py}" r="6" class="d-b4" stroke="var(--d-accent)"/>"##));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" font-size="11" font-weight="500" class="d-t">{}</text>"##,
            px + 10.0, py + 4.0, esc(name)
        ));
    }
    svg.push_str("</svg>");
    svg
}


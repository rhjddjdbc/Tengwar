use super::common::{esc, err, svg_start};

pub(crate) fn render_pie(lines: &[&str]) -> String {
    let mut title = String::new();
    let mut slices: Vec<(String, f64)> = Vec::new();
    for raw in lines {
        let line = raw.trim();
        if line.is_empty() { continue; }
        if let Some(t) = line.strip_prefix("title ") { title = t.trim().to_string(); continue; }
        if let Some(colon) = line.rfind(':') {
            let label = line[..colon].trim().trim_matches('"').to_string();
            if let Ok(v) = line[colon + 1..].trim().parse::<f64>() { slices.push((label, v)); }
        }
    }
    if slices.is_empty() { return err("No data found."); }
    let total: f64 = slices.iter().map(|(_, v)| v).sum();
    if total <= 0.0 { return err("Total must be > 0."); }

    let colors = ["var(--d-accent)", "var(--d-accent2)", "var(--d-accent3)", "var(--d-box3)", "var(--d-box2)", "var(--d-box4)"];
    let cx: f64 = 220.0; let cy: f64 = 220.0; let r: f64 = 140.0;
    let w: f64 = 640.0; let h: f64 = 480.0;

    let mut svg = svg_start(w, h);
    let mut angle = -std::f64::consts::FRAC_PI_2;
    for (i, (_, v)) in slices.iter().enumerate() {
        let sweep = (v / total) * std::f64::consts::TAU;
        let end = angle + sweep;
        let x1 = cx + r * angle.cos();
        let y1 = cy + r * angle.sin();
        let x2 = cx + r * end.cos();
        let y2 = cy + r * end.sin();
        let large = if sweep > std::f64::consts::PI { 1 } else { 0 };
        let color = colors[i % colors.len()];
        if slices.len() == 1 {
            svg.push_str(&format!(r##"<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}"/>"##));
        } else {
            svg.push_str(&format!(
                r##"<path d="M {cx} {cy} L {x1} {y1} A {r} {r} 0 {large} 1 {x2} {y2} Z" fill="{color}" stroke="var(--d-bg)" stroke-width="2"/>"##
            ));
        }
        angle = end;
    }

    let mut ly: f64 = 60.0;
    for (i, (label, v)) in slices.iter().enumerate() {
        let pct = (v / total) * 100.0;
        let color = colors[i % colors.len()];
        svg.push_str(&format!(r##"<rect x="440" y="{ly}" width="16" height="16" rx="3" fill="{color}"/>"##));
        svg.push_str(&format!(
            r##"<text x="464" y="{}" font-size="13" class="d-t">{} <tspan class="d-tm">({pct:.1}%)</tspan></text>"##,
            ly + 13.0, esc(label)
        ));
        ly += 24.0;
    }

    if !title.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="30" text-anchor="middle" font-size="16" font-weight="600" class="d-t">{}</text>"##,
            w / 2.0, esc(&title)
        ));
    }
    svg.push_str("</svg>");
    svg
}


use super::common::{esc, err, svg_start, MARKER_DEFS};

pub(crate) fn render_xychart(lines: &[&str]) -> String {
    let mut title = String::new();
    let mut x_labels: Vec<String> = Vec::new();
    let mut y_label = String::new();
    let mut y_min: f64 = 0.0;
    let mut y_max: f64 = 100.0;
    let mut series: Vec<(String, Vec<f64>)> = Vec::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("xychart") { continue; }
        if let Some(t) = line.strip_prefix("title ") { title = t.trim().trim_matches('"').to_string(); continue; }
        if let Some(x) = line.strip_prefix("x-axis ") {
            let inner = x.trim().trim_start_matches('[').trim_end_matches(']');
            x_labels = inner.split(',').map(|s| s.trim().trim_matches('"').to_string()).collect();
            continue;
        }
        if let Some(y) = line.strip_prefix("y-axis ") {
            if let Some((label_part, range_part)) = y.split_once(' ') {
                y_label = label_part.trim().trim_matches('"').to_string();
                if let Some((a, b)) = range_part.split_once("-->") {
                    if let Ok(v) = a.trim().parse::<f64>() { y_min = v; }
                    if let Ok(v) = b.trim().parse::<f64>() { y_max = v; }
                }
            }
            continue;
        }
        for (kind, prefix) in &[("bar", "bar "), ("line", "line ")] {
            if let Some(rest) = line.strip_prefix(prefix) {
                let inner = rest.trim().trim_start_matches('[').trim_end_matches(']');
                let values: Vec<f64> = inner.split(',').filter_map(|s| s.trim().parse::<f64>().ok()).collect();
                if !values.is_empty() {
                    series.push((kind.to_string(), values));
                }
                break;
            }
        }
    }
    if series.is_empty() { return err("No data series found."); }

    let chart_w: f64 = 640.0;
    let chart_h: f64 = 360.0;
    let pad_l: f64 = 70.0;
    let pad_r: f64 = 40.0;
    let pad_t: f64 = if title.is_empty() { 40.0 } else { 70.0 };
    let pad_b: f64 = 60.0;
    let w = chart_w + pad_l + pad_r;
    let h = chart_h + pad_t + pad_b;

    let points_count = x_labels.len().max(series[0].1.len()).max(1);
    let step = chart_w / points_count as f64;
    let y_range = (y_max - y_min).max(0.001);
    let to_y = |v: f64| pad_t + chart_h - ((v - y_min) / y_range) * chart_h;

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);

    if !title.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="30" text-anchor="middle" font-size="16" font-weight="600" class="d-t">{}</text>"##,
            w / 2.0, esc(&title)
        ));
    }

    let grid_lines = 5;
    for i in 0..=grid_lines {
        let v = y_min + (y_max - y_min) * (i as f64 / grid_lines as f64);
        let y = to_y(v);
        svg.push_str(&format!(
            r##"<line x1="{pad_l}" y1="{y}" x2="{}" y2="{y}" class="d-lg d-thin d-dash-sm"/>"##,
            pad_l + chart_w
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="end" font-size="10" class="d-tm">{:.0}</text>"##,
            pad_l - 8.0, y + 4.0, v
        ));
    }

    for (i, label) in x_labels.iter().enumerate() {
        let x = pad_l + step * (i as f64 + 0.5);
        svg.push_str(&format!(
            r##"<text x="{x}" y="{}" text-anchor="middle" font-size="10" class="d-tm">{}</text>"##,
            pad_t + chart_h + 20.0, esc(label)
        ));
    }
    if !y_label.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="{pad_t}" text-anchor="end" font-size="11" class="d-tm">{}</text>"##,
            pad_l - 8.0, esc(&y_label)
        ));
    }

    let bar_w = (step * 0.6).max(4.0);
    for (kind, values) in &series {
        if kind != "bar" { continue; }
        for (i, v) in values.iter().enumerate() {
            let x = pad_l + step * i as f64 + (step - bar_w) / 2.0;
            let y = to_y(*v);
            let bh = (pad_t + chart_h) - y;
            svg.push_str(&format!(
                r##"<rect x="{x}" y="{y}" width="{bar_w}" height="{bh}" rx="3" class="d-b" fill-opacity="0.85"/>"##
            ));
        }
    }

    for (kind, values) in &series {
        if kind != "line" { continue; }
        let mut path = String::new();
        for (i, v) in values.iter().enumerate() {
            let x = pad_l + step * (i as f64 + 0.5);
            let y = to_y(*v);
            if i == 0 { path.push_str(&format!("M {x} {y}")); }
            else { path.push_str(&format!(" L {x} {y}")); }
        }
        svg.push_str(&format!(r##"<path d="{path}" class="d-l d-thick"/>"##));
        for (i, v) in values.iter().enumerate() {
            let x = pad_l + step * (i as f64 + 0.5);
            let y = to_y(*v);
            svg.push_str(&format!(r##"<circle cx="{x}" cy="{y}" r="4" class="d-b"/>"##));
        }
    }

    svg.push_str(&format!(
        r##"<line x1="{pad_l}" y1="{}" x2="{pad_l}" y2="{}" class="d-lm"/>"##,
        pad_t + chart_h, pad_t
    ));
    svg.push_str(&format!(
        r##"<line x1="{pad_l}" y1="{}" x2="{}" y2="{}" class="d-lm"/>"##,
        pad_t + chart_h, pad_l + chart_w, pad_t + chart_h
    ));

    svg.push_str("</svg>");
    svg
}


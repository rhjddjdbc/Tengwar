use super::common::{esc, err, svg_start};

pub(crate) fn render_packet(lines: &[&str]) -> String {
    let mut fields: Vec<(i32, i32, String)> = Vec::new();
    let mut title = String::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("packet") { continue; }
        if let Some(t) = line.strip_prefix("title ") { title = t.trim().to_string(); continue; }
        if let Some(colon) = line.find(':') {
            let range = line[..colon].trim();
            let label = line[colon + 1..].trim().trim_matches('"').to_string();
            if let Some((a, b)) = range.split_once('-') {
                if let (Ok(a), Ok(b)) = (a.trim().parse::<i32>(), b.trim().parse::<i32>()) {
                    fields.push((a, b, label));
                }
            }
        }
    }
    if fields.is_empty() { return err("No fields found."); }

    let max_bit = fields.iter().map(|(_, b, _)| *b).max().unwrap_or(31);
    let total_bits = (max_bit + 1) as f64;
    let bit_w: f64 = 24.0;
    let field_h: f64 = 60.0;
    let pad: f64 = 40.0;
    let top = if title.is_empty() { pad } else { pad + 40.0 };

    let w = pad * 2.0 + total_bits * bit_w;
    let h = top + field_h + 40.0;

    let mut svg = svg_start(w, h);
    if !title.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="30" text-anchor="middle" font-size="16" font-weight="600" class="d-t">{}</text>"##,
            w / 2.0, esc(&title)
        ));
    }

    let ruler_y = top - 6.0;
    for b in 0..=max_bit {
        if b % 8 == 0 {
            let x = pad + b as f64 * bit_w;
            svg.push_str(&format!(
                r##"<line x1="{x}" y1="{}" x2="{x}" y2="{}" class="d-lm d-thin"/>"##,
                ruler_y, top + field_h + 8.0
            ));
            svg.push_str(&format!(
                r##"<text x="{x}" y="{}" text-anchor="middle" font-size="10" class="d-tm">{b}</text>"##,
                ruler_y - 4.0
            ));
        }
    }

    for (a, b, label) in &fields {
        let x = pad + *a as f64 * bit_w;
        let bw = (*b - *a + 1) as f64 * bit_w;
        svg.push_str(&format!(
            r##"<rect x="{x}" y="{top}" width="{bw}" height="{field_h}" class="d-b" stroke-width="1"/>"##
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="10.5" class="d-tm d-mono">{}–{}</text>"##,
            x + bw / 2.0, top + 18.0, a, b
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="11.5" font-weight="600" class="d-t">{}</text>"##,
            x + bw / 2.0, top + 40.0, esc(label)
        ));
    }
    svg.push_str("</svg>");
    svg
}


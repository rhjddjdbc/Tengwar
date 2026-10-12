use super::common::{esc, err, svg_start};

pub(crate) fn render_kanban(lines: &[&str]) -> String {
    let mut columns: Vec<(String, Vec<String>)> = Vec::new();
    let mut current: Option<(String, Vec<String>)> = None;

    for raw in lines {
        if raw.trim().is_empty() || raw.trim() == "kanban" { continue; }
        let indent = raw.chars().take_while(|c| c.is_whitespace()).count();
        let name = raw.trim().to_string();
        if name.is_empty() { continue; }
        if indent == 0 {
            if let Some(c) = current.take() { columns.push(c); }
            current = Some((name, Vec::new()));
        } else if let Some(ref mut c) = current {
            c.1.push(name);
        }
    }
    if let Some(c) = current { columns.push(c); }
    if columns.is_empty() { return err("No kanban data."); }

    let col_w: f64 = 220.0;
    let col_gap: f64 = 20.0;
    let card_h: f64 = 40.0;
    let card_gap: f64 = 8.0;
    let pad: f64 = 30.0;
    let header_h: f64 = 36.0;

    let max_cards = columns.iter().map(|(_, c)| c.len()).max().unwrap_or(0);
    let col_h = header_h + 12.0 + max_cards as f64 * (card_h + card_gap);
    let w = pad * 2.0 + columns.len() as f64 * col_w + (columns.len() - 1) as f64 * col_gap;
    let h = pad * 2.0 + col_h;

    let mut svg = svg_start(w, h);

    for (i, (name, cards)) in columns.iter().enumerate() {
        let x = pad + i as f64 * (col_w + col_gap);
        svg.push_str(&format!(
            r##"<rect x="{x}" y="{pad}" width="{col_w}" height="{col_h}" rx="10" class="d-bg" stroke="var(--d-grid)"/>"##
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" font-weight="700" class="d-ta">{}</text>"##,
            x + col_w / 2.0, pad + 22.0, esc(name)
        ));
        let mut cy = pad + header_h;
        for card in cards {
            svg.push_str(&format!(
                r##"<rect x="{}" y="{cy}" width="{}" height="{card_h}" rx="6" class="d-b"/>"##,
                x + 10.0, col_w - 20.0
            ));
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" font-size="11.5" class="d-t">{}</text>"##,
                x + 20.0, cy + 24.0, esc(card)
            ));
            cy += card_h + card_gap;
        }
    }
    svg.push_str("</svg>");
    svg
}


use super::common::{esc, err, svg_start};

pub(crate) fn render_timeline(lines: &[&str]) -> String {
    let mut title = String::new();
    let mut sections: Vec<(String, Vec<(String, Vec<String>)>)> = Vec::new();
    let mut cur_section: Option<(String, Vec<(String, Vec<String>)>)> = None;
    let mut cur_period: Option<(String, Vec<String>)> = None;
    let mut free: Vec<(String, Vec<String>)> = Vec::new();

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("timeline") { continue; }
        if let Some(t) = line.strip_prefix("title ") { title = t.trim().to_string(); continue; }
        if let Some(s) = line.strip_prefix("section ") {
            if let Some(c) = cur_section.take() { sections.push(c); }
            cur_section = Some((s.trim().to_string(), Vec::new()));
            cur_period = None;
            continue;
        }
        if let Some(colon) = line.find(':') {
            if let Some(p) = cur_period.take() {
                if let Some(c) = cur_section.as_mut() { c.1.push(p); } else { free.push(p); }
            }
            let period = line[..colon].trim().to_string();
            let events: Vec<String> = line[colon + 1..].split(':').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            cur_period = Some((period, events));
        }
    }
    if let Some(p) = cur_period { if let Some(c) = cur_section.as_mut() { c.1.push(p); } else { free.push(p); } }
    if let Some(c) = cur_section { sections.push(c); }
    if sections.is_empty() && !free.is_empty() { sections.push((String::new(), free)); }
    if sections.is_empty() { return err("No timeline data."); }

    let mut all: Vec<(String, Vec<String>, Option<String>)> = Vec::new();
    for (sname, periods) in &sections {
        for (p, evs) in periods {
            all.push((p.clone(), evs.clone(), if sname.is_empty() { None } else { Some(sname.clone()) }));
        }
    }

    // ── Layout ────────────────────────────────────────────────
    // Vertical bands, top to bottom:
    //   [title band]   ← only if title present
    //   [above blocks] ← even-index periods
    //   [timeline line + circles]
    //   [below blocks] ← odd-index periods
    //
    // The above-block band used to overlap the title. Now the title
    // gets its own reserved strip and ytop is pushed down accordingly.
    let cw: f64 = 200.0;
    let ch: f64 = 90.0;
    let gap: f64 = 20.0;
    let pad: f64 = 40.0;

    let title_present = !title.is_empty();
    let title_band: f64 = if title_present { 40.0 } else { 0.0 };
    let top_pad: f64 = title_band + 20.0;

    let above_y  = top_pad;
    let line_y   = above_y + ch + 25.0;
    let below_y  = line_y + 25.0;

    let w = pad * 2.0 + all.len() as f64 * cw + (all.len().saturating_sub(1)) as f64 * gap;
    let h = below_y + ch + pad;

    let mut svg = svg_start(w, h);

    if title_present {
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="16" font-weight="600" class="d-t">{}</text>"##,
            w / 2.0, 30.0, esc(&title)
        ));
    }

    // Timeline axis.
    svg.push_str(&format!(
        r##"<line x1="{pad}" y1="{line_y}" x2="{}" y2="{line_y}" class="d-l d-thick"/>"##,
        w - pad
    ));

    for (i, (period, events, section)) in all.iter().enumerate() {
        let x = pad + i as f64 * (cw + gap);

        // Circle marker sits on the axis.
        svg.push_str(&format!(
            r##"<circle cx="{}" cy="{line_y}" r="6" class="d-fg"/>"##,
            x + cw / 2.0
        ));

        // Block alternates above / below the axis.
        let cy = if i % 2 == 0 { above_y } else { below_y };

        svg.push_str(&format!(
            r##"<rect x="{x}" y="{cy}" width="{cw}" height="{ch}" rx="8" class="d-b"/>"##
        ));
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="13" font-weight="700" class="d-ta">{}</text>"##,
            x + cw / 2.0, cy + 20.0, esc(period)
        ));
        if let Some(s) = section {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="10" class="d-tm">{}</text>"##,
                x + cw / 2.0, cy + 34.0, esc(s)
            ));
        }
        for (j, ev) in events.iter().enumerate().take(3) {
            svg.push_str(&format!(
                r##"<text x="{}" y="{}" text-anchor="middle" font-size="11" class="d-t">• {}</text>"##,
                x + cw / 2.0, cy + 52.0 + j as f64 * 14.0, esc(ev)
            ));
        }
    }

    svg.push_str("</svg>");
    svg
}
use super::common::{esc, err, svg_start};

pub(crate) fn render_gantt(lines: &[&str]) -> String {
    #[derive(Clone)]
    struct Task { name: String, start: f64, dur: f64, section: String, tag: String, milestone: bool }

    let mut title = String::new();
    let mut tasks: Vec<Task> = Vec::new();
    let mut cur_section = String::new();
    let mut day = 0.0_f64;
    let mut base_date: Option<(i32, i32, i32)> = None;
    let mut date_format = "%Y-%m-%d".to_string();
    let mut today_marker = true;

    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("gantt") || line.starts_with("excludes") { continue; }
        if let Some(t) = line.strip_prefix("title ") { title = t.trim().to_string(); continue; }
        if let Some(s) = line.strip_prefix("section ") { cur_section = s.trim().to_string(); continue; }
        if let Some(f) = line.strip_prefix("dateFormat ") { date_format = f.trim().to_string(); continue; }
        if let Some(t) = line.strip_prefix("todayMarker ") {
            today_marker = !t.trim().eq_ignore_ascii_case("off");
            continue;
        }
        if line.starts_with("axisFormat") { continue; }

        if let Some(colon) = line.find(':') {
            let name_part = line[..colon].trim().to_string();
            let rest = &line[colon + 1..];
            let parts: Vec<&str> = rest.split(',').map(|s| s.trim()).collect();

            let mut start_opt: Option<f64> = None;
            let mut dur: f64 = 0.0;
            let mut tag = String::new();
            let mut milestone = false;

            for p in &parts {
                if p.is_empty() { continue; }
                if *p == "milestone" { milestone = true; continue; }
                if matches!(*p, "done" | "active" | "crit") { tag = p.to_string(); continue; }
                if let Some(dstr) = p.strip_suffix('d') {
                    if let Ok(v) = dstr.parse::<f64>() { dur = v; }
                    continue;
                }
                if let Some(rest2) = p.strip_prefix("after ") {
                    if let Some(prev) = tasks.iter().find(|t| t.name == rest2.trim()) {
                        start_opt = Some(prev.start + prev.dur);
                    }
                    continue;
                }
                if let Some(parsed) = parse_date(p) {
                    if base_date.is_none() { base_date = Some(parsed); }
                    if let Some(bd) = base_date {
                        start_opt = Some(date_to_days_diff(parsed, bd));
                    }
                    continue;
                }
            }

            let start = start_opt.unwrap_or_else(|| {
                if let Some(last) = tasks.last() { (last.start + last.dur).max(day) } else { 0.0 }
            });
            if !name_part.is_empty() && (dur > 0.0 || milestone) {
                tasks.push(Task { name: name_part, start, dur, section: cur_section.clone(), tag, milestone });
                if !milestone { day = day.max(start + dur); }
            }
        }
    }
    if tasks.is_empty() { return err("No tasks found."); }

    let total_days = tasks.iter().map(|t| t.start + t.dur).fold(0.0_f64, f64::max).max(1.0);
    let day_w: f64 = 28.0;
    let row_h: f64 = 30.0;
    let label_w: f64 = 200.0;
    let pad_top: f64 = 70.0;
    let pad_left = label_w + 30.0;
    let chart_w = total_days * day_w;
    let w = pad_left + chart_w + 40.0;
    let h = pad_top + tasks.len() as f64 * row_h + 40.0;

    let mut svg = svg_start(w, h);

    if !title.is_empty() {
        svg.push_str(&format!(
            r##"<text x="{}" y="26" text-anchor="middle" font-size="16" font-weight="600" class="d-t">{}</text>"##,
            w / 2.0, esc(&title)
        ));
    }

    let ndays = total_days.ceil() as usize;
    let has_dates = base_date.is_some();
    for d in 0..=ndays {
        let x = pad_left + d as f64 * day_w;
        svg.push_str(&format!(
            r##"<line x1="{x}" y1="{pad_top}" x2="{x}" y2="{}" class="d-lg d-thin" opacity="0.5"/>"##,
            h - 30.0
        ));
        let step = if ndays <= 14 { 1 } else if ndays <= 30 { 3 } else { 7 };
        if d % step == 0 {
            let label = if has_dates {
                let bd = base_date.unwrap();
                let date = days_to_date(bd, d);
                format_date(date, &date_format)
            } else {
                format!("d{d}")
            };
            svg.push_str(&format!(
                r##"<text x="{x}" y="{}" text-anchor="middle" font-size="10" class="d-tm">{}</text>"##,
                pad_top - 8.0, esc(&label)
            ));
        }
    }

    if today_marker && has_dates {
        let today = chrono_today();
        let bd = base_date.unwrap();
        let days_from_base = date_to_days_diff(today, bd);
        if days_from_base >= 0.0 && days_from_base <= total_days {
            let tx = pad_left + days_from_base * day_w;
            svg.push_str(&format!(
                r##"<line x1="{tx}" y1="{pad_top}" x2="{tx}" y2="{}" class="d-l" stroke-dasharray="4,3" stroke-width="1.5" opacity="0.8"/>"##,
                h - 30.0
            ));
            svg.push_str(&format!(
                r##"<text x="{tx}" y="{}" text-anchor="middle" font-size="10" class="d-ta d-bold">TODAY</text>"##,
                pad_top - 20.0
            ));
        }
    }

    let mut last_section = String::new();
    for (i, t) in tasks.iter().enumerate() {
        let y = pad_top + i as f64 * row_h;
        if !t.section.is_empty() && t.section != last_section {
            last_section = t.section.clone();
            svg.push_str(&format!(
                r##"<text x="10" y="{}" font-size="11" font-weight="700" class="d-ta">{}</text>"##,
                y + 6.0, esc(&t.section)
            ));
        }
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="end" font-size="12" class="d-t">{}</text>"##,
            pad_left - 12.0, y + 17.0, esc(&t.name)
        ));

        if t.milestone {
            let mx = pad_left + t.start * day_w;
            let my = y + 14.0;
            let top = my - 10.0;
            let bottom = my + 10.0;
            let left = mx - 8.0;
            let right = mx + 8.0;
            svg.push_str(&format!(
                r##"<polygon points="{mx},{top} {right},{my} {mx},{bottom} {left},{my}" class="d-b2"/>"##
            ));
        } else {
            let bx = pad_left + t.start * day_w;
            let bw = (t.dur * day_w).max(4.0);
            let cls = match t.tag.as_str() {
                "done" => "d-b3",
                "crit" => "d-b2",
                "active" => "d-b4",
                _ => "d-b",
            };
            svg.push_str(&format!(
                r##"<rect x="{bx}" y="{}" width="{bw}" height="20" rx="4" class="{cls}"/>"##,
                y + 4.0
            ));
        }
    }
    svg.push_str("</svg>");
    svg
}

fn parse_date(s: &str) -> Option<(i32, i32, i32)> {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 3 { return None; }
    let y = parts[0].parse::<i32>().ok()?;
    let m = parts[1].parse::<i32>().ok()?;
    let d = parts[2].parse::<i32>().ok()?;
    Some((y, m, d))
}

fn date_to_days_diff(a: (i32, i32, i32), b: (i32, i32, i32)) -> f64 {
    let to_days = |y: i32, m: i32, d: i32| {
        let mut days = (y as f64 - 1970.0) * 365.25;
        days += (m as f64 - 1.0) * 30.44;
        days += d as f64;
        days
    };
    to_days(a.0, a.1, a.2) - to_days(b.0, b.1, b.2)
}

fn days_to_date(base: (i32, i32, i32), days: usize) -> (i32, i32, i32) {
    let total_days = date_to_days_diff(base, (1970, 1, 1)) + days as f64;
    let mut y = (total_days / 365.25) as i32 + 1970;
    let mut remainder = total_days - (y as f64 - 1970.0) * 365.25;
    let mut m = (remainder / 30.44) as i32 + 1;
    remainder -= (m as f64 - 1.0) * 30.44;
    let mut d = remainder.round() as i32;
    if d < 1 { d = 1; m -= 1; if m < 1 { m = 12; y -= 1; } }
    if d > 31 { d = 1; m += 1; if m > 12 { m = 1; y += 1; } }
    (y, m, d)
}

fn chrono_today() -> (i32, i32, i32) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let days = (secs / 86400) as i64;
    let mut y = 1970i64;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year { break; }
        remaining -= days_in_year;
        y += 1;
    }
    let months = [31, if is_leap(y) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    for (i, &dm) in months.iter().enumerate() {
        if remaining < dm { m = i; break; }
        remaining -= dm;
    }
    (y as i32, (m + 1) as i32, (remaining + 1) as i32)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn format_date((y, m, d): (i32, i32, i32), fmt: &str) -> String {
    match fmt {
        "%Y-%m-%d" | "" => format!("{y:04}-{m:02}-{d:02}"),
        "%d.%m.%Y" => format!("{d:02}.{m:02}.{y:04}"),
        "%m/%d" => format!("{m:02}/{d:02}"),
        "%d" => format!("{d:02}"),
        _ => format!("{y:04}-{m:02}-{d:02}"),
    }
}
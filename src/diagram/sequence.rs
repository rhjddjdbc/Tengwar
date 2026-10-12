use std::collections::HashMap;
use super::common::{esc, err, svg_start, MARKER_DEFS};

#[derive(Clone)]
enum SeqItem {
    Msg { from: String, to: String, text: String, dashed: bool, active: bool },
    Note { over: Vec<String>, text: String, position: String },
    Block { kind: String, label: String, sub: Vec<SeqItem>, alt_items: Vec<(String, Vec<SeqItem>)> },
}

pub(crate) fn render_sequence(lines: &[&str]) -> String {
    let mut participants: Vec<String> = Vec::new();
    let mut aliases: HashMap<String, String> = HashMap::new();
    let mut autonumber = false;
    let mut msg_counter = 0;

    fn parse_block(
        lines: &[&str],
        idx: &mut usize,
        participants: &mut Vec<String>,
        aliases: &mut HashMap<String, String>,
        block_kind: &str,
        block_label: &str,
    ) -> SeqItem {
        let mut items: Vec<SeqItem> = Vec::new();
        let mut alt_items: Vec<(String, Vec<SeqItem>)> = Vec::new();
        let mut current_branch: Option<Vec<SeqItem>> = None;
        let mut current_label = block_label.to_string();

        while *idx < lines.len() {
            let line = lines[*idx].trim();
            *idx += 1;
            if line.is_empty() { continue; }
            if line == "end" {
                if let Some(branch) = current_branch.take() {
                    alt_items.push((current_label.clone(), branch));
                }
                if block_kind == "alt" || block_kind == "opt" || block_kind == "par" {
                    return SeqItem::Block {
                        kind: block_kind.to_string(),
                        label: block_label.to_string(),
                        sub: Vec::new(),
                        alt_items,
                    };
                } else {
                    return SeqItem::Block {
                        kind: block_kind.to_string(),
                        label: block_label.to_string(),
                        sub: items,
                        alt_items: Vec::new(),
                    };
                }
            }
            if (line.starts_with("else ") || line == "else") && (block_kind == "alt" || block_kind == "par") {
                let label = line.strip_prefix("else").unwrap_or("").trim().to_string();
                if let Some(branch) = current_branch.take() {
                    alt_items.push((current_label.clone(), branch));
                }
                current_label = label;
                current_branch = Some(Vec::new());
                continue;
            }
            if line.starts_with("and ") && block_kind == "par" {
                let label = line.strip_prefix("and").unwrap_or("").trim().to_string();
                if let Some(branch) = current_branch.take() {
                    alt_items.push((current_label.clone(), branch));
                }
                current_label = label;
                current_branch = Some(Vec::new());
                continue;
            }
            if line.starts_with("loop") || line.starts_with("alt") || line.starts_with("opt") || line.starts_with("par") {
                let (kind, lbl) = split_keyword(line);
                let nested = parse_block(lines, idx, participants, aliases, &kind, &lbl);
                if let Some(ref mut b) = current_branch { b.push(nested); } else { items.push(nested); }
                continue;
            }
            if line.starts_with("note ") || line.starts_with("Note ") {
                if let Some(n) = parse_note(line) {
                    if let Some(ref mut b) = current_branch { b.push(n); } else { items.push(n); }
                }
                continue;
            }
            let lower = line.to_lowercase();
            if lower.starts_with("participant ") || lower.starts_with("actor ") {
                let rest = if lower.starts_with("participant ") { &line[12..] } else { &line[6..] };
                if let Some((name, alias)) = rest.split_once(" as ") {
                    let name = name.trim().to_string();
                    if !participants.contains(&name) { participants.push(name.clone()); }
                    aliases.insert(name, alias.trim().to_string());
                } else {
                    let name = rest.trim().to_string();
                    if !participants.contains(&name) { participants.push(name); }
                }
                continue;
            }
            if let Some(msg) = parse_message(line) {
                if !participants.contains(&msg.0) { participants.push(msg.0.clone()); }
                if !participants.contains(&msg.1) { participants.push(msg.1.clone()); }
                let m = SeqItem::Msg { from: msg.0, to: msg.1, text: msg.2.clone(), dashed: msg.3, active: msg.4 };
                if let Some(ref mut b) = current_branch { b.push(m); } else { items.push(m); }
            }
        }
        if let Some(branch) = current_branch.take() {
            alt_items.push((current_label, branch));
        }
        SeqItem::Block { kind: block_kind.into(), label: block_label.into(), sub: items, alt_items }
    }

    let mut i = 0;
    let mut root_items: Vec<SeqItem> = Vec::new();
    while i < lines.len() {
        let line = lines[i].trim();
        if line.is_empty() || line == "sequenceDiagram" { i += 1; continue; }
        if line.eq_ignore_ascii_case("autonumber") {
            autonumber = true;
            i += 1;
            continue;
        }
        let lower = line.to_lowercase();
        if lower.starts_with("participant ") || lower.starts_with("actor ") {
            let rest = if lower.starts_with("participant ") { &line[12..] } else { &line[6..] };
            if let Some((name, alias)) = rest.split_once(" as ") {
                let name = name.trim().to_string();
                if !participants.contains(&name) { participants.push(name.clone()); }
                aliases.insert(name, alias.trim().to_string());
            } else {
                let name = rest.trim().to_string();
                if !participants.contains(&name) { participants.push(name); }
            }
            i += 1;
            continue;
        }
        if line.starts_with("loop") || line.starts_with("alt") || line.starts_with("opt") || line.starts_with("par") {
            let (kind, lbl) = split_keyword(line);
            i += 1;
            let blk = parse_block(lines, &mut i, &mut participants, &mut aliases, &kind, &lbl);
            root_items.push(blk);
            continue;
        }
        if line.starts_with("note ") || line.starts_with("Note ") {
            if let Some(n) = parse_note(line) { root_items.push(n); }
            i += 1;
            continue;
        }
        if let Some(msg) = parse_message(line) {
            if !participants.contains(&msg.0) { participants.push(msg.0.clone()); }
            if !participants.contains(&msg.1) { participants.push(msg.1.clone()); }
            let text = if autonumber {
                msg_counter += 1;
                format!("{}. {}", msg_counter, msg.2)
            } else {
                msg.2
            };
            root_items.push(SeqItem::Msg { from: msg.0, to: msg.1, text, dashed: msg.3, active: msg.4 });
        }
        i += 1;
    }

    if participants.is_empty() { return err("No participants found."); }

    let gap: f64 = 200.0;
    let top_pad: f64 = 30.0;
    let box_h: f64 = 38.0;
    let msg_gap: f64 = 46.0;
    let block_pad: f64 = 20.0;

    fn count_rows(items: &[SeqItem]) -> f64 {
        let mut h = 0.0;
        for item in items {
            match item {
                SeqItem::Msg { .. } => h += 1.0,
                SeqItem::Note { .. } => h += 0.9,
                SeqItem::Block { sub, alt_items, .. } => {
                    h += 0.6;
                    if !sub.is_empty() { h += count_rows(sub); }
                    for (_, b) in alt_items {
                        h += 0.5;
                        h += count_rows(b);
                    }
                    h += 0.4;
                }
            }
        }
        h
    }
    let total_rows = count_rows(&root_items) + 1.0;

    let w = (620.0_f64).max(participants.len() as f64 * gap);
    let h = top_pad + 70.0 + total_rows * msg_gap + 60.0;

    let mut x_of: HashMap<&str, f64> = HashMap::new();
    for (i, p) in participants.iter().enumerate() {
        let extra = (w - 160.0 - (participants.len() as f64 - 1.0) * gap) / 2.0;
        x_of.insert(p.as_str(), 80.0 + i as f64 * gap + extra);
    }

    let mut svg = svg_start(w, h);
    svg.push_str(MARKER_DEFS);

    for p in &participants {
        let x = x_of[p.as_str()];
        let label = aliases.get(p).cloned().unwrap_or_else(|| p.clone());
        svg.push_str(&format!(
            r##"<rect x="{}" y="20" width="160" height="{box_h}" rx="8" class="d-b"/>"##,
            x - 80.0
        ));
        svg.push_str(&format!(
            r##"<text x="{x}" y="{}" text-anchor="middle" font-size="13" font-weight="600" class="d-t">{}</text>"##,
            20.0 + box_h / 2.0 + 5.0, esc(&label)
        ));
        svg.push_str(&format!(
            r##"<line x1="{x}" y1="{}" x2="{x}" y2="{}" class="d-lm d-dash-sm"/>"##,
            20.0 + box_h, h - 20.0
        ));
    }

    let mut cursor = top_pad + 70.0;
    render_seq_items(&mut svg, &root_items, &x_of, &mut cursor, msg_gap, block_pad);

    svg.push_str("</svg>");
    svg
}

fn render_seq_items(
    svg: &mut String,
    items: &[SeqItem],
    x_of: &HashMap<&str, f64>,
    cursor: &mut f64,
    msg_gap: f64,
    block_pad: f64,
) {
    for item in items {
        match item {
            SeqItem::Msg { from, to, text, dashed, active } => {
                let y = *cursor;
                let x1 = *x_of.get(from.as_str()).unwrap_or(&0.0);
                let x2 = *x_of.get(to.as_str()).unwrap_or(&0.0);
                let dash = if *dashed { " d-dash" } else { "" };
                svg.push_str(&format!(
                    r##"<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" class="d-l{dash}" marker-end="url(#d-arrow)"/>"##
                ));
                svg.push_str(&format!(
                    r##"<text x="{}" y="{}" text-anchor="middle" font-size="12" class="d-t">{}</text>"##,
                    (x1 + x2) / 2.0, y - 8.0, esc(text)
                ));
                if *active {
                    svg.push_str(&format!(
                        r##"<rect x="{}" y="{}" width="8" height="{msg_gap}" class="d-b" stroke-width="1"/>"##,
                        x2 - 4.0, y
                    ));
                }
                *cursor += msg_gap;
            }
            SeqItem::Note { over, text, position } => {
                let y = *cursor;
                let (cx, w_) = match position.as_str() {
                    "left" => {
                        let x = over.first().and_then(|p| x_of.get(p.as_str()).copied()).unwrap_or(100.0);
                        (x - 100.0, 120.0)
                    }
                    "right" => {
                        let x = over.first().and_then(|p| x_of.get(p.as_str()).copied()).unwrap_or(100.0);
                        (x + 100.0, 120.0)
                    }
                    _ => {
                        if over.len() == 1 {
                            let x = x_of.get(over[0].as_str()).copied().unwrap_or(100.0);
                            (x, 160.0)
                        } else {
                            let xs: Vec<f64> = over.iter().filter_map(|p| x_of.get(p.as_str()).copied()).collect();
                            let x1 = xs.iter().cloned().fold(f64::INFINITY, f64::min);
                            let x2 = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                            ((x1 + x2) / 2.0, (x2 - x1).max(160.0))
                        }
                    }
                };
                let h_ = 36.0;
                svg.push_str(&format!(
                    r##"<rect x="{}" y="{}" width="{w_}" height="{h_}" rx="4" class="d-b2"/>"##,
                    cx - w_ / 2.0, y - h_ / 2.0
                ));
                svg.push_str(&format!(
                    r##"<text x="{cx}" y="{}" text-anchor="middle" font-size="11" class="d-t">{}</text>"##,
                    y + 4.0, esc(text)
                ));
                *cursor += msg_gap * 0.9;
            }
            SeqItem::Block { kind, label, sub, alt_items } => {
                let start_y = *cursor - block_pad;
                let label_text = if label.is_empty() { kind.clone() } else { format!("{} {}", kind, label) };

                // Frame dimensions derive from actual participant
                // positions, not a hardcoded 200px per participant.
                // If `gap` changes, the frame stays correct.
                let (min_x, max_x) = x_of
                    .values()
                    .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), &x| {
                        (lo.min(x), hi.max(x))
                    });
                let (frame_left, frame_right) = if min_x.is_finite() {
                    (min_x - 30.0, max_x + 30.0)
                } else {
                    (20.0, 600.0)
                };

                *cursor += msg_gap * 0.6;
                render_seq_items(svg, sub, x_of, cursor, msg_gap, block_pad);

                for (branch_label, branch_items) in alt_items {
                    let div_y = *cursor - block_pad * 0.5;
                    svg.push_str(&format!(
                        r##"<line x1="{frame_left}" y1="{div_y}" x2="{frame_right}" y2="{div_y}" class="d-lm d-dash-sm"/>"##
                    ));
                    if !branch_label.is_empty() {
                        svg.push_str(&format!(
                            r##"<text x="{}" y="{}" font-size="11" class="d-tm d-bold">[{}]</text>"##,
                            frame_left + 20.0, div_y + 14.0, esc(&branch_label)
                        ));
                        *cursor += msg_gap * 0.4;
                    }
                    render_seq_items(svg, branch_items, x_of, cursor, msg_gap, block_pad);
                }

                let end_y = *cursor - block_pad * 0.5;
                svg.push_str(&format!(
                    r##"<rect x="{frame_left}" y="{start_y}" width="{}" height="{}" rx="4" class="d-lg d-dash" fill="none"/>"##,
                    frame_right - frame_left, end_y - start_y
                ));
                let tag_w = label_text.chars().count() as f64 * 6.5 + 20.0;
                svg.push_str(&format!(
                    r##"<rect x="{frame_left}" y="{start_y}" width="{tag_w}" height="20" rx="4" class="d-b"/>"##
                ));
                svg.push_str(&format!(
                    r##"<text x="{}" y="{}" font-size="11" class="d-ta d-bold" text-anchor="middle">{}</text>"##,
                    frame_left + tag_w / 2.0, start_y + 14.0, esc(&label_text)
                ));
                *cursor += msg_gap * 0.4;
            }
        }
    }
}

fn split_keyword(line: &str) -> (String, String) {
    let mut parts = line.splitn(2, char::is_whitespace);
    let kw = parts.next().unwrap_or("").to_lowercase();
    let rest = parts.next().unwrap_or("").trim().to_string();
    (kw, rest)
}

fn parse_note(line: &str) -> Option<SeqItem> {
    let lower = line.to_lowercase();
    let rest = if lower.starts_with("note ") { &line[5..] } else { return None; };
    let rest_lower = rest.to_lowercase();
    if rest_lower.starts_with("over ") {
        let after = &rest[5..];
        if let Some(colon) = after.find(':') {
            let people: Vec<String> = after[..colon].split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            let text = after[colon + 1..].trim().to_string();
            return Some(SeqItem::Note { over: people, text, position: "over".into() });
        }
    }
    if rest_lower.starts_with("left of ") {
        let after = &rest[8..];
        if let Some(colon) = after.find(':') {
            let p = after[..colon].trim().to_string();
            let text = after[colon + 1..].trim().to_string();
            return Some(SeqItem::Note { over: vec![p], text, position: "left".into() });
        }
    }
    if rest_lower.starts_with("right of ") {
        let after = &rest[9..];
        if let Some(colon) = after.find(':') {
            let p = after[..colon].trim().to_string();
            let text = after[colon + 1..].trim().to_string();
            return Some(SeqItem::Note { over: vec![p], text, position: "right".into() });
        }
    }
    None
}

fn parse_message(line: &str) -> Option<(String, String, String, bool, bool)> {
    let patterns = ["-->>", "->>", "--x", "-x", "-->", "->"];
    for pat in &patterns {
        if let Some(idx) = line.find(pat) {
            let from = line[..idx].trim();
            let after = &line[idx + pat.len()..];
            let (active, after) = if after.starts_with('+') {
                (true, &after[1..])
            } else if after.starts_with('-') {
                (false, &after[1..])
            } else {
                (false, after)
            };
            let (to, text) = after.split_once(':')?;
            let to = to.trim();
            let text = text.trim();
            if from.is_empty() || to.is_empty() { continue; }
            let dashed = pat.starts_with("--");
            return Some((from.to_string(), to.to_string(), text.to_string(), dashed, active));
        }
    }
    None
}
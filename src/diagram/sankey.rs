use std::collections::{HashMap, HashSet};
use super::common::{esc, err, svg_start};

pub(crate) fn render_sankey(lines: &[&str]) -> String {
    // ── Parse ─────────────────────────────────────────────────
    let mut flows: Vec<(String, String, f64)> = Vec::new();
    for raw in lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("sankey") { continue; }
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() >= 3 {
            if let Ok(v) = parts[2].parse::<f64>() {
                flows.push((parts[0].trim_matches('"').into(),
                            parts[1].trim_matches('"').into(), v));
            }
        }
    }
    if flows.is_empty() { return err("No flows."); }

    // ── Nodes ────────────────────────────────────────────────
    let mut all_nodes: Vec<String> = Vec::new();
    for (f, t, _) in &flows {
        if !all_nodes.contains(f) { all_nodes.push(f.clone()); }
        if !all_nodes.contains(t) { all_nodes.push(t.clone()); }
    }

    // ── Depth via longest path (fixpoint iteration) ──────────
    let has_incoming: HashSet<&String> = flows.iter().map(|(_, t, _)| t).collect();
    let has_outgoing: HashSet<&String> = flows.iter().map(|(f, _, _)| f).collect();

    let mut depth: HashMap<String, usize> = HashMap::new();
    for n in &all_nodes {
        if !has_incoming.contains(n) {
            depth.insert(n.clone(), 0);
        }
    }
    if depth.is_empty() {
        for n in &all_nodes {
            if has_outgoing.contains(n) {
                depth.insert(n.clone(), 0);
            }
        }
    }
    if depth.is_empty() && !all_nodes.is_empty() {
        depth.insert(all_nodes[0].clone(), 0);
    }

    for _ in 0..all_nodes.len() + 2 {
        let mut changed = false;
        for (f, t, _) in &flows {
            let df = depth.get(f).copied().unwrap_or(0);
            let dt = depth.get(t).copied().unwrap_or(0);
            if dt < df + 1 {
                depth.insert(t.clone(), df + 1);
                changed = true;
            }
        }
        if !changed { break; }
    }
    for n in &all_nodes {
        depth.entry(n.clone()).or_insert(0);
    }

    let max_depth = depth.values().copied().max().unwrap_or(0);
    let mut columns: Vec<Vec<String>> = vec![Vec::new(); max_depth + 1];
    for n in &all_nodes {
        let d = depth.get(n).copied().unwrap_or(0);
        columns[d].push(n.clone());
    }

    // ── Node values ──────────────────────────────────────────
    let mut node_value: HashMap<String, f64> = HashMap::new();
    for n in &all_nodes {
        let incoming: f64 = flows.iter().filter(|(_, t, _)| t == n).map(|(_, _, v)| v).sum();
        let outgoing: f64 = flows.iter().filter(|(f, _, _)| f == n).map(|(_, _, v)| v).sum();
        node_value.insert(n.clone(), incoming.max(outgoing).max(1.0));
    }

    // ── Layout ───────────────────────────────────────────────
    let node_w: f64 = 18.0;
    let node_gap: f64 = 12.0;
    let col_gap: f64 = 140.0;
    let pad_top: f64 = 50.0;
    let pad_bottom: f64 = 40.0;
    let pad_left: f64 = 120.0;
    let pad_right: f64 = 120.0;
    let target_content_h: f64 = 400.0;
    let min_node_h: f64 = 22.0;

    let col_totals: Vec<f64> = columns.iter()
        .map(|col| col.iter().map(|n| node_value.get(n).copied().unwrap_or(1.0)).sum())
        .collect();
    let max_col_total = col_totals.iter().cloned().fold(0.0_f64, f64::max).max(1.0);
    let max_col_len = columns.iter().map(|c| c.len()).max().unwrap_or(0);
    let gaps_in_tallest = (max_col_len.saturating_sub(1)) as f64 * node_gap;
    let avail_for_nodes = (target_content_h - gaps_in_tallest).max(150.0);
    let scale = avail_for_nodes / max_col_total;

    let node_height = |n: &String| -> f64 {
        let v = node_value.get(n).copied().unwrap_or(1.0);
        (v * scale).max(min_node_h)
    };

    let col_heights: Vec<f64> = columns.iter()
        .map(|col| {
            let mut h = 0.0;
            for (i, n) in col.iter().enumerate() {
                h += node_height(n);
                if i < col.len() - 1 { h += node_gap; }
            }
            h
        })
        .collect();

    let content_h = col_heights.iter().cloned().fold(0.0_f64, f64::max);
    let canvas_h = (content_h + pad_top + pad_bottom).max(280.0);
    let canvas_w = pad_left + pad_right
        + max_depth as f64 * (col_gap + node_w)
        + node_w;

    // ── Node positions ───────────────────────────────────────
    let mut node_y: HashMap<String, f64> = HashMap::new();
    let mut node_h_map: HashMap<String, f64> = HashMap::new();
    for (di, col) in columns.iter().enumerate() {
        let col_h = col_heights[di];
        let start_y = pad_top + (content_h - col_h) / 2.0;
        let mut y = start_y;
        for n in col {
            let h = node_height(n);
            node_y.insert(n.clone(), y);
            node_h_map.insert(n.clone(), h);
            y += h + node_gap;
        }
    }

    // ── Colors ───────────────────────────────────────────────
    // CSS variables so the diagram follows the active theme.
    // Transparency is handled by `fill-opacity` on the path, not by
    // baking rgba() values into the fill attribute.
    let palette: [&str; 4] = [
        "var(--d-accent)",
        "var(--d-accent3)",
        "var(--d-accent2)",
        "var(--d-box4)",
    ];

    let mut node_color: HashMap<String, String> = HashMap::new();
    if let Some(first) = columns.first() {
        for (i, n) in first.iter().enumerate() {
            node_color.insert(n.clone(), palette[i % palette.len()].into());
        }
    }
    for di in 1..columns.len() {
        for n in &columns[di] {
            if node_color.contains_key(n) { continue; }
            if let Some(p) = flows.iter().find(|(_, t, _)| t == n).map(|(f, _, _)| f.clone()) {
                if let Some(c) = node_color.get(&p) {
                    node_color.insert(n.clone(), c.clone());
                }
            }
        }
    }
    for (i, n) in all_nodes.iter().enumerate() {
        node_color.entry(n.clone())
            .or_insert_with(|| palette[i % palette.len()].into());
    }

    // ── Flow stacking ────────────────────────────────────────
    let mut sorted_flows = flows.clone();
    sorted_flows.sort_by(|a, b| {
        let a_sy = node_y.get(&a.0).copied().unwrap_or(0.0);
        let b_sy = node_y.get(&b.0).copied().unwrap_or(0.0);
        a_sy.partial_cmp(&b_sy).unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                let a_ty = node_y.get(&a.1).copied().unwrap_or(0.0);
                let b_ty = node_y.get(&b.1).copied().unwrap_or(0.0);
                a_ty.partial_cmp(&b_ty).unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    let mut source_offsets: HashMap<String, f64> = HashMap::new();
    let mut sink_offsets: HashMap<String, f64> = HashMap::new();
    let mut drawn: Vec<(f64, f64, f64, f64, f64, f64, String, f64)> = Vec::new();

    for (from, to, value) in &sorted_flows {
        let Some(&sy) = node_y.get(from) else { continue };
        let Some(&ty) = node_y.get(to) else { continue };
        let sh = node_h_map.get(from).copied().unwrap_or(min_node_h);
        let th = node_h_map.get(to).copied().unwrap_or(min_node_h);

        let src_total: f64 = flows.iter().filter(|(f, _, _)| f == from).map(|(_, _, v)| v).sum();
        let sink_total: f64 = flows.iter().filter(|(_, t, _)| t == to).map(|(_, _, v)| v).sum();

        let src_used = source_offsets.get(from).copied().unwrap_or(0.0);
        let sink_used = sink_offsets.get(to).copied().unwrap_or(0.0);

        let src_band_h = if src_total > 0.0 { sh * (value / src_total) } else { 1.0 };
        let sink_band_h = if sink_total > 0.0 { th * (value / sink_total) } else { 1.0 };

        let di = depth.get(from).copied().unwrap_or(0);
        let x1 = pad_left + di as f64 * (col_gap + node_w) + node_w;
        let x2 = pad_left + (di + 1) as f64 * (col_gap + node_w);

        let y1_top = sy + src_used;
        let y1_bot = y1_top + src_band_h;
        let y2_top = ty + sink_used;
        let y2_bot = y2_top + sink_band_h;

        let color = node_color.get(from).cloned()
            .unwrap_or_else(|| palette[0].into());

        drawn.push((x1, y1_top, y1_bot, x2, y2_top, y2_bot, color, *value));

        source_offsets.insert(from.clone(), src_used + src_band_h);
        sink_offsets.insert(to.clone(), sink_used + sink_band_h);
    }

    // ── SVG ─────────────────────────────────────────────────
    let mut svg = svg_start(canvas_w, canvas_h);

    for (x1, y1_top, y1_bot, x2, y2_top, y2_bot, color, value) in &drawn {
        let mx = (x1 + x2) / 2.0;
        let d = format!(
            "M {x1} {y1_top} C {mx} {y1_top} {mx} {y2_top} {x2} {y2_top} \
             L {x2} {y2_bot} C {mx} {y2_bot} {mx} {y1_bot} {x1} {y1_bot} Z"
        );
        svg.push_str(&format!(
            r##"<path d="{d}" fill="{color}" fill-opacity="0.32" stroke="{color}" stroke-width="0.6" stroke-opacity="0.55"/>"##
        ));

        let band_h = y1_bot - y1_top;
        if band_h > 14.0 {
            let lx = (x1 + x2) / 2.0;
            let ly = (y1_top + y1_bot + y2_top + y2_bot) / 4.0;
            svg.push_str(&format!(
                r##"<text x="{lx}" y="{}" text-anchor="middle" font-size="10" class="d-mono" fill="var(--d-fg)" opacity="0.8">{v}</text>"##,
                ly + 3.0, v = format_value(*value)
            ));
        }
    }

    for col in &columns {
        for n in col {
            let di = depth.get(n).copied().unwrap_or(0);
            let x = pad_left + di as f64 * (col_gap + node_w);
            let y = node_y.get(n).copied().unwrap_or(0.0);
            let h = node_h_map.get(n).copied().unwrap_or(min_node_h);
            let color = node_color.get(n).cloned()
                .unwrap_or_else(|| palette[0].into());

            svg.push_str(&format!(
                r##"<rect x="{x}" y="{y}" width="{node_w}" height="{h}" rx="3" fill="{color}"/>"##
            ));

            let (lx_attr, ly, val_y, val_x, val_anchor) = if di == 0 {
                (
                    format!(r#"text-anchor="end" x="{}""#, x - 10.0),
                    y + h / 2.0 + 4.0,
                    y + h / 2.0 + 18.0,
                    x - 10.0,
                    "end",
                )
            } else if di == max_depth {
                (
                    format!(r#"text-anchor="start" x="{}""#, x + node_w + 10.0),
                    y + h / 2.0 + 4.0,
                    y + h / 2.0 + 18.0,
                    x + node_w + 10.0,
                    "start",
                )
            } else {
                (
                    format!(r#"text-anchor="middle" x="{}""#, x + node_w / 2.0),
                    y - 6.0,
                    y + h + 14.0,
                    x + node_w / 2.0,
                    "middle",
                )
            };

            svg.push_str(&format!(
                r##"<text {lx_attr} y="{ly}" font-size="12" font-weight="600" class="d-t" fill="var(--d-fg)">{label}</text>"##,
                label = esc(n)
            ));

            if di == 0 || di == max_depth {
                let val = node_value.get(n).copied().unwrap_or(0.0);
                svg.push_str(&format!(
                    r##"<text x="{val_x}" y="{val_y}" text-anchor="{val_anchor}" font-size="10" class="d-mono" fill="var(--d-muted)">{v}</text>"##,
                    v = format_value(val)
                ));
            }
        }
    }

    svg.push_str("</svg>");
    svg
}

fn format_value(v: f64) -> String {
    if (v.fract()).abs() < 0.001 {
        format!("{}", v as i64)
    } else {
        format!("{:.1}", v)
    }
}
use std::collections::HashMap;
use super::common::{esc, err, svg_start};

pub(crate) fn render_mindmap(lines: &[&str]) -> String {
    #[derive(Clone)]
    struct Node { name: String, shape: String, children: Vec<Node> }

    fn parse_shape(s: &str) -> (String, String) {
        let s = s.trim();
        if let (Some(i), Some(j)) = (s.find("(("), s.rfind("))")) {
            if i < j && j > i + 2 {
                return ("circle".into(), s[i + 2..j].trim().to_string());
            }
        }
        if let (Some(i), Some(j)) = (s.find("[["), s.rfind("]]")) {
            if i < j && j > i + 2 {
                return ("hexagon".into(), s[i + 2..j].trim().to_string());
            }
        }
        if let (Some(i), Some(j)) = (s.find('('), s.rfind(')')) {
            if i < j && j > i + 1 {
                return ("round".into(), s[i + 1..j].trim().to_string());
            }
        }
        if let (Some(i), Some(j)) = (s.find('['), s.rfind(']')) {
            if i < j && j > i + 1 {
                return ("rect".into(), s[i + 1..j].trim().to_string());
            }
        }
        if s.starts_with(')') && s.ends_with('(') {
            return ("cloud".into(), s[1..s.len() - 1].trim().to_string());
        }
        ("rect".into(), s.to_string())
    }

    let mut root = Node { name: "Root".into(), shape: "rect".into(), children: Vec::new() };
    let mut stack: Vec<(usize, Vec<usize>)> = vec![(0, vec![])];
    let mut seen_any = false;

    fn insert(root: &mut Node, path: &[usize], name: String, shape: String) {
        let mut cur = root;
        for &i in path { cur = &mut cur.children[i]; }
        cur.children.push(Node { name, shape, children: Vec::new() });
    }
    fn children_count(root: &Node, path: &[usize]) -> usize {
        let mut cur = root;
        for &i in path { cur = &cur.children[i]; }
        cur.children.len()
    }

    for raw in lines {
        if raw.trim().is_empty() || raw.trim() == "mindmap" { continue; }
        let indent = raw.chars().take_while(|c| c.is_whitespace()).count();
        let text = raw.trim().to_string();
        if text.is_empty() { continue; }
        let (shape, name) = parse_shape(&text);
        seen_any = true;
        while stack.len() > 1 && stack.last().unwrap().0 >= indent { stack.pop(); }
        let parent_path = stack.last().unwrap().1.clone();
        insert(&mut root, &parent_path, name, shape);
        let n = children_count(&root, &parent_path);
        let mut np = parent_path.clone(); np.push(n - 1);
        stack.push((indent, np));
    }
    if !seen_any { return err("No mindmap detected."); }

    let box_pad: f64 = 12.0;
    let layer_gap: f64 = 60.0;

    fn calc_width(name: &str, shape: &str) -> f64 {
        let base = name.chars().count() as f64 * 7.5 + 30.0;
        match shape {
            "circle" => (name.chars().count() as f64 * 10.0 + 20.0).max(80.0),
            "hexagon" => base.max(100.0) + 20.0,
            "cloud" => base.max(100.0) + 10.0,
            _ => base.max(80.0),
        }
    }
    fn calc_height(shape: &str) -> f64 {
        match shape {
            "circle" => 60.0,
            _ => 32.0,
        }
    }

    let mut positions: HashMap<String, (f64, f64, f64, f64, String)> = HashMap::new();
    let mut edges: Vec<(String, String)> = Vec::new();

    fn node_key(name: &str, path: &[usize]) -> String {
        format!("{}|{}", name, path.iter().map(|i| i.to_string()).collect::<Vec<_>>().join("."))
    }
    #[allow(clippy::too_many_arguments)]
    fn assign(node: &Node, path: &mut Vec<usize>, depth: usize, y_counter: &mut f64,
              positions: &mut HashMap<String, (f64, f64, f64, f64, String)>,
              edges: &mut Vec<(String, String)>,
              box_pad: f64, layer_gap: f64) {
        let w = calc_width(&node.name, &node.shape);
        let h_ = calc_height(&node.shape);
        let key = node_key(&node.name, path);
        let x = depth as f64 * (layer_gap + 140.0) + 30.0;
        if node.children.is_empty() {
            let y = *y_counter;
            *y_counter += h_ + box_pad;
            positions.insert(key, (x, y, w, h_, node.shape.clone()));
            return;
        }
        for (i, ch) in node.children.iter().enumerate() {
            path.push(i);
            assign(ch, path, depth + 1, y_counter, positions, edges, box_pad, layer_gap);
            let ck = node_key(&ch.name, path);
            edges.push((key.clone(), ck));
            path.pop();
        }
        let cks: Vec<String> = (0..node.children.len()).map(|i| {
            path.push(i); let k = node_key(&node.children[i].name, path); path.pop(); k
        }).collect();
        let ys: Vec<f64> = cks.iter().filter_map(|k| positions.get(k).map(|v| v.1 + v.3 / 2.0)).collect();
        let y = if ys.is_empty() { *y_counter } else { (ys[0] + ys[ys.len() - 1]) / 2.0 - h_ / 2.0 };
        positions.insert(key, (x, y, w, h_, node.shape.clone()));
    }

    let fake = if root.children.len() == 1 {
        root.children[0].clone()
    } else {
        Node { name: "Mindmap".into(), shape: "rect".into(), children: root.children.clone() }
    };
    let mut yc = 40.0;
    let mut pv = vec![];
    assign(&fake, &mut pv, 0, &mut yc, &mut positions, &mut edges, box_pad, layer_gap);

    let w = positions.values().map(|(x, _, w_, _, _)| x + w_).fold(0.0_f64, f64::max) + 40.0;
    let h = yc + 30.0;

    let mut svg = svg_start(w, h);
    for (a, b) in &edges {
        if let (Some((ax, ay, aw, ah, _)), Some((bx, by, _, bh, _))) = (positions.get(a), positions.get(b)) {
            let x1 = ax + aw; let y1 = ay + ah / 2.0;
            let x2 = *bx; let y2 = by + bh / 2.0;
            let mx = (x1 + x2) / 2.0;
            svg.push_str(&format!(
                r##"<path d="M {x1} {y1} C {mx} {y1} {mx} {y2} {x2} {y2}" class="d-l" fill="none" opacity="0.6"/>"##
            ));
        }
    }
    for (key, (x, y, w_, h_, shape)) in &positions {
        let name = key.split('|').next().unwrap_or("");
        match shape.as_str() {
            "circle" => {
                let cx = x + w_ / 2.0;
                let cy = y + h_ / 2.0;
                let r = (w_ / 2.0).min(h_ / 2.0);
                svg.push_str(&format!(
                    r##"<circle cx="{cx}" cy="{cy}" r="{r}" class="d-b"/>"##
                ));
            }
            "hexagon" => {
                let inset = 14.0;
                let cy1 = y;
                let cy2 = y + h_;
                let cy_mid = y + h_ / 2.0;
                svg.push_str(&format!(
                    r##"<polygon points="{},{cy_mid} {},{cy1} {},{cy1} {},{cy_mid} {},{cy2} {},{cy2}" class="d-b3"/>"##,
                    x, x + inset, x + w_ - inset, x + w_,
                    x + w_ - inset, x + inset
                ));
            }
            "cloud" => {
                let cx = x + w_ / 2.0;
                let cy = y + h_ / 2.0;
                let rx = w_ / 2.0;
                let ry = h_ / 2.0;
                svg.push_str(&format!(
                    r##"<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" class="d-b4"/>"##
                ));
            }
            "round" => {
                svg.push_str(&format!(
                    r##"<rect x="{x}" y="{y}" width="{w_}" height="{h_}" rx="{}" class="d-b3"/>"##,
                    h_ / 2.0
                ));
            }
            _ => {
                svg.push_str(&format!(
                    r##"<rect x="{x}" y="{y}" width="{w_}" height="{h_}" rx="6" class="d-b"/>"##
                ));
            }
        }
        svg.push_str(&format!(
            r##"<text x="{}" y="{}" text-anchor="middle" font-size="12.5" font-weight="500" class="d-t">{}</text>"##,
            x + w_ / 2.0, y + h_ / 2.0 + 4.5, esc(name)
        ));
    }
    svg.push_str("</svg>");
    svg
}


pub(crate) fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
pub(crate) fn err(msg: &str) -> String {
    format!(r##"<div class="error">{}</div>"##, esc(msg))
}
pub(crate) fn svg_start(w: f64, h: f64) -> String {
    let styles = r##"<style>
      .d-t { fill: var(--d-fg, #1a2029); }
      .d-tm { fill: var(--d-muted, #6e7a89); }
      .d-ta { fill: var(--d-accent, #5f7de0); }
      .d-ta2 { fill: var(--d-accent2, #d18616); }
      .d-fg { fill: var(--d-fg, #1a2029); }
      .d-b { fill: var(--d-box, #eef3ff); stroke: var(--d-stroke, #c5cdd8); stroke-width: 1.2; }
      .d-b2 { fill: var(--d-box2, #fff4e0); stroke: var(--d-stroke2, #e5d0a8); stroke-width: 1.4; }
      .d-b3 { fill: var(--d-box3, #eafcf0); stroke: var(--d-stroke3, #a8d9b8); stroke-width: 1.4; }
      .d-b4 { fill: var(--d-box4, #f3eaff); stroke: var(--d-stroke, #c5cdd8); stroke-width: 1.4; }
      .d-bg { fill: var(--d-bg, #ffffff); }
      .d-l { stroke: var(--d-accent, #5f7de0); fill: none; stroke-width: 1.6; }
      .d-l2 { stroke: var(--d-accent2, #d18616); fill: none; stroke-width: 1.6; }
      .d-lm { stroke: var(--d-muted, #6e7a89); fill: none; stroke-width: 1; }
      .d-lg { stroke: var(--d-grid, #e6e8eb); fill: none; }
      .d-dash { stroke-dasharray: 6,4; }
      .d-dash-sm { stroke-dasharray: 3,3; }
      .d-thin { stroke-width: 1; }
      .d-thick { stroke-width: 2; }
      .d-bold { font-weight: 600; }
      .d-mono { font-family: 'SFMono-Regular', Consolas, monospace; }
      .d-mark-arrow { fill: var(--d-accent, #5f7de0); }
      .d-mark-arrow2 { fill: var(--d-accent2, #d18616); }
      .d-mark-tri { fill: var(--d-bg, #ffffff); stroke: var(--d-accent, #5f7de0); stroke-width: 1.4; }
      .d-mark-open { fill: var(--d-bg, #ffffff); stroke: var(--d-muted, #6e7a89); stroke-width: 1.4; }
      svg text { fill: var(--d-fg, #1a2029); font-family: Inter, system-ui, sans-serif; }
    </style>"##;
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="font-family:Inter,system-ui,sans-serif;background:var(--d-bg, #ffffff);">{styles}"##
    )
}
pub(crate) const MARKER_DEFS: &str = r##"<defs>
<marker id="d-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L12,6 L0,12 Z" class="d-mark-arrow"/></marker>
<marker id="d-arrow2" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L12,6 L0,12 Z" class="d-mark-arrow2"/></marker>
<marker id="d-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M0,0 L12,6 L0,12 Z" class="d-mark-tri"/></marker>
<marker id="d-open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M0,0 L12,6 L0,12 Z" class="d-mark-open"/></marker>
</defs>"##;
#[derive(Clone)]
pub(crate) struct Relation {
    pub from: String,
    pub op: String,
    pub to: String,
    pub label: String,
    pub from_card: String,
    pub to_card: String,
}

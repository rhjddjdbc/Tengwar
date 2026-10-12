//! Diagram rendering module – dispatches Mermaid-like diagram source to specialized SVG renderers.

mod common;
mod class;
mod er;
mod sequence;
mod state;
mod flowchart;
mod xychart;
mod kanban;
mod block;
mod packet;
mod pie;
mod gantt;
mod mindmap;
mod timeline;
mod journey;
mod quadrant;
mod gitgraph;
mod sankey;
mod requirement;
mod c4;

use class::render_class;
use er::render_er;
use sequence::render_sequence;
use state::render_state;
use flowchart::render_flowchart;
use xychart::render_xychart;
use kanban::render_kanban;
use block::render_block;
use packet::render_packet;
use pie::render_pie;
use gantt::render_gantt;
use mindmap::render_mindmap;
use timeline::render_timeline;
use journey::render_journey;
use quadrant::render_quadrant;
use gitgraph::render_gitgraph;
use sankey::render_sankey;
use requirement::render_requirement;
use c4::render_c4;

#[tauri::command]
pub fn render_diagram(code: String) -> Result<String, String> {
    let lines: Vec<&str> = code.lines().collect();
    let mut start = 0;
    while start < lines.len() && lines[start].trim().is_empty() {
        start += 1;
    }
    let first = lines.get(start).map(|s| s.trim()).unwrap_or("");
    let rest: &[&str] = if start < lines.len() {
        &lines[start + 1..]
    } else {
        &[]
    };

    if first.starts_with("classDiagram") {
        Ok(render_class(rest))
    } else if first.starts_with("erDiagram") {
        Ok(render_er(rest))
    } else if first.starts_with("sequenceDiagram") {
        Ok(render_sequence(rest))
    } else if first.starts_with("stateDiagram") {
        Ok(render_state(rest))
    } else if first.starts_with("flowchart") || first.starts_with("graph") {
        Ok(render_flowchart(rest))
    } else if first.starts_with("pie") {
        Ok(render_pie(rest))
    } else if first.starts_with("gantt") {
        Ok(render_gantt(rest))
    } else if first.starts_with("mindmap") {
        Ok(render_mindmap(rest))
    } else if first.starts_with("timeline") {
        Ok(render_timeline(rest))
    } else if first.starts_with("journey") {
        Ok(render_journey(rest))
    } else if first.starts_with("quadrantChart") {
        Ok(render_quadrant(rest))
    } else if first.starts_with("gitGraph") {
        Ok(render_gitgraph(rest))
    } else if first.starts_with("sankey") {
        Ok(render_sankey(rest))
    } else if first.starts_with("requirementDiagram") {
        Ok(render_requirement(rest))
    } else if first.starts_with("C4") {
        Ok(render_c4(rest))
    } else if first.starts_with("xychart") {
        Ok(render_xychart(rest))
    } else if first.starts_with("kanban") {
        Ok(render_kanban(rest))
    } else if first.starts_with("block-beta") || first.starts_with("block") {
        Ok(render_block(rest))
    } else if first.starts_with("packet-beta") || first.starts_with("packet") {
        Ok(render_packet(rest))
    } else {
        Err(format!(
            "Unknown diagram type: {}",
            first.split_whitespace().next().unwrap_or("")
        ))
    }
}

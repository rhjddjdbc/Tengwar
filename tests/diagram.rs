//! Smoke tests for every diagram renderer.
//!
//! Each renderer gets a minimal sample. If it returns an error, or
//! produces output without an `<svg>` tag, the test fails. This is
//! the cheapest possible check that an upstream crate update hasn't
//! silently broken a renderer.

use tengwar::diagram::render_diagram;

fn assert_renders(code: &str) {
    let out = render_diagram(code.to_string())
        .unwrap_or_else(|e| panic!("renderer returned Err for:\n{code}\n---\n{e}"));
    assert!(!out.is_empty(), "empty output for:\n{code}");
    assert!(
        out.contains("<svg"),
        "no <svg> in output for:\n{code}\n--- got:\n{out}"
    );
}

#[test] fn class_diagram() {
    assert_renders("classDiagram\n  class Shape {\n    +area() double\n  }");
}

#[test] fn er_diagram() {
    assert_renders("erDiagram\n  A ||--o{ B : \"has\"");
}

#[test] fn sequence_diagram() {
    assert_renders("sequenceDiagram\n  A->>B: hello\n  B-->>A: hi");
}

#[test] fn state_diagram() {
    assert_renders("stateDiagram-v2\n  [*] --> Idle\n  Idle --> Done : finish");
}

#[test] fn flowchart() {
    assert_renders("flowchart TD\n  A[Start] --> B{OK?}\n  B -->|yes| C[Done]");
}

#[test] fn pie() {
    assert_renders("pie title Time\n  \"Work\" : 60\n  \"Rest\" : 40");
}

#[test] fn gantt() {
    assert_renders("gantt\n  title Sprint\n  section A\n  Task :5d");
}

#[test] fn mindmap() {
    assert_renders("mindmap\n  Root\n    Child");
}

#[test] fn timeline() {
    assert_renders("timeline\n  title History\n  Q1 : Kickoff\n  Q2 : Launch");
}

#[test] fn journey() {
    assert_renders("journey\n  title Day\n  section Morning\n    5: Coffee: Me");
}

#[test] fn quadrant() {
    assert_renders("quadrantChart\n  title Priorities\n  x-axis Low --> High\n  A: [0.3, 0.8]");
}

#[test] fn gitgraph() {
    assert_renders("gitGraph\n  commit\n  branch dev\n  checkout dev\n  commit");
}

#[test] fn sankey() {
    assert_renders("sankey-beta\n  A,B,10\n  B,C,5");
}

#[test] fn requirement() {
    assert_renders("requirementDiagram\n  requirement r {\n    id: 1\n    text: ok\n  }");
}

#[test] fn c4_context() {
    assert_renders("C4Context\n  Person(u, \"User\")\n  System(s, \"App\")\n  Rel(u, s, \"uses\")");
}

#[test] fn xychart() {
    assert_renders("xychart-beta\n  x-axis [A, B]\n  bar [1, 2]");
}

#[test] fn kanban() {
    assert_renders("kanban\n  Todo\n    Task 1\n  Done\n    Task 2");
}

#[test] fn block_diagram() {
    assert_renders("block-beta\n  columns 2\n  a[\"A\"] b[\"B\"]");
}

#[test] fn packet() {
    assert_renders("packet-beta\n  title TCP\n  0-15: \"Source Port\"\n  16-31: \"Dest Port\"");
}

#[test]
fn unknown_type_returns_err() {
    let res = render_diagram("notadiagram\nfoo".to_string());
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Unknown diagram type"));
}

#[test]
fn empty_input_returns_err() {
    assert!(render_diagram("".to_string()).is_err());
}
//! Integration tests for the Markdown pipeline.

use tengwar::markdown::{html_escape, preprocess_wikilinks, render_markdown};

/* ── Wikilink preprocessing ────────────────────────────────── */

#[test]
fn wikilink_plain() {
    assert_eq!(
        preprocess_wikilinks("see [[Welcome]] for details"),
        "see [Welcome](wiki:Welcome) for details"
    );
}

#[test]
fn wikilink_with_space_in_target() {
    // CommonMark rejects spaces in bare link destinations, so the
    // preprocessor has to wrap the URL in <>.
    assert_eq!(
        preprocess_wikilinks("## [[Big O Notation]]"),
        "## [Big O Notation](<wiki:Big O Notation>)"
    );
}

#[test]
fn wikilink_with_display_alias() {
    assert_eq!(
        preprocess_wikilinks("[[target|Display Text]]"),
        "[Display Text](wiki:target)"
    );
}

#[test]
fn wikilink_inline_code_untouched() {
    let out = preprocess_wikilinks("use `[[NotALink]]` literally");
    assert!(out.contains("`[[NotALink]]`"), "got: {out}");
    assert!(!out.contains("](wiki:"), "inline code was rewritten: {out}");
}

#[test]
fn wikilink_fenced_block_untouched() {
    let src = "```\n[[NotALink]]\n```\n";
    let out = preprocess_wikilinks(src);
    assert!(out.contains("[[NotALink]]"));
    assert!(!out.contains("](wiki:"), "fenced block was rewritten: {out}");
}

#[test]
fn wikilink_tilde_fence_untouched() {
    let out = preprocess_wikilinks("~~~\n[[NotALink]]\n~~~\n");
    assert!(out.contains("[[NotALink]]"));
}

#[test]
fn wikilink_unterminated_ignored() {
    assert_eq!(preprocess_wikilinks("[[oops"), "[[oops");
}

#[test]
fn wikilink_empty_target_ignored() {
    assert_eq!(preprocess_wikilinks("[[]] and [[  ]]"), "[[]] and [[  ]]");
}

/* ── HTML escaping ─────────────────────────────────────────── */

#[test]
fn html_escape_covers_four_chars() {
    assert_eq!(html_escape("<script>"), "&lt;script&gt;");
    assert_eq!(html_escape("a & b"), "a &amp; b");
    assert_eq!(html_escape(r#"say "hi""#), "say &quot;hi&quot;");
}

/* ── Whole pipeline ────────────────────────────────────────── */

#[test]
fn render_heading() {
    let out = render_markdown("# Title".to_string());
    assert!(out.contains("<h1"), "got: {out}");
    assert!(out.contains("Title"));
}

#[test]
fn render_task_list() {
    let out = render_markdown("- [x] done\n- [ ] todo".to_string());
    assert!(out.contains("task-list"), "got: {out}");
    assert!(out.contains(r#"type="checkbox""#));
}

#[test]
fn render_wikilink_roundtrip() {
    let out = render_markdown("see [[Welcome]]".to_string());
    assert!(out.contains(r#"href="wiki:Welcome""#), "got: {out}");
}

#[test]
fn render_wikilink_with_space() {
    let out = render_markdown("## [[Big O Notation]]".to_string());
    // pulldown-cmark percent-encodes the space in the URL per the
    // HTML spec. The frontend must decode it back before resolving
    // against the file list — see 04-preview-interactive.js.
    assert!(
        out.contains(r#"href="wiki:Big%20O%20Notation""#),
        "got: {out}"
    );
}

#[test]
fn render_inline_code_is_not_a_wikilink() {
    let out = render_markdown("use `[[NotALink]]` literally".to_string());
    assert!(out.contains("<code>[[NotALink]]</code>"), "got: {out}");
    assert!(!out.contains("wiki:NotALink"), "inline code became a link: {out}");
}

#[test]
fn render_mermaid_block_emits_placeholder() {
    let out = render_markdown("```mermaid\ngraph TD\nA-->B\n```".to_string());
    assert!(out.contains(r#"class="diagram""#), "got: {out}");
    assert!(out.contains("data-mermaid="));
}
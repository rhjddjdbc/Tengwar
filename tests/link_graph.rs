//! Integration tests for the wikilink extractor used by the graph view.

use tengwar::link_graph::extract_wikilinks;

#[test]
fn plain_links() {
    assert_eq!(
        extract_wikilinks("see [[A]] and [[B]]"),
        vec!["A", "B"]
    );
}

#[test]
fn display_alias_uses_target() {
    assert_eq!(
        extract_wikilinks("[[target|Display Text]]"),
        vec!["target"]
    );
}

#[test]
fn unterminated_link_ignored() {
    assert!(extract_wikilinks("[[oops").is_empty());
}

#[test]
fn empty_target_ignored() {
    assert!(extract_wikilinks("[[]] and [[   ]]").is_empty());
}

#[test]
fn unicode_target() {
    assert_eq!(
        extract_wikilinks("[[日本語のノート]]"),
        vec!["日本語のノート"]
    );
}

#[test]
fn multiple_per_line() {
    assert_eq!(
        extract_wikilinks("[[A]] [[B]] [[C]]"),
        vec!["A", "B", "C"]
    );
}

#[test]
fn nested_brackets_ignored() {
    // The extractor stops at the first `]]` — everything after is
    // treated as ordinary text. No panic, no crash.
    let out = extract_wikilinks("[[A]]]]");
    assert_eq!(out, vec!["A"]);
}
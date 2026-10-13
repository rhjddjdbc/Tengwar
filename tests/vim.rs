//! Integration tests for the Vim state machine.
//!
//! Runs against the public API of the `tengwar` library crate.
//! The unit tests in `src/tests/vim.rs` still exist and cover
//! private helpers; this file exercises the same behavior through
//! the same public surface a downstream consumer would use.

use tengwar::vim::{KeyEvent, Mode, VimState};

fn key(s: &str) -> KeyEvent {
    KeyEvent {
        key: s.to_string(),
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        cursor_hint: None,
    }
}

fn type_str(vim: &mut VimState, s: &str) {
    for c in s.chars() {
        vim.handle_key(key(&c.to_string()));
    }
}

fn vim_with(text: &str) -> VimState {
    let mut v = VimState::new();
    v.load_text(text.to_string());
    v
}

/* ── Mode transitions ──────────────────────────────────────── */

#[test]
fn starts_in_normal_mode() {
    let v = VimState::new();
    assert_eq!(v.mode, Mode::Normal);
}

#[test]
fn i_enters_insert_mode() {
    let mut v = vim_with("hello");
    v.handle_key(key("i"));
    assert_eq!(v.mode, Mode::Insert);
}

#[test]
fn escape_returns_to_normal() {
    let mut v = vim_with("hello");
    v.handle_key(key("i"));
    v.handle_key(key("Escape"));
    assert_eq!(v.mode, Mode::Normal);
}

/* ── Escape cursor behavior ────────────────────────────────── */

#[test]
fn escape_from_insert_moves_cursor_back() {
    let mut v = vim_with("hello");
    v.cursor = 5;
    v.handle_key(key("i"));
    v.handle_key(key("Escape"));
    assert_eq!(v.cursor, 4);
}

#[test]
fn escape_from_normal_leaves_cursor_alone() {
    let mut v = vim_with("hello");
    v.cursor = 3;
    v.handle_key(key("Escape"));
    assert_eq!(v.cursor, 3);
}

/* ── Undo grouping ─────────────────────────────────────────── */

#[test]
fn insert_session_is_single_undo() {
    let mut v = vim_with("");
    v.handle_key(key("i"));
    type_str(&mut v, "hello");
    v.handle_key(key("Escape"));
    assert_eq!(v.text, "hello");
    v.handle_key(key("u"));
    assert_eq!(v.text, "", "whole insert session should undo at once");
}

#[test]
fn normal_mode_each_command_is_own_undo() {
    let mut v = vim_with("abc");
    v.handle_key(key("x"));
    v.handle_key(key("x"));
    assert_eq!(v.text, "c");
    v.handle_key(key("u"));
    assert_eq!(v.text, "bc");
    v.handle_key(key("u"));
    assert_eq!(v.text, "abc");
}

#[test]
fn redo_after_undo() {
    let mut v = vim_with("abc");
    v.handle_key(key("x"));
    v.handle_key(key("u"));
    let ctrl_r = KeyEvent {
        key: "r".into(),
        ctrl: true,
        shift: false,
        alt: false,
        meta: false,
        cursor_hint: None,
    };
    v.handle_key(ctrl_r);
    assert_eq!(v.text, "bc");
}

/* ── Word motions ──────────────────────────────────────────── */

#[test]
fn dw_deletes_a_word() {
    let mut v = vim_with("hello world");
    v.handle_key(key("d"));
    v.handle_key(key("w"));
    assert_eq!(v.text, "world");
}

#[test]
fn dd_yanks_and_removes_line() {
    let mut v = vim_with("first\nsecond\nthird");
    v.handle_key(key("d"));
    v.handle_key(key("d"));
    assert_eq!(v.text, "second\nthird");
    assert_eq!(v.yank_buffer, "first\n");
}

/* ── Visual mode ───────────────────────────────────────────── */

#[test]
fn visual_yank_resets_cursor_and_mode() {
    let mut v = vim_with("hello world");
    v.handle_key(key("v"));
    for _ in 0..4 { v.handle_key(key("l")); }
    v.handle_key(key("y"));
    assert_eq!(v.yank_buffer, "hello");
    assert_eq!(v.cursor, 0);
    assert_eq!(v.mode, Mode::Normal);
    assert!(v.visual_start.is_none());
}

/* ── UTF-8 safety ──────────────────────────────────────────── */

#[test]
fn utf8_cursor_is_charwise_not_bytewise() {
    let mut v = vim_with("日本語");
    v.handle_key(key("l"));
    assert_eq!(v.cursor, 3);
    v.handle_key(key("l"));
    assert_eq!(v.cursor, 6);
}

#[test]
fn utf8_delete_removes_whole_char() {
    let mut v = vim_with("日本");
    v.handle_key(key("x"));
    assert_eq!(v.text, "本");
}
use serde::{Deserialize, Serialize};

/// Cap for numeric prefixes (`1000dd` works, `999999999p` doesn't).
const MAX_COUNT: usize = 1_000;

/// Cap for undo history length.
const MAX_UNDO: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode { Normal, Insert, Visual }

#[derive(Debug, Clone, Deserialize)]
pub struct KeyEvent {
    pub key: String,
    #[serde(default)] pub ctrl: bool,
    #[serde(default)] #[allow(dead_code)] pub shift: bool,
    #[serde(default)] #[allow(dead_code)] pub alt: bool,
    #[serde(default)] pub meta: bool,
    #[serde(default)] pub cursor_hint: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub text: String,
    pub cursor: usize,
    pub mode: Mode,
    pub pending: String,
    pub count: String,
    pub dirty: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visual_start: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visual_end: Option<usize>,
}

/// Last repeatable change, replayed by `.`.
#[derive(Debug, Clone)]
enum LastChange {
    DeleteChar(usize),
    Paste(usize),
    DeleteLine(usize),
    YankLine,
    DeleteWord(usize),
}

pub struct VimState {
    pub text: String,
    pub cursor: usize,
    pub mode: Mode,
    pub pending: String,
    pub count: String,
    pub yank_buffer: String,
    pub visual_start: Option<usize>,
    last_change: Option<LastChange>,
    undo_stack: Vec<String>,
    redo_stack: Vec<String>,
    saved_text: String,
    /// True once the current insert session has pushed its undo checkpoint.
    /// Reset to false on entry to insert mode; prevents per-keystroke undo.
    insert_undo_pushed: bool,
}

impl VimState {
    pub fn new() -> Self {
        Self {
            text: String::new(),
            cursor: 0,
            mode: Mode::Normal,
            pending: String::new(),
            count: String::new(),
            yank_buffer: String::new(),
            visual_start: None,
            last_change: None,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            saved_text: String::new(),
            insert_undo_pushed: false,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            text: self.text.clone(),
            cursor: self.cursor,
            mode: self.mode,
            pending: self.pending.clone(),
            count: self.count.clone(),
            dirty: self.text != self.saved_text,
            visual_start: self.visual_start,
            visual_end: if self.mode == Mode::Visual { Some(self.cursor) } else { None },
        }
    }

    /// Sync the internal buffer without touching `saved_text`.
    pub fn set_text(&mut self, text: String) {
        self.push_undo();
        self.text = text;
        self.cursor = self.cursor.min(self.text.len());
        self.visual_start = None;
    }

    /// Replace a byte range in the buffer. Used by frontend features
    /// that need to modify the text while Vim owns the state
    /// (autocomplete, formatting tools, etc.). Preserves the current
    /// mode — unlike `set_text`, this doesn't reset anything.
    ///
    /// `start` and `end` are byte offsets and must be valid char
    /// boundaries. Silently ignores invalid ranges so a bad hint from
    /// the JS side can't crash the state machine.
    pub fn replace_range(&mut self, start: usize, end: usize, text: &str) {
        if start > end
            || end > self.text.len()
            || !self.text.is_char_boundary(start)
            || !self.text.is_char_boundary(end)
        {
            return;
        }
        self.push_undo();
        self.text.replace_range(start..end, text);
        self.cursor = start + text.len();
        self.visual_start = None;
    }

    /// Load a fresh document. Resets undo/redo and marks the buffer clean.
    pub fn load_text(&mut self, text: String) {
        self.text = text.clone();
        self.saved_text = text;
        self.cursor = 0;
        self.mode = Mode::Normal;
        self.pending.clear();
        self.count.clear();
        self.visual_start = None;
        self.yank_buffer.clear();
        self.last_change = None;
        self.undo_stack.clear();
        self.redo_stack.clear();
        self.insert_undo_pushed = false;
    }

    /// Mark the current buffer as the saved state.
    pub fn mark_saved(&mut self) {
        self.saved_text = self.text.clone();
    }

    pub fn go_to_line(&mut self, line: usize) {
        let mut pos = 0;
        let mut cur_line = 1;
        for (i, c) in self.text.char_indices() {
            if cur_line >= line { break; }
            if c == '\n' { cur_line += 1; pos = i + 1; }
        }
        self.cursor = pos.min(self.text.len());
        self.visual_start = None;
        self.mode = Mode::Normal;
        self.insert_undo_pushed = false;
    }

    /* ═══════════════════════════════════════════════════════════
       UNDO / REDO
       ═══════════════════════════════════════════════════════════ */

    fn push_undo(&mut self) {
        self.undo_stack.push(self.text.clone());
        if self.undo_stack.len() > MAX_UNDO {
            self.undo_stack.remove(0);
        }
        self.redo_stack.clear();
    }

    fn ensure_insert_checkpoint(&mut self) {
        if self.mode == Mode::Insert {
            if !self.insert_undo_pushed {
                self.push_undo();
                self.insert_undo_pushed = true;
            }
        } else {
            self.push_undo();
        }
    }

    fn undo(&mut self) {
        if let Some(prev) = self.undo_stack.pop() {
            self.redo_stack.push(self.text.clone());
            self.text = prev;
            self.cursor = self.cursor.min(self.text.len());
        }
        self.insert_undo_pushed = false;
    }

    fn redo(&mut self) {
        if let Some(next) = self.redo_stack.pop() {
            self.undo_stack.push(self.text.clone());
            self.text = next;
            self.cursor = self.cursor.min(self.text.len());
        }
        self.insert_undo_pushed = false;
    }

    /* ═══════════════════════════════════════════════════════════
       UTF-8 CHARACTER NAVIGATION
       ═══════════════════════════════════════════════════════════ */

    fn char_at(&self, pos: usize) -> Option<char> {
        if pos >= self.text.len() { return None; }
        self.text[pos..].chars().next()
    }
    fn prev_char_pos(&self, pos: usize) -> Option<usize> {
        if pos == 0 { return None; }
        let mut p = pos - 1;
        while p > 0 && !self.text.is_char_boundary(p) { p -= 1; }
        Some(p)
    }
    fn next_char_pos(&self, pos: usize) -> Option<usize> {
        let c = self.char_at(pos)?;
        Some(pos + c.len_utf8())
    }
    fn char_len_at(&self, pos: usize) -> usize {
        self.char_at(pos).map(|c| c.len_utf8()).unwrap_or(0)
    }

    fn line_start_pos(&self, pos: usize) -> usize {
        self.text[..pos].rfind('\n').map(|i| i + 1).unwrap_or(0)
    }
    fn line_end_pos(&self, pos: usize) -> usize {
        self.text[pos..].find('\n').map(|i| pos + i).unwrap_or(self.text.len())
    }
    fn col_of(&self, pos: usize) -> usize {
        self.text[..pos].chars().rev().take_while(|&c| c != '\n').count()
    }

    fn move_line(&mut self, dir: i32) {
        let col = self.col_of(self.cursor);
        if dir < 0 {
            let ls = self.line_start_pos(self.cursor);
            if ls == 0 { return; }
            let prev_start = self.line_start_pos(ls - 1);
            let prev_line: String = self.text[prev_start..ls - 1].to_string();
            let target_col = col.min(prev_line.chars().count());
            self.cursor = prev_start
                + prev_line.chars().take(target_col).map(|c| c.len_utf8()).sum::<usize>();
        } else {
            let le = self.line_end_pos(self.cursor);
            if le >= self.text.len() { return; }
            let next_start = le + 1;
            let next_end = self.line_end_pos(next_start);
            let next_line: String = self.text[next_start..next_end].to_string();
            let target_col = col.min(next_line.chars().count());
            self.cursor = next_start
                + next_line.chars().take(target_col).map(|c| c.len_utf8()).sum::<usize>();
        }
    }

    fn is_word_char(c: char) -> bool { c.is_alphanumeric() || c == '_' }

    fn word_forward(&mut self) {
        let mut p = self.cursor;
        while let Some(c) = self.char_at(p) {
            if !Self::is_word_char(c) { break; }
            p = self.next_char_pos(p).unwrap_or(p);
        }
        while let Some(c) = self.char_at(p) {
            if Self::is_word_char(c) { break; }
            p = self.next_char_pos(p).unwrap_or(p);
        }
        self.cursor = p;
    }

    fn word_back(&mut self) {
        let mut p = self.cursor;
        while let Some(prev) = self.prev_char_pos(p) {
            if Self::is_word_char(self.char_at(prev).unwrap_or(' ')) { break; }
            p = prev;
        }
        while let Some(prev) = self.prev_char_pos(p) {
            if !Self::is_word_char(self.char_at(prev).unwrap_or(' ')) { break; }
            p = prev;
        }
        self.cursor = p;
    }

    fn word_end(&mut self) {
        let mut p = self.next_char_pos(self.cursor).unwrap_or(self.cursor);
        while let Some(c) = self.char_at(p) {
            if Self::is_word_char(c) { break; }
            p = self.next_char_pos(p).unwrap_or(p);
        }
        while let Some(next) = self.next_char_pos(p) {
            if !Self::is_word_char(self.char_at(next).unwrap_or(' ')) { break; }
            p = next;
        }
        self.cursor = p;
    }

    /* ═══════════════════════════════════════════════════════════
       MUTATIONS
       ═══════════════════════════════════════════════════════════ */

    fn insert_str(&mut self, s: &str) {
        self.ensure_insert_checkpoint();
        self.text.insert_str(self.cursor, s);
        self.cursor += s.len();
    }

    fn delete_char_at_cursor(&mut self) {
        if let Some(c) = self.char_at(self.cursor) {
            self.push_undo();
            self.text.replace_range(self.cursor..self.cursor + c.len_utf8(), "");
        }
    }

    fn delete_word(&mut self) {
        let mut q = self.cursor;
        while let Some(c) = self.char_at(q) {
            if !Self::is_word_char(c) { break; }
            q = self.next_char_pos(q).unwrap_or(q);
        }
        while let Some(c) = self.char_at(q) {
            if Self::is_word_char(c) { break; }
            q = self.next_char_pos(q).unwrap_or(q);
        }
        self.push_undo();
        self.text.replace_range(self.cursor..q, "");
    }

    fn delete_line(&mut self) {
        let start = self.line_start_pos(self.cursor);
        let mut end = self.line_end_pos(self.cursor);
        if end < self.text.len() { end += 1; }
        self.yank_buffer = self.text[start..end].to_string();
        self.push_undo();
        self.text.replace_range(start..end, "");
        self.cursor = start.min(self.text.len());
    }

    fn yank_line(&mut self) {
        let start = self.line_start_pos(self.cursor);
        let mut end = self.line_end_pos(self.cursor);
        if end < self.text.len() { end += 1; }
        self.yank_buffer = self.text[start..end].to_string();
    }

    fn paste(&mut self) {
        if self.yank_buffer.is_empty() { return; }
        let buf = self.yank_buffer.clone();
        self.insert_str(&buf);
        if buf.ends_with('\n') {
            if let Some(prev) = self.prev_char_pos(self.cursor) {
                if self.char_at(prev) == Some('\n') {
                    self.cursor = prev + 1;
                }
            }
        } else if let Some(prev) = self.prev_char_pos(self.cursor) {
            self.cursor = prev;
        }
    }

    fn open_line_below(&mut self) {
        self.cursor = self.line_end_pos(self.cursor);
        self.insert_str("\n");
        if let Some(prev) = self.prev_char_pos(self.cursor) { self.cursor = prev; }
    }

    fn open_line_above(&mut self) {
        self.cursor = self.line_start_pos(self.cursor);
        self.insert_str("\n");
        if let Some(prev) = self.prev_char_pos(self.cursor) { self.cursor = prev; }
    }

    fn repeat_n<F: FnMut(&mut Self)>(&mut self, n: usize, mut f: F) {
        for _ in 0..n { f(self); }
    }

    /// Returns the byte range (start, end_exclusive) of the visual selection.
    fn visual_range(&self) -> Option<(usize, usize)> {
        let vs = self.visual_start?;
        let a = vs.min(self.cursor);
        let b = vs.max(self.cursor);
        let end = b + self.char_len_at(b);
        Some((a, end))
    }

    /* ═══════════════════════════════════════════════════════════
       KEY HANDLING
       ═══════════════════════════════════════════════════════════ */

    pub fn handle_key(&mut self, ev: KeyEvent) {
        if let Some(hint) = ev.cursor_hint {
            if hint <= self.text.len() && self.text.is_char_boundary(hint) {
                if self.cursor != hint {
                    self.cursor = hint;
                }
            }
        }

        if ev.ctrl || ev.meta {
            let k = ev.key.to_lowercase();
            if k == "r" { self.redo(); }
            return;
        }

        if ev.key == "Escape" {
            // Only step the cursor back when leaving insert mode.
            let was_insert = self.mode == Mode::Insert;
            self.mode = Mode::Normal;
            self.pending.clear();
            self.count.clear();
            self.visual_start = None;
            self.insert_undo_pushed = false;
            if was_insert && self.cursor > 0 {
                if let Some(p) = self.prev_char_pos(self.cursor) { self.cursor = p; }
            }
            return;
        }

        /* ── INSERT mode ─────────────────────────────────────── */
        if self.mode == Mode::Insert {
            match ev.key.as_str() {
                "Enter" => self.insert_str("\n"),
                "Backspace" => {
                    if let Some(p) = self.prev_char_pos(self.cursor) {
                        self.ensure_insert_checkpoint();
                        self.text.replace_range(p..self.cursor, "");
                        self.cursor = p;
                    }
                }
                "Tab" => self.insert_str("  "),
                "ArrowLeft"  => { if let Some(p) = self.prev_char_pos(self.cursor) { self.cursor = p; } }
                "ArrowRight" => { if let Some(p) = self.next_char_pos(self.cursor) { self.cursor = p; } }
                "ArrowUp"    => self.move_line(-1),
                "ArrowDown"  => self.move_line(1),
                "Home" => self.cursor = self.line_start_pos(self.cursor),
                "End"  => self.cursor = self.line_end_pos(self.cursor),
                _ => {
                    if ev.key.chars().count() == 1 {
                        self.insert_str(&ev.key);
                    }
                }
            }
            return;
        }

        /* ── VISUAL mode ─────────────────────────────────────── */
        if self.mode == Mode::Visual {
            match ev.key.as_str() {
                "v" => {
                    self.mode = Mode::Normal;
                    self.visual_start = None;
                    return;
                }
                "h" | "ArrowLeft"  => { if let Some(p) = self.prev_char_pos(self.cursor) { self.cursor = p; } return; }
                "l" | "ArrowRight" => { if let Some(p) = self.next_char_pos(self.cursor) { self.cursor = p; } return; }
                "j" | "ArrowDown"  => { self.move_line(1);  return; }
                "k" | "ArrowUp"    => { self.move_line(-1); return; }
                "w" => { self.word_forward(); return; }
                "b" => { self.word_back();    return; }
                "e" => { self.word_end();     return; }
                "0" | "Home" => { self.cursor = self.line_start_pos(self.cursor); return; }
                "$" | "End"  => { self.cursor = self.line_end_pos(self.cursor);   return; }
                "G" => { self.cursor = self.text.len(); return; }
                "y" => {
                    // Capture `a` BEFORE clearing visual_start.
                    if let Some((a, b)) = self.visual_range() {
                        self.yank_buffer = self.text[a..b].to_string();
                        self.cursor = a;
                    }
                    self.mode = Mode::Normal;
                    self.visual_start = None;
                    self.insert_undo_pushed = false;
                    self.cursor = self.cursor.min(self.text.len());
                    return;
                }
                "d" | "x" => {
                    if let Some((a, b)) = self.visual_range() {
                        self.yank_buffer = self.text[a..b].to_string();
                        self.push_undo();
                        self.text.replace_range(a..b, "");
                        self.cursor = a.min(self.text.len());
                    }
                    self.mode = Mode::Normal;
                    self.visual_start = None;
                    self.insert_undo_pushed = false;
                    return;
                }
                "c" => {
                    self.mode = Mode::Insert;
                    self.insert_undo_pushed = false;
                    if let Some((a, b)) = self.visual_range() {
                        self.yank_buffer = self.text[a..b].to_string();
                        self.push_undo();
                        self.insert_undo_pushed = true;
                        self.text.replace_range(a..b, "");
                        self.cursor = a;
                    }
                    self.visual_start = None;
                    return;
                }
                _ => return,
            }
        }

        /* ── NORMAL mode ─────────────────────────────────────── */

        if ev.key.len() == 1 {
            let c = ev.key.chars().next().unwrap();
            if c.is_ascii_digit() && !(c == '0' && self.count.is_empty()) {
                self.count.push(c);
                return;
            }
        }

        if !self.pending.is_empty() {
            let seq = format!("{}{}", self.pending, ev.key);
            self.pending.clear();
            let n = self.take_count();
            match seq.as_str() {
                "gg" => { self.cursor = 0; }
                "dd" => { self.repeat_n(n, |s| s.delete_line()); self.last_change = Some(LastChange::DeleteLine(n)); }
                "yy" => { self.yank_line(); self.last_change = Some(LastChange::YankLine); }
                "dw" => { self.repeat_n(n, |s| s.delete_word()); self.last_change = Some(LastChange::DeleteWord(n)); }
                _ => {}
            }
            return;
        }

        let n = self.take_count();
        match ev.key.as_str() {
            "i" => { self.mode = Mode::Insert; self.insert_undo_pushed = false; }
            "a" => {
                if let Some(p) = self.next_char_pos(self.cursor) { self.cursor = p; }
                self.mode = Mode::Insert;
                self.insert_undo_pushed = false;
            }
            "A" => {
                self.cursor = self.line_end_pos(self.cursor);
                self.mode = Mode::Insert;
                self.insert_undo_pushed = false;
            }
            "I" => {
                self.cursor = self.line_start_pos(self.cursor);
                self.mode = Mode::Insert;
                self.insert_undo_pushed = false;
            }
            "o" => {
                self.mode = Mode::Insert;
                self.insert_undo_pushed = false;
                self.open_line_below();
            }
            "O" => {
                self.mode = Mode::Insert;
                self.insert_undo_pushed = false;
                self.open_line_above();
            }
            "v" => {
                self.mode = Mode::Visual;
                self.visual_start = Some(self.cursor);
            }
            "V" => {
                self.mode = Mode::Visual;
                self.visual_start = Some(self.line_start_pos(self.cursor));
            }
            "h" | "ArrowLeft"  => self.repeat_n(n, |s| { if let Some(p) = s.prev_char_pos(s.cursor) { s.cursor = p; } }),
            "l" | "ArrowRight" => self.repeat_n(n, |s| { if let Some(p) = s.next_char_pos(s.cursor) { s.cursor = p; } }),
            "j" | "ArrowDown"  => self.repeat_n(n, |s| s.move_line(1)),
            "k" | "ArrowUp"    => self.repeat_n(n, |s| s.move_line(-1)),
            "w" => self.repeat_n(n, |s| s.word_forward()),
            "b" => self.repeat_n(n, |s| s.word_back()),
            "e" => self.repeat_n(n, |s| s.word_end()),
            "0" | "Home" => self.cursor = self.line_start_pos(self.cursor),
            "$" | "End"  => self.cursor = self.line_end_pos(self.cursor),
            "G" => self.cursor = self.text.len(),
            "x" => {
                self.repeat_n(n, |s| s.delete_char_at_cursor());
                self.last_change = Some(LastChange::DeleteChar(n));
            }
            "p" => {
                self.repeat_n(n, |s| s.paste());
                self.last_change = Some(LastChange::Paste(n));
            }
            "u" => self.undo(),
            "g" | "d" | "y" => self.pending = ev.key.clone(),
            "." => {
                if let Some(lc) = self.last_change.clone() {
                    match lc {
                        LastChange::DeleteChar(n) => self.repeat_n(n, |s| s.delete_char_at_cursor()),
                        LastChange::Paste(n)      => self.repeat_n(n, |s| s.paste()),
                        LastChange::DeleteLine(n) => self.repeat_n(n, |s| s.delete_line()),
                        LastChange::YankLine      => self.yank_line(),
                        LastChange::DeleteWord(n) => self.repeat_n(n, |s| s.delete_word()),
                    }
                }
            }
            _ => {}
        }
    }

    fn take_count(&mut self) -> usize {
        let n = if self.count.is_empty() {
            1
        } else {
            self.count.parse().unwrap_or(1)
        };
        self.count.clear();
        n.min(MAX_COUNT)
    }
}

/* ═══════════════════════════════════════════════════════════════
   TAURI COMMANDS
   ═══════════════════════════════════════════════════════════════ */

use crate::state::AppState;
use tauri::State;

fn lock_vim<'a>(state: &'a State<'a, AppState>) -> Result<std::sync::MutexGuard<'a, VimState>, String> {
    state
        .vim
        .lock()
        .map_err(|_| "vim state poisoned by an earlier panic — restart the app".to_string())
}

#[tauri::command]
pub fn vim_handle_key(state: State<AppState>, event: KeyEvent) -> Result<Snapshot, String> {
    let mut vim = lock_vim(&state)?;
    vim.handle_key(event);
    Ok(vim.snapshot())
}

#[tauri::command]
pub fn vim_set_text(state: State<AppState>, text: String) -> Result<Snapshot, String> {
    let mut vim = lock_vim(&state)?;
    vim.set_text(text);
    Ok(vim.snapshot())
}

/// Replace a byte range in the Vim buffer. Used by the frontend when
/// a feature needs to modify the text without going through the key
/// state machine (wikilink autocomplete, formatting tools, etc.).
/// Preserves the current mode.
#[tauri::command]
pub fn vim_replace_range(
    state: State<AppState>,
    start: usize,
    end: usize,
    text: String,
) -> Result<Snapshot, String> {
    let mut vim = lock_vim(&state)?;
    vim.replace_range(start, end, &text);
    Ok(vim.snapshot())
}

#[tauri::command]
pub fn vim_load_text(state: State<AppState>, text: String) -> Result<Snapshot, String> {
    let mut vim = lock_vim(&state)?;
    vim.load_text(text);
    Ok(vim.snapshot())
}

#[tauri::command]
pub fn vim_mark_saved(state: State<AppState>) -> Result<Snapshot, String> {
    let mut vim = lock_vim(&state)?;
    vim.mark_saved();
    Ok(vim.snapshot())
}

#[tauri::command]
pub fn vim_get_text(state: State<AppState>) -> Result<String, String> {
    Ok(lock_vim(&state)?.text.clone())
}

#[tauri::command]
pub fn vim_snapshot(state: State<AppState>) -> Result<Snapshot, String> {
    Ok(lock_vim(&state)?.snapshot())
}

#[tauri::command]
pub fn vim_go_to_line(state: State<AppState>, line: usize) -> Result<Snapshot, String> {
    let mut vim = lock_vim(&state)?;
    vim.go_to_line(line);
    Ok(vim.snapshot())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub action: String,
    pub arg: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
pub fn vim_execute_command(state: State<AppState>, cmd: String) -> Result<CommandResult, String> {
    let cmd = cmd.trim().to_string();
    if cmd.is_empty() {
        return Ok(CommandResult { action: "noop".into(), arg: None, message: None });
    }
    let mut vim = lock_vim(&state)?;

    if cmd == "w" || cmd == "write" {
        return Ok(CommandResult { action: "save".into(), arg: None, message: None });
    }
    if let Some(name) = cmd.strip_prefix("w ") {
        return Ok(CommandResult {
            action: "save_as".into(),
            arg: Some(name.trim().into()),
            message: None,
        });
    }
    if cmd == "q" || cmd == "q!" || cmd == "quit" {
        return Ok(CommandResult { action: "quit".into(), arg: None, message: None });
    }
    if let Ok(n) = cmd.parse::<usize>() {
        vim.go_to_line(n);
        return Ok(CommandResult { action: "goto".into(), arg: Some(n.to_string()), message: None });
    }
    if let Some(name) = cmd.strip_prefix("e ").or_else(|| cmd.strip_prefix("edit ")) {
        return Ok(CommandResult {
            action: "edit".into(),
            arg: Some(name.trim().into()),
            message: None,
        });
    }
    if cmd.starts_with("s/") {
        let parts: Vec<&str> = cmd.splitn(4, '/').collect();
        if parts.len() >= 3 {
            let old = parts[1];
            let new = parts[2];
            let flags = parts.get(3).copied().unwrap_or("");
            let global = flags.contains('g');
            let count = if global {
                vim.text.matches(old).count()
            } else if vim.text.contains(old) {
                1
            } else {
                0
            };
            if count > 0 {
                vim.push_undo();
                vim.text = if global {
                    vim.text.replace(old, new)
                } else {
                    vim.text.replacen(old, new, 1)
                };
                return Ok(CommandResult {
                    action: "substituted".into(),
                    arg: None,
                    message: Some(format!(
                        "{} replacement{}",
                        count,
                        if count == 1 { "" } else { "s" }
                    )),
                });
            }
            return Ok(CommandResult {
                action: "noop".into(),
                arg: None,
                message: Some("No matches".into()),
            });
        }
        return Ok(CommandResult {
            action: "error".into(),
            arg: None,
            message: Some("Usage: :s/old/new/g".into()),
        });
    }
    Ok(CommandResult {
        action: "error".into(),
        arg: None,
        message: Some(format!("Unknown command: {cmd}")),
    })
}
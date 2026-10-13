"use strict";

/* ═══════════════════════════════════════════════════════════════
   HISTORY — JS-side undo / redo

   Non-vim mode: every programmatic change to editorTA.value pushes a
   snapshot. Keyboard bursts group into a single undo step (400 ms).
   Vim mode: the Rust state machine owns undo — the toolbar buttons
   and Ctrl+Z route there via dispatchVimUndoRedo().

   Block mode: syncBlocksToEditor() pushes on every structural change;
   Ctrl+Z inside a block textarea is handled locally (see 31-block-editor.js).
   ═══════════════════════════════════════════════════════════════ */

const undoStack = [];   // values we can undo back to
const redoStack = [];   // values we can redo forward to
const MAX_UNDO = 200;

let typingSession = false;
let typingSessionTimer = null;
let lastSessionValue = '';

/* ── Core ─────────────────────────────────────────────────────── */

function pushUndoSnapshot(value) {
  if (value === undefined) value = editorTA.value;
  // Don't push two identical consecutive values.
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === value) return;
  undoStack.push(value);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}

function resetUndoHistory(value) {
  if (value === undefined) value = editorTA.value;
  typingSession = false;
  clearTimeout(typingSessionTimer);
  typingSessionTimer = null;
  lastSessionValue = value;
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoButtons();
}

function endTypingSession() {
  if (!typingSession) return;
  typingSession = false;
  clearTimeout(typingSessionTimer);
  typingSessionTimer = null;
  lastSessionValue = editorTA.value;
}

function performUndo() {
  endTypingSession();
  if (undoStack.length === 0) return;
  const current = editorTA.value;
  const prev = undoStack.pop();
  redoStack.push(current);
  editorTA.value = prev;
  lastSessionValue = prev;
  applyHistoryChange();
  updateUndoButtons();
}

function performRedo() {
  endTypingSession();
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(editorTA.value);
  editorTA.value = next;
  lastSessionValue = next;
  applyHistoryChange();
  updateUndoButtons();
}

function applyHistoryChange() {
  _lastHighlightedText = null;
  updateHighlight();
  syncTextToBackend();
  markTabModified();
  debouncedRender();
  scheduleAutoSave();
  updateStatusbar();
  if (blockModeEnabled) enterBlockMode();
}

/* ── Typing-session tracking ─────────────────────────────────── */

function historyOnInput() {
  // Vim mode routes everything through the Rust state machine;
  // the browser never fires an input event for it (keydown is
  // preventDefault'ed before the textarea sees it).
  if (vimEnabled && !blockModeEnabled) return;

  if (!typingSession) {
    // First input of a new burst: capture the value we're undoing
    // back to — i.e. the state before this burst of typing.
    pushUndoSnapshot(lastSessionValue);
    typingSession = true;
  }
  clearTimeout(typingSessionTimer);
  typingSessionTimer = setTimeout(endTypingSession, 400);
}

/* ── Routing ──────────────────────────────────────────────────── */

function performUndoFromUI() {
  if (vimEnabled && !blockModeEnabled) dispatchVimUndoRedo('undo');
  else performUndo();
}

function performRedoFromUI() {
  if (vimEnabled && !blockModeEnabled) dispatchVimUndoRedo('redo');
  else performRedo();
}

function dispatchVimUndoRedo(which) {
  vimQueue = vimQueue.then(async () => {
    try {
      const event = which === 'undo'
        ? { key: 'u', ctrl: false, shift: false, alt: false, meta: false, cursor_hint: null }
        : { key: 'r', ctrl: true,  shift: false, alt: false, meta: false, cursor_hint: null };
      const snap = await invoke('vim_handle_key', { event });
      applySnapshot(snap);
      updateHighlight();
      markTabModified();
      debouncedRender();
      scheduleAutoSave();
    } catch (err) { console.error('vim ' + which + ' error:', err); }
  });
}

function updateUndoButtons() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (!u || !r) return;
  if (vimEnabled && !blockModeEnabled) {
    // Vim's undo stack lives in Rust — we can't query its depth, so
    // keep both buttons enabled and let the state machine no-op.
    u.disabled = false;
    r.disabled = false;
  } else {
    u.disabled = undoStack.length === 0;
    r.disabled = redoStack.length === 0;
  }
}

/* ── Wire up the editor's input event ─────────────────────────── */

editorTA.addEventListener('input', historyOnInput);

/* ── Global Ctrl+Z / Ctrl+Y handler (capture phase) ──────────── */

document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.altKey) return;
  const k = e.key.toLowerCase();
  const isUndo = k === 'z' && !e.shiftKey;
  const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
  if (!isUndo && !isRedo) return;

  const ae = document.activeElement;

  // Block-mode textareas handle Ctrl+Z themselves.
  if (ae && ae.classList && ae.classList.contains('block-edit')) return;

  // Real inputs and modals get their native undo.
  if (ae && ae !== editorTA &&
      (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  if (isUndo) performUndoFromUI(); else performRedoFromUI();
}, true);

/* ── Wire up toolbar buttons ─────────────────────────────────── */

document.getElementById('undoBtn').addEventListener('click', performUndoFromUI);
document.getElementById('redoBtn').addEventListener('click', performRedoFromUI);

// Initial button state.
updateUndoButtons();
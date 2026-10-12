"use strict";

/* ═══════════════════════════════════════════════════════════════
   AUTO-PAIRING
   ═══════════════════════════════════════════════════════════════ */
const PAIRS = { '(': ')', '[': ']', '{': '}', '`': '`', '"': '"', "'": "'", '*': '*', '_': '_' };
const OPENERS = new Set(['(', '[', '{', '`', '"', "'"]);

function handleAutoPair(e) {
  const key = e.key;
  if (!(key in PAIRS)) return false;
  const start = editorTA.selectionStart;
  const end = editorTA.selectionEnd;
  const text = editorTA.value;

  if (!OPENERS.has(key) && text[start] === key) {
    editorTA.selectionStart = editorTA.selectionEnd = start + 1;
    return true;
  }

  if (start !== end) {
    const sel = text.slice(start, end);
    const wrapped = key + sel + PAIRS[key];
    editorTA.value = text.slice(0, start) + wrapped + text.slice(end);
    editorTA.selectionStart = editorTA.selectionEnd = start + wrapped.length;
    return true;
  }

  const close = PAIRS[key];
  editorTA.value = text.slice(0, start) + key + close + text.slice(start);
  editorTA.selectionStart = editorTA.selectionEnd = start + 1;
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   FORMAT SHORTCUTS (used by key actions)
   ═══════════════════════════════════════════════════════════════ */
function wrapSelection(before, after = before, placeholder = '') {
  const start = editorTA.selectionStart;
  const end = editorTA.selectionEnd;
  const text = editorTA.value;
  const sel = text.slice(start, end) || placeholder;
  const newText = text.slice(0, start) + before + sel + after + text.slice(end);
  editorTA.value = newText;
  if (start === end) {
    editorTA.selectionStart = start + before.length;
    editorTA.selectionEnd = start + before.length + placeholder.length;
  } else {
    editorTA.selectionStart = start + before.length;
    editorTA.selectionEnd = start + before.length + sel.length;
  }
  updateHighlight();
  syncTextToBackend();
  markTabModified();
  debouncedRender();
  scheduleAutoSave();
  editorTA.focus();
  updateStatusbar();
}

function insertText(text) {
  const start = editorTA.selectionStart;
  const end = editorTA.selectionEnd;
  const val = editorTA.value;
  editorTA.value = val.slice(0, start) + text + val.slice(end);
  editorTA.selectionStart = editorTA.selectionEnd = start + text.length;
  updateHighlight();
  syncTextToBackend();
  markTabModified();
  debouncedRender();
  scheduleAutoSave();
  editorTA.focus();
  updateStatusbar();
}

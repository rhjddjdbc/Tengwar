"use strict";

/* ═══════════════════════════════════════════════════════════════
   WIKILINK AUTOCOMPLETE — v4

   Works in three contexts:
     - standard editor, Vim off
     - standard editor, Vim on, Insert mode
     - block editor (focused .block-edit textarea)

   Vim path uses a custom event (`vim:snapshot-applied`) dispatched
   from 06-vim.js rather than wrapping `window.applySnapshot` — the
   calling code uses a bare lexical reference, not the window
   property, so wrapping never took effect.
   ═══════════════════════════════════════════════════════════════ */

let wlState = {
  open: false,
  editor: null,
  start: 0,
  query: '',
  items: [],
  selected: 0,
};

let _wlPopup = null;
let _wlMirror = null;

/* ── Editor identification ───────────────────────────────────── */

function isBlockEdit(el) {
  return !!(el && el.classList && el.classList.contains('block-edit'));
}

function getEditorFromEvent(e) {
  const t = e && e.target;
  if (t === editorTA) return editorTA;
  if (isBlockEdit(t)) return t;
  return null;
}

function isVimInsertMode() {
  return typeof vimEnabled !== 'undefined' && vimEnabled &&
         typeof currentVimMode !== 'undefined' && currentVimMode === 'insert';
}

function currentEditor() {
  const ae = document.activeElement;
  if (ae === editorTA) return editorTA;
  if (isBlockEdit(ae)) return ae;
  return null;
}

/* ── Context detection ──────────────────────────────────────── */

function detectWikilinkContext(editor) {
  if (!editor) return null;
  const pos = editor.selectionStart;
  if (pos !== editor.selectionEnd) return null;
  const text = editor.value;

  const minPos = Math.max(0, pos - 80);
  for (let i = pos - 1; i > minPos; i--) {
    const ch = text[i];
    if (ch === '\n') return null;
    if (ch === ']' && text[i - 1] === ']') return null;
    if (ch === '[' && text[i - 1] === '[') {
      const query = text.slice(i + 1, pos);
      if (query.includes(']')) return null;
      return { start: i - 1, query };
    }
  }
  return null;
}

/* ── Filtering ───────────────────────────────────────────────── */

function filterWikilinkItems(query) {
  const q = query.trim();
  if (!q) {
    return allFiles
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 15);
  }

  const scored = [];
  for (const f of allFiles) {
    const stem = f.name.replace(/\.(md|markdown|txt)$/i, '');
    let score = 0;
    let match = false;

    if (typeof fuzzyMatchJS === 'function') {
      const res = fuzzyMatchJS(q, stem);
      if (res) { match = true; score = res.score; }
    } else {
      if (stem.toLowerCase().includes(q.toLowerCase())) { match = true; }
    }

    if (match) scored.push({ file: f, score });
  }

  const qL = q.toLowerCase();
  scored.sort((a, b) => {
    const aStarts = a.file.name.toLowerCase().startsWith(qL) ? 1 : 0;
    const bStarts = b.file.name.toLowerCase().startsWith(qL) ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;
    return b.score - a.score;
  });

  return scored.slice(0, 15).map(s => s.file);
}

/* ── Popup DOM ───────────────────────────────────────────────── */

function ensureWikilinkPopup() {
  if (_wlPopup) return _wlPopup;
  _wlPopup = document.createElement('div');
  _wlPopup.id = 'wikilink-popup';
  _wlPopup.className = 'wikilink-popup';
  _wlPopup.innerHTML = '<div class="wl-list"></div>';
  document.body.appendChild(_wlPopup);
  return _wlPopup;
}

/* ── Caret position — mirror technique ──────────────────────── */

function getCaretRect(editor) {
  if (!editor) return { top: 0, left: 0, lineHeight: 20 };

  if (!_wlMirror) {
    _wlMirror = document.createElement('div');
    document.body.appendChild(_wlMirror);
  }
  const cs = getComputedStyle(editor);
  const m = _wlMirror;

  // position:absolute (top:0, left far off-screen) — matches the
  // technique in 06-vim.js `ensureCaretVisible`. position:fixed with
  // top:-99999px caused Chromium to skip layout, giving offsetTop=0
  // and a popup that stuck to the top of the editor instead of the
  // caret.
  m.style.cssText =
    'position:absolute;top:0;left:-99999px;' +
    'visibility:hidden;pointer-events:none;' +
    'overflow:hidden;border:0;box-sizing:border-box;margin:0;';

  const props = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'tabSize',
    'textTransform', 'textIndent', 'whiteSpace', 'wordBreak',
    'overflowWrap',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];
  for (const p of props) m.style[p] = cs[p];
  m.style.width = editor.clientWidth + 'px';

  const pos = editor.selectionStart;
  m.textContent = editor.value.slice(0, pos);

  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  m.appendChild(marker);

  // Force layout before reading metrics.
  void marker.offsetTop;

  const markTop = marker.offsetTop;
  const markLeft = marker.offsetLeft;
  const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.7) || 20;

  const rect = editor.getBoundingClientRect();
  const scrollTop = editor.scrollTop;
  const scrollLeft = editor.scrollLeft;

  return {
    top: rect.top + markTop - scrollTop + lineHeight,
    left: rect.left + markLeft - scrollLeft,
    lineHeight,
  };
}

function positionWikilinkPopup() {
  if (!_wlPopup || !wlState.open || !wlState.editor) return;

  const { top, left } = getCaretRect(wlState.editor);
  const popupWidth = 280;
  const popupMaxHeight = 260;

  let x = left;
  let y = top;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (x + popupWidth > vw - 8) x = vw - popupWidth - 8;
  if (y + popupMaxHeight > vh - 8) y = top - popupMaxHeight - 20;
  if (y < 8) y = 8;
  if (x < 8) x = 8;

  _wlPopup.style.left = x + 'px';
  _wlPopup.style.top = y + 'px';
}

/* ── Render ──────────────────────────────────────────────────── */

function renderWikilinkPopup() {
  if (!_wlPopup) return;
  const list = _wlPopup.querySelector('.wl-list');
  list.innerHTML = '';

  if (wlState.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'wl-empty';
    empty.textContent = wlState.query ? 'No matches' : 'No files';
    list.appendChild(empty);
    return;
  }

  wlState.items.forEach((file, idx) => {
    const el = document.createElement('button');
    el.className = 'wl-item' + (idx === wlState.selected ? ' selected' : '');
    const stem = file.name.replace(/\.(md|markdown|txt)$/i, '');
    el.innerHTML =
      `<span class="wl-name">${escapeHtml(stem)}</span>` +
      (file.path !== file.name
        ? `<span class="wl-path">${escapeHtml(file.path)}</span>`
        : '');
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertWikilink(file);
    });
    list.appendChild(el);
  });

  const selectedEl = list.children[wlState.selected];
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

/* ── Open / close / update ──────────────────────────────────── */

function openWikilinkPopup(ctx, editor) {
  if (!isBlockEdit(editor)) {
    if (typeof blockModeEnabled !== 'undefined' && blockModeEnabled) return;
    if (typeof vimEnabled !== 'undefined' && vimEnabled && !isVimInsertMode()) return;
  }

  ensureWikilinkPopup();
  wlState.open = true;
  wlState.editor = editor;
  wlState.start = ctx.start;
  wlState.query = ctx.query;
  wlState.items = filterWikilinkItems(ctx.query);
  wlState.selected = 0;

  _wlPopup.classList.add('show');
  renderWikilinkPopup();
  positionWikilinkPopup();
}

function closeWikilinkPopup() {
  if (_wlPopup) _wlPopup.classList.remove('show');
  wlState.open = false;
  wlState.items = [];
  wlState.selected = 0;
  wlState.editor = null;
}

function updateWikilinkPopup(ctx, editor) {
  wlState.editor = editor;
  wlState.start = ctx.start;
  wlState.query = ctx.query;
  wlState.items = filterWikilinkItems(ctx.query);
  if (wlState.selected >= wlState.items.length) wlState.selected = 0;
  renderWikilinkPopup();
  positionWikilinkPopup();
}

/* ── Check ──────────────────────────────────────────────────── */

function checkWikilinkContext(editor) {
  if (!editor) {
    if (wlState.open) closeWikilinkPopup();
    return;
  }
  if (!isBlockEdit(editor)) {
    if (typeof vimEnabled !== 'undefined' && vimEnabled && !isVimInsertMode()) {
      if (wlState.open) closeWikilinkPopup();
      return;
    }
    if (typeof blockModeEnabled !== 'undefined' && blockModeEnabled) {
      if (wlState.open) closeWikilinkPopup();
      return;
    }
  }

  const ctx = detectWikilinkContext(editor);
  if (!ctx) {
    if (wlState.open) closeWikilinkPopup();
    return;
  }
  if (wlState.open && wlState.editor === editor) updateWikilinkPopup(ctx, editor);
  else openWikilinkPopup(ctx, editor);
}

function scheduleWikilinkCheck(editor) {
  queueMicrotask(() => checkWikilinkContext(editor));
}

/* ── Triggers ───────────────────────────────────────────────── */

// 1. Non-Vim path — listen for input / keyup / click on the two
//    editor kinds. Capture phase so we run before the editors' own
//    handlers and can see the DOM state in a stable moment.
['input', 'keyup', 'click'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    const ed = getEditorFromEvent(e);
    if (ed) scheduleWikilinkCheck(ed);
  }, true);
});

// 2. Vim path — 06-vim.js dispatches `vim:snapshot-applied` at the
//    end of applySnapshot. This is the only reliable signal that the
//    Rust state machine has committed the new text + cursor.
//
//    Wrapping `window.applySnapshot` never worked: the caller in
//    12-editor-keys.js uses a bare lexical reference to the function
//    declaration, not `window.applySnapshot`, so the wrapper was
//    never invoked.
window.addEventListener('vim:snapshot-applied', () => {
  if (!isVimInsertMode()) {
    if (wlState.open) closeWikilinkPopup();
    return;
  }
  const ed = currentEditor();
  if (ed) checkWikilinkContext(ed);
});

// 3. Reposition on scroll / resize.
document.addEventListener('scroll', (e) => {
  if (wlState.open && wlState.editor === e.target) positionWikilinkPopup();
}, true);

window.addEventListener('resize', () => {
  if (wlState.open) positionWikilinkPopup();
});

/* ── Insertion ──────────────────────────────────────────────── */

async function insertWikilink(file) {
  const editor = wlState.editor;
  if (!editor) return;

  const stem = file.name.replace(/\.(md|markdown|txt)$/i, '');
  const start = wlState.start;
  const cursor = editor.selectionStart;
  const text = editor.value;

  const afterCursor = text.slice(cursor);
  const alreadyClosed = afterCursor.startsWith(']]');

  const replaceStart = start + 2;
  const replaceEnd = cursor;
  const replacement = alreadyClosed ? stem : (stem + ']]');

  if (isBlockEdit(editor)) {
    if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot();
    const newText =
      text.slice(0, replaceStart) + replacement + text.slice(replaceEnd);
    editor.value = newText;
    editor.selectionStart = editor.selectionEnd = replaceStart + replacement.length;
    if (typeof autoSizeTextarea === 'function') autoSizeTextarea(editor);
    closeWikilinkPopup();
    editor.focus();
    return;
  }

  if (typeof vimEnabled !== 'undefined' && vimEnabled) {
    const startByte = jsIndexToByte(text, replaceStart);
    const endByte = jsIndexToByte(text, replaceEnd);
    await vimQueue;
    try {
      const snap = await invoke('vim_replace_range', {
        start: startByte,
        end: endByte,
        text: replacement,
      });
      applySnapshot(snap, { scroll: false });
      updateHighlight();
      markTabModified();
      debouncedRender();
      scheduleAutoSave();
      updateStatusbar();
    } catch (e) {
      console.error('vim replace failed:', e);
    }
    closeWikilinkPopup();
    editor.focus();
    return;
  }

  if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot();
  const newText =
    text.slice(0, replaceStart) + replacement + text.slice(replaceEnd);
  const newCursor = replaceStart + replacement.length;
  editor.value = newText;
  editor.selectionStart = editor.selectionEnd = newCursor;
  if (typeof updateHighlight === 'function') updateHighlight();
  if (typeof markTabModified === 'function') markTabModified();
  if (typeof debouncedRender === 'function') debouncedRender();
  if (typeof scheduleAutoSave === 'function') scheduleAutoSave();

  closeWikilinkPopup();
  editor.focus();
}

/* ── Keyboard navigation ───────────────────────────────────── */

document.addEventListener('keydown', (e) => {
  if (!wlState.open) return;
  if (e.target !== wlState.editor) return;

  const key = e.key;

  if (key === 'Enter' || key === 'Tab') {
    if (wlState.items.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      insertWikilink(wlState.items[wlState.selected]);
    } else {
      closeWikilinkPopup();
    }
    return;
  }

  if (key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeWikilinkPopup();
    return;
  }

  if (key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    if (wlState.items.length > 0) {
      wlState.selected = (wlState.selected + 1) % wlState.items.length;
      renderWikilinkPopup();
    }
    return;
  }
  if (key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    if (wlState.items.length > 0) {
      wlState.selected =
        (wlState.selected - 1 + wlState.items.length) % wlState.items.length;
      renderWikilinkPopup();
    }
    return;
  }
}, true);

/* ── Close on outside click ─────────────────────────────────── */

document.addEventListener('mousedown', (e) => {
  if (!wlState.open) return;
  if (e.target === wlState.editor) return;
  if (_wlPopup && _wlPopup.contains(e.target)) return;
  closeWikilinkPopup();
});
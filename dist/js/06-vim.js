"use strict";

/* ═══════════════════════════════════════════════════════════════
   VIM SNAPSHOT
   ═══════════════════════════════════════════════════════════════ */

let _caretMirror = null;
function ensureCaretVisible(pos) {
  if (!editorTA.clientHeight || !editorTA.clientWidth) return;
  try {
    if (!_caretMirror) {
      _caretMirror = document.createElement('div');
      document.body.appendChild(_caretMirror);
    }
    const cs = getComputedStyle(editorTA);
    const m = _caretMirror;
    m.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:0;left:-99999px;overflow:hidden;border:0;box-sizing:border-box;';
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'wordSpacing',
                     'lineHeight', 'tabSize', 'textTransform', 'textIndent', 'whiteSpace', 'wordBreak',
                     'overflowWrap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
      m.style[p] = cs[p];
    }
    m.style.width = editorTA.clientWidth + 'px';
    m.textContent = editorTA.value.slice(0, Math.max(0, pos));
    const mark = document.createElement('span');
    mark.textContent = '\u200b';
    m.appendChild(mark);
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.5) || 20;
    const y = mark.offsetTop;
    const top = editorTA.scrollTop;
    const view = editorTA.clientHeight;
    const margin = Math.min(lh * 2, view / 4);
    if (y < top + margin) editorTA.scrollTop = Math.max(0, y - margin);
    else if (y + lh > top + view - margin) editorTA.scrollTop = y + lh - view + margin;
  } catch (e) { /* ignore */ }
}

function applySnapshot(snap, { scroll = true } = {}) {
  if (editorTA.value !== snap.text) {
    const st = editorTA.scrollTop, sl = editorTA.scrollLeft;
    editorTA.value = snap.text;
    editorTA.scrollTop = st;
    editorTA.scrollLeft = sl;
    updateHighlight();
  }
  currentVimMode = snap.mode;
  const text = editorTA.value;
  let caretPos;
  if (snap.mode === 'visual' && snap.visual_start != null && snap.visual_end != null) {
    const aByte = Math.min(snap.visual_start, snap.visual_end);
    const bByte = Math.max(snap.visual_start, snap.visual_end);
    const aJs = byteToJsIndex(text, aByte);
    const bJs = byteToJsIndex(text, bByte);
    const bEnd = advanceOneChar(text, bJs);
    editorTA.setSelectionRange(aJs, bEnd);
    caretPos = bJs;
  } else {
    const cByte = Math.max(0, Math.min(snap.cursor, snap.text.length));
    const cJs = byteToJsIndex(text, cByte);
    editorTA.selectionStart = editorTA.selectionEnd = cJs;
    caretPos = cJs;
  }
  lastAppliedCursor = editorTA.selectionStart;
  if (scroll) ensureCaretVisible(caretPos);

  if (vimEnabled) {
    const labels = { normal: 'NORMAL', insert: 'INSERT', visual: 'VISUAL' };
    modeIndicator.textContent = labels[snap.mode] || snap.mode.toUpperCase();
    modeIndicator.classList.toggle('insert', snap.mode === 'insert');
    modeIndicator.classList.toggle('visual', snap.mode === 'visual');
  }
  updateStatusbar();
}

function syncTextToBackend() {
  if (!vimEnabled) return;
  const text = editorTA.value;
  const selStart = editorTA.selectionStart;
  const selEnd = editorTA.selectionEnd;
  const wasInsert = currentVimMode === 'insert';
  vimQueue = vimQueue.then(async () => {
    try {
      let snap = await invoke('vim_set_text', { text });
      if (wasInsert && snap.mode !== 'insert') {
        snap = await invoke('vim_handle_key', {
          event: {
            key: 'i', ctrl: false, shift: false, alt: false, meta: false,
            cursor_hint: jsIndexToByte(text, selStart),
          },
        });
      }
      applySnapshot(snap, { scroll: false });
      editorTA.setSelectionRange(selStart, selEnd);
      ensureCaretVisible(selStart);
      updateStatusbar();
    } catch (err) { console.error('vim sync error:', err); }
  });
}

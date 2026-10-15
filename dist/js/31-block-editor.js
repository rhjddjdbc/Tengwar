"use strict";

/* ═══════════════════════════════════════════════════════════════
   BLOCK EDITOR (Stufe 1)
   Click a block → edit its raw markdown. Click out → re-render.

   Keyboard:
     Enter            line break (default textarea behavior)
     Shift+Enter      create a new block below (at end of block only)
     Backspace        at start of block → merge with previous
     ArrowUp/Down     at block edges  → move to adjacent block
     Esc              commit and leave the block
     Ctrl+S           commit and save
     Ctrl+Z           undo within block, or step back one commit
     Ctrl+Shift+Z/Y   redo (document-level)

   Ctrl/Cmd+Click on a link opens it (wiki: → file, http(s) → external).
   ═══════════════════════════════════════════════════════════════ */

let currentBlocks = [];
let editingBlockIdx = -1;
let blockEditStartRaw = '';

/* ═══════════════════════════════════════════════════════════════
   DOCUMENT-LEVEL SHORTCUT FALLBACK

   The block-edit textarea's own keydown listener runs in the bubble
   phase. The shortcut dispatcher in 10-keybindings.js runs in the
   capture phase and, for editor-scoped actions like Ctrl+S, returns
   early when focus is not on editorTA — which is the normal case in
   block mode. In practice this works, but listener-ordering quirks
   across Chromium builds occasionally swallow the event before it
   reaches the textarea.

   This capture-phase handler runs AFTER the dispatcher (registered
   later, same phase, same node → insertion order wins). It handles
   Ctrl+S / Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y directly and calls
   stopPropagation so the textarea's own listener doesn't double-fire.
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('keydown', (e) => {
  if (editingBlockIdx < 0) return;
  const ae = document.activeElement;
  if (!ae || !ae.classList || !ae.classList.contains('block-edit')) return;

  const isMod = e.ctrlKey || e.metaKey;
  if (!isMod || e.altKey) return;

  // Use e.code for physical key detection — more reliable than e.key
  // when modifiers are held. Fall back to e.key for keyboard layouts
  // that don't report code (rare).
  const code = e.code || '';
  const key = (e.key || '').toLowerCase();
  const isS = code === 'KeyS' || key === 's';
  const isZ = code === 'KeyZ' || key === 'z';
  const isY = code === 'KeyY' || key === 'y';

  // ── Ctrl+S — commit current block, then save ─────────────────
  if (isS && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    const idx = editingBlockIdx;
    const ta = ae;
    currentBlocks[idx].raw = ta.value;
    commitBlockEdit().then(() => saveFile());
    return;
  }

  // ── Ctrl+Z — undo within block, then step back ───────────────
  if (isZ && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    const ta = ae;
    if (ta.value !== blockEditStartRaw) {
      // Still inside the current edit session — reset to the
      // snapshot taken when the block was opened.
      ta.value = blockEditStartRaw;
      autoSizeTextarea(ta);
    } else {
      // Already at the start of this session — commit and step
      // back to the previous undo snapshot in the global stack.
      commitBlockEdit().then(() => {
        if (typeof performUndo === 'function') performUndo();
      });
    }
    return;
  }

  // ── Ctrl+Shift+Z or Ctrl+Y — redo ────────────────────────────
  if ((isZ && e.shiftKey) || isY) {
    e.preventDefault();
    e.stopPropagation();
    if (ae.value === blockEditStartRaw && typeof performRedo === 'function') {
      performRedo();
    }
    return;
  }
}, true);

/* ── split / join ────────────────────────────────────────────── */

function isClosingFence(trimmed, fenceChar) {
  let n = 0;
  while (n < trimmed.length && trimmed[n] === fenceChar) n++;
  if (n < 3) return false;
  for (let i = n; i < trimmed.length; i++) {
    if (!/\s/.test(trimmed[i])) return false;
  }
  return true;
}

function splitIntoBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let inFence = false;
  let fenceChar = '';
  let buf = [];
  let pendingBlanks = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const raw = buf.join('\n').replace(/\n+$/, '');
    if (raw) blocks.push({ raw, blanksBefore: pendingBlanks });
    pendingBlanks = 0;
    buf = [];
  };

  for (const line of lines) {
    const trimmed = line.trimStart();
    const isFenceStart = !inFence && /^(`{3,}|~{3,})/.test(trimmed);
    const isFenceEnd = inFence && isClosingFence(trimmed, fenceChar);

    if (isFenceStart) {
      inFence = true;
      fenceChar = trimmed[0];
      buf.push(line);
      continue;
    }
    if (isFenceEnd) {
      inFence = false;
      buf.push(line);
      continue;
    }
    if (!inFence && line.trim() === '') {
      if (buf.length > 0) flush();
      pendingBlanks++;
      continue;
    }
    buf.push(line);
  }
  flush();
  if (blocks.length > 0) blocks[0].blanksBefore = 0;
  return blocks;
}

function joinBlocks(blocks) {
  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) {
      const n = Math.max(1, blocks[i].blanksBefore || 1);
      parts.push('\n'.repeat(n + 1));
    }
    parts.push(blocks[i].raw);
  }
  return parts.join('');
}

/* ── rendering ───────────────────────────────────────────────── */

async function renderMarkdownAsync(raw) {
  let html;
  try {
    html = await invoke('render_markdown', { input: raw });
  } catch (e) {
    return `<div class="error">${escapeHtml(String(e))}</div>`;
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = html;

  const diagrams = wrap.querySelectorAll('.diagram[data-mermaid]');
  for (const el of diagrams) {
    const code = el.getAttribute('data-mermaid')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    try {
      el.innerHTML = await invoke('render_diagram', { code });
    } catch (e) {
      el.innerHTML = `<div class="error">${escapeHtml(String(e))}</div>`;
    }
  }

  wrap.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.title = href.startsWith('wiki:')
      ? 'Ctrl/Cmd+Click to open ' + href.slice(5)
      : 'Ctrl/Cmd+Click to open ' + href;
  });

  return wrap.innerHTML;
}

async function enterBlockMode() {
  const text = editorTA.value;
  currentBlocks = splitIntoBlocks(text);
  editingBlockIdx = -1;
  await renderBlockEditor();
}

function exitBlockMode() {
  // Nothing to sync when the block editor was never populated.
  if (currentBlocks.length === 0 && editingBlockIdx < 0) return;

  if (editingBlockIdx >= 0) {
    editingBlockIdx = -1;
  }
  const joined = joinBlocks(currentBlocks);
  if (joined !== editorTA.value) {
    editorTA.value = joined;
    _lastHighlightedText = null;
    updateHighlight();
    syncTextToBackend();
    markTabModified();
    debouncedRender();
    scheduleAutoSave();
  }
}

function updateAddZoneVisibility() {
  const editor = document.getElementById('block-editor');
  if (!editor) return;
  editor.classList.toggle('editing', editingBlockIdx >= 0);
}

async function renderBlockEditor() {
  const container = document.getElementById('block-editor');
  if (!container) return;
  container.innerHTML = '';

  const htmls = await Promise.all(currentBlocks.map(b => renderMarkdownAsync(b.raw)));

  currentBlocks.forEach((block, idx) => {
    const el = document.createElement('div');
    el.className = 'block';
    el.dataset.idx = String(idx);
    el.innerHTML = `<div class="block-content">${htmls[idx]}</div>`;
    el.addEventListener('click', (e) => onBlockContentClick(e, idx));
    container.appendChild(el);
  });

  const addZone = document.createElement('div');
  addZone.className = 'block-add-zone';
  addZone.textContent = '+ Click to add a block';
  addZone.addEventListener('click', async () => {
    if (editingBlockIdx >= 0) await commitBlockEdit();
    currentBlocks.push({ raw: '', blanksBefore: 1 });
    await renderBlockEditor();
    onBlockClick(currentBlocks.length - 1);
  });
  container.appendChild(addZone);

  updateAddZoneVisibility();
}

/* ── link handling ───────────────────────────────────────────── */

function onBlockContentClick(e, idx) {
  const linkEl = e.target.closest && e.target.closest('a');
  if (linkEl && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    e.stopPropagation();
    handleBlockLink(linkEl);
    return;
  }
  if (e.target.closest && e.target.closest('button, .diagram-toolbar')) return;
  onBlockClick(idx);
}

async function handleBlockLink(a) {
  const href = a.getAttribute('href') || '';
  if (!href) return;

  if (href.startsWith('wiki:')) {
    // pulldown-cmark percent-encodes the target URL, so
    // `wiki:Big%20O%20Notation` has to be decoded back to
    // `Big O Notation` before lookup.
    const raw = href.slice(5);
    let target;
    try { target = decodeURIComponent(raw); }
    catch (_) { target = raw; }

    const found = resolveWikiTarget(target);
    if (found) {
      await openFileEntry(found);
      if (blockModeEnabled) await enterBlockMode();
    } else {
      showToast('File not found: ' + target, 'error');
    }
    return;
  }

  if (href.startsWith('#')) return;

  try {
    const opener = window.__TAURI__ && window.__TAURI__.opener;
    if (opener && typeof opener.openUrl === 'function') {
      await opener.openUrl(href);
    } else if (opener && typeof opener.open === 'function') {
      await opener.open(href);
    } else {
      window.open(href, '_blank');
    }
  } catch (err) {
    showToast(String(err), 'error');
  }
}

/* ── block editing ───────────────────────────────────────────── */

function onBlockClick(idx, cursorPos = null) {
  if (editingBlockIdx === idx) return;
  const container = document.getElementById('block-editor');
  const el = container && container.querySelector(`.block[data-idx="${idx}"]`);
  if (!el) return;

  const block = currentBlocks[idx];
  el.classList.add('editing');
  el.innerHTML = `<textarea class="block-edit" spellcheck="false"></textarea>`;
  const ta = el.querySelector('textarea');
  ta.value = block.raw;
  blockEditStartRaw = block.raw;
  editingBlockIdx = idx;
  updateAddZoneVisibility();

  autoSizeTextarea(ta);
  ta.addEventListener('input', () => autoSizeTextarea(ta));
  ta.addEventListener('keydown', onBlockTextareaKeydown);
  ta.addEventListener('blur', () => {
    const myIdx = idx;
    setTimeout(() => { if (editingBlockIdx === myIdx) commitBlockEdit(); }, 100);
  });

  ta.focus();
  const pos = (cursorPos != null && cursorPos <= ta.value.length)
    ? cursorPos
    : ta.value.length;
  ta.selectionStart = ta.selectionEnd = pos;
}

function autoSizeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

async function commitBlockEdit() {
  const idx = editingBlockIdx;
  if (idx < 0) return;
  editingBlockIdx = -1;

  const container = document.getElementById('block-editor');
  const el = container && container.querySelector(`.block[data-idx="${idx}"]`);
  if (!el) { updateAddZoneVisibility(); return; }
  const ta = el.querySelector('textarea');
  if (!ta) { updateAddZoneVisibility(); return; }

  const newRaw = ta.value;
  el.classList.remove('editing');

  if (!newRaw.trim()) {
    currentBlocks.splice(idx, 1);
    el.remove();
    syncBlocksToEditor();
    reindexBlocks();
    updateAddZoneVisibility();
    return;
  }

  currentBlocks[idx].raw = newRaw;
  el.innerHTML = `<div class="block-content">${await renderMarkdownAsync(newRaw)}</div>`;
  el.addEventListener('click', (e) => onBlockContentClick(e, idx));

  syncBlocksToEditor();
  updateAddZoneVisibility();
}

function reindexBlocks() {
  const container = document.getElementById('block-editor');
  if (!container) return;
  container.querySelectorAll('.block').forEach((el, i) => {
    el.dataset.idx = String(i);
  });
}

function syncBlocksToEditor() {
  const joined = joinBlocks(currentBlocks);
  if (joined === editorTA.value) return;
  if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot();
  editorTA.value = joined;
  _lastHighlightedText = null;
  updateHighlight();
  syncTextToBackend();
  markTabModified();
  debouncedRender();
  scheduleAutoSave();
}

async function onBlockTextareaKeydown(e) {
  const ta = e.target;
  const idx = editingBlockIdx;
  if (idx < 0) return;

  // Ctrl+S / Ctrl+Z / Ctrl+Y are handled by the document-level
  // capture-phase fallback at the top of this file. This handler
  // covers everything else.

  if (e.key === 'Escape') {
    e.preventDefault();
    await commitBlockEdit();
    return;
  }

  // Shift+Enter at end of block → new block below.
  if (e.key === 'Enter' && e.shiftKey
      && ta.selectionStart === ta.value.length
      && ta.selectionEnd === ta.value.length) {
    e.preventDefault();
    if (!ta.value.trim()) return;
    currentBlocks[idx].raw = ta.value;
    await commitBlockEdit();
    currentBlocks.splice(idx + 1, 0, { raw: '', blanksBefore: 1 });
    await renderBlockEditor();
    onBlockClick(idx + 1);
    return;
  }

  // Plain Enter falls through to the textarea — inserts a newline.

  if (e.key === 'Backspace'
      && ta.selectionStart === 0
      && ta.selectionEnd === 0) {
    e.preventDefault();
    if (idx === 0) return;
    const prev = currentBlocks[idx - 1];
    const curr = currentBlocks[idx];
    const mergeAt = prev.raw.length;
    const merged = prev.raw + '\n' + curr.raw;
    currentBlocks.splice(idx - 1, 2, { raw: merged, blanksBefore: prev.blanksBefore });
    syncBlocksToEditor();
    editingBlockIdx = -1;
    await renderBlockEditor();
    onBlockClick(idx - 1, mergeAt);
    return;
  }

  if (e.key === 'ArrowUp' && ta.selectionStart === 0 && idx > 0) {
    e.preventDefault();
    currentBlocks[idx].raw = ta.value;
    await commitBlockEdit();
    onBlockClick(idx - 1);
    return;
  }

  if (e.key === 'ArrowDown'
      && ta.selectionStart === ta.value.length
      && idx < currentBlocks.length - 1) {
    e.preventDefault();
    currentBlocks[idx].raw = ta.value;
    await commitBlockEdit();
    onBlockClick(idx + 1);
    return;
  }
}

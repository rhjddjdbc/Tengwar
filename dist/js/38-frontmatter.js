"use strict";

/* ═══════════════════════════════════════════════════════════════
   FRONTMATTER

   Parses a YAML frontmatter block at the top of the active file
   (`---\n key: value \n---\n`) and shows the fields as an editable
   form in the sidebar. Changes are written back to the source text
   with a 400 ms debounce.
   ═══════════════════════════════════════════════════════════════ */

let fmCollapsed =
  localStorage.getItem('tengwar-frontmatter-collapsed') !== 'false';

let fmFields = [];
let fmSaveTimer = null;
let _fmRaf = null;

/* ── Parse / serialize ──────────────────────────────────────── */

function parseFrontmatter(text) {
  if (!text) return null;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  let afterOpen;
  if (text.startsWith('---\r\n')) afterOpen = 5;
  else if (text.startsWith('---\n')) afterOpen = 4;
  else return null;

  let i = afterOpen;
  while (i < text.length) {
    const lineEnd = text.indexOf('\n', i);
    const rawLine = lineEnd === -1 ? text.slice(i) : text.slice(i, lineEnd);
    const line = rawLine.replace(/\r$/, '');
    if (line === '---') {
      const end = lineEnd === -1 ? text.length : lineEnd + 1;
      const body = text.slice(afterOpen, i);
      const fields = parseFields(body);
      return { fields, start: 0, end, raw: text.slice(0, end) };
    }
    if (lineEnd === -1) break;
    i = lineEnd + 1;
  }
  return null;
}

function parseFields(body) {
  const fields = [];
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) fields.push({ key, value });
  }
  return fields;
}

function serializeFields(fields) {
  if (fields.length === 0) return '';
  const body = fields.map(f => `${f.key}: ${f.value}`).join('\n');
  return '---\n' + body + '\n---\n';
}

/* ── Collapse ────────────────────────────────────────────────── */

function applyFmCollapsed() {
  const panel = document.getElementById('frontmatter-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed', fmCollapsed);
}

function toggleFmPanel() {
  fmCollapsed = !fmCollapsed;
  localStorage.setItem(
    'tengwar-frontmatter-collapsed',
    fmCollapsed ? 'true' : 'false'
  );
  applyFmCollapsed();
}

(function wireFmHeader() {
  const toggle = document.getElementById('frontmatter-toggle');
  if (toggle) toggle.addEventListener('click', toggleFmPanel);
  applyFmCollapsed();
})();

/* ── Row builder ────────────────────────────────────────────── */

/**
 * Build a single row (key input, value input, delete button) and
 * wire it to the fmFields array by index. `onEnterInValue` is called
 * when the user presses Enter in the value field.
 */
function buildFmRow(index, field, onEnterInValue) {
  const row = document.createElement('div');
  row.className = 'fm-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'fm-key';
  keyInput.value = field.key;
  keyInput.placeholder = 'key';
  keyInput.spellcheck = false;
  keyInput.addEventListener('input', () => {
    fmFields[index].key = keyInput.value;
    scheduleFmSave();
  });
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const valueInput = row.querySelector('.fm-value');
      if (valueInput) valueInput.focus();
    }
  });

  const valInput = document.createElement('input');
  valInput.type = 'text';
  valInput.className = 'fm-value';
  valInput.value = field.value;
  valInput.placeholder = 'value';
  valInput.spellcheck = false;
  valInput.addEventListener('input', () => {
    fmFields[index].value = valInput.value;
    scheduleFmSave();
  });
  valInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (typeof onEnterInValue === 'function') onEnterInValue(index);
    }
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'fm-del';
  del.textContent = '×';
  del.title = 'Remove field';
  del.addEventListener('click', () => {
    fmFields.splice(index, 1);
    saveFrontmatterNow();
    renderFrontmatter();
  });

  row.appendChild(keyInput);
  row.appendChild(valInput);
  row.appendChild(del);
  return row;
}

/* ── Render ──────────────────────────────────────────────────── */

function renderFrontmatter() {
  const list = document.getElementById('frontmatter-list');
  const count = document.getElementById('frontmatter-count');
  if (!list || !count) return;

  if (!activeTabId) {
    fmFields = [];
    count.textContent = '0';
    list.innerHTML = '<div class="fm-empty">No file open.</div>';
    return;
  }

  const fm = parseFrontmatter(editorTA.value);
  fmFields = fm ? fm.fields.slice() : [];
  count.textContent = String(fmFields.length);

  list.innerHTML = '';

  if (!fm) {
    const btn = document.createElement('button');
    btn.className = 'fm-add-block';
    btn.textContent = '+ Add frontmatter block';
    btn.addEventListener('click', () => {
      fmFields = [{ key: 'title', value: '' }];
      saveFrontmatterNow().then(() => {
        renderFrontmatter();
        const first = list.querySelector('.fm-key');
        if (first) first.focus();
      });
    });
    list.appendChild(btn);
    return;
  }

  for (let i = 0; i < fmFields.length; i++) {
    const row = buildFmRow(i, fmFields[i], onEnterInLastValue);
    list.appendChild(row);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fm-add';
  addBtn.textContent = '+ Add field';
  addBtn.addEventListener('click', () => {
    // Push to the in-memory array and append the row directly —
    // renderFrontmatter() would re-parse from the editor and discard
    // the empty field before it has been saved.
    fmFields.push({ key: '', value: '' });
    const newIdx = fmFields.length - 1;
    const newRow = buildFmRow(newIdx, fmFields[newIdx], onEnterInLastValue);
    list.insertBefore(newRow, addBtn);
    const keyInput = newRow.querySelector('.fm-key');
    if (keyInput) keyInput.focus();
  });
  list.appendChild(addBtn);
}

/* ── Enter-in-last-value creates a new field ───────────────── */

function onEnterInLastValue(index) {
  const isLast = index === fmFields.length - 1;
  if (!isLast) {
    // Jump to the key of the next existing row.
    const list = document.getElementById('frontmatter-list');
    const nextRow = list.querySelectorAll('.fm-row')[index + 1];
    if (nextRow) {
      const nextKey = nextRow.querySelector('.fm-key');
      if (nextKey) nextKey.focus();
    }
    return;
  }
  const list = document.getElementById('frontmatter-list');
  const addBtn = list.querySelector('.fm-add');
  if (addBtn) addBtn.click();
}

/* ── Save ───────────────────────────────────────────────────── */

function scheduleFmSave() {
  clearTimeout(fmSaveTimer);
  fmSaveTimer = setTimeout(() => { saveFrontmatterNow(); }, 400);
}

async function saveFrontmatterNow() {
  clearTimeout(fmSaveTimer);

  const text = editorTA.value;
  const fm = parseFrontmatter(text);
  const newBlock = serializeFields(fmFields);

  const replaceStart = fm ? fm.start : 0;
  const replaceEnd = fm ? fm.end : 0;
  const newText =
    text.slice(0, replaceStart) + newBlock + text.slice(replaceEnd);

  if (newText === text) return;

  if (typeof vimEnabled !== 'undefined' && vimEnabled) {
    const startByte = jsIndexToByte(text, replaceStart);
    const endByte = jsIndexToByte(text, replaceEnd);
    await vimQueue;
    try {
      const snap = await invoke('vim_replace_range', {
        start: startByte,
        end: endByte,
        text: newBlock,
      });
      applySnapshot(snap, { scroll: false });
      updateHighlight();
      markTabModified();
      debouncedRender();
      scheduleAutoSave();
      updateStatusbar();
    } catch (e) {
      console.error('frontmatter save failed:', e);
    }
  } else {
    if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot();
    editorTA.value = newText;
    updateHighlight();
    markTabModified();
    debouncedRender();
    scheduleAutoSave();
  }
}

/* ── Hooks ──────────────────────────────────────────────────── */

function scheduleFmRender() {
  if (_fmRaf) return;
  _fmRaf = requestAnimationFrame(() => {
    _fmRaf = null;
    renderFrontmatter();
  });
}

(function installFmHooks() {
  if (typeof window.switchToTab === 'function') {
    const orig = window.switchToTab;
    window.switchToTab = async function (id) {
      const r = await orig.call(this, id);
      scheduleFmRender();
      return r;
    };
  }
  if (typeof window.loadFolder === 'function') {
    const orig = window.loadFolder;
    window.loadFolder = async function () {
      const r = await orig.apply(this, arguments);
      scheduleFmRender();
      return r;
    };
  }
})();

let _fmInputTimer = null;
editorTA.addEventListener('input', () => {
  clearTimeout(_fmInputTimer);
  _fmInputTimer = setTimeout(() => {
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#frontmatter-list')) return;
    scheduleFmRender();
  }, 250);
});

setTimeout(renderFrontmatter, 500);
"use strict";

/* ═══════════════════════════════════════════════════════════════
   BACKLINKS — who links to the currently active file?
   ═══════════════════════════════════════════════════════════════ */

// Default: collapsed. Only shows up when the user explicitly
// expands it once and that choice is remembered.
let backlinksCollapsed =
  localStorage.getItem('tengwar-backlinks-collapsed') !== 'false';
let _backlinksReq = 0;

function applyBacklinksCollapsed() {
  const panel = document.getElementById('backlinks-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed', backlinksCollapsed);
}

function toggleBacklinksPanel() {
  backlinksCollapsed = !backlinksCollapsed;
  localStorage.setItem(
    'tengwar-backlinks-collapsed',
    backlinksCollapsed ? 'true' : 'false'
  );
  applyBacklinksCollapsed();
}

async function reloadBacklinks() {
  const panel = document.getElementById('backlinks-panel');
  const list = document.getElementById('backlinks-list');
  const count = document.getElementById('backlinks-count');
  if (!panel || !list || !count) return;

  if (!currentRepoPath || !activeTabId) {
    list.innerHTML = '<div class="backlinks-empty">No file open.</div>';
    count.textContent = '0';
    return;
  }
  const tab = tabs.get(activeTabId);
  if (!tab || !tab.path) {
    list.innerHTML = '<div class="backlinks-empty">Untitled file — no backlinks.</div>';
    count.textContent = '0';
    return;
  }

  // Bump request id so late responses from an old file can be dropped.
  const myReq = ++_backlinksReq;
  list.innerHTML = '<div class="backlinks-loading">Loading…</div>';

  try {
    const entries = await invoke('find_backlinks', {
      root: currentRepoPath,
      target: tab.path,
    });
    if (myReq !== _backlinksReq) return;

    count.textContent = String(entries.length);
    if (entries.length === 0) {
      list.innerHTML = '<div class="backlinks-empty">No backlinks.</div>';
      return;
    }
    renderBacklinks(entries);
  } catch (e) {
    if (myReq !== _backlinksReq) return;
    list.innerHTML =
      `<div class="backlinks-empty" style="color:var(--error)">${escapeHtml(String(e))}</div>`;
    count.textContent = '0';
  }
}

function renderBacklinks(entries) {
  const list = document.getElementById('backlinks-list');
  if (!list) return;
  list.innerHTML = '';
  for (const e of entries) {
    const item = document.createElement('button');
    item.className = 'backlink-item';
    item.title = `Line ${e.line}: ${e.text.trim()}`;
    const snippet = e.text.trim();
    const trimmed = snippet.length > 90 ? snippet.slice(0, 87) + '…' : snippet;
    item.innerHTML = `
      <span class="bl-name">${escapeHtml(e.name)}</span>
      <span class="bl-line">Ln ${e.line}</span>
      <span class="bl-snippet">${escapeHtml(trimmed)}</span>
    `;
    item.addEventListener('click', () => openBacklinkTarget(e));
    list.appendChild(item);
  }
}

async function openBacklinkTarget(entry) {
  const file = allFiles.find(f => f.path === entry.path);
  if (!file) {
    showToast('File not in tree — reload folder', 'error');
    return;
  }
  await openFileEntry(file);
  await vimQueue;
  try {
    const snap = await invoke('vim_go_to_line', { line: entry.line });
    applySnapshot(snap);
    updateHighlight();
    const lh = parseFloat(getComputedStyle(editorTA).lineHeight) || 23;
    editorTA.scrollTop = Math.max(0, (entry.line - 5) * lh);
  } catch (e) {
    console.warn('backlink jump failed', e);
  }
}

/* ── Wiring ──────────────────────────────────────────────────── */

(function wireBacklinksHeader() {
  const toggle = document.getElementById('backlinks-toggle');
  if (toggle) toggle.addEventListener('click', toggleBacklinksPanel);
  applyBacklinksCollapsed();
})();

// Refresh on tab switch. `switchToTab` is async, so we defer to the
// next microtask to make sure activeTabId and the tab object are set.
(function installBacklinkHooks() {
  if (typeof window.switchToTab === 'function') {
    const orig = window.switchToTab;
    window.switchToTab = async function (id) {
      const r = await orig.call(this, id);
      reloadBacklinks();
      return r;
    };
  }
  if (typeof window.saveFile === 'function') {
    const orig = window.saveFile;
    window.saveFile = async function () {
      const r = await orig.apply(this, arguments);
      reloadBacklinks();
      return r;
    };
  }
  if (typeof window.loadFolder === 'function') {
    const orig = window.loadFolder;
    window.loadFolder = async function () {
      const r = await orig.apply(this, arguments);
      reloadBacklinks();
      return r;
    };
  }
})();
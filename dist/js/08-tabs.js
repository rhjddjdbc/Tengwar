"use strict";

/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */
function createTab({ name, path = null, entry = null, content = '' }) {
  const id = 'tab-' + (++tabCounter);
  tabs.set(id, { id, name, path, entry, content, modified: false, cursor: 0 });
  return id;
}

function renderTabsBar() {
  tabsBar.innerHTML = '';
  for (const [id, tab] of tabs) {
    const el = document.createElement('button');
    el.className = 'tab' + (id === activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '');
    el.dataset.id = id;
    el.innerHTML = `<span class="tab-name">${escapeHtml(tab.name)}</span><span class="tab-close" data-close="${id}">${ICON_X}</span>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { e.stopPropagation(); closeTab(id); }
      else switchToTab(id);
    });
    tabsBar.appendChild(el);
  }
  saveSession();
}

function updateTabUI(id) {
  const tab = tabs.get(id); if (!tab) return;
  const el = tabsBar.querySelector(`.tab[data-id="${id}"]`); if (!el) return;
  el.classList.toggle('active', id === activeTabId);
  el.classList.toggle('modified', tab.modified);
  const nameEl = el.querySelector('.tab-name');
  if (nameEl) nameEl.textContent = tab.name;
}

function refreshActiveTab() {
  if (!tabsBar) return;
  tabsBar.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('active', el.dataset.id === activeTabId);
  });
}

function updateActiveTreeItem() {
  fileTree.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
  if (!activeTabId) return;
  const tab = tabs.get(activeTabId);
  if (!tab || !tab.path) return;
  const el = fileTree.querySelector(`.tree-item[data-path="${CSS.escape(tab.path)}"]`);
  if (el) el.classList.add('active');
}

async function switchToTab(id) {
  if (id === activeTabId) {
    updateActiveTreeItem();
    return;
  }
  if (activeTabId) {
    const cur = tabs.get(activeTabId);
    if (cur) {
      await vimQueue;
      try {
        const snap = vimEnabled ? await invoke('vim_snapshot') : { text: editorTA.value };
        cur.content = snap.text;
      } catch (e) { cur.content = editorTA.value; }
      cur.cursor = editorTA.selectionStart;
    }
  }
  activeTabId = id;
  const tab = tabs.get(id);
  if (!tab) { renderTabsBar(); return; }
  let text = tab.content;
  if (!text && tab.entry) {
    try { text = await tab.entry.getText(); tab.content = text; }
    catch (e) { showToast('Load failed: ' + e, 'error'); text = ''; }
  }
  await vimQueue;
  const snap = await invoke('vim_load_text', { text: text || '' });
  applySnapshot(snap, { scroll: false });
  updateHighlight();
  if (tab.cursor > 0 && tab.cursor <= (text || '').length) {
    editorTA.selectionStart = editorTA.selectionEnd = tab.cursor;
  }
  ensureCaretVisible(editorTA.selectionStart);
  currentFileLabel.textContent = tab.path || tab.name;
  currentFileLabel.classList.remove('saved', 'modified');
  currentFileLabel.classList.add(tab.modified ? 'modified' : 'saved');
  updateActiveTreeItem();
  updateTabUI(id);
  if (typeof resetUndoHistory === 'function') resetUndoHistory(text || '');
  refreshActiveTab();
  render(true);
  if (blockModeEnabled) await enterBlockMode();
  updateStatusbar();
  saveSession();
}

async function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (tab.modified) {
    const ok = confirm(`"${tab.name}" has unsaved changes. Close anyway?`);
    if (!ok) return;
  }
  const wasActive = (id === activeTabId);
  tabs.delete(id);
  if (wasActive) {
    const ids = Array.from(tabs.keys());
    if (ids.length > 0) { activeTabId = null; await switchToTab(ids[ids.length - 1]); }
    else {
      activeTabId = null;
      await vimQueue;
      await invoke('vim_load_text', { text: '' });
      editorTA.value = '';
      if (typeof resetUndoHistory === 'function') resetUndoHistory('');
      _lastHighlightedText = null;
      updateHighlight();
      lastAppliedCursor = 0;
      currentFileLabel.textContent = '– no file –';
      currentFileLabel.classList.remove('saved', 'modified');
      updateActiveTreeItem();
      render(true);
      if (blockModeEnabled) await enterBlockMode();
    }
  }
  renderTabsBar();
  saveSession();
}

function markTabModified() {
  if (!activeTabId) return;
  const tab = tabs.get(activeTabId);
  if (!tab || tab.modified) return;
  tab.modified = true;
  updateTabUI(activeTabId);
  currentFileLabel.classList.add('modified');
  currentFileLabel.classList.remove('saved');
}

/* ═══════════════════════════════════════════════════════════════
   SESSION RESTORE
   ═══════════════════════════════════════════════════════════════ */
function saveSession() {
  try {
    const openTabs = Array.from(tabs.values())
      .filter(t => t.path)
      .map(t => ({ path: t.path, name: t.name }));
    const active = activeTabId ? tabs.get(activeTabId) : null;
    const session = {
      folder: currentRepoPath,
      openTabs,
      activePath: active && active.path ? active.path : null,
      zoom: previewZoom,
    };
    localStorage.setItem('tengwar-session', JSON.stringify(session));
  } catch (e) { /* ignore */ }
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem('tengwar-session') || '{}'); }
  catch (e) { return {}; }
}

/* ═══════════════════════════════════════════════════════════════
   AUTO-SAVE
   ═══════════════════════════════════════════════════════════════ */
function scheduleAutoSave() {
  if (!autoSaveEnabled || !activeTabId) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(performAutoSave, 2000);
}

async function performAutoSave() {
  if (!activeTabId) return;
  const tab = tabs.get(activeTabId);
  if (!tab || !tab.modified || !tab.entry) return;
  try {
    statusAutosave.classList.add('saving');
    await vimQueue;
    const snap = vimEnabled ? await invoke('vim_snapshot') : { text: editorTA.value };
    await tab.entry.saveText(snap.text);
    if (vimEnabled) { try { await invoke('vim_mark_saved'); } catch (_) {} }
    tab.content = snap.text;
    tab.modified = false;
    updateTabUI(activeTabId);
    currentFileLabel.classList.add('saved');
    currentFileLabel.classList.remove('modified');
  } catch (e) { console.error('[auto-save] failed', e); }
  finally { statusAutosave.classList.remove('saving'); }
}
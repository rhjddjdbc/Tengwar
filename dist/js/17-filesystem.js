"use strict";

/* ═══════════════════════════════════════════════════════════════
   FILESYSTEM
   ═══════════════════════════════════════════════════════════════ */
async function openFolder() {
  try {
    const dir = await openDialog({ directory: true, multiple: false });
    if (!dir) return;
    await loadFolder(dir);
    try { await invoke('start_watching', { path: dir }); } catch (e) { console.warn('Watch failed', e); }
  } catch (e) { console.error(e); showToast(String(e), 'error'); }
}

async function loadFolder(dir) {
  currentRepoPath = dir;
  allFiles = [];
  fileTree.innerHTML = '';

  // Confine all subsequent fs commands to this folder. Server-side
  // check_in_workspace() rejects anything outside it.
  try {
    await invoke('set_workspace_root', { path: dir });
  } catch (e) {
    console.warn('set_workspace_root failed', e);
    showToast('Could not set workspace root: ' + e, 'error');
  }

  let entries = [];
  try {
    entries = await invoke('list_dir', { root: dir });
  } catch (e) {
    console.error('[loadFolder] list_dir failed:', e);
    fileTree.innerHTML = `
      <div class="empty-state">
        <b style="color:var(--error)">Could not read folder</b><br>
        <span style="font-size:10.5px;color:var(--fg-2);word-break:break-all;">${escapeHtml(String(e))}</span>
      </div>`;
    showToast('Folder load failed: ' + e, 'error');
  }

  if (entries.length > 0) {
    const tree = {};
    for (const e of entries) {
      const parts = e.path.split('/');
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        node[parts[i]] = node[parts[i]] || {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = { _file: e };
    }
    renderTree(tree, fileTree, dir, '');
    showToast(`Folder · ${entries.length} files`);
  } else if (entries.length === 0 && fileTree.innerHTML === '') {
    fileTree.innerHTML = '<div class="empty-state">No .md files in this folder.</div>';
  }

  try { await updateBranchDisplay(); } catch (_) {}
  try { await refreshGitStatus(); } catch (_) {}

  saveSession();
}

function renderTree(node, container, root, prefix) {
  const keys = Object.keys(node).sort((a, b) => {
    const aF = node[a]._file !== undefined; const bF = node[b]._file !== undefined;
    if (aF !== bF) return aF ? 1 : -1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const value = node[key];
    const item = document.createElement('div');
    item.className = 'tree-item';
    if (value._file !== undefined) {
      const rel = value._file.path;
      item.dataset.path = rel;
      const fullPath = root + '/' + rel;
      const fileEntry = {
        name: value._file.name, path: rel, _abs: fullPath,
        getText: () => invoke('read_text_file', { path: fullPath }),
        saveText: (text) => invoke('write_text_file', { path: fullPath, content: text }),
      };
      allFiles.push(fileEntry);
      item.innerHTML = `<span class="icon">${ICON_FILE}</span> <span class="name">${escapeHtml(key)}</span><span class="git-status"></span>`;
      container.appendChild(item);
      item.addEventListener('click', () => openFileEntry(fileEntry));
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, { type: 'file', path: rel, name: value._file.name, abs: fullPath });
      });
    } else {
      item.innerHTML = `<span class="icon">${ICON_FOLDER}</span> <span class="name">${escapeHtml(key)}</span>`;
      const child = document.createElement('div');
      child.className = 'tree-children';
      container.appendChild(item);
      container.appendChild(child);
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        child.classList.toggle('open');
        if (child.children.length === 0) renderTree(value, child, root, prefix + key + '/');
      });
    }
  }
}

async function openFileEntry(entry) {
  for (const [id, tab] of tabs) {
    if (tab.path === entry.path) { await switchToTab(id); return; }
  }
  let text = '';
  try { text = await entry.getText(); }
  catch (e) { showToast('Load failed: ' + e, 'error'); return; }
  const id = createTab({ name: entry.name, path: entry.path, entry, content: text });
  renderTabsBar();
  await switchToTab(id);
}

async function saveFile() {
  if (!activeTabId) { showToast('No file open', 'info'); return; }
  const tab = tabs.get(activeTabId); if (!tab) return;
  await vimQueue;
  const snap = vimEnabled ? await invoke('vim_snapshot') : { text: editorTA.value };
  if (!tab.entry) return saveFileAs(tab.name);
  try {
    await tab.entry.saveText(snap.text);
    if (vimEnabled) { try { await invoke('vim_mark_saved'); } catch (_) {} }
    tab.content = snap.text;
    tab.modified = false;
    updateTabUI(activeTabId);
    currentFileLabel.classList.add('saved');
    currentFileLabel.classList.remove('modified');
    showToast('Saved');
    await refreshGitStatus();
    if (tab.path) clearRecoveryFor(tab.path);
  } catch (e) { console.error(e); showToast('Save failed: ' + e, 'error'); }
}

async function saveFileAs(nameOrNull) {
  await vimQueue;
  const snap = vimEnabled ? await invoke('vim_snapshot') : { text: editorTA.value };
  let path = null;
  if (currentRepoPath) { path = currentRepoPath + '/' + (nameOrNull || 'note.md'); }
  else {
    try {
      path = await saveDialog({ defaultPath: nameOrNull || 'note.md', filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] });
    } catch (e) { return; }
    if (!path) return;
  }
  try {
    await invoke('write_text_file', { path, content: snap.text });
    if (vimEnabled) { try { await invoke('vim_mark_saved'); } catch (_) {} }
    if (activeTabId) {
      const tab = tabs.get(activeTabId);
      if (tab) {
        const basename = path.split('/').pop();
        const rel = currentRepoPath ? path.replace(currentRepoPath + '/', '') : basename;
        tab.name = basename; tab.path = rel;
        tab.entry = { name: basename, path: rel, getText: () => invoke('read_text_file', { path }), saveText: (text) => invoke('write_text_file', { path, content: text }) };
        tab.content = snap.text; tab.modified = false;
        updateTabUI(activeTabId);
        currentFileLabel.textContent = rel;
        currentFileLabel.classList.add('saved');
        currentFileLabel.classList.remove('modified');
      }
    }
    showToast('Saved as ' + path.split('/').pop());
    if (currentRepoPath) await loadFolder(currentRepoPath);
  } catch (e) { showToast(String(e), 'error'); }
}

async function newFile() {
  const id = createTab({ name: 'untitled.md', content: '' });
  renderTabsBar();
  await switchToTab(id);
  editorTA.focus();
}

/* ═══════════════════════════════════════════════════════════════
   FILE WATCHER
   ═══════════════════════════════════════════════════════════════ */
(async () => {
  try {
    await listen('fs-change', () => {
      clearTimeout(window.__fsRefresh);
      window.__fsRefresh = setTimeout(async () => {
        if (!currentRepoPath) return;
        await loadFolder(currentRepoPath);
        updateActiveTreeItem();
      }, 500);
    });
  } catch (e) { console.warn('listen failed', e); }
})();
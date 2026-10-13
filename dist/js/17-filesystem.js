"use strict";

/* ═══════════════════════════════════════════════════════════════
   FILESYSTEM
   ═══════════════════════════════════════════════════════════════ */
async function openFolder() {
  try {
    const dir = await openDialog({ directory: true, multiple: false });
    if (!dir) return;
    const ok = await loadFolder(dir);
    if (!ok) return;
    try { await invoke('start_watching', { path: dir }); } catch (e) { console.warn('Watch failed', e); }
    if (typeof recordVault === 'function') recordVault(dir);
  } catch (e) { console.error(e); showToast(String(e), 'error'); }
}

async function loadFolder(dir) {
  currentRepoPath = dir;
  allFiles = [];
  fileTree.innerHTML = '';
  activeFolderAbs = null;
  activeFolderRel = '';
  updateNewButtonsHint();

  try {
    await invoke('set_workspace_root', { path: dir });
  } catch (e) {
    console.warn('set_workspace_root failed', e);
    showToast('Could not set workspace root: ' + e, 'error');
  }

  let entries = [];
  let success = true;
  try {
    entries = await invoke('list_dir', { root: dir });
  } catch (e) {
    success = false;
    console.error('[loadFolder] list_dir failed:', e);
    fileTree.innerHTML = `
      <div class="empty-state">
        <b style="color:var(--error)">Could not read folder</b><br>
        <span style="font-size:10.5px;color:var(--fg-2);word-break:break-all;">${escapeHtml(String(e))}</span>
      </div>`;
    showToast('Folder load failed: ' + e, 'error');
  }

  if (success) {
    const fileCount = entries.filter(e => !e.is_dir).length;

    if (entries.length > 0) {
      const tree = {};
      for (const e of entries) {
        const parts = e.path.split('/');
        let node = tree;
        for (let i = 0; i < parts.length - 1; i++) {
          const seg = parts[i];
          if (!node[seg]) node[seg] = { _children: {} };
          node = node[seg]._children;
        }
        const leaf = parts[parts.length - 1];
        if (e.is_dir) {
          if (!node[leaf]) node[leaf] = { _children: {} };
        } else {
          if (!node[leaf]) node[leaf] = {};
          node[leaf]._file = e;
        }
      }
      renderTree(tree, fileTree, dir, '');
      showToast(`Folder · ${fileCount} file${fileCount === 1 ? '' : 's'}`);
    } else {
      fileTree.innerHTML = '<div class="empty-state">No .md files in this folder.</div>';
    }

    try { await updateBranchDisplay(); } catch (_) {}
    try { await refreshGitStatus(); } catch (_) {}
  }

  if (typeof updateVaultButton === 'function') updateVaultButton();
  saveSession();
  return success;
}

function renderTree(node, container, root, prefix) {
  const keys = Object.keys(node).filter(k => !k.startsWith('_'));
  keys.sort((a, b) => {
    const aIsFile = node[a]._file !== undefined;
    const bIsFile = node[b]._file !== undefined;
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
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
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, {
          type: 'file', path: rel, name: value._file.name, abs: fullPath,
        });
      });
    } else {
      const folderRel = prefix + key;
      const folderAbs = root + '/' + folderRel;
      item.dataset.folderAbs = folderAbs;
      item.innerHTML = `<span class="icon">${ICON_FOLDER}</span> <span class="name">${escapeHtml(key)}</span>`;
      const child = document.createElement('div');
      child.className = 'tree-children';
      container.appendChild(item);
      container.appendChild(child);

      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        child.classList.toggle('open');
        if (child.children.length === 0) {
          renderTree(value._children || {}, child, root, folderRel + '/');
        }
        setActiveFolder(folderAbs, folderRel, key);
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, {
          type: 'folder',
          name: key,
          path: folderRel,
          abs: folderAbs,
        });
      });
    }
  }
}

/* ── Sidebar-button target tracking ──────────────────────────── */

function setActiveFolder(abs, rel, displayName) {
  activeFolderAbs = abs;
  activeFolderRel = rel;
  fileTree.querySelectorAll('.tree-item.target').forEach(el => el.classList.remove('target'));
  const el = fileTree.querySelector(`.tree-item[data-folder-abs="${CSS.escape(abs)}"]`);
  if (el) el.classList.add('target');
  updateNewButtonsHint(displayName);
}

function resetActiveFolder() {
  activeFolderAbs = null;
  activeFolderRel = '';
  fileTree.querySelectorAll('.tree-item.target').forEach(el => el.classList.remove('target'));
  updateNewButtonsHint();
}

function updateNewButtonsHint(displayName) {
  const newFileBtn = document.getElementById('newFileBtn');
  const newFolderBtn = document.getElementById('newFolderBtn');
  if (!newFileBtn || !newFolderBtn) return;
  const where = displayName || 'root';
  newFileBtn.title = `New file in ${where}`;
  newFolderBtn.title = `New folder in ${where}`;
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
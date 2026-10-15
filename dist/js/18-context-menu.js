"use strict";

/* ═══════════════════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════════════════ */
let contextMenu = null;
function showContextMenu(x, y, target) {
  contextTarget = target;
  if (!contextMenu) {
    contextMenu = document.createElement('div');
    contextMenu.id = 'context-menu';
    document.body.appendChild(contextMenu);
  }
  contextMenu.innerHTML = '';
  const addItem = (label, action, danger = false) => {
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (danger ? ' danger' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { hideContextMenu(); action(); });
    contextMenu.appendChild(btn);
  };
  const addSep = () => {
    const s = document.createElement('div');
    s.className = 'ctx-sep';
    contextMenu.appendChild(s);
  };

  if (target.type === 'file') {
    addItem('Open', () => {
      const f = allFiles.find(x => x.path === target.path);
      if (f) openFileEntry(f);
    });
    addItem('Rename…', () => renameFileDialog(target));
    addSep();
    addItem('Delete', () => deleteFileDialog(target), true);
  } else if (target.type === 'folder') {
    addItem('New File…', () => newFileInFolder(target));
    addItem('New Folder…', () => newFolderInFolder(target));
    addSep();
    addItem('Delete Folder', () => deleteFolderDialog(target), true);
  } else {
    addItem('New File…', () => newFileInFolder({ abs: currentRepoPath, path: '' }));
    addItem('New Folder…', () => newFolderInFolder({ abs: currentRepoPath, path: '' }));
    addItem('Refresh', () => currentRepoPath && loadFolder(currentRepoPath));
  }

  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.add('show');
  requestAnimationFrame(() => {
    const r = contextMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) contextMenu.style.left = (window.innerWidth - r.width - 8) + 'px';
    if (r.bottom > window.innerHeight) contextMenu.style.top = (window.innerHeight - r.height - 8) + 'px';
  });
}
function hideContextMenu() { if (contextMenu) contextMenu.classList.remove('show'); }
document.addEventListener('click', hideContextMenu);
document.addEventListener('scroll', hideContextMenu, true);

function renameFileDialog(target) {
  const oldAbs = target.abs;
  const dir = oldAbs.slice(0, oldAbs.lastIndexOf('/'));
  showInputModal('Rename', 'New file name:', target.name, async (newName) => {
    if (!newName || newName === target.name) return;
    const newAbs = dir + '/' + newName;
    try {
      await invoke('rename_path', { oldPath: oldAbs, newPath: newAbs });
      for (const [id, tab] of tabs) {
        if (tab.path === target.path) { await closeTab(id); break; }
      }
      await loadFolder(currentRepoPath);
      showToast('Renamed');
    } catch (e) { showToast(String(e), 'error'); }
  });
}
function deleteFileDialog(target) {
  if (!confirm(`Delete "${target.name}"? This cannot be undone.`)) return;
  (async () => {
    try {
      await invoke('delete_path', { path: target.abs });
      for (const [id, tab] of tabs) {
        if (tab.path === target.path) { tabs.delete(id); if (activeTabId === id) activeTabId = null; break; }
      }
      renderTabsBar();
      await loadFolder(currentRepoPath);
      showToast('Deleted');
    } catch (e) { showToast(String(e), 'error'); }
  })();
}
function deleteFolderDialog(target) {
  if (!confirm(`Delete folder "${target.name}" and all contents?`)) return;
  (async () => {
    try {
      await invoke('delete_path', { path: target.abs });
      await loadFolder(currentRepoPath);
      showToast('Deleted');
    } catch (e) { showToast(String(e), 'error'); }
  })();
}

/* ═══════════════════════════════════════════════════════════════
   NEW FILE — kind picker

   Three modes:

     - Normal note    → `<target>/<name>.md`
     - Template       → `<vault>/templates/<name>.template`
     - Journal entry  → today's date-named note in the global
                        journal folder (same as Ctrl+Shift+T)

   The picker only makes sense when a vault is open. When there's
   no vault, `21-toolbar.js` routes to `newFile()` which creates an
   untitled in-memory tab — no kind choice needed.
   ═══════════════════════════════════════════════════════════════ */

function newFileInFolder(target) {
  showChoiceModal(
    'New file — kind',
    ['Normal note', 'Template', 'Journal entry'],
    async (kind) => {
      if (kind === 'Normal note') {
        showInputModal('New File', 'File name:', 'untitled.md', async (name) => {
          if (!name) return;
          const abs = target.abs + '/' + name;
          try {
            await invoke('write_text_file', { path: abs, content: '' });
            await loadFolder(currentRepoPath);
            showToast('Created ' + name);
          } catch (e) { showToast(String(e), 'error'); }
        });
        return;
      }

      if (kind === 'Template') {
        if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
        // Make sure templates/ exists — auto-created on vault open
        // anyway, but a context-menu click can land here before the
        // watcher fires.
        if (typeof ensureVaultTemplatesDir === 'function') {
          try { await ensureVaultTemplatesDir(currentRepoPath); } catch (_) {}
        }
        showInputModal('New Template', 'Template name:', 'my-template', async (name) => {
          if (!name) return;
          const clean = String(name).replace(/\.template$/i, '').trim();
          if (!clean) return;
          const rel = 'templates/' + clean + '.template';
          const abs = currentRepoPath + '/' + rel;
          try {
            await invoke('write_text_file', { path: abs, content: '' });
            await loadFolder(currentRepoPath);
            if (typeof refreshTemplatesCache === 'function') {
              await refreshTemplatesCache();
            }
            showToast('Created template: ' + clean);
          } catch (e) { showToast(String(e), 'error'); }
        });
        return;
      }

      if (kind === 'Journal entry') {
        if (typeof openDailyNote === 'function') {
          await openDailyNote();
        } else {
          showToast('Journal feature not loaded', 'error');
        }
      }
    }
  );
}

function newFolderInFolder(target) {
  showInputModal('New Folder', 'Folder name:', 'new-folder', async (name) => {
    if (!name) return;
    const abs = target.abs + '/' + name;
    try {
      await invoke('create_dir', { path: abs });
      await loadFolder(currentRepoPath);
      showToast('Created folder');
    } catch (e) { showToast(String(e), 'error'); }
  });
}
fileTree.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.tree-item')) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, { type: 'root' });
});
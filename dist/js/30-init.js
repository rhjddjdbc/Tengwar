"use strict";

/* ═══════════════════════════════════════════════════════════════
   WELCOME
   ═══════════════════════════════════════════════════════════════ */
async function loadWelcome() {
  try {
    const res = await fetch('./welcome.md');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } catch (e) {
    console.error('welcome.md fetch failed:', e);
    return '# Welcome\n\nCould not load `welcome.md`.\n\nMake sure the file is in the `dist/` folder next to `index.html`.';
  }
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
applyTheme(localStorage.getItem('tengwar-preview-theme') === 'dark');
applySidebarSide(localStorage.getItem('tengwar-sidebar-side') === 'right');
applyVim(vimEnabled);
applyAutoSave(autoSaveEnabled);
applyScrollSync(scrollSyncEnabled);
applyZoom(previewZoom);
applyCustomTheme();

(function addScrollSyncItem() {
  const item = document.getElementById('scrollSyncItem');
  if (item) item.classList.toggle('active', scrollSyncEnabled);
})();

(async () => {
  const session = loadSession();
  let restored = false;

  if (session.folder) {
    try {
      await loadFolder(session.folder);
      try { await invoke('start_watching', { path: session.folder }); } catch (_) {}
      for (const t of (session.openTabs || [])) {
        const entry = allFiles.find(f => f.path === t.path);
        if (entry) {
          try {
            const text = await entry.getText();
            const id = createTab({ name: entry.name, path: entry.path, entry, content: text });
            if (t.path === session.activePath) {
              renderTabsBar();
              await switchToTab(id);
            }
          } catch (_) {}
        }
      }
      if (tabs.size > 0) { renderTabsBar(); restored = true; }
    } catch (e) { console.warn('session restore failed', e); }
  }

  if (!restored) {
    const content = await loadWelcome();
    const id = createTab({ name: 'Welcome.md', content });
    renderTabsBar();
    await switchToTab(id);
  }

  updateHighlight();
  installShortcutDispatcher();

  editorTA.focus();
  updateStatusbar();
  checkRecoveryOnStart();
})();

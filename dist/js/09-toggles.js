"use strict";

/* ═══════════════════════════════════════════════════════════════
   TOGGLES
   ═══════════════════════════════════════════════════════════════ */
function applyVim(enabled) {
  vimEnabled = enabled;
  localStorage.setItem('tengwar-vim-enabled', enabled ? 'true' : 'false');
  const item = document.getElementById('vimItem');
  if (item) item.classList.toggle('active', enabled);
  if (enabled) {
    modeIndicator.textContent = 'NORMAL';
    modeIndicator.style.opacity = '';
    const text = editorTA.value;
    const pos = editorTA.selectionStart;
    vimQueue = vimQueue.then(async () => {
      try {
        await invoke('vim_set_text', { text });
        const norm = await invoke('vim_handle_key', {
          event: { key: 'Escape', ctrl: false, shift: false, alt: false, meta: false,
                   cursor_hint: jsIndexToByte(text, pos) },
        });
        applySnapshot(norm, { scroll: false });
        if (editorTA.value === text) {
          editorTA.selectionStart = editorTA.selectionEnd = Math.min(pos, editorTA.value.length);
        }
        updateStatusbar();
      } catch (err) { console.error('vim enable error:', err); }
    });
  } else {
    modeIndicator.textContent = 'EDIT';
    modeIndicator.style.opacity = '0.5';
  }
  updateStatusbar();
  if (typeof updateUndoButtons === 'function') updateUndoButtons();
}

function applyAutoSave(enabled) {
  autoSaveEnabled = enabled;
  localStorage.setItem('tengwar-autosave', enabled ? 'true' : 'false');
  const item = document.getElementById('autosaveItem');
  if (item) item.classList.toggle('active', enabled);
  if (enabled) showToast('Auto-save enabled', 'info');
  else { clearTimeout(autoSaveTimer); showToast('Auto-save disabled', 'info'); }
  updateStatusbar();
}

function applyTheme(dark) {
  document.body.classList.toggle('preview-dark', dark);
  localStorage.setItem('tengwar-preview-theme', dark ? 'dark' : 'light');
  const item = document.getElementById('themeItem');
  if (item) item.classList.toggle('active', dark);
}

function applySidebarSide(right) {
  document.body.classList.toggle('sidebar-right', right);
  localStorage.setItem('tengwar-sidebar-side', right ? 'right' : 'left');
  const item = document.getElementById('sidebarItem');
  if (item) item.classList.toggle('active', right);
}

function applyScrollSync(enabled) {
  scrollSyncEnabled = enabled;
  localStorage.setItem('tengwar-scroll-sync', enabled ? 'true' : 'false');
  const item = document.getElementById('scrollSyncItem');
  if (item) item.classList.toggle('active', enabled);
}

function applyBlockMode(enabled) {
  blockModeEnabled = enabled;
  localStorage.setItem('tengwar-block-mode', enabled ? 'true' : 'false');
  const item = document.getElementById('blockModeItem');
  if (item) item.classList.toggle('active', enabled);

  document.body.classList.toggle('block-mode', enabled);

  const wrap = document.getElementById('editor-wrap');
  const blk = document.getElementById('block-editor');
  const modeInd = document.getElementById('mode-indicator');

  if (enabled) {
    if (wrap) wrap.style.display = 'none';
    if (blk) blk.style.display = 'block';
    if (modeInd) modeInd.style.display = 'none';
    enterBlockMode();
  } else {
    exitBlockMode();
    if (wrap) wrap.style.removeProperty('display');
    if (blk) blk.style.display = 'none';
    if (modeInd) modeInd.style.removeProperty('display');
  }
  updateStatusbar();
  if (typeof updateUndoButtons === 'function') updateUndoButtons();
}
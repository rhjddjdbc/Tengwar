"use strict";

/* ═══════════════════════════════════════════════════════════════
   DROPDOWNS
   ═══════════════════════════════════════════════════════════════ */
const dropdownMap = new Map();
document.querySelectorAll('.dropdown').forEach(dd => {
  const menu = dd.querySelector('.dropdown-menu');
  if (!menu) return;
  dropdownMap.set(dd, menu);
  document.body.appendChild(menu);
});

function closeAllDropdowns() {
  dropdownMap.forEach((menu, dd) => {
    dd.classList.remove('open');
    menu.classList.remove('show');
  });
}

function positionDropdownMenu(toggle, menu) {
  const r = toggle.getBoundingClientRect();
  menu.style.top = (r.bottom + 6) + 'px';
  menu.style.left = r.left + 'px';
  menu.style.right = 'auto';
  requestAnimationFrame(() => {
    const mw = menu.offsetWidth;
    const vw = window.innerWidth;
    if (r.left + mw > vw - 8) {
      menu.style.left = 'auto';
      menu.style.right = '8px';
    }
  });
}

dropdownMap.forEach((menu, dd) => {
  const toggle = dd.querySelector('[data-toggle]');
  if (!toggle) return;
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = dd.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) {
      dd.classList.add('open');
      menu.classList.add('show');
      positionDropdownMenu(toggle, menu);
    }
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown') && !e.target.closest('.dropdown-menu')) {
    closeAllDropdowns();
  }
});
document.addEventListener('scroll', closeAllDropdowns, true);
window.addEventListener('resize', closeAllDropdowns);
window.addEventListener('blur', closeAllDropdowns);

document.querySelectorAll('.dropdown-menu .dropdown-item').forEach(item => {
  item.addEventListener('click', () => {
    const action = item.dataset.action;
    closeAllDropdowns();
    handleDropdownAction(action);
  });
});

function handleDropdownAction(action) {
  switch (action) {
    case 'export-html': exportHtml(); break;
    case 'export-pdf': exportPdf(); break;
    case 'split-toggle': window.__layout.toggleDirection(); break;
    case 'pane-swap': window.__layout.swapPanes(); break;
    case 'focus-editor': window.__layout.focusEditor(); break;
    case 'focus-preview': window.__layout.focusPreview(); break;
    case 'reset-layout': window.__layout.reset(); break;
    case 'toggle-theme': applyTheme(!document.body.classList.contains('preview-dark')); break;
    case 'toggle-vim': applyVim(!vimEnabled); break;
    case 'toggle-block-mode': applyBlockMode(!blockModeEnabled); break;
    case 'toggle-sidebar': applySidebarSide(!document.body.classList.contains('sidebar-right')); break;
    case 'toggle-autosave': applyAutoSave(!autoSaveEnabled); break;
    case 'toggle-scrollsync': applyScrollSync(!scrollSyncEnabled); break;
    case 'edit-theme': openThemeEditor(document.body.classList.contains('preview-dark') ? 'dark' : 'light'); break;
    case 'edit-keybindings': openKeybindings(); break;
  }
}

/* ═══════════════════════════════════════════════════════════════
   BUTTONS

   "Open Folder" now lives inside the vault dropdown (33-vaults.js),
   not as a standalone toolbar button — so there's no handler for it
   here. The guard-style id lookups below make this file robust if
   any other button ever moves out of index.html.
   ═══════════════════════════════════════════════════════════════ */
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

on('saveBtn', 'click', saveFile);

on('newFileBtn', 'click', () => {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  newFileInFolder({
    abs: activeFolderAbs || currentRepoPath,
    path: activeFolderRel || '',
  });
});
on('newFolderBtn', 'click', () => {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  newFolderInFolder({
    abs: activeFolderAbs || currentRepoPath,
    path: activeFolderRel || '',
  });
});

on('fileSearchBtn', 'click', () => showSearch('files'));
on('lineSearchBtn', 'click', () => showSearch('lines'));
on('zoomInBtn', 'click', zoomIn);
on('zoomOutBtn', 'click', zoomOut);
on('zoomFitBtn', 'click', zoomFit);
on('zoomLabel', 'click', zoomReset);

on('git-init-btn', 'click', gitInit);
on('git-clone-btn', 'click', gitClone);
on('git-commit-btn', 'click', gitCommitAll);
on('git-push-btn', 'click', gitPush);
on('git-pull-btn', 'click', gitPull);
on('git-fetch-btn', 'click', gitFetch);
on('git-remote-btn', 'click', setRemote);
on('git-branch-display', 'click', switchBranch);
on('git-token-btn', 'click', setGitToken);
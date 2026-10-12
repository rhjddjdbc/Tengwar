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
    case 'toggle-sidebar': applySidebarSide(!document.body.classList.contains('sidebar-right')); break;
    case 'toggle-autosave': applyAutoSave(!autoSaveEnabled); break;
    case 'toggle-scrollsync': applyScrollSync(!scrollSyncEnabled); break;
    case 'edit-theme': openThemeEditor(document.body.classList.contains('preview-dark') ? 'dark' : 'light'); break;
    case 'edit-keybindings': openKeybindings(); break;
  }
}

/* ═══════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════ */
document.getElementById('openFolderBtn').addEventListener('click', openFolder);
document.getElementById('saveBtn').addEventListener('click', saveFile);
document.getElementById('newFileBtn').addEventListener('click', newFile);
document.getElementById('newFolderBtn').addEventListener('click', () => {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  newFolderInFolder({ abs: currentRepoPath, path: '' });
});
document.getElementById('fileSearchBtn').addEventListener('click', () => showSearch('files'));
document.getElementById('lineSearchBtn').addEventListener('click', () => showSearch('lines'));
document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
document.getElementById('zoomFitBtn').addEventListener('click', zoomFit);
zoomLabel.addEventListener('click', zoomReset);
document.getElementById('git-init-btn').addEventListener('click', gitInit);
document.getElementById('git-clone-btn').addEventListener('click', gitClone);
document.getElementById('git-commit-btn').addEventListener('click', gitCommitAll);
document.getElementById('git-push-btn').addEventListener('click', gitPush);
document.getElementById('git-pull-btn').addEventListener('click', gitPull);
document.getElementById('git-fetch-btn').addEventListener('click', gitFetch);
document.getElementById('git-remote-btn').addEventListener('click', setRemote);
document.getElementById('git-branch-display').addEventListener('click', switchBranch);
document.getElementById('git-token-btn').addEventListener('click', setGitToken);

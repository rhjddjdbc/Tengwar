"use strict";

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS (configurable)
   ═══════════════════════════════════════════════════════════════ */

const KEY_ACTIONS = [
  { id: 'save',              cat: 'File',   label: 'Save',                   def: 'ctrl+s',          scope: 'editor', action: () => saveFile() },
  { id: 'save-as',           cat: 'File',   label: 'Save As…',               def: 'ctrl+shift+s',    scope: 'editor', action: () => saveFileAs(null) },
  { id: 'new-file',          cat: 'File',   label: 'New File',               def: 'ctrl+n',          scope: 'global', action: () => newFile() },
  { id: 'open-folder',       cat: 'File',   label: 'Open Folder…',           def: 'ctrl+o',          scope: 'global', action: () => openFolder() },
  { id: 'export-html',       cat: 'File',   label: 'Export as HTML',         def: '',                scope: 'global', action: () => exportHtml() },
  { id: 'print-pdf',         cat: 'File',   label: 'Print / PDF',            def: 'ctrl+alt+p',      scope: 'global', action: () => exportPdf() },
  { id: 'today-note',        cat: 'File',   label: "Today's Note",           def: 'ctrl+shift+t',    scope: 'global', action: () => openDailyNote() },

  { id: 'find-files',        cat: 'Edit',   label: 'Find Files',             def: 'ctrl+p',          scope: 'editor', action: () => showSearch('files') },
  { id: 'find-lines',        cat: 'Edit',   label: 'Find Lines',             def: 'ctrl+f',          scope: 'editor', action: () => showSearch('lines') },
  { id: 'find-replace',      cat: 'Edit',   label: 'Find & Replace',         def: 'ctrl+h',          scope: 'global', action: () => toggleFindPopup() },
  { id: 'search-all',        cat: 'Edit',   label: 'Search in All Files',    def: 'ctrl+alt+f',      scope: 'global', action: () => openSearchAll() },
  { id: 'command-palette',   cat: 'Edit',   label: 'Command Palette',        def: 'ctrl+shift+k',    scope: 'global', action: () => showCommandPalette() },

  { id: 'bold',              cat: 'Format', label: 'Bold',                   def: 'ctrl+b',          scope: 'editor', action: () => wrapSelection('**', '**', 'bold text') },
  { id: 'italic',            cat: 'Format', label: 'Italic',                 def: 'ctrl+i',          scope: 'editor', action: () => wrapSelection('*', '*', 'italic') },
  { id: 'link',              cat: 'Format', label: 'Link',                   def: 'ctrl+k',          scope: 'editor', action: () => wrapSelection('[', '](url)', 'link text') },
  { id: 'code-block',        cat: 'Format', label: 'Code Block',             def: 'ctrl+shift+c',    scope: 'editor', action: () => wrapSelection('```\n', '\n```', 'code') },
  { id: 'insert-h1',         cat: 'Format', label: 'Heading 1',              def: '',                scope: 'editor', action: () => insertText('# ') },
  { id: 'insert-h2',         cat: 'Format', label: 'Heading 2',              def: '',                scope: 'editor', action: () => insertText('## ') },
  { id: 'insert-h3',         cat: 'Format', label: 'Heading 3',              def: '',                scope: 'editor', action: () => insertText('### ') },
  { id: 'insert-task',       cat: 'Format', label: 'Task List Item',         def: '',                scope: 'editor', action: () => insertText('- [ ] ') },
  { id: 'insert-hr',         cat: 'Format', label: 'Horizontal Rule',        def: '',                scope: 'editor', action: () => insertText('\n---\n') },

  { id: 'toggle-dark',       cat: 'View',   label: 'Toggle Dark Mode',       def: 'ctrl+shift+d',    scope: 'global', action: () => applyTheme(!document.body.classList.contains('preview-dark')) },
  { id: 'toggle-vim',        cat: 'View',   label: 'Toggle Vim Mode',        def: 'ctrl+shift+v',    scope: 'global', action: () => applyVim(!vimEnabled) },
  { id: 'toggle-autosave',   cat: 'View',   label: 'Toggle Auto-Save',       def: 'ctrl+shift+a',    scope: 'global', action: () => applyAutoSave(!autoSaveEnabled) },
  { id: 'toggle-sidebar',    cat: 'View',   label: 'Sidebar on Right',       def: '',                scope: 'global', action: () => applySidebarSide(!document.body.classList.contains('sidebar-right')) },
  { id: 'toggle-scrollsync', cat: 'View',   label: 'Toggle Scroll Sync',     def: '',                scope: 'global', action: () => applyScrollSync(!scrollSyncEnabled) },
  { id: 'zoom-in',           cat: 'View',   label: 'Zoom In',                def: 'ctrl+=',          scope: 'editor', action: () => zoomIn() },
  { id: 'zoom-out',          cat: 'View',   label: 'Zoom Out',               def: 'ctrl+-',          scope: 'editor', action: () => zoomOut() },
  { id: 'zoom-reset',        cat: 'View',   label: 'Zoom Reset',             def: 'ctrl+0',          scope: 'editor', action: () => zoomReset() },
  { id: 'close-tab',         cat: 'View',   label: 'Close Tab',              def: 'ctrl+w',          scope: 'global', action: () => { if (activeTabId) closeTab(activeTabId); } },
  { id: 'next-tab',          cat: 'View',   label: 'Next Tab',               def: 'ctrl+tab',        scope: 'global', action: () => cycleTab(1) },
  { id: 'prev-tab',          cat: 'View',   label: 'Previous Tab',           def: 'ctrl+shift+tab',  scope: 'global', action: () => cycleTab(-1) },
  { id: 'open-graph',        cat: 'View',   label: 'Open Link Graph',        def: 'ctrl+g',          scope: 'global', action: () => { const p = document.getElementById('graph-popup'); if (p && p.classList.contains('show')) closeGraphView(); else openGraphView(); } },

  { id: 'toggle-split',      cat: 'Layout', label: 'Toggle Split Direction', def: 'ctrl+\\',         scope: 'global', action: () => window.__layout.toggleDirection() },
  { id: 'swap-panes',        cat: 'Layout', label: 'Swap Panes',             def: 'ctrl+shift+x',    scope: 'global', action: () => window.__layout.swapPanes() },
  { id: 'focus-editor',      cat: 'Layout', label: 'Focus Editor',           def: 'ctrl+shift+e',    scope: 'global', action: () => window.__layout.focusEditor() },
  { id: 'focus-preview',     cat: 'Layout', label: 'Focus Preview',          def: 'ctrl+shift+o',    scope: 'global', action: () => window.__layout.focusPreview() },

  { id: 'git-commit',        cat: 'Git',    label: 'Commit',                 def: '',                scope: 'global', action: () => gitCommitAll() },
  { id: 'git-push',          cat: 'Git',    label: 'Push',                   def: '',                scope: 'global', action: () => gitPush() },
  { id: 'git-pull',          cat: 'Git',    label: 'Pull',                   def: '',                scope: 'global', action: () => gitPull() },
  { id: 'git-diff',          cat: 'Git',    label: 'Show Diff',              def: '',                scope: 'global', action: () => openDiffViewer() },
];

const KEYBIND_STORAGE = 'tengwar-keybindings';
let keybindings = {};
let kbRecordingId = null;

function loadKeybindings() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEYBIND_STORAGE) || '{}'); } catch (_) {}
  keybindings = {};
  for (const a of KEY_ACTIONS) {
    keybindings[a.id] = (stored[a.id] != null) ? stored[a.id] : a.def;
  }
}
function saveKeybindings() {
  try { localStorage.setItem(KEYBIND_STORAGE, JSON.stringify(keybindings)); } catch (_) {}
}
loadKeybindings();

function normalizeKeyName(k) {
  if (k === '+') return '=';
  if (k === '_') return '-';
  return k.toLowerCase();
}

function isFunctionKey(k) {
  if (/^f\d+$/.test(k)) return true;
  return ['escape','enter','tab','backspace','delete','home','end',
          'pageup','pagedown','arrowup','arrowdown','arrowleft','arrowright',
          'insert',' '].includes(k);
}

function normalizeCombo(ev) {
  const parts = [];
  if (ev.ctrlKey)  parts.push('ctrl');
  if (ev.shiftKey) parts.push('shift');
  if (ev.altKey)   parts.push('alt');
  if (ev.metaKey)  parts.push('meta');
  const rawKey = ev.key;
  if (!rawKey) return '';
  if (['Shift','Control','Alt','Meta','CapsLock'].includes(rawKey)) return '';
  let k = normalizeKeyName(rawKey);
  if (k.length === 1) k = k.toLowerCase();
  if (parts.length === 0 && !isFunctionKey(k)) return '';
  parts.push(k);
  return parts.join('+');
}

function comboDisplay(combo) {
  if (!combo) return '';
  const isMac = navigator.platform.includes('Mac');
  return combo.split('+').map(p => {
    if (p === 'ctrl')  return isMac ? '⌃' : 'Ctrl';
    if (p === 'shift') return isMac ? '⇧' : 'Shift';
    if (p === 'alt')   return isMac ? '⌥' : 'Alt';
    if (p === 'meta')  return isMac ? '⌘' : 'Win';
    if (p === 'arrowup')    return '↑';
    if (p === 'arrowdown')  return '↓';
    if (p === 'arrowleft')  return '←';
    if (p === 'arrowright') return '→';
    if (p === 'escape')    return 'Esc';
    if (p === 'backspace') return '⌫';
    if (p === 'delete')    return 'Del';
    if (p === 'enter')     return 'Enter';
    if (p === 'tab')       return 'Tab';
    if (p === ' ')         return 'Space';
    if (p === 'pageup')    return 'PgUp';
    if (p === 'pagedown')  return 'PgDn';
    if (p.length === 1)    return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(isMac ? '' : '+');
}

function findActionByCombo(combo) {
  for (const a of KEY_ACTIONS) {
    if (keybindings[a.id] && keybindings[a.id] === combo) return a;
  }
  return null;
}

function findConflicts(combo, excludeId) {
  if (!combo) return [];
  return KEY_ACTIONS.filter(a => a.id !== excludeId && keybindings[a.id] === combo);
}

function cycleTab(dir) {
  const ids = Array.from(tabs.keys());
  if (ids.length <= 1) return;
  const idx = ids.indexOf(activeTabId);
  const next = (idx + dir + ids.length) % ids.length;
  switchToTab(ids[next]);
}

function shouldSkipForVim(ev) {
  if (!vimEnabled) return false;
  if (document.activeElement !== editorTA) return false;
  if (!(ev.ctrlKey || ev.metaKey)) return false;
  if (ev.shiftKey || ev.altKey) return false;
  return ev.key.toLowerCase() === 'r';
}

function isAnyModalOpen() {
  const ids = ['command-popup', 'search-popup', 'command-palette', 'modal-overlay', 'search-all-popup', 'theme-editor'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.classList.contains('show')) return true;
  }
  return false;
}

function handleGlobalShortcut(ev) {
  if (kbRecordingId) return;
  if (shouldSkipForVim(ev)) return;

  const combo = normalizeCombo(ev);
  if (!combo) return;
  const action = findActionByCombo(combo);
  if (!action) return;

  if (action.scope === 'editor' && document.activeElement !== editorTA) return;
  if (isAnyModalOpen()) return;

  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT') && ae !== editorTA) {
    return;
  }

  ev.preventDefault();
  ev.stopPropagation();
  action.action();
}

function installShortcutDispatcher() {
  document.addEventListener('keydown', handleGlobalShortcut, true);
}
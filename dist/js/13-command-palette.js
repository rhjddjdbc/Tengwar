"use strict";

/* ═══════════════════════════════════════════════════════════════
   COMMAND PALETTE
   ═══════════════════════════════════════════════════════════════ */
const cpOverlay = document.getElementById('command-palette');
const cpInput = document.getElementById('cp-input');
const cpResults = document.getElementById('cp-results');
let cpSelected = 0;
let cpItems = [];

const COMMANDS = [
  { cat: 'File', name: 'New File', action: () => newFile() },
  { cat: 'File', name: 'Open Folder…', action: () => openFolder() },
  { cat: 'File', name: 'Save', action: () => saveFile() },
  { cat: 'File', name: 'Save As…', action: () => saveFileAs(null) },
  { cat: 'File', name: 'Export as HTML', action: () => exportHtml() },
  { cat: 'File', name: 'Print / PDF', action: () => exportPdf() },
  { cat: 'File', name: "Today's Note", action: () => openDailyNote() },
  { cat: 'File', name: 'Templates & journal…', action: () => openTemplatesSettings() },
  { cat: 'Edit', name: 'Find in File', action: () => showSearch('lines') },
  { cat: 'Edit', name: 'Find & Replace', action: () => toggleFindPopup() },
  { cat: 'Edit', name: 'Find Files', action: () => showSearch('files') },
  { cat: 'Edit', name: 'Search in All Files', action: () => openSearchAll() },
  { cat: 'Edit', name: 'Keyboard Shortcuts…', action: () => openKeybindings() },
  { cat: 'Format', name: 'Bold', action: () => wrapSelection('**', '**', 'bold text') },
  { cat: 'Format', name: 'Italic', action: () => wrapSelection('*', '*', 'italic') },
  { cat: 'Format', name: 'Link', action: () => wrapSelection('[', '](url)', 'link text') },
  { cat: 'Format', name: 'Inline Code', action: () => wrapSelection('`', '`', 'code') },
  { cat: 'Format', name: 'Code Block', action: () => wrapSelection('```\n', '\n```', 'code') },
  { cat: 'Format', name: 'Heading 1', action: () => insertText('# ') },
  { cat: 'Format', name: 'Heading 2', action: () => insertText('## ') },
  { cat: 'Format', name: 'Heading 3', action: () => insertText('### ') },
  { cat: 'Format', name: 'Bullet List', action: () => insertText('- ') },
  { cat: 'Format', name: 'Numbered List', action: () => insertText('1. ') },
  { cat: 'Format', name: 'Task List Item', action: () => insertText('- [ ] ') },
  { cat: 'Format', name: 'Blockquote', action: () => insertText('> ') },
  { cat: 'Format', name: 'Horizontal Rule', action: () => insertText('\n---\n') },
  { cat: 'Format', name: 'Table', action: () => insertText('\n| Col 1 | Col 2 |\n|-------|-------|\n| a     | b     |\n') },
  { cat: 'View', name: 'Toggle Dark Mode', action: () => applyTheme(!document.body.classList.contains('preview-dark')) },
  { cat: 'View', name: 'Toggle Vim Mode', action: () => applyVim(!vimEnabled) },
  { cat: 'View', name: 'Toggle Block Editor', action: () => applyBlockMode(!blockModeEnabled) },
  { cat: 'View', name: 'Toggle Auto-Save', action: () => applyAutoSave(!autoSaveEnabled) },
  { cat: 'View', name: 'Toggle Scroll Sync', action: () => applyScrollSync(!scrollSyncEnabled) },
  { cat: 'View', name: 'Sidebar to Right', action: () => applySidebarSide(!document.body.classList.contains('sidebar-right')) },
  { cat: 'View', name: 'Zoom In', action: () => zoomIn() },
  { cat: 'View', name: 'Zoom Out', action: () => zoomOut() },
  { cat: 'View', name: 'Zoom Reset', action: () => zoomReset() },
  { cat: 'View', name: 'Fit to Width', action: () => zoomFit() },
  { cat: 'View', name: 'Open Graph View', action: () => openGraphView() },
  { cat: 'Theme', name: 'Edit Theme…', action: () => openThemeEditor(document.body.classList.contains('preview-dark') ? 'dark' : 'light') },
  { cat: 'Layout', name: 'Toggle Split Direction', action: () => window.__layout.toggleDirection() },
  { cat: 'Layout', name: 'Swap Editor/Preview', action: () => window.__layout.swapPanes() },
  { cat: 'Layout', name: 'Focus Editor', action: () => window.__layout.focusEditor() },
  { cat: 'Layout', name: 'Focus Preview', action: () => window.__layout.focusPreview() },
  { cat: 'Layout', name: 'Reset Layout', action: () => window.__layout.reset() },
  { cat: 'Git', name: 'Init Repository', action: () => gitInit() },
  { cat: 'Git', name: 'Clone Repository…', action: () => gitClone() },
  { cat: 'Git', name: 'Commit', action: () => gitCommitAll() },
  { cat: 'Git', name: 'Push', action: () => gitPush() },
  { cat: 'Git', name: 'Pull', action: () => gitPull() },
  { cat: 'Git', name: 'Fetch', action: () => gitFetch() },
  { cat: 'Git', name: 'Set Remote…', action: () => setRemote() },
  { cat: 'Git', name: 'Switch Branch…', action: () => switchBranch() },
  { cat: 'Git', name: 'Set Token…', action: () => setGitToken() },
  { cat: 'Git', name: 'Show Diff', action: () => openDiffViewer() },
];

function commandKeyHint(actionLabel) {
  const map = {
    'Save': 'save', 'Save As…': 'save-as',
    'New File': 'new-file', 'Open Folder…': 'open-folder',
    'Find in File': 'find-lines', 'Find Files': 'find-files',
    'Find & Replace': 'find-replace', 'Search in All Files': 'search-all',
    'Bold': 'bold', 'Italic': 'italic', 'Link': 'link', 'Code Block': 'code-block',
    'Toggle Dark Mode': 'toggle-dark', 'Toggle Vim Mode': 'toggle-vim',
    'Toggle Auto-Save': 'toggle-autosave', 'Toggle Scroll Sync': 'toggle-scrollsync',
    'Sidebar to Right': 'toggle-sidebar',
    'Zoom In': 'zoom-in', 'Zoom Out': 'zoom-out', 'Zoom Reset': 'zoom-reset',
    'Open Graph View': 'open-graph',
    'Toggle Split Direction': 'toggle-split', 'Swap Editor/Preview': 'swap-panes',
    'Focus Editor': 'focus-editor', 'Focus Preview': 'focus-preview',
    'Show Diff': 'git-diff',
    "Today's Note": 'today-note',
  };
  const id = map[actionLabel];
  if (!id || !keybindings[id]) return '';
  return comboDisplay(keybindings[id]);
}

function showCommandPalette() {
  cpOverlay.classList.add('show');
  cpInput.value = '';
  cpSelected = 0;
  filterCommands('');
  requestAnimationFrame(() => cpInput.focus());
}
function hideCommandPalette() {
  cpOverlay.classList.remove('show');
  cpInput.blur();
  editorTA.focus();
}
function filterCommands(query) {
  const q = query.toLowerCase();
  if (!q) {
    cpItems = COMMANDS.slice();
  } else {
    cpItems = COMMANDS.map(c => {
      const hay = (c.name + ' ' + c.cat).toLowerCase();
      const res = fuzzyMatchJS(q, hay);
      if (!res) return null;
      return { ...c, score: res.score, positions: res.positions };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  }
  if (cpSelected >= cpItems.length) cpSelected = 0;
  renderCommandPalette();
}
function fuzzyMatchJS(pattern, str) {
  const p = pattern.toLowerCase();
  const s = str.toLowerCase();
  let pi = 0, si = 0, score = 0, lastMatch = -1;
  const positions = [];
  while (pi < p.length && si < s.length) {
    if (p[pi] === s[si]) {
      positions.push(si);
      if (lastMatch === si - 1) score += 8;
      if (si === 0 || /[\s\-_.]/.test(s[si - 1])) score += 14;
      score += Math.max(0, 15 - si) * 0.6;
      lastMatch = si;
      pi++;
    }
    si++;
  }
  if (pi < p.length) return null;
  score -= str.length * 0.25;
  return { score, positions };
}
function renderCommandPalette() {
  cpResults.innerHTML = '';
  if (!cpItems.length) {
    cpResults.innerHTML = '<div class="cp-empty">No matching commands</div>';
    return;
  }
  cpItems.slice(0, 60).forEach((cmd, idx) => {
    const el = document.createElement('div');
    el.className = 'cp-item' + (idx === cpSelected ? ' selected' : '');
    let nameHtml;
    if (cmd.positions && cmd.positions.length) {
      let out = '', last = 0;
      for (const pos of cmd.positions) {
        out += escapeHtml(cmd.name.slice(last, pos));
        out += '<mark>' + escapeHtml(cmd.name[pos]) + '</mark>';
        last = pos + 1;
      }
      out += escapeHtml(cmd.name.slice(last));
      nameHtml = out;
    } else {
      nameHtml = escapeHtml(cmd.name);
    }
    const hint = commandKeyHint(cmd.name);
    el.innerHTML = `<span>${nameHtml}</span>` +
      (hint ? `<span style="color:var(--fg-2);font-size:11px;font-family:monospace">${escapeHtml(hint)}</span>` : '') +
      `<span class="cp-cat">${cmd.cat}</span>`;
    el.addEventListener('mouseenter', () => { cpSelected = idx; renderCommandPalette(); });
    el.addEventListener('click', () => { runCommandItem(idx); });
    cpResults.appendChild(el);
  });
}
function runCommandItem(idx) {
  const cmd = cpItems[idx];
  if (!cmd) return;
  hideCommandPalette();
  setTimeout(() => cmd.action(), 50);
}
cpInput.addEventListener('input', () => { cpSelected = 0; filterCommands(cpInput.value); });
cpInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); cpSelected = Math.min(cpSelected + 1, cpItems.length - 1); renderCommandPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cpSelected = Math.max(cpSelected - 1, 0); renderCommandPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); runCommandItem(cpSelected); }
  else if (e.key === 'Escape') { e.preventDefault(); hideCommandPalette(); }
});
cpOverlay.addEventListener('mousedown', (e) => { if (e.target === cpOverlay) hideCommandPalette(); });
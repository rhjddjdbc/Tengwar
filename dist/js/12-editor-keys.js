"use strict";

/* ═══════════════════════════════════════════════════════════════
   EDITOR KEY HANDLER
   ═══════════════════════════════════════════════════════════════ */
editorTA.addEventListener('keydown', (e) => {
  // If the combo matches a configured shortcut, the capture-phase dispatcher
  // has already handled it and stopped propagation. If we get here, no
  // configured shortcut matched — fall through to normal editor behavior.
  if (!vimEnabled) {
    if (handleAutoPair(e)) {
      e.preventDefault();
      updateHighlight();
      markTabModified();
      debouncedRender();
      scheduleAutoSave();
      return;
    }
    return;
  }

  if (e.key === ':' && currentVimMode === 'normal' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault(); showCommandPopup(); return;
  }

  e.preventDefault();

  const baseEvent = {
    key: e.key,
    ctrl: e.ctrlKey || false,
    shift: e.shiftKey || false,
    alt: e.altKey || false,
    meta: e.metaKey || false,
  };

  vimQueue = vimQueue.then(async () => {
    try {
      const cur = editorTA.selectionStart;
      const hintBytes = (cur !== lastAppliedCursor)
        ? jsIndexToByte(editorTA.value, cur)
        : null;
      const keyEvent = { ...baseEvent, cursor_hint: hintBytes };
      const snap = await invoke('vim_handle_key', { event: keyEvent });
      applySnapshot(snap);
      updateHighlight();
      markTabModified();
      debouncedRender();
      scheduleAutoSave();
    } catch (err) { console.error('vim error:', err); }
  });
});

editorTA.addEventListener('input', () => {
  updateHighlight();
  if (!vimEnabled) { markTabModified(); debouncedRender(); scheduleAutoSave(); }
  updateStatusbar();
});
editorTA.addEventListener('click', updateStatusbar);
editorTA.addEventListener('keyup', updateStatusbar);

/* ═══════════════════════════════════════════════════════════════
   COMMAND POPUP (Vim `:`)
   ═══════════════════════════════════════════════════════════════ */
const commandPopup = document.getElementById('command-popup');
const commandInput = document.getElementById('command-input');

function showCommandPopup() {
  commandPopup.classList.add('show'); commandInput.value = '';
  requestAnimationFrame(() => commandInput.focus());
}
function hideCommandPopup() {
  commandPopup.classList.remove('show'); commandInput.blur(); editorTA.focus();
}

commandInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const cmd = commandInput.value;
    hideCommandPopup();
    try {
      await vimQueue;
      const res = await invoke('vim_execute_command', { cmd });
      if (res.message) showToast(res.message, res.action === 'error' ? 'error' : 'info');
      if (res.action === 'save') saveFile();
      else if (res.action === 'save_as') saveFileAs(res.arg);
      else if (res.action === 'edit') {
        const name = (res.arg || '').toLowerCase();
        const f = allFiles.find(x => x.name.toLowerCase() === name || x.path.toLowerCase() === name || x.path.toLowerCase().endsWith('/' + name));
        if (f) { openFileEntry(f); showToast('Opened: ' + f.name); }
        else showToast('Not found: "' + res.arg + '"', 'error');
      } else if (res.action === 'goto' || res.action === 'substituted') {
        const snap = await invoke('vim_snapshot');
        applySnapshot(snap);
        updateHighlight();
        markTabModified();
        render(true);
      }
    } catch (err) { showToast(String(err), 'error'); }
  } else if (e.key === 'Escape') { e.preventDefault(); hideCommandPopup(); }
});
commandPopup.addEventListener('mousedown', (e) => { if (e.target === commandPopup) hideCommandPopup(); });

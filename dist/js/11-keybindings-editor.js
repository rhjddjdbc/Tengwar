"use strict";

/* ── Keybindings editor popup ───────────────────────────────── */
const kbPopup = document.getElementById('keybindings-popup');
const kbList = document.getElementById('kb-list');
const kbFilter = document.getElementById('kb-filter');

function openKeybindings() {
  kbPopup.classList.add('show');
  kbFilter.value = '';
  kbRecordingId = null;
  renderKeybindingsList('');
  requestAnimationFrame(() => kbFilter.focus());
}
function closeKeybindings() {
  kbPopup.classList.remove('show');
  kbRecordingId = null;
}
function renderKeybindingsList(filter) {
  const q = (filter || '').toLowerCase().trim();
  kbList.innerHTML = '';
  const byCat = new Map();
  for (const a of KEY_ACTIONS) {
    if (q) {
      const combo = comboDisplay(keybindings[a.id] || '');
      const hay = (a.label + ' ' + a.cat + ' ' + combo).toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (!byCat.has(a.cat)) byCat.set(a.cat, []);
    byCat.get(a.cat).push(a);
  }
  if (byCat.size === 0) {
    kbList.innerHTML = '<div class="kb-empty">No matching shortcuts</div>';
    return;
  }
  for (const [cat, actions] of byCat) {
    const h = document.createElement('div');
    h.className = 'kb-cat';
    h.textContent = cat;
    kbList.appendChild(h);
    for (const a of actions) {
      const row = document.createElement('div');
      row.className = 'kb-row';
      const isRec = kbRecordingId === a.id;
      const combo = keybindings[a.id] || '';
      const conflicts = findConflicts(combo, a.id);
      const warn = conflicts.length
        ? ` <span class="kb-conflict" title="Also bound to: ${conflicts.map(c => c.label).join(', ')}">⚠</span>`
        : '';
      const comboInner = isRec
        ? '<span class="kb-rec">Press keys…</span>'
        : (combo ? escapeHtml(comboDisplay(combo)) : '<span class="kb-muted">unbound</span>');
      row.innerHTML = `
        <span class="kb-label">${escapeHtml(a.label)}${warn}</span>
        <button class="kb-combo${isRec ? ' recording' : ''}${!combo && !isRec ? ' empty' : ''}" data-id="${a.id}">${comboInner}</button>
        <button class="kb-clear" data-clear="${a.id}" title="Clear">✕</button>
      `;
      kbList.appendChild(row);
    }
  }
  kbList.querySelectorAll('.kb-combo').forEach(btn => {
    btn.addEventListener('click', () => {
      kbRecordingId = btn.dataset.id;
      renderKeybindingsList(kbFilter.value);
    });
  });
  kbList.querySelectorAll('.kb-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      keybindings[btn.dataset.clear] = '';
      saveKeybindings();
      renderKeybindingsList(kbFilter.value);
    });
  });
}

// Recording handler — intercepts keys while the popup is open.
document.addEventListener('keydown', (ev) => {
  if (!kbPopup.classList.contains('show')) return;

  if (kbRecordingId) {
    if (['Shift','Control','Alt','Meta','CapsLock'].includes(ev.key)) {
      ev.preventDefault(); ev.stopPropagation();
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      kbRecordingId = null;
      renderKeybindingsList(kbFilter.value);
      return;
    }
    if (ev.key === 'Backspace' || ev.key === 'Delete') {
      ev.preventDefault(); ev.stopPropagation();
      keybindings[kbRecordingId] = '';
      saveKeybindings();
      kbRecordingId = null;
      renderKeybindingsList(kbFilter.value);
      return;
    }
    const combo = normalizeCombo(ev);
    if (!combo) {
      ev.preventDefault(); ev.stopPropagation();
      return;
    }
    ev.preventDefault(); ev.stopPropagation();
    keybindings[kbRecordingId] = combo;
    saveKeybindings();
    kbRecordingId = null;
    renderKeybindingsList(kbFilter.value);
    return;
  }

  if (ev.key === 'Escape') {
    ev.preventDefault(); ev.stopPropagation();
    closeKeybindings();
  }
}, true);

kbFilter.addEventListener('input', () => renderKeybindingsList(kbFilter.value));
document.getElementById('kb-close').addEventListener('click', closeKeybindings);
document.getElementById('kb-reset').addEventListener('click', () => {
  if (!confirm('Reset all keyboard shortcuts to their defaults?')) return;
  for (const a of KEY_ACTIONS) keybindings[a.id] = a.def;
  saveKeybindings();
  renderKeybindingsList(kbFilter.value);
});
kbPopup.addEventListener('mousedown', (e) => { if (e.target === kbPopup) closeKeybindings(); });

"use strict";

/* ═══════════════════════════════════════════════════════════════
   FIND & REPLACE
   ═══════════════════════════════════════════════════════════════ */
const findPopup = document.getElementById('find-popup');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const findCount = document.getElementById('find-count');
const findCase = document.getElementById('find-case');
const findRegex = document.getElementById('find-regex');

function toggleFindPopup() {
  if (findPopup.classList.contains('show')) closeFindPopup();
  else openFindPopup();
}
function openFindPopup() {
  findPopup.classList.add('show');
  const sel = editorTA.value.slice(editorTA.selectionStart, editorTA.selectionEnd);
  if (sel && sel.length < 100 && !sel.includes('\n')) findInput.value = sel;
  requestAnimationFrame(() => { findInput.focus(); findInput.select(); });
  runFind();
}
function closeFindPopup() {
  findPopup.classList.remove('show');
  editorTA.focus();
}
function runFind() {
  const q = findInput.value;
  if (!q) { findMatches = []; findIndex = -1; findCount.textContent = ''; return; }
  const text = editorTA.value;
  findMatches = [];
  try {
    if (findRegex.checked) {
      const flags = findCase.checked ? 'g' : 'gi';
      const re = new RegExp(q, flags);
      let m;
      while ((m = re.exec(text)) !== null) {
        findMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        if (m.index === re.lastIndex) re.lastIndex++;
        if (findMatches.length > 1000) break;
      }
    } else {
      const needle = findCase.checked ? q : q.toLowerCase();
      const hay = findCase.checked ? text : text.toLowerCase();
      let idx = 0;
      while ((idx = hay.indexOf(needle, idx)) !== -1) {
        findMatches.push({ start: idx, end: idx + q.length, text: text.slice(idx, idx + q.length) });
        idx += q.length;
        if (findMatches.length > 1000) break;
      }
    }
  } catch (e) { findCount.textContent = 'invalid regex'; return; }
  findCount.textContent = findMatches.length ? `${findIndex + 1}/${findMatches.length}` : 'no matches';
  if (findMatches.length && (findIndex < 0 || findIndex >= findMatches.length)) findIndex = 0;
  highlightCurrentMatch();
}
function highlightCurrentMatch() {
  if (findIndex < 0 || findIndex >= findMatches.length) return;
  const m = findMatches[findIndex];
  editorTA.focus();
  editorTA.selectionStart = m.start;
  editorTA.selectionEnd = m.end;
  const before = editorTA.value.slice(0, m.start);
  const line = (before.match(/\n/g) || []).length;
  const lh = parseFloat(getComputedStyle(editorTA).lineHeight) || 23;
  editorTA.scrollTop = Math.max(0, (line - 5) * lh);
  findCount.textContent = `${findIndex + 1}/${findMatches.length}`;
}
function findNext() {
  if (!findMatches.length) return;
  findIndex = (findIndex + 1) % findMatches.length;
  highlightCurrentMatch();
}
function findPrev() {
  if (!findMatches.length) return;
  findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
  highlightCurrentMatch();
}
function replaceOne() {
  if (!findMatches.length) return;
  const m = findMatches[findIndex];
  const text = editorTA.value;
  const repl = replaceInput.value;
  const newVal = text.slice(0, m.start) + repl + text.slice(m.end);
  if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot();
  editorTA.value = newVal;
  updateHighlight();
  markTabModified();
  debouncedRender();
  scheduleAutoSave();
  runFind();
  syncTextToBackend();
}
function replaceAll() {
  if (!findMatches.length) return;
  const repl = replaceInput.value;
  let newVal = editorTA.value;
  for (let i = findMatches.length - 1; i >= 0; i--) {
    const m = findMatches[i];
    newVal = newVal.slice(0, m.start) + repl + newVal.slice(m.end);
  }
  if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot();
  editorTA.value = newVal;
  updateHighlight();
  markTabModified();
  debouncedRender();
  scheduleAutoSave();
  showToast(`Replaced ${findMatches.length} occurrence${findMatches.length === 1 ? '' : 's'}`);
  runFind();
  syncTextToBackend();
}

findInput.addEventListener('input', () => { findIndex = -1; runFind(); });
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? findPrev() : findNext(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFindPopup(); }
});
replaceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeFindPopup(); }
});
findCase.addEventListener('change', () => { findIndex = -1; runFind(); });
findRegex.addEventListener('change', () => { findIndex = -1; runFind(); });
document.getElementById('find-next').addEventListener('click', findNext);
document.getElementById('find-prev').addEventListener('click', findPrev);
document.getElementById('find-replace').addEventListener('click', replaceOne);
document.getElementById('find-replace-all').addEventListener('click', replaceAll);
document.getElementById('find-close').addEventListener('click', closeFindPopup);
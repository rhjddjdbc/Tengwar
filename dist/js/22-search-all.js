"use strict";

/* ═══════════════════════════════════════════════════════════════
   SEARCH IN FILES
   ═══════════════════════════════════════════════════════════════ */
const saOverlay = document.getElementById('search-all-popup');
const saInput = document.getElementById('sa-input');
const saResults = document.getElementById('sa-results');
const saStatus = document.getElementById('sa-status');
const saCase = document.getElementById('sa-case');
const saRegex = document.getElementById('sa-regex');
let saTimer = null;

function openSearchAll() {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  saOverlay.classList.add('show');
  saInput.value = '';
  saResults.innerHTML = '<div class="sa-empty">Type to search across all files…</div>';
  saStatus.textContent = '';
  requestAnimationFrame(() => saInput.focus());
}
function closeSearchAll() {
  saOverlay.classList.remove('show');
  saInput.blur();
  editorTA.focus();
}
async function runSearchAll() {
  const q = saInput.value.trim();
  if (!q) {
    saResults.innerHTML = '<div class="sa-empty">Type to search across all files…</div>';
    saStatus.textContent = '';
    return;
  }
  saStatus.textContent = 'searching…';
  try {
    const hits = await invoke('search_in_files', {
      root: currentRepoPath,
      query: q,
      regex: saRegex.checked,
      caseSensitive: saCase.checked,
    });
    renderSearchAllResults(hits, q);
  } catch (e) {
    saResults.innerHTML = `<div class="sa-empty" style="color:var(--error)">${escapeHtml(String(e))}</div>`;
    saStatus.textContent = '';
  }
}
function renderSearchAllResults(hits, query) {
  if (!hits.length) {
    saResults.innerHTML = '<div class="sa-empty">No matches</div>';
    saStatus.textContent = '0 hits';
    return;
  }
  saStatus.textContent = `${hits.length} hit${hits.length === 1 ? '' : 's'}`;
  const grouped = new Map();
  for (const h of hits) {
    if (!grouped.has(h.path)) grouped.set(h.path, []);
    grouped.get(h.path).push(h);
  }
  saResults.innerHTML = '';
  for (const [path, items] of grouped) {
    const header = document.createElement('div');
    header.className = 'sa-file-header';
    header.innerHTML = `<span>${escapeHtml(path)}</span><span class="sa-file-count">${items.length}</span>`;
    saResults.appendChild(header);

    for (const hit of items) {
      const el = document.createElement('div');
      el.className = 'sa-hit';
      let lineHtml;
      const q = query;
      if (saRegex.checked) {
        lineHtml = escapeHtml(hit.text);
      } else {
        const flags = saCase.checked ? 'g' : 'gi';
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          const re = new RegExp(escaped, flags);
          let out = '';
          let last = 0;
          let m;
          const text = hit.text;
          while ((m = re.exec(text)) !== null) {
            out += escapeHtml(text.slice(last, m.index));
            out += '<mark>' + escapeHtml(m[0]) + '</mark>';
            last = m.index + m[0].length;
            if (m.index === re.lastIndex) re.lastIndex++;
          }
          out += escapeHtml(text.slice(last));
          lineHtml = out;
        } catch (e) {
          lineHtml = escapeHtml(hit.text);
        }
      }
      el.innerHTML = `<span class="sa-ln">${hit.line}</span><span>${lineHtml}</span>`;
      el.addEventListener('click', async () => {
        closeSearchAll();
        const entry = allFiles.find(f => f.path === hit.path);
        if (!entry) { showToast('File not in tree — reload folder', 'error'); return; }
        await openFileEntry(entry);
        await vimQueue;
        const snap = await invoke('vim_go_to_line', { line: hit.line });
        applySnapshot(snap);
        updateHighlight();
        const lh = parseFloat(getComputedStyle(editorTA).lineHeight) || 23;
        editorTA.scrollTop = Math.max(0, (hit.line - 5) * lh);
      });
      saResults.appendChild(el);
    }
  }
}
saInput.addEventListener('input', () => {
  clearTimeout(saTimer);
  saTimer = setTimeout(runSearchAll, 250);
});
saCase.addEventListener('change', runSearchAll);
saRegex.addEventListener('change', runSearchAll);
saInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeSearchAll(); }
});
saOverlay.addEventListener('mousedown', (e) => { if (e.target === saOverlay) closeSearchAll(); });
document.getElementById('searchAllBtn').addEventListener('click', openSearchAll);

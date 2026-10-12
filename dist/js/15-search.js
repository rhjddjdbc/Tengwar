"use strict";

/* ═══════════════════════════════════════════════════════════════
   SEARCH (fuzzy files/lines)
   ═══════════════════════════════════════════════════════════════ */
const searchPopup = document.getElementById('search-popup');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchModeLabel = document.getElementById('search-mode-label');
let searchMode = 'files';
let searchItems = [];
let searchSelected = 0;

function showSearch(mode) {
  searchMode = mode;
  searchModeLabel.textContent = mode === 'files' ? 'FILES' : 'IN FILE';
  searchInput.placeholder = mode === 'files' ? 'Search files…' : 'Search lines…';
  searchPopup.classList.add('show');
  searchInput.value = '';
  searchSelected = 0;
  updateSearchResults();
  requestAnimationFrame(() => searchInput.focus());
}
function hideSearch() { searchPopup.classList.remove('show'); searchInput.blur(); editorTA.focus(); }
function getSearchSource() {
  if (searchMode === 'files') return allFiles.map(f => ({ text: f.path, data: f, icon: ICON_FILE }));
  const lines = editorTA.value.split('\n');
  return lines.map((line, i) => ({ text: line, lineNo: i + 1, icon: '' }));
}
async function updateSearchResults() {
  const query = searchInput.value;
  const source = getSearchSource();
  const items = source.map(s => s.text);
  try {
    const hits = await invoke('fuzzy_find', { query, items, limit: 100 });
    searchItems = hits.map(h => ({ ...source[h.index], score: h.score, positions: h.positions }));
  } catch (e) { console.error(e); searchItems = []; }
  if (searchSelected >= searchItems.length) searchSelected = 0;
  renderSearchResults();
}
function highlightMatches(text, positions) {
  if (!positions || !positions.length) return escapeHtml(text);
  let out = '', last = 0;
  for (const pos of positions) {
    out += escapeHtml(text.slice(last, pos));
    out += '<mark>' + escapeHtml(text[pos]) + '</mark>';
    last = pos + 1;
  }
  out += escapeHtml(text.slice(last));
  return out;
}
function renderSearchResults() {
  searchResults.innerHTML = '';
  if (!searchItems.length) { searchResults.innerHTML = '<div class="search-empty">No results</div>'; return; }
  searchItems.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'search-item' + (idx === searchSelected ? ' selected' : '');
    const iconSpan = item.icon ? `<span class="file-icon">${item.icon}</span>` : '';
    let body;
    if (searchMode === 'files') body = `<span class="path-text">${highlightMatches(item.text, item.positions)}</span>`;
    else {
      const lineStr = String(item.lineNo).padStart(4, ' ');
      body = `<span class="line-number">${lineStr}</span><span class="path-text">${highlightMatches(item.text || ' ', item.positions)}</span>`;
    }
    el.innerHTML = iconSpan + body;
    el.addEventListener('mouseenter', () => {
      searchSelected = idx;
      searchResults.querySelectorAll('.search-item').forEach((n, i) => n.classList.toggle('selected', i === idx));
    });
    el.addEventListener('click', () => { searchSelected = idx; selectSearchItem(); });
    searchResults.appendChild(el);
  });
}
function scrollToSelected() { const el = searchResults.children[searchSelected]; if (el) el.scrollIntoView({ block: 'nearest' }); }
async function selectSearchItem() {
  const item = searchItems[searchSelected]; if (!item) return;
  if (searchMode === 'files') { hideSearch(); openFileEntry(item.data); }
  else {
    const lineNo = item.lineNo;
    hideSearch();
    await vimQueue;
    const snap = await invoke('vim_go_to_line', { line: lineNo });
    applySnapshot(snap);
    updateHighlight();
    const lh = parseFloat(getComputedStyle(editorTA).lineHeight) || 23;
    editorTA.scrollTop = Math.max(0, (lineNo - 5) * lh);
  }
}
searchInput.addEventListener('input', () => { searchSelected = 0; updateSearchResults(); });
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); searchSelected = Math.min(searchSelected + 1, searchItems.length - 1); renderSearchResults(); scrollToSelected(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); searchSelected = Math.max(searchSelected - 1, 0); renderSearchResults(); scrollToSelected(); }
  else if (e.key === 'Enter') { e.preventDefault(); selectSearchItem(); }
  else if (e.key === 'Escape') { e.preventDefault(); hideSearch(); }
  else if (e.key === 'Tab') { e.preventDefault(); showSearch(searchMode === 'files' ? 'lines' : 'files'); }
});
searchPopup.addEventListener('mousedown', (e) => { if (e.target === searchPopup) hideSearch(); });

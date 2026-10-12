"use strict";

/* ═══════════════════════════════════════════════════════════════
   DIFF VIEWER
   ═══════════════════════════════════════════════════════════════ */
const diffPopup = document.getElementById('diff-popup');
const diffBody = document.getElementById('diff-body');
const diffStaged = document.getElementById('diff-staged');

let diffMode = 'unstaged'; // 'unstaged' | 'staged'

async function openDiffViewer() {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  diffPopup.classList.add('show');
  await refreshDiff();
}
function closeDiffViewer() {
  diffPopup.classList.remove('show');
}

if (diffStaged) {
  // Keep the checkbox state in sync with our internal mode
  diffStaged.checked = (diffMode === 'staged');
  diffStaged.addEventListener('change', () => {
    diffMode = diffStaged.checked ? 'staged' : 'unstaged';
    refreshDiff();
  });
}

async function refreshDiff() {
  diffBody.innerHTML = '<div style="color:var(--fg-2);padding:20px">Loading…</div>';
  try {
    const diff = await invoke('git_diff', {
      path: currentRepoPath,
      staged: diffMode === 'staged',
      file: null,
    });
    renderDiff(diff);
  } catch (e) {
    diffBody.innerHTML =
      `<div style="color:var(--error);padding:20px">${escapeHtml(String(e))}</div>`;
  }
}

function renderDiff(text) {
  if (!text || text === '(no changes)') {
    const msg = diffMode === 'staged'
      ? 'Nothing staged. Uncheck "Staged only" to see uncommitted changes.'
      : 'No uncommitted changes.';
    diffBody.innerHTML =
      `<div style="color:var(--fg-2);padding:20px;line-height:1.7;">${msg}</div>`;
    return;
  }
  const lines = text.split('\n');
  let html = '';
  for (const line of lines) {
    let cls = 'diff-line';
    if (line.startsWith('+++') || line.startsWith('---')) cls += ' diff-file';
    else if (line.startsWith('@@')) cls += ' diff-hunk';
    else if (line.startsWith('diff ') || line.startsWith('index ')
          || line.startsWith('new file') || line.startsWith('deleted file')) cls += ' diff-meta';
    else if (line.startsWith('+')) cls += ' diff-add';
    else if (line.startsWith('-')) cls += ' diff-del';
    else cls += ' diff-ctx';
    html += `<div class="${cls}">${escapeHtml(line) || '&nbsp;'}</div>`;
  }
  diffBody.innerHTML = html;
}

document.getElementById('diffBtn').addEventListener('click', openDiffViewer);
document.getElementById('diff-close').addEventListener('click', closeDiffViewer);
document.getElementById('diff-refresh').addEventListener('click', refreshDiff);
diffPopup.addEventListener('mousedown', (e) => { if (e.target === diffPopup) closeDiffViewer(); });
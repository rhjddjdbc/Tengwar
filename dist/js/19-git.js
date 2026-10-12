"use strict";

/* ═══════════════════════════════════════════════════════════════
   GIT
   ═══════════════════════════════════════════════════════════════ */
async function refreshGitStatus() {
  if (!currentRepoPath) return;
  try {
    const st = await invoke('git_status', { path: currentRepoPath });
    const map = {};
    for (const f of st.files) map[f.path] = f.status;
    document.querySelectorAll('.tree-item').forEach(el => {
      const p = el.dataset.path; if (!p) return;
      const s = map[p];
      let b = el.querySelector('.git-status');
      if (!b) { b = document.createElement('span'); b.className = 'git-status'; el.appendChild(b); }
      b.textContent = s || '';
      b.className = 'git-status' + (s ? ' ' + s : '');
    });
  } catch (_) {}
}
async function updateBranchDisplay() {
  if (!currentRepoPath) return;
  try {
    const b = await invoke('git_current_branch', { path: currentRepoPath });
    currentBranch = b;
    document.getElementById('git-branch-name').textContent = b;
  } catch (_) { document.getElementById('git-branch-name').textContent = 'no repo'; }
}
async function gitInit() {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  try { await invoke('git_init', { path: currentRepoPath }); await updateBranchDisplay(); await refreshGitStatus(); showToast('Repository initialized'); }
  catch (e) { showToast(String(e), 'error'); }
}
async function gitCommitAll() {
  if (!currentRepoPath) return;
  const msg = document.getElementById('git-commit-msg').value.trim();
  if (!msg) { showToast('Commit message required', 'error'); return; }
  try {
    await invoke('git_stage_all', { path: currentRepoPath });
    const oid = await invoke('git_commit', { path: currentRepoPath, message: msg, name: 'Tengwar User', email: 'tengwar@local' });
    showToast('Committed: ' + oid.slice(0, 7));
    document.getElementById('git-commit-msg').value = '';
    await refreshGitStatus();
  } catch (e) { showToast(String(e), 'error'); }
}
async function gitPush() {
  if (!currentRepoPath) return;
  const token = sessionStorage.getItem('git-token') || null;
  if (!token) { showToast('Set a token first', 'error'); return; }
  try { await invoke('git_push', { path: currentRepoPath, token }); showToast('Pushed'); }
  catch (e) { showToast(String(e), 'error'); }
}
async function gitPull() {
  if (!currentRepoPath) return;
  const token = sessionStorage.getItem('git-token') || null;
  try { await invoke('git_pull', { path: currentRepoPath, token }); showToast('Pulled'); await refreshGitStatus(); }
  catch (e) { showToast(String(e), 'error'); }
}
async function gitFetch() {
  if (!currentRepoPath) return;
  const token = sessionStorage.getItem('git-token') || null;
  try { await invoke('git_fetch', { path: currentRepoPath, token }); showToast('Fetched'); await refreshGitStatus(); }
  catch (e) { showToast(String(e), 'error'); }
}
async function gitClone() {
  showInputModal('Clone Repository', 'URL:', 'https://github.com/user/repo.git', async (url) => {
    if (!url) return;
    const target = await openDialog({ directory: true, multiple: false });
    if (!target) return;
    const token = sessionStorage.getItem('git-token') || null;
    try { await invoke('git_clone', { url, target, token }); showToast('Cloned to ' + target); await loadFolder(target); }
    catch (e) { showToast(String(e), 'error'); }
  });
}
async function setRemote() {
  if (!currentRepoPath) return;
  let origin = null;
  try { const remotes = await invoke('git_remotes', { path: currentRepoPath }); origin = remotes.find(r => r.name === 'origin'); } catch (_) {}
  showInputModal('Set Remote', 'HTTPS URL for "origin":', origin ? origin.url : 'https://github.com/user/repo.git', async (url) => {
    if (!url) return;
    try { await invoke('git_set_remote', { path: currentRepoPath, url }); showToast('Remote set'); }
    catch (e) { showToast(String(e), 'error'); }
  });
}
async function switchBranch() {
  if (!currentRepoPath) return;
  try {
    const branches = await invoke('git_list_branches', { path: currentRepoPath });
    if (!branches.length) { showToast('No branches', 'info'); return; }
    showChoiceModal('Switch Branch', branches, async (branch) => {
      if (branch === currentBranch) { showToast('Already on ' + branch, 'info'); return; }
      try {
        await invoke('git_checkout', { path: currentRepoPath, branch });
        currentBranch = branch;
        document.getElementById('git-branch-name').textContent = branch;
        await refreshGitStatus();
        showToast('Switched to ' + branch);
      } catch (e) { showToast(String(e), 'error'); }
    });
  } catch (e) { showToast(String(e), 'error'); }
}
function setGitToken() {
  const current = sessionStorage.getItem('git-token') || '';
  showInputModal('GitHub Personal Access Token', 'Stored in sessionStorage only.', current, (val) => {
    if (val) { sessionStorage.setItem('git-token', val); showToast('Token saved'); }
    else { sessionStorage.removeItem('git-token'); showToast('Token removed', 'info'); }
  }, true);
}

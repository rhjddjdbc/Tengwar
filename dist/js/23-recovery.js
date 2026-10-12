"use strict";

/* ═══════════════════════════════════════════════════════════════
   CRASH RECOVERY
   ═══════════════════════════════════════════════════════════════ */
const RECOVERY_KEY = 'tengwar-recovery';
const RECOVERY_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function snapshotForRecovery() {
  if (!activeTabId) return;
  const tab = tabs.get(activeTabId);
  if (!tab) return;
  if (!tab.modified && tab.entry) return;
  try {
    const store = JSON.parse(localStorage.getItem(RECOVERY_KEY) || '{}');
    const key = tab.path || ('untitled-' + tab.id);
    const content = editorTA.value;
    if (store[key] && store[key].content === content) return;
    store[key] = { path: tab.path, name: tab.name, content, timestamp: Date.now() };
    const entries = Object.entries(store)
      .filter(([_, v]) => v && v.timestamp && Date.now() - v.timestamp < RECOVERY_MAX_AGE)
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, 20);
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (e) {}
}
function clearRecoveryFor(path) {
  try {
    const store = JSON.parse(localStorage.getItem(RECOVERY_KEY) || '{}');
    if (store[path]) {
      delete store[path];
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(store));
    }
  } catch (e) {}
}
setInterval(snapshotForRecovery, 5000);
window.addEventListener('beforeunload', snapshotForRecovery);

const recoveryBanner = document.getElementById('recovery-banner');
const rbText = document.getElementById('rb-text');
let recoveryEntries = [];

function showRecoveryBanner(entries) {
  recoveryEntries = entries;
  rbText.textContent = entries.length === 1
    ? `Unsaved changes in "${entries[0].name}"`
    : `${entries.length} files with unsaved changes`;
  recoveryBanner.classList.add('show');
  setTimeout(() => { recoveryBanner.classList.remove('show'); }, 30000);
}
function checkRecoveryOnStart() {
  try {
    const store = JSON.parse(localStorage.getItem(RECOVERY_KEY) || '{}');
    const now = Date.now();
    const entries = Object.values(store).filter(e => e && e.timestamp && (now - e.timestamp) < RECOVERY_MAX_AGE);
    if (entries.length > 0) showRecoveryBanner(entries);
  } catch (e) {}
}
document.getElementById('rb-close').addEventListener('click', () => recoveryBanner.classList.remove('show'));
document.getElementById('rb-dismiss').addEventListener('click', () => {
  try { localStorage.removeItem(RECOVERY_KEY); } catch (e) {}
  recoveryBanner.classList.remove('show');
  showToast('Recovery data cleared', 'info');
});
document.getElementById('rb-view').addEventListener('click', async () => {
  recoveryBanner.classList.remove('show');
  for (const entry of recoveryEntries) {
    const id = createTab({ name: entry.name + ' (recovered)', path: entry.path, content: entry.content });
    const t = tabs.get(id);
    if (t) t.modified = true;
    renderTabsBar();
    await switchToTab(id);
  }
  try { localStorage.removeItem(RECOVERY_KEY); } catch (e) {}
});

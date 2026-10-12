"use strict";

/* ═══════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════ */
async function exportHtml() {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  const tab = tabs.get(activeTabId);
  const name = tab && tab.name ? tab.name.replace(/\.(md|markdown|txt)$/i, '') + '.html' : 'export.html';
  const target = currentRepoPath + '/' + name;
  try {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = preview.innerHTML;
    wrapper.querySelectorAll('.diagram-toolbar').forEach(el => el.remove());
    await invoke('export_html', { html: wrapper.innerHTML, path: target, title: name });
    showToast('Exported: ' + name);
  } catch (e) { showToast(String(e), 'error'); }
}
async function exportPdf() {
  await render(true);
  setTimeout(() => window.print(), 100);
}

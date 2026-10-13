"use strict";

/* ═══════════════════════════════════════════════════════════════
   MULTI-VAULT
   Tracks recently-opened folders in localStorage and exposes a
   dropdown in the sidebar header for switching between them.

   A vault is just a folder path. The name is derived from the last
   path segment. Missing vaults are pruned on failed open.
   ═══════════════════════════════════════════════════════════════ */

const VAULTS_KEY = 'tengwar-vaults';
const MAX_VAULTS = 20;

/* ── Storage ─────────────────────────────────────────────────── */

function loadVaults() {
  try {
    const raw = localStorage.getItem(VAULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(v => v && typeof v.path === 'string' && v.path.length > 0);
  } catch (_) {
    return [];
  }
}

function saveVaults(list) {
  try {
    localStorage.setItem(VAULTS_KEY, JSON.stringify(list.slice(0, MAX_VAULTS)));
  } catch (_) {}
}

function vaultName(path) {
  const cleaned = String(path).replace(/\/+$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || cleaned || 'vault';
}

/* ── Mutations ───────────────────────────────────────────────── */

function recordVault(path) {
  if (!path) return;
  const list = loadVaults();
  const idx = list.findIndex(v => v.path === path);
  if (idx >= 0) {
    list[idx].lastOpened = Date.now();
    const [entry] = list.splice(idx, 1);
    list.unshift(entry);
  } else {
    list.unshift({
      path,
      name: vaultName(path),
      lastOpened: Date.now(),
    });
  }
  saveVaults(list);
  updateVaultButton();
}

function removeVault(path) {
  const list = loadVaults().filter(v => v.path !== path);
  saveVaults(list);
  updateVaultButton();
}

/* ── Button label ────────────────────────────────────────────── */

function updateVaultButton() {
  const label = document.getElementById('vaultBtnLabel');
  if (!label) return;
  if (currentRepoPath) {
    label.textContent = vaultName(currentRepoPath);
    label.title = currentRepoPath;
  } else {
    label.textContent = 'No vault';
    label.title = 'No vault open';
  }
}

/* ── Menu rendering ──────────────────────────────────────────── */

function ensureVaultMenu() {
  let menu = document.getElementById('vault-menu');
  if (menu) return menu;
  menu = document.createElement('div');
  menu.id = 'vault-menu';
  menu.className = 'dropdown-menu vault-menu';
  document.body.appendChild(menu);
  return menu;
}

function positionVaultMenu(anchor, menu) {
  const r = anchor.getBoundingClientRect();
  menu.style.top = (r.bottom + 6) + 'px';
  menu.style.left = r.left + 'px';
  menu.style.right = 'auto';
  menu.style.minWidth = Math.max(260, r.width) + 'px';
  requestAnimationFrame(() => {
    const mw = menu.offsetWidth;
    const vw = window.innerWidth;
    if (r.left + mw > vw - 8) {
      menu.style.left = 'auto';
      menu.style.right = '8px';
    }
  });
}

function closeVaultMenu() {
  const menu = document.getElementById('vault-menu');
  if (menu) menu.classList.remove('show');
}

async function openVaultMenu(anchor) {
  const list = loadVaults();
  const menu = ensureVaultMenu();
  menu.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'vault-menu-empty';
    empty.textContent = 'No recent vaults';
    menu.appendChild(empty);
  } else {
    for (const v of list) {
      const item = document.createElement('button');
      item.className = 'dropdown-item vault-item';
      if (v.path === currentRepoPath) item.classList.add('active');
      item.innerHTML = `
        <span class="dd-check">✓</span>
        <span class="vault-item-body">
          <span class="vault-item-name">${escapeHtml(v.name)}</span>
          <span class="vault-item-path" title="${escapeHtml(v.path)}">${escapeHtml(v.path)}</span>
        </span>
        <span class="vault-item-remove" title="Remove from list" data-remove="${escapeHtml(v.path)}">×</span>
      `;
      item.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-remove]');
        if (removeBtn) {
          e.stopPropagation();
          removeVault(removeBtn.dataset.remove);
          // Re-render menu so the entry disappears immediately.
          openVaultMenu(anchor);
          return;
        }
        closeVaultMenu();
        if (v.path !== currentRepoPath) {
          openVaultByPath(v.path);
        }
      });
      menu.appendChild(item);
    }

    const sep = document.createElement('div');
    sep.className = 'dropdown-sep';
    menu.appendChild(sep);
  }

  const openItem = document.createElement('button');
  openItem.className = 'dropdown-item';
  openItem.innerHTML = `
    <span class="dd-check"></span>
    <span class="dd-icon"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
    Open Folder…
  `;
  openItem.addEventListener('click', () => {
    closeVaultMenu();
    openFolder();
  });
  menu.appendChild(openItem);

  positionVaultMenu(anchor, menu);
  menu.classList.add('show');
}

/* ── Vault opening ───────────────────────────────────────────── */

async function openVaultByPath(path) {
  const ok = await loadFolder(path);
  if (ok) {
    try { await invoke('start_watching', { path }); } catch (_) {}
    recordVault(path);
  } else {
    showToast('Vault unavailable — removed from list', 'error');
    removeVault(path);
  }
}

/* ── Wiring ──────────────────────────────────────────────────── */

(function wireVaultButton() {
  const btn = document.getElementById('vaultBtn');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('vault-menu');
    const isOpen = menu && menu.classList.contains('show');
    if (isOpen) closeVaultMenu();
    else openVaultMenu(btn);
  });
})();

document.addEventListener('click', (e) => {
  if (!e.target.closest('#vault-menu') && !e.target.closest('#vaultBtn')) {
    closeVaultMenu();
  }
});
document.addEventListener('scroll', closeVaultMenu, true);
window.addEventListener('blur', closeVaultMenu);
window.addEventListener('resize', closeVaultMenu);

// Initial state — will be a no-op if currentRepoPath is null.
updateVaultButton();
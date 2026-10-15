"use strict";

/* ═══════════════════════════════════════════════════════════════
   TEMPLATES + DAILY NOTES

   Templates come from two places:

     1. <vault>/templates/*.template  — automatic, no setup required
     2. A single global folder        — set in Settings → Templates & journal
                                        (regular .md/.markdown/.txt files)

   When the same display name appears in both, the vault-local one
   wins. The merge is keyed on the *stem* (filename without extension),
   not the full name — otherwise `meeting.template` and `meeting.md`
   would never collide, and the vault-local override would never fire.

   Daily notes live in a single global journal folder, set once in
   Settings. The same folder is used across every vault.

   Nothing is enabled until the user picks a path.
   ═══════════════════════════════════════════════════════════════ */

const TEMPLATES_GLOBAL_KEY = 'tengwar-templates-global';
const JOURNAL_PATH_KEY = 'tengwar-journal-path';
const VAULT_TEMPLATES_DIR = 'templates/';

let _templatesCache = [];   // [{ name, path, source: 'vault'|'global', displayName }]

/* ── Storage ────────────────────────────────────────────────── */

function loadGlobalTemplatesPath() {
  return localStorage.getItem(TEMPLATES_GLOBAL_KEY) || '';
}
function saveGlobalTemplatesPath(path) {
  if (path) localStorage.setItem(TEMPLATES_GLOBAL_KEY, path);
  else localStorage.removeItem(TEMPLATES_GLOBAL_KEY);
}
function loadJournalPath() {
  return localStorage.getItem(JOURNAL_PATH_KEY) || '';
}
function saveJournalPath(path) {
  if (path) localStorage.setItem(JOURNAL_PATH_KEY, path);
  else localStorage.removeItem(JOURNAL_PATH_KEY);
}

/* ── Placeholders ───────────────────────────────────────────── */

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowHM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function applyPlaceholders(text, vars) {
  return text
    .replace(/\{\{title\}\}/g, vars.title || '')
    .replace(/\{\{date\}\}/g, vars.date || todayISO())
    .replace(/\{\{time\}\}/g, vars.time || nowHM())
    .replace(/\{\{filename\}\}/g, vars.filename || '');
}

function slugify(s) {
  return String(s)
    .trim()
    .replace(/[^\w\u00C0-\uFFFF\- ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

/* ── Vault templates folder — auto-created on vault open ───── */

/**
 * Make sure `<vault>/templates/` exists. `create_dir` on the Rust
 * side calls `create_dir_all`, which is idempotent — running this
 * on every vault open is safe and cheap.
 *
 * Called from the `loadFolder` hook below. Any error (permissions,
 * read-only vault) is swallowed — the templates feature just stays
 * empty in that case, and the user can still create a note.
 */
async function ensureVaultTemplatesDir(root) {
  if (!root) return;
  try {
    await invoke('create_dir', { path: root + '/templates' });
  } catch (_) {
    /* silent — see comment above */
  }
}

/* ── Template discovery ─────────────────────────────────────── */

function getVaultTemplates() {
  if (!Array.isArray(allFiles)) return [];
  return allFiles.filter(f => {
    if (!f.path.startsWith(VAULT_TEMPLATES_DIR)) return false;
    const rest = f.path.slice(VAULT_TEMPLATES_DIR.length);
    if (rest.includes('/')) return false;
    return /\.template$/i.test(f.path);
  }).map(f => ({
    name: f.name,
    path: f.path,
    source: 'vault',
    entry: f,
  }));
}

async function getGlobalTemplates() {
  const dir = loadGlobalTemplatesPath();
  if (!dir) return [];
  try {
    const files = await invoke('list_md_files_abs', { root: dir });
    return files.map(f => ({
      name: f.name,
      path: f.path,
      source: 'global',
    }));
  } catch (e) {
    console.warn('global template list failed:', e);
    return [];
  }
}

/**
 * Merge vault-local and global template lists. Collision is decided
 * on the stem (filename without extension), so `meeting.template`
 * (vault) correctly overrides `meeting.md` (global).
 */
async function refreshTemplatesCache() {
  const vault = getVaultTemplates();
  const glob = await getGlobalTemplates();

  const stripExt = (n) => n.replace(/\.(template|md|markdown|txt)$/i, '');

  const byStem = new Map();
  for (const t of glob)  byStem.set(stripExt(t.name).toLowerCase(), t);
  for (const t of vault) byStem.set(stripExt(t.name).toLowerCase(), t); // overwrite

  _templatesCache = Array.from(byStem.values()).map(t => ({
    ...t,
    displayName: stripExt(t.name),
  }));
  _templatesCache.sort((a, b) => a.displayName.localeCompare(b.displayName));
  refreshTemplateCommands();
}

/* ── New from template ─────────────────────────────────────── */

async function readTemplateContent(template) {
  if (template.source === 'vault' && template.entry) {
    return await template.entry.getText();
  }
  return await invoke('read_text_file_abs', { path: template.path });
}

async function newFromTemplate(template) {
  if (!currentRepoPath) {
    showToast('Open a folder first', 'error');
    return;
  }

  showInputModal(
    'New from template: ' + template.displayName,
    'Title for the new note:',
    'Untitled',
    async (title) => {
      if (title == null) return;
      const trimmed = String(title).trim() || 'Untitled';
      const filename = slugify(trimmed) + '.md';
      const relPath = filename;
      const absPath = currentRepoPath + '/' + relPath;

      if (allFiles.some(f => f.path === relPath)) {
        if (!confirm(`"${filename}" already exists. Overwrite?`)) return;
      }

      let raw = '';
      try {
        raw = await readTemplateContent(template);
      } catch (e) {
        showToast('Could not read template: ' + e, 'error');
        return;
      }

      const content = applyPlaceholders(raw, {
        title: trimmed,
        date: todayISO(),
        time: nowHM(),
        filename,
      });

      try {
        await invoke('write_text_file', { path: absPath, content });
        await loadFolder(currentRepoPath);
        const entry = allFiles.find(f => f.path === relPath);
        if (entry) {
          await openFileEntry(entry);
          showToast('Created ' + filename);
        }
      } catch (e) {
        showToast('Create failed: ' + e, 'error');
      }
    }
  );
}

/* ── Daily notes (global journal folder) ───────────────────── */

async function openDailyNote() {
  if (!currentRepoPath) {
    showToast('Open a folder first', 'error');
    return;
  }
  const journalPath = loadJournalPath();
  if (!journalPath) {
    showToast('Set a journal folder in Settings first', 'error');
    return;
  }

  const date = todayISO();
  const filename = date + '.md';
  const absPath = journalPath + '/' + filename;

  // Already open in a tab?
  for (const [id, tab] of tabs) {
    if (tab.path === absPath) {
      await switchToTab(id);
      return;
    }
  }

  // Does the file already exist?
  let exists = false;
  try {
    await invoke('read_text_file_abs', { path: absPath });
    exists = true;
  } catch (_) {
    exists = false;
  }

  if (!exists) {
    let content = `# ${date}\n\n`;
    // Prefer a daily template — vault-local first, then global.
    const daily = _templatesCache.find(t =>
      /^daily$/i.test(t.displayName)
    );
    if (daily) {
      try {
        const raw = await readTemplateContent(daily);
        content = applyPlaceholders(raw, {
          title: date,
          date,
          time: nowHM(),
          filename,
        });
      } catch (e) {
        console.warn('daily template read failed:', e);
      }
    }
    try {
      await invoke('write_text_file_abs', { path: absPath, content });
    } catch (e) {
      showToast('Could not create daily note: ' + e, 'error');
      return;
    }
  }

  // Journal files live outside the vault, so they're not in allFiles.
  // Build a virtual entry.
  const entry = {
    name: filename,
    path: absPath,
    getText: () => invoke('read_text_file_abs', { path: absPath }),
    saveText: (text) => invoke('write_text_file_abs', { path: absPath, content: text }),
  };
  await openFileEntry(entry);
}

/* ── Command palette ───────────────────────────────────────── */

function refreshTemplateCommands() {
  if (typeof COMMANDS === 'undefined' || !Array.isArray(COMMANDS)) return;

  for (let i = COMMANDS.length - 1; i >= 0; i--) {
    if (COMMANDS[i]._dynamic) COMMANDS.splice(i, 1);
  }

  if (loadJournalPath()) {
    COMMANDS.push({
      cat: 'File',
      name: "Today's note",
      action: () => openDailyNote(),
      _dynamic: true,
    });
  }

  for (const t of _templatesCache) {
    COMMANDS.push({
      cat: 'Template',
      name: 'New from ' + t.displayName,
      action: () => newFromTemplate(t),
      _dynamic: true,
    });
  }
}

/* ── Settings modal ────────────────────────────────────────── */

function openTemplatesSettings() {
  const content = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!content || !overlay) return;

  const vaultTplPath = currentRepoPath
    ? currentRepoPath + '/templates/'
    : '';

  const render = () => {
    const g = loadGlobalTemplatesPath();
    const j = loadJournalPath();
    content.innerHTML = `
      <h3>Templates &amp; journal</h3>
      <p style="font-size:12px;color:var(--fg-2);margin-bottom:16px;line-height:1.55;">
        Journal is global — one folder, used across all vaults.
        Templates can come from two places: a global folder here
        (regular <code>.md</code> files), plus a vault-local
        <code>templates/</code> folder that's picked up automatically.
        Vault templates use the <code>.template</code> extension. On a
        name collision the vault-local one wins.
      </p>

      <div class="feature-path-row">
        <label class="feature-path-label">Templates folder (global)</label>
        <div class="feature-path-value">
          ${g ? escapeHtml(g) : '<span class="muted">not set</span>'}
        </div>
        <div class="feature-path-actions">
          <button class="te-btn" id="tpl-choose">Choose…</button>
          <button class="te-btn" id="tpl-clear">Clear</button>
        </div>
        ${vaultTplPath ? `<div class="feature-path-hint">Vault-local templates are also read from <code>${escapeHtml(vaultTplPath)}</code> (*.template).</div>` : ''}
      </div>

      <div class="feature-path-row">
        <label class="feature-path-label">Journal folder</label>
        <div class="feature-path-value">
          ${j ? escapeHtml(j) : '<span class="muted">not set</span>'}
        </div>
        <div class="feature-path-actions">
          <button class="te-btn" id="jrn-choose">Choose…</button>
          <button class="te-btn" id="jrn-clear">Clear</button>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-primary" id="feat-close">Close</button>
      </div>
    `;

    document.getElementById('tpl-choose').addEventListener('click', async () => {
      const dir = await openDialog({ directory: true, multiple: false });
      if (!dir) return;
      saveGlobalTemplatesPath(dir);
      await refreshTemplatesCache();
      render();
    });
    document.getElementById('tpl-clear').addEventListener('click', async () => {
      saveGlobalTemplatesPath('');
      await refreshTemplatesCache();
      render();
    });
    document.getElementById('jrn-choose').addEventListener('click', async () => {
      const dir = await openDialog({ directory: true, multiple: false });
      if (!dir) return;
      saveJournalPath(dir);
      refreshTemplateCommands();
      render();
    });
    document.getElementById('jrn-clear').addEventListener('click', async () => {
      saveJournalPath('');
      refreshTemplateCommands();
      render();
    });
    document.getElementById('feat-close').addEventListener('click', close);
  };

  const close = () => overlay.classList.remove('show');
  overlay.addEventListener('mousedown', function once(e) {
    if (e.target === overlay) close();
    overlay.removeEventListener('mousedown', once);
  });

  overlay.classList.add('show');
  render();
}

/* ── Hooks ─────────────────────────────────────────────────── */

/**
 * Wrap `loadFolder` so opening a vault:
 *   1. ensures `<vault>/templates/` exists
 *   2. rebuilds the template cache
 *
 * The wrapper is installed after 34/35/36/38 have wrapped
 * `loadFolder`, so its post-code runs last — the templates folder
 * is created before we scan for templates, and any subsequent
 * wrapper (if one is added later) still sees the updated
 * `allFiles`.
 */
(function installTemplateHooks() {
  if (typeof window.loadFolder !== 'function') return;
  const orig = window.loadFolder;
  window.loadFolder = async function (dir) {
    const r = await orig.call(this, dir);
    if (r && currentRepoPath) {
      await ensureVaultTemplatesDir(currentRepoPath);
    }
    await refreshTemplatesCache();
    return r;
  };
})();

setTimeout(refreshTemplatesCache, 600);
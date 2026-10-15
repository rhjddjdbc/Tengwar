"use strict";

/* ═══════════════════════════════════════════════════════════════
   OUTLINE — table of contents for the active file

   Parses the current editor text for ATX headings (# / ## / ...),
   renders a hierarchical list, and on click:
     1. scrolls the preview to the corresponding rendered heading
     2. moves the editor cursor to the heading's line

   The mapping between source heading N and preview heading N works
   because both walk the document in the same order and skip the same
   cases (headings inside code fences are not counted in either path).
   ═══════════════════════════════════════════════════════════════ */

// Default: collapsed. Only Files is expanded at first launch.
let outlineCollapsed =
  localStorage.getItem('tengwar-outline-collapsed') !== 'false';
let _outlineTimer = null;

function applyOutlineCollapsed() {
  const panel = document.getElementById('outline-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed', outlineCollapsed);
}

function toggleOutlinePanel() {
  outlineCollapsed = !outlineCollapsed;
  localStorage.setItem(
    'tengwar-outline-collapsed',
    outlineCollapsed ? 'true' : 'false'
  );
  applyOutlineCollapsed();
}

/* ── Parsing ─────────────────────────────────────────────────── */

/**
 * Scan `text` for ATX headings. Returns a flat list in document
 * order: [{ level, text, line, index }].
 *
 * `index` is the zero-based position of this heading among all
 * source headings — used later to pick the matching rendered <hN>
 * out of the preview pane.
 *
 * Skips:
 *   - headings inside fenced code blocks (``` or ~~~)
 *   - lines starting with `#` that have no following space
 *     (those are tags in our syntax, e.g. `#urgent`)
 */
function parseOutline(text) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  let fenceChar = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Fence toggles
    if (!inFence && (trimmed.startsWith('```') || trimmed.startsWith('~~~'))) {
      inFence = true;
      fenceChar = trimmed[0];
      continue;
    }
    if (inFence) {
      if (trimmed.startsWith(fenceChar.repeat(3))) {
        inFence = false;
        fenceChar = '';
      }
      continue;
    }

    // ATX heading: up to 3 leading spaces, 1–6 #, then space
    const m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;

    const level = m[1].length;
    const textRaw = m[2].trim();
    if (!textRaw) continue;

    out.push({ level, text: textRaw, line: i + 1, index: out.length });
  }
  return out;
}

/* ── Rendering ───────────────────────────────────────────────── */

function renderOutline() {
  const list = document.getElementById('outline-list');
  const count = document.getElementById('outline-count');
  if (!list || !count) return;

  if (!activeTabId) {
    list.innerHTML = '<div class="outline-empty">No file open.</div>';
    count.textContent = '0';
    return;
  }

  const text = editorTA.value;
  const headings = parseOutline(text);
  count.textContent = String(headings.length);

  if (headings.length === 0) {
    list.innerHTML = '<div class="outline-empty">No headings.</div>';
    return;
  }

  // Find the shallowest heading level actually used, so shallow docs
  // don't get extra indentation.
  let minLevel = 6;
  for (const h of headings) if (h.level < minLevel) minLevel = h.level;

  list.innerHTML = '';
  for (const h of headings) {
    const indent = (h.level - minLevel) * 12;
    const el = document.createElement('button');
    el.className = 'outline-item outline-level-' + h.level;
    el.style.paddingLeft = (8 + indent) + 'px';
    el.title = `Ln ${h.line}: ${h.text}`;
    el.innerHTML = `<span class="ol-text">${escapeHtml(h.text)}</span>`;
    el.addEventListener('click', () => jumpToHeading(h));
    list.appendChild(el);
  }
}

/* ── Jump to heading ─────────────────────────────────────────── */

async function jumpToHeading(heading) {
  // 1. Scroll the preview to the matching rendered heading.
  //    Only meaningful when the preview is visible and rendered.
  if (!blockModeEnabled && preview) {
    const rendered = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const target = rendered[heading.index];
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  // 2. Move the editor cursor and scroll the editor to the line.
  //    This works in both modes; in block mode it's the only visible
  //    feedback since the preview is hidden.
  await vimQueue;
  try {
    const snap = await invoke('vim_go_to_line', { line: heading.line });
    applySnapshot(snap);
    updateHighlight();
    const lh = parseFloat(getComputedStyle(editorTA).lineHeight) || 23;
    editorTA.scrollTop = Math.max(0, (heading.line - 5) * lh);
    editorTA.focus();
  } catch (e) {
    console.warn('outline jump failed', e);
  }
}

/* ── Auto-refresh (debounced) ───────────────────────────────── */

function scheduleOutlineRefresh() {
  clearTimeout(_outlineTimer);
  _outlineTimer = setTimeout(renderOutline, 250);
}

/* ── Wiring ──────────────────────────────────────────────────── */

(function wireOutlineHeader() {
  const toggle = document.getElementById('outline-toggle');
  if (toggle) toggle.addEventListener('click', toggleOutlinePanel);
  applyOutlineCollapsed();
})();

// Refresh on every keystroke (debounced)
editorTA.addEventListener('input', scheduleOutlineRefresh);

// Immediate refresh on tab switch and file load
(function installOutlineHooks() {
  if (typeof window.switchToTab === 'function') {
    const orig = window.switchToTab;
    window.switchToTab = async function (id) {
      const r = await orig.call(this, id);
      renderOutline();
      return r;
    };
  }
  if (typeof window.loadFolder === 'function') {
    const orig = window.loadFolder;
    window.loadFolder = async function () {
      const r = await orig.apply(this, arguments);
      renderOutline();
      return r;
    };
  }
})();
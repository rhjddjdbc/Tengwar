"use strict";

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR SECTIONS — generic collapsible panels + live badges
   ═══════════════════════════════════════════════════════════════ */

/* ── Collapse/expand ─────────────────────────────────────────── */

(function installSectionToggles() {
  document.querySelectorAll('[data-section-toggle]').forEach(header => {
    const id = header.dataset.sectionToggle;
    const section = document.getElementById(id);
    if (!section) return;

    // Default state: collapsed if the section opts in with
    // data-default-collapsed="true", otherwise expanded.
    const defaultCollapsed = section.dataset.defaultCollapsed === 'true';

    const key = 'tengwar-collapsed-' + id;
    const stored = localStorage.getItem(key);
    const isCollapsed = (stored === null) ? defaultCollapsed : stored === 'true';
    section.classList.toggle('collapsed', isCollapsed);

    header.addEventListener('click', () => {
      const now = section.classList.toggle('collapsed');
      localStorage.setItem(key, now ? 'true' : 'false');
    });
  });
})();

/* ── Git badge — mirrors #git-branch-name ───────────────────── */

(function wireGitBadge() {
  const badge = document.getElementById('git-section-badge');
  const branchEl = document.getElementById('git-branch-name');
  if (!badge || !branchEl) return;

  const sync = () => {
    badge.textContent = branchEl.textContent || 'no repo';
  };
  sync();

  new MutationObserver(sync).observe(branchEl, {
    childList: true,
    characterData: true,
    subtree: true,
  });
})();

/* ── Files badge — count of allFiles after every loadFolder ─── */

(function wireFilesBadge() {
  const badge = document.getElementById('files-section-badge');
  if (!badge) return;

  // `allFiles` is a `let` binding in 01-core.js. It lives in the
  // shared global lexical scope, NOT on `window` — so we must read
  // it as a bare identifier, not as `window.allFiles`.
  const update = () => {
    if (Array.isArray(allFiles)) {
      badge.textContent = String(allFiles.length);
    }
  };

  // Initial value: 30-init.js may still be running its async chain
  // when this script loads, so we defer one tick. If the session
  // restore is still going, the loadFolder wrapper below catches it.
  update();
  setTimeout(update, 400);

  if (typeof window.loadFolder === 'function') {
    const orig = window.loadFolder;
    window.loadFolder = async function () {
      const r = await orig.apply(this, arguments);
      update();
      return r;
    };
  }
})();
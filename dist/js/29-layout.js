"use strict";

/* ═══════════════════════════════════════════════════════════════
   TILING LAYOUT
   ═══════════════════════════════════════════════════════════════ */
(function installTiling() {
  const body = document.body;
  const panes = document.getElementById('panes');
  const editorPane = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  const sidebarResizer = document.getElementById('sidebarResizer');
  const panesResizer = document.getElementById('panesResizer');
  const STORAGE_KEY = 'tengwar-tiling-v2';
  const DEFAULTS = { sidebarWidth: 280, splitRatio: 0.5, direction: 'horizontal', focused: null, swapped: false };
  const LIMITS = { sidebarMin: 180, sidebarMax: 700, splitMin: 0.1, splitMax: 0.9 };

  // ── Load + validate ────────────────────────────────────────
  // Any field that's missing, wrong-typed, or out of range is silently
  // replaced by the default. Prevents a corrupted localStorage value
  // (e.g. a frozen mid-drag sidebar width) from wrecking the layout.
  const layout = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (typeof raw.sidebarWidth === 'number' &&
        raw.sidebarWidth >= LIMITS.sidebarMin &&
        raw.sidebarWidth <= LIMITS.sidebarMax) {
      layout.sidebarWidth = raw.sidebarWidth;
    }
    if (typeof raw.splitRatio === 'number' &&
        raw.splitRatio >= LIMITS.splitMin &&
        raw.splitRatio <= LIMITS.splitMax) {
      layout.splitRatio = raw.splitRatio;
    }
    if (raw.direction === 'horizontal' || raw.direction === 'vertical') {
      layout.direction = raw.direction;
    }
    if (typeof raw.swapped === 'boolean') {
      layout.swapped = raw.swapped;
    }
    if (raw.focused === null || raw.focused === 'editor' || raw.focused === 'preview') {
      layout.focused = raw.focused;
    }
  } catch (_) { /* fall back to defaults on bad JSON */ }

  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch (_) {}
  };

  // Clamp helpers — used by both apply() and the drag handlers so an
  // out-of-range value can never reach the DOM.
  const clampW = (w) => Math.max(LIMITS.sidebarMin, Math.min(LIMITS.sidebarMax, w || DEFAULTS.sidebarWidth));
  const clampR = (r) => Math.max(LIMITS.splitMin, Math.min(LIMITS.splitMax, r || DEFAULTS.splitRatio));

  function apply() {
    const w = clampW(layout.sidebarWidth);
    const r = clampR(layout.splitRatio);

    body.style.setProperty('--sidebar-width', w + 'px');

    const isV = layout.direction === 'vertical';
    panes.classList.toggle('vertical', isV);
    panesResizer.classList.toggle('col-resizer', !isV);
    panesResizer.classList.toggle('row-resizer', isV);
    editorPane.style.order = layout.swapped ? 3 : 1;
    panesResizer.style.order = 2;
    previewPane.style.order = layout.swapped ? 1 : 3;

    const f = layout.focused;
    if (f === 'editor' || f === 'preview') {
      editorPane.style.display = f === 'editor' ? '' : 'none';
      previewPane.style.display = f === 'preview' ? '' : 'none';
      panesResizer.style.display = 'none';
      panes.style.gridTemplateColumns = '1fr';
      panes.style.gridTemplateRows = '1fr';
    } else {
      editorPane.style.display = '';
      previewPane.style.display = '';
      panesResizer.style.display = '';
      const pct = (r * 100) + '%';
      if (isV) {
        panes.style.gridTemplateColumns = '1fr';
        panes.style.gridTemplateRows = pct + ' 6px 1fr';
      } else {
        panes.style.gridTemplateRows = '1fr';
        panes.style.gridTemplateColumns = pct + ' 6px 1fr';
      }
    }
  }

  function makeDraggable(handle, getAxis, getStart, onDrag, onReset) {
    let dragging = false, sx = 0, sy = 0, state = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true; sx = e.clientX; sy = e.clientY;
      state = getStart();
      handle.classList.add('dragging');
      body.classList.add('tile-dragging');
      if (getAxis() === 'y') body.classList.add('vertical-drag');
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      onDrag({ dx: e.clientX - sx, dy: e.clientY - sy, state });
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      body.classList.remove('tile-dragging', 'vertical-drag');
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      // Persist only clamped values
      layout.sidebarWidth = clampW(layout.sidebarWidth);
      layout.splitRatio   = clampR(layout.splitRatio);
      save();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('dblclick', () => { onReset(); apply(); save(); });
  }

  makeDraggable(sidebarResizer, () => 'x',
    () => ({ w: layout.sidebarWidth }),
    ({ dx, state }) => {
      layout.sidebarWidth = clampW(state.w + dx);
      apply();
    },
    () => { layout.sidebarWidth = DEFAULTS.sidebarWidth; });

  makeDraggable(panesResizer,
    () => layout.direction === 'vertical' ? 'y' : 'x',
    () => {
      const r = panes.getBoundingClientRect();
      return {
        ratio: layout.splitRatio,
        size: layout.direction === 'vertical' ? r.height : r.width,
      };
    },
    ({ dx, dy, state }) => {
      const d = layout.direction === 'vertical' ? dy : dx;
      if (state.size <= 0) return;
      layout.splitRatio = clampR(state.ratio + d / state.size);
      apply();
    },
    () => { layout.splitRatio = DEFAULTS.splitRatio; });

  window.__layout = {
    toggleDirection() {
      layout.direction = layout.direction === 'horizontal' ? 'vertical' : 'horizontal';
      layout.focused = null;
      apply(); save();
    },
    swapPanes() {
      layout.swapped = !layout.swapped;
      apply(); save();
    },
    focusEditor() {
      layout.focused = layout.focused === 'editor' ? null : 'editor';
      apply(); save();
    },
    focusPreview() {
      layout.focused = layout.focused === 'preview' ? null : 'preview';
      apply(); save();
    },
    reset() {
      layout.sidebarWidth = DEFAULTS.sidebarWidth;
      layout.splitRatio   = DEFAULTS.splitRatio;
      layout.direction    = DEFAULTS.direction;
      layout.focused      = DEFAULTS.focused;
      layout.swapped      = DEFAULTS.swapped;
      apply(); save();
    },
  };

  apply();
})();
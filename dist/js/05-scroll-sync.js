"use strict";

/* ═══════════════════════════════════════════════════════════════
   SCROLL SYNC — origin tracking
   ═══════════════════════════════════════════════════════════════ */

// Defensive shim: syncEditorScroll() lives in 02-highlight.js and is
// normally defined before this file loads. If the load order ever
// changes (or 02-highlight fails to load), calling it from the scroll
// listener would throw ReferenceError on every scroll event. This
// no-op fallback keeps the listener silent until the real one is
// available.
if (typeof window.syncEditorScroll !== 'function') {
  window.syncEditorScroll = function () { /* no-op until 02-highlight loads */ };
}

let syncingFrom = null;
let syncingResetTimer = null;

function resetScrollOrigin() {
  syncingFrom = null;
  clearTimeout(syncingResetTimer);
  syncingResetTimer = null;
}

function syncEditorToPreview() {
  if (!scrollSyncEnabled) return;
  if (syncingFrom === 'preview') return;
  syncingFrom = 'editor';
  clearTimeout(syncingResetTimer);
  syncingResetTimer = setTimeout(resetScrollOrigin, 120);

  const maxE = editorTA.scrollHeight - editorTA.clientHeight;
  const maxP = preview.scrollHeight - preview.clientHeight;
  if (maxE <= 0 || maxP <= 0) return;
  const ratio = editorTA.scrollTop / maxE;
  preview.scrollTop = ratio * maxP;
}

function syncPreviewToEditor() {
  if (!scrollSyncEnabled) return;
  if (syncingFrom === 'editor') return;
  syncingFrom = 'preview';
  clearTimeout(syncingResetTimer);
  syncingResetTimer = setTimeout(resetScrollOrigin, 120);

  const maxE = editorTA.scrollHeight - editorTA.clientHeight;
  const maxP = preview.scrollHeight - preview.clientHeight;
  if (maxE <= 0 || maxP <= 0) return;
  const ratio = preview.scrollTop / maxP;
  editorTA.scrollTop = ratio * maxE;
}

editorTA.addEventListener('scroll', () => {
  // Calls the real function once 02-highlight.js has run, or the
  // no-op shim before that.
  window.syncEditorScroll();
  syncEditorToPreview();
});
preview.addEventListener('scroll', syncPreviewToEditor);
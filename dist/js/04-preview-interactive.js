"use strict";

/* ═══════════════════════════════════════════════════════════════
   CLICKABLE TASKS + WIKILINKS
   ═══════════════════════════════════════════════════════════════ */
function makeInteractive() {
  const checkboxes = preview.querySelectorAll('li.task-list-item input[type="checkbox"]');
  checkboxes.forEach((cb, idx) => {
    cb.removeAttribute('disabled');
    cb.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTaskInSource(idx);
    });
  });

  const wikiLinks = preview.querySelectorAll('a[href^="wiki:"]');
  wikiLinks.forEach(a => {
    const target = a.getAttribute('href').slice(5);
    const found = resolveWikiTarget(target);
    if (found) {
      a.classList.remove('broken');
      a.title = 'Open ' + found.path;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openFileEntry(found);
      });
    } else {
      a.classList.add('broken');
      a.title = 'File not found: ' + target;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('File not found: ' + target, 'error');
      });
    }
  });
}

function toggleTaskInSource(index) {
  const text = editorTA.value;
  const lines = text.split('\n');

  // Matches a task-list item at the start of a line, with optional
  // blockquote prefix (`> `), indentation, and both unordered (-, *, +)
  // and ordered (1., 2., ...) list markers. This is the same set of
  // items pulldown-cmark renders as task list items, so the DOM order
  // matches the source order.
  const taskRegex = /^([\s>]*(?:[-*+]|\d+\.)\s+)\[([ xX])\]/;

  let taskCount = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(taskRegex);
    if (!m) continue;
    taskCount++;
    if (taskCount !== index) continue;

    const isChecked = m[2].toLowerCase() === 'x';
    const newMark = isChecked ? ' ' : 'x';
    // Only swap the [x]/[ ] marker, preserve everything else.
    lines[i] = lines[i].replace(taskRegex, `$1[${newMark}]`);

    const selS = editorTA.selectionStart;
    const selE = editorTA.selectionEnd;
    const st = editorTA.scrollTop;
    editorTA.value = lines.join('\n');
    editorTA.setSelectionRange(selS, selE);
    editorTA.scrollTop = st;
    updateHighlight();
    syncTextToBackend();
    markTabModified();
    debouncedRender();
    scheduleAutoSave();
    return;
  }
}

function resolveWikiTarget(target) {
  const t = target.toLowerCase();
  let f = allFiles.find(x => x.path.toLowerCase() === t);
  if (f) return f;
  f = allFiles.find(x => {
    const stem = x.name.replace(/\.(md|markdown|txt)$/i, '').toLowerCase();
    return stem === t;
  });
  if (f) return f;
  f = allFiles.find(x => {
    const stem = x.path.replace(/\.(md|markdown|txt)$/i, '').toLowerCase();
    return stem === t;
  });
  if (f) return f;
  f = allFiles.find(x => x.path.toLowerCase().endsWith('/' + t) || x.path.toLowerCase().endsWith('/' + t + '.md'));
  return f || null;
}
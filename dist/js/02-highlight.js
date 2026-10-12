"use strict";

/* ═══════════════════════════════════════════════════════════════
   SYNTAX HIGHLIGHTING (editor overlay)
   ═══════════════════════════════════════════════════════════════ */
let _lastHighlightedText = null;
let _scrollRaf = null;

function inlineTokens(raw) {
  let s = escapeHtml(raw);
  const codeSlots = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, inner) => {
    const idx = codeSlots.length;
    codeSlots.push('<span class="tok-code">`' + inner + '`</span>');
    return '\uE000' + idx + '\uE001';
  });
  s = s.replace(/!\[([^\]]*)\]\(([^)]*)\)/g,
    (_m, alt, url) => '<span class="tok-link-text">![' + alt + ']</span><span class="tok-link-url">(' + url + ')</span>');
  s = s.replace(/\[([^\[\]\n]+)\]\(([^)\n]+)\)/g,
    (_m, txt, url) => '<span class="tok-link-text">[' + txt + ']</span><span class="tok-link-url">(' + url + ')</span>');
  s = s.replace(/\[\[([^\]\n]+)\]\]/g,
    (_m, inner) => '<span class="tok-wikilink">[[' + inner + ']]</span>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, (_m, t) => '<span class="tok-bold">**' + t + '**</span>');
  s = s.replace(/__([^_\n]+)__/g,       (_m, t) => '<span class="tok-bold">__' + t + '__</span>');
  s = s.replace(/~~([^~\n]+)~~/g, (_m, t) => '<span class="tok-strike">~~' + t + '~~</span>');
  s = s.replace(/(^|[^*_])\*([^*\n]+)\*(?!\*)/g, (_m, pre, t) => pre + '<span class="tok-italic">*' + t + '*</span>');
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g,     (_m, pre, t) => pre + '<span class="tok-italic">_' + t + '_</span>');
  s = s.replace(/\uE000(\d+)\uE001/g, (_m, i) => codeSlots[+i]);
  return s;
}

function highlightLine(line) {
  const headingMatch = line.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
  if (headingMatch) {
    return headingMatch[1]
      + '<span class="tok-marker">' + headingMatch[2] + '</span>'
      + escapeHtml(headingMatch[3])
      + '<span class="tok-heading">' + inlineTokens(headingMatch[4]) + '</span>';
  }
  const bqMatch = line.match(/^(\s*)((?:>\s?)+)(.*)$/);
  if (bqMatch) {
    return bqMatch[1]
      + '<span class="tok-marker">' + escapeHtml(bqMatch[2]) + '</span>'
      + '<span class="tok-blockquote">' + inlineTokens(bqMatch[3]) + '</span>';
  }
  const taskMatch = line.match(/^(\s*)([-*+])(\s+)(\[[ xX]\])(\s+)(.*)$/);
  if (taskMatch) {
    const checked = /\[[xX]\]/.test(taskMatch[4]);
    const cb = checked
      ? '<span class="tok-task-checked">'   + escapeHtml(taskMatch[4]) + '</span>'
      : '<span class="tok-task-unchecked">' + escapeHtml(taskMatch[4]) + '</span>';
    const rest = checked
      ? '<span class="tok-task-done">' + inlineTokens(taskMatch[6]) + '</span>'
      : inlineTokens(taskMatch[6]);
    return taskMatch[1]
      + '<span class="tok-marker">' + escapeHtml(taskMatch[2] + taskMatch[3]) + '</span>'
      + cb
      + escapeHtml(taskMatch[5])
      + rest;
  }
  const listMatch = line.match(/^(\s*)([-*+]|\d+\.)(\s+)(.*)$/);
  if (listMatch) {
    return listMatch[1]
      + '<span class="tok-marker">' + escapeHtml(listMatch[2]) + '</span>'
      + escapeHtml(listMatch[3])
      + inlineTokens(listMatch[4]);
  }
  if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
    return '<span class="tok-marker">' + escapeHtml(line) + '</span>';
  }
  return inlineTokens(line);
}

function highlightMarkdown(text) {
  const lines = text.split('\n');
  let inCode = false;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let html;
    const fenceMatch = line.match(/^(\s*)(```|~~~)(.*)$/);
    if (fenceMatch) {
      inCode = !inCode;
      html = '<span class="tok-fence">' + escapeHtml(line) + '</span>';
    } else if (inCode) {
      html = '<span class="tok-code-block">' + escapeHtml(line) + '</span>';
    } else {
      html = highlightLine(line);
    }
    out.push(html);
    if (i < lines.length - 1) out.push('\n');
  }
  return out.join('');
}

function updateHighlight() {
  const text = editorTA.value;
  if (text === _lastHighlightedText) {
    syncEditorScroll();
    return;
  }
  _lastHighlightedText = text;
  editorHighlightCode.innerHTML = highlightMarkdown(text);
  syncEditorScroll();
}

function syncEditorScroll() {
  if (_scrollRaf) return;
  _scrollRaf = requestAnimationFrame(() => {
    _scrollRaf = null;
    editorHighlightCode.style.transform = `translate(0, ${-editorTA.scrollTop}px)`;
  });
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════ */
function updateStatusbar() {
  const text = editorTA.value;
  const pos = editorTA.selectionStart;
  const before = text.slice(0, pos);
  const line = (before.match(/\n/g) || []).length + 1;
  const col = pos - before.lastIndexOf('\n');
  statusLine.textContent = `Ln ${line}, Col ${col}`;
  const words = (text.match(/\S+/g) || []).length;
  statusWords.textContent = `${words} word${words === 1 ? '' : 's'}`;
  statusChars.textContent = `${text.length} char${text.length === 1 ? '' : 's'}`;
  statusVim.classList.toggle('active', vimEnabled);
  statusVim.textContent = vimEnabled ? 'VIM' : 'EDIT';
  statusAutosave.classList.toggle('active', autoSaveEnabled);
  statusAutosave.textContent = autoSaveEnabled ? 'AUTO' : 'MANUAL';
}

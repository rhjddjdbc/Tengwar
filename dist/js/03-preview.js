"use strict";

/* ═══════════════════════════════════════════════════════════════
   ZOOM
   ═══════════════════════════════════════════════════════════════ */
function applyZoom(z) {
  previewZoom = Math.max(40, Math.min(300, Math.round(z)));
  preview.style.zoom = (previewZoom / 100);
  zoomLabel.textContent = previewZoom + '%';
  localStorage.setItem('tengwar-zoom', String(previewZoom));
}
function zoomIn() { applyZoom(previewZoom + 10); }
function zoomOut() { applyZoom(previewZoom - 10); }
function zoomFit() {
  const prev = preview.style.zoom;
  preview.style.zoom = '1';
  const contentWidth = preview.scrollWidth;
  preview.style.zoom = prev;
  const paneWidth = preview.clientWidth - 40;
  const pct = (paneWidth / contentWidth) * 100;
  applyZoom(Math.min(200, Math.max(40, pct)));
}
function zoomReset() { applyZoom(100); }

/* ═══════════════════════════════════════════════════════════════
   RENDER (preview pane)
   ═══════════════════════════════════════════════════════════════ */
async function render(force = false) {
  const value = editorTA.value;
  if (!force && value === _lastRenderedValue) return;
  _lastRenderedValue = value;
  try {
    preview.innerHTML = await invoke('render_markdown', { input: value });
    const diagrams = preview.querySelectorAll('.diagram[data-mermaid]');
    for (const el of diagrams) {
      const code = el.getAttribute('data-mermaid')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      try {
        el.innerHTML = await invoke('render_diagram', { code });
        attachDiagramToolbar(el);
      } catch (e) {
        el.innerHTML = `<div class="error">${escapeHtml(String(e))}</div>`;
      }
    }
    if (currentRepoPath) await inlineLocalImages(preview, currentRepoPath);
    makeInteractive();
  } catch (e) { console.error('render error:', e); }
}

function attachDiagramToolbar(el) {
  if (el.querySelector('.diagram-toolbar')) return;
  const tb = document.createElement('div');
  tb.className = 'diagram-toolbar';
  tb.innerHTML = `<button data-dl="svg" title="Download SVG">SVG</button><button data-dl="png" title="Download PNG">PNG</button>`;
  el.appendChild(tb);
  tb.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); downloadDiagram(el, btn.dataset.dl); });
  });
}

function downloadDiagram(el, format) {
  const svg = el.querySelector('svg');
  if (!svg) { showToast('No diagram to download', 'error'); return; }
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const w = parseInt(clone.getAttribute('width') || '800', 10);
  const h = parseInt(clone.getAttribute('height') || '600', 10);
  const cs = getComputedStyle(document.body);
  const vars = ['--d-bg','--d-box','--d-box2','--d-box3','--d-box4',
                '--d-stroke','--d-stroke2','--d-stroke3',
                '--d-fg','--d-muted','--d-accent','--d-accent2','--d-accent3',
                '--d-grid','--d-line'];
  const inlineVars = vars.map(v => {
    const val = cs.getPropertyValue(v).trim();
    return val ? `${v}: ${val};` : '';
  }).join(' ');
  const existingStyle = clone.getAttribute('style') || '';
  clone.setAttribute('style', existingStyle + ' ' + inlineVars);
  const svgStr = new XMLSerializer().serializeToString(clone);
  const svgFinal = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;
  if (format === 'svg') {
    const blob = new Blob([svgFinal], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'diagram.svg');
    showToast('Saved diagram.svg');
    return;
  }
  if (format === 'png') {
    const blob = new Blob([svgFinal], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      const isDark = document.body.classList.contains('preview-dark');
      ctx.fillStyle = isDark ? '#161b22' : '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(pngBlob => {
        if (pngBlob) { downloadBlob(pngBlob, 'diagram.png'); showToast('Saved diagram.png'); }
        else showToast('PNG export failed', 'error');
      }, 'image/png');
    };
    img.onerror = (e) => {
      console.error('PNG conversion error:', e);
      showToast('PNG conversion failed', 'error');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function debouncedRender() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(render, 200);
}

async function inlineLocalImages(container, basePath) {
  const imgs = container.querySelectorAll('img[src]');
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src || /^(https?:|data:|asset:|tauri:)/.test(src)) continue;
    if (img.dataset.embedded === '1') continue;
    const cleaned = src.replace(/^\.\//, '').replace(/^\//, '');
    const absPath = basePath + '/' + cleaned;
    try {
      const dataUrl = await invoke('image_to_data_url', { path: absPath });
      img.setAttribute('src', dataUrl);
      img.dataset.embedded = '1';
    } catch (e) {
      console.warn('Image not found:', absPath);
      img.style.opacity = '0.3';
      img.alt = (img.alt || '') + ' (not found)';
    }
  }
}

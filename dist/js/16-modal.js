"use strict";

/* ═══════════════════════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════════════════════ */
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');

function showInputModal(title, label, defaultValue, callback, isPassword = false) {
  modalContent.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <p style="font-size:12px;color:var(--fg-2);margin-bottom:10px;">${escapeHtml(label)}</p>
    <input type="${isPassword ? 'password' : 'text'}" id="modal-input" value="${escapeHtml(defaultValue || '')}">
    <div class="modal-actions">
      <button class="btn-cancel" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-ok">OK</button>
    </div>`;
  modalOverlay.classList.add('show');
  const input = document.getElementById('modal-input');
  requestAnimationFrame(() => { input.focus(); input.select(); });
  const close = (val) => { modalOverlay.classList.remove('show'); callback(val); };
  document.getElementById('modal-ok').addEventListener('click', () => close(input.value));
  document.getElementById('modal-cancel').addEventListener('click', () => close(null));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); close(input.value); }
    else if (e.key === 'Escape') { e.preventDefault(); close(null); }
  });
}
function showChoiceModal(title, options, callback) {
  modalContent.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <div style="max-height:320px;overflow-y:auto;margin-bottom:10px;">
      ${options.map((o, i) => `<div class="choice-item" data-idx="${i}" style="padding:9px 13px;border-radius:6px;cursor:pointer;font-family:monospace;font-size:13px;color:var(--fg-1);">${escapeHtml(o)}</div>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn-cancel" id="modal-cancel">Cancel</button></div>`;
  modalOverlay.classList.add('show');
  modalContent.querySelectorAll('.choice-item').forEach(el => {
    el.addEventListener('mouseenter', () => { el.style.background = 'var(--bg-3)'; el.style.color = 'var(--fg-0)'; });
    el.addEventListener('mouseleave', () => { el.style.background = ''; el.style.color = 'var(--fg-1)'; });
    el.addEventListener('click', () => { modalOverlay.classList.remove('show'); callback(options[+el.dataset.idx]); });
  });
  document.getElementById('modal-cancel').addEventListener('click', () => modalOverlay.classList.remove('show'));
}

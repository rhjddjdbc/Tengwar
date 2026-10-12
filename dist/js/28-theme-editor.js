"use strict";

/* ═══════════════════════════════════════════════════════════════
   THEME SYSTEM — editor
   ═══════════════════════════════════════════════════════════════ */
let customTheme = JSON.parse(localStorage.getItem('tengwar-custom-theme') || 'null') || { light: {}, dark: {} };
let themePresets = JSON.parse(localStorage.getItem('tengwar-theme-preset') || 'null') || { light: 'default', dark: 'default' };
let teMode = 'light';
let teWorking = null;
let _teOriginalTheme = null;

function applyCustomTheme() {
  let lightStyle = document.getElementById('tengwar-light-theme-style');
  if (!lightStyle) {
    lightStyle = document.createElement('style');
    lightStyle.id = 'tengwar-light-theme-style';
    document.head.appendChild(lightStyle);
  }
  const lightRules = Object.entries(customTheme.light || {})
    .map(([k, v]) => `${k}: ${v};`).join(' ');
  lightStyle.textContent = lightRules ? `:root { ${lightRules} }` : '';

  let darkStyle = document.getElementById('tengwar-dark-theme-style');
  if (!darkStyle) {
    darkStyle = document.createElement('style');
    darkStyle.id = 'tengwar-dark-theme-style';
    document.head.appendChild(darkStyle);
  }
  const darkRules = Object.entries(customTheme.dark || {})
    .map(([k, v]) => `${k}: ${v};`).join(' ');
  darkStyle.textContent = darkRules ? `body.preview-dark { ${darkRules} }` : '';
}

const themeEditor = document.getElementById('theme-editor');
const teTitle = document.getElementById('te-title');
const tePreview = document.getElementById('te-preview');
const tePreset = document.getElementById('te-preset');
const tePresetTrigger = tePreset.querySelector('.te-select-trigger');
const tePresetValue = tePreset.querySelector('.te-select-value');
const tePresetMenu = tePreset.querySelector('.te-select-menu');
const tePresetOptions = tePresetMenu.querySelectorAll('.te-select-option');

tePresetTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  tePreset.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!tePreset.contains(e.target)) tePreset.classList.remove('open');
});
tePresetOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    const name = opt.dataset.value;
    tePreset.classList.remove('open');
    setPresetUI(name);
    applyPreset(name);
  });
});

function setPresetUI(name) {
  tePreset.dataset.value = name;
  const opt = tePresetMenu.querySelector(`[data-value="${name}"]`);
  if (opt) {
    tePresetValue.textContent = opt.textContent.replace('✓', '').trim();
    tePresetOptions.forEach(o => o.classList.toggle('active', o === opt));
  }
}

function applyPreset(name) {
  themePresets[teMode] = name;
  localStorage.setItem('tengwar-theme-preset', JSON.stringify(themePresets));
  if (name === 'default') {
    teWorking = {};
  } else {
    const preset = PRESETS[name];
    if (!preset) return;
    teWorking = { ...(preset[teMode] || {}) };
  }
  applyWorkingTheme();
  renderThemeControls();
  renderThemePreview();
}

function openThemeEditor(mode) {
  teMode = mode;
  if (!themeEditor.classList.contains('show')) {
    _teOriginalTheme = JSON.parse(JSON.stringify(customTheme));
  }
  teWorking = JSON.parse(JSON.stringify(customTheme[mode] || {}));
  themeEditor.classList.add('show');
  document.querySelectorAll('.te-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  teTitle.textContent = mode === 'light' ? 'Edit Light Theme' : 'Edit Dark Theme';
  tePreview.classList.toggle('dark', mode === 'dark');
  tePreview.removeAttribute('style');

  const allVars = [...THEME_VARS.app, ...THEME_VARS.syntax, ...THEME_VARS.diagram, ...THEME_VARS.diagramBoxes];
  allVars.forEach(v => {
    const val = teWorking[v.key] || (mode === 'light' ? v.defL : v.defD);
    tePreview.style.setProperty(v.key, val);
  });
  setPresetUI(themePresets[mode] || 'default');
  renderThemeControls();
  renderThemePreview();
}

function applyWorkingTheme() {
  customTheme[teMode] = { ...teWorking };
  applyCustomTheme();
  Object.entries(teWorking).forEach(([k, v]) => tePreview.style.setProperty(k, v));
  renderThemePreview();
}

function saveThemeEditor() {
  customTheme[teMode] = { ...teWorking };
  localStorage.setItem('tengwar-custom-theme', JSON.stringify(customTheme));
  applyCustomTheme();
  _teOriginalTheme = null;
  themeEditor.classList.remove('show');
  teWorking = null;
  showToast('Theme saved');
}

function cancelThemeEditor() {
  if (_teOriginalTheme) {
    customTheme = JSON.parse(JSON.stringify(_teOriginalTheme));
    localStorage.setItem('tengwar-custom-theme', JSON.stringify(customTheme));
    _teOriginalTheme = null;
  }
  themeEditor.classList.remove('show');
  teWorking = null;
  applyCustomTheme();
}

function renderThemeControls() {
  const buildSection = (containerId, vars) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    vars.forEach(v => {
      const current = teWorking[v.key] || (teMode === 'light' ? v.defL : v.defD);
      const row = document.createElement('div');
      row.className = 'te-color-row';
      row.innerHTML = `
        <input type="color" class="te-color-swatch" value="${current}" data-key="${v.key}">
        <span class="te-color-label" title="${v.key}">${v.label}</span>
        <input type="text" class="te-color-hex" value="${current.toUpperCase()}" data-key="${v.key}">
      `;
      const swatch = row.querySelector('.te-color-swatch');
      const hex = row.querySelector('.te-color-hex');
      swatch.addEventListener('input', () => {
        hex.value = swatch.value.toUpperCase();
        teWorking[v.key] = swatch.value;
        applyWorkingTheme();
      });
      hex.addEventListener('change', () => {
        let v2 = hex.value.trim();
        if (!v2.startsWith('#')) v2 = '#' + v2;
        if (/^#[0-9a-f]{6}$/i.test(v2)) {
          swatch.value = v2;
          teWorking[v.key] = v2;
          applyWorkingTheme();
        }
      });
      el.appendChild(row);
    });
  };
  buildSection('te-app-colors', THEME_VARS.app);
  buildSection('te-syntax-colors', THEME_VARS.syntax);
  buildSection('te-diagram-colors', THEME_VARS.diagram);
  buildSection('te-diagram-boxes', THEME_VARS.diagramBoxes);
}

function renderThemePreview() {
  tePreview.innerHTML = `
    <h2>Theme Preview</h2>
    <p>This is how your content looks in <strong>${teMode} mode</strong>.
    Colors update live — the whole app is already using them.</p>
    <p>Inline <code>code</code>, and a <a href="#">link</a> should all be readable.</p>
    <blockquote>A quote from someone wise — the accent line should stand out.</blockquote>
    <pre style="background:var(--syn-code-bg,#f0f1f4);color:var(--fg-0);padding:12px;border-radius:6px;font-family:monospace;font-size:12px;margin-top:1em;white-space:pre-wrap;"><span class="tok-marker">##</span> <span class="tok-heading">Heading</span>
<span class="tok-marker">-</span> list item with <span class="tok-bold">**bold**</span> and <span class="tok-italic">*italic*</span>
<span class="tok-marker">-</span> <span class="tok-task-checked">[x]</span> <span class="tok-task-done">done</span>
<span class="tok-marker">-</span> <span class="tok-task-unchecked">[ ]</span> todo
<span class="tok-link-text">[link]</span><span class="tok-link-url">(url)</span> · <span class="tok-code">\`code\`</span> · <span class="tok-wikilink">[[Wiki]]</span></pre>
    <svg width="100%" height="140" viewBox="0 0 480 140" style="margin-top:1em;border-radius:8px;background:var(--d-bg);">
      <style>
        .p-t { fill: var(--d-fg); font-family: Inter, sans-serif; }
        .p-tm { fill: var(--d-muted); }
        .p-b { fill: var(--d-box); stroke: var(--d-stroke); stroke-width:1.2; }
        .p-b2 { fill: var(--d-box2); stroke: var(--d-stroke2); stroke-width:1.2; }
        .p-b3 { fill: var(--d-box3); stroke: var(--d-stroke3); stroke-width:1.2; }
        .p-b4 { fill: var(--d-box4); stroke: var(--d-stroke); stroke-width:1.2; }
        .p-l { stroke: var(--d-accent); fill: none; stroke-width: 1.6; }
      </style>
      <rect x="10" y="10" width="140" height="50" rx="8" class="p-b"/>
      <text x="80" y="40" text-anchor="middle" font-size="12" class="p-t">Box 1</text>
      <rect x="170" y="10" width="140" height="50" rx="8" class="p-b2"/>
      <text x="240" y="40" text-anchor="middle" font-size="12" class="p-t">Box 2</text>
      <rect x="330" y="10" width="140" height="50" rx="8" class="p-b3"/>
      <text x="400" y="40" text-anchor="middle" font-size="12" class="p-t">Box 3</text>
      <rect x="10" y="80" width="140" height="50" rx="8" class="p-b4"/>
      <text x="80" y="110" text-anchor="middle" font-size="12" class="p-t">Box 4</text>
      <line x1="170" y1="105" x2="460" y2="105" class="p-l"/>
      <text x="315" y="98" text-anchor="middle" font-size="10" class="p-tm">accent line</text>
    </svg>
  `;
}

document.getElementById('te-close').addEventListener('click', cancelThemeEditor);
document.getElementById('te-cancel').addEventListener('click', cancelThemeEditor);
document.getElementById('te-save').addEventListener('click', saveThemeEditor);
themeEditor.addEventListener('mousedown', (e) => { if (e.target === themeEditor) cancelThemeEditor(); });
document.querySelectorAll('.te-tab').forEach(t => {
  t.addEventListener('click', () => openThemeEditor(t.dataset.mode));
});

document.getElementById('te-reset').addEventListener('click', () => {
  customTheme[teMode] = {};
  localStorage.setItem('tengwar-custom-theme', JSON.stringify(customTheme));
  themePresets[teMode] = 'default';
  localStorage.setItem('tengwar-theme-preset', JSON.stringify(themePresets));
  teWorking = {};
  setPresetUI('default');
  renderThemeControls();
  tePreview.removeAttribute('style');
  applyCustomTheme();
  renderThemePreview();
  showToast('Reset to defaults', 'info');
});

document.getElementById('te-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(customTheme, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'tengwar-theme.json');
  showToast('Theme exported');
});

document.getElementById('te-import').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.light || parsed.dark) {
        customTheme = { light: parsed.light || {}, dark: parsed.dark || {} };
        localStorage.setItem('tengwar-custom-theme', JSON.stringify(customTheme));
        applyCustomTheme();
        teWorking = { ...(customTheme[teMode] || {}) };
        themePresets = { light: 'default', dark: 'default' };
        localStorage.setItem('tengwar-theme-preset', JSON.stringify(themePresets));
        setPresetUI('default');
        renderThemeControls();
        showToast('Theme imported');
      } else showToast('Invalid theme file', 'error');
    } catch (e) { showToast('Import failed: ' + e.message, 'error'); }
  });
  input.click();
});

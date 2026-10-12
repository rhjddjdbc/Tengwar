"use strict";

const { invoke } = window.__TAURI__.core;
const { open: openDialog, save: saveDialog } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

const svgIcon = (p) => `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">${p}</svg>`;
const ICON_FILE = svgIcon('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>');
const ICON_FOLDER = svgIcon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');
const ICON_X = `<svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;

const editorTA = document.getElementById('editor');
const editorHighlight = document.getElementById('editor-highlight');
const editorHighlightCode = editorHighlight.querySelector('code');
const preview = document.getElementById('preview-pane');
const modeIndicator = document.getElementById('mode-indicator');
const currentFileLabel = document.getElementById('currentFile');
const toast = document.getElementById('toast');
const fileTree = document.getElementById('file-tree');
const tabsBar = document.getElementById('tabs-bar');
const zoomLabel = document.getElementById('zoomLabel');
const statusLine = document.getElementById('status-line');
const statusWords = document.getElementById('status-words');
const statusChars = document.getElementById('status-chars');
const statusVim = document.getElementById('status-vim');
const statusAutosave = document.getElementById('status-autosave');

let currentRepoPath = null;
let currentBranch = 'main';
let currentVimMode = 'normal';
let allFiles = [];
let renderTimeout = null;
let _lastRenderedValue = null;
let previewZoom = parseInt(localStorage.getItem('tengwar-zoom') || '100', 10);
let tabs = new Map();
let activeTabId = null;
let tabCounter = 0;
let vimEnabled = localStorage.getItem('tengwar-vim-enabled') !== 'false';
let autoSaveEnabled = localStorage.getItem('tengwar-autosave') === 'true';
let autoSaveTimer = null;
let scrollSyncEnabled = localStorage.getItem('tengwar-scroll-sync') !== 'false';
let contextTarget = null;
let findMatches = [];
let findIndex = -1;

let vimQueue = Promise.resolve();
let lastAppliedCursor = 0;

function byteToJsIndex(text, byteOffset) {
  if (byteOffset <= 0) return 0;
  let bytes = 0, jsIdx = 0;
  while (jsIdx < text.length) {
    const code = text.codePointAt(jsIdx);
    const b = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (bytes + b > byteOffset) break;
    bytes += b;
    jsIdx += code > 0xFFFF ? 2 : 1;
  }
  return jsIdx;
}
function jsIndexToByte(text, jsIdx) {
  let bytes = 0;
  for (let i = 0; i < jsIdx && i < text.length; ) {
    const code = text.codePointAt(i);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    i += code > 0xFFFF ? 2 : 1;
  }
  return bytes;
}
function advanceOneChar(text, jsIdx) {
  if (jsIdx >= text.length) return jsIdx;
  const code = text.codePointAt(jsIdx);
  return jsIdx + (code > 0xFFFF ? 2 : 1);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = 'show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.className = type; }, 2200);
}

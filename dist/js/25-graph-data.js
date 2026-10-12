"use strict";

/* ═══════════════════════════════════════════════════════════════
   GRAPH VIEW
   ═══════════════════════════════════════════════════════════════ */
const graphPopup = document.getElementById('graph-popup');
const graphSvg = document.getElementById('graph-svg');
const graphBody = document.getElementById('graph-body');
const graphStats = document.getElementById('graph-stats');
const graphLabelsCheckbox = document.getElementById('graph-labels');

let graphState = {
  nodes: [], edges: [],
  adjacency: new Map(), idMap: new Map(),
  alpha: 0, hoverId: null, draggingId: null, dragStarted: false,
  selectedId: null, width: 0, height: 0,
};

let lastMouseX = 0, lastMouseY = 0;

const DRAG_THRESHOLD = 4;
let graphDragOrigin = { x: 0, y: 0 };
let nodeClickTimer = null;
let nodeClickId = null;
let bgDragging = false;
let bgMoved = false;
let bgDragStart = { x: 0, y: 0, px: 0, py: 0 };

let graphView = {
  zoom: 1, panX: 0, panY: 0,
  targetZoom: 1, targetPanX: 0, targetPanY: 0,
};

let graphRafId = null;

function graphStorageKey() {
  return 'tengwar-graph-' + (currentRepoPath || 'default');
}

async function openGraphView() {
  if (!currentRepoPath) { showToast('Open a folder first', 'error'); return; }
  graphPopup.classList.add('show');
  await loadGraphData();
}

function resetGraphInteraction() {
  graphState.draggingId = null;
  graphState.dragStarted = false;
  graphState.hoverId = null;
  for (const n of graphState.nodes) {
    n.fixed = false;
    delete n._dragOffsetX;
    delete n._dragOffsetY;
  }
  bgDragging = false;
  bgMoved = false;
  graphBody.classList.remove('dragging', 'dragging-node');
  clearTimeout(nodeClickTimer);
  nodeClickTimer = null;
  nodeClickId = null;
}

function closeGraphView() {
  graphPopup.classList.remove('show');
  if (graphRafId) { cancelAnimationFrame(graphRafId); graphRafId = null; }
  resetGraphInteraction();
  if (graphState.nodes.length) savePositions();
}

async function loadGraphData() {
  graphBody.querySelectorAll('.graph-empty').forEach(e => e.remove());
  graphSvg.innerHTML = '';
  graphStats.textContent = 'Loading…';
  try {
    const data = await invoke('build_link_graph', { root: currentRepoPath });
    if (!data.nodes.length) {
      graphStats.textContent = '0 nodes';
      const empty = document.createElement('div');
      empty.className = 'graph-empty';
      empty.textContent = 'No .md files found in this folder';
      graphBody.appendChild(empty);
      return;
    }
    buildGraphState(data);
    graphStats.textContent = `${data.nodes.length} nodes · ${data.edges.length} edges`;
    const rect = graphBody.getBoundingClientRect();
    graphState.width = rect.width;
    graphState.height = rect.height;
    if (!restorePositions()) initialLayout();
    fitGraphToView();
    graphState.alpha = 0;
    startGraphLoop();
    renderGraph();
  } catch (e) {
    graphStats.textContent = 'Error';
    const empty = document.createElement('div');
    empty.className = 'graph-empty';
    empty.style.color = 'var(--error)';
    empty.textContent = String(e);
    graphBody.appendChild(empty);
  }
}

function buildGraphState(data) {
  resetGraphInteraction();
  graphState.selectedId = null;
  const degree = new Map();
  for (const e of data.edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  graphState.nodes = data.nodes.map(n => {
    const d = degree.get(n.id) || 0;
    const r = 7 + Math.min(14, Math.sqrt(d) * 3.5);
    return { ...n, x: 0, y: 0, vx: 0, vy: 0, r, fixed: false };
  });
  graphState.edges = data.edges.map(e => ({ ...e }));
  graphState.adjacency = new Map();
  graphState.idMap = new Map();
  for (const n of graphState.nodes) {
    graphState.adjacency.set(n.id, new Set());
    graphState.idMap.set(n.id, n);
  }
  for (const e of graphState.edges) {
    if (graphState.adjacency.has(e.from)) graphState.adjacency.get(e.from).add(e.to);
    if (graphState.adjacency.has(e.to)) graphState.adjacency.get(e.to).add(e.from);
  }
}

function initialLayout() {
  const W = graphState.width, H = graphState.height;
  const n = graphState.nodes.length;
  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) * 0.38;
  graphState.nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const r = radius * (0.5 + Math.random() * 0.5);
    node.x = cx + Math.cos(angle) * r;
    node.y = cy + Math.sin(angle) * r;
  });
  const iterations = Math.min(500, Math.max(120, n * 3));
  const area = W * H;
  const k = Math.sqrt(area / n);
  const idIndex = new Map();
  graphState.nodes.forEach((node, i) => idIndex.set(node.id, i));
  let temp = W / 8;
  const cool = temp / (iterations + 1);
  for (let it = 0; it < iterations; it++) {
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ni = graphState.nodes[i];
      for (let j = i + 1; j < n; j++) {
        const nj = graphState.nodes[j];
        let ddx = ni.x - nj.x;
        let ddy = ni.y - nj.y;
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 0.01) { ddx = Math.random() - 0.5; ddy = Math.random() - 0.5; d2 = 0.01; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        const fx = (ddx / d) * f;
        const fy = (ddy / d) * f;
        dx[i] += fx; dy[i] += fy;
        dx[j] -= fx; dy[j] -= fy;
      }
    }
    for (const e of graphState.edges) {
      const i = idIndex.get(e.from);
      const j = idIndex.get(e.to);
      if (i === undefined || j === undefined) continue;
      const ni = graphState.nodes[i];
      const nj = graphState.nodes[j];
      const ddx = ni.x - nj.x;
      const ddy = ni.y - nj.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      const f = (d * d) / k;
      const fx = (ddx / d) * f;
      const fy = (ddy / d) * f;
      dx[i] -= fx; dy[i] -= fy;
      dx[j] += fx; dy[j] += fy;
    }
    for (let i = 0; i < n; i++) {
      const ni = graphState.nodes[i];
      dx[i] += (cx - ni.x) * 0.02;
      dy[i] += (cy - ni.y) * 0.02;
    }
    for (let i = 0; i < n; i++) {
      const ni = graphState.nodes[i];
      if (ni.fixed) continue;
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01;
      const lim = Math.min(d, temp);
      ni.x += (dx[i] / d) * lim;
      ni.y += (dy[i] / d) * lim;
    }
    temp -= cool;
  }
  savePositions();
}

function simulationStep() {
  const n = graphState.nodes.length;
  if (n === 0) return;
  const W = graphState.width, H = graphState.height;
  const cx = W / 2, cy = H / 2;
  const area = W * H;
  const k = Math.sqrt(area / n);
  const alpha = graphState.alpha;
  for (let i = 0; i < n; i++) {
    const ni = graphState.nodes[i];
    for (let j = i + 1; j < n; j++) {
      const nj = graphState.nodes[j];
      let ddx = ni.x - nj.x;
      let ddy = ni.y - nj.y;
      let d2 = ddx * ddx + ddy * ddy;
      if (d2 < 0.5) d2 = 0.5;
      const d = Math.sqrt(d2);
      const f = ((k * k) / d) * alpha * 0.02;
      const fx = (ddx / d) * f;
      const fy = (ddy / d) * f;
      ni.vx += fx; ni.vy += fy;
      nj.vx -= fx; nj.vy -= fy;
    }
  }
  for (const e of graphState.edges) {
    const ni = graphState.idMap.get(e.from);
    const nj = graphState.idMap.get(e.to);
    if (!ni || !nj) continue;
    const ddx = ni.x - nj.x;
    const ddy = ni.y - nj.y;
    const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
    const target = 90;
    const f = (d - target) * 0.05 * alpha;
    const fx = (ddx / d) * f;
    const fy = (ddy / d) * f;
    ni.vx -= fx; ni.vy -= fy;
    nj.vx += fx; nj.vy += fy;
  }
  for (const node of graphState.nodes) {
    node.vx += (cx - node.x) * 0.005 * alpha;
    node.vy += (cy - node.y) * 0.005 * alpha;
  }
  const damping = 0.85;
  for (const node of graphState.nodes) {
    if (node.fixed) { node.vx = 0; node.vy = 0; continue; }
    node.vx *= damping;
    node.vy *= damping;
    node.x += node.vx;
    node.y += node.vy;
  }
  graphState.alpha *= 0.94;
  if (graphState.alpha < 0.005) {
    graphState.alpha = 0;
    savePositions();
  }
}

function startGraphLoop() {
  if (graphRafId) return;
  const loop = () => {
    graphRafId = requestAnimationFrame(loop);
    let needsRender = false;
    const lerp = 0.25;
    if (Math.abs(graphView.zoom - graphView.targetZoom) > 0.001) {
      graphView.zoom += (graphView.targetZoom - graphView.zoom) * lerp;
      needsRender = true;
    } else graphView.zoom = graphView.targetZoom;
    if (Math.abs(graphView.panX - graphView.targetPanX) > 0.1) {
      graphView.panX += (graphView.targetPanX - graphView.panX) * lerp;
      needsRender = true;
    } else graphView.panX = graphView.targetPanX;
    if (Math.abs(graphView.panY - graphView.targetPanY) > 0.1) {
      graphView.panY += (graphView.targetPanY - graphView.panY) * lerp;
      needsRender = true;
    } else graphView.panY = graphView.targetPanY;
    if (graphState.alpha > 0) { simulationStep(); needsRender = true; }
    if (needsRender) renderGraph();
  };
  graphRafId = requestAnimationFrame(loop);
}

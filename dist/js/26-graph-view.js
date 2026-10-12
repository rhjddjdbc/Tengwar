"use strict";

/* ── Graph: rendering, interaction, persistence ─────────────── */
function renderGraph() {
  const W = graphState.width;
  const H = graphState.height;
  const NS = 'http://www.w3.org/2000/svg';
  const palette = ['#7c9cff', '#fbbf24', '#34d399', '#f87171', '#a78bfa', '#22d3ee', '#fb923c', '#4ade80'];
  const showLabels = graphLabelsCheckbox.checked;

  graphSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  graphSvg.innerHTML = '';

  const g = document.createElementNS(NS, 'g');
  g.setAttribute('id', 'graph-root');
  g.setAttribute('transform', `translate(${graphView.panX}, ${graphView.panY}) scale(${graphView.zoom})`);

  const hovered = graphState.hoverId;
  const highlightSet = new Set();
  if (hovered) {
    highlightSet.add(hovered);
    const nbrs = graphState.adjacency.get(hovered);
    if (nbrs) nbrs.forEach(id => highlightSet.add(id));
  }

  for (const e of graphState.edges) {
    const a = graphState.idMap.get(e.from);
    const b = graphState.idMap.get(e.to);
    if (!a || !b) continue;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', 'graph-edge');
    if (hovered) {
      const touch = e.from === hovered || e.to === hovered;
      line.classList.add(touch ? 'highlight' : 'dim');
    }
    g.appendChild(line);
  }

  for (const n of graphState.nodes) {
    const nodeG = document.createElementNS(NS, 'g');
    nodeG.setAttribute('class', 'graph-node');
    nodeG.dataset.id = n.id;
    if (hovered && !highlightSet.has(n.id)) nodeG.classList.add('dim');
    if (n.id === graphState.selectedId) nodeG.classList.add('selected');

    const isVirtual = n.id.startsWith('__virtual__');
    const color = isVirtual ? '#666' : palette[n.group % palette.length];

    if (n.id === hovered || n.id === graphState.selectedId) {
      const glow = document.createElementNS(NS, 'circle');
      glow.setAttribute('cx', n.x);
      glow.setAttribute('cy', n.y);
      glow.setAttribute('r', n.r + 6);
      glow.setAttribute('fill', color);
      glow.setAttribute('opacity', 0.2);
      glow.setAttribute('class', 'graph-glow');
      nodeG.appendChild(glow);
    }

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', n.x);
    circle.setAttribute('cy', n.y);
    circle.setAttribute('r', n.r);
    circle.setAttribute('fill', isVirtual ? 'transparent' : color);
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', 2);
    if (isVirtual) circle.setAttribute('stroke-dasharray', '3,3');
    nodeG.appendChild(circle);

    if (showLabels) {
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', n.x);
      text.setAttribute('y', n.y + n.r + 13);
      text.textContent = n.label;
      nodeG.appendChild(text);
    }

    nodeG.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      graphState.dragStarted = false;
      graphState.draggingId = n.id;
      graphDragOrigin = { x: e.clientX, y: e.clientY };
      n.fixed = true;
      const local = graphToLocal(e);
      n._dragOffsetX = n.x - local.x;
      n._dragOffsetY = n.y - local.y;
      graphBody.classList.add('dragging-node');
    });

    g.appendChild(nodeG);
  }

  graphSvg.appendChild(g);
}

function graphToLocal(e) {
  const rect = graphBody.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  return {
    x: (mx - graphView.panX) / graphView.zoom,
    y: (my - graphView.panY) / graphView.zoom,
  };
}

function centerOnNode(n) {
  const W = graphState.width, H = graphState.height;
  graphView.targetPanX = W / 2 - n.x * graphView.zoom;
  graphView.targetPanY = H / 2 - n.y * graphView.zoom;
  graphView.targetZoom = Math.max(graphView.zoom, 1.4);
}

function openGraphNode(n) {
  if (n.id.startsWith('__virtual__')) {
    showToast('Broken link — no file for ' + n.label, 'info');
    return;
  }
  let file = allFiles.find(f => f.path === n.id);
  if (!file && currentRepoPath) {
    const abs = currentRepoPath + '/' + n.id;
    file = {
      name: n.id.split('/').pop(), path: n.id, _abs: abs,
      getText: () => invoke('read_text_file', { path: abs }),
      saveText: (text) => invoke('write_text_file', { path: abs, content: text }),
    };
  }
  if (file) { closeGraphView(); openFileEntry(file); }
}

function handleNodeClick(n) {
  if (nodeClickTimer && nodeClickId === n.id) {
    clearTimeout(nodeClickTimer);
    nodeClickTimer = null;
    nodeClickId = null;
    openGraphNode(n);
    return;
  }
  clearTimeout(nodeClickTimer);
  nodeClickId = n.id;
  nodeClickTimer = setTimeout(() => {
    nodeClickTimer = null;
    nodeClickId = null;
    graphState.selectedId = (graphState.selectedId === n.id) ? null : n.id;
    if (graphState.selectedId === n.id) centerOnNode(n);
    renderGraph();
  }, 250);
}

function endGraphDrag() {
  if (graphState.draggingId) {
    const n = graphState.idMap.get(graphState.draggingId);
    const wasDrag = graphState.dragStarted;
    if (n) { n.fixed = false; delete n._dragOffsetX; delete n._dragOffsetY; }
    graphState.draggingId = null;
    graphState.dragStarted = false;
    graphBody.classList.remove('dragging-node');
    if (wasDrag) graphState.alpha = Math.max(graphState.alpha, 0.6);
    const el = document.elementFromPoint(lastMouseX, lastMouseY);
    const nodeEl = el && el.closest ? el.closest('.graph-node') : null;
    graphState.hoverId = nodeEl ? (nodeEl.dataset.id || null) : null;
    renderGraph();
    if (!wasDrag && n) handleNodeClick(n);
  }
  if (bgDragging) {
    bgDragging = false;
    graphBody.classList.remove('dragging');
    if (!bgMoved && graphState.selectedId) {
      graphState.selectedId = null;
      renderGraph();
    }
  }
}

graphBody.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.graph-node, button, input, label, select')) return;
  bgDragging = true;
  bgMoved = false;
  bgDragStart = {
    x: e.clientX, y: e.clientY,
    px: graphView.targetPanX, py: graphView.targetPanY,
  };
  graphBody.classList.add('dragging');
});

graphSvg.addEventListener('mousemove', (e) => {
  if (graphState.draggingId || bgDragging) return;
  const nodeEl = e.target && e.target.closest ? e.target.closest('.graph-node') : null;
  const id = nodeEl ? (nodeEl.dataset.id || null) : null;
  if (id !== graphState.hoverId) {
    graphState.hoverId = id;
    renderGraph();
  }
});
graphSvg.addEventListener('mouseleave', () => {
  if (graphState.draggingId || bgDragging) return;
  if (graphState.hoverId !== null) {
    graphState.hoverId = null;
    renderGraph();
  }
});

document.addEventListener('mousemove', (e) => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (graphState.draggingId) {
    if (!graphState.dragStarted) {
      if (Math.hypot(e.clientX - graphDragOrigin.x, e.clientY - graphDragOrigin.y) < DRAG_THRESHOLD) return;
      graphState.dragStarted = true;
    }
    const local = graphToLocal(e);
    const n = graphState.idMap.get(graphState.draggingId);
    if (n) {
      n.x = local.x + (n._dragOffsetX || 0);
      n.y = local.y + (n._dragOffsetY || 0);
      graphState.alpha = Math.max(graphState.alpha, 0.4);
      renderGraph();
    }
    return;
  }
  if (bgDragging) {
    const dx = e.clientX - bgDragStart.x;
    const dy = e.clientY - bgDragStart.y;
    if (!bgMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    bgMoved = true;
    graphState.hoverId = null;
    graphView.targetPanX = bgDragStart.px + dx;
    graphView.targetPanY = bgDragStart.py + dy;
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) endGraphDrag();
}, true);
window.addEventListener('blur', endGraphDrag);

graphBody.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = graphBody.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 16;
  else if (e.deltaMode === 2) delta *= 400;
  const factor = Math.exp(-delta * 0.0012);
  const newZoom = Math.max(0.15, Math.min(5, graphView.targetZoom * factor));
  const wx = (mx - graphView.targetPanX) / graphView.targetZoom;
  const wy = (my - graphView.targetPanY) / graphView.targetZoom;
  graphView.targetPanX = mx - wx * newZoom;
  graphView.targetPanY = my - wy * newZoom;
  graphView.targetZoom = newZoom;
}, { passive: false });

function fitGraphToView() {
  const n = graphState.nodes.length;
  if (n === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of graphState.nodes) {
    minX = Math.min(minX, node.x - node.r);
    minY = Math.min(minY, node.y - node.r);
    maxX = Math.max(maxX, node.x + node.r);
    maxY = Math.max(maxY, node.y + node.r);
  }
  const pad = 40;
  const contentW = maxX - minX + pad * 2;
  const contentH = maxY - minY + pad * 2;
  const zoomX = graphState.width / contentW;
  const zoomY = graphState.height / contentH;
  const zoom = Math.min(zoomX, zoomY, 1.5);
  graphView.targetZoom = zoom;
  graphView.targetPanX = (graphState.width - (minX + maxX) * zoom) / 2;
  graphView.targetPanY = (graphState.height - (minY + maxY) * zoom) / 2;
  graphView.zoom = zoom;
  graphView.panX = graphView.targetPanX;
  graphView.panY = graphView.targetPanY;
}

function savePositions() {
  try {
    const data = {};
    for (const n of graphState.nodes) data[n.id] = [Math.round(n.x), Math.round(n.y)];
    localStorage.setItem(graphStorageKey(), JSON.stringify(data));
  } catch (e) {}
}
function restorePositions() {
  try {
    const raw = localStorage.getItem(graphStorageKey());
    if (!raw) return false;
    const data = JSON.parse(raw);
    let restoredCount = 0;
    for (const n of graphState.nodes) {
      const p = data[n.id];
      if (Array.isArray(p) && p.length === 2) {
        n.x = p[0]; n.y = p[1];
        restoredCount++;
      }
    }
    return restoredCount >= graphState.nodes.length * 0.8;
  } catch (e) { return false; }
}

graphLabelsCheckbox.addEventListener('change', renderGraph);

document.getElementById('graph-zoom-in').addEventListener('click', () => {
  graphView.targetZoom = Math.min(5, graphView.targetZoom * 1.25);
});
document.getElementById('graph-zoom-out').addEventListener('click', () => {
  graphView.targetZoom = Math.max(0.15, graphView.targetZoom * 0.8);
});
document.getElementById('graph-zoom-reset').addEventListener('click', () => fitGraphToView());
document.getElementById('graphBtn').addEventListener('click', openGraphView);
document.getElementById('graph-close').addEventListener('click', closeGraphView);
document.getElementById('graph-refresh').addEventListener('click', async () => {
  try { localStorage.removeItem(graphStorageKey()); } catch (e) {}
  await loadGraphData();
});
graphPopup.addEventListener('mousedown', (e) => { if (e.target === graphPopup) closeGraphView(); });

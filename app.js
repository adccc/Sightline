const canvas = document.getElementById('stage');
const stageWrap = document.getElementById('stageWrap');
const emptyState = document.getElementById('emptyState');
const imageInput = document.getElementById('imageInput');
const exportButton = document.getElementById('exportButton');
const resetButton = document.getElementById('resetButton');
const clearButton = document.getElementById('clearButton');
const fitButton = document.getElementById('fitButton');
const guideWidthInput = document.getElementById('guideWidth');
const overlayControls = document.getElementById('overlayControls');

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const OVERLAY_DEFS = [
  { id: 'grid3', label: '九宫格', group: 'composition' },
  { id: 'grid4', label: '16宫格', group: 'composition' },
  { id: 'golden', label: '黄金分割', group: 'composition' },
  { id: 'one', label: '1点透视', group: 'perspective' },
  { id: 'two', label: '2点透视', group: 'perspective' },
  { id: 'three', label: '3点透视', group: 'perspective' },
];

const state = {
  image: null,
  imageUrl: '',
  fileName: 'image',
  perspectiveMode: 'none',
  drag: null,
  spacePressed: false,
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  style: {
    width: 1.8,
  },
  overlayColors: {
    grid3: 0,
    grid4: 5,
    golden: 2,
    one: 3,
    two: 4,
    three: 6,
  },
  overlays: {
    grid3: true,
    grid4: false,
    golden: false,
    one: false,
    two: false,
    three: false,
  },
  perspectivePointColors: {
    one: [3],
    two: [4, 7],
    three: [6, 7, 0],
  },
  perspective: {
    horizonY: 0.5,
    onePoint: { x: 0.5 },
    leftPoint: { x: 0.22 },
    rightPoint: { x: 0.78 },
    topPoint: { x: 0.5, y: 0.18 },
  },
};

let renderQueued = false;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function isOverlayActive(id) {
  return Boolean(state.overlays[id]);
}

function getOverlayColor(id) {
  return PALETTE[state.overlayColors[id] % PALETTE.length];
}

function getPerspectiveColors(id, count) {
  if (state.perspectivePointColors[id]) {
    return state.perspectivePointColors[id].slice(0, count).map((colorIndex) => PALETTE[colorIndex % PALETTE.length]);
  }
  const start = state.overlayColors[id] % PALETTE.length;
  return Array.from({ length: count }, (_, index) => PALETTE[(start + index) % PALETTE.length]);
}

function getPerspectivePointCount(id) {
  return { one: 1, two: 2, three: 3 }[id] || 0;
}

function cycleOverlayColor(id) {
  state.overlayColors[id] = (state.overlayColors[id] + 1) % PALETTE.length;
  updateOverlayControls();
  requestRender();
}

function cyclePerspectivePointColor(id, index) {
  const colors = state.perspectivePointColors[id];
  if (!colors || colors[index] === undefined) return;
  colors[index] = (colors[index] + 1) % PALETTE.length;
  updateOverlayControls();
  requestRender();
}

function setOverlayActive(id, active) {
  const item = OVERLAY_DEFS.find((overlay) => overlay.id === id);
  if (!item) return;

  state.overlays[id] = active;
  if (item.group === 'perspective' && active) {
    OVERLAY_DEFS.filter((overlay) => overlay.group === 'perspective' && overlay.id !== id).forEach((overlay) => {
      state.overlays[overlay.id] = false;
    });
    state.perspectiveMode = id;
  }

  if (item.group === 'perspective' && !active && state.perspectiveMode === id) {
    state.perspectiveMode = 'none';
  }

  updateOverlayControls();
  requestRender();
}

function updateOverlayControls() {
  overlayControls.querySelectorAll('[data-overlay-id]').forEach((row) => {
    const id = row.dataset.overlayId;
    const checkbox = row.querySelector('input[type="checkbox"]');
    const swatches = row.querySelectorAll('[data-color-index]');
    row.classList.toggle('is-active', isOverlayActive(id));
    if (checkbox) checkbox.checked = isOverlayActive(id);
    swatches.forEach((swatch) => {
      const colorIndex = Number.parseInt(swatch.dataset.colorIndex, 10);
      const colors = getPerspectivePointCount(id)
        ? getPerspectiveColors(id, getPerspectivePointCount(id))
        : [getOverlayColor(id)];
      swatch.style.background = colors[colorIndex] || getOverlayColor(id);
    });
  });
}

function resetGuides() {
  state.overlays = {
    grid3: true,
    grid4: false,
    golden: false,
    one: false,
    two: false,
    three: false,
  };
  state.perspectiveMode = 'none';
  state.perspective = {
    horizonY: 0.5,
    onePoint: { x: 0.5 },
    leftPoint: { x: 0.22 },
    rightPoint: { x: 0.78 },
    topPoint: { x: 0.5, y: 0.18 },
  };
  updateOverlayControls();
  requestRender();
}

function resetView() {
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
  updateViewButtons();
  requestRender();
}

function updateViewButtons() {
  fitButton.disabled = !state.image || (state.view.zoom === 1 && state.view.panX === 0 && state.view.panY === 0);
}

function zoomAt(clientX, clientY, deltaY) {
  if (!state.image) return;

  const box = canvas.getBoundingClientRect();
  const before = screenToImage(clientX, clientY);
  const factor = Math.exp(-deltaY * 0.0012);
  const nextZoom = clamp(state.view.zoom * factor, 0.2, 8);
  const base = fitContain(box.width, box.height, state.image.naturalWidth, state.image.naturalHeight);
  const nextW = base.w * nextZoom;
  const nextH = base.h * nextZoom;
  const localX = clientX - box.left;
  const localY = clientY - box.top;

  state.view.zoom = nextZoom;
  state.view.panX = localX - box.width / 2 - (before.x - 0.5) * nextW;
  state.view.panY = localY - box.height / 2 - (before.y - 0.5) * nextH;
  updateViewButtons();
  requestRender();
}

function startPanDrag(pointerEvent) {
  state.drag = {
    target: { id: 'pan' },
    pointerId: pointerEvent.pointerId,
    startX: pointerEvent.clientX,
    startY: pointerEvent.clientY,
    base: { ...state.view },
  };
  canvas.classList.add('is-panning');
  canvas.setPointerCapture(pointerEvent.pointerId);
}

function clearImage() {
  if (state.imageUrl) {
    URL.revokeObjectURL(state.imageUrl);
  }
  state.image = null;
  state.imageUrl = '';
  state.fileName = 'image';
  state.drag = null;
  emptyState.classList.remove('is-hidden');
  exportButton.disabled = true;
  resetButton.disabled = true;
  clearButton.disabled = true;
  updateViewButtons();
  requestRender();
}

function fitContain(containerW, containerH, imageW, imageH) {
  if (!imageW || !imageH) {
    return { x: 0, y: 0, w: containerW, h: containerH };
  }
  const padding = 24;
  const scale = Math.min((containerW - padding * 2) / imageW, (containerH - padding * 2) / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return {
    x: (containerW - w) / 2,
    y: (containerH - h) / 2,
    w,
    h,
  };
}

function getImageRect(containerW, containerH, imageW, imageH) {
  const base = fitContain(containerW, containerH, imageW, imageH);
  const w = base.w * state.view.zoom;
  const h = base.h * state.view.zoom;
  return {
    x: containerW / 2 + state.view.panX - w / 2,
    y: containerH / 2 + state.view.panY - h / 2,
    w,
    h,
  };
}

function resizeCanvas() {
  const rect = stageWrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  requestRender();
}

function getStageMetrics() {
  const box = canvas.getBoundingClientRect();
  const imageRect = state.image
    ? getImageRect(box.width, box.height, state.image.naturalWidth, state.image.naturalHeight)
    : { x: 0, y: 0, w: box.width, h: box.height };
  return { box, imageRect };
}

function screenToImage(clientX, clientY) {
  const { box, imageRect } = getStageMetrics();
  const x = clientX - box.left - imageRect.x;
  const y = clientY - box.top - imageRect.y;
  return {
    x: imageRect.w ? x / imageRect.w : 0,
    y: imageRect.h ? y / imageRect.h : 0,
  };
}

function imageToScreen(point, imageRect) {
  return {
    x: imageRect.x + point.x * imageRect.w,
    y: imageRect.y + point.y * imageRect.h,
  };
}

function drawLine(ctx, x1, y1, x2, y2, color, width = 1.5, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawCircle(ctx, x, y, radius, fill, stroke) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx, text, x, y) {
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  const padX = 8;
  const padY = 5;
  const metrics = ctx.measureText(text);
  const width = metrics.width + padX * 2;
  const height = 22;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 999);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillText(text, x + padX, y + 15);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawOverlay(ctx, rect, box) {
  if (!rect) return;

  const width = state.style.width;
  const pointRadius = Math.max(7, width * 2.6);
  const boxWidth = box?.width || canvas.getBoundingClientRect().width || canvas.width || rect.x + rect.w;
  const boxHeight = box?.height || canvas.getBoundingClientRect().height || canvas.height || rect.y + rect.h;

  const drawLabelNear = (text, x, y) => {
    const maxX = Math.max(10, boxWidth - 80);
    const maxY = Math.max(10, boxHeight - 32);
    drawLabel(ctx, text, clamp(x, 10, maxX), clamp(y, 10, maxY));
  };

  const drawGridOverlay = (divisions, color) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    for (let i = 1; i < divisions; i += 1) {
      const x = rect.x + (rect.w * i) / divisions;
      const y = rect.y + (rect.h * i) / divisions;
      drawLine(ctx, x, rect.y, x, rect.y + rect.h, color, width, 0.8);
      drawLine(ctx, rect.x, y, rect.x + rect.w, y, color, width, 0.8);
    }
    ctx.restore();
  };

  const drawGoldenOverlay = (color) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    [0.382, 0.618].forEach((ratio) => {
      const x = rect.x + rect.w * ratio;
      const y = rect.y + rect.h * ratio;
      drawLine(ctx, x, rect.y, x, rect.y + rect.h, color, width, 0.9);
      drawLine(ctx, rect.x, y, rect.x + rect.w, y, color, width, 0.9);
    });
    ctx.restore();
  };

  const drawPerspectiveOverlay = (mode) => {
    const color = getOverlayColor(mode);
    const horizonY = rect.y + rect.h * state.perspective.horizonY;
    const samples = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
      { x: 1, y: 1 },
      { x: 0.5, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0.5 },
    ];

    if (mode === 'horizon') {
      drawLine(ctx, 0, horizonY, boxWidth, horizonY, color, Math.max(width + 0.6, 2.2), 0.9);
      drawCircle(ctx, rect.x + rect.w / 2, horizonY, pointRadius, 'rgba(255,255,255,0.96)', color);
      drawLabelNear('地平线', rect.x + 16, horizonY - 30);
      return;
    }

    drawLine(ctx, 0, horizonY, boxWidth, horizonY, 'rgba(255, 255, 255, 0.72)', Math.max(width, 1.2), 0.6);

    if (mode === 'one') {
      const point = imageToScreen({ x: state.perspective.onePoint.x, y: state.perspective.horizonY }, rect);
      samples.forEach((sample) => {
        drawLine(ctx, point.x, point.y, rect.x + rect.w * sample.x, rect.y + rect.h * sample.y, color, width, 0.85);
      });
      drawCircle(ctx, point.x, point.y, pointRadius, 'rgba(255,255,255,0.96)', color);
      drawLabelNear('V1', point.x + 12, point.y - 30);
      return;
    }

    if (mode === 'two') {
      const [leftColor, rightColor] = getPerspectiveColors('two', 2);
      const left = imageToScreen({ x: state.perspective.leftPoint.x, y: state.perspective.horizonY }, rect);
      const right = imageToScreen({ x: state.perspective.rightPoint.x, y: state.perspective.horizonY }, rect);
      samples.forEach((sample, index) => {
        const target = rect.x + rect.w * sample.x;
        const targetY = rect.y + rect.h * sample.y;
        if (index <= 3) {
          drawLine(ctx, left.x, left.y, target, targetY, leftColor, width, 0.82);
        }
        if (index >= 4 || index === 0 || index === 2) {
          drawLine(ctx, right.x, right.y, target, targetY, rightColor, width, 0.82);
        }
      });
      drawCircle(ctx, left.x, left.y, pointRadius, 'rgba(255,255,255,0.96)', leftColor);
      drawCircle(ctx, right.x, right.y, pointRadius, 'rgba(255,255,255,0.96)', rightColor);
      drawLabelNear('V1', left.x + 12, left.y - 30);
      drawLabelNear('V2', right.x + 12, right.y - 30);
      return;
    }

    if (mode === 'three') {
      const [leftColor, rightColor, topColor] = getPerspectiveColors('three', 3);
      const left = imageToScreen({ x: state.perspective.leftPoint.x, y: state.perspective.horizonY }, rect);
      const right = imageToScreen({ x: state.perspective.rightPoint.x, y: state.perspective.horizonY }, rect);
      const top = imageToScreen(state.perspective.topPoint, rect);
      samples.forEach((sample, index) => {
        const target = rect.x + rect.w * sample.x;
        const targetY = rect.y + rect.h * sample.y;
        if (index <= 3) {
          drawLine(ctx, left.x, left.y, target, targetY, leftColor, width, 0.8);
        }
        if (index >= 4 || index === 0 || index === 2) {
          drawLine(ctx, right.x, right.y, target, targetY, rightColor, width, 0.8);
        }
        if (index === 1 || index === 3 || index === 4 || index === 5) {
          drawLine(ctx, top.x, top.y, target, targetY, topColor, width, 0.8);
        }
      });
      drawCircle(ctx, left.x, left.y, pointRadius, 'rgba(255,255,255,0.96)', leftColor);
      drawCircle(ctx, right.x, right.y, pointRadius, 'rgba(255,255,255,0.96)', rightColor);
      drawCircle(ctx, top.x, top.y, pointRadius, 'rgba(255,255,255,0.96)', topColor);
      drawLabelNear('V1', left.x + 12, left.y - 30);
      drawLabelNear('V2', right.x + 12, right.y - 30);
      drawLabelNear('V3', top.x + 12, top.y - 30);
    }
  };

  if (isOverlayActive('grid3')) drawGridOverlay(3, getOverlayColor('grid3'));
  if (isOverlayActive('grid4')) drawGridOverlay(4, getOverlayColor('grid4'));
  if (isOverlayActive('golden')) drawGoldenOverlay(getOverlayColor('golden'));
  if (isOverlayActive('horizon') && state.perspectiveMode === 'none') drawPerspectiveOverlay('horizon');
  if (state.perspectiveMode === 'one' || state.perspectiveMode === 'two' || state.perspectiveMode === 'three') {
    drawPerspectiveOverlay(state.perspectiveMode);
  }
}

function render() {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const { box, imageRect } = getStageMetrics();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);

  if (!state.image) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.fillRect(0, 0, box.width, box.height);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, box.width, box.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(state.image, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
  ctx.restore();

  drawOverlay(ctx, imageRect, box);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(imageRect.x + 0.5, imageRect.y + 0.5, imageRect.w - 1, imageRect.h - 1);
  ctx.restore();
}

function getPointerTarget(clientX, clientY) {
  const { imageRect } = getStageMetrics();
  const x = clientX - canvas.getBoundingClientRect().left;
  const y = clientY - canvas.getBoundingClientRect().top;
  const radius = 14;
  const horizonY = imageRect.y + imageRect.h * state.perspective.horizonY;
  const perspectiveMode = state.perspectiveMode;

  const points = [];
  if (perspectiveMode === 'one') {
    points.push({ id: 'onePoint', x: imageRect.x + imageRect.w * state.perspective.onePoint.x, y: horizonY, type: 'point' });
    points.push({ id: 'horizon', x: imageRect.x + imageRect.w * 0.5, y: horizonY, type: 'line' });
  } else if (perspectiveMode === 'two') {
    points.push({ id: 'leftPoint', x: imageRect.x + imageRect.w * state.perspective.leftPoint.x, y: horizonY, type: 'point' });
    points.push({ id: 'rightPoint', x: imageRect.x + imageRect.w * state.perspective.rightPoint.x, y: horizonY, type: 'point' });
    points.push({ id: 'horizon', x: imageRect.x + imageRect.w * 0.5, y: horizonY, type: 'line' });
  } else if (perspectiveMode === 'three') {
    points.push({ id: 'leftPoint', x: imageRect.x + imageRect.w * state.perspective.leftPoint.x, y: horizonY, type: 'point' });
    points.push({ id: 'rightPoint', x: imageRect.x + imageRect.w * state.perspective.rightPoint.x, y: horizonY, type: 'point' });
    points.push({ id: 'topPoint', x: imageRect.x + imageRect.w * state.perspective.topPoint.x, y: imageRect.y + imageRect.h * state.perspective.topPoint.y, type: 'point' });
    points.push({ id: 'horizon', x: imageRect.x + imageRect.w * 0.5, y: horizonY, type: 'line' });
  } else if (perspectiveMode === 'horizon') {
    points.push({ id: 'horizon', x: imageRect.x + imageRect.w * 0.5, y: horizonY, type: 'line' });
  }

  let hit = null;
  for (const point of points) {
    const dx = x - point.x;
    const dy = y - point.y;
    const distance = Math.hypot(dx, dy);
    if (point.type === 'point' && distance <= radius) {
      hit = point;
      break;
    }
    if (point.type === 'line' && Math.abs(dy) <= 10 && x >= imageRect.x && x <= imageRect.x + imageRect.w) {
      hit = point;
      break;
    }
  }

  return hit;
}

function setPointerDragging(target, pointerEvent) {
  const rect = getStageMetrics().imageRect;
  const position = screenToImage(pointerEvent.clientX, pointerEvent.clientY);
  state.drag = {
    target,
    pointerId: pointerEvent.pointerId,
    startX: position.x,
    startY: position.y,
    base: JSON.parse(JSON.stringify(state.perspective)),
    rect,
  };
  canvas.setPointerCapture(pointerEvent.pointerId);
}

function updateDrag(pointerEvent) {
  if (!state.drag || state.drag.pointerId !== pointerEvent.pointerId) return;
  const position = screenToImage(pointerEvent.clientX, pointerEvent.clientY);
  const base = state.drag.base;

  if (state.drag.target.id === 'pan') {
    state.view.panX = base.panX + (pointerEvent.clientX - state.drag.startX);
    state.view.panY = base.panY + (pointerEvent.clientY - state.drag.startY);
    updateViewButtons();
    requestRender();
    return;
  }

  if (state.drag.target.id === 'horizon') {
    const y = position.y;
    state.perspective.horizonY = y;
    if (state.perspectiveMode === 'one') {
      state.perspective.onePoint.x = position.x;
    }
    if (state.perspectiveMode === 'two' || state.perspectiveMode === 'three') {
      state.perspective.leftPoint.x = base.leftPoint.x;
      state.perspective.rightPoint.x = base.rightPoint.x;
      if (state.perspectiveMode === 'three') {
        state.perspective.topPoint = base.topPoint;
      }
    }
    requestRender();
    return;
  }

  if (state.drag.target.id === 'onePoint') {
    state.perspective.onePoint.x = position.x;
    state.perspective.horizonY = position.y;
  }

  if (state.drag.target.id === 'leftPoint') {
    state.perspective.leftPoint.x = position.x;
    state.perspective.horizonY = position.y;
  }

  if (state.drag.target.id === 'rightPoint') {
    state.perspective.rightPoint.x = position.x;
    state.perspective.horizonY = position.y;
  }

  if (state.drag.target.id === 'topPoint') {
    state.perspective.topPoint.x = position.x;
    state.perspective.topPoint.y = position.y;
  }

  requestRender();
}

function endDrag(pointerEvent) {
  if (!state.drag || state.drag.pointerId !== pointerEvent.pointerId) return;
  state.drag = null;
  canvas.classList.remove('is-panning');
  try {
    canvas.releasePointerCapture(pointerEvent.pointerId);
  } catch {
    // Ignore release errors.
  }
}

async function exportComposite() {
  if (!state.image) return;

  exportButton.disabled = true;
  exportButton.textContent = '导出中...';
  try {
    const source = state.image;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = source.naturalWidth;
    exportCanvas.height = source.naturalHeight;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(source, 0, 0, exportCanvas.width, exportCanvas.height);
    drawOverlay(ctx, { x: 0, y: 0, w: exportCanvas.width, h: exportCanvas.height }, { width: exportCanvas.width, height: exportCanvas.height });

    const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${state.fileName}-guides.png`;
    anchor.rel = 'noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } finally {
    exportButton.textContent = '导出合成图';
    exportButton.disabled = false;
  }
}

async function loadImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return;

  clearImage();
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;

  try {
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Image load failed'));
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  state.image = image;
  state.imageUrl = url;
  state.fileName = file.name.replace(/\.[^.]+$/, '') || 'image';
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
  updateOverlayControls();
  emptyState.classList.add('is-hidden');
  exportButton.disabled = false;
  resetButton.disabled = false;
  clearButton.disabled = false;
  updateViewButtons();
  requestRender();
}

function buildOverlayControls() {
  overlayControls.innerHTML = '';

  const groups = [
    { title: '构图辅助', items: OVERLAY_DEFS.filter((overlay) => overlay.group === 'composition') },
    { title: '透视辅助', items: OVERLAY_DEFS.filter((overlay) => overlay.group === 'perspective') },
  ];

  groups.forEach((group) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'overlay-group';

    const title = document.createElement('div');
    title.className = 'overlay-group-title';
    title.textContent = group.title;
    wrapper.appendChild(title);

    group.items.forEach((overlay) => {
      const row = document.createElement('div');
      row.className = 'overlay-item';
      row.dataset.overlayId = overlay.id;

      const left = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isOverlayActive(overlay.id);
      checkbox.addEventListener('change', () => setOverlayActive(overlay.id, checkbox.checked));

      const name = document.createElement('span');
      name.textContent = overlay.label;

      left.appendChild(checkbox);
      left.appendChild(name);

      const colorControls = document.createElement('div');
      colorControls.className = 'color-controls';

      const pointCount = getPerspectivePointCount(overlay.id);
      if (pointCount) {
        getPerspectiveColors(overlay.id, pointCount).forEach((color, index) => {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'swatch swatch-point';
          swatch.title = `切换 V${index + 1} 颜色`;
          swatch.dataset.colorIndex = String(index);
          swatch.style.background = color;
          swatch.setAttribute('aria-label', `切换 ${overlay.label} V${index + 1} 颜色`);

          const label = document.createElement('span');
          label.textContent = `V${index + 1}`;
          swatch.appendChild(label);

          swatch.addEventListener('click', () => cyclePerspectivePointColor(overlay.id, index));
          colorControls.appendChild(swatch);
        });
      } else {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'swatch';
        swatch.title = '切换颜色';
        swatch.dataset.colorIndex = '0';
        swatch.style.background = getOverlayColor(overlay.id);
        swatch.addEventListener('click', () => cycleOverlayColor(overlay.id));
        colorControls.appendChild(swatch);
      }

      row.appendChild(left);
      row.appendChild(colorControls);
      wrapper.appendChild(row);
    });

    overlayControls.appendChild(wrapper);
  });

  updateOverlayControls();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!state.image) return;
  if (state.spacePressed) {
    startPanDrag(event);
    return;
  }
  const target = getPointerTarget(event.clientX, event.clientY);
  if (target) {
    setPointerDragging(target, event);
    return;
  }
  startPanDrag(event);
});

canvas.addEventListener('pointermove', (event) => {
  if (!state.drag) return;
  updateDrag(event);
});

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  const target = event.target;
  const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) return;
  event.preventDefault();
  state.spacePressed = true;
});

window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space') return;
  state.spacePressed = false;
});

window.addEventListener('blur', () => {
  state.spacePressed = false;
});

imageInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    await loadImage(file);
  } catch {
    clearImage();
  } finally {
    imageInput.value = '';
  }
});

exportButton.addEventListener('click', exportComposite);
resetButton.addEventListener('click', resetGuides);
clearButton.addEventListener('click', clearImage);
fitButton.addEventListener('click', resetView);

guideWidthInput.addEventListener('input', () => {
  state.style.width = Number.parseFloat(guideWidthInput.value);
  requestRender();
});

stageWrap.addEventListener('dragover', (event) => {
  event.preventDefault();
});

stageWrap.addEventListener('drop', async (event) => {
  event.preventDefault();
  const [file] = event.dataTransfer.files || [];
  if (!file) return;
  try {
    await loadImage(file);
  } catch {
    clearImage();
  }
});

window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('wheel', (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.deltaY);
}, { passive: false });

window.addEventListener('beforeunload', () => {
  if (state.imageUrl) {
    URL.revokeObjectURL(state.imageUrl);
  }
});

buildOverlayControls();
resizeCanvas();
updateViewButtons();
requestRender();

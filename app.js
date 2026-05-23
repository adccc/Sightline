const canvas = document.getElementById('stage');
const stageWrap = document.getElementById('stageWrap');
const emptyState = document.getElementById('emptyState');
const imageInput = document.getElementById('imageInput');
const exportButton = document.getElementById('exportButton');
const resetButton = document.getElementById('resetButton');
const clearButton = document.getElementById('clearButton');
const fitButton = document.getElementById('fitButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const fullscreenStageWrap = document.getElementById('fullscreenStageWrap');
const fullscreenCanvas = document.getElementById('fullscreenStage');
const fullscreenCloseButton = document.getElementById('fullscreenCloseButton');
const guideWidthInput = document.getElementById('guideWidth');
const overlayControls = document.getElementById('overlayControls');
const cropRatioSelect = document.getElementById('cropRatioSelect');
const startCropButton = document.getElementById('startCropButton');
const cropActions = document.getElementById('cropActions');
const applyCropButton = document.getElementById('applyCropButton');
const cancelCropButton = document.getElementById('cancelCropButton');
const rotateButton = document.getElementById('rotateButton');
const flipHButton = document.getElementById('flipHButton');
const flipVButton = document.getElementById('flipVButton');

const COMPOSITION_COLORS = {
  grid3: '#06b6d4',
  grid4: '#ec4899',
  golden: '#facc15',
};

const PERSPECTIVE_COLORS = ['#ef4444', '#22c55e', '#6366f1'];
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
  overlays: {
    grid3: true,
    grid4: false,
    golden: false,
    one: false,
    two: false,
    three: false,
  },
  perspective: {
    horizonY: 0.5,
    onePoint: { x: 0.5 },
    leftPoint: { x: 0.22 },
    rightPoint: { x: 0.78 },
    topPoint: { x: 0.5, y: 0.18 },
  },
  fullscreen: {
    active: false,
    view: {
      zoom: 1,
      panX: 0,
      panY: 0,
    },
  },
  crop: {
    active: false,
    ratio: null,
    rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
  },
};

const pointerTracks = new Map();
const viewportPointerTracks = new WeakMap();

function getViewport(surface) {
  if (surface === 'fullscreen') {
    return {
      surface,
      canvas: fullscreenCanvas,
      wrap: fullscreenStageWrap,
      view: state.fullscreen.view,
    };
  }
  return {
    surface: 'main',
    canvas,
    wrap: stageWrap,
    view: state.view,
  };
}

function getActiveViewport() {
  return state.fullscreen.active ? getViewport('fullscreen') : getViewport('main');
}

function getPointerTrack(viewport) {
  let track = viewportPointerTracks.get(viewport.canvas);
  if (!track) {
    track = new Map();
    viewportPointerTracks.set(viewport.canvas, track);
  }
  return track;
}

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
  return COMPOSITION_COLORS[id] || PERSPECTIVE_COLORS[0];
}

function getPerspectiveColors(_id, count) {
  return PERSPECTIVE_COLORS.slice(0, count);
}

function getPerspectivePointCount(id) {
  return { one: 1, two: 2, three: 3 }[id] || 0;
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
    row.classList.toggle('is-active', isOverlayActive(id));
    if (checkbox) checkbox.checked = isOverlayActive(id);
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

function resetView(viewRef = state.view) {
  viewRef.zoom = 1;
  viewRef.panX = 0;
  viewRef.panY = 0;
  updateViewButtons();
  requestRender();
}

function getZoomForActualSize(containerW, containerH, imageW, imageH) {
  const base = fitContain(containerW, containerH, imageW, imageH);
  if (!base.w) return 1;
  return imageW / base.w;
}

function setViewToActualSize(viewRef, containerW, containerH, imageW, imageH) {
  viewRef.zoom = getZoomForActualSize(containerW, containerH, imageW, imageH);
  viewRef.panX = 0;
  viewRef.panY = 0;
}

function updateViewButtons() {
  fitButton.disabled = !state.image || (state.view.zoom === 1 && state.view.panX === 0 && state.view.panY === 0);
  fullscreenButton.disabled = !state.image;
  updateImageEditButtons();
}

function updateImageEditButtons() {
  const hasImage = Boolean(state.image);
  const cropping = state.crop.active;
  cropRatioSelect.disabled = !hasImage || cropping;
  startCropButton.disabled = !hasImage || cropping;
  rotateButton.disabled = !hasImage || cropping;
  flipHButton.disabled = !hasImage || cropping;
  flipVButton.disabled = !hasImage || cropping;
  cropActions.classList.toggle('is-hidden', !cropping);
  canvas.classList.toggle('is-cropping', cropping);
  fullscreenCanvas.classList.toggle('is-cropping', cropping);
}

function getSelectedCropRatio() {
  const value = cropRatioSelect.value;
  if (value === 'free') return null;
  const ratio = Number.parseFloat(value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

function getMaxNormalizedCropRect(ratio, imgW, imgH) {
  if (!imgW || !imgH) {
    return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  }

  if (!ratio) {
    const w = 0.8;
    const h = 0.8;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }

  let cropW = imgW;
  let cropH = cropW / ratio;
  if (cropH > imgH) {
    cropH = imgH;
    cropW = cropH * ratio;
  }

  return {
    x: (imgW - cropW) / 2 / imgW,
    y: (imgH - cropH) / 2 / imgH,
    w: cropW / imgW,
    h: cropH / imgH,
  };
}

function clampCropRect(rect, ratio) {
  const minSize = 0.05;
  let { x, y, w, h } = rect;

  if (ratio) {
    if (w / h > ratio) {
      w = h * ratio;
    } else {
      h = w / ratio;
    }
  }

  w = clamp(w, minSize, 1);
  h = clamp(h, minSize, 1);

  if (ratio) {
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    w = clamp(w, minSize, 1);
    h = clamp(h, minSize, 1);
  }

  x = clamp(x, 0, 1 - w);
  y = clamp(y, 0, 1 - h);
  return { x, y, w, h };
}

function getCropScreenRect(imageRect) {
  const { x, y, w, h } = state.crop.rect;
  return {
    x: imageRect.x + x * imageRect.w,
    y: imageRect.y + y * imageRect.h,
    w: w * imageRect.w,
    h: h * imageRect.h,
  };
}

function captureViewState() {
  const capture = (viewport) => {
    const { imageRect } = getStageMetrics(viewport);
    return {
      panX: viewport.view.panX,
      panY: viewport.view.panY,
      pixelScale: imageRect.w / state.image.naturalWidth,
    };
  };

  return {
    main: capture(getViewport('main')),
    fullscreen: capture(getViewport('fullscreen')),
  };
}

function restoreViewState(savedViews) {
  const restore = (viewport, saved) => {
    if (!state.image || !saved) return;

    const { box } = getStageMetrics(viewport);
    const base = fitContain(box.width, box.height, state.image.naturalWidth, state.image.naturalHeight);
    const nextZoom = clamp((saved.pixelScale * state.image.naturalWidth) / base.w, 0.2, 8);

    viewport.view.zoom = nextZoom;
    viewport.view.panX = saved.panX;
    viewport.view.panY = saved.panY;
  };

  restore(getViewport('main'), savedViews.main);
  restore(getViewport('fullscreen'), savedViews.fullscreen);
}

async function replaceImageFromCanvas(sourceCanvas, { preserveView = false } = {}) {
  const savedViews = preserveView ? captureViewState() : null;

  const blob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Canvas export failed');

  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;

  await new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image load failed'));
  });

  if (state.imageUrl) {
    URL.revokeObjectURL(state.imageUrl);
  }

  state.image = image;
  state.imageUrl = url;

  if (preserveView && savedViews) {
    restoreViewState(savedViews);
    updateViewButtons();
  } else {
    resetView();
    resetView(state.fullscreen.view);
  }

  updateImageEditButtons();
  requestRender();
}

async function rotateImage90() {
  if (!state.image || state.crop.active) return;

  const source = state.image;
  const output = document.createElement('canvas');
  output.width = source.naturalHeight;
  output.height = source.naturalWidth;
  const ctx = output.getContext('2d');
  if (!ctx) return;

  ctx.translate(output.width / 2, output.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
  await replaceImageFromCanvas(output, { preserveView: true });
}

async function flipImageHorizontal() {
  if (!state.image || state.crop.active) return;

  const source = state.image;
  const output = document.createElement('canvas');
  output.width = source.naturalWidth;
  output.height = source.naturalHeight;
  const ctx = output.getContext('2d');
  if (!ctx) return;

  ctx.translate(output.width / 2, output.height / 2);
  ctx.scale(-1, 1);
  ctx.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
  await replaceImageFromCanvas(output, { preserveView: true });
}

async function flipImageVertical() {
  if (!state.image || state.crop.active) return;

  const source = state.image;
  const output = document.createElement('canvas');
  output.width = source.naturalWidth;
  output.height = source.naturalHeight;
  const ctx = output.getContext('2d');
  if (!ctx) return;

  ctx.translate(output.width / 2, output.height / 2);
  ctx.scale(1, -1);
  ctx.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
  await replaceImageFromCanvas(output, { preserveView: true });
}

function enterCropMode() {
  if (!state.image) return;

  state.crop.ratio = getSelectedCropRatio();
  state.crop.rect = getMaxNormalizedCropRect(
    state.crop.ratio,
    state.image.naturalWidth,
    state.image.naturalHeight,
  );
  state.crop.active = true;
  state.drag = null;
  updateImageEditButtons();
  requestRender();
}

function cancelCropMode() {
  state.crop.active = false;
  state.drag = null;
  updateImageEditButtons();
  requestRender();
}

async function applyCrop() {
  if (!state.image || !state.crop.active) return;

  const source = state.image;
  const rect = clampCropRect(state.crop.rect, state.crop.ratio);
  const sx = Math.round(rect.x * source.naturalWidth);
  const sy = Math.round(rect.y * source.naturalHeight);
  const sw = Math.max(1, Math.round(rect.w * source.naturalWidth));
  const sh = Math.max(1, Math.round(rect.h * source.naturalHeight));

  const output = document.createElement('canvas');
  output.width = sw;
  output.height = sh;
  const ctx = output.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  state.crop.active = false;
  state.drag = null;
  await replaceImageFromCanvas(output);
}

function drawCropOverlay(ctx, imageRect, box) {
  if (!state.crop.active) return;

  const cropRect = getCropScreenRect(imageRect);
  const boxWidth = box.width;
  const boxHeight = box.height;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
  ctx.beginPath();
  ctx.rect(0, 0, boxWidth, boxHeight);
  ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
  ctx.fill('evenodd');

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(cropRect.x + 0.5, cropRect.y + 0.5, cropRect.w - 1, cropRect.h - 1);
  ctx.setLineDash([]);

  const handleSize = 8;
  [
    [cropRect.x, cropRect.y],
    [cropRect.x + cropRect.w, cropRect.y],
    [cropRect.x, cropRect.y + cropRect.h],
    [cropRect.x + cropRect.w, cropRect.y + cropRect.h],
  ].forEach(([x, y]) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(x - handleSize / 2 + 0.5, y - handleSize / 2 + 0.5, handleSize - 1, handleSize - 1);
  });

  ctx.restore();
}

function getCropPointerTarget(clientX, clientY, viewport) {
  if (!state.crop.active) return null;

  const { imageRect } = getStageMetrics(viewport);
  const box = viewport.canvas.getBoundingClientRect();
  const x = clientX - box.left;
  const y = clientY - box.top;
  const cropRect = getCropScreenRect(imageRect);
  const handleRadius = 14;

  const handles = [
    { id: 'crop-nw', x: cropRect.x, y: cropRect.y },
    { id: 'crop-ne', x: cropRect.x + cropRect.w, y: cropRect.y },
    { id: 'crop-sw', x: cropRect.x, y: cropRect.y + cropRect.h },
    { id: 'crop-se', x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h },
  ];

  for (const handle of handles) {
    if (Math.hypot(x - handle.x, y - handle.y) <= handleRadius) {
      return { id: handle.id, type: 'crop-handle' };
    }
  }

  if (x >= cropRect.x && x <= cropRect.x + cropRect.w && y >= cropRect.y && y <= cropRect.y + cropRect.h) {
    return { id: 'crop-move', type: 'crop-move' };
  }

  return null;
}

function setCropDragging(target, pointerEvent, viewport) {
  state.drag = {
    target,
    pointerId: pointerEvent.pointerId,
    startX: pointerEvent.clientX,
    startY: pointerEvent.clientY,
    base: { ...state.crop.rect },
    imageRect: getStageMetrics(viewport).imageRect,
    viewport,
  };
  viewport.canvas.setPointerCapture(pointerEvent.pointerId);
}

function resizeCropFromHandle(position, baseRect, handleId, ratio) {
  let x1 = baseRect.x;
  let y1 = baseRect.y;
  let x2 = baseRect.x + baseRect.w;
  let y2 = baseRect.y + baseRect.h;
  const px = clamp(position.x, 0, 1);
  const py = clamp(position.y, 0, 1);

  if (handleId === 'crop-se') {
    x2 = px;
    y2 = py;
  } else if (handleId === 'crop-sw') {
    x1 = px;
    y2 = py;
  } else if (handleId === 'crop-ne') {
    x2 = px;
    y1 = py;
  } else if (handleId === 'crop-nw') {
    x1 = px;
    y1 = py;
  }

  let w = x2 - x1;
  let h = y2 - y1;

  if (w < 0) {
    const nextX1 = x2;
    x2 = x1;
    x1 = nextX1;
    w = x2 - x1;
  }
  if (h < 0) {
    const nextY1 = y2;
    y2 = y1;
    y1 = nextY1;
    h = y2 - y1;
  }

  if (ratio) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;

    if (handleId === 'crop-se') {
      x2 = x1 + w;
      y2 = y1 + h;
    } else if (handleId === 'crop-sw') {
      x1 = x2 - w;
      y2 = y1 + h;
    } else if (handleId === 'crop-ne') {
      x2 = x1 + w;
      y1 = y2 - h;
    } else if (handleId === 'crop-nw') {
      x1 = x2 - w;
      y1 = y2 - h;
    }
  }

  return clampCropRect({
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
  }, ratio);
}

function setZoomAt(viewport, clientX, clientY, nextZoom) {
  if (!state.image) return;

  const { canvas: targetCanvas, view } = viewport;
  const box = targetCanvas.getBoundingClientRect();
  const before = screenToImage(clientX, clientY, viewport);
  const clampedZoom = clamp(nextZoom, 0.2, 8);
  const base = fitContain(box.width, box.height, state.image.naturalWidth, state.image.naturalHeight);
  const nextW = base.w * clampedZoom;
  const nextH = base.h * clampedZoom;
  const localX = clientX - box.left;
  const localY = clientY - box.top;

  view.zoom = clampedZoom;
  view.panX = localX - box.width / 2 - (before.x - 0.5) * nextW;
  view.panY = localY - box.height / 2 - (before.y - 0.5) * nextH;
  updateViewButtons();
  requestRender();
}

function zoomAt(clientX, clientY, deltaY, viewport = getActiveViewport()) {
  if (!state.image) return;
  const factor = Math.exp(-deltaY * 0.0012);
  setZoomAt(viewport, clientX, clientY, viewport.view.zoom * factor);
}

function startPanDrag(pointerEvent, viewport = getActiveViewport()) {
  state.drag = {
    target: { id: 'pan' },
    pointerId: pointerEvent.pointerId,
    startX: pointerEvent.clientX,
    startY: pointerEvent.clientY,
    base: { ...viewport.view },
    viewport,
  };
  viewport.canvas.classList.add('is-panning');
  viewport.canvas.setPointerCapture(pointerEvent.pointerId);
}

function clearPinch(viewport) {
  pointerTracks.delete(viewport.canvas);
}

function getPinchMetrics(track) {
  const points = [...track.values()];
  if (points.length < 2) return null;
  const [first, second] = points;
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
  };
}

function startPinchIfNeeded(viewport) {
  const track = getPointerTrack(viewport);
  if (track.size !== 2) return;

  const metrics = getPinchMetrics(track);
  if (!metrics || metrics.distance < 8) return;

  if (state.drag?.viewport?.canvas === viewport.canvas) {
    endDrag({ pointerId: state.drag.pointerId }, viewport);
  }

  pointerTracks.set(viewport.canvas, {
    startDistance: metrics.distance,
    startZoom: viewport.view.zoom,
    startPanX: viewport.view.panX,
    startPanY: viewport.view.panY,
    anchor: screenToImage(metrics.centerX, metrics.centerY, viewport),
    centerX: metrics.centerX,
    centerY: metrics.centerY,
  });
}

function updatePinch(viewport) {
  const track = getPointerTrack(viewport);
  const pinch = pointerTracks.get(viewport.canvas);
  if (!pinch || track.size !== 2) return;

  const metrics = getPinchMetrics(track);
  if (!metrics || !metrics.distance) return;

  const ratio = metrics.distance / pinch.startDistance;
  const nextZoom = clamp(pinch.startZoom * ratio, 0.2, 8);
  const box = viewport.canvas.getBoundingClientRect();
  const base = fitContain(box.width, box.height, state.image.naturalWidth, state.image.naturalHeight);
  const nextW = base.w * nextZoom;
  const nextH = base.h * nextZoom;
  const localX = metrics.centerX - box.left;
  const localY = metrics.centerY - box.top;

  viewport.view.zoom = nextZoom;
  viewport.view.panX = localX - box.width / 2 - (pinch.anchor.x - 0.5) * nextW;
  viewport.view.panY = localY - box.height / 2 - (pinch.anchor.y - 0.5) * nextH;
  updateViewButtons();
  requestRender();
}

function clearImage() {
  if (state.imageUrl) {
    URL.revokeObjectURL(state.imageUrl);
  }
  closeFullscreen();
  state.image = null;
  state.imageUrl = '';
  state.fileName = 'image';
  state.drag = null;
  state.crop.active = false;
  state.crop.ratio = null;
  clearPinch(getViewport('main'));
  clearPinch(getViewport('fullscreen'));
  getPointerTrack(getViewport('main')).clear();
  getPointerTrack(getViewport('fullscreen')).clear();
  emptyState.classList.remove('is-hidden');
  exportButton.disabled = true;
  resetButton.disabled = true;
  clearButton.disabled = true;
  updateViewButtons();
  updateImageEditButtons();
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

function getImageRect(containerW, containerH, imageW, imageH, viewRef = state.view) {
  const base = fitContain(containerW, containerH, imageW, imageH);
  const w = base.w * viewRef.zoom;
  const h = base.h * viewRef.zoom;
  return {
    x: containerW / 2 + viewRef.panX - w / 2,
    y: containerH / 2 + viewRef.panY - h / 2,
    w,
    h,
  };
}

function resizeTargetCanvas(targetCanvas, wrap) {
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (targetCanvas.width !== width || targetCanvas.height !== height) {
    targetCanvas.width = width;
    targetCanvas.height = height;
  }

  targetCanvas.style.width = `${rect.width}px`;
  targetCanvas.style.height = `${rect.height}px`;
}

function resizeCanvas() {
  resizeTargetCanvas(canvas, stageWrap);
  if (state.fullscreen.active) {
    resizeTargetCanvas(fullscreenCanvas, fullscreenStageWrap);
  }
  requestRender();
}

function getStageMetrics(viewport = getActiveViewport()) {
  const box = viewport.canvas.getBoundingClientRect();
  const imageRect = state.image
    ? getImageRect(box.width, box.height, state.image.naturalWidth, state.image.naturalHeight, viewport.view)
    : { x: 0, y: 0, w: box.width, h: box.height };
  return { box, imageRect, viewport };
}

function screenToImage(clientX, clientY, viewport = getActiveViewport()) {
  const { box, imageRect } = getStageMetrics(viewport);
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
      samples.forEach((sample) => {
        const target = rect.x + rect.w * sample.x;
        const targetY = rect.y + rect.h * sample.y;
        drawLine(ctx, left.x, left.y, target, targetY, leftColor, width, 0.82);
        drawLine(ctx, right.x, right.y, target, targetY, rightColor, width, 0.82);
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
      samples.forEach((sample) => {
        const target = rect.x + rect.w * sample.x;
        const targetY = rect.y + rect.h * sample.y;
        drawLine(ctx, left.x, left.y, target, targetY, leftColor, width, 0.8);
        drawLine(ctx, right.x, right.y, target, targetY, rightColor, width, 0.8);
        drawLine(ctx, top.x, top.y, target, targetY, topColor, width, 0.8);
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

function renderViewport(targetCanvas, viewport) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const { box, imageRect } = getStageMetrics(viewport);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);

  if (!state.image) {
    ctx.save();
    ctx.fillStyle = viewport.surface === 'fullscreen' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.08)';
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
  drawCropOverlay(ctx, imageRect, box);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(imageRect.x + 0.5, imageRect.y + 0.5, imageRect.w - 1, imageRect.h - 1);
  ctx.restore();
}

function render() {
  renderViewport(canvas, getViewport('main'));
  if (state.fullscreen.active) {
    renderViewport(fullscreenCanvas, getViewport('fullscreen'));
  }
}

function getPointerTarget(clientX, clientY, viewport = getActiveViewport()) {
  const { imageRect } = getStageMetrics(viewport);
  const box = viewport.canvas.getBoundingClientRect();
  const x = clientX - box.left;
  const y = clientY - box.top;
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

function setPointerDragging(target, pointerEvent, viewport = getActiveViewport()) {
  const rect = getStageMetrics(viewport).imageRect;
  const position = screenToImage(pointerEvent.clientX, pointerEvent.clientY, viewport);
  state.drag = {
    target,
    pointerId: pointerEvent.pointerId,
    startX: position.x,
    startY: position.y,
    base: JSON.parse(JSON.stringify(state.perspective)),
    rect,
    viewport,
  };
  viewport.canvas.setPointerCapture(pointerEvent.pointerId);
}

function updateDrag(pointerEvent) {
  if (!state.drag || state.drag.pointerId !== pointerEvent.pointerId) return;
  const viewport = state.drag.viewport || getViewport('main');
  const position = screenToImage(pointerEvent.clientX, pointerEvent.clientY, viewport);
  const base = state.drag.base;

  if (state.drag.target.type === 'crop-move') {
    const imageRect = state.drag.imageRect;
    const deltaX = (pointerEvent.clientX - state.drag.startX) / imageRect.w;
    const deltaY = (pointerEvent.clientY - state.drag.startY) / imageRect.h;
    state.crop.rect = clampCropRect({
      x: base.x + deltaX,
      y: base.y + deltaY,
      w: base.w,
      h: base.h,
    }, state.crop.ratio);
    requestRender();
    return;
  }

  if (state.drag.target.type === 'crop-handle') {
    state.crop.rect = resizeCropFromHandle(position, base, state.drag.target.id, state.crop.ratio);
    requestRender();
    return;
  }

  if (state.drag.target.id === 'pan') {
    viewport.view.panX = base.panX + (pointerEvent.clientX - state.drag.startX);
    viewport.view.panY = base.panY + (pointerEvent.clientY - state.drag.startY);
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

function endDrag(pointerEvent, viewport = state.drag?.viewport || getActiveViewport()) {
  if (!state.drag || state.drag.pointerId !== pointerEvent.pointerId) return;
  state.drag = null;
  viewport.canvas.classList.remove('is-panning');
  try {
    viewport.canvas.releasePointerCapture(pointerEvent.pointerId);
  } catch {
    // Ignore release errors.
  }
}

function openFullscreen() {
  if (!state.image || state.fullscreen.active) return;

  state.fullscreen.active = true;
  fullscreenOverlay.classList.remove('is-hidden');
  fullscreenOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-fullscreen-open');
  resizeTargetCanvas(fullscreenCanvas, fullscreenStageWrap);

  const box = fullscreenCanvas.getBoundingClientRect();
  setViewToActualSize(
    state.fullscreen.view,
    box.width,
    box.height,
    state.image.naturalWidth,
    state.image.naturalHeight,
  );

  requestRender();
}

function closeFullscreen() {
  if (!state.fullscreen.active) return;

  state.fullscreen.active = false;
  state.drag = null;
  clearPinch(getViewport('fullscreen'));
  getPointerTrack(getViewport('fullscreen')).clear();
  fullscreenOverlay.classList.add('is-hidden');
  fullscreenOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-fullscreen-open');
  fullscreenCanvas.classList.remove('is-panning');
  requestRender();
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
  updateImageEditButtons();
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
          const swatch = document.createElement('span');
          swatch.className = 'swatch swatch-point swatch-sample';
          swatch.style.background = color;
          swatch.setAttribute('aria-hidden', 'true');

          const label = document.createElement('span');
          label.textContent = `V${index + 1}`;
          swatch.appendChild(label);
          colorControls.appendChild(swatch);
        });
      } else {
        const swatch = document.createElement('span');
        swatch.className = 'swatch swatch-sample';
        swatch.style.background = getOverlayColor(overlay.id);
        swatch.setAttribute('aria-hidden', 'true');
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

function bindStageEvents(targetCanvas, viewportFactory) {
  targetCanvas.addEventListener('pointerdown', (event) => {
    if (!state.image) return;

    const viewport = viewportFactory();
    const track = getPointerTrack(viewport);
    track.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (track.size >= 2) {
      startPinchIfNeeded(viewport);
      return;
    }

    if (state.spacePressed) {
      startPanDrag(event, viewport);
      return;
    }

    if (state.crop.active) {
      const cropTarget = getCropPointerTarget(event.clientX, event.clientY, viewport);
      if (cropTarget) {
        setCropDragging(cropTarget, event, viewport);
        return;
      }
      startPanDrag(event, viewport);
      return;
    }

    const target = getPointerTarget(event.clientX, event.clientY, viewport);
    if (target) {
      setPointerDragging(target, event, viewport);
      return;
    }
    startPanDrag(event, viewport);
  });

  targetCanvas.addEventListener('pointermove', (event) => {
    const viewport = viewportFactory();
    const track = getPointerTrack(viewport);
    if (track.has(event.pointerId)) {
      track.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (track.size >= 2 && pointerTracks.has(viewport.canvas)) {
      updatePinch(viewport);
      return;
    }

    if (!state.drag) return;
    updateDrag(event);
  });

  const handlePointerEnd = (event) => {
    const viewport = viewportFactory();
    const track = getPointerTrack(viewport);
    track.delete(event.pointerId);

    if (track.size < 2) {
      clearPinch(viewport);
    } else if (track.size === 2) {
      startPinchIfNeeded(viewport);
    }

    endDrag(event, viewport);
  };

  targetCanvas.addEventListener('pointerup', handlePointerEnd);
  targetCanvas.addEventListener('pointercancel', handlePointerEnd);

  targetCanvas.addEventListener('wheel', (event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY, viewportFactory());
  }, { passive: false });
}

bindStageEvents(canvas, () => getViewport('main'));
bindStageEvents(fullscreenCanvas, () => getViewport('fullscreen'));

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && state.crop.active) {
    event.preventDefault();
    cancelCropMode();
    return;
  }
  if (event.code === 'Escape' && state.fullscreen.active) {
    event.preventDefault();
    closeFullscreen();
    return;
  }
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
fitButton.addEventListener('click', () => resetView());
fullscreenButton.addEventListener('click', openFullscreen);
fullscreenCloseButton.addEventListener('click', closeFullscreen);
startCropButton.addEventListener('click', enterCropMode);
applyCropButton.addEventListener('click', () => {
  applyCrop().catch(() => {});
});
cancelCropButton.addEventListener('click', cancelCropMode);
rotateButton.addEventListener('click', () => {
  rotateImage90().catch(() => {});
});
flipHButton.addEventListener('click', () => {
  flipImageHorizontal().catch(() => {});
});
flipVButton.addEventListener('click', () => {
  flipImageVertical().catch(() => {});
});

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

window.addEventListener('beforeunload', () => {
  if (state.imageUrl) {
    URL.revokeObjectURL(state.imageUrl);
  }
});

buildOverlayControls();
resizeCanvas();
updateViewButtons();
updateImageEditButtons();
requestRender();

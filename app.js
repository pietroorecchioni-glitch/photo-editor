'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  sourceCanvas: null,  // offscreen canvas used as drawing source
  rotation: 0,
  flipH: false,
  flipV: false,
  filter: 'none',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const uploadArea = document.getElementById('upload-area');
const fileInput  = document.getElementById('file-input');
const editor     = document.getElementById('editor');
const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d');

const sliders = {
  brightness: document.getElementById('brightness'),
  contrast:   document.getElementById('contrast'),
  saturation: document.getElementById('saturation'),
  blur:       document.getElementById('blur'),
};

const valLabels = {
  brightness: document.getElementById('brightness-val'),
  contrast:   document.getElementById('contrast-val'),
  saturation: document.getElementById('saturation-val'),
  blur:       document.getElementById('blur-val'),
};

// ── Upload ────────────────────────────────────────────────────────────────
// On iOS, programmatic .click() on hidden inputs can be blocked.
// The <label for="file-input"> in HTML handles the tap natively — no JS needed.
// We only add the drag-and-drop handlers (unused on iPad but harmless).

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) loadFile(file);
  // Reset so the same file can be re-selected
  fileInput.value = '';
});

// ── Load & scale ──────────────────────────────────────────────────────────
const MAX_PX = 1600; // safe limit for iOS Safari canvas memory

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    URL.revokeObjectURL(url);

    let w = img.naturalWidth  || img.width;
    let h = img.naturalHeight || img.height;

    // Scale down to fit within MAX_PX (iPhone photos are 12MP+)
    if (w > MAX_PX || h > MAX_PX) {
      const r = Math.min(MAX_PX / w, MAX_PX / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }

    // Store a pre-scaled offscreen canvas as the source.
    // Drawing canvas→canvas avoids a second decode and toDataURL round-trip.
    const off = document.createElement('canvas');
    off.width  = w;
    off.height = h;
    off.getContext('2d').drawImage(img, 0, 0, w, h);

    state.sourceCanvas = off;
    resetState();
    drawImage();
    showEditor();
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("Impossibile caricare l'immagine. Prova con un altro file.");
  };

  img.src = url;
}

// ── Show / hide ───────────────────────────────────────────────────────────
function showEditor() {
  uploadArea.classList.add('hidden');
  editor.classList.remove('hidden');
}

function showUpload() {
  editor.classList.add('hidden');
  uploadArea.classList.remove('hidden');
}

// ── Draw ──────────────────────────────────────────────────────────────────
function drawImage() {
  const src = state.sourceCanvas;
  if (!src) return;

  const iw = src.width;
  const ih = src.height;

  const rad = (state.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  const cw = Math.round(iw * cos + ih * sin);
  const ch = Math.round(iw * sin + ih * cos);

  canvas.width  = cw;
  canvas.height = ch;

  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(rad);
  ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
  ctx.drawImage(src, -iw / 2, -ih / 2);
  ctx.restore();

  applyFilters();
}

// ── Filters via ImageData ─────────────────────────────────────────────────
function applyFilters() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const brightness = state.brightness;
  const contrast   = state.contrast;
  const saturation = state.saturation;
  const cFactor    = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r += brightness;
    g += brightness;
    b += brightness;

    r = cFactor * (r - 128) + 128;
    g = cFactor * (g - 128) + 128;
    b = cFactor * (b - 128) + 128;

    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sF   = 1 + saturation / 100;
    r = gray + sF * (r - gray);
    g = gray + sF * (g - gray);
    b = gray + sF * (b - gray);

    switch (state.filter) {
      case 'grayscale': {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = g = b = l;
        break;
      }
      case 'sepia': {
        const tr = 0.393 * r + 0.769 * g + 0.189 * b;
        const tg = 0.349 * r + 0.686 * g + 0.168 * b;
        const tb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = tr; g = tg; b = tb;
        break;
      }
      case 'invert':
        r = 255 - r; g = 255 - g; b = 255 - b;
        break;
      case 'vintage':
        r = r * 0.9 + 20; g = g * 0.85 + 10; b = b * 0.7;
        break;
      case 'cold':
        b = Math.min(255, b + 40); r = Math.max(0, r - 20);
        break;
      case 'warm':
        r = Math.min(255, r + 30); b = Math.max(0, b - 20);
        break;
    }

    data[i]     = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  ctx.putImageData(imageData, 0, 0);
  canvas.style.filter = state.blur > 0 ? `blur(${state.blur}px)` : '';
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ── Sliders ───────────────────────────────────────────────────────────────
Object.entries(sliders).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    valLabels[key].textContent = input.value;
    drawImage();
  });
});

// ── Filter buttons ────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    drawImage();
  });
});

// ── Transform buttons ─────────────────────────────────────────────────────
document.getElementById('rotate-left').addEventListener('click', () => {
  state.rotation = (state.rotation - 90 + 360) % 360;
  drawImage();
});

document.getElementById('rotate-right').addEventListener('click', () => {
  state.rotation = (state.rotation + 90) % 360;
  drawImage();
});

document.getElementById('flip-h').addEventListener('click', () => {
  state.flipH = !state.flipH;
  drawImage();
});

document.getElementById('flip-v').addEventListener('click', () => {
  state.flipV = !state.flipV;
  drawImage();
});

// ── Reset ─────────────────────────────────────────────────────────────────
document.getElementById('reset-btn').addEventListener('click', () => {
  resetState();
  drawImage();
});

function resetState() {
  state.rotation   = 0;
  state.flipH      = false;
  state.flipV      = false;
  state.filter     = 'none';
  state.brightness = 0;
  state.contrast   = 0;
  state.saturation = 0;
  state.blur       = 0;

  Object.entries(sliders).forEach(([key, input]) => {
    input.value = 0;
    valLabels[key].textContent = 0;
  });

  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('[data-filter="none"]').classList.add('active');
  canvas.style.filter = '';
}

// ── Download ──────────────────────────────────────────────────────────────
document.getElementById('download-btn').addEventListener('click', () => {
  const off  = document.createElement('canvas');
  off.width  = canvas.width;
  off.height = canvas.height;
  const octx = off.getContext('2d');
  if (state.blur > 0) octx.filter = `blur(${state.blur}px)`;
  octx.drawImage(canvas, 0, 0);

  const link = document.createElement('a');
  link.download = 'foto_modificata.png';
  link.href = off.toDataURL('image/png');
  link.click();
});

// ── New photo ─────────────────────────────────────────────────────────────
document.getElementById('new-photo-btn').addEventListener('click', () => {
  state.sourceCanvas = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showUpload();
});

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  originalImage: null,   // ImageData of the original (post-transform)
  sourceImage: null,     // HTMLImageElement
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
const uploadArea   = document.getElementById('upload-area');
const fileInput    = document.getElementById('file-input');
const editor       = document.getElementById('editor');
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');

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
uploadArea.addEventListener('click', () => fileInput.click());

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
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.sourceImage = img;
    resetState();
    drawImage();
    showEditor();
    URL.revokeObjectURL(url);
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
  fileInput.value = '';
}

// ── Draw ──────────────────────────────────────────────────────────────────
function drawImage() {
  const img = state.sourceImage;
  if (!img) return;

  const rad = (state.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  const w = img.width * cos + img.height * sin;
  const h = img.width * sin + img.height * cos;

  canvas.width  = Math.round(w);
  canvas.height = Math.round(h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
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

  // Pre-compute contrast factor
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness
    r += brightness;
    g += brightness;
    b += brightness;

    // Contrast
    r = cFactor * (r - 128) + 128;
    g = cFactor * (g - 128) + 128;
    b = cFactor * (b - 128) + 128;

    // Saturation
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sF = 1 + saturation / 100;
    r = gray + sF * (r - gray);
    g = gray + sF * (g - gray);
    b = gray + sF * (b - gray);

    // Named filter
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
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
        break;
      case 'vintage':
        r = r * 0.9 + 20;
        g = g * 0.85 + 10;
        b = b * 0.7;
        break;
      case 'cold':
        b = Math.min(255, b + 40);
        r = Math.max(0, r - 20);
        break;
      case 'warm':
        r = Math.min(255, r + 30);
        b = Math.max(0, b - 20);
        break;
    }

    data[i]     = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  ctx.putImageData(imageData, 0, 0);

  // CSS blur (fast, hardware-accelerated)
  canvas.style.filter = state.blur > 0 ? `blur(${state.blur}px)` : '';
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ── Sliders ───────────────────────────────────────────────────────────────
Object.entries(sliders).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    const val = Number(input.value);
    state[key] = val;
    valLabels[key].textContent = val;
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
  state.rotation  = 0;
  state.flipH     = false;
  state.flipV     = false;
  state.filter    = 'none';
  state.brightness = 0;
  state.contrast   = 0;
  state.saturation = 0;
  state.blur       = 0;

  // Reset sliders UI
  Object.entries(sliders).forEach(([key, input]) => {
    input.value = 0;
    valLabels[key].textContent = 0;
  });

  // Reset filter buttons
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('[data-filter="none"]').classList.add('active');

  canvas.style.filter = '';
}

// ── Download ──────────────────────────────────────────────────────────────
document.getElementById('download-btn').addEventListener('click', () => {
  // Render to an off-screen canvas to bake in the CSS blur
  const offscreen = document.createElement('canvas');
  offscreen.width  = canvas.width;
  offscreen.height = canvas.height;
  const octx = offscreen.getContext('2d');

  if (state.blur > 0) {
    octx.filter = `blur(${state.blur}px)`;
  }
  octx.drawImage(canvas, 0, 0);

  const link = document.createElement('a');
  link.download = 'foto_modificata.png';
  link.href = offscreen.toDataURL('image/png');
  link.click();
});

// ── New photo ─────────────────────────────────────────────────────────────
document.getElementById('new-photo-btn').addEventListener('click', () => {
  state.sourceImage = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showUpload();
});

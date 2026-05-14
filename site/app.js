const root = document.documentElement;
const cursorCapture = document.querySelector('.cursor-capture');
const cursorCore = document.querySelector('.cursor-core');
const flipPanels = document.querySelectorAll('[data-flip-panel]');
const uploadForm = document.querySelector('[data-upload-form]');
const uploadInput = document.querySelector('[data-demo-upload]');
const uploadStatus = document.querySelector('[data-upload-status]');

const allowedArchives = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz'];

let pointerFrame = 0;
let latestPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

function setPointer(x, y) {
  root.style.setProperty('--cursor-x', `${x}px`);
  root.style.setProperty('--cursor-y', `${y}px`);
}

function schedulePointer(x, y) {
  latestPointer = { x, y };
  if (pointerFrame) return;
  pointerFrame = window.requestAnimationFrame(() => {
    pointerFrame = 0;
    setPointer(latestPointer.x, latestPointer.y);
  });
}

function archiveExtension(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'gz';
  return lower.split('.').pop() || '';
}

function validateArchive(file) {
  if (!file) return { ok: false, message: 'No archive selected.' };
  const ext = archiveExtension(file.name);
  if (!allowedArchives.includes(ext)) {
    return { ok: false, message: 'Unsupported archive. Upload zip, 7z, rar, tar, tar.gz or tgz.' };
  }
  if (file.size > 512 * 1024 * 1024) {
    return { ok: false, message: 'Archive is larger than the 512 MB service limit.' };
  }
  return {
    ok: true,
    message: `${file.name} is ready. Productized return artifact will be a zip file.`,
  };
}

function updateUploadStatus() {
  if (!uploadInput || !uploadStatus) return;
  const file = uploadInput.files?.[0];
  const result = validateArchive(file);
  uploadStatus.textContent = result.message;
  uploadStatus.dataset.state = result.ok ? 'ready' : 'idle';
}

document.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse') return;
  schedulePointer(event.clientX, event.clientY);
}, { passive: true });

for (const panel of flipPanels) {
  const open = () => panel.classList.add('flipped');
  const close = () => panel.classList.remove('flipped');
  panel.addEventListener('pointerenter', open);
  panel.addEventListener('pointerleave', close);
  panel.addEventListener('focusin', open);
  panel.addEventListener('focusout', close);
  panel.addEventListener('touchstart', open, { passive: true });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      panel.classList.toggle('flipped');
    }
    if (event.key === 'Escape') close();
  });
}

uploadInput?.addEventListener('change', updateUploadStatus);
uploadForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  updateUploadStatus();
});

if (!matchMedia('(pointer: fine)').matches) {
  cursorCapture?.remove();
  cursorCore?.remove();
}

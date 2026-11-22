const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: false });
const status = document.querySelector('#status');
const controls = [...document.querySelectorAll('[data-button]')];
const soundButton = document.querySelector('#sound');
const pauseButton = document.querySelector('#pause');
const romPrompt = document.querySelector('.rom-prompt');
const chooseRomButton = document.querySelector('#choose-rom');
const pausedOverlay = document.querySelector('.paused-overlay');
let muted = true, paused = false, latestFrame;
let audio, oscillator, gain;
const activeInputs = new Map();

const symbols = [
  ['Food', '<path d="M3 3v5c0 3 5 3 5 0V3M5.5 3v18M13 21V3c-3 3-4 7 0 9M19 3v18"/><path d="M19 3c-5 3-5 9 0 9" fill="currentColor"/>'],
  ['Light', '<path d="M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7ZM9 19h6m-5 3h4M12 1v-1M3 3 1 1m22 0-2 2M2 10H0m24 0h-2M3 17l-2 2m20-2 2 2M10 15V9l2 2 2-2v6"/>'],
  ['Game', '<circle cx="6" cy="6" r="3.5"/><circle cx="5" cy="5" r=".65" fill="currentColor" stroke="none"/><circle cx="7" cy="7" r=".65" fill="currentColor" stroke="none"/><path d="m5 21 3 1 13-14c2-2-1-5-3-3L5 18Zm-2 2 3-3" fill="currentColor"/>'],
  ['Medicine', '<g transform="rotate(-35 12 12)"><path d="M8 6h8v11H8ZM6 6h12M12 1v5M9 1h6M12 17v6M6 17h12m-4-8h2m-2 4h2"/></g>'],
  ['Clean', '<path d="M4 13c-4-3-1-8 3-7l3 3c6-2 11 0 11 5 0 5-4 7-10 7-5 0-8-3-7-8ZM3 9 0 11l4 1m4 2c2 5 8 4 9 0M13 6l2-3m3 4 3-2"/><circle cx="5.5" cy="8.5" r=".8" fill="currentColor" stroke="none"/>'],
  ['Health', '<path d="M2 7Q12-1 22 7l-4 14H6ZM5 8l2 2m2-4 1 3m4-3-1 3m6-1-2 2M12 16l3-6"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'],
  ['Discipline', '<path d="M13 3a9 9 0 1 0 0 18l-6-9Z" fill="currentColor" stroke="none"/><path d="m17 8 3-3m-3 7h6m-6 4 3 3"/>'],
  ['Attention', '<path d="M13 9c-1-8-12-8-12 0s10 10 12 3c2 9 10 8 10 2s-7-9-10-5Z"/><path d="m3 10 2 2 4-2m7 5 2 1 3-2"/><circle cx="5" cy="7" r=".8" fill="currentColor" stroke="none"/><circle cx="9" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="17" cy="11" r=".8" fill="currentColor" stroke="none"/><circle cx="20" cy="12" r=".8" fill="currentColor" stroke="none"/>'],
];
const icons = symbols.map(([label, path], index) => {
  const node = document.createElement('span');
  node.className = 'icon';
  node.title = label;
  node.setAttribute('aria-label', label);
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  document.querySelector(index < 4 ? '#icons-top' : '#icons-bottom').append(node);
  return node;
});

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function draw(frame) {
  latestFrame = frame;
  context.fillStyle = '#b6bf92';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      context.fillStyle = (frame.rows[y] >>> x) & 1 ? '#303d2b' : '#acb68a';
      context.fillRect(x * 8, y * 8, 7, 7);
    }
  }
  canvas.dataset.painted = 'true';
  icons.forEach((node, index) => node.classList.toggle('active', Boolean(frame.icons & (1 << index))));
  paused = frame.paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-pressed', String(paused));
  pausedOverlay.hidden = !paused;
  updateSound();
}
function updateSound() {
  if (!audio || !latestFrame) return;
  const audible = !muted && !paused && latestFrame.sounding && latestFrame.frequency > 0;
  oscillator.frequency.setValueAtTime(Math.max(1, Math.min(12000, latestFrame.frequency)), audio.currentTime);
  gain.gain.setTargetAtTime(audible ? 0.035 : 0, audio.currentTime, 0.005);
}
soundButton.addEventListener('click', async () => {
  if (!audio) {
    audio = new AudioContext();
    oscillator = audio.createOscillator();
    oscillator.type = 'square';
    gain = audio.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
  }
  try { await audio.resume(); } catch { showStatus('Sound could not start', true); return; }
  muted = !muted;
  soundButton.textContent = muted ? 'Sound off' : 'Sound on';
  soundButton.setAttribute('aria-pressed', String(!muted));
  updateSound();
});
pauseButton.addEventListener('click', () => { releaseAll(); window.pet.pause(!paused); });
document.querySelector('#save').addEventListener('click', () => { showStatus('Saving…'); window.pet.save(); });

function setInput(source, key, pressed) {
  const before = [...activeInputs.values()].includes(key);
  if (pressed) activeInputs.set(source, key); else activeInputs.delete(source);
  const after = [...activeInputs.values()].includes(key);
  if (before !== after) window.pet.button(key, after);
  controls.find(node => node.dataset.button === key)?.classList.toggle('held', after);
}
function releaseAll() {
  for (const key of new Set(activeInputs.values())) window.pet.button(key, false);
  activeInputs.clear();
  controls.forEach(node => node.classList.remove('held'));
}
for (const button of controls) {
  const key = button.dataset.button;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.isTrusted) button.setPointerCapture(event.pointerId);
    setInput(`pointer:${event.pointerId}`, key, true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => setInput(`pointer:${event.pointerId}`, key, false));
  }
  button.addEventListener('keydown', event => {
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setInput(`control:${key}`, key, true); }
  });
  button.addEventListener('keyup', event => {
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setInput(`control:${key}`, key, false); }
  });
  button.addEventListener('blur', () => setInput(`control:${key}`, key, false));
}
const keyMap = { KeyA: 'A', KeyB: 'B', KeyC: 'C', ArrowLeft: 'A', ArrowDown: 'B', ArrowRight: 'C' };
window.addEventListener('keydown', event => {
  const key = keyMap[event.code];
  if (key && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    setInput(`keyboard:${event.code}`, key, true);
  }
});
window.addEventListener('keyup', event => {
  const key = keyMap[event.code];
  if (key) { event.preventDefault(); setInput(`keyboard:${event.code}`, key, false); }
});
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

function receive(data) {
  if (data.type === 'rom-required') {
    romPrompt.hidden = false;
    document.querySelector('#rom-message').textContent = data.message;
    showStatus('');
    return;
  }
  romPrompt.hidden = true;
  if (data.type === 'frame') draw(data);
  else if (data.type === 'saved') {
    showStatus('Saved');
  } else if (data.type === 'error' || data.type === 'status') showStatus(data.message, data.type === 'error');
}
window.pet.onUpdate(receive);
window.pet.ready().then(snapshot => {
  if (snapshot?.status) receive(snapshot.status);
  if (snapshot?.frame) draw(snapshot.frame);
}).catch(error => showStatus(error.message, true));

const menu = document.querySelector('footer');
window.addEventListener('contextmenu', event => {
  event.preventDefault();
  menu.hidden = !menu.hidden;
});
window.addEventListener('pointerdown', event => {
  if (!menu.contains(event.target)) menu.hidden = true;
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') menu.hidden = true;
});

chooseRomButton.addEventListener('click', async () => {
  chooseRomButton.disabled = true;
  try { await window.pet.chooseRom(); }
  catch { document.querySelector('#rom-message').textContent = 'Could not open the file picker. Try again.'; }
  finally { chooseRomButton.disabled = false; }
});

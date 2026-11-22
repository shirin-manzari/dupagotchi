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

// Recreate the original P1 shell symbols in ROM bit order.
const symbols = [
  ['Food', '<path d="M3 2 2 8c0 3 2 4 3 5L4 22h4l-1-9c2-1 3-3 2-5L8 2H7v6H6V2H5v6H4V2ZM18 2c-4 3-6 8-6 13h4l-1 7h5V2Z" fill="currentColor" stroke="none"/>'],
  ['Light', '<path d="M9 16c0-2-3-3-3-6a6 6 0 0 1 12 0c0 3-3 4-3 6Zm0 3h6m-5 3h4M12 15v-4L9 9m3 2 3-2M12 1V0M5 4 3 2M2 9H0m4 5-2 1M19 4l2-2m1 7h2m-4 5 2 1"/>'],
  ['Game', '<circle cx="6" cy="6" r="4"/><circle cx="5" cy="5" r=".8" fill="currentColor" stroke="none"/><circle cx="7.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/><path d="m8 16 10-11c3-3 7 1 4 4L11 19Z" fill="currentColor" stroke="none"/><path d="m9 18-5 5m-2-2 4 2"/>'],
  ['Medicine', '<g transform="rotate(58 12 12)"><path d="M8 7h8v10H8ZM6 7h12M12 2v5M8 2h8M12 17v6M6 17h12"/><path d="M9 12h6v4H9Z" fill="currentColor" stroke="none"/></g>'],
  ['Clean', '<path d="M4 12C0 9 3 4 7 5l4 4c5-2 9-1 10 2l2-1-1 6c-1 4-5 6-11 6-6 0-9-3-8-7ZM3 9 0 11l4 1m4 2c1 5 8 5 10 0M6 3 5 1m5 3 1-2"/><circle cx="6" cy="8" r="1" fill="currentColor" stroke="none"/>'],
  ['Health', '<path d="M2 7Q12-2 22 7l-4 14H6ZM6 8l2 3m2-6 1 4m4-3-1 4m5-2-2 3M12 17l3-5"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>'],
  ['Discipline', '<path d="M13 4a9 9 0 1 0 0 16L6 12Z" fill="currentColor" stroke="none"/><path d="m14 7 3 8 1-11 4 9 1-11"/>'],
  ['Attention', '<path d="M13 12a6.5 6.5 0 1 1 1-7c1 2 1 5-1 7Zm0-1c3-5 10-3 10 3a5.5 5.5 0 0 1-10 3"/><path d="m4 9 3 2 4-2m4 5 2 2 3-2"/><path d="M5 5v1m5-1v1m6 5v1m4-1v1"/>'],
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

const { app, BrowserWindow, ipcMain, protocol, net, session, dialog, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { storedRom, importRom } = require('./rom.cjs');
const { ASPECT, MIN_WIDTH, MAX_WIDTH, sizeForWidth, readSize, saveSize } = require('./window-size.cjs');

const root = resolve(__dirname, '..');
const smoke = !app.isPackaged && process.argv.includes('--smoke-test');
app.setPath('userData', smoke ? join(root, 'build/smoke-profile') : join(app.getPath('appData'), 'tamogachi'));
app.setName('DuPaGotchi');
protocol.registerSchemesAsPrivileged([{ scheme: 'tamogachi', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
} }]);

let window, core, lastFrame, lastStatus = { type: 'status', message: 'Starting…' };
let exiting = false, choosingRom = false, coreError = '', frames = 0;
function send(data) {
  if (window && !window.isDestroyed()) window.webContents.send('pet:update', data);
}
function command(value) {
  if (core && !core.killed && core.stdin.writable) core.stdin.write(`${value}\n`);
}
function trusted(event) { return window && event.sender === window.webContents; }
ipcMain.handle('pet:ready', event => trusted(event) ? { frame: lastFrame, status: lastStatus } : null);
ipcMain.on('pet:button', (event, key, pressed) => {
  if (trusted(event) && ['A', 'B', 'C'].includes(key) && typeof pressed === 'boolean') command(`${key} ${Number(pressed)}`);
});
ipcMain.on('pet:pause', (event, paused) => {
  if (trusted(event) && typeof paused === 'boolean') command(`P ${Number(paused)}`);
});
ipcMain.on('pet:save', event => { if (trusted(event)) command('S'); });

function requireRom(message = 'Choose your P1 ROM to start.') {
  lastStatus = { type: 'rom-required', message };
  send(lastStatus);
}

ipcMain.handle('pet:choose-rom', async event => {
  if (!trusted(event) || core || choosingRom || exiting) return;
  choosingRom = true;
  try {
    const result = smoke
      ? await require('../scripts/desktop-smoke.cjs').pickRom(root)
      : await dialog.showOpenDialog(window, {
        title: 'Choose your Tamagotchi P1 ROM',
        properties: ['openFile'],
        filters: [{ name: 'Tamagotchi ROM', extensions: ['b', 'bin'] }, { name: 'All files', extensions: ['*'] }],
      });
    if (result.canceled || !result.filePaths.length || window.isDestroyed() || exiting) return;
    const rom = await importRom(result.filePaths[0], app.getPath('userData'));
    if (window.isDestroyed() || exiting) return;
    lastStatus = { type: 'status', message: 'Starting…' };
    send(lastStatus);
    startCore(rom);
  } catch (error) {
    requireRom(error.code ? 'Could not read or store that file. Please choose it again.' : error.message);
  } finally {
    choosingRom = false;
  }
});

function startCore(rom) {
  const coreName = `tamogachi-core${process.platform === 'win32' ? '.exe' : ''}`;
  const executable = app.isPackaged ? join(process.resourcesPath, coreName) : join(root, 'build', coreName);
  coreError = '';
  core = spawn(executable, [rom, join(app.getPath('userData'), 'pet-v1.state')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  core.stdin.on('error', () => {});
  core.stderr.on('data', data => { coreError = `${coreError}${data}`.slice(-3000); });
  core.on('error', error => {
    lastStatus = { type: 'error', message: error.message };
    send(lastStatus);
  });
  core.on('close', (code, signal) => {
    core = null;
    if (exiting) app.quit();
    else {
      lastStatus = { type: 'error', message: `The emulator stopped (${code ?? signal}). ${coreError}` };
      send(lastStatus);
    }
  });
  createInterface({ input: core.stdout }).on('line', line => {
    let data;
    try { data = JSON.parse(line); } catch { return; }
    if (data.type === 'frame') { lastFrame = data; frames++; }
    else if (data.type === 'ready') lastStatus = { type: 'status', message: data.restored ? 'Save restored' : 'New game' };
    else if (data.type === 'error') lastStatus = data;
    send(data.type === 'ready' ? lastStatus : data);
  });
}

app.whenReady().then(async () => {
  const icon = nativeImage.createFromPath(join(root, 'assets/icon.png'));
  if (process.platform === 'darwin') app.dock.setIcon(icon);
  protocol.handle('tamogachi', request => {
    const url = new URL(request.url);
    const routes = {
      '/index.html': 'renderer/index.html', '/style.css': 'renderer/style.css',
      '/app.js': 'renderer/app.js', '/assets/body.png': 'assets/body.png',
    };
    const local = url.host === 'app' && routes[url.pathname];
    if (!local) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(join(root, local)).href);
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const sizeFile = join(app.getPath('userData'), 'window-size.json');
  window = new BrowserWindow({
    ...readSize(sizeFile),
    minWidth: MIN_WIDTH, minHeight: sizeForWidth(MIN_WIDTH).height,
    maxWidth: MAX_WIDTH, maxHeight: sizeForWidth(MAX_WIDTH).height,
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: true, maximizable: false, hasShadow: false,
    title: 'DuPaGotchi', icon, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.setAspectRatio(ASPECT);
  const rememberSize = () => {
    try { saveSize(sizeFile, window.getSize()[0]); }
    catch (error) { console.error('Could not remember window size:', error.message); }
  };
  window.on('resize', rememberSize);
  window.on('close', rememberSize);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== 'tamogachi://app/index.html') event.preventDefault(); });
  window.webContents.on('render-process-gone', (_event, details) => { console.error(details); app.quit(); });
  window.webContents.on('console-message', details => { if (smoke && details.level === 'error') console.error(details.message); });
  window.on('blur', () => { for (const key of ['A', 'B', 'C']) command(`${key} 0`); });
  try {
    const rom = await storedRom(app.getPath('userData'));
    if (rom) startCore(rom);
    else requireRom();
  } catch (error) { requireRom(error.message); }
  await window.loadURL('tamogachi://app/index.html');
  if (smoke) {
    await require('../scripts/desktop-smoke.cjs')(window, {
      frameCount: () => frames, coreError: () => coreError, root,
      restored: process.argv.includes('--smoke-restored'),
    });
    app.quit();
  }
}).catch(error => {
  if (smoke) console.error(error);
  else dialog.showErrorBox('Could not open DuPaGotchi', error.message);
  if (core) core.kill();
  app.exit(1);
});

app.on('before-quit', event => {
  if (core && !exiting) {
    event.preventDefault();
    exiting = true;
    command('Q');
    const timer = setTimeout(() => { if (core) core.kill(); }, 2000);
    timer.unref();
  }
});
app.on('window-all-closed', () => app.quit());

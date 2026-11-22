const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { app } = require('electron');

// Isolate the app from real ROMs, saves, and window preferences.
const folder = mkdtempSync(join(tmpdir(), 'dupagotchi-desktop-'));
app.setPath('appData', folder);
const timer = setTimeout(() => {
  console.error('Desktop smoke test timed out');
  app.exit(1);
}, 15000);
app.on('will-quit', () => clearTimeout(timer));
app.on('quit', () => rmSync(folder, { recursive: true, force: true }));
app.on('web-contents-created', (_event, contents) => {
  const errors = [];
  contents.on('console-message', details => {
    if (details.level === 'error') errors.push(details.message);
  });
  contents.on('did-finish-load', async () => {
    try {
      const result = await contents.executeJavaScript(`(async () => {
        const deadline = Date.now() + 5000;
        while (document.querySelector('.rom-prompt').hidden && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return {
          title: document.title,
          promptVisible: !document.querySelector('.rom-prompt').hidden,
          buttons: document.querySelectorAll('[data-button]').length,
          icons: document.querySelectorAll('.icon').length,
          shellLoaded: document.querySelector('.shell').naturalWidth > 0,
        };
      })()`);
      assert.deepEqual(result, {
        title: 'DuPaGotchi', promptVisible: true, buttons: 3, icons: 8, shellLoaded: true,
      });
      assert.deepEqual(errors, []);
      console.log('Desktop smoke test passed');
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
require('../desktop/main.cjs');

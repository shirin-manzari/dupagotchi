const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', Object.freeze({
  chooseRom: () => ipcRenderer.invoke('pet:choose-rom'),
  ready: () => ipcRenderer.invoke('pet:ready'),
  button: (key, pressed) => ipcRenderer.send('pet:button', key, pressed),
  pause: paused => ipcRenderer.send('pet:pause', paused),
  save: () => ipcRenderer.send('pet:save'),
  onUpdate: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('pet:update', listener);
    return () => ipcRenderer.removeListener('pet:update', listener);
  },
}));

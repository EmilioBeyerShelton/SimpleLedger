// Preload script: the only bridge between the sandboxed renderer and Node.
// Exposes a small, typed surface (window.electronLedger) instead of the
// full ipcRenderer, per Electron's contextIsolation security guidance.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronLedger', {
  getDefaultPath: () => ipcRenderer.invoke('ledger:getDefaultPath'),
  readFile: (filePath) => ipcRenderer.invoke('ledger:readFile', filePath),
  writeFile: (filePath, contents) => ipcRenderer.invoke('ledger:writeFile', filePath, contents),
  pickOpenFile: () => ipcRenderer.invoke('ledger:pickOpenFile'),
  pickSaveFile: (defaultName) => ipcRenderer.invoke('ledger:pickSaveFile', defaultName)
});

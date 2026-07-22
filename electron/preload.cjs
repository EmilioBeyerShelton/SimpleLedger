// Preload script: the only bridge between the sandboxed renderer and Node.
// Exposes a small, typed surface (window.electronLedger) instead of the
// full ipcRenderer, per Electron's contextIsolation security guidance.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronLedger', {
  getDefaultPath: () => ipcRenderer.invoke('ledger:getDefaultPath'),
  dbRead: (filePath) => ipcRenderer.invoke('ledger:dbRead', filePath),
  dbWrite: (filePath, jsonContents) => ipcRenderer.invoke('ledger:dbWrite', filePath, jsonContents),
  dbReadFromBytes: (bytes) => ipcRenderer.invoke('ledger:dbReadFromBytes', bytes),
  pickOpenFile: () => ipcRenderer.invoke('ledger:pickOpenFile'),
  pickSaveFile: (defaultName) => ipcRenderer.invoke('ledger:pickSaveFile', defaultName)
});

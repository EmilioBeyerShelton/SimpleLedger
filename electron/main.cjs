// Electron main process — the macOS desktop shell.
//
// Responsibilities:
//  1. Open the app window and load the built Vite bundle.
//  2. Own the on-disk JSON file the ledger data lives in (in the user's
//     Application Support directory) and expose read/write/pick-file over
//     IPC — this is the macOS half of the persistence story described in
//     ARCHITECTURE.md. The renderer never touches Node's `fs` directly;
//     everything goes through the typed bridge in preload.cjs.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

// `app.isPackaged` is false any time you run `electron .` from source —
// including a production-style preview of the built `dist/` bundle — so it
// can't tell "dev server" apart from "load the build." Use an explicit env
// var instead (set by the `electron:dev` script below, which is the only
// place a dev server is actually running).
const isDev = process.env.ELECTRON_DEV_SERVER_URL != null;
const devServerUrl = process.env.ELECTRON_DEV_SERVER_URL || 'http://localhost:5173';
const userDataDir = app.getPath('userData');
const defaultDataFile = path.join(userDataDir, 'ledger-data.json');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- Persistence IPC ----------
// Mirrors src/lib/persistence/types.ts (PersistenceAdapter). Errors are
// returned as { ok: false, error } rather than thrown, since they cross an
// IPC boundary and Error objects don't serialize cleanly.

ipcMain.handle('ledger:getDefaultPath', () => defaultDataFile);

ipcMain.handle('ledger:readFile', async (_evt, filePath) => {
  try {
    const text = await fs.readFile(filePath || defaultDataFile, 'utf-8');
    return { ok: true, data: text };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: true, data: null };
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('ledger:writeFile', async (_evt, filePath, contents) => {
  try {
    const target = filePath || defaultDataFile;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('ledger:pickOpenFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  return { ok: true, filePath: result.filePaths[0] };
});

ipcMain.handle('ledger:pickSaveFile', async (_evt, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'ledger-data.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  return { ok: true, filePath: result.filePath };
});

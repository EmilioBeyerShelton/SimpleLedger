// Electron main process — the macOS desktop shell.
//
// Responsibilities:
//  1. Open the app window and load the built Vite bundle.
//  2. Own the on-disk SQLite database the ledger data lives in (in the
//     user's Application Support directory) and expose read/write/pick-file
//     over IPC — this is the macOS half of the persistence story described
//     in ARCHITECTURE.md ("Persistence layer: SQLite"). The renderer never
//     touches Node's `fs` or `better-sqlite3` directly; everything goes
//     through the typed bridge in preload.cjs, and the wire format at that
//     boundary stays plain JSON (a serialized LedgerData) — this file is
//     the only place that translates JSON <-> SQLite rows on macOS.
//
//     The schema/mapping logic below is a plain-JS duplicate of
//     src/lib/db/schema.ts + src/lib/db/mapping.ts + ledgerRepository.ts,
//     necessary because this file runs in the Node main process, outside
//     Vite's module graph, and can't `import` TypeScript. KEEP THESE IN
//     SYNC — if you change the table/column shape in src/lib/db/schema.ts,
//     make the same change here.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const Database = require('better-sqlite3');

// `app.isPackaged` is false any time you run `electron .` from source —
// including a production-style preview of the built `dist/` bundle — so it
// can't tell "dev server" apart from "load the build." Use an explicit env
// var instead (set by the `electron:dev` script below, which is the only
// place a dev server is actually running).
const isDev = process.env.ELECTRON_DEV_SERVER_URL != null;
const devServerUrl = process.env.ELECTRON_DEV_SERVER_URL || 'http://localhost:5173';
const userDataDir = app.getPath('userData');
const defaultDbFile = path.join(userDataDir, 'ledger.sqlite3');

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

// ---------- SQLite schema + LedgerData <-> row mapping ----------
// KEEP IN SYNC WITH src/lib/db/schema.ts and src/lib/db/mapping.ts.

const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS accounts (
     id    TEXT PRIMARY KEY,
     title TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS transactions (
     id           INTEGER PRIMARY KEY,
     date         TEXT NOT NULL,
     title        TEXT NOT NULL,
     amount       REAL NOT NULL,
     from_account TEXT NOT NULL REFERENCES accounts(id),
     to_account   TEXT NOT NULL REFERENCES accounts(id)
   )`,
  `CREATE TABLE IF NOT EXISTS groups (
     id      INTEGER PRIMARY KEY,
     name    TEXT NOT NULL,
     members TEXT NOT NULL,
     budget  REAL
   )`,
  `CREATE TABLE IF NOT EXISTS group_transactions (
     id             INTEGER PRIMARY KEY,
     group_id       INTEGER NOT NULL REFERENCES groups(id),
     transaction_id INTEGER NOT NULL REFERENCES transactions(id)
   )`,
  `CREATE TABLE IF NOT EXISTS splits (
     group_transaction_id INTEGER NOT NULL REFERENCES group_transactions(id),
     member                TEXT NOT NULL,
     amount                REAL NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_account)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_account)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_group_transactions_group ON group_transactions(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_transactions_tx ON group_transactions(transaction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_splits_gtx ON splits(group_transaction_id)`
];

const TABLES_IN_DELETE_ORDER = ['splits', 'group_transactions', 'groups', 'transactions', 'accounts', 'settings'];

function safeParseMembers(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function openDb(filePath) {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  for (const stmt of CREATE_TABLE_STATEMENTS) db.exec(stmt);
  return db;
}

function readLedgerDataFromDb(filePath) {
  const db = openDb(filePath);
  try {
    const accounts = db.prepare('SELECT id, title FROM accounts').all();
    const transactionRows = db
      .prepare('SELECT id, date, title, amount, from_account, to_account FROM transactions')
      .all();
    const transactions = transactionRows.map(t => ({
      id: t.id, date: t.date, title: t.title, amount: t.amount, from: t.from_account, to: t.to_account
    }));
    const groupRows = db.prepare('SELECT id, name, members, budget FROM groups').all();
    const groups = groupRows.map(g => ({ id: g.id, name: g.name, members: safeParseMembers(g.members), budget: g.budget }));
    const gtRows = db.prepare('SELECT id, group_id, transaction_id FROM group_transactions').all();
    const splitRows = db.prepare('SELECT group_transaction_id, member, amount FROM splits').all();
    const splitsByGt = new Map();
    splitRows.forEach(s => {
      const list = splitsByGt.get(s.group_transaction_id) || [];
      list.push({ member: s.member, amount: s.amount });
      splitsByGt.set(s.group_transaction_id, list);
    });
    const groupTransactions = gtRows.map(r => ({
      id: r.id, groupId: r.group_id, transactionId: r.transaction_id, splits: splitsByGt.get(r.id) || []
    }));
    const settingRows = db.prepare('SELECT key, value FROM settings').all();
    const defaultAccountRow = settingRows.find(r => r.key === 'defaultAccountId');
    const settings = { defaultAccountId: defaultAccountRow ? defaultAccountRow.value : null };

    return { accounts, transactions, groups, groupTransactions, settings };
  } finally {
    db.close();
  }
}

function writeLedgerDataToDb(filePath, data) {
  const db = openDb(filePath);
  try {
    const insertAccount = db.prepare('INSERT INTO accounts (id, title) VALUES (?, ?)');
    const insertTx = db.prepare(
      'INSERT INTO transactions (id, date, title, amount, from_account, to_account) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertGroup = db.prepare('INSERT INTO groups (id, name, members, budget) VALUES (?, ?, ?, ?)');
    const insertGt = db.prepare('INSERT INTO group_transactions (id, group_id, transaction_id) VALUES (?, ?, ?)');
    const insertSplit = db.prepare('INSERT INTO splits (group_transaction_id, member, amount) VALUES (?, ?, ?)');
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

    const runFullReplace = db.transaction(d => {
      for (const table of TABLES_IN_DELETE_ORDER) db.prepare(`DELETE FROM ${table}`).run();
      (d.accounts || []).forEach(a => insertAccount.run(a.id, a.title));
      (d.transactions || []).forEach(t => insertTx.run(t.id, t.date, t.title, t.amount, t.from, t.to));
      (d.groups || []).forEach(g => insertGroup.run(g.id, g.name, JSON.stringify(g.members || []), g.budget ?? null));
      (d.groupTransactions || []).forEach(gt => {
        insertGt.run(gt.id, gt.groupId, gt.transactionId);
        (gt.splits || []).forEach(s => insertSplit.run(gt.id, s.member, s.amount));
      });
      insertSetting.run('defaultAccountId', (d.settings && d.settings.defaultAccountId) ?? null);
    });
    runFullReplace(data);
  } finally {
    db.close();
  }
}

// ---------- Persistence IPC ----------
// Mirrors src/lib/persistence/types.ts (PersistenceAdapter). Errors are
// returned as { ok: false, error } rather than thrown, since they cross an
// IPC boundary and Error objects don't serialize cleanly. The wire format
// for `data`/`contents` is always a JSON string — SQLite specifics never
// leave this file.

ipcMain.handle('ledger:getDefaultPath', () => defaultDbFile);

ipcMain.handle('ledger:dbRead', async (_evt, filePath) => {
  const target = filePath || defaultDbFile;
  try {
    if (!fsSync.existsSync(target)) return { ok: true, data: null };
    const data = readLedgerDataFromDb(target);
    return { ok: true, data: JSON.stringify(data) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('ledger:dbWrite', async (_evt, filePath, jsonContents) => {
  try {
    const target = filePath || defaultDbFile;
    await fs.mkdir(path.dirname(target), { recursive: true });
    const data = JSON.parse(jsonContents);
    writeLedgerDataToDb(target, data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// Used only for the manual "download backup" snapshot (Settings tab) —
// deliberately plain JSON on disk, not a .sqlite3 file, so it's portable
// and human-readable. See ARCHITECTURE.md for why backups stay JSON while
// the live/linked stores are SQLite.
ipcMain.handle('ledger:writeJsonFile', async (_evt, filePath, jsonContents) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, jsonContents, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('ledger:pickOpenFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'SQLite database', extensions: ['sqlite3', 'sqlite', 'db'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  return { ok: true, filePath: result.filePaths[0] };
});

ipcMain.handle('ledger:pickSaveFile', async (_evt, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'ledger.sqlite3',
    filters: [{ name: 'SQLite database', extensions: ['sqlite3', 'sqlite', 'db'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle('ledger:pickSaveJsonFile', async (_evt, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'ledger-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  return { ok: true, filePath: result.filePath };
});

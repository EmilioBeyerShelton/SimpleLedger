// Dedicated Worker that owns the actual sqlite-wasm/OPFS database.
//
// This has to be a Worker, not a main-thread module: the OPFS SAHPool VFS
// needs `FileSystemFileHandle.prototype.createSyncAccessHandle`, and
// browsers only expose that synchronous API inside a dedicated Worker's
// global scope — never on the main thread (calling
// `installOpfsSAHPoolVfs()` from the main thread throws "Missing required
// OPFS APIs.", which is the whole reason this file exists; an earlier
// version of this adapter assumed SAHPool was main-thread-safe and it
// isn't). See ARCHITECTURE.md ("Web: why a Worker").
//
// Talks to WebPersistenceAdapter (web.ts) over postMessage — a small
// request/response RPC keyed by `id`, handling exactly the operations
// SqlExecutor + the linked-file byte export/import need. Kept minimal and
// self-contained (no imports from src/lib/db/*) since a Worker's module
// graph is bundled separately from the main app.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const DB_FILE = '/ledger.sqlite3';
const POOL_NAME = 'simpleledger-opfs';

let sqlite3: any;
let poolUtil: any;
let db: any;

async function ensureOpen(): Promise<void> {
  if (db) return;
  sqlite3 = await sqlite3InitModule();
  poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME });
  db = new poolUtil.OpfsSAHPoolDb(DB_FILE);
}

interface Request {
  id: number;
  type: 'init' | 'run' | 'all' | 'export' | 'import';
  sql?: string;
  params?: unknown[];
  bytes?: Uint8Array;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, type, sql, params, bytes } = e.data;
  try {
    let result: unknown;
    switch (type) {
      case 'init':
        await ensureOpen();
        break;
      case 'run':
        await ensureOpen();
        db.exec({ sql, bind: params ?? [] });
        break;
      case 'all': {
        await ensureOpen();
        const resultRows: unknown[] = [];
        db.exec({ sql, bind: params ?? [], rowMode: 'object', resultRows });
        result = resultRows;
        break;
      }
      case 'export':
        await ensureOpen();
        result = await poolUtil.exportFile(DB_FILE);
        break;
      case 'import':
        if (db) {
          db.close();
          db = null;
        }
        await poolUtil.importDb(DB_FILE, bytes);
        db = new poolUtil.OpfsSAHPoolDb(DB_FILE);
        break;
    }
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};

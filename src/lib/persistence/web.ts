// Web adapter — SQLite via @sqlite.org/sqlite-wasm, using the OPFS
// "SAHPool" VFS as the always-on local store (replaces the old
// localStorage-backed JSON blob). An optional File System Access API
// handle (Chrome/Edge — feature-detected via `showOpenFilePicker`) is
// still the "linked file," same as before, except what's mirrored to it
// now is the raw .sqlite3 file's bytes instead of pretty-printed JSON.
//
// Why a Worker: `installOpfsSAHPoolVfs()` needs
// `FileSystemFileHandle.prototype.createSyncAccessHandle`, which browsers
// only expose inside a dedicated Worker's global scope — never on the
// main thread (calling it from the main thread throws "Missing required
// OPFS APIs."). So the actual sqlite3/OPFS calls live in
// `webSqlite.worker.ts`; this file just talks to that worker over
// `postMessage` through the small `SqliteWorkerClient` RPC below. The
// trade-off (documented upstream, applies to any SAHPool-based adapter
// regardless of thread) is that a SAHPool VFS claims exclusive access to
// its OPFS pool, so only one tab of this app can hold the database open at
// a time; a second tab's pool init will fail until the first tab closes.
// Fine for a personal finance app; see ARCHITECTURE.md if that ever needs
// revisiting.
import type { PersistenceAdapter, LoadResult, FileLinkStatus } from './types';
import type { SqlExecutor } from '@/lib/db/types';
import { createSchema, readLedgerData, writeLedgerData } from '@/lib/db/ledgerRepository';
import { normalize, defaultData } from './normalize';
import type { LedgerData } from '@/types/ledger';

const FILE_META_KEY = 'ledger_linked_file_meta_v1'; // just a display name — see .claude/CLAUDE.md rule 6
const HANDLE_DB_NAME = 'ledgerFS';

type FSFileHandle = FileSystemFileHandle;

const fsSupported = typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;

// ---------- IndexedDB (stores the FileSystemFileHandle only — never ledger data) ----------
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('handles'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(key);
    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(key: string): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function verifyPermission(handle: FSFileHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  const opts = { mode };
  // @ts-ignore - queryPermission/requestPermission depend on the TS lib version's DOM types
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  // @ts-ignore
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

// ---------- Worker RPC client ----------
// Talks to webSqlite.worker.ts over postMessage. Each call gets a unique
// id; the worker echoes that id back so responses can arrive out of order
// without confusion (they won't in practice, since every caller here
// awaits each round trip before starting the next one, but the id keying
// costs nothing and removes that as an assumption to rely on).
type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

class SqliteWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./webSqlite.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.ok) pending.resolve(msg.result);
      else pending.reject(new Error(msg.error));
    };
  }

  private call(type: string, payload: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  init(): Promise<void> {
    return this.call('init');
  }
  run(sql: string, params: unknown[] = []): Promise<void> {
    return this.call('run', { sql, params });
  }
  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.call('all', { sql, params });
  }
  exportBytes(): Promise<Uint8Array> {
    return this.call('export');
  }
  importBytes(bytes: Uint8Array): Promise<void> {
    return this.call('import', { bytes });
  }
}

function makeExecutor(client: SqliteWorkerClient): SqlExecutor {
  return {
    run: (sql, params = []) => client.run(sql, params),
    all: (sql, params = []) => client.all(sql, params),
    async transaction(fn) {
      await client.run('BEGIN');
      try {
        await fn();
        await client.run('COMMIT');
      } catch (err) {
        await client.run('ROLLBACK');
        throw err;
      }
    }
  };
}

export class WebPersistenceAdapter implements PersistenceAdapter {
  platform = 'web' as const;
  canCreateNewLinkedFile = true;

  private client!: SqliteWorkerClient;
  private exec!: SqlExecutor;

  private fileHandle: FSFileHandle | null = null;
  private status: FileLinkStatus = {
    supported: fsSupported,
    linked: false,
    name: null,
    needsReconnect: false,
    error: null
  };

  getFileStatus(): FileLinkStatus {
    return this.status;
  }

  private async openDb(): Promise<void> {
    this.client = new SqliteWorkerClient();
    this.exec = makeExecutor(this.client);
    await this.client.init();
    await createSchema(this.exec);
  }

  /** Replace the OPFS database's contents with raw .sqlite3 `bytes`, then reopen it. */
  private async importBytes(bytes: Uint8Array): Promise<void> {
    await this.client.importBytes(bytes);
  }

  private exportBytes(): Promise<Uint8Array> {
    return this.client.exportBytes();
  }

  async persistLocal(data: LedgerData): Promise<void> {
    await writeLedgerData(this.exec, data);
  }

  async writeLinkedFile(data: LedgerData): Promise<FileLinkStatus | null> {
    if (!this.fileHandle) return null;
    try {
      const ok = await verifyPermission(this.fileHandle, 'readwrite');
      if (!ok) {
        this.status = { ...this.status, needsReconnect: true };
        return this.status;
      }
      // `data` is already committed to the OPFS db by persistLocal (the
      // store calls both on every mutation) — just export the file bytes.
      const bytes = await this.exportBytes();
      // @ts-ignore - createWritable's presence depends on the TS lib version's DOM types
      const writable = await (this.fileHandle as any).createWritable();
      await writable.write(bytes);
      await writable.close();
      this.status = { ...this.status, error: null };
    } catch (err: any) {
      console.error('File write failed', err);
      this.status = { ...this.status, error: "Couldn't save to the linked file — your data is still safe in this browser." };
    }
    return this.status;
  }

  async loadInitial(): Promise<LoadResult> {
    await this.openDb();

    let loaded = await readLedgerData(this.exec);
    if (loaded.accounts.length === 0 && loaded.transactions.length === 0 && loaded.groups.length === 0) {
      loaded = defaultData();
      await writeLedgerData(this.exec, loaded);
    }

    if (fsSupported) {
      const meta = localStorage.getItem(FILE_META_KEY);
      if (meta) {
        try {
          const handle = await idbGet<FSFileHandle>('main');
          if (handle) {
            this.fileHandle = handle;
            // @ts-ignore
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            const name = (JSON.parse(meta) as { name: string }).name;
            if (perm === 'granted') {
              const file = await handle.getFile();
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (bytes.byteLength > 0) {
                await this.importBytes(bytes);
                loaded = await readLedgerData(this.exec);
              }
              this.status = { supported: true, linked: true, name, needsReconnect: false, error: null };
            } else {
              this.status = { supported: true, linked: true, name, needsReconnect: true, error: null };
            }
          }
        } catch (err) {
          console.error('File reconnection check failed', err);
        }
      }
    }

    return { data: loaded, fileStatus: this.status };
  }

  async connectExisting(): Promise<LoadResult | null> {
    try {
      // @ts-ignore - showOpenFilePicker isn't in lib.dom yet
      const [handle]: FSFileHandle[] = await window.showOpenFilePicker({
        types: [{ description: 'SQLite database', accept: { 'application/x-sqlite3': ['.sqlite3', '.db'] } }],
        excludeAcceptAllOption: false,
        multiple: false
      });
      const ok = await verifyPermission(handle, 'readwrite');
      if (!ok) throw new Error('Permission was not granted.');
      const file = await handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > 0) await this.importBytes(bytes);
      const data = await readLedgerData(this.exec);
      await idbSet('main', handle);
      localStorage.setItem(FILE_META_KEY, JSON.stringify({ name: handle.name }));
      this.fileHandle = handle;
      this.status = { supported: true, linked: true, name: handle.name, needsReconnect: false, error: null };
      return { data, fileStatus: this.status };
    } catch (err: any) {
      if (err.name !== 'AbortError') alert('Could not open that file: ' + err.message);
      return null;
    }
  }

  async connectNew(): Promise<LoadResult | null> {
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
      let name = prompt('Name for the new database file:', 'ledger.sqlite3');
      if (name === null) return null;
      name = name.trim() || 'ledger.sqlite3';
      if (!/\.(sqlite3?|db)$/i.test(name)) name += '.sqlite3';
      const handle: FSFileHandle = await dirHandle.getFileHandle(name, { create: true });
      const ok = await verifyPermission(handle, 'readwrite');
      if (!ok) throw new Error('Permission was not granted.');
      const file = await handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      await idbSet('main', handle);
      localStorage.setItem(FILE_META_KEY, JSON.stringify({ name: handle.name }));
      this.fileHandle = handle;
      this.status = { supported: true, linked: true, name: handle.name, needsReconnect: false, error: null };

      let data: LedgerData;
      if (bytes.byteLength > 0) {
        await this.importBytes(bytes);
        data = await readLedgerData(this.exec);
      } else {
        data = await readLedgerData(this.exec);
        await this.writeLinkedFile(data);
      }
      return { data, fileStatus: this.status };
    } catch (err: any) {
      if (err.name !== 'AbortError') alert('Could not set up that file: ' + err.message);
      return null;
    }
  }

  async reconnect(): Promise<LoadResult | null> {
    if (!this.fileHandle) return null;
    try {
      const ok = await verifyPermission(this.fileHandle, 'readwrite');
      if (!ok) {
        this.status = { ...this.status, needsReconnect: true };
        return { data: await readLedgerData(this.exec), fileStatus: this.status };
      }
      const file = await this.fileHandle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > 0) await this.importBytes(bytes);
      const data = await readLedgerData(this.exec);
      this.status = { ...this.status, needsReconnect: false, error: null };
      return { data, fileStatus: this.status };
    } catch (err: any) {
      this.status = { ...this.status, error: "Couldn't read the linked file: " + err.message };
      return null;
    }
  }

  async disconnect(): Promise<void> {
    await idbDelete('main');
    localStorage.removeItem(FILE_META_KEY);
    this.fileHandle = null;
    this.status = { ...this.status, linked: false, name: null, needsReconnect: false, error: null };
  }

  // Manual backup/restore deliberately stays JSON, not raw .sqlite3 bytes —
  // portable across platforms and app versions, human-readable, and reuses
  // the existing normalize() migration path. Only the *linked file* mirror
  // above uses the raw database format.
  async downloadBackup(data: LedgerData): Promise<void> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = 'ledger-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async uploadBackup(file: File): Promise<unknown> {
    const text = await file.text();
    return JSON.parse(text);
  }
}

// Re-exported so callers that only need the JSON migration helper (e.g. a
// future dev tool) don't have to import ./normalize directly.
export { normalize };

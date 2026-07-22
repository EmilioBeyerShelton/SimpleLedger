// Web adapter — behavior-identical port of the original js/store.js:
// localStorage is the always-on store, an optional File System Access API
// (FSFileHandle) handle is the "linked file" for Chrome/Edge, and its
// handle is kept in IndexedDB (localStorage can't hold non-serializable
// handles). Firefox/Safari fall back gracefully — `supported: false`.
import type { PersistenceAdapter, LoadResult, FileLinkStatus } from './types';
import { normalize, defaultData } from './normalize';
import type { LedgerData } from '@/types/ledger';

const STORAGE_KEY = 'ledger_data_v1';
const FILE_META_KEY = 'ledger_file_meta_v1';
const DB_NAME = 'ledgerFS';

type FSFileHandle = FileSystemFileHandle;

const fsSupported = typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
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
  // @ts-expect-error - queryPermission/requestPermission aren't in lib.dom yet
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  // @ts-expect-error
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

export class WebPersistenceAdapter implements PersistenceAdapter {
  platform = 'web' as const;
  canCreateNewLinkedFile = true;

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

  private persistLocalSync(data: LedgerData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  async persistLocal(data: LedgerData): Promise<void> {
    this.persistLocalSync(data);
  }

  async writeLinkedFile(data: LedgerData): Promise<FileLinkStatus | null> {
    if (!this.fileHandle) return null;
    try {
      const ok = await verifyPermission(this.fileHandle, 'readwrite');
      if (!ok) {
        this.status = { ...this.status, needsReconnect: true };
        return this.status;
      }
      // @ts-ignore - createWritable's presence depends on the TS lib version's DOM types
      const writable = await (this.fileHandle as any).createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      this.status = { ...this.status, error: null };
    } catch (err: any) {
      console.error('File write failed', err);
      this.status = { ...this.status, error: "Couldn't save to the linked file — your data is still safe in this browser." };
    }
    return this.status;
  }

  async loadInitial(): Promise<LoadResult> {
    let loaded: LedgerData | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loaded = normalize(JSON.parse(raw));
    } catch (err) {
      console.error('Failed to load data from storage', err);
    }
    if (!loaded) {
      loaded = defaultData();
      this.persistLocalSync(loaded);
    }

    if (fsSupported) {
      const meta = localStorage.getItem(FILE_META_KEY);
      if (meta) {
        try {
          const handle = await idbGet<FSFileHandle>('main');
          if (handle) {
            this.fileHandle = handle;
            // @ts-expect-error
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            const name = (JSON.parse(meta) as { name: string }).name;
            if (perm === 'granted') {
              const file = await handle.getFile();
              const text = (await file.text()).trim();
              if (text) {
                loaded = normalize(JSON.parse(text));
                this.persistLocalSync(loaded);
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
      // @ts-expect-error - showOpenFilePicker isn't in lib.dom yet
      const [handle]: FSFileHandle[] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        excludeAcceptAllOption: false,
        multiple: false
      });
      const ok = await verifyPermission(handle, 'readwrite');
      if (!ok) throw new Error('Permission was not granted.');
      const file = await handle.getFile();
      const text = (await file.text()).trim();
      const parsed = text ? normalize(JSON.parse(text)) : defaultData();
      await idbSet('main', handle);
      localStorage.setItem(FILE_META_KEY, JSON.stringify({ name: handle.name }));
      this.fileHandle = handle;
      this.status = { supported: true, linked: true, name: handle.name, needsReconnect: false, error: null };
      this.persistLocalSync(parsed);
      return { data: parsed, fileStatus: this.status };
    } catch (err: any) {
      if (err.name !== 'AbortError') alert('Could not open that file: ' + err.message);
      return null;
    }
  }

  async connectNew(): Promise<LoadResult | null> {
    try {
      // @ts-expect-error
      const dirHandle = await window.showDirectoryPicker();
      let name = prompt('Name for the new data file:', 'ledger-data.json');
      if (name === null) return null;
      name = name.trim() || 'ledger-data.json';
      if (!name.toLowerCase().endsWith('.json')) name += '.json';
      const handle: FSFileHandle = await dirHandle.getFileHandle(name, { create: true });
      const ok = await verifyPermission(handle, 'readwrite');
      if (!ok) throw new Error('Permission was not granted.');
      const file = await handle.getFile();
      const text = (await file.text()).trim();
      await idbSet('main', handle);
      localStorage.setItem(FILE_META_KEY, JSON.stringify({ name: handle.name }));
      this.fileHandle = handle;
      this.status = { supported: true, linked: true, name: handle.name, needsReconnect: false, error: null };

      let data: LedgerData;
      if (text) {
        data = normalize(JSON.parse(text));
        this.persistLocalSync(data);
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        data = raw ? normalize(JSON.parse(raw)) : defaultData();
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
        return { data: normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')), fileStatus: this.status };
      }
      const file = await this.fileHandle.getFile();
      const text = (await file.text()).trim();
      let data = normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
      if (text) {
        data = normalize(JSON.parse(text));
        this.persistLocalSync(data);
      }
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

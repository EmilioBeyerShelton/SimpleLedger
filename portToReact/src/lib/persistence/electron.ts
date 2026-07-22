// macOS adapter (Electron). Talks to the main process exclusively through
// the `window.electronLedger` bridge exposed by electron/preload.cjs — the
// renderer never imports Node's `fs` directly (contextIsolation).
//
// The always-on store is a JSON file in the OS user-data directory
// (~/Library/Application Support/SimpleLedger/ledger-data.json), the macOS
// equivalent of localStorage for this app. A "linked file" is a second,
// user-chosen path that every save is mirrored to — same UX as the web
// adapter's File System Access API handle, implemented with a native save
// dialog instead. The linked path itself is remembered in localStorage,
// which Electron's renderer persists fine across launches.
import type { PersistenceAdapter, LoadResult, FileLinkStatus } from './types';
import { normalize, defaultData } from './normalize';
import type { LedgerData } from '@/types/ledger';
import './electron.d';

const LINK_META_KEY = 'ledger_electron_linked_path_v1';

function bridge() {
  if (!window.electronLedger) throw new Error('electronLedger bridge is not available');
  return window.electronLedger;
}

export class ElectronPersistenceAdapter implements PersistenceAdapter {
  platform = 'macos' as const;
  canCreateNewLinkedFile = true;

  private linkedPath: string | null = null;
  private status: FileLinkStatus = {
    supported: true,
    linked: false,
    name: null,
    needsReconnect: false,
    error: null
  };

  getFileStatus(): FileLinkStatus {
    return this.status;
  }

  async persistLocal(data: LedgerData): Promise<void> {
    const res = await bridge().writeFile(undefined, JSON.stringify(data, null, 2));
    if (!res.ok) console.error('Local save failed', res.error);
  }

  async writeLinkedFile(data: LedgerData): Promise<FileLinkStatus | null> {
    if (!this.linkedPath) return null;
    const res = await bridge().writeFile(this.linkedPath, JSON.stringify(data, null, 2));
    this.status = res.ok
      ? { ...this.status, error: null }
      : { ...this.status, error: "Couldn't save to the linked file — your data is still safe locally." };
    return this.status;
  }

  async loadInitial(): Promise<LoadResult> {
    let loaded: LedgerData | null = null;
    const res = await bridge().readFile(undefined);
    if (res.ok && res.data) {
      try { loaded = normalize(JSON.parse(res.data)); } catch (err) { console.error('Failed to parse local data', err); }
    }
    if (!loaded) {
      loaded = defaultData();
      await this.persistLocal(loaded);
    }

    const meta = localStorage.getItem(LINK_META_KEY);
    if (meta) {
      const { path, name } = JSON.parse(meta) as { path: string; name: string };
      this.linkedPath = path;
      const fileRes = await bridge().readFile(path);
      if (fileRes.ok && fileRes.data) {
        try {
          loaded = normalize(JSON.parse(fileRes.data));
          await this.persistLocal(loaded);
          this.status = { supported: true, linked: true, name, needsReconnect: false, error: null };
        } catch (err) {
          this.status = { supported: true, linked: true, name, needsReconnect: true, error: null };
        }
      } else {
        this.status = { supported: true, linked: true, name, needsReconnect: true, error: null };
      }
    }

    return { data: loaded, fileStatus: this.status };
  }

  async connectExisting(): Promise<LoadResult | null> {
    const picked = await bridge().pickOpenFile();
    if (!picked.ok) return null;
    const res = await bridge().readFile(picked.filePath);
    if (!res.ok) { alert('Could not open that file: ' + res.error); return null; }
    const data = res.data ? normalize(JSON.parse(res.data)) : defaultData();
    const name = picked.filePath.split('/').pop() || picked.filePath;
    this.linkedPath = picked.filePath;
    localStorage.setItem(LINK_META_KEY, JSON.stringify({ path: picked.filePath, name }));
    this.status = { supported: true, linked: true, name, needsReconnect: false, error: null };
    await this.persistLocal(data);
    return { data, fileStatus: this.status };
  }

  async connectNew(): Promise<LoadResult | null> {
    const picked = await bridge().pickSaveFile('ledger-data.json');
    if (!picked.ok) return null;
    const localRes = await bridge().readFile(undefined);
    const data = localRes.ok && localRes.data ? normalize(JSON.parse(localRes.data)) : defaultData();
    const name = picked.filePath.split('/').pop() || picked.filePath;
    this.linkedPath = picked.filePath;
    localStorage.setItem(LINK_META_KEY, JSON.stringify({ path: picked.filePath, name }));
    this.status = { supported: true, linked: true, name, needsReconnect: false, error: null };
    await this.writeLinkedFile(data);
    return { data, fileStatus: this.status };
  }

  async reconnect(): Promise<LoadResult | null> {
    if (!this.linkedPath) return null;
    const res = await bridge().readFile(this.linkedPath);
    if (!res.ok || res.data == null) {
      this.status = { ...this.status, needsReconnect: true, error: res.ok ? null : res.error };
      return null;
    }
    const data = normalize(JSON.parse(res.data));
    await this.persistLocal(data);
    this.status = { ...this.status, needsReconnect: false, error: null };
    return { data, fileStatus: this.status };
  }

  async disconnect(): Promise<void> {
    localStorage.removeItem(LINK_META_KEY);
    this.linkedPath = null;
    this.status = { ...this.status, linked: false, name: null, needsReconnect: false, error: null };
  }

  async downloadBackup(data: LedgerData): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const picked = await bridge().pickSaveFile(`ledger-${stamp}.json`);
    if (!picked.ok) return;
    const res = await bridge().writeFile(picked.filePath, JSON.stringify(data, null, 2));
    if (!res.ok) alert('Could not save backup: ' + res.error);
  }

  async uploadBackup(file: File): Promise<unknown> {
    const text = await file.text();
    return JSON.parse(text);
  }
}

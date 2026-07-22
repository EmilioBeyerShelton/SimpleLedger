// macOS adapter (Electron). Talks to the main process exclusively through
// the `window.electronLedger` bridge exposed by electron/preload.cjs — the
// renderer never imports Node's `fs` or `better-sqlite3` directly
// (contextIsolation). The IPC wire format at that boundary is plain JSON
// (a serialized LedgerData); main.cjs is what actually translates JSON
// <-> SQLite rows, so this file barely changed shape when the storage
// engine underneath it did.
//
// The always-on store is a SQLite database in the OS user-data directory
// (~/Library/Application Support/SimpleLedger/ledger.sqlite3), the macOS
// equivalent of the web adapter's OPFS database. A "linked file" is a
// second, user-chosen .sqlite3 path that every save is mirrored to — same
// UX as the web adapter's File System Access API handle, implemented with
// a native save dialog instead. The linked path itself is remembered in
// localStorage, which Electron's renderer persists fine across launches.
import type { PersistenceAdapter, LoadResult, FileLinkStatus } from "./types";
import { normalize, defaultData } from "./normalize";
import type { LedgerData } from "@/types/ledger";
// No import of electronBridge.d.ts here: it's a declarations-only module
// (no runtime JS), so there's nothing for a bundler to resolve — Rollup
// errors on `import "./electronBridge"` with "could not resolve" since
// declaration files don't produce output. It doesn't need an import
// anyway: it's picked up as a root file via tsconfig's `"include": ["src"]`
// glob, same as src/vite-env.d.ts, and its `declare global` augmentation
// (window.electronLedger) applies program-wide from there. It's named
// electronBridge.d.ts rather than electron.d.ts specifically so it doesn't
// share a basename with this file — TypeScript treats a same-basename
// .ts/.d.ts pair in one directory as the same logical module, which
// silently drops the .d.ts from the compiled program entirely.
const LINK_META_KEY = "ledger_electron_linked_path_v1";

function bridge() {
  if (!window.electronLedger)
    throw new Error("electronLedger bridge is not available");
  return window.electronLedger;
}

export class ElectronPersistenceAdapter implements PersistenceAdapter {
  platform = "macos" as const;
  canCreateNewLinkedFile = true;

  private linkedPath: string | null = null;
  private status: FileLinkStatus = {
    supported: true,
    linked: false,
    name: null,
    needsReconnect: false,
    error: null,
  };

  getFileStatus(): FileLinkStatus {
    return this.status;
  }

  async persistLocal(data: LedgerData): Promise<void> {
    const res = await bridge().dbWrite(undefined, JSON.stringify(data));
    if (!res.ok) console.error("Local save failed", res.error);
  }

  async writeLinkedFile(data: LedgerData): Promise<FileLinkStatus | null> {
    if (!this.linkedPath) return null;
    const res = await bridge().dbWrite(this.linkedPath, JSON.stringify(data));
    this.status = res.ok
      ? { ...this.status, error: null }
      : {
          ...this.status,
          error:
            "Couldn't save to the linked file — your data is still safe locally.",
        };
    return this.status;
  }

  async loadInitial(): Promise<LoadResult> {
    let loaded: LedgerData | null = null;
    const res = await bridge().dbRead(undefined);
    if (res.ok && res.data) {
      try {
        loaded = normalize(JSON.parse(res.data));
      } catch (err) {
        console.error("Failed to parse local data", err);
      }
    }
    if (!loaded) {
      loaded = defaultData();
      await this.persistLocal(loaded);
    }

    const meta = localStorage.getItem(LINK_META_KEY);
    if (meta) {
      const { path, name } = JSON.parse(meta) as { path: string; name: string };
      this.linkedPath = path;
      const fileRes = await bridge().dbRead(path);
      if (fileRes.ok && fileRes.data) {
        try {
          loaded = normalize(JSON.parse(fileRes.data));
          await this.persistLocal(loaded);
          this.status = {
            supported: true,
            linked: true,
            name,
            needsReconnect: false,
            error: null,
          };
        } catch (err) {
          this.status = {
            supported: true,
            linked: true,
            name,
            needsReconnect: true,
            error: null,
          };
        }
      } else {
        this.status = {
          supported: true,
          linked: true,
          name,
          needsReconnect: true,
          error: null,
        };
      }
    }

    return { data: loaded, fileStatus: this.status };
  }

  async connectExisting(): Promise<LoadResult | null> {
    const picked = await bridge().pickOpenFile();
    if (!picked.ok) return null;
    const res = await bridge().dbRead(picked.filePath);
    if (!res.ok) {
      alert("Could not open that file: " + res.error);
      return null;
    }
    const data = res.data ? normalize(JSON.parse(res.data)) : defaultData();
    const name = picked.filePath.split("/").pop() || picked.filePath;
    this.linkedPath = picked.filePath;
    localStorage.setItem(
      LINK_META_KEY,
      JSON.stringify({ path: picked.filePath, name }),
    );
    this.status = {
      supported: true,
      linked: true,
      name,
      needsReconnect: false,
      error: null,
    };
    await this.persistLocal(data);
    return { data, fileStatus: this.status };
  }

  async connectNew(): Promise<LoadResult | null> {
    const picked = await bridge().pickSaveFile("ledger.sqlite3");
    if (!picked.ok) return null;
    const localRes = await bridge().dbRead(undefined);
    const data =
      localRes.ok && localRes.data
        ? normalize(JSON.parse(localRes.data))
        : defaultData();
    const name = picked.filePath.split("/").pop() || picked.filePath;
    this.linkedPath = picked.filePath;
    localStorage.setItem(
      LINK_META_KEY,
      JSON.stringify({ path: picked.filePath, name }),
    );
    this.status = {
      supported: true,
      linked: true,
      name,
      needsReconnect: false,
      error: null,
    };
    await this.writeLinkedFile(data);
    return { data, fileStatus: this.status };
  }

  async reconnect(): Promise<LoadResult | null> {
    if (!this.linkedPath) return null;
    const res = await bridge().dbRead(this.linkedPath);
    if (!res.ok || res.data == null) {
      this.status = {
        ...this.status,
        needsReconnect: true,
        error: res.ok ? null : res.error,
      };
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
    this.status = {
      ...this.status,
      linked: false,
      name: null,
      needsReconnect: false,
      error: null,
    };
  }

  // Manual backup/restore stays plain JSON — portable and human-readable —
  // even though the live/linked stores are now SQLite. `writeJsonFile` /
  // `pickSaveJsonFile` are separate IPC channels from `dbWrite` /
  // `pickSaveFile` specifically so this never gets routed through the
  // SQLite translation layer in main.cjs. See ARCHITECTURE.md.
  async downloadBackup(data: LedgerData): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const picked = await bridge().pickSaveJsonFile(`ledger-${stamp}.json`);
    if (!picked.ok) return;
    const res = await bridge().writeJsonFile(
      picked.filePath,
      JSON.stringify(data, null, 2),
    );
    if (!res.ok) alert("Could not save backup: " + res.error);
  }

  async uploadBackup(file: File): Promise<unknown> {
    const text = await file.text();
    return JSON.parse(text);
  }
}

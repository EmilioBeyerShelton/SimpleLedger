// iOS adapter (Capacitor). Design notes in ARCHITECTURE.md.
//
// Always-on store: a real SQLite database via @capacitor-community/sqlite
// (native SQLite on iOS, managed by the plugin under
// Library/CapacitorDatabase/ by default) — replaces the old
// Preferences/NSUserDefaults JSON blob.
//
// "Linked file": iOS has no equivalent of the File System Access API's
// persistent external-file handle, and the SQLite plugin doesn't expose a
// raw-bytes export of its native db file, so linking here still means what
// it meant before the SQLite migration: mirror a JSON snapshot to a
// visible file in the app's Documents directory (shows up under "On My
// iPhone/iPad > SimpleLedger" in the Files app when UIFileSharingEnabled
// is set in Info.plist). That snapshot is now read *from* SQLite and
// written *back into* SQLite on reconnect, instead of to/from Preferences,
// but it's a JSON file on both ends — not a copy of the .db file itself.
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { PersistenceAdapter, LoadResult, FileLinkStatus } from './types';
import type { SqlExecutor } from '@/lib/db/types';
import { createSchema, readLedgerData, writeLedgerData } from '@/lib/db/ledgerRepository';
import { CREATE_TABLE_STATEMENTS } from '@/lib/db/schema';
import { normalize, defaultData } from './normalize';
import type { LedgerData } from '@/types/ledger';

const DB_NAME = 'ledger';
const LINK_FLAG_KEY = 'ledger_file_linked_v1';
const MIRROR_FILE_NAME = 'ledger-data.json';
// @capacitor-community/sqlite names the on-disk file `<dbname>SQLite.db`
// (unencrypted) and stores it under the location configured via
// `iosDatabaseLocation` in capacitor.config.ts, which this project already
// sets to `Library/CapacitorDatabase`. There's no public plugin API to
// export/import raw bytes, so manual backup/restore reads and overwrites
// that file directly through @capacitor/filesystem — the closest iOS
// equivalent to the raw .sqlite3 download/upload on web and macOS. This
// path is a documented convention of the plugin, not a guarantee; if a
// future plugin version changes it, this needs to change too.
const NATIVE_DB_DIRECTORY = Directory.Library;
const NATIVE_DB_PATH = 'CapacitorDatabase/ledgerSQLite.db';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function makeExecutor(db: SQLiteDBConnection): SqlExecutor {
  return {
    async run(sql, params = []) {
      await db.run(sql, params as any[]);
    },
    async all<T>(sql: string, params: unknown[] = []) {
      const res = await db.query(sql, params as any[]);
      return (res.values ?? []) as T[];
    },
    async transaction(fn) {
      await db.beginTransaction();
      try {
        await fn();
        await db.commitTransaction();
      } catch (err) {
        await db.rollbackTransaction();
        throw err;
      }
    }
  };
}

export class CapacitorPersistenceAdapter implements PersistenceAdapter {
  platform = 'ios' as const;
  canCreateNewLinkedFile = true;

  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;
  private exec!: SqlExecutor;

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

  private async openDb(): Promise<void> {
    const alreadyOpen = (await this.sqlite.isConnection(DB_NAME, false)).result;
    this.db = alreadyOpen
      ? await this.sqlite.retrieveConnection(DB_NAME, false)
      : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await this.db.open();
    this.exec = makeExecutor(this.db);
    // execute() (unlike run()) accepts a batch of `;`-terminated statements
    // in one call, which is all createSchema needs it for.
    await this.db.execute(CREATE_TABLE_STATEMENTS.map(s => s + ';').join('\n'));
  }

  async persistLocal(data: LedgerData): Promise<void> {
    await writeLedgerData(this.exec, data);
  }

  async writeLinkedFile(data: LedgerData): Promise<FileLinkStatus | null> {
    if (!this.status.linked) return null;
    try {
      await Filesystem.writeFile({
        path: MIRROR_FILE_NAME,
        directory: Directory.Documents,
        data: JSON.stringify(data, null, 2),
        encoding: Encoding.UTF8
      });
      this.status = { ...this.status, error: null };
    } catch (err: any) {
      console.error('Mirror file write failed', err);
      this.status = { ...this.status, error: "Couldn't update the Files app copy — your data is still safe on this device." };
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

    const { value: linkedFlag } = await Preferences.get({ key: LINK_FLAG_KEY });
    if (linkedFlag === 'true') {
      this.status = { supported: true, linked: true, name: MIRROR_FILE_NAME, needsReconnect: false, error: null };
      await this.writeLinkedFile(loaded);
    }

    return { data: loaded, fileStatus: this.status };
  }

  // See the file-level comment: iOS has no persistent external-file handle
  // API, so there's no "browse to an existing file and link it" — only
  // "start mirroring" (connectNew) or restore-then-mirror via the Settings
  // UI's upload + connectNew combination.
  async connectExisting(): Promise<LoadResult | null> {
    return null;
  }

  async connectNew(): Promise<LoadResult | null> {
    const data = await readLedgerData(this.exec);
    await Preferences.set({ key: LINK_FLAG_KEY, value: 'true' });
    this.status = { supported: true, linked: true, name: MIRROR_FILE_NAME, needsReconnect: false, error: null };
    await this.writeLinkedFile(data);
    return { data, fileStatus: this.status };
  }

  async reconnect(): Promise<LoadResult | null> {
    try {
      const result = await Filesystem.readFile({
        path: MIRROR_FILE_NAME,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
      const text = typeof result.data === 'string' ? result.data : await (result.data as Blob).text();
      const data = normalize(JSON.parse(text));
      await writeLedgerData(this.exec, data);
      this.status = { ...this.status, needsReconnect: false, error: null };
      return { data, fileStatus: this.status };
    } catch (err: any) {
      this.status = { ...this.status, error: "Couldn't read the Files app copy: " + err.message };
      return null;
    }
  }

  async disconnect(): Promise<void> {
    await Preferences.remove({ key: LINK_FLAG_KEY });
    this.status = { ...this.status, linked: false, name: null, needsReconnect: false, error: null };
  }

  // Manual backup/restore now shares/replaces the raw native .sqlite3 file
  // (see NATIVE_DB_PATH above), matching web/macOS. Reading it while the
  // connection is open is safe here because every write goes through
  // writeLedgerData()'s single-transaction full-replace (rule #10), so
  // there's no partial/uncommitted state to catch mid-write; SQLite's
  // default journal mode also checkpoints back into the main file rather
  // than leaving data stranded in a sidecar -wal file between saves.
  async downloadBackup(_data: LedgerData): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const fileName = `ledger-${stamp}.sqlite3`;
    const native = await Filesystem.readFile({ path: NATIVE_DB_PATH, directory: NATIVE_DB_DIRECTORY });
    const base64 = typeof native.data === 'string' ? native.data : uint8ArrayToBase64(new Uint8Array(await (native.data as Blob).arrayBuffer()));
    await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, data: base64 });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title: 'SimpleLedger backup', url: uri });
  }

  // Restoring means replacing the native db file's bytes outright, so the
  // live connection has to be closed first (SQLite doesn't support having
  // its underlying file swapped out from under an open handle) and
  // reopened afterward — openDb() also re-runs createSchema, which is a
  // no-op (CREATE TABLE IF NOT EXISTS-equivalent) against the freshly
  // restored file.
  async uploadBackup(file: File): Promise<unknown> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = uint8ArrayToBase64(bytes);
    await this.sqlite.closeConnection(DB_NAME, false);
    await Filesystem.writeFile({ path: NATIVE_DB_PATH, directory: NATIVE_DB_DIRECTORY, data: base64 });
    await this.openDb();
    return readLedgerData(this.exec);
  }
}

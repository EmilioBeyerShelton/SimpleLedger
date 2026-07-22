export interface ElectronLedgerBridge {
  getDefaultPath(): Promise<string>;
  /** Reads a .sqlite3 file at `filePath` (or the default local db if omitted) and returns its contents as a JSON-serialized LedgerData string. */
  dbRead(filePath?: string | null): Promise<{ ok: true; data: string | null } | { ok: false; error: string }>;
  /** Parses `jsonContents` as LedgerData and full-replace-writes it into the .sqlite3 file at `filePath` (or the default local db if omitted). */
  dbWrite(filePath: string | null | undefined, jsonContents: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Plain JSON file write — used only for manual backup snapshots, never for the live/linked SQLite stores. */
  writeJsonFile(filePath: string, jsonContents: string): Promise<{ ok: true } | { ok: false; error: string }>;
  pickOpenFile(): Promise<{ ok: true; filePath: string } | { ok: false; canceled: true }>;
  pickSaveFile(defaultName?: string): Promise<{ ok: true; filePath: string } | { ok: false; canceled: true }>;
  pickSaveJsonFile(defaultName?: string): Promise<{ ok: true; filePath: string } | { ok: false; canceled: true }>;
}

declare global {
  interface Window {
    electronLedger?: ElectronLedgerBridge;
  }
}

export interface ElectronLedgerBridge {
  getDefaultPath(): Promise<string>;
  readFile(filePath?: string | null): Promise<{ ok: true; data: string | null } | { ok: false; error: string }>;
  writeFile(filePath: string | null | undefined, contents: string): Promise<{ ok: true } | { ok: false; error: string }>;
  pickOpenFile(): Promise<{ ok: true; filePath: string } | { ok: false; canceled: true }>;
  pickSaveFile(defaultName?: string): Promise<{ ok: true; filePath: string } | { ok: false; canceled: true }>;
}

declare global {
  interface Window {
    electronLedger?: ElectronLedgerBridge;
  }
}

// Persistence contract every platform adapter implements. See
// ARCHITECTURE.md ("Persistence layer") for the full design rationale.
//
// The store (src/store/useLedgerStore.ts) only ever talks to this
// interface — it has no idea whether it's running in a browser tab, an
// Electron BrowserWindow, or an iOS WKWebView. That's the whole point of
// the abstraction: one React/Zustand codebase, three storage backends.
import type { LedgerData } from '@/types/ledger';

export type Platform = 'web' | 'macos' | 'ios';

export interface FileLinkStatus {
  /** Whether this platform supports linking an external/visible file at all. */
  supported: boolean;
  /** Whether a file is currently linked. */
  linked: boolean;
  /** Display name of the linked file, if any. */
  name: string | null;
  /** True when the link exists but permission/handle needs to be re-granted. */
  needsReconnect: boolean;
  error: string | null;
}

export const UNSUPPORTED_FILE_STATUS: FileLinkStatus = {
  supported: false,
  linked: false,
  name: null,
  needsReconnect: false,
  error: null
};

export interface LoadResult {
  data: LedgerData;
  fileStatus: FileLinkStatus;
}

export interface PersistenceAdapter {
  platform: Platform;

  /** True if `connectNew` (create a brand-new linked file) is meaningful here. */
  readonly canCreateNewLinkedFile: boolean;

  /** Load whatever was last saved (always-on local store), and reconcile
   * with a linked file if one is remembered from a previous session. */
  loadInitial(): Promise<LoadResult>;

  /** Persist to the always-on local store (localStorage / Preferences /
   * the app-support JSON file) — called on every mutation. */
  persistLocal(data: LedgerData): Promise<void>;

  /** Mirror a save out to the linked file, if any is connected. No-op
   * otherwise. Should update fileStatus (via the returned status) on
   * failure rather than throwing, since this runs on every keystroke-driven
   * save and shouldn't crash the app. */
  writeLinkedFile(data: LedgerData): Promise<FileLinkStatus | null>;

  /** Open a file picker and link to an existing file, replacing current data. */
  connectExisting(): Promise<LoadResult | null>;

  /** Create a brand-new file and link to it (web + macOS only). */
  connectNew(): Promise<LoadResult | null>;

  /** Re-request permission / re-read the already-linked file. */
  reconnect(): Promise<LoadResult | null>;

  /** Forget the linked file (local data is untouched). */
  disconnect(): Promise<void>;

  /** Manual backup: save a timestamped JSON snapshot (download / share sheet). */
  downloadBackup(data: LedgerData): Promise<void>;

  /** Manual restore: read a JSON file the user picked and return the parsed data. */
  uploadBackup(file: File): Promise<unknown>;

  getFileStatus(): FileLinkStatus;
}

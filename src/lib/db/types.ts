// The minimal SQL surface every SQLite driver we use (sqlite-wasm on web,
// @capacitor-community/sqlite on iOS) is wrapped down to. Electron doesn't
// use this — its SQLite access (better-sqlite3) lives entirely in the main
// process (electron/main.cjs), behind the same JSON-in/JSON-out IPC
// contract it always had, so the renderer-side adapter never needs a
// SqlExecutor at all. See ARCHITECTURE.md ("Persistence layer: SQLite").
export interface SqlExecutor {
  /** Run a statement with no result rows expected (DDL, DELETE, INSERT, UPDATE). */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Run a SELECT and get all matching rows back. */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run `fn` inside a transaction; rolls back if `fn` throws. */
  transaction(fn: () => Promise<void>): Promise<void>;
}

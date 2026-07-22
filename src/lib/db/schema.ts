// Canonical SQLite schema for LedgerData. This is the source of truth for
// the web (sqlite-wasm) and iOS (@capacitor-community/sqlite) adapters,
// which both import it directly.
//
// Electron is the one exception: electron/main.cjs runs in the Node main
// process, outside Vite's module graph, so it can't `import` this file. It
// carries its own plain-JS copy of the same DDL instead — see the
// "KEEP IN SYNC WITH src/lib/db/schema.ts" comment there. If you change
// anything here, change it there too.
//
// Design notes:
//  - `groups.members` is a JSON-text column (array of member name strings)
//    rather than its own table. Members are plain labels with no
//    attributes of their own, so normalizing them into a table would add
//    a join for no query benefit — see ARCHITECTURE.md.
//  - `splits` IS its own table (one row per member per group_transaction),
//    since the brief called for normalized tables and splits are the one
//    place per-row amounts genuinely benefit from it.
//  - `settings` is a single-row key/value table so the shape can grow
//    (today it holds `defaultAccountId`, `hasSeenWelcome`, `isDemoData`)
//    without a migration.
//  - `transactions.photo` is a nullable TEXT column holding a base64
//    `data:image/jpeg;base64,...` data URL, already downscaled+recompressed
//    client-side (see src/lib/utils/image.ts) before it's ever written
//    here — not a BLOB, to keep the same wire format (JSON string) usable
//    across every adapter boundary (Electron's IPC, JSON backups, etc).
export const CREATE_TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS accounts (
     id    TEXT PRIMARY KEY,
     title TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS transactions (
     id           INTEGER PRIMARY KEY,
     date         TEXT NOT NULL,
     title        TEXT NOT NULL,
     amount       REAL NOT NULL,
     from_account TEXT NOT NULL REFERENCES accounts(id),
     to_account   TEXT NOT NULL REFERENCES accounts(id),
     photo        TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS groups (
     id      INTEGER PRIMARY KEY,
     name    TEXT NOT NULL,
     members TEXT NOT NULL,
     budget  REAL
   )`,
  `CREATE TABLE IF NOT EXISTS group_transactions (
     id             INTEGER PRIMARY KEY,
     group_id       INTEGER NOT NULL REFERENCES groups(id),
     transaction_id INTEGER NOT NULL REFERENCES transactions(id)
   )`,
  `CREATE TABLE IF NOT EXISTS splits (
     group_transaction_id INTEGER NOT NULL REFERENCES group_transactions(id),
     member                TEXT NOT NULL,
     amount                REAL NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_account)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_account)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_group_transactions_group ON group_transactions(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_transactions_tx ON group_transactions(transaction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_splits_gtx ON splits(group_transaction_id)`
];

// Full-replace writes (see ledgerRepository.ts) delete in child-to-parent
// order to respect the foreign keys above.
export const TABLES_IN_DELETE_ORDER = ['splits', 'group_transactions', 'groups', 'transactions', 'accounts', 'settings'];

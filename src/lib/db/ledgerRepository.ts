// The shared read/write layer on top of a SqlExecutor. Both the web
// adapter (sqlite-wasm) and the iOS adapter (@capacitor-community/sqlite)
// drive their SQLite connection through this same code — it's the one
// place that knows how a LedgerData object maps onto the six tables in
// schema.ts.
//
// Writes are "full replace": every save wipes every table and reinserts
// from the in-memory LedgerData the Zustand store just computed, all
// inside one transaction. That mirrors the store's existing `mutate()`
// pattern (which already recomputes the whole LedgerData object per
// action) and keeps this layer simple — no per-action SQL, no diffing.
// It's the right trade-off for personal-finance-scale data (hundreds to
// low thousands of rows); if this ever needs to scale to something much
// bigger, the place to optimize is here, without touching the store or
// any UI code. See ARCHITECTURE.md ("Persistence layer: SQLite").
import type { LedgerData } from '@/types/ledger';
import type { SqlExecutor } from './types';
import { CREATE_TABLE_STATEMENTS, TABLES_IN_DELETE_ORDER } from './schema';
import {
  accountsToRows, rowsToAccounts,
  transactionsToRows, rowsToTransactions,
  groupsToRows, rowsToGroups,
  groupTransactionsToRows, rowsToGroupTransactions,
  settingsToRows, rowsToSettings,
  type AccountRow, type TransactionRow, type GroupRow, type GroupTransactionRow, type SplitRow, type SettingRow
} from './mapping';

export async function createSchema(exec: SqlExecutor): Promise<void> {
  for (const stmt of CREATE_TABLE_STATEMENTS) {
    await exec.run(stmt);
  }
  // `CREATE TABLE IF NOT EXISTS` doesn't retroactively add columns to a
  // table that already existed (e.g. a local db created before the
  // `photo` column existed) — ALTER TABLE ADD COLUMN backfills it.
  // SQLite errors if the column's already there; ignore that case.
  try {
    await exec.run('ALTER TABLE transactions ADD COLUMN photo TEXT');
  } catch {
    // already has the column
  }
}

export async function readLedgerData(exec: SqlExecutor): Promise<LedgerData> {
  const [accountRows, transactionRows, groupRows, gtRows, splitRows, settingRows] = await Promise.all([
    exec.all<AccountRow>('SELECT id, title FROM accounts'),
    exec.all<TransactionRow>('SELECT id, date, title, amount, from_account, to_account, photo FROM transactions'),
    exec.all<GroupRow>('SELECT id, name, members, budget FROM groups'),
    exec.all<GroupTransactionRow>('SELECT id, group_id, transaction_id FROM group_transactions'),
    exec.all<SplitRow>('SELECT group_transaction_id, member, amount FROM splits'),
    exec.all<SettingRow>('SELECT key, value FROM settings')
  ]);

  return {
    accounts: rowsToAccounts(accountRows),
    transactions: rowsToTransactions(transactionRows),
    groups: rowsToGroups(groupRows),
    groupTransactions: rowsToGroupTransactions(gtRows, splitRows),
    settings: rowsToSettings(settingRows)
  };
}

export async function writeLedgerData(exec: SqlExecutor, data: LedgerData): Promise<void> {
  const accountRows = accountsToRows(data.accounts);
  const transactionRows = transactionsToRows(data.transactions);
  const groupRows = groupsToRows(data.groups);
  const { gt: gtRows, splits: splitRows } = groupTransactionsToRows(data.groupTransactions);
  const settingRows = settingsToRows(data.settings);

  await exec.transaction(async () => {
    for (const table of TABLES_IN_DELETE_ORDER) {
      await exec.run(`DELETE FROM ${table}`);
    }
    for (const a of accountRows) {
      await exec.run('INSERT INTO accounts (id, title) VALUES (?, ?)', [a.id, a.title]);
    }
    for (const t of transactionRows) {
      await exec.run(
        'INSERT INTO transactions (id, date, title, amount, from_account, to_account, photo) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [t.id, t.date, t.title, t.amount, t.from_account, t.to_account, t.photo]
      );
    }
    for (const g of groupRows) {
      await exec.run('INSERT INTO groups (id, name, members, budget) VALUES (?, ?, ?, ?)', [g.id, g.name, g.members, g.budget]);
    }
    for (const gt of gtRows) {
      await exec.run('INSERT INTO group_transactions (id, group_id, transaction_id) VALUES (?, ?, ?)', [gt.id, gt.group_id, gt.transaction_id]);
    }
    for (const s of splitRows) {
      await exec.run('INSERT INTO splits (group_transaction_id, member, amount) VALUES (?, ?, ?)', [s.group_transaction_id, s.member, s.amount]);
    }
    for (const s of settingRows) {
      await exec.run('INSERT INTO settings (key, value) VALUES (?, ?)', [s.key, s.value]);
    }
  });
}

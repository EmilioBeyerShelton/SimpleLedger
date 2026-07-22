// Core data shape — a direct TypeScript port of the schema documented in
// the original README.md ("Data shape"). Kept intentionally flat and
// JSON-serializable since it's what gets written verbatim to disk/file by
// every persistence adapter.

export interface Account {
  /** Dotted hierarchy path, e.g. "expenses.groceries.edeka". Also the identifier. */
  id: string;
  /** Display name, e.g. "EDEKA". */
  title: string;
}

export interface Transaction {
  id: number;
  /** ISO date string, YYYY-MM-DD. */
  date: string;
  title: string;
  amount: number;
  /** Account id money leaves. */
  from: string;
  /** Account id money arrives at. */
  to: string;
}

export interface Group {
  id: number;
  name: string;
  members: string[];
  /** null = open-ended, no cap. */
  budget: number | null;
}

export interface Split {
  member: string;
  amount: number;
}

/** Join table: links a transaction to a budget/group. Optional, many-to-one,
 * purely informational — it never affects account balances. */
export interface GroupTransaction {
  id: number;
  groupId: number;
  transactionId: number;
  splits: Split[];
}

export interface Settings {
  defaultAccountId: string | null;
}

export interface LedgerData {
  accounts: Account[];
  transactions: Transaction[];
  groups: Group[];
  groupTransactions: GroupTransaction[];
  settings: Settings;
}

/** Payload shape used by the Add/Edit expense form — a transaction plus an
 * optional group link, which the store splits apart into `transactions` +
 * `groupTransactions` on save. */
export interface TransactionFormPayload {
  title: string;
  amount: number;
  date: string;
  from: string;
  to: string;
  groupId: number | null;
  splits: Split[] | null;
}

export interface AccountFormPayload {
  title: string;
  id: string;
  oldId: string | null;
  makeDefault: boolean;
}

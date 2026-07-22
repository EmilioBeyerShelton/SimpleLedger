// LedgerData <-> flat SQL row shapes. Pure data transforms, no I/O — kept
// separate from ledgerRepository.ts so they're easy to unit test and reuse
// (e.g. a future export-to-CSV feature could read straight off these row
// shapes instead of the nested LedgerData tree).
import type { LedgerData, Account, Transaction, Group, GroupTransaction } from '@/types/ledger';

export interface AccountRow { id: string; title: string }
export interface TransactionRow { id: number; date: string; title: string; amount: number; from_account: string; to_account: string }
export interface GroupRow { id: number; name: string; members: string; budget: number | null }
export interface GroupTransactionRow { id: number; group_id: number; transaction_id: number }
export interface SplitRow { group_transaction_id: number; member: string; amount: number }
export interface SettingRow { key: string; value: string | null }

export function accountsToRows(accounts: Account[]): AccountRow[] {
  return accounts.map(a => ({ id: a.id, title: a.title }));
}

export function rowsToAccounts(rows: AccountRow[]): Account[] {
  return rows.map(r => ({ id: r.id, title: r.title }));
}

export function transactionsToRows(transactions: Transaction[]): TransactionRow[] {
  return transactions.map(t => ({ id: t.id, date: t.date, title: t.title, amount: t.amount, from_account: t.from, to_account: t.to }));
}

export function rowsToTransactions(rows: TransactionRow[]): Transaction[] {
  return rows.map(r => ({ id: r.id, date: r.date, title: r.title, amount: r.amount, from: r.from_account, to: r.to_account }));
}

export function groupsToRows(groups: Group[]): GroupRow[] {
  return groups.map(g => ({ id: g.id, name: g.name, members: JSON.stringify(g.members), budget: g.budget }));
}

export function rowsToGroups(rows: GroupRow[]): Group[] {
  return rows.map(r => ({ id: r.id, name: r.name, members: safeParseMembers(r.members), budget: r.budget }));
}

function safeParseMembers(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function groupTransactionsToRows(gts: GroupTransaction[]): { gt: GroupTransactionRow[]; splits: SplitRow[] } {
  const gt: GroupTransactionRow[] = [];
  const splits: SplitRow[] = [];
  gts.forEach(g => {
    gt.push({ id: g.id, group_id: g.groupId, transaction_id: g.transactionId });
    g.splits.forEach(s => splits.push({ group_transaction_id: g.id, member: s.member, amount: s.amount }));
  });
  return { gt, splits };
}

export function rowsToGroupTransactions(gtRows: GroupTransactionRow[], splitRows: SplitRow[]): GroupTransaction[] {
  const splitsByGtId = new Map<number, { member: string; amount: number }[]>();
  splitRows.forEach(s => {
    const list = splitsByGtId.get(s.group_transaction_id) ?? [];
    list.push({ member: s.member, amount: s.amount });
    splitsByGtId.set(s.group_transaction_id, list);
  });
  return gtRows.map(r => ({ id: r.id, groupId: r.group_id, transactionId: r.transaction_id, splits: splitsByGtId.get(r.id) ?? [] }));
}

export function settingsToRows(settings: LedgerData['settings']): SettingRow[] {
  return [{ key: 'defaultAccountId', value: settings.defaultAccountId }];
}

export function rowsToSettings(rows: SettingRow[]): LedgerData['settings'] {
  const row = rows.find(r => r.key === 'defaultAccountId');
  return { defaultAccountId: row?.value ?? null };
}

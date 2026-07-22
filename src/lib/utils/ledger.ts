// Direct port of the original js/utils.js — ids, formatting, and the
// double-entry ledger math. Behavior is unchanged; only the module system
// and types are new.
import type { Account, Group, GroupTransaction, Transaction, Split } from '@/types/ledger';

// ---------- ids ----------
export function nextId(list: { id: number }[]): number {
  return list.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1;
}

// ---------- formatting ----------
export function todayStr(): string {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function formatAmount(amount: number): string {
  const n = Number(amount) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(str: string): string {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------- ledger math ----------
// Simple double-entry balance: every transaction moves `amount` out of
// `from` and into `to`. An account's balance is the sum of everything
// that flowed in, minus everything that flowed out.
export function accountBalance(accountId: string, transactions: Transaction[]): number {
  let bal = 0;
  for (const t of transactions) {
    if (t.to === accountId) bal += t.amount;
    if (t.from === accountId) bal -= t.amount;
  }
  return bal;
}

export function accountName(accounts: Account[], id: string | null | undefined): string {
  const a = accounts.find(a => a.id === id);
  return a ? a.title : (id || '—');
}

// Cleans up user-typed account paths: lowercase, dots stay as hierarchy
// separators, whitespace becomes underscores, anything else disallowed is
// stripped.
export function normalizeAccountId(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '');
}

export function groupName(groups: Group[], id: number | null | undefined): string {
  const g = groups.find(g => g.id === id);
  return g ? g.name : '';
}

// Splits an amount evenly across members down to the cent, handing any
// leftover pennies to the first members so the total always matches exactly.
export function splitEqually(amount: number, members: string[]): Split[] {
  if (!members.length) return [];
  const cents = Math.round(Number(amount) * 100) || 0;
  const base = Math.floor(cents / members.length);
  const remainder = cents - base * members.length;
  return members.map((m, i) => ({
    member: m,
    amount: (base + (i < remainder ? 1 : 0)) / 100
  }));
}

// Per-member totals of what they've been assigned across every expense
// linked to a group (via the groupTransactions join table).
export function groupMemberTotals(group: Group, groupTransactions: GroupTransaction[]): Record<string, number> {
  const totals: Record<string, number> = {};
  group.members.forEach(m => { totals[m] = 0; });
  groupTransactions
    .filter(gt => gt.groupId === group.id && Array.isArray(gt.splits))
    .forEach(gt => {
      gt.splits.forEach(s => {
        totals[s.member] = (totals[s.member] || 0) + s.amount;
      });
    });
  return totals;
}

// Overall amount spent under a group/budget.
export function groupSpent(groupId: number, groupTransactions: GroupTransaction[], transactions: Transaction[]): number {
  const txIds = new Set(
    groupTransactions.filter(gt => gt.groupId === groupId).map(gt => gt.transactionId)
  );
  if (!txIds.size) return 0;
  return transactions
    .filter(t => txIds.has(t.id))
    .reduce((s, t) => s + t.amount, 0);
}

// All transactions linked to a group, newest first.
export function groupTransactionList(groupId: number, groupTransactions: GroupTransaction[], transactions: Transaction[]): Transaction[] {
  const txIds = new Set(
    groupTransactions.filter(gt => gt.groupId === groupId).map(gt => gt.transactionId)
  );
  return transactions
    .filter(t => txIds.has(t.id))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ---------- date grouping ----------
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dateBucket(dateStr: string, today?: Date): string {
  if (!dateStr) return '';
  const now = today || new Date();
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((t.getTime() - d.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const dow = t.getDay();
  const daysSinceMonday = (dow + 6) % 7;
  const startOfWeek = new Date(t);
  startOfWeek.setDate(t.getDate() - daysSinceMonday);

  if (d >= startOfWeek) return 'This week';

  const label = MONTH_NAMES[d.getMonth()];
  return d.getFullYear() === t.getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

export function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

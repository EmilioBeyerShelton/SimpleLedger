// Direct port of the `normalize()` / `defaultData()` migration logic from
// the original js/store.js. Runs on every load, from every adapter, so
// old exports (even pre-React ones with the legacy numeric account ids or
// inline groupId/splits on transactions) keep working.
import type { LedgerData } from '@/types/ledger';

export function defaultData(): LedgerData {
  return {
    accounts: [
      { id: 'assets.bank_accounts.checkings', title: 'checkings' },
      { id: 'expenses', title: 'expenses' }
    ],
    transactions: [],
    groups: [],
    groupTransactions: [],
    settings: {
      defaultAccountId: 'assets.bank_accounts.checkings'
    }
  };
}

function slugify(s: unknown): string {
  return (
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'account'
  );
}

export function normalize(parsed: unknown): LedgerData {
  const base = defaultData();
  if (!parsed || typeof parsed !== 'object') return base;
  const p = parsed as Record<string, any>;

  const legacyIdMap: Record<string, string> = {};
  const seenIds = new Set<string>();

  function uniqueId(candidate: string): string {
    let id = candidate;
    let n = 2;
    while (seenIds.has(id)) { id = candidate + '_' + n; n++; }
    seenIds.add(id);
    return id;
  }

  const rawAccounts = Array.isArray(p.accounts) && p.accounts.length ? p.accounts : base.accounts;
  const accounts = rawAccounts
    .filter((a: any) => a && typeof a === 'object')
    .map((a: any) => {
      if (typeof a.id === 'string' && a.id && a.title) {
        const id = uniqueId(a.id);
        return { id, title: String(a.title) };
      }
      const title = String(a.title || a.name || 'Account');
      const prefix = a.type === 'asset' ? 'assets' : 'expenses';
      const id = uniqueId(prefix + '.' + slugify(title));
      if (a.id !== undefined) legacyIdMap[String(a.id)] = id;
      return { id, title };
    });

  function mapAccountRef(val: unknown): string | null {
    if (val == null || val === '') return null;
    const key = String(val);
    if (legacyIdMap[key]) return legacyIdMap[key];
    return key;
  }

  const rawTransactions = Array.isArray(p.transactions)
    ? p.transactions
        .filter((t: any) => t && typeof t === 'object')
        .map((t: any) => ({
          id: Number(t.id),
          date: String(t.date || ''),
          title: String(t.title || ''),
          amount: Number(t.amount) || 0,
          from: mapAccountRef(t.from),
          to: mapAccountRef(t.to),
          photo: typeof t.photo === 'string' && t.photo ? t.photo : null,
          legacyGroupId: t.groupId != null && t.groupId !== '' ? Number(t.groupId) : null,
          legacySplits: Array.isArray(t.splits)
            ? t.splits.map((s: any) => ({ member: String(s.member || ''), amount: Number(s.amount) || 0 }))
            : null
        }))
    : [];

  const transactions = rawTransactions.map(({ legacyGroupId, legacySplits, ...t }: any) => t);

  const groups = Array.isArray(p.groups)
    ? p.groups
        .filter((g: any) => g && typeof g === 'object')
        .map((g: any) => ({
          id: Number(g.id),
          name: String(g.name || ''),
          members: Array.isArray(g.members) ? g.members.map(String) : [],
          budget: g.budget != null && g.budget !== '' && !Number.isNaN(Number(g.budget)) ? Number(g.budget) : null
        }))
    : [];
  const groupIds = new Set(groups.map((g: any) => g.id));

  let nextGroupTxId = 1;
  const groupTransactions: LedgerData['groupTransactions'] = [];

  if (Array.isArray(p.groupTransactions)) {
    p.groupTransactions
      .filter((gt: any) => gt && typeof gt === 'object')
      .forEach((gt: any) => {
        const groupId = Number(gt.groupId);
        const transactionId = Number(gt.transactionId);
        if (!groupIds.has(groupId)) return;
        const splits = Array.isArray(gt.splits)
          ? gt.splits.map((s: any) => ({ member: String(s.member || ''), amount: Number(s.amount) || 0 }))
          : [];
        groupTransactions.push({ id: nextGroupTxId++, groupId, transactionId, splits });
      });
  }

  rawTransactions.forEach((t: any) => {
    if (t.legacyGroupId != null && groupIds.has(t.legacyGroupId)) {
      groupTransactions.push({
        id: nextGroupTxId++,
        groupId: t.legacyGroupId,
        transactionId: t.id,
        splits: t.legacySplits || []
      });
    }
  });

  const settings = {
    defaultAccountId:
      p.settings && typeof p.settings.defaultAccountId === 'string' && p.settings.defaultAccountId
        ? mapAccountRef(p.settings.defaultAccountId)
        : base.settings.defaultAccountId
  };

  return { accounts, transactions, groups, groupTransactions, settings };
}

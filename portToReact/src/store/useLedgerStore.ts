// The single source of truth for app state. Replaces the original
// js/store.js `useStore()` hook + the mutation helpers that lived in
// js/app.js — both are folded into one Zustand store so every
// page/component can select just the slice it needs instead of drilling
// props through a tree.
//
// Persistence is delegated entirely to a PersistenceAdapter (web /
// Capacitor / Electron — see src/lib/persistence). This store doesn't know
// or care which platform it's running on.
import { create } from 'zustand';
import type { LedgerData, TransactionFormPayload, AccountFormPayload } from '@/types/ledger';
import { nextId } from '@/lib/utils/ledger';
import { getPersistenceAdapter } from '@/lib/persistence';
import type { PersistenceAdapter, FileLinkStatus } from '@/lib/persistence/types';
import { normalize, defaultData } from '@/lib/persistence/normalize';

interface LedgerState {
  data: LedgerData | null;
  loading: boolean;
  fileStatus: FileLinkStatus;
  adapter: PersistenceAdapter | null;

  init: () => Promise<void>;

  // Central mutation entry point — mirrors store.js's `update()`.
  mutate: (updater: (prev: LedgerData) => LedgerData) => void;

  addTransaction: (payload: TransactionFormPayload) => void;
  updateTransaction: (id: number, payload: TransactionFormPayload) => void;
  deleteTransaction: (id: number) => void;

  saveAccount: (payload: AccountFormPayload) => void;
  deleteAccount: (id: string) => { ok: boolean; reason?: string };

  addGroup: (name: string, members: string[], budget: number | null) => void;
  updateGroupBudget: (id: number, raw: string) => void;
  deleteGroup: (id: number) => void;

  setDefaultAccount: (id: string | null) => void;

  connectExisting: () => Promise<void>;
  connectNew: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  downloadBackup: () => Promise<void>;
  uploadBackup: (file: File) => Promise<{ ok: boolean; error?: string }>;
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  data: null,
  loading: true,
  fileStatus: { supported: false, linked: false, name: null, needsReconnect: false, error: null },
  adapter: null,

  init: async () => {
    const adapter = await getPersistenceAdapter();
    const { data, fileStatus } = await adapter.loadInitial();
    set({ data, fileStatus, adapter, loading: false });
  },

  mutate: updater => {
    const { data, adapter } = get();
    if (!data) return;
    const next = updater(data);
    set({ data: next });
    adapter?.persistLocal(next);
    adapter?.writeLinkedFile(next).then(status => {
      if (status) set({ fileStatus: status });
    });
  },

  addTransaction: payload => {
    const { groupId, splits, ...txFields } = payload;
    get().mutate(d => {
      const newId = nextId(d.transactions);
      const transactions = [...d.transactions, { ...txFields, id: newId }];
      const groupTransactions = groupId
        ? [...d.groupTransactions, { id: nextId(d.groupTransactions), groupId, transactionId: newId, splits: splits || [] }]
        : d.groupTransactions;
      return { ...d, transactions, groupTransactions };
    });
  },

  updateTransaction: (id, payload) => {
    const { groupId, splits, ...txFields } = payload;
    get().mutate(d => {
      const transactions = d.transactions.map(t => (t.id === id ? { ...t, ...txFields } : t));
      const remaining = d.groupTransactions.filter(gt => gt.transactionId !== id);
      const groupTransactions = groupId
        ? [...remaining, { id: nextId(remaining), groupId, transactionId: id, splits: splits || [] }]
        : remaining;
      return { ...d, transactions, groupTransactions };
    });
  },

  deleteTransaction: id => {
    get().mutate(d => ({
      ...d,
      transactions: d.transactions.filter(t => t.id !== id),
      groupTransactions: d.groupTransactions.filter(gt => gt.transactionId !== id)
    }));
  },

  saveAccount: ({ title, id, oldId, makeDefault }) => {
    get().mutate(d => {
      const nextAccounts = oldId
        ? d.accounts.map(a => (a.id === oldId ? { id, title } : a))
        : [...d.accounts, { id, title }];

      const nextTransactions =
        oldId && oldId !== id
          ? d.transactions.map(t => ({
              ...t,
              from: t.from === oldId ? id : t.from,
              to: t.to === oldId ? id : t.to
            }))
          : d.transactions;

      let nextDefaultId = d.settings.defaultAccountId;
      if (makeDefault) {
        nextDefaultId = id;
      } else if (oldId && nextDefaultId === oldId) {
        nextDefaultId = null;
      }

      return {
        ...d,
        accounts: nextAccounts,
        transactions: nextTransactions,
        settings: { ...d.settings, defaultAccountId: nextDefaultId }
      };
    });
  },

  deleteAccount: id => {
    const { data } = get();
    if (!data) return { ok: false };
    const inUse = data.transactions.some(t => t.from === id || t.to === id);
    if (inUse) return { ok: false, reason: 'This account is used by one or more expenses — reassign or delete those first.' };
    get().mutate(d => ({
      ...d,
      accounts: d.accounts.filter(a => a.id !== id),
      settings: { ...d.settings, defaultAccountId: d.settings.defaultAccountId === id ? null : d.settings.defaultAccountId }
    }));
    return { ok: true };
  },

  addGroup: (name, members, budget) => {
    get().mutate(d => ({
      ...d,
      groups: [...d.groups, { id: nextId(d.groups), name, members, budget }]
    }));
  },

  updateGroupBudget: (id, raw) => {
    const budget = raw.trim() && !Number.isNaN(Number(raw)) ? Number(raw) : null;
    get().mutate(d => ({
      ...d,
      groups: d.groups.map(g => (g.id === id ? { ...g, budget } : g))
    }));
  },

  deleteGroup: id => {
    get().mutate(d => ({
      ...d,
      groups: d.groups.filter(g => g.id !== id),
      groupTransactions: d.groupTransactions.filter(gt => gt.groupId !== id)
    }));
  },

  setDefaultAccount: id => {
    get().mutate(d => ({ ...d, settings: { ...d.settings, defaultAccountId: id } }));
  },

  connectExisting: async () => {
    const { adapter } = get();
    const result = await adapter?.connectExisting();
    if (result) set({ data: result.data, fileStatus: result.fileStatus });
    else if (adapter) set({ fileStatus: adapter.getFileStatus() });
  },

  connectNew: async () => {
    const { adapter } = get();
    const result = await adapter?.connectNew();
    if (result) set({ data: result.data, fileStatus: result.fileStatus });
    else if (adapter) set({ fileStatus: adapter.getFileStatus() });
  },

  reconnect: async () => {
    const { adapter } = get();
    const result = await adapter?.reconnect();
    if (result) set({ data: result.data, fileStatus: result.fileStatus });
    else if (adapter) set({ fileStatus: adapter.getFileStatus() });
  },

  disconnect: async () => {
    const { adapter } = get();
    await adapter?.disconnect();
    if (adapter) set({ fileStatus: adapter.getFileStatus() });
  },

  downloadBackup: async () => {
    const { adapter, data } = get();
    if (!adapter || !data) return;
    await adapter.downloadBackup(data);
  },

  uploadBackup: async file => {
    const { adapter } = get();
    if (!adapter) return { ok: false, error: 'No storage adapter available.' };
    try {
      const parsed = normalize(await adapter.uploadBackup(file));
      get().mutate(() => parsed);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Could not read that file.' };
    }
  }
}));

// Exported for tests / the empty-state fallback in App.tsx.
export { defaultData };

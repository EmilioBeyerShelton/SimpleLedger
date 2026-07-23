// Port of js/components/HistoryView.js — the "Transactions" tab: search,
// filters, date-grouped list, and add/edit dialogs.
import { useMemo, useState } from 'react';
import { useLedgerStore } from '@/store/useLedgerStore';
import { accountName, dateBucket, formatAmount, formatDayLabel, groupName } from '@/lib/utils/ledger';
import { AccountPicker } from '@/components/AccountPicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TransactionForm, type TransactionFormInitial } from '@/components/TransactionForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, Plus } from 'lucide-react';
import { toast } from 'sonner';

type Row = { type: 'divider'; label: string; key: string } | { type: 'day'; label: string; key: string } | { type: 'tx'; tx: any; key: number };

export default function TransactionsPage() {
  const data = useLedgerStore(s => s.data)!;
  const addTransaction = useLedgerStore(s => s.addTransaction);
  const updateTransaction = useLedgerStore(s => s.updateTransaction);
  const deleteTransaction = useLedgerStore(s => s.deleteTransaction);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; title: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterGroupId, setFilterGroupId] = useState('');

  const linkByTxId = useMemo(() => {
    const map = new Map<number, (typeof data.groupTransactions)[number]>();
    data.groupTransactions.forEach(gt => map.set(gt.transactionId, gt));
    return map;
  }, [data.groupTransactions]);

  const sorted = useMemo(() => {
    const dir = sortOrder === 'asc' ? 1 : -1;
    return [...data.transactions].sort((a, b) => dir * (a.date || '').localeCompare(b.date || '') || dir * (a.id - b.id));
  }, [data.transactions, sortOrder]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sorted.filter(t => {
      if (filterFrom && t.from !== filterFrom) return false;
      if (filterTo && t.to !== filterTo) return false;
      if (filterDateFrom && t.date < filterDateFrom) return false;
      if (filterDateTo && t.date > filterDateTo) return false;
      if (filterGroupId && (!linkByTxId.get(t.id) || linkByTxId.get(t.id)!.groupId !== Number(filterGroupId))) return false;
      if (q) {
        const fromName = accountName(data.accounts, t.from).toLowerCase();
        const toName = accountName(data.accounts, t.to).toLowerCase();
        const matches =
          t.title.toLowerCase().includes(q) ||
          String(t.from).toLowerCase().includes(q) ||
          String(t.to).toLowerCase().includes(q) ||
          fromName.includes(q) ||
          toName.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [sorted, searchQuery, filterFrom, filterTo, filterDateFrom, filterDateTo, filterGroupId, data.accounts, linkByTxId]);

  const rows = useMemo(() => {
    const today = new Date();
    const out: Row[] = [];
    let lastBucket: string | null = null;
    let lastDay: string | null = null;
    filtered.forEach(t => {
      const bucket = dateBucket(t.date, today);
      if (bucket !== lastBucket) {
        out.push({ type: 'divider', label: bucket, key: `divider-${bucket}-${t.id}` });
        lastBucket = bucket;
        lastDay = null;
      }
      const showDay = bucket !== 'Today' && bucket !== 'Yesterday' && t.date !== lastDay;
      if (showDay) out.push({ type: 'day', label: formatDayLabel(t.date), key: `day-${t.date}-${t.id}` });
      lastDay = t.date;
      out.push({ type: 'tx', tx: t, key: t.id });
    });
    return out;
  }, [filtered]);

  const activeFilterCount = [filterFrom, filterTo, filterDateFrom, filterDateTo, filterGroupId].filter(Boolean).length;

  function clearFilters() {
    setFilterFrom('');
    setFilterTo('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterGroupId('');
  }

  const editing = editingId != null ? data.transactions.find(t => t.id === editingId) : null;
  const editingLink = editing ? linkByTxId.get(editing.id) : null;
  const editingInitial: TransactionFormInitial | null = editing
    ? { ...editing, groupId: editingLink ? editingLink.groupId : null, splits: editingLink ? editingLink.splits : null }
    : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transactions</h2>
        {/* On mobile this collapses to the floating "+" button below,
            hovering over the list above the bottom nav — the full-text
            button only makes sense once BottomNav has become a top bar
            (see BottomNav.tsx's md: variants) and there's no bottom edge
            to float above. */}
        <Button size="sm" className="hidden md:inline-flex" onClick={() => setShowAdd(true)}><Plus className="mr-1 h-4 w-4" />Add expense</Button>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Search title, from, or to…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <Button variant={activeFilterCount > 0 ? 'default' : 'outline'} size="icon" className="relative shrink-0" onClick={() => setShowFilter(true)}>
          <Filter className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {data.transactions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No expenses yet. Tap "Add expense" to create your first one.</p>}
      {data.transactions.length > 0 && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No expenses match your search or filters.</p>}

      <div className="flex flex-col">
        {rows.map(row => {
          if (row.type === 'divider') return <div key={row.key} className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{row.label}</div>;
          if (row.type === 'day') return <div key={row.key} className="mb-1 mt-2 text-xs text-muted-foreground">{row.label}</div>;
          const t = row.tx;
          const link = linkByTxId.get(t.id);
          return (
            <button
              key={row.key}
              className="flex items-center justify-between gap-3 border-b py-2.5 text-left last:border-b-0 hover:bg-accent/50"
              onClick={() => setEditingId(t.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {accountName(data.accounts, t.from)} → {accountName(data.accounts, t.to)}
                  {link && <> · <Badge variant="secondary" className="ml-1 align-middle">{groupName(data.groups, link.groupId)}</Badge></>}
                </div>
              </div>
              <div className="shrink-0 font-medium tabular-nums">{formatAmount(t.amount)}</div>
            </button>
          );
        })}
      </div>

      {/* Floating "add expense" button — mobile only (BottomNav is a real
          bottom bar there); hovers above it over the list. Hidden at md:
          and up, where the header's text button (above) takes over,
          matching BottomNav's own mobile/desktop split. */}
      <Button
        size="icon"
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden"
        onClick={() => setShowAdd(true)}
        aria-label="Add expense"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* onOpenAutoFocus is suppressed here (but not on the "Add expense"
          dialog below): this dialog doubles as a read-only detail view of
          an existing expense, so auto-focusing/auto-selecting the Title
          field's text the instant it opens doesn't make sense the way it
          does for a blank "new expense" form. */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditingId(null)}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Edit expense</DialogTitle></DialogHeader>
          {editingInitial && (
            <TransactionForm
              accounts={data.accounts}
              groups={data.groups}
              initial={editingInitial}
              onSave={patch => { updateTransaction(editingInitial.id, patch); setEditingId(null); toast('Expense updated.'); }}
              onCancel={() => setEditingId(null)}
              onDelete={() => {
                setEditingId(null);
                setPendingDelete({ id: editingInitial.id, title: editingInitial.title });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={open => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete "${pendingDelete.title}"?` : 'Delete expense?'}
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteTransaction(pendingDelete.id);
          toast('Expense deleted.');
        }}
      />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
          <TransactionForm
            accounts={data.accounts}
            groups={data.groups}
            settings={data.settings}
            onSave={tx => { addTransaction(tx); setShowAdd(false); toast('Expense added.'); }}
            onCancel={() => setShowAdd(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showFilter} onOpenChange={setShowFilter}>
        <DialogContent>
          <DialogHeader><DialogTitle>Filter expenses</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Sort by date</span>
              <div className="flex gap-2">
                <Button type="button" variant={sortOrder === 'desc' ? 'default' : 'outline'} size="sm" onClick={() => setSortOrder('desc')}>Newest first</Button>
                <Button type="button" variant={sortOrder === 'asc' ? 'default' : 'outline'} size="sm" onClick={() => setSortOrder('asc')}>Oldest first</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">From account</span>
                <AccountPicker accounts={data.accounts} value={filterFrom} onChange={setFilterFrom} placeholder="Any account" allowClear />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">To account</span>
                <AccountPicker accounts={data.accounts} value={filterTo} onChange={setFilterTo} placeholder="Any account" allowClear />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">From date</span>
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">To date</span>
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Budget</span>
              <Select value={filterGroupId || '__any'} onValueChange={v => setFilterGroupId(v === '__any' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Any budget" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Any budget</SelectItem>
                  {data.groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button type="button" variant="ghost" onClick={clearFilters}>Clear filters</Button>
              <Button type="button" onClick={() => setShowFilter(false)}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

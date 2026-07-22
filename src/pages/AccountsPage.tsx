// Port of js/components/AccountsView.js — account list, balances, default marker.
import { useState } from 'react';
import { useLedgerStore } from '@/store/useLedgerStore';
import { accountBalance, formatAmount } from '@/lib/utils/ledger';
import { AccountForm } from '@/components/AccountForm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function AccountsPage() {
  const data = useLedgerStore(s => s.data)!;
  const saveAccount = useLedgerStore(s => s.saveAccount);
  const deleteAccount = useLedgerStore(s => s.deleteAccount);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const defaultId = data.settings.defaultAccountId;
  const sorted = [...data.accounts].sort((a, b) => a.id.localeCompare(b.id));
  const editing = editingId != null ? data.accounts.find(a => a.id === editingId) : null;

  function handleDelete(id: string) {
    const acc = data.accounts.find(a => a.id === id);
    if (!acc) return;
    const result = deleteAccount(id);
    if (!result.ok) { alert(result.reason); return; }
    setEditingId(null);
    toast(`Deleted "${acc.title}".`);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Accounts</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="mr-1 h-4 w-4" />Add account</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Money always moves from one account to another — accounts are also categories. The path
        (e.g. <code className="rounded bg-muted px-1 py-0.5">expenses.groceries.edeka</code>) is what you filter and pick against when adding
        an expense; the title is just what's shown.
      </p>

      <div className="flex flex-col">
        {sorted.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No accounts yet.</p>}
        {sorted.map(a => {
          const bal = accountBalance(a.id, data.transactions);
          const isDefault = a.id === defaultId;
          return (
            <button
              key={a.id}
              className="flex items-center gap-3 border-b py-2.5 text-left last:border-b-0 hover:bg-accent/50"
              onClick={() => setEditingId(a.id)}
            >
              <Star className={cn('h-4 w-4 shrink-0', isDefault ? 'fill-amber-400 text-amber-400' : 'text-transparent')} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.title}</div>
                <div className="truncate text-xs text-muted-foreground">{a.id}</div>
              </div>
              <div className={cn('shrink-0 font-medium tabular-nums', bal < 0 && 'text-destructive')}>{formatAmount(bal)}</div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={open => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit account</DialogTitle></DialogHeader>
          {editing && (
            <AccountForm
              accounts={data.accounts}
              initial={editing}
              isDefault={editing.id === defaultId}
              onSave={patch => { saveAccount(patch); setEditingId(null); toast('Account saved.'); }}
              onCancel={() => setEditingId(null)}
              onDelete={() => handleDelete(editing.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add account</DialogTitle></DialogHeader>
          <AccountForm
            accounts={data.accounts}
            isDefault={false}
            onSave={patch => { saveAccount(patch); setShowAdd(false); toast('Account added.'); }}
            onCancel={() => setShowAdd(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

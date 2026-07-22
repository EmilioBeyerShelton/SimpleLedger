// Port of js/components/BudgetsView.js — budgets: spend totals, depletion
// bar, per-member totals, linked expenses.
import { useState } from 'react';
import { useLedgerStore } from '@/store/useLedgerStore';
import { formatAmount, formatDate, groupMemberTotals, groupSpent, groupTransactionList } from '@/lib/utils/ledger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BudgetsPage() {
  const data = useLedgerStore(s => s.data)!;
  const addGroup = useLedgerStore(s => s.addGroup);
  const updateGroupBudget = useLedgerStore(s => s.updateGroupBudget);
  const deleteGroup = useLedgerStore(s => s.deleteGroup);

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [membersText, setMembersText] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const members = membersText.split(',').map(m => m.trim()).filter(Boolean);
    if (!trimmedName) return;
    if (members.length === 0) { alert('Add at least one member (comma separated).'); return; }
    const budget = budgetAmount.trim() && !Number.isNaN(Number(budgetAmount)) ? Number(budgetAmount) : null;
    addGroup(trimmedName, members, budget);
    setName('');
    setMembersText('');
    setBudgetAmount('');
    setShowNew(false);
  }

  function handleDeleteGroup(id: number) {
    const usageCount = data.groupTransactions.filter(gt => gt.groupId === id).length;
    const msg = usageCount > 0
      ? `Delete this budget? It's linked to ${usageCount} expense(s) — those expenses stay, only the link is removed.`
      : 'Delete this budget?';
    if (!confirm(msg)) return;
    deleteGroup(id);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">Budgets</h2>
      <p className="text-sm text-muted-foreground">
        A budget groups people and expenses together — give it a cap to track depletion, or leave it open just to keep a
        shared tab. Linking an expense to a budget is informational: it doesn't move any extra money.
      </p>

      {data.groups.length === 0 && !showNew && <p className="py-4 text-center text-sm text-muted-foreground">No budgets yet.</p>}

      {data.groups.map(g => {
        const totals = groupMemberTotals(g, data.groupTransactions);
        const spent = groupSpent(g.id, data.groupTransactions, data.transactions);
        const groupTx = groupTransactionList(g.id, data.groupTransactions, data.transactions);
        const expanded = expandedId === g.id;
        const hasBudget = g.budget != null;
        const pct = hasBudget && g.budget! > 0 ? Math.min(100, (spent / g.budget!) * 100) : 0;
        const overBudget = hasBudget && spent > g.budget!;

        return (
          <div key={g.id} className="rounded-lg border p-4">
            <div className="flex cursor-pointer items-start justify-between" onClick={() => setExpandedId(expanded ? null : g.id)}>
              <div>
                <div className="font-semibold">{g.name}</div>
                <div className="text-xs text-muted-foreground">{g.members.join(', ')}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Delete budget" onClick={e => { e.stopPropagation(); handleDeleteGroup(g.id); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total spent</span>
              <span className="font-medium tabular-nums">{formatAmount(spent)}</span>
            </div>

            {hasBudget ? (
              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', overBudget ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
                <div className={cn('mt-1 text-xs', overBudget ? 'text-destructive' : 'text-muted-foreground')}>
                  {overBudget ? `${formatAmount(spent - g.budget!)} over ${formatAmount(g.budget!)} budget` : `${formatAmount(g.budget! - spent)} left of ${formatAmount(g.budget!)}`}
                </div>
              </div>
            ) : (
              <div className="mt-2" onClick={e => e.stopPropagation()}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Set a budget…"
                  onBlur={e => updateGroupBudget(g.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
              </div>
            )}

            <div className="mt-3 flex flex-col gap-1">
              {g.members.map(m => (
                <div key={m} className="flex justify-between text-sm">
                  <span>{m}</span>
                  <span className="tabular-nums">{formatAmount(totals[m] || 0)}</span>
                </div>
              ))}
            </div>

            {expanded && (
              <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                {hasBudget && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked readOnly onChange={() => updateGroupBudget(g.id, '')} className="h-4 w-4" />
                    Has a budget — uncheck to remove it
                  </label>
                )}
                {groupTx.length === 0 && <p className="text-sm text-muted-foreground">No expenses linked to this budget yet.</p>}
                {groupTx.map(t => (
                  <div key={t.id} className="flex justify-between text-sm">
                    <span>{formatDate(t.date)} · {t.title}</span>
                    <span className="tabular-nums">{formatAmount(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {showNew ? (
        <form className="flex flex-col gap-2 rounded-lg border p-4" onSubmit={createGroup}>
          <Input placeholder="Budget name (e.g. Roommates)" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Members, comma separated (e.g. Alex, Sam, Jo)" value={membersText} onChange={e => setMembersText(e.target.value)} />
          <Input type="number" step="0.01" min="0" placeholder="Budget amount (optional)" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button type="submit">Create budget</Button>
          </div>
        </form>
      ) : (
        <Button size="sm" className="self-start" onClick={() => setShowNew(true)}>+ New budget</Button>
      )}
    </div>
  );
}

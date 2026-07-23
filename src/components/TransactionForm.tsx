// Port of js/components/ExpenseForm.js (renamed from this project's own
// earlier ExpenseForm.tsx) — the add/edit transaction form, shared by the
// Transactions page's "Add" dialog and its row-edit dialog.
import { useEffect, useRef, useState } from 'react';
import type { Account, Group, Settings, Transaction, TransactionFormPayload } from '@/types/ledger';
import { todayStr, formatDate, splitEqually } from '@/lib/utils/ledger';
import { AccountPicker } from '@/components/AccountPicker';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';

const FALLBACK_FROM_ID = 'assets.bank_accounts.checkings';
const FALLBACK_TO_ID = 'expenses';

function defaultAccountId(accounts: Account[], preferredId: string, fallbackIndex: number): string | null {
  if (accounts.some(a => a.id === preferredId)) return preferredId;
  return accounts[fallbackIndex]?.id ?? accounts[0]?.id ?? null;
}

export interface TransactionFormInitial extends Transaction {
  groupId: number | null;
  splits: { member: string; amount: number }[] | null;
}

interface TransactionFormProps {
  accounts: Account[];
  groups: Group[];
  settings?: Settings;
  initial?: TransactionFormInitial | null;
  onSave: (payload: TransactionFormPayload) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}

export function TransactionForm({ accounts, groups, settings, initial, onSave, onCancel, onDelete }: TransactionFormProps) {
  const isEdit = !!initial;
  const preferredFromId = settings?.defaultAccountId || FALLBACK_FROM_ID;

  const [title, setTitle] = useState(initial ? initial.title : '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [date, setDate] = useState(initial ? initial.date : todayStr());
  const [from, setFrom] = useState<string | null>(initial ? initial.from : defaultAccountId(accounts, preferredFromId, 0));
  const [to, setTo] = useState<string | null>(initial ? initial.to : defaultAccountId(accounts, FALLBACK_TO_ID, accounts.length > 1 ? 1 : 0));
  const [groupId, setGroupId] = useState<string>(initial && initial.groupId ? String(initial.groupId) : '');
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [splitRows, setSplitRows] = useState<{ member: string; included: boolean; amount: number }[]>([]);
  // Only the budget-split section lives behind "more options" now that
  // date/accounts are always visible — default it open only when editing
  // a transaction that's already linked to a budget, so that link is
  // visible without an extra click; otherwise stay collapsed.
  const [showMore, setShowMore] = useState(!!(initial && initial.groupId));
  const [error, setError] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!groupId) { setSplitRows([]); return; }
    const group = groups.find(g => g.id === Number(groupId));
    if (!group) { setSplitRows([]); return; }

    const existing = isEdit && initial?.groupId === Number(groupId) && Array.isArray(initial?.splits) ? initial!.splits : null;

    if (existing) {
      const includedMembers = new Set(existing.map(s => s.member));
      setSplitRows(group.members.map(m => ({
        member: m,
        included: includedMembers.has(m),
        amount: existing.find(s => s.member === m)?.amount ?? 0
      })));
    } else {
      const shares = splitEqually(Number(amount) || 0, group.members);
      setSplitRows(shares.map(s => ({ member: s.member, included: true, amount: s.amount })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, groups]);

  function toggleMember(member: string) {
    const next = splitRows.map(r => (r.member === member ? { ...r, included: !r.included } : r));
    const includedMembers = next.filter(r => r.included).map(r => r.member);
    const shares = splitEqually(Number(amount) || 0, includedMembers);
    const shareMap = Object.fromEntries(shares.map(s => [s.member, s.amount]));
    setSplitRows(next.map(r => (r.included ? { ...r, amount: shareMap[r.member] ?? 0 } : r)));
  }

  function setMemberAmount(member: string, val: string) {
    setSplitRows(rows => rows.map(r => (r.member === member ? { ...r, amount: Number(val) } : r)));
  }

  function rebalanceEqually() {
    const includedMembers = splitRows.filter(r => r.included).map(r => r.member);
    const shares = splitEqually(Number(amount) || 0, includedMembers);
    const shareMap = Object.fromEntries(shares.map(s => [s.member, s.amount]));
    setSplitRows(rows => rows.map(r => (r.included ? { ...r, amount: shareMap[r.member] ?? 0 } : r)));
  }

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input) return;
    // `showPicker()` is the purpose-built API for this; fall back to
    // `.click()` (still opens the native picker in most browsers when
    // called from within a real click handler) for the few that don't
    // support it yet.
    if ('showPicker' in input && typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // showPicker() throws if the input isn't connected/visible enough
        // in some browsers — fall through to the .click() fallback.
      }
    }
    input.click();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    const amountNum = Number(amount);
    if (!trimmedTitle) { setError('Title is required.'); return; }
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) { setError('Enter an amount greater than 0.'); return; }
    if (from === to) { setError('"From" and "to" accounts must be different.'); return; }
    if (!from || !to) { setError('Choose both a from and to account.'); return; }

    let splits: { member: string; amount: number }[] | null = null;
    if (groupId) {
      const included = splitRows.filter(r => r.included);
      if (!included.length) { setError('Select at least one member to split with.'); return; }
      splits = included.map(r => ({ member: r.member, amount: Number(r.amount) || 0 }));
      const sum = splits.reduce((s, r) => s + r.amount, 0);
      if (Math.abs(sum - amountNum) > 0.01) {
        setError(`Splits add up to ${sum.toFixed(2)}, but the expense is ${amountNum.toFixed(2)}. Adjust the amounts so they match.`);
        return;
      }
    }

    onSave({ title: trimmedTitle, amount: amountNum, date: date || todayStr(), from, to, groupId: groupId ? Number(groupId) : null, splits, photo });

    if (!isEdit) {
      setTitle('');
      setAmount('');
      setGroupId('');
      setSplitRows([]);
      setPhoto(null);
    }
  }

  const selectedGroup = groupId ? groups.find(g => g.id === Number(groupId)) : null;

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {/* Date reads like a heading, not a form field: subtle text (not an
          input box) with a calendar icon, but it's still the real date
          <input> underneath — clicking it opens the native date picker via
          openDatePicker() rather than requiring a visible bordered field. */}
      <button
        type="button"
        onClick={openDatePicker}
        className="-mb-1 flex w-fit items-center gap-1.5 self-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Calendar className="h-4 w-4" />
        {formatDate(date) || 'Set date'}
        <input
          ref={dateInputRef}
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="h-0 w-0 opacity-0"
          tabIndex={-1}
          aria-label="Date"
        />
      </button>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-from">From account</Label>
          <AccountPicker inputId="f-from" accounts={accounts} value={from} onChange={setFrom} placeholder="Type or pick an account" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-to">To account</Label>
          <AccountPicker inputId="f-to" accounts={accounts} value={to} onChange={setTo} placeholder="Type or pick an account" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="f-title">Title</Label>
        <Input id="f-title" placeholder="e.g. Groceries" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="f-amount">Amount</Label>
        <Input id="f-amount" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Photo</Label>
        <PhotoPicker value={photo} onChange={setPhoto} />
      </div>

      <Button type="button" variant="ghost" size="sm" className="justify-start px-0" onClick={() => setShowMore(s => !s)}>
        {showMore ? '– Fewer options' : '+ Split with a budget'}
      </Button>

      {showMore && (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-group">Split with budget</Label>
            <Select value={groupId || '__none'} onValueChange={v => setGroupId(v === '__none' ? '' : v)}>
              <SelectTrigger id="f-group"><SelectValue placeholder="No split" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No split</SelectItem>
                {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedGroup && (
            <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Split among {selectedGroup.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={rebalanceEqually}>Split equally</Button>
              </div>
              {splitRows.map(row => (
                <div key={row.member} className={cnRow(row.included)}>
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <Checkbox checked={row.included} onCheckedChange={() => toggleMember(row.member)} />
                    {row.member}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-24"
                    disabled={!row.included}
                    value={row.amount}
                    onChange={e => setMemberAmount(row.member, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="flex items-center justify-between gap-2 pt-1">
        {isEdit && onDelete ? <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button> : <span />}
        <div className="flex gap-2">
          {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
          <Button type="submit">{isEdit ? 'Save changes' : 'Add expense'}</Button>
        </div>
      </div>
    </form>
  );
}

function cnRow(included: boolean) {
  return `flex items-center gap-3 ${included ? '' : 'opacity-50'}`;
}

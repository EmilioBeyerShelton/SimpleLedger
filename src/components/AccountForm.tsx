// Port of js/components/AccountForm.js — shared by "+ Add account" and the
// accounts list's edit dialog.
import { useState } from 'react';
import type { Account, AccountFormPayload } from '@/types/ledger';
import { normalizeAccountId } from '@/lib/utils/ledger';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface AccountFormProps {
  accounts: Account[];
  initial?: Account | null;
  isDefault: boolean;
  onSave: (payload: AccountFormPayload) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function AccountForm({ accounts, initial, isDefault, onSave, onCancel, onDelete }: AccountFormProps) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial ? initial.title : '');
  const [idText, setIdText] = useState(initial ? initial.id : '');
  const [makeDefault, setMakeDefault] = useState(!!isDefault);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    const id = normalizeAccountId(idText);
    if (!trimmedTitle) { setError('Title is required.'); return; }
    if (!id) { setError('Give the account a path, e.g. expenses.groceries.edeka'); return; }

    const clash = accounts.find(a => a.id === id && (!isEdit || a.id !== initial!.id));
    if (clash) { setError(`An account with the path "${id}" already exists.`); return; }

    onSave({ title: trimmedTitle, id, oldId: isEdit ? initial!.id : null, makeDefault });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-title">Title</Label>
        <Input id="a-title" placeholder="e.g. EDEKA" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-id">Path</Label>
        <Input id="a-id" placeholder="e.g. expenses.groceries.edeka" value={idText} onChange={e => setIdText(e.target.value)} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={makeDefault} onCheckedChange={c => setMakeDefault(c === true)} />
        Default account (used as "From" on new expenses)
      </label>

      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="flex items-center justify-between gap-2 pt-1">
        {isEdit && onDelete ? <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button> : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit">{isEdit ? 'Save changes' : 'Add account'}</Button>
        </div>
      </div>
    </form>
  );
}

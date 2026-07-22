// Direct port of js/components/AccountPicker.js: a text input that doubles
// as a select. Typing filters by title OR id path, clicking a result
// selects it, blurring with an exact match auto-selects, blurring with no
// match reverts. Kept as a hand-rolled combobox (rather than the shadcn
// Command/Popover pair) to preserve the exact behavior of the original —
// notably the mousedown-before-blur trick for touch/mobile reliability.
import { useEffect, useState } from 'react';
import type { Account } from '@/types/ledger';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface AccountPickerProps {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  inputId?: string;
  allowClear?: boolean;
}

export function AccountPicker({ accounts, value, onChange, placeholder, inputId, allowClear }: AccountPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const acc = accounts.find(a => a.id === value);
    setQuery(acc ? acc.title : '');
  }, [value, accounts]);

  const q = query.trim().toLowerCase();
  const filtered = q ? accounts.filter(a => a.id.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)) : accounts;

  function selectAccount(a: Account) {
    onChange(a.id);
    setQuery(a.title);
    setOpen(false);
  }

  function clearSelection() {
    onChange('');
    setQuery('');
    setOpen(false);
  }

  function handleBlur() {
    setTimeout(() => {
      const typed = query.trim().toLowerCase();
      if (allowClear && !typed) {
        onChange('');
        setOpen(false);
        return;
      }
      const exact = accounts.find(a => a.id.toLowerCase() === typed || a.title.toLowerCase() === typed);
      if (exact) {
        onChange(exact.id);
        setQuery(exact.title);
      } else {
        const current = accounts.find(a => a.id === value);
        setQuery(current ? current.title : '');
      }
      setOpen(false);
    }, 120);
  }

  return (
    <div className="relative">
      <Input
        type="text"
        id={inputId}
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onBlur={handleBlur}
      />
      {open && (
        <div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {allowClear && (
            <div
              className="cursor-pointer px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
              onMouseDown={e => { e.preventDefault(); clearSelection(); }}
            >
              Any account
            </div>
          )}
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No matching accounts</div>}
          {filtered.slice(0, 40).map(a => (
            <div
              key={a.id}
              className={cn('flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent', a.id === value && 'bg-accent')}
              onMouseDown={e => { e.preventDefault(); selectAccount(a); }}
            >
              <span className="font-medium">{a.title}</span>
              <span className="truncate text-xs text-muted-foreground">{a.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

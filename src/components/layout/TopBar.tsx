// Port of js/components/TopBar.js — a short read-only storage status shown
// on every page. Actual storage management lives on the Settings page.
import type { FileLinkStatus } from '@/lib/persistence/types';
import { cn } from '@/lib/utils';

export function TopBar({ fileStatus }: { fileStatus: FileLinkStatus }) {
  let dotClass = 'bg-muted-foreground/40';
  let msg: React.ReactNode = 'Stored on this device';

  if (!fileStatus.supported) {
    msg = 'Stored on this device';
  } else if (fileStatus.needsReconnect) {
    dotClass = 'bg-amber-500';
    msg = 'Linked file needs reconnecting — see Settings';
  } else if (fileStatus.linked) {
    dotClass = fileStatus.error ? 'bg-destructive' : 'bg-emerald-500';
    msg = fileStatus.error ? fileStatus.error : <>Synced to <b>{fileStatus.name}</b></>;
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
      <h1 className="text-lg font-semibold tracking-tight">SimpleLedger</h1>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full', dotClass)} />
        <span className="max-w-[55vw] truncate sm:max-w-none">{msg}</span>
      </div>
    </header>
  );
}

// Port of js/components/SettingsView.js — default account, database file
// linking (platform-aware), and manual JSON backup. The always-on store is
// SQLite everywhere now (see ARCHITECTURE.md); this page's copy reflects
// that a "linked file" on web/macOS is a .sqlite3 database, while manual
// backups stay portable JSON on every platform.
import { useRef } from 'react';
import { useLedgerStore } from '@/store/useLedgerStore';
import { AccountPicker } from '@/components/AccountPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PLATFORM_LABEL: Record<string, string> = {
  web: 'this browser',
  macos: 'this Mac',
  ios: 'this device'
};

export default function SettingsPage() {
  const data = useLedgerStore(s => s.data)!;
  const adapter = useLedgerStore(s => s.adapter);
  const fileStatus = useLedgerStore(s => s.fileStatus);
  const setDefaultAccount = useLedgerStore(s => s.setDefaultAccount);
  const connectExisting = useLedgerStore(s => s.connectExisting);
  const connectNew = useLedgerStore(s => s.connectNew);
  const reconnect = useLedgerStore(s => s.reconnect);
  const disconnect = useLedgerStore(s => s.disconnect);
  const downloadBackup = useLedgerStore(s => s.downloadBackup);
  const uploadBackup = useLedgerStore(s => s.uploadBackup);
  const uploadInput = useRef<HTMLInputElement>(null);

  const platform = adapter?.platform ?? 'web';
  const placeLabel = PLATFORM_LABEL[platform] ?? 'this device';

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm(`Replace current data with the contents of "${file.name}"? This overwrites what's stored locally.`)) return;
    const result = await uploadBackup(file);
    if (result.ok) toast(`Loaded data from "${file.name}".`);
    else alert('Could not load file: ' + result.error);
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h2 className="text-xl font-semibold">Settings</h2>

      <Card>
        <CardHeader><CardTitle className="text-base">Default account</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Pre-selected as "From" whenever you add a new expense.</p>
          <AccountPicker accounts={data.accounts} value={data.settings.defaultAccountId} onChange={setDefaultAccount} placeholder="Type or pick an account" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Data storage</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Everything is always saved on {placeLabel} automatically, in a SQLite database.{' '}
            {platform === 'web' && 'You can optionally also link a .sqlite3 file on disk — every change is then written there too.'}
            {platform === 'macos' && 'You can optionally also link a .sqlite3 file elsewhere on disk — every change is then written there too.'}
            {platform === 'ios' && 'You can optionally also mirror a JSON snapshot into the Files app for backup or AirDrop.'}
          </p>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <span className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              fileStatus.needsReconnect ? 'bg-amber-500' : fileStatus.linked ? (fileStatus.error ? 'bg-destructive' : 'bg-emerald-500') : 'bg-muted-foreground/40'
            )} />
            <span className="text-sm">
              {!fileStatus.supported
                ? "Linking isn't supported in this environment"
                : fileStatus.needsReconnect
                ? 'Linked file needs reconnecting'
                : fileStatus.linked
                ? (fileStatus.error || <>Linked to <b>{fileStatus.name}</b></>)
                : `Not linked — ${placeLabel} storage only`}
            </span>
          </div>

          {fileStatus.supported && (
            <div className="flex flex-wrap gap-2">
              {fileStatus.needsReconnect && (
                <>
                  <Button size="sm" onClick={() => reconnect()}>Reconnect</Button>
                  <Button size="sm" variant="outline" onClick={() => disconnect()}>Unlink</Button>
                </>
              )}
              {!fileStatus.needsReconnect && fileStatus.linked && (
                <>
                  {platform === 'web' || platform === 'macos' ? (
                    <Button size="sm" variant="outline" onClick={() => connectExisting()}>Change file…</Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => disconnect()}>Unlink</Button>
                </>
              )}
              {!fileStatus.needsReconnect && !fileStatus.linked && (
                <>
                  {(platform === 'web' || platform === 'macos') && (
                    <Button size="sm" variant="outline" onClick={() => connectExisting()}>Open existing file…</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => connectNew()}>
                    {platform === 'ios' ? 'Start mirroring to Files…' : 'Create new file…'}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Manual backup</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Save a snapshot, or load one back in — handy regardless of whether a file is linked.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadBackup()}>
              {platform === 'ios' ? 'Share backup' : 'Download JSON'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => uploadInput.current?.click()}>Upload JSON</Button>
            <input ref={uploadInput} type="file" accept="application/json,.json" className="hidden" onChange={handleUpload} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Root shell — replaces the original js/app.js. Boots the store (which
// selects and initializes the right persistence adapter for the current
// platform), then renders TopBar + the routed page + BottomNav.
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useLedgerStore } from '@/store/useLedgerStore';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';

export default function App() {
  const loading = useLedgerStore(s => s.loading);
  const data = useLedgerStore(s => s.data);
  const fileStatus = useLedgerStore(s => s.fileStatus);
  const init = useLedgerStore(s => s.init);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !data) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col md:flex-col-reverse">
      <TopBar fileStatus={fileStatus} />
      <main className="no-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <Toaster position="top-center" richColors />
    </div>
  );
}

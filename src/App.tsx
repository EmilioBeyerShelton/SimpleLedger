// Root shell — replaces the original js/app.js. Boots the store (which
// selects and initializes the right persistence adapter for the current
// platform), then renders TopBar + the routed page + BottomNav.
//
// Plain `flex-col` here, deliberately not `md:flex-col-reverse` (which an
// earlier version of this file used to make BottomNav *look* like it sat
// at the top on desktop): in a column-reverse container, the main axis's
// "start" edge — where `order-first` items get pinned — is the *bottom*
// of the screen, not the top. That combination was why the nav bar
// rendered at the bottom on desktop instead of the top. TopBar now owns
// desktop navigation outright (see TopBar.tsx) and BottomNav hides itself
// on desktop instead, so there's no ordering trick to get right here.
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useLedgerStore } from '@/store/useLedgerStore';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { DataOnboardingPrompts } from '@/components/DataOnboardingPrompts';

export default function App() {
  const loading = useLedgerStore(s => s.loading);
  const data = useLedgerStore(s => s.data);
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
    <div className="flex h-screen flex-col">
      <TopBar />
      {/* pb-20 (+ safe-area) reserves space for BottomNav, which is
          `fixed` (see its file comment) and so no longer takes up room in
          this flex layout on its own — without this, content's last few
          rows would sit underneath it. Not needed at md: and up, where
          BottomNav hides itself entirely. */}
      <main className="no-scrollbar flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <DataOnboardingPrompts />
      <Toaster position="top-center" richColors />
    </div>
  );
}

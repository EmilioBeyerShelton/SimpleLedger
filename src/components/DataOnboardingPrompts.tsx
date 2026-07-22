// Two prompts around the demo dataset, rendered once from App.tsx:
//  - WelcomePrompt: shown on first visit ever (settings.hasSeenWelcome is
//    false), offers to load the sample data.
//  - DemoDataPrompt: shown on every visit while settings.isDemoData is
//    true, i.e. until the user explicitly keeps or deletes the demo set.
// Both flags live in LedgerData.settings (see types/ledger.ts) rather than
// component state or localStorage, so the prompts behave the same across
// reloads and platforms — not just in this browser tab.
import { useLedgerStore } from '@/store/useLedgerStore';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';

export function DataOnboardingPrompts() {
  const data = useLedgerStore(s => s.data);
  const loadDemoData = useLedgerStore(s => s.loadDemoData);
  const dismissWelcome = useLedgerStore(s => s.dismissWelcome);
  const keepDemoData = useLedgerStore(s => s.keepDemoData);
  const clearData = useLedgerStore(s => s.clearData);

  if (!data) return null;

  const showWelcome = !data.settings.hasSeenWelcome;
  const showDemoDecision = !showWelcome && !!data.settings.isDemoData;

  return (
    <>
      <ConfirmDialog
        open={showWelcome}
        onOpenChange={open => { if (!open) dismissWelcome(); }}
        title="New to SimpleLedger?"
        description="Load it up with sample accounts, expenses, and a budget group so you can see how everything works before entering your own data."
        confirmLabel="Load demo data"
        cancelLabel="Start fresh"
        confirmVariant="default"
        onConfirm={() => {
          loadDemoData();
          toast('Loaded demo data.');
        }}
      />

      <ConfirmDialog
        open={showDemoDecision}
        onOpenChange={open => { if (!open) keepDemoData(); }}
        title="Still using the demo data"
        description="You're currently viewing sample accounts and expenses. Keep exploring with them, or clear them out to start entering your own."
        confirmLabel="Delete demo data"
        cancelLabel="Keep it"
        confirmVariant="destructive"
        onConfirm={() => {
          clearData();
          toast('Demo data cleared.');
        }}
      />
    </>
  );
}

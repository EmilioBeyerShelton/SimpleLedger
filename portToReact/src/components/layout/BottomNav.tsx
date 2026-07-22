// Port of js/components/BottomNav.js — mobile tab bar (renders as a top
// row on wide/desktop layouts via the `md:` variants below). Uses
// react-router's NavLink for active-state routing instead of lifted state.
import { NavLink } from 'react-router-dom';
import { ArrowLeftRight, PieChart, Wallet, PiggyBank, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/', label: 'Transactions', icon: ArrowLeftRight, end: true },
  { to: '/report', label: 'Report', icon: PieChart, end: false },
  { to: '/accounts', label: 'Accounts', icon: Wallet, end: false },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false }
];

export function BottomNav() {
  return (
    <nav className="safe-bottom sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur md:static md:order-first md:border-b md:border-t-0">
      <div className="mx-auto flex max-w-3xl justify-between px-1 py-1 md:justify-center md:gap-1">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors md:flex-none md:flex-row md:gap-1.5 md:px-3 md:py-2 md:text-sm',
                isActive && 'text-primary'
              )
            }
          >
            <t.icon className="h-5 w-5 md:h-4 md:w-4" />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

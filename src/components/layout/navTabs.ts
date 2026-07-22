// The single list of app tabs — shared by TopBar.tsx (desktop nav) and
// BottomNav.tsx (mobile nav) so the two never drift out of sync with each
// other or with routes.tsx.
import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, PieChart, Wallet, PiggyBank, Settings } from 'lucide-react';

export interface NavTab {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Passed straight through to react-router's NavLink `end` prop — only
   * the "/" tab needs exact matching so it isn't active on every route. */
  end: boolean;
}

export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Transactions', icon: ArrowLeftRight, end: true },
  { to: '/report', label: 'Report', icon: PieChart, end: false },
  { to: '/accounts', label: 'Accounts', icon: Wallet, end: false },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false }
];
